import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const caseSelect = `
  *,
  support_events (*, support_event_types (name, description)),
  support_images (*)
`;

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

    const access = await getSupportAccess(adminClient, caller.id, caller.email);
    if (!access.canAccess) return jsonResponse({ error: 'No tienes permisos para consultar Soportes.' }, 403);

    const body = await req.json().catch(() => ({}));
    const term = typeof body.term === 'string' ? body.term.trim() : '';
    let query = adminClient
      .from('support_cases')
      .select(caseSelect)
      .order('created_at', { ascending: false });

    if (access.visibilityScope === 'own') query = query.eq('created_by', caller.id);
    if (term) {
      const safeTerm = escapeSearchTerm(term);
      query = query.or(
        `folio.ilike.%${safeTerm}%,customer_name.ilike.%${safeTerm}%,serial_number.ilike.%${safeTerm}%,printer_model.ilike.%${safeTerm}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return jsonResponse({ data: data ?? [] });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'No se pudieron cargar los soportes.',
    }, 500);
  }
});

async function getSupportAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  email?: string | null,
) {
  if (email?.trim().toLowerCase() === 'joeltrincadov@gmail.com') {
    return { canAccess: true, visibilityScope: 'all' as const };
  }

  const { data: permission, error: permissionError } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission || permission.is_active === false) {
    return { canAccess: false, visibilityScope: 'own' as const };
  }

  const { data: modulePermission, error: moduleError } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access, visibility_scope')
    .eq('user_id', userId)
    .eq('module_key', 'supports')
    .maybeSingle();
  if (moduleError) throw moduleError;

  return {
    canAccess: permission.role === 'owner' || Boolean(modulePermission?.can_access),
    visibilityScope: permission.role === 'owner' || modulePermission?.visibility_scope !== 'own'
      ? 'all' as const
      : 'own' as const,
  };
}

function escapeSearchTerm(value: string) {
  return value.replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
