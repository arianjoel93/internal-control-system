import { supabase } from '../../lib/supabase';
import type { PolicyClient, PolicyClientWithServices, PolicyHours, PolicyService } from '../../lib/types';
import { getCurrentUserModuleAccess } from './settingsService';

export const policyHourOptions: PolicyHours[] = [10, 20, 30, 40, 50];
export const policyServiceTypes: PolicyService['service_type'][] = [
  'Programación',
  'Soporte Remoto',
  'Soporte Tectronic',
  'Instalación',
  'Software',
  'Mantenimiento',
];

export type PolicyClientDraft = {
  full_name: string;
  curp: string;
  business_name: string;
  address: string;
  policy_hours: string;
  add_hours: string;
  rfc: string;
  notes: string;
};

export type PolicyServiceDraft = {
  client_id: string;
  service_type: PolicyService['service_type'];
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  notes: string;
};

export type PolicyServiceResult = {
  client: PolicyClientWithServices;
  service: PolicyService;
  remainingHours: number;
};

const emptyServices: PolicyService[] = [];

export async function getPolicyClients(term = '') {
  const access = await getCurrentUserModuleAccess('policies');
  if (!access.can_access) return [];

  const query = supabase
    .from('policy_clients')
    .select('*, policy_services (*)')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (access.visibility_scope === 'own' && access.user_id) {
    query.eq('created_by', access.user_id);
  }

  const normalizedTerm = term.trim();
  if (normalizedTerm) {
    const search = `%${normalizedTerm}%`;
    query.or(`full_name.ilike.${search},curp.ilike.${search},business_name.ilike.${search},rfc.ilike.${search}`);
  }

  const { data, error } = await query;
  if (error) throw normalizePolicyError(error);

  return (data ?? []).map(sortClientServices) as PolicyClientWithServices[];
}

export async function getArchivedPolicyClients() {
  const access = await getCurrentUserModuleAccess('policies');
  if (!access.can_access) return [];

  const query = supabase
    .from('policy_clients')
    .select('*, policy_services (*)')
    .eq('is_active', false)
    .not('archived_at', 'is', null)
    .gte('archived_until', new Date().toISOString())
    .order('archived_at', { ascending: false });

  if (access.visibility_scope === 'own' && access.user_id) {
    query.eq('created_by', access.user_id);
  }

  const { data, error } = await query;
  if (error) throw normalizePolicyError(error);
  return (data ?? []).map(sortClientServices) as PolicyClientWithServices[];
}

