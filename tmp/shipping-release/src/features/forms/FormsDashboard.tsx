import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileText,
  Link2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { EmptyState } from '../../components/EmptyState';
import { supabase } from '../../lib/supabase';
import type { AdminVisibilityScope, FormResponseRow } from '../../lib/types';
import { SidebarUserFooter } from '../admin/SidebarUserFooter';
import {
  getAttachmentSignedUrl,
  deleteFormResponse,
  getFormNotifications,
  getFormResponseCounts,
  getFormResponses,
  getFormShareUrl,
  getOrCreateRequirementForm,
  markFormNotificationsAsRead,
  REQUIREMENT_FORM_TITLE,
  type RequirementAttachment,
} from './formsService';

type FormsDashboardProps = {
  session: Session;
  visibilityScope: AdminVisibilityScope;
  onOpenHub: () => void;
};

type DetailField = {
  key: string;
  label: string;
};

type DetailSection = {
  id: string;
  title: string;
  description: string;
  fields: DetailField[];
};

const responseDetailSections: DetailSection[] = [
  {
    id: 'identification',
    title: 'Identificación y objetivo',
    description: 'Datos principales del cliente y alcance general capturado.',
    fields: [
      { key: 'project_kind', label: 'Tipo de solicitud' },
      { key: 'company_name', label: 'Cliente o empresa' },
      { key: 'contact_name', label: 'Contacto' },
      { key: 'contact_phone', label: 'Teléfono' },
      { key: 'contact_email', label: 'Correo' },
      { key: 'programming_target', label: 'Tipo de programación' },
      { key: 'solution_type', label: 'Tipo de solución' },
      { key: 'need_summary', label: 'Objetivo solicitado' },
      { key: 'update_changes', label: 'Cambios solicitados' },
    ],
  },
  {
    id: 'equipment',
    title: 'Equipo, impresora y conexiones',
    description: 'Información técnica del equipo y evidencias visuales recibidas.',
    fields: [
      { key: 'printer_model', label: 'Modelo de impresora TSC' },
      { key: 'firmware_version', label: 'Firmware' },
      { key: 'firmware_text', label: 'Versión de firmware' },
      { key: 'connected_elements', label: 'Elementos conectados' },
      { key: 'standalone_operation', label: 'Operación sin computadora' },
      { key: 'printer_photos', label: 'Fotos de impresora, etiqueta, conexiones y pantalla' },
    ],
  },
  {
    id: 'material',
    title: 'Material, formato e impresión',
    description: 'Medidas, orientación, copias, diseño y referencias visuales.',
    fields: [
      { key: 'output_type', label: 'Tipo de salida' },
      { key: 'print_dimensions', label: 'Medidas exactas' },
      { key: 'material_distribution', label: 'Distribución del material' },
      { key: 'multiple_distribution_detail', label: 'Distribución múltiple' },
      { key: 'orientation', label: 'Orientación' },
      { key: 'length_type', label: 'Largo fijo o variable' },
      { key: 'variable_length_rule', label: 'Regla de largo variable' },
      { key: 'copy_rule', label: 'Regla de copias' },
      { key: 'fixed_copies', label: 'Copias fijas' },
      { key: 'copies_range', label: 'Rango de copias' },
      { key: 'has_approved_design', label: 'Cuenta con diseño aprobado' },
      { key: 'design_samples', label: 'Muestras de diseño' },
      { key: 'has_logo', label: 'Lleva logo o imagen' },
      { key: 'logo_files', label: 'Archivos de logo' },
      { key: 'logo_variants', label: 'Variantes de logo' },
      { key: 'visual_blocks', label: 'Cuadros, divisiones o fondos' },
      { key: 'visual_reference', label: 'Referencia visual' },
    ],
  },
  {
    id: 'barcode',
    title: 'Códigos de barras y QR',
    description: 'Requisitos de codificación, lectura y formato del código.',
    fields: [
      { key: 'requires_barcode', label: 'Requiere código de barras o QR' },
      { key: 'barcode_type', label: 'Tipo de código' },
      { key: 'barcode_value', label: 'Contenido o fórmula' },
      { key: 'barcode_human_text', label: 'Texto legible debajo' },
      { key: 'barcode_gs1_ai', label: 'Identificadores GS1' },
      { key: 'barcode_ean_upc', label: 'Datos EAN/UPC' },
    ],
  },
  {
    id: 'scale',
    title: 'Báscula y pesaje',
    description: 'Datos de indicador, cadena, unidades, decimales, tara y cálculos.',
    fields: [
      { key: 'scale_model', label: 'Indicador' },
      { key: 'scale_chain', label: 'Cadena de báscula' },
      { key: 'scale_manual_weight', label: 'Peso manual permitido' },
      { key: 'scale_units', label: 'Unidades' },
      { key: 'scale_min_weight', label: 'Peso mínimo' },
      { key: 'scale_max_weight', label: 'Peso máximo' },
      { key: 'scale_decimals', label: 'Decimales' },
      { key: 'scale_mid_rule', label: 'Regla MID$' },
      { key: 'scale_tare', label: 'Tara' },
      { key: 'scale_printed_weights', label: 'Pesos a imprimir' },
      { key: 'scale_operation_type', label: 'Tipo de operación' },
      { key: 'scale_sequence_rule', label: 'Secuencia de pesadas' },
      { key: 'scale_calculations', label: 'Cálculos requeridos' },
      { key: 'scale_pieces_factor', label: 'Factor de piezas' },
      { key: 'scale_list_each', label: 'Listar cada pesada' },
      { key: 'scale_growing_length', label: 'Largo dinámico' },
      { key: 'scale_clear_rule', label: 'Limpieza temporal' },
    ],
  },
  {
    id: 'database',
    title: 'Base de datos',
    description: 'Origen de datos, archivos o integración indicada por el cliente.',
    fields: [
      { key: 'uses_database', label: 'Cuenta con base de datos' },
      { key: 'database_type', label: 'Tipo de base de datos' },
      { key: 'database_description', label: 'Descripción de base o integración' },
      { key: 'database_files', label: 'Archivos de referencia' },
    ],
  },
  {
    id: 'history',
    title: 'Historial y reportes',
    description: 'Columnas, salidas, filtros, totales y reglas de descarga o borrado.',
    fields: [
      { key: 'saves_history', label: 'Guarda historial' },
      { key: 'history_columns', label: 'Columnas del historial' },
      { key: 'history_output', label: 'Salida del reporte' },
      { key: 'software_report_output', label: 'Salida de reporte en software' },
      { key: 'history_report_type', label: 'Tipo de reporte' },
      { key: 'history_filters', label: 'Filtros requeridos' },
      { key: 'history_totals', label: 'Totales y agrupaciones' },
      { key: 'history_delete_after_download', label: 'Borrar al descargar' },
      { key: 'history_delete_key', label: 'Clave o confirmación para borrar' },
      { key: 'history_reset_folio', label: 'Restablecer folio' },
      { key: 'history_empty_message', label: 'Sin registros' },
      { key: 'history_filename', label: 'Nombre de archivo' },
    ],
  },
  {
    id: 'domain',
    title: 'Datos específicos del proceso',
    description: 'Información propia de estacionamiento, exportación, producción, comedor o turnos.',
    fields: [
      { key: 'parking_business_data', label: 'Datos del estacionamiento' },
      { key: 'parking_tickets', label: 'Tickets necesarios' },
      { key: 'parking_entry_exit_data', label: 'Captura entrada/salida' },
      { key: 'parking_identifier', label: 'Identificador' },
      { key: 'parking_initial_fee', label: 'Tarifa inicial' },
      { key: 'parking_included_time', label: 'Duración incluida' },
      { key: 'parking_extra_fees', label: 'Tarifas posteriores' },
      { key: 'parking_tolerance', label: 'Minutos de tolerancia' },
      { key: 'parking_daily_max', label: 'Tarifas especiales' },
      { key: 'parking_exceptions', label: 'Excepciones' },
      { key: 'parking_reports', label: 'Reportes de estacionamiento' },
      { key: 'parking_reset_folio', label: 'Restablecer folio' },
      { key: 'agri_product_data', label: 'Datos del producto agrícola' },
      { key: 'agri_parties', label: 'Productor/exportador/importador' },
      { key: 'agri_countries_legal', label: 'Países y textos legales' },
      { key: 'agri_codes', label: 'Códigos regulatorios' },
      { key: 'agri_dates', label: 'Fechas y caducidad' },
      { key: 'agri_authorizations', label: 'Autorizaciones' },
      { key: 'agri_labels', label: 'Etiquetas requeridas' },
      { key: 'agri_master_table', label: 'Tabla maestra' },
      { key: 'agri_test_data', label: 'Datos de prueba agrícolas' },
      { key: 'production_process', label: 'Proceso productivo' },
      { key: 'production_actions', label: 'Acciones del sistema' },
      { key: 'production_validations', label: 'Validaciones' },
      { key: 'production_duplicates', label: 'Duplicados' },
      { key: 'production_inventory', label: 'Inventario' },
      { key: 'production_fifo', label: 'FIFO' },
      { key: 'production_closures', label: 'Cierres' },
      { key: 'production_waste', label: 'Merma y registros' },
      { key: 'production_approvals', label: 'Aprobaciones' },
      { key: 'production_reports', label: 'Reportes de producción' },
      { key: 'cafeteria_identification', label: 'Identificación comedor' },
      { key: 'cafeteria_employee_data', label: 'Base de empleados' },
      { key: 'cafeteria_limits', label: 'Límites de consumo' },
      { key: 'cafeteria_types', label: 'Tipos de consumo' },
      { key: 'cafeteria_rules', label: 'Reglas comedor' },
      { key: 'cafeteria_prints', label: 'Impresión comedor' },
      { key: 'cafeteria_reports', label: 'Reportes comedor' },
      { key: 'turn_services', label: 'Servicios o áreas' },
      { key: 'turn_prefixes', label: 'Prefijos y folios' },
      { key: 'turn_reset_rule', label: 'Reinicio de turnos' },
      { key: 'turn_priority', label: 'Turnos prioritarios' },
      { key: 'turn_ticket_data', label: 'Datos del ticket' },
      { key: 'turn_reports', label: 'Reportes de turnos' },
      { key: 'turn_csv_services', label: 'Servicios desde CSV' },
    ],
  },
  {
    id: 'delivery',
    title: 'Entrega, pruebas y aprobación',
    description: 'Criterios de prueba, validadores y confirmación final.',
    fields: [
      { key: 'required_files', label: 'Archivos requeridos' },
      { key: 'test_equipment', label: 'Equipo para pruebas' },
      { key: 'test_data', label: 'Datos reales de prueba' },
      { key: 'error_cases', label: 'Casos de error' },
      { key: 'validator_person', label: 'Persona que valida' },
      { key: 'design_approval_person', label: 'Persona que aprueba diseño' },
      { key: 'test_date', label: 'Fecha de prueba' },
      { key: 'extra_notes', label: 'Observaciones' },
      { key: 'final_approval', label: 'Confirmación final' },
    ],
  },
];

