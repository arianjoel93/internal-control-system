// @ts-nocheck
import {
  authenticateWithDatabaseCandidates,
  executeReadKw,
  fieldsGet,
  searchReadAll,
} from '../_shared/odoo-readonly.ts';
import {
  normalizeOdooEmail,
  selectExactActiveOdooUsers,
} from './salesperson-scope.ts';

export const defaultReportsConfig = {
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
  marginMethod: 'product_standard_cost',
};

const PAGE_SIZE = 400;
const CHUNK_SIZE = 200;
const MIN_COMPARISON_LOOKBACK_DAYS = 395;
const MAX_LOOKBACK_DAYS = 420;

export async function resolveOdooSalespersonIdentity(options) {
  const normalizedEmail = normalizeOdooEmail(options.email);
  const connection = options.connection ?? await authenticateWithDatabaseCandidates({
    apiKey: options.apiKey,
    configuredDatabase: options.odooDatabase ?? '',
    odooUrl: trimSlash(options.odooUrl),
    user: `${options.user ?? ''}`.trim(),
  });

  if (!normalizedEmail) {
    return {
      connection,
      normalizedEmail,
      status: 'not_found',
      users: [],
    };
  }

  const rows = await executeReadKw({
    apiKey: options.apiKey,
    args: [[
      ['active', '=', true],
      '|',
      ['login', '=ilike', normalizedEmail],
      ['email', '=ilike', normalizedEmail],
    ]],
    database: connection.database,
    kwargs: {
      fields: [
        'id',
        'name',
        'login',
        'email',
        'active',
        'partner_id',
        'company_id',
        'company_ids',
      ],
      limit: 50,
      order: 'id asc',
    },
    method: 'search_read',
    model: 'res.users',
    odooUrl: connection.odooUrl,
    uid: connection.uid,
  });
  const users = selectExactActiveOdooUsers(rows, normalizedEmail);

  return {
    connection,
    normalizedEmail,
    status: users.length === 1 ? 'linked' : users.length > 1 ? 'ambiguous' : 'not_found',
    users,
  };
}

