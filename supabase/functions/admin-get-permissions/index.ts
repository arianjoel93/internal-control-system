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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase.' }, 500);
    }

    const authorization = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller) return jsonResponse({ error: 'Sesion no valida.' }, 401);

    if (!(await isOwner(adminClient, caller.id, caller.email))) {
      return jsonResponse({ error: 'Solo un Propietario puede consultar todos los usuarios y permisos.' }, 403);
    }

    const { data, error } = await adminClient
      .from('admin_module_permissions')
      .select('*, admin_module_permission_items (*)')
      .order('email', { ascending: true });

    if (error) throw error;
    return jsonResponse({ data: data ?? [] });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'No se pudieron cargar los permisos.',
    }, 500);
  }
});

async function isOwner(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  email?: string | null,
) {
  const { data, error } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role === 'owner' && data?.is_active !== false) ||
    email?.trim().toLowerCase() === 'joeltrincadov@gmail.com';
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
