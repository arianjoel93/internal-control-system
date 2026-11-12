import { supabase } from '../../lib/supabase';
import { addBusinessDaysFromDate } from '../../lib/dates';
import { MAX_SUPPORT_IMAGES, MAX_SUPPORT_PDFS, isSupportPdf, prepareSupportFiles } from '../../lib/supportImages';
import type { SupportCase, SupportCaseWithEvents, SupportCustomer, SupportEvent, SupportImage } from '../../lib/types';
import { getCurrentUserModuleAccess } from '../admin/settingsService';

const caseSelect = `
  *,
  support_events (*, support_event_types (name, description)),
  support_images (*)
`;

const publicCaseSelect = `
  id,
  folio,
  support_type,
  performed_by,
  manufacturer,
  printer_model,
  serial_number,
  sale_date,
  warranty_end_date,
  programming_business_days,
  status,
  repair_required,
  repair_request_note,
  repair_approval_status,
  repair_approval_requested_at,
  repair_approval_deadline,
  repair_decided_at,
  repair_approval_response_source,
  repair_quote_pdf_path,
  repair_quote_pdf_name,
  issue_summary,
  created_at,
  updated_at,
  support_events (*, support_event_types (name, description)),
  support_images (*)
`;

export const supportShippingCarriers = [
  'FedEx',
  'Paquete Express',
  'Tres Guerras',
  'DHL',
  'Estafeta',
  'UPS',
  'Otra paquetería',
];

export async function findPublicSupports(term: string) {
  const normalizedTerm = term.trim();
  const normalizedUpperTerm = normalizedTerm.toUpperCase();
  const search = `%${normalizedTerm}%`;

  const { data, error } = await supabase
    .from('support_cases')
    .select(publicCaseSelect)
    .or(`folio.ilike.${search},serial_number.ilike.%${normalizedUpperTerm}%`)
    .order('created_at', { ascending: false })
    .order('event_date', { referencedTable: 'support_events', ascending: false });

  if (error) throw error;
  return (data ?? []).map((supportCase) => ({
    ...supportCase,
    customer_name: '',
    customer_email: null,
    customer_phone: null,
    part_number: null,
    support_agent_id: null,
    resolution_notes: null,
    repair_approval_pin: null,
  })) as SupportCaseWithEvents[];
}

export const findSupportBySerial = findPublicSupports;

export async function adminSearchSupports(term: string) {
  const normalizedTerm = term.trim();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isDesignatedOwner = user?.email?.trim().toLowerCase() === 'joeltrincadov@gmail.com';
  if (isDesignatedOwner) {
    const { data: response, error } = await supabase.functions.invoke('admin-get-supports', {
      body: { term: normalizedTerm },
    });
    if (error) throw error;
    return (((response as { data?: SupportCaseWithEvents[] } | null)?.data ?? []) as SupportCaseWithEvents[]);
  }

  const access = await getCurrentUserModuleAccess('supports');
  if (!access.can_access && !isDesignatedOwner) return [];

  const query = supabase
    .from('support_cases')
    .select(caseSelect)
    .order('created_at', { ascending: false });

  if (!isDesignatedOwner && access.visibility_scope === 'own' && access.user_id) {
    query.eq('created_by', access.user_id);
  }

  if (!normalizedTerm) {
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as SupportCaseWithEvents[];
  }

  const search = `%${normalizedTerm}%`;
  const { data, error } = await query.or(
    `folio.ilike.${search},customer_name.ilike.${search},serial_number.ilike.${search},printer_model.ilike.${search}`,
  );

  if (error) throw error;
  return (data ?? []) as SupportCaseWithEvents[];
}