export function FormsDashboard({ session, onOpenHub }: FormsDashboardProps) {
  const queryClient = useQueryClient();
  const responsesRef = useRef<HTMLElement | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<FormResponseRow | null>(null);

  const formQuery = useQuery({
    queryKey: ['requirement-form', session.user.id],
    queryFn: () => getOrCreateRequirementForm(session.user.id),
  });

  const form = formQuery.data ?? null;
  const shareUrl = form ? getFormShareUrl(form.slug) : '';

  const responseCountsQuery = useQuery({
    queryKey: ['form-response-counts', session.user.id],
    queryFn: getFormResponseCounts,
    refetchInterval: 1000 * 45,
  });

  const notificationsQuery = useQuery({
    queryKey: ['form-notifications', session.user.id],
    queryFn: getFormNotifications,
    refetchInterval: 1000 * 30,
  });

  const responsesQuery = useQuery({
    queryKey: ['form-responses', form?.id],
    queryFn: () => getFormResponses(form?.id ?? ''),
    enabled: Boolean(form?.id),
  });

  const responses = responsesQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const unreadNotifications = notifications.filter((notification) => !notification.is_read);
  const responseCount = useMemo(() => {
    const counts = responseCountsQuery.data ?? [];
    if (!form) return 0;
    return counts.find((item) => item.form_id === form.id)?.count ?? responses.length;
  }, [form, responseCountsQuery.data, responses.length]);

  const readNotificationsMutation = useMutation({
    mutationFn: (ids?: string[]) => markFormNotificationsAsRead(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['form-notifications'] });
    },
  });

  const deleteResponseMutation = useMutation({
    mutationFn: (responseId: string) => deleteFormResponse(responseId),
    onSuccess: () => {
      setSelectedResponse(null);
      void queryClient.invalidateQueries({ queryKey: ['form-responses'] });
      void queryClient.invalidateQueries({ queryKey: ['form-response-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['form-notifications'] });
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`requirement-form-notifications-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'form_notifications',
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['form-notifications'] });
          void queryClient.invalidateQueries({ queryKey: ['form-response-counts'] });
          void queryClient.invalidateQueries({ queryKey: ['form-responses'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, session.user.id]);

  async function copyShareLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  }

  function scrollToResponses() {
    responsesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function refreshData() {
    void queryClient.invalidateQueries({ queryKey: ['requirement-form'] });
    void queryClient.invalidateQueries({ queryKey: ['form-response-counts'] });
    void queryClient.invalidateQueries({ queryKey: ['form-notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['form-responses'] });
  }

  function confirmDeleteResponse(response: FormResponseRow) {
    const client = getAnswerLabel(response, 'company_name') || 'este levantamiento';
    if (!window.confirm(`¿Deseas eliminar la respuesta de ${client}? Esta acción no se puede deshacer.`)) return;
    deleteResponseMutation.mutate(response.id);
  }

  return (
    <div className="admin-shell forms-shell requirement-admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Formularios</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones de formularios">
          <button className="active" type="button" onClick={scrollToResponses}>
            <ClipboardList size={18} />
            Programaciones
          </button>
        </nav>

        <section className="forms-sidebar-summary" aria-label="Resumen de formularios">
          <div className="forms-sidebar-metric">
            <span>Formularios</span>
            <strong>1</strong>
          </div>
          <div className="forms-sidebar-metric">
            <span>Respuestas</span>
            <strong>{responseCount}</strong>
          </div>
          <div className="forms-sidebar-table">
            <div className="forms-sidebar-table-head">
              <span>Formulario</span>
              <span>Resp.</span>
              <span></span>
            </div>
            <div className="forms-sidebar-table-row">
              <span title={REQUIREMENT_FORM_TITLE}>Levantamiento técnico</span>
              <strong>{responseCount}</strong>
              <button type="button" onClick={scrollToResponses}>
                Ver
              </button>
            </div>
          </div>
        </section>

        <section className="forms-sidebar-notifications" aria-label="Notificaciones de formularios">
          <div className="forms-notification-head">
            <span>
              <Bell size={16} />
              Notificaciones
            </span>
            <strong>{unreadNotifications.length}</strong>
          </div>
          {unreadNotifications.length > 0 ? (
            <button
              type="button"
              className="forms-mark-read-button"
              onClick={() => readNotificationsMutation.mutate(undefined)}
              disabled={readNotificationsMutation.isPending}
            >
              Marcar todas como leídas
            </button>
          ) : null}
          <div className="forms-notification-list">
            {notifications.slice(0, 6).map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={notification.is_read ? 'forms-notification-card' : 'forms-notification-card unread'}
                onClick={() => {
                  scrollToResponses();
                  if (!notification.is_read) {
                    readNotificationsMutation.mutate([notification.id]);
                  }
                }}
              >
                <strong>{notification.title}</strong>
                <span>{notification.message}</span>
                <small>{formatNotificationAnswers(notification.answers)}</small>
              </button>
            ))}
            {!notificationsQuery.isLoading && notifications.length === 0 ? (
              <p className="forms-sidebar-empty">Sin respuestas nuevas.</p>
            ) : null}
          </div>
        </section>

        <SidebarUserFooter
          email={session.user.email}
          statusLabel="Sesión activa"
          onSignOut={() => {
            void supabase.auth.signOut();
          }}
        />
      </aside>

      <main className="admin-workspace forms-workspace">
        <section className="forms-hero requirement-hero">
          <div>
            <p className="eyebrow">Formulario maestro</p>
            <h2>{REQUIREMENT_FORM_TITLE}</h2>
            <span>
              Un levantamiento técnico por pasos para proyectos de programación, impresión, pesaje, CSV,
              trazabilidad y reportes.
            </span>
          </div>
          <div className="form-editor-actions">
            <button type="button" className="secondary-button" onClick={refreshData}>
              <RefreshCw size={18} />
              Actualizar
            </button>
            <button type="button" className="secondary-button" onClick={copyShareLink} disabled={!shareUrl}>
              {copiedLink ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              {copiedLink ? 'Copiado' : 'Copiar link'}
            </button>
            <a className="primary-button" href={shareUrl} target="_blank" rel="noreferrer">
              <Eye size={18} />
              Abrir formulario
            </a>
          </div>
        </section>

        <section className="requirement-admin-grid">
          <article className="panel requirement-admin-card">
            <div className="panel-header">
              <div>
                <h2>Link para clientes</h2>
                <span>Comparte este enlace para contestar desde computadora, tableta o teléfono.</span>
              </div>
              <Link2 size={22} />
            </div>
            {formQuery.isLoading ? (
              <EmptyState title="Preparando formulario">Creando o consultando el formulario maestro...</EmptyState>
            ) : (
              <div className="form-share-box requirement-share-box">
                <span>{shareUrl}</span>
                <button type="button" onClick={copyShareLink}>
                  {copiedLink ? 'Link copiado' : 'Copiar'}
                </button>
              </div>
            )}
          </article>

          <article className="panel requirement-admin-card">
            <div className="panel-header">
              <div>
                <h2>Última respuesta</h2>
                <span>Resumen rápido del levantamiento más reciente.</span>
              </div>
              <FileText size={22} />
            </div>
            {responses[0] ? (
              <div className="requirement-last-response">
                <strong>{getAnswerLabel(responses[0], 'company_name') || 'Cliente sin nombre'}</strong>
                <span>{getAnswerLabel(responses[0], 'programming_target') || getAnswerLabel(responses[0], 'project_kind') || 'Tipo pendiente'}</span>
                <small>{formatDateTime(responses[0].submitted_at)}</small>
                <button type="button" className="secondary-button" onClick={() => setSelectedResponse(responses[0])}>
                  Ver detalle
                </button>
              </div>
            ) : (
              <EmptyState title="Sin respuestas">Aún no se ha recibido ningún levantamiento.</EmptyState>
            )}
          </article>
        </section>

        <section className="panel forms-responses-panel" ref={responsesRef}>
          <div className="panel-header">
            <div>
              <h2>Respuestas del formulario</h2>
              <span>{responses.length} respuestas recibidas</span>
            </div>
            <button type="button" className="secondary-button" onClick={() => downloadResponsesCsv(responses)}>
              <Download size={18} />
              Descargar CSV
            </button>
          </div>
          {responsesQuery.isLoading ? (
            <EmptyState title="Cargando">Consultando respuestas...</EmptyState>
          ) : null}
          {!responsesQuery.isLoading && responses.length === 0 ? (
            <EmptyState title="Sin respuestas">
              Cuando un cliente conteste el levantamiento, aparecerá aquí y se generará una notificación.
            </EmptyState>
          ) : null}
          {responses.length > 0 ? (
            <div className="requirement-response-table">
              <div className="requirement-response-head">
                <span>Cliente</span>
                <span>Programación</span>
                <span>Tipo</span>
                <span>Fecha</span>
                <span>Acciones</span>
              </div>
              {responses.map((response) => (
                <div className="requirement-response-row" key={response.id}>
                  <span>{getAnswerLabel(response, 'company_name') || 'Sin cliente'}</span>
                  <span>{getAnswerLabel(response, 'programming_target') || getAnswerLabel(response, 'project_kind') || 'Sin tipo'}</span>
                  <span>{getAnswerLabel(response, 'solution_type') || getAnswerLabel(response, 'project_kind') || 'Sin tipo'}</span>
                  <span>{formatDateTime(response.submitted_at)}</span>
                  <div className="requirement-response-actions">
                    <button type="button" onClick={() => setSelectedResponse(response)}>
                      Ver
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => confirmDeleteResponse(response)}
                      disabled={deleteResponseMutation.isPending}
                    >
                      <Trash2 size={14} />
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </main>

      {selectedResponse ? (
        <ResponseDetailModal response={selectedResponse} onClose={() => setSelectedResponse(null)} />
      ) : null}
    </div>
  );
}

function ResponseDetailModal({ response, onClose }: { response: FormResponseRow; onClose: () => void }) {
  const answers = response.answers;
  const attachments = collectAttachments(answers);
  const inlineImages = collectInlineImages(answers);
  const executiveSummary = buildResponseExecutiveSummary(response);
  const sections = buildResponseSections(answers);
  const knownKeys = new Set(sections.flatMap((section) => section.fields.map((field) => field.key)));
  const extraEntries = Object.entries(answers).filter(([key, value]) => !knownKeys.has(key) && !isInternalField(key) && !isEmptyDetailValue(value));

  return (
    <div className="requirement-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="requirement-response-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="requirement-modal-header">
          <div>
            <p className="eyebrow">Levantamiento recibido</p>
            <h2>{getValue(answers, 'company_name') || 'Cliente sin nombre'}</h2>
            <span>{formatDateTime(response.submitted_at)}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        <section className="requirement-response-summary">
          <div className="requirement-summary-main">
            <span className="requirement-summary-icon">
              <Sparkles size={22} />
            </span>
            <div>
              <p className="eyebrow">Lectura ejecutiva</p>
              <h3>{executiveSummary.title}</h3>
              <p>{executiveSummary.description}</p>
            </div>
          </div>
          <div className="requirement-summary-metrics">
            {executiveSummary.metrics.map((metric) => (
              <article key={metric.label}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
          <div className="requirement-guidance-grid">
            <article>
              <small>Orientación técnica</small>
              <p>{executiveSummary.guidance}</p>
            </article>
            <article>
              <small>Pendientes detectados</small>
              <ul>
                {executiveSummary.pending.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <small>Siguiente paso recomendado</small>
              <p>{executiveSummary.nextStep}</p>
            </article>
          </div>
        </section>

        <div className="requirement-modal-actions">
          <button type="button" className="secondary-button" onClick={() => downloadResponseJson(response)}>
            <Download size={18} />
            JSON
          </button>
          <button type="button" className="secondary-button" onClick={() => downloadSingleResponseCsv(response)}>
            <Download size={18} />
            CSV
          </button>
          <button type="button" className="secondary-button" onClick={() => downloadResponseMarkdown(response)}>
            <Download size={18} />
            Especificación
          </button>
        </div>

        <div className="requirement-detail-sections">
          {sections.map((section) => (
            <section className="requirement-detail-section" key={section.id}>
              <header>
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
              </header>
              <div className="requirement-answer-grid">
                {section.fields
                  .filter((field) => !isEmptyDetailValue(answers[field.key]))
                  .map((field) => (
                    <DetailValueCard key={field.key} label={field.label} value={answers[field.key]} />
                  ))}
              </div>
            </section>
          ))}
          {extraEntries.length > 0 ? (
            <section className="requirement-detail-section">
              <header>
                <div>
                  <h3>Otros datos recibidos</h3>
                  <p>Información adicional capturada por el cliente fuera de las secciones principales.</p>
                </div>
              </header>
              <div className="requirement-answer-grid">
                {extraEntries.map(([key, value]) => (
                  <DetailValueCard key={key} label={humanizeKey(key)} value={value} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {inlineImages.length > 0 ? (
          <section className="requirement-attachments requirement-inline-images">
            <h3>Imágenes enviadas</h3>
            <div>
              {inlineImages.map((image) => (
                <figure key={`${image.name}-${image.processed_at}`}>
                  <img src={image.data_url} alt={image.name} />
                  <figcaption>{image.name}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {attachments.length > 0 ? (
          <section className="requirement-attachments">
            <h3>Adjuntos</h3>
            <div>
              {attachments.map((attachment) => (
                <button
                  type="button"
                  key={attachment.path}
                  onClick={async () => {
                    const url = await getAttachmentSignedUrl(attachment.path);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  {attachment.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function getAnswerLabel(response: FormResponseRow, key: string) {
  return getValue(response.answers, key);
}

function DetailValueCard({ label, value }: { label: string; value: unknown }) {
  if (Array.isArray(value) && value.every(isInlineImage)) {
    return (
      <div className="requirement-answer-card image-card">
        <small>{label}</small>
        <div className="requirement-answer-images-mini">
          {value.map((image) => (
            <img key={`${image.name}-${image.processed_at}`} src={image.data_url} alt={image.name} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="requirement-answer-card">
      <small>{label}</small>
      <pre>{formatValue(value)}</pre>
    </div>
  );
}

function buildResponseExecutiveSummary(response: FormResponseRow) {
  const answers = response.answers;
  const client = getValue(answers, 'company_name') || 'Cliente sin nombre';
  const projectKind = getValue(answers, 'project_kind') || 'Tipo de proyecto pendiente';
  const programmingTarget = getValue(answers, 'programming_target') || '';
  const solutionType = getValue(answers, 'solution_type') || 'Solución pendiente';
  const needSummary = getValue(answers, 'need_summary') || getValue(answers, 'update_changes') || 'No se capturó una descripción principal.';
  const usesDatabase = getValue(answers, 'uses_database');
  const savesHistory = getValue(answers, 'saves_history');
  const hasScaleProject = solutionType === 'Báscula / pesaje' || hasArrayValue(answers.connected_elements, 'báscula/indicador');
  const hasBarcode = getValue(answers, 'requires_barcode') === 'Sí';
  const complexitySignals = [
    hasScaleProject,
    hasBarcode,
    usesDatabase === 'Sí',
    savesHistory === 'Sí',
    Boolean(getValue(answers, 'software_report_output')),
    Boolean(getValue(answers, 'history_output')),
  ].filter(Boolean).length;
  const complexity = complexitySignals >= 4 ? 'Alta' : complexitySignals >= 2 ? 'Media' : 'Baja';
  const pending = getPendingItems(answers);

  return {
    title: `${client} solicita ${solutionType.toLowerCase()}`,
    description: `${projectKind}${programmingTarget ? ` para ${programmingTarget.toLowerCase()}` : ''}. ${needSummary}`,
    guidance: buildTechnicalGuidance(answers, complexity),
    nextStep: buildNextStep(answers, pending),
    pending: pending.length > 0 ? pending : ['No se detectaron pendientes críticos con la información enviada.'],
    metrics: [
      { label: 'Complejidad aparente', value: complexity },
      { label: 'Base de datos', value: usesDatabase || 'No indicado' },
      { label: 'Reportes / historial', value: savesHistory || 'No indicado' },
      { label: 'Adjuntos', value: String(collectAttachments(answers).length + collectInlineImages(answers).length) },
    ],
  };
}

function buildTechnicalGuidance(answers: Record<string, unknown>, complexity: string) {
  const target = getValue(answers, 'programming_target');
  const solutionType = getValue(answers, 'solution_type');
  const parts: string[] = [];

  if (target === 'Software con computadora') {
    parts.push('Conviene tratarlo como desarrollo de software con entregables de interfaz, reportes y validaciones de datos.');
  } else if (target === 'Desarrollo para impresora') {
    parts.push('Conviene tratarlo como desarrollo para impresora, cuidando medidas, material, comandos TSPL y restricciones del firmware.');
  }

  if (solutionType === 'Báscula / pesaje') {
    parts.push('La cadena de báscula debe validarse con muestras reales antes de cerrar alcance.');
  }
  if (getValue(answers, 'uses_database') === 'Sí') {
    parts.push('La integración de base de datos debe confirmarse con estructura, permisos y ejemplos reales.');
  }
  if (getValue(answers, 'requires_barcode') === 'Sí') {
    parts.push('El código de barras requiere prueba de lectura con datos reales del cliente.');
  }

  parts.push(`La complejidad inicial se estima como ${complexity.toLowerCase()}, sujeta a validar muestras y datos reales.`);
  return parts.join(' ');
}

function buildNextStep(answers: Record<string, unknown>, pending: string[]) {
  if (pending.length > 0) {
    return `Solicitar al cliente la información pendiente antes de estimar tiempos o iniciar programación: ${pending.slice(0, 2).join(' y ')}.`;
  }
  if (getValue(answers, 'programming_target') === 'Software con computadora') {
    return 'Preparar propuesta funcional con pantallas, reportes disponibles, reglas de validación y criterios de aceptación.';
  }
  return 'Preparar especificación técnica de impresión, validar medidas/material y solicitar prueba con equipo o muestras reales.';
}

function getPendingItems(answers: Record<string, unknown>) {
  const pending: string[] = [];
  if (!getValue(answers, 'company_name') && getValue(answers, 'project_kind') !== 'Actualización de programación existente') {
    pending.push('Nombre comercial del cliente');
  }
  if (!getValue(answers, 'need_summary') && !getValue(answers, 'update_changes')) {
    pending.push('Descripción clara del requerimiento');
  }
  if (getValue(answers, 'programming_target') === 'Desarrollo para impresora' && isEmptyDetailValue(answers.print_dimensions)) {
    pending.push('Medidas exactas de impresión');
  }
  if (getValue(answers, 'solution_type') === 'Báscula / pesaje' && !getValue(answers, 'scale_chain')) {
    pending.push('Cadena real de báscula');
  }
  if (getValue(answers, 'requires_barcode') === 'Sí' && !getValue(answers, 'barcode_value')) {
    pending.push('Contenido o fórmula del código de barras');
  }
  if (getValue(answers, 'uses_database') === 'Sí' && !getValue(answers, 'database_type')) {
    pending.push('Tipo de base de datos');
  }
  return pending;
}

function buildResponseSections(answers: Record<string, unknown>) {
  return responseDetailSections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => !isEmptyDetailValue(answers[field.key])),
    }))
    .filter((section) => section.fields.length > 0);
}

function getValue(answers: Record<string, unknown>, key: string) {
  const value = answers[key];
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatNotificationAnswers(answers: Record<string, unknown>) {
  const values = ['company_name', 'programming_target', 'solution_type', 'project_kind']
    .map((key) => getValue(answers, key))
    .filter(Boolean);

  if (values.length === 0) return 'Respuesta técnica recibida.';
  return values.slice(0, 4).join(' · ');
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item))).join('\n');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return String(value ?? 'Pendiente de confirmar');
}

function humanizeKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function collectAttachments(answers: Record<string, unknown>) {
  const attachments: RequirementAttachment[] = [];

  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAttachment(item)) attachments.push(item);
      }
    }
  }

  return attachments;
}

function collectInlineImages(answers: Record<string, unknown>) {
  const images: Array<{ name: string; data_url: string; processed_at: string }> = [];

  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isInlineImage(item)) images.push(item);
      }
    }
  }

  return images;
}

function isAttachment(value: unknown): value is RequirementAttachment {
  return Boolean(value && typeof value === 'object' && 'path' in value && 'name' in value);
}

function isInlineImage(value: unknown): value is { name: string; data_url: string; processed_at: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'name' in value &&
      'data_url' in value &&
      typeof (value as { data_url?: unknown }).data_url === 'string' &&
      (value as { data_url: string }).data_url.startsWith('data:image/'),
  );
}

function isInternalField(key: string) {
  return key === 'generated_at' || key === 'technical_note';
}

function isEmptyDetailValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return String(value).trim() === '';
}

function hasArrayValue(value: unknown, option: string) {
  return Array.isArray(value) && value.map(String).includes(option);
}

function downloadResponsesCsv(responses: FormResponseRow[]) {
  const rows = responses.map((response) => ({
    fecha: response.submitted_at,
    cliente: getAnswerLabel(response, 'company_name'),
    contacto: getAnswerLabel(response, 'contact_name'),
    programacion: getAnswerLabel(response, 'programming_target'),
    tipo: getAnswerLabel(response, 'project_kind'),
    solucion: getAnswerLabel(response, 'solution_type'),
    resumen: getAnswerLabel(response, 'need_summary'),
  }));
  downloadBlob(toCsv(rows), 'levantamientos-programacion.csv', 'text/csv;charset=utf-8');
}

function downloadSingleResponseCsv(response: FormResponseRow) {
  const rows = Object.entries(response.answers).map(([campo, valor]) => ({
    campo,
    valor: formatValue(valor),
  }));
  downloadBlob(toCsv(rows), `levantamiento-${getResponseReference(response)}.csv`, 'text/csv;charset=utf-8');
}

function downloadResponseJson(response: FormResponseRow) {
  downloadBlob(JSON.stringify(response, null, 2), `levantamiento-${getResponseReference(response)}.json`, 'application/json');
}

function downloadResponseMarkdown(response: FormResponseRow) {
  const markdown = [
    `# ${REQUIREMENT_FORM_TITLE}`,
    '',
    `Cliente: ${getAnswerLabel(response, 'company_name') || 'Pendiente de confirmar'}`,
    `Tipo de programación: ${getAnswerLabel(response, 'programming_target') || getAnswerLabel(response, 'project_kind') || 'Pendiente de confirmar'}`,
    `Fecha: ${formatDateTime(response.submitted_at)}`,
    '',
    '## Respuestas',
    ...Object.entries(response.answers).flatMap(([key, value]) => [`### ${humanizeKey(key)}`, formatValue(value), '']),
    '## Instrucción técnica',
    'No usar RECORDSET$. Las consultas CSV deben resolverse con OPEN, READ, SEEK, FSEARCH, MID$, INSTR y separación controlada de columnas de acuerdo con el firmware.',
  ].join('\n');
  downloadBlob(markdown, `especificacion-${getResponseReference(response)}.md`, 'text/markdown;charset=utf-8');
}

function getResponseReference(response: FormResponseRow) {
  const company = getAnswerLabel(response, 'company_name')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return company || response.id;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? '').replace(/"/g, '""');
          return `"${value}"`;
        })
        .join(','),
    ),
  ].join('\n');
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
