export type ReportVisibilityScope = 'all' | 'own';
export type ReportStateScope = 'all' | 'quotation' | 'confirmed' | 'cancelled';
export type ReportGrouping = 'day' | 'month' | 'quarter' | 'year';
export type ReportRequestedDomain = 'sales' | 'purchases' | 'all';
export type ParetoMetricKey = 'revenue' | 'margin' | 'units' | 'orders';
export type RankingMetricKey =
  | 'quotes'
  | 'confirmed_orders'
  | 'conversion'
  | 'sold_amount'
  | 'invoiced_amount'
  | 'margin'
  | 'margin_pct'
  | 'avg_ticket'
  | 'new_customers'
  | 'reactivated_customers'
  | 'retention';

export type SellerGoalConfig = {
  sellerId: number | null;
  sellerName: string;
  salesTarget: number;
  newCustomersTarget: number;
  reactivatedCustomersTarget: number;
};

export type MonthlySalesGoalConfig = {
  year: number;
  month: number;
  targetAmount: number;
};

export type ReportFilters = {
  startDate: string;
  endDate: string;
  companyId: number | null;
  companyIds?: number[];
  sellerId: number | null;
  sellerIds?: number[];
  teamId: number | null;
  customerId: number | null;
  productId: number | null;
  categoryId: number | null;
  currencyCode: string | null;
  channel: string | null;
  stateScope: ReportStateScope;
  grouping: ReportGrouping;
  visibilityScope: ReportVisibilityScope;
};

export type ReportsConfig = {
  clientRecentDays: number;
  clientActiveDays: number;
  clientRiskDays: number;
  clientAlmostLostDays: number;
  clientDormantDays: number;
  clientLostDays: number;
  frequentPurchaseCount: number;
  highValuePercentile: number;
  paretoThresholdA: number;
  paretoThresholdB: number;
  defaultParetoMetric: ParetoMetricKey;
  defaultGrouping: ReportGrouping;
  compareWithPrevious: boolean;
  includeTaxes: boolean;
  sellerRankingWeights: Record<
    Extract<
      RankingMetricKey,
      'sold_amount' | 'margin' | 'conversion' | 'new_customers' | 'retention'
    >,
    number
  >;
  sellerGoals: SellerGoalConfig[];
  monthlySalesGoals: MonthlySalesGoalConfig[];
  marginMethod: 'line_margin' | 'line_purchase_price' | 'product_standard_cost';
};

export type ReportOption = {
  id: number | string;
  label: string;
};

export type OdooOrderRecord = {
  id: number;
  name: string;
  state: string;
  createDate: string | null;
  quotationDate: string | null;
  confirmationDate: string | null;
  validityDate: string | null;
  customerId: number | null;
  customerName: string;
  deliveryCustomerId: number | null;
  deliveryCustomerName: string | null;
  sellerId: number | null;
  sellerName: string;
  teamId: number | null;
  teamName: string | null;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  amountUntaxed: number;
  amountTotal: number;
  invoiceStatus: string | null;
  channel: string | null;
  origin: string | null;
};

export type OdooOrderLineRecord = {
  id: number;
  orderId: number;
  orderName: string;
  orderState: string;
  customerId: number | null;
  customerName: string;
  deliveryCustomerId: number | null;
  deliveryCustomerName: string | null;
  sellerId: number | null;
  sellerName: string;
  teamId: number | null;
  teamName: string | null;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  quotationDate: string | null;
  confirmationDate: string | null;
  productId: number | null;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  quantity: number;
  untaxedAmount: number;
  totalAmount: number;
  unitCost: number | null;
  costAmount: number | null;
  marginAmount: number | null;
  lineMarginValue: number | null;
  linePurchaseUnitCost: number | null;
  standardUnitCost: number | null;
  discount: number | null;
};

export type OdooInvoiceRecord = {
  id: number;
  name: string;
  state: string;
  moveType: string;
  invoiceDate: string | null;
  customerId: number | null;
  customerName: string;
  deliveryCustomerId: number | null;
  deliveryCustomerName: string | null;
  sellerId: number | null;
  sellerName: string;
  teamId: number | null;
  teamName: string | null;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  untaxedAmountSigned: number;
  totalAmountSigned: number;
  invoiceOrigin: string | null;
  paymentState: string | null;
};

export type OdooInvoiceLineRecord = {
  id: number;
  invoiceId: number;
  invoiceName: string;
  invoiceState: string;
  moveType: string;
  invoiceDate: string | null;
  customerId: number | null;
  customerName: string;
  deliveryCustomerId: number | null;
  deliveryCustomerName: string | null;
  sellerId: number | null;
  sellerName: string;
  teamId: number | null;
  teamName: string | null;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  productId: number | null;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  quantity: number;
  untaxedAmount: number;
  totalAmount: number;
  unitCost: number | null;
  costAmount: number | null;
  marginAmount: number | null;
  linePurchaseUnitCost: number | null;
  standardUnitCost: number | null;
  discount: number | null;
  displayType: string | null;
  sourceOrderIds: number[];
  sourceOrderNames: string[];
  sourceSaleLineIds: number[];
};

export type OdooCustomerFirstPurchaseRecord = {
  customerId: number | null;
  customerName: string;
  sellerId: number | null;
  sellerName: string;
  invoiceDate: string | null;
};

export type OdooCustomerContactRecord = {
  customerId: number;
  customerName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  stateName: string | null;
  zip: string | null;
  countryName: string | null;
  commercialPartnerId: number | null;
  commercialPartnerName: string | null;
};

export type OdooCrmLeadRecord = {
  id: number;
  name: string;
  type: 'lead' | 'opportunity' | string;
  active: boolean;
  createDate: string | null;
  writeDate: string | null;
  deadlineDate: string | null;
  closedDate: string | null;
  customerId: number | null;
  customerName: string | null;
  sellerId: number | null;
  sellerName: string | null;
  teamId: number | null;
  teamName: string | null;
  companyId: number | null;
  companyName: string | null;
  stageId: number | null;
  stageName: string | null;
  expectedRevenue: number;
  probability: number;
  priority: string | null;
  emailFrom: string | null;
  phone: string | null;
};

export type OdooPurchaseOrderRecord = {
  id: number;
  name: string;
  state: string;
  createDate: string | null;
  orderDate: string | null;
  approvalDate: string | null;
  supplierId: number | null;
  supplierName: string;
  buyerId: number | null;
  buyerName: string;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  amountUntaxed: number;
  amountTotal: number;
  invoiceStatus: string | null;
  origin: string | null;
};

export type OdooPurchaseOrderLineRecord = {
  id: number;
  orderId: number;
  orderName: string;
  orderState: string;
  supplierId: number | null;
  supplierName: string;
  buyerId: number | null;
  buyerName: string;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  orderDate: string | null;
  approvalDate: string | null;
  productId: number | null;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  quantity: number;
  untaxedAmount: number;
  totalAmount: number;
  unitCost: number | null;
  discount: number | null;
};

export type OdooVendorBillRecord = {
  id: number;
  name: string;
  state: string;
  moveType: string;
  invoiceDate: string | null;
  supplierId: number | null;
  supplierName: string;
  buyerId: number | null;
  buyerName: string;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  untaxedAmountSigned: number;
  totalAmountSigned: number;
  invoiceOrigin: string | null;
  paymentState: string | null;
};

export type OdooVendorBillLineRecord = {
  id: number;
  invoiceId: number;
  invoiceName: string;
  invoiceState: string;
  moveType: string;
  invoiceDate: string | null;
  supplierId: number | null;
  supplierName: string;
  buyerId: number | null;
  buyerName: string;
  companyId: number | null;
  companyName: string | null;
  currencyCode: string | null;
  productId: number | null;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  quantity: number;
  untaxedAmount: number;
  totalAmount: number;
  purchaseLineIds: number[];
  sourceOrderIds: number[];
  sourceOrderNames: string[];
  discount: number | null;
  displayType: string | null;
};

export type ReportDrillLink = {
  model: string;
  recordId: number;
  label: string;
  url: string | null;
};

export type OdooCommercialDataset = {
  database: string;
  fetchedAt: string;
  odooBaseUrl: string;
  scopeApplied: ReportVisibilityScope;
  viewerRole?: string | null;
  companyScope?: ReportOption | null;
  sellerScope?: ReportOption | null;
  warnings: string[];
  dataQualityAlerts: string[];
  configDefaults: ReportsConfig;
  availableFilters: {
    companies: ReportOption[];
    sellers: ReportOption[];
    teams: ReportOption[];
    customers: ReportOption[];
    products: ReportOption[];
    categories: ReportOption[];
    currencies: ReportOption[];
    channels: ReportOption[];
  };
  orders: OdooOrderRecord[];
  orderLines: OdooOrderLineRecord[];
  invoices: OdooInvoiceRecord[];
  invoiceLines: OdooInvoiceLineRecord[];
  customerFirstPurchases: OdooCustomerFirstPurchaseRecord[];
  customerContacts: OdooCustomerContactRecord[];
  crmLeads: OdooCrmLeadRecord[];
  purchaseOrders: OdooPurchaseOrderRecord[];
  purchaseOrderLines: OdooPurchaseOrderLineRecord[];
  vendorBills: OdooVendorBillRecord[];
  vendorBillLines: OdooVendorBillLineRecord[];
  drillLinks: Record<string, ReportDrillLink[]>;
};

type FetchCommercialDatasetOptions = {
  apiKey: string;
  filters: ReportFilters;
  loadMode?: 'fast' | 'full';
  odooUrl: string;
  requestedDomain?: ReportRequestedDomain;
  user: string;
  viewerEmail?: string | null;
};

type JsonRpcResponse<T> = {
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: {
      name?: string;
      message?: string;
    };
  };
};

type OdooFieldMeta = Record<string, { string?: string; type?: string }>;
type OdooFieldCandidate = string | null;
type OdooReadMethod = 'search_read' | 'fields_get' | 'read_group';
type ProductCatalogEntry = {
  categoryId: number | null;
  categoryName: string | null;
  standardCost: number | null;
};

const SEARCH_READ_PAGE_SIZE = 1000;
const SEARCH_READ_CHUNK_SIZE = 500;
const FALLBACK_HISTORY_DAYS = 730;
const READ_ONLY_ODOO_METHODS = new Set<OdooReadMethod>(['search_read', 'fields_get', 'read_group']);

export const defaultReportsConfig: ReportsConfig = {
  clientRecentDays: 30,
  clientActiveDays: 45,
  clientRiskDays: 75,
  clientAlmostLostDays: 105,
  clientDormantDays: 150,
  clientLostDays: 240,
  frequentPurchaseCount: 4,
  highValuePercentile: 0.85,
  paretoThresholdA: 0.8,
  paretoThresholdB: 0.95,
  defaultParetoMetric: 'revenue',
  defaultGrouping: 'day',
  compareWithPrevious: true,
  includeTaxes: false,
  sellerRankingWeights: {
    sold_amount: 30,
    margin: 25,
    conversion: 20,
    new_customers: 15,
    retention: 10,
  },
  sellerGoals: [],
  monthlySalesGoals: [],
  marginMethod: 'product_standard_cost',
};