export async function createSupportCase(payload: SupportCaseFormValues) {
  const {
    event_type,
    event_type_id,
    image_files,
    ...values
  } = payload;

  const preparedFiles = await prepareSupportFiles(image_files ?? []);
  const preparedImageCount = preparedFiles.filter((file) => file.mimeType !== 'application/pdf').length;
  const preparedPdfCount = preparedFiles.filter((file) => file.mimeType === 'application/pdf').length;
  if (preparedImageCount > MAX_SUPPORT_IMAGES) {
    throw new Error('Cada soporte puede tener como máximo 4 imágenes.');
  }
  if (preparedPdfCount > MAX_SUPPORT_PDFS) {
    throw new Error('Cada soporte puede tener como máximo 4 archivos PDF.');
  }
  const isProgramming = values.support_type === 'programming';
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const publicFolio = buildPublicSupportFolio(values.customer_name, values.folio);
  await upsertSupportCustomer({
    full_name: values.customer_name,
    email: values.customer_email,
    phone: values.customer_phone,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });
  const caseInsert = {
    folio: publicFolio,
    support_type: values.support_type,
    support_agent_id: values.support_agent_id || null,
    customer_name: values.customer_name.trim(),
    customer_email: values.customer_email.trim() || null,
    customer_phone: values.customer_phone.trim() || null,
    performed_by: values.performed_by.trim(),
    manufacturer: values.manufacturer.trim(),
    printer_model: values.printer_model.trim(),
    part_number: values.part_number.trim() || null,
    serial_number: values.serial_number.trim().toUpperCase(),
    sale_date: isProgramming ? null : values.sale_date || null,
    warranty_end_date: isProgramming ? null : values.warranty_end_date || null,
    programming_business_days: isProgramming ? Number(values.programming_business_days) : null,
    status: values.status,
    issue_summary: values.issue_summary.trim(),
    resolution_notes: null,
    repair_required: false,
    repair_request_note: null,
    repair_approval_status: null,
    repair_approval_requested_at: null,
    repair_approval_deadline: null,
    repair_decided_at: null,
    repair_approval_response_source: null,
    repair_approval_pin: null,
    repair_quote_pdf_path: null,
    repair_quote_pdf_name: null,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  };

  const { data: createdCase, error: caseError } = await supabase
    .from('support_cases')
    .insert(caseInsert)
    .select()
    .single();

  if (caseError) throw caseError;

  const eventPayload: Omit<SupportEvent, 'id' | 'created_at'> = {
    support_case_id: createdCase.id,
    event_type,
    support_event_type_id: event_type_id || null,
    title: values.event_title,
    event_note: null,
    event_date: new Date().toISOString(),
    status_email_last_attempt_at: null,
    status_email_sent_at: null,
    status_email_sent_by: null,
    status_email_sent_by_email: null,
    status_email_last_error: null,
    ticket_reference: createdCase.folio,
    shipping_carrier: values.tracking_number.trim() ? values.shipping_carrier : null,
    tracking_number: values.tracking_number.trim() || null,
  };

  const { error: eventError } = await supabase.from('support_events').insert(eventPayload);
  if (eventError) throw eventError;

  if (preparedFiles.length > 0) {
    await uploadPreparedSupportFiles(createdCase.id, preparedFiles, {
      currentImageCount: 0,
      currentPdfCount: 0,
    });
  }

  return createdCase;
}

