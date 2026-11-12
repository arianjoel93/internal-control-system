import type {
  AgentYearMetric,
  AgentPerformanceProfile,
  CommercialDashboardSnapshot,
} from './reportsAnalytics';
import type {
  OdooCommercialDataset,
  OdooCrmLeadRecord,
  OdooInvoiceLineRecord,
  OdooInvoiceRecord,
  OdooOrderRecord,
} from './odooSalesCore';

export type AgentScoreDimension = {
  id: string;
  label: string;
  score: number;
  weight: number;
  evidence: string;
};

export type AgentPerformanceScore = {
  total: number;
  rating: string;
  summary: string;
  dimensions: AgentScoreDimension[];
  methodologyNote: string;
};

export type SalesNotificationSeverity = 'info' | 'opportunity' | 'warning' | 'critical';

export type SalesAgentNotificationDraft = {
  fingerprint: string;
  category:
    | 'inactive_client'
    | 'declining_client'
    | 'low_conversion'
    | 'new_customer_gap'
    | 'expired_quotes'
    | 'crm_lead'
    | 'cross_sell'
    | 'sales_decline'
    | 'portfolio_concentration';
  severity: SalesNotificationSeverity;
  title: string;
  message: string;
  recommendation: string;
  entityType: 'client' | 'crm_lead' | 'portfolio' | 'quotation';
  entityKey: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export const SALES_PERFORMANCE_BIBLIOGRAPHY = [
  {
    citation:
      'Verbeke, W., Dietz, B. y Verwaal, E. (2011). Drivers of sales performance: a contemporary meta-analysis. Journal of the Academy of Marketing Science, 39, 407-428.',
    url: 'https://doi.org/10.1007/s11747-010-0211-8',
  },
  {
    citation:
      'Salesforce. Sales Performance Dashboard: revenue, conversion, quota attainment, customer retention and neglected accounts.',
    url: 'https://www.salesforce.com/sales/analytics/sales-dashboard-examples/',
  },
  {
    citation:
      'Salesforce Help. Sales Analytics Executive Overview: comparación contra periodos equivalentes, win rate y ciclo de venta.',
    url: 'https://help.salesforce.com/s/articleView?id=sf.bi_app_sales_analytics_dashboard_exec_sales.htm&language=en_US&type=5',
  },
] as const;

export function buildAgentPerformanceScore(
  profile: AgentPerformanceProfile,
): AgentPerformanceScore {
  const revenue = findMetric(profile.summary, 'revenue');
  const conversion = findMetric(profile.conversion, 'conversion_rate');
  const quotes = findMetric(profile.conversion, 'quotes');
  const convertedQuotes = findMetric(profile.conversion, 'converted_quotes');
  const expiredQuotes = findMetric(profile.conversion, 'expired_quotes');
  const conversionDays = findMetric(profile.conversion, 'conversion_days');
  const newCustomers = findMetric(profile.clients, 'new_customers');
  const retention = findMetric(profile.clients, 'retention');
  const atRiskCustomers = findMetric(profile.clients, 'at_risk_customers');
  const activeCustomers = findMetric(profile.clients, 'active_customers');

  const revenueScore = scoreGrowth(revenue);
  const conversionLevel = conversion?.comparison.current ?? 0;
  const conversionTrend = scoreGrowth(conversion);
  const conversionScore = clamp((conversionLevel / 60) * 75 + conversionTrend * 0.25);
  const clientDevelopmentScore = scoreGrowth(newCustomers);
  const retentionLevel = retention?.comparison.current ?? 0;
  const riskRatio =
    (atRiskCustomers?.comparison.current ?? 0) /
    Math.max(
      1,
      (activeCustomers?.comparison.current ?? 0) +
        (atRiskCustomers?.comparison.current ?? 0),
    );
  const portfolioScore = clamp(retentionLevel * 0.75 + (1 - riskRatio) * 100 * 0.25);
  const quoteCount = quotes?.comparison.current ?? 0;
  const convertedCount = convertedQuotes?.comparison.current ?? 0;
  const expiredCount = expiredQuotes?.comparison.current ?? 0;
  const expiredRatio = expiredCount / Math.max(1, quoteCount);
  const cycleDays = conversionDays?.comparison.current ?? 0;
  const cycleScore = convertedCount === 0 && quoteCount > 0 ? 0 : clamp(100 - (cycleDays / 45) * 100);
  const disciplineScore = clamp((1 - expiredRatio) * 65 + cycleScore * 0.35);

  const dimensions: AgentScoreDimension[] = [
    {
      id: 'revenue',
      label: 'Trayectoria de facturación',
      score: revenueScore,
      weight: 25,
      evidence: describeComparison(revenue, 'facturación'),
    },
    {
      id: 'conversion',
      label: 'Efectividad de conversión',
      score: conversionScore,
      weight: 25,
      evidence: `${formatPercent(conversionLevel)} de conversión; ${describeComparison(conversion, 'conversión')}.`,
    },
    {
      id: 'customer-development',
      label: 'Desarrollo de clientes',
      score: clientDevelopmentScore,
      weight: 20,
      evidence: describeComparison(newCustomers, 'clientes nuevos'),
    },
    {
      id: 'portfolio-health',
      label: 'Salud de cartera',
      score: portfolioScore,
      weight: 20,
      evidence: `${formatPercent(retentionLevel)} de retención y ${formatPercent(riskRatio * 100)} de la cartera activa en riesgo.`,
    },
    {
      id: 'commercial-discipline',
      label: 'Disciplina de seguimiento',
      score: disciplineScore,
      weight: 10,
      evidence: `${formatNumber(expiredCount)} cotizaciones vencidas de ${formatNumber(quoteCount)}; ${cycleDays.toFixed(1)} días promedio para convertir.`,
    },
  ].map((dimension) => ({ ...dimension, score: Math.round(dimension.score) }));

  const total = Math.round(
    dimensions.reduce(
      (sum, dimension) => sum + dimension.score * (dimension.weight / 100),
      0,
    ),
  );
  const rating = scoreRating(total);

  return {
    total,
    rating,
    summary: `${rating}. La calificación resume resultados observables del periodo y su comparación anual equivalente.`,
    dimensions,
    methodologyNote:
      'Modelo interno de 100 puntos informado por investigación de desempeño comercial. No evalúa personalidad, aptitudes ni potencial individual; utiliza exclusivamente resultados cuantitativos disponibles en Odoo.',
  };
}

export function buildSalesAgentNotifications(
  source: CommercialDashboardSnapshot | OdooCommercialDataset,
): SalesAgentNotificationDraft[] {
  if (isOdooCommercialDataset(source)) {
    return buildOperationalSalesAgentNotifications(source);
  }

  const snapshot = source;
  const profile = snapshot.agentProfile;
  if (!profile) return [];

  const notifications: SalesAgentNotificationDraft[] = [];
  const atRiskClients = snapshot.clientLifecycle.rows
    .filter((row) => row.currentStatus === 'en_riesgo')
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 8);

  atRiskClients.forEach((client) => {
    const days = client.daysSinceLastPurchase ?? 0;
    notifications.push({
      fingerprint: `inactive-client:${client.customerId ?? normalizeKey(client.customerName)}`,
      category: 'inactive_client',
      severity:
        client.riskLevel === 'critico' || client.riskLevel === 'alto' ? 'critical' : 'warning',
      title: `Retomar contacto con ${client.customerName}`,
      message: `${days ? `${formatNumber(days)} días sin compra` : 'Sin compra reciente'} y ${formatCurrency(client.revenue)} facturados en el periodo analizado.`,
      recommendation:
        'Revisar sus últimas compras, preparar una propuesta relevante y registrar un seguimiento comercial esta semana.',
      entityType: 'client',
      entityKey: `${client.customerId ?? client.customerName}`,
      metadata: {
        customerId: client.customerId,
        customerName: client.customerName,
        daysSinceLastPurchase: client.daysSinceLastPurchase,
        revenue: client.revenue,
        riskLevel: client.riskLevel,
      },
    });
  });

  profile.clients.rows
    .filter(
      (row) =>
        row.previous > 0 &&
        row.current < row.previous * 0.75 &&
        !atRiskClients.some((client) => normalizeKey(client.customerName) === normalizeKey(row.label)),
    )
    .sort((left, right) => left.difference - right.difference)
    .slice(0, 6)
    .forEach((row) => {
      notifications.push({
        fingerprint: `declining-client:${row.key}`,
        category: 'declining_client',
        severity: row.current < row.previous * 0.5 ? 'critical' : 'warning',
        title: `${row.label} está comprando menos`,
        message: `La facturación cayó ${formatPercent(Math.abs(row.differencePct ?? 0))} frente al mismo periodo del año anterior.`,
        recommendation:
          'Validar cambios de necesidad, precio o competencia y proponer una recuperación basada en su historial de productos.',
        entityType: 'client',
        entityKey: row.key,
        metadata: {
          customerName: row.label,
          currentRevenue: row.current,
          previousRevenue: row.previous,
          differencePct: row.differencePct,
        },
      });
    });

  snapshot.conversion.byCustomer
    .filter((row) => row.quotes >= 3 && row.conversionPct < 50)
    .sort((left, right) => left.conversionPct - right.conversionPct || right.quotes - left.quotes)
    .slice(0, 6)
    .forEach((row) => {
      notifications.push({
        fingerprint: `low-conversion:${row.key}`,
        category: 'low_conversion',
        severity: row.conversionPct < 20 && row.quotes >= 5 ? 'critical' : 'opportunity',
        title: `Oportunidad de conversión con ${row.label}`,
        message: `${formatNumber(row.quotes)} cotizaciones y ${formatPercent(row.conversionPct)} de conversión en el periodo.`,
        recommendation:
          'Revisar las cotizaciones abiertas o perdidas, confirmar la causa y acordar el siguiente paso con el cliente.',
        entityType: 'client',
        entityKey: row.key,
        metadata: {
          customerName: row.label,
          quotes: row.quotes,
          converted: row.converted,
          conversionPct: row.conversionPct,
        },
      });
    });

  const rangeDays = inclusiveDays(snapshot.filters.startDate, snapshot.filters.endDate);
  const newCustomers = findMetric(profile.clients, 'new_customers');
  if (rangeDays >= 28 && (newCustomers?.comparison.current ?? 0) === 0) {
    notifications.push({
      fingerprint: 'new-customer-gap:portfolio',
      category: 'new_customer_gap',
      severity: 'warning',
      title: 'Periodo sin clientes nuevos',
      message: `No se detectaron clientes cuya primera compra histórica ocurriera en los ${formatNumber(rangeDays)} días analizados.`,
      recommendation:
        'Reservar tiempo semanal para prospección y revisar cotizaciones de prospectos que todavía no han realizado su primera compra.',
      entityType: 'portfolio',
      entityKey: null,
      metadata: { rangeDays, newCustomers: 0 },
    });
  }

  const expiredQuotes = findMetric(profile.conversion, 'expired_quotes');
  if ((expiredQuotes?.comparison.current ?? 0) > 0) {
    notifications.push({
      fingerprint: 'expired-quotes:portfolio',
      category: 'expired_quotes',
      severity: (expiredQuotes?.comparison.current ?? 0) >= 5 ? 'critical' : 'warning',
      title: 'Cotizaciones vencidas por recuperar',
      message: `${formatNumber(expiredQuotes?.comparison.current ?? 0)} cotizaciones vencidas requieren revisión.`,
      recommendation:
        'Priorizar las de mayor importe y contactar al cliente con una fecha concreta de seguimiento.',
      entityType: 'quotation',
      entityKey: null,
      metadata: { expiredQuotes: expiredQuotes?.comparison.current ?? 0 },
    });
  }

  const revenue = findMetric(profile.summary, 'revenue');
  if ((revenue?.comparison.differencePct ?? 0) <= -15) {
    notifications.push({
      fingerprint: 'sales-decline:portfolio',
      category: 'sales_decline',
      severity: (revenue?.comparison.differencePct ?? 0) <= -30 ? 'critical' : 'warning',
      title: 'Facturación por debajo del año anterior',
      message: `${formatPercent(Math.abs(revenue?.comparison.differencePct ?? 0))} menos que en el mismo periodo del año anterior.`,
      recommendation:
        'Concentrar el plan semanal en clientes con caída, cotizaciones abiertas y categorías que perdieron participación.',
      entityType: 'portfolio',
      entityKey: null,
      metadata: {
        currentRevenue: revenue?.comparison.current ?? 0,
        previousRevenue: revenue?.comparison.previous ?? 0,
        differencePct: revenue?.comparison.differencePct ?? null,
      },
    });
  }

  const customerConcentration = findMetric(profile.pareto, 'customer_concentration');
  if ((customerConcentration?.comparison.current ?? 0) >= 75) {
    notifications.push({
      fingerprint: 'portfolio-concentration:customers',
      category: 'portfolio_concentration',
      severity: 'opportunity',
      title: 'Alta dependencia de pocos clientes',
      message: `Los cinco principales clientes concentran ${formatPercent(customerConcentration?.comparison.current ?? 0)} de la facturación.`,
      recommendation:
        'Diversificar seguimiento y prospección para reducir el riesgo de depender de pocas cuentas.',
      entityType: 'portfolio',
      entityKey: null,
      metadata: { concentrationPct: customerConcentration?.comparison.current ?? 0 },
    });
  }

  return notifications
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
    .slice(0, 24);
}

