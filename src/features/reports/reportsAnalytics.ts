import type {
  OdooCustomerFirstPurchaseRecord,
  OdooCommercialDataset,
  OdooInvoiceRecord,
  OdooInvoiceLineRecord,
  OdooOrderLineRecord,
  OdooOrderRecord,
  ParetoMetricKey,
  ReportFilters,
  ReportsConfig,
  ReportGrouping,
  SellerGoalConfig,
} from './odooSalesCore';

export type MetricTrend = 'up' | 'down' | 'stable';
export type HallazgoLevel = 'informativo' | 'positivo' | 'atencion' | 'critico';
export type ClientStatus =
  | 'nuevo'
  | 'activo'
  | 'frecuente'
  | 'alto_valor'
  | 'observacion'
  | 'en_riesgo'
  | 'casi_perdido'
  | 'dormido'
  | 'perdido'
  | 'reactivado';
export type RiskLevel = 'bajo' | 'medio' | 'alto' | 'critico';
export type ProductQuadrant =
  | 'alta_venta_alto_margen'
  | 'alta_venta_bajo_margen'
  | 'baja_venta_alto_margen'
  | 'baja_venta_bajo_margen';

export type MetricComparison = {
  current: number;
  previous: number;
  difference: number;
  differencePct: number | null;
  trend: MetricTrend;
};

export type ExecutiveMetric = {
  id: string;
  label: string;
  definition: string;
  detailKey: string | null;
  comparison: MetricComparison;
  formattedCurrent: string;
};

export type QuoteSummary = {
  totalQuotes: MetricComparison;
  quoteAmount: MetricComparison;
  confirmedOrders: MetricComparison;
  confirmedAmount: MetricComparison;
  pendingQuotes: number;
  expiredQuotes: number;
  cancelledQuotes: number;
  convertedQuotes: number;
  averageConversionDays: MetricComparison;
  averageQuoteTicket: MetricComparison;
  averageConfirmedTicket: MetricComparison;
};

export type ConversionRow = {
  key: string;
  label: string;
  quotes: number;
  converted: number;
  cancelled: number;
  pending: number;
  expired: number;
  conversionPct: number;
  averageConversionDays: number;
};

export type TrendPoint = {
  bucketKey: string;
  label: string;
  soldAmount: number;
  invoicedAmount: number;
  previousInvoicedAmount: number;
  marginAmount: number;
  orderCount: number;
  averageTicket: number;
  uniqueCustomers: number;
  accumulatedSoldAmount: number;
};

export type ParetoRow = {
  position: number;
  key: string;
  label: string;
  value: number;
  units: number;
  orders: number;
  individualPct: number;
  accumulatedPct: number;
  classification: 'A' | 'B' | 'C';
};

export type ParetoSummary = {
  title: string;
  metric: ParetoMetricKey;
  statement: string;
  rows: ParetoRow[];
};

export type ClientLifecycleRow = {
  customerId: number | null;
  customerName: string;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  totalOrders: number;
  revenue: number;
  margin: number;
  averageTicket: number;
  averagePurchaseGapDays: number | null;
  currentStatus: ClientStatus;
  previousStatus: ClientStatus | null;
  riskLevel: RiskLevel;
  sellerName: string;
  rfmScore: string;
  rfmSegment: string;
  isNewCustomer: boolean;
  isReactivated: boolean;
};

export type ProductAnalysisRow = {
  productId: number | null;
  productName: string;
  categoryName: string | null;
  units: number;
  revenue: number;
  margin: number;
  marginPct: number | null;
  orderCount: number;
  uniqueCustomers: number;
  repeatPurchaseRate: number;
  averageTicket: number;
  revenueSharePct: number;
  marginSharePct: number;
  previousRevenue: number;
  revenueChangePct: number | null;
  quadrant: ProductQuadrant;
  flags: string[];
};

export type SellerPerformanceRow = {
  sellerId: number | null;
  sellerName: string;
  quotes: number;
  confirmedOrders: number;
  conversionPct: number;
  soldAmount: number;
  invoicedAmount: number;
  margin: number;
  marginPct: number | null;
  averageTicket: number;
  customersServed: number;
  newCustomers: number;
  atRiskCustomers: number;
  reactivatedCustomers: number;
  lostCustomers: number;
  averageConversionDays: number;
  cancellationRate: number;
  soldAmountChangePct: number | null;
  weightedScore: number;
};

export type SellerCategoryPerformanceRow = {
  sellerId: number | null;
  sellerName: string;
  categoryName: string;
  soldAmount: number;
  margin: number;
  orderCount: number;
  units: number;
  categorySharePct: number;
  sellerMixPct: number;
};

export type SellerCategorySummary = {
  categoryName: string;
  soldAmount: number;
  margin: number;
  sharePct: number;
  activeSellers: number;
  topSellerName: string | null;
  topSellerAmount: number;
  sellerRows: SellerCategoryPerformanceRow[];
};

export type AnnualGrowthSnapshot = {
  marginAmount: MetricComparison;
  invoicedAmount: MetricComparison;
  newCustomers: MetricComparison;
  signal: 'growth' | 'seasonal' | 'mixed';
  signalTitle: string;
  signalDescription: string;
  currentLabel: string;
  previousLabel: string;
};

export type AgentMetricFormat = 'currency' | 'days' | 'number' | 'percent';

export type AgentYearMetric = {
  id: string;
  label: string;
  comparison: MetricComparison;
  format: AgentMetricFormat;
  lowerIsBetter: boolean | null;
};

export type AgentYearDimensionRow = {
  key: string;
  label: string;
  current: number;
  previous: number;
  difference: number;
  differencePct: number | null;
  currentSharePct: number;
  previousSharePct: number;
};

export type AgentPerformanceInsight = {
  id: string;
  tone: 'positive' | 'attention' | 'neutral';
  title: string;
  detail: string;
};

export type AgentYearSection = {
  metrics: AgentYearMetric[];
  rows: AgentYearDimensionRow[];
  positives: AgentPerformanceInsight[];
  attention: AgentPerformanceInsight[];
};

export type AgentPerformanceProfile = {
  sellerName: string;
  companyName: string;
  currentPeriodLabel: string;
  previousYearPeriodLabel: string;
  comparisonContext: string;
  summary: AgentYearSection;
  conversion: AgentYearSection;
  clients: AgentYearSection;
  products: AgentYearSection;
  sales: AgentYearSection;
  pareto: AgentYearSection;
};

export type SellerGoalProgressRow = {
  sellerId: number | null;
  sellerName: string;
  salesTarget: number;
  newCustomersTarget: number;
  reactivatedCustomersTarget: number;
  soldAmount: number;
  newCustomers: number;
  reactivatedCustomers: number;
  salesProgressPct: number;
  newCustomersProgressPct: number;
  reactivatedCustomersProgressPct: number;
};

export type SellerTimelineMonthRow = {
  monthKey: string;
  label: string;
  soldAmount: number;
  previousSoldAmount: number;
  newCustomers: number;
  previousNewCustomers: number;
  reactivatedCustomers: number;
  previousReactivatedCustomers: number;
};

export type SellerTimelineSummary = {
  sellerId: number | null;
  sellerName: string;
  soldAmount: MetricComparison;
  newCustomers: MetricComparison;
  reactivatedCustomers: MetricComparison;
  goal: SellerGoalConfig | null;
  months: SellerTimelineMonthRow[];
};

export type Hallazgo = {
  id: string;
  level: HallazgoLevel;
  title: string;
  evidence: string;
  explanation: string;
  recommendation: string;
  detailKey: string | null;
};

export type DashboardDetails = {
  pendingQuotes: OdooOrderRecord[];
  expiredQuotes: OdooOrderRecord[];
  cancelledQuotes: OdooOrderRecord[];
  convertedQuotes: OdooOrderRecord[];
  confirmedOrders: OdooOrderRecord[];
  postedInvoices: OdooInvoiceRecord[];
  atRiskClients: ClientLifecycleRow[];
  dormantClients: ClientLifecycleRow[];
  lostClients: ClientLifecycleRow[];
  reactivatedClients: ClientLifecycleRow[];
  negativeMarginProducts: ProductAnalysisRow[];
  lowConversionSellers: SellerPerformanceRow[];
};

export type CommercialDashboardSnapshot = {
  generatedAt: string;
  filters: ReportFilters;
  config: ReportsConfig;
  summaryMetrics: ExecutiveMetric[];
  annualGrowth: AnnualGrowthSnapshot;
  agentProfile: AgentPerformanceProfile | null;
  quoteSummary: QuoteSummary;
  conversion: {
    overall: MetricComparison;
    bySeller: ConversionRow[];
    byCustomer: ConversionRow[];
    byTeam: ConversionRow[];
    byMonth: ConversionRow[];
    byRange: ConversionRow[];
    byProduct: ConversionRow[];
  };
  invoicing: {
    invoicedAmount: MetricComparison;
    invoiceCount: MetricComparison;
    refundAmount: MetricComparison;
    collectedSignal: string;
  };
  sales: {
    soldAmount: MetricComparison;
    confirmedOrders: MetricComparison;
    averageTicket: MetricComparison;
    marginAmount: MetricComparison;
    marginPct: MetricComparison;
    newCustomers: MetricComparison;
    retainedCustomersPct: MetricComparison;
    repurchaseRatePct: MetricComparison;
    reactivationRatePct: MetricComparison;
  };
  trend: TrendPoint[];
  pareto: {
    customers: ParetoSummary;
    products: ParetoSummary;
    sellers: ParetoSummary;
  };
  clientLifecycle: {
    summary: {
      newCustomers: number;
      activeCustomers: number;
      atRiskCustomers: number;
      dormantCustomers: number;
      lostCustomers: number;
      reactivatedCustomers: number;
      valueAtRisk: number;
      retentionPct: number;
      reactivationPct: number;
      churnRiskPct: number;
    };
    rows: ClientLifecycleRow[];
    rfmSegments: Array<{ segment: string; customers: number }>;
  };
  products: {
    topByRevenue: ProductAnalysisRow[];
    topByUnits: ProductAnalysisRow[];
    topByMargin: ProductAnalysisRow[];
    negativeMargin: ProductAnalysisRow[];
    withoutSales: ProductAnalysisRow[];
    highRevenueLowMargin: ProductAnalysisRow[];
    matrix: Record<ProductQuadrant, number>;
  };
  sellers: {
    rankingByRevenue: SellerPerformanceRow[];
    rankingByMargin: SellerPerformanceRow[];
    rankingByConversion: SellerPerformanceRow[];
    rankingByNewCustomers: SellerPerformanceRow[];
    rankingByAtRiskCustomers: SellerPerformanceRow[];
    rankingByReactivatedCustomers: SellerPerformanceRow[];
    rankingByAverageTicket: SellerPerformanceRow[];
    weightedRanking: SellerPerformanceRow[];
    categoryBreakdown: SellerCategorySummary[];
    goalProgress: SellerGoalProgressRow[];
    timelines: SellerTimelineSummary[];
    minOrderThreshold: number;
  };
  hallazgos: Hallazgo[];
  dataQualityAlerts: string[];
  details: DashboardDetails;
};

type PeriodRange = {
  start: Date;
  end: Date;
};

type CustomerAggregate = {
  customerId: number | null;
  customerName: string;
  sellerName: string;
  dates: Date[];
  invoices: OdooInvoiceRecord[];
  lineCount: number;
  revenue: number;
  margin: number;
};

type SellerAggregate = {
  sellerId: number | null;
  sellerName: string;
  quotes: OdooOrderRecord[];
  confirmedOrders: OdooOrderRecord[];
  confirmedRevenue: number;
  invoicedAmount: number;
  margin: number;
  newCustomers: number;
  atRiskCustomers: number;
  reactivatedCustomers: number;
  lostCustomers: number;
  retainedCustomers: number;
  previousCustomers: number;
};

type ConversionDimension =
  | 'sellerName'
  | 'customerName'
  | 'teamName'
  | 'quotationMonth'
  | 'amountRange';

type ConversionDimensionDescriptor = {
  key: string;
  label: string;
  sortOrder: number;
};

