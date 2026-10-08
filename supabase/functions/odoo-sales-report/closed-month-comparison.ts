export type ClosedMonthComparisonRange = {
  currentStartDate: string;
  currentEndDate: string;
  previousStartDate: string;
  previousEndDate: string;
  closedThroughMonth: number;
} | null;

export function resolveClosedMonthComparisonRange(
  filters: { startDate: string; endDate: string },
  visibilityScope: 'all' | 'own',
  now = new Date(),
): ClosedMonthComparisonRange {
  if (visibilityScope !== 'all') return null;

  const localParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => localParts.find((item) => item.type === type)?.value ?? '';
  const year = Number(part('year'));
  const month = Number(part('month'));
  const yearPrefix = `${year}-`;
  if (filters.startDate !== `${year}-01-01` || !filters.endDate.startsWith(yearPrefix)) return null;

  const firstDayOfCurrentMonth = new Date(Date.UTC(year, month - 1, 1));
  firstDayOfCurrentMonth.setUTCDate(firstDayOfCurrentMonth.getUTCDate() - 1);
  const currentEndDate = firstDayOfCurrentMonth.toISOString().slice(0, 10);
  if (currentEndDate < filters.startDate || currentEndDate > filters.endDate) return null;

  const currentMonth = Number(currentEndDate.slice(5, 7));
  const previousEndDate = shiftDateByYears(currentEndDate, -1);
  return {
    currentStartDate: filters.startDate,
    currentEndDate,
    previousStartDate: `${year - 1}-01-01`,
    previousEndDate,
    closedThroughMonth: currentMonth,
  };
}

function shiftDateByYears(value: string, years: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