function buildOperationalSalesAgentNotifications(
  dataset: OdooCommercialDataset,
): SalesAgentNotificationDraft[] {
  const asOfDate = resolveOperationalAsOfDate(dataset);
  const crossSellNotifications = buildCrossSellingNotifications(dataset, asOfDate);
  if (dataset.scopeApplied !== 'own' || dataset.viewerRole !== 'sales_agent') {
    return crossSellNotifications
      .sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
  }

  const positiveInvoices = dataset.invoices
    .filter((invoice) => isPostedCustomerInvoice(invoice))
    .map((invoice) => ({ invoice, date: parseDateOnly(invoice.invoiceDate) }))
    .filter((row): row is { invoice: OdooInvoiceRecord; date: Date } => {
      return row.date !== null && row.date <= asOfDate && invoiceAmount(row.invoice) > 0;
    });
  const invoices = dataset.invoices
    .filter((invoice) => isPostedCustomerMove(invoice))
    .map((invoice) => ({ invoice, date: parseDateOnly(invoice.invoiceDate) }))
    .filter((row): row is { invoice: OdooInvoiceRecord; date: Date } => {
      return row.date !== null && row.date <= asOfDate;
    });
  const commercialOrders = dataset.orders
    .map((order) => ({ order, date: parseDateOnly(order.quotationDate ?? order.createDate) }))
    .filter((row): row is { order: OdooOrderRecord; date: Date } => {
      return row.date !== null && row.date <= asOfDate && row.order.state !== 'cancel';
    });
  const convertedOrderKeys = buildConvertedOrderKeys(dataset);
  const customerHistories = buildCustomerHistories(positiveInvoices, invoices);
  const openQuotesByCustomer = new Map<string, Array<{ order: OdooOrderRecord; date: Date }>>();
  const notifications: SalesAgentNotificationDraft[] = [];
  const abandonedQuotes = commercialOrders.filter(
    (row) => isOpenQuotation(row.order) && !isOrderConverted(row.order, convertedOrderKeys),
  );

  abandonedQuotes.forEach((row) => {
    const key = customerKey(row.order.customerId, row.order.customerName);
    const bucket = openQuotesByCustomer.get(key) ?? [];
    bucket.push(row);
    openQuotesByCustomer.set(key, bucket);
  });

  abandonedQuotes
    .filter((row) => {
      const ageDays = diffDays(row.date, asOfDate);
      return ageDays >= 7;
    })
    .sort((left, right) => right.order.amountUntaxed - left.order.amountUntaxed)
    .slice(0, 8)
    .forEach(({ order, date }) => {
      const ageDays = diffDays(date, asOfDate);
      notifications.push({
        fingerprint: `abandoned-quotation:${order.id}`,
        category: 'expired_quotes',
        severity: ageDays >= 21 || order.amountUntaxed >= 100_000 ? 'critical' : 'warning',
        title: `Cotización abandonada: ${order.name}`,
        message: `${order.name} para ${order.customerName} lleva ${formatNumber(ageDays)} días sin confirmarse ni facturarse por ${formatCurrency(order.amountUntaxed)}.`,
        recommendation:
          'Contacta al cliente, confirma si falta autorización, precio, disponibilidad o tiempos de entrega y agenda el siguiente paso.',
        entityType: 'quotation',
        entityKey: `${order.id}`,
        metadata: {
          orderId: order.id,
          orderName: order.name,
          customerId: order.customerId,
          customerName: order.customerName,
          quotationDate: dateKey(date),
          amountUntaxed: order.amountUntaxed,
          ageDays,
          state: order.state,
        },
      });
    });

  customerHistories
    .filter((customer) => customer.purchaseDates.length >= 2)
    .map((customer) => {
      const averageGap = averageIntervals(customer.purchaseDates) ?? 60;
      const lastPurchase = maxDate(customer.purchaseDates);
      const daysSinceLastPurchase = lastPurchase ? diffDays(lastPurchase, asOfDate) : 0;
      const dueAfterDays = Math.max(30, Math.round(averageGap * 1.25));
      const openQuotes = openQuotesByCustomer.get(customer.key) ?? [];
      return { ...customer, averageGap, daysSinceLastPurchase, dueAfterDays, lastPurchase, openQuotes };
    })
    .filter((customer) => customer.lastPurchase && customer.daysSinceLastPurchase >= customer.dueAfterDays)
    .sort((left, right) => {
      const leftOverdue = left.daysSinceLastPurchase - left.dueAfterDays;
      const rightOverdue = right.daysSinceLastPurchase - right.dueAfterDays;
      return rightOverdue - leftOverdue || right.last365Revenue - left.last365Revenue;
    })
    .slice(0, 8)
    .forEach((customer) => {
      const lastPurchase = customer.lastPurchase as Date;
      const hasOpenQuote = customer.openQuotes.length > 0;
      notifications.push({
        fingerprint: `repurchase-due:${customer.key}:${dateKey(lastPurchase)}`,
        category: 'inactive_client',
        severity:
          customer.daysSinceLastPurchase >= customer.dueAfterDays * 1.75 || customer.last365Revenue >= 100_000
            ? 'critical'
            : 'warning',
        title: `${customer.name} está fuera de su ciclo de recompra`,
        message: `Última compra hace ${formatNumber(customer.daysSinceLastPurchase)} días; su promedio histórico de recompra es ${formatNumber(Math.round(customer.averageGap))} días.`,
        recommendation: hasOpenQuote
          ? 'Ya tiene cotización abierta: revisa estatus y pide una respuesta concreta al cliente.'
          : 'Prepara una propuesta basada en sus compras anteriores y dale seguimiento esta semana.',
        entityType: 'client',
        entityKey: customer.key,
        metadata: {
          customerId: customer.id,
          customerName: customer.name,
          lastPurchaseDate: dateKey(lastPurchase),
          averagePurchaseGapDays: Math.round(customer.averageGap),
          daysSinceLastPurchase: customer.daysSinceLastPurchase,
          dueAfterDays: customer.dueAfterDays,
          hasOpenQuote,
          last365Revenue: customer.last365Revenue,
        },
      });
    });

  buildLowConversionCustomers(commercialOrders, convertedOrderKeys, asOfDate)
    .slice(0, 6)
    .forEach((customer) => {
      notifications.push({
        fingerprint: `low-conversion:${customer.key}:${customer.latestQuoteDate}`,
        category: 'low_conversion',
        severity: customer.conversionPct < 20 && customer.quotes >= 5 ? 'critical' : 'opportunity',
        title: `Revisar conversión pendiente con ${customer.name}`,
        message: `${formatNumber(customer.quotes)} cotizaciones en los últimos 180 días y solo ${formatPercent(customer.conversionPct)} convertido a factura.`,
        recommendation:
          'Pregunta qué detuvo la decisión, valida si hay objeción de precio o tiempos y define la próxima acción comercial.',
        entityType: 'client',
        entityKey: customer.key,
        metadata: {
          customerName: customer.name,
          quotes: customer.quotes,
          converted: customer.converted,
          conversionPct: customer.conversionPct,
          latestQuoteDate: customer.latestQuoteDate,
        },
      });
    });

  buildDecliningCustomers(customerHistories, asOfDate)
    .slice(0, 6)
    .forEach((customer) => {
      notifications.push({
        fingerprint: `declining-client:${customer.key}:${currentMonthKey(asOfDate)}`,
        category: 'declining_client',
        severity: customer.dropPct >= 55 ? 'critical' : 'warning',
        title: `${customer.name} está comprando menos`,
        message: `Compró ${formatCurrency(customer.currentRevenue)} en los últimos 90 días contra ${formatCurrency(customer.previousRevenue)} en los 90 días previos.`,
        recommendation:
          'Revisa productos que dejó de comprar y propón reposición, alternativa o mejora de condiciones antes de que se enfríe la cuenta.',
        entityType: 'client',
        entityKey: customer.key,
        metadata: {
          customerName: customer.name,
          currentRevenue: customer.currentRevenue,
          previousRevenue: customer.previousRevenue,
          dropPct: customer.dropPct,
        },
      });
    });

  const newCustomersLast30 = countNewCustomers(positiveInvoices, asOfDate, 30);
  if (positiveInvoices.length > 0 && newCustomersLast30 === 0) {
    notifications.push({
      fingerprint: `new-customer-gap:${currentMonthKey(asOfDate)}`,
      category: 'new_customer_gap',
      severity: 'opportunity',
      title: 'No hay clientes nuevos en los últimos 30 días',
      message: 'No se detectó una primera compra histórica reciente en tu cartera.',
      recommendation:
        'Reserva espacios de prospección y revisa prospectos cotizados que todavía no han realizado su primera compra.',
      entityType: 'portfolio',
      entityKey: null,
      metadata: {
        asOfDate: dateKey(asOfDate),
        newCustomersLast30,
      },
    });
  }

  notifications.push(...buildCrmLeadNotifications(dataset.crmLeads ?? [], asOfDate));
  notifications.push(...crossSellNotifications);

  return notifications
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
    .slice(0, 32);
}

