import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo no permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = resolveSupabasePublishableKey();
    const secretKey = resolveSupabaseSecretKey();
    if (!supabaseUrl || !publishableKey || !secretKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase.' }, 500);
    }

    const authorization = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, secretKey);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Sesion no valida.' }, 401);
    }

    const normalizedEmail = user.email?.trim().toLowerCase() ?? '';
    const permissionResult = await adminClient
      .from('admin_module_permissions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    let permission = permissionResult.data;

    if (permissionResult.error) throw permissionResult.error;

    if (!permission && normalizedEmail) {
      const emailResult = await adminClient
        .from('admin_module_permissions')
        .select('*')
        .ilike('email', normalizedEmail)
        .maybeSingle();
      if (emailResult.error) throw emailResult.error;
      permission = emailResult.data;
    }

    if (!permission) {
      return jsonResponse({ data: null });
    }

    const { data: items, error: itemsError } = await adminClient
      .from('admin_module_permission_items')
      .select('*')
      .eq('permission_id', permission.id)
      .order('module_key', { ascending: true });

    if (itemsError) throw itemsError;

    return jsonResponse({
      data: {
        ...permission,
        admin_module_permission_items: items ?? [],
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : 'No se pudieron cargar los permisos del usuario.',
      },
      500,
    );
  }
});

function resolveSupabasePublishableKey() {
  return Deno.env.get('SUPABASE_ANON_KEY')?.trim() ||
    parseKeyMap('SUPABASE_PUBLISHABLE_KEYS')?.default?.trim() ||
    null;
}

function resolveSupabaseSecretKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    parseKeyMap('SUPABASE_SECRET_KEYS')?.default?.trim() ||
    null;
}

function parseKeyMap(envName: string) {
  const raw = Deno.env.get(envName)?.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
