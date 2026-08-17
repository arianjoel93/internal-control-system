import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCommercialDashboard } from '../reportsAnalytics.ts';
import {
  defaultReportsConfig,
  type OdooCommercialDataset,
  type OdooInvoiceRecord,
  type OdooInvoiceLineRecord,
  type OdooOrderLineRecord,
  type OdooOrderRecord,
  type ReportFilters,
} from '../odooSalesCore.ts';

function createOrder(
  partial: Partial<OdooOrderRecord> & Pick<OdooOrderRecord, 'id' | 'name' | 'state'>,
): OdooOrderRecord {
  return {
    createDate: null,
    quotationDate: null,
    confirmationDate: null,
    validityDate: null,
    customerId: null,
    customerName: 'Cliente',
    sellerId: null,
    sellerName: 'Sin vendedor',
    teamId: null,
    teamName: null,
    companyId: 1,
    companyName: 'Tectronic MX',
    currencyCode: 'MXN',
    amountUntaxed: 0,
    amountTotal: 0,
    invoiceStatus: null,
    channel: null,
    origin: null,
    ...partial,
  };
}

function createLine(
  partial: Partial<OdooOrderLineRecord> &
    Pick<OdooOrderLineRecord, 'id' | 'orderId' | 'orderName' | 'orderState' | 'productName'>,
): OdooOrderLineRecord {
  return {
    customerId: null,
    customerName: 'Cliente',
    sellerId: null,
    sellerName: 'Sin vendedor',
    teamId: null,
    teamName: null,
    companyId: 1,
    companyName: 'Tectronic MX',
    currencyCode: 'MXN',
    quotationDate: null,
    confirmationDate: null,
    productId: null,
    categoryId: null,
    categoryName: null,
    quantity: 0,
    untaxedAmount: 0,
    totalAmount: 0,
    unitCost: null,
    costAmount: null,
    marginAmount: null,
    lineMarginValue: null,
    linePurchaseUnitCost: null,
    standardUnitCost: null,
    discount: null,
    ...partial,
  };
}

function createInvoice(
  partial: Partial<OdooInvoiceRecord> &
    Pick<OdooInvoiceRecord, 'id' | 'name' | 'state' | 'moveType'>,
): OdooInvoiceRecord {
  return {
    invoiceDate: null,
    customerId: null,
    customerName: 'Cliente',
    sellerId: null,
    sellerName: 'Sin vendedor',
    teamId: null,
    teamName: null,
    companyId: 1,
    companyName: 'Tectronic MX',
    currencyCode: 'MXN',
    untaxedAmountSigned: 0,
    totalAmountSigned: 0,
    invoiceOrigin: null,
    paymentState: null,
    ...partial,
  };
}

function createInvoiceLine(
  partial: Partial<OdooInvoiceLineRecord> &
    Pick<OdooInvoiceLineRecord, 'id' | 'invoiceId' | 'invoiceName' | 'invoiceState' | 'moveType'>,
): OdooInvoiceLineRecord {
  return {
    invoiceDate: null,
    customerId: null,
    customerName: 'Cliente',
    sellerId: null,
    sellerName: 'Sin vendedor',
    teamId: null,
    teamName: null,
    companyId: 1,
    companyName: 'Tectronic MX',
    currencyCode: 'MXN',
    productId: null,
    productName: 'Concepto',
    categoryId: null,
    categoryName: null,
    quantity: 0,
    untaxedAmount: 0,
    totalAmount: 0,
    unitCost: null,
    costAmount: null,
    marginAmount: null,
    linePurchaseUnitCost: null,
    standardUnitCost: null,
    discount: null,
    displayType: 'product',
    sourceOrderIds: [],
    sourceOrderNames: [],
    sourceSaleLineIds: [],
    ...partial,
  };
}

function createFilters(overrides: Partial<ReportFilters> = {}): ReportFilters {
  return {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    companyId: 1,
    sellerId: null,
    teamId: null,
    customerId: null,
    productId: null,
    categoryId: null,
    currencyCode: 'MXN',
    channel: null,
    stateScope: 'all',
    grouping: 'day',
    visibilityScope: 'all',
    ...overrides,
  };
}

