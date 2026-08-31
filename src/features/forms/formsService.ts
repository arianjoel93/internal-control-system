import { supabase } from '../../lib/supabase';
import type {
  AdminVisibilityScope,
  CustomFormRow,
  FormNotificationRow,
  FormQuestionRow,
  FormQuestionType,
  FormResponseRow,
  FormStatus,
  FormTheme,
} from '../../lib/types';

export const REQUIREMENT_FORM_SLUG = 'levantamiento-requerimiento-desarrollo';
export const REQUIREMENT_FORM_TITLE = 'Levantamiento de requerimiento para desarrollo';
export const FORM_ATTACHMENTS_BUCKET = 'form-attachments';

export type RequirementAttachment = {
  name: string;
  size: number;
  type: string;
  path: string;
  uploaded_at: string;
};

export type FormQuestionDraft = {
  label: string;
  help_text: string;
  question_type: FormQuestionType;
  is_required: boolean;
  options: string[];
  placeholder: string;
  sort_order: number;
};

export type FormDetails = CustomFormRow & {
  questions: FormQuestionRow[];
};

export type FormResponseCount = {
  form_id: string;
  count: number;
  latest_submitted_at: string | null;
};

export type FormDraft = {
  title: string;
  description: string;
  status: FormStatus;
  theme: FormTheme;
  submit_label: string;
  thank_you_title: string;
  thank_you_message: string;
};

export const formThemes: Array<{ value: FormTheme; label: string; description: string }> = [
  { value: 'terracotta', label: 'Terracota', description: 'Cálido, humano y ejecutivo.' },
  { value: 'ocean', label: 'Océano', description: 'Azules suaves para formularios corporativos.' },
  { value: 'forest', label: 'Bosque', description: 'Verdes neutros para confianza y servicio.' },
  { value: 'sand', label: 'Arena', description: 'Minimalista, claro y editorial.' },
  { value: 'graphite', label: 'Grafito', description: 'Sobrio, técnico y de alto contraste.' },
];

export const questionTypeOptions: Array<{ value: FormQuestionType; label: string }> = [
  { value: 'short_text', label: 'Texto corto' },
  { value: 'long_text', label: 'Texto largo' },
  { value: 'single_choice', label: 'Selección única' },
  { value: 'multiple_choice', label: 'Selección múltiple' },
  { value: 'dropdown', label: 'Lista desplegable' },
  { value: 'rating', label: 'Calificación' },
];

