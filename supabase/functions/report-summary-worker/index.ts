// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authenticateWithDatabaseCandidates,executeReadKw,readOdooEnvironment,assertOdooEnvironment } from '../_shared/odoo-readonly.ts';
import { fetchCommercialDataset } from '../odoo-sales-report/core.ts';
import { encodeReportDataset,encodeReportDatasetStreaming,decodeReportDataset } from '../odoo-sales-report/dataset-cache.ts';
import { preparedKey } from '../odoo-sales-report/prepared-summary.ts';
import { buildReportPartitions,createReportPartitionAccumulator,prepareExecutiveDataset } from './model.generated.js';

Deno.serve(async(req) => {
  if(req.method!=='POST') return Response.json({error:'Método no permitido.'},{status:405});
  const key = resolveServiceKey();
  const db = createClient(Deno.env.get('SUPABASE_URL'),key);
  const { data: token,error } = await db.rpc('get_report_sync_cron_token');
  const supplied = req.headers.get('x-report-cron-token');
  if(error || !supplied || supplied!==token) return Response.json({error:'No autorizado.'},{status:401});
  const body=await req.json().catch(()=>({}));
  if(body.bootstrap===true) {
    EdgeRuntime.waitUntil(primeKnownPeriods(db));
    return Response.json({status:'preparing-periods'},{status:202});
  }
  const {data:job,error:claimError} = await db.rpc('claim_report_preparation');
  if(claimError) return Response.json({error:'No se pudo tomar el trabajo.'},{status:500});
  if(!job) return Response.json({status:'idle'});
  EdgeRuntime.waitUntil(run(db,job));
  return Response.json({status:'running'},{status:202});
});

async function run(db,job) {
  const started=Date.now();
  try {
    if(job.kind==='source') await prepareSource(db,job);
    else if(job.kind==='merged') await prepareMerged(db,job);
    else await prepareSummary(db,job);
    console.info('[report-summary-worker]',{kind:job.kind,period:job.start_date,elapsedMs:Date.now()-started,status:'complete'});
  } catch(error) {
    console.error('[report-summary-worker]',{kind:job.kind,period:job.start_date,message:String(error?.message??error)});
    await finish(db,job,{p_error:String(error?.message??error)});
  } finally {
    await db.rpc('dispatch_report_preparation');
  }
}

async function prepareSource(db,job) {
  const env=await odooEnvironment(db);
  const connection=await authenticateWithDatabaseCandidates({apiKey:env.apiKey,configuredDatabase:env.database??'',odooUrl:env.url,user:env.user});
  const {data:row,error} = await db.from('report_prepared_cache').select('payload_gzip_base64,source_checked_at').eq('cache_key',job.cache_key).single();
  if(error) throw error;
  const previous=row.payload_gzip_base64 ? await decodeReportDataset(row.payload_gzip_base64) : null;
  let changed = true;
  if(previous && row.source_checked_at) {
    try {
      changed = await sourceChanged(env,connection,job.parameters.filters,previous,row.source_checked_at);
    } catch(error) {
      console.warn('[report-summary-worker] Could not verify incremental changes; refreshing partition.', String(error?.message??error));
    }
  }
  if(previous && !changed) {
    await finish(db,job,{}); return;
  }
  const filters=job.parameters.filters;
  const dataset=await fetchCommercialDataset({apiKey:env.apiKey,odooUrl:env.url,odooDatabase:env.database,user:env.user,connection,
    filters,requestedDomain:'sales',reportContext:'reports',loadMode:'partition',
    viewerOdooUsers:job.parameters.users ?? [],viewerOdooUserIds:filters.visibilityScope==='own' ? filters.sellerIds : []});
  delete dataset.scopeIdentity;
  await save(db,job,dataset,null);
}

