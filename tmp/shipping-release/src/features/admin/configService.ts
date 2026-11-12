import { supabase } from '../../lib/supabase';
import type {
  Manufacturer,
  PrinterModel,
  PrinterModelWithManufacturer,
  SupportAgent,
  SupportEventType,
} from '../../lib/types';

export async function getManufacturers() {
  const { data, error } = await supabase
    .from('manufacturers')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Manufacturer[];
}

export async function getPrinterModels() {
  const { data, error } = await supabase
    .from('printer_models')
    .select('*, manufacturers (id, name)')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as PrinterModelWithManufacturer[];
}

export async function getSupportEventTypes() {
  const { data, error } = await supabase
    .from('support_event_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SupportEventType[];
}

export async function getSupportAgents() {
  const { data, error } = await supabase
    .from('support_agents')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SupportAgent[];
}

export async function createSupportAgent(payload: { full_name: string; position: string }) {
  const { data, error } = await supabase
    .from('support_agents')
    .insert({
      full_name: payload.full_name.trim(),
      position: payload.position.trim(),
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as SupportAgent;
}

export async function updateSupportAgent(payload: { id: string; full_name: string; position: string }) {
  const { data, error } = await supabase
    .from('support_agents')
    .update({
      full_name: payload.full_name.trim(),
      position: payload.position.trim(),
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw error;
  return data as SupportAgent;
}

export async function deleteSupportAgent(id: string) {
  const { error } = await supabase.from('support_agents').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function createManufacturer(payload: Pick<Manufacturer, 'name'>) {
  const { data, error } = await supabase
    .from('manufacturers')
    .insert({ name: payload.name.trim(), is_active: true })
    .select()
    .single();

  if (error) throw error;
  return data as Manufacturer;
}

export async function updateManufacturer(payload: Pick<Manufacturer, 'id' | 'name'>) {
  const { data, error } = await supabase
    .from('manufacturers')
    .update({ name: payload.name.trim() })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw error;
  return data as Manufacturer;
}

export async function deleteManufacturer(id: string) {
  const { error } = await supabase.from('manufacturers').delete().eq('id', id);
  if (error) throw error;
}

export async function createPrinterModel(payload: {
  manufacturer_id: string;
  name: string;
  part_number: string;
}) {
  const { data, error } = await supabase
    .from('printer_models')
    .insert({
      manufacturer_id: payload.manufacturer_id,
      name: payload.name.trim(),
      part_number: payload.part_number.trim() || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as PrinterModel;
}

export async function updatePrinterModel(payload: {
  id: string;
  manufacturer_id: string;
  name: string;
  part_number: string;
}) {
  const { data, error } = await supabase
    .from('printer_models')
    .update({
      manufacturer_id: payload.manufacturer_id,
      name: payload.name.trim(),
      part_number: payload.part_number.trim() || null,
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw error;
  return data as PrinterModel;
}

export async function deletePrinterModel(id: string) {
  const { error } = await supabase.from('printer_models').delete().eq('id', id);
  if (error) throw error;
}

export async function createSupportEventType(payload: {
  name: string;
  code: string;
  event_type: SupportEventType['event_type'];
  support_type: SupportEventType['support_type'];
  description: string;
  sort_order: number;
}) {
  const { data, error } = await supabase
    .from('support_event_types')
    .insert({
      name: payload.name.trim(),
      code: normalizeCode(payload.code || payload.name),
      event_type: payload.event_type,
      support_type: payload.support_type,
      description: payload.description.trim() || null,
      sort_order: payload.sort_order,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as SupportEventType;
}

export async function updateSupportEventType(payload: {
  id: string;
  name: string;
  code: string;
  event_type: SupportEventType['event_type'];
  support_type: SupportEventType['support_type'];
  description: string;
  sort_order: number;
}) {
  const { data, error } = await supabase
    .from('support_event_types')
    .update({
      name: payload.name.trim(),
      code: normalizeCode(payload.code || payload.name),
      event_type: payload.event_type,
      support_type: payload.support_type,
      description: payload.description.trim() || null,
      sort_order: payload.sort_order,
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw error;
  return data as SupportEventType;
}

export async function deleteSupportEventType(id: string) {
  const { error } = await supabase.from('support_event_types').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
