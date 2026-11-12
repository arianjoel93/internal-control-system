import { createClient } from 'jsr:@supabase/supabase-js@2';

const DESIGNATED_OWNER_EMAIL = 'joeltrincadov@gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405);
  }

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

    const {
      data: { user: caller },
      error: callerError,
    } = await userClient.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: 'Sesión no válida.' }, 401);
    }

    const callerIsOwner = await isOwner(adminClient, caller.id, caller.email);
    if (!callerIsOwner) {
      return jsonResponse({ error: 'Solo un propietario puede eliminar usuarios.' }, 403);
    }

    const body = await req.json();
    const userId = String(body.user_id ?? '').trim();
    const permissionId = String(body.permission_id ?? '').trim() || null;

    if (!userId) {
      return jsonResponse({ error: 'Falta el usuario a eliminar.' }, 400);
    }
    if (userId === caller.id) {
      return jsonResponse({ error: 'No puedes eliminar tu propio usuario mientras tienes la sesión abierta.' }, 409);
    }

    const {
      data: { user: targetUser },
      error: targetError,
    } = await adminClient.auth.admin.getUserById(userId);

    if (targetError || !targetUser) {
      return jsonResponse({ error: targetError?.message ?? 'No se encontró el usuario.' }, 404);
    }

    const targetEmail = String(targetUser.email ?? body.email ?? '').trim().toLowerCase();
    if (targetEmail === DESIGNATED_OWNER_EMAIL) {
      return jsonResponse({ error: 'No se puede eliminar el Propietario principal.' }, 409);
    }

    const { data: permission, error: permissionError } = await adminClient
      .from('admin_module_permissions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (permissionError) throw permissionError;
    if (permission?.role === 'owner' || permission?.user_type === 'owner') {
      return jsonResponse({ error: 'No se pueden eliminar usuarios con rol Propietario.' }, 409);
    }

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      return jsonResponse({ error: authDeleteError.message }, 400);
    }

    const { error: itemsError } = await adminClient
      .from('admin_module_permission_items')
      .delete()
      .eq('user_id', userId);
    if (itemsError) throw itemsError;

    const { error: permissionDeleteError } = await adminClient
      .from('admin_module_permissions')
      .delete()
      .eq('user_id', userId);
    if (permissionDeleteError) throw permissionDeleteError;

    await writeAuditLog(adminClient, {
      actorId: caller.id,
      actorEmail: caller.email,
      targetId: userId,
      action: 'user.deleted',
      previousValue: permission ?? { user_id: userId, email: targetEmail },
      newValue: null,
    });

    return jsonResponse({
      user_id: userId,
      permission_id: permissionId ?? permission?.id ?? null,
      email: targetEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ocurrió un error al eliminar el usuario.';
    return jsonResponse({ error: message }, 500);
  }
});

async function isOwner(adminClient: ReturnType<typeof createClient>, userId: string, email?: string | null) {
  const { data, error } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.role === 'owner' && data?.is_active !== false) ||
    email?.trim().toLowerCase() === DESIGNATED_OWNER_EMAIL;
}

async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  input: { actorId: string; actorEmail?: string | null; targetId: string; action: string; previousValue: unknown; newValue: unknown },
) {
  const { error } = await adminClient.from('admin_audit_log').insert({
    actor_user_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    target_user_id: input.targetId,
    action: input.action,
    previous_value: input.previousValue,
    new_value: input.newValue,
  });
  if (error) console.warn('[admin-delete-user:audit]', error.message);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