export function buildCommercialDashboard(
  dataset: OdooCommercialDataset,
  filters: ReportFilters,
  config: ReportsConfig,
): CommercialDashboardSnapshot {
  const sanitizedConfig = sanitizeConfig(config);
  const filtered = filterDataset(dataset, filters);
  const currentPeriod = buildPeriodRange(filters.startDate, filters.endDate);
  const previousPeriod = buildPreviousPeriodRange(currentPeriod);
  const currentYearToDatePeriod = buildYearToDateRange(currentPeriod.end);
  const previousYearToDatePeriod = buildPreviousYearToDateRange(currentPeriod.end);
  const previousYearEquivalentPeriod = buildPreviousYearEquivalentRange(currentPeriod);
  const postedCustomerMoves = filtered.invoices.filter(
    (invoice) =>
      invoice.state === 'posted' &&
      ['out_invoice', 'out_refund'].includes(invoice.moveType),
  );
  const postedCustomerMoveLines = filtered.invoiceLines.filter(
    (line) =>
      line.invoiceState === 'posted' &&
      ['out_invoice', 'out_refund'].includes(line.moveType),
  );
  const accountingInvoices = filtered.invoices.filter(
    (invoice) => invoice.state === 'posted' && invoice.moveType === 'out_invoice',
  );
  const refundInvoices = filtered.invoices.filter(
    (invoice) => invoice.state === 'posted' && invoice.moveType === 'out_refund',
  );
  const accountingInvoiceLines = filtered.invoiceLines.filter(
    (line) => line.invoiceState === 'posted' && line.moveType === 'out_invoice',
  );

  const currentQuotes = filterOrdersByDateAndState(
    filtered.orders,
    currentPeriod,
    'quotation',
  );
  const previousQuotes = filterOrdersByDateAndState(
    filtered.orders,
    previousPeriod,
    'quotation',
  );
  const previousYearEquivalentQuotes = filterOrdersByDateAndState(
    filtered.orders,
    previousYearEquivalentPeriod,
    'quotation',
  );
  const previousYearEquivalentConfirmedOrders = filterOrdersByDateAndState(
    filtered.orders,
    previousYearEquivalentPeriod,
    'confirmed',
  );
  const currentCancelledQuotes = filterOrdersByDateAndState(
    filtered.orders,
    currentPeriod,
    'cancelled',
  );
  const currentConfirmedOrders = filterOrdersByDateAndState(
    filtered.orders,
    currentPeriod,
    'confirmed',
  );
  const currentInvoices = filterInvoicesByDate(postedCustomerMoves, currentPeriod);
  const previousInvoices = filterInvoicesByDate(postedCustomerMoves, previousPeriod);
  const currentPublishedInvoices = filterInvoicesByDate(accountingInvoices, currentPeriod);
  const previousPublishedInvoices = filterInvoicesByDate(accountingInvoices, previousPeriod);
  const currentRefundInvoices = filterInvoicesByDate(refundInvoices, currentPeriod);
  const previousRefundInvoices = filterInvoicesByDate(refundInvoices, previousPeriod);
  const previousYearEquivalentInvoices = filterInvoicesByDate(
    postedCustomerMoves,
    previousYearEquivalentPeriod,
  );
  const previousYearEquivalentPublishedInvoices = filterInvoicesByDate(
    accountingInvoices,
    previousYearEquivalentPeriod,
  );
  const previousYearEquivalentRefundInvoices = filterInvoicesByDate(
    refundInvoices,
    previousYearEquivalentPeriod,
  );
  const currentInvoiceLines = filterInvoiceLinesByDate(postedCustomerMoveLines, currentPeriod);
  const previousInvoiceLines = filterInvoiceLinesByDate(postedCustomerMoveLines, previousPeriod);
  const previousYearEquivalentInvoiceLines = filterInvoiceLinesByDate(
    postedCustomerMoveLines,
    previousYearEquivalentPeriod,
  );
  const currentPublishedInvoiceLines = filterInvoiceLinesByDate(
    accountingInvoiceLines,
    currentPeriod,
  );
  const previousPublishedInvoiceLines = filterInvoiceLinesByDate(
    accountingInvoiceLines,
    previousPeriod,
  );
  const previousYearEquivalentPublishedInvoiceLines = filterInvoiceLinesByDate(
    accountingInvoiceLines,
    previousYearEquivalentPeriod,
  );
  const currentYearToDateInvoiceLines = filterInvoiceLinesByDate(
    postedCustomerMoveLines,
    currentYearToDatePeriod,
  );
  const previousYearToDateInvoiceLines = filterInvoiceLinesByDate(
    postedCustomerMoveLines,
    previousYearToDatePeriod,
  );
  const quoteAmountCurrent = sum(currentQuotes, (order) => orderAmount(order, sanitizedConfig));
  const quoteAmountPrevious = sum(previousQuotes, (order) => orderAmount(order, sanitizedConfig));
  const quoteInvoiceIndex = buildQuoteInvoiceIndex(accountingInvoices, accountingInvoiceLines);
  const currentConvertedQuotes = currentQuotes.filter((order) =>
    isQuoteConvertedByInvoice(order, currentPeriod.end, quoteInvoiceIndex),
  );
  const previousConvertedQuotes = previousQuotes.filter((order) =>
    isQuoteConvertedByInvoice(order, previousPeriod.end, quoteInvoiceIndex),
  );
  const previousYearEquivalentConvertedQuotes = previousYearEquivalentQuotes.filter((order) =>
    isQuoteConvertedByInvoice(order, previousYearEquivalentPeriod.end, quoteInvoiceIndex),
  );
  const pendingQuotes = currentQuotes.filter((order) => isQuotationState(order.state));
  const expiredQuotes = pendingQuotes.filter((order) => isExpiredQuote(order, currentPeriod.end));

  const currentQuoteConversionDays = average(
    currentConvertedQuotes
      .map((order) => getInvoiceConversionDays(order, quoteInvoiceIndex))
      .filter((value): value is number => value !== null),
  );
  const previousQuoteConversionDays = average(
    previousConvertedQuotes
      .map((order) => getInvoiceConversionDays(order, quoteInvoiceIndex))
      .filter((value): value is number => value !== null),
  );

  const currentConversionPct = calculateConversionPct(currentQuotes, currentConfirmedOrders);
  const previousConversionPct = calculateConversionPct(
    previousQuotes,
    filterOrdersByDateAndState(filtered.orders, previousPeriod, 'confirmed'),
  );
  const overallConversion = compareMetric(currentConversionPct, previousConversionPct);

  const currentMarginAmount = sum(currentInvoiceLines, (line) =>
    resolveInvoiceLineMargin(line, sanitizedConfig),
  );
  const previousMarginAmount = sum(previousInvoiceLines, (line) =>
    resolveInvoiceLineMargin(line, sanitizedConfig),
  );
  const currentMarginPct =
    ratio(currentMarginAmount, sum(currentInvoiceLines, (line) => line.untaxedAmount)) * 100;
  const previousMarginPct =
    ratio(previousMarginAmount, sum(previousInvoiceLines, (line) => line.untaxedAmount)) * 100;
  const currentInvoicedAmount = sum(currentInvoiceLines, (line) => line.untaxedAmount);
  const previousInvoicedAmount = sum(previousInvoiceLines, (line) => line.untaxedAmount);
  const currentBilledOrderCount = countDistinctBilledOrders(
    currentPublishedInvoices,
    currentPublishedInvoiceLines,
  );
  const previousBilledOrderCount = countDistinctBilledOrders(
    previousPublishedInvoices,
    previousPublishedInvoiceLines,
  );
  const currentSalesOrderCount = currentConfirmedOrders.length;
  const previousSalesOrderCount = filterOrdersByDateAndState(
    filtered.orders,
    previousPeriod,
    'confirmed',
  ).length;
  const quoteSummary: QuoteSummary = {
    totalQuotes: compareMetric(currentQuotes.length, previousQuotes.length),
    quoteAmount: compareMetric(quoteAmountCurrent, quoteAmountPrevious),
    confirmedOrders: compareMetric(
      currentSalesOrderCount,
      previousSalesOrderCount,
    ),
    confirmedAmount: compareMetric(currentInvoicedAmount, previousInvoicedAmount),
    pendingQuotes: pendingQuotes.length,
    expiredQuotes: expiredQuotes.length,
    cancelledQuotes: currentCancelledQuotes.length,
    convertedQuotes: currentConvertedQuotes.length,
    averageConversionDays: compareMetric(
      currentQuoteConversionDays,
      previousQuoteConversionDays,
    ),
    averageQuoteTicket: compareMetric(
      average(currentQuotes.map((order) => orderAmount(order, sanitizedConfig))),
      average(previousQuotes.map((order) => orderAmount(order, sanitizedConfig))),
    ),
    averageConfirmedTicket: compareMetric(
      currentBilledOrderCount > 0 ? currentInvoicedAmount / currentBilledOrderCount : 0,
      previousBilledOrderCount > 0 ? previousInvoicedAmount / previousBilledOrderCount : 0,
    ),
  };
  const currentRefundAmount = sum(
    currentRefundInvoices,
    (invoice) => Math.abs(invoiceAmount(invoice, sanitizedConfig)),
  );
  const previousRefundAmount = sum(
    previousRefundInvoices,
    (invoice) => Math.abs(invoiceAmount(invoice, sanitizedConfig)),
  );
  const currentPublishedInvoiceCount = currentInvoices.length;
  const previousPublishedInvoiceCount = previousInvoices.length;

  const customerLifecycleRows = buildClientLifecycleRows({
    customerFirstPurchases: filtered.customerFirstPurchases,
    allInvoiceLines: postedCustomerMoveLines,
    allInvoices: postedCustomerMoves,
    config: sanitizedConfig,
    currentPeriod,
    previousPeriod,
  });

  const productRows = buildProductRows({
    allLines: postedCustomerMoveLines,
    config: sanitizedConfig,
    currentLines: currentInvoiceLines,
    previousLines: previousInvoiceLines,
  });

  const sellerRows = buildSellerRows({
    allInvoiceLines: postedCustomerMoveLines,
    allInvoices: postedCustomerMoves,
    customerFirstPurchases: filtered.customerFirstPurchases,
    allOrders: filtered.orders,
    config: sanitizedConfig,
    currentPeriod,
    customerLifecycleRows,
    previousPeriod,
    quoteInvoiceIndex,
  });

  const trend = buildTrendPoints({
    config: sanitizedConfig,
    grouping: filters.grouping,
    invoiceLines: currentInvoiceLines,
    invoices: currentInvoices,
    previousYearInvoiceLines: previousYearEquivalentInvoiceLines,
    range: currentPeriod,
  });

  const paretoCustomers = buildParetoSummary({
    dimension: 'customers',
    metric: sanitizedConfig.defaultParetoMetric,
    thresholdA: sanitizedConfig.paretoThresholdA,
    thresholdB: sanitizedConfig.paretoThresholdB,
    rows: buildParetoSourceRowsFromCustomers(customerLifecycleRows),
  });
  const paretoProducts = buildParetoSummary({
    dimension: 'products',
    metric: sanitizedConfig.defaultParetoMetric,
    thresholdA: sanitizedConfig.paretoThresholdA,
    thresholdB: sanitizedConfig.paretoThresholdB,
    rows: buildParetoSourceRowsFromProducts(productRows),
  });
  const paretoSellers = buildParetoSummary({
    dimension: 'sellers',
    metric: sanitizedConfig.defaultParetoMetric,
    thresholdA: sanitizedConfig.paretoThresholdA,
    thresholdB: sanitizedConfig.paretoThresholdB,
    rows: buildParetoSourceRowsFromSellers(sellerRows),
  });

  const customerSummary = buildCustomerSummary(customerLifecycleRows, currentPeriod);
  const previousYearCustomerLifecycleRows = buildClientLifecycleRows({
    customerFirstPurchases: filtered.customerFirstPurchases,
    allInvoiceLines: postedCustomerMoveLines,
    allInvoices: postedCustomerMoves,
    config: sanitizedConfig,
    currentPeriod: previousYearEquivalentPeriod,
    previousPeriod: buildPreviousYearEquivalentRange(previousYearEquivalentPeriod),
  });
  const previousYearCustomerSummary = buildCustomerSummary(
    previousYearCustomerLifecycleRows,
    previousYearEquivalentPeriod,
  );
  const retentionPct = ratio(customerSummary.retainedCustomers, customerSummary.previousCustomers) * 100;
  const reactivationPct = ratio(customerSummary.reactivatedCustomers, customerSummary.previousCustomers) * 100;
  const repurchasePct = ratio(customerSummary.repeatCustomers, customerSummary.currentCustomers) * 100;

  const sales = {
    soldAmount: compareMetric(currentInvoicedAmount, previousInvoicedAmount),
    confirmedOrders: compareMetric(
      currentSalesOrderCount,
      previousSalesOrderCount,
    ),
    averageTicket: compareMetric(
      currentBilledOrderCount > 0 ? currentInvoicedAmount / currentBilledOrderCount : 0,
      previousBilledOrderCount > 0 ? previousInvoicedAmount / previousBilledOrderCount : 0,
    ),
    marginAmount: compareMetric(currentMarginAmount, previousMarginAmount),
    marginPct: compareMetric(currentMarginPct, previousMarginPct),
    newCustomers: compareMetric(
      customerSummary.newCustomers,
      countByStatusAtPeriod(customerLifecycleRows, 'nuevo', previousPeriod.end),
    ),
    retainedCustomersPct: compareMetric(
      retentionPct,
      calculatePreviousRetention(accountingInvoices, previousPeriod),
    ),
    repurchaseRatePct: compareMetric(
      repurchasePct,
      calculatePreviousRepurchase(accountingInvoices, previousPeriod),
    ),
    reactivationRatePct: compareMetric(
      reactivationPct,
      calculatePreviousReactivation(customerLifecycleRows, previousPeriod.end),
    ),
  };

  const invoicing = {
    invoicedAmount: compareMetric(currentInvoicedAmount, previousInvoicedAmount),
    invoiceCount: compareMetric(currentPublishedInvoiceCount, previousPublishedInvoiceCount),
    refundAmount: compareMetric(currentRefundAmount, previousRefundAmount),
    collectedSignal:
      'El módulo no calcula cobro conciliado real todavía. payment_state se expone solo como señal complementaria.',
  };

  const annualGrowth = buildAnnualGrowthSnapshot({
    allInvoiceLines: postedCustomerMoveLines,
    customerFirstPurchases: filtered.customerFirstPurchases,
    config: sanitizedConfig,
    currentPeriod,
    previousPeriod,
    currentYearToDatePeriod,
    previousYearToDatePeriod,
    currentYearToDateInvoiceLines,
    previousYearToDateInvoiceLines,
  });

  const summaryMetrics = buildSummaryMetrics({
    invoicing,
    overallConversion,
    quoteSummary,
    sales,
  });

  const hallazgos = buildHallazgos({
    currentPeriod,
    customerLifecycleRows,
    invoicing,
    overallConversion,
    productRows,
    quoteSummary,
    sales,
    sellerRows,
  });

  const details: DashboardDetails = {
    pendingQuotes,
    expiredQuotes,
    cancelledQuotes: currentCancelledQuotes,
    convertedQuotes: currentConvertedQuotes,
    confirmedOrders: currentConfirmedOrders.slice(0, 50),
    postedInvoices: currentInvoices.slice(0, 50),
    atRiskClients: customerLifecycleRows.filter((row) => row.currentStatus === 'en_riesgo'),
    dormantClients: customerLifecycleRows.filter((row) => row.currentStatus === 'dormido'),
    lostClients: customerLifecycleRows.filter((row) => row.currentStatus === 'perdido'),
    reactivatedClients: customerLifecycleRows.filter((row) => row.isReactivated),
    negativeMarginProducts: productRows
      .filter((row) => (row.marginPct ?? 0) < 0)
      .sort((a, b) => a.margin - b.margin),
    lowConversionSellers: sellerRows
      .filter((row) => row.quotes >= 5 && row.conversionPct < 50)
      .sort((a, b) => a.conversionPct - b.conversionPct),
  };

  const sellerMinOrderThreshold = getSignificantSellerOrderThreshold(sellerRows);
  const significantSellerRows = filterSignificantSellerRows(sellerRows, sellerMinOrderThreshold);
  const sellerCategoryBreakdown = buildSellerCategoryBreakdown({
    lines: currentInvoiceLines,
    config: sanitizedConfig,
  });
  const sellerTimelines = buildSellerTimelineSummaries({
    allInvoices: accountingInvoices,
    config: sanitizedConfig,
    customerFirstPurchases: filtered.customerFirstPurchases,
    endDate: currentPeriod.end,
    goals: sanitizedConfig.sellerGoals,
    sellerRows: significantSellerRows,
  });
  const sellerGoalProgress = buildSellerGoalProgress({
    goals: sanitizedConfig.sellerGoals,
    sellerRows: significantSellerRows,
  });
  const agentProfile =
    dataset.scopeApplied === 'own' && dataset.viewerRole === 'sales_agent'
      ? buildAgentPerformanceProfile({
          companyName: dataset.companyScope?.label ?? 'Compañía asignada',
          currentCustomerRows: customerLifecycleRows,
          currentCustomerSummary: customerSummary,
          currentInvoiceLines,
          currentInvoices,
          currentPeriod,
          currentPublishedInvoiceLines,
          currentPublishedInvoices,
          currentQuotes,
          currentSalesOrders: currentConfirmedOrders,
          currentRefundInvoices,
          currentConvertedQuotes,
          previousCustomerRows: previousYearCustomerLifecycleRows,
          previousCustomerSummary: previousYearCustomerSummary,
          previousInvoiceLines: previousYearEquivalentInvoiceLines,
          previousInvoices: previousYearEquivalentInvoices,
          previousPeriod: previousYearEquivalentPeriod,
          previousPublishedInvoiceLines: previousYearEquivalentPublishedInvoiceLines,
          previousPublishedInvoices: previousYearEquivalentPublishedInvoices,
          previousQuotes: previousYearEquivalentQuotes,
          previousSalesOrders: previousYearEquivalentConfirmedOrders,
          previousRefundInvoices: previousYearEquivalentRefundInvoices,
          previousConvertedQuotes: previousYearEquivalentConvertedQuotes,
          sellerName:
            dataset.sellerScope?.label ??
            sellerRows[0]?.sellerName ??
            'Vendedor asociado',
          config: sanitizedConfig,
          quoteInvoiceIndex,
        })
      : null;

  return {
    generatedAt: dataset.fetchedAt,
    filters,
    config: sanitizedConfig,
    summaryMetrics,
    annualGrowth,
    agentProfile,
    quoteSummary,
    conversion: {
      overall: overallConversion,
      bySeller: buildConversionRows(currentQuotes, currentConfirmedOrders, 'sellerName', currentPeriod.end, quoteInvoiceIndex),
      byCustomer: buildConversionRows(currentQuotes, currentConfirmedOrders, 'customerName', currentPeriod.end, quoteInvoiceIndex),
      byTeam: buildConversionRows(currentQuotes, currentConfirmedOrders, 'teamName', currentPeriod.end, quoteInvoiceIndex),
      byMonth: buildConversionRows(currentQuotes, currentConfirmedOrders, 'quotationMonth', currentPeriod.end, quoteInvoiceIndex),
      byRange: buildConversionRows(currentQuotes, currentConfirmedOrders, 'amountRange', currentPeriod.end, quoteInvoiceIndex),
      byProduct: buildConversionByProduct(
        currentQuotes,
        currentConfirmedOrders,
        filtered.orderLines,
        currentPeriod.end,
        quoteInvoiceIndex,
      ),
    },
    invoicing,
    sales,
    trend,
    pareto: {
      customers: paretoCustomers,
      products: paretoProducts,
      sellers: paretoSellers,
    },
    clientLifecycle: {
      summary: {
        newCustomers: customerSummary.newCustomers,
        activeCustomers: customerSummary.activeCustomers,
        atRiskCustomers: customerSummary.atRiskCustomers,
        dormantCustomers: customerSummary.dormantCustomers,
        lostCustomers: customerSummary.lostCustomers,
        reactivatedCustomers: customerSummary.reactivatedCustomers,
        valueAtRisk: customerSummary.valueAtRisk,
        retentionPct,
        reactivationPct,
        churnRiskPct: ratio(
          customerSummary.atRiskCustomers + customerSummary.lostCustomers,
          Math.max(customerSummary.currentCustomers, 1),
        ) * 100,
      },
      rows: customerLifecycleRows,
      rfmSegments: summarizeRfmSegments(customerLifecycleRows),
    },
    products: {
      topByRevenue: productRows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 12),
      topByUnits: productRows.slice().sort((a, b) => b.units - a.units).slice(0, 12),
      topByMargin: productRows.slice().sort((a, b) => b.margin - a.margin).slice(0, 12),
      negativeMargin: productRows.filter((row) => (row.marginPct ?? 0) < 0).slice(0, 12),
      withoutSales: productRows.filter((row) => row.revenue === 0).slice(0, 12),
      highRevenueLowMargin: productRows
        .filter((row) => row.revenue > 0 && (row.marginPct ?? 0) < median(productRows.map((item) => item.marginPct ?? 0)))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 12),
      matrix: countProductQuadrants(productRows),
    },
    sellers: {
      rankingByRevenue: significantSellerRows.slice().sort((a, b) => b.invoicedAmount - a.invoicedAmount),
      rankingByMargin: significantSellerRows.slice().sort((a, b) => b.margin - a.margin),
      rankingByConversion: significantSellerRows.slice().sort((a, b) => b.conversionPct - a.conversionPct),
      rankingByNewCustomers: significantSellerRows.slice().sort((a, b) => b.newCustomers - a.newCustomers),
      rankingByAtRiskCustomers: significantSellerRows.slice().sort((a, b) => b.atRiskCustomers - a.atRiskCustomers),
      rankingByReactivatedCustomers: significantSellerRows.slice().sort((a, b) => b.reactivatedCustomers - a.reactivatedCustomers),
      rankingByAverageTicket: significantSellerRows.slice().sort((a, b) => b.averageTicket - a.averageTicket),
      weightedRanking: significantSellerRows.slice().sort((a, b) => b.weightedScore - a.weightedScore),
      categoryBreakdown: sellerCategoryBreakdown,
      goalProgress: sellerGoalProgress,
      timelines: sellerTimelines,
      minOrderThreshold: sellerMinOrderThreshold,
    },
    hallazgos,
    dataQualityAlerts: dataset.dataQualityAlerts,
    details,
  };
}

function buildYearToDateRange(referenceEnd: Date): PeriodRange {
  return {
    start: new Date(Date.UTC(referenceEnd.getUTCFullYear(), 0, 1)),
    end: new Date(referenceEnd),
  };
}

function buildPreviousYearToDateRange(referenceEnd: Date): PeriodRange {
  return {
    start: new Date(Date.UTC(referenceEnd.getUTCFullYear() - 1, 0, 1)),
    end: new Date(
      Date.UTC(
        referenceEnd.getUTCFullYear() - 1,
        referenceEnd.getUTCMonth(),
        referenceEnd.getUTCDate(),
      ),
    ),
  };
}

function buildPreviousYearEquivalentRange(current: PeriodRange): PeriodRange {
  return {
    start: shiftUtcDateByYears(current.start, -1, false),
    end: shiftUtcDateByYears(current.end, -1, true),
  };
}

function shiftUtcDateByYears(value: Date, years: number, endOfDay: boolean) {
  const targetYear = value.getUTCFullYear() + years;
  const targetMonth = value.getUTCMonth();
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(value.getUTCDate(), lastDayOfTargetMonth);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );
}

function countPositiveMetrics(metrics: MetricComparison[]) {
  return metrics.filter((metric) => metric.current > metric.previous).length;
}

function countNewCustomersInRange(
  customerFirstPurchases: OdooCustomerFirstPurchaseRecord[],
  range: PeriodRange,
) {
  return customerFirstPurchases.filter((record) => {
    const invoiceDate = parseRecordDate(record.invoiceDate);
    return invoiceDate !== null && isDateInRange(invoiceDate, range);
  }).length;
}

function formatYearToDateLabel(range: PeriodRange) {
  return `${formatDateLabel(range.start)} - ${formatDateLabel(range.end)}`;
}

