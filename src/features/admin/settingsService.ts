import { supabase } from '../../lib/supabase';
import type {
  AdminModuleKey,
  AdminModulePermission,
  AdminModulePermissionItem,
  AdminUserRole,
  AdminUserModulePermissions,
  AdminVisibilityScope,
  ShippingBox,
  ShippingProductProfile,
  ShippingQuoteSettings,
  SupportMailerSettings,
} from '../../lib/types';

export type { AdminUserRole } from '../../lib/types';

export const DESIGNATED_OWNER_EMAIL = 'joeltrincadov@gmail.com';

export function isDesignatedOwnerEmail(email?: string | null) {
  return email?.trim().toLowerCase() === DESIGNATED_OWNER_EMAIL;
}

export const adminModules: Array<{ key: AdminModuleKey; label: string }> = [
  { key: 'supports', label: 'Servicios' },
  { key: 'inventory', label: 'Inventario' },
  { key: 'policies', label: 'Pólizas' },
  { key: 'reports', label: 'Reportes' },
  { key: 'purchases', label: 'Compras' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'quoting', label: 'Cotizador' },
  { key: 'calculator', label: 'Calculadora' },
];

export type ModulePermissionDraft = Record<
  AdminModuleKey,
  {
    can_access: boolean;
    visibility_scope: AdminVisibilityScope;
  }
>;

export type ModuleAccessResult = {
  can_access: boolean;
  visibility_scope: AdminVisibilityScope;
  user_id: string | null;
};

export type AdminUserType = 'owner' | 'user';

export const adminUserRoles: Array<{ value: AdminUserRole; label: string }> = [
  { value: 'sales_agent', label: 'Agente de ventas' },
  { value: 'manager', label: 'Gerente' },
  { value: 'marketing_agent', label: 'Agente de marketing' },
  { value: 'support_agent', label: 'Agente de soporte' },
  { value: 'purchase_agent', label: 'Agente de compras' },
  { value: 'owner', label: 'Propietario' },
];

export type CreateAdminUserDraft = {
  email: string;
  password: string;
  full_name: string;
  role: AdminUserRole;
  permissions: ModulePermissionDraft;
};

export type SupportMailerSettingsDraft = {
  provider: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password: string;
  sender_email: string;
  sender_name: string;
  reply_to_email: string | null;
  is_active: boolean;
  subject_template: string;
  text_template: string;
  html_template: string;
};

export type ShippingQuoteSettingsDraft = {
  fedex_base_url: string;
  fedex_origin_postal_code: string | null;
  fedex_client_id: string | null;
  fedex_client_secret: string | null;
  fedex_account_number: string | null;
  fedex_child_key: string | null;
  fedex_child_secret: string | null;
  is_active: boolean;
};

export type ShippingProductProfileDraft = Omit<
  ShippingProductProfile,
  'id' | 'created_at' | 'updated_at'
>;

export type ShippingBoxDraft = Omit<ShippingBox, 'id' | 'created_at' | 'updated_at'>;

export type UpdateAdminUserDraft = {
  permission: AdminUserModulePermissions;
  password: string;
  full_name: string;
  role: AdminUserRole;
  is_active: boolean;
  permissions: ModulePermissionDraft;
};

const defaultVisibilityScope: AdminVisibilityScope = 'all';

type PermissionRow = AdminModulePermission & {
  admin_module_permission_items?: AdminModulePermissionItem[];
};

export function isPermissionOwner(
  permission?: Pick<AdminModulePermission, 'email' | 'user_type' | 'role'> | null,
) {
  return permission?.role === 'owner' ||
    permission?.user_type === 'owner' ||
    isDesignatedOwnerEmail(permission?.email);
}

export async function getModulePermissions() {
  const { data: response, error } = await supabase.functions.invoke('admin-get-permissions');
  if (error) throw error;

  const rows = (((response as { data?: unknown } | null)?.data ?? []) as unknown) as PermissionRow[];

  return rows.map((permission) => ({
    ...permission,
    module_permissions: normalizeModulePermissionItems(
      permission.id,
      permission.user_id,
      permission.admin_module_permission_items ?? [],
      {
        supports: Boolean(permission.can_access_supports),
        inventory: Boolean(permission.can_access_inventory),
        policies: Boolean(permission.can_access_policies),
        reports: Boolean(permission.can_access_reports),
        purchases: Boolean(permission.can_access_purchases),
        marketing: Boolean(permission.can_access_marketing),
        quoting: Boolean(permission.can_access_quoting),
        calculator: Boolean(permission.can_access_calculator),
      },
    ),
  })) as AdminUserModulePermissions[];
}