export async function fetchCommercialDataset(options) {
  let odooUrl = trimSlash(options.odooUrl);
  const apiKey = `${options.apiKey ?? ''}`.trim();
  const user = `${options.user ?? ''}`.trim();
  const filters = options.filters;
  const requestedDomain = options.requestedDomain === 'purchases'
    ? 'purchases'
    : options.requestedDomain === 'all'
      ? 'all'
      : 'sales';
  const includeSales = requestedDomain !== 'purchases';
  if (!odooUrl || !apiKey || !user) {
    throw new Error('Faltan ODOO_URL, USER_ODOO o API_KEY_ODOO para generar el dashboard comercial.');
  }

  const connection = options.connection ?? await authenticateWithDatabaseCandidates({
      apiKey,
      configuredDatabase: options.odooDatabase ?? '',
      odooUrl,
      user,
    });
  const { database, uid } = connection;
  odooUrl = connection.odooUrl;
  const warnings = [];
  const dataQualityAlerts = [];
  const historyDays = options.loadMode === 'fast'
    ? calculateFastHistoryDays(filters)
    : calculateHistoryDays(filters);
  const startDate = minusDays(filters.startDate, historyDays);
  const endDate = filters.endDate;

  const [orderMeta, orderLineMeta, invoiceMeta, invoiceLineMeta] = includeSales
    ? await Promise.all([
        fieldsGet({ apiKey, database, model: 'sale.order', odooUrl, uid }),
        fieldsGet({ apiKey, database, model: 'sale.order.line', odooUrl, uid }),
        fieldsGet({ apiKey, database, model: 'account.move', odooUrl, uid }),
        fieldsGet({ apiKey, database, model: 'account.move.line', odooUrl, uid }),
      ])
    : [{}, {}, {}, {}];

  const orderCreationField = 'create_date';
  const orderConfirmationDateField = pick(orderMeta, ['date_order']);
  const orderShippingField = pick(orderMeta, ['partner_shipping_id']);
  const orderChannelField = pick(orderMeta, ['source_id', 'medium_id', 'campaign_id', 'origin']);
  const orderCategoryField = pick(orderLineMeta, ['categ_id', 'product_categ_id']);
  const invoiceSellerField = pick(invoiceMeta, ['invoice_user_id', 'user_id']) ?? 'invoice_user_id';
  const invoiceTeamField = pick(invoiceMeta, ['team_id']) ?? 'team_id';
  const invoiceShippingField = pick(invoiceMeta, ['partner_shipping_id']);
  const invoiceCategoryField = pick(invoiceLineMeta, ['product_categ_id', 'product_category_id', 'categ_id']);
  const invoiceSaleLineField = pick(invoiceLineMeta, ['sale_line_ids']);
  const invoiceMarginField = pick(invoiceLineMeta, ['margin']);
  const invoicePurchaseField = pick(invoiceLineMeta, ['purchase_price']);
  const orderMarginField = pick(orderLineMeta, ['margin']);
  const orderPurchaseField = pick(orderLineMeta, ['purchase_price']);
  let leadMeta = {};
  if (includeSales) {
    try {
      leadMeta = await fieldsGet({ apiKey, database, model: 'crm.lead', odooUrl, uid });
    } catch (error) {
      warnings.push('No se pudo leer el modelo crm.lead para alertas de oportunidades. El resto del reporte continuará disponible.');
      console.warn('[odoo-sales-report] crm.lead fields_get skipped', error);
    }
  }
  const leadSellerField = pick(leadMeta, ['user_id']);
  const leadTeamField = pick(leadMeta, ['team_id']);
  const leadCompanyField = pick(leadMeta, ['company_id']);
  const leadExpectedRevenueField = pick(leadMeta, ['expected_revenue', 'planned_revenue']);

  const ownOdooUsers =
    filters.visibilityScope === 'own'
      ? options.viewerOdooUsers?.length
        ? options.viewerOdooUsers
        : options.viewerOdooUserIds?.length
          ? options.viewerOdooUserIds.map((id) => ({ id }))
        : await findCurrentOdooUsers({
            apiKey,
            database,
            email: options.viewerEmail ?? '',
            odooUrl,
            uid,
          })
      : [];
  const ownUserIds = ownOdooUsers.map((row) => Number(row.id)).filter(Number.isFinite);
  if (filters.visibilityScope === 'own' && ownUserIds.length !== 1) {
    throw new Error(
      ownUserIds.length > 1
        ? 'Se encontraron varios vendedores activos de Odoo para el correo autenticado.'
        : 'No existe un vendedor activo de Odoo asociado exactamente con el correo autenticado.',
    );
  }

  const orderFields = uniq([
    'id',
    'name',
    'state',
    'create_date',
    orderConfirmationDateField,
    orderCreationField,
    'validity_date',
    'partner_id',
    orderShippingField,
    'user_id',
    'team_id',
    'company_id',
    'currency_id',
    'amount_untaxed',
    'amount_total',
    'invoice_status',
    orderChannelField,
    'origin',
  ]);

  const ordersByCreationRaw = includeSales ? await searchReadAll({
    apiKey,
    database,
    domain: buildOrderDomain({
      filters,
      ownUserIds,
      orderDateField: orderCreationField,
      orderChannelField,
      startDate,
      endDate,
    }),
    fields: orderFields,
    model: 'sale.order',
    odooUrl,
    order: `${orderCreationField} desc, id desc`,
    uid,
  }) : [];
  const ordersByOrderDateRaw =
    includeSales && orderConfirmationDateField && orderConfirmationDateField !== orderCreationField
      ? await searchReadAll({
          apiKey,
          database,
          domain: buildOrderDomain({
            filters,
            ownUserIds,
            orderDateField: orderConfirmationDateField,
            orderChannelField,
            startDate,
            endDate,
          }),
          fields: orderFields,
          model: 'sale.order',
          odooUrl,
          order: `${orderConfirmationDateField} desc, id desc`,
          uid,
        })
      : [];
  const ordersRaw = mergeById([...ordersByCreationRaw, ...ordersByOrderDateRaw]);

  const orderIds = idsOf(ordersRaw);
  const orderLinesRaw = orderIds.length
    ? await searchReadChunks({
        apiKey,
        chunkIds: orderIds,
        database,
        fields: uniq([
          'id',
          'order_id',
          'product_id',
          orderCategoryField,
          'product_uom_qty',
          'price_subtotal',
          'price_total',
          orderMarginField,
          orderPurchaseField,
          'discount',
        ]),
        idField: 'order_id',
        model: 'sale.order.line',
        odooUrl,
        uid,
      })
    : [];

  const invoicesRaw = includeSales ? await searchReadAll({
    apiKey,
    database,
    domain: buildInvoiceDomain({
      filters,
      ownUserIds,
      invoiceSellerField,
      invoiceTeamField,
      startDate,
      endDate,
    }),
    fields: uniq([
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
      'invoice_origin',
      'payment_state',
    ]),
    model: 'account.move',
    odooUrl,
    order: 'invoice_date desc, id desc',
    uid,
  }) : [];

  const postedInvoicesRaw = invoicesRaw.filter((row) => readText(row.state) === 'posted');
  const invoiceIds = idsOf(postedInvoicesRaw);
  const invoiceLinesRaw = invoiceIds.length
    ? await searchReadChunks({
        apiKey,
        chunkIds: invoiceIds,
        database,
        fields: uniq([
          'id',
          'move_id',
          'product_id',
          invoiceCategoryField,
          'quantity',
          'price_subtotal',
          'price_total',
          'balance',
          'discount',
          'display_type',
          invoiceSaleLineField,
          invoiceMarginField,
          invoicePurchaseField,
          'name',
        ]),
        idField: 'move_id',
        model: 'account.move.line',
        odooUrl,
        uid,
      })
    : [];

  const productIds = uniqueNumbers([
    ...many2oneIds(orderLinesRaw, 'product_id'),
    ...many2oneIds(invoiceLinesRaw, 'product_id'),
  ]);
  const productsRaw = productIds.length
    ? await searchReadChunks({
        apiKey,
        chunkIds: productIds,
        database,
        fields: ['id', 'standard_price', 'categ_id'],
        idField: 'id',
        model: 'product.product',
        odooUrl,
        uid,
      })
    : [];
  const productMap = new Map(
    productsRaw.map((row) => [
      Number(row.id),
      {
        categoryId: many2oneId(row.categ_id),
        categoryName: many2oneLabel(row.categ_id),
        standardCost: numOrNull(row.standard_price),
      },
    ]),
  );

  const crmLeadsRaw = includeSales && Object.keys(leadMeta).length
    ? await searchReadAll({
        apiKey,
        database,
        domain: buildCrmLeadDomain({
          filters,
          leadCompanyField,
          leadSellerField,
          leadTeamField,
          ownUserIds,
        }),
        fields: uniq([
          'id',
          'name',
          'type',
          'active',
          'create_date',
          'write_date',
          'date_deadline',
          'date_closed',
          'partner_id',
          leadSellerField,
          leadTeamField,
          leadCompanyField,
          'stage_id',
          leadExpectedRevenueField,
          'probability',
          'priority',
          'email_from',
          'phone',
        ]),
        model: 'crm.lead',
        odooUrl,
        order: 'write_date desc, id desc',
        pageSize: 300,
        uid,
      }).catch((error) => {
        warnings.push('No se pudieron leer oportunidades de CRM para notificaciones de seguimiento.');
        console.warn('[odoo-sales-report] crm.lead search_read skipped', error);
        return [];
      })
    : [];

  const orders = ordersRaw.map((row) => ({
    id: Number(row.id),
    name: readText(row.name) ?? `SO-${row.id}`,
    state: readText(row.state) ?? 'draft',
    createDate: iso(row.create_date),
    quotationDate: iso(row.create_date),
    confirmationDate: iso(row.date_order),
    validityDate: iso(row.validity_date),
    customerId: many2oneId(row.partner_id),
    customerName: many2oneLabel(row.partner_id) ?? 'Cliente sin nombre',
    deliveryCustomerId: orderShippingField ? many2oneId(row[orderShippingField]) : null,
    deliveryCustomerName: orderShippingField ? many2oneLabel(row[orderShippingField]) : null,
    sellerId: many2oneId(row.user_id),
    sellerName: many2oneLabel(row.user_id) ?? 'Sin vendedor',
    teamId: many2oneId(row.team_id),
    teamName: many2oneLabel(row.team_id),
    companyId: many2oneId(row.company_id),
    companyName: many2oneLabel(row.company_id),
    currencyCode: currencyLabel(row.currency_id),
    amountUntaxed: num(row.amount_untaxed),
    amountTotal: num(row.amount_total),
    invoiceStatus: readText(row.invoice_status),
    channel: channelValue(row),
    origin: readText(row.origin),
  }));
  const orderMap = new Map(orders.map((row) => [row.id, row]));
  const orderBySourceName = new Map(
    orders
      .map((order) => [normalizeSourceDocumentName(order.name), order] as const)
      .filter(([name]) => Boolean(name)),
  );

  const orderLines = orderLinesRaw
    .map((row) => {
      const orderId = many2oneId(row.order_id);
      const order = orderMap.get(orderId);
      if (!order) return null;
      const productId = many2oneId(row.product_id);
      const product = productMap.get(productId) ?? null;
      const quantity = num(row.product_uom_qty);
      const directMargin = orderMarginField ? numOrNull(row[orderMarginField]) : null;
      const purchaseUnit = orderPurchaseField ? numOrNull(row[orderPurchaseField]) : null;
      const standardUnit = product?.standardCost ?? null;
      const unitCost = purchaseUnit ?? standardUnit;
      const costAmount = unitCost === null ? null : unitCost * quantity;
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
        productName: many2oneLabel(row.product_id) ?? 'Producto sin nombre',
        categoryId: many2oneId(row[orderCategoryField]) ?? product?.categoryId ?? null,
        categoryName: many2oneLabel(row[orderCategoryField]) ?? product?.categoryName ?? null,
        quantity,
        untaxedAmount: num(row.price_subtotal),
        totalAmount: num(row.price_total),
        unitCost,
        costAmount,
        marginAmount: directMargin ?? (costAmount === null ? null : num(row.price_subtotal) - costAmount),
        lineMarginValue: directMargin,
        linePurchaseUnitCost: purchaseUnit,
        standardUnitCost: standardUnit,
        discount: numOrNull(row.discount),
      };
    })
    .filter(Boolean);
  const orderLineMap = new Map(orderLines.map((row) => [row.id, row]));

  const invoices = postedInvoicesRaw.map((row) => {
    const invoice = {
      id: Number(row.id),
      name: readText(row.name) ?? `INV-${row.id}`,
      state: readText(row.state) ?? 'draft',
      moveType: readText(row.move_type) ?? 'out_invoice',
      invoiceDate: iso(row.invoice_date),
      customerId: many2oneId(row.partner_id),
      customerName: many2oneLabel(row.partner_id) ?? 'Cliente sin nombre',
      deliveryCustomerId: invoiceShippingField ? many2oneId(row[invoiceShippingField]) : null,
      deliveryCustomerName: invoiceShippingField ? many2oneLabel(row[invoiceShippingField]) : null,
      sellerId: many2oneId(row[invoiceSellerField]),
      sellerName: many2oneLabel(row[invoiceSellerField]) ?? 'Sin vendedor',
      teamId: many2oneId(row[invoiceTeamField]),
      teamName: many2oneLabel(row[invoiceTeamField]),
      companyId: many2oneId(row.company_id),
      companyName: many2oneLabel(row.company_id),
      currencyCode: currencyLabel(row.currency_id),
      untaxedAmountSigned: num(row.amount_untaxed_signed),
      totalAmountSigned: num(row.amount_total_signed),
      invoiceOrigin: readText(row.invoice_origin),
      paymentState: readText(row.payment_state),
    };
    if (invoice.deliveryCustomerName) return invoice;

    const sourceOrder = resolveOrderFromInvoiceOrigin(invoice.invoiceOrigin, orderBySourceName);
    return sourceOrder?.deliveryCustomerName
      ? {
          ...invoice,
          deliveryCustomerId: sourceOrder.deliveryCustomerId,
          deliveryCustomerName: sourceOrder.deliveryCustomerName,
        }
      : invoice;
  });
  const invoiceMap = new Map(invoices.map((row) => [row.id, row]));
  const crmLeads = crmLeadsRaw.map((row) => ({
    id: Number(row.id),
    name: readText(row.name) ?? `Oportunidad ${row.id}`,
    type: readText(row.type) ?? 'opportunity',
    active: row.active !== false,
    createDate: iso(row.create_date),
    writeDate: iso(row.write_date),
    deadlineDate: iso(row.date_deadline),
    closedDate: iso(row.date_closed),
    customerId: many2oneId(row.partner_id),
    customerName: many2oneLabel(row.partner_id),
    sellerId: many2oneId(row[leadSellerField]),
    sellerName: many2oneLabel(row[leadSellerField]),
    teamId: many2oneId(row[leadTeamField]),
    teamName: many2oneLabel(row[leadTeamField]),
    companyId: many2oneId(row[leadCompanyField]),
    companyName: many2oneLabel(row[leadCompanyField]),
    stageId: many2oneId(row.stage_id),
    stageName: many2oneLabel(row.stage_id),
    expectedRevenue: leadExpectedRevenueField ? num(row[leadExpectedRevenueField]) : 0,
    probability: num(row.probability),
    priority: readText(row.priority),
    emailFrom: readText(row.email_from),
    phone: readText(row.phone),
  }));

  const customerContactIds = uniqueNumbers([
    ...orders.map((row) => row.customerId),
    ...orders.map((row) => row.deliveryCustomerId ?? null),
    ...invoices.map((row) => row.customerId),
    ...invoices.map((row) => row.deliveryCustomerId ?? null),
    ...crmLeads.map((row) => row.customerId),
  ]);
  const customerContacts = await fetchCustomerContacts({
    apiKey,
    customerIds: customerContactIds,
    database,
    odooUrl,
    uid,
    warnings,
  });

  const invoiceLines = invoiceLinesRaw
    .map((row) => {
      const invoiceId = many2oneId(row.move_id);
      const invoice = invoiceMap.get(invoiceId);
      if (!invoice) return null;
      const displayType = readText(row.display_type);
      if (displayType && ['tax', 'payment_term', 'line_section', 'line_note', 'rounding', 'epd', 'cogs'].includes(displayType)) {
        return null;
      }
      const productId = many2oneId(row.product_id);
      const product = productMap.get(productId) ?? null;
      const saleLineIds = invoiceSaleLineField ? relationIds(row[invoiceSaleLineField]) : [];
      const linkedLine = saleLineIds.map((id) => orderLineMap.get(id)).find(Boolean) ?? null;
      const linkedDeliveryLine = saleLineIds
        .map((id) => orderLineMap.get(id))
        .find((line) => line?.deliveryCustomerName) ?? null;
      const sign = invoice.moveType === 'out_refund' ? -1 : 1;
      const quantity = num(row.quantity) * sign;
      // Odoo's Accounting > Reports > Invoice Analysis calculates "Untaxed Total"
      // from the accounting balance in company currency: -account.move.line.balance.
      const balanceAmount = numOrNull(row.balance);
      const untaxedAmount = balanceAmount === null ? num(row.price_subtotal) * sign : -balanceAmount;
      const directMargin = invoiceMarginField ? numOrNull(row[invoiceMarginField]) : null;
      const purchaseUnit = invoicePurchaseField ? numOrNull(row[invoicePurchaseField]) : null;
      const linkedPurchaseUnit = linkedLine?.linePurchaseUnitCost ?? null;
      const standardUnit = product?.standardCost ?? null;
      const unitCost = purchaseUnit ?? linkedPurchaseUnit ?? standardUnit;
      const costAmount = unitCost === null ? null : unitCost * quantity;
      return {
        id: Number(row.id),
        invoiceId,
        invoiceName: invoice.name,
        invoiceState: invoice.state,
        moveType: invoice.moveType,
        invoiceDate: invoice.invoiceDate,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        deliveryCustomerId: invoice.deliveryCustomerId ?? linkedDeliveryLine?.deliveryCustomerId ?? null,
        deliveryCustomerName: invoice.deliveryCustomerName ?? linkedDeliveryLine?.deliveryCustomerName ?? null,
        sellerId: invoice.sellerId,
        sellerName: invoice.sellerName,
        teamId: invoice.teamId,
        teamName: invoice.teamName,
        companyId: invoice.companyId,
        companyName: invoice.companyName,
        currencyCode: invoice.currencyCode,
        productId,
        productName: many2oneLabel(row.product_id) ?? readText(row.name) ?? 'Producto sin nombre',
        categoryId: many2oneId(row[invoiceCategoryField]) ?? product?.categoryId ?? null,
        categoryName: many2oneLabel(row[invoiceCategoryField]) ?? product?.categoryName ?? null,
        quantity,
        untaxedAmount,
        totalAmount: num(row.price_total) * sign,
        unitCost,
        costAmount,
        marginAmount: directMargin === null ? (costAmount === null ? null : untaxedAmount - costAmount) : directMargin * sign,
        linePurchaseUnitCost: purchaseUnit,
        standardUnitCost: standardUnit,
        discount: numOrNull(row.discount),
        displayType,
        sourceOrderIds: linkedLine ? [linkedLine.orderId] : [],
        sourceOrderNames: linkedLine ? [linkedLine.orderName] : [],
        sourceSaleLineIds: saleLineIds,
      };
    })
    .filter(Boolean);

  const currentCustomerIds = uniqueNumbers(
    invoices
      .filter((row) => inRange(row.invoiceDate, filters.startDate, filters.endDate))
      .map((row) => row.customerId),
  );
  const firstPurchasesRows = currentCustomerIds.length
    ? await fetchFirstPurchaseRows({
        apiKey,
        currentCustomerIds,
        database,
        endDate,
        invoiceSellerField,
        odooUrl,
        uid,
      })
    : [];
  const firstMap = new Map();
  firstPurchasesRows.forEach((row) => {
    const customerId = many2oneId(row.partner_id);
    if (customerId && !firstMap.has(customerId)) firstMap.set(customerId, row);
  });
  const customerFirstPurchases = [...firstMap.values()].map((row) => ({
    customerId: many2oneId(row.partner_id),
    customerName: many2oneLabel(row.partner_id) ?? 'Cliente sin nombre',
    sellerId: many2oneId(row[invoiceSellerField]),
    sellerName: many2oneLabel(row[invoiceSellerField]) ?? 'Sin vendedor',
    invoiceDate: iso(row.invoice_date),
  }));

  let purchaseOrders = [];
  let purchaseOrderLines = [];
  let vendorBills = [];
  let vendorBillLines = [];

  if (requestedDomain === 'all' || requestedDomain === 'purchases') {
    const [purchaseMeta, purchaseLineMeta] = await Promise.all([
      fieldsGet({ apiKey, database, model: 'purchase.order', odooUrl, uid }),
      fieldsGet({ apiKey, database, model: 'purchase.order.line', odooUrl, uid }),
    ]);
    const purchaseDateField = pick(purchaseMeta, ['date_approve', 'date_order', 'create_date']) ?? 'date_order';
    const purchaseCategoryField = pick(purchaseLineMeta, ['categ_id', 'product_categ_id']);

    const purchaseOrdersRaw = await searchReadAll({
      apiKey,
      database,
      domain: buildPurchaseOrderDomain({ filters, ownUserIds, purchaseDateField }),
      fields: uniq([
        'id',
        'name',
        'state',
        'create_date',
        'date_order',
        'date_approve',
        'partner_id',
        'user_id',
        'company_id',
        'currency_id',
        'amount_untaxed',
        'amount_total',
        'invoice_status',
        'origin',
      ]),
      model: 'purchase.order',
      odooUrl,
      order: `${purchaseDateField} desc, id desc`,
      uid,
    });

    purchaseOrders = purchaseOrdersRaw.map((row) => ({
      id: Number(row.id),
      name: readText(row.name) ?? `PO-${row.id}`,
      state: readText(row.state) ?? 'draft',
      createDate: iso(row.create_date),
      orderDate: iso(row.date_order),
      approvalDate: iso(row.date_approve ?? row.date_order),
      supplierId: many2oneId(row.partner_id),
      supplierName: many2oneLabel(row.partner_id) ?? 'Proveedor sin nombre',
      buyerId: many2oneId(row.user_id),
      buyerName: many2oneLabel(row.user_id) ?? 'Sin comprador',
      companyId: many2oneId(row.company_id),
      companyName: many2oneLabel(row.company_id),
      currencyCode: currencyLabel(row.currency_id),
      amountUntaxed: num(row.amount_untaxed),
      amountTotal: num(row.amount_total),
      invoiceStatus: readText(row.invoice_status),
      origin: readText(row.origin),
    }));
    const purchaseMap = new Map(purchaseOrders.map((row) => [row.id, row]));

    const purchaseOrderIds = idsOf(purchaseOrdersRaw);
    const purchaseLinesRaw = purchaseOrderIds.length
      ? await searchReadChunks({
          apiKey,
          chunkIds: purchaseOrderIds,
          database,
          fields: uniq([
            'id',
            'order_id',
            'product_id',
            purchaseCategoryField,
            'product_qty',
            'price_subtotal',
            'price_total',
            'discount',
          ]),
          idField: 'order_id',
          model: 'purchase.order.line',
          odooUrl,
          uid,
        })
      : [];
    purchaseOrderLines = purchaseLinesRaw
      .map((row) => {
        const orderId = many2oneId(row.order_id);
        const order = purchaseMap.get(orderId);
        if (!order) return null;
        const productId = many2oneId(row.product_id);
        const product = productMap.get(productId) ?? null;
        const quantity = num(row.product_qty);
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
          productName: many2oneLabel(row.product_id) ?? 'Producto sin nombre',
          categoryId: many2oneId(row[purchaseCategoryField]) ?? product?.categoryId ?? null,
          categoryName: many2oneLabel(row[purchaseCategoryField]) ?? product?.categoryName ?? null,
          quantity,
          untaxedAmount: num(row.price_subtotal),
          totalAmount: num(row.price_total),
          unitCost: quantity ? num(row.price_subtotal) / quantity : null,
          discount: numOrNull(row.discount),
        };
      })
      .filter(Boolean);

    const vendorBillsRaw = await searchReadAll({
      apiKey,
      database,
      domain: buildVendorBillDomain({ filters, ownUserIds }),
      fields: [
        'id',
        'name',
        'state',
        'move_type',
        'invoice_date',
        'partner_id',
        'invoice_user_id',
        'company_id',
        'currency_id',
        'amount_untaxed_signed',
        'amount_total_signed',
        'invoice_origin',
        'payment_state',
      ],
      model: 'account.move',
      odooUrl,
      order: 'invoice_date desc, id desc',
      uid,
    });
    vendorBills = vendorBillsRaw
      .filter((row) => readText(row.state) === 'posted')
      .map((row) => ({
        id: Number(row.id),
        name: readText(row.name) ?? `BILL-${row.id}`,
        state: readText(row.state) ?? 'draft',
        moveType: readText(row.move_type) ?? 'in_invoice',
        invoiceDate: iso(row.invoice_date),
        supplierId: many2oneId(row.partner_id),
        supplierName: many2oneLabel(row.partner_id) ?? 'Proveedor sin nombre',
        buyerId: many2oneId(row.invoice_user_id),
        buyerName: many2oneLabel(row.invoice_user_id) ?? 'Sin comprador',
        companyId: many2oneId(row.company_id),
        companyName: many2oneLabel(row.company_id),
        currencyCode: currencyLabel(row.currency_id),
        untaxedAmountSigned: num(row.amount_untaxed_signed),
        totalAmountSigned: num(row.amount_total_signed),
        invoiceOrigin: readText(row.invoice_origin),
        paymentState: readText(row.payment_state),
      }));
    const vendorMap = new Map(vendorBills.map((row) => [row.id, row]));
    const vendorBillIds = idsOf(vendorBillsRaw);
    const vendorLinesRaw = vendorBillIds.length
      ? await searchReadChunks({
          apiKey,
          chunkIds: vendorBillIds,
          database,
          fields: uniq([
            'id',
            'move_id',
            'product_id',
            invoiceCategoryField,
            'quantity',
            'price_subtotal',
            'price_total',
            'balance',
            'discount',
            'display_type',
            'name',
          ]),
          idField: 'move_id',
          model: 'account.move.line',
          odooUrl,
          uid,
        })
      : [];
    vendorBillLines = vendorLinesRaw
      .map((row) => {
        const invoiceId = many2oneId(row.move_id);
        const invoice = vendorMap.get(invoiceId);
        if (!invoice) return null;
        const displayType = readText(row.display_type);
        if (displayType && ['tax', 'payment_term', 'line_section', 'line_note', 'rounding', 'epd', 'cogs'].includes(displayType)) {
          return null;
        }
        const sign = invoice.moveType === 'in_refund' ? -1 : 1;
        const productId = many2oneId(row.product_id);
        const product = productMap.get(productId) ?? null;
        return {
          id: Number(row.id),
          invoiceId,
          invoiceName: invoice.name,
          invoiceState: invoice.state,
          moveType: invoice.moveType,
          invoiceDate: invoice.invoiceDate,
          supplierId: invoice.supplierId,
          supplierName: invoice.supplierName,
          buyerId: invoice.buyerId,
          buyerName: invoice.buyerName,
          companyId: invoice.companyId,
          companyName: invoice.companyName,
          currencyCode: invoice.currencyCode,
          productId,
          productName: many2oneLabel(row.product_id) ?? readText(row.name) ?? 'Producto sin nombre',
          categoryId: many2oneId(row[invoiceCategoryField]) ?? product?.categoryId ?? null,
          categoryName: many2oneLabel(row[invoiceCategoryField]) ?? product?.categoryName ?? null,
          quantity: num(row.quantity) * sign,
          untaxedAmount: (numOrNull(row.balance) ?? num(row.price_subtotal)) * sign,
          totalAmount: num(row.price_total) * sign,
          purchaseLineIds: [],
          sourceOrderIds: [],
          sourceOrderNames: splitOrigin(invoice.invoiceOrigin),
          discount: numOrNull(row.discount),
          displayType,
        };
      })
      .filter(Boolean);
  }

  const ordersWithoutSeller = orders.filter((row) => !row.sellerId).length;
  const linesWithoutCost = invoiceLines.filter((row) => row.displayType !== 'discount' && !row.costAmount && Math.abs(row.untaxedAmount) > 0).length;
  const negativeMargins = invoiceLines.filter((row) => (row.marginAmount ?? 0) < 0).length;
  if (ordersWithoutSeller) dataQualityAlerts.push(`${ordersWithoutSeller} ordenes no tienen vendedor asignado.`);
  if (linesWithoutCost) dataQualityAlerts.push(`${linesWithoutCost} lineas facturadas tienen coste nulo o cero.`);
  if (negativeMargins) dataQualityAlerts.push(`${negativeMargins} lineas facturadas muestran margen negativo.`);
  if (!invoiceMarginField && !invoicePurchaseField) {
    warnings.push('Las lineas contables no exponen margen directo; el margen se estima con coste estandar o linea comercial relacionada.');
  }

  const periodInvoices = invoices.filter((row) => inRange(row.invoiceDate, filters.startDate, filters.endDate));
  const periodInvoiceLines = invoiceLines.filter((row) => inRange(row.invoiceDate, filters.startDate, filters.endDate));
  const periodOrders = orders.filter((row) => inRangeOdooSalesOrderDate(row.state === 'sale' ? row.confirmationDate : row.createDate || row.quotationDate, filters.startDate, filters.endDate));
  const periodOrderLines = orderLines.filter((row) => inRangeOdooSalesOrderDate(row.orderState === 'sale' ? row.confirmationDate : row.quotationDate, filters.startDate, filters.endDate));
  const periodPurchaseOrders = purchaseOrders.filter((row) => inRange(row.orderDate || row.approvalDate, filters.startDate, filters.endDate));
  const periodPurchaseOrderLines = purchaseOrderLines.filter((row) => inRange(row.orderDate, filters.startDate, filters.endDate));
  const periodVendorBills = vendorBills.filter((row) => inRange(row.invoiceDate, filters.startDate, filters.endDate));
  const periodVendorBillLines = vendorBillLines.filter((row) => inRange(row.invoiceDate, filters.startDate, filters.endDate));
  const includePurchases = requestedDomain === 'all' || requestedDomain === 'purchases';
  const salesRecords = includeSales ? [...periodOrders, ...periodInvoices] : [];
  const allCompanies = includeSales && includePurchases
    ? [...orders, ...invoices, ...purchaseOrders, ...vendorBills]
    : includeSales
      ? [...orders, ...invoices]
      : [...purchaseOrders, ...vendorBills];
  const scopedSellerOptions = ownOdooUsers.map((row) => ({
    sellerId: Number(row.id),
    sellerName:
      `${row.name ?? row.email ?? row.login ?? ''}`.trim() ||
      'Vendedor asociado',
  }));
  const sellerScope = scopedSellerOptions.length === 1
    ? { id: scopedSellerOptions[0].sellerId, label: scopedSellerOptions[0].sellerName }
    : null;
  const scopedCompanyOptions = ownOdooUsers
    .map((row) => {
      const companyId = many2oneId(row.company_id);
      const companyName = many2oneLabel(row.company_id);
      return companyId && companyName ? { companyId, companyName } : null;
    })
    .filter(Boolean);
  const companyScope = scopedCompanyOptions.length === 1
    ? { id: scopedCompanyOptions[0].companyId, label: scopedCompanyOptions[0].companyName }
    : null;

  return {
    database,
    fetchedAt: new Date().toISOString(),
    odooBaseUrl: odooUrl,
    scopeApplied: filters.visibilityScope,
    scopeIdentity: {
      odooUserIds: ownUserIds,
      odooPartnerIds: ownOdooUsers.map((row) => many2oneId(row.partner_id)).filter(Number.isFinite),
    },
    sellerScope,
    companyScope,
    warnings,
    dataQualityAlerts,
    configDefaults: defaultReportsConfig,
    availableFilters: {
      companies: buildOptions(allCompanies, 'companyId', 'companyName', scopedCompanyOptions),
      sellers: includePurchases
        ? buildOptions(salesRecords, 'sellerId', 'sellerName', [
            ...buildOptions([...periodPurchaseOrders, ...periodVendorBills], 'buyerId', 'buyerName'),
            ...scopedSellerOptions,
          ])
        : buildOptions(salesRecords, 'sellerId', 'sellerName', scopedSellerOptions),
      teams: buildOptions(salesRecords, 'teamId', 'teamName'),
      customers: buildOptions(salesRecords, 'customerId', 'customerName'),
      products: includePurchases
        ? buildOptions([...periodOrderLines, ...periodInvoiceLines, ...periodPurchaseOrderLines, ...periodVendorBillLines], 'productId', 'productName')
        : buildOptions([...periodOrderLines, ...periodInvoiceLines], 'productId', 'productName'),
      categories: includePurchases
        ? buildOptions([...periodOrderLines, ...periodInvoiceLines, ...periodPurchaseOrderLines, ...periodVendorBillLines], 'categoryId', 'categoryName')
        : buildOptions([...periodOrderLines, ...periodInvoiceLines], 'categoryId', 'categoryName'),
      currencies: includePurchases
        ? buildOptions([...periodOrders, ...periodInvoices, ...periodPurchaseOrders, ...periodVendorBills], 'currencyCode', 'currencyCode')
        : buildOptions([...periodOrders, ...periodInvoices], 'currencyCode', 'currencyCode'),
      channels: buildOptions(periodOrders, 'channel', 'channel'),
    },
    orders,
    orderLines,
    invoices,
    invoiceLines,
    customerFirstPurchases,
    customerContacts,
    crmLeads,
    purchaseOrders,
    purchaseOrderLines,
    vendorBills,
    vendorBillLines,
    drillLinks: {
      recent_confirmed_orders: orders
        .filter((row) => row.state === 'sale')
        .slice(0, 25)
        .map((row) => ({ model: 'sale.order', recordId: row.id, label: row.name, url: `${odooUrl}/web#id=${row.id}&model=sale.order&view_type=form` })),
      recent_invoices: invoices
        .slice(0, 25)
        .map((row) => ({ model: 'account.move', recordId: row.id, label: row.name, url: `${odooUrl}/web#id=${row.id}&model=account.move&view_type=form` })),
    },
  };
}