function buildAgentPerformanceProfile({
  companyName,
  config,
  currentConvertedQuotes,
  currentCustomerRows,
  currentCustomerSummary,
  currentInvoiceLines,
  currentInvoices,
  currentPeriod,
  currentPublishedInvoiceLines,
  currentPublishedInvoices,
  currentQuotes,
  currentSalesOrders,
  currentRefundInvoices,
  previousConvertedQuotes,
  previousCustomerRows,
  previousCustomerSummary,
  previousInvoiceLines,
  previousInvoices,
  previousPeriod,
  previousPublishedInvoiceLines,
  previousPublishedInvoices,
  previousQuotes,
  previousSalesOrders,
  previousRefundInvoices,
  quoteInvoiceIndex,
  sellerName,
}: {
  companyName: string;
  config: ReportsConfig;
  currentConvertedQuotes: OdooOrderRecord[];
  currentCustomerRows: ClientLifecycleRow[];
  currentCustomerSummary: ReturnType<typeof buildCustomerSummary>;
  currentInvoiceLines: OdooInvoiceLineRecord[];
  currentInvoices: OdooInvoiceRecord[];
  currentPeriod: PeriodRange;
  currentPublishedInvoiceLines: OdooInvoiceLineRecord[];
  currentPublishedInvoices: OdooInvoiceRecord[];
  currentQuotes: OdooOrderRecord[];
  currentSalesOrders: OdooOrderRecord[];
  currentRefundInvoices: OdooInvoiceRecord[];
  previousConvertedQuotes: OdooOrderRecord[];
  previousCustomerRows: ClientLifecycleRow[];
  previousCustomerSummary: ReturnType<typeof buildCustomerSummary>;
  previousInvoiceLines: OdooInvoiceLineRecord[];
  previousInvoices: OdooInvoiceRecord[];
  previousPeriod: PeriodRange;
  previousPublishedInvoiceLines: OdooInvoiceLineRecord[];
  previousPublishedInvoices: OdooInvoiceRecord[];
  previousQuotes: OdooOrderRecord[];
  previousSalesOrders: OdooOrderRecord[];
  previousRefundInvoices: OdooInvoiceRecord[];
  quoteInvoiceIndex: ReturnType<typeof buildQuoteInvoiceIndex>;
  sellerName: string;
}): AgentPerformanceProfile {
  const currentRevenue = sum(currentInvoices, (invoice) => invoiceAmount(invoice, config));
  const previousRevenue = sum(previousInvoices, (invoice) => invoiceAmount(invoice, config));
  const currentBilledOrders = countDistinctBilledOrders(
    currentPublishedInvoices,
    currentPublishedInvoiceLines,
  );
  const previousBilledOrders = countDistinctBilledOrders(
    previousPublishedInvoices,
    previousPublishedInvoiceLines,
  );
  const currentSalesOrderCount = currentSalesOrders.length;
  const previousSalesOrderCount = previousSalesOrders.length;
  const currentRefunds = sum(currentRefundInvoices, (invoice) =>
    Math.abs(invoiceAmount(invoice, config)),
  );
  const previousRefunds = sum(previousRefundInvoices, (invoice) =>
    Math.abs(invoiceAmount(invoice, config)),
  );
  const currentConversion = calculateConversionPct(currentQuotes, currentSalesOrders);
  const previousConversion = calculateConversionPct(previousQuotes, previousSalesOrders);
  const currentConversionDays = average(
    currentConvertedQuotes
      .map((order) => getInvoiceConversionDays(order, quoteInvoiceIndex))
      .filter((value): value is number => value !== null),
  );
  const previousConversionDays = average(
    previousConvertedQuotes
      .map((order) => getInvoiceConversionDays(order, quoteInvoiceIndex))
      .filter((value): value is number => value !== null),
  );
  const currentExpiredQuotes = currentQuotes.filter((order) =>
    isExpiredQuote(order, currentPeriod.end),
  ).length;
  const previousExpiredQuotes = previousQuotes.filter((order) =>
    isExpiredQuote(order, previousPeriod.end),
  ).length;

  const clientRows = buildAgentDimensionRows({
    currentRows: currentInvoices,
    previousRows: previousInvoices,
    key: (invoice) => buildCustomerKey(invoice.customerId, invoice.customerName),
    label: (invoice) => invoice.customerName,
    value: (invoice) => invoiceAmount(invoice, config),
  });
  const productRows = buildAgentDimensionRows({
    currentRows: currentInvoiceLines,
    previousRows: previousInvoiceLines,
    key: (line) => buildProductKey(line.productId, line.productName),
    label: (line) => line.productName,
    value: (line) => line.untaxedAmount,
  });
  const categoryRows = buildAgentDimensionRows({
    currentRows: currentInvoiceLines,
    previousRows: previousInvoiceLines,
    key: (line) =>
      `category:${line.categoryId ?? normalizeDimensionText(line.categoryName ?? 'Sin categoría')}`,
    label: (line) => line.categoryName ?? 'Sin categoría',
    value: (line) => line.untaxedAmount,
  });
  const currentConversionRows = buildConversionRows(
    currentQuotes,
    currentSalesOrders,
    'customerName',
    currentPeriod.end,
    quoteInvoiceIndex,
  );
  const previousConversionRows = buildConversionRows(
    previousQuotes,
    previousSalesOrders,
    'customerName',
    previousPeriod.end,
    quoteInvoiceIndex,
  );
  const conversionRows = buildAgentDimensionRows({
    currentRows: currentConversionRows,
    previousRows: previousConversionRows,
    key: (row) => row.key,
    label: (row) => row.label,
    value: (row) => row.conversionPct,
  });

  const currentRetention =
    ratio(currentCustomerSummary.retainedCustomers, currentCustomerSummary.previousCustomers) * 100;
  const previousRetention =
    ratio(previousCustomerSummary.retainedCustomers, previousCustomerSummary.previousCustomers) * 100;
  const currentRepurchase =
    ratio(currentCustomerSummary.repeatCustomers, currentCustomerSummary.currentCustomers) * 100;
  const previousRepurchase =
    ratio(previousCustomerSummary.repeatCustomers, previousCustomerSummary.currentCustomers) * 100;
  const currentAtRiskValue = sum(
    currentCustomerRows.filter((row) => row.currentStatus === 'en_riesgo'),
    (row) => row.revenue,
  );
  const previousAtRiskValue = sum(
    previousCustomerRows.filter((row) => row.currentStatus === 'en_riesgo'),
    (row) => row.revenue,
  );

  const summaryMetrics = [
    agentMetric('quotes', 'Cotizaciones', currentQuotes.length, previousQuotes.length, 'number', false),
    agentMetric('revenue', 'Total sin impuestos', currentRevenue, previousRevenue, 'currency', false),
    agentMetric(
      'billed_orders',
      'Órdenes de venta',
      currentSalesOrderCount,
      previousSalesOrderCount,
      'number',
      false,
    ),
    agentMetric(
      'average_ticket',
      'Ticket promedio',
      currentBilledOrders ? currentRevenue / currentBilledOrders : 0,
      previousBilledOrders ? previousRevenue / previousBilledOrders : 0,
      'currency',
      false,
    ),
    agentMetric('conversion', 'Conversión comercial', currentConversion, previousConversion, 'percent', false),
    agentMetric(
      'invoice_count',
      'Facturas publicadas',
      currentInvoices.length,
      previousInvoices.length,
      'number',
      false,
    ),
    agentMetric(
      'new_customers',
      'Clientes nuevos',
      currentCustomerSummary.newCustomers,
      previousCustomerSummary.newCustomers,
      'number',
      false,
    ),
    agentMetric('refunds', 'Notas de crédito', currentRefunds, previousRefunds, 'currency', true),
  ];
  const conversionMetrics = [
    agentMetric('quotes', 'Cotizaciones', currentQuotes.length, previousQuotes.length, 'number', false),
    agentMetric(
      'converted_quotes',
      'Cotizaciones convertidas',
      currentConvertedQuotes.length,
      previousConvertedQuotes.length,
      'number',
      false,
    ),
    agentMetric('conversion_rate', 'Conversión', currentConversion, previousConversion, 'percent', false),
    agentMetric(
      'conversion_days',
      'Días para convertir',
      currentConversionDays,
      previousConversionDays,
      'days',
      true,
    ),
    agentMetric(
      'expired_quotes',
      'Cotizaciones vencidas',
      currentExpiredQuotes,
      previousExpiredQuotes,
      'number',
      true,
    ),
  ];
  const clientMetrics = [
    agentMetric(
      'new_customers',
      'Clientes nuevos',
      currentCustomerSummary.newCustomers,
      previousCustomerSummary.newCustomers,
      'number',
      false,
    ),
    agentMetric(
      'active_customers',
      'Clientes activos',
      currentCustomerSummary.activeCustomers,
      previousCustomerSummary.activeCustomers,
      'number',
      false,
    ),
    agentMetric(
      'at_risk_customers',
      'Clientes en riesgo',
      currentCustomerSummary.atRiskCustomers,
      previousCustomerSummary.atRiskCustomers,
      'number',
      true,
    ),
    agentMetric(
      'reactivated_customers',
      'Clientes reactivados',
      currentCustomerSummary.reactivatedCustomers,
      previousCustomerSummary.reactivatedCustomers,
      'number',
      false,
    ),
    agentMetric('retention', 'Retención', currentRetention, previousRetention, 'percent', false),
    agentMetric('repurchase', 'Recompra', currentRepurchase, previousRepurchase, 'percent', false),
    agentMetric(
      'at_risk_value',
      'Valor de cartera en riesgo',
      currentAtRiskValue,
      previousAtRiskValue,
      'currency',
      true,
    ),
  ];
  const currentUnits = sum(currentInvoiceLines, (line) => line.quantity);
  const previousUnits = sum(previousInvoiceLines, (line) => line.quantity);
  const currentActiveProducts = productRows.filter((row) => row.current !== 0).length;
  const previousActiveProducts = productRows.filter((row) => row.previous !== 0).length;
  const productMetrics = [
    agentMetric('product_revenue', 'Facturación por productos', currentRevenue, previousRevenue, 'currency', false),
    agentMetric('units', 'Unidades facturadas', currentUnits, previousUnits, 'number', false),
    agentMetric(
      'active_products',
      'Productos con venta',
      currentActiveProducts,
      previousActiveProducts,
      'number',
      false,
    ),
    agentMetric(
      'average_product_revenue',
      'Promedio por producto',
      currentActiveProducts ? currentRevenue / currentActiveProducts : 0,
      previousActiveProducts ? previousRevenue / previousActiveProducts : 0,
      'currency',
      false,
    ),
  ];
  const salesMetrics = [
    agentMetric('sales_revenue', 'Total sin impuestos', currentRevenue, previousRevenue, 'currency', false),
    agentMetric(
      'invoice_count',
      'Facturas publicadas',
      currentInvoices.length,
      previousInvoices.length,
      'number',
      false,
    ),
    agentMetric(
      'sales_orders',
      'Órdenes de venta',
      currentSalesOrderCount,
      previousSalesOrderCount,
      'number',
      false,
    ),
    agentMetric(
      'sales_ticket',
      'Ticket promedio',
      currentBilledOrders ? currentRevenue / currentBilledOrders : 0,
      previousBilledOrders ? previousRevenue / previousBilledOrders : 0,
      'currency',
      false,
    ),
    agentMetric('sales_refunds', 'Notas de crédito', currentRefunds, previousRefunds, 'currency', true),
  ];
  const customerTopFiveCurrent = topDimensionShare(clientRows, 'current', 5);
  const customerTopFivePrevious = topDimensionShare(clientRows, 'previous', 5);
  const productTopFiveCurrent = topDimensionShare(productRows, 'current', 5);
  const productTopFivePrevious = topDimensionShare(productRows, 'previous', 5);
  const paretoMetrics = [
    agentMetric(
      'customer_concentration',
      'Concentración en 5 clientes',
      customerTopFiveCurrent,
      customerTopFivePrevious,
      'percent',
      true,
    ),
    agentMetric(
      'product_concentration',
      'Concentración en 5 productos',
      productTopFiveCurrent,
      productTopFivePrevious,
      'percent',
      true,
    ),
    agentMetric(
      'active_clients',
      'Clientes con facturación',
      clientRows.filter((row) => row.current !== 0).length,
      clientRows.filter((row) => row.previous !== 0).length,
      'number',
      false,
    ),
    agentMetric(
      'pareto_products',
      'Productos con facturación',
      currentActiveProducts,
      previousActiveProducts,
      'number',
      false,
    ),
  ];
  const paretoRows = [
    ...clientRows.slice(0, 5).map((row) => ({ ...row, key: `client:${row.key}`, label: `Cliente · ${row.label}` })),
    ...productRows.slice(0, 5).map((row) => ({ ...row, key: `product:${row.key}`, label: `Producto · ${row.label}` })),
  ].sort((left, right) => Math.abs(right.current) - Math.abs(left.current));

  return {
    sellerName,
    companyName,
    currentPeriodLabel: formatYearToDateLabel(currentPeriod),
    previousYearPeriodLabel: formatYearToDateLabel(previousPeriod),
    comparisonContext: describeAgentComparisonContext(currentPeriod),
    summary: buildAgentYearSection('resumen', summaryMetrics, clientRows, 'cliente'),
    conversion: buildAgentYearSection(
      'conversión',
      conversionMetrics,
      conversionRows,
      'cliente',
      'percent',
    ),
    clients: buildAgentYearSection('clientes', clientMetrics, clientRows, 'cliente'),
    products: buildAgentYearSection('productos', productMetrics, productRows, 'producto'),
    sales: buildAgentYearSection('ventas', salesMetrics, categoryRows, 'categoría'),
    pareto: buildAgentYearSection('pareto', paretoMetrics, paretoRows, 'elemento'),
  };
}

function agentMetric(
  id: string,
  label: string,
  current: number,
  previous: number,
  format: AgentMetricFormat,
  lowerIsBetter: boolean | null,
): AgentYearMetric {
  return {
    id,
    label,
    comparison: compareMetric(current, previous),
    format,
    lowerIsBetter,
  };
}

function buildAgentDimensionRows<T>({
  currentRows,
  previousRows,
  key,
  label,
  value,
}: {
  currentRows: T[];
  previousRows: T[];
  key: (row: T) => string;
  label: (row: T) => string;
  value: (row: T) => number;
}): AgentYearDimensionRow[] {
  const buckets = new Map<string, { key: string; label: string; current: number; previous: number }>();
  const addRows = (rows: T[], side: 'current' | 'previous') => {
    rows.forEach((row) => {
      const rowKey = key(row);
      const bucket = buckets.get(rowKey) ?? {
        key: rowKey,
        label: label(row),
        current: 0,
        previous: 0,
      };
      bucket[side] += value(row);
      if (!bucket.label) bucket.label = label(row);
      buckets.set(rowKey, bucket);
    });
  };
  addRows(currentRows, 'current');
  addRows(previousRows, 'previous');

  const currentTotal = sum([...buckets.values()], (row) => Math.abs(row.current));
  const previousTotal = sum([...buckets.values()], (row) => Math.abs(row.previous));
  return [...buckets.values()]
    .map((row) => {
      const comparison = compareMetric(row.current, row.previous);
      return {
        ...row,
        difference: comparison.difference,
        differencePct: comparison.differencePct,
        currentSharePct: ratio(Math.abs(row.current), currentTotal) * 100,
        previousSharePct: ratio(Math.abs(row.previous), previousTotal) * 100,
      };
    })
    .sort((left, right) => {
      const currentDifference = Math.abs(right.current) - Math.abs(left.current);
      return currentDifference || Math.abs(right.previous) - Math.abs(left.previous);
    });
}

function buildAgentYearSection(
  sectionId: string,
  metrics: AgentYearMetric[],
  rows: AgentYearDimensionRow[],
  rowSubject: string,
  rowValueFormat: AgentMetricFormat = 'currency',
): AgentYearSection {
  const metricSignals = metrics
    .filter((metric) => metric.lowerIsBetter !== null)
    .map((metric) => {
      const difference = metric.comparison.difference;
      const favorable =
        metric.lowerIsBetter === true ? difference < 0 : difference > 0;
      return { metric, favorable };
    })
    .filter(({ metric }) => metric.comparison.difference !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.metric.comparison.differencePct ?? 0) -
        Math.abs(left.metric.comparison.differencePct ?? 0),
    );
  const positiveRows = rows
    .filter((row) => row.difference > 0)
    .sort((left, right) => right.difference - left.difference);
  const decliningRows = rows
    .filter((row) => row.difference < 0)
    .sort((left, right) => left.difference - right.difference);

  const positives: AgentPerformanceInsight[] = metricSignals
    .filter((signal) => signal.favorable)
    .slice(0, 2)
    .map(({ metric }) => ({
      id: `${sectionId}:positive:${metric.id}`,
      tone: 'positive',
      title: `${metric.label} mejoró`,
      detail: describeAgentMetricChange(metric),
    }));
  const attention: AgentPerformanceInsight[] = metricSignals
    .filter((signal) => !signal.favorable)
    .slice(0, 2)
    .map(({ metric }) => ({
      id: `${sectionId}:attention:${metric.id}`,
      tone: 'attention',
      title: `${metric.label} requiere atención`,
      detail: describeAgentMetricChange(metric),
    }));

  if (positiveRows[0]) {
    positives.push({
      id: `${sectionId}:positive-row:${positiveRows[0].key}`,
      tone: 'positive',
      title: `Mayor avance por ${rowSubject}`,
      detail: `${positiveRows[0].label}: ${formatAgentMetricValue(positiveRows[0].current, rowValueFormat)} frente a ${formatAgentMetricValue(positiveRows[0].previous, rowValueFormat)}.`,
    });
  }
  if (decliningRows[0]) {
    attention.push({
      id: `${sectionId}:attention-row:${decliningRows[0].key}`,
      tone: 'attention',
      title: `Mayor retroceso por ${rowSubject}`,
      detail: `${decliningRows[0].label}: ${formatAgentMetricValue(decliningRows[0].current, rowValueFormat)} frente a ${formatAgentMetricValue(decliningRows[0].previous, rowValueFormat)}.`,
    });
  }
  if (!positives.length) {
    positives.push({
      id: `${sectionId}:positive:none`,
      tone: 'neutral',
      title: 'Sin avances confirmados',
      detail: 'No hay una mejora medible frente al mismo periodo del año anterior.',
    });
  }
  if (!attention.length) {
    attention.push({
      id: `${sectionId}:attention:none`,
      tone: 'neutral',
      title: 'Sin deterioros relevantes',
      detail: 'Los indicadores comparables no muestran retrocesos frente al año anterior.',
    });
  }

  return {
    metrics,
    rows,
    positives: positives.slice(0, 3),
    attention: attention.slice(0, 3),
  };
}

function describeAgentMetricChange(metric: AgentYearMetric) {
  const change = metric.comparison.differencePct;
  const changeLabel =
    change === null
      ? 'sin una base comparable'
      : `${Math.abs(change).toFixed(1)}% ${change >= 0 ? 'por encima' : 'por debajo'}`;
  return `${formatAgentMetricValue(metric.comparison.current, metric.format)} actual, ${changeLabel} de ${formatAgentMetricValue(metric.comparison.previous, metric.format)}.`;
}

