import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchCommercialDataset } from './supabase/functions/odoo-sales-report/core';

const datasetCache = new Map<string, { expiresAt: number; data: unknown }>();
const CACHE_TTL_MS = 1000 * 60 * 3;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'odoo-sales-dev-proxy',
        configureServer(server) {
          server.middlewares.use('/api/reports/odoo-sales', async (req, res, next) => {
            if (req.method !== 'GET') {
              next();
              return;
            }

            try {
              const requestUrl = new URL(req.url ?? '', 'http://127.0.0.1');
              const requestedDomain =
                requestUrl.searchParams.get('requestedDomain') === 'purchases'
                  ? 'purchases'
                  : requestUrl.searchParams.get('requestedDomain') === 'all'
                    ? 'all'
                    : 'sales';
              const loadMode = requestUrl.searchParams.get('loadMode') === 'fast' ? 'fast' : 'full';
              const filters = {
                startDate: requestUrl.searchParams.get('startDate') ?? '',
                endDate: requestUrl.searchParams.get('endDate') ?? '',
                companyId: readNullableNumber(requestUrl.searchParams.get('companyId')),
                companyIds: readNumberList(requestUrl.searchParams.get('companyIds')),
                sellerId: null,
                sellerIds: readNumberList(requestUrl.searchParams.get('sellerIds')),
                teamId: readNullableNumber(requestUrl.searchParams.get('teamId')),
                customerId: readNullableNumber(requestUrl.searchParams.get('customerId')),
                productId: readNullableNumber(requestUrl.searchParams.get('productId')),
                categoryId: readNullableNumber(requestUrl.searchParams.get('categoryId')),
                currencyCode: readNullableString(requestUrl.searchParams.get('currencyCode')),
                channel: readNullableString(requestUrl.searchParams.get('channel')),
                stateScope: (requestUrl.searchParams.get('stateScope') as 'all' | 'quotation' | 'confirmed' | 'cancelled') ?? 'all',
                grouping: (requestUrl.searchParams.get('grouping') as 'day' | 'month' | 'quarter' | 'year') ?? 'day',
                visibilityScope: requestUrl.searchParams.get('visibilityScope') === 'own' ? 'own' : 'all',
              };
              if (filters.visibilityScope === 'own') {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'Los reportes personales deben consultarse mediante la Edge Function autenticada.',
                }));
                return;
              }
              const cacheKey = JSON.stringify({
                requestedDomain,
                loadMode,
                filters,
              });
              const cachedEntry = datasetCache.get(cacheKey);
              if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(cachedEntry.data));
                return;
              }

              const payload = await fetchCommercialDataset({
                apiKey: env.API_KEY_ODOO ?? '',
                filters,
                odooUrl: env.ODOO_URL ?? '',
                odooDatabase: env.ODOO_DB ?? '',
                requestedDomain,
                loadMode,
                user: env.USER_ODOO ?? '',
                viewerEmail: '',
              });
              datasetCache.set(cacheKey, {
                expiresAt: Date.now() + CACHE_TTL_MS,
                data: payload,
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : 'No se pudo consultar Odoo desde el proxy local.',
                }),
              );
            }
          });
        },
      },
    ],
  };
});

function readNullableNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNullableString(value: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function readNumberList(value: string | null) {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}
