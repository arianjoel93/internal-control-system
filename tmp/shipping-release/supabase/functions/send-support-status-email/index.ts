import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.10.1';

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

  let adminClient: ReturnType<typeof createClient> | null = null;
  let supportEventId = '';
  let callerId = '';
  let callerEmail = '';

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
    adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: caller },
      error: callerError,
    } = await userClient.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: 'Sesión no válida.' }, 401);
    }

    callerId = caller.id;
    callerEmail = String(caller.email ?? '').trim().toLowerCase();

    if (!callerEmail) {
      return jsonResponse({ error: 'Tu usuario no tiene correo registrado en Supabase.' }, 400);
    }

    const callerHasSupportAccess = await hasSupportAccess(adminClient, caller.id);
    if (!callerHasSupportAccess) {
      return jsonResponse({ error: 'No tienes permisos para enviar correos de soporte.' }, 403);
    }

    const body = await req.json();
    const supportCaseId = String(body.support_case_id ?? '').trim();
    supportEventId = String(body.support_event_id ?? '').trim();

    if (!supportCaseId || !supportEventId) {
      return jsonResponse({ error: 'Faltan datos del movimiento.' }, 400);
    }

    const supportCase = await getSupportCase(adminClient, supportCaseId);
    const event = await getSupportEvent(adminClient, supportEventId, supportCaseId);
    const mailerSettings = await getMailerSettings(adminClient);

    if (!supportCase.customer_email) {
      return jsonResponse({ error: 'El soporte no tiene correo del cliente.' }, 400);
    }

    const transporter = nodemailer.createTransport({
      host: mailerSettings.smtp_host,
      port: mailerSettings.smtp_port,
      secure: mailerSettings.smtp_secure,
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
      auth: {
        user: mailerSettings.smtp_username,
        pass: mailerSettings.smtp_password,
      },
    });

    const emailContent = buildSupportEmailContent({
      mailerSettings,
      supportCase,
      event,
      supabaseUrl,
    });

    const bccRecipient = resolveSupportNotificationBcc(callerEmail);

    await sendMailWithRetry(transporter, {
      from: `"${mailerSettings.sender_name}" <${mailerSettings.sender_email}>`,
      to: supportCase.customer_email,
      bcc: bccRecipient,
      replyTo: mailerSettings.reply_to_email || mailerSettings.sender_email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      encoding: 'utf-8',
    });

    await markSupportEventEmailResult(adminClient, {
      supportEventId,
      callerId,
      callerEmail,
      errorMessage: null,
    });

    return jsonResponse({ message: `Correo enviado y copia oculta enviada a ${bccRecipient}.` });
  } catch (error) {
    const message = normalizeEmailErrorMessage(error);

    if (adminClient && supportEventId && callerId && callerEmail) {
      try {
        await markSupportEventEmailResult(adminClient, {
          supportEventId,
          callerId,
          callerEmail,
          errorMessage: message,
        });
      } catch {
        // Preserve the original delivery error for the client response.
      }
    }

    return jsonResponse({ error: message }, 500);
  }
});

async function sendMailWithRetry(
  transporter: ReturnType<typeof nodemailer.createTransport>,
  mailOptions: Record<string, unknown>,
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (error) {
      lastError = error;
      if (!isTransientEmailError(error) || attempt === 3) {
        throw error;
      }
      await delay(700 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo enviar el correo.');
}

function isTransientEmailError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code).toLowerCase()
    : '';

  return [
    'etimedout',
    'econnreset',
    'econnrefused',
    'esocket',
    'timeout',
    'temporarily',
    'try again',
    'too many',
    'rate',
  ].some((token) => message.includes(token) || code.includes(token));
}

function normalizeEmailErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const message = rawMessage.trim();
  const normalized = message.toLowerCase();

  if (!message) return 'No se pudo enviar el correo.';
  if (normalized.includes('invalid login') || normalized.includes('authentication')) {
    return 'No se pudo autenticar el correo saliente. Revisa usuario y contraseña SMTP en Ajustes.';
  }
  if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('etimedout')) {
    return 'El servidor de correo tardó demasiado en responder. Inténtalo nuevamente en unos momentos.';
  }
  if (normalized.includes('econnrefused') || normalized.includes('econnreset') || normalized.includes('esocket')) {
    return 'No se pudo establecer conexión estable con el servidor de correo. Inténtalo nuevamente en unos momentos.';
  }

  return message;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasSupportAccess(adminClient: ReturnType<typeof createClient>, userId: string) {
  const { data: ownerPermission, error: ownerError } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (ownerError) throw ownerError;
  if (ownerPermission?.role === 'owner' && ownerPermission?.is_active !== false) {
    return true;
  }

  const { data, error } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access')
    .eq('user_id', userId)
    .eq('module_key', 'supports')
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.can_access);
}

async function getSupportCase(adminClient: ReturnType<typeof createClient>, supportCaseId: string) {
  const { data, error } = await adminClient
    .from('support_cases')
    .select(`
      id,
      folio,
      customer_name,
      customer_email,
      customer_phone,
      performed_by,
      support_type,
      status,
      manufacturer,
      printer_model,
      part_number,
      serial_number,
      sale_date,
      warranty_end_date,
      programming_business_days,
      issue_summary,
      repair_request_note,
      repair_approval_status,
      repair_approval_requested_at,
      repair_approval_deadline,
      repair_approval_pin,
      repair_quote_pdf_path,
      repair_quote_pdf_name,
      created_at
    `)
    .eq('id', supportCaseId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'No se encontró el soporte.');
  }

  return data;
}

async function getSupportEvent(adminClient: ReturnType<typeof createClient>, supportEventId: string, supportCaseId: string) {
  const { data, error } = await adminClient
    .from('support_events')
    .select(`
      id,
      support_case_id,
      event_type,
      title,
      event_note,
      event_date,
      status_email_sent_at,
      shipping_carrier,
      tracking_number,
      support_event_types (
        name,
        description
      )
    `)
    .eq('id', supportEventId)
    .eq('support_case_id', supportCaseId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'No se encontró el movimiento.');
  }

  if (data.status_email_sent_at) {
    throw new Error('El correo de este movimiento ya fue enviado.');
  }

  return data;
}

async function getMailerSettings(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from('support_mailer_settings')
    .select(`
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_username,
      smtp_password,
      sender_email,
      sender_name,
      reply_to_email,
      subject_template,
      text_template,
      html_template
    `)
    .eq('is_active', true)
    .eq('provider', 'hostinger')
    .single();

  if (error || !data) {
    throw new Error('No se encontró la configuración del correo saliente.');
  }

  return data;
}

async function markSupportEventEmailResult(
  adminClient: ReturnType<typeof createClient>,
  {
    supportEventId,
    callerId,
    callerEmail,
    errorMessage,
  }: {
    supportEventId: string;
    callerId: string;
    callerEmail: string;
    errorMessage: string | null;
  },
) {
  const now = new Date().toISOString();
  const update = {
    status_email_last_attempt_at: now,
    status_email_sent_by: callerId,
    status_email_sent_by_email: callerEmail,
    status_email_last_error: errorMessage,
  };

  if (!errorMessage) {
    Object.assign(update, {
      status_email_sent_at: now,
    });
  }

  const { error } = await adminClient
    .from('support_events')
    .update(update)
    .eq('id', supportEventId);

  if (error) {
    throw error;
  }
}

