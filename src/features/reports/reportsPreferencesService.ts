import { supabase } from '../../lib/supabase';
import type { ReportPreference } from '../../lib/types';
import type { ReportFilters, ReportsConfig } from './odooSalesCore';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
