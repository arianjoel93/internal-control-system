import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { executeReadKw, fieldsGet, searchReadAll } from '../_shared/odoo-readonly.ts';

type OdooConnection = { database: string; odooUrl: string; uid: number };
type SummaryFilters = {
  startDate: string;
  endDate: string;
  stateScope: string;
  teamId: number | null;
  customerId: number | null;
  productId: number | null;
  categoryId: number | null;
  currencyCode: string | null;
  channel: string | null;
};
type Baseline = { dimension: 'customer' | 'product'; key: string; totalAmount: number; purchaseCount: number };
type GroupRow = Record<string, unknown>;

function odooSourceKey(connection: OdooConnection): string {
  return `${new URL(connection.odooUrl).host.toLowerCase()}/${connection.database}`;
}

function relationId(value: unknown): number | null {
  const id = Array.isArray(value) ? Number(value[0]) : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function relationLabel(value: unknown): string {
  return Array.isArray(value) ? String(value[1] ?? '') : '';
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function customerBaselineKey(name: string): string {
  const normalized = name.split(',')[0]?.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  return `customer:${normalized || 'CLIENTE SIN NOMBRE'}`;
}

export function aggregateInvoiceAnalysisGroups(
  groups: GroupRow[],
  dimension: 'customer' | 'product',
): Baseline[] {
  const buckets = new Map<string, Baseline>();
  for (const group of groups) {
    const relation = group[dimension === 'customer' ? 'partner_id' : 'product_id'];
    const id = relationId(relation);
    if (!id) continue;
    const key = dimension === 'customer' ? customerBaselineKey(relationLabel(relation)) : `id:${id}`;
    const bucket = buckets.get(key) ?? { dimension, key, totalAmount: 0, purchaseCount: 0 };
    bucket.totalAmount += number(group.total_amount);
    if (group.move_type === 'out_invoice') bucket.purchaseCount += number(group.purchase_count);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function allocatePublicInvoiceHistory(
  customerGroups: GroupRow[], moveGroups: GroupRow[], shippingByMove: Map<number, string>,
): Baseline[] {
  const publicKey = customerBaselineKey('PUBLICO EN GENERAL');
  const buckets = new Map(aggregateInvoiceAnalysisGroups(
    customerGroups.filter((row) => customerBaselineKey(relationLabel(row.partner_id)) !== publicKey), 'customer',
  ).map((row) => [row.key, row]));
  for (const group of moveGroups) {
    const moveId = relationId(group.move_id);
    const shippingName = moveId ? shippingByMove.get(moveId) : null;
    const key = shippingName ? customerBaselineKey(shippingName) : publicKey;
    const bucket = buckets.get(key) ?? { dimension: 'customer' as const, key, totalAmount: 0, purchaseCount: 0 };
    bucket.totalAmount += number(group.total_amount);
    if (group.move_type === 'out_invoice') bucket.purchaseCount += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function previousRange(filters: Pick<SummaryFilters, 'startDate' | 'endDate'>, rangeKey: string | null = null) {
  const start = new Date(`${filters.startDate}T00:00:00.000Z`);
  const end = new Date(`${filters.endDate}T00:00:00.000Z`);
  const day = 86_400_000;
  const toDate = (date: Date) => date.toISOString().slice(0, 10);
  if ((rangeKey === 'current_year' || rangeKey === 'previous_year' ||
    (!rangeKey && start.getUTCMonth() === 0 && start.getUTCDate() === 1 && end.getUTCMonth() === 11 && end.getUTCDate() === 31)) &&
    start.getUTCFullYear() === end.getUTCFullYear()) {
    const priorYear = start.getUTCFullYear() - 1;
    const priorMonth = end.getUTCMonth();
    const priorLastDay = new Date(Date.UTC(priorYear, priorMonth + 1, 0)).getUTCDate();
    return {
      startDate: `${priorYear}-01-01`,
      endDate: toDate(new Date(Date.UTC(priorYear, priorMonth, Math.min(end.getUTCDate(), priorLastDay)))),
    };
  }
  if ((rangeKey === 'current_month' || rangeKey === 'previous_month' ||
    (!rangeKey && start.getUTCDate() === 1 && start.getUTCMonth() === end.getUTCMonth() &&
      end.getUTCDate() === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate())) &&
    start.getUTCFullYear() === end.getUTCFullYear()) {
    const previousEnd = new Date(start.getTime() - day);
    return { startDate: `${toDate(previousEnd).slice(0, 7)}-01`, endDate: toDate(previousEnd) };
  }
  if ((rangeKey === 'current_quarter' || (!rangeKey && start.getUTCDate() === 1 && start.getUTCMonth() % 3 === 0 &&
    end.getUTCMonth() === start.getUTCMonth() + 2 &&
    end.getUTCDate() === new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0)).getUTCDate())) &&
    start.getUTCDate() === 1 && start.getUTCMonth() % 3 === 0) {
    return {
      startDate: toDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1))),
      endDate: toDate(new Date(start.getTime() - day)),
    };
  }
  const duration = Math.round((end.getTime() - start.getTime()) / day);
  return {
    startDate: toDate(new Date(start.getTime() - (duration + 1) * day)),
    endDate: toDate(new Date(start.getTime() - day)),
  };
}

async function readStoredBaselines(adminClient: SupabaseClient, connection: OdooConnection, sellerId: number, companyId: number, asOfDate: string): Promise<Baseline[] | null> {
  const query = () => adminClient.from('report_agent_historical_baselines')
    .eq('odoo_source', odooSourceKey(connection)).eq('company_id', companyId)
    .eq('seller_id', sellerId).eq('as_of_date', asOfDate);
  const { data: latest, error: latestError } = await query()
    .select('sync_token,refreshed_at').order('refreshed_at', { ascending: false }).limit(1).maybeSingle();
  if (latestError || !latest || Date.now() - Date.parse(latest.refreshed_at) > 3 * 60_000) return null;
  const { data: stale, error: staleError } = await query()
    .select('dimension_key').neq('sync_token', latest.sync_token).limit(1);
  if (staleError || stale?.length) return null;
  const rows: Baseline[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().select('dimension,dimension_key,total_amount,purchase_count')
      .eq('sync_token', latest.sync_token).order('dimension').order('dimension_key').range(offset, offset + 499);
    if (error || !data) return null;
    rows.push(...data.map((row) => ({
      dimension: row.dimension as Baseline['dimension'], key: row.dimension_key,
      totalAmount: number(row.total_amount), purchaseCount: number(row.purchase_count),
    })));
    if (data.length < 500) break;
  }
  return rows;
}

export function buildPreviousQuoteDomain(filters: SummaryFilters, sellerId: number, companyId: number, rangeKey: string | null = null) {
  const range = previousRange(filters, rangeKey);
  const domain: unknown[] = [
    ['state', '=', 'draft'],
    ['create_date', '>=', `${range.startDate} 00:00:00`],
    ['create_date', '<=', `${range.endDate} 23:59:59`],
    ['user_id', '=', sellerId],
    ['company_id', '=', companyId],
  ];
  if (filters.teamId) domain.push(['team_id', '=', filters.teamId]);
  if (filters.customerId) domain.push(['partner_id', '=', filters.customerId]);
  return { domain, range };
}

async function readGroupedHistory(apiKey: string, connection: OdooConnection, domain: unknown[], field: string) {
  const groups: GroupRow[] = [];
  for (let offset = 0; ; offset += 400) {
    const page = await executeReadKw({
      apiKey,
      ...connection,
      model: 'account.invoice.report',
      method: 'read_group',
      args: [domain, ['total_amount:sum(price_subtotal)', 'purchase_count:count_distinct(move_id)'], [field, 'move_type']],
      kwargs: { lazy: false, limit: 400, offset },
    }) as GroupRow[];
    groups.push(...page);
    if (page.length < 400) break;
  }
  return groups;
}

async function readPublicCustomerHistory(apiKey: string, connection: OdooConnection, domain: unknown[], customerGroups: GroupRow[]) {
  const publicKey = customerBaselineKey('PUBLICO EN GENERAL');
  const publicPartnerIds = customerGroups.filter((row) => customerBaselineKey(relationLabel(row.partner_id)) === publicKey)
    .map((row) => relationId(row.partner_id)).filter((id): id is number => id !== null);
  if (!publicPartnerIds.length) return null;
  try {
    const moveFields = await fieldsGet({ apiKey, ...connection, model: 'account.move' });
    if (!('partner_shipping_id' in moveFields)) return null;
    const groups = await readGroupedHistory(apiKey, connection,
      [...domain, ['partner_id', 'in', publicPartnerIds]], 'move_id');
    const publicTotal = customerGroups.filter((row) => publicPartnerIds.includes(relationId(row.partner_id) ?? -1))
      .reduce((total, row) => total + number(row.total_amount), 0);
    const moveTotal = groups.reduce((total, row) => total + number(row.total_amount), 0);
    if (!groups.length || Math.abs(publicTotal - moveTotal) > Math.max(0.02, Math.abs(publicTotal) * 0.000001)) return null;
    const moveIds = [...new Set(groups.map((row) => relationId(row.move_id)).filter((id): id is number => id !== null))];
    if (moveIds.length !== groups.length) return null;
    const shippingByMove = new Map<number, string>();
    for (let index = 0; index < moveIds.length; index += 200) {
      const moves = await searchReadAll({ apiKey, ...connection, model: 'account.move',
        domain: [['id', 'in', moveIds.slice(index, index + 200)]], fields: ['id', 'partner_shipping_id'] });
      if (moves.length !== moveIds.slice(index, index + 200).length) return null;
      for (const move of moves) {
        const shipping = relationLabel(move.partner_shipping_id);
        if (shipping && customerBaselineKey(shipping) !== publicKey) shippingByMove.set(Number(move.id), shipping);
      }
    }
    return allocatePublicInvoiceHistory(customerGroups, groups, shippingByMove);
  } catch {
    return null;
  }
}

export async function fetchAgentHistoricalBaselines({
  adminClient, apiKey, connection, filters, sellerId, companyId, forceRefresh = false,
}: {
  adminClient: SupabaseClient;
  apiKey: string;
  connection: OdooConnection;
  filters: SummaryFilters;
  sellerId: number;
  companyId: number;
  forceRefresh?: boolean;
}) {
  const asOfDate = new Date(new Date(`${filters.startDate}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  if (!forceRefresh) {
    const stored = await readStoredBaselines(adminClient, connection, sellerId, companyId, asOfDate);
    if (stored) return { baselines: stored, saved: true };
  }
  const domain = [
    ['invoice_user_id', '=', sellerId],
    ['company_id', '=', companyId],
    ['state', '=', 'posted'],
    ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['invoice_date', '<', filters.startDate],
  ];
  const [customers, products] = await Promise.all([
    readGroupedHistory(apiKey, connection, domain, 'partner_id'),
    readGroupedHistory(apiKey, connection, domain, 'product_id'),
  ]);
  const publicCustomerHistory = await readPublicCustomerHistory(apiKey, connection, domain, customers);
  const baselines = [
    ...(publicCustomerHistory ?? aggregateInvoiceAnalysisGroups(customers, 'customer')),
    ...aggregateInvoiceAnalysisGroups(products, 'product'),
  ];
  let saved = true;
  const syncToken = crypto.randomUUID();
  for (let index = 0; index < baselines.length; index += 200) {
    const records = baselines.slice(index, index + 200).map((row) => ({
      odoo_source: odooSourceKey(connection),
      company_id: companyId,
      seller_id: sellerId,
      as_of_date: asOfDate,
      dimension: row.dimension,
      dimension_key: row.key,
      total_amount: row.totalAmount,
      purchase_count: row.purchaseCount,
      sync_token: syncToken,
      refreshed_at: new Date().toISOString(),
    }));
    const { error } = await adminClient.from('report_agent_historical_baselines').upsert(records, {
      onConflict: 'odoo_source,company_id,seller_id,as_of_date,dimension,dimension_key',
    });
    if (error) {
      console.warn('[odoo-sales-report] baseline persistence unavailable', { code: error.code });
      saved = false;
      break;
    }
  }
  if (saved) {
    const { error } = await adminClient.from('report_agent_historical_baselines').delete()
      .eq('odoo_source', odooSourceKey(connection)).eq('company_id', companyId).eq('seller_id', sellerId)
      .eq('as_of_date', asOfDate).neq('sync_token', syncToken);
    if (error) {
      console.warn('[odoo-sales-report] stale baseline cleanup unavailable', { code: error.code });
      saved = false;
    }
  }
  return { baselines, saved };
}

function isPlaceholder(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replaceAll('[', ' ').replaceAll(']', ' ').includes('producto para cotizar');
}

export function countOpenQuotes(orders: GroupRow[], lines: GroupRow[], filters: SummaryFilters, categoryByProduct = new Map<number, number>()) {
  const linesByOrder = new Map<number, GroupRow[]>();
  for (const line of lines) {
    const orderId = relationId(line.order_id);
    if (!orderId) continue;
    const bucket = linesByOrder.get(orderId) ?? [];
    bucket.push(line);
    linesByOrder.set(orderId, bucket);
  }
  return orders.filter((order) => {
    const orderLines = linesByOrder.get(number(order.id)) ?? [];
    if ((filters.productId || filters.categoryId) && !orderLines.some((line) => {
      const productId = relationId(line.product_id);
      return (!filters.productId || productId === filters.productId) &&
        (!filters.categoryId || categoryByProduct.get(productId ?? -1) === filters.categoryId);
    })) return false;
    return orderLines.reduce((total, line) =>
      total + (isPlaceholder(relationLabel(line.product_id) || String(line.name ?? '')) ? 0 : Math.max(0, number(line.price_subtotal))), 0) > 0;
  }).length;
}

export async function fetchPreviousOpenQuoteCount({ apiKey, connection, filters, sellerId, companyId, rangeKey }: {
  apiKey: string;
  connection: OdooConnection;
  filters: SummaryFilters;
  sellerId: number;
  companyId: number;
  rangeKey: string | null;
}) {
  const { domain, range } = buildPreviousQuoteDomain(filters, sellerId, companyId, rangeKey);
  if (filters.stateScope === 'confirmed' || filters.stateScope === 'cancelled') {
    return { count: 0, range };
  }
  if (filters.currencyCode) {
    const currencies = await searchReadAll({ apiKey, ...connection, model: 'res.currency',
      domain: [['name', '=', filters.currencyCode]], fields: ['id'] });
    if (!currencies.length) return { count: 0, range };
    domain.push(['currency_id', '=', Number(currencies[0].id)]);
  }
  if (filters.channel) {
    const fields = await fieldsGet({ apiKey, ...connection, model: 'sale.order' });
    const channelField = ['source_id', 'medium_id', 'campaign_id', 'origin'].find((field) => field in fields);
    if (channelField) domain.push([channelField, 'ilike', filters.channel]);
  }
  const orders = await searchReadAll({ apiKey, ...connection, model: 'sale.order',
    domain, fields: ['id'], order: 'create_date desc, id desc' });
  if (!orders.length) return { count: 0, range };
  const lines: GroupRow[] = [];
  for (let index = 0; index < orders.length; index += 200) {
    lines.push(...await searchReadAll({ apiKey, ...connection, model: 'sale.order.line',
      domain: [['order_id', 'in', orders.slice(index, index + 200).map((order) => Number(order.id))]],
      fields: ['id', 'order_id', 'product_id', 'name', 'price_subtotal'] }));
  }
  const categoryByProduct = new Map<number, number>();
  if (filters.categoryId) {
    const productIds = [...new Set(lines.map((line) => relationId(line.product_id)).filter((id): id is number => id !== null))];
    for (let index = 0; index < productIds.length; index += 200) {
      const products = await searchReadAll({ apiKey, ...connection, model: 'product.product',
        domain: [['id', 'in', productIds.slice(index, index + 200)]], fields: ['id', 'categ_id'] });
      products.forEach((product) => categoryByProduct.set(Number(product.id), relationId(product.categ_id) ?? -1));
    }
  }
  return { count: countOpenQuotes(orders, lines, filters, categoryByProduct), range };
}