type OperationalInvoiceRow = {
  invoice: OdooInvoiceRecord;
  date: Date;
};

type CrossSellFamily = 'labels' | 'printers' | 'ribbons' | 'software_services';

type CrossSellCustomerBucket = {
  key: string;
  customerId: number | null;
  customerName: string;
  sellerId: number | null;
  sellerName: string;
  categoryNames: Set<string>;
  families: Set<CrossSellFamily>;
  firstDate: Date;
  latestDate: Date;
  latestProductName: string;
  latestCategoryName: string | null;
  latestFamily: CrossSellFamily | null;
  latestAmount: number;
  lineCount: number;
  revenue: number;
  recent90Revenue: number;
  labelRevenue: number;
  printerRevenue: number;
  ribbonRevenue: number;
};

type CustomerHistory = {
  key: string;
  id: number | null;
  name: string;
  purchaseDates: Date[];
  invoices: OperationalInvoiceRow[];
  last365Revenue: number;
};

function buildCrossSellingNotifications(
  dataset: OdooCommercialDataset,
  asOfDate: Date,
): SalesAgentNotificationDraft[] {
  const startDate = addDays(asOfDate, -365);
  const recentStartDate = addDays(asOfDate, -90);
  const currentWeekKey = salesWeekKey(asOfDate);
  const buckets = new Map<string, CrossSellCustomerBucket>();

  dataset.invoiceLines
    .map((line) => ({ line, date: parseDateOnly(line.invoiceDate) }))
    .filter((row): row is { line: OdooInvoiceLineRecord; date: Date } =>
      row.date !== null &&
      row.date >= startDate &&
      row.date <= asOfDate &&
      isPostedCustomerInvoiceLine(row.line) &&
      row.line.untaxedAmount > 0,
    )
    .forEach(({ line, date }) => {
      const customer = customerKey(line.customerId, line.customerName);
      const seller = sellerKey(line.sellerId, line.sellerName);
      const key = `${seller}|${customer}`;
      const bucket = buckets.get(key) ?? {
        key: customer,
        customerId: line.customerId,
        customerName: line.customerName || 'Cliente sin nombre',
        sellerId: line.sellerId,
        sellerName: line.sellerName || 'Sin vendedor',
        categoryNames: new Set<string>(),
        families: new Set<CrossSellFamily>(),
        firstDate: date,
        latestDate: date,
        latestProductName: line.productName,
        latestCategoryName: line.categoryName,
        latestFamily: null,
        latestAmount: line.untaxedAmount,
        lineCount: 0,
        revenue: 0,
        recent90Revenue: 0,
        labelRevenue: 0,
        printerRevenue: 0,
        ribbonRevenue: 0,
      };
      const family = classifyCrossSellFamily(line);
      bucket.lineCount += 1;
      bucket.revenue += line.untaxedAmount;
      if (date >= recentStartDate) bucket.recent90Revenue += line.untaxedAmount;
      if (line.categoryName) bucket.categoryNames.add(line.categoryName);
      if (family) {
        bucket.families.add(family);
        if (family === 'labels') bucket.labelRevenue += line.untaxedAmount;
        if (family === 'printers') bucket.printerRevenue += line.untaxedAmount;
        if (family === 'ribbons') bucket.ribbonRevenue += line.untaxedAmount;
      }
      if (date < bucket.firstDate) bucket.firstDate = date;
      if (date > bucket.latestDate) bucket.latestDate = date;
      if (date >= bucket.latestDate) {
        bucket.latestProductName = line.productName;
        bucket.latestCategoryName = line.categoryName;
        bucket.latestFamily = family;
        bucket.latestAmount = line.untaxedAmount;
      }
      buckets.set(key, bucket);
    });

  const opportunities = [...buckets.values()]
    .flatMap((bucket) => buildCrossSellOpportunitiesForCustomer(bucket, asOfDate, currentWeekKey))
    .sort((left, right) => Number(right.metadata.score ?? 0) - Number(left.metadata.score ?? 0));

  if (dataset.scopeApplied === 'own') {
    return opportunities.slice(0, 20);
  }

  const bySeller = new Map<string, SalesAgentNotificationDraft[]>();
  opportunities.forEach((opportunity) => {
    const key = String(opportunity.metadata.sellerId ?? opportunity.metadata.sellerName ?? 'sin-vendedor');
    const bucket = bySeller.get(key) ?? [];
    bucket.push(opportunity);
    bySeller.set(key, bucket);
  });

  return [...bySeller.values()]
    .flatMap((rows) => rows.slice(0, 20))
    .sort((left, right) => Number(right.metadata.score ?? 0) - Number(left.metadata.score ?? 0))
    .slice(0, 200);
}

