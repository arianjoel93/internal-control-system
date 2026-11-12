import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js';
import { z } from 'npm:zod@4.1.13';
import { TOKEN_SHA256 } from './auth-config.ts';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const budgets = new Map<string, { at: number; count: number }>();
const encoder = new TextEncoder();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const columns = 'source_database,company_id,company_name,seller_id,seller_name,currency_code,invoice_count,untaxed_amount,margin_amount,source_fetched_at,updated_at';

async function read(table: string, params: URLSearchParams) {
  const base = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) throw new Error('Configuración de servidor incompleta.');
  const response = await fetch(`${base}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('No se pudo consultar el agregado de Supabase.');
  return await response.json();
}
const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

function server() {
  const mcp = new McpServer({ name: 'tectronic-intelligence', version: '0.2.0' });
  mcp.registerTool('estado_datos', {
    description: 'Estado de sincronización de los agregados de ventas. No sincroniza ni conecta a Odoo. Revisar cobertura antes de interpretar ausencias como cero.',
    inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    try {
      const rows = await read('report_odoo_sync_state', new URLSearchParams({ select: 'source_database,model_name,synced_start_date,synced_end_date,last_successful_sync,status,row_count', limit: '100', order: 'source_database,model_name' }));
      return result({ source: 'supabase', project: 'soporte_tectronic', retrieved_at: new Date().toISOString(), sync: rows, warning: 'Los agregados conservan historia fuera de la ventana de sincronización; no se garantiza cobertura completa fuera de ella.' });
    } catch { return { ...result({ error: 'No se pudo obtener el estado de los datos.' }), isError: true }; }
  });
  mcp.registerTool('consultar_ventas', {
    description: 'Consulta de solo lectura de agregados de ventas ya almacenados en Supabase. Requiere moneda y fechas. Paginar hasta next_offset=null. No sumar daily y monthly ni seller y category: son vistas alternativas del mismo negocio. Conteos de facturas por grupo no equivalen a documentos únicos globales. Mensual exige meses completos.',
    inputSchema: {
      start_date: date, end_date: date, currency: z.enum(['MXN', 'USD']),
      grain: z.enum(['daily', 'monthly']).default('daily'), dimension: z.enum(['seller', 'category']).default('seller'),
      company_id: z.number().int().positive().optional(), seller_id: z.number().int().nonnegative().optional(),
      category_id: z.number().int().nonnegative().optional(), source_database: z.string().min(1).max(150).optional(),
      offset: z.number().int().min(0).max(100000).default(0),
    }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => {
    try {
      if (args.end_date < args.start_date) throw new Error('Fechas invertidas.');
      if (args.category_id !== undefined && args.dimension !== 'category') throw new Error('category_id requiere dimension=category.');
      if (args.grain === 'monthly') {
        const end = new Date(args.end_date + 'T00:00:00Z');
        const next = new Date(end.getTime() + 86400000);
        if (!args.start_date.endsWith('-01') || next.getUTCDate() !== 1) throw new Error('Mensual requiere inicio y cierre de meses completos.');
      }
      const field = args.grain === 'daily' ? 'metric_date' : 'metric_month';
      const category = args.dimension === 'category';
      const table = `report_sales_${args.grain}${category ? '_category' : ''}_metrics`;
      const select = `${field},${columns}${category ? ',category_id,category_name' : ''}`;
      const p = new URLSearchParams({ select, currency_code: `eq.${args.currency}`, limit: '501', offset: String(args.offset), order: `${field},source_database,company_id,seller_id,currency_code${category ? ',category_id' : ''}` });
      p.append(field, `gte.${args.start_date}`); p.append(field, `lte.${args.end_date}`);
      for (const filter of ['company_id', 'seller_id', 'category_id', 'source_database'] as const) {
        if (args[filter] !== undefined) p.set(filter, `eq.${args[filter]}`);
      }
      const fetched = await read(table, p);
      if (!Array.isArray(fetched)) throw new Error('Formato inesperado.');
      const more = fetched.length > 500;
      const rows = fetched.slice(0, 500);
      return result({ source: 'supabase', dataset_kind: 'sales_aggregates', grain: args.grain, dimension: args.dimension,
        retrieved_at: new Date().toISOString(), filters: args, page_complete: !more, complete: args.offset === 0 && !more,
        next_offset: more ? args.offset + 500 : null, rows,
        methodology: 'Importes agregados del sistema; no se recalcula signo ni se convierten monedas. invoice_count es conteo por grupo, no documentos globales únicos. No se garantiza que días ausentes sean cero. Páginas sin snapshot transaccional: ante cambios de fuente repetir consulta.' });
    } catch (e) {
      return { ...result({ error: e instanceof Error ? e.message : 'Consulta inválida.' }), isError: true };
    }
  });
  return mcp;
}

Deno.serve(async req => {
  // A machine credential authenticates every request, including discovery.
  const token = req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{64})$/)?.[1];
  if (!token) return new Response(JSON.stringify({ error: 'Credencial de integración requerida.' }), { status: 401, headers });
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)))].map(v => v.toString(16).padStart(2, '0')).join('');
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= hash.charCodeAt(i) ^ TOKEN_SHA256.charCodeAt(i);
  if (diff) return new Response(JSON.stringify({ error: 'Credencial inválida.' }), { status: 401, headers });
  if (req.headers.has('Origin')) return new Response(JSON.stringify({ error: 'Solo conexiones de servidor.' }), { status: 403, headers });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers });
  const now = Date.now();
  const b = budgets.get('integration');
  const budget = b && now - b.at < 60000 ? b : { at: now, count: 0 };
  budgets.set('integration', budget);
  if (++budget.count > 60) return new Response(JSON.stringify({ error: 'Límite temporal alcanzado.' }), { status: 429, headers });
  const raw = await req.text();
  if (raw.length > 16384) return new Response(null, { status: 413, headers });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const mcp = server();
  try {
    await mcp.connect(transport);
    const request = new Request(req.url, { method: 'POST', headers: req.headers, body: raw });
    const response = await transport.handleRequest(request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return new Response(JSON.stringify({ error: 'Solicitud MCP inválida.' }), { status: 400, headers });
  } finally { await mcp.close(); }
});
