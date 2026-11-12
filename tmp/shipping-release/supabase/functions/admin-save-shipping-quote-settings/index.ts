import { createClient } from 'jsr:@supabase/supabase-js@2';

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

    const callerIsOwner = await isOwner(adminClient, caller.id);
    if (!callerIsOwner) {
      return jsonResponse({ error: 'Solo un propietario puede guardar esta configuración.' }, 403);
    }

    const payload = normalizePayload(await req.json());

    const { data, error } = await adminClient
      .from('shipping_quote_settings')
      .upsert({
        provider: 'fedex',
        ...payload,
      }, { onConflict: 'provider' })
      .select('*')
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo guardar la configuración del cotizador.';
    return jsonResponse({ error: message }, 500);
  }
});

async function isOwner(adminClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role === 'owner' && data?.is_active !== false;
}

function normalizePayload(value: unknown) {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

  return {
    fedex_base_url: String(source.fedex_base_url ?? 'https://apis.fedex.com').trim() || 'https://apis.fedex.com',
    fedex_origin_postal_code: optionalText(source.fedex_origin_postal_code),
    fedex_client_id: optionalText(source.fedex_client_id),
    fedex_client_secret: optionalText(source.fedex_client_secret),
    fedex_account_number: normalizeFedexAccountNumber(source.fedex_account_number),
    fedex_child_key: null,
    fedex_child_secret: null,
    is_active: source.is_active !== false,
  };
}

function optionalText(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeFedexAccountNumber(value: unknown) {
  const text = optionalText(value);
  if (!text) return null;
  const normalized = text.replace(/[\s-]+/g, '');
  if (!/^\d+$/.test(normalized)) {
    throw new Error('El Account Number de FedEx debe contener solo números. Quita espacios, guiones u otros caracteres.');
  }
  return normalized;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  const payload = 'data' in body ? body : { data: null, ...body };
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
