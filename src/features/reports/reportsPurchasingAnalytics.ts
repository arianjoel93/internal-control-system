import type {
  OdooCommercialDataset,
  OdooPurchaseOrderLineRecord,
  OdooPurchaseOrderRecord,
  OdooVendorBillLineRecord,
  OdooVendorBillRecord,
  ReportFilters,
} from './odooSalesCore';

export type PurchaseMetricComparison = {
  current: number;
  previous: number;
  difference: number;
  differencePct: number | null;
  trend: 'up' | 'down' | 'stable';
};

export type PurchaseProductRow = {
  productId: number | null;
  productName: string;
  categoryName: string | null;
  billedAmount: number;
  orderedAmount: number;
  quantity: number;
  supplierCount: number;
  billCount: number;
  spendSharePct: number;
  previousBilledAmount: number;
  billedAmountChangePct: number | null;
};

export type PurchaseSupplierRow = {
  supplierId: number | null;
  supplierName: string;
  billedAmount: number;
  orderedAmount: number;
  billCount: number;
  orderCount: number;
  productCount: number;
  averageBill: number;
  spendSharePct: number;
  previousBilledAmount: number;
  billedAmountChangePct: number | null;
};

export type PurchaseBuyerRow = {
  buyerId: number | null;
  buyerName: string;
  billedAmount: number;
  orderedAmount: number;
  billCount: number;
  orderCount: number;
  supplierCount: number;
  averageOrderValue: number;
  previousBilledAmount: number;
  billedAmountChangePct: number | null;
};

export type PurchaseCategoryRow = {
  categoryId: number | null;
  categoryName: string;
  billedAmount: number;
  orderedAmount: number;
  quantity: number;
  productCount: number;
  supplierCount: number;
  spendSharePct: number;
  previousBilledAmount: number;
  billedAmountChangePct: number | null;
};

export type PurchaseTrendPoint = {
  bucketKey: string;
  label: string;
  billedAmount: number;
  orderedAmount: number;
  previousBilledAmount: number;
  quantity: number;
};

export type PurchaseDashboardSnapshot = {
  generatedAt: string;
  filters: ReportFilters;
  summary: {
    orderedAmount: PurchaseMetricComparison;
    billedAmount: PurchaseMetricComparison;
    supplierCount: PurchaseMetricComparison;
    buyerCount: PurchaseMetricComparison;
    averageOrderValue: PurchaseMetricComparison;
    refundAmount: PurchaseMetricComparison;
  };
  products: {
    topBySpend: PurchaseProductRow[];
    leastBySpend: PurchaseProductRow[];
    topByQuantity: PurchaseProductRow[];
  };
  suppliers: {
    topBySpend: PurchaseSupplierRow[];
  };
  buyers: {
    topBySpend: PurchaseBuyerRow[];
  };
  categories: {
    topBySpend: PurchaseCategoryRow[];
  };
  trend: PurchaseTrendPoint[];
};

type PeriodRange = {
  start: Date;
  end: Date;
};