async function findCurrentOdooUsers({ apiKey, database, email, odooUrl, uid }) {
  const normalizedEmail = normalizeOdooEmail(email);
  if (!normalizedEmail) return [];
  const rows = await executeReadKw({
    apiKey,
    args: [[
      ['active', '=', true],
      '|',
      ['login', '=ilike', normalizedEmail],
      ['email', '=ilike', normalizedEmail],
    ]],
    database,
    kwargs: {
      fields: [
        'id',
        'name',
        'login',
        'email',
        'active',
        'partner_id',
        'company_id',
        'company_ids',
      ],
      limit: 50,
      order: 'id asc',
    },
    method: 'search_read',
    model: 'res.users',
    odooUrl,
    uid,
  });
  return selectExactActiveOdooUsers(rows, normalizedEmail);
}

function buildOrderDomain({ filters, ownUserIds, orderDateField, orderChannelField, startDate, endDate }) {
  const domain = [[orderDateField, '>=', `${startDate} 00:00:00`], [orderDateField, '<=', `${endDate} 23:59:59`]];
  if (filters.stateScope === 'confirmed') domain.push(['state', '=', 'sale']);
  if (filters.stateScope === 'quotation') domain.push(['state', '=', 'draft']);
  if (filters.stateScope === 'cancelled') domain.push(['state', '=', 'cancel']);
  addCommonSalesFilters({ domain, filters, ownUserIds, sellerField: 'user_id', teamField: 'team_id', customerField: 'partner_id' });
  if (filters.channel?.trim() && orderChannelField) domain.push([orderChannelField, 'ilike', filters.channel.trim()]);
  return domain;
}

