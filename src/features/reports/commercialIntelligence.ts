import type { OdooCommercialDataset, OdooInvoiceLineRecord, ReportFilters } from './odooSalesCore';

export type ProfitabilityCustomer = {
  id: string;
  partnerId: number | null;
  name: string;
  sales: number;
  margin: number;
  marginPct: number;
  invoices: number;
  orderCount: number | null;
  lastPurchaseDate: string | null;
  segment: 'strategic' | 'profitable' | 'review' | 'lowVolume';
};

export type AffinityProduct = { id: number; name: string; invoices: number };
export type AffinityPair = {
  firstId: number;
  secondId: number;
  invoices: number;
  supportPct: number;
  confidencePct: number;
  lift: number;
};
export type AffinityAnalysis = { products: AffinityProduct[]; pairs: AffinityPair[]; basketCount: number };
export type CustomerMarginAggregate = { partnerId: number; partnerName: string; sales: number; margin: number; invoices: number; lastPurchaseDate?: string | null };
export type StockSnapshot = { productId: number; onHand: number | null; forecast: number | null; sku: string | null };
export type DemandRow = {
  productId: number;
  productName: string;
  sku: string | null;
  units: number;
  demandPerDay: number;
  onHand: number | null;
  coverageDays: number | null;
  risk: 'critical' | 'watch' | 'covered' | 'unknown';
};
export type SellerVelocity = {
  sellerId: number;
  seller: string;
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
};
export type CommercialIntelligence = {
  customers: ProfitabilityCustomer[];
  profitabilityCoverage: { analyzed: number; missing: number };
  salesThreshold: number;
  marginThreshold: number;
  affinity: AffinityAnalysis;
  demand: DemandRow[];
  velocity: SellerVelocity[];
};

function inScope(line: OdooInvoiceLineRecord, filters: ReportFilters) {
  const companyIds = filters.companyIds?.length ? filters.companyIds : filters.companyId ? [filters.companyId] : [];
  const sellerIds = filters.sellerIds?.length ? filters.sellerIds : filters.sellerId ? [filters.sellerId] : [];
  return line.invoiceState === 'posted' && (line.displayType == null || line.displayType === 'product') &&
    (line.moveType === 'out_invoice' || line.moveType === 'out_refund') &&
    Boolean(line.invoiceDate && line.invoiceDate >= filters.startDate && line.invoiceDate <= filters.endDate) &&
    (!companyIds.length || companyIds.includes(line.companyId ?? -1)) &&
    (!sellerIds.length || sellerIds.includes(line.sellerId ?? -1)) &&
    (!filters.currencyCode || line.currencyCode === filters.currencyCode) &&
    (!filters.customerId || line.customerId === filters.customerId) &&
    (!filters.productId || line.productId === filters.productId) &&
    (!filters.categoryId || line.categoryId === filters.categoryId) &&
    (!filters.teamId || line.teamId === filters.teamId);
}

export function classifyProfitabilityCustomer(sales: number, marginPct: number, salesThreshold: number, marginThreshold: number): ProfitabilityCustomer['segment'] {
  const highSales = sales >= salesThreshold;
  const highMargin = marginPct >= marginThreshold;
  return highSales ? (highMargin ? 'strategic' : 'review') : (highMargin ? 'profitable' : 'lowVolume');
}