function createDataset(): OdooCommercialDataset {
  const orders: OdooOrderRecord[] = [
    createOrder({
      id: 1,
      name: 'Q-001',
      state: 'draft',
      createDate: '2026-06-05T09:00:00.000Z',
      quotationDate: '2026-06-05T09:00:00.000Z',
      validityDate: '2026-07-10T00:00:00.000Z',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 100,
      amountTotal: 116,
    }),
    createOrder({
      id: 2,
      name: 'Q-002',
      state: 'sent',
      createDate: '2026-06-06T09:00:00.000Z',
      quotationDate: '2026-06-06T09:00:00.000Z',
      validityDate: '2026-06-15T00:00:00.000Z',
      customerId: 102,
      customerName: 'Cliente B',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 200,
      amountTotal: 232,
    }),
    createOrder({
      id: 3,
      name: 'SO-003',
      state: 'sale',
      createDate: '2026-06-07T09:00:00.000Z',
      quotationDate: '2026-06-07T09:00:00.000Z',
      confirmationDate: '2026-06-10T11:00:00.000Z',
      validityDate: '2026-06-25T00:00:00.000Z',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 300,
      amountTotal: 348,
    }),
    createOrder({
      id: 4,
      name: 'Q-004',
      state: 'cancel',
      createDate: '2026-06-08T09:00:00.000Z',
      quotationDate: '2026-06-08T09:00:00.000Z',
      customerId: 103,
      customerName: 'Cliente C',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      amountUntaxed: 150,
      amountTotal: 174,
    }),
    createOrder({
      id: 5,
      name: 'SO-005',
      state: 'sale',
      createDate: '2026-05-28T10:00:00.000Z',
      quotationDate: '2026-05-28T10:00:00.000Z',
      confirmationDate: '2026-06-12T10:00:00.000Z',
      customerId: 104,
      customerName: 'Cliente D',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      amountUntaxed: 400,
      amountTotal: 464,
    }),
    createOrder({
      id: 6,
      name: 'SO-006',
      state: 'sale',
      createDate: '2026-05-12T10:00:00.000Z',
      quotationDate: '2026-05-12T10:00:00.000Z',
      confirmationDate: '2026-05-15T10:00:00.000Z',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 500,
      amountTotal: 580,
    }),
    createOrder({
      id: 7,
      name: 'Q-007',
      state: 'sent',
      createDate: '2026-05-20T09:00:00.000Z',
      quotationDate: '2026-05-20T09:00:00.000Z',
      validityDate: '2026-06-01T00:00:00.000Z',
      customerId: 105,
      customerName: 'Cliente E',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      amountUntaxed: 250,
      amountTotal: 290,
    }),
    createOrder({
      id: 8,
      name: 'SO-008',
      state: 'sale',
      createDate: '2026-05-18T10:00:00.000Z',
      quotationDate: '2026-05-18T10:00:00.000Z',
      confirmationDate: '2026-05-22T10:00:00.000Z',
      customerId: 105,
      customerName: 'Cliente E',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      amountUntaxed: 250,
      amountTotal: 290,
    }),
    createOrder({
      id: 9,
      name: 'SO-009',
      state: 'sale',
      createDate: '2026-01-10T10:00:00.000Z',
      quotationDate: '2026-01-10T10:00:00.000Z',
      confirmationDate: '2026-01-15T10:00:00.000Z',
      customerId: 106,
      customerName: 'Cliente F',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      amountUntaxed: 600,
      amountTotal: 696,
    }),
    createOrder({
      id: 10,
      name: 'SO-010',
      state: 'sale',
      createDate: '2026-03-15T10:00:00.000Z',
      quotationDate: '2026-03-15T10:00:00.000Z',
      confirmationDate: '2026-04-05T10:00:00.000Z',
      customerId: 107,
      customerName: 'Cliente G',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 700,
      amountTotal: 812,
    }),
    createOrder({
      id: 11,
      name: 'SO-011',
      state: 'sale',
      createDate: '2025-10-05T10:00:00.000Z',
      quotationDate: '2025-10-05T10:00:00.000Z',
      confirmationDate: '2025-10-10T10:00:00.000Z',
      customerId: 108,
      customerName: 'Cliente H',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 200,
      amountTotal: 232,
    }),
    createOrder({
      id: 12,
      name: 'SO-012',
      state: 'sale',
      createDate: '2026-05-25T10:00:00.000Z',
      quotationDate: '2026-05-25T10:00:00.000Z',
      confirmationDate: '2026-06-25T10:00:00.000Z',
      customerId: 108,
      customerName: 'Cliente H',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 220,
      amountTotal: 255.2,
    }),
    createOrder({
      id: 13,
      name: 'SO-013',
      state: 'sale',
      createDate: '2026-05-30T10:00:00.000Z',
      quotationDate: '2026-05-30T10:00:00.000Z',
      confirmationDate: '2026-06-18T10:00:00.000Z',
      customerId: 109,
      customerName: 'Cliente I',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      amountUntaxed: 50,
      amountTotal: 58,
    }),
    createOrder({
      id: 14,
      name: 'SO-014',
      state: 'sale',
      createDate: '2026-05-29T10:00:00.000Z',
      quotationDate: '2026-05-29T10:00:00.000Z',
      confirmationDate: '2026-06-14T10:00:00.000Z',
      customerId: 110,
      customerName: 'Cliente J',
      sellerId: 33,
      sellerName: 'Laura',
      teamId: 203,
      teamName: 'Exportacion',
      companyId: 2,
      companyName: 'Tectronic US',
      currencyCode: 'USD',
      amountUntaxed: 999,
      amountTotal: 1158.84,
    }),
  ];

  const lines: OdooOrderLineRecord[] = [
    createLine({
      id: 1003,
      orderId: 3,
      orderName: 'SO-003',
      orderState: 'sale',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1001,
      productName: 'Producto A',
      categoryId: 501,
      categoryName: 'Linea A',
      quantity: 3,
      untaxedAmount: 300,
      totalAmount: 348,
      marginAmount: 90,
      costAmount: 210,
      unitCost: 70,
      confirmationDate: '2026-06-10T11:00:00.000Z',
      quotationDate: '2026-06-07T09:00:00.000Z',
    }),
    createLine({
      id: 1005,
      orderId: 5,
      orderName: 'SO-005',
      orderState: 'sale',
      customerId: 104,
      customerName: 'Cliente D',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      productId: 1002,
      productName: 'Producto B',
      categoryId: 502,
      categoryName: 'Linea B',
      quantity: 2,
      untaxedAmount: 400,
      totalAmount: 464,
      marginAmount: 40,
      costAmount: 360,
      unitCost: 180,
      confirmationDate: '2026-06-12T10:00:00.000Z',
      quotationDate: '2026-05-28T10:00:00.000Z',
    }),
    createLine({
      id: 1006,
      orderId: 6,
      orderName: 'SO-006',
      orderState: 'sale',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1001,
      productName: 'Producto A',
      categoryId: 501,
      categoryName: 'Linea A',
      quantity: 5,
      untaxedAmount: 500,
      totalAmount: 580,
      marginAmount: 150,
      costAmount: 350,
      unitCost: 70,
      confirmationDate: '2026-05-15T10:00:00.000Z',
      quotationDate: '2026-05-12T10:00:00.000Z',
    }),
    createLine({
      id: 1008,
      orderId: 8,
      orderName: 'SO-008',
      orderState: 'sale',
      customerId: 105,
      customerName: 'Cliente E',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      productId: 1003,
      productName: 'Producto C',
      categoryId: 503,
      categoryName: 'Linea C',
      quantity: 1,
      untaxedAmount: 250,
      totalAmount: 290,
      marginAmount: 50,
      costAmount: 200,
      unitCost: 200,
      confirmationDate: '2026-05-22T10:00:00.000Z',
      quotationDate: '2026-05-18T10:00:00.000Z',
    }),
    createLine({
      id: 1009,
      orderId: 9,
      orderName: 'SO-009',
      orderState: 'sale',
      customerId: 106,
      customerName: 'Cliente F',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      productId: 1004,
      productName: 'Producto D',
      categoryId: 504,
      categoryName: 'Linea D',
      quantity: 4,
      untaxedAmount: 600,
      totalAmount: 696,
      marginAmount: 120,
      costAmount: 480,
      unitCost: 120,
      confirmationDate: '2026-01-15T10:00:00.000Z',
      quotationDate: '2026-01-10T10:00:00.000Z',
    }),
    createLine({
      id: 1010,
      orderId: 10,
      orderName: 'SO-010',
      orderState: 'sale',
      customerId: 107,
      customerName: 'Cliente G',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1001,
      productName: 'Producto A',
      categoryId: 501,
      categoryName: 'Linea A',
      quantity: 7,
      untaxedAmount: 700,
      totalAmount: 812,
      marginAmount: 210,
      costAmount: 490,
      unitCost: 70,
      confirmationDate: '2026-04-05T10:00:00.000Z',
      quotationDate: '2026-03-15T10:00:00.000Z',
    }),
    createLine({
      id: 1011,
      orderId: 11,
      orderName: 'SO-011',
      orderState: 'sale',
      customerId: 108,
      customerName: 'Cliente H',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1005,
      productName: 'Producto E',
      categoryId: 505,
      categoryName: 'Linea E',
      quantity: 2,
      untaxedAmount: 200,
      totalAmount: 232,
      marginAmount: 20,
      costAmount: 180,
      unitCost: 90,
      confirmationDate: '2025-10-10T10:00:00.000Z',
      quotationDate: '2025-10-05T10:00:00.000Z',
    }),
    createLine({
      id: 1012,
      orderId: 12,
      orderName: 'SO-012',
      orderState: 'sale',
      customerId: 108,
      customerName: 'Cliente H',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1005,
      productName: 'Producto E',
      categoryId: 505,
      categoryName: 'Linea E',
      quantity: 2,
      untaxedAmount: 220,
      totalAmount: 255.2,
      marginAmount: 30,
      costAmount: 190,
      unitCost: 95,
      confirmationDate: '2026-06-25T10:00:00.000Z',
      quotationDate: '2026-05-25T10:00:00.000Z',
    }),
    createLine({
      id: 1013,
      orderId: 13,
      orderName: 'SO-013',
      orderState: 'sale',
      customerId: 109,
      customerName: 'Cliente I',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      productId: 1006,
      productName: 'Producto F',
      categoryId: 506,
      categoryName: 'Linea F',
      quantity: 1,
      untaxedAmount: 50,
      totalAmount: 58,
      marginAmount: -5,
      costAmount: 55,
      unitCost: 55,
      confirmationDate: '2026-06-18T10:00:00.000Z',
      quotationDate: '2026-05-30T10:00:00.000Z',
    }),
    createLine({
      id: 1014,
      orderId: 14,
      orderName: 'SO-014',
      orderState: 'sale',
      customerId: 110,
      customerName: 'Cliente J',
      sellerId: 33,
      sellerName: 'Laura',
      teamId: 203,
      teamName: 'Exportacion',
      companyId: 2,
      companyName: 'Tectronic US',
      currencyCode: 'USD',
      productId: 1007,
      productName: 'Producto G',
      categoryId: 507,
      categoryName: 'Linea G',
      quantity: 3,
      untaxedAmount: 999,
      totalAmount: 1158.84,
      marginAmount: 200,
      costAmount: 799,
      unitCost: 266.33,
      confirmationDate: '2026-06-14T10:00:00.000Z',
      quotationDate: '2026-05-29T10:00:00.000Z',
    }),
  ];

  const invoices: OdooInvoiceRecord[] = [
    createInvoice({
      id: 2001,
      name: 'INV-001',
      state: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-11T00:00:00.000Z',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      untaxedAmountSigned: 300,
      totalAmountSigned: 348,
      invoiceOrigin: 'SO-003',
      paymentState: 'paid',
    }),
    createInvoice({
      id: 2002,
      name: 'INV-002',
      state: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-13T00:00:00.000Z',
      customerId: 104,
      customerName: 'Cliente D',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      untaxedAmountSigned: 400,
      totalAmountSigned: 464,
      invoiceOrigin: 'SO-005',
      paymentState: 'not_paid',
    }),
    createInvoice({
      id: 2003,
      name: 'NC-003',
      state: 'posted',
      moveType: 'out_refund',
      invoiceDate: '2026-06-20T00:00:00.000Z',
      customerId: 104,
      customerName: 'Cliente D',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      untaxedAmountSigned: -100,
      totalAmountSigned: -116,
      invoiceOrigin: 'SO-005',
      paymentState: 'paid',
    }),
    createInvoice({
      id: 2004,
      name: 'INV-004',
      state: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-05-16T00:00:00.000Z',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      untaxedAmountSigned: 500,
      totalAmountSigned: 580,
      invoiceOrigin: 'SO-006',
      paymentState: 'paid',
    }),
    createInvoice({
      id: 2005,
      name: 'INV-005',
      state: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-15T00:00:00.000Z',
      customerId: 110,
      customerName: 'Cliente J',
      sellerId: 33,
      sellerName: 'Laura',
      teamId: 203,
      teamName: 'Exportacion',
      companyId: 2,
      companyName: 'Tectronic US',
      currencyCode: 'USD',
      untaxedAmountSigned: 999,
      totalAmountSigned: 1158.84,
      invoiceOrigin: 'SO-014',
      paymentState: 'paid',
    }),
    createInvoice({
      id: 2006,
      name: 'INV-006',
      state: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-18T00:00:00.000Z',
      customerId: 109,
      customerName: 'Cliente I',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      untaxedAmountSigned: 50,
      totalAmountSigned: 58,
      invoiceOrigin: 'SO-013',
      paymentState: 'paid',
    }),
  ];

  const invoiceLines: OdooInvoiceLineRecord[] = [
    createInvoiceLine({
      id: 3001,
      invoiceId: 2001,
      invoiceName: 'INV-001',
      invoiceState: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-11T00:00:00.000Z',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1001,
      productName: 'Producto A',
      categoryId: 501,
      categoryName: 'Linea A',
      quantity: 3,
      untaxedAmount: 300,
      totalAmount: 348,
      unitCost: 70,
      costAmount: 210,
      marginAmount: 90,
      linePurchaseUnitCost: 70,
      standardUnitCost: 70,
      sourceOrderIds: [3],
      sourceOrderNames: ['SO-003'],
      sourceSaleLineIds: [1003],
    }),
    createInvoiceLine({
      id: 3002,
      invoiceId: 2002,
      invoiceName: 'INV-002',
      invoiceState: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-13T00:00:00.000Z',
      customerId: 104,
      customerName: 'Cliente D',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      productId: 1002,
      productName: 'Producto B',
      categoryId: 502,
      categoryName: 'Linea B',
      quantity: 2,
      untaxedAmount: 400,
      totalAmount: 464,
      unitCost: 180,
      costAmount: 360,
      marginAmount: 40,
      linePurchaseUnitCost: 180,
      standardUnitCost: 180,
      sourceOrderIds: [5],
      sourceOrderNames: ['SO-005'],
      sourceSaleLineIds: [1005],
    }),
    createInvoiceLine({
      id: 3003,
      invoiceId: 2003,
      invoiceName: 'NC-003',
      invoiceState: 'posted',
      moveType: 'out_refund',
      invoiceDate: '2026-06-20T00:00:00.000Z',
      customerId: 104,
      customerName: 'Cliente D',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      productId: 1002,
      productName: 'Producto B',
      categoryId: 502,
      categoryName: 'Linea B',
      quantity: -0.5,
      untaxedAmount: -100,
      totalAmount: -116,
      unitCost: 180,
      costAmount: -90,
      marginAmount: -10,
      linePurchaseUnitCost: 180,
      standardUnitCost: 180,
      sourceOrderIds: [5],
      sourceOrderNames: ['SO-005'],
      sourceSaleLineIds: [1005],
    }),
    createInvoiceLine({
      id: 3004,
      invoiceId: 2004,
      invoiceName: 'INV-004',
      invoiceState: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-05-16T00:00:00.000Z',
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1001,
      productName: 'Producto A',
      categoryId: 501,
      categoryName: 'Linea A',
      quantity: 5,
      untaxedAmount: 500,
      totalAmount: 580,
      unitCost: 70,
      costAmount: 350,
      marginAmount: 150,
      linePurchaseUnitCost: 70,
      standardUnitCost: 70,
      sourceOrderIds: [6],
      sourceOrderNames: ['SO-006'],
      sourceSaleLineIds: [1006],
    }),
    createInvoiceLine({
      id: 3005,
      invoiceId: 2005,
      invoiceName: 'INV-005',
      invoiceState: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-15T00:00:00.000Z',
      customerId: 110,
      customerName: 'Cliente J',
      sellerId: 33,
      sellerName: 'Laura',
      teamId: 203,
      teamName: 'Exportacion',
      companyId: 2,
      companyName: 'Tectronic US',
      currencyCode: 'USD',
      productId: 1007,
      productName: 'Producto G',
      categoryId: 507,
      categoryName: 'Linea G',
      quantity: 3,
      untaxedAmount: 999,
      totalAmount: 1158.84,
      unitCost: 266.33,
      costAmount: 799,
      marginAmount: 200,
      linePurchaseUnitCost: 266.33,
      standardUnitCost: 266.33,
      sourceOrderIds: [14],
      sourceOrderNames: ['SO-014'],
      sourceSaleLineIds: [1014],
    }),
    createInvoiceLine({
      id: 3006,
      invoiceId: 2006,
      invoiceName: 'INV-006',
      invoiceState: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-18T00:00:00.000Z',
      customerId: 109,
      customerName: 'Cliente I',
      sellerId: 22,
      sellerName: 'Diego',
      teamId: 202,
      teamName: 'Key Accounts',
      productId: 1006,
      productName: 'Producto F',
      categoryId: 506,
      categoryName: 'Linea F',
      quantity: 1,
      untaxedAmount: 50,
      totalAmount: 58,
      unitCost: 55,
      costAmount: 55,
      marginAmount: -5,
      linePurchaseUnitCost: 55,
      standardUnitCost: 55,
      sourceOrderIds: [13],
      sourceOrderNames: ['SO-013'],
      sourceSaleLineIds: [1013],
    }),
  ];
  const customerFirstPurchases = [
    {
      customerId: 101,
      customerName: 'Cliente A',
      sellerId: 11,
      sellerName: 'Carmen',
      invoiceDate: '2026-05-16T00:00:00.000Z',
    },
    {
      customerId: 104,
      customerName: 'Cliente D',
      sellerId: 22,
      sellerName: 'Diego',
      invoiceDate: '2026-06-13T00:00:00.000Z',
    },
    {
      customerId: 106,
      customerName: 'Cliente F',
      sellerId: 22,
      sellerName: 'Diego',
      invoiceDate: '2026-01-16T00:00:00.000Z',
    },
    {
      customerId: 108,
      customerName: 'Cliente H',
      sellerId: 11,
      sellerName: 'Carmen',
      invoiceDate: '2025-10-11T00:00:00.000Z',
    },
    {
      customerId: 109,
      customerName: 'Cliente I',
      sellerId: 22,
      sellerName: 'Diego',
      invoiceDate: '2026-06-18T00:00:00.000Z',
    },
    {
      customerId: 110,
      customerName: 'Cliente J',
      sellerId: 33,
      sellerName: 'Laura',
      invoiceDate: '2026-06-15T00:00:00.000Z',
    },
  ];

  return {
    database: 'test',
    fetchedAt: '2026-07-06T00:00:00.000Z',
    odooBaseUrl: 'https://odoo.test',
    scopeApplied: 'all',
    warnings: [],
    dataQualityAlerts: [],
    configDefaults: defaultReportsConfig,
    availableFilters: {
      companies: [],
      sellers: [],
      teams: [],
      customers: [],
      products: [],
      categories: [],
      currencies: [],
      channels: [],
    },
    orders,
    orderLines: lines,
    invoices,
    invoiceLines,
    customerFirstPurchases,
    drillLinks: {},
  };
}