export async function getForms(ownerUserId: string, visibilityScope: AdminVisibilityScope) {
  let query = supabase.from('forms').select('*').order('updated_at', { ascending: false });

  if (visibilityScope === 'own') {
    query = query.eq('owner_user_id', ownerUserId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as CustomFormRow[];
}

export async function getOrCreateRequirementForm(ownerUserId: string) {
  const existing = await getRequirementFormBySlug(REQUIREMENT_FORM_SLUG);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('forms')
    .insert({
      owner_user_id: ownerUserId,
      title: REQUIREMENT_FORM_TITLE,
      description:
        'Formulario técnico por pasos para levantar proyectos de programación, TSPL, impresión, pesaje, CSV, reportes y trazabilidad.',
      slug: REQUIREMENT_FORM_SLUG,
      status: 'published',
      theme: 'graphite',
      submit_label: 'Finalizar levantamiento',
      thank_you_title: 'Levantamiento recibido',
      thank_you_message:
        'Gracias. La información quedó registrada y el equipo técnico podrá revisar el alcance del desarrollo.',
      settings: {
        form_kind: 'programming_requirement',
        single_form: true,
      },
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as CustomFormRow;
}

export async function getRequirementFormBySlug(slug = REQUIREMENT_FORM_SLUG) {
  const { data, error } = await supabase.from('forms').select('*').eq('slug', slug).maybeSingle();

  if (error) throw error;
  return (data ?? null) as CustomFormRow | null;
}

export async function getFormResponseCounts() {
  const { data, error } = await supabase
    .from('form_responses')
    .select('form_id, submitted_at')
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  const counts = new Map<string, FormResponseCount>();
  for (const response of (data ?? []) as Array<Pick<FormResponseRow, 'form_id' | 'submitted_at'>>) {
    const current = counts.get(response.form_id);
    if (!current) {
      counts.set(response.form_id, {
        form_id: response.form_id,
        count: 1,
        latest_submitted_at: response.submitted_at,
      });
      continue;
    }
    current.count += 1;
    if (!current.latest_submitted_at || response.submitted_at > current.latest_submitted_at) {
      current.latest_submitted_at = response.submitted_at;
    }
  }

  return Array.from(counts.values());
}

export async function getFormQuestions(formId: string) {
  const { data, error } = await supabase
    .from('form_questions')
    .select('*')
    .eq('form_id', formId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return normalizeQuestions(data ?? []);
}

export async function getFormResponses(formId: string) {
  const { data, error } = await supabase
    .from('form_responses')
    .select('*')
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as FormResponseRow[];
}

export async function deleteFormResponse(responseId: string) {
  const { error } = await supabase.from('form_responses').delete().eq('id', responseId);
  if (error) throw error;
}

export async function getFormNotifications() {
  const { data, error } = await supabase
    .from('form_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) throw error;
  return (data ?? []) as FormNotificationRow[];
}

export async function markFormNotificationsAsRead(ids?: string[]) {
  let query = supabase.from('form_notifications').update({ is_read: true });
  if (ids?.length) {
    query = query.in('id', ids);
  } else {
    query = query.eq('is_read', false);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function createForm(ownerUserId: string) {
  return getOrCreateRequirementForm(ownerUserId);
}

export async function updateForm(formId: string, draft: FormDraft) {
  const { data, error } = await supabase
    .from('forms')
    .update({
      title: draft.title.trim() || REQUIREMENT_FORM_TITLE,
      description: draft.description.trim(),
      status: draft.status,
      theme: draft.theme,
      submit_label: draft.submit_label.trim() || 'Finalizar levantamiento',
      thank_you_title: draft.thank_you_title.trim() || 'Levantamiento recibido',
      thank_you_message: draft.thank_you_message.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', formId)
    .select('*')
    .single();

  if (error) throw error;
  return data as CustomFormRow;
}

export async function deleteForm(formId: string) {
  const { error } = await supabase.from('forms').delete().eq('id', formId);
  if (error) throw error;
}

export async function createQuestion(formId: string, sortOrder: number) {
  const { data, error } = await supabase
    .from('form_questions')
    .insert({
      form_id: formId,
      label: 'Nueva pregunta',
      help_text: '',
      question_type: 'short_text',
      is_required: false,
      options: [],
      placeholder: '',
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeQuestion(data as FormQuestionRow);
}

export async function updateQuestion(questionId: string, draft: FormQuestionDraft) {
  const options = needsOptions(draft.question_type)
    ? draft.options.map((option) => option.trim()).filter(Boolean)
    : [];

  const { data, error } = await supabase
    .from('form_questions')
    .update({
      label: draft.label.trim() || 'Pregunta sin título',
      help_text: draft.help_text.trim(),
      question_type: draft.question_type,
      is_required: draft.is_required,
      options,
      placeholder: draft.placeholder.trim(),
      sort_order: draft.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', questionId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeQuestion(data as FormQuestionRow);
}

export async function deleteQuestion(questionId: string) {
  const { error } = await supabase.from('form_questions').delete().eq('id', questionId);
  if (error) throw error;
}

export async function getPublicForm(slug: string): Promise<FormDetails | null> {
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (formError) throw formError;
  if (!form) return null;

  const questions = await getFormQuestions(form.id);
  return { ...(form as CustomFormRow), questions };
}

export async function submitFormResponse(input: {
  form_id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  answers: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from('form_responses')
    .insert({
      form_id: input.form_id,
      respondent_name: emptyToNull(input.respondent_name),
      respondent_email: emptyToNull(input.respondent_email),
      answers: input.answers,
      user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as FormResponseRow;
}

export async function uploadRequirementFiles(formId: string, fieldKey: string, files: File[]) {
  const uploaded: RequirementAttachment[] = [];
  const timestamp = Date.now();

  for (const file of files) {
    const safeName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const path = `${formId}/${fieldKey}/${timestamp}-${crypto.randomUUID()}-${safeName || 'archivo'}`;
    const { error } = await supabase.storage.from(FORM_ATTACHMENTS_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw error;
    uploaded.push({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      path,
      uploaded_at: new Date().toISOString(),
    });
  }

  return uploaded;
}

export async function getAttachmentSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(FORM_ATTACHMENTS_BUCKET).createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

export function getFormShareUrl(slug: string) {
  return `${window.location.origin}/formularios/${slug}`;
}

export function getRequirementFormShareUrl() {
  return getFormShareUrl(REQUIREMENT_FORM_SLUG);
}

export function questionToDraft(question: FormQuestionRow): FormQuestionDraft {
  return {
    label: question.label,
    help_text: question.help_text,
    question_type: question.question_type,
    is_required: question.is_required,
    options: question.options,
    placeholder: question.placeholder,
    sort_order: question.sort_order,
  };
}

export function needsOptions(type: FormQuestionType) {
  return type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown';
}

function normalizeQuestions(rows: unknown[]) {
  return rows.map((row) => normalizeQuestion(row as FormQuestionRow));
}

function normalizeQuestion(row: FormQuestionRow): FormQuestionRow {
  return {
    ...row,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
  };
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}
