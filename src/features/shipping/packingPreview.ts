import { generatePackingPlan, validatePackingAssignments, assignmentsFromPlan, type PackingLine, type PackagingRow, type PackingAssignment, type PackingStrategy } from '../../../supabase/functions/_shared/shipping-packing';

export const packingStrategyLabels: Record<PackingStrategy, string> = {
  BALANCED: 'Equilibrado', MIN_PACKAGES: 'Menos paquetes', COMPACT: 'Compacto', CONSERVATIVE: 'Conservador',
};
export const fmtPacking = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(value);
export function packingInputKey(lines: PackingLine[], rows: PackagingRow[], strategy: PackingStrategy): string {
  return JSON.stringify([lines, rows, strategy]);
}
export function buildPackingPreview(lines: PackingLine[], rows: PackagingRow[], strategy: PackingStrategy, assignments?: PackingAssignment[]) {
  try {
    const log = import.meta.env.DEV && new URLSearchParams(window.location.search).has('shippingPackingDebug')
      ? (event: string, details: Record<string, string | number>) => console.debug('[shipping:packing]', { event, ...details }) : undefined;
    const plan = assignments ? validatePackingAssignments(lines, rows, assignments, strategy) : generatePackingPlan(lines, rows, strategy, log);
    // Manual changes are normalized from the validated plan so automatic
    // rebalancing is immediately reflected in each box and its progress bar.
    return { plan, assignments: assignmentsFromPlan(plan), error: null };
  } catch (error) {
    return { plan: null, assignments: [], error: error instanceof Error ? error.message : 'No se pudo calcular el embalaje.' };
  }
}