export async function fetchCommercialDataset(
  options: FetchCommercialDatasetOptions,
): Promise<OdooCommercialDataset> {
  const odooUrl = options.odooUrl.trim();
  const user = options.user.trim();
  const apiKey = options.apiKey.trim();
  const includePurchases = options.requestedDomain === 'all';

  if (!odooUrl || !user || !apiKey) {
    throw new Error(
      'Faltan ODOO_URL, USER_ODOO o API_KEY_ODOO para generar el dashboard comercial.',
    );
  }

  const database = await resolveDatabaseName(odooUrl);
  const uid = await authenticateAgainstOdoo({ apiKey, database, odooUrl, user });
  const warnings: string[] = [];
  const dataQualityAlerts: string[] = [];
  const historyStart = calculateHistoryStart(options.filters, options.loadMode);
  const recentOrdersStart = calculateRecentOrdersStart(options.filters);

  const orderMeta = await getModelFields({
    apiKey,
    database,
    model: 'sale.order',
    odooUrl,
    uid,
  });
  const lineMeta = await getModelFields({
    apiKey,
    database,
    model: 'sale.order.line',
    odooUrl,
    uid,
  });
  const invoiceMeta = await getModelFields({
    apiKey,
    database,
    model: 'account.move',
    odooUrl,
    uid,
  });
  const invoiceLineMeta = await getModelFields({
    apiKey,
    database,
    model: 'account.move.line',
    odooUrl,
    uid,
  });
  const purchaseMeta = includePurchases
    ? await getModelFields({
        apiKey,
        database,
        model: 'purchase.order',
        odooUrl,
        uid,
      })
    : ({} as OdooFieldMeta);
  const purchaseLineMeta = includePurchases
    ? await getModelFields({
        apiKey,
        database,
        model: 'purchase.order.line',
        odooUrl,
        uid,
      })
    : ({} as OdooFieldMeta);

  const confirmationDateField =
    pickFirstAvailable(orderMeta, ['date_order']) ??
    pickFirstAvailable(orderMeta, ['write_date']) ??
    pickFirstAvailable(orderMeta, ['create_date']);
  const quotationDateField = pickFirstAvailable(orderMeta, ['create_date']);
  const orderCreationField = pickFirstAvailable(orderMeta, ['create_date']);
  const orderConfirmationTimelineField = pickFirstAvailable(orderMeta, ['date_order']);
  const orderShippingField = pickFirstAvailable(orderMeta, ['partner_shipping_id']);
  const channelField = pickFirstAvailable(orderMeta, [
    'source_id',
    'medium_id',
    'campaign_id',
    'origin',
  ]);
  const lineMarginField = pickFirstAvailable(lineMeta, ['margin']);
  const linePurchasePriceField = pickFirstAvailable(lineMeta, ['purchase_price']);
  const lineCategoryField =
    pickFirstAvailable(lineMeta, ['categ_id']) ??
    pickFirstAvailable(lineMeta, ['product_categ_id']);
  const invoiceSellerField =
    pickFirstAvailable(invoiceMeta, ['invoice_user_id']) ??
    pickFirstAvailable(invoiceMeta, ['user_id']);
  const invoiceTeamField = pickFirstAvailable(invoiceMeta, ['team_id']);
  const invoiceShippingField = pickFirstAvailable(invoiceMeta, ['partner_shipping_id']);
  const invoiceLineCategoryField =
    pickFirstAvailable(invoiceLineMeta, ['product_categ_id']) ??
    pickFirstAvailable(invoiceLineMeta, ['product_category_id']) ??
    pickFirstAvailable(invoiceLineMeta, ['categ_id']);
  const invoiceLineSaleLineField = pickFirstAvailable(invoiceLineMeta, ['sale_line_ids']);
  const invoiceLineMarginField = pickFirstAvailable(invoiceLineMeta, ['margin']);
  const invoiceLinePurchasePriceField = pickFirstAvailable(invoiceLineMeta, ['purchase_price']);
  const purchaseOrderDateField =
    pickFirstAvailable(purchaseMeta, ['date_order']) ??
    pickFirstAvailable(purchaseMeta, ['create_date']);
  const purchaseApprovalDateField =
    pickFirstAvailable(purchaseMeta, ['date_approve']) ??
    pickFirstAvailable(purchaseMeta, ['write_date']) ??
    purchaseOrderDateField;
  const purchaseTimelineField = purchaseApprovalDateField ?? purchaseOrderDateField;
  const purchaseLineCategoryField =
    pickFirstAvailable(purchaseLineMeta, ['categ_id']) ??
    pickFirstAvailable(purchaseLineMeta, ['product_categ_id']);
  const vendorBillPurchaseLineField = pickFirstAvailable(invoiceLineMeta, [
    'purchase_line_id',
    'purchase_line_ids',
  ]);

  if (!('date_order' in orderMeta)) {
    warnings.push(
      'La instancia no expone date_order en sale.order. Para ventas confirmadas se usara el mejor campo disponible entre write_date y create_date.',
    );
  }

  if (!lineMarginField) {
    warnings.push(
      'La linea de venta no expone un margen directo. El margen se estimara con coste de linea o coste estandar del producto.',
    );
  }

  if (!invoiceLineMarginField && !invoiceLinePurchasePriceField) {
    warnings.push(
      'Las lineas contables facturadas no exponen margen ni coste unitario directo. El margen se reconciliara con la linea de venta relacionada o con el coste estandar del producto.',
    );
  }

  if (includePurchases && !purchaseTimelineField) {
    warnings.push(
      'Las compras no exponen un campo claro de aprobacion. El analisis de compra usara date_order o create_date segun disponibilidad.',
    );
  }

  const orderFields = uniqueFields([
    'id',
    'name',
    'state',
    'create_date',
    quotationDateField,
    confirmationDateField,
    pickFirstAvailable(orderMeta, ['validity_date']),
    'partner_id',
    orderShippingField,
    'user_id',
    'team_id',
    'company_id',
    'currency_id',
    'amount_untaxed',
    'amount_total',
    pickFirstAvailable(orderMeta, ['invoice_status']),
    channelField,
    pickFirstAvailable(orderMeta, ['origin']),
  ]);

  const recentOrdersDomain = buildOrderDomain({
    endDate: options.filters.endDate,
    filters: options.filters,
    orderDateField: orderCreationField,
    startDate: recentOrdersStart,
    viewerEmail: options.viewerEmail ?? '',
    visibilityScope: options.filters.visibilityScope,
  });

  const recentOrdersRaw = await searchReadAllPages({
    apiKey,
    database,
    domain: recentOrdersDomain,
    fields: orderFields,
    model: 'sale.order',
    odooUrl,
    order: 'create_date desc, id desc',
    uid,
  });
  const recentConfirmedOrdersRaw =
    orderConfirmationTimelineField && orderConfirmationTimelineField !== orderCreationField
      ? await searchReadAllPages({
          apiKey,
          database,
          domain: buildOrderDomain({
            endDate: options.filters.endDate,
            filters: options.filters,
            forcedStateScope: 'confirmed',
            orderDateField: orderConfirmationTimelineField,
            startDate: recentOrdersStart,
            viewerEmail: options.viewerEmail ?? '',
            visibilityScope: options.filters.visibilityScope,
          }),
          fields: orderFields,
          model: 'sale.order',
          odooUrl,
          order: 'date_order desc, id desc',
          uid,
        })
      : [];

  const historicalConfirmedOrdersRaw =
    options.filters.stateScope === 'quotation' || options.filters.stateScope === 'cancelled'
      ? []
      : historyStart < recentOrdersStart
        ? await searchReadAllPages({
            apiKey,
            database,
            domain: buildOrderDomain({
              endDate: previousDay(recentOrdersStart),
              filters: options.filters,
              forcedStateScope: 'confirmed',
              orderDateField: orderConfirmationTimelineField ?? orderCreationField,
              startDate: historyStart,
              viewerEmail: options.viewerEmail ?? '',
              visibilityScope: options.filters.visibilityScope,
            }),
            fields: orderFields,
            model: 'sale.order',
            odooUrl,
            order: 'create_date desc, id desc',
            uid,
          })
        : [];

  const ordersRaw = mergeRecordsById([
    ...recentOrdersRaw,
    ...recentConfirmedOrdersRaw,
    ...historicalConfirmedOrdersRaw,
  ]);

  const orderIds = ordersRaw.map((row) => Number(row.id)).filter(Number.isFinite);

  const lineFields = uniqueFields([
    'id',
    'order_id',
    'product_id',
    lineCategoryField,
    'product_uom_qty',
    'price_subtotal',
    'price_total',
    lineMarginField,
    linePurchasePriceField,
    'discount',
  ]);

  const linesRaw = orderIds.length
    ? await searchReadByChunks({
        apiKey,
        chunkIds: orderIds,
        database,
        fields: lineFields,
        idField: 'order_id',
        model: 'sale.order.line',
        odooUrl,
        uid,
      })
    : [];

  const purchaseOrderFields = includePurchases
    ? uniqueFields([
        'id',
        'name',
        'state',
        'create_date',
        purchaseOrderDateField,
        purchaseApprovalDateField,
        'partner_id',
        'user_id',
        'company_id',
        'currency_id',
        'amount_untaxed',
        'amount_total',
        pickFirstAvailable(purchaseMeta, ['invoice_status']),
        pickFirstAvailable(purchaseMeta, ['origin']),
      ])
    : [];

  const purchaseOrdersRaw = includePurchases
    ? await searchReadAllPages({
        apiKey,
        database,
        domain: buildPurchaseOrderDomain({
          endDate: options.filters.endDate,
          filters: options.filters,
          historyStart,
          purchaseDateField: purchaseTimelineField,
          viewerEmail: options.viewerEmail ?? '',
          visibilityScope: options.filters.visibilityScope,
        }),
        fields: purchaseOrderFields,
        model: 'purchase.order',
        odooUrl,
        order: 'date_approve desc, date_order desc, id desc',
        uid,
      })
    : [];

  const purchaseOrderIds = purchaseOrdersRaw
    .map((row) => Number(row.id))
    .filter(Number.isFinite);
  const purchaseLineFields = includePurchases
    ? uniqueFields([
        'id',
        'order_id',
        'product_id',
        purchaseLineCategoryField,
        'product_qty',
        'price_subtotal',
        'price_total',
        'discount',
      ])
    : [];

  const purchaseLinesRaw =
    includePurchases && purchaseOrderIds.length
      ? await searchReadByChunks({
          apiKey,
          chunkIds: purchaseOrderIds,
          database,
          fields: purchaseLineFields,
          idField: 'order_id',
          model: 'purchase.order.line',
          odooUrl,
          uid,
        })
      : [];

  const invoiceDomain = buildInvoiceDomain({
    endDate: options.filters.endDate,
    filters: options.filters,
    historyStart,
    viewerEmail: options.viewerEmail ?? '',
    visibilityScope: options.filters.visibilityScope,
  });

  const invoiceFields = uniqueFields([
    'id',
    'name',
    'state',
    'move_type',
    'invoice_date',
    'partner_id',
    invoiceSellerField,
    invoiceTeamField,
    'company_id',
    'currency_id',
    'amount_untaxed_signed',
    'amount_total_signed',
    invoiceShippingField,
    pickFirstAvailable(invoiceMeta, ['invoice_origin']),
    pickFirstAvailable(invoiceMeta, ['payment_state']),
  ]);

  const invoicesRaw = await searchReadAllPages({
    apiKey,
    database,
    domain: invoiceDomain,
    fields: invoiceFields,
    model: 'account.move',
    odooUrl,
    order: 'invoice_date desc, id desc',
    uid,
  });

  const customerFirstPurchaseHistoryRaw = await fetchFirstPurchaseRows({
    apiKey,
    database,
    domain: buildCustomerFirstPurchaseDomain({
      endDate: options.filters.endDate,
      viewerEmail: options.viewerEmail ?? '',
      visibilityScope: options.filters.visibilityScope,
    }),
    invoiceSellerField,
    odooUrl,
    uid,
  });

  const invoiceIds = invoicesRaw.map((row) => Number(row.id)).filter(Number.isFinite);
  const invoiceLineFields = uniqueFields([
    'id',
    'move_id',
    'name',
    'display_type',
    'product_id',
    invoiceLineCategoryField,
    'quantity',
    'balance',
    'price_subtotal',
    'price_total',
    'discount',
    invoiceLineMarginField,
    invoiceLinePurchasePriceField,
    invoiceLineSaleLineField,
  ]);

  const invoiceLinesRaw = invoiceIds.length
    ? await searchReadByChunks({
        apiKey,
        chunkIds: invoiceIds,
        database,
        fields: invoiceLineFields,
        idField: 'move_id',
        model: 'account.move.line',
        odooUrl,
        uid,
      })
    : [];

  const vendorBillFields = includePurchases
    ? uniqueFields([
        'id',
        'name',
        'state',
        'move_type',
        'invoice_date',
        'partner_id',
        invoiceSellerField,
        'company_id',
        'currency_id',
        'amount_untaxed_signed',
        'amount_total_signed',
        pickFirstAvailable(invoiceMeta, ['invoice_origin']),
        pickFirstAvailable(invoiceMeta, ['payment_state']),
      ])
    : [];

  const vendorBillsRaw = includePurchases
    ? await searchReadAllPages({
        apiKey,
        database,
        domain: buildVendorBillDomain({
          endDate: options.filters.endDate,
          filters: options.filters,
          historyStart,
          viewerEmail: options.viewerEmail ?? '',
          visibilityScope: options.filters.visibilityScope,
        }),
        fields: vendorBillFields,
        model: 'account.move',
        odooUrl,
        order: 'invoice_date desc, id desc',
        uid,
      })
    : [];

  const vendorBillIds = vendorBillsRaw.map((row) => Number(row.id)).filter(Number.isFinite);
  const vendorBillLineFields = includePurchases
    ? uniqueFields([
        'id',
        'move_id',
        'name',
        'display_type',
        'product_id',
        invoiceLineCategoryField,
        'quantity',
        'balance',
        'price_subtotal',
        'price_total',
        'discount',
        vendorBillPurchaseLineField,
      ])
    : [];

  const vendorBillLinesRaw =
    includePurchases && vendorBillIds.length
      ? await searchReadByChunks({
          apiKey,
          chunkIds: vendorBillIds,
          database,
          fields: vendorBillLineFields,
          idField: 'move_id',
          model: 'account.move.line',
          odooUrl,
          uid,
        })
      : [];

  const productIds = uniqueNumbers([
    ...linesRaw.map((row) => readManyToOneId(row.product_id)).filter((value) => value !== null),
    ...invoiceLinesRaw
      .map((row) => readManyToOneId(row.product_id))
      .filter((value) => value !== null),
    ...purchaseLinesRaw
      .map((row) => readManyToOneId(row.product_id))
      .filter((value) => value !== null),
    ...vendorBillLinesRaw
      .map((row) => readManyToOneId(row.product_id))
      .filter((value) => value !== null),
  ]);

  const productCatalogMap = await fetchProductCatalogMap({
    apiKey,
    database,
    odooUrl,
    productIds,
    uid,
  });

  const normalizedOrders = ordersRaw.map((row) =>
    normalizeOrderRow({
      confirmationDateField,
      orderShippingField,
      quotationDateField,
      row,
    }),
  );

  const orderById = new Map(normalizedOrders.map((order) => [order.id, order]));
  const orderBySourceName = buildOrderBySourceName(normalizedOrders);
  const normalizedLines = linesRaw
    .map((row) =>
      normalizeOrderLineRow({
        productCatalogMap,
        lineMarginField,
        linePurchasePriceField,
        orderById,
        row,
      }),
    )
    .filter((line): line is OdooOrderLineRecord => Boolean(line));

  const normalizedInvoices = invoicesRaw.map((row) => {
    const invoice = normalizeInvoiceRow({
      invoiceSellerField,
      invoiceShippingField,
      invoiceTeamField,
      row,
    });
    const sourceOrder = resolveOrderFromInvoiceOrigin(invoice.invoiceOrigin, orderBySourceName);
    return applyDeliveryCustomerFromSourceOrder(invoice, sourceOrder);
  });
  const normalizedCustomerFirstPurchases = normalizeCustomerFirstPurchases(
    customerFirstPurchaseHistoryRaw,
    invoiceSellerField,
  );
  const normalizedCustomerContacts = await fetchCustomerContactsFromPartners({
    apiKey,
    customerIds: uniqueNumbers([
      ...normalizedOrders.map((row) => row.customerId),
      ...normalizedOrders.map((row) => row.deliveryCustomerId),
      ...normalizedInvoices.map((row) => row.customerId),
      ...normalizedInvoices.map((row) => row.deliveryCustomerId ?? null),
    ]),
    database,
    odooUrl,
    uid,
    warnings,
  });
  const normalizedPurchaseOrders = purchaseOrdersRaw.map((row) =>
    normalizePurchaseOrderRow({
      approvalDateField: purchaseApprovalDateField,
      orderDateField: purchaseOrderDateField,
      row,
    }),
  );
  const purchaseOrderById = new Map(
    normalizedPurchaseOrders.map((order) => [order.id, order]),
  );
  const normalizedPurchaseOrderLines = purchaseLinesRaw
    .map((row) =>
      normalizePurchaseOrderLineRow({
        orderById: purchaseOrderById,
        productCatalogMap,
        row,
      }),
    )
    .filter((line): line is OdooPurchaseOrderLineRecord => Boolean(line));
  const purchaseOrderLineById = new Map(
    normalizedPurchaseOrderLines.map((line) => [line.id, line]),
  );
  const purchaseOrderByName = new Map(
    normalizedPurchaseOrders.map((order) => [normalizeSourceDocumentName(order.name), order]),
  );
  const invoiceById = new Map(normalizedInvoices.map((invoice) => [invoice.id, invoice]));
  const orderLineById = new Map(normalizedLines.map((line) => [line.id, line]));
  const normalizedInvoiceLines = invoiceLinesRaw
    .map((row) =>
      normalizeInvoiceLineRow({
        invoiceById,
        invoiceLineMarginField,
        invoiceLinePurchasePriceField,
        invoiceLineSaleLineField,
        orderLineById,
        productCatalogMap,
        row,
      }),
    )
    .filter((line): line is OdooInvoiceLineRecord => Boolean(line));
  const normalizedVendorBills = vendorBillsRaw.map((row) =>
    normalizeVendorBillRow({
      buyerField: invoiceSellerField,
      purchaseOrderByName,
      row,
    }),
  );
  const vendorBillById = new Map(normalizedVendorBills.map((bill) => [bill.id, bill]));
  const normalizedVendorBillLines = vendorBillLinesRaw
    .map((row) =>
      normalizeVendorBillLineRow({
        purchaseLineField: vendorBillPurchaseLineField,
        productCatalogMap,
        purchaseOrderByName,
        purchaseOrderLineById,
        row,
        vendorBillById,
      }),
    )
    .filter((line): line is OdooVendorBillLineRecord => Boolean(line));

  collectDataQualityAlerts({
    dataQualityAlerts,
    orderMeta,
    orders: normalizedOrders,
    invoices: normalizedInvoices,
    invoiceLines: normalizedInvoiceLines,
    productCatalogMap,
  });

  return {
    database,
    fetchedAt: new Date().toISOString(),
    odooBaseUrl: stripTrailingSlash(odooUrl),
    scopeApplied: options.filters.visibilityScope,
    warnings,
    dataQualityAlerts,
    configDefaults: defaultReportsConfig,
    availableFilters: buildFilterOptions({
      invoices: normalizedInvoices.filter((row) => isDateWithinReportRange(row.invoiceDate, options.filters.startDate, options.filters.endDate)),
      invoiceLines: normalizedInvoiceLines.filter((row) => isDateWithinReportRange(row.invoiceDate, options.filters.startDate, options.filters.endDate)),
      lines: normalizedLines.filter((row) =>
        isSalesOrderDateWithinReportRange(
          row.orderState === 'sale' ? row.confirmationDate : row.quotationDate,
          options.filters.startDate,
          options.filters.endDate,
        ),
      ),
      orders: normalizedOrders.filter((row) =>
        isSalesOrderDateWithinReportRange(
          row.state === 'sale' ? row.confirmationDate : row.createDate ?? row.quotationDate,
          options.filters.startDate,
          options.filters.endDate,
        ),
      ),
      purchaseOrders: normalizedPurchaseOrders.filter((row) => isDateWithinReportRange(row.orderDate ?? row.approvalDate, options.filters.startDate, options.filters.endDate)),
      purchaseOrderLines: normalizedPurchaseOrderLines.filter((row) => isDateWithinReportRange(row.orderDate, options.filters.startDate, options.filters.endDate)),
      vendorBills: normalizedVendorBills.filter((row) => isDateWithinReportRange(row.invoiceDate, options.filters.startDate, options.filters.endDate)),
      vendorBillLines: normalizedVendorBillLines.filter((row) => isDateWithinReportRange(row.invoiceDate, options.filters.startDate, options.filters.endDate)),
      includePurchases: options.requestedDomain === 'all',
      allCompanies: [...normalizedOrders, ...normalizedInvoices, ...normalizedPurchaseOrders, ...normalizedVendorBills],
    }),
    orders: normalizedOrders,
    orderLines: normalizedLines,
    invoices: normalizedInvoices,
    invoiceLines: normalizedInvoiceLines,
    customerFirstPurchases: normalizedCustomerFirstPurchases,
    customerContacts: normalizedCustomerContacts,
    crmLeads: [],
    purchaseOrders: normalizedPurchaseOrders,
    purchaseOrderLines: normalizedPurchaseOrderLines,
    vendorBills: normalizedVendorBills,
    vendorBillLines: normalizedVendorBillLines,
    drillLinks: buildDrillLinks(odooUrl, normalizedOrders, normalizedInvoices),
  };
}