export async function getCurrentModulePermission(userId: string, email?: string | null) {
  const directResult = await supabase
    .from('admin_module_permissions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  let row = directResult.data as unknown as PermissionRow | null;

  if (!row && email) {
    const emailResult = await supabase
      .from('admin_module_permissions')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle();
    if (!emailResult.error) {
      row = emailResult.data as unknown as PermissionRow | null;
    }
  }

  if (row) {
    const itemsResult = await supabase
      .from('admin_module_permission_items')
      .select('*')
      .eq('user_id', userId)
      .order('module_key', { ascending: true });

    row.admin_module_permission_items = itemsResult.error
      ? []
      : (itemsResult.data as AdminModulePermissionItem[] | null) ?? [];
  }

  if (!row) {
    const { data: response, error: functionError } = await supabase.functions.invoke(
      'get-my-module-permissions',
    );
    if (!functionError) {
      row = ((response as { data?: unknown } | null)?.data ?? null) as PermissionRow | null;
    } else if (directResult.error) {
      throw directResult.error;
    }
  }

  if (!row) return null;

  return {
    ...row,
    module_permissions: normalizeModulePermissionItems(
      row.id,
      row.user_id,
      row.admin_module_permission_items ?? [],
      {
        supports: Boolean(row.can_access_supports),
        inventory: Boolean(row.can_access_inventory),
        policies: Boolean(row.can_access_policies),
        reports: Boolean(row.can_access_reports),
        purchases: Boolean(row.can_access_purchases),
        marketing: Boolean(row.can_access_marketing),
        quoting: Boolean(row.can_access_quoting),
        calculator: Boolean(row.can_access_calculator),
      },
    ),
  } as AdminUserModulePermissions;
}

export async function getCurrentUserModuleAccess(moduleKey: AdminModuleKey): Promise<ModuleAccessResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) {
    return { can_access: false, visibility_scope: defaultVisibilityScope, user_id: null };
  }

  if (isDesignatedOwnerEmail(user.email)) {
    return { can_access: true, visibility_scope: 'all', user_id: user.id };
  }

  const permission = await getCurrentModulePermission(user.id, user.email);
  if (permission?.is_active === false) {
    return { can_access: false, visibility_scope: defaultVisibilityScope, user_id: user.id };
  }
  if (isPermissionOwner(permission)) {
    return { can_access: true, visibility_scope: 'all', user_id: user.id };
  }
  const modulePermission = permission?.module_permissions.find((item) => item.module_key === moduleKey);

  return {
    can_access: Boolean(modulePermission?.can_access),
    visibility_scope: modulePermission?.visibility_scope ?? defaultVisibilityScope,
    user_id: user.id,
  };
}

export async function saveUserModulePermissions(permission: AdminUserModulePermissions, draft: ModulePermissionDraft) {
  if (isPermissionOwner(permission)) {
    throw new Error('Los propietarios siempre tienen acceso completo.');
  }

  const rows = adminModules.map((module) => ({
    permission_id: permission.id,
    user_id: permission.user_id,
    module_key: module.key,
    can_access: draft[module.key].can_access,
    visibility_scope: draft[module.key].visibility_scope,
    actions: {
      view: draft[module.key].can_access,
      create: false,
      edit: false,
      delete: false,
      export: module.key === 'reports' && draft[module.key].can_access,
    },
  }));

  const { data, error } = await supabase
    .from('admin_module_permission_items')
    .upsert(rows, { onConflict: 'user_id,module_key' })
    .select();

  if (error) throw error;

  const { error: summaryError } = await supabase
    .from('admin_module_permissions')
    .update({
      can_access_supports: draft.supports.can_access,
      can_access_inventory: draft.inventory.can_access,
      can_access_policies: draft.policies.can_access,
      can_access_reports: draft.reports.can_access,
      can_access_purchases: draft.purchases.can_access,
      can_access_marketing: draft.marketing.can_access,
      can_access_quoting: draft.quoting.can_access,
      can_access_calculator: draft.calculator.can_access,
    })
    .eq('id', permission.id);

  if (summaryError) throw summaryError;
  return data as AdminModulePermissionItem[];
}

