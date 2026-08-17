import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sqzrvzwyvjeosuvzotja.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabaseConfigStatus = {
  hasUrl: Boolean(supabaseUrl),
  hasKey: Boolean(supabaseKey),
};

if (!isSupabaseConfigured) {
  // The app still renders a helpful setup state, but data calls will fail until configured.
  console.warn('Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_ANON_KEY en .env.local');
}

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseKey || 'placeholder-key',
);