function buildOrderDomain({
  endDate,
  filters,
  forcedStateScope,
  orderDateField,
  startDate,
  viewerEmail,
  visibilityScope,
}: {
  endDate: string;
  filters: ReportFilters;
  forcedStateScope?: ReportStateScope;
  orderDateField: string | null;
  startDate: string;
  viewerEmail: string;
  visibilityScope: ReportVisibilityScope;
}) {
  const effectiveStateScope = forcedStateScope ?? filters.stateScope;
  const dateField = orderDateField ?? 'date_order';
  const domain: unknown[] = [
    [dateField, '>=', startDate],
    [dateField, '<=', endDate],
  ];

  const sellerIds = resolveSellerFilterIds(filters);
  const companyIds = resolveCompanyFilterIds(filters);

  if (companyIds.length > 0) domain.push(['company_id', 'in', companyIds]);
  if (sellerIds.length > 0) domain.push(['user_id', 'in', sellerIds]);
  if (filters.teamId) domain.push(['team_id', '=', filters.teamId]);
  if (filters.customerId) domain.push(['partner_id', '=', filters.customerId]);
  if (filters.currencyCode) domain.push(['currency_id.name', '=', filters.currencyCode]);
  if (effectiveStateScope === 'quotation') domain.push(['state', '=', 'draft']);
  if (effectiveStateScope === 'confirmed') domain.push(['state', '=', 'sale']);
  if (effectiveStateScope === 'cancelled') domain.push(['state', '=', 'cancel']);

  if (visibilityScope === 'own' && viewerEmail) {
    domain.push('|', ['user_id.email', '=', viewerEmail], ['user_id.login', '=', viewerEmail]);
  }

  return domain;
}