function buildInvoiceDomain({ filters, ownUserIds, invoiceSellerField, invoiceTeamField, startDate, endDate }) {
  const domain = [['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted'], ['invoice_date', '>=', startDate], ['invoice_date', '<=', endDate]];
  addCommonSalesFilters({ domain, filters, ownUserIds, sellerField: invoiceSellerField, teamField: invoiceTeamField, customerField: 'partner_id' });
  return domain;
}

function buildCrmLeadDomain({
  filters,
  leadCompanyField,
  leadSellerField,
  leadTeamField,
  ownUserIds,
}) {
  const domain = [
    ['type', 'in', ['lead', 'opportunity']],
    '|',
    ['create_date', '>=', `${filters.startDate} 00:00:00`],
    ['write_date', '>=', `${filters.startDate} 00:00:00`],
    ['write_date', '<=', `${filters.endDate} 23:59:59`],
  ];

  if (leadCompanyField) addCompany(domain, filters);
  const sellerIds = leadSellerField ? activeSellerIds(filters, ownUserIds) : [];
  if (sellerIds.length) domain.push([leadSellerField, 'in', sellerIds]);
  if (filters.teamId && leadTeamField) domain.push([leadTeamField, '=', filters.teamId]);
  if (filters.customerId) domain.push(['partner_id', '=', filters.customerId]);

  return domain;
}