export function buildPurchaseDashboard(
  dataset: OdooCommercialDataset,
  filters: ReportFilters,
): PurchaseDashboardSnapshot {
  const filtered = filterPurchaseDataset(dataset, filters);
  const currentPeriod = buildPeriodRange(filters.startDate, filters.endDate);
  const previousPeriod = buildPreviousPeriodRange(currentPeriod);
  const currentOrders = filterPurchaseOrdersByDate(filtered.purchaseOrders, currentPeriod);
  const previousOrders = filterPurchaseOrdersByDate(filtered.purchaseOrders, previousPeriod);
  const currentBills = filterVendorBillsByDate(filtered.vendorBills, currentPeriod);
  const previousBills = filterVendorBillsByDate(filtered.vendorBills, previousPeriod);
  const currentBillLines = filterVendorBillLinesByDate(filtered.vendorBillLines, currentPeriod);
  const previousBillLines = filterVendorBillLinesByDate(filtered.vendorBillLines, previousPeriod);
  const currentOrderLines = filterPurchaseOrderLinesByDate(filtered.purchaseOrderLines, currentPeriod);

  const productRows = buildPurchaseProductRows({
    currentBillLines,
    currentOrderLines,
    previousBillLines,
  });
  const supplierRows = buildPurchaseSupplierRows({
    currentBills,
    currentOrders,
    currentBillLines,
    previousBills,
  });
  const categoryRows = buildPurchaseCategoryRows({
    currentBillLines,
    currentOrderLines,
    previousBillLines,
  });
  const buyerRows = buildPurchaseBuyerRows({
    currentBills,
    currentOrders,
    previousBills,
  });

  return {
    generatedAt: dataset.fetchedAt,
    filters,
    summary: {
      orderedAmount: compareMetric(
        sum(currentOrders, (record) => record.amountUntaxed),
        sum(previousOrders, (record) => record.amountUntaxed),
      ),
      billedAmount: compareMetric(
        sum(currentBills, (record) => record.untaxedAmountSigned),
        sum(previousBills, (record) => record.untaxedAmountSigned),
      ),
      supplierCount: compareMetric(
        countDistinct(
          currentBills.map((record) => buildEntityKey(record.supplierId, record.supplierName, 'supplier')),
        ),
        countDistinct(
          previousBills.map((record) => buildEntityKey(record.supplierId, record.supplierName, 'supplier')),
        ),
      ),
      buyerCount: compareMetric(
        countDistinct(
          currentOrders.map((record) => buildEntityKey(record.buyerId, record.buyerName, 'buyer')),
        ),
        countDistinct(
          previousOrders.map((record) => buildEntityKey(record.buyerId, record.buyerName, 'buyer')),
        ),
      ),
      averageOrderValue: compareMetric(
        average(currentOrders.map((record) => record.amountUntaxed)),
        average(previousOrders.map((record) => record.amountUntaxed)),
      ),
      refundAmount: compareMetric(
        sum(
          currentBills.filter((record) => record.moveType === 'in_refund'),
          (record) => Math.abs(record.untaxedAmountSigned),
        ),
        sum(
          previousBills.filter((record) => record.moveType === 'in_refund'),
          (record) => Math.abs(record.untaxedAmountSigned),
        ),
      ),
    },
    products: {
      topBySpend: productRows.slice().sort((left, right) => right.billedAmount - left.billedAmount).slice(0, 12),
      leastBySpend: productRows
        .filter((row) => row.billedAmount > 0)
        .slice()
        .sort((left, right) => left.billedAmount - right.billedAmount)
        .slice(0, 12),
      topByQuantity: productRows.slice().sort((left, right) => right.quantity - left.quantity).slice(0, 12),
    },
    suppliers: {
      topBySpend: supplierRows.slice().sort((left, right) => right.billedAmount - left.billedAmount).slice(0, 15),
    },
    buyers: {
      topBySpend: buyerRows.slice().sort((left, right) => right.billedAmount - left.billedAmount).slice(0, 15),
    },
    categories: {
      topBySpend: categoryRows.slice().sort((left, right) => right.billedAmount - left.billedAmount).slice(0, 12),
    },
    trend: buildPurchaseTrendPoints({
      currentBillLines,
      currentOrders,
      grouping: filters.grouping,
      previousBillLines,
      currentRange: currentPeriod,
      previousRange: previousPeriod,
    }),
  };
}

