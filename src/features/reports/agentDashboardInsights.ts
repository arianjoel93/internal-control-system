import type { ClientLifecycleRow } from './reportsAnalytics';
import type { OdooCustomerContactRecord, OdooInvoiceLineRecord, ReportFilters } from './odooSalesCore';

export type LeadAgeBand = {
  id: 'excellent' | 'acceptable' | 'slow' | 'very-slow';
  label: string;
  rangeLabel: string;
  count: number;
  sharePct: number;
};

export type AgentCrossSellOpportunity = {
  customerId: number | null;
  customer: string;
  email: string | null;
  phone: string | null;
  purchased: string;
  recommendation: string;
  revenue: number;
  latestProduct: string;
  latestDate: string;
};

export type RepurchaseAttentionRow = {
  customer: string;
  email: string | null;
  phone: string | null;
  lastPurchaseDate: string;
  daysSincePurchase: number;
  averageRepurchaseDays: number;
  overdueDays: number;
  historyRecords: number;
  priority: 'Ciclo vencido' | 'Atención temprana' | 'A reactivar' | 'Perdido';
  historyConfidence: 'limitada' | 'suficiente';
};

type ProductFamily = 'labels' | 'equipment' | 'ribbons' | 'services';

export function buildLeadAgeBands(days: number[]): LeadAgeBand[] {
  const bands: Array<Omit<LeadAgeBand, 'count' | 'sharePct'> & { min: number; max: number }> = [
    { id: 'excellent', label: 'Excelente', rangeLabel: '0–2 días', min: 0, max: 2 },
    { id: 'acceptable', label: 'Aceptable', rangeLabel: '3–5 días', min: 3, max: 5 },
    { id: 'slow', label: 'Lento', rangeLabel: '6–10 días', min: 6, max: 10 },
    { id: 'very-slow', label: 'Muy lento', rangeLabel: '11+ días', min: 11, max: Number.POSITIVE_INFINITY },
  ];
  const validDays = days.filter((value) => Number.isFinite(value) && value >= 0);
  return bands.map(({ min, max, ...band }) => {
    const count = validDays.filter((value) => value >= min && value <= max).length;
    return { ...band, count, sharePct: validDays.length ? count / validDays.length * 100 : 0 };
  });
}

export function buildRepurchaseAttentionRows(
  lifecycleRows: ClientLifecycleRow[],
  filters: ReportFilters,
  contacts: OdooCustomerContactRecord[] = [],
): RepurchaseAttentionRow[] {
  const contactsById = new Map(contacts.map((contact) => [contact.customerId, contact]));
  const contactsByName = new Map(contacts.map((contact) => [normalizeCustomerName(contact.customerName), contact]));
  return lifecycleRows.flatMap((row) => {
    const purchaseDate = row.lastPurchaseDate?.slice(0, 10);
    const averageRepurchaseDays = Math.round(row.averagePurchaseGapDays ?? 0);
    if (!purchaseDate || purchaseDate > filters.endDate || averageRepurchaseDays <= 0) return [];
    const daysSincePurchase = differenceInDays(filters.endDate, purchaseDate);
    if (daysSincePurchase <= averageRepurchaseDays) return [];

    const minimumRiskWindow = Math.max(90, averageRepurchaseDays);
    const priority: RepurchaseAttentionRow['priority'] = daysSincePurchase >= 60 && daysSincePurchase <= 90
      ? 'Atención temprana'
      : daysSincePurchase < 60
        ? 'Ciclo vencido'
        : daysSincePurchase > minimumRiskWindow + 60
          ? 'Perdido'
          : 'A reactivar';
    const contact = (row.customerId ? contactsById.get(row.customerId) : null) ??
      contactsByName.get(normalizeCustomerName(row.customerName));
    return [{
      customer: normalizeCustomerName(row.customerName),
      email: contact?.email ?? null,
      phone: contact?.mobile ?? contact?.phone ?? null,
      lastPurchaseDate: purchaseDate,
      daysSincePurchase,
      averageRepurchaseDays,
      overdueDays: daysSincePurchase - averageRepurchaseDays,
      historyRecords: row.totalOrders,
      priority,
      historyConfidence: row.totalOrders >= 3 ? 'suficiente' as const : 'limitada' as const,
    }];
  }).sort((left, right) => priorityOrder(left.priority) - priorityOrder(right.priority) || right.overdueDays - left.overdueDays);
}

