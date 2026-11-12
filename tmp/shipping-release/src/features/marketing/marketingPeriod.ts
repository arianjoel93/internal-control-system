import type { ReportFilters } from '../reports/odooSalesCore';

const DAY_MS = 86_400_000;

export function buildPreviousMarketingFilters(filters: ReportFilters, referenceDate = new Date()): ReportFilters {
  const start = new Date(`${filters.startDate}T00:00:00.000Z`);
  const end = new Date(`${filters.endDate}T00:00:00.000Z`);
  const today = referenceDate;
  const todayKey = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0, 10);
  const firstDayOfMonth = start.getUTCDate() === 1;
  const firstDayOfQuarter = firstDayOfMonth && start.getUTCMonth() % 3 === 0;
  const firstDayOfYear = firstDayOfMonth && start.getUTCMonth() === 0;
  const isFullYear = firstDayOfYear && end.getUTCMonth() === 11 && end.getUTCDate() === 31;
  const isFullQuarter = firstDayOfQuarter && end.getTime() === Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0);
  const isFullMonth = firstDayOfMonth && end.getTime() === Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0);

  if (isFullYear || (firstDayOfYear && filters.endDate === todayKey)) {
    const previousStart = new Date(Date.UTC(start.getUTCFullYear() - 1, 0, 1));
    const previousEnd = isFullYear
      ? new Date(Date.UTC(start.getUTCFullYear() - 1, 11, 31))
      : new Date(Date.UTC(start.getUTCFullYear() - 1, end.getUTCMonth(), Math.min(
          end.getUTCDate(),
          new Date(Date.UTC(start.getUTCFullYear() - 1, end.getUTCMonth() + 1, 0)).getUTCDate(),
        )));
    return withDates(filters, previousStart, previousEnd);
  }

  if (isFullQuarter || (firstDayOfQuarter && filters.endDate === todayKey)) {
    const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1));
    const previousQuarterEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    const elapsedDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    const previousEnd = isFullQuarter
      ? previousQuarterEnd
      : new Date(Math.min(previousStart.getTime() + elapsedDays * DAY_MS, previousQuarterEnd.getTime()));
    return withDates(filters, previousStart, previousEnd);
  }

  if (isFullMonth || (firstDayOfMonth && filters.endDate === todayKey)) {
    const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const previousMonthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    const previousEnd = isFullMonth
      ? previousMonthEnd
      : new Date(Date.UTC(previousStart.getUTCFullYear(), previousStart.getUTCMonth(), Math.min(end.getUTCDate(), previousMonthEnd.getUTCDate())));
    return withDates(filters, previousStart, previousEnd);
  }

  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (end.getTime() - start.getTime()));
  return withDates(filters, previousStart, previousEnd);
}

function withDates(filters: ReportFilters, start: Date, end: Date): ReportFilters {
  return {
    ...filters,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
