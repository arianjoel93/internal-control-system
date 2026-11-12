import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooCommercialDataset, ReportFilters } from '../../reports/odooSalesCore.ts';
import {
  buildMarketingLeadIntakeSeries,
  buildMarketingLeadSourceRows,
  buildMarketingInvoiceCustomerIndex,
  marketingAssignedLeadsForPeriod,
  marketingCrmDateKey,
  marketingLeadCustomerInvoiceRows,
  marketingLeadsForPeriod,
  marketingLostLeadsForPeriod,
  marketingNewLeadsForPeriod,
  marketingStaleLeadsAtPeriodStart,
  marketingWonLeadsForPeriod,
  matchMarketingLeadsToInvoices,
  sumMarketingLeadCustomerInvoices,
  sumMarketingInvoiceAmountsForCustomers,
} from '../marketingLeadData.ts';

const filters = {
  startDate: '2026-09-01',
  endDate: '2026-09-29',
} as ReportFilters;

test('leads del periodo excluye actividad fuera del rango aplicado', () => {
  const dataset = {
    crmLeads: [
      { id: 1, active: true, createDate: '2026-08-20', writeDate: '2026-09-10', closedDate: null },
      { id: 2, active: true, createDate: '2026-08-20', writeDate: '2026-08-30', closedDate: null },
      { id: 3, active: false, createDate: '2026-09-08', writeDate: '2026-09-08', closedDate: null },
    ],
  } as OdooCommercialDataset;
  assert.deepEqual(marketingLeadsForPeriod(dataset, filters).map((lead) => lead.id), [1]);
});

test('facturación usa fecha de factura, notas de crédito y vendedor correcto', () => {
  const dataset = {
    invoices: [
      { customerId: 10, sellerId: 5, invoiceDate: '2026-08-31', untaxedAmountSigned: 1000 },
      { customerId: 10, sellerId: 5, invoiceDate: '2026-09-12', untaxedAmountSigned: 500 },
      { customerId: 10, sellerId: 5, invoiceDate: '2026-09-18', untaxedAmountSigned: -50 },
      { customerId: 10, sellerId: 6, invoiceDate: '2026-09-20', untaxedAmountSigned: 200 },
      { customerId: 11, sellerId: 5, invoiceDate: '2026-09-20', untaxedAmountSigned: 300 },
      { customerId: 10, sellerId: 5, invoiceDate: '2026-10-01', untaxedAmountSigned: 900 },
    ],
  } as OdooCommercialDataset;
  const index = buildMarketingInvoiceCustomerIndex(dataset, filters);
  assert.equal(sumMarketingInvoiceAmountsForCustomers(index, new Set([10])), 650);
  assert.equal(sumMarketingInvoiceAmountsForCustomers(index, new Set([10]), 5), 450);
  assert.equal(sumMarketingInvoiceAmountsForCustomers(index, new Set([10]), 6), 200);
  assert.equal(sumMarketingInvoiceAmountsForCustomers(index, new Set([10]), 7), 0);
});

test('prospección cuenta creaciones del rango y agrupa fuentes sin duplicar mayúsculas', () => {
  const dataset = {
    crmLeads: [
      { id: 1, active: true, createDate: '2026-09-02', writeDate: '2026-09-10', sourceName: 'Facebook' },
      { id: 2, active: true, createDate: '2026-09-05', writeDate: '2026-09-05', sourceName: 'facebook' },
      { id: 3, active: true, createDate: '2026-08-20', writeDate: '2026-09-08', sourceName: 'Expo' },
      { id: 4, active: true, createDate: '2026-09-06', writeDate: '2026-09-06', sourceName: null, mediumName: 'Social' },
      { id: 5, active: true, createDate: '2026-09-07', writeDate: '2026-09-07', sourceName: null },
    ],
  } as OdooCommercialDataset;
  const created = marketingNewLeadsForPeriod(marketingLeadsForPeriod(dataset, filters), filters);
  assert.deepEqual(created.map((lead) => lead.id), [1, 2, 4, 5]);
  assert.deepEqual(buildMarketingLeadSourceRows(created, (lead) => lead.id === 2, new Set([2])), [
    { name: 'Facebook', count: 2, won: 1, invoiced: 1 },
    { name: 'Medio: Social', count: 1, won: 0, invoiced: 0 },
    { name: 'Sin origen registrado', count: 1, won: 0, invoiced: 0 },
  ]);
});