function buildCrossSellOpportunitiesForCustomer(
  bucket: CrossSellCustomerBucket,
  asOfDate: Date,
  weekKey: string,
): SalesAgentNotificationDraft[] {
  const opportunities: Array<{
    target: string;
    title: string;
    message: string;
    recommendation: string;
    score: number;
    evidenceFamily: string;
    confidence: 'alta' | 'media';
  }> = [];
  const hasLabels = bucket.families.has('labels');
  const hasPrinters = bucket.families.has('printers');
  const hasRibbons = bucket.families.has('ribbons');
  const hasServices = bucket.families.has('software_services');
  const daysSinceLatest = diffDays(bucket.latestDate, asOfDate);
  const recencyBoost = Math.max(0, 120 - daysSinceLatest);
  const latestLabel = bucket.latestCategoryName
    ? `${bucket.latestProductName} (${bucket.latestCategoryName})`
    : bucket.latestProductName;
  const latestPurchaseEvidence = `Última compra: ${latestLabel} el ${dateKey(bucket.latestDate)} por ${formatCurrency(bucket.latestAmount)}.`;
  const hasRecentSignal = daysSinceLatest <= 120 && (bucket.recent90Revenue >= 5_000 || bucket.lineCount >= 2);

  if (!hasRecentSignal) return [];

  if (hasLabels && !hasPrinters && (bucket.latestFamily === 'labels' || bucket.labelRevenue >= 25_000)) {
    opportunities.push({
      target: 'impresora-termica',
      title: `Cross-selling: impresora térmica para ${bucket.customerName}`,
      message: `${latestPurchaseEvidence} Compra etiquetas, pero no registra compra de impresora térmica en el historial comercial disponible.`,
      recommendation:
        'Validar parque instalado, volumen mensual, ancho de impresión y modelo actual. Preparar propuesta de impresora térmica compatible con sus etiquetas más recientes.',
      score: bucket.labelRevenue + bucket.recent90Revenue * 0.6 + recencyBoost * 1_200,
      evidenceFamily: 'etiquetas',
      confidence: bucket.latestFamily === 'labels' && bucket.labelRevenue >= 10_000 ? 'alta' : 'media',
    });
  }

  if (hasPrinters && !hasLabels && !hasRibbons && (bucket.latestFamily === 'printers' || bucket.printerRevenue >= 10_000)) {
    opportunities.push({
      target: 'etiquetas-ribbon',
      title: `Cross-selling: etiquetas y ribbon para ${bucket.customerName}`,
      message: `${latestPurchaseEvidence} Tiene compra de impresora/equipo, pero no aparecen consumibles asociados en la facturación disponible.`,
      recommendation:
        'Contactar para conocer medidas, material, volumen y tipo de transferencia. Ofrecer etiquetas y ribbon como reposición recurrente para capturar consumo continuo.',
      score: bucket.printerRevenue + bucket.recent90Revenue * 0.7 + recencyBoost * 1_400,
      evidenceFamily: 'impresoras/equipo',
      confidence: bucket.latestFamily === 'printers' ? 'alta' : 'media',
    });
  }

  if (hasLabels && !hasRibbons && bucket.labelRevenue >= 10_000 && (bucket.latestFamily === 'labels' || bucket.recent90Revenue >= 15_000)) {
    opportunities.push({
      target: 'ribbon',
      title: `Cross-selling: ribbon para ${bucket.customerName}`,
      message: `${latestPurchaseEvidence} Factura ${formatCurrency(bucket.labelRevenue)} en etiquetas, pero no registra compra de ribbon contigo.`,
      recommendation:
        'Revisar si usa transferencia térmica. Si aplica, proponer ribbon compatible y calendarizar reposición junto con sus pedidos de etiqueta.',
      score: bucket.labelRevenue * 0.85 + bucket.recent90Revenue * 0.45 + recencyBoost * 900,
      evidenceFamily: 'etiquetas',
      confidence: bucket.latestFamily === 'labels' ? 'alta' : 'media',
    });
  }

  if ((hasPrinters || hasLabels) && !hasServices && bucket.revenue >= 50_000 && daysSinceLatest <= 90) {
    opportunities.push({
      target: 'servicio-software',
      title: `Cross-selling: servicio, póliza o software para ${bucket.customerName}`,
      message: `${latestPurchaseEvidence} Tiene consumo comercial relevante (${formatCurrency(bucket.revenue)}) sin señales de servicios o software.`,
      recommendation:
        'Explorar mantenimiento, instalación, integración, soporte o software relacionado con su operación de impresión/etiquetado.',
      score: bucket.revenue * 0.45 + bucket.recent90Revenue * 0.35 + recencyBoost * 700,
      evidenceFamily: hasPrinters ? 'impresoras/equipo' : 'etiquetas',
      confidence: bucket.recent90Revenue >= 25_000 ? 'alta' : 'media',
    });
  }

  return opportunities.map((opportunity) => ({
    fingerprint: `cross-sell:${weekKey}:${sellerKey(bucket.sellerId, bucket.sellerName)}:${bucket.key}:${opportunity.target}`,
    category: 'cross_sell',
    severity: opportunity.score >= 150_000 ? 'warning' : 'opportunity',
    title: opportunity.title,
    message: opportunity.message,
    recommendation: opportunity.recommendation,
    entityType: 'client',
    entityKey: bucket.key,
    metadata: {
      customerId: bucket.customerId,
      customerName: bucket.customerName,
      sellerId: bucket.sellerId,
      sellerName: bucket.sellerName,
      target: opportunity.target,
      evidenceFamily: opportunity.evidenceFamily,
      confidence: opportunity.confidence,
      lastPurchaseDate: dateKey(bucket.latestDate),
      daysSinceLatestPurchase: daysSinceLatest,
      latestProductName: bucket.latestProductName,
      latestCategoryName: bucket.latestCategoryName,
      latestPurchaseAmount: bucket.latestAmount,
      lineCount: bucket.lineCount,
      revenue: bucket.revenue,
      recent90Revenue: bucket.recent90Revenue,
      labelRevenue: bucket.labelRevenue,
      printerRevenue: bucket.printerRevenue,
      ribbonRevenue: bucket.ribbonRevenue,
      categories: [...bucket.categoryNames].slice(0, 8).join(', '),
      score: Math.round(opportunity.score),
      weekKey,
    },
  }));
}