function formatAgentMetricValue(value: number, format: AgentMetricFormat) {
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percent') return formatPercent(value);
  if (format === 'days') return `${value.toFixed(1)} días`;
  return formatNumber(value);
}

function topDimensionShare(
  rows: AgentYearDimensionRow[],
  side: 'current' | 'previous',
  limit: number,
) {
  const shareKey = side === 'current' ? 'currentSharePct' : 'previousSharePct';
  return rows
    .slice()
    .sort((left, right) => Math.abs(right[side]) - Math.abs(left[side]))
    .slice(0, limit)
    .reduce((total, row) => total + row[shareKey], 0);
}

function describeAgentComparisonContext(range: PeriodRange) {
  const durationDays = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1;
  if (durationDays === 1) return 'Mismo día del año anterior';
  const isFullMonth =
    range.start.getUTCDate() === 1 &&
    range.end.getUTCDate() ===
      new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth() + 1, 0)).getUTCDate() &&
    range.start.getUTCMonth() === range.end.getUTCMonth();
  if (isFullMonth) return 'Mismo mes del año anterior';
  const isFullQuarter =
    range.start.getUTCDate() === 1 &&
    range.start.getUTCMonth() % 3 === 0 &&
    range.end.getUTCMonth() === range.start.getUTCMonth() + 2 &&
    range.end.getUTCDate() ===
      new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth() + 1, 0)).getUTCDate();
  if (isFullQuarter) return 'Mismo trimestre del año anterior';
  const isFullYear =
    range.start.getUTCMonth() === 0 &&
    range.start.getUTCDate() === 1 &&
    range.end.getUTCMonth() === 11 &&
    range.end.getUTCDate() === 31;
  if (isFullYear) return 'Mismo año calendario anterior';
  return 'Mismo rango de fechas del año anterior';
}

function buildSellerGoalProgress({
  goals,
  sellerRows,
}: {
  goals: SellerGoalConfig[];
  sellerRows: SellerPerformanceRow[];
}): SellerGoalProgressRow[] {
  return sellerRows
    .map((row) => {
      const goal = findSellerGoal(goals, row.sellerId, row.sellerName);

      return {
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        salesTarget: goal?.salesTarget ?? 0,
        newCustomersTarget: goal?.newCustomersTarget ?? 0,
        reactivatedCustomersTarget: goal?.reactivatedCustomersTarget ?? 0,
        soldAmount: row.invoicedAmount,
        newCustomers: row.newCustomers,
        reactivatedCustomers: row.reactivatedCustomers,
        salesProgressPct: goal?.salesTarget ? ratio(row.invoicedAmount, goal.salesTarget) * 100 : 0,
        newCustomersProgressPct: goal?.newCustomersTarget
          ? ratio(row.newCustomers, goal.newCustomersTarget) * 100
          : 0,
        reactivatedCustomersProgressPct: goal?.reactivatedCustomersTarget
          ? ratio(row.reactivatedCustomers, goal.reactivatedCustomersTarget) * 100
          : 0,
      } satisfies SellerGoalProgressRow;
    })
    .sort((a, b) => b.soldAmount - a.soldAmount);
}

function buildSellerTimelineSummaries({
  allInvoices,
  config,
  customerFirstPurchases,
  endDate,
  goals,
  sellerRows,
}: {
  allInvoices: OdooInvoiceRecord[];
  config: ReportsConfig;
  customerFirstPurchases: OdooCustomerFirstPurchaseRecord[];
  endDate: Date;
  goals: SellerGoalConfig[];
  sellerRows: SellerPerformanceRow[];
}): SellerTimelineSummary[] {
  const currentYear = endDate.getUTCFullYear();
  const monthRanges = Array.from({ length: endDate.getUTCMonth() + 1 }, (_, index) => {
    const start = new Date(Date.UTC(currentYear, index, 1));
    const end = new Date(Date.UTC(currentYear, index + 1, 0));
    const previousStart = new Date(Date.UTC(currentYear - 1, index, 1));
    const previousEnd = new Date(Date.UTC(currentYear - 1, index + 1, 0));
    return { start, end, previousStart, previousEnd };
  });

  const firstPurchaseByCustomer = new Map<string, OdooCustomerFirstPurchaseRecord>();
  const reactivationEvents = collectSellerReactivationEvents(allInvoices, config);

  customerFirstPurchases
    .filter((record) => {
      const invoiceDate = parseRecordDate(record.invoiceDate);
      return (
        invoiceDate !== null &&
        invoiceDate >= new Date(Date.UTC(currentYear - 1, 0, 1)) &&
        invoiceDate <= endDate
      );
    })
    .forEach((record) => {
      firstPurchaseByCustomer.set(
        buildCustomerKey(record.customerId, record.customerName),
        record,
      );
    });

  return sellerRows.map((seller) => {
    const sellerInvoices = allInvoices.filter(
      (invoice) =>
        buildSellerKey(invoice.sellerId, invoice.sellerName) ===
        buildSellerKey(seller.sellerId, seller.sellerName),
    );
    const months = monthRanges.map((range) => {
      const currentOrders = sellerInvoices.filter((invoice) => {
        const invoiceDate = parseRecordDate(invoice.invoiceDate);
        return invoiceDate ? isDateInRange(invoiceDate, { start: range.start, end: range.end }) : false;
      });
      const previousOrders = sellerInvoices.filter((invoice) => {
        const invoiceDate = parseRecordDate(invoice.invoiceDate);
        return invoiceDate
          ? isDateInRange(invoiceDate, { start: range.previousStart, end: range.previousEnd })
          : false;
      });

      const currentNewCustomers = countSellerNewCustomersForRange(
        seller,
        { start: range.start, end: range.end },
        firstPurchaseByCustomer,
      );
      const previousNewCustomers = countSellerNewCustomersForRange(
        seller,
        { start: range.previousStart, end: range.previousEnd },
        firstPurchaseByCustomer,
      );
      const currentReactivatedCustomers = countSellerReactivationEventsForRange(
        seller,
        { start: range.start, end: range.end },
        reactivationEvents,
      );
      const previousReactivatedCustomers = countSellerReactivationEventsForRange(
        seller,
        { start: range.previousStart, end: range.previousEnd },
        reactivationEvents,
      );

      return {
        monthKey: formatMonthKey(range.start),
        label: formatMonthLabel(range.start),
        soldAmount: sum(currentOrders, (invoice) => invoiceAmount(invoice, config)),
        previousSoldAmount: sum(previousOrders, (invoice) => invoiceAmount(invoice, config)),
        newCustomers: currentNewCustomers,
        previousNewCustomers,
        reactivatedCustomers: currentReactivatedCustomers,
        previousReactivatedCustomers,
      } satisfies SellerTimelineMonthRow;
    });

    const currentSold = months.reduce((sum, month) => sum + month.soldAmount, 0);
    const previousSold = months.reduce((sum, month) => sum + month.previousSoldAmount, 0);
    const currentNew = months.reduce((sum, month) => sum + month.newCustomers, 0);
    const previousNew = months.reduce((sum, month) => sum + month.previousNewCustomers, 0);
    const currentReactivated = months.reduce((sum, month) => sum + month.reactivatedCustomers, 0);
    const previousReactivated = months.reduce((sum, month) => sum + month.previousReactivatedCustomers, 0);

    return {
      sellerId: seller.sellerId,
      sellerName: seller.sellerName,
      soldAmount: compareMetric(currentSold, previousSold),
      newCustomers: compareMetric(currentNew, previousNew),
      reactivatedCustomers: compareMetric(currentReactivated, previousReactivated),
      goal: findSellerGoal(goals, seller.sellerId, seller.sellerName),
      months,
    } satisfies SellerTimelineSummary;
  });
}

function collectSellerReactivationEvents(allInvoices: OdooInvoiceRecord[], config: ReportsConfig) {
  const events = new Map<string, Set<string>>();
  const invoicesByCustomer = groupBy(
    allInvoices,
    (invoice) => buildCustomerKey(invoice.customerId, invoice.customerName),
  );

  invoicesByCustomer.forEach((customerInvoices) => {
    const ordered = customerInvoices
      .map((invoice) => ({ invoice, date: parseRecordDate(invoice.invoiceDate) }))
      .filter((row): row is { invoice: OdooInvoiceRecord; date: Date } => row.date !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (diffDays(previous.date, current.date) < config.clientDormantDays) continue;
      const sellerKey = buildSellerKey(current.invoice.sellerId, current.invoice.sellerName);
      const monthKey = formatMonthKey(current.date);
      const bucket = events.get(sellerKey) ?? new Set<string>();
      bucket.add(
        `${monthKey}:${buildCustomerKey(current.invoice.customerId, current.invoice.customerName)}`,
      );
      events.set(sellerKey, bucket);
    }
  });

  return events;
}

function countSellerNewCustomersForRange(
  seller: Pick<SellerPerformanceRow, 'sellerId' | 'sellerName'>,
  range: PeriodRange,
  firstPurchaseByCustomer: Map<string, OdooCustomerFirstPurchaseRecord>,
) {
  return [...firstPurchaseByCustomer.values()].filter((invoice) => {
    if (
      buildSellerKey(invoice.sellerId, invoice.sellerName) !==
      buildSellerKey(seller.sellerId, seller.sellerName)
    ) {
      return false;
    }
    const invoiceDate = parseRecordDate(invoice.invoiceDate);
    return invoiceDate ? isDateInRange(invoiceDate, range) : false;
  }).length;
}

function countSellerReactivationEventsForRange(
  seller: Pick<SellerPerformanceRow, 'sellerId' | 'sellerName'>,
  range: PeriodRange,
  reactivationEvents: Map<string, Set<string>>,
) {
  const sellerKey = buildSellerKey(seller.sellerId, seller.sellerName);
  const events = reactivationEvents.get(sellerKey);
  if (!events) return 0;
  const monthKeys = new Set(expandMonthKeys(range));
  return [...events].filter((eventKey) => monthKeys.has(eventKey.split(':')[0] ?? '')).length;
}