async function sourceChanged(env,connection,filters,previous,checkedAt) {
  // Check changed/new records AND removals/moves out of the period. Existing
  // IDs keep date/state changes from silently disappearing from the cache.
  const models=[
    ['sale.order','orders',['create_date','date_order']],['sale.order.line','orderLines',['create_date']],
    ['account.move','invoices',['invoice_date']],['account.move.line','invoiceLines',['date']],
    ['crm.lead','crmLeads',['create_date','date_open','date_closed']],
  ];
  const since=new Date(Date.parse(checkedAt)-120_000).toISOString().slice(0,19).replace('T',' ');
  for(const [model,list,dateFields] of models) {
    const ids=(previous[list]??[]).map(row=>row.id);
    const count=async(domain)=> {
      const groups=await executeReadKw({apiKey:env.apiKey,database:connection.database,odooUrl:connection.odooUrl,uid:connection.uid,model,method:'read_group',args:[domain,['id:count'],[]],kwargs:{lazy:false,context:{active_test:false}}});
      return Number(groups[0]?.__count ?? groups[0]?.id_count ?? 0);
    };
    for(let i=0;i<ids.length;i+=1000) {
      const batch=ids.slice(i,i+1000);
      if(await count([['id','in',batch],['write_date','>=',since]])>0) return true;
      if(await count([['id','in',batch]])!==batch.length) return true;
    }
    for(const dateField of dateFields) {
      const domain=[['write_date','>=',since],[dateField,'>=',filters.startDate],[dateField,'<=',filters.endDate+' 23:59:59']];
      if(filters.companyIds?.length) domain.push(['company_id','in',filters.companyIds]);
      if(await count(domain)>0) return true;
    }
  }
  return false;
}

async function prepareSummary(db,job) {
  const p=job.parameters;
  const mergedKey=await preparedKey({kind:'merged',source:p.source,scope:p.scope,filters:p.filters});
  const {data:row,error}=await db.from('report_prepared_cache').select('payload_gzip_base64').eq('cache_key',mergedKey).maybeSingle();
  if(error) throw error;
  const {error:dependencyError}=await db.from('report_prepared_cache').update({dependencies:[mergedKey]}).eq('cache_key',job.cache_key);
  if(dependencyError) throw dependencyError;
  if(!row?.payload_gzip_base64) {
    const {data:existingJob,error:jobError}=await db.from('report_preparation_jobs').select('status').eq('cache_key',mergedKey).maybeSingle();
    if(jobError) throw jobError;
    if(existingJob?.status==='failed') throw new Error('La unión de tramos no se pudo completar.');
    const {error:enqueueError}=await db.rpc('enqueue_report_preparation',{p_key:mergedKey,p_kind:'merged',p_scope:p.scope,
      p_parameters:p,p_priority:10});
    if(enqueueError) throw enqueueError;
    await finish(db,job,{p_wait:true}); return;
  }
  const merged=await decodeReportDataset(row.payload_gzip_base64);
  merged.viewerRole=p.filters.visibilityScope==='own' ? 'sales_agent' : 'manager';
  merged.filters=p.filters;
  const prepared=prepareExecutiveDataset(merged,p.filters,p.config);
  await save(db,job,prepared,prepared.executiveSummary.monthlyValues);
}

async function prepareMerged(db,job) {
  const p=job.parameters;
  const partitions=buildReportPartitions(p.filters);
  const keys=[];
  let missing=false;
  for(const partition of partitions) {
    const filters={...p.filters,grouping:'day',startDate:partition.startDate,endDate:partition.endDate};
    const key=await preparedKey({kind:'source',source:p.source,scope:p.scope,filters});
    keys.push(key);
    const {data:row,error}=await db.from('report_prepared_cache').select('payload_bytes').eq('cache_key',key).maybeSingle();
    if(error) throw error;
    if(!row?.payload_bytes) {
      const {data:existingJob,error:jobError}=await db.from('report_preparation_jobs').select('status').eq('cache_key',key).maybeSingle();
      if(jobError) throw jobError;
      if(existingJob?.status==='failed') throw new Error(`No se pudo preparar el tramo ${partition.startDate}.`);
      missing=true;
      const {error:enqueueError}=await db.rpc('enqueue_report_preparation',{p_key:key,p_kind:'source',p_scope:p.scope,
        p_parameters:{...p,filters},p_priority:5});
      if(enqueueError) throw enqueueError;
    }
  }
  const {error:dependencyError}=await db.from('report_prepared_cache').update({dependencies:keys}).eq('cache_key',job.cache_key);
  if(dependencyError) throw dependencyError;
  if(missing) { await finish(db,job,{p_wait:true}); return; }
  const accumulator=createReportPartitionAccumulator();
  for(let index=0;index<keys.length;index++) {
    const key=keys[index];
    const {data,error}=await db.from('report_prepared_cache').select('payload_gzip_base64').eq('cache_key',key).single();
    if(error) throw error;
    accumulator.add(partitions[index],await decodeReportDataset(data.payload_gzip_base64));
  }
  const merged=accumulator.finish();
  console.info('[report-summary-worker] source combined',{orders:merged.orders.length,invoices:merged.invoices.length,lines:merged.invoiceLines.length,leads:merged.crmLeads.length});
  await save(db,job,merged,null,true);
}

