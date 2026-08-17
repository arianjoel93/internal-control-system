import {
  CalendarClock,
  ClipboardList,
  FileText,
  Hash,
  Mail,
  PencilLine,
  Printer,
  Save,
  Ticket,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  businessDaysElapsedSince,
  businessDaysRemainingFromCreatedAt,
  daysRemainingFromNullable,
  formatDate,
  formatDateWithWeekday,
  formatTime,
} from "../../lib/dates";
import {
  getSupportFileUrlFromPath,
  getSupportImageUrl,
  isSupportPdf,
} from "../../lib/supportImages";
import {
  getCurrentSupportState,
  getLatestSupportEvent,
  getSupportStateHeaderColor,
  statusLabel,
} from "../../lib/tracking";
import type {
  SupportCaseWithEvents,
  SupportEvent,
  SupportImage,
} from "../../lib/types";
import { StatusBadge } from "../../components/StatusBadge";
import {
  deleteSupportEvent,
  respondToRepairApproval,
  sendSupportStatusEmail,
  type RepairApprovalDecision,
  updateSupportEventDescription,
  updateSupportCustomerEmail,
} from "./supportService";

type SupportDetailsProps = {
  cases: SupportCaseWithEvents[];
  disableFolioModal?: boolean;
  audience?: "public" | "admin";
  onSupportUpdated?: (supportCaseId: string) => void | Promise<void>;
};

const eventLabels: Record<SupportEvent["event_type"], string> = {
  ticket_created: "Creación de ticket",
  remote_support_scheduled: "Agendar soporte remoto",
  diagnosis: "Diagnóstico",
  repair: "Reparación",
  closed: "Cierre de soporte",
  note: "Nota",
};

type TimelineEvent = SupportEvent & {
  folio: string;
  serialNumber: string;
  supportCase: SupportCaseWithEvents;
};