function filterPurchaseDataset(dataset: OdooCommercialDataset, filters: ReportFilters) {
  let purchaseOrderLines = dataset.purchaseOrderLines;
  let vendorBillLines = dataset.vendorBillLines;

  if (filters.productId) {
    purchaseOrderLines = purchaseOrderLines.filter((line) => line.productId === filters.productId);
    vendorBillLines = vendorBillLines.filter((line) => line.productId === filters.productId);
  }
  if (filters.categoryId) {
    purchaseOrderLines = purchaseOrderLines.filter((line) => line.categoryId === filters.categoryId);
    vendorBillLines = vendorBillLines.filter((line) => line.categoryId === filters.categoryId);
  }

  const visiblePurchaseOrderIds = new Set(purchaseOrderLines.map((line) => line.orderId));
  const visibleVendorBillIds = new Set(vendorBillLines.map((line) => line.invoiceId));
  const companyIds = resolveCompanyFilterIds(filters);
  const buyerIds = resolveSellerFilterIds(filters);

  const purchaseOrders = dataset.purchaseOrders.filter((order) => {
    if (companyIds.length > 0 && !companyIds.includes(order.companyId ?? -1)) return false;
    if (buyerIds.length > 0 && !buyerIds.includes(order.buyerId ?? -1)) return false;
    if (filters.currencyCode && order.currencyCode !== filters.currencyCode) return false;
    if ((filters.productId || filters.categoryId) && !visiblePurchaseOrderIds.has(order.id)) return false;
    return true;
  });
  const purchaseOrderIdSet = new Set(purchaseOrders.map((order) => order.id));
  purchaseOrderLines = purchaseOrderLines.filter((line) => purchaseOrderIdSet.has(line.orderId));

  const vendorBills = dataset.vendorBills.filter((bill) => {
    if (companyIds.length > 0 && !companyIds.includes(bill.companyId ?? -1)) return false;
    if (buyerIds.length > 0 && !buyerIds.includes(bill.buyerId ?? -1)) return false;
    if (filters.currencyCode && bill.currencyCode !== filters.currencyCode) return false;
    if ((filters.productId || filters.categoryId) && !visibleVendorBillIds.has(bill.id)) return false;
    return true;
  });
  const vendorBillIdSet = new Set(vendorBills.map((bill) => bill.id));
  vendorBillLines = vendorBillLines.filter((line) => vendorBillIdSet.has(line.invoiceId));

  return {
    purchaseOrders,
    purchaseOrderLines,
    vendorBills,
    vendorBillLines,
  };
}

function buildPurchaseProductRows({
  currentBillLines,
  currentOrderLines,
  previousBillLines,
}: {
  currentBillLines: OdooVendorBillLineRecord[];
  currentOrderLines: OdooPurchaseOrderLineRecord[];
  previousBillLines: OdooVendorBillLineRecord[];
}) {
  const rows = new Map<
    string,
    {
      productId: number | null;
      productName: string;
      categoryName: string | null;
      billedAmount: number;
      orderedAmount: number;
      quantity: number;
      supplierSet: Set<string>;
      billSet: Set<number>;
      previousBilledAmount: number;
    }
  >();

  currentBillLines.forEach((line) => {
    const key = buildEntityKey(line.productId, line.productName, 'product');
    const row = rows.get(key) ?? {
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      billedAmount: 0,
      orderedAmount: 0,
      quantity: 0,
      supplierSet: new Set<string>(),
      billSet: new Set<number>(),
      previousBilledAmount: 0,
    };
    row.billedAmount += line.untaxedAmount;
    row.quantity += line.quantity;
    row.supplierSet.add(buildEntityKey(line.supplierId, line.supplierName, 'supplier'));
    row.billSet.add(line.invoiceId);
    rows.set(key, row);
  });

  currentOrderLines.forEach((line) => {
    const key = buildEntityKey(line.productId, line.productName, 'product');
    const row = rows.get(key) ?? {
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      billedAmount: 0,
      orderedAmount: 0,
      quantity: 0,
      supplierSet: new Set<string>(),
      billSet: new Set<number>(),
      previousBilledAmount: 0,
    };
    row.orderedAmount += line.untaxedAmount;
    rows.set(key, row);
  });

  previousBillLines.forEach((line) => {
    const key = buildEntityKey(line.productId, line.productName, 'product');
    const row = rows.get(key) ?? {
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      billedAmount: 0,
      orderedAmount: 0,
      quantity: 0,
      supplierSet: new Set<string>(),
      billSet: new Set<number>(),
      previousBilledAmount: 0,
    };
    row.previousBilledAmount += line.untaxedAmount;
    rows.set(key, row);
  });

  const totalSpend = sum([...rows.values()], (row) => row.billedAmount);
  return [...rows.values()].map((row) => ({
    productId: row.productId,
    productName: row.productName,
    categoryName: row.categoryName,
    billedAmount: row.billedAmount,
    orderedAmount: row.orderedAmount,
    quantity: row.quantity,
    supplierCount: row.supplierSet.size,
    billCount: row.billSet.size,
    spendSharePct: ratio(row.billedAmount, totalSpend) * 100,
    previousBilledAmount: row.previousBilledAmount,
    billedAmountChangePct: calculatePctChange(row.billedAmount, row.previousBilledAmount),
  }));
}

