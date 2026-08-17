import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AgentPerformanceProfile,
  AgentYearMetric,
  AgentYearSection,
  CommercialDashboardSnapshot,
} from '../reportsAnalytics.ts';
import type { OdooCommercialDataset } from '../odooSalesCore.ts';
import {
  buildAgentPerformanceScore,
  buildSalesAgentNotifications,
} from '../salesAgentIntelligence.ts';

function metric(
  id: string,
  current: number,
  previous: number,
  lowerIsBetter = false,
): AgentYearMetric {
  const difference = current - previous;
  return {
    id,
    label: id,
    format: 'number',
    lowerIsBetter,
    comparison: {
      current,
      previous,
      difference,
      differencePct: previous === 0 ? null : (difference / Math.abs(previous)) * 100,
      trend: difference > 0 ? 'up' : difference < 0 ? 'down' : 'stable',
    },
  };
}

function section(metrics: AgentYearMetric[] = []): AgentYearSection {
  return { metrics, rows: [], positives: [], attention: [] };
}

function buildProfile(): AgentPerformanceProfile {
  return {
    sellerName: 'Agente de prueba',
    companyName: 'Corporación Tectronic',
    currentPeriodLabel: '1 jul 2026 - 31 jul 2026',
    previousYearPeriodLabel: '1 jul 2025 - 31 jul 2025',
    comparisonContext: 'Mismo mes del año anterior',
    summary: section([metric('revenue', 800_000, 1_000_000)]),
    conversion: section([
      metric('quotes', 10, 10),
      metric('converted_quotes', 3, 5),
      metric('conversion_rate', 30, 50),
      metric('conversion_days', 20, 12, true),
      metric('expired_quotes', 4, 1, true),
    ]),
    clients: section([
      metric('new_customers', 0, 3),
      metric('retention', 75, 88),
      metric('at_risk_customers', 4, 2, true),
      metric('active_customers', 12, 14),
    ]),
    products: section(),
    sales: section(),
    pareto: section([metric('customer_concentration', 82, 70, true)]),
  };
}

test('calcula una calificación ponderada, limitada y explicable', () => {
  const score = buildAgentPerformanceScore(buildProfile());

  assert.equal(
    score.dimensions.reduce((total, dimension) => total + dimension.weight, 0),
    100,
  );
  assert.ok(score.total >= 0 && score.total <= 100);
  assert.equal(score.dimensions.length, 5);
  assert.ok(score.methodologyNote.includes('No evalúa personalidad'));
});

test('detecta prioridades comerciales sin escribir en Odoo', () => {
  const profile = buildProfile();
  profile.clients.rows = [
    {
      key: 'cliente-decreciente',
      label: 'Cliente decreciente',
      current: 20_000,
      previous: 100_000,
      difference: -80_000,
      differencePct: -80,
      currentSharePct: 20,
      previousSharePct: 60,
    },
  ];
  const snapshot = {
    agentProfile: profile,
    filters: { startDate: '2026-07-01', endDate: '2026-07-31' },
    clientLifecycle: {
      rows: [
        {
          customerId: 10,
          customerName: 'Cliente inactivo',
          currentStatus: 'en_riesgo',
          riskLevel: 'alto',
          daysSinceLastPurchase: 95,
          revenue: 120_000,
        },
      ],
    },
    conversion: {
      byCustomer: [
        {
          key: 'cliente-baja-conversion',
          label: 'Cliente con cotizaciones',
          quotes: 6,
          converted: 1,
          conversionPct: 16.7,
        },
      ],
    },
  } as unknown as CommercialDashboardSnapshot;

  const notifications = buildSalesAgentNotifications(snapshot);
  const categories = new Set(notifications.map((notification) => notification.category));

  assert.ok(categories.has('inactive_client'));
  assert.ok(categories.has('declining_client'));
  assert.ok(categories.has('low_conversion'));
  assert.ok(categories.has('new_customer_gap'));
  assert.ok(categories.has('sales_decline'));
  assert.ok(categories.has('portfolio_concentration'));
  assert.equal(new Set(notifications.map((notification) => notification.fingerprint)).size, notifications.length);
});

