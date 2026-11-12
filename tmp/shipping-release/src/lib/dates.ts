import { addDays, differenceInCalendarDays, format, isWeekend, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

export function warrantyDaysRemaining(warrantyEndDate: string) {
  return differenceInCalendarDays(parseISO(warrantyEndDate), new Date());
}

export function daysRemainingFromNullable(warrantyEndDate: string | null) {
  if (!warrantyEndDate) return null;
  return warrantyDaysRemaining(warrantyEndDate);
}

export function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  return format(parseISO(value), 'dd MMM yyyy', { locale: es });
}

export function formatDateWithWeekday(value: string | null) {
  if (!value) return 'Sin fecha';
  return format(parseISO(value), 'EEEE, dd MMM yyyy', { locale: es });
}

export function formatTime(value: string) {
  return format(parseISO(value), 'HH:mm');
}

export function addBusinessDaysFromDate(value: string | Date, businessDays: number) {
  const start = value instanceof Date ? value : parseISO(value);
  if (businessDays <= 0) return new Date(start);

  let cursor = new Date(start);
  let remaining = businessDays;

  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (!isWeekend(cursor)) {
      remaining -= 1;
    }
  }

  return cursor;
}

export function businessDaysElapsedSince(value: string | null) {
  if (!value) return 0;

  const startDate = startOfDay(parseISO(value));
  const today = startOfDay(new Date());
  if (today.getTime() <= startDate.getTime()) return 0;

  let elapsedDays = 0;
  for (let cursor = addDays(startDate, 1); cursor.getTime() <= today.getTime(); cursor = addDays(cursor, 1)) {
    if (!isWeekend(cursor)) {
      elapsedDays += 1;
    }
  }

  return elapsedDays;
}

export function businessDaysRemainingFromCreatedAt(createdAt: string | null, totalBusinessDays: number | null) {
  if (!totalBusinessDays) return null;
  return Math.max(totalBusinessDays - businessDaysElapsedSince(createdAt), 0);
}