function buildPurchaseSupplierRows({
  currentBills,
  currentOrders,
  currentBillLines,
  previousBills,
}: {
  currentBills: OdooVendorBillRecord[];
  currentOrders: OdooPurchaseOrderRecord[];
  currentBillLines: OdooVendorBillLineRecord[];
  previousBills: OdooVendorBillRecord[];
}) {
  const rows = new Map<
    string,
    {
      supplierId: number | null;
      supplierName: string;
      billedAmount: number;
      orderedAmount: number;
      billSet: Set<number>;
      orderSet: Set<number>;
      productSet: Set<string>;
      previousBilledAmount: number;
    }
  >();

  currentBills.forEach((bill) => {
    const key = buildEntityKey(bill.supplierId, bill.supplierName, 'supplier');
    const row = rows.get(key) ?? {
      supplierId: bill.supplierId,
      supplierName: bill.supplierName,
      billedAmount: 0,
      orderedAmount: 0,
      billSet: new Set<number>(),
      orderSet: new Set<number>(),
      productSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.billedAmount += bill.untaxedAmountSigned;
    row.billSet.add(bill.id);
    rows.set(key, row);
  });

  currentOrders.forEach((order) => {
    const key = buildEntityKey(order.supplierId, order.supplierName, 'supplier');
    const row = rows.get(key) ?? {
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      billedAmount: 0,
      orderedAmount: 0,
      billSet: new Set<number>(),
      orderSet: new Set<number>(),
      productSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.orderedAmount += order.amountUntaxed;
    row.orderSet.add(order.id);
    rows.set(key, row);
  });

  currentBillLines.forEach((line) => {
    const key = buildEntityKey(line.supplierId, line.supplierName, 'supplier');
    const row = rows.get(key);
    if (!row) return;
    row.productSet.add(buildEntityKey(line.productId, line.productName, 'product'));
  });

  previousBills.forEach((bill) => {
    const key = buildEntityKey(bill.supplierId, bill.supplierName, 'supplier');
    const row = rows.get(key) ?? {
      supplierId: bill.supplierId,
      supplierName: bill.supplierName,
      billedAmount: 0,
      orderedAmount: 0,
      billSet: new Set<number>(),
      orderSet: new Set<number>(),
      productSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.previousBilledAmount += bill.untaxedAmountSigned;
    rows.set(key, row);
  });

  const totalSpend = sum([...rows.values()], (row) => row.billedAmount);
  return [...rows.values()].map((row) => ({
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    billedAmount: row.billedAmount,
    orderedAmount: row.orderedAmount,
    billCount: row.billSet.size,
    orderCount: row.orderSet.size,
    productCount: row.productSet.size,
    averageBill: row.billSet.size > 0 ? row.billedAmount / row.billSet.size : 0,
    spendSharePct: ratio(row.billedAmount, totalSpend) * 100,
    previousBilledAmount: row.previousBilledAmount,
    billedAmountChangePct: calculatePctChange(row.billedAmount, row.previousBilledAmount),
  }));
}

function buildPurchaseBuyerRows({
  currentBills,
  currentOrders,
  previousBills,
}: {
  currentBills: OdooVendorBillRecord[];
  currentOrders: OdooPurchaseOrderRecord[];
  previousBills: OdooVendorBillRecord[];
}) {
  const rows = new Map<
    string,
    {
      buyerId: number | null;
      buyerName: string;
      billedAmount: number;
      orderedAmount: number;
      billSet: Set<number>;
      orderSet: Set<number>;
      supplierSet: Set<string>;
      previousBilledAmount: number;
    }
  >();

  currentBills.forEach((bill) => {
    const key = buildEntityKey(bill.buyerId, bill.buyerName, 'buyer');
    const row = rows.get(key) ?? {
      buyerId: bill.buyerId,
      buyerName: bill.buyerName,
      billedAmount: 0,
      orderedAmount: 0,
      billSet: new Set<number>(),
      orderSet: new Set<number>(),
      supplierSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.billedAmount += bill.untaxedAmountSigned;
    row.billSet.add(bill.id);
    row.supplierSet.add(buildEntityKey(bill.supplierId, bill.supplierName, 'supplier'));
    rows.set(key, row);
  });

  currentOrders.forEach((order) => {
    const key = buildEntityKey(order.buyerId, order.buyerName, 'buyer');
    const row = rows.get(key) ?? {
      buyerId: order.buyerId,
      buyerName: order.buyerName,
      billedAmount: 0,
      orderedAmount: 0,
      billSet: new Set<number>(),
      orderSet: new Set<number>(),
      supplierSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.orderedAmount += order.amountUntaxed;
    row.orderSet.add(order.id);
    row.supplierSet.add(buildEntityKey(order.supplierId, order.supplierName, 'supplier'));
    rows.set(key, row);
  });

  previousBills.forEach((bill) => {
    const key = buildEntityKey(bill.buyerId, bill.buyerName, 'buyer');
    const row = rows.get(key) ?? {
      buyerId: bill.buyerId,
      buyerName: bill.buyerName,
      billedAmount: 0,
      orderedAmount: 0,
      billSet: new Set<number>(),
      orderSet: new Set<number>(),
      supplierSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.previousBilledAmount += bill.untaxedAmountSigned;
    rows.set(key, row);
  });

  return [...rows.values()].map((row) => ({
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    billedAmount: row.billedAmount,
    orderedAmount: row.orderedAmount,
    billCount: row.billSet.size,
    orderCount: row.orderSet.size,
    supplierCount: row.supplierSet.size,
    averageOrderValue: row.orderSet.size > 0 ? row.orderedAmount / row.orderSet.size : 0,
    previousBilledAmount: row.previousBilledAmount,
    billedAmountChangePct: calculatePctChange(row.billedAmount, row.previousBilledAmount),
  }));
}

function buildPurchaseCategoryRows({
  currentBillLines,
  currentOrderLines,
  previousBillLines,
}: {
  currentBillLines: OdooVendorBillLineRecord[];
  currentOrderLines: OdooPurchaseOrderLineRecord[];
  previousBillLines: OdooVendorBillLineRecord[];
}) {
  const rows = new Map<
    string,
    {
      categoryId: number | null;
      categoryName: string;
      billedAmount: number;
      orderedAmount: number;
      quantity: number;
      productSet: Set<string>;
      supplierSet: Set<string>;
      previousBilledAmount: number;
    }
  >();

  currentBillLines.forEach((line) => {
    const categoryName = line.categoryName ?? 'Sin categoría';
    const key = buildEntityKey(line.categoryId, categoryName, 'category');
    const row = rows.get(key) ?? {
      categoryId: line.categoryId,
      categoryName,
      billedAmount: 0,
      orderedAmount: 0,
      quantity: 0,
      productSet: new Set<string>(),
      supplierSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.billedAmount += line.untaxedAmount;
    row.quantity += line.quantity;
    row.productSet.add(buildEntityKey(line.productId, line.productName, 'product'));
    row.supplierSet.add(buildEntityKey(line.supplierId, line.supplierName, 'supplier'));
    rows.set(key, row);
  });

  currentOrderLines.forEach((line) => {
    const categoryName = line.categoryName ?? 'Sin categoría';
    const key = buildEntityKey(line.categoryId, categoryName, 'category');
    const row = rows.get(key) ?? {
      categoryId: line.categoryId,
      categoryName,
      billedAmount: 0,
      orderedAmount: 0,
      quantity: 0,
      productSet: new Set<string>(),
      supplierSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.orderedAmount += line.untaxedAmount;
    row.productSet.add(buildEntityKey(line.productId, line.productName, 'product'));
    row.supplierSet.add(buildEntityKey(line.supplierId, line.supplierName, 'supplier'));
    rows.set(key, row);
  });

  previousBillLines.forEach((line) => {
    const categoryName = line.categoryName ?? 'Sin categoría';
    const key = buildEntityKey(line.categoryId, categoryName, 'category');
    const row = rows.get(key) ?? {
      categoryId: line.categoryId,
      categoryName,
      billedAmount: 0,
      orderedAmount: 0,
      quantity: 0,
      productSet: new Set<string>(),
      supplierSet: new Set<string>(),
      previousBilledAmount: 0,
    };
    row.previousBilledAmount += line.untaxedAmount;
    rows.set(key, row);
  });

  const totalSpend = sum([...rows.values()], (row) => row.billedAmount);
  return [...rows.values()].map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    billedAmount: row.billedAmount,
    orderedAmount: row.orderedAmount,
    quantity: row.quantity,
    productCount: row.productSet.size,
    supplierCount: row.supplierSet.size,
    spendSharePct: ratio(row.billedAmount, totalSpend) * 100,
    previousBilledAmount: row.previousBilledAmount,
    billedAmountChangePct: calculatePctChange(row.billedAmount, row.previousBilledAmount),
  }));
}

function buildPurchaseTrendPoints({
  currentBillLines,
  currentOrders,
  grouping,
  previousBillLines,
  currentRange,
  previousRange,
}: {
  currentBillLines: OdooVendorBillLineRecord[];
  currentOrders: OdooPurchaseOrderRecord[];
  grouping: ReportFilters['grouping'];
  previousBillLines: OdooVendorBillLineRecord[];
  currentRange: PeriodRange;
  previousRange: PeriodRange;
}) {
  const buckets = new Map<string, PurchaseTrendPoint>();

  currentBillLines.forEach((line) => {
    const date = parseRecordDate(line.invoiceDate);
    if (!date || !isDateInRange(date, currentRange)) return;
    const { key, label } = buildGroupedKey(date, grouping);
    const bucket = buckets.get(key) ?? {
      bucketKey: key,
      label,
      billedAmount: 0,
      orderedAmount: 0,
      previousBilledAmount: 0,
      quantity: 0,
    };
    bucket.billedAmount += line.untaxedAmount;
    bucket.quantity += line.quantity;
    buckets.set(key, bucket);
  });

  currentOrders.forEach((order) => {
    const date = parseRecordDate(order.approvalDate ?? order.orderDate ?? order.createDate);
    if (!date || !isDateInRange(date, currentRange)) return;
    const { key, label } = buildGroupedKey(date, grouping);
    const bucket = buckets.get(key) ?? {
      bucketKey: key,
      label,
      billedAmount: 0,
      orderedAmount: 0,
      previousBilledAmount: 0,
      quantity: 0,
    };
    bucket.orderedAmount += order.amountUntaxed;
    buckets.set(key, bucket);
  });

  previousBillLines.forEach((line) => {
    const date = parseRecordDate(line.invoiceDate);
    if (!date || !isDateInRange(date, previousRange)) return;
    const alignedDate = alignDateToCurrentPeriod(date, previousRange, currentRange);
    const { key, label } = buildGroupedKey(alignedDate, grouping);
    const bucket = buckets.get(key) ?? {
      bucketKey: key,
      label,
      billedAmount: 0,
      orderedAmount: 0,
      previousBilledAmount: 0,
      quantity: 0,
    };
    bucket.previousBilledAmount += line.untaxedAmount;
    buckets.set(key, bucket);
  });

  return [...buckets.values()].sort((left, right) => left.bucketKey.localeCompare(right.bucketKey));
}

function alignDateToCurrentPeriod(date: Date, sourceRange: PeriodRange, targetRange: PeriodRange) {
  const offsetMs = date.getTime() - sourceRange.start.getTime();
  return new Date(targetRange.start.getTime() + offsetMs);
}

function filterPurchaseOrdersByDate(records: OdooPurchaseOrderRecord[], range: PeriodRange) {
  return records.filter((record) => {
    if (!isConfirmedPurchaseState(record.state)) return false;
    const date = parseRecordDate(record.approvalDate ?? record.orderDate ?? record.createDate);
    return date !== null && isDateInRange(date, range);
  });
}

function filterPurchaseOrderLinesByDate(records: OdooPurchaseOrderLineRecord[], range: PeriodRange) {
  return records.filter((record) => {
    const date = parseRecordDate(record.approvalDate ?? record.orderDate);
    return date !== null && isDateInRange(date, range);
  });
}

function filterVendorBillsByDate(records: OdooVendorBillRecord[], range: PeriodRange) {
  return records.filter((record) => {
    const date = parseRecordDate(record.invoiceDate);
    return date !== null && isDateInRange(date, range);
  });
}

function filterVendorBillLinesByDate(records: OdooVendorBillLineRecord[], range: PeriodRange) {
  return records.filter((record) => {
    const date = parseRecordDate(record.invoiceDate);
    return date !== null && isDateInRange(date, range);
  });
}

function buildPeriodRange(startDate: string, endDate: string): PeriodRange {
  return {
    start: new Date(`${startDate}T00:00:00.000Z`),
    end: new Date(`${endDate}T23:59:59.999Z`),
  };
}

function buildPreviousPeriodRange(current: PeriodRange): PeriodRange {
  const durationMs = current.end.getTime() - current.start.getTime();
  const previousEnd = new Date(current.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return { start: previousStart, end: previousEnd };
}

function compareMetric(current: number, previous: number): PurchaseMetricComparison {
  const difference = current - previous;
  return {
    current,
    previous,
    difference,
    differencePct: calculatePctChange(current, previous),
    trend: difference === 0 ? 'stable' : difference > 0 ? 'up' : 'down',
  };
}

function calculatePctChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function sum<T>(rows: T[], getter: (row: T) => number) {
  return rows.reduce((accumulator, row) => accumulator + getter(row), 0);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return sum(values, (value) => value) / values.length;
}

function countDistinct(values: string[]) {
  return new Set(values).size;
}

function ratio(value: number, total: number) {
  if (total === 0) return 0;
  return value / total;
}

function resolveCompanyFilterIds(filters: ReportFilters) {
  if (Array.isArray(filters.companyIds) && filters.companyIds.length > 0) {
    return filters.companyIds.filter((value) => Number.isFinite(value));
  }

  return filters.companyId ? [filters.companyId] : [];
}

function resolveSellerFilterIds(filters: ReportFilters) {
  if (Array.isArray(filters.sellerIds) && filters.sellerIds.length > 0) {
    return filters.sellerIds.filter((value) => Number.isFinite(value));
  }

  return filters.sellerId ? [filters.sellerId] : [];
}

function buildEntityKey(id: number | null, label: string | null | undefined, fallback: string) {
  if (id !== null) return `id:${id}`;
  return `txt:${normalizeLabel(label || fallback)}`;
}

function normalizeLabel(value: string | null | undefined) {
  return `${value ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseRecordDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(date: Date, range: PeriodRange) {
  return date >= range.start && date <= range.end;
}

function isConfirmedPurchaseState(state: string) {
  return state === 'purchase' || state === 'done';
}

function buildGroupedKey(date: Date, grouping: ReportFilters['grouping']) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if (grouping === 'month') {
    return {
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: formatMonthLabel(date),
    };
  }

  if (grouping === 'quarter') {
    const quarter = Math.floor((month - 1) / 3) + 1;
    return {
      key: `${year}-Q${quarter}`,
      label: `T${quarter} ${year}`,
    };
  }

  if (grouping === 'year') {
    return {
      key: `${year}`,
      label: `${year}`,
    };
  }

  return {
    key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    label: formatShortDate(date),
  };
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