export async function addSupportMovement(payload: SupportMovementFormValues) {
  const eventDate = new Date().toISOString();
  const eventPayload: Omit<SupportEvent, 'id' | 'created_at'> = {
    support_case_id: payload.support_case_id,
    event_type: payload.event_type,
    support_event_type_id: payload.event_type_id || null,
    title: payload.event_title,
    event_note: buildSupportMovementEventNote(payload),
    event_date: eventDate,
    status_email_last_attempt_at: null,
    status_email_sent_at: null,
    status_email_sent_by: null,
    status_email_sent_by_email: null,
    status_email_last_error: null,
    ticket_reference: payload.folio,
    shipping_carrier: payload.shipping_carrier || null,
    tracking_number: payload.tracking_number.trim() || null,
  };

  const { error: eventError } = await supabase.from('support_events').insert(eventPayload);
  if (eventError) throw eventError;

  const caseUpdate: Partial<Omit<SupportCase, 'id' | 'created_at' | 'updated_at'>> = {
    status: payload.status,
  };

  let uploadedQuote:
    | {
        storagePath: string;
        originalName: string;
      }
    | null = null;

  try {
    if (payload.is_diagnosis) {
      caseUpdate.repair_request_note = payload.repair_request_note.trim() || null;

      if (payload.requires_repair) {
        const deadline = addBusinessDaysFromDate(eventDate, 7).toISOString();
        const currentQuotePath = payload.current_repair_quote_pdf_path ?? null;
        const currentQuoteName = payload.current_repair_quote_pdf_name ?? null;
        uploadedQuote = payload.repair_quote_pdf_file
          ? await uploadRepairQuotePdf(payload.support_case_id, payload.repair_quote_pdf_file)
          : null;
        const nextQuotePath = uploadedQuote?.storagePath ?? currentQuotePath;
        const nextQuoteName = uploadedQuote?.originalName ?? currentQuoteName;

        if (!nextQuotePath) {
          throw new Error('Carga una cotización en PDF o reutiliza la que ya tiene el folio.');
        }

        caseUpdate.repair_required = true;
        caseUpdate.repair_approval_status = 'pending';
        caseUpdate.repair_approval_requested_at = eventDate;
        caseUpdate.repair_approval_deadline = deadline;
        caseUpdate.repair_decided_at = null;
        caseUpdate.repair_approval_response_source = null;
        caseUpdate.repair_approval_pin = generateRepairApprovalPin();
        caseUpdate.repair_quote_pdf_path = nextQuotePath;
        caseUpdate.repair_quote_pdf_name = nextQuoteName;
      } else {
        caseUpdate.repair_required = false;
        caseUpdate.repair_approval_status = null;
        caseUpdate.repair_approval_requested_at = null;
        caseUpdate.repair_approval_deadline = null;
        caseUpdate.repair_decided_at = null;
        caseUpdate.repair_approval_response_source = null;
        caseUpdate.repair_approval_pin = null;
        caseUpdate.repair_quote_pdf_path = null;
        caseUpdate.repair_quote_pdf_name = null;
      }
    }

    const { error: caseError } = await supabase
      .from('support_cases')
      .update(caseUpdate)
      .eq('id', payload.support_case_id);

    if (caseError) throw caseError;
  } catch (error) {
    if (uploadedQuote) {
      await safeRemoveSupportStoragePath(uploadedQuote.storagePath);
    }
    throw error;
  }

  const nextQuotePath = caseUpdate.repair_quote_pdf_path ?? null;
  const shouldRemovePreviousQuote =
    Boolean(uploadedQuote) &&
    payload.current_repair_quote_pdf_path &&
    payload.current_repair_quote_pdf_path !== nextQuotePath &&
    payload.is_diagnosis;

  if (shouldRemovePreviousQuote && payload.current_repair_quote_pdf_path) {
    await safeRemoveSupportStoragePath(payload.current_repair_quote_pdf_path);
  }
}