test('una factura publicada posterior al lead se asigna una sola vez al mismo cliente y vendedor', () => {
  const leads = [
    { id: 1, createDate: '2026-09-03', customerId: 10, sellerId: 5, companyId: 2 },
    { id: 2, createDate: '2026-09-05', customerId: 10, sellerId: 5, companyId: 2 },
    { id: 3, createDate: '2026-09-04', customerId: 11, sellerId: 5, companyId: 2 },
  ] as OdooCommercialDataset['crmLeads'];
  const dataset = { invoices: [
    { id: 1, invoiceDate: '2026-09-02', customerId: 10, sellerId: 5, companyId: 2, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 100 },
    { id: 2, invoiceDate: '2026-09-10', customerId: 10, sellerId: 5, companyId: 2, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 100 },
    { id: 3, invoiceDate: '2026-09-12', customerId: 11, sellerId: 6, companyId: 2, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 100 },
    { id: 4, invoiceDate: '2026-09-13', customerId: 11, sellerId: 5, companyId: 2, state: 'posted', moveType: 'out_refund', untaxedAmountSigned: -100 },
    { id: 5, invoiceDate: '2026-09-14', customerId: 10, sellerId: 5, companyId: 2, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 50 },
    { id: 6, invoiceDate: '2026-09-15', customerId: 11, sellerId: 5, companyId: 3, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 100 },
    { id: 7, invoiceDate: '2026-09-16', customerId: 11, sellerId: 5, companyId: 2, state: 'draft', moveType: 'out_invoice', untaxedAmountSigned: 100 },
  ] } as OdooCommercialDataset;
  assert.deepEqual([...matchMarketingLeadsToInvoices(leads, dataset, filters)].sort(), [1, 2]);
});

test('serie temporal alinea periodos distintos por avance relativo sin contar fuera del rango', () => {
  const currentFilters = { startDate: '2026-09-01', endDate: '2026-09-07' } as ReportFilters;
  const previousFilters = { startDate: '2026-08-25', endDate: '2026-08-31' } as ReportFilters;
  const current = [
    { createDate: '2026-09-01' },
    { createDate: '2026-09-07' },
    { createDate: '2026-08-31' },
  ] as OdooCommercialDataset['crmLeads'];
  const previous = [{ createDate: '2026-08-25' }, { createDate: '2026-08-31' }] as OdooCommercialDataset['crmLeads'];
  const series = buildMarketingLeadIntakeSeries(current, currentFilters, previous, previousFilters);
  assert.equal(series.length, 7);
  assert.equal(series[0].current, 1);
  assert.equal(series[0].previous, 1);
  assert.equal(series[6].current, 1);
  assert.equal(series[6].previous, 1);
  assert.equal(series.reduce((total, point) => total + point.current, 0), 2);
});

test('asignados usan fecha de asignación local, no creación ni última edición', () => {
  const leads = [
    { id: 1, active: true, sellerId: 5, assignmentDate: '2026-09-02T05:00:00.000Z', createDate: '2026-09-01', writeDate: '2026-09-03' },
    { id: 2, active: true, sellerId: 5, assignmentDate: '2026-09-02T07:00:00.000Z', createDate: '2026-08-10', writeDate: '2026-09-07' },
    { id: 3, active: true, sellerId: 5, assignmentDate: '2026-08-20', createDate: '2026-08-10', writeDate: '2026-09-05' },
    { id: 4, active: false, sellerId: 5, assignmentDate: '2026-09-04', createDate: '2026-09-04', writeDate: '2026-09-04' },
  ] as OdooCommercialDataset['crmLeads'];
  assert.equal(marketingCrmDateKey(leads[0].assignmentDate), '2026-09-01');
  assert.deepEqual(marketingAssignedLeadsForPeriod(leads, { startDate: '2026-09-02', endDate: '2026-09-07' } as ReportFilters).map((lead) => lead.id), [2, 4]);
});

test('ganados usan cierre del corte aunque el lead sea antiguo', () => {
  const leads = [
    { id: 1, probability: 100, stageName: 'Ganado', createDate: '2026-05-01', closedDate: '2026-09-12' },
    { id: 2, probability: 100, stageName: 'Ganado', createDate: '2026-09-02', closedDate: '2026-10-01' },
    { id: 3, probability: 20, stageName: 'Nuevo', createDate: '2026-09-02', closedDate: null },
  ] as OdooCommercialDataset['crmLeads'];
  assert.deepEqual(marketingWonLeadsForPeriod(leads, filters).map((lead) => lead.id), [1]);
});

