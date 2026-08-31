import { createClient } from 'jsr:@supabase/supabase-js@2';

type AdminModuleKey = 'supports' | 'inventory' | 'policies' | 'reports' | 'purchases' | 'marketing' | 'forms' | 'quoting' | 'shipping_quotes' | 'calculator';
type AdminUserRole = 'sales_agent' | 'manager' | 'marketing_agent' | 'support_agent' | 'purchase_agent' | 'owner';
type VisibilityScope = 'all' | 'own';
type ModulePermissionDraft = Record<AdminModuleKey, {
  can_access: boolean;
  visibility_scope: VisibilityScope;
}>;

const adminModules: AdminModuleKey[] = ['supports', 'inventory', 'policies', 'reports', 'purchases', 'marketing', 'forms', 'quoting', 'shipping_quotes', 'calculator'];

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
      return jsonResponse({ error: 'Solo un propietario puede crear usuarios.' }, 403);
    }

    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const requestedRole = normalizeRole(body.role ?? body.user_type);
    const fullName = String(body.full_name ?? '').trim() || null;

    if (!isValidEmail(email)) {
      return jsonResponse({ error: 'Indica un correo válido.' }, 400);
    }

    const role = email === 'joeltrincadov@gmail.com' ? 'owner' : requestedRole;
    const userType = role === 'owner' ? 'owner' : 'user';
    const permissions = normalizePermissions(body.permissions, role);

    if (password.length < 6) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { role, user_type: userType },
    });

    if (createError || !created.user) {
      return jsonResponse({ error: createError?.message ?? 'No se pudo crear el usuario.' }, 400);
    }

    const permissionId = await upsertPermissions(
      adminClient,
      created.user.id,
      email,
      fullName,
      role,
      caller.id,
      permissions,
    );

    await writeAuditLog(adminClient, {
      actorId: caller.id,
      actorEmail: caller.email,
      targetId: created.user.id,
      action: 'user.created',
      newValue: { email, full_name: fullName, role, is_active: true, permissions },
    });

    return jsonResponse({
      user_id: created.user.id,
      permission_id: permissionId,
      email,
      role,
      user_type: userType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ocurrió un error al crear el usuario.';
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
    email?.trim().toLowerCase() === 'joeltrincadov@gmail.com';
}

function normalizeRole(value: unknown): AdminUserRole {
  return value === 'sales_agent' ||
    value === 'manager' ||
    value === 'marketing_agent' ||
    value === 'support_agent' ||
    value === 'purchase_agent' ||
    value === 'owner'
    ? value
    : 'manager';
}

function normalizePermissions(value: unknown, role: AdminUserRole): ModulePermissionDraft {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

  return adminModules.reduce((draft, moduleKey) => {
    const item = typeof source[moduleKey] === 'object' && source[moduleKey] !== null
      ? source[moduleKey] as Record<string, unknown>
      : {};

    return {
      ...draft,
      [moduleKey]: {
        can_access: role === 'owner' ||
          (role === 'marketing_agent' && moduleKey === 'marketing') ||
          (role === 'support_agent' && moduleKey === 'supports')
          ? true
          : Boolean(item.can_access),
        visibility_scope: role === 'owner'
          ? 'all'
          : role === 'sales_agent'
            ? 'own'
            : item.visibility_scope !== 'own'
              ? 'all'
              : 'own',
      },
    };
  }, {} as ModulePermissionDraft);
}

async function upsertPermissions(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  email: string,
  fullName: string | null,
  role: AdminUserRole,
  actorId: string,
  permissions: ModulePermissionDraft,
) {
  const summary = {
    user_id: userId,
    email,
    full_name: fullName,
    role,
    user_type: role === 'owner' ? 'owner' : 'user',
    is_active: true,
    created_by: actorId,
    updated_by: actorId,
    can_access_supports: permissions.supports.can_access,
    can_access_inventory: permissions.inventory.can_access,
    can_access_policies: permissions.policies.can_access,
    can_access_reports: permissions.reports.can_access,
    can_access_purchases: permissions.purchases.can_access,
    can_access_marketing: permissions.marketing.can_access,
    can_access_forms: permissions.forms.can_access,
    can_access_quoting: permissions.quoting.can_access,
    can_access_shipping_quotes: permissions.shipping_quotes.can_access,
    can_access_calculator: permissions.calculator.can_access,
  };

  const { data: permission, error: permissionError } = await adminClient
    .from('admin_module_permissions')
    .upsert(summary, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (permissionError) throw permissionError;

  const rows = adminModules.map((moduleKey) => ({
    permission_id: permission.id,
    user_id: userId,
    module_key: moduleKey,
    can_access: permissions[moduleKey].can_access,
    visibility_scope: permissions[moduleKey].visibility_scope,
    actions: {
      view: permissions[moduleKey].can_access,
      create: false,
      edit: false,
      delete: false,
      export: moduleKey === 'reports' && permissions[moduleKey].can_access,
    },
  }));

  const { error: itemsError } = await adminClient
    .from('admin_module_permission_items')
    .upsert(rows, { onConflict: 'user_id,module_key' });

  if (itemsError) throw itemsError;
  return permission.id as string;
}

async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  input: { actorId: string; actorEmail?: string | null; targetId: string; action: string; newValue: unknown },
) {
  const { error } = await adminClient.from('admin_audit_log').insert({
    actor_user_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    target_user_id: input.targetId,
    action: input.action,
    previous_value: null,
    new_value: input.newValue,
  });
  if (error) throw error;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