function buildInvoiceDomain({
  endDate,
  filters,
  historyStart,
  viewerEmail,
  visibilityScope,
}: {
  endDate: string;
  filters: ReportFilters;
  historyStart: string;
  viewerEmail: string;
  visibilityScope: ReportVisibilityScope;
}) {
  const domain: unknown[] = [
    ['invoice_date', '>=', historyStart],
    ['invoice_date', '<=', endDate],
    ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['state', '=', 'posted'],
  ];

  const sellerIds = resolveSellerFilterIds(filters);
  const companyIds = resolveCompanyFilterIds(filters);

  if (companyIds.length > 0) domain.push(['company_id', 'in', companyIds]);
  if (filters.customerId) domain.push(['partner_id', '=', filters.customerId]);
  if (filters.currencyCode) domain.push(['currency_id.name', '=', filters.currencyCode]);
  if (sellerIds.length > 0) {
    domain.push('|', ['invoice_user_id', 'in', sellerIds], ['user_id', 'in', sellerIds]);
  }
  if (filters.teamId) domain.push(['team_id', '=', filters.teamId]);

  if (visibilityScope === 'own' && viewerEmail) {
    domain.push(
      '|',
      '|',
      ['invoice_user_id.email', '=', viewerEmail],
      ['invoice_user_id.login', '=', viewerEmail],
      ['user_id.login', '=', viewerEmail],
    );
  }

  return domain;
}

function buildPurchaseOrderDomain({
  endDate,
  filters,
  historyStart,
  purchaseDateField,
  viewerEmail,
  visibilityScope,
}: {
  endDate: string;
  filters: ReportFilters;
  historyStart: string;
  purchaseDateField: string | null;
  viewerEmail: string;
  visibilityScope: ReportVisibilityScope;
}) {
  const dateField = purchaseDateField ?? 'date_order';
  const domain: unknown[] = [
    [dateField, '>=', historyStart],
    [dateField, '<=', endDate],
  ];
  const sellerIds = resolveSellerFilterIds(filters);
  const companyIds = resolveCompanyFilterIds(filters);

  if (companyIds.length > 0) domain.push(['company_id', 'in', companyIds]);
  if (sellerIds.length > 0) domain.push(['user_id', 'in', sellerIds]);
  if (filters.currencyCode) domain.push(['currency_id.name', '=', filters.currencyCode]);

  if (visibilityScope === 'own' && viewerEmail) {
    domain.push('|', ['user_id.email', '=', viewerEmail], ['user_id.login', '=', viewerEmail]);
  }

  return domain;
}

function buildVendorBillDomain({
  endDate,
  filters,
  historyStart,
  viewerEmail,
  visibilityScope,
}: {
  endDate: string;
  filters: ReportFilters;
  historyStart: string;
  viewerEmail: string;
  visibilityScope: ReportVisibilityScope;
}) {
  const domain: unknown[] = [
    ['invoice_date', '>=', historyStart],
    ['invoice_date', '<=', endDate],
    ['move_type', 'in', ['in_invoice', 'in_refund']],
    ['state', '=', 'posted'],
  ];
  const sellerIds = resolveSellerFilterIds(filters);
  const companyIds = resolveCompanyFilterIds(filters);

  if (companyIds.length > 0) domain.push(['company_id', 'in', companyIds]);
  if (filters.currencyCode) domain.push(['currency_id.name', '=', filters.currencyCode]);
  if (sellerIds.length > 0) {
    domain.push('|', ['invoice_user_id', 'in', sellerIds], ['user_id', 'in', sellerIds]);
  }

  if (visibilityScope === 'own' && viewerEmail) {
    domain.push(
      '|',
      '|',
      ['invoice_user_id.email', '=', viewerEmail],
      ['invoice_user_id.login', '=', viewerEmail],
      ['user_id.login', '=', viewerEmail],
    );
  }

  return domain;
}

function buildCustomerFirstPurchaseDomain({
  endDate,
  viewerEmail,
  visibilityScope,
}: {
  endDate: string;
  viewerEmail: string;
  visibilityScope: ReportVisibilityScope;
}) {
  const domain: unknown[] = [
    ['invoice_date', '<=', endDate],
    ['move_type', '=', 'out_invoice'],
    ['state', '=', 'posted'],
  ];

  if (visibilityScope === 'own' && viewerEmail) {
    domain.push(
      '|',
      '|',
      ['invoice_user_id.email', '=', viewerEmail],
      ['invoice_user_id.login', '=', viewerEmail],
      ['user_id.login', '=', viewerEmail],
    );
  }

  return domain;
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

function calculateHistoryStart(filters: ReportFilters, loadMode: 'fast' | 'full' = 'full') {
  const endDate = parseDate(filters.endDate);
  const startDate = parseDate(filters.startDate);
  const selectedRangeDays = Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
  );
  const historyDays =
    loadMode === 'fast'
      ? Math.min(45, Math.max(7, selectedRangeDays + 1))
      : Math.max(FALLBACK_HISTORY_DAYS, selectedRangeDays * 3);
  const historyStart = new Date(endDate);
  historyStart.setUTCDate(historyStart.getUTCDate() - historyDays);
  return formatDateOnly(historyStart);
}

function calculateRecentOrdersStart(filters: ReportFilters) {
  const currentRange = buildDateRange(filters.startDate, filters.endDate);
  const previousRange = buildPreviousDateRange(currentRange);
  return formatDateOnly(previousRange.start);
}

function buildDateRange(startDate: string, endDate: string) {
  return {
    start: new Date(`${startDate}T00:00:00.000Z`),
    end: new Date(`${endDate}T23:59:59.999Z`),
  };
}