export function SupportDetails({
  cases,
  disableFolioModal = false,
  audience = "public",
  onSupportUpdated,
}: SupportDetailsProps) {
  const [selectedCase, setSelectedCase] =
    useState<SupportCaseWithEvents | null>(null);
  const [repairDecision, setRepairDecision] =
    useState<RepairApprovalDecision | null>(null);
  const [repairDecisionSource, setRepairDecisionSource] = useState<
    SupportCaseWithEvents["repair_approval_response_source"]
  >(null);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairError, setRepairError] = useState("");
  const [customerEmailDraft, setCustomerEmailDraft] = useState("");
  const [savedCustomerEmail, setSavedCustomerEmail] = useState("");
  const [customerEmailSaving, setCustomerEmailSaving] = useState(false);
  const [customerEmailMessage, setCustomerEmailMessage] = useState("");
  const [sendingEventId, setSendingEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [editingDescription, setEditingDescription] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionError, setDescriptionError] = useState("");
  const [emailDeliveryStatusByEvent, setEmailDeliveryStatusByEvent] = useState<
    Record<string, "sent" | "failed">
  >({});
  const [emailFeedbackByEvent, setEmailFeedbackByEvent] = useState<
    Record<string, string>
  >({});
  const isPublicView = audience === "public";
  const latestCase = [...cases].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  const latestImages = sortImages(latestCase.support_images ?? []);
  const latestEvent = getLatestSupportEvent(latestCase);
  const currentState = getCurrentSupportState(latestCase);
  const isTechnicalSupport = latestCase.support_type === "technical";
  const daysRemaining = daysRemainingFromNullable(latestCase.warranty_end_date);
  const businessDaysRemaining = businessDaysRemainingFromCreatedAt(
    latestCase.created_at,
    latestCase.programming_business_days,
  );
  const businessDaysElapsed = businessDaysElapsedSince(latestCase.created_at);
  const warrantyLabel =
    daysRemaining !== null && daysRemaining >= 0 ? "Activa" : "Expirada";
  const currentRepairStatus =
    repairDecision ?? latestCase.repair_approval_status;
  const currentRepairSource =
    repairDecisionSource ?? latestCase.repair_approval_response_source;
  const allEvents: TimelineEvent[] = cases
    .flatMap((supportCase) =>
      supportCase.support_events.map((event) => ({
        ...event,
        folio: supportCase.folio,
        serialNumber: supportCase.serial_number,
        supportCase,
      })),
    )
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  const timelineGroups = useMemo(
    () => buildTimelineGroups(allEvents),
    [allEvents],
  );
  const supportBadgeStatus =
    latestCase.status === "closed"
      ? "closed"
      : latestCase.status === "pending"
        ? "pending"
        : "open";
  const headerStyle = isPublicView
    ? { background: getSupportStateHeaderColor(latestCase) }
    : undefined;
  const normalizedDraftEmail = customerEmailDraft.trim().toLowerCase();
  const normalizedSavedEmail = savedCustomerEmail.trim().toLowerCase();
  const canSendStatusEmails =
    Boolean(normalizedSavedEmail) &&
    normalizedDraftEmail === normalizedSavedEmail;

  useEffect(() => {
    setCustomerEmailDraft(latestCase.customer_email ?? "");
    setSavedCustomerEmail(latestCase.customer_email ?? "");
    setCustomerEmailMessage("");
    setEditingEvent(null);
    setEditingDescription("");
    setDescriptionError("");
    setRepairDecision(null);
    setRepairDecisionSource(null);
    setEmailDeliveryStatusByEvent({});
    setEmailFeedbackByEvent({});
    setSendingEventId(null);
  }, [latestCase.customer_email, latestCase.id]);

  async function answerRepairRequest(
    decision: RepairApprovalDecision,
    pin: string,
  ) {
    setRepairLoading(true);
    setRepairError("");

    try {
      await respondToRepairApproval(latestCase.id, pin, decision);
      setRepairDecision(decision);
      setRepairDecisionSource("customer");
      await onSupportUpdated?.(latestCase.id);
    } catch (error) {
      setRepairError(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la respuesta.",
      );
    } finally {
      setRepairLoading(false);
    }
  }

  async function saveCustomerEmail() {
    setCustomerEmailSaving(true);
    setCustomerEmailMessage("");

    try {
      const normalizedEmail = await updateSupportCustomerEmail({
        supportCaseId: latestCase.id,
        customerName: latestCase.customer_name,
        customerPhone: latestCase.customer_phone,
        email: customerEmailDraft,
      });
      setCustomerEmailDraft(normalizedEmail);
      setSavedCustomerEmail(normalizedEmail);
      setCustomerEmailMessage("Correo guardado.");
      await onSupportUpdated?.(latestCase.id);
    } catch (error) {
      setCustomerEmailMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el correo.",
      );
    } finally {
      setCustomerEmailSaving(false);
    }
  }

  async function sendMovementEmail(event: TimelineEvent) {
    if (hasDeliveredStatusEmail(event, emailDeliveryStatusByEvent[event.id])) {
      return;
    }

    setSendingEventId(event.id);
    setEmailFeedbackByEvent((current) => ({ ...current, [event.id]: "" }));

    try {
      const response = await sendSupportStatusEmail({
        supportCaseId: event.support_case_id,
        supportEventId: event.id,
      });
      setEmailDeliveryStatusByEvent((current) => ({
        ...current,
        [event.id]: "sent",
      }));
      setEmailFeedbackByEvent((current) => ({
        ...current,
        [event.id]: response.message || "Correo enviado.",
      }));
      await onSupportUpdated?.(event.support_case_id);
    } catch (error) {
      setEmailDeliveryStatusByEvent((current) => ({
        ...current,
        [event.id]: "failed",
      }));
      setEmailFeedbackByEvent((current) => ({
        ...current,
        [event.id]:
          error instanceof Error
            ? error.message
            : "No se pudo enviar el correo.",
      }));
    } finally {
      setSendingEventId(null);
    }
  }

  async function removeTimelineEvent(event: TimelineEvent) {
    const confirmed = globalThis.confirm(
      `¿Deseas borrar este paso del historial del folio ${event.folio}?`,
    );
    if (!confirmed) return;

    setDeletingEventId(event.id);
    setEmailFeedbackByEvent((current) => ({ ...current, [event.id]: "" }));

    try {
      await deleteSupportEvent({
        supportCase: event.supportCase,
        supportEvent: event,
      });
      setEmailFeedbackByEvent((current) => ({
        ...current,
        [event.id]: "Movimiento eliminado.",
      }));
      await onSupportUpdated?.(event.support_case_id);
    } catch (error) {
      setEmailFeedbackByEvent((current) => ({
        ...current,
        [event.id]:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el movimiento.",
      }));
    } finally {
      setDeletingEventId(null);
    }
  }

  async function saveEventDescription() {
    if (!editingEvent) return;

    setDescriptionSaving(true);
    setDescriptionError("");

    try {
      await updateSupportEventDescription({
        supportEventId: editingEvent.id,
        description: editingDescription,
      });
      await onSupportUpdated?.(editingEvent.support_case_id);
      setEditingEvent(null);
      setEditingDescription("");
    } catch (error) {
      setDescriptionError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la descripción.",
      );
    } finally {
      setDescriptionSaving(false);
    }
  }

  function openCaseDetail(supportCase: SupportCaseWithEvents) {
    if (!disableFolioModal) {
      setSelectedCase(supportCase);
    }
  }

  return (
    <section className="results-grid">
      <div className="result-overview">
        <StatCard
          icon={<Ticket />}
          label="Folio consultado"
          value={latestCase.folio}
        />
        <StatCard
          icon={<Ticket />}
          label="Folios encontrados"
          value={String(cases.length)}
        />
        <StatCard
          icon={<ClipboardList />}
          label="Movimientos"
          value={String(allEvents.length)}
        />
        {!isPublicView ? (
          <StatCard
            icon={<Hash />}
            label="Estado actual"
            value={currentState}
          />
        ) : null}
      </div>

      <article className="panel support-summary">
        <div
          className={
            isPublicView
              ? "panel-header dynamic-status"
              : "panel-header tracking"
          }
          style={headerStyle}
        >
          <div>
            <h2>Estado actual del soporte</h2>
            <small>
              Folio:{" "}
              {disableFolioModal ? (
                <span className="folio-text">{latestCase.folio}</span>
              ) : (
                <button
                  type="button"
                  className="folio-link"
                  onClick={() => openCaseDetail(latestCase)}
                >
                  {latestCase.folio}
                </button>
              )}
            </small>
          </div>
          <StatusBadge status={supportBadgeStatus} label={currentState} />
        </div>
        <div className="summary-grid">
          <SummaryItem
            label="Tipo de soporte"
            value={isTechnicalSupport ? "Técnico" : "Programación"}
          />
          {!isPublicView ? (
            <SummaryItem
              icon={<ClipboardList />}
              label="Estado del soporte"
              value={currentState}
            />
          ) : null}
          {!isPublicView ? (
            <SummaryItem
              label="Último movimiento"
              value={latestEvent?.title ?? statusLabel(latestCase.status)}
            />
          ) : null}
          <SummaryItem
            label="Fecha del último movimiento"
            value={
              latestEvent
                ? formatDate(latestEvent.event_date)
                : formatDate(latestCase.created_at)
            }
          />
          {isPublicView ? (
            <>
              <SummaryItem
                icon={<UserRound />}
                label="Agente de soporte"
                value={getPublicAgentName(latestCase.performed_by)}
              />
              <SummaryItem
                label="Descripción"
                value={latestCase.issue_summary || "Sin descripción"}
                wide
              />
            </>
          ) : null}
          {isTechnicalSupport ? (
            <>
              <SummaryItem
                label="Estatus de garantía"
                value={warrantyLabel}
                tone={
                  daysRemaining !== null && daysRemaining >= 0 ? "good" : "bad"
                }
              />
            </>
          ) : null}
          {!isTechnicalSupport ? (
            <>
              <SummaryItem
                label="Días hábiles del servicio"
                value={
                  latestCase.programming_business_days
                    ? String(latestCase.programming_business_days)
                    : "Sin dato"
                }
              />
              <SummaryItem
                icon={<CalendarClock />}
                label="Días hábiles restantes"
                value={
                  businessDaysRemaining === null
                    ? "Sin dato"
                    : String(businessDaysRemaining)
                }
                tone={
                  businessDaysRemaining !== null && businessDaysRemaining > 0
                    ? "good"
                    : "bad"
                }
              />
              {latestCase.programming_business_days ? (
                <SummaryItem
                  label="Días hábiles transcurridos"
                  value={String(businessDaysElapsed)}
                />
              ) : null}
            </>
          ) : null}
          <SummaryItem
            icon={<Printer />}
            label="Fabricante"
            value={latestCase.manufacturer}
          />
          <SummaryItem label="Modelo" value={latestCase.printer_model} />
          {!isPublicView ? (
            <SummaryItem
              label="Número de parte"
              value={latestCase.part_number ?? "Sin dato"}
            />
          ) : null}
          <SummaryItem
            label="Número de serie"
            value={latestCase.serial_number}
          />
          {isTechnicalSupport ? (
            <>
              <SummaryItem
                label="Fecha de venta"
                value={formatDate(latestCase.sale_date)}
              />
              <SummaryItem
                label="Fin de la garantía"
                value={formatDate(latestCase.warranty_end_date)}
              />
              <SummaryItem
                icon={<CalendarClock />}
                label="Días restantes de garantía"
                value={
                  daysRemaining === null ? "Sin dato" : String(daysRemaining)
                }
                tone={
                  daysRemaining !== null && daysRemaining >= 0 ? "good" : "bad"
                }
              />
            </>
          ) : null}
          {!isPublicView ? (
            <>
              <SummaryItem
                icon={<UserRound />}
                label="Cliente"
                value={latestCase.customer_name}
              />
              <SummaryItem
                label="Correo"
                value={savedCustomerEmail || "Sin dato"}
              />
              <SummaryItem
                label="Teléfono"
                value={latestCase.customer_phone ?? "Sin dato"}
              />
              <SummaryItem
                icon={<UserRound />}
                label="Quién realizó el soporte"
                value={latestCase.performed_by}
              />
            </>
          ) : null}
        </div>
        {!isPublicView ? (
          <div className="support-email-editor">
            <label className="field">
              <span>Correo del cliente</span>
              <input
                type="email"
                value={customerEmailDraft}
                onChange={(event) => {
                  setCustomerEmailDraft(event.target.value);
                  setCustomerEmailMessage("");
                }}
                placeholder="cliente@empresa.com"
              />
            </label>
            <button
              type="button"
              className="secondary-button email-save-button"
              onClick={saveCustomerEmail}
              disabled={customerEmailSaving}
            >
              <Save size={16} />
              {customerEmailSaving ? "Guardando..." : "Guardar correo"}
            </button>
            {customerEmailMessage ? (
              <small className="email-editor-message">
                {customerEmailMessage}
              </small>
            ) : null}
          </div>
        ) : null}
        {!isPublicView &&
        isTechnicalSupport &&
        hasRepairRequestInfo(latestCase) ? (
          <RepairRequestAdminBox
            status={currentRepairStatus}
            responseSource={currentRepairSource}
            repairRequestNote={latestCase.repair_request_note}
            deadline={latestCase.repair_approval_deadline}
            approvalPin={latestCase.repair_approval_pin}
            quotePdfPath={latestCase.repair_quote_pdf_path}
            quotePdfName={latestCase.repair_quote_pdf_name}
          />
        ) : null}
        {isPublicView && isTechnicalSupport && latestCase.repair_required ? (
          <RepairApprovalBox
            status={currentRepairStatus}
            responseSource={currentRepairSource}
            repairRequestNote={latestCase.repair_request_note}
            deadline={latestCase.repair_approval_deadline}
            quotePdfPath={latestCase.repair_quote_pdf_path}
            quotePdfName={latestCase.repair_quote_pdf_name}
            isLoading={repairLoading}
            error={repairError}
            onAnswer={answerRepairRequest}
          />
        ) : null}
        {latestImages.length > 0 ? (
          <SupportImageGallery images={latestImages} />
        ) : null}
      </article>

      <article className="panel timeline-panel">
        <div className="panel-header">
          <h2>Historial del folio</h2>
          <span>
            {timelineGroups.length} estado
            {timelineGroups.length === 1 ? "" : "s"}
            {timelineGroups.length !== allEvents.length
              ? ` · ${allEvents.length} movimientos`
              : ""}
          </span>
        </div>
        {timelineGroups.length > 0 ? (
          <ol className="timeline">
            {timelineGroups.map((group) => {
              const groupLabel =
                group.title || eventLabels[group.items[0].event_type];

              return (
                <li key={group.id}>
                  <time className="date-pill">
                    {formatDateWithWeekday(group.event_date)}
                  </time>
                  <div className="timeline-card">
                    <span className="timeline-dot" />
                    <div className="timeline-card-header">
                      <strong>{groupLabel}</strong>
                      {group.items.length > 1 ? (
                        <small>{group.items.length} actualizaciones</small>
                      ) : null}
                    </div>
                    <div className="timeline-updates">
                      {group.items.map((event) => {
                        const eventDescription = getTimelineEventDescription(
                          event,
                          event.supportCase,
                        );
                        const emailSent = hasDeliveredStatusEmail(
                          event,
                          emailDeliveryStatusByEvent[event.id],
                        );
                        const canEditDescription = !eventDescription;
                        const canSendThisEmail =
                          canSendStatusEmails && !emailSent;
                        const emailButtonTitle = emailSent
                          ? "Correo enviado correctamente."
                          : canSendThisEmail
                            ? "Enviar estado por correo"
                            : canSendStatusEmails
                              ? "Este movimiento ya fue enviado por correo"
                              : normalizedDraftEmail
                                ? "Guarda el correo antes de enviar"
                                : "Primero guarda el correo del cliente";

                        return (
                          <div key={event.id} className="timeline-update">
                            <div className="timeline-update-header">
                              <div className="timeline-update-time">
                                {formatTime(event.event_date)}
                              </div>
                              {!isPublicView ? (
                                <div className="timeline-update-actions">
                                  <button
                                    type="button"
                                    className={`icon-button timeline-mail-button ${emailSent ? "is-sent" : "is-pending"}`}
                                    onClick={() => sendMovementEmail(event)}
                                    disabled={
                                      sendingEventId === event.id ||
                                      !canSendThisEmail
                                    }
                                    aria-label="Enviar estado por correo"
                                    title={emailButtonTitle}
                                  >
                                    <Mail size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-button danger-action timeline-delete-button"
                                    onClick={() => removeTimelineEvent(event)}
                                    disabled={deletingEventId === event.id}
                                    aria-label="Borrar paso del historial"
                                    title="Borrar este paso del historial"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                  {canEditDescription ? (
                                    <button
                                      type="button"
                                      className="icon-button timeline-edit-button"
                                      onClick={() => {
                                        setEditingEvent(event);
                                        setEditingDescription("");
                                        setDescriptionError("");
                                      }}
                                      aria-label="Agregar descripción"
                                      title="Agregar descripción del movimiento"
                                    >
                                      <PencilLine size={16} />
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {eventDescription ? (
                              <p className="ticket-line">{eventDescription}</p>
                            ) : null}
                            {event.shipping_carrier && event.tracking_number ? (
                              <div className="shipping-note">
                                <Truck size={16} />
                                <span>
                                  Envío por{" "}
                                  <strong>{event.shipping_carrier}</strong>.
                                  Guía: <strong>{event.tracking_number}</strong>
                                </span>
                              </div>
                            ) : null}
                            {!isPublicView && emailFeedbackByEvent[event.id] ? (
                              <small className="timeline-email-feedback">
                                {emailFeedbackByEvent[event.id]}
                              </small>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {disableFolioModal ? (
                      <span className="folio-chip">Folio {group.folio}</span>
                    ) : (
                      <button
                        type="button"
                        className="folio-chip folio-button"
                        onClick={() => openCaseDetail(group.supportCase)}
                      >
                        Folio {group.folio}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="timeline-empty">
            Este folio aún no tiene movimientos registrados.
          </div>
        )}
      </article>

      {selectedCase ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalle del folio ${selectedCase.folio}`}
        >
          <section className="modal-card modal-wide">
            <div className="modal-head">
              <h2>Detalle del folio {selectedCase.folio}</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setSelectedCase(null)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="support-detail-modal">
              <SupportDetails
                cases={[selectedCase]}
                disableFolioModal
                audience={audience}
                onSupportUpdated={onSupportUpdated}
              />
            </div>
          </section>
        </div>
      ) : null}
      {editingEvent ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Agregar descripción del movimiento"
        >
          <section className="modal-card">
            <div className="modal-head">
              <h2>Agregar descripción</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  if (descriptionSaving) return;
                  setEditingEvent(null);
                  setEditingDescription("");
                  setDescriptionError("");
                }}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="support-event-description-modal">
              <label className="field">
                <span>Descripción del movimiento</span>
                <textarea
                  rows={4}
                  value={editingDescription}
                  onChange={(event) => {
                    setEditingDescription(event.target.value);
                    setDescriptionError("");
                  }}
                  placeholder="Escribe el mensaje de interés de esta actualización"
                />
              </label>
              {descriptionError ? (
                <p className="form-error">{descriptionError}</p>
              ) : null}
              <div className="permission-modal-actions">
                <button
                  type="button"
                  onClick={saveEventDescription}
                  disabled={descriptionSaving}
                >
                  {descriptionSaving ? "Guardando..." : "Guardar descripción"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    if (descriptionSaving) return;
                    setEditingEvent(null);
                    setEditingDescription("");
                    setDescriptionError("");
                  }}
                  disabled={descriptionSaving}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function RepairApprovalBox({
  status,
  responseSource,
  repairRequestNote,
  deadline,
  quotePdfPath,
  quotePdfName,
  isLoading,
  error,
  onAnswer,
}: {
  status: SupportCaseWithEvents["repair_approval_status"];
  responseSource: SupportCaseWithEvents["repair_approval_response_source"];
  repairRequestNote: string | null;
  deadline: string | null;
  quotePdfPath: string | null;
  quotePdfName: string | null;
  isLoading: boolean;
  error: string;
  onAnswer: (decision: RepairApprovalDecision, pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  if (status === "accepted") {
    return (
      <div className="repair-approval-box accepted">
        <strong>Reparación aceptada</strong>
        {repairRequestNote ? <p>Descripción: {repairRequestNote}</p> : null}
        {quotePdfPath ? (
          <RepairQuoteLink
            quotePdfPath={quotePdfPath}
            quotePdfName={quotePdfName}
          />
        ) : null}
        <p>
          Registramos la autorización para continuar con la reparación del
          equipo.
        </p>
      </div>
    );
  }

  if (status === "declined") {
    return (
      <div className="repair-approval-box declined">
        <strong>{repairApprovalStatusLabel(status, responseSource)}</strong>
        {repairRequestNote ? <p>Descripción: {repairRequestNote}</p> : null}
        {quotePdfPath ? (
          <RepairQuoteLink
            quotePdfPath={quotePdfPath}
            quotePdfName={quotePdfName}
          />
        ) : null}
        <p>
          El equipo pasará a listo para entrega cuando se cumpla el plazo
          automático de 7 días hábiles.
        </p>
      </div>
    );
  }

  if (status !== "pending") return null;

  return (
    <div className="repair-approval-box">
      <strong>Su equipo necesita reparación</strong>
      {repairRequestNote ? <p>Descripción: {repairRequestNote}</p> : null}
      {quotePdfPath ? (
        <RepairQuoteLink
          quotePdfPath={quotePdfPath}
          quotePdfName={quotePdfName}
        />
      ) : null}
      <p>
        Indique si acepta repararlo para que el soporte pueda continuar.{" "}
        Cuenta con un plazo de 7 días hábiles para responder.
        {deadline
          ? ` Tiempo límite: ${formatDate(deadline)} ${formatTime(deadline)}.`
          : ""}
      </p>
      <label className="field repair-pin-field">
        <span>PIN de autorización</span>
        <input
          value={pin}
          onChange={(event) =>
            setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          inputMode="numeric"
          placeholder="Ingresa el PIN de 6 dígitos"
        />
      </label>
      <div className="repair-actions">
        <button
          type="button"
          onClick={() => onAnswer("accepted", pin)}
          disabled={isLoading || pin.trim().length !== 6}
        >
          Aceptar reparación
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onAnswer("declined", pin)}
          disabled={isLoading || pin.trim().length !== 6}
        >
          No aceptar
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

function RepairRequestAdminBox({
  status,
  responseSource,
  repairRequestNote,
  deadline,
  approvalPin,
  quotePdfPath,
  quotePdfName,
}: {
  status: SupportCaseWithEvents["repair_approval_status"];
  responseSource: SupportCaseWithEvents["repair_approval_response_source"];
  repairRequestNote: string | null;
  deadline: string | null;
  approvalPin: string | null;
  quotePdfPath: string | null;
  quotePdfName: string | null;
}) {
  return (
    <div className="repair-approval-box">
      <strong>Autorización de reparación</strong>
      <p>Estatus: {repairApprovalStatusLabel(status, responseSource)}</p>
      {responseSource ? (
        <p>Origen de respuesta: {repairApprovalResponseSourceLabel(responseSource)}</p>
      ) : null}
      {repairRequestNote ? <p>Descripción: {repairRequestNote}</p> : null}
      {approvalPin ? (
        <p>
          PIN para cliente: <strong>{approvalPin}</strong>
        </p>
      ) : null}
      {deadline ? (
        <p>
          Vence en 7 días hábiles: {formatDate(deadline)} {formatTime(deadline)}
        </p>
      ) : null}
      {quotePdfPath ? (
        <RepairQuoteLink
          quotePdfPath={quotePdfPath}
          quotePdfName={quotePdfName}
        />
      ) : null}
    </div>
  );
}

function RepairQuoteLink({
  quotePdfPath,
  quotePdfName,
}: {
  quotePdfPath: string;
  quotePdfName: string | null;
}) {
  return (
    <p>
      Cotización:{" "}
      <a
        href={getSupportFileUrlFromPath(quotePdfPath)}
        target="_blank"
        rel="noreferrer"
      >
        {quotePdfName ?? "Ver PDF"}
      </a>
    </p>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="stat-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function getTimelineEventDescription(
  event: SupportEvent,
  supportCase?: SupportCaseWithEvents,
) {
  const eventNote = sanitizeMovementDescription(event.event_note);
  if (eventNote) return eventNote;

  const isQuoteRequestEvent =
    event.event_type === "diagnosis" &&
    supportCase?.repair_quote_pdf_path &&
    supportCase.repair_approval_requested_at === event.event_date;

  if (isQuoteRequestEvent) {
    return supportCase.repair_request_note
      ? `Envío de cotización. ${supportCase.repair_request_note}`
      : null;
  }

  if (event.event_type === "diagnosis" && supportCase?.repair_request_note) {
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized === "cotizacion" ||
    normalized === "envio de cotizacion" ||
    normalized === "envio de cotizacion cotizacion"
  ) {
    return null;
  }

  return trimmed;
}

function hasDeliveredStatusEmail(
  event: SupportEvent,
  localStatus?: "sent" | "failed",
) {
  if (localStatus === "sent") return true;
  if (localStatus === "failed") return false;
  return Boolean(event.status_email_sent_at);
}

function getPublicAgentName(fullName: string) {
  const firstName = fullName.trim().split(/\s+/)[0];
  return firstName || "Sin agente asignado";
}

function SummaryItem({
  icon,
  label,
  value,
  tone,
  wide,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  tone?: "good" | "bad";
  wide?: boolean;
}) {
  return (
    <div className={wide ? "summary-item summary-item-wide" : "summary-item"}>
      <span className="summary-label">
        {icon}
        {label}
      </span>
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
    </div>
  );
}

function SupportImageGallery({ images }: { images: SupportImage[] }) {
  return (
    <div className="support-images-section">
      <h3>Archivos del soporte</h3>
      <div className="support-images-grid">
        {images.map((image) => {
          const imageUrl = getSupportImageUrl(image);
          return (
            <a
              key={image.id}
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className="support-image-link"
            >
              {isSupportPdf(image) ? (
                <span className="support-pdf-preview">
                  <FileText size={24} />
                  <small>
                    {image?.original_name
                      ? image.original_name.length > 10
                        ? `${image.original_name.slice(0, 10)}...`
                        : image.original_name
                      : "PDF del soporte"}
                  </small>
                </span>
              ) : (
                <img
                  src={imageUrl}
                  alt={image.original_name ?? "Imagen del soporte"}
                  loading="lazy"
                />
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function sortImages(images: SupportImage[]) {
  return [...images].sort(
    (a, b) =>
      a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
}

function buildTimelineGroups(events: TimelineEvent[]) {
  return events.reduce<
    Array<{
      id: string;
      stateKey: string;
      folio: string;
      event_date: string;
      title: string;
      supportCase: SupportCaseWithEvents;
      items: TimelineEvent[];
    }>
  >((groups, event) => {
    const stateKey = buildTimelineStateKey(event);
    const previousGroup = groups[groups.length - 1];

    if (previousGroup && previousGroup.stateKey === stateKey) {
      previousGroup.items.push(event);
      return groups;
    }

    groups.push({
      id: `${stateKey}::${event.id}`,
      stateKey,
      folio: event.folio,
      event_date: event.event_date,
      title: event.title || eventLabels[event.event_type],
      supportCase: event.supportCase,
      items: [event],
    });
    return groups;
  }, []);
}

function buildTimelineStateKey(event: TimelineEvent) {
  return [
    event.support_case_id,
    event.support_event_type_id ?? "",
    event.title || "",
    event.event_type,
  ].join("::");
}

function hasRepairRequestInfo(supportCase: SupportCaseWithEvents) {
  return Boolean(
    supportCase.repair_request_note ||
    supportCase.repair_approval_status ||
    supportCase.repair_approval_pin ||
    supportCase.repair_quote_pdf_path,
  );
}

function repairApprovalStatusLabel(
  status: SupportCaseWithEvents["repair_approval_status"],
  source?: SupportCaseWithEvents["repair_approval_response_source"],
) {
  if (status === "accepted") return "Aceptada";
  if (status === "declined") {
    return source === "automatic"
      ? "No revisada por el cliente"
      : "No aceptada";
  }
  if (status === "pending") return "Pendiente de respuesta";
  return "Sin solicitud activa";
}

function repairApprovalResponseSourceLabel(
  source: SupportCaseWithEvents["repair_approval_response_source"],
) {
  if (source === "customer") return "Cliente";
  if (source === "automatic") return "Capturado automáticamente";
  return "Sin origen registrado";
}
