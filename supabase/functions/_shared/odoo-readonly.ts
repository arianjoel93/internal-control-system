// @ts-nocheck
const READ_ONLY_METHODS = new Set(['search_read', 'fields_get', 'read_group']);
const DEFAULT_PAGE_SIZE = 400;

export type OdooEnvironment = {
  apiKey: string;
  database: string;
  url: string;
  user: string;
};

type OdooConnection = {
  database: string;
  odooUrl: string;
  uid: number;
};

type OdooRequest = {
  apiKey: string;
  database: string;
  model: string;
  odooUrl: string;
  uid: number;
};

export function readOdooEnvironment(): OdooEnvironment {
  return {
    apiKey: `${readRuntimeEnvironment('API_KEY_ODOO') ?? ''}`.trim(),
    database: `${readRuntimeEnvironment('ODOO_DB') ?? ''}`.trim(),
    url: trimSlash(readRuntimeEnvironment('ODOO_URL')),
    user: `${readRuntimeEnvironment('USER_ODOO') ?? ''}`.trim(),
  };
}

export function assertOdooEnvironment(environment: OdooEnvironment) {
  if (!environment.url || !environment.user || !environment.apiKey) {
    throw new Error(
      'Faltan ODOO_URL, USER_ODOO o API_KEY_ODOO en los secrets de la Edge Function.',
    );
  }
}

export async function authenticateWithDatabaseCandidates({
  apiKey,
  configuredDatabase,
  odooUrl,
  user,
}: {
  apiKey: string;
  configuredDatabase?: string;
  odooUrl: string;
  user: string;
}): Promise<OdooConnection> {
  const attempts: string[] = [];
  let lastError: unknown = null;

  for (const candidateUrl of getOdooUrlCandidates(odooUrl)) {
    const discoveredDatabases = await discoverOdooDatabases(candidateUrl);
    const databaseCandidates = [
      ...new Set([
        `${configuredDatabase ?? ''}`.trim(),
        ...discoveredDatabases,
        ...getOdooDatabaseCandidates(candidateUrl, configuredDatabase),
      ].filter(Boolean)),
    ];

    for (const database of databaseCandidates) {
      attempts.push(`${new URL(candidateUrl).hostname}/${database}`);
      try {
        const uid = await authenticateAgainstOdoo({
          apiKey,
          database,
          odooUrl: candidateUrl,
          user,
        });
        return { database, odooUrl: candidateUrl, uid };
      } catch (error) {
        lastError = error;
      }
    }
  }

  const attempted = attempts.length ? attempts.join(', ') : 'ninguna';
  throw new Error(
    `Odoo rechazo la autenticacion. Se probaron las conexiones ${attempted}. ` +
      'Verifica que ODOO_URL apunte a la misma instancia y que USER_ODOO/API_KEY_ODOO pertenezcan a esa base de datos.',
    { cause: lastError },
  );
}

export function fieldsGet({
  apiKey,
  database,
  model,
  odooUrl,
  uid,
}: OdooRequest) {
  return executeReadKw({
    apiKey,
    args: [],
    database,
    kwargs: { attributes: ['string', 'type'] },
    method: 'fields_get',
    model,
    odooUrl,
    uid,
  });
}

export async function searchReadAll({
  apiKey,
  database,
  domain,
  fields,
  model,
  odooUrl,
  order,
  pageSize = DEFAULT_PAGE_SIZE,
  uid,
}: OdooRequest & {
  domain: unknown[];
  fields: string[];
  order?: string;
  pageSize?: number;
}) {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const page = await executeReadKw({
      apiKey,
      args: [domain],
      database,
      kwargs: { fields, limit: pageSize, offset, ...(order ? { order } : {}) },
      method: 'search_read',
      model,
      odooUrl,
      uid,
    }) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }

  return rows;
}

export async function executeReadKw({
  apiKey,
  args,
  database,
  kwargs,
  method,
  model,
  odooUrl,
  uid,
}: OdooRequest & {
  args: unknown[];
  kwargs: Record<string, unknown>;
  method: string;
}) {
  if (!READ_ONLY_METHODS.has(method)) {
    throw new Error(`La integracion solo permite consultas de lectura en Odoo. Metodo bloqueado: ${method}.`);
  }

  return rpc(`${trimSlash(odooUrl)}/jsonrpc`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [database, uid, apiKey, model, method, args, kwargs],
    },
  });
}

async function discoverOdooDatabases(odooUrl: string) {
  try {
    const response = await fetch(`${trimSlash(odooUrl)}/web/database/list`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];

    const payload = await response.json();
    const values = Array.isArray(payload) ? payload : payload?.result;
    return Array.isArray(values)
      ? values.map((value) => `${value ?? ''}`.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function getOdooUrlCandidates(configuredUrl: string) {
  const primaryUrl = trimSlash(configuredUrl);
  const url = new URL(primaryUrl);
  const explicitFallbacks = `${readRuntimeEnvironment('ODOO_FALLBACK_URLS') ?? ''}`
    .split(',')
    .map(trimSlash)
    .filter(Boolean);
  const sandboxMatch = url.hostname
    .toLowerCase()
    .match(/^(.+?)-(?:sandbox|staging|test)-\d+\.(?:dev\.)?odoo\.com$/);
  const canonicalProductionUrl = sandboxMatch?.[1]
    ? `https://${sandboxMatch[1]}.odoo.com`
    : '';

  return [...new Set([primaryUrl, ...explicitFallbacks, canonicalProductionUrl].filter(Boolean))];
}

function readRuntimeEnvironment(name: string) {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };

  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function getOdooDatabaseCandidates(odooUrl: string, configuredDatabase = '') {
  const url = new URL(odooUrl);
  const fromQuery =
    url.searchParams.get('db') ??
    url.searchParams.get('database') ??
    url.hash.replace('#db=', '').trim();
  const hostMatch = url.hostname.toLowerCase().match(/^([^.]+)\.(?:dev\.)?odoo\.com$/);
  const fromOdooHost = hostMatch?.[1] ?? '';

  return [
    ...new Set(
      [fromQuery, fromOdooHost, configuredDatabase]
        .map((value) => `${value ?? ''}`.trim())
        .filter(Boolean),
    ),
  ];
}

async function authenticateAgainstOdoo({
  apiKey,
  database,
  odooUrl,
  user,
}: {
  apiKey: string;
  database: string;
  odooUrl: string;
  user: string;
}) {
  const uid = await rpc(`${trimSlash(odooUrl)}/jsonrpc`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'common',
      method: 'authenticate',
      args: [database, user, apiKey, {}],
    },
  });

  if (!uid) {
    throw new Error(
      `Odoo rechazo la autenticacion para la base de datos "${database}". Verifica ODOO_URL, ODOO_DB, USER_ODOO y que API_KEY_ODOO pertenezca a ese usuario y siga activo.`,
    );
  }

  return Number(uid);
}

async function rpc(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Odoo respondio ${response.status} ${response.statusText}.`);
  }

  const data = await response.json();
  if (data?.error) {
    const message =
      data.error?.data?.message?.trim() ||
      data.error?.message?.trim() ||
      'Odoo devolvio un error sin detalle.';
    throw new Error(data.error?.data?.name ? `${data.error.data.name}: ${message}` : message);
  }

  return data?.result;
}

function trimSlash(value: string | undefined | null) {
  return `${value ?? ''}`.trim().replace(/\/+$/, '');
}