function buildSupportEmailContent({
  mailerSettings,
  supportCase,
  event,
  supabaseUrl,
}: {
  mailerSettings: {
    subject_template?: string | null;
    text_template?: string | null;
    html_template?: string | null;
  };
  supportCase: {
    folio: string;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    performed_by: string;
    support_type: 'technical' | 'programming';
    status: 'open' | 'closed' | 'pending';
    manufacturer: string;
    printer_model: string;
    part_number: string | null;
    serial_number: string;
    sale_date: string | null;
    warranty_end_date: string | null;
    programming_business_days: number | null;
    issue_summary: string;
    repair_request_note: string | null;
    repair_approval_status: 'pending' | 'accepted' | 'declined' | null;
    repair_approval_requested_at: string | null;
    repair_approval_deadline: string | null;
    repair_approval_pin: string | null;
    repair_quote_pdf_path: string | null;
    repair_quote_pdf_name: string | null;
    created_at: string;
  };
  event: {
    event_type: string;
    title: string;
    event_note: string | null;
    event_date: string;
    status_email_sent_at?: string | null;
    shipping_carrier: string | null;
    tracking_number: string | null;
    support_event_types?: {
      name: string;
      description: string | null;
    } | null;
  };
  supabaseUrl: string;
}) {
  const eventDescription = buildEventDescription(event, supportCase);
  const isQuoteRequestEvent =
    event.event_type === 'diagnosis' &&
    Boolean(supportCase.repair_quote_pdf_path) &&
    supportCase.repair_approval_requested_at === event.event_date;
  const quoteUrl = supportCase.repair_quote_pdf_path
    ? `${supabaseUrl}/storage/v1/object/public/support-images/${encodePath(supportCase.repair_quote_pdf_path)}`
    : null;
  const eventLabel = event.title || eventTypeLabel(event.event_type);
  const details: string[] = [
    `Folio: ${supportCase.folio}`,
    `Tipo de soporte: ${supportTypeLabel(supportCase.support_type)}`,
    `Cambio de estatus: ${eventLabel}`,
    `Estado actual: ${supportCaseStatusLabel(supportCase.status)}`,
    `Fecha: ${formatDate(event.event_date)}`,
    `Hora: ${formatTime(event.event_date)}`,
    `Fabricante: ${supportCase.manufacturer}`,
    `Modelo: ${supportCase.printer_model}`,
    `Número de parte: ${supportCase.part_number ?? 'Sin dato'}`,
    `Número de serie: ${supportCase.serial_number}`,
  ];

  if (eventDescription) {
    details.splice(4, 0, `Descripción: ${eventDescription}`);
  }

  if (event.shipping_carrier && event.tracking_number) {
    details.push(`Envío: ${event.shipping_carrier} | Guía: ${event.tracking_number}`);
  }

  if (isQuoteRequestEvent) {
    if (supportCase.repair_request_note) {
      details.push(`Diagnóstico: ${supportCase.repair_request_note}`);
    }
    if (supportCase.repair_quote_pdf_name && quoteUrl) {
      details.push(`Cotización: ${supportCase.repair_quote_pdf_name}`);
      details.push(`Enlace de cotización: ${quoteUrl}`);
    }
    if (supportCase.repair_approval_pin) {
      details.push(`PIN de autorización: ${supportCase.repair_approval_pin}`);
    }
    if (supportCase.repair_approval_deadline) {
      details.push(`Límite de respuesta: ${formatDateTime(supportCase.repair_approval_deadline)}`);
    }
  }

  const defaultSubject = `Actualización de soporte ${supportCase.folio}: ${eventLabel}`;
  const defaultText = [
    `Hola ${supportCase.customer_name},`,
    '',
    'Te compartimos una actualización de tu soporte:',
    '',
    ...details.map((line) => `- ${line}`),
    '',
    'Si necesitas más información, responde a este correo o ponte en contacto con Soportes Tectronic.',
  ].join('\n');

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; color: #24313f; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Actualización de soporte</h2>
      <p>Hola <strong>${escapeHtml(supportCase.customer_name)}</strong>,</p>
      <p>Te compartimos una actualización de tu soporte.</p>
      <ul>
        ${details.map((line) => `<li>${formatDetailAsHtml(line)}</li>`).join('')}
      </ul>
      <p>Si necesitas más información, responde a este correo o ponte en contacto con Soportes Tectronic.</p>
    </div>
  `;

  const context = buildEmailTemplateContext({
    customerName: supportCase.customer_name,
    details,
    eventDate: event.event_date,
    eventDescription,
    eventLabel,
    folio: supportCase.folio,
    issueSummary: supportCase.issue_summary,
    quoteUrl,
    statusLabel: supportCaseStatusLabel(supportCase.status),
  });

  return {
    subject: applyTemplate(mailerSettings.subject_template, context, defaultSubject),
    text: applyTemplate(mailerSettings.text_template, context, defaultText),
    html: applyTemplate(mailerSettings.html_template, context, defaultHtml),
  };
}

function buildEventDescription(
  event: {
    event_type: string;
    title: string;
    event_note: string | null;
    event_date: string;
    support_event_types?: {
      name: string;
      description: string | null;
    } | null;
  },
  supportCase: {
    repair_request_note: string | null;
    repair_quote_pdf_path: string | null;
    repair_approval_requested_at?: string | null;
  },
) {
  const eventNote = sanitizeMovementDescription(event.event_note);
  if (eventNote) return eventNote;

  const isQuoteRequestEvent =
    event.event_type === 'diagnosis' &&
    Boolean(supportCase.repair_quote_pdf_path) &&
    supportCase.repair_approval_requested_at === event.event_date;

  if (isQuoteRequestEvent) {
    return supportCase.repair_request_note
      ? `Envío de cotización. ${supportCase.repair_request_note}`
      : null;
  }

  if (event.event_type === 'diagnosis' && supportCase.repair_request_note) {
    return supportCase.repair_request_note;
  }

  return null;
}

function sanitizeMovementDescription(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    normalized === 'cotizacion' ||
    normalized === 'envio de cotizacion' ||
    normalized === 'envio de cotizacion cotizacion'
  ) {
    return null;
  }

  return trimmed;
}

function supportTypeLabel(supportType: 'technical' | 'programming') {
  return supportType === 'technical' ? 'Técnico' : 'Programación';
}

function eventTypeLabel(eventType: string) {
  if (eventType === 'ticket_created') return 'Creación de ticket';
  if (eventType === 'remote_support_scheduled') return 'Agendar soporte remoto';
  if (eventType === 'diagnosis') return 'Diagnóstico';
  if (eventType === 'repair') return 'Reparación';
  if (eventType === 'closed') return 'Cierre de soporte';
  return 'Nota';
}

function supportCaseStatusLabel(status: 'open' | 'closed' | 'pending') {
  if (status === 'closed') return 'Cerrado';
  if (status === 'pending') return 'Pendiente';
  return 'Abierto';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeZone: 'America/Mexico_City',
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(value));
}

function encodePath(path: string) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildEmailTemplateContext({
  customerName,
  details,
  eventDate,
  eventDescription,
  eventLabel,
  folio,
  issueSummary,
  quoteUrl,
  statusLabel,
}: {
  customerName: string;
  details: string[];
  eventDate: string;
  eventDescription: string | null;
  eventLabel: string;
  folio: string;
  issueSummary: string;
  quoteUrl: string | null;
  statusLabel: string;
}) {
  return {
    customer_name: customerName,
    folio,
    event_label: eventLabel,
    current_status: statusLabel,
    event_description: eventDescription ?? '',
    issue_summary: issueSummary,
    event_date: formatDate(eventDate),
    event_time: formatTime(eventDate),
    quote_url: quoteUrl ?? '',
    details_text: details.map((line) => `- ${line}`).join('\n'),
    details_html: `<ul>${details.map((line) => `<li>${formatDetailAsHtml(line)}</li>`).join('')}</ul>`,
  };
}

function applyTemplate(
  template: string | null | undefined,
  context: Record<string, string>,
  fallback: string,
) {
  const source = template && template.trim() ? template : fallback;
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => context[key] ?? '');
}

function formatDetailAsHtml(line: string) {
  const [label, ...rest] = line.split(':');
  if (rest.length === 0) {
    return escapeHtml(line);
  }

  const normalizedLabel = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  const value = rest.join(':').trim();
  const shouldHighlight =
    normalizedLabel === 'descripcion' ||
    normalizedLabel === 'cambio de estatus' ||
    normalizedLabel === 'estado actual';

  const highlightedValue = shouldHighlight
    ? `<span style="color:#1f7a36; text-decoration: underline; text-underline-offset: 2px;">${escapeHtml(value)}</span>`
    : escapeHtml(value);

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return `<strong>${escapeHtml(label)}:</strong> <a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
  }

  return `<strong>${escapeHtml(label)}:</strong> ${highlightedValue}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function resolveSupportNotificationBcc(callerEmail: string) {
  const normalizedEmail = callerEmail.trim().toLowerCase();
  if (normalizedEmail === 'joeltrincadov@gmail.com') {
    return 'joetectronic@gmail.com';
  }
  return callerEmail;
}