export async function updateAdminUser(payload: UpdateAdminUserDraft) {
  const userType = payload.role === 'owner' ? 'owner' : 'user';
  const permissions = payload.role === 'owner'
    ? buildFullAccessDraft()
    : payload.permissions;
  const password = payload.password.trim();

  if (password && password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  const { data, error } = await supabase.functions.invoke('admin-update-user', {
    body: {
      user_id: payload.permission.user_id,
      full_name: payload.full_name.trim() || null,
      role: payload.role,
      is_active: payload.is_active,
      user_type: userType,
      password: password || null,
      permissions,
    },
  });

  if (error) throw error;
  return data as { user_id: string; email: string; user_type: AdminUserType };
}

export async function createAdminUser(payload: CreateAdminUserDraft) {
  const normalizedEmail = payload.email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Indica el correo del usuario.');
  if (payload.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');

  const permissions = payload.role === 'owner'
    ? buildFullAccessDraft()
    : payload.permissions;

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: {
      email: normalizedEmail,
      password: payload.password,
      full_name: payload.full_name.trim(),
      role: payload.role,
      permissions,
    },
  });

  if (error) throw error;
  return data as { user_id: string; email: string; user_type: AdminUserType };
}

export async function getSupportMailerSettings() {
  const { data, error } = await supabase.functions.invoke('admin-get-support-mailer-settings');
  if (error) throw error;
  return ((data as { data?: SupportMailerSettings | null } | null)?.data ?? null) as SupportMailerSettings | null;
}

export async function saveSupportMailerSettings(payload: SupportMailerSettingsDraft) {
  const { data, error } = await supabase.functions.invoke('admin-save-support-mailer-settings', {
    body: payload,
  });
  if (error) throw error;
  return ((data as { data?: SupportMailerSettings } | null)?.data ?? null) as SupportMailerSettings;
}

export async function getShippingQuoteSettings() {
  const { data, error } = await supabase
    .from('shipping_quote_settings')
    .select('*')
    .eq('provider', 'fedex')
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ShippingQuoteSettings | null;
}

export async function saveShippingQuoteSettings(payload: ShippingQuoteSettingsDraft) {
  const { data, error } = await supabase
    .from('shipping_quote_settings')
    .upsert(
      {
        provider: 'fedex',
        ...payload,
      },
      { onConflict: 'provider' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as ShippingQuoteSettings;
}

export async function getShippingProductProfiles() {
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: Error | null }>;
      };
    };
  };
  const { data, error } = await client
    .from('shipping_product_profiles')
    .select('*')
    .order('product_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ShippingProductProfile[];
}

export async function saveShippingProductProfile(payload: ShippingProductProfileDraft, id?: string | null) {
  const normalized = normalizeShippingProductProfileDraft(payload);
  const client = supabase as unknown as {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: (columns: string) => { single: () => Promise<{ data: unknown; error: Error | null }> };
        };
      };
      insert: (values: Record<string, unknown>) => {
        select: (columns: string) => { single: () => Promise<{ data: unknown; error: Error | null }> };
      };
    };
  };
  const query = id
    ? client
        .from('shipping_product_profiles')
        .update(normalized)
        .eq('id', id)
        .select('*')
        .single()
    : client
        .from('shipping_product_profiles')
        .insert(normalized)
        .select('*')
        .single();
  const { data, error } = await query;
  if (error) throw error;
  return data as ShippingProductProfile;
}

export async function deleteShippingProductProfile(id: string) {
  const client = supabase as unknown as {
    from: (table: string) => {
      delete: () => { eq: (column: string, value: string) => Promise<{ error: Error | null }> };
    };
  };
  const { error } = await client.from('shipping_product_profiles').delete().eq('id', id);
  if (error) throw error;
}

export async function getShippingBoxes() {
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: Error | null }>;
      };
    };
  };
  const { data, error } = await client
    .from('shipping_boxes')
    .select('*')
    .order('outer_length_cm', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ShippingBox[];
}