function expandMonthKeys(range: PeriodRange) {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  const end = new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    keys.push(formatMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function formatMonthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(value);
}

function findSellerGoal(
  goals: SellerGoalConfig[],
  sellerId: number | null,
  sellerName: string,
) {
  return (
    goals.find((goal) => goal.sellerId !== null && goal.sellerId === sellerId) ??
    goals.find((goal) => normalizeDimensionText(goal.sellerName) === normalizeDimensionText(sellerName)) ??
    null
  );
}

function buildSellerCategoryBreakdown({
  lines,
  config,
}: {
  lines: OdooInvoiceLineRecord[];
  config: ReportsConfig;
}): SellerCategorySummary[] {
  const totalRevenue = sum(lines, (line) => line.untaxedAmount);
  const sellerTotals = new Map<string, number>();
  const categories = new Map<
    string,
    {
      categoryName: string;
      soldAmount: number;
      margin: number;
      sellerBuckets: Map<
        string,
        {
          sellerId: number | null;
          sellerName: string;
          soldAmount: number;
          margin: number;
          units: number;
          orders: Set<number>;
        }
      >;
    }
  >();

  lines.forEach((line) => {
    const sellerKey = buildSellerKey(line.sellerId, line.sellerName);
    const categoryName = normalizeBusinessCategoryName(line.categoryName, line.productName);
    sellerTotals.set(sellerKey, (sellerTotals.get(sellerKey) ?? 0) + line.untaxedAmount);

    const categoryBucket = categories.get(categoryName) ?? {
      categoryName,
      soldAmount: 0,
      margin: 0,
      sellerBuckets: new Map(),
    };
    categoryBucket.soldAmount += line.untaxedAmount;
    categoryBucket.margin += resolveInvoiceLineMargin(line, config);

    const sellerBucket = categoryBucket.sellerBuckets.get(sellerKey) ?? {
      sellerId: line.sellerId,
      sellerName: line.sellerName || 'Sin vendedor',
      soldAmount: 0,
      margin: 0,
      units: 0,
      orders: new Set<number>(),
    };
    sellerBucket.soldAmount += line.untaxedAmount;
    sellerBucket.margin += resolveInvoiceLineMargin(line, config);
    sellerBucket.units += line.quantity;
    sellerBucket.orders.add(line.invoiceId);

    categoryBucket.sellerBuckets.set(sellerKey, sellerBucket);
    categories.set(categoryName, categoryBucket);
  });

  return [...categories.values()]
    .map((categoryBucket) => {
      const sellerRows = [...categoryBucket.sellerBuckets.values()]
        .map((sellerBucket) => {
          const sellerTotal =
            sellerTotals.get(buildSellerKey(sellerBucket.sellerId, sellerBucket.sellerName)) ?? 0;

          return {
            sellerId: sellerBucket.sellerId,
            sellerName: sellerBucket.sellerName,
            categoryName: categoryBucket.categoryName,
            soldAmount: sellerBucket.soldAmount,
            margin: sellerBucket.margin,
            orderCount: sellerBucket.orders.size,
            units: sellerBucket.units,
            categorySharePct: ratio(sellerBucket.soldAmount, categoryBucket.soldAmount) * 100,
            sellerMixPct: ratio(sellerBucket.soldAmount, sellerTotal) * 100,
          } satisfies SellerCategoryPerformanceRow;
        })
        .sort((a, b) => {
          if (b.soldAmount !== a.soldAmount) return b.soldAmount - a.soldAmount;
          return a.sellerName.localeCompare(b.sellerName, 'es');
        });

      return {
        categoryName: categoryBucket.categoryName,
        soldAmount: categoryBucket.soldAmount,
        margin: categoryBucket.margin,
        sharePct: ratio(categoryBucket.soldAmount, totalRevenue) * 100,
        activeSellers: sellerRows.length,
        topSellerName: sellerRows[0]?.sellerName ?? null,
        topSellerAmount: sellerRows[0]?.soldAmount ?? 0,
        sellerRows,
      } satisfies SellerCategorySummary;
    })
    .sort((a, b) => {
      if (b.soldAmount !== a.soldAmount) return b.soldAmount - a.soldAmount;
      return a.categoryName.localeCompare(b.categoryName, 'es');
    });
}

function normalizeBusinessCategoryName(categoryName: string | null, productName: string) {
  const normalized = `${categoryName ?? ''} ${productName}`.trim().toLowerCase();
  const trimmedCategoryName = categoryName?.trim();

  if (normalized.includes('consum') || normalized.includes('ribbon') || normalized.includes('tinta') || normalized.includes('toner')) {
    return 'Consumibles';
  }
  if (normalized.includes('equipo') || normalized.includes('impresora') || normalized.includes('scanner') || normalized.includes('escaner')) {
    return 'Equipo';
  }
  if (normalized.includes('etiqueta') || normalized.includes('label')) {
    return 'Etiqueta';
  }
  if (normalized.includes('servicio') || normalized.includes('software') || normalized.includes('licencia') || normalized.includes('soporte')) {
    return 'Servicios y software';
  }
  if (trimmedCategoryName) {
    return trimmedCategoryName;
  }

  return 'Sin categoría';
}

function filterDataset(dataset: OdooCommercialDataset, filters: ReportFilters) {
  let orderLines = dataset.orderLines;
  let invoiceLines = dataset.invoiceLines;
  if (filters.productId) {
    orderLines = orderLines.filter((line) => line.productId === filters.productId);
    invoiceLines = invoiceLines.filter((line) => line.productId === filters.productId);
  }
  if (filters.categoryId) {
    orderLines = orderLines.filter((line) => line.categoryId === filters.categoryId);
    invoiceLines = invoiceLines.filter((line) => line.categoryId === filters.categoryId);
  }

  const lineOrderIds = new Set(orderLines.map((line) => line.orderId));
  const invoiceLineIds = new Set(invoiceLines.map((line) => line.invoiceId));
  const companyIds = resolveCompanyFilterIds(filters);
  const sellerIds = resolveSellerFilterIds(filters);
  const orders = dataset.orders.filter((order) => {
    if (companyIds.length > 0 && !companyIds.includes(order.companyId ?? -1)) return false;
    if (sellerIds.length > 0 && !sellerIds.includes(order.sellerId ?? -1)) return false;
    if (filters.teamId && order.teamId !== filters.teamId) return false;
    if (filters.customerId && order.customerId !== filters.customerId) return false;
    if (filters.currencyCode && order.currencyCode !== filters.currencyCode) return false;
    if (filters.channel && order.channel !== filters.channel) return false;
    if ((filters.productId || filters.categoryId) && !lineOrderIds.has(order.id)) return false;
    if (filters.stateScope === 'quotation' && !isQuotationState(order.state)) return false;
    if (filters.stateScope === 'confirmed' && !isConfirmedState(order.state)) return false;
    if (filters.stateScope === 'cancelled' && order.state !== 'cancel') return false;
    return true;
  });

  const visibleOrderIds = new Set(orders.map((order) => order.id));
  const visibleOrderNames = new Set(
    orders.map((order) => normalizeDimensionText(order.name)).filter(Boolean),
  );
  orderLines = orderLines.filter((line) => visibleOrderIds.has(line.orderId));
  const channelLinkedInvoiceIds = filters.channel
    ? buildLinkedInvoiceIdsForOrders(
        dataset.invoices,
        invoiceLines,
        visibleOrderIds,
        visibleOrderNames,
      )
    : null;

  const invoices = dataset.invoices.filter((invoice) => {
    if (companyIds.length > 0 && !companyIds.includes(invoice.companyId ?? -1)) return false;
    if (sellerIds.length > 0 && !sellerIds.includes(invoice.sellerId ?? -1)) return false;
    if (filters.teamId && invoice.teamId !== filters.teamId) return false;
    if (filters.customerId && invoice.customerId !== filters.customerId) return false;
    if (filters.currencyCode && invoice.currencyCode !== filters.currencyCode) return false;
    if (channelLinkedInvoiceIds && !channelLinkedInvoiceIds.has(invoice.id)) return false;
    if (filters.productId || filters.categoryId) {
      return invoiceLineIds.has(invoice.id);
    }
    return true;
  });
  const scopedInvoices =
    filters.stateScope === 'quotation' || filters.stateScope === 'cancelled' ? [] : invoices;
  const visibleInvoiceIds = new Set(scopedInvoices.map((invoice) => invoice.id));
  invoiceLines = invoiceLines.filter((line) => visibleInvoiceIds.has(line.invoiceId));
  const visibleCustomerKeys = new Set(
    scopedInvoices.map((invoice) => buildCustomerKey(invoice.customerId, invoice.customerName)),
  );
  const customerFirstPurchases =
    filters.stateScope === 'quotation' || filters.stateScope === 'cancelled'
      ? []
      : dataset.customerFirstPurchases.filter((record) =>
          visibleCustomerKeys.has(buildCustomerKey(record.customerId, record.customerName)),
        );

  return { orders, orderLines, invoices: scopedInvoices, invoiceLines, customerFirstPurchases };
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

function buildLinkedInvoiceIdsForOrders(
  invoices: OdooInvoiceRecord[],
  invoiceLines: OdooInvoiceLineRecord[],
  visibleOrderIds: Set<number>,
  visibleOrderNames: Set<string>,
) {
  const visibleInvoiceIds = new Set<number>();

  invoiceLines.forEach((line) => {
    const matchesById = line.sourceOrderIds.some((orderId) => visibleOrderIds.has(orderId));
    const matchesByName = line.sourceOrderNames.some((orderName) =>
      visibleOrderNames.has(normalizeDimensionText(orderName)),
    );
    if (matchesById || matchesByName) {
      visibleInvoiceIds.add(line.invoiceId);
    }
  });

  invoices.forEach((invoice) => {
    const matchesOrigin = extractInvoiceOriginOrderNames(invoice.invoiceOrigin).some((orderName) =>
      visibleOrderNames.has(normalizeDimensionText(orderName)),
    );
    if (matchesOrigin) {
      visibleInvoiceIds.add(invoice.id);
    }
  });

  return visibleInvoiceIds;
}

function buildSummaryMetrics({
  invoicing,
  overallConversion,
  quoteSummary,
  sales,
}: {
  invoicing: CommercialDashboardSnapshot['invoicing'];
  overallConversion: MetricComparison;
  quoteSummary: QuoteSummary;
  sales: CommercialDashboardSnapshot['sales'];
}) {
  return [
    {
      id: 'quotes_count',
      label: 'Cotizaciones',
      definition: 'Cotizaciones creadas en el período desde Ventas, con estado Cotización.',
      detailKey: 'pendingQuotes',
      comparison: quoteSummary.totalQuotes,
      formattedCurrent: formatNumber(quoteSummary.totalQuotes.current),
    },
    {
      id: 'confirmed_sales',
      label: 'Órdenes de venta',
      definition:
        'Órdenes creadas en el período desde Ventas, con estado Orden de venta.',
      detailKey: 'confirmedOrders',
      comparison: sales.confirmedOrders,
      formattedCurrent: formatNumber(sales.confirmedOrders.current),
    },
    {
      id: 'conversion',
      label: 'Conversion comercial',
      definition:
        'Facturas publicadas originadas en cotizaciones creadas en el período / cotizaciones evaluables.',
      detailKey: 'convertedQuotes',
      comparison: overallConversion,
      formattedCurrent: formatPercent(overallConversion.current),
    },
    {
      id: 'invoiced',
      label: 'Facturas publicadas',
      definition:
        'Total de filas del Análisis de facturas de Odoo en el período, con facturas y notas de crédito de cliente publicadas.',
      detailKey: 'postedInvoices',
      comparison: invoicing.invoiceCount,
      formattedCurrent: formatNumber(invoicing.invoiceCount.current),
    },
    {
      id: 'margin',
      label: 'Total sin impuestos',
      definition:
        'Importe neto facturado del periodo, sin impuestos, basado en facturas publicadas de Contabilidad.',
      detailKey: 'postedInvoices',
      comparison: invoicing.invoicedAmount,
      formattedCurrent: formatCurrency(invoicing.invoicedAmount.current),
    },
    {
      id: 'average_ticket',
      label: 'Ticket promedio facturado',
      definition: 'Total sin impuestos facturado / pedidos Ãºnicos facturados en el perÃ­odo.',
      detailKey: 'postedInvoices',
      comparison: sales.averageTicket,
      formattedCurrent: formatCurrency(sales.averageTicket.current),
    },
  ] satisfies ExecutiveMetric[];
}

function buildAnnualGrowthSnapshot({
  allInvoiceLines,
  customerFirstPurchases,
  config,
  currentPeriod,
  previousPeriod,
  currentYearToDatePeriod,
  previousYearToDatePeriod,
  currentYearToDateInvoiceLines,
  previousYearToDateInvoiceLines,
}: {
  allInvoiceLines: OdooInvoiceLineRecord[];
  customerFirstPurchases: OdooCustomerFirstPurchaseRecord[];
  config: ReportsConfig;
  currentPeriod: PeriodRange;
  previousPeriod: PeriodRange;
  currentYearToDatePeriod: PeriodRange;
  previousYearToDatePeriod: PeriodRange;
  currentYearToDateInvoiceLines: OdooInvoiceLineRecord[];
  previousYearToDateInvoiceLines: OdooInvoiceLineRecord[];
}): AnnualGrowthSnapshot {
  const marginAmount = compareMetric(
    sum(currentYearToDateInvoiceLines, (line) => resolveInvoiceLineMargin(line, config)),
    sum(previousYearToDateInvoiceLines, (line) => resolveInvoiceLineMargin(line, config)),
  );
  const invoicedAmount = compareMetric(
    sum(currentYearToDateInvoiceLines, (line) => line.untaxedAmount),
    sum(previousYearToDateInvoiceLines, (line) => line.untaxedAmount),
  );
  const newCustomers = compareMetric(
    countNewCustomersInRange(customerFirstPurchases, currentYearToDatePeriod),
    countNewCustomersInRange(customerFirstPurchases, previousYearToDatePeriod),
  );

  const currentPeriodScore = countPositiveMetrics([
    compareMetric(
      sum(filterInvoiceLinesByDate(allInvoiceLines, currentPeriod), (line) => line.untaxedAmount),
      sum(filterInvoiceLinesByDate(allInvoiceLines, previousPeriod), (line) => line.untaxedAmount),
    ),
    compareMetric(
      sum(filterInvoiceLinesByDate(allInvoiceLines, currentPeriod), (line) =>
        resolveInvoiceLineMargin(line, config),
      ),
      sum(filterInvoiceLinesByDate(allInvoiceLines, previousPeriod), (line) =>
        resolveInvoiceLineMargin(line, config),
      ),
    ),
    compareMetric(
      countNewCustomersInRange(customerFirstPurchases, currentPeriod),
      countNewCustomersInRange(customerFirstPurchases, previousPeriod),
    ),
  ]);
  const annualScore = countPositiveMetrics([marginAmount, invoicedAmount, newCustomers]);

  if (annualScore >= 2) {
    return {
      marginAmount,
      invoicedAmount,
      newCustomers,
      signal: 'growth',
      signalTitle: 'Crecimiento acumulado consistente',
      signalDescription:
        'Los KPI acumulados contra el mismo tramo del año anterior muestran avance estructural y no solo un pico estacional.',
      currentLabel: formatYearToDateLabel(currentYearToDatePeriod),
      previousLabel: formatYearToDateLabel(previousYearToDatePeriod),
    };
  }

  if (currentPeriodScore > annualScore) {
    return {
      marginAmount,
      invoicedAmount,
      newCustomers,
      signal: 'seasonal',
      signalTitle: 'Posible efecto estacional',
      signalDescription:
        'El perÃ­odo actual puede verse fuerte, pero el acumulado contra el mismo tramo del año anterior todavÃ­a no confirma un crecimiento sostenido.',
      currentLabel: formatYearToDateLabel(currentYearToDatePeriod),
      previousLabel: formatYearToDateLabel(previousYearToDatePeriod),
    };
  }

  return {
    marginAmount,
    invoicedAmount,
    newCustomers,
    signal: 'mixed',
    signalTitle: 'Crecimiento mixto',
    signalDescription:
      'Hay seÃ±ales parciales de avance, pero conviene revisar mes a mes si el crecimiento se mantiene o depende de meses puntuales.',
    currentLabel: formatYearToDateLabel(currentYearToDatePeriod),
    previousLabel: formatYearToDateLabel(previousYearToDatePeriod),
  };
}

function buildConversionRows(
  quotes: OdooOrderRecord[],
  confirmedOrders: OdooOrderRecord[],
  dimension: ConversionDimension,
  referenceDate: Date,
  quoteInvoiceIndex: Map<string, Date>,
) {
  const buckets = new Map<
    string,
    ConversionRow & { conversionDaysCount: number; sortOrder: number }
  >();

  quotes.forEach((quote) => {
    const descriptor = getQuoteDimension(quote, dimension);
    const bucket = buckets.get(descriptor.key) ?? {
      key: descriptor.key,
      label: descriptor.label,
      quotes: 0,
      converted: 0,
      cancelled: 0,
      pending: 0,
      expired: 0,
      conversionPct: 0,
      averageConversionDays: 0,
      conversionDaysCount: 0,
      sortOrder: descriptor.sortOrder,
    };

    bucket.label = pickPreferredLabel(bucket.label, descriptor.label);
    bucket.quotes += 1;
    if (isQuoteConvertedByInvoice(quote, referenceDate, quoteInvoiceIndex)) {
      bucket.averageConversionDays +=
        getInvoiceConversionDays(quote, quoteInvoiceIndex) ?? 0;
      bucket.conversionDaysCount += 1;
    } else if (quote.state === 'cancel') {
      bucket.cancelled += 1;
    } else {
      bucket.pending += 1;
      if (isExpiredQuote(quote, referenceDate)) bucket.expired += 1;
    }
    buckets.set(descriptor.key, bucket);
  });

  confirmedOrders.forEach((order) => {
    const descriptor = getQuoteDimension(order, dimension);
    const bucket = buckets.get(descriptor.key) ?? {
      key: descriptor.key,
      label: descriptor.label,
      quotes: 0,
      converted: 0,
      cancelled: 0,
      pending: 0,
      expired: 0,
      conversionPct: 0,
      averageConversionDays: 0,
      conversionDaysCount: 0,
      sortOrder: descriptor.sortOrder,
    };
    bucket.label = pickPreferredLabel(bucket.label, descriptor.label);
    bucket.converted += 1;
    buckets.set(descriptor.key, bucket);
  });

  return [...buckets.values()]
    .map(({ conversionDaysCount, ...bucket }) => ({
      ...bucket,
      conversionPct: ratio(bucket.converted, bucket.converted + bucket.quotes) * 100,
      averageConversionDays:
        conversionDaysCount > 0 ? bucket.averageConversionDays / conversionDaysCount : 0,
    }))
    .sort((left, right) => sortConversionRows(left, right, dimension));
}

function buildConversionByProduct(
  quotes: OdooOrderRecord[],
  confirmedOrders: OdooOrderRecord[],
  lines: OdooOrderLineRecord[],
  referenceDate: Date,
  quoteInvoiceIndex: Map<string, Date>,
) {
  const quoteIds = new Set(quotes.map((quote) => quote.id));
  const confirmedOrderIds = new Set(confirmedOrders.map((order) => order.id));
  const groupedLines = lines.filter((line) => quoteIds.has(line.orderId));
  const confirmedLines = lines.filter((line) => confirmedOrderIds.has(line.orderId));
  const productToQuotes = new Map<
    string,
    {
      key: string;
      label: string;
      quotes: number;
      converted: number;
      cancelled: number;
      pending: number;
      expired: number;
      totalConversionDays: number;
      conversionDaysCount: number;
    }
  >();

  groupedLines.forEach((line) => {
    const key = buildProductKey(line.productId, line.productName);
    const bucket = productToQuotes.get(key) ?? {
      key,
      label: line.productName,
      quotes: 0,
      converted: 0,
      cancelled: 0,
      pending: 0,
      expired: 0,
      totalConversionDays: 0,
      conversionDaysCount: 0,
    };
    const quote = quotes.find((item) => item.id === line.orderId);
    if (!quote) return;
    bucket.quotes += 1;
    if (isQuoteConvertedByInvoice(quote, referenceDate, quoteInvoiceIndex)) {
      bucket.totalConversionDays +=
        getInvoiceConversionDays(quote, quoteInvoiceIndex) ?? 0;
      bucket.conversionDaysCount += 1;
    } else if (quote.state === 'cancel') {
      bucket.cancelled += 1;
    } else {
      bucket.pending += 1;
      if (isExpiredQuote(quote, referenceDate)) bucket.expired += 1;
    }
    productToQuotes.set(key, bucket);
  });

  confirmedLines.forEach((line) => {
    const key = buildProductKey(line.productId, line.productName);
    const bucket = productToQuotes.get(key) ?? {
      key,
      label: line.productName,
      quotes: 0,
      converted: 0,
      cancelled: 0,
      pending: 0,
      expired: 0,
      totalConversionDays: 0,
      conversionDaysCount: 0,
    };
    bucket.converted += 1;
    productToQuotes.set(key, bucket);
  });

  return [...productToQuotes.values()]
    .map((bucket) => {
      const conversionPct = ratio(bucket.converted, bucket.converted + bucket.quotes) * 100;
      const averageConversionDays =
        bucket.conversionDaysCount > 0
          ? bucket.totalConversionDays / bucket.conversionDaysCount
          : 0;

      return {
        key: bucket.key,
        label: bucket.label,
        quotes: bucket.quotes,
        converted: bucket.converted,
        cancelled: bucket.cancelled,
        pending: bucket.pending,
        expired: bucket.expired,
        conversionPct,
        averageConversionDays,
      } satisfies ConversionRow;
    })
    .sort((left, right) => right.conversionPct - left.conversionPct)
    .slice(0, 12);
}

function buildTrendPoints({
  config,
  grouping,
  invoiceLines,
  invoices,
  previousYearInvoiceLines,
  range,
}: {
  config: ReportsConfig;
  grouping: ReportGrouping;
  invoiceLines: OdooInvoiceLineRecord[];
  invoices: OdooInvoiceRecord[];
  previousYearInvoiceLines: OdooInvoiceLineRecord[];
  range: PeriodRange;
}) {
  const buckets = new Map<
    string,
    TrendPoint & { customerSet: Set<number | string>; orderKeySet: Set<string> }
  >();
  const invoiceLinesByInvoiceId = groupBy(invoiceLines, (line) => `${line.invoiceId}`);

  invoiceLines.forEach((line) => {
    const date = parseRecordDate(line.invoiceDate);
    if (!date || !isDateInRange(date, range)) return;
    const { key, label } = buildGroupedKey(date, grouping);
    const bucket = buckets.get(key) ?? {
      bucketKey: key,
      label,
      soldAmount: 0,
      invoicedAmount: 0,
      previousInvoicedAmount: 0,
      marginAmount: 0,
      orderCount: 0,
      averageTicket: 0,
      uniqueCustomers: 0,
      accumulatedSoldAmount: 0,
      customerSet: new Set<number | string>(),
      orderKeySet: new Set<string>(),
    };
    bucket.soldAmount += line.untaxedAmount;
    bucket.invoicedAmount += line.untaxedAmount;
    bucket.marginAmount += resolveInvoiceLineMargin(line, config);
    bucket.customerSet.add(buildCustomerKey(line.customerId, line.customerName));
    buckets.set(key, bucket);
  });

  invoices.forEach((invoice) => {
    const date = parseRecordDate(invoice.invoiceDate);
    if (!date || !isDateInRange(date, range)) return;
    const { key, label } = buildGroupedKey(date, grouping);
    const bucket = buckets.get(key) ?? {
      bucketKey: key,
      label,
      soldAmount: 0,
      invoicedAmount: 0,
      previousInvoicedAmount: 0,
      marginAmount: 0,
      orderCount: 0,
      averageTicket: 0,
      uniqueCustomers: 0,
      accumulatedSoldAmount: 0,
      customerSet: new Set<number | string>(),
      orderKeySet: new Set<string>(),
    };
    collectBilledOrderKeysForInvoice(
      invoice,
      invoiceLinesByInvoiceId.get(`${invoice.id}`) ?? [],
    ).forEach((orderKey) => {
      bucket.orderKeySet.add(orderKey);
    });
    buckets.set(key, bucket);
  });

  previousYearInvoiceLines.forEach((line) => {
    const date = parseRecordDate(line.invoiceDate);
    if (!date) return;
    const shiftedDate = new Date(
      Date.UTC(
        date.getUTCFullYear() + 1,
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds(),
      ),
    );
    if (!isDateInRange(shiftedDate, range)) return;
    const { key, label } = buildGroupedKey(shiftedDate, grouping);
    const bucket = buckets.get(key) ?? {
      bucketKey: key,
      label,
      soldAmount: 0,
      invoicedAmount: 0,
      previousInvoicedAmount: 0,
      marginAmount: 0,
      orderCount: 0,
      averageTicket: 0,
      uniqueCustomers: 0,
      accumulatedSoldAmount: 0,
      customerSet: new Set<number | string>(),
      orderKeySet: new Set<string>(),
    };
    bucket.previousInvoicedAmount += line.untaxedAmount;
    buckets.set(key, bucket);
  });

  let accumulated = 0;
  return [...buckets.values()]
    .sort((left, right) => left.bucketKey.localeCompare(right.bucketKey))
    .map((bucket) => {
      accumulated += bucket.soldAmount;
      return {
        bucketKey: bucket.bucketKey,
        label: bucket.label,
        soldAmount: bucket.soldAmount,
        invoicedAmount: bucket.invoicedAmount,
        previousInvoicedAmount: bucket.previousInvoicedAmount,
        marginAmount: bucket.marginAmount,
        orderCount: bucket.orderKeySet.size,
        averageTicket:
          bucket.orderKeySet.size > 0 ? bucket.invoicedAmount / bucket.orderKeySet.size : 0,
        uniqueCustomers: bucket.customerSet.size,
        accumulatedSoldAmount: accumulated,
      } satisfies TrendPoint;
    });
}

function buildClientLifecycleRows({
  allInvoiceLines,
  allInvoices,
  config,
  customerFirstPurchases,
  currentPeriod,
  previousPeriod,
}: {
  allInvoiceLines: OdooInvoiceLineRecord[];
  allInvoices: OdooInvoiceRecord[];
  config: ReportsConfig;
  customerFirstPurchases: OdooCustomerFirstPurchaseRecord[];
  currentPeriod: PeriodRange;
  previousPeriod: PeriodRange;
}) {
  const invoices = allInvoices.filter((invoice) => {
    const invoiceDate = parseRecordDate(invoice.invoiceDate);
    return invoiceDate !== null && invoiceDate <= currentPeriod.end;
  });
  const linesByInvoiceId = groupBy(allInvoiceLines, (line) => `${line.invoiceId}`);
  const customerBuckets = new Map<string, CustomerAggregate>();
  const firstPurchaseByCustomer = new Map<string, Date>();

  customerFirstPurchases.forEach((record) => {
    const invoiceDate = parseRecordDate(record.invoiceDate);
    if (!invoiceDate || invoiceDate > currentPeriod.end) return;
    firstPurchaseByCustomer.set(
      buildCustomerKey(record.customerId, record.customerName),
      invoiceDate,
    );
  });

  invoices.forEach((invoice) => {
    const key = buildCustomerKey(invoice.customerId, invoice.customerName);
    const invoiceDate = parseRecordDate(invoice.invoiceDate);
    if (!invoiceDate) return;
    const bucket = customerBuckets.get(key) ?? {
      customerId: invoice.customerId,
      customerName: invoice.customerName || 'Cliente sin nombre',
      sellerName: invoice.sellerName || 'Sin vendedor',
      dates: [],
      invoices: [],
      lineCount: 0,
      revenue: 0,
      margin: 0,
    };
    bucket.dates.push(invoiceDate);
    bucket.invoices.push(invoice);
    const invoiceLines = linesByInvoiceId.get(`${invoice.id}`) ?? [];
    bucket.lineCount += invoiceLines.length;
    bucket.revenue += invoiceAmount(invoice, config);
    bucket.margin += sum(invoiceLines, (line) => resolveInvoiceLineMargin(line, config));
    if (invoiceDate > (bucket.dates[0] ?? invoiceDate)) {
      bucket.sellerName = invoice.sellerName;
    }
    customerBuckets.set(key, bucket);
  });

  const revenues = [...customerBuckets.values()].map((bucket) => bucket.revenue);
  const recencyScores = quantileScores(
    [...customerBuckets.values()].map((bucket) =>
      diffDays(maxDate(bucket.dates) ?? currentPeriod.end, currentPeriod.end),
    ),
    true,
  );
  const frequencyScores = quantileScores(
    [...customerBuckets.values()].map((bucket) => bucket.invoices.length),
    false,
  );
  const monetaryScores = quantileScores(revenues, false);
  const highValueCutoff = quantile(revenues, config.highValuePercentile);

  return [...customerBuckets.values()]
    .map((bucket, index) => {
      const firstPurchase =
        firstPurchaseByCustomer.get(buildCustomerKey(bucket.customerId, bucket.customerName)) ??
        minDate(bucket.dates);
      const lastPurchase = maxDate(bucket.dates);
      const previousInvoices = bucket.invoices.filter((invoice) => {
        const invoiceDate = parseRecordDate(invoice.invoiceDate);
        return invoiceDate !== null && invoiceDate <= previousPeriod.end;
      });
      const currentInvoices = bucket.invoices.filter((invoice) => {
        const invoiceDate = parseRecordDate(invoice.invoiceDate);
        return invoiceDate !== null && isDateInRange(invoiceDate, currentPeriod);
      });
      const averagePurchaseGapDays = averageIntervals(bucket.dates);
      const currentStatus = classifyClientStatus({
        averagePurchaseGapDays,
        currentEnd: currentPeriod.end,
        currentInvoices,
        currentRevenue: bucket.revenue,
        firstPurchase,
        isFirstPurchaseInRange:
          firstPurchase !== null && isDateInRange(firstPurchase, currentPeriod),
        highValueCutoff,
        lastPurchase,
        orderCount: bucket.invoices.length,
        previousStatus: previousInvoices.length
          ? classifyClientStatus({
              averagePurchaseGapDays,
              currentEnd: previousPeriod.end,
              currentInvoices: previousInvoices.filter((invoice) => {
                const invoiceDate = parseRecordDate(invoice.invoiceDate);
                return invoiceDate !== null && isDateInRange(invoiceDate, previousPeriod);
              }),
              currentRevenue: sum(previousInvoices, (invoice) => invoiceAmount(invoice, config)),
              firstPurchase,
              isFirstPurchaseInRange:
                firstPurchase !== null && isDateInRange(firstPurchase, previousPeriod),
              highValueCutoff,
              lastPurchase: maxDate(
                previousInvoices
                  .map((invoice) => parseRecordDate(invoice.invoiceDate))
                  .filter((value): value is Date => value !== null),
              ),
              orderCount: previousInvoices.length,
              previousStatus: null,
              config,
            })
          : null,
        config,
      });
      const previousStatus = previousInvoices.length
        ? classifyClientStatus({
            averagePurchaseGapDays,
            currentEnd: previousPeriod.end,
            currentInvoices: previousInvoices.filter((invoice) => {
              const invoiceDate = parseRecordDate(invoice.invoiceDate);
              return invoiceDate !== null && isDateInRange(invoiceDate, previousPeriod);
            }),
            currentRevenue: sum(previousInvoices, (invoice) => invoiceAmount(invoice, config)),
            firstPurchase,
            isFirstPurchaseInRange:
              firstPurchase !== null && isDateInRange(firstPurchase, previousPeriod),
            highValueCutoff,
            lastPurchase: maxDate(
              previousInvoices
                .map((invoice) => parseRecordDate(invoice.invoiceDate))
                .filter((value): value is Date => value !== null),
            ),
            orderCount: previousInvoices.length,
            previousStatus: null,
            config,
          })
        : null;
      const rfmScore = `${recencyScores[index]}${frequencyScores[index]}${monetaryScores[index]}`;
      return {
        customerId: bucket.customerId,
        customerName: bucket.customerName,
        firstPurchaseDate: firstPurchase?.toISOString() ?? null,
        lastPurchaseDate: lastPurchase?.toISOString() ?? null,
        daysSinceLastPurchase: lastPurchase ? diffDays(lastPurchase, currentPeriod.end) : null,
        totalOrders: bucket.invoices.length,
        revenue: bucket.revenue,
        margin: bucket.margin,
        averageTicket: bucket.invoices.length > 0 ? bucket.revenue / bucket.invoices.length : 0,
        averagePurchaseGapDays,
        currentStatus,
        previousStatus,
        riskLevel: mapStatusToRisk(currentStatus),
        sellerName: bucket.sellerName,
        rfmScore,
        rfmSegment: getRfmSegment({
          recency: recencyScores[index],
          frequency: frequencyScores[index],
          monetary: monetaryScores[index],
        }),
        isNewCustomer: currentStatus === 'nuevo',
        isReactivated: currentStatus === 'reactivado',
      } satisfies ClientLifecycleRow;
    })
    .sort((left, right) => right.revenue - left.revenue);
}

function buildCustomerSummary(rows: ClientLifecycleRow[], currentPeriod: PeriodRange) {
  const currentCustomers = rows.filter((row) => {
    if (!row.lastPurchaseDate) return false;
    const lastPurchase = new Date(row.lastPurchaseDate);
    return lastPurchase <= currentPeriod.end;
  }).length;
  const previousCustomers = rows.filter(
    (row) => row.previousStatus !== null && row.previousStatus !== 'perdido',
  ).length;

  return {
    currentCustomers,
    previousCustomers,
    newCustomers: rows.filter((row) => row.currentStatus === 'nuevo').length,
    activeCustomers: rows.filter((row) =>
      ['activo', 'frecuente', 'alto_valor', 'nuevo', 'reactivado'].includes(row.currentStatus),
    ).length,
    atRiskCustomers: rows.filter((row) =>
      ['observacion', 'en_riesgo', 'casi_perdido'].includes(row.currentStatus),
    ).length,
    dormantCustomers: rows.filter((row) => row.currentStatus === 'dormido').length,
    lostCustomers: rows.filter((row) => row.currentStatus === 'perdido').length,
    reactivatedCustomers: rows.filter((row) => row.isReactivated).length,
    valueAtRisk: sum(
      rows.filter((row) =>
        ['observacion', 'en_riesgo', 'casi_perdido', 'dormido'].includes(row.currentStatus),
      ),
      (row) => row.revenue,
    ),
    retainedCustomers: rows.filter(
      (row) =>
        row.previousStatus !== null &&
        !['perdido', 'dormido'].includes(row.previousStatus) &&
        ['activo', 'frecuente', 'alto_valor', 'reactivado', 'nuevo'].includes(row.currentStatus),
    ).length,
    repeatCustomers: rows.filter((row) => row.totalOrders > 1).length,
  };
}

function buildProductRows({
  allLines,
  config,
  currentLines,
  previousLines,
}: {
  allLines: OdooInvoiceLineRecord[];
  config: ReportsConfig;
  currentLines: OdooInvoiceLineRecord[];
  previousLines: OdooInvoiceLineRecord[];
}) {
  const currentBuckets = aggregateLinesByProduct(currentLines, config);
  const previousBuckets = aggregateLinesByProduct(previousLines, config);
  const allBuckets = aggregateLinesByProduct(allLines, config);
  const revenueValues = [...currentBuckets.values()].map((bucket) => bucket.revenue);
  const marginPctValues = [...currentBuckets.values()].map((bucket) => bucket.marginPct ?? 0);
  const revenueMedian = median(revenueValues);
  const marginMedian = median(marginPctValues);
  const totalRevenue = sum([...currentBuckets.values()], (bucket) => bucket.revenue);
  const totalMargin = sum([...currentBuckets.values()], (bucket) => bucket.margin);

  return [...allBuckets.entries()].map(([key, bucket]) => {
    const current = currentBuckets.get(key);
    const previous = previousBuckets.get(key);
    const revenue = current?.revenue ?? 0;
    const margin = current?.margin ?? 0;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : null;
    return {
      productId: bucket.productId,
      productName: bucket.productName,
      categoryName: bucket.categoryName,
      units: current?.units ?? 0,
      revenue,
      margin,
      marginPct,
      orderCount: current?.orderCount ?? 0,
      uniqueCustomers: current?.uniqueCustomers ?? 0,
      repeatPurchaseRate: current?.repeatPurchaseRate ?? 0,
      averageTicket: current?.averageTicket ?? 0,
      revenueSharePct: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      marginSharePct: totalMargin > 0 ? (margin / totalMargin) * 100 : 0,
      previousRevenue: previous?.revenue ?? 0,
      revenueChangePct: calculatePctChange(revenue, previous?.revenue ?? 0),
      quadrant: classifyProductQuadrant(
        revenue,
        marginPct,
        revenueMedian,
        marginMedian,
      ),
      flags: buildProductFlags({
        allBucket: bucket,
        currentBucket: current,
        previousBucket: previous,
      }),
    } satisfies ProductAnalysisRow;
  });
}

function buildSellerRows({
  allInvoiceLines,
  allInvoices,
  allOrders,
  config,
  currentPeriod,
  customerLifecycleRows,
  previousPeriod,
  quoteInvoiceIndex,
}: {
  allInvoiceLines: OdooInvoiceLineRecord[];
  allInvoices: OdooInvoiceRecord[];
  allOrders: OdooOrderRecord[];
  customerFirstPurchases?: OdooCustomerFirstPurchaseRecord[];
  config: ReportsConfig;
  currentPeriod: PeriodRange;
  customerLifecycleRows: ClientLifecycleRow[];
  previousPeriod: PeriodRange;
  quoteInvoiceIndex: Map<string, Date>;
}) {
  const sellers = new Map<string, SellerAggregate>();
  const sellerKeyByName = new Map<string, string>();
  const currentQuotes = filterOrdersByDateAndState(allOrders, currentPeriod, 'quotation');
  const currentConfirmedOrders = filterOrdersByDateAndState(allOrders, currentPeriod, 'confirmed');
  const currentInvoices = filterInvoicesByDate(allInvoices, currentPeriod);
  const linesBySeller = groupBy(
    filterInvoiceLinesByDate(allInvoiceLines, currentPeriod),
    (line) => buildSellerKey(line.sellerId, line.sellerName),
  );
  const invoicesBySeller = groupBy(
    currentInvoices,
    (invoice) => buildSellerKey(invoice.sellerId, invoice.sellerName),
  );
  const previousLinesBySeller = groupBy(
    filterInvoiceLinesByDate(allInvoiceLines, previousPeriod),
    (line) => buildSellerKey(line.sellerId, line.sellerName),
  );

  const ensureSeller = (sellerId: number | null, sellerName: string | null) => {
    const key = buildSellerKey(sellerId, sellerName);
    const bucket = sellers.get(key) ?? {
      sellerId,
      sellerName: sellerName || 'Sin vendedor',
      quotes: [],
      confirmedOrders: [],
      confirmedRevenue: 0,
      invoicedAmount: 0,
      margin: 0,
      newCustomers: 0,
      atRiskCustomers: 0,
      reactivatedCustomers: 0,
      lostCustomers: 0,
      retainedCustomers: 0,
      previousCustomers: 0,
    };
    sellerKeyByName.set(normalizeDimensionText(bucket.sellerName), key);
    sellers.set(key, bucket);
    return bucket;
  };

  // Seed from posted accounting movements so invoice-analysis sellers are never omitted.
  currentInvoices.forEach((invoice) => ensureSeller(invoice.sellerId, invoice.sellerName));
  filterInvoiceLinesByDate(allInvoiceLines, currentPeriod).forEach((line) =>
    ensureSeller(line.sellerId, line.sellerName),
  );

  currentQuotes.forEach((order) => {
    const key = buildSellerKey(order.sellerId, order.sellerName);
    const bucket = ensureSeller(order.sellerId, order.sellerName);
    bucket.quotes.push(order);
    sellers.set(key, bucket);
  });

  currentConfirmedOrders.forEach((order) => {
    const key = buildSellerKey(order.sellerId, order.sellerName);
    const bucket = ensureSeller(order.sellerId, order.sellerName);
    bucket.confirmedOrders.push(order);
    bucket.confirmedRevenue += order.amountUntaxed;
    sellers.set(key, bucket);
  });

  customerLifecycleRows.forEach((row) => {
    const key = sellerKeyByName.get(normalizeDimensionText(row.sellerName));
    if (!key) return;
    const sellerBucket = sellers.get(key);
    if (!sellerBucket) return;
    if (row.currentStatus === 'nuevo') sellerBucket.newCustomers += 1;
    if (['observacion', 'en_riesgo', 'casi_perdido'].includes(row.currentStatus)) {
      sellerBucket.atRiskCustomers += 1;
    }
    if (row.isReactivated) sellerBucket.reactivatedCustomers += 1;
    if (row.currentStatus === 'perdido') sellerBucket.lostCustomers += 1;
    if (
      row.previousStatus !== null &&
      !['perdido', 'dormido'].includes(row.previousStatus) &&
      ['activo', 'frecuente', 'alto_valor', 'reactivado', 'nuevo'].includes(row.currentStatus)
    ) {
      sellerBucket.retainedCustomers += 1;
    }
    if (row.previousStatus !== null) sellerBucket.previousCustomers += 1;
    sellers.set(key, sellerBucket);
  });

  return [...sellers.values()].map((bucket) => {
    const sellerKey = buildSellerKey(bucket.sellerId, bucket.sellerName);
    const lineRows = linesBySeller.get(sellerKey) ?? [];
    const invoiceRows = invoicesBySeller.get(sellerKey) ?? [];
    const previousLineRows = previousLinesBySeller.get(sellerKey) ?? [];
    const conversionPct = calculateConversionPct(bucket.quotes, bucket.confirmedOrders);
    const margin = sum(lineRows, (line) => resolveInvoiceLineMargin(line, config));
    const soldAmount = sum(lineRows, (line) => line.untaxedAmount);
    const previousSoldAmount = sum(previousLineRows, (line) => line.untaxedAmount);
    const billedOrderCount = countDistinctBilledOrders(invoiceRows, lineRows);
    const averageTicket =
      billedOrderCount > 0 ? soldAmount / billedOrderCount : 0;
    const weightedScore =
      normalizeWeight(config.sellerRankingWeights.sold_amount) * soldAmount +
      normalizeWeight(config.sellerRankingWeights.margin) * margin +
      normalizeWeight(config.sellerRankingWeights.conversion) * conversionPct +
      normalizeWeight(config.sellerRankingWeights.new_customers) * bucket.newCustomers +
      normalizeWeight(config.sellerRankingWeights.retention) *
        ratio(bucket.retainedCustomers, bucket.previousCustomers) *
        100;

    return {
      sellerId: bucket.sellerId,
      sellerName: bucket.sellerName,
      quotes: bucket.quotes.length,
      confirmedOrders: billedOrderCount,
      conversionPct,
      soldAmount,
      invoicedAmount: soldAmount,
      margin,
      marginPct: soldAmount > 0 ? (margin / soldAmount) * 100 : null,
      averageTicket,
      customersServed: countDistinct(
        invoiceRows.map((invoice) => buildCustomerKey(invoice.customerId, invoice.customerName)),
      ),
      newCustomers: bucket.newCustomers,
      atRiskCustomers: bucket.atRiskCustomers,
      reactivatedCustomers: bucket.reactivatedCustomers,
      lostCustomers: bucket.lostCustomers,
      averageConversionDays: average(
        bucket.quotes
          .filter((order) => isQuoteConvertedByInvoice(order, currentPeriod.end, quoteInvoiceIndex))
          .map((order) => getInvoiceConversionDays(order, quoteInvoiceIndex))
          .filter((value): value is number => value !== null),
      ),
      cancellationRate:
        bucket.quotes.length > 0
          ? (bucket.quotes.filter((order) => order.state === 'cancel').length /
              bucket.quotes.length) *
            100
          : 0,
      soldAmountChangePct: calculatePctChange(
        soldAmount,
        previousSoldAmount,
      ),
      weightedScore,
    } satisfies SellerPerformanceRow;
  });
}

function buildParetoSummary({
  dimension,
  metric,
  rows,
  thresholdA,
  thresholdB,
}: {
  dimension: 'customers' | 'products' | 'sellers';
  metric: ParetoMetricKey;
  rows: Array<{
    key: string;
    label: string;
    revenue: number;
    margin: number;
    units: number;
    orders: number;
  }>;
  thresholdA: number;
  thresholdB: number;
}) {
  const total = sum(rows, (row) => metricValue(row, metric));
  let accumulated = 0;
  const mappedRows = rows
    .slice()
    .sort((left, right) => metricValue(right, metric) - metricValue(left, metric))
    .map((row, index) => {
      const value = metricValue(row, metric);
      const individualPct = total > 0 ? value / total : 0;
      accumulated += individualPct;
      return {
        position: index + 1,
        key: row.key,
        label: row.label,
        value,
        units: row.units,
        orders: row.orders,
        individualPct: individualPct * 100,
        accumulatedPct: accumulated * 100,
        classification: accumulated <= thresholdA ? 'A' : accumulated <= thresholdB ? 'B' : 'C',
      } satisfies ParetoRow;
    });

  const groupA = mappedRows.filter((row) => row.classification === 'A');
  const groupARatio = rows.length > 0 ? (groupA.length / rows.length) * 100 : 0;

  return {
    title: getParetoTitle(dimension),
    metric,
    statement:
      groupA.length > 0
        ? `${groupA.length} ${dimension} concentran ${groupA[groupA.length - 1].accumulatedPct.toFixed(
            1,
          )}% del resultado y representan ${groupARatio.toFixed(1)}% del total analizado.`
        : `No hay datos suficientes para calcular Pareto de ${dimension}.`,
    rows: mappedRows,
  } satisfies ParetoSummary;
}

function buildHallazgos({
  currentPeriod,
  customerLifecycleRows,
  invoicing,
  overallConversion,
  productRows,
  quoteSummary,
  sales,
  sellerRows,
}: {
  currentPeriod: PeriodRange;
  customerLifecycleRows: ClientLifecycleRow[];
  invoicing: CommercialDashboardSnapshot['invoicing'];
  overallConversion: MetricComparison;
  productRows: ProductAnalysisRow[];
  quoteSummary: QuoteSummary;
  sales: CommercialDashboardSnapshot['sales'];
  sellerRows: SellerPerformanceRow[];
}) {
  const hallazgos: Hallazgo[] = [];
  const atRiskHighValueClients = customerLifecycleRows.filter(
    (row) =>
      ['en_riesgo', 'casi_perdido', 'dormido'].includes(row.currentStatus) &&
      row.revenue >= quantile(customerLifecycleRows.map((item) => item.revenue), 0.85),
  );
  const negativeMarginProducts = productRows.filter((row) => (row.marginPct ?? 0) < 0);
  const weakConversionSeller = sellerRows
    .filter((row) => row.quotes >= 5 && row.conversionPct < 50)
    .sort((a, b) => a.conversionPct - b.conversionPct)[0];

  if (sales.soldAmount.differencePct !== null && sales.marginPct.differencePct !== null) {
    if (sales.soldAmount.differencePct > 0 && sales.marginPct.differencePct < 0) {
      hallazgos.push({
        id: 'ventas_suben_margen_baja',
        level: 'atencion',
        title: 'Las ventas subieron, pero el margen porcentual se deterioró',
        evidence:
          `Ventas ${formatSignedPercent(sales.soldAmount.differencePct)} y margen ${formatSignedPercent(sales.marginPct.differencePct)} entre ${formatDateLabel(currentPeriod.start)} y ${formatDateLabel(currentPeriod.end)}.`,
        explanation:
        'El negocio está vendiendo más, pero retiene menos rentabilidad por cada peso vendido.',
        recommendation:
          'Revisa descuentos, coste de productos líderes y mezcla de ventas con margen bajo.',
        detailKey: 'negativeMarginProducts',
      });
    }
  }

  if (overallConversion.current < 35 && quoteSummary.totalQuotes.current >= 10) {
    hallazgos.push({
      id: 'conversion_baja',
      level: 'atencion',
      title: 'La conversión comercial está por debajo del umbral deseable',
      evidence: `Conversión actual ${formatPercent(overallConversion.current)} con ${formatNumber(quoteSummary.totalQuotes.current)} cotizaciones evaluables.`,
      explanation:
        'Muchas oportunidades no están llegando a factura publicada o tardan demasiado en materializarse.',
      recommendation:
        'Prioriza seguimiento a cotizaciones vencidas y analiza motivos de pérdida por vendedor.',
      detailKey: 'expiredQuotes',
    });
  }

  if (atRiskHighValueClients.length > 0) {
    hallazgos.push({
      id: 'clientes_valiosos_en_riesgo',
      level: 'critico',
      title: 'Hay clientes de alto valor en riesgo de abandono',
      evidence: `${atRiskHighValueClients.length} clientes concentran ${formatCurrency(sum(atRiskHighValueClients, (row) => row.revenue))} de historial y ya muestran señales de riesgo.`,
      explanation:
        'Perder estos clientes afectaría ventas recurrentes, retención y estabilidad de cartera.',
      recommendation:
        'Asigna seguimiento inmediato al vendedor responsable y prioriza reactivación comercial.',
      detailKey: 'atRiskClients',
    });
  }

  if (negativeMarginProducts.length > 0) {
    hallazgos.push({
      id: 'productos_margen_negativo',
      level: 'critico',
      title: 'Se detectaron productos con margen negativo',
      evidence: `${negativeMarginProducts.length} productos quedaron con margen menor a cero en el período.`,
      explanation:
        'Cada venta de esos productos puede estar destruyendo rentabilidad aún cuando aumente la facturación.',
      recommendation:
        'Revisa coste, precio de venta y políticas de descuento antes de seguir empujando esos productos.',
      detailKey: 'negativeMarginProducts',
    });
  }

  if (weakConversionSeller) {
    hallazgos.push({
      id: 'vendedor_baja_conversion',
      level: 'atencion',
      title: 'Un vendedor está por debajo del umbral mínimo de conversión',
      evidence: `${weakConversionSeller.sellerName} registra ${formatPercent(weakConversionSeller.conversionPct)} de conversión con ${formatNumber(weakConversionSeller.quotes)} cotizaciones, por debajo del objetivo de 50%.`,
      explanation:
        'El vendedor genera actividad comercial, pero no la transforma en cierre al mismo ritmo del resto.',
      recommendation:
        'Revisa cotizaciones vencidas, tiempos de respuesta y motivos de cancelación de ese ejecutivo.',
      detailKey: 'lowConversionSellers',
    });
  }

  if (invoicing.invoicedAmount.current + currentPeriod.start.getTime() !== 0) {
    const gap = sales.soldAmount.current - invoicing.invoicedAmount.current;
    if (Math.abs(gap) > Math.max(1, sales.soldAmount.current * 0.2)) {
      hallazgos.push({
        id: 'brecha_venta_facturacion',
        level: 'informativo',
        title: 'Existe una brecha relevante entre ventas confirmadas y facturación publicada',
        evidence: `Ventas ${formatCurrency(sales.soldAmount.current)} vs facturación ${formatCurrency(invoicing.invoicedAmount.current)}.`,
        explanation:
          'La diferencia puede indicar ventas aún no facturadas, notas de crédito o desfases operativos entre cierre comercial y facturación.',
        recommendation:
          'Cruza órdenes confirmadas recientes con facturas publicadas para identificar retrasos o devoluciones.',
        detailKey: 'postedInvoices',
      });
    }
  }

  return hallazgos.slice(0, 12);
}

function buildParetoSourceRowsFromCustomers(rows: ClientLifecycleRow[]) {
  return rows.map((row) => ({
    key: `${row.customerId ?? row.customerName}`,
    label: row.customerName,
    revenue: row.revenue,
    margin: row.margin,
    units: row.totalOrders,
    orders: row.totalOrders,
  }));
}

function buildParetoSourceRowsFromProducts(rows: ProductAnalysisRow[]) {
  return rows.map((row) => ({
    key: `${row.productId ?? row.productName}`,
    label: row.productName,
    revenue: row.revenue,
    margin: row.margin,
    units: row.units,
    orders: row.orderCount,
  }));
}

function buildParetoSourceRowsFromSellers(rows: SellerPerformanceRow[]) {
  return rows.map((row) => ({
    key: `${row.sellerId ?? row.sellerName}`,
    label: row.sellerName,
    revenue: row.invoicedAmount,
    margin: row.margin,
    units: row.confirmedOrders,
    orders: row.confirmedOrders,
  }));
}

function aggregateLinesByProduct(lines: OdooInvoiceLineRecord[], config: ReportsConfig) {
  const buckets = new Map<
    string,
    {
      productId: number | null;
      productName: string;
      categoryName: string | null;
      units: number;
      revenue: number;
      margin: number;
      orderSet: Set<number>;
      customerSet: Set<string>;
      repeatCustomers: number;
      customerOrderMap: Map<string, number>;
      marginPct: number | null;
      orderCount: number;
      uniqueCustomers: number;
      repeatPurchaseRate: number;
      averageTicket: number;
    }
  >();

  lines.forEach((line) => {
    const key = buildProductKey(line.productId, line.productName);
    const bucket = buckets.get(key) ?? {
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      units: 0,
      revenue: 0,
      margin: 0,
      orderSet: new Set<number>(),
      customerSet: new Set<string>(),
      repeatCustomers: 0,
      customerOrderMap: new Map<string, number>(),
      marginPct: null,
      orderCount: 0,
      uniqueCustomers: 0,
      repeatPurchaseRate: 0,
      averageTicket: 0,
    };

    bucket.units += line.quantity;
    bucket.revenue += line.untaxedAmount;
    bucket.margin += resolveInvoiceLineMargin(line, config);
    bucket.orderSet.add(line.invoiceId);
    const customerKey = buildCustomerKey(line.customerId, line.customerName);
    bucket.customerSet.add(customerKey);
    bucket.customerOrderMap.set(
      customerKey,
      (bucket.customerOrderMap.get(customerKey) ?? 0) + 1,
    );
    buckets.set(key, bucket);
  });

  [...buckets.values()].forEach((bucket) => {
    bucket.orderCount = bucket.orderSet.size;
    bucket.uniqueCustomers = bucket.customerSet.size;
    bucket.repeatCustomers = [...bucket.customerOrderMap.values()].filter((value) => value > 1).length;
    bucket.repeatPurchaseRate =
      bucket.uniqueCustomers > 0 ? (bucket.repeatCustomers / bucket.uniqueCustomers) * 100 : 0;
    bucket.averageTicket = bucket.orderCount > 0 ? bucket.revenue / bucket.orderCount : 0;
    bucket.marginPct = bucket.revenue > 0 ? (bucket.margin / bucket.revenue) * 100 : null;
  });

  return buckets;
}

function buildProductFlags({
  allBucket,
  currentBucket,
  previousBucket,
}: {
  allBucket: ReturnType<typeof aggregateLinesByProduct> extends Map<string, infer T> ? T : never;
  currentBucket: ReturnType<typeof aggregateLinesByProduct> extends Map<string, infer T> ? T | undefined : never;
  previousBucket: ReturnType<typeof aggregateLinesByProduct> extends Map<string, infer T> ? T | undefined : never;
}) {
  const flags: string[] = [];
  const currentRevenue = currentBucket?.revenue ?? 0;
  const currentMarginPct = currentBucket?.marginPct ?? null;
  const previousRevenue = previousBucket?.revenue ?? 0;
  if (currentMarginPct !== null && currentMarginPct < 0) flags.push('Margen negativo');
  if (currentRevenue > 0 && currentMarginPct !== null && currentMarginPct < 10) {
    flags.push('Alta facturación con bajo margen');
  }
  if (currentRevenue === 0 && allBucket.revenue > 0) flags.push('Sin ventas en el período');
  if (previousRevenue > currentRevenue && previousRevenue > 0) flags.push('Caida de ventas');
  if (currentRevenue > previousRevenue && previousRevenue > 0) flags.push('Crecimiento');
  return flags;
}

function buildGroupedKey(date: Date, grouping: ReportGrouping) {
  if (grouping === 'day') {
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }).format(date),
    };
  }

  if (grouping === 'month') {
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('es-MX', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }).format(date),
    };
  }

  if (grouping === 'quarter') {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return {
      key: `${date.getUTCFullYear()}-Q${quarter}`,
      label: `Q${quarter} ${date.getUTCFullYear()}`,
    };
  }

  return {
    key: `${date.getUTCFullYear()}`,
    label: `${date.getUTCFullYear()}`,
  };
}