export function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function buildProductAffinity(dataset: OdooCommercialDataset, filters: ReportFilters): AffinityAnalysis {
  const purchases = dataset.invoiceLines.filter((line) => inScope(line, filters) &&
    line.moveType === 'out_invoice' && line.productId && line.quantity > 0);
  const baskets = new Map<number, Set<number>>();
  const productNames = new Map<number, string>();
  for (const line of purchases) {
    const id = line.productId!;
    const basket = baskets.get(line.invoiceId) ?? new Set<number>();
    basket.add(id);
    baskets.set(line.invoiceId, basket);
    productNames.set(id, line.productName);
  }
  const productCounts = new Map<number, number>();
  for (const basket of baskets.values()) {
    for (const id of basket) productCounts.set(id, (productCounts.get(id) ?? 0) + 1);
  }
  const products = [...productCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8)
    .map(([id, invoices]) => ({ id, name: productNames.get(id) ?? `Producto ${id}`, invoices }));
  const selected = new Set(products.map((row) => row.id));
  const pairCounts = new Map<string, number>();
  for (const basket of baskets.values()) {
    const ids = [...basket].filter((id) => selected.has(id)).sort((a, b) => a - b);
    for (let first = 0; first < ids.length; first++) {
      for (let second = first + 1; second < ids.length; second++) {
        const key = `${ids[first]}:${ids[second]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const pairs: AffinityPair[] = [...pairCounts].flatMap(([key, invoices]) => {
    const [firstId, secondId] = key.split(':').map(Number);
    if (!selected.has(firstId) || !selected.has(secondId)) return [];
    const firstCount = productCounts.get(firstId) ?? 0;
    const secondCount = productCounts.get(secondId) ?? 0;
    return [{ firstId, secondId, invoices, supportPct: invoices / baskets.size * 100,
      confidencePct: invoices / firstCount * 100, lift: invoices * baskets.size / (firstCount * secondCount) }];
  }).sort((a, b) => b.invoices - a.invoices);
  return { products, pairs, basketCount: baskets.size };
}

export function buildCommercialIntelligence(
  dataset: OdooCommercialDataset,
  filters: ReportFilters,
  stock: StockSnapshot[] = [],
  marginAggregates: CustomerMarginAggregate[] = [],
): CommercialIntelligence {
  const lines = dataset.invoiceLines.filter((line) => inScope(line, filters));
  const customers = new Map<string, { id: string; partnerId: number | null; name: string; sales: number; margin: number; invoices: Set<number>; invoiceCount: number; lastPurchaseDate: string | null; missing: boolean }>();
  const aggregateByPartner = new Map(marginAggregates.map((row) => [row.partnerId, row]));
  let missing = 0;
  if (aggregateByPartner.size) {
    const customerLabels = new Map<number, { id: string; name: string }>();
    for (const line of lines) {
      if (line.customerId == null) continue;
      customerLabels.set(line.customerId, {
        id: `${line.deliveryCustomerId ?? line.customerId}`,
        name: line.deliveryCustomerName?.split(',')[0].trim() || line.customerName,
      });
    }
    for (const aggregate of marginAggregates) {
      const label = customerLabels.get(aggregate.partnerId) ?? { id: `${aggregate.partnerId}`, name: aggregate.partnerName };
      const row = customers.get(label.id) ?? { id: label.id, partnerId: Number(label.id) || aggregate.partnerId, name: label.name, sales: 0, margin: 0, invoices: new Set<number>(), invoiceCount: 0, lastPurchaseDate: null, missing: false };
      row.sales += aggregate.sales;
      row.margin += aggregate.margin;
      row.invoiceCount += aggregate.invoices;
      if (aggregate.lastPurchaseDate && (!row.lastPurchaseDate || aggregate.lastPurchaseDate > row.lastPurchaseDate)) row.lastPurchaseDate = aggregate.lastPurchaseDate;
      customers.set(label.id, row);
    }
    for (const line of lines) {
      const id = `${line.deliveryCustomerId ?? line.customerId ?? ''}`;
      const row = customers.get(id);
      if (row && line.invoiceDate && (!row.lastPurchaseDate || line.invoiceDate > row.lastPurchaseDate)) row.lastPurchaseDate = line.invoiceDate;
    }
  } else {
    for (const line of lines) {
      const id = `${line.deliveryCustomerId ?? line.customerId ?? line.customerName}`;
      const name = line.deliveryCustomerName?.split(',')[0].trim() || line.customerName;
      const row = customers.get(id) ?? { id, partnerId: Number(id) || null, name, sales: 0, margin: 0, invoices: new Set<number>(), invoiceCount: 0, lastPurchaseDate: null, missing: false };
      const margin = line.analysisMarginAmount ?? (line.directMarginAvailable || line.linePurchaseUnitCost != null ? line.marginAmount : null);
      if (margin == null || !Number.isFinite(margin)) {
        row.missing = true;
        missing += 1;
      } else {
        row.sales += line.analysisUntaxedAmount ?? line.untaxedAmount;
        row.margin += margin;
        row.invoices.add(line.invoiceId);
        if (line.invoiceDate && (!row.lastPurchaseDate || line.invoiceDate > row.lastPurchaseDate)) row.lastPurchaseDate = line.invoiceDate;
      }
      customers.set(id, row);
    }
  }
  const complete = [...customers.values()].filter((row) => !row.missing && row.sales > 0);
  const salesThreshold = percentile(complete.map((row) => row.sales).sort((a, b) => a - b), 0.5);
  const marginThreshold = 25;
  const orderCounts = new Map<string, Set<number>>();
  for (const order of dataset.orders) {
    if (!['sale', 'done'].includes(order.state) || !order.confirmationDate ||
      order.confirmationDate.slice(0, 10) < filters.startDate || order.confirmationDate.slice(0, 10) > filters.endDate ||
      (filters.companyIds?.length ? !filters.companyIds.includes(order.companyId ?? -1) : Boolean(filters.companyId && order.companyId !== filters.companyId)) ||
      (filters.sellerIds?.length ? !filters.sellerIds.includes(order.sellerId ?? -1) : Boolean(filters.sellerId && order.sellerId !== filters.sellerId))) continue;
    const id = `${order.deliveryCustomerId ?? order.customerId ?? ''}`;
    const ids = orderCounts.get(id) ?? new Set<number>();
    ids.add(order.id);
    orderCounts.set(id, ids);
  }
  const profitabilityCustomers: ProfitabilityCustomer[] = complete.map((row) => {
    const marginPct = row.margin / row.sales * 100;
    const segment = classifyProfitabilityCustomer(row.sales, marginPct, salesThreshold, marginThreshold);
    return { id: row.id, partnerId: row.partnerId, name: row.name, sales: row.sales, margin: row.margin, marginPct,
      invoices: row.invoiceCount || row.invoices.size,
      orderCount: dataset.orders.length ? (orderCounts.get(row.id)?.size ?? 0) : null,
      lastPurchaseDate: row.lastPurchaseDate,
      segment };
  }).sort((a, b) => b.sales - a.sales);

  const affinity = buildProductAffinity(dataset, filters);

  const days = Math.max(1, Math.round((Date.parse(`${filters.endDate}T00:00:00Z`) - Date.parse(`${filters.startDate}T00:00:00Z`)) / 86_400_000) + 1);
  const demandMap = new Map<number, DemandRow>();
  const stockByProduct = new Map(stock.map((row) => [row.productId, row]));
  for (const line of lines) {
    if (!line.productId || !line.quantity) continue;
    const stockRow = stockByProduct.get(line.productId);
    const row = demandMap.get(line.productId) ?? { productId: line.productId, productName: line.productName,
      sku: stockRow?.sku ?? null, units: 0, demandPerDay: 0, onHand: stockRow?.onHand ?? null,
      coverageDays: null, risk: 'unknown' as const };
    row.units += line.moveType === 'out_refund' ? -line.quantity : line.quantity;
    demandMap.set(line.productId, row);
  }
  const demand = [...demandMap.values()].filter((row) => row.units > 0).sort((a, b) => b.units - a.units).slice(0, 12)
    .map((row): DemandRow => {
      const demandPerDay = row.units / days;
      const coverageDays = row.onHand === null ? null : Math.max(0, row.onHand) / demandPerDay;
      return { ...row, demandPerDay, coverageDays, risk: coverageDays === null ? 'unknown' :
        coverageDays < 14 ? 'critical' : coverageDays < 30 ? 'watch' : 'covered' };
    });

  const companyIds = filters.companyIds?.length ? filters.companyIds : filters.companyId ? [filters.companyId] : [];
  const sellerIds = filters.sellerIds?.length ? filters.sellerIds : filters.sellerId ? [filters.sellerId] : [];
  const velocityMap = new Map<number, { seller: string; durations: number[] }>();
  for (const order of dataset.orders) {
    if (!order.sellerId || !order.createDate || !order.confirmationDate ||
      !['sale', 'done'].includes(order.state) ||
      order.confirmationDate.slice(0, 10) < filters.startDate || order.confirmationDate.slice(0, 10) > filters.endDate ||
      (companyIds.length && !companyIds.includes(order.companyId ?? -1)) ||
      (sellerIds.length && !sellerIds.includes(order.sellerId)) ||
      (filters.customerId && order.customerId !== filters.customerId) ||
      (filters.teamId && order.teamId !== filters.teamId)) continue;
    const duration = (Date.parse(order.confirmationDate) - Date.parse(order.createDate)) / 86_400_000;
    if (!Number.isFinite(duration) || duration < 0) continue;
    const row = velocityMap.get(order.sellerId) ?? { seller: order.sellerName, durations: [] };
    row.durations.push(duration);
    velocityMap.set(order.sellerId, row);
  }
  const velocity: SellerVelocity[] = [...velocityMap].map(([sellerId, row]) => {
    const values = row.durations.sort((a, b) => a - b);
    return { sellerId, seller: row.seller, count: values.length, min: values[0], q1: percentile(values, 0.25),
      median: percentile(values, 0.5), q3: percentile(values, 0.75), max: values.at(-1)! };
  }).sort((a, b) => b.count - a.count || a.median - b.median).slice(0, 12);

  return { customers: profitabilityCustomers, profitabilityCoverage: { analyzed: complete.length, missing },
    salesThreshold, marginThreshold, affinity, demand, velocity };
}