function classifyCrossSellFamily(line: OdooInvoiceLineRecord): CrossSellFamily | null {
  const text = normalizeSearchText(`${line.categoryName ?? ''} ${line.productName}`);
  if (/\b(ribbon|cinta|resina|wax|cera|transferencia)\b/.test(text)) return 'ribbons';
  if (/\b(impresora|printer|tsc|zebra|equipo|cabezal|rebobinador|aplicador|scanner|escaner)\b/.test(text)) return 'printers';
  if (/\b(etiqueta|label|tag|adhesiv|cou.?che|bopp|termic|thermal|poliester|polipropileno)\b/.test(text)) return 'labels';
  if (/\b(servicio|software|soporte|instalacion|instalacion|mantenimiento|poliza|licencia|desarrollo)\b/.test(text)) return 'software_services';
  return null;
}

function isPostedCustomerInvoiceLine(line: OdooInvoiceLineRecord) {
  return line.invoiceDate !== null &&
    line.invoiceState !== 'draft' &&
    line.invoiceState !== 'cancel' &&
    line.moveType === 'out_invoice' &&
    !line.displayType;
}

function buildCrmLeadNotifications(
  crmLeads: OdooCrmLeadRecord[],
  asOfDate: Date,
): SalesAgentNotificationDraft[] {
  return crmLeads
    .map((lead) => {
      const createdAt = parseDateTime(lead.createDate);
      const updatedAt = parseDateTime(lead.writeDate) ?? createdAt;
      const deadline = parseDateOnly(lead.deadlineDate);
      const closedAt = parseDateTime(lead.closedDate);
      const daysSinceUpdate = updatedAt ? diffDays(updatedAt, asOfDate) : null;
      const daysToDeadline = deadline ? Math.ceil((deadline.getTime() - asOfDate.getTime()) / 86400000) : null;
      return { lead, createdAt, updatedAt, deadline, closedAt, daysSinceUpdate, daysToDeadline };
    })
    .filter((row) => row.lead.active && !row.closedAt && row.lead.probability < 100)
    .flatMap((row) => {
      const notifications: SalesAgentNotificationDraft[] = [];
      const leadType = row.lead.type === 'lead' ? 'lead' : 'oportunidad';
      const customerLabel = row.lead.customerName ? ` de ${row.lead.customerName}` : '';
      const valueLabel = row.lead.expectedRevenue > 0
        ? ` por ${formatCurrency(row.lead.expectedRevenue)}`
        : '';

      if (row.updatedAt && diffDays(row.updatedAt, asOfDate) <= 7) {
        notifications.push({
          fingerprint: `crm-lead-updated:${row.lead.id}:${dateKey(row.updatedAt)}`,
          category: 'crm_lead',
          severity: row.lead.expectedRevenue >= 100_000 ? 'warning' : 'opportunity',
          title: `Nueva actividad en ${leadType}${customerLabel}`,
          message: `${row.lead.name}${valueLabel} está asignada a tu CRM y tuvo cambios recientes en Odoo.`,
          recommendation:
            'Revisa la oportunidad, confirma el siguiente paso y agenda una actividad para no perder velocidad de respuesta.',
          entityType: 'crm_lead',
          entityKey: `${row.lead.id}`,
          metadata: leadMetadata(row.lead),
        });
      }

      if (row.daysSinceUpdate !== null && row.daysSinceUpdate >= 7) {
        notifications.push({
          fingerprint: `crm-lead-stale:${row.lead.id}:${dateKey(row.updatedAt ?? asOfDate)}`,
          category: 'crm_lead',
          severity: row.daysSinceUpdate >= 14 || row.lead.expectedRevenue >= 100_000 ? 'critical' : 'warning',
          title: `Oportunidad sin seguimiento: ${row.lead.name}`,
          message: `${formatNumber(row.daysSinceUpdate)} días sin cambios en CRM${valueLabel}. Etapa actual: ${row.lead.stageName ?? 'sin etapa'}.`,
          recommendation:
            'Actualiza la etapa, registra una llamada/correo o define si debe cerrarse, avanzar o reactivarse.',
          entityType: 'crm_lead',
          entityKey: `${row.lead.id}`,
          metadata: {
            ...leadMetadata(row.lead),
            daysSinceUpdate: row.daysSinceUpdate,
          },
        });
      }

      if (row.daysToDeadline !== null && row.daysToDeadline <= 7) {
        const overdue = row.daysToDeadline < 0;
        notifications.push({
          fingerprint: `crm-lead-deadline:${row.lead.id}:${dateKey(row.deadline as Date)}`,
          category: 'crm_lead',
          severity: overdue ? 'critical' : 'warning',
          title: overdue ? `Fecha límite vencida: ${row.lead.name}` : `Cierre próximo: ${row.lead.name}`,
          message: overdue
            ? `La fecha límite venció hace ${formatNumber(Math.abs(row.daysToDeadline))} días${valueLabel}.`
            : `Faltan ${formatNumber(row.daysToDeadline)} días para la fecha límite${valueLabel}.`,
          recommendation:
            'Prioriza esta oportunidad y registra una acción concreta con el cliente antes de que pierda temperatura comercial.',
          entityType: 'crm_lead',
          entityKey: `${row.lead.id}`,
          metadata: {
            ...leadMetadata(row.lead),
            daysToDeadline: row.daysToDeadline,
          },
        });
      }

      return notifications;
    })
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
    .slice(0, 10);
}