export async function respondToRepairApproval(supportCaseId: string, pin: string, decision: RepairApprovalDecision) {
  const { data, error } = await supabase.rpc('respond_to_repair_approval', {
    p_support_case_id: supportCaseId,
    p_pin: pin.trim(),
    p_decision: decision,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function addSupportImages(supportCaseId: string, files: File[], currentFiles: SupportImage[] = []) {
  const currentImageCount = currentFiles.filter((file) => !isSupportPdf(file)).length;
  const currentPdfCount = currentFiles.filter(isSupportPdf).length;
  const incomingPdfCount = files.filter((file) => file.type === 'application/pdf').length;
  const incomingImageCount = files.length - incomingPdfCount;

  if (incomingImageCount + currentImageCount > MAX_SUPPORT_IMAGES) {
    throw new Error('Cada soporte puede tener como máximo 4 imágenes.');
  }
  if (incomingPdfCount + currentPdfCount > MAX_SUPPORT_PDFS) {
    throw new Error('Cada soporte puede tener como máximo 4 archivos PDF.');
  }

  const preparedFiles = await prepareSupportFiles(files);
  await uploadPreparedSupportFiles(supportCaseId, preparedFiles, {
    currentImageCount,
    currentPdfCount,
  });
}

export async function searchSupportCustomers(term: string) {
  const normalizedTerm = term.trim();
  if (normalizedTerm.length < 2) return [];

  const access = await getCurrentUserModuleAccess('supports');
  if (!access.can_access) return [];

  const { data, error } = await supabase
    .from('support_customers')
    .select('id, full_name, email, phone, last_used_at')
    .ilike('full_name', `%${normalizedTerm}%`)
    .order('last_used_at', { ascending: false })
    .limit(8);

  if (error) throw error;
  return (data ?? []) as Array<Pick<SupportCustomer, 'id' | 'full_name' | 'email' | 'phone' | 'last_used_at'>>;
}

export async function updateSupportCustomerEmail({
  supportCaseId,
  customerName,
  customerPhone,
  email,
}: {
  supportCaseId: string;
  customerName: string;
  customerPhone: string | null;
  email: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Indica el correo del cliente.');
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalizedEmail)) {
    throw new Error('Escribe un correo válido.');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: caseError } = await supabase
    .from('support_cases')
    .update({ customer_email: normalizedEmail })
    .eq('id', supportCaseId);

  if (caseError) throw caseError;

  await upsertSupportCustomer({
    full_name: customerName,
    email: normalizedEmail,
    phone: customerPhone ?? '',
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });

  return normalizedEmail;
}

export async function sendSupportStatusEmail(payload: {
  supportCaseId: string;
  supportEventId: string;
}) {
  try {
    const { data, error } = await supabase.functions.invoke('send-support-status-email', {
      body: {
        support_case_id: payload.supportCaseId,
        support_event_id: payload.supportEventId,
      },
    });

    if (error) throw error;
    return data as { message: string };
  } catch (error) {
    if (error instanceof Error && 'context' in error) {
      const context = (error as { context?: Response }).context;
      if (context) {
        let parsedMessage: string | null = null;
        try {
          const body = await context.json();
          parsedMessage =
            typeof body?.error === 'string'
              ? body.error
              : typeof body?.message === 'string'
                ? body.message
                : null;
        } catch {
          // Keep the original error when the function response body cannot be parsed.
        }
        if (parsedMessage) {
          throw new Error(parsedMessage);
        }
      }
    }

    throw error;
  }
}

export async function updateSupportEventDescription(payload: {
  supportEventId: string;
  description: string;
}) {
  const description = payload.description.trim();
  if (!description) {
    throw new Error('Escribe la descripción del movimiento.');
  }

  const { error } = await supabase
    .from('support_events')
    .update({ event_note: description })
    .eq('id', payload.supportEventId);

  if (error) throw error;
}

export async function deleteSupportEvent(payload: {
  supportCase: SupportCaseWithEvents;
  supportEvent: SupportEvent;
}) {
  const isCurrentRepairRequest =
    payload.supportEvent.event_type === 'diagnosis' &&
    payload.supportCase.repair_approval_requested_at === payload.supportEvent.event_date;

  const { data, error } = await supabase.rpc('delete_support_event', {
    p_support_event_id: payload.supportEvent.id,
  });

  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (
    isCurrentRepairRequest &&
    payload.supportCase.repair_quote_pdf_path &&
    result?.removed_repair_request
  ) {
    await safeRemoveSupportStoragePath(payload.supportCase.repair_quote_pdf_path);
  }

  return result as
    | {
        support_case_id: string;
        removed_repair_request: boolean;
      }
    | null;
}

export async function deleteSupportImage(image: SupportImage) {
  const { error: storageError } = await supabase.storage.from('support-images').remove([image.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase.from('support_images').delete().eq('id', image.id);
  if (error) throw error;
}

async function uploadPreparedSupportFiles(
  supportCaseId: string,
  preparedFiles: Awaited<ReturnType<typeof prepareSupportFiles>>,
  counts: { currentImageCount: number; currentPdfCount: number },
) {
  let imageIndex = counts.currentImageCount;
  let pdfIndex = counts.currentPdfCount;

  for (const [index, file] of preparedFiles.entries()) {
    const storagePath = `${supportCaseId}/${Date.now()}-${index}-${file.fileName}`;

    const { error: uploadError } = await supabase.storage.from('support-images').upload(storagePath, file.blob, {
      contentType: file.mimeType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const isPdf = file.mimeType === 'application/pdf';
    const imagePayload: Omit<SupportImage, 'id' | 'created_at'> = {
      support_case_id: supportCaseId,
      bucket_id: 'support-images',
      storage_path: storagePath,
      original_name: file.originalName,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      sort_order: isPdf ? pdfIndex : imageIndex,
    };

    const { error: imageError } = await supabase.from('support_images').insert(imagePayload);
    if (imageError) throw imageError;

    if (isPdf) {
      pdfIndex += 1;
    } else {
      imageIndex += 1;
    }
  }
}

async function uploadRepairQuotePdf(supportCaseId: string, file: File) {
  if (file.type !== 'application/pdf') {
    throw new Error('La cotización debe ser un archivo PDF.');
  }

  const [preparedFile] = await prepareSupportFiles([file]);
  if (!preparedFile || preparedFile.mimeType !== 'application/pdf') {
    throw new Error('La cotización debe ser un archivo PDF.');
  }

  const storagePath = `${supportCaseId}/repair-quote-${Date.now()}-${preparedFile.fileName}`;
  const { error } = await supabase.storage.from('support-images').upload(storagePath, preparedFile.blob, {
    contentType: preparedFile.mimeType,
    upsert: false,
  });

  if (error) throw error;

  return {
    storagePath,
    originalName: preparedFile.originalName,
  };
}

async function safeRemoveSupportStoragePath(storagePath: string) {
  const { error } = await supabase.storage.from('support-images').remove([storagePath]);
  if (error) {
    console.warn('No se pudo eliminar un archivo anterior del soporte.', error);
  }
}

export type SupportCaseFormValues = {
  folio: string;
  support_type: SupportCase['support_type'];
  support_agent_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  performed_by: string;
  manufacturer: string;
  printer_model: string;
  part_number: string;
  serial_number: string;
  sale_date: string;
  warranty_end_date: string;
  programming_business_days: string;
  status: 'open' | 'closed' | 'pending';
  issue_summary: string;
  event_type: SupportEvent['event_type'];
  event_type_id: string;
  event_title: string;
  shipping_carrier: string;
  tracking_number: string;
  image_files?: File[];
};

export type SupportMovementFormValues = {
  support_case_id: string;
  folio: string;
  event_type: SupportEvent['event_type'];
  event_type_id: string;
  event_title: string;
  status: SupportCase['status'];
  is_diagnosis: boolean;
  requires_repair: boolean;
  repair_request_note: string;
  repair_quote_pdf_file?: File | null;
  current_repair_quote_pdf_path: string | null;
  current_repair_quote_pdf_name: string | null;
  shipping_carrier: string;
  tracking_number: string;
};

export type RepairApprovalDecision = 'accepted' | 'declined';

function buildPublicSupportFolio(customerName: string, internalFolio: string) {
  const initial = normalizeFolioPart(customerName.trim().charAt(0).toUpperCase() || 'X');
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  const hours = padDatePart(now.getHours());
  const minutes = padDatePart(now.getMinutes());
  const seconds = padDatePart(now.getSeconds());
  const folio = normalizeFolioPart(internalFolio.trim()) || 'SIN-FOLIO';

  return `${initial}-${year}${month}${day}-${hours}${minutes}${seconds}-${folio}`;
}

function generateRepairApprovalPin() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

async function upsertSupportCustomer({
  full_name,
  email,
  phone,
  created_by,
  created_by_email,
}: {
  full_name: string;
  email: string;
  phone: string;
  created_by: string | null;
  created_by_email: string | null;
}) {
  const name = full_name.trim();
  if (!name) return;

  const payload = {
    full_name: name,
    email: email.trim() || null,
    phone: phone.trim() || null,
    last_used_at: new Date().toISOString(),
    created_by,
    created_by_email,
  };

  const { error } = await supabase
    .from('support_customers')
    .upsert(payload, { onConflict: 'full_name_normalized' });

  if (error) throw error;
}

function buildSupportMovementEventNote(payload: SupportMovementFormValues) {
  if (!payload.is_diagnosis) return null;

  const description = payload.repair_request_note.trim();
  if (
    payload.requires_repair &&
    (payload.repair_quote_pdf_file || payload.current_repair_quote_pdf_path)
  ) {
    return description ? `Envío de cotización. ${description}` : null;
  }

  return description || null;
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeFolioPart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '')
    .toUpperCase();
}
