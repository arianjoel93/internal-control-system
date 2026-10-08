export type InvoiceComparisonPoint = {
  bucketKey: string;
  label: string;
  invoicedAmount: number;
  previousInvoicedAmount: number;
  previousLabel: string;
  bucketKind?: 'day' | 'month';
};

type MonthlyAggregateRow = {
  period: 'current' | 'previous';
  grain: 'total' | 'category';
  metric_month: string;
  untaxed_amount: number;
  margin_amount?: number;
  invoice_count?: number;
};

export type AnnualInvoiceComparison = {
  points: InvoiceComparisonPoint[];
  currentTotal: number;
  previousTotal: number;
  currentMargin: number;
  previousMargin: number;
  currentInvoiceCount: number;
  previousInvoiceCount: number;
};

export type CumulativeInvoiceComparisonPoint = InvoiceComparisonPoint & {
  accumulatedCurrent: number;
  accumulatedPrevious: number;
  accumulatedDifference: number;
};

export function buildAnnualInvoiceComparison(
  rows: MonthlyAggregateRow[],
  year: number,
  endDate: string,
): AnnualInvoiceComparison | null {
  const endMonth = Number(endDate.slice(5, 7));
  if (!Number.isInteger(endMonth) || endMonth < 1 || endMonth > 12 || Number(endDate.slice(0, 4)) !== year) return null;

  const amounts = new Map<string, number>();
  const totals = {
    current: { untaxed: 0, margin: 0, invoices: 0, rows: 0 },
    previous: { untaxed: 0, margin: 0, invoices: 0, rows: 0 },
  };
  for (const row of rows) {
    if (row.grain !== 'total') continue;
    const month = Number(row.metric_month.slice(5, 7));
    const rowYear = Number(row.metric_month.slice(0, 4));
    const expectedYear = row.period === 'current' ? year : year - 1;
    if (rowYear !== expectedYear || !Number.isInteger(month) || month < 1 || month > endMonth) continue;
    const key = `${row.period}:${month}`;
    const untaxed = Number(row.untaxed_amount) || 0;
    const margin = Number(row.margin_amount) || 0;
    const invoices = Number(row.invoice_count) || 0;
    amounts.set(key, (amounts.get(key) ?? 0) + untaxed);
    totals[row.period].untaxed += untaxed;
    totals[row.period].margin += margin;
    totals[row.period].invoices += invoices;
    totals[row.period].rows += 1;
  }
  if (!totals.current.rows || !totals.previous.rows) return null;

  const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });
  const points = Array.from({ length: endMonth }, (_, index) => {
    const month = index + 1;
    const currentDate = `${year}-${`${month}`.padStart(2, '0')}-01`;
    const previousDate = `${year - 1}-${`${month}`.padStart(2, '0')}-01`;
    return {
      bucketKey: currentDate,
      label: monthFormatter.format(new Date(`${currentDate}T00:00:00.000Z`)).replace('.', ''),
      invoicedAmount: amounts.get(`current:${month}`) ?? 0,
      previousInvoicedAmount: amounts.get(`previous:${month}`) ?? 0,
      previousLabel: monthFormatter.format(new Date(`${previousDate}T00:00:00.000Z`)).replace('.', ''),
      bucketKind: 'month' as const,
    };
  });

  return {
    points,
    currentTotal: totals.current.untaxed,
    previousTotal: totals.previous.untaxed,
    currentMargin: totals.current.margin,
    previousMargin: totals.previous.margin,
    currentInvoiceCount: totals.current.invoices,
    previousInvoiceCount: totals.previous.invoices,
  };
}

export function buildCumulativeInvoiceComparison(points: InvoiceComparisonPoint[]): CumulativeInvoiceComparisonPoint[] {
  let accumulatedCurrent = 0;
  let accumulatedPrevious = 0;
  return points.map((point) => {
    accumulatedCurrent += point.invoicedAmount;
    accumulatedPrevious += point.previousInvoicedAmount;
    return {
      ...point,
      accumulatedCurrent,
      accumulatedPrevious,
      accumulatedDifference: accumulatedCurrent - accumulatedPrevious,
    };
  });
}