function leadMetadata(lead: OdooCrmLeadRecord) {
  return {
    leadId: lead.id,
    leadName: lead.name,
    leadType: lead.type,
    customerId: lead.customerId,
    customerName: lead.customerName,
    stageName: lead.stageName,
    expectedRevenue: lead.expectedRevenue,
    probability: lead.probability,
    deadlineDate: lead.deadlineDate,
    writeDate: lead.writeDate,
  };
}

function isOdooCommercialDataset(
  source: CommercialDashboardSnapshot | OdooCommercialDataset,
): source is OdooCommercialDataset {
  return Array.isArray((source as OdooCommercialDataset).invoices) &&
    Array.isArray((source as OdooCommercialDataset).orders);
}

function resolveOperationalAsOfDate(dataset: OdooCommercialDataset) {
  const fetchedAt = parseDateTime(dataset.fetchedAt);
  if (fetchedAt) return endOfDay(fetchedAt);

  const today = new Date();
  return new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
}

function isPostedCustomerMove(invoice: OdooInvoiceRecord) {
  return invoice.invoiceDate !== null &&
    invoice.state !== 'draft' &&
    invoice.state !== 'cancel' &&
    (invoice.moveType === 'out_invoice' || invoice.moveType === 'out_refund');
}

function isPostedCustomerInvoice(invoice: OdooInvoiceRecord) {
  return isPostedCustomerMove(invoice) && invoice.moveType === 'out_invoice';
}

