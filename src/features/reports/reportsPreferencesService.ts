import { supabase } from '../../lib/supabase';
import type { ReportMonthlySalesGoalRow, ReportPreference } from '../../lib/types';
import type { MonthlySalesGoalConfig, ReportFilters, ReportsConfig } from './odooSalesCore';

export type StoredReportsPreferences = {
  config: Partial<ReportsConfig> | null;
  filters: Partial<ReportFilters> | null;
};

export async function getStoredReportsPreferences(): Promise<StoredReportsPreferences | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from('report_preferences')
    .select('*')
    .eq('user_id', user.id)
    .eq('module_key', 'reports')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ReportPreference;

  return {
    config: isRecord(row.config) ? (row.config as Partial<ReportsConfig>) : null,
    filters: isRecord(row.filters) ? (row.filters as Partial<ReportFilters>) : null,
  };
}

export async function saveStoredReportsPreferences(preferences: {
  config: ReportsConfig;
  filters: ReportFilters;
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return;

  const { error } = await supabase.from('report_preferences').upsert(
    {
      user_id: user.id,
      module_key: 'reports',
      config: preferences.config,
      filters: preferences.filters,
    },
    { onConflict: 'user_id,module_key' },
  );

  if (error) throw error;
}

export async function getReportMonthlySalesGoals(year: number): Promise<MonthlySalesGoalConfig[]> {
  const { data, error } = await supabase
    .from('report_monthly_sales_goals')
    .select('*')
    .eq('year', year)
    .order('month', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as ReportMonthlySalesGoalRow[]).map((row) => ({
    year: row.year,
    month: row.month,
    targetAmount: Number(row.target_amount) || 0,
  }));
}

export async function saveReportMonthlySalesGoals(
  goals: MonthlySalesGoalConfig[],
): Promise<MonthlySalesGoalConfig[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('No hay una sesión activa para guardar las metas mensuales.');

  const rows = goals.map((goal) => ({
    year: Math.max(2000, Math.min(2100, Math.trunc(Number(goal.year) || new Date().getFullYear()))),
    month: Math.max(1, Math.min(12, Math.trunc(Number(goal.month) || 1))),
    target_amount: Math.max(0, Number(goal.targetAmount) || 0),
    created_by: user.id,
    updated_by: user.id,
  }));

  const { data, error } = await supabase
    .from('report_monthly_sales_goals')
    .upsert(rows, { onConflict: 'year,month' })
    .select('*')
    .order('month', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as ReportMonthlySalesGoalRow[]).map((row) => ({
    year: row.year,
    month: row.month,
    targetAmount: Number(row.target_amount) || 0,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
