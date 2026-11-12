import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooCommercialDataset, ReportFilters } from '../../reports/odooSalesCore.ts';
import { buildPersonalMarketingPeriod } from '../marketingPersonalPerformance.ts';

const filters = { startDate: '2026-09-01', endDate: '2026-09-30' } as ReportFilters;

function dataset() {
  return {
    crmLeads: [
      { id: 1, creatorId: 10, customerId: 100, companyId: 2, sellerId: 9, createDate: '2026-08-15', closedDate: '2026-09-10', active: true, stageIsWon: true, probability: 100 },
      { id: 2, creatorId: 10, customerId: 200, companyId: 2, sellerId: 8, createDate: '2026-09-02', closedDate: '2026-09-20', active: false, stageIsWon: false, probability: 0 },
      { id: 3, creatorId: 20, customerId: 100, companyId: 2, sellerId: 9, createDate: '2026-09-18', active: true, probability: 0 },
      { id: 4, creatorId: 10, customerId: 300, companyId: 2, sellerId: 8, createDate: '2026-09-08', active: true, probability: 0 },
    ],
    orders: [
      { id: 11, name: 'S0011', state: 'sale', customerId: 100, companyId: 2, sellerId: 9, createDate: '2026-09-05', amountUntaxed: 100 },
      { id: 11, name: 'S0011', state: 'sale', customerId: 100, companyId: 2, sellerId: 9, createDate: '2026-09-05', amountUntaxed: 100 },
      { id: 12, name: 'S0012', state: 'draft', customerId: 200, companyId: 2, sellerId: 8, createDate: '2026-09-03', amountUntaxed: 200 },
      { id: 13, name: 'S0013', state: 'sent', customerId: 100, companyId: 2, sellerId: 9, createDate: '2026-09-25', amountUntaxed: 400 },
      { id: 14, name: 'S0014', state: 'cancel', customerId: 200, companyId: 2, sellerId: 8, createDate: '2026-09-04', amountUntaxed: 900 },
      { id: 15, name: 'S0015', state: 'draft', customerId: 300, companyId: 2, sellerId: 8, createDate: '2026-08-25', amountUntaxed: 800 },
    ],
    customerFirstPurchases: [
      { customerId: 100, invoiceDate: '2026-09-15', firstInvoiceId: 21 },
      { customerId: 200, invoiceDate: '2025-02-10', firstInvoiceId: 99 },
      { customerId: 300, invoiceDate: '2026-09-29', firstInvoiceId: 24 },
    ],
    invoices: [
      { id: 21, name: 'INV/21', state: 'posted', moveType: 'out_invoice', customerId: 100, companyId: 2, sellerId: 9, invoiceDate: '2026-09-15', untaxedAmountSigned: 500 },
      { id: 22, state: 'posted', moveType: 'out_refund', customerId: 100, companyId: 2, sellerId: 9, invoiceDate: '2026-09-16', invoiceOrigin: 'INV/21', untaxedAmountSigned: -50 },
      { id: 23, state: 'posted', moveType: 'out_invoice', customerId: 100, companyId: 2, sellerId: 9, invoiceDate: '2026-09-25', untaxedAmountSigned: 700 },
      { id: 24, state: 'posted', moveType: 'out_invoice', customerId: 300, companyId: 2, sellerId: 8, invoiceDate: '2026-09-29', untaxedAmountSigned: 300 },
      { id: 25, state: 'draft', moveType: 'out_invoice', customerId: 200, companyId: 2, sellerId: 8, invoiceDate: '2026-09-29', untaxedAmountSigned: 500 },
      { id: 26, state: 'posted', moveType: 'out_invoice', customerId: 200, companyId: 2, sellerId: 8, invoiceDate: '2026-09-29', untaxedAmountSigned: 900 },
    ],
  } as OdooCommercialDataset;
}

test('Mis Leads vincula cotizaciones y facturas sin duplicar ni atribuir documentos de otro creador', () => {
  const result = buildPersonalMarketingPeriod(dataset(), filters, 10);
  assert.deepEqual(result.createdLeads.map((lead) => lead.id), [2, 4]);
  assert.deepEqual(result.wonLeads.map((lead) => lead.id), [1, 4]);
  assert.deepEqual(result.firstSoldLeadIds, [1, 4]);
  assert.deepEqual(result.pendingCrmWins.map(({ lead }) => lead.id), [4]);
  assert.deepEqual(result.delayedCrmWins, []);
  assert.equal(result.medianDelayDays, null);
  assert.deepEqual(result.lostLeads.map((lead) => lead.id), [2]);
  assert.deepEqual(result.quotes.map(({ document }) => document.id), [11, 12]);
  assert.equal(result.quoteAmount, 300);
  assert.equal(result.openQuoteAmount, 200);
  assert.equal(result.createdWithQuote, 1);
  assert.deepEqual(result.invoices.map(({ document }) => document.id), [21, 22, 24]);
  assert.equal(result.billedAmount, 750);
  assert.equal(result.billedCustomers, 2);
  assert.equal(result.series.reduce((sum, point) => sum + point.quoted, 0), result.quoteAmount);
  assert.equal(result.series.reduce((sum, point) => sum + point.billed, 0), result.billedAmount);
});