function buildConvertedOrderKeys(dataset: OdooCommercialDataset) {
  const keys = new Set<string>();
  dataset.orders.forEach((order) => {
    if (order.invoiceStatus === 'invoiced') {
      keys.add(`id:${order.id}`);
      keys.add(`name:${normalizeKey(order.name)}`);
    }
  });
  dataset.invoices
    .filter(isPostedCustomerMove)
    .forEach((invoice) => {
      extractOrderNames(invoice.invoiceOrigin).forEach((name) => {
        keys.add(`name:${normalizeKey(name)}`);
      });
    });
  dataset.invoiceLines.forEach((line) => {
    line.sourceOrderIds.forEach((id) => keys.add(`id:${id}`));
    line.sourceOrderNames.forEach((name) => keys.add(`name:${normalizeKey(name)}`));
  });
  return keys;
}

function isOrderConverted(order: OdooOrderRecord, convertedOrderKeys: Set<string>) {
  return convertedOrderKeys.has(`id:${order.id}`) ||
    convertedOrderKeys.has(`name:${normalizeKey(order.name)}`);
}

function isOpenQuotation(order: OdooOrderRecord) {
  return order.state === 'draft' || order.state === 'sent';
}

function buildCustomerHistories(
  positiveInvoices: OperationalInvoiceRow[],
  allInvoices: OperationalInvoiceRow[],
) {
  const positiveByCustomer = new Map<string, OperationalInvoiceRow[]>();
  positiveInvoices.forEach((row) => {
    const key = customerKey(row.invoice.customerId, row.invoice.customerName);
    const bucket = positiveByCustomer.get(key) ?? [];
    bucket.push(row);
    positiveByCustomer.set(key, bucket);
  });

  return [...positiveByCustomer.entries()].map(([key, rows]) => {
    const orderedRows = [...rows].sort((left, right) => left.date.getTime() - right.date.getTime());
    const latest = orderedRows.at(-1)?.invoice;
    const lastDate = orderedRows.at(-1)?.date ?? new Date();
    const last365Start = addDays(lastDate, -365);
    const customerInvoices = allInvoices.filter((row) =>
      customerKey(row.invoice.customerId, row.invoice.customerName) === key,
    );
    return {
      key,
      id: latest?.customerId ?? null,
      name: latest?.customerName || 'Cliente sin nombre',
      purchaseDates: orderedRows.map((row) => row.date),
      invoices: customerInvoices,
      last365Revenue: customerInvoices
        .filter((row) => row.date >= last365Start)
        .reduce((total, row) => total + invoiceAmount(row.invoice), 0),
    } satisfies CustomerHistory;
  });
}