export function buildAgentCrossSellOpportunities(
  lines: OdooInvoiceLineRecord[],
  filters: ReportFilters,
  contacts: OdooCustomerContactRecord[] = [],
): AgentCrossSellOpportunity[] {
  const companyIds = filters.companyIds?.length ? filters.companyIds : filters.companyId ? [filters.companyId] : [];
  const sellerIds = filters.sellerIds?.length ? filters.sellerIds : filters.sellerId ? [filters.sellerId] : [];
  const customers = new Map<string, {
    id: number | null;
    name: string;
    families: Map<ProductFamily, { revenue: number; latestDate: string; latestProduct: string }>;
  }>();

  for (const line of lines) {
    if (line.invoiceState !== 'posted' || line.moveType !== 'out_invoice' ||
      (line.displayType && line.displayType !== 'product') || !line.invoiceDate ||
      line.invoiceDate < filters.startDate || line.invoiceDate > filters.endDate ||
      (companyIds.length && !companyIds.includes(line.companyId ?? -1)) ||
      (sellerIds.length && !sellerIds.includes(line.sellerId ?? -1)) ||
      (filters.teamId && line.teamId !== filters.teamId) ||
      (filters.customerId && line.customerId !== filters.customerId) ||
      (filters.productId && line.productId !== filters.productId) ||
      (filters.categoryId && line.categoryId !== filters.categoryId) ||
      (filters.currencyCode && line.currencyCode !== filters.currencyCode)) continue;

    const family = classifyProductFamily(`${line.categoryName ?? ''} ${line.productName}`);
    if (!family || !line.customerId || line.untaxedAmount <= 0) continue;
    const isDeliveryContact = isPublicGeneral(line.customerName) && Boolean(line.deliveryCustomerName);
    const resolvedName = isDeliveryContact
      ? line.deliveryCustomerName : line.customerName;
    const name = normalizeCustomerName(resolvedName || 'Cliente sin nombre');
    const customerKey = `${line.companyId ?? 0}:${line.sellerId ?? 0}:${name}`;
    const customerId = isDeliveryContact ? line.deliveryCustomerId ?? null : line.customerId;
    const customer = customers.get(customerKey) ?? { id: customerId, name, families: new Map() };
    const current = customer.families.get(family) ?? { revenue: 0, latestDate: '', latestProduct: '' };
    current.revenue += line.untaxedAmount;
    if (line.invoiceDate >= current.latestDate) {
      current.latestDate = line.invoiceDate;
      current.latestProduct = line.productName;
    }
    customer.families.set(family, current);
    customers.set(customerKey, customer);
  }

  const contactsById = new Map(contacts.map((contact) => [contact.customerId, contact]));
  const contactsByName = new Map(contacts.map((contact) => [normalizeCustomerName(contact.customerName), contact]));
  const opportunities: AgentCrossSellOpportunity[] = [];
  for (const customer of customers.values()) {
    const families = customer.families;
    const label = families.get('labels');
    const equipment = families.get('equipment');
    const ribbon = families.get('ribbons');
    const hasServices = families.has('services');
    let recommendation: string | null = null;
    let purchased: string | null = null;
    let evidence = label ?? equipment ?? ribbon;

    if (label && !equipment) {
      purchased = 'Etiquetas';
      recommendation = 'Validar el parque instalado y cotizar una impresora compatible.';
    } else if (equipment && !label && !ribbon) {
      purchased = 'Equipo de impresión';
      recommendation = 'Confirmar consumibles compatibles y proponer etiquetas o ribbon.';
      evidence = equipment;
    } else if (label && !ribbon) {
      purchased = 'Etiquetas';
      recommendation = 'Confirmar si el proceso requiere transferencia térmica y ofrecer ribbon compatible.';
      evidence = label;
    } else if ((label || equipment) && !hasServices) {
      purchased = label ? 'Etiquetas y equipo' : 'Equipo de impresión';
      recommendation = 'Explorar instalación, mantenimiento, soporte o software relacionado.';
      evidence = label ?? equipment;
    }
    if (!recommendation || !purchased || !evidence) continue;

    const contact = (customer.id ? contactsById.get(customer.id) : null) ?? contactsByName.get(customer.name);
    opportunities.push({
      customerId: customer.id,
      customer: customer.name,
      email: contact?.email ?? null,
      phone: contact?.mobile ?? contact?.phone ?? null,
      purchased,
      recommendation,
      revenue: evidence.revenue,
      latestProduct: evidence.latestProduct,
      latestDate: evidence.latestDate,
    });
  }

  return opportunities.sort((left, right) => right.revenue - left.revenue || left.customer.localeCompare(right.customer));
}

function classifyProductFamily(source: string): ProductFamily | null {
  const text = normalizeText(source);
  if (/\b(ribbon|cinta|resina|wax|cera|transferencia)\b/.test(text)) return 'ribbons';
  if (/\b(impresora|printer|tsc|zebra|equipo|cabezal|rebobinador|aplicador|scanner|escaner)\b/.test(text)) return 'equipment';
  if (/\b(etiqueta|label|tag|adhesiv|couche|bopp|termic|thermal|poliester|polipropileno)\b/.test(text)) return 'labels';
  if (/\b(servicio|software|soporte|instalacion|mantenimiento|poliza|licencia|desarrollo)\b/.test(text)) return 'services';
  return null;
}

function isPublicGeneral(name: string) {
  return normalizeText(name) === 'publico en general';
}

function normalizeCustomerName(name: string) {
  return name.split(',')[0]?.replace(/\s+/g, ' ').trim() || 'Cliente sin nombre';
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function differenceInDays(endDate: string, startDate: string) {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return Number.isFinite(end) && Number.isFinite(start) ? Math.max(0, Math.floor((end - start) / 86_400_000)) : 0;
}

function priorityOrder(priority: RepurchaseAttentionRow['priority']) {
  return priority === 'Atención temprana' ? 0 : priority === 'Ciclo vencido' ? 1 : priority === 'A reactivar' ? 2 : 3;
}