function buildPeriodRange(startDate: string, endDate: string) {
  return {
    start: new Date(`${startDate}T00:00:00.000Z`),
    end: new Date(`${endDate}T23:59:59.999Z`),
  } satisfies PeriodRange;
}

function buildPreviousPeriodRange(current: PeriodRange) {
  if (isFullMonthPeriod(current)) {
    const previousMonthEnd = new Date(
      Date.UTC(current.start.getUTCFullYear(), current.start.getUTCMonth(), 0, 23, 59, 59, 999),
    );
    const previousMonthStart = new Date(
      Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    return {
      start: previousMonthStart,
      end: previousMonthEnd,
    } satisfies PeriodRange;
  }

  if (isFullQuarterPeriod(current)) {
    const quarterStartMonth = Math.floor(current.start.getUTCMonth() / 3) * 3;
    const previousQuarterStartMonth = quarterStartMonth - 3;
    return {
      start: new Date(
        Date.UTC(current.start.getUTCFullYear(), previousQuarterStartMonth, 1, 0, 0, 0, 0),
      ),
      end: new Date(
        Date.UTC(current.start.getUTCFullYear(), previousQuarterStartMonth + 3, 0, 23, 59, 59, 999),
      ),
    } satisfies PeriodRange;
  }

  if (isFullYearPeriod(current)) {
    return {
      start: new Date(Date.UTC(current.start.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(current.start.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999)),
    } satisfies PeriodRange;
  }

  const durationMs = current.end.getTime() - current.start.getTime() + 1;
  const previousEnd = new Date(current.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs + 1);
  return {
    start: previousStart,
    end: previousEnd,
  } satisfies PeriodRange;
}

function filterOrdersByDateAndState(
  orders: OdooOrderRecord[],
  range: PeriodRange,
  stateType: 'quotation' | 'confirmed' | 'cancelled',
) {
  return orders.filter((order) => {
    const dateValue =
      stateType === 'confirmed'
        ? order.confirmationDate
        : order.createDate ?? order.quotationDate;
    if (!isOdooDateValueInRange(dateValue, range)) return false;
    if (stateType === 'quotation') {
      return isQuotationState(order.state);
    }
    if (stateType === 'confirmed') return isConfirmedState(order.state);
    return order.state === 'cancel';
  });
}

function filterInvoicesByDate(invoices: OdooInvoiceRecord[], range: PeriodRange) {
  return invoices.filter((invoice) => {
    const date = parseRecordDate(invoice.invoiceDate);
    return date !== null && isDateInRange(date, range);
  });
}

function filterInvoiceLinesByDate(lines: OdooInvoiceLineRecord[], range: PeriodRange) {
  return lines.filter((line) => {
    const date = parseRecordDate(line.invoiceDate);
    return date !== null && isDateInRange(date, range);
  });
}

function classifyClientStatus({
  averagePurchaseGapDays,
  currentEnd,
  currentInvoices,
  currentRevenue,
  firstPurchase,
  isFirstPurchaseInRange,
  highValueCutoff,
  lastPurchase,
  orderCount,
  previousStatus,
  config,
}: {
  averagePurchaseGapDays: number | null;
  currentEnd: Date;
  currentInvoices: OdooInvoiceRecord[];
  currentRevenue: number;
  firstPurchase: Date | null;
  isFirstPurchaseInRange: boolean;
  highValueCutoff: number;
  lastPurchase: Date | null;
  orderCount: number;
  previousStatus: ClientStatus | null;
  config: ReportsConfig;
}) {
  if (!lastPurchase || !firstPurchase) return 'observacion';

  const daysSinceLast = diffDays(lastPurchase, currentEnd);
  const activeThreshold = adaptiveThreshold(
    config.clientActiveDays,
    averagePurchaseGapDays,
    1.1,
  );
  const riskThreshold = adaptiveThreshold(
    config.clientRiskDays,
    averagePurchaseGapDays,
    1.4,
  );
  const almostLostThreshold = adaptiveThreshold(
    config.clientAlmostLostDays,
    averagePurchaseGapDays,
    1.8,
  );
  const dormantThreshold = adaptiveThreshold(
    config.clientDormantDays,
    averagePurchaseGapDays,
    2.3,
  );
  const lostThreshold = adaptiveThreshold(
    config.clientLostDays,
    averagePurchaseGapDays,
    3,
  );

  const isNew = isFirstPurchaseInRange && currentInvoices.length > 0;
  const isFrequent =
    orderCount >= config.frequentPurchaseCount &&
    averagePurchaseGapDays !== null &&
    averagePurchaseGapDays <= activeThreshold;
  const isHighValue = currentRevenue >= highValueCutoff && highValueCutoff > 0;
  const isReactivated =
    currentInvoices.length > 0 &&
    previousStatus !== null &&
    ['dormido', 'perdido', 'casi_perdido'].includes(previousStatus);

  if (isReactivated) return 'reactivado';
  if (isNew) return 'nuevo';
  if (daysSinceLast >= lostThreshold) return 'perdido';
  if (daysSinceLast >= dormantThreshold) return 'dormido';
  if (daysSinceLast >= almostLostThreshold) return 'casi_perdido';
  if (daysSinceLast >= riskThreshold) return 'en_riesgo';
  if (daysSinceLast >= activeThreshold) return 'observacion';
  if (isHighValue) return 'alto_valor';
  if (isFrequent) return 'frecuente';
  return 'activo';
}

function mapStatusToRisk(status: ClientStatus): RiskLevel {
  if (status === 'perdido') return 'critico';
  if (status === 'dormido' || status === 'casi_perdido') return 'alto';
  if (status === 'en_riesgo' || status === 'observacion') return 'medio';
  return 'bajo';
}

function adaptiveThreshold(baseThreshold: number, averageGap: number | null, multiplier: number) {
  if (!averageGap || !Number.isFinite(averageGap) || averageGap <= 0) return baseThreshold;
  return Math.min(Math.max(baseThreshold * 0.65, averageGap * multiplier), baseThreshold * 2);
}

function summarizeRfmSegments(rows: ClientLifecycleRow[]) {
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    buckets.set(row.rfmSegment, (buckets.get(row.rfmSegment) ?? 0) + 1);
  });
  return [...buckets.entries()]
    .map(([segment, customers]) => ({ segment, customers }))
    .sort((left, right) => right.customers - left.customers);
}