function buildLowConversionCustomers(
  orderRows: Array<{ order: OdooOrderRecord; date: Date }>,
  convertedOrderKeys: Set<string>,
  asOfDate: Date,
) {
  const startDate = addDays(asOfDate, -180);
  const buckets = new Map<string, {
    key: string;
    name: string;
    quotes: number;
    converted: number;
    latestQuoteDate: Date;
  }>();

  orderRows
    .filter((row) => row.date >= startDate)
    .forEach((row) => {
      const key = customerKey(row.order.customerId, row.order.customerName);
      const bucket = buckets.get(key) ?? {
        key,
        name: row.order.customerName || 'Cliente sin nombre',
        quotes: 0,
        converted: 0,
        latestQuoteDate: row.date,
      };
      bucket.quotes += 1;
      if (isOrderConverted(row.order, convertedOrderKeys)) bucket.converted += 1;
      if (row.date > bucket.latestQuoteDate) bucket.latestQuoteDate = row.date;
      buckets.set(key, bucket);
    });

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      latestQuoteDate: dateKey(bucket.latestQuoteDate),
      conversionPct: (bucket.converted / Math.max(1, bucket.quotes)) * 100,
    }))
    .filter((bucket) => bucket.quotes >= 3 && bucket.conversionPct < 50)
    .sort((left, right) => left.conversionPct - right.conversionPct || right.quotes - left.quotes);
}

function buildDecliningCustomers(customerHistories: CustomerHistory[], asOfDate: Date) {
  const currentStart = addDays(asOfDate, -90);
  const previousStart = addDays(asOfDate, -180);
  return customerHistories
    .map((customer) => {
      const currentRevenue = customer.invoices
        .filter((row) => row.date >= currentStart && row.date <= asOfDate)
        .reduce((total, row) => total + invoiceAmount(row.invoice), 0);
      const previousRevenue = customer.invoices
        .filter((row) => row.date >= previousStart && row.date < currentStart)
        .reduce((total, row) => total + invoiceAmount(row.invoice), 0);
      const dropPct = previousRevenue > 0
        ? ((previousRevenue - currentRevenue) / Math.abs(previousRevenue)) * 100
        : 0;
      return { ...customer, currentRevenue, previousRevenue, dropPct };
    })
    .filter((customer) => customer.previousRevenue >= 20_000 && customer.dropPct >= 35)
    .sort((left, right) => right.dropPct - left.dropPct || right.previousRevenue - left.previousRevenue);
}

function countNewCustomers(
  positiveInvoices: OperationalInvoiceRow[],
  asOfDate: Date,
  days: number,
) {
  const firstPurchaseByCustomer = new Map<string, Date>();
  positiveInvoices.forEach((row) => {
    const key = customerKey(row.invoice.customerId, row.invoice.customerName);
    const current = firstPurchaseByCustomer.get(key);
    if (!current || row.date < current) firstPurchaseByCustomer.set(key, row.date);
  });
  const startDate = addDays(asOfDate, -days);
  return [...firstPurchaseByCustomer.values()].filter((date) => date >= startDate && date <= asOfDate).length;
}

function extractOrderNames(value: string | null) {
  if (!value) return [];
  return value
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function parseDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(value: Date) {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function maxDate(values: Date[]) {
  if (!values.length) return null;
  return values.reduce((latest, value) => (value > latest ? value : latest), values[0]);
}

function averageIntervals(dates: Date[]) {
  if (dates.length < 2) return null;
  const orderedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  const gaps = orderedDates.slice(1).map((date, index) => diffDays(orderedDates[index], date));
  return gaps.reduce((total, value) => total + value, 0) / gaps.length;
}

function customerKey(customerId: number | null, customerName: string | null | undefined) {
  return customerId !== null && customerId !== undefined
    ? `id:${customerId}`
    : `txt:${normalizeKey(customerName ?? 'cliente-sin-nombre')}`;
}

function sellerKey(sellerId: number | null, sellerName: string | null | undefined) {
  return sellerId !== null && sellerId !== undefined
    ? `id:${sellerId}`
    : `txt:${normalizeKey(sellerName ?? 'sin-vendedor')}`;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function currentMonthKey(value: Date) {
  return value.toISOString().slice(0, 7);
}

function salesWeekKey(value: Date) {
  const start = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const dayNumber = Math.floor((value.getTime() - start.getTime()) / 86400000) + 1;
  const week = Math.ceil(dayNumber / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function invoiceAmount(invoice: OdooInvoiceRecord) {
  return invoice.untaxedAmountSigned;
}

function findMetric(
  section: AgentPerformanceProfile['summary'],
  id: string,
): AgentYearMetric | undefined {
  return section.metrics.find((metric) => metric.id === id);
}

function scoreGrowth(metric: AgentYearMetric | undefined) {
  if (!metric) return 50;
  if (metric.comparison.previous === 0) {
    return metric.comparison.current > 0 ? 70 : 35;
  }
  return clamp(50 + (metric.comparison.differencePct ?? 0) * 1.5);
}

function describeComparison(metric: AgentYearMetric | undefined, subject: string) {
  if (!metric) return `Sin datos suficientes de ${subject}.`;
  if (metric.comparison.differencePct === null) {
    return metric.comparison.current > 0
      ? `${subject} con resultado actual y sin base comparable.`
      : `Sin movimiento comparable en ${subject}.`;
  }
  const direction = metric.comparison.differencePct >= 0 ? 'por encima' : 'por debajo';
  return `${formatPercent(Math.abs(metric.comparison.differencePct))} ${direction} del mismo periodo del año anterior`;
}

function scoreRating(score: number) {
  if (score >= 90) return 'Desempeño sobresaliente';
  if (score >= 80) return 'Desempeño sólido';
  if (score >= 70) return 'Evolución favorable';
  if (score >= 60) return 'Atención prioritaria';
  return 'Recuperación comercial requerida';
}

function severityRank(severity: SalesNotificationSeverity) {
  if (severity === 'critical') return 4;
  if (severity === 'warning') return 3;
  if (severity === 'opportunity') return 2;
  return 1;
}

function inclusiveDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase('es-MX').replace(/\s+/g, '-');
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-MX');
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}