function closeTo(actual: number, expected: number, epsilon = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test('separa cotizaciones, ventas confirmadas y conversion comercial', () => {
  const snapshot = buildCommercialDashboard(
    createDataset(),
    createFilters(),
    defaultReportsConfig,
  );

  assert.equal(snapshot.quoteSummary.totalQuotes.current, 1);
  assert.equal(snapshot.quoteSummary.pendingQuotes, 1);
  assert.equal(snapshot.quoteSummary.expiredQuotes, 0);
  assert.equal(snapshot.quoteSummary.cancelledQuotes, 1);
  assert.equal(snapshot.quoteSummary.convertedQuotes, 0);
  closeTo(snapshot.quoteSummary.averageConversionDays.current, 0);

  assert.equal(snapshot.sales.confirmedOrders.current, 4);
  assert.equal(snapshot.sales.soldAmount.current, 650);
  closeTo(snapshot.conversion.overall.current, 80);
  assert.equal(snapshot.conversion.bySeller.find((row) => row.label === 'Carmen')?.quotes, 1);
  assert.equal(snapshot.conversion.bySeller.find((row) => row.label === 'Carmen')?.converted, 2);
  assert.equal(snapshot.sellers.categoryBreakdown[0]?.categoryName, 'Linea A');
  assert.equal(snapshot.sellers.categoryBreakdown[0]?.sellerRows[0]?.sellerName, 'Carmen');
  closeTo(snapshot.sellers.categoryBreakdown[0]?.sharePct ?? 0, (300 / 650) * 100);
});

test('calcula facturacion, notas de credito, margen y comparacion contra periodo anterior', () => {
  const snapshot = buildCommercialDashboard(
    createDataset(),
    createFilters(),
    defaultReportsConfig,
  );

  assert.equal(snapshot.invoicing.invoicedAmount.current, 650);
  assert.equal(snapshot.invoicing.refundAmount.current, 100);
  assert.equal(snapshot.sales.soldAmount.previous, 500);
  assert.equal(snapshot.sales.soldAmount.difference, 150);
  assert.equal(snapshot.sales.marginAmount.current, 115);
  closeTo(snapshot.sales.marginPct.current, (115 / 650) * 100);
  assert.equal(snapshot.sales.soldAmount.trend, 'up');
});

test('clasifica clientes y genera rankings y hallazgos accionables', () => {
  const snapshot = buildCommercialDashboard(
    createDataset(),
    createFilters(),
    defaultReportsConfig,
  );

  const byCustomer = new Map(
    snapshot.clientLifecycle.rows.map((row) => [row.customerName, row]),
  );

  assert.equal(byCustomer.get('Cliente D')?.currentStatus, 'nuevo');
  assert.equal(byCustomer.get('Cliente I')?.currentStatus, 'nuevo');
  assert.equal(byCustomer.get('Cliente A')?.currentStatus, 'alto_valor');

  assert.equal(snapshot.sellers.rankingByRevenue[0]?.sellerName, 'Diego');
  assert.equal(snapshot.products.negativeMargin[0]?.productName, 'Producto F');
  assert.equal(snapshot.pareto.products.rows[0]?.label, 'Producto A');

  const hallazgoIds = new Set(snapshot.hallazgos.map((item) => item.id));
  assert.ok(hallazgoIds.has('productos_margen_negativo'));
});

test('respeta filtros de compania, moneda, producto y estado', () => {
  const baseDataset = createDataset();

  const companySnapshot = buildCommercialDashboard(
    baseDataset,
    createFilters({
      companyId: 2,
      currencyCode: 'USD',
    }),
    defaultReportsConfig,
  );
  assert.equal(companySnapshot.sales.confirmedOrders.current, 1);
  assert.equal(companySnapshot.sales.soldAmount.current, 999);
  assert.equal(companySnapshot.invoicing.invoicedAmount.current, 999);
  assert.equal(companySnapshot.annualGrowth.newCustomers.current, 1);

  const productSnapshot = buildCommercialDashboard(
    baseDataset,
    createFilters({
      productId: 1001,
    }),
    defaultReportsConfig,
  );
  assert.equal(productSnapshot.sales.soldAmount.current, 300);
  assert.equal(productSnapshot.products.topByRevenue[0]?.productName, 'Producto A');

  const quotationSnapshot = buildCommercialDashboard(
    baseDataset,
    createFilters({
      stateScope: 'quotation',
    }),
    defaultReportsConfig,
  );
  assert.equal(quotationSnapshot.quoteSummary.totalQuotes.current, 1);
  assert.equal(quotationSnapshot.sales.confirmedOrders.current, 0);
});

test('considera cliente nuevo solo si es su primera compra historica y respeta el filtro por canal', () => {
  const dataset = createDataset();
  dataset.orders = dataset.orders.map((order) => {
    if (order.id === 3) return { ...order, channel: 'Web' };
    if (order.id === 5) return { ...order, channel: 'Presencial' };
    if (order.id === 13) return { ...order, channel: 'Marketplace' };
    return order;
  });

  const channelSnapshot = buildCommercialDashboard(
    dataset,
    createFilters({
      companyId: null,
      currencyCode: null,
      channel: 'Web',
    }),
    defaultReportsConfig,
  );

  assert.equal(channelSnapshot.invoicing.invoicedAmount.current, 300);
  assert.equal(channelSnapshot.clientLifecycle.summary.newCustomers, 0);
  assert.equal(
    channelSnapshot.clientLifecycle.rows.find((row) => row.customerName === 'Cliente A')?.currentStatus,
    'alto_valor',
  );
});

test('agrupa clientes y vendedores repetidos en conversion y rankings', () => {
  const dataset = createDataset();
  dataset.orders.push(
    createOrder({
      id: 30,
      name: 'SO-030',
      state: 'sale',
      createDate: '2026-06-11T09:00:00.000Z',
      quotationDate: '2026-06-11T09:00:00.000Z',
      confirmationDate: '2026-06-14T09:00:00.000Z',
      customerId: 102,
      customerName: '  cliente b  ',
      sellerId: 11,
      sellerName: 'carmen',
      teamId: 201,
      teamName: 'Norte',
      amountUntaxed: 250,
      amountTotal: 290,
    }),
  );
  dataset.invoices.push(
    createInvoice({
      id: 2030,
      name: 'INV-030',
      state: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-16T00:00:00.000Z',
      customerId: 102,
      customerName: 'Cliente B',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      untaxedAmountSigned: 250,
      totalAmountSigned: 290,
      invoiceOrigin: 'SO-030',
      paymentState: 'paid',
    }),
  );
  dataset.invoiceLines.push(
    createInvoiceLine({
      id: 3030,
      invoiceId: 2030,
      invoiceName: 'INV-030',
      invoiceState: 'posted',
      moveType: 'out_invoice',
      invoiceDate: '2026-06-16T00:00:00.000Z',
      customerId: 102,
      customerName: 'Cliente B',
      sellerId: 11,
      sellerName: 'Carmen',
      teamId: 201,
      teamName: 'Norte',
      productId: 1008,
      productName: 'Producto H',
      categoryId: 508,
      categoryName: 'Linea H',
      quantity: 1,
      untaxedAmount: 250,
      totalAmount: 290,
      unitCost: 150,
      costAmount: 150,
      marginAmount: 100,
      linePurchaseUnitCost: 150,
      standardUnitCost: 150,
      sourceOrderIds: [30],
      sourceOrderNames: ['SO-030'],
      sourceSaleLineIds: [],
    }),
  );

  const snapshot = buildCommercialDashboard(dataset, createFilters(), defaultReportsConfig);
  const customerRow = snapshot.conversion.byCustomer.find((row) => row.key === 'id:102');
  const sellerRow = snapshot.conversion.bySeller.find((row) => row.key === 'id:11');
  const sellerRankRows = snapshot.sellers.rankingByRevenue.filter((row) => row.sellerId === 11);

  assert.equal(customerRow?.quotes, 0);
  assert.equal(customerRow?.converted, 1);
  assert.equal(sellerRow?.quotes, 1);
  assert.equal(sellerRow?.converted, 3);
  assert.equal(snapshot.conversion.bySeller[0]?.key, 'id:11');
  assert.equal(sellerRankRows.length, 1);
  assert.equal(sellerRankRows[0]?.soldAmount, 550);
});

test('compara un mes completo contra el mes calendario anterior', () => {
  const dataset: OdooCommercialDataset = {
    ...createDataset(),
    orders: [
      createOrder({
        id: 100,
        name: 'SO-100',
        state: 'sale',
        createDate: '2026-06-15T09:00:00.000Z',
        quotationDate: '2026-06-15T09:00:00.000Z',
        confirmationDate: '2026-06-18T09:00:00.000Z',
        customerId: 501,
        customerName: 'Cliente Junio',
        sellerId: 41,
        sellerName: 'Laura',
        amountUntaxed: 100,
        amountTotal: 116,
      }),
      createOrder({
        id: 101,
        name: 'SO-101',
        state: 'sale',
        createDate: '2026-05-01T09:00:00.000Z',
        quotationDate: '2026-05-01T09:00:00.000Z',
        confirmationDate: '2026-05-01T09:00:00.000Z',
        customerId: 502,
        customerName: 'Cliente Mayo 1',
        sellerId: 41,
        sellerName: 'Laura',
        amountUntaxed: 200,
        amountTotal: 232,
      }),
      createOrder({
        id: 102,
        name: 'SO-102',
        state: 'sale',
        createDate: '2026-05-31T09:00:00.000Z',
        quotationDate: '2026-05-31T09:00:00.000Z',
        confirmationDate: '2026-05-31T09:00:00.000Z',
        customerId: 503,
        customerName: 'Cliente Mayo 31',
        sellerId: 41,
        sellerName: 'Laura',
        amountUntaxed: 150,
        amountTotal: 174,
      }),
    ],
    orderLines: [],
    invoices: [],
    invoiceLines: [],
  };

  const snapshot = buildCommercialDashboard(dataset, createFilters(), defaultReportsConfig);

  assert.equal(snapshot.sales.soldAmount.current, 0);
  assert.equal(snapshot.sales.soldAmount.previous, 0);
});

test('filtra rankings de vendedores para mostrar solo volumen comercial significativo', () => {
  const orders: OdooOrderRecord[] = [];
  for (let index = 0; index < 10; index += 1) {
    orders.push(
      createOrder({
        id: 200 + index,
        name: `SO-A-${index}`,
        state: 'sale',
        createDate: '2026-06-01T09:00:00.000Z',
        quotationDate: '2026-06-01T09:00:00.000Z',
        confirmationDate: `2026-06-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
        customerId: 700 + index,
        customerName: `Cliente A ${index}`,
        sellerId: 88,
        sellerName: 'Vendedora A',
        amountUntaxed: 100,
        amountTotal: 116,
      }),
    );
  }

  orders.push(
    createOrder({
      id: 299,
      name: 'SO-B-1',
      state: 'sale',
      createDate: '2026-06-02T09:00:00.000Z',
      quotationDate: '2026-06-02T09:00:00.000Z',
      confirmationDate: '2026-06-02T09:00:00.000Z',
      customerId: 899,
      customerName: 'Cliente B',
      sellerId: 99,
      sellerName: 'Vendedor B',
      amountUntaxed: 500,
      amountTotal: 580,
    }),
  );

  const snapshot = buildCommercialDashboard(
    {
      ...createDataset(),
      orders,
      orderLines: [],
      invoices: [],
      invoiceLines: [],
    },
    createFilters(),
    defaultReportsConfig,
  );

  assert.equal(snapshot.sellers.minOrderThreshold, 1);
  assert.equal(snapshot.sellers.rankingByRevenue.length, 2);
  assert.equal(snapshot.sellers.rankingByRevenue[0]?.sellerName, 'Vendedora A');
});

test('una selección explícita vacía no muestra datos comerciales', () => {
  const snapshot = buildCommercialDashboard(
    createDataset(),
    createFilters({
      companyId: null,
      companyIds: [-1],
      sellerId: null,
      sellerIds: [-1],
    }),
    defaultReportsConfig,
  );

  assert.equal(snapshot.sales.confirmedOrders.current, 0);
  assert.equal(snapshot.invoicing.invoicedAmount.current, 0);
  assert.equal(snapshot.quoteSummary.totalQuotes.current, 0);
  assert.equal(snapshot.sellers.rankingByRevenue.length, 0);
});

test('crea el perfil anual equivalente solo para agentes de ventas con alcance propio', () => {
  const baseDataset = createDataset();
  const dataset: OdooCommercialDataset = {
    ...baseDataset,
    scopeApplied: 'own',
    viewerRole: 'sales_agent',
    sellerScope: { id: 11, label: 'Carmen' },
    companyScope: { id: 1, label: 'Tectronic MX' },
    orders: [
      ...baseDataset.orders,
      createOrder({
        id: 990,
        name: 'SO-ANUAL-ANTERIOR',
        state: 'sale',
        createDate: '2025-06-08T09:00:00.000Z',
        quotationDate: '2025-06-08T09:00:00.000Z',
        confirmationDate: '2025-06-10T09:00:00.000Z',
        customerId: 101,
        customerName: 'Cliente A',
        sellerId: 11,
        sellerName: 'Carmen',
        amountUntaxed: 250,
        amountTotal: 290,
      }),
    ],
    invoices: [
      ...baseDataset.invoices,
      createInvoice({
        id: 990,
        name: 'INV-ANUAL-ANTERIOR',
        state: 'posted',
        moveType: 'out_invoice',
        invoiceDate: '2025-06-12T00:00:00.000Z',
        customerId: 101,
        customerName: 'Cliente A',
        sellerId: 11,
        sellerName: 'Carmen',
        untaxedAmountSigned: 250,
        totalAmountSigned: 290,
        invoiceOrigin: 'SO-ANUAL-ANTERIOR',
      }),
    ],
    invoiceLines: [
      ...baseDataset.invoiceLines,
      createInvoiceLine({
        id: 990,
        invoiceId: 990,
        invoiceName: 'INV-ANUAL-ANTERIOR',
        invoiceState: 'posted',
        moveType: 'out_invoice',
        invoiceDate: '2025-06-12T00:00:00.000Z',
        customerId: 101,
        customerName: 'Cliente A',
        sellerId: 11,
        sellerName: 'Carmen',
        productId: 501,
        productName: 'Producto anual',
        categoryId: 601,
        categoryName: 'Equipo',
        quantity: 1,
        untaxedAmount: 250,
        totalAmount: 290,
        sourceOrderIds: [990],
        sourceOrderNames: ['SO-ANUAL-ANTERIOR'],
      }),
    ],
  };
  const snapshot = buildCommercialDashboard(
    dataset,
    createFilters({
      visibilityScope: 'own',
      sellerId: 11,
      sellerIds: [11],
      companyIds: [1],
    }),
    defaultReportsConfig,
  );
  const revenueMetric = snapshot.agentProfile?.summary.metrics.find(
    (metric) => metric.id === 'revenue',
  );

  assert.equal(snapshot.agentProfile?.sellerName, 'Carmen');
  assert.equal(snapshot.agentProfile?.companyName, 'Tectronic MX');
  assert.equal(snapshot.agentProfile?.comparisonContext, 'Mismo mes del año anterior');
  assert.equal(revenueMetric?.comparison.previous, 250);
  assert.match(snapshot.agentProfile?.previousYearPeriodLabel ?? '', /2025/);

  const globalSnapshot = buildCommercialDashboard(
    { ...dataset, scopeApplied: 'all' },
    createFilters(),
    defaultReportsConfig,
  );
  assert.equal(globalSnapshot.agentProfile, null);
});
