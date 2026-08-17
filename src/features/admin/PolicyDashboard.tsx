import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  Archive,
  Clock,
  CreditCard,
  Edit2,
  FileText,
  Grid2X2,
  List,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { EmptyState } from '../../components/EmptyState';
import { formatDate, formatTime } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { SidebarUserFooter } from './SidebarUserFooter';
import type { PolicyClientWithServices, PolicyService } from '../../lib/types';
import {
  addPolicyClientHours,
  archivePolicyClient,
  createPolicyClient,
  createPolicyService,
  deletePolicyService,
  formatPolicyHours,
  getConsumedHours,
  getArchivedPolicyClients,
  getPolicyClients,
  getPolicyTone,
  getRemainingHours,
  getTotalPolicyHours,
  policyHourOptions,
  restorePolicyClient,
  updatePolicyClient,
  updatePolicyService,
  type PolicyClientDraft,
  type PolicyServiceDraft,
  type PolicyServiceResult,
  policyServiceTypes,
} from './policyService';

type PolicySection = 'clients' | 'policy';
type ClientViewMode = 'cards' | 'list';

type PolicyDashboardProps = {
  session: Session;
  onOpenHub: () => void;
};

const policySections: Array<{ id: PolicySection; label: string; icon: ReactNode }> = [
  { id: 'clients', label: 'Clientes', icon: <UsersRound size={18} /> },
  { id: 'policy', label: 'Servicios', icon: <FileText size={18} /> },
];

const emptyClients: PolicyClientWithServices[] = [];