async function primeKnownPeriods(db) {
  const env=await odooEnvironment(db);
  const source={database:env.database,url:env.url.replace(/\/+$/,''),user:env.user};
  const {data:preferences,error}=await db.from('report_preferences').select('filters').eq('module_key','reports')
    .eq('filters->>visibilityScope','all').order('updated_at',{ascending:false}).limit(10);
  if(error) throw error;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(type)=>parts.find(part=>part.type===type).value;
  const today=`${get('year')}-${get('month')}-${get('day')}`;
  const priorEnd=new Date(Date.UTC(Number(get('year')),Number(get('month'))-1,0)).toISOString().slice(0,10);
  const queued=new Set();
  for(const pref of preferences??[]) {
    for(const range of [
      {startDate:today.slice(0,7)+'-01',endDate:today,grouping:'day'},
      {startDate:priorEnd.slice(0,7)+'-01',endDate:priorEnd,grouping:'day'},
      {startDate:today.slice(0,4)+'-01-01',endDate:today,grouping:pref.filters.grouping},
    ]) {
      const filters={...pref.filters,...range,
        companyIds:[...new Set(pref.filters.companyIds??[])].sort((a,b)=>a-b),
        sellerIds:[...new Set(pref.filters.sellerIds??[])].sort((a,b)=>a-b)};
      for(const partition of buildReportPartitions(filters)) {
        const partitionFilters={...filters,grouping:'day',startDate:partition.startDate,endDate:partition.endDate};
        const key=await preparedKey({kind:'source',source,scope:'all',filters:partitionFilters});
        if(queued.has(key)) continue;
        queued.add(key);
        const {error:enqueueError}=await db.rpc('enqueue_report_preparation',{
          p_key:key,p_kind:'source',p_scope:'all',
          p_parameters:{filters:partitionFilters,source,scope:'all',users:[]},p_priority:5,
        });
        if(enqueueError) throw enqueueError;
      }
    }
  }
  await db.rpc('dispatch_report_preparation');
}

async function save(db,job,payload,metrics,streamed=false) {
  const encoded=streamed ? await encodeReportDatasetStreaming(payload) : await encodeReportDataset(payload);
  if(!encoded) throw new Error('El tramo excede el límite seguro de almacenamiento. No se publicó un resumen incompleto.');
  await finish(db,job,{p_payload:encoded.value,p_bytes:encoded.bytes,p_metrics:metrics});
}
async function finish(db,job,args) {
  const {data,error}=await db.rpc('finish_report_preparation',{p_key:job.cache_key,p_token:job.lock_token,...args});
  if(error) throw error;
  if(!data) throw new Error('El bloqueo de preparación venció; se conservó la versión anterior.');
}
async function odooEnvironment(db) {
  const env=readOdooEnvironment();
  const {data,error}=await db.rpc('get_odoo_readonly_connection');
  if(error) throw error;
  const secrets=new Map((data??[]).map(row=>[row.secret_name,row.secret_value]));
  const result={apiKey:secrets.get('odoo_reports_api_key')??env.apiKey,database:secrets.get('odoo_reports_database')??env.database,
    url:secrets.get('odoo_reports_url')??env.url,user:secrets.get('odoo_reports_user')??env.user};
  assertOdooEnvironment(result);return result;
}
function resolveServiceKey() {
  const direct=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY');
  if(direct) return direct;
  try { const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');return keys.default??Object.values(keys)[0]; } catch {return '';}
}