export async function createPolicyClient(payload: PolicyClientDraft) {
  const parsedHours = Number(payload.policy_hours);
  if (!policyHourOptions.includes(parsedHours as PolicyHours)) {
    throw new Error('Selecciona un tipo de póliza válido.');
  }

  const requiredValues = [payload.full_name, payload.curp, payload.business_name, payload.address];
  if (requiredValues.some((value) => !value.trim())) {
    throw new Error('Completa todos los campos obligatorios del cliente.');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('policy_clients')
    .insert({
      full_name: payload.full_name.trim(),
      curp: payload.curp.trim().toUpperCase(),
      business_name: payload.business_name.trim(),
      address: payload.address.trim(),
      policy_hours: parsedHours as PolicyHours,
      additional_hours: 0,
      rfc: payload.rfc.trim().toUpperCase() || null,
      notes: payload.notes.trim() || null,
      is_active: true,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    })
    .select()
    .single();

  if (error) throw normalizePolicyError(error);
  return data as PolicyClient;
}

export async function updatePolicyClient(payload: PolicyClientDraft & { id: string; current_additional_hours: number }) {
  const parsedHours = Number(payload.policy_hours);
  const additionalPackage = Number(payload.add_hours || 0);
  if (!policyHourOptions.includes(parsedHours as PolicyHours)) {
    throw new Error('Selecciona un tipo de póliza válido.');
  }
  if (![0, ...policyHourOptions].includes(additionalPackage as PolicyHours | 0)) {
    throw new Error('Selecciona un paquete de horas válido.');
  }

  const requiredValues = [payload.full_name, payload.curp, payload.business_name, payload.address];
  if (requiredValues.some((value) => !value.trim())) {
    throw new Error('Completa todos los campos obligatorios del cliente.');
  }

  const { data, error } = await supabase
    .from('policy_clients')
    .update({
      full_name: payload.full_name.trim(),
      curp: payload.curp.trim().toUpperCase(),
      business_name: payload.business_name.trim(),
      address: payload.address.trim(),
      policy_hours: parsedHours as PolicyHours,
      additional_hours: Number(payload.current_additional_hours || 0) + additionalPackage,
      rfc: payload.rfc.trim().toUpperCase() || null,
      notes: payload.notes.trim() || null,
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw normalizePolicyError(error);
  return data as PolicyClient;
}

export async function addPolicyClientHours(client: PolicyClientWithServices, hours: string) {
  const additionalPackage = Number(hours || 0);
  if (!policyHourOptions.includes(additionalPackage as PolicyHours)) {
    throw new Error('Selecciona un paquete de horas válido.');
  }

  const { data, error } = await supabase
    .from('policy_clients')
    .update({
      additional_hours: Number(client.additional_hours ?? 0) + additionalPackage,
    })
    .eq('id', client.id)
    .select()
    .single();

  if (error) throw normalizePolicyError(error);
  return data as PolicyClient;
}

export async function archivePolicyClient(client: PolicyClientWithServices) {
  const now = new Date();
  const archivedUntil = new Date(now);
  archivedUntil.setDate(archivedUntil.getDate() + 30);

  const { error } = await supabase
    .from('policy_clients')
    .update({
      is_active: false,
      archived_at: now.toISOString(),
      archived_until: archivedUntil.toISOString(),
    })
    .eq('id', client.id);

  if (error) throw normalizePolicyError(error);
}

export async function restorePolicyClient(id: string) {
  const { error } = await supabase
    .from('policy_clients')
    .update({
      is_active: true,
      archived_at: null,
      archived_until: null,
    })
    .eq('id', id);

  if (error) throw normalizePolicyError(error);
}

export async function createPolicyService(payload: PolicyServiceDraft): Promise<PolicyServiceResult> {
  const { client, startAt, endAt, durationHours } = await validatePolicyServiceDraft(payload);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('policy_services')
    .insert({
      client_id: payload.client_id,
      service_type: payload.service_type,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      duration_hours: durationHours,
      notes: payload.notes.trim() || null,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    })
    .select()
    .single();

  if (error) throw normalizePolicyError(error);

  return {
    client,
    service: data as PolicyService,
    remainingHours: Math.max(getRemainingHours(client) - Number((data as PolicyService).duration_hours), 0),
  };
}

export async function updatePolicyService(payload: PolicyServiceDraft & { id: string }): Promise<PolicyServiceResult> {
  const { client, startAt, endAt, durationHours } = await validatePolicyServiceDraft(payload, payload.id);

  const { data, error } = await supabase
    .from('policy_services')
    .update({
      client_id: payload.client_id,
      service_type: payload.service_type,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      duration_hours: durationHours,
      notes: payload.notes.trim() || null,
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw normalizePolicyError(error);

  const oldDuration = Number(client.policy_services?.find((service) => service.id === payload.id)?.duration_hours ?? 0);
  return {
    client,
    service: data as PolicyService,
    remainingHours: Math.max(getRemainingHours(client) + oldDuration - Number((data as PolicyService).duration_hours), 0),
  };
}

export async function deletePolicyService(id: string) {
  const { error } = await supabase.from('policy_services').delete().eq('id', id);
  if (error) throw normalizePolicyError(error);
}

async function validatePolicyServiceDraft(payload: PolicyServiceDraft, currentServiceId?: string) {
  if (!payload.client_id) {
    throw new Error('Selecciona un cliente para registrar el servicio.');
  }
  if (!payload.start_date || !payload.start_time || !payload.end_date || !payload.end_time) {
    throw new Error('Completa las fechas y horas del servicio.');
  }
  if (!policyServiceTypes.includes(payload.service_type)) {
    throw new Error('Selecciona un tipo de servicio válido.');
  }

  const startAt = buildDateTime(payload.start_date, payload.start_time);
  const endAt = buildDateTime(payload.end_date, payload.end_time);
  const durationHours = calculateDurationHours(startAt, endAt);
  if (durationHours <= 0) {
    throw new Error('La hora de fin no puede ser menor o igual que la hora de inicio.');
  }

  const client = await getPolicyClient(payload.client_id);
  const previousDuration = currentServiceId
    ? Number(client.policy_services?.find((service) => service.id === currentServiceId)?.duration_hours ?? 0)
    : 0;
  const availableHours = getRemainingHours(client) + previousDuration;
  if (availableHours <= 0) {
    throw new Error('La póliza del cliente está agotada.');
  }
  if (durationHours > availableHours) {
    throw new Error('El servicio excede las horas restantes de la póliza.');
  }

  return { client, startAt, endAt, durationHours };
}

export async function getPolicyClient(clientId: string) {
  const { data, error } = await supabase
    .from('policy_clients')
    .select('*, policy_services (*)')
    .eq('id', clientId)
    .single();

  if (error) throw normalizePolicyError(error);
  return sortClientServices(data as PolicyClientWithServices);
}

export function getConsumedHours(client: PolicyClientWithServices) {
  return (client.policy_services ?? emptyServices).reduce((total, service) => total + Number(service.duration_hours ?? 0), 0);
}

export function getTotalPolicyHours(client: PolicyClientWithServices) {
  return Number(client.policy_hours) + Number(client.additional_hours ?? 0);
}

export function getRemainingHours(client: PolicyClientWithServices) {
  return Math.max(getTotalPolicyHours(client) - getConsumedHours(client), 0);
}

export function getPolicyTone(remainingHours: number) {
  if (remainingHours <= 1) return 'danger';
  if (remainingHours <= 4) return 'warning';
  return 'success';
}

export function formatPolicyHours(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('es-MX', { maximumFractionDigits: 2 })} h`;
}

function buildDateTime(date: string, time: string) {
  const value = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  if (Number.isNaN(value.getTime())) {
    throw new Error('Indica una fecha y hora válidas.');
  }
  return value;
}

function calculateDurationHours(startAt: Date, endAt: Date) {
  return Math.round(((endAt.getTime() - startAt.getTime()) / 3_600_000) * 100) / 100;
}

function sortClientServices(client: PolicyClientWithServices) {
  return {
    ...client,
    policy_services: [...(client.policy_services ?? emptyServices)].sort(
      (left, right) => new Date(right.start_at).getTime() - new Date(left.start_at).getTime(),
    ),
  };
}

function normalizePolicyError(error: { message?: string }) {
  const message = error.message ?? '';

  if (message.includes('Could not find the table') || message.includes('schema cache')) {
    return new Error('Faltan las tablas de pólizas en Supabase. Aplica la migración supabase/migrations/008_policy_module.sql.');
  }

  return error;
}