test('no crea alertas de vendedor cuando el reporte no tiene perfil personal', () => {
  const snapshot = { agentProfile: null } as unknown as CommercialDashboardSnapshot;
  assert.deepEqual(buildSalesAgentNotifications(snapshot), []);
});

test('genera alertas operativas actuales desde historial de Odoo sin usar filtros visibles', () => {
  const dataset = {
    scopeApplied: 'own',
    viewerRole: 'sales_agent',
    fetchedAt: '2026-07-27T15:00:00.000Z',
    sellerScope: { id: 7, label: 'Agente de prueba' },
    invoices: [
      invoice(1, 'Cliente recompra', '2026-01-01', 30_000),
      invoice(2, 'Cliente recompra', '2026-02-01', 30_000),
      invoice(3, 'Cliente recompra', '2026-03-01', 30_000),
      invoice(4, 'Cliente decreciente', '2026-04-10', 80_000),
      invoice(5, 'Cliente decreciente', '2026-07-01', 5_000),
      invoice(6, 'Cliente cotizado', '2026-06-15', 10_000),
    ],
    orders: [
      order(100, 'SO100', 'Cliente cotizado', '2026-07-01', 45_000, 'sent'),
      order(101, 'SO101', 'Cliente baja conversión', '2026-02-01', 20_000, 'sent'),
      order(102, 'SO102', 'Cliente baja conversión', '2026-03-01', 20_000, 'sent'),
      order(103, 'SO103', 'Cliente baja conversión', '2026-04-01', 20_000, 'sent'),
    ],
    invoiceLines: [],
  } as unknown as OdooCommercialDataset;

  const notifications = buildSalesAgentNotifications(dataset);
  const categories = new Set(notifications.map((notification) => notification.category));

  assert.ok(categories.has('inactive_client'));
  assert.ok(categories.has('expired_quotes'));
  assert.ok(categories.has('low_conversion'));
  assert.ok(categories.has('declining_client'));
  assert.ok(
    notifications.some((notification) =>
      notification.message.includes('promedio histórico de recompra'),
    ),
  );
});

function invoice(
  id: number,
  customerName: string,
  invoiceDate: string,
  amount: number,
) {
  return {
    id,
    name: `INV/${id}`,
    state: 'posted',
    moveType: 'out_invoice',
    invoiceDate,
    customerId: testCustomerId(customerName),
    customerName,
    sellerId: 7,
    sellerName: 'Agente de prueba',
    teamId: null,
    teamName: null,
    companyId: 1,
    companyName: 'Corporación Tectronic',
    currencyCode: 'MXN',
    untaxedAmountSigned: amount,
    totalAmountSigned: amount,
    invoiceOrigin: null,
    paymentState: 'not_paid',
  };
}

function order(
  id: number,
  name: string,
  customerName: string,
  quotationDate: string,
  amount: number,
  state: string,
) {
  return {
    id,
    name,
    state,
    createDate: quotationDate,
    quotationDate,
    confirmationDate: null,
    validityDate: null,
    customerId: testCustomerId(customerName),
    customerName,
    sellerId: 7,
    sellerName: 'Agente de prueba',
    teamId: null,
    teamName: null,
    companyId: 1,
    companyName: 'Corporación Tectronic',
    currencyCode: 'MXN',
    amountUntaxed: amount,
    amountTotal: amount,
    invoiceStatus: 'no',
    channel: null,
    origin: null,
  };
}

function testCustomerId(customerName: string) {
  const ids: Record<string, number> = {
    'Cliente recompra': 1001,
    'Cliente decreciente': 1002,
    'Cliente cotizado': 1003,
    'Cliente baja conversión': 1004,
  };
  return ids[customerName] ?? 9999;
}