test('ganados respetan la etapa is_won de Odoo y no solo el nombre o la probabilidad', () => {
  const leads = [
    { id: 1, active: true, stageIsWon: true, probability: 100, closedDate: '2026-09-12' },
    { id: 2, active: true, stageIsWon: false, probability: 100, closedDate: '2026-09-13' },
    { id: 3, active: false, stageIsWon: true, probability: 0, closedDate: '2026-09-14' },
  ] as OdooCommercialDataset['crmLeads'];
  assert.deepEqual(marketingWonLeadsForPeriod(leads, filters).map((lead) => lead.id), [1]);
});

test('perdidos usan el filtro Lost de Odoo y fecha de cierre, no inactividad', () => {
  const leads = [
    { id: 1, active: false, probability: 0, createDate: '2026-01-01', closedDate: '2026-09-15' },
    { id: 2, active: true, probability: 0, createDate: '2026-01-01', writeDate: '2026-01-02' },
    { id: 3, active: false, probability: 0, closedDate: '2026-08-31' },
    { id: 4, active: false, probability: 100, closedDate: '2026-09-16' },
  ] as OdooCommercialDataset['crmLeads'];
  assert.deepEqual(marketingLostLeadsForPeriod(leads, filters).map((lead) => lead.id), [1]);
});

test('rezagados se calculan al inicio del corte y no a su término', () => {
  const leads = [
    { id: 1, active: true, sellerId: 5, probability: 20, assignmentDate: '2026-06-01', writeDate: '2026-07-01' },
    { id: 2, active: true, sellerId: 5, probability: 20, assignmentDate: '2026-06-01', writeDate: '2026-08-01' },
    { id: 3, active: false, sellerId: 5, probability: 0, assignmentDate: '2026-06-01', writeDate: '2026-07-01' },
  ] as OdooCommercialDataset['crmLeads'];
  assert.deepEqual(marketingStaleLeadsAtPeriodStart(leads, filters).map((lead) => lead.id), [1]);
});

test('facturación del corte cuenta una sola vez facturas y notas de crédito de clientes con lead histórico', () => {
  const leads = [
    { id: 1, createDate: '2026-05-01', customerId: 10, sellerId: 5, companyId: 2 },
    { id: 2, createDate: '2026-06-01', customerId: 10, sellerId: 5, companyId: 2 },
  ] as OdooCommercialDataset['crmLeads'];
  const dataset = { invoices: [
    { id: 1, invoiceDate: '2026-09-10', customerId: 10, sellerId: 5, companyId: 2, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 100 },
    { id: 2, invoiceDate: '2026-09-12', customerId: 10, sellerId: 5, companyId: 2, state: 'posted', moveType: 'out_refund', untaxedAmountSigned: -20 },
    { id: 3, invoiceDate: '2026-08-31', customerId: 10, sellerId: 5, companyId: 2, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 50 },
    { id: 4, invoiceDate: '2026-09-14', customerId: 10, sellerId: 5, companyId: 2, state: 'draft', moveType: 'out_invoice', untaxedAmountSigned: 200 },
  ] } as OdooCommercialDataset;
  assert.deepEqual(sumMarketingLeadCustomerInvoices(leads, dataset, filters), { total: 80, bySeller: new Map([[5, 80]]) });
  assert.deepEqual(marketingLeadCustomerInvoiceRows(leads, dataset, filters).map((invoice) => invoice.id), [1, 2]);
});

test('el desglose por vendedor usa el vendedor de la factura, aunque sea distinto al del lead', () => {
  const leads = [{ id: 1, createDate: '2026-05-01', customerId: 10, sellerId: 5, companyId: 2 }] as OdooCommercialDataset['crmLeads'];
  const dataset = { invoices: [
    { id: 1, invoiceDate: '2026-09-10', customerId: 10, sellerId: 6, companyId: 2, state: 'posted', moveType: 'out_invoice', untaxedAmountSigned: 150 },
  ] } as OdooCommercialDataset;
  assert.deepEqual(sumMarketingLeadCustomerInvoices(leads, dataset, filters), { total: 150, bySeller: new Map([[6, 150]]) });
});