export async function saveShippingBox(payload: ShippingBoxDraft, id?: string | null) {
  const normalized = normalizeShippingBoxDraft(payload);
  const client = supabase as unknown as {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: (columns: string) => { single: () => Promise<{ data: unknown; error: Error | null }> };
        };
      };
      insert: (values: Record<string, unknown>) => {
        select: (columns: string) => { single: () => Promise<{ data: unknown; error: Error | null }> };
      };
    };
  };
  const query = id
    ? client.from('shipping_boxes').update(normalized).eq('id', id).select('*').single()
    : client.from('shipping_boxes').insert(normalized).select('*').single();
  const { data, error } = await query;
  if (error) throw error;
  return data as ShippingBox;
}

export async function deleteShippingBox(id: string) {
  const client = supabase as unknown as {
    from: (table: string) => {
      delete: () => { eq: (column: string, value: string) => Promise<{ error: Error | null }> };
    };
  };
  const { error } = await client.from('shipping_boxes').delete().eq('id', id);
  if (error) throw error;
}

function normalizeShippingProductProfileDraft(payload: ShippingProductProfileDraft) {
  return {
    ...payload,
    sku: payload.sku.trim(),
    product_name: payload.product_name.trim(),
    product_family: emptyToNull(payload.product_family),
    packaging_group: emptyToNull(payload.packaging_group),
    packed_weight_kg: nullablePositive(payload.packed_weight_kg),
    packed_length_cm: nullablePositive(payload.packed_length_cm),
    packed_width_cm: nullablePositive(payload.packed_width_cm),
    packed_height_cm: nullablePositive(payload.packed_height_cm),
    units_per_master_carton: nullablePositiveInteger(payload.units_per_master_carton),
    max_units_per_package: nullablePositiveInteger(payload.max_units_per_package),
  };
}

function normalizeShippingBoxDraft(payload: ShippingBoxDraft) {
  return {
    ...payload,
    name: payload.name.trim(),
  };
}

function emptyToNull(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function nullablePositive(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nullablePositiveInteger(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildModulePermissionDraft(permission: AdminUserModulePermissions): ModulePermissionDraft {
  const owner = isPermissionOwner(permission);

  return adminModules.reduce((draft, module) => {
    const saved = permission.module_permissions.find((item) => item.module_key === module.key);
    return {
      ...draft,
      [module.key]: {
        can_access: owner || Boolean(saved?.can_access),
      visibility_scope: owner ? 'all' : saved?.visibility_scope ?? defaultVisibilityScope,
      },
    };
  }, {} as ModulePermissionDraft);
}

export function buildEmptyPermissionDraft(): ModulePermissionDraft {
  return adminModules.reduce((draft, module) => ({
    ...draft,
    [module.key]: {
      can_access: false,
      visibility_scope: defaultVisibilityScope,
    },
  }), {} as ModulePermissionDraft);
}

export function applyRolePermissionDefaults(
  draft: ModulePermissionDraft,
  role: AdminUserRole,
): ModulePermissionDraft {
  if (role !== 'marketing_agent') {
    return draft;
  }

  return {
    ...draft,
    marketing: {
      can_access: true,
      visibility_scope: 'all',
    },
  };
}

export function buildFullAccessDraft(): ModulePermissionDraft {
  return adminModules.reduce((draft, module) => ({
    ...draft,
    [module.key]: {
      can_access: true,
      visibility_scope: 'all',
    },
  }), {} as ModulePermissionDraft);
}

function normalizeModulePermissionItems(
  permissionId: string,
  userId: string,
  rows: AdminModulePermissionItem[],
  legacyAccess: Record<AdminModuleKey, boolean>,
) {
  return adminModules.map((module) => {
    const saved = rows.find((row) => row.module_key === module.key);
    return {
      id: saved?.id ?? `${permissionId}-${module.key}`,
      permission_id: permissionId,
      user_id: userId,
      module_key: module.key,
      can_access: saved?.can_access ?? legacyAccess[module.key],
      visibility_scope: saved?.visibility_scope ?? defaultVisibilityScope,
      actions: saved?.actions ?? {
        view: Boolean(saved?.can_access ?? legacyAccess[module.key]),
        create: false,
        edit: false,
        delete: false,
        export: module.key === 'reports' && Boolean(saved?.can_access ?? legacyAccess[module.key]),
      },
      created_at: saved?.created_at ?? '',
      updated_at: saved?.updated_at ?? '',
    };
  });
}