test('Mis Leads cuenta solo la primera factura aun si hay otra del mismo cliente el mismo día', () => {
  const value = dataset();
  value.invoices.push({ id: 27, state: 'posted', moveType: 'out_invoice', customerId: 100, companyId: 2,
    sellerId: 9, invoiceDate: '2026-09-15', untaxedAmountSigned: 800 } as OdooCommercialDataset['invoices'][number]);
  const result = buildPersonalMarketingPeriod(value, filters, 10);
  assert.equal(result.billedAmount, 750);
  assert.deepEqual(result.invoices.map(({ document }) => document.id), [21, 22, 24]);
});

test('Mis Leads no atribuye documentos anteriores al lead ni clientes sin vínculo', () => {
  const value = dataset();
  value.orders = [
    { id: 31, state: 'draft', customerId: 200, companyId: 2, sellerId: 8, createDate: '2026-09-01', amountUntaxed: 100 },
    { id: 32, state: 'draft', customerId: 999, companyId: 2, sellerId: 8, createDate: '2026-09-12', amountUntaxed: 200 },
  ] as OdooCommercialDataset['orders'];
  value.invoices = [{ id: 41, state: 'posted', moveType: 'out_invoice', customerId: 200, companyId: 3, sellerId: 8, invoiceDate: '2026-09-10', untaxedAmountSigned: 300 }] as OdooCommercialDataset['invoices'];
  const result = buildPersonalMarketingPeriod(value, filters, 10);
  assert.equal(result.quoteAmount, 0);
  assert.equal(result.billedAmount, 0);
});

test('Mis Leads no atribuye documentos de otro vendedor del mismo cliente', () => {
  const value = dataset();
  value.orders = [{ id: 51, state: 'sent', customerId: 200, companyId: 2, sellerId: 99, createDate: '2026-09-10', amountUntaxed: 400 }] as OdooCommercialDataset['orders'];
  value.invoices = [{ id: 52, state: 'posted', moveType: 'out_invoice', customerId: 200, companyId: 2, sellerId: 99, invoiceDate: '2026-09-11', untaxedAmountSigned: 500 }] as OdooCommercialDataset['invoices'];
  const result = buildPersonalMarketingPeriod(value, filters, 10);
  assert.equal(result.quoteAmount, 0);
  assert.equal(result.billedAmount, 0);
});

test('la primera compra gana el lead una sola vez y revela el retraso posterior del CRM', () => {
  const value = dataset();
  value.crmLeads = [{ id: 60, creatorId: 10, customerId: 600, companyId: 2, sellerId: 9,
    createDate: '2026-07-01', closedDate: '2026-09-15', active: true, stageIsWon: true,
    probability: 100 }] as OdooCommercialDataset['crmLeads'];
  value.customerFirstPurchases = [{ customerId: 600, companyId: 2, sellerId: 9,
    invoiceDate: '2026-08-10', firstInvoiceId: 70 }] as OdooCommercialDataset['customerFirstPurchases'];
  value.invoices = [];
  value.orders = [];

  const august = buildPersonalMarketingPeriod(value, {
    ...filters, startDate: '2026-08-01', endDate: '2026-08-31',
  }, 10);
  const september = buildPersonalMarketingPeriod(value, filters, 10);

  assert.deepEqual(august.wonLeads.map((lead) => lead.id), [60]);
  assert.deepEqual(august.pendingCrmWins.map(({ lead }) => lead.id), [60]);
  assert.deepEqual(september.wonLeads, []);
  assert.deepEqual(september.delayedCrmWins.map(({ lead, delayDays }) => [lead.id, delayDays]), [[60, 36]]);
  assert.equal(september.medianDelayDays, 36);
});

test('un cierre CRM sin primera compra sigue contando como ganado en su periodo', () => {
  const value = dataset();
  value.crmLeads = [{ id: 61, creatorId: 10, customerId: 601, companyId: 2, sellerId: 9,
    createDate: '2026-08-01', closedDate: '2026-09-20', active: true, stageIsWon: true,
    probability: 100 }] as OdooCommercialDataset['crmLeads'];
  value.customerFirstPurchases = [];
  value.invoices = [];
  value.orders = [];

  const result = buildPersonalMarketingPeriod(value, filters, 10);
  assert.deepEqual(result.wonLeads.map((lead) => lead.id), [61]);
  assert.deepEqual(result.pendingCrmWins, []);
  assert.deepEqual(result.delayedCrmWins, []);
});

test('primera compra y cierre tardío en el mismo mes cuentan una vez y miden la demora', () => {
  const value = dataset();
  value.crmLeads = [{ id: 62, creatorId: 10, customerId: 602, companyId: 2, sellerId: 9,
    createDate: '2026-08-01', closedDate: '2026-09-14', active: true, stageIsWon: true,
    probability: 100 }] as OdooCommercialDataset['crmLeads'];
  value.customerFirstPurchases = [{ customerId: 602, companyId: 2, sellerId: 9,
    invoiceDate: '2026-09-10', firstInvoiceId: 72 }] as OdooCommercialDataset['customerFirstPurchases'];
  value.invoices = [];
  value.orders = [];

  const result = buildPersonalMarketingPeriod(value, filters, 10);
  assert.deepEqual(result.wonLeads.map((lead) => lead.id), [62]);
  assert.deepEqual(result.pendingCrmWins, []);
  assert.deepEqual(result.delayedCrmWins.map(({ delayDays }) => delayDays), [4]);
  assert.equal(result.medianDelayDays, 4);
});
