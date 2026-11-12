import type { SupportCase, SupportCaseWithEvents, SupportEvent, SupportEventType } from './types';

export const trackingEventSeeds = [
  {
    name: 'Equipo recibido',
    code: 'equipo_recibido',
    event_type: 'ticket_created',
    support_type: 'technical',
    description: 'El equipo fue recibido para iniciar el soporte técnico.',
    sort_order: 10,
  },
  {
    name: 'En revisión',
    code: 'en_revision',
    event_type: 'diagnosis',
    support_type: 'technical',
    description: 'El equipo está en revisión técnica.',
    sort_order: 20,
  },
  {
    name: 'Diagnóstico',
    code: 'diagnostico',
    event_type: 'diagnosis',
    support_type: 'technical',
    description: 'Se registró el diagnóstico del equipo.',
    sort_order: 30,
  },
  {
    name: 'Esperando refacciones',
    code: 'esperando_refacciones',
    event_type: 'note',
    support_type: 'technical',
    description: 'El soporte está esperando refacciones para continuar.',
    sort_order: 40,
  },
  {
    name: 'Equipo listo para entrega',
    code: 'equipo_listo_entrega',
    event_type: 'note',
    support_type: 'technical',
    description: 'El equipo está listo para entrega.',
    sort_order: 60,
  },
  {
    name: 'Equipo entregado',
    code: 'equipo_entregado',
    event_type: 'closed',
    support_type: 'technical',
    description: 'El equipo fue entregado.',
    sort_order: 70,
  },
  {
    name: 'Preparando propuesta',
    code: 'preparando_propuesta',
    event_type: 'ticket_created',
    support_type: 'programming',
    description: 'Se está preparando la propuesta de programación.',
    sort_order: 10,
  },
  {
    name: 'Propuesta enviada',
    code: 'propuesta_enviada',
    event_type: 'note',
    support_type: 'programming',
    description: 'La propuesta fue enviada.',
    sort_order: 20,
  },
  {
    name: 'Propuesta firmada',
    code: 'propuesta_firmada',
    event_type: 'note',
    support_type: 'programming',
    description: 'La propuesta fue firmada.',
    sort_order: 30,
  },
  {
    name: 'Desarrollando la programación',
    code: 'desarrollando_programacion',
    event_type: 'repair',
    support_type: 'programming',
    description: 'La programación está en desarrollo.',
    sort_order: 40,
  },
  {
    name: 'Realizando pruebas',
    code: 'realizando_pruebas',
    event_type: 'diagnosis',
    support_type: 'programming',
    description: 'La programación está en fase de pruebas.',
    sort_order: 50,
  },
  {
    name: 'Programación concluida',
    code: 'programacion_concluida',
    event_type: 'note',
    support_type: 'programming',
    description: 'La programación fue concluida.',
    sort_order: 60,
  },
  {
    name: 'Listo para envío',
    code: 'listo_para_envio',
    event_type: 'note',
    support_type: 'programming',
    description: 'La programación está lista para envío.',
    sort_order: 70,
  },
  {
    name: 'Enviada',
    code: 'enviada',
    event_type: 'closed',
    support_type: 'programming',
    description: 'La programación fue enviada.',
    sort_order: 80,
  },
] satisfies Array<Omit<SupportEventType, 'id' | 'is_active' | 'created_at' | 'updated_at'>>;

export function sortSupportEvents(events: SupportEvent[]) {
  return [...events].sort((a, b) => b.event_date.localeCompare(a.event_date));
}

export function getLatestSupportEvent(support: SupportCaseWithEvents) {
  return sortSupportEvents(support.support_events ?? [])[0] ?? null;
}

export function getCurrentSupportState(support: SupportCaseWithEvents) {
  const latestEvent = getLatestSupportEvent(support);
  return latestEvent?.title || statusLabel(support.status);
}

export function caseStatusFromEventType(eventType: SupportEventType): SupportCase['status'] {
  if (eventType.event_type === 'closed' || ['equipo_entregado', 'enviada'].includes(eventType.code)) {
    return 'closed';
  }

  if (['equipo_recibido', 'preparando_propuesta'].includes(eventType.code)) {
    return 'open';
  }

  return 'pending';
}

export function statusLabel(status: SupportCase['status']) {
  const labels: Record<SupportCase['status'], string> = {
    open: 'Abierto',
    pending: 'En proceso',
    closed: 'Cerrado',
  };

  return labels[status];
}

export function getSupportStateHeaderColor(support: SupportCaseWithEvents) {
  const currentState = normalizeStateName(getCurrentSupportState(support));
  const states = trackingEventSeeds
    .filter((eventType) => eventType.support_type === support.support_type)
    .sort((a, b) => a.sort_order - b.sort_order);
  const stateIndex = states.findIndex((eventType) => normalizeStateName(eventType.name) === currentState);

  if (stateIndex < 0 || states.length <= 1) {
    return support.status === 'closed' ? '#2fa66a' : support.status === 'pending' ? '#ddb23c' : '#c76166';
  }

  const progress = Math.min(Math.max(stateIndex / (states.length - 1), 0), 1);
  return interpolateSupportColor(progress);
}

function normalizeStateName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function interpolateSupportColor(progress: number) {
  if (progress <= 0.5) {
    const localProgress = progress / 0.5;
    return mixRgb([199, 97, 102], [221, 178, 60], localProgress);
  }

  const localProgress = (progress - 0.5) / 0.5;
  return mixRgb([221, 178, 60], [47, 166, 106], localProgress);
}

function mixRgb(start: [number, number, number], end: [number, number, number], progress: number) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const mixed = start.map((channel, index) => Math.round(channel + (end[index] - channel) * clampedProgress));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}