export function PolicyDashboard({ session, onOpenHub }: PolicyDashboardProps) {
  const [activeSection, setActiveSection] = useState<PolicySection>('clients');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ClientViewMode>('cards');
  const [clientModal, setClientModal] = useState<PolicyClientWithServices | 'new' | null>(null);
  const [archivedModalOpen, setArchivedModalOpen] = useState(false);
  const [serviceModal, setServiceModal] = useState<PolicyService | 'new' | null>(null);
  const [rechargeClient, setRechargeClient] = useState<PolicyClientWithServices | null>(null);
  const [selectedClient, setSelectedClient] = useState<PolicyClientWithServices | null>(null);
  const [serviceResult, setServiceResult] = useState<PolicyServiceResult | null>(null);
  const queryClient = useQueryClient();

  const clientsQuery = useQuery({
    queryKey: ['policy-clients', search],
    queryFn: () => getPolicyClients(search),
  });

  const allClientsQuery = useQuery({
    queryKey: ['policy-clients', ''],
    queryFn: () => getPolicyClients(''),
  });

  const archivedClientsQuery = useQuery({
    queryKey: ['policy-clients-archived'],
    queryFn: getArchivedPolicyClients,
  });

  const clients = clientsQuery.data ?? emptyClients;
  const allClients = allClientsQuery.data ?? emptyClients;
  const archivedClients = archivedClientsQuery.data ?? emptyClients;
  const services = useMemo(() => flattenPolicyServices(allClients), [allClients]);

  const createClientMutation = useMutation({
    mutationFn: createPolicyClient,
    onSuccess: () => {
      invalidatePolicies(queryClient);
      setClientModal(null);
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: updatePolicyClient,
    onSuccess: () => {
      invalidatePolicies(queryClient);
      setClientModal(null);
    },
  });

  const archiveClientMutation = useMutation({
    mutationFn: archivePolicyClient,
    onSuccess: () => {
      invalidatePolicies(queryClient);
      setSelectedClient(null);
    },
  });

  const restoreClientMutation = useMutation({
    mutationFn: restorePolicyClient,
    onSuccess: () => {
      invalidatePolicies(queryClient);
    },
  });

  const createServiceMutation = useMutation({
    mutationFn: createPolicyService,
    onSuccess: (result) => {
      invalidatePolicies(queryClient);
      setServiceModal(null);
      setServiceResult(result);
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: updatePolicyService,
    onSuccess: (result) => {
      invalidatePolicies(queryClient);
      setServiceModal(null);
      setServiceResult(result);
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: deletePolicyService,
    onSuccess: () => {
      invalidatePolicies(queryClient);
    },
  });

  const addHoursMutation = useMutation({
    mutationFn: (payload: { client: PolicyClientWithServices; hours: string }) => addPolicyClientHours(payload.client, payload.hours),
    onSuccess: (client) => {
      invalidatePolicies(queryClient);
      setRechargeClient(null);
      setSelectedClient((current) => (current?.id === client.id ? { ...current, ...client } : current));
    },
  });

  function requestArchiveClient(client: PolicyClientWithServices) {
    const remaining = getRemainingHours(client);
    const message =
      remaining > 0
        ? `Este cliente todavía tiene ${formatPolicyHours(remaining)} disponibles. Si lo borras, pasará a Archivados durante 30 días. ¿Deseas continuar?`
        : 'Este cliente pasará a Archivados durante 30 días. ¿Deseas continuar?';

    if (window.confirm(message)) {
      archiveClientMutation.mutate(client);
    }
  }

  function requestDeleteService(service: PolicyService) {
    if (window.confirm('¿Deseas borrar este servicio? Las horas consumidas se devolverán automáticamente al cliente.')) {
      deleteServiceMutation.mutate(service.id);
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Pólizas</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones de pólizas">
          {policySections.map((section) => (
            <button
              key={section.id}
              className={activeSection === section.id ? 'active' : undefined}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </nav>
        <SidebarUserFooter
          email={session.user.email}
          statusLabel="Sesión activa"
          onSignOut={() => {
            void supabase.auth.signOut();
          }}
        />
      </aside>

      <main className="admin-workspace">
        {activeSection === 'clients' ? (
          <PolicyClientsSection
            clients={clients}
            search={search}
            setSearch={setSearch}
            viewMode={viewMode}
            setViewMode={setViewMode}
            isLoading={clientsQuery.isLoading}
            archivedCount={archivedClients.length}
            onAdd={() => setClientModal('new')}
            onSelect={setSelectedClient}
            onEdit={setClientModal}
            onArchive={requestArchiveClient}
            onOpenArchived={() => setArchivedModalOpen(true)}
          />
        ) : null}

        {activeSection === 'policy' ? (
          <PolicyServicesSection
            clients={allClients}
            services={services}
            isLoading={allClientsQuery.isLoading}
            onAdd={() => setServiceModal('new')}
            onEdit={setServiceModal}
            onDelete={requestDeleteService}
          />
        ) : null}
      </main>

      {clientModal ? (
        <PolicyModal title={clientModal === 'new' ? 'Registrar cliente' : 'Editar cliente'} onClose={() => setClientModal(null)}>
          <PolicyClientForm
            client={clientModal === 'new' ? undefined : clientModal}
            isSaving={createClientMutation.isPending || updateClientMutation.isPending}
            error={createClientMutation.error?.message ?? updateClientMutation.error?.message}
            onSave={(payload) =>
              clientModal === 'new'
                ? createClientMutation.mutate(payload)
                : updateClientMutation.mutate({
                    ...payload,
                    id: clientModal.id,
                    current_additional_hours: Number(clientModal.additional_hours ?? 0),
                  })
            }
          />
        </PolicyModal>
      ) : null}

      {archivedModalOpen ? (
        <PolicyModal title="Clientes archivados" onClose={() => setArchivedModalOpen(false)} size="wide">
          <ArchivedPolicyClients
            clients={archivedClients}
            isLoading={archivedClientsQuery.isLoading}
            isRestoring={restoreClientMutation.isPending}
            onRestore={(client) => restoreClientMutation.mutate(client.id)}
          />
        </PolicyModal>
      ) : null}

      {serviceModal ? (
        <PolicyModal title={serviceModal === 'new' ? 'Registrar servicio de póliza' : 'Editar servicio de póliza'} onClose={() => setServiceModal(null)}>
          <PolicyServiceForm
            service={serviceModal === 'new' ? undefined : serviceModal}
            clients={allClients}
            isSaving={createServiceMutation.isPending || updateServiceMutation.isPending}
            error={createServiceMutation.error?.message ?? updateServiceMutation.error?.message}
            onSave={(payload) =>
              serviceModal === 'new'
                ? createServiceMutation.mutate(payload)
                : updateServiceMutation.mutate({ ...payload, id: serviceModal.id })
            }
          />
        </PolicyModal>
      ) : null}

      {selectedClient ? (
        <PolicyModal title={`Detalle de ${selectedClient.full_name}`} onClose={() => setSelectedClient(null)} size="wide">
          <PolicyClientDetail
            client={selectedClient}
            onRecharge={setRechargeClient}
            onEditService={setServiceModal}
            onDeleteService={requestDeleteService}
          />
        </PolicyModal>
      ) : null}

      {rechargeClient ? (
        <PolicyModal title="Contratar más horas" onClose={() => setRechargeClient(null)}>
          <PolicyRechargeForm
            client={rechargeClient}
            isSaving={addHoursMutation.isPending}
            error={addHoursMutation.error?.message}
            onSave={(hours) => addHoursMutation.mutate({ client: rechargeClient, hours })}
          />
        </PolicyModal>
      ) : null}

      {serviceResult ? (
        <PolicyModal title="Servicio registrado" onClose={() => setServiceResult(null)}>
          <PolicyServiceNotification result={serviceResult} />
        </PolicyModal>
      ) : null}
    </div>
  );
}

function PolicyClientsSection({
  clients,
  search,
  setSearch,
  viewMode,
  setViewMode,
  isLoading,
  archivedCount,
  onAdd,
  onSelect,
  onEdit,
  onArchive,
  onOpenArchived,
}: {
  clients: PolicyClientWithServices[];
  search: string;
  setSearch: (value: string) => void;
  viewMode: ClientViewMode;
  setViewMode: (mode: ClientViewMode) => void;
  isLoading: boolean;
  archivedCount: number;
  onAdd: () => void;
  onSelect: (client: PolicyClientWithServices) => void;
  onEdit: (client: PolicyClientWithServices) => void;
  onArchive: (client: PolicyClientWithServices) => void;
  onOpenArchived: () => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Clientes</p>
          <h2>Clientes con póliza</h2>
        </div>
        <div className="header-actions">
          <div className="segmented-control" aria-label="Vista de clientes">
            <button type="button" className={viewMode === 'cards' ? 'active' : undefined} onClick={() => setViewMode('cards')}>
              <Grid2X2 size={16} />
            </button>
            <button type="button" className={viewMode === 'list' ? 'active' : undefined} onClick={() => setViewMode('list')}>
              <List size={16} />
            </button>
          </div>
          <button type="button" onClick={onAdd}>
            <Plus size={18} />
            Registrar cliente
          </button>
        </div>
      </div>

      <label className="dashboard-search">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por cliente, CURP, razón social o RFC"
        />
      </label>

      <div className="policy-archive-toolbar">
        <button type="button" className="secondary-button" onClick={onOpenArchived}>
          <Archive size={18} />
          Archivados
          {archivedCount > 0 ? <span>{archivedCount}</span> : null}
        </button>
      </div>

      {viewMode === 'cards' ? (
        <PolicyClientCards clients={clients} isLoading={isLoading} onSelect={onSelect} onEdit={onEdit} onArchive={onArchive} />
      ) : (
        <PolicyClientTable clients={clients} isLoading={isLoading} onSelect={onSelect} onEdit={onEdit} onArchive={onArchive} />
      )}
    </section>
  );
}

function PolicyClientCards({
  clients,
  isLoading,
  onSelect,
  onEdit,
  onArchive,
}: {
  clients: PolicyClientWithServices[];
  isLoading: boolean;
  onSelect: (client: PolicyClientWithServices) => void;
  onEdit: (client: PolicyClientWithServices) => void;
  onArchive: (client: PolicyClientWithServices) => void;
}) {
  if (isLoading) return <EmptyState title="Cargando">Consultando clientes...</EmptyState>;
  if (clients.length === 0) return <EmptyState title="Sin clientes">Registra el primer cliente con póliza.</EmptyState>;

  return (
    <div className="policy-card-grid">
      {clients.map((client) => {
        const consumed = getConsumedHours(client);
        const total = getTotalPolicyHours(client);
        const remaining = getRemainingHours(client);

        return (
          <article className="policy-client-card clickable-row" key={client.id} onClick={() => onSelect(client)}>
            <div className="policy-card-top">
              <span className="inventory-category">Póliza acumulada: {formatPolicyHours(total)}</span>
              <h3>{client.full_name}</h3>
              <p>{client.business_name}</p>
              <div className="policy-card-quick-facts" aria-label="Resumen de horas de póliza">
                <span>Inicial: {formatPolicyHours(Number(client.policy_hours))}</span>
                {Number(client.additional_hours ?? 0) > 0 ? (
                  <span>Agregadas: {formatPolicyHours(Number(client.additional_hours ?? 0))}</span>
                ) : null}
                <span>Consumidas: {formatPolicyHours(consumed)}</span>
              </div>
            </div>
            <PolicyHoursMeter total={total} consumed={consumed} remaining={remaining} />
            <PolicyClientActions client={client} onEdit={onEdit} onArchive={onArchive} />
          </article>
        );
      })}
    </div>
  );
}

function PolicyClientTable({
  clients,
  isLoading,
  onSelect,
  onEdit,
  onArchive,
}: {
  clients: PolicyClientWithServices[];
  isLoading: boolean;
  onSelect: (client: PolicyClientWithServices) => void;
  onEdit: (client: PolicyClientWithServices) => void;
  onArchive: (client: PolicyClientWithServices) => void;
}) {
  if (isLoading) return <EmptyState title="Cargando">Consultando clientes...</EmptyState>;
  if (clients.length === 0) return <EmptyState title="Sin clientes">No hay clientes para mostrar.</EmptyState>;

  return (
    <article className="panel">
      <div className="table-wrap">
        <table className="records-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>CURP</th>
              <th>Razón social</th>
              <th>Póliza</th>
              <th>Consumidas</th>
              <th>Restantes</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const consumed = getConsumedHours(client);
              const remaining = getRemainingHours(client);

              return (
                <tr key={client.id} className="clickable-row" onClick={() => onSelect(client)}>
                  <td>{client.full_name}</td>
                  <td>{client.curp}</td>
                  <td>{client.business_name}</td>
                  <td>{formatPolicyHours(getTotalPolicyHours(client))}</td>
                  <td>{formatPolicyHours(consumed)}</td>
                  <td><PolicyPill remaining={remaining} /></td>
                  <td>
                    <PolicyClientActions client={client} onEdit={onEdit} onArchive={onArchive} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PolicyServicesSection({
  clients,
  services,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
}: {
  clients: PolicyClientWithServices[];
  services: Array<PolicyService & { client: PolicyClientWithServices }>;
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (service: PolicyService) => void;
  onDelete: (service: PolicyService) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Póliza</p>
          <h2>Servicios registrados</h2>
        </div>
        <button type="button" onClick={onAdd} disabled={clients.length === 0}>
          <Plus size={18} />
          Registrar servicio
        </button>
      </div>
      {clients.length === 0 ? (
        <EmptyState title="Sin clientes">Registra al menos un cliente antes de crear servicios de póliza.</EmptyState>
      ) : (
        <PolicyServicesTable services={services} isLoading={isLoading} onEdit={onEdit} onDelete={onDelete} />
      )}
    </section>
  );
}

function PolicyClientActions({
  client,
  onEdit,
  onArchive,
}: {
  client: PolicyClientWithServices;
  onEdit: (client: PolicyClientWithServices) => void;
  onArchive: (client: PolicyClientWithServices) => void;
}) {
  return (
    <div className="row-actions" onClick={(event) => event.stopPropagation()}>
      <button className="icon-button" type="button" onClick={() => onEdit(client)} aria-label="Editar cliente">
        <Edit2 size={16} />
      </button>
      <button className="icon-button danger-action" type="button" onClick={() => onArchive(client)} aria-label="Archivar cliente">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function PolicyServiceActions({
  service,
  onEdit,
  onDelete,
}: {
  service: PolicyService;
  onEdit: (service: PolicyService) => void;
  onDelete: (service: PolicyService) => void;
}) {
  return (
    <div className="row-actions" onClick={(event) => event.stopPropagation()}>
      <button className="icon-button" type="button" onClick={() => onEdit(service)} aria-label="Editar servicio">
        <Edit2 size={16} />
      </button>
      <button className="icon-button danger-action" type="button" onClick={() => onDelete(service)} aria-label="Borrar servicio">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function PolicyServicesTable({
  services,
  isLoading,
  onEdit,
  onDelete,
}: {
  services: Array<PolicyService & { client: PolicyClientWithServices }>;
  isLoading: boolean;
  onEdit: (service: PolicyService) => void;
  onDelete: (service: PolicyService) => void;
}) {
  if (isLoading) return <EmptyState title="Cargando">Consultando servicios...</EmptyState>;
  if (services.length === 0) return <EmptyState title="Sin servicios">Aún no hay servicios registrados.</EmptyState>;

  return (
    <article className="panel">
      <div className="table-wrap">
        <table className="records-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Duración</th>
              <th>Restantes</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>{service.client.full_name}</td>
                <td>
                  <strong>{service.service_type}</strong>
                  {service.notes ? <small>{service.notes}</small> : null}
                </td>
                <td>{formatDate(service.start_at)} {formatTime(service.start_at)}</td>
                <td>{formatDate(service.end_at)} {formatTime(service.end_at)}</td>
                <td>{formatPolicyHours(Number(service.duration_hours))}</td>
                <td><PolicyPill remaining={getRemainingHours(service.client)} /></td>
                <td><PolicyServiceActions service={service} onEdit={onEdit} onDelete={onDelete} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PolicyClientDetail({
  client,
  onRecharge,
  onEditService,
  onDeleteService,
}: {
  client: PolicyClientWithServices;
  onRecharge: (client: PolicyClientWithServices) => void;
  onEditService: (service: PolicyService) => void;
  onDeleteService: (service: PolicyService) => void;
}) {
  const consumed = getConsumedHours(client);
  const total = getTotalPolicyHours(client);
  const remaining = getRemainingHours(client);

  return (
    <div className="policy-detail">
      <div className="summary-grid">
        <SummaryItem label="Cliente" value={client.full_name} />
        <SummaryItem label="CURP" value={client.curp} />
        <SummaryItem label="Razón social" value={client.business_name} />
        <SummaryItem label="RFC" value={client.rfc ?? '-'} />
        <SummaryItem label="Póliza inicial" value={formatPolicyHours(Number(client.policy_hours))} />
        <SummaryItem label="Horas contratadas" value={formatPolicyHours(total)} />
        <SummaryItem label="Horas adicionales" value={formatPolicyHours(Number(client.additional_hours ?? 0))} />
        <SummaryItem label="Horas consumidas" value={formatPolicyHours(consumed)} />
        <button className="summary-item policy-recharge-card" type="button" onClick={() => onRecharge(client)}>
          <span className="summary-label"><Clock size={16} /> Horas restantes</span>
          <PolicyPill remaining={remaining} />
          <small>Contratar más horas</small>
        </button>
      </div>
      <article className="panel">
        <div className="panel-header">
          <h2>Historial de servicios</h2>
          <span>{client.policy_services?.length ?? 0} servicios</span>
        </div>
        <PolicyHistory services={client.policy_services ?? []} onEdit={onEditService} onDelete={onDeleteService} />
      </article>
      <article className="panel">
        <div className="catalog-note">
          <strong>Dirección:</strong> {client.address}
          {client.notes ? <><br /><strong>Notas:</strong> {client.notes}</> : null}
        </div>
      </article>
    </div>
  );
}

function PolicyHistory({
  services,
  onEdit,
  onDelete,
}: {
  services: PolicyService[];
  onEdit: (service: PolicyService) => void;
  onDelete: (service: PolicyService) => void;
}) {
  if (services.length === 0) {
    return <EmptyState title="Sin historial">Este cliente todavía no tiene servicios registrados.</EmptyState>;
  }

  return (
    <div className="table-wrap">
      <table className="records-table">
        <thead>
          <tr>
            <th>Fecha de inicio</th>
            <th>Tipo</th>
            <th>Hora de inicio</th>
            <th>Fecha de fin</th>
            <th>Hora de fin</th>
            <th>Duración</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr key={service.id}>
              <td>{formatDate(service.start_at)}</td>
              <td>
                <strong>{service.service_type}</strong>
                {service.notes ? <small>{service.notes}</small> : null}
              </td>
              <td>{formatTime(service.start_at)}</td>
              <td>{formatDate(service.end_at)}</td>
              <td>{formatTime(service.end_at)}</td>
              <td>{formatPolicyHours(Number(service.duration_hours))}</td>
              <td><PolicyServiceActions service={service} onEdit={onEdit} onDelete={onDelete} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyClientForm({
  client,
  isSaving,
  error,
  onSave,
}: {
  client?: PolicyClientWithServices;
  isSaving: boolean;
  error?: string;
  onSave: (payload: PolicyClientDraft) => void;
}) {
  const [draft, setDraft] = useState<PolicyClientDraft>({
    full_name: client?.full_name ?? '',
    curp: client?.curp ?? '',
    business_name: client?.business_name ?? '',
    address: client?.address ?? '',
    policy_hours: String(client?.policy_hours ?? 10),
    add_hours: '0',
    rfc: client?.rfc ?? '',
    notes: client?.notes ?? '',
  });
  const [localError, setLocalError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.full_name.trim() || !draft.curp.trim() || !draft.business_name.trim() || !draft.address.trim()) {
      setLocalError('Completa todos los campos obligatorios.');
      return;
    }
    setLocalError('');
    onSave(draft);
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nombre completo">
          <input value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} required />
        </Field>
        <Field label="CURP">
          <input value={draft.curp} onChange={(event) => setDraft({ ...draft, curp: event.target.value })} required />
        </Field>
        <Field label="Razón social">
          <input value={draft.business_name} onChange={(event) => setDraft({ ...draft, business_name: event.target.value })} required />
        </Field>
        <Field label="Tipo de póliza">
          <select value={draft.policy_hours} onChange={(event) => setDraft({ ...draft, policy_hours: event.target.value })}>
            {policyHourOptions.map((hours) => (
              <option key={hours} value={hours}>Póliza {hours} horas</option>
            ))}
          </select>
        </Field>
        {client ? (
          <Field label="Agregar horas">
            <select value={draft.add_hours} onChange={(event) => setDraft({ ...draft, add_hours: event.target.value })}>
              <option value="0">Sin recarga</option>
              {policyHourOptions.map((hours) => (
                <option key={hours} value={hours}>Agregar {hours} horas</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="RFC">
          <input value={draft.rfc} onChange={(event) => setDraft({ ...draft, rfc: event.target.value })} />
        </Field>
      </div>
      {client ? (
        <div className="policy-inline-status">
          <span>Horas actuales</span>
          <strong>{formatPolicyHours(getTotalPolicyHours(client))}</strong>
          <span>Restantes</span>
          <PolicyPill remaining={getRemainingHours(client)} />
        </div>
      ) : null}
      <Field label="Dirección">
        <textarea rows={3} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} required />
      </Field>
      <Field label="Notas">
        <textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </Field>
      {localError || error ? <p className="form-error">{localError || error}</p> : null}
      <button type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : client ? 'Guardar cambios' : 'Guardar cliente'}</button>
    </form>
  );
}

function PolicyServiceForm({
  service,
  clients,
  isSaving,
  error,
  onSave,
}: {
  service?: PolicyService;
  clients: PolicyClientWithServices[];
  isSaving: boolean;
  error?: string;
  onSave: (payload: PolicyServiceDraft) => void;
}) {
  const today = getTodayInputValue();
  const [draft, setDraft] = useState<PolicyServiceDraft>({
    client_id: service?.client_id ?? clients[0]?.id ?? '',
    service_type: service?.service_type ?? 'Soporte Remoto',
    start_date: service ? toDateInputValue(service.start_at) : today,
    start_time: service ? toTimeInputValue(service.start_at) : '09:00',
    end_date: service ? toDateInputValue(service.end_at) : today,
    end_time: service ? toTimeInputValue(service.end_at) : '10:00',
    notes: service?.notes ?? '',
  });
  const [localError, setLocalError] = useState('');
  const selectedClient = clients.find((client) => client.id === draft.client_id);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.client_id) {
      setLocalError('Selecciona un cliente.');
      return;
    }
    if (!draft.start_date || !draft.start_time || !draft.end_date || !draft.end_time) {
      setLocalError('Completa fechas y horas del servicio.');
      return;
    }
    if (!draft.service_type) {
      setLocalError('Selecciona el tipo de servicio.');
      return;
    }
    setLocalError('');
    onSave(draft);
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <Field label="Cliente">
        <select value={draft.client_id} onChange={(event) => setDraft({ ...draft, client_id: event.target.value })} required>
          <option value="">Selecciona cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.full_name} - {formatPolicyHours(getRemainingHours(client))} disponibles
            </option>
          ))}
        </select>
      </Field>
      {selectedClient ? (
        <div className="policy-inline-status">
          <span>Horas disponibles</span>
          <PolicyPill remaining={getRemainingHours(selectedClient)} />
        </div>
      ) : null}
      <Field label="Tipo de servicio">
        <select value={draft.service_type} onChange={(event) => setDraft({ ...draft, service_type: event.target.value as PolicyService['service_type'] })} required>
          {policyServiceTypes.map((serviceType) => (
            <option key={serviceType} value={serviceType}>{serviceType}</option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Fecha de inicio">
          <input
            type="date"
            value={draft.start_date}
            onChange={(event) => setDraft({ ...draft, start_date: event.target.value, end_date: event.target.value || draft.end_date })}
            required
          />
        </Field>
        <Field label="Hora de inicio">
          <input type="time" value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} required />
        </Field>
        <Field label="Fecha de fin">
          <input type="date" value={draft.end_date} onChange={(event) => setDraft({ ...draft, end_date: event.target.value })} required />
        </Field>
        <Field label="Hora de fin">
          <input type="time" value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} required />
        </Field>
      </div>
      <Field label="Notas">
        <textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </Field>
      {localError || error ? <p className="form-error">{localError || error}</p> : null}
      <button type="submit" disabled={isSaving || clients.length === 0}>{isSaving ? 'Guardando...' : service ? 'Guardar cambios' : 'Guardar servicio'}</button>
    </form>
  );
}

function PolicyRechargeForm({
  client,
  isSaving,
  error,
  onSave,
}: {
  client: PolicyClientWithServices;
  isSaving: boolean;
  error?: string;
  onSave: (hours: string) => void;
}) {
  const [hours, setHours] = useState('10');
  const remaining = getRemainingHours(client);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(hours);
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <div className="policy-inline-status">
        <span>Cliente</span>
        <strong>{client.full_name}</strong>
        <span>Horas restantes</span>
        <PolicyPill remaining={remaining} />
      </div>
      <Field label="Horas a contratar">
        <select value={hours} onChange={(event) => setHours(event.target.value)}>
          {policyHourOptions.map((option) => (
            <option key={option} value={option}>Agregar {option} horas</option>
          ))}
        </select>
      </Field>
      <p className="muted-text">
        Las horas contratadas se sumarán a las horas restantes del cliente y quedarán disponibles para nuevos servicios.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Contratar horas'}</button>
    </form>
  );
}

function ArchivedPolicyClients({
  clients,
  isLoading,
  isRestoring,
  onRestore,
}: {
  clients: PolicyClientWithServices[];
  isLoading: boolean;
  isRestoring: boolean;
  onRestore: (client: PolicyClientWithServices) => void;
}) {
  if (isLoading) return <EmptyState title="Cargando">Consultando clientes archivados...</EmptyState>;
  if (clients.length === 0) {
    return <EmptyState title="Sin archivados">No hay clientes archivados disponibles para recuperar.</EmptyState>;
  }

  return (
    <div className="table-wrap">
      <table className="records-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Razón social</th>
            <th>Horas restantes</th>
            <th>Archivado</th>
            <th>Disponible hasta</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>{client.full_name}</td>
              <td>{client.business_name}</td>
              <td><PolicyPill remaining={getRemainingHours(client)} /></td>
              <td>{client.archived_at ? formatDate(client.archived_at) : '-'}</td>
              <td>{client.archived_until ? formatDate(client.archived_until) : '-'}</td>
              <td>
                <button className="secondary-button" type="button" onClick={() => onRestore(client)} disabled={isRestoring}>
                  <RotateCcw size={16} />
                  Recuperar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyServiceNotification({ result }: { result: PolicyServiceResult }) {
  return (
    <div className="policy-notification">
      <div className={`policy-notification-icon ${getPolicyTone(result.remainingHours)}`}>
        <CreditCard size={26} />
      </div>
      <div>
        <p className="eyebrow">Servicio guardado</p>
        <h3>{result.client.full_name}</h3>
        <p>Duración registrada: <strong>{formatPolicyHours(Number(result.service.duration_hours))}</strong></p>
        <p>Horas restantes: <PolicyPill remaining={result.remainingHours} /></p>
      </div>
    </div>
  );
}

function PolicyHoursMeter({ total, consumed, remaining }: { total: number; consumed: number; remaining: number }) {
  const percent = total > 0 ? Math.min((remaining / total) * 100, 100) : 0;

  return (
    <div className="policy-hours-meter">
      <div className="policy-meter-row">
        <span>Contratadas</span>
        <strong>{formatPolicyHours(total)}</strong>
      </div>
      <div className="policy-meter-row">
        <span>Consumidas</span>
        <strong>{formatPolicyHours(consumed)}</strong>
      </div>
      <div className="policy-meter-row">
        <span>Restantes</span>
        <PolicyPill remaining={remaining} />
      </div>
      <div className="policy-progress" aria-label="Horas restantes">
        <span className={getPolicyTone(remaining)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function PolicyPill({ remaining }: { remaining: number }) {
  return <span className={`policy-pill ${getPolicyTone(remaining)}`}>{formatPolicyHours(remaining)}</span>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PolicyModal({
  title,
  children,
  onClose,
  size,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'wide';
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className={size === 'wide' ? 'modal-card modal-wide' : 'modal-card'}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function flattenPolicyServices(clients: PolicyClientWithServices[]) {
  return clients
    .flatMap((client) => (client.policy_services ?? []).map((service) => ({ ...service, client })))
    .sort((left, right) => new Date(right.start_at).getTime() - new Date(left.start_at).getTime());
}

function getTodayInputValue() {
  const today = new Date();
  return toDateInputValue(today.toISOString());
}

function toDateInputValue(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(value: string) {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function invalidatePolicies(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['policy-clients'] });
  queryClient.invalidateQueries({ queryKey: ['policy-clients-archived'] });
}