function buildPreviousDateRange(current: { start: Date; end: Date }) {
  if (isFullMonthRange(current.start, current.end)) {
    const previousMonthEnd = new Date(
      Date.UTC(current.start.getUTCFullYear(), current.start.getUTCMonth(), 0, 23, 59, 59, 999),
    );
    const previousMonthStart = new Date(
      Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    return { start: previousMonthStart, end: previousMonthEnd };
  }

  if (isFullQuarterRange(current.start, current.end)) {
    const quarterStartMonth = Math.floor(current.start.getUTCMonth() / 3) * 3;
    const previousQuarterStartMonth = quarterStartMonth - 3;
    return {
      start: new Date(
        Date.UTC(current.start.getUTCFullYear(), previousQuarterStartMonth, 1, 0, 0, 0, 0),
      ),
      end: new Date(
        Date.UTC(current.start.getUTCFullYear(), previousQuarterStartMonth + 3, 0, 23, 59, 59, 999),
      ),
    };
  }

  if (isFullYearRange(current.start, current.end)) {
    return {
      start: new Date(Date.UTC(current.start.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(current.start.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999)),
    };
  }

  const durationMs = current.end.getTime() - current.start.getTime() + 1;
  const previousEnd = new Date(current.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs + 1);
  return { start: previousStart, end: previousEnd };
}

function isFullMonthRange(start: Date, end: Date) {
  return (
    start.getUTCDate() === 1 &&
    end.getUTCFullYear() === start.getUTCFullYear() &&
    end.getUTCMonth() === start.getUTCMonth() &&
    end.getUTCDate() ===
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

function isFullQuarterRange(start: Date, end: Date) {
  const quarterStartMonth = Math.floor(start.getUTCMonth() / 3) * 3;
  return (
    start.getUTCDate() === 1 &&
    start.getUTCMonth() === quarterStartMonth &&
    end.getUTCMonth() === quarterStartMonth + 2 &&
    end.getUTCDate() ===
      new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

function isFullYearRange(start: Date, end: Date) {
  return (
    start.getUTCMonth() === 0 &&
    start.getUTCDate() === 1 &&
    end.getUTCMonth() === 11 &&
    end.getUTCDate() === 31
  );
}

function previousDay(value: string) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return formatDateOnly(date);
}

function normalizeOrderRow({
  confirmationDateField,
  orderShippingField,
  quotationDateField,
  row,
}: {
  confirmationDateField: OdooFieldCandidate;
  orderShippingField: OdooFieldCandidate;
  quotationDateField: OdooFieldCandidate;
  row: Record<string, unknown>;
}) {
  return {
    id: Number(row.id),
    name: readString(row.name) ?? `SO-${row.id}`,
    state: readString(row.state) ?? 'draft',
    createDate: normalizeDateValue(row.create_date),
    quotationDate: normalizeDateValue(row[quotationDateField ?? 'create_date']),
    confirmationDate: normalizeDateValue(row[confirmationDateField ?? 'date_order']),
    validityDate: normalizeDateValue(row.validity_date),
    customerId: readManyToOneId(row.partner_id),
    customerName: readManyToOneLabel(row.partner_id) ?? 'Cliente sin nombre',
    deliveryCustomerId: orderShippingField
      ? readManyToOneId(row[orderShippingField])
      : null,
    deliveryCustomerName: orderShippingField
      ? readManyToOneLabel(row[orderShippingField])
      : null,
    sellerId: readManyToOneId(row.user_id),
    sellerName: readManyToOneLabel(row.user_id) ?? 'Sin vendedor',
    teamId: readManyToOneId(row.team_id),
    teamName: readManyToOneLabel(row.team_id),
    companyId: readManyToOneId(row.company_id),
    companyName: readManyToOneLabel(row.company_id),
    currencyCode: normalizeCurrencyLabel(row.currency_id),
    amountUntaxed: readNumber(row.amount_untaxed),
    amountTotal: readNumber(row.amount_total),
    invoiceStatus: readString(row.invoice_status),
    channel: readChannelValue(row),
    origin: readString(row.origin),
  } satisfies OdooOrderRecord;
}

function normalizeOrderLineRow({
  productCatalogMap,
  lineMarginField,
  linePurchasePriceField,
  orderById,
  row,
}: {
  productCatalogMap: Map<number, ProductCatalogEntry>;
  lineMarginField: OdooFieldCandidate;
  linePurchasePriceField: OdooFieldCandidate;
  orderById: Map<number, OdooOrderRecord>;
  row: Record<string, unknown>;
}) {
  const orderId = readManyToOneId(row.order_id);
  if (!orderId) return null;

  const order = orderById.get(orderId);
  if (!order) return null;

  const productId = readManyToOneId(row.product_id);
  const productCategory = getProductCategory(productCatalogMap, productId);
  const quantity = readNumber(row.product_uom_qty);
  const lineMargin = lineMarginField ? readNullableNumber(row[lineMarginField]) : null;
  const linePurchaseUnitCost = linePurchasePriceField
    ? readNullableNumber(row[linePurchasePriceField])
    : null;
  const standardUnitCost = getProductCost(productCatalogMap, productId);
  const unitCost = linePurchaseUnitCost ?? standardUnitCost;
  const costAmount =
    lineMargin !== null
      ? Math.max(0, readNumber(row.price_subtotal) - lineMargin)
      : unitCost !== null
        ? unitCost * quantity
        : null;
  const marginAmount =
    lineMargin !== null ? lineMargin : costAmount !== null ? readNumber(row.price_subtotal) - costAmount : null;

  return {
    id: Number(row.id),
    orderId,
    orderName: order.name,
    orderState: order.state,
    customerId: order.customerId,
    customerName: order.customerName,
    deliveryCustomerId: order.deliveryCustomerId,
    deliveryCustomerName: order.deliveryCustomerName,
    sellerId: order.sellerId,
    sellerName: order.sellerName,
    teamId: order.teamId,
    teamName: order.teamName,
    companyId: order.companyId,
    companyName: order.companyName,
    currencyCode: order.currencyCode,
    quotationDate: order.quotationDate,
    confirmationDate: order.confirmationDate,
    productId,
    productName: readManyToOneLabel(row.product_id) ?? 'Producto sin nombre',
    categoryId:
      readManyToOneId(row.product_categ_id ?? row.categ_id) ?? productCategory?.categoryId ?? null,
    categoryName:
      readManyToOneLabel(row.product_categ_id ?? row.categ_id) ??
      productCategory?.categoryName ??
      null,
    quantity,
    untaxedAmount: readNumber(row.price_subtotal),
    totalAmount: readNumber(row.price_total),
    unitCost,
    costAmount,
    marginAmount,
    lineMarginValue: lineMargin,
    linePurchaseUnitCost,
    standardUnitCost,
    discount: readNullableNumber(row.discount),
  } satisfies OdooOrderLineRecord;
}

function normalizeInvoiceLineRow({
  invoiceById,
  invoiceLineMarginField,
  invoiceLinePurchasePriceField,
  invoiceLineSaleLineField,
  orderLineById,
  productCatalogMap,
  row,
}: {
  invoiceById: Map<number, OdooInvoiceRecord>;
  invoiceLineMarginField: OdooFieldCandidate;
  invoiceLinePurchasePriceField: OdooFieldCandidate;
  invoiceLineSaleLineField: OdooFieldCandidate;
  orderLineById: Map<number, OdooOrderLineRecord>;
  productCatalogMap: Map<number, ProductCatalogEntry>;
  row: Record<string, unknown>;
}): OdooInvoiceLineRecord | null {
  const invoiceId = readManyToOneId(row.move_id);
  if (!invoiceId) return null;

  const invoice = invoiceById.get(invoiceId);
  if (!invoice) return null;

  const displayType = readString(row.display_type);
  if (
    displayType &&
    ['tax', 'payment_term', 'line_section', 'line_note', 'rounding', 'epd', 'cogs'].includes(
      displayType,
    )
  ) {
    return null;
  }

  const productId = readManyToOneId(row.product_id);
  const productCategory = getProductCategory(productCatalogMap, productId);
  const amountSign = invoice.moveType === 'out_refund' ? -1 : 1;
  const quantity = readNumber(row.quantity) * amountSign;
  // Odoo's Accounting > Reports > Invoice Analysis calculates "Untaxed Total"
  // from the accounting balance in company currency: -account.move.line.balance.
  const balanceAmount = readNullableNumber(row.balance);
  const untaxedAmount =
    balanceAmount !== null ? -balanceAmount : readNumber(row.price_subtotal) * amountSign;
  const totalAmount = readNumber(row.price_total) * amountSign;
  const invoiceLineMarginValue = invoiceLineMarginField
    ? readNullableNumber(row[invoiceLineMarginField])
    : null;
  const invoiceLinePurchaseUnitCost = invoiceLinePurchasePriceField
    ? readNullableNumber(row[invoiceLinePurchasePriceField])
    : null;
  const sourceSaleLineIds = invoiceLineSaleLineField
    ? readManyToManyIds(row[invoiceLineSaleLineField])
    : [];
  const sourceOrderIds = uniqueNumbers(
    sourceSaleLineIds
      .map((saleLineId) => orderLineById.get(saleLineId)?.orderId ?? null)
      .filter((value) => value !== null),
  );
  const sourceOrderNames = [
    ...new Set(
      sourceSaleLineIds
        .map((saleLineId) => orderLineById.get(saleLineId)?.orderName ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const linkedDeliveryCustomers = sourceSaleLineIds
    .map((saleLineId) => {
      const linkedOrderLine = orderLineById.get(saleLineId);
      if (!linkedOrderLine?.deliveryCustomerName) return null;
      return {
        customerId: linkedOrderLine.deliveryCustomerId,
        customerName: linkedOrderLine.deliveryCustomerName,
      };
    })
    .filter((value): value is { customerId: number | null; customerName: string } => Boolean(value));
  const linkedPurchaseCosts = sourceSaleLineIds
    .map((saleLineId) => orderLineById.get(saleLineId)?.linePurchaseUnitCost ?? null)
    .filter((value): value is number => value !== null);
  const linePurchaseUnitCost =
    invoiceLinePurchaseUnitCost ??
    (linkedPurchaseCosts.length > 0 ? averageNumbers(linkedPurchaseCosts) : null);
  const standardUnitCost = getProductCost(productCatalogMap, productId);
  const unitCost = linePurchaseUnitCost ?? standardUnitCost;
  const costAmount =
    invoiceLineMarginValue !== null
      ? untaxedAmount - invoiceLineMarginValue * amountSign
      : unitCost !== null
        ? unitCost * quantity
        : null;
  const marginAmount =
    invoiceLineMarginValue !== null
      ? invoiceLineMarginValue * amountSign
      : costAmount !== null
        ? untaxedAmount - costAmount
        : null;

  return {
    id: Number(row.id),
    invoiceId,
    invoiceName: invoice.name,
    invoiceState: invoice.state,
    moveType: invoice.moveType,
    invoiceDate: invoice.invoiceDate,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    deliveryCustomerId: invoice.deliveryCustomerId ?? linkedDeliveryCustomers[0]?.customerId ?? null,
    deliveryCustomerName: invoice.deliveryCustomerName ?? linkedDeliveryCustomers[0]?.customerName ?? null,
    sellerId: invoice.sellerId,
    sellerName: invoice.sellerName,
    teamId: invoice.teamId,
    teamName: invoice.teamName,
    companyId: invoice.companyId,
    companyName: invoice.companyName,
    currencyCode: invoice.currencyCode,
    productId,
    productName:
      readManyToOneLabel(row.product_id) ??
      readString(row.name) ??
      'Concepto sin producto',
    categoryId:
      readManyToOneId(row.product_category_id ?? row.product_categ_id ?? row.categ_id) ??
      productCategory?.categoryId ??
      null,
    categoryName:
      readManyToOneLabel(row.product_category_id ?? row.product_categ_id ?? row.categ_id) ??
      productCategory?.categoryName ??
      null,
    quantity,
    untaxedAmount,
    totalAmount,
    unitCost,
    costAmount,
    marginAmount,
    linePurchaseUnitCost,
    standardUnitCost,
    discount: readNullableNumber(row.discount),
    displayType,
    sourceOrderIds,
    sourceOrderNames,
    sourceSaleLineIds,
  } satisfies OdooInvoiceLineRecord;
}

function normalizeInvoiceRow({
  invoiceSellerField,
  invoiceShippingField,
  invoiceTeamField,
  row,
}: {
  invoiceSellerField: OdooFieldCandidate;
  invoiceShippingField: OdooFieldCandidate;
  invoiceTeamField: OdooFieldCandidate;
  row: Record<string, unknown>;
}) {
  return {
    id: Number(row.id),
    name: readString(row.name) ?? `INV-${row.id}`,
    state: readString(row.state) ?? 'draft',
    moveType: readString(row.move_type) ?? 'out_invoice',
    invoiceDate: normalizeDateValue(row.invoice_date),
    customerId: readManyToOneId(row.partner_id),
    customerName: readManyToOneLabel(row.partner_id) ?? 'Cliente sin nombre',
    deliveryCustomerId: invoiceShippingField ? readManyToOneId(row[invoiceShippingField]) : null,
    deliveryCustomerName: invoiceShippingField ? readManyToOneLabel(row[invoiceShippingField]) : null,
    sellerId: readManyToOneId(row[invoiceSellerField ?? 'invoice_user_id']),
    sellerName: readManyToOneLabel(row[invoiceSellerField ?? 'invoice_user_id']) ?? 'Sin vendedor',
    teamId: readManyToOneId(row[invoiceTeamField ?? 'team_id']),
    teamName: readManyToOneLabel(row[invoiceTeamField ?? 'team_id']),
    companyId: readManyToOneId(row.company_id),
    companyName: readManyToOneLabel(row.company_id),
    currencyCode: normalizeCurrencyLabel(row.currency_id),
    untaxedAmountSigned: readNumber(row.amount_untaxed_signed),
    totalAmountSigned: readNumber(row.amount_total_signed),
    invoiceOrigin: readString(row.invoice_origin),
    paymentState: readString(row.payment_state),
  } satisfies OdooInvoiceRecord;
}

function buildOrderBySourceName(orders: OdooOrderRecord[]) {
  const ordersBySourceName = new Map<string, OdooOrderRecord>();
  orders.forEach((order) => {
    const key = normalizeSourceDocumentName(order.name);
    if (key) ordersBySourceName.set(key, order);
  });
  return ordersBySourceName;
}

function resolveOrderFromInvoiceOrigin(
  invoiceOrigin: string | null,
  ordersBySourceName: Map<string, OdooOrderRecord>,
) {
  if (!invoiceOrigin) return null;

  return invoiceOrigin
    .split(',')
    .map((origin) => ordersBySourceName.get(normalizeSourceDocumentName(origin.trim())) ?? null)
    .find((order): order is OdooOrderRecord => Boolean(order)) ?? null;
}

function applyDeliveryCustomerFromSourceOrder(
  invoice: OdooInvoiceRecord,
  sourceOrder: OdooOrderRecord | null,
) {
  if (invoice.deliveryCustomerName || !sourceOrder?.deliveryCustomerName) return invoice;

  return {
    ...invoice,
    deliveryCustomerId: sourceOrder.deliveryCustomerId,
    deliveryCustomerName: sourceOrder.deliveryCustomerName,
  } satisfies OdooInvoiceRecord;
}

function normalizeCustomerFirstPurchases(
  rows: Array<Record<string, unknown>>,
  invoiceSellerField: OdooFieldCandidate,
) {
  const firstPurchaseByCustomer = new Map<string, OdooCustomerFirstPurchaseRecord>();

  rows.forEach((row) => {
    const customerId = readManyToOneId(row.partner_id);
    const customerName = readManyToOneLabel(row.partner_id) ?? 'Cliente sin nombre';
    const invoiceDate = normalizeDateValue(row.invoice_date);
    if (!invoiceDate) {
      return;
    }

    const customerKey = `${customerId ?? 'customer'}:${customerName.trim().toLowerCase()}`;
    if (firstPurchaseByCustomer.has(customerKey)) {
      return;
    }

    firstPurchaseByCustomer.set(customerKey, {
      customerId,
      customerName,
      sellerId: readManyToOneId(row[invoiceSellerField ?? 'invoice_user_id']),
      sellerName:
        readManyToOneLabel(row[invoiceSellerField ?? 'invoice_user_id']) ?? 'Sin vendedor',
      invoiceDate,
    });
  });

  return Array.from(firstPurchaseByCustomer.values());
}

function normalizePurchaseOrderRow({
  approvalDateField,
  orderDateField,
  row,
}: {
  approvalDateField: OdooFieldCandidate;
  orderDateField: OdooFieldCandidate;
  row: Record<string, unknown>;
}) {
  return {
    id: Number(row.id),
    name: readString(row.name) ?? `PO-${row.id}`,
    state: readString(row.state) ?? 'draft',
    createDate: normalizeDateValue(row.create_date),
    orderDate: normalizeDateValue(row[orderDateField ?? 'date_order']),
    approvalDate: normalizeDateValue(row[approvalDateField ?? 'date_approve']),
    supplierId: readManyToOneId(row.partner_id),
    supplierName: readManyToOneLabel(row.partner_id) ?? 'Proveedor sin nombre',
    buyerId: readManyToOneId(row.user_id),
    buyerName: readManyToOneLabel(row.user_id) ?? 'Sin comprador',
    companyId: readManyToOneId(row.company_id),
    companyName: readManyToOneLabel(row.company_id),
    currencyCode: normalizeCurrencyLabel(row.currency_id),
    amountUntaxed: readNumber(row.amount_untaxed),
    amountTotal: readNumber(row.amount_total),
    invoiceStatus: readString(row.invoice_status),
    origin: readString(row.origin),
  } satisfies OdooPurchaseOrderRecord;
}

function normalizePurchaseOrderLineRow({
  orderById,
  productCatalogMap,
  row,
}: {
  orderById: Map<number, OdooPurchaseOrderRecord>;
  productCatalogMap: Map<number, ProductCatalogEntry>;
  row: Record<string, unknown>;
}) {
  const orderId = readManyToOneId(row.order_id);
  if (!orderId) return null;

  const order = orderById.get(orderId);
  if (!order) return null;

  const productId = readManyToOneId(row.product_id);
  const productCategory = getProductCategory(productCatalogMap, productId);
  const quantity = readNumber(row.product_qty);
  const untaxedAmount = readNumber(row.price_subtotal);
  return {
    id: Number(row.id),
    orderId,
    orderName: order.name,
    orderState: order.state,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    buyerId: order.buyerId,
    buyerName: order.buyerName,
    companyId: order.companyId,
    companyName: order.companyName,
    currencyCode: order.currencyCode,
    orderDate: order.orderDate,
    approvalDate: order.approvalDate,
    productId,
    productName: readManyToOneLabel(row.product_id) ?? 'Producto sin nombre',
    categoryId:
      readManyToOneId(row.product_categ_id ?? row.categ_id) ?? productCategory?.categoryId ?? null,
    categoryName:
      readManyToOneLabel(row.product_categ_id ?? row.categ_id) ??
      productCategory?.categoryName ??
      null,
    quantity,
    untaxedAmount,
    totalAmount: readNumber(row.price_total),
    unitCost: quantity !== 0 ? untaxedAmount / quantity : getProductCost(productCatalogMap, productId),
    discount: readNullableNumber(row.discount),
  } satisfies OdooPurchaseOrderLineRecord;
}

function normalizeVendorBillRow({
  buyerField,
  purchaseOrderByName,
  row,
}: {
  buyerField: OdooFieldCandidate;
  purchaseOrderByName: Map<string, OdooPurchaseOrderRecord>;
  row: Record<string, unknown>;
}) {
  const linkedOrder = extractSourceDocumentNames(readString(row.invoice_origin)).find((name) =>
    purchaseOrderByName.has(normalizeSourceDocumentName(name)),
  );
  const purchaseOrder = linkedOrder
    ? purchaseOrderByName.get(normalizeSourceDocumentName(linkedOrder)) ?? null
    : null;

  return {
    id: Number(row.id),
    name: readString(row.name) ?? `BILL-${row.id}`,
    state: readString(row.state) ?? 'draft',
    moveType: readString(row.move_type) ?? 'in_invoice',
    invoiceDate: normalizeDateValue(row.invoice_date),
    supplierId: readManyToOneId(row.partner_id),
    supplierName: readManyToOneLabel(row.partner_id) ?? 'Proveedor sin nombre',
    buyerId: purchaseOrder?.buyerId ?? readManyToOneId(row[buyerField ?? 'invoice_user_id']),
    buyerName:
      purchaseOrder?.buyerName ??
      readManyToOneLabel(row[buyerField ?? 'invoice_user_id']) ??
      'Sin comprador',
    companyId: readManyToOneId(row.company_id),
    companyName: readManyToOneLabel(row.company_id),
    currencyCode: normalizeCurrencyLabel(row.currency_id),
    untaxedAmountSigned: readNumber(row.amount_untaxed_signed),
    totalAmountSigned: readNumber(row.amount_total_signed),
    invoiceOrigin: readString(row.invoice_origin),
    paymentState: readString(row.payment_state),
  } satisfies OdooVendorBillRecord;
}

function normalizeVendorBillLineRow({
  purchaseLineField,
  productCatalogMap,
  purchaseOrderByName,
  purchaseOrderLineById,
  row,
  vendorBillById,
}: {
  purchaseLineField: OdooFieldCandidate;
  productCatalogMap: Map<number, ProductCatalogEntry>;
  purchaseOrderByName: Map<string, OdooPurchaseOrderRecord>;
  purchaseOrderLineById: Map<number, OdooPurchaseOrderLineRecord>;
  row: Record<string, unknown>;
  vendorBillById: Map<number, OdooVendorBillRecord>;
}) {
  const invoiceId = readManyToOneId(row.move_id);
  if (!invoiceId) return null;

  const invoice = vendorBillById.get(invoiceId);
  if (!invoice) return null;

  const displayType = readString(row.display_type);
  if (
    displayType &&
    ['tax', 'payment_term', 'line_section', 'line_note', 'rounding', 'epd', 'cogs'].includes(
      displayType,
    )
  ) {
    return null;
  }

  const purchaseLineIds = readRelationalIds(row[purchaseLineField ?? 'purchase_line_id']);
  const productId = readManyToOneId(row.product_id);
  const productCategory = getProductCategory(productCatalogMap, productId);
  const sourceOrderIds = uniqueNumbers(
    purchaseLineIds
      .map((lineId) => purchaseOrderLineById.get(lineId)?.orderId ?? null)
      .filter((value) => value !== null),
  );
  const sourceOrderNames = [
    ...new Set(
      purchaseLineIds
        .map((lineId) => purchaseOrderLineById.get(lineId)?.orderName ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const linkedOrder =
    sourceOrderNames
      .map((name) => purchaseOrderByName.get(normalizeSourceDocumentName(name)) ?? null)
      .find((record) => record !== null) ??
    extractSourceDocumentNames(invoice.invoiceOrigin)
      .map((name) => purchaseOrderByName.get(normalizeSourceDocumentName(name)) ?? null)
      .find((record) => record !== null) ??
    null;
  const quantitySign = invoice.moveType === 'in_refund' ? -1 : 1;
  const balanceAmount = readNullableNumber(row.balance);

  return {
    id: Number(row.id),
    invoiceId,
    invoiceName: invoice.name,
    invoiceState: invoice.state,
    moveType: invoice.moveType,
    invoiceDate: invoice.invoiceDate,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplierName,
    buyerId: linkedOrder?.buyerId ?? invoice.buyerId,
    buyerName: linkedOrder?.buyerName ?? invoice.buyerName,
    companyId: invoice.companyId,
    companyName: invoice.companyName,
    currencyCode: invoice.currencyCode,
    productId,
    productName:
      readManyToOneLabel(row.product_id) ??
      readString(row.name) ??
      'Concepto sin producto',
    categoryId:
      readManyToOneId(row.product_category_id ?? row.product_categ_id ?? row.categ_id) ??
      productCategory?.categoryId ??
      null,
    categoryName:
      readManyToOneLabel(row.product_category_id ?? row.product_categ_id ?? row.categ_id) ??
      productCategory?.categoryName ??
      null,
    quantity: readNumber(row.quantity) * quantitySign,
    untaxedAmount:
      balanceAmount !== null ? balanceAmount : readNumber(row.price_subtotal) * quantitySign,
    totalAmount: readNumber(row.price_total) * quantitySign,
    purchaseLineIds,
    sourceOrderIds,
    sourceOrderNames:
      sourceOrderNames.length > 0
        ? sourceOrderNames
        : extractSourceDocumentNames(invoice.invoiceOrigin),
    discount: readNullableNumber(row.discount),
    displayType,
  } satisfies OdooVendorBillLineRecord;
}

function buildFilterOptions({
  allCompanies,
  invoices,
  invoiceLines,
  includePurchases,
  lines,
  orders,
  purchaseOrders,
  purchaseOrderLines,
  vendorBills,
  vendorBillLines,
}: {
  allCompanies: Array<{ companyId: number | null; companyName: string | null }>;
  invoices: OdooInvoiceRecord[];
  invoiceLines: OdooInvoiceLineRecord[];
  includePurchases: boolean;
  lines: OdooOrderLineRecord[];
  orders: OdooOrderRecord[];
  purchaseOrders: OdooPurchaseOrderRecord[];
  purchaseOrderLines: OdooPurchaseOrderLineRecord[];
  vendorBills: OdooVendorBillRecord[];
  vendorBillLines: OdooVendorBillLineRecord[];
}) {
  const salesRecords = [...orders, ...invoices];
  const productRecords = [...invoiceLines, ...lines];
  const companyRecords = allCompanies.length > 0 ? allCompanies : salesRecords;
  const sellerOptions = includePurchases
    ? [
        ...orders.map((record) => ({ id: record.sellerId, label: record.sellerName })),
        ...invoices.map((record) => ({ id: record.sellerId, label: record.sellerName })),
        ...purchaseOrders.map((record) => ({ id: record.buyerId, label: record.buyerName })),
        ...vendorBills.map((record) => ({ id: record.buyerId, label: record.buyerName })),
      ]
    : salesRecords.map((record) => ({ id: record.sellerId, label: record.sellerName }));
  const categoryRecords = includePurchases
    ? [...invoiceLines, ...lines, ...purchaseOrderLines, ...vendorBillLines]
    : productRecords;
  const currencyRecords = includePurchases
    ? [...orders, ...invoices, ...purchaseOrders, ...vendorBills]
    : salesRecords;

  return {
    companies: buildUniqueOptions(
      companyRecords.map((record) => ({
        id: record.companyId,
        label: record.companyName,
      })),
    ),
    sellers: buildUniqueOptions(sellerOptions),
    teams: buildUniqueOptions(
      salesRecords.map((record) => ({
        id: record.teamId,
        label: record.teamName,
      })),
    ),
    customers: buildUniqueOptions(
      salesRecords.map((record) => ({
        id: record.customerId,
        label: record.customerName,
      })),
    ),
    products: buildUniqueOptions(
      productRecords.map((record) => ({
        id: record.productId,
        label: record.productName,
      })),
    ),
    categories: buildUniqueOptions(
      categoryRecords.map((record) => ({
        id: record.categoryId,
        label: record.categoryName,
      })),
    ),
    currencies: buildUniqueOptions(
      currencyRecords.map((record) => ({
        id: record.currencyCode,
        label: record.currencyCode,
      })),
    ),
    channels: buildUniqueOptions(
      orders.map((record) => ({
        id: record.channel,
        label: record.channel,
      })),
    ),
  };
}

function buildDrillLinks(
  odooUrl: string,
  orders: OdooOrderRecord[],
  invoices: OdooInvoiceRecord[],
) {
  return {
    recent_confirmed_orders: orders
      .filter((order) => isConfirmedState(order.state))
      .slice(0, 25)
      .map((order) => ({
        model: 'sale.order',
        recordId: order.id,
        label: order.name,
        url: buildOdooRecordUrl(odooUrl, 'sale.order', order.id),
      })),
    recent_invoices: invoices.slice(0, 25).map((invoice) => ({
      model: 'account.move',
      recordId: invoice.id,
      label: invoice.name,
      url: buildOdooRecordUrl(odooUrl, 'account.move', invoice.id),
    })),
  };
}

function collectDataQualityAlerts({
  dataQualityAlerts,
  invoiceLines,
  orders,
  invoices,
  productCatalogMap,
}: {
  dataQualityAlerts: string[];
  orderMeta: OdooFieldMeta;
  orders: OdooOrderRecord[];
  invoices: OdooInvoiceRecord[];
  invoiceLines: OdooInvoiceLineRecord[];
  productCatalogMap: Map<number, ProductCatalogEntry>;
}) {
  const ordersWithoutSeller = orders.filter((order) => !order.sellerId).length;
  const linesWithoutCost = invoiceLines.filter(
    (line) =>
      line.displayType !== 'discount' &&
      (line.costAmount === null || line.costAmount === 0) &&
      Math.abs(line.untaxedAmount) > 0,
  ).length;
  const negativeMarginLines = invoiceLines.filter(
    (line) => (line.marginAmount ?? 0) < 0,
  ).length;
  const refundsWithoutOrigin = invoices.filter(
    (invoice) => invoice.moveType === 'out_refund' && !invoice.invoiceOrigin,
  ).length;
  const missingProductCosts = invoiceLines.filter(
    (line) =>
      line.productId !== null &&
      !productCatalogMap.has(line.productId),
  ).length;
  const invoiceUntaxedById = new Map<number, number>();
  invoiceLines.forEach((line) => {
    invoiceUntaxedById.set(
      line.invoiceId,
      (invoiceUntaxedById.get(line.invoiceId) ?? 0) + line.untaxedAmount,
    );
  });
  const invoiceLineMismatches = invoices.filter((invoice) => {
    const lineUntaxed = invoiceUntaxedById.get(invoice.id) ?? 0;
    return Math.abs(invoice.untaxedAmountSigned - lineUntaxed) > 0.01;
  }).length;

  if (ordersWithoutSeller > 0) {
    dataQualityAlerts.push(
      `${ordersWithoutSeller} ordenes no tienen vendedor asignado y pueden afectar rankings y conversion.`,
    );
  }

  if (linesWithoutCost > 0) {
    dataQualityAlerts.push(
      `${linesWithoutCost} lineas facturadas tienen coste nulo o cero; el margen contable puede estar subestimado o sobreestimado.`,
    );
  }

  if (missingProductCosts > 0) {
    dataQualityAlerts.push(
      `${missingProductCosts} lineas usan productos sin coste estandar disponible.`,
    );
  }

  if (negativeMarginLines > 0) {
    dataQualityAlerts.push(
      `${negativeMarginLines} lineas facturadas muestran margen negativo.`,
    );
  }

  if (invoiceLineMismatches > 0) {
    dataQualityAlerts.push(
      `${invoiceLineMismatches} facturas no cuadran entre cabecera sin impuestos y suma de lineas visibles; revisa descuentos globales, redondeos o lineas no comerciales.`,
    );
  }

  if (refundsWithoutOrigin > 0) {
    dataQualityAlerts.push(
      `${refundsWithoutOrigin} notas de credito no tienen invoice_origin y sera mas dificil rastrear su venta origen.`,
    );
  }
}

async function fetchProductCatalogMap({
  apiKey,
  database,
  odooUrl,
  productIds,
  uid,
}: {
  apiKey: string;
  database: string;
  odooUrl: string;
  productIds: number[];
  uid: number;
}) {
  const productCatalogMap = new Map<number, ProductCatalogEntry>();
  if (productIds.length === 0) return productCatalogMap;

  const products = await searchReadByChunks({
    apiKey,
    chunkIds: productIds,
    database,
    fields: ['id', 'standard_price', 'categ_id'],
    idField: 'id',
    maxRecords: productIds.length,
    model: 'product.product',
    odooUrl,
    uid,
  });

  products.forEach((row) => {
    const productId = Number(row.id);
    if (!Number.isFinite(productId)) return;
    productCatalogMap.set(productId, {
      categoryId: readManyToOneId(row.categ_id),
      categoryName: readManyToOneLabel(row.categ_id),
      standardCost: readNullableNumber(row.standard_price),
    });
  });

  return productCatalogMap;
}

async function fetchCustomerContactsFromPartners({
  apiKey,
  customerIds,
  database,
  odooUrl,
  uid,
  warnings,
}: {
  apiKey: string;
  customerIds: number[];
  database: string;
  odooUrl: string;
  uid: number;
  warnings: string[];
}): Promise<OdooCustomerContactRecord[]> {
  if (customerIds.length === 0) return [];

  try {
    const directContacts = (await readPartnerContactRows({
      apiKey,
      database,
      odooUrl,
      partnerIds: customerIds,
      uid,
    })).map(normalizePartnerContactRow);
    const parentIds = uniqueNumbers(
      directContacts
        .map((contact) => contact.commercialPartnerId)
        .filter((id) => id !== null && !customerIds.includes(id)),
    );
    const parentContacts = parentIds.length
      ? (await readPartnerContactRows({
          apiKey,
          database,
          odooUrl,
          partnerIds: parentIds,
          uid,
        })).map(normalizePartnerContactRow)
      : [];
    const parentById = new Map(parentContacts.map((contact) => [contact.customerId, contact]));

    return directContacts.map((contact) => {
      const parent = contact.commercialPartnerId ? parentById.get(contact.commercialPartnerId) : null;
      if (!parent) return contact;
      return {
        ...contact,
        city: contact.city ?? parent.city,
        commercialPartnerName: contact.commercialPartnerName ?? parent.customerName,
        countryName: contact.countryName ?? parent.countryName,
        email: contact.email ?? parent.email,
        mobile: contact.mobile ?? parent.mobile,
        phone: contact.phone ?? parent.phone,
        stateName: contact.stateName ?? parent.stateName,
        street: contact.street ?? parent.street,
        street2: contact.street2 ?? parent.street2,
        zip: contact.zip ?? parent.zip,
      };
    });
  } catch (error) {
    warnings.push('No se pudieron leer datos de contacto de clientes desde res.partner para Marketing.');
    console.warn('[reports:odoo] res.partner contacts skipped', error);
    return [];
  }
}

function readPartnerContactRows({
  apiKey,
  database,
  odooUrl,
  partnerIds,
  uid,
}: {
  apiKey: string;
  database: string;
  odooUrl: string;
  partnerIds: number[];
  uid: number;
}) {
  return searchReadByChunks({
    apiKey,
    chunkIds: partnerIds,
    database,
    fields: [
      'id',
      'name',
      'email',
      'phone',
      'mobile',
      'street',
      'street2',
      'city',
      'state_id',
      'zip',
      'country_id',
      'commercial_partner_id',
    ],
    idField: 'id',
    model: 'res.partner',
    odooUrl,
    uid,
  });
}

function normalizePartnerContactRow(row: Record<string, unknown>): OdooCustomerContactRecord {
  return {
    customerId: Number(row.id),
    customerName: readString(row.name) ?? `Cliente ${row.id}`,
    email: readString(row.email),
    phone: readString(row.phone),
    mobile: readString(row.mobile),
    street: readString(row.street),
    street2: readString(row.street2),
    city: readString(row.city),
    stateName: readManyToOneLabel(row.state_id),
    zip: readString(row.zip),
    countryName: readManyToOneLabel(row.country_id),
    commercialPartnerId: readManyToOneId(row.commercial_partner_id),
    commercialPartnerName: readManyToOneLabel(row.commercial_partner_id),
  };
}

async function resolveDatabaseName(odooUrl: string) {
  const url = new URL(odooUrl);
  const databaseFromUrl =
    url.searchParams.get('db') ??
    url.searchParams.get('database') ??
    url.hash.replace('#db=', '').trim();

  if (databaseFromUrl) return databaseFromUrl;

  const response = await fetch(`${stripTrailingSlash(odooUrl)}/web/database/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo detectar la base de datos de Odoo. Respuesta ${response.status}.`,
    );
  }

  const payload = (await response.json()) as { result?: string[] };
  const database = payload.result?.[0];
  if (!database) {
    throw new Error(
      'Odoo no devolvio una base de datos valida. Agrega ?db=tu_base a ODOO_URL si la instancia no publica /web/database/list.',
    );
  }

  return database;
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
  const uid = await callJsonRpc<number | false>(`${stripTrailingSlash(odooUrl)}/jsonrpc`, {
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
      `Odoo rechazo la autenticacion para la base de datos "${database}". Verifica ODOO_URL, USER_ODOO y que API_KEY_ODOO pertenezca a ese usuario y siga activo.`,
    );
  }

  return uid;
}

async function getModelFields({
  apiKey,
  database,
  model,
  odooUrl,
  uid,
}: {
  apiKey: string;
  database: string;
  model: string;
  odooUrl: string;
  uid: number;
}) {
  return executeKw<OdooFieldMeta>({
    apiKey,
    args: [],
    database,
    kwargs: {
      attributes: ['string', 'type'],
    },
    method: 'fields_get',
    model,
    odooUrl,
    uid,
  });
}

async function searchReadByChunks({
  apiKey,
  chunkIds,
  database,
  fields,
  idField,
  maxRecords,
  model,
  odooUrl,
  uid,
}: {
  apiKey: string;
  chunkIds: number[];
  database: string;
  fields: string[];
  idField: string;
  maxRecords?: number;
  model: string;
  odooUrl: string;
  uid: number;
}) {
  const results: Array<Record<string, unknown>> = [];

  for (const chunk of chunkArray(chunkIds, SEARCH_READ_CHUNK_SIZE)) {
    let offset = 0;

    while (true) {
      const remainingRecords =
        typeof maxRecords === 'number' ? Math.max(maxRecords - results.length, 0) : SEARCH_READ_PAGE_SIZE;
      if (typeof maxRecords === 'number' && remainingRecords === 0) {
        return results.slice(0, maxRecords);
      }

      const pageLimit =
        typeof maxRecords === 'number'
          ? Math.min(SEARCH_READ_PAGE_SIZE, remainingRecords)
          : SEARCH_READ_PAGE_SIZE;

      const rows = await executeKw<Array<Record<string, unknown>>>({
        apiKey,
        args: [[[idField, 'in', chunk]]],
        database,
        kwargs: {
          fields,
          limit: pageLimit,
          offset,
        },
        method: 'search_read',
        model,
        odooUrl,
        uid,
      });
      results.push(...rows);

      if (typeof maxRecords === 'number' && results.length >= maxRecords) {
        return results.slice(0, maxRecords);
      }

      if (rows.length < pageLimit) {
        break;
      }

      offset += rows.length;
    }
  }

  return results;
}

async function searchReadAllPages({
  apiKey,
  database,
  domain,
  fields,
  model,
  odooUrl,
  order,
  uid,
}: {
  apiKey: string;
  database: string;
  domain: unknown[];
  fields: string[];
  model: string;
  odooUrl: string;
  order?: string;
  uid: number;
}) {
  const results: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (true) {
    const rows = await executeKw<Array<Record<string, unknown>>>({
      apiKey,
      args: [domain],
      database,
      kwargs: {
        fields,
        limit: SEARCH_READ_PAGE_SIZE,
        offset,
        ...(order ? { order } : {}),
      },
      method: 'search_read',
      model,
      odooUrl,
      uid,
    });

    results.push(...rows);

    if (rows.length < SEARCH_READ_PAGE_SIZE) {
      return results;
    }

    offset += rows.length;
  }
}

async function fetchFirstPurchaseRows({
  apiKey,
  database,
  domain,
  invoiceSellerField,
  odooUrl,
  uid,
}: {
  apiKey: string;
  database: string;
  domain: unknown[];
  invoiceSellerField: OdooFieldCandidate;
  odooUrl: string;
  uid: number;
}) {
  const fields = uniqueFields(['id', 'invoice_date', 'partner_id', invoiceSellerField]);

  try {
    const groupedRows = await executeKw<Array<Record<string, unknown>>>({
      apiKey,
      args: [
        domain,
        ['partner_id', 'first_invoice_date:min(invoice_date)'],
        ['partner_id'],
      ],
      database,
      kwargs: { lazy: false },
      method: 'read_group',
      model: 'account.move',
      odooUrl,
      uid,
    });
    const firstDateByCustomer = new Map<number, string>();
    groupedRows.forEach((row) => {
      const customerId = readManyToOneId(row.partner_id);
      const firstDate = normalizeDateValue(row.first_invoice_date);
      if (customerId && firstDate) firstDateByCustomer.set(customerId, firstDate);
    });
    const firstDates = Array.from(new Set(firstDateByCustomer.values()));
    if (!firstDates.length) return [];

    const candidates = await searchReadAllPages({
      apiKey,
      database,
      domain: [
        ...domain,
        ['invoice_date', 'in', firstDates],
      ],
      fields,
      model: 'account.move',
      odooUrl,
      order: 'invoice_date asc, id asc',
      uid,
    });
    const firstRowsByCustomer = new Map<number, Record<string, unknown>>();
    candidates.forEach((row) => {
      const customerId = readManyToOneId(row.partner_id);
      if (!customerId || firstRowsByCustomer.has(customerId)) return;
      if (normalizeDateValue(row.invoice_date) !== firstDateByCustomer.get(customerId)) return;
      firstRowsByCustomer.set(customerId, row);
    });
    return Array.from(firstRowsByCustomer.values());
  } catch (error) {
    console.warn('[reports:odoo] read_group first purchase fallback', error);
    return searchReadAllPages({
      apiKey,
      database,
      domain,
      fields,
      model: 'account.move',
      odooUrl,
      order: 'invoice_date asc, id asc',
      uid,
    });
  }
}

function mergeRecordsById(rows: Array<Record<string, unknown>>) {
  const merged = new Map<number, Record<string, unknown>>();

  rows.forEach((row) => {
    const recordId = Number(row.id);
    if (!Number.isFinite(recordId)) {
      return;
    }

    if (!merged.has(recordId)) {
      merged.set(recordId, row);
    }
  });

  return Array.from(merged.values());
}

async function executeKw<T>({
  apiKey,
  args,
  database,
  kwargs,
  method,
  model,
  odooUrl,
  uid,
}: {
  apiKey: string;
  args: unknown[];
  database: string;
  kwargs: Record<string, unknown>;
  method: OdooReadMethod;
  model: string;
  odooUrl: string;
  uid: number;
}) {
  if (!READ_ONLY_ODOO_METHODS.has(method)) {
    throw new Error(
      `El módulo de reportes solo permite consultas de lectura en Odoo. Método bloqueado: ${method}.`,
    );
  }

  return callJsonRpc<T>(`${stripTrailingSlash(odooUrl)}/jsonrpc`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [database, uid, apiKey, model, method, args, kwargs],
    },
  });
}

async function callJsonRpc<T>(url: string, payload: Record<string, unknown>) {
  // Odoo JSON-RPC utiliza HTTP POST incluso para consultas de solo lectura.
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Odoo respondio ${response.status} ${response.statusText}.`);
  }

  const data = (await response.json()) as JsonRpcResponse<T>;
  if (data.error) {
    const errorName = data.error.data?.name;
    const errorMessage =
      data.error.data?.message?.trim() ||
      data.error.message?.trim() ||
      'Odoo devolvio un error sin detalle.';
    throw new Error(errorName ? `${errorName}: ${errorMessage}` : errorMessage);
  }

  return data.result as T;
}

function buildOdooRecordUrl(odooUrl: string, model: string, recordId: number) {
  if (!recordId) return null;
  return `${stripTrailingSlash(odooUrl)}/web#id=${recordId}&model=${model}&view_type=form`;
}

function buildUniqueOptions(
  entries: Array<{ id: number | string | null; label: string | null }>,
) {
  const seen = new Map<string, ReportOption>();
  entries.forEach((entry) => {
    if (entry.id === null || entry.id === '' || !entry.label?.trim()) return;
    const key = `${entry.id}`;
    if (!seen.has(key)) {
      seen.set(key, {
        id: entry.id,
        label: entry.label.trim(),
      });
    }
  });

  return [...seen.values()].sort((left, right) =>
    left.label.localeCompare(right.label, 'es-MX'),
  );
}

function getProductCost(
  productCatalogMap: Map<number, ProductCatalogEntry>,
  productId: number | null,
) {
  if (!productId) return null;
  return productCatalogMap.has(productId)
    ? productCatalogMap.get(productId)?.standardCost ?? null
    : null;
}

function getProductCategory(
  productCatalogMap: Map<number, ProductCatalogEntry>,
  productId: number | null,
) {
  if (!productId) return null;
  return productCatalogMap.get(productId) ?? null;
}

function pickFirstAvailable(meta: OdooFieldMeta, candidates: string[]) {
  return candidates.find((candidate) => candidate in meta) ?? null;
}

function uniqueFields(fields: OdooFieldCandidate[]) {
  return [...new Set(fields.filter((field): field is string => Boolean(field)))];
}

function uniqueNumbers(values: Array<number | null>) {
  return [...new Set(values.filter((value): value is number => value !== null))];
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function readNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function readNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readManyToOneId(value: unknown) {
  if (Array.isArray(value) && value.length > 0) {
    const id = Number(value[0]);
    return Number.isFinite(id) ? id : null;
  }
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function readManyToOneLabel(value: unknown) {
  if (Array.isArray(value) && value.length > 1) {
    const label = value[1];
    return typeof label === 'string' && label.trim() ? label.trim() : null;
  }
  return null;
}

function readManyToManyIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function readRelationalIds(value: unknown) {
  const manyToOneId = readManyToOneId(value);
  if (manyToOneId !== null) {
    return [manyToOneId];
  }

  return readManyToManyIds(value);
}

function readChannelValue(row: Record<string, unknown>) {
  const relationalChannel =
    readManyToOneLabel(row.source_id) ??
    readManyToOneLabel(row.medium_id) ??
    readManyToOneLabel(row.campaign_id);
  return relationalChannel ?? readString(row.origin);
}

function normalizeCurrencyLabel(value: unknown) {
  const label = readManyToOneLabel(value) ?? readString(value);
  if (!label) return null;
  const compact = label.trim().toUpperCase();
  return compact.length <= 6 ? compact : label.trim();
}

function normalizeDateValue(value: unknown) {
  const raw = readString(value);
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const date = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isDateWithinReportRange(value: string | null | undefined, startDate: string, endDate: string) {
  const normalized = `${value ?? ''}`.slice(0, 10);
  return Boolean(normalized) && normalized >= startDate && normalized <= endDate;
}

function isSalesOrderDateWithinReportRange(value: string | null | undefined, startDate: string, endDate: string) {
  const normalized = getSalesOrderDateKey(value);
  return normalized !== null && normalized >= startDate && normalized <= endDate;
}

function getSalesOrderDateKey(value: string | null | undefined) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const date = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateKeyInReportTimeZone(date);
}

function formatDateKeyInReportTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function extractSourceDocumentNames(origin: string | null | undefined) {
  return `${origin ?? ''}`
    .split(/[,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeSourceDocumentName(value: string | null | undefined) {
  return `${value ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isConfirmedState(state: string) {
  return state === 'sale';
}

function averageNumbers(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