function buildPurchaseOrderDomain({ filters, ownUserIds, purchaseDateField }) {
  const domain = [[purchaseDateField, '>=', `${filters.startDate} 00:00:00`], [purchaseDateField, '<=', `${filters.endDate} 23:59:59`]];
  addCompany(domain, filters);
  const sellerIds = activeSellerIds(filters, ownUserIds);
  if (sellerIds.length) domain.push(['user_id', 'in', sellerIds]);
  return domain;
}

function buildVendorBillDomain({ filters, ownUserIds }) {
  const domain = [['move_type', 'in', ['in_invoice', 'in_refund']], ['state', '=', 'posted'], ['invoice_date', '>=', filters.startDate], ['invoice_date', '<=', filters.endDate]];
  addCompany(domain, filters);
  const sellerIds = activeSellerIds(filters, ownUserIds);
  if (sellerIds.length) domain.push(['invoice_user_id', 'in', sellerIds]);
  return domain;
}

async function fetchFirstPurchaseRows({
  apiKey,
  currentCustomerIds,
  database,
  endDate,
  invoiceSellerField,
  odooUrl,
  uid,
}) {
  const baseDomain = [
    // A credit note reverses a purchase; it must not create a new-customer record.
    ['move_type', '=', 'out_invoice'],
    ['state', '=', 'posted'],
    ['partner_id', 'in', currentCustomerIds],
    ['invoice_date', '<=', endDate],
  ];

  try {
    const groupedRows = await executeReadKw({
      apiKey,
      args: [
        baseDomain,
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
    const firstDateByCustomer = new Map();
    groupedRows.forEach((row) => {
      const customerId = many2oneId(row.partner_id);
      const firstDate = iso(row.first_invoice_date);
      if (customerId && firstDate) firstDateByCustomer.set(customerId, firstDate);
    });
    const firstDates = [...new Set([...firstDateByCustomer.values()])];
    if (!firstDates.length) return [];

    const candidates = await searchReadAll({
      apiKey,
      database,
      domain: [
        ...baseDomain,
        ['invoice_date', 'in', firstDates],
      ],
      fields: ['id', 'partner_id', invoiceSellerField, 'invoice_date'],
      model: 'account.move',
      odooUrl,
      order: 'invoice_date asc, id asc',
      uid,
    });

    const firstRowsByCustomer = new Map();
    candidates.forEach((row) => {
      const customerId = many2oneId(row.partner_id);
      if (!customerId || firstRowsByCustomer.has(customerId)) return;
      if (iso(row.invoice_date) !== firstDateByCustomer.get(customerId)) return;
      firstRowsByCustomer.set(customerId, row);
    });
    return [...firstRowsByCustomer.values()];
  } catch (error) {
    console.warn('[odoo-sales-report] read_group first purchase fallback', error);
    return searchReadAll({
      apiKey,
      database,
      domain: baseDomain,
      fields: ['id', 'partner_id', invoiceSellerField, 'invoice_date'],
      model: 'account.move',
      odooUrl,
      order: 'invoice_date asc, id asc',
      uid,
    });
  }
}

function calculateHistoryDays(filters) {
  const selectedRangeDays = daysBetween(filters.startDate, filters.endDate);
  const comparisonWindow = MIN_COMPARISON_LOOKBACK_DAYS + selectedRangeDays;
  const trendWindow = selectedRangeDays * 3;
  return Math.min(
    MAX_LOOKBACK_DAYS,
    Math.max(MIN_COMPARISON_LOOKBACK_DAYS, comparisonWindow, trendWindow),
  );
}

function calculateFastHistoryDays(filters) {
  return Math.min(45, Math.max(7, daysBetween(filters.startDate, filters.endDate)));
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const difference = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(difference) ? Math.max(1, difference + 1) : 1;
}

function addCommonSalesFilters({ domain, filters, ownUserIds, sellerField, teamField, customerField }) {
  addCompany(domain, filters);
  const sellerIds = activeSellerIds(filters, ownUserIds);
  if (sellerIds.length) domain.push([sellerField, 'in', sellerIds]);
  if (filters.teamId) domain.push([teamField, '=', filters.teamId]);
  if (filters.customerId) domain.push([customerField, '=', filters.customerId]);
}

function activeSellerIds(filters, ownUserIds) {
  if (filters.visibilityScope === 'own') return ownUserIds;
  if (Array.isArray(filters.sellerIds) && filters.sellerIds.length) return filters.sellerIds;
  if (filters.sellerId) return [filters.sellerId];
  return ownUserIds;
}

function addCompany(domain, filters) {
  if (Array.isArray(filters.companyIds) && filters.companyIds.length) domain.push(['company_id', 'in', filters.companyIds]);
  else if (filters.companyId) domain.push(['company_id', '=', filters.companyId]);
}

async function searchReadChunks({ apiKey, chunkIds, database, fields, idField, model, odooUrl, uid }) {
  const rows = [];
  for (const chunk of chunks(chunkIds, CHUNK_SIZE)) {
    let offset = 0;
    while (true) {
      const result = await executeReadKw({
        apiKey,
        args: [[[idField, 'in', chunk]]],
        database,
        kwargs: { fields, limit: PAGE_SIZE, offset },
        method: 'search_read',
        model,
        odooUrl,
        uid,
      });
      rows.push(...result);
      if (result.length < PAGE_SIZE) break;
      offset += result.length;
    }
  }
  return rows;
}

async function fetchCustomerContacts({ apiKey, customerIds, database, odooUrl, uid, warnings }) {
  if (!customerIds.length) return [];

  try {
    const directContacts = (await readPartnerContacts({
      apiKey,
      database,
      odooUrl,
      partnerIds: customerIds,
      uid,
    })).map(normalizePartnerContact);
    const parentIds = uniqueNumbers(
      directContacts
        .map((contact) => contact.commercialPartnerId)
        .filter((id) => id !== null && !customerIds.includes(id)),
    );
    const parentContacts = parentIds.length
      ? (await readPartnerContacts({
          apiKey,
          database,
          odooUrl,
          partnerIds: parentIds,
          uid,
        })).map(normalizePartnerContact)
      : [];
    const parentById = new Map(parentContacts.map((contact) => [contact.customerId, contact]));

    return directContacts.map((contact) => {
      const parent = contact.commercialPartnerId ? parentById.get(contact.commercialPartnerId) : null;
      if (!parent) return contact;
      return {
        ...contact,
        email: contact.email ?? parent.email,
        phone: contact.phone ?? parent.phone,
        mobile: contact.mobile ?? parent.mobile,
        street: contact.street ?? parent.street,
        street2: contact.street2 ?? parent.street2,
        city: contact.city ?? parent.city,
        stateName: contact.stateName ?? parent.stateName,
        zip: contact.zip ?? parent.zip,
        countryName: contact.countryName ?? parent.countryName,
        commercialPartnerName: contact.commercialPartnerName ?? parent.customerName,
      };
    });
  } catch (error) {
    warnings.push('No se pudieron leer datos de contacto de clientes desde res.partner para Marketing.');
    console.warn('[odoo-sales-report] res.partner contacts skipped', error);
    return [];
  }
}

function readPartnerContacts({ apiKey, database, odooUrl, partnerIds, uid }) {
  return searchReadChunks({
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

function normalizePartnerContact(row) {
  return {
    customerId: Number(row.id),
    customerName: readText(row.name) ?? `Cliente ${row.id}`,
    email: readText(row.email),
    phone: readText(row.phone),
    mobile: readText(row.mobile),
    street: readText(row.street),
    street2: readText(row.street2),
    city: readText(row.city),
    stateName: many2oneLabel(row.state_id),
    zip: readText(row.zip),
    countryName: many2oneLabel(row.country_id),
    commercialPartnerId: many2oneId(row.commercial_partner_id),
    commercialPartnerName: many2oneLabel(row.commercial_partner_id),
  };
}

function buildOptions(rows, idKey, labelKey, extra = []) {
  const map = new Map();
  [...rows, ...extra].forEach((row) => {
    const id = row?.[idKey];
    const label = `${row?.[labelKey] ?? ''}`.trim();
    if (id === null || id === undefined || id === '' || !label) return;
    if (!map.has(`${id}`)) map.set(`${id}`, { id, label });
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));
}

function pick(meta, names) {
  return names.find((name) => name && meta && name in meta) ?? null;
}

function idsOf(rows) {
  return rows.map((row) => Number(row.id)).filter(Number.isFinite);
}

function mergeById(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const id = Number(row?.id);
    if (Number.isFinite(id) && !map.has(id)) map.set(id, row);
  });
  return [...map.values()];
}

function many2oneIds(rows, key) {
  return rows.map((row) => many2oneId(row[key])).filter((value) => value !== null);
}

function many2oneId(value) {
  if (Array.isArray(value) && value.length) {
    const parsed = Number(value[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function many2oneLabel(value) {
  return Array.isArray(value) && value.length > 1 && typeof value[1] === 'string' && value[1].trim() ? value[1].trim() : null;
}

function relationIds(value) {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter(Number.isFinite);
  const id = many2oneId(value);
  return id === null ? [] : [id];
}

function readText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunks(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

function iso(value) {
  const raw = readText(value);
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const parsed = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function currencyLabel(value) {
  const label = many2oneLabel(value) ?? readText(value);
  if (!label) return null;
  const upper = label.toUpperCase();
  return upper.length <= 6 ? upper : label;
}

function channelValue(row) {
  return many2oneLabel(row.source_id) ?? many2oneLabel(row.medium_id) ?? many2oneLabel(row.campaign_id) ?? readText(row.origin);
}

function trimSlash(value) {
  const v = `${value ?? ''}`.trim();
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function minusDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function inRange(value, startDate, endDate) {
  const normalized = `${value ?? ''}`.slice(0, 10);
  return Boolean(normalized) && normalized >= startDate && normalized <= endDate;
}

function inRangeOdooSalesOrderDate(value, startDate, endDate) {
  const normalized = odooSalesOrderDateKey(value);
  return Boolean(normalized) && normalized >= startDate && normalized <= endDate;
}

function odooSalesOrderDateKey(value) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const parsed = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateKeyInTimeZone(parsed, 'America/Mexico_City');
}

function formatDateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function splitOrigin(value) {
  return `${value ?? ''}`.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
}

function resolveOrderFromInvoiceOrigin(invoiceOrigin, ordersBySourceName) {
  return splitOrigin(invoiceOrigin)
    .map((origin) => ordersBySourceName.get(normalizeSourceDocumentName(origin)) ?? null)
    .find(Boolean) ?? null;
}

function normalizeSourceDocumentName(value) {
  return `${value ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
