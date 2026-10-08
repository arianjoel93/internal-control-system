// @ts-nocheck
import { decodeReportDataset } from './dataset-cache.ts';

export const PREPARED_VERSION = 1;

export async function preparedKey(value) {
  const canonical = (input) => Array.isArray(input) ? input.map(canonical)
    : input && typeof input === 'object'
      ? Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonical(input[key])])) : input;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical({ version: PREPARED_VERSION, ...value }))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readPreparedSummary(adminClient, { filters, config, source, scope, users, role, forceRefresh }) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.sellerGoals) || !Array.isArray(config.monthlySalesGoals)) {
    throw new Error('Falta la configuración analítica del resumen.');
  }
  const normalized = { ...filters,
    companyIds: [...new Set(filters.companyIds ?? [])].sort((a,b) => a-b),
    sellerIds: [...new Set(filters.sellerIds ?? [])].sort((a,b) => a-b) };
  const parameters = { filters: normalized, config, source, scope, users };
  const key = await preparedKey({ kind: 'summary', filters: normalized, config, source, scope });
  const { data: cached, error } = await adminClient.from('report_prepared_cache')
    .select('payload_gzip_base64,calculated_at,stale').eq('cache_key',key).maybeSingle();
  if (error) throw error;
  const { data: job, error: jobError } = await adminClient.from('report_preparation_jobs')
    .select('status,last_error').eq('cache_key',key).maybeSingle();
  if (jobError) throw jobError;
  const stale = !cached?.calculated_at || cached.stale || Date.now()-Date.parse(cached.calculated_at)>20*3600_000;
  if (forceRefresh || (job?.status !== 'failed' && (!cached?.payload_gzip_base64 || stale))) {
    const { error: enqueueError } = await adminClient.rpc('enqueue_report_preparation', {
      p_key:key,p_kind:'summary',p_scope:scope,p_parameters:parameters,p_priority:20,
    });
    if (enqueueError) throw enqueueError;
    EdgeRuntime.waitUntil(adminClient.rpc('dispatch_report_preparation').then(({error}) => {
      if(error) console.warn('[reports] Worker dispatch failed',error.message);
    }));
  }
  if (cached?.payload_gzip_base64) {
    const dataset = await decodeReportDataset(cached.payload_gzip_base64);
    delete dataset.scopeIdentity;
    return { ready:true, dataset:{ ...dataset,viewerRole:role }, refreshing:job?.status !== 'failed' && (stale || forceRefresh), calculatedAt:cached.calculated_at };
  }
  return {ready:false,refreshing:job?.status !== 'failed',status:job?.status ?? 'pending',
    error:job?.status==='failed' ? 'No se pudo completar la preparación del resumen. La información guardada no se ha eliminado; intenta Actualizar.' : undefined};
}
