export function notificationLeadIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is number =>
    typeof id === 'number' && Number.isSafeInteger(id) && id > 0))].slice(0, 500);
}