function getRfmSegment({
  recency,
  frequency,
  monetary,
}: {
  recency: number;
  frequency: number;
  monetary: number;
}) {
  if (recency >= 4 && frequency >= 4 && monetary >= 4) return 'Mejores clientes';
  if (recency >= 3 && frequency >= 4) return 'Clientes leales';
  if (recency >= 4 && frequency >= 2 && monetary >= 2) return 'Potencialmente leales';
  if (recency >= 4 && frequency <= 2) return 'Clientes recientes';
  if (recency === 3 && monetary >= 4) return 'No se pueden perder';
  if (recency <= 2 && frequency >= 3) return 'Clientes en riesgo';
  if (recency <= 2 && monetary <= 2) return 'Clientes dormidos';
  return 'Clientes que necesitan atencion';
}

function quantileScores(values: number[], invert: boolean) {
  const sorted = [...values].sort((left, right) => left - right);
  return values.map((value) => {
    const percentile = ratio(sorted.findIndex((item) => item >= value), Math.max(sorted.length - 1, 1));
    const rawScore = Math.min(5, Math.max(1, Math.ceil(percentile * 5)));
    return invert ? 6 - rawScore : rawScore;
  });
}

function compareMetric(current: number, previous: number): MetricComparison {
  const difference = current - previous;
  const differencePct = calculatePctChange(current, previous);
  return {
    current,
    previous,
    difference,
    differencePct,
    trend: classifyTrend(differencePct),
  };
}

function calculatePctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function classifyTrend(differencePct: number | null): MetricTrend {
  if (differencePct === null || Math.abs(differencePct) < 0.5) return 'stable';
  return differencePct > 0 ? 'up' : 'down';
}

function calculateConversionPct(quotes: OdooOrderRecord[], confirmedOrders: OdooOrderRecord[]) {
  return ratio(confirmedOrders.length, confirmedOrders.length + quotes.length) * 100;
}

function isQuotationState(state: string) {
  return state === 'draft';
}

function isConfirmedState(state: string) {
  return state === 'sale';
}

function isExpiredQuote(order: OdooOrderRecord, referenceDate: Date) {
  if (!isQuotationState(order.state) || !order.validityDate) return false;
  const validityDate = parseRecordDate(order.validityDate);
  return validityDate !== null && validityDate < referenceDate;
}

function buildQuoteInvoiceIndex(
  invoices: OdooInvoiceRecord[],
  invoiceLines: OdooInvoiceLineRecord[],
) {
  const orderToInvoiceDate = new Map<string, Date>();

  const registerOrderInvoice = (orderName: string | null | undefined, invoiceDate: Date | null) => {
    const normalizedOrderName = normalizeDimensionText(orderName);
    if (!normalizedOrderName || !invoiceDate) return;
    const existing = orderToInvoiceDate.get(normalizedOrderName);
    if (!existing || invoiceDate < existing) {
      orderToInvoiceDate.set(normalizedOrderName, invoiceDate);
    }
  };

  invoices.forEach((invoice) => {
    const invoiceDate = parseRecordDate(invoice.invoiceDate);
    extractInvoiceOriginOrderNames(invoice.invoiceOrigin).forEach((orderName) => {
      registerOrderInvoice(orderName, invoiceDate);
    });
  });

  invoiceLines.forEach((line) => {
    const invoiceDate = parseRecordDate(line.invoiceDate);
    line.sourceOrderNames.forEach((orderName) => {
      registerOrderInvoice(orderName, invoiceDate);
    });
  });

  return orderToInvoiceDate;
}

function countDistinctBilledOrders(
  invoices: OdooInvoiceRecord[],
  invoiceLines: OdooInvoiceLineRecord[],
) {
  const billedOrderKeys = new Set<string>();
  const invoiceLinesByInvoiceId = groupBy(invoiceLines, (line) => `${line.invoiceId}`);

  invoices.forEach((invoice) => {
    collectBilledOrderKeysForInvoice(
      invoice,
      invoiceLinesByInvoiceId.get(`${invoice.id}`) ?? [],
    ).forEach((orderKey) => {
      billedOrderKeys.add(orderKey);
    });
  });

  return billedOrderKeys.size;
}

function collectBilledOrderKeysForInvoice(
  invoice: Pick<OdooInvoiceRecord, 'id' | 'invoiceOrigin'>,
  invoiceLines: Array<Pick<OdooInvoiceLineRecord, 'sourceOrderIds' | 'sourceOrderNames'>>,
) {
  const billedOrderKeys = new Set<string>();
  let hasExplicitOrderId = false;

  invoiceLines.forEach((line) => {
    line.sourceOrderIds.forEach((orderId) => {
      if (Number.isFinite(orderId)) {
        hasExplicitOrderId = true;
        billedOrderKeys.add(`id:${orderId}`);
      }
    });
  });

  if (!hasExplicitOrderId) {
    invoiceLines.forEach((line) => {
      line.sourceOrderNames.forEach((orderName) => {
        const normalizedName = normalizeDimensionText(orderName);
        if (normalizedName) {
          billedOrderKeys.add(`name:${normalizedName}`);
        }
      });
    });

    extractInvoiceOriginOrderNames(invoice.invoiceOrigin).forEach((orderName) => {
      const normalizedName = normalizeDimensionText(orderName);
      if (normalizedName) {
        billedOrderKeys.add(`name:${normalizedName}`);
      }
    });
  }

  if (billedOrderKeys.size === 0) {
    billedOrderKeys.add(`invoice:${invoice.id}`);
  }

  return billedOrderKeys;
}

function isQuoteConvertedByInvoice(
  quote: OdooOrderRecord,
  referenceDate: Date,
  quoteInvoiceIndex: Map<string, Date>,
) {
  const firstInvoiceDate = quoteInvoiceIndex.get(normalizeDimensionText(quote.name));
  return firstInvoiceDate !== undefined && firstInvoiceDate <= referenceDate;
}

function getInvoiceConversionDays(
  order: OdooOrderRecord,
  quoteInvoiceIndex: Map<string, Date>,
) {
  const quotationDate = parseRecordDate(order.quotationDate ?? order.createDate);
  const firstInvoiceDate = quoteInvoiceIndex.get(normalizeDimensionText(order.name));
  if (!quotationDate || !firstInvoiceDate) return null;
  return diffDays(quotationDate, firstInvoiceDate);
}

function extractInvoiceOriginOrderNames(origin: string | null) {
  if (!origin) return [];
  return origin
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getQuoteDimension(
  quote: OdooOrderRecord,
  dimension: ConversionDimension,
): ConversionDimensionDescriptor {
  if (dimension === 'sellerName') {
    return {
      key: buildSellerKey(quote.sellerId, quote.sellerName),
      label: quote.sellerName || 'Sin vendedor',
      sortOrder: 0,
    };
  }
  if (dimension === 'customerName') {
    return {
      key: buildCustomerKey(quote.customerId, quote.customerName),
      label: quote.customerName || 'Sin cliente',
      sortOrder: 0,
    };
  }
  if (dimension === 'teamName') {
    return {
      key: buildTeamKey(quote.teamId, quote.teamName),
      label: quote.teamName || 'Sin equipo',
      sortOrder: 0,
    };
  }
  if (dimension === 'quotationMonth') {
    const date = parseRecordDate(quote.quotationDate ?? quote.createDate);
    if (!date) {
      return {
        key: 'sin-fecha',
        label: 'Sin fecha',
        sortOrder: Number.MAX_SAFE_INTEGER,
      };
    }
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('es-MX', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date),
      sortOrder: date.getUTCFullYear() * 100 + date.getUTCMonth(),
    };
  }

  const amount = quote.amountUntaxed;
  if (amount < 1000) return { key: 'range-0', label: 'Hasta 1 mil', sortOrder: 0 };
  if (amount < 5000) return { key: 'range-1', label: '1 mil a 5 mil', sortOrder: 1 };
  if (amount < 20000) return { key: 'range-2', label: '5 mil a 20 mil', sortOrder: 2 };
  return { key: 'range-3', label: '20 mil o más', sortOrder: 3 };
}

function countProductQuadrants(rows: ProductAnalysisRow[]) {
  return rows.reduce(
    (accumulator, row) => ({
      ...accumulator,
      [row.quadrant]: accumulator[row.quadrant] + 1,
    }),
    {
      alta_venta_alto_margen: 0,
      alta_venta_bajo_margen: 0,
      baja_venta_alto_margen: 0,
      baja_venta_bajo_margen: 0,
    } as Record<ProductQuadrant, number>,
  );
}

function classifyProductQuadrant(
  revenue: number,
  marginPct: number | null,
  revenueMedian: number,
  marginMedian: number,
): ProductQuadrant {
  const highRevenue = revenue >= revenueMedian;
  const highMargin = (marginPct ?? 0) >= marginMedian;
  if (highRevenue && highMargin) return 'alta_venta_alto_margen';
  if (highRevenue && !highMargin) return 'alta_venta_bajo_margen';
  if (!highRevenue && highMargin) return 'baja_venta_alto_margen';
  return 'baja_venta_bajo_margen';
}

function calculatePreviousRetention(invoices: OdooInvoiceRecord[], previousPeriod: PeriodRange) {
  const previousCustomers = new Set(
    filterInvoicesByDate(invoices, previousPeriod).map((invoice) =>
      buildCustomerKey(invoice.customerId, invoice.customerName),
    ),
  );
  const earlierPeriod = buildPreviousPeriodRange(previousPeriod);
  const earlierCustomers = new Set(
    filterInvoicesByDate(invoices, earlierPeriod).map((invoice) =>
      buildCustomerKey(invoice.customerId, invoice.customerName),
    ),
  );
  const retained = [...previousCustomers].filter((customer) =>
    earlierCustomers.has(customer),
  ).length;
  return ratio(retained, earlierCustomers.size) * 100;
}

function calculatePreviousRepurchase(invoices: OdooInvoiceRecord[], previousPeriod: PeriodRange) {
  const previousConfirmed = filterInvoicesByDate(invoices, previousPeriod);
  const counts = new Map<string, number>();
  previousConfirmed.forEach((invoice) => {
    const key = buildCustomerKey(invoice.customerId, invoice.customerName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return ratio(
    [...counts.values()].filter((count) => count > 1).length,
    counts.size,
  ) * 100;
}

function calculatePreviousReactivation(rows: ClientLifecycleRow[], referenceDate: Date) {
  return ratio(
    rows.filter(
      (row) =>
        row.previousStatus !== null &&
        ['dormido', 'perdido'].includes(row.previousStatus) &&
        row.lastPurchaseDate !== null &&
        new Date(row.lastPurchaseDate) <= referenceDate,
    ).length,
    rows.length,
  ) * 100;
}

function sortConversionRows(
  left: ConversionRow & { sortOrder?: number },
  right: ConversionRow & { sortOrder?: number },
  dimension: ConversionDimension,
) {
  if (dimension === 'quotationMonth' || dimension === 'amountRange') {
    return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  }
  if (right.converted !== left.converted) return right.converted - left.converted;
  if (right.conversionPct !== left.conversionPct) return right.conversionPct - left.conversionPct;
  if (right.quotes !== left.quotes) return right.quotes - left.quotes;
  return compareLabels(left.label, right.label);
}

function compareLabels(left: string, right: string) {
  return left.localeCompare(right, 'es-MX', { sensitivity: 'base', numeric: true });
}

function pickPreferredLabel(current: string, next: string) {
  const normalizedCurrent = normalizeDimensionText(current);
  if (!normalizedCurrent || normalizedCurrent.startsWith('SIN ')) return next;
  return current;
}

function normalizeDimensionText(value: string | null | undefined) {
  return `${value ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function buildEntityKey(id: number | null, label: string | null | undefined, fallback: string) {
  if (id !== null) return `id:${id}`;
  const normalizedLabel = normalizeDimensionText(label || fallback);
  return `txt:${normalizedLabel || normalizeDimensionText(fallback)}`;
}

function buildCustomerKey(customerId: number | null, customerName: string | null | undefined) {
  return buildEntityKey(customerId, customerName, 'Sin cliente');
}

function buildSellerKey(sellerId: number | null, sellerName: string | null | undefined) {
  return buildEntityKey(sellerId, sellerName, 'Sin vendedor');
}

function buildTeamKey(teamId: number | null, teamName: string | null | undefined) {
  return buildEntityKey(teamId, teamName, 'Sin equipo');
}

function buildProductKey(productId: number | null, productName: string | null | undefined) {
  return buildEntityKey(productId, productName, 'Producto sin nombre');
}

function isFullMonthPeriod(period: PeriodRange) {
  return (
    period.start.getUTCDate() === 1 &&
    period.end.getUTCFullYear() === period.start.getUTCFullYear() &&
    period.end.getUTCMonth() === period.start.getUTCMonth() &&
    period.end.getUTCDate() ===
      new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

function isFullQuarterPeriod(period: PeriodRange) {
  const quarterStartMonth = Math.floor(period.start.getUTCMonth() / 3) * 3;
  return (
    period.start.getUTCDate() === 1 &&
    period.start.getUTCMonth() === quarterStartMonth &&
    period.end.getUTCMonth() === quarterStartMonth + 2 &&
    period.end.getUTCDate() ===
      new Date(Date.UTC(period.end.getUTCFullYear(), period.end.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

function isFullYearPeriod(period: PeriodRange) {
  return (
    period.start.getUTCMonth() === 0 &&
    period.start.getUTCDate() === 1 &&
    period.end.getUTCMonth() === 11 &&
    period.end.getUTCDate() === 31
  );
}

function getSignificantSellerOrderThreshold(rows: SellerPerformanceRow[]) {
  const activeRows = rows.filter((row) => row.confirmedOrders > 0);
  if (activeRows.length === 0) return 1;
  const averageOrders = average(activeRows.map((row) => row.confirmedOrders));
  return Math.max(2, Math.ceil(averageOrders * 0.3));
}

function filterSignificantSellerRows(rows: SellerPerformanceRow[], minOrderThreshold: number) {
  const filtered = rows.filter((row) => row.confirmedOrders >= minOrderThreshold);
  return filtered.length > 0 ? filtered : rows;
}

function sanitizeConfig(config: ReportsConfig) {
  const sumWeights =
    config.sellerRankingWeights.sold_amount +
    config.sellerRankingWeights.margin +
    config.sellerRankingWeights.conversion +
    config.sellerRankingWeights.new_customers +
    config.sellerRankingWeights.retention;

  const sanitizedGoals = Array.isArray(config.sellerGoals)
    ? config.sellerGoals.map((goal) => ({
        sellerId: goal.sellerId ?? null,
        sellerName: goal.sellerName ?? 'Sin vendedor',
        salesTarget: Math.max(0, Number(goal.salesTarget) || 0),
        newCustomersTarget: Math.max(0, Number(goal.newCustomersTarget) || 0),
        reactivatedCustomersTarget: Math.max(0, Number(goal.reactivatedCustomersTarget) || 0),
      }))
    : [];

  if (sumWeights === 100) {
    return {
      ...config,
      sellerGoals: sanitizedGoals,
    };
  }

  return {
    ...config,
    sellerRankingWeights: {
      sold_amount: 30,
      margin: 25,
      conversion: 20,
      new_customers: 15,
      retention: 10,
    },
    sellerGoals: sanitizedGoals,
  };
}

function normalizeWeight(value: number) {
  return value / 100;
}

function resolveInvoiceLineMargin(line: OdooInvoiceLineRecord, config: ReportsConfig) {
  if (
    config.marginMethod === 'line_purchase_price' &&
    line.linePurchaseUnitCost !== null &&
    line.linePurchaseUnitCost !== undefined
  ) {
    return line.untaxedAmount - line.linePurchaseUnitCost * line.quantity;
  }

  if (
    config.marginMethod === 'product_standard_cost' &&
    line.standardUnitCost !== null &&
    line.standardUnitCost !== undefined
  ) {
    return line.untaxedAmount - line.standardUnitCost * line.quantity;
  }

  if (line.marginAmount !== null && line.marginAmount !== undefined) return line.marginAmount;
  if (line.costAmount !== null && line.costAmount !== undefined) {
    return line.untaxedAmount - line.costAmount;
  }
  return 0;
}

function orderAmount(order: OdooOrderRecord, config: ReportsConfig) {
  return config.includeTaxes ? order.amountTotal : order.amountUntaxed;
}

function invoiceAmount(invoice: OdooInvoiceRecord, config: ReportsConfig) {
  return config.includeTaxes ? invoice.totalAmountSigned : invoice.untaxedAmountSigned;
}

function metricValue(
  row: {
    revenue: number;
    margin: number;
    units: number;
    orders: number;
  },
  metric: ParetoMetricKey,
) {
  if (metric === 'margin') return row.margin;
  if (metric === 'units') return row.units;
  if (metric === 'orders') return row.orders;
  return row.revenue;
}

function getParetoTitle(dimension: 'customers' | 'products' | 'sellers') {
  if (dimension === 'customers') return 'Pareto de clientes';
  if (dimension === 'products') return 'Pareto de productos';
  return 'Pareto de vendedores';
}

function parseRecordDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(date: Date, range: PeriodRange) {
  return date >= range.start && date <= range.end;
}

const reportTimeZone = 'America/Mexico_City';

function isOdooDateValueInRange(value: string | null | undefined, range: PeriodRange) {
  const dateKey = getOdooDateKey(value);
  if (!dateKey) return false;
  return dateKey >= getUtcDateKey(range.start) && dateKey <= getUtcDateKey(range.end);
}

function getOdooDateKey(value: string | null | undefined) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const date = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateKeyInReportTimeZone(date);
}

function getUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateKeyInReportTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: reportTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function diffDays(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return sum(values, (value) => value) / values.length;
}

function averageIntervals(dates: Date[]) {
  if (dates.length < 2) return null;
  const ordered = dates.slice().sort((left, right) => left.getTime() - right.getTime());
  const gaps: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    gaps.push(diffDays(ordered[index - 1], ordered[index]));
  }
  return average(gaps);
}

function sum<T>(values: T[], getter: (value: T) => number) {
  return values.reduce((total, value) => total + getter(value), 0);
}

function ratio(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return part / total;
}

function groupBy<T>(values: T[], keyGetter: (value: T) => string) {
  return values.reduce((map, value) => {
    const key = keyGetter(value);
    const bucket = map.get(key) ?? [];
    bucket.push(value);
    map.set(key, bucket);
    return map;
  }, new Map<string, T[]>());
}

function countDistinct(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const ordered = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 0) {
    return (ordered[middle - 1] + ordered[middle]) / 2;
  }
  return ordered[middle];
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) return 0;
  const ordered = values.slice().sort((left, right) => left - right);
  const position = Math.min(
    ordered.length - 1,
    Math.max(0, Math.floor(percentile * (ordered.length - 1))),
  );
  return ordered[position];
}

function minDate(values: Date[]) {
  if (values.length === 0) return null;
  return new Date(Math.min(...values.map((value) => value.getTime())));
}

function maxDate(values: Date[]) {
  if (values.length === 0) return null;
  return new Date(Math.max(...values.map((value) => value.getTime())));
}

function countByStatusAtPeriod(
  rows: ClientLifecycleRow[],
  status: ClientStatus,
  referenceDate: Date,
) {
  return rows.filter(
    (row) =>
      row.previousStatus === status &&
      row.lastPurchaseDate !== null &&
      new Date(row.lastPurchaseDate) <= referenceDate,
  ).length;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateLabel(value: Date) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}
