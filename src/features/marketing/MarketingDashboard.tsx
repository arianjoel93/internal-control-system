import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Info,
  LineChart,
  MessageCircle,
  PieChart,
  RefreshCcw,
  Share2,
  Target,
  X,
} from 'lucide-react';
import { MarketingWonNotifications } from './MarketingWonNotifications';
import { EmptyState } from '../../components/EmptyState';
import { OdooLoadingModal } from '../../components/OdooLoadingModal';
import { openModuleDocs } from '../../lib/moduleDocs';
import { supabase } from '../../lib/supabase';
import type { AdminUserRole, SalesAgentNotificationRow } from '../../lib/types';
import {
  defaultReportsConfig,
  type OdooCommercialDataset,
  type OdooCrmLeadRecord,
  type ReportFilters,
  type ReportOption,
  type ReportVisibilityScope,
} from '../reports/odooSalesCore';
import {
  buildDefaultFilters,
  buildQuickRange,
  FilterToolbar,
  recommendedGroupingForRange,
  type QuickRangeKey,
} from '../reports/ReportsDashboard';
import { buildCommercialDashboard } from '../reports/reportsAnalytics';
import { getCommercialDataset } from '../reports/reportsService';
import { createSharedSalesReport } from '../reports/salesReportsCollaborationService';
import { buildPreviousMarketingFilters } from './marketingPeriod';
import { buildPersonalMarketingPeriod, type PersonalMarketingPeriod } from './marketingPersonalPerformance';
import {
  buildMarketingLeadIntakeSeries,
  buildMarketingLeadSourceRows,
  buildMarketingInvoiceCustomerIndex,
  marketingAssignedLeadsForPeriod,
  marketingCrmDateKey,
  marketingLeadCustomerInvoiceRows,
  marketingLeadsForPeriod,
  marketingLostLeadsForPeriod,
  marketingLeadsCreatedBy,
  marketingNewLeadsForPeriod,
  marketingWonLeadsForPeriod,
  matchMarketingLeadsToInvoices,
  summarizeMarketingLeadCreators,
  sumMarketingLeadCustomerInvoices,
  type MarketingLeadIntakePoint,
  type MarketingLeadSourceRow,
} from './marketingLeadData';
import {
  readStoredCommercialDataset,
  readStoredCommercialDatasetMode,
  saveStoredCommercialDataset,
} from '../reports/reportsDatasetCache';
import { SidebarUserFooter } from '../admin/SidebarUserFooter';
import { buildMarketingReportHtml, type MarketingReportChart, type MarketingReportDocument } from './marketingReportDocument';

type MarketingSection = 'summary' | 'leads' | 'segments' | 'campaigns' | 'opportunities' | 'crm' | 'alerts';

type MarketingDashboardProps = {
  session: Session;
  userRole: AdminUserRole;
  visibilityScope: ReportVisibilityScope;
  onOpenHub: () => void;
};

const marketingSections: Array<{ id: MarketingSection; label: string; icon: ReactNode }> = [
  { id: 'summary', label: 'Resumen', icon: <LineChart size={18} /> },
  { id: 'leads', label: 'Mis Leads', icon: <Target size={18} /> },
];

export function MarketingDashboard({ session, userRole, visibilityScope, onOpenHub }: MarketingDashboardProps) {
  const [activeSection, setActiveSection] = useState<MarketingSection>('summary');
  const [activeDecisionDetail, setActiveDecisionDetail] = useState<MarketingDecisionDetailKey>('risk');
  const [isMarketingProfileOpen, setIsMarketingProfileOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareState, setShareState] = useState<{
    key: string;
    status: 'preparing' | 'ready' | 'copied' | 'error';
    url: string | null;
    error: string | null;
  } | null>(null);
  const [retainedSellerOptions, setRetainedSellerOptions] = useState<ReportOption[]>([]);
  const [fullDatasetEnabled, setFullDatasetEnabled] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>(() => buildDefaultFilters(visibilityScope));
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(() => buildDefaultFilters(visibilityScope));
  const hasPendingFilterChanges = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(draftFilters),
    [draftFilters, filters],
  );
  const previousPeriodFilters = useMemo(() => buildPreviousMarketingFilters(filters), [filters]);
  const cachedDataset = useMemo(
    () => {
      const stored = readStoredCommercialDataset(filters, 'sales', session.user.id);
      return stored?.marketingAttributionVersion === 3 ? stored : null;
    },
    [filters, session.user.id],
  );
  const cachedDatasetMode = useMemo(
    () => readStoredCommercialDatasetMode(filters, 'sales', session.user.id),
    [filters, session.user.id],
  );
  const persistedNotificationsQuery = useQuery({
    queryKey: ['marketing-agent-notifications', session.user.id],
    queryFn: () => listMarketingAgentNotifications(session.user.id),
    enabled: userRole === 'marketing_agent',
    staleTime: 60_000,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const refetchPersistedNotifications = persistedNotificationsQuery.refetch;
  useEffect(() => {
    if (userRole !== 'owner' && userRole !== 'marketing_agent') return;
    void supabase.functions.invoke('marketing-lead-alerts', { body: { action: 'scan-new-leads' } });
  }, [session.user.id, userRole]);
  const fastDatasetQuery = useQuery({
    queryKey: ['marketing-dashboard-dataset', session.user.id, visibilityScope, 'lead-dates-v7', 'fast', filters],
    queryFn: () => getCommercialDataset(filters, 'sales', 'fast', 'marketing'),
    initialData: () => cachedDataset?.crmLeads?.every((lead) => Object.prototype.hasOwnProperty.call(lead, 'stageIsWon'))
      ? cachedDataset : undefined,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const fullDatasetQuery = useQuery({
    queryKey: ['marketing-dashboard-dataset', session.user.id, visibilityScope, 'lead-dates-v7', 'full', filters],
    queryFn: () => getCommercialDataset(filters, 'sales', 'full', 'marketing'),
    enabled:
      fullDatasetEnabled &&
      Boolean(fastDatasetQuery.data) &&
      !fastDatasetQuery.isFetching &&
      (!cachedDataset || cachedDatasetMode === 'fast'),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const displayDataset = fullDatasetQuery.data ?? fastDatasetQuery.data ?? null;
  const datasetError = fullDatasetQuery.error ?? fastDatasetQuery.error;
  const creatorIdentityQuery = useQuery({
    queryKey: ['marketing-odoo-creator', session.user.id, 'create-uid-v1'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('odoo-sales-report', {
        body: { action: 'marketing-creator-identity', reportContext: 'marketing', requestedDomain: 'sales' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return {
        creatorId: typeof data?.creatorId === 'number' && data.creatorId > 0 ? data.creatorId : null,
        creatorName: typeof data?.creatorName === 'string' ? data.creatorName.trim() : null,
        reason: typeof data?.reason === 'string' ? data.reason : null,
      };
    },
    enabled: Boolean(displayDataset),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sellerOptions = useMemo(() => {
    const current = displayDataset
      ? [
          ...displayDataset.availableFilters.sellers,
          ...marketingLeadsForPeriod(displayDataset, filters)
            .filter((lead) => lead.sellerId && lead.sellerName)
            .map((lead) => ({ id: lead.sellerId as number, label: lead.sellerName as string })),
        ]
      : [];
    const catalog = new Map([...retainedSellerOptions, ...current].map((option) => [String(option.id), option]));
    return [...catalog.values()].sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));
  }, [displayDataset, filters, retainedSellerOptions]);
  const filterDataset = useMemo(() => {
    if (!displayDataset) return undefined;
    const leads = marketingLeadsForPeriod(displayDataset, filters);
    const merge = (options: ReportOption[], field: 'company' | 'team' | 'customer') => {
      const catalog = new Map(options.map((option) => [String(option.id), option]));
      leads.forEach((lead) => {
        const id = field === 'company' ? lead.companyId : field === 'team' ? lead.teamId : lead.customerId;
        const label = field === 'company' ? lead.companyName : field === 'team' ? lead.teamName : lead.customerName;
        if (id && label) catalog.set(String(id), { id, label });
      });
      return [...catalog.values()];
    };
    return {
      ...displayDataset,
      availableFilters: {
        ...displayDataset.availableFilters,
        companies: merge(displayDataset.availableFilters.companies, 'company'),
        sellers: sellerOptions,
        teams: merge(displayDataset.availableFilters.teams, 'team'),
        customers: merge(displayDataset.availableFilters.customers, 'customer'),
      },
    };
  }, [displayDataset, filters, sellerOptions]);
  const previousPeriodCachedDataset = useMemo(
    () => {
      const stored = readStoredCommercialDataset(previousPeriodFilters, 'sales', session.user.id);
      return stored?.marketingAttributionVersion === 3 ? stored : null;
    },
    [previousPeriodFilters, session.user.id],
  );
  const previousPeriodCachedDatasetMode = useMemo(
    () => readStoredCommercialDatasetMode(previousPeriodFilters, 'sales', session.user.id),
    [previousPeriodFilters, session.user.id],
  );
  const previousPeriodQuery = useQuery({
    queryKey: ['marketing-leads-previous-period', session.user.id, 'lead-dates-v7', previousPeriodFilters],
    queryFn: () => getCommercialDataset(previousPeriodFilters, 'sales', 'fast', 'marketing'),
    enabled: Boolean(displayDataset),
    initialData: previousPeriodCachedDataset?.crmLeads?.every((lead) => Object.prototype.hasOwnProperty.call(lead, 'stageIsWon'))
      ? previousPeriodCachedDataset : undefined,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setFullDatasetEnabled(false);
  }, [filters, session.user.id, visibilityScope]);

  useEffect(() => {
    const nextFilters = buildDefaultFilters(visibilityScope);
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
  }, [visibilityScope]);

  useEffect(() => {
    if (!fastDatasetQuery.data || fastDatasetQuery.isFetching) return;
    const timeout = window.setTimeout(() => {
      setFullDatasetEnabled(true);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [fastDatasetQuery.data, fastDatasetQuery.isFetching]);

  useEffect(() => {
    if (displayDataset) {
      saveStoredCommercialDataset(
        filters,
        displayDataset,
        'sales',
        session.user.id,
        fullDatasetQuery.data ? 'full' : 'fast',
      );
    }
  }, [displayDataset, filters, fullDatasetQuery.data, session.user.id]);

  useEffect(() => {
    if (previousPeriodQuery.data) {
      saveStoredCommercialDataset(
        previousPeriodFilters,
        previousPeriodQuery.data,
        'sales',
        session.user.id,
        previousPeriodCachedDatasetMode === 'full' && previousPeriodQuery.data === previousPeriodCachedDataset ? 'full' : 'fast',
      );
    }
  }, [previousPeriodFilters, previousPeriodQuery.data, session.user.id]);

  const snapshot = useMemo(
    () => displayDataset ? buildCommercialDashboard(displayDataset, filters, defaultReportsConfig) : null,
    [displayDataset, filters],
  );
  const marketing = useMemo(
    () => snapshot && displayDataset
      ? buildMarketingViewModel(snapshot, displayDataset, previousPeriodFilters, previousPeriodQuery.data ?? null)
      : null,
    [displayDataset, previousPeriodFilters, previousPeriodQuery.data, snapshot],
  );
  const creatorSummary = useMemo(
    () => displayDataset ? summarizeMarketingLeadCreators(displayDataset.crmLeads ?? [], filters) : null,
    [displayDataset, filters],
  );
  const personalLeads = useMemo(() => {
    const creatorId = creatorIdentityQuery.data?.creatorId;
    if (!displayDataset || !creatorId) return null;
    const scopedDataset = {
      ...displayDataset,
      crmLeads: marketingLeadsCreatedBy(displayDataset.crmLeads ?? [], creatorId),
    };
    const scopedPrevious = previousPeriodQuery.data ? {
      ...previousPeriodQuery.data,
      crmLeads: marketingLeadsCreatedBy(previousPeriodQuery.data.crmLeads ?? [], creatorId),
    } : null;
    return buildMarketingLeadsAnalytics({
      dataset: scopedDataset,
      filters,
      previousDataset: scopedPrevious,
      previousFilters: previousPeriodFilters,
    });
  }, [creatorIdentityQuery.data?.creatorId, displayDataset, filters, previousPeriodFilters, previousPeriodQuery.data]);
  const personalPerformance = useMemo(() => {
    const creatorId = creatorIdentityQuery.data?.creatorId;
    if (activeSection !== 'leads' || !displayDataset || !creatorId) return null;
    return {
      current: buildPersonalMarketingPeriod(displayDataset, filters, creatorId),
      previous: previousPeriodQuery.data
        ? buildPersonalMarketingPeriod(previousPeriodQuery.data, previousPeriodFilters, creatorId) : null,
    };
  }, [activeSection, creatorIdentityQuery.data?.creatorId, displayDataset, filters, previousPeriodFilters, previousPeriodQuery.data]);
  const odooCreatorName = creatorIdentityQuery.data?.creatorName
    || displayDataset?.crmLeads?.find((lead) => lead.creatorId === creatorIdentityQuery.data?.creatorId && lead.creatorName?.trim())?.creatorName?.trim()
    || 'Agente de marketing';
  const shareKey = JSON.stringify([filters, activeSection, creatorIdentityQuery.data?.creatorId, odooCreatorName, displayDataset?.fetchedAt, previousPeriodQuery.data?.fetchedAt]);
  const currentShareState = shareState?.key === shareKey ? shareState : null;
  const shareStatus = currentShareState?.status ?? 'idle';
  const shareUrl = currentShareState?.url ?? null;
  const shareError = currentShareState?.error ?? null;
  const marketingAgentScore = personalLeads?.previousReady
    ? buildMarketingAgentScore(personalLeads.current, personalLeads.previous)
    : null;
  useEffect(() => {
    if (!marketing || userRole !== 'marketing_agent') return;
    void syncMarketingAgentNotifications(session.user.id, session.user.email ?? '', marketing)
      .then(() => refetchPersistedNotifications());
  }, [marketing, refetchPersistedNotifications, session.user.email, session.user.id, userRole]);
  useEffect(() => {
    if (!isShareModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsShareModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isShareModalOpen]);

  function prepareReportDocument(): MarketingReportDocument | null {
    if (!marketing || (activeSection === 'leads' && (!personalPerformance || !personalLeads))) return null;
    const selectedSeller = visibilityScope === 'own'
      ? displayDataset?.sellerScope?.label ?? 'Vendedor asociado'
      : describeMarketingSelection(filters.sellerIds, sellerOptions, 'Todos');
    const selectedCompany = visibilityScope === 'own'
      ? displayDataset?.companyScope?.label ?? 'Compañía asociada'
      : describeMarketingSelection(filters.companyIds, filterDataset?.availableFilters.companies ?? [], 'Todas las compañías');
    const periodLabel = formatPeriodLabel(filters.startDate, filters.endDate);
    const scope = activeSection === 'leads'
      ? `Compañía: ${selectedCompany}${visibilityScope === 'own' ? '' : ` · Vendedor asociado: ${selectedSeller}`}`
      : `Compañía: ${selectedCompany} · Vendedor asociado: ${selectedSeller}`;
    return activeSection === 'leads' && personalPerformance && personalLeads
      ? buildPersonalMarketingReport(personalPerformance.current, personalPerformance.previous, personalLeads, periodLabel, scope, odooCreatorName)
      : buildSummaryMarketingReport(marketing, creatorSummary, periodLabel, scope);
  }

  function downloadReport() {
    const report = prepareReportDocument();
    if (!report) return;
    downloadMarketingReportHtml(buildMarketingReportHtml(report), `${report.title}-${filters.startDate}-${filters.endDate}`);
  }

  function printReport() {
    const report = prepareReportDocument();
    if (!report) return;
    printMarketingReportHtml(buildMarketingReportHtml(report));
  }

  async function prepareShareLink() {
    const report = prepareReportDocument();
    if (!report || !displayDataset || shareStatus === 'preparing' || shareUrl) return;
    const requestedShareKey = shareKey;
    setShareState({ key: requestedShareKey, status: 'preparing', url: null, error: null });
    try {
      const selectedSeller = visibilityScope === 'own'
        ? displayDataset.sellerScope?.label ?? 'Vendedor asociado'
        : describeMarketingSelection(filters.sellerIds, sellerOptions, 'Todos');
      const selectedCompany = visibilityScope === 'own'
        ? displayDataset.companyScope?.label ?? 'Compañía asociada'
        : describeMarketingSelection(filters.companyIds, filterDataset?.availableFilters.companies ?? [], 'Todas las compañías');
      const url = await createSharedSalesReport({
        companyName: selectedCompany,
        sellerName: activeSection === 'leads' ? odooCreatorName : selectedSeller,
        title: report.title,
        reportPeriod: report.period,
        reportHtml: buildMarketingReportHtml(report),
      });
      setShareState((current) => current?.key === requestedShareKey
        ? { key: requestedShareKey, status: 'ready', url, error: null }
        : current);
    } catch (error) {
      setShareState((current) => current?.key === requestedShareKey
        ? { key: requestedShareKey, status: 'error', url: null, error: error instanceof Error ? error.message : 'No se pudo crear el enlace.' }
        : current);
    }
  }

  return (
    <div className="admin-shell reports-shell marketing-shell">
      <OdooLoadingModal
        open={!marketing && fastDatasetQuery.isFetching}
        title="Preparando inteligencia de marketing"
      />
      <aside className="admin-sidebar reports-sidebar marketing-sidebar">
        <div className="reports-sidebar-brand">
          <button type="button" className="admin-module-back reports-brand-button" onClick={onOpenHub}>
            <ArrowLeft size={18} />
            <span className="admin-module-back-label">Marketing</span>
          </button>
        </div>
        <div className="reports-sidebar-scroll">
          <section className="reports-nav-section">
            <p>MARKETING</p>
            <nav className="admin-nav reports-nav-group" aria-label="Marketing">
              {marketingSections.map((section) => (
                <button
                  id={section.id === 'leads' ? 'marketing-leads-nav' : undefined}
                  key={section.id}
                  type="button"
                  className={activeSection === section.id ? 'active' : undefined}
                  onClick={() => {
                    setActiveSection(section.id);
                  }}
                >
                  {section.icon}
                  {section.label}
                </button>
              ))}
            </nav>
          </section>
        </div>
        <SidebarUserFooter email={session.user.email ?? 'usuario'} onSignOut={() => void supabase.auth.signOut()} />
      </aside>
      <main className="admin-main reports-main marketing-main">
        <section className="reports-content">
          <div className="reports-heading">
            <div>
              <p className="eyebrow">Inteligencia comercial Odoo</p>
              <h1>{activeSection === 'leads' ? 'Mis Leads' : 'Marketing'}</h1>
            </div>
            <div className="marketing-heading-actions">
              {userRole === 'owner' || userRole === 'marketing_agent' ? <MarketingWonNotifications key={session.user.id} userId={session.user.id} /> : null}
              {userRole === 'marketing_agent' && marketingAgentScore ? (
                <button
                  type="button"
                  className="marketing-profile-score-button"
                  onClick={() => setIsMarketingProfileOpen(true)}
                  aria-label={`Abrir mi calificación de leads: ${marketingAgentScore.total} de 100`}
                >
                  <span
                    className={`marketing-profile-score-ring score-${marketingAgentScore.tone}`}
                    style={{ '--marketing-score': `${marketingAgentScore.total * 3.6}deg` } as CSSProperties}
                  >
                    <strong>{marketingAgentScore.total}</strong>
                  </span>
                  <span>
                    <small>Mis Leads</small>
                    <b>{marketingAgentScore.rating}</b>
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-button"
                onClick={() => openModuleDocs('marketing')}
              >
                <BookOpen size={16} />
                Docs
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setFullDatasetEnabled(true);
                  setShareState(null);
                  void fastDatasetQuery.refetch();
                  void fullDatasetQuery.refetch();
                  void previousPeriodQuery.refetch();
                  void creatorIdentityQuery.refetch();
                }}
              >
                <RefreshCcw size={16} />
                Actualizar
              </button>
              {activeSection === 'summary' || activeSection === 'leads' ? (
                <>
                  <button type="button" className="secondary-button" disabled={!marketing || (activeSection === 'leads' && (!personalLeads || !personalPerformance))} onClick={downloadReport}>
                    <Download size={16} />
                    Descargar HTML
                  </button>
                  <button type="button" className="secondary-button" disabled={!marketing || (activeSection === 'leads' && (!personalLeads || !personalPerformance))} onClick={printReport}>
                    Guardar PDF
                  </button>
                  <button type="button" className="secondary-button" disabled={!marketing || (activeSection === 'leads' && (!personalLeads || !personalPerformance))} onClick={() => {
                    setIsShareModalOpen(true);
                    void prepareShareLink();
                  }}>
                    <Share2 size={16} />
                    Compartir enlace
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <FilterToolbar
            activeFilters={draftFilters}
            appliedFilters={filters}
            companyLocked={visibilityScope === 'own'}
            dataset={filterDataset}
            hasPendingChanges={hasPendingFilterChanges}
            sellerLocked={visibilityScope === 'own'}
            sellerLabel="Vendedor asociado"
            sellerOptions={sellerOptions}
            crmOnly
            hideSalesTeam
            onApplyQuickRange={(key: QuickRangeKey) => {
              const range = buildQuickRange(key);
              setDraftFilters((current) => ({
                ...current,
                ...range,
                grouping: recommendedGroupingForRange(range),
              }));
            }}
            onApplyFilters={() => {
              if (!hasPendingFilterChanges) return;
              setRetainedSellerOptions(sellerOptions);
              setFilters(draftFilters);
            }}
            onChange={setDraftFilters}
          />

          {!marketing && fastDatasetQuery.isLoading ? (
            <article className="panel reports-empty">
              <EmptyState title="Cargando marketing">Analizando facturación, clientes, productos y conversión.</EmptyState>
            </article>
          ) : null}

          {!marketing && datasetError ? (
            <article className="panel reports-empty">
              <EmptyState title="No se pudo cargar Marketing">
                {datasetError instanceof Error
                  ? datasetError.message
                  : 'Intenta actualizar nuevamente. Si existe información guardada, se mostrará automáticamente.'}
              </EmptyState>
            </article>
          ) : null}

          {previousPeriodQuery.error ? (
            <div className="marketing-inline-error">No se pudo cargar el periodo anterior. Los indicadores actuales siguen disponibles; presiona Actualizar para reintentar.</div>
          ) : null}

          {marketing ? (
            <MarketingSectionContent
              activeDecisionDetail={activeDecisionDetail}
              activeSection={activeSection}
              creatorSummary={creatorSummary}
              marketing={marketing}
              personalLeads={personalLeads}
              personalPerformance={personalPerformance}
              personalCreatorReason={creatorIdentityQuery.data?.reason ?? null}
              personalLeadsError={Boolean(creatorIdentityQuery.error)}
              personalLeadsLoading={creatorIdentityQuery.isPending}
              onSelectDecisionDetail={setActiveDecisionDetail}
              persistedNotifications={persistedNotificationsQuery.data ?? []}
            />
          ) : null}
          {isMarketingProfileOpen && personalLeads && marketingAgentScore ? (
            <MarketingAgentProfileModal
              current={personalLeads.current}
              score={marketingAgentScore}
              onClose={() => setIsMarketingProfileOpen(false)}
            />
          ) : null}
          {isShareModalOpen ? (
            <div className="report-share-modal-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.currentTarget === event.target) setIsShareModalOpen(false);
            }}>
              <section className="report-share-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-share-title">
                <div className="report-share-modal-head">
                  <div><span>Compartir Marketing</span><h2 id="marketing-share-title">{activeSection === 'leads' ? 'Mis Leads' : 'Resumen'} · periodo aplicado</h2></div>
                  <button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setIsShareModalOpen(false)}><X size={17} /></button>
                </div>
                <p className="report-share-modal-copy">El enlace conserva una copia fija de las gráficas y los datos del periodo aplicado. Quien tenga el enlace podrá verla sin iniciar sesión. No incluye correos ni teléfonos de los leads.</p>
                {shareStatus === 'idle' ? <button type="button" className="secondary-button" onClick={() => void prepareShareLink()}>Preparar enlace actualizado</button> : null}
                {shareStatus === 'preparing' ? <div className="report-share-status"><RefreshCcw size={16} /> Preparando enlace...</div> : null}
                {shareError ? <div className="report-share-status is-error">{shareError}<button type="button" className="text-button" onClick={() => void prepareShareLink()}>Reintentar</button></div> : null}
                <div className="report-share-options">
                  <a className={`report-share-option is-whatsapp${shareUrl ? '' : ' is-disabled'}`} href={shareUrl ? `https://wa.me/?text=${encodeURIComponent(`Reporte de Marketing: ${shareUrl}`)}` : undefined} target="_blank" rel="noreferrer" onClick={(event) => { if (!shareUrl) event.preventDefault(); }}><MessageCircle size={18} /><span>WhatsApp</span></a>
                  <button type="button" className="report-share-option is-copy" disabled={!shareUrl} onClick={async () => {
                    if (!shareUrl) return;
                    try { await navigator.clipboard.writeText(shareUrl); } catch { window.prompt('Copia el enlace:', shareUrl); }
                    setShareState((current) => current?.key === shareKey ? { ...current, status: 'copied' } : current);
                  }}>{shareStatus === 'copied' ? <CheckCircle2 size={18} /> : <Copy size={18} />}<span>{shareStatus === 'copied' ? 'Enlace copiado' : 'Copiar enlace'}</span></button>
                  <a className={`report-share-option is-email${shareUrl ? '' : ' is-disabled'}`} href={shareUrl ? `mailto:?subject=${encodeURIComponent('Reporte de Marketing')}&body=${encodeURIComponent(shareUrl)}` : undefined} onClick={(event) => { if (!shareUrl) event.preventDefault(); }}><Share2 size={18} /><span>Correo</span></a>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function MarketingSectionContent({
  activeDecisionDetail,
  activeSection,
  creatorSummary,
  marketing,
  personalLeads,
  personalPerformance,
  personalCreatorReason,
  personalLeadsError,
  personalLeadsLoading,
  onSelectDecisionDetail,
  persistedNotifications,
}: {
  activeDecisionDetail: MarketingDecisionDetailKey;
  activeSection: MarketingSection;
  creatorSummary: ReturnType<typeof summarizeMarketingLeadCreators> | null;
  marketing: MarketingViewModel;
  personalLeads: MarketingLeadsAnalytics | null;
  personalPerformance: { current: PersonalMarketingPeriod; previous: PersonalMarketingPeriod | null } | null;
  personalCreatorReason: string | null;
  personalLeadsError: boolean;
  personalLeadsLoading: boolean;
  onSelectDecisionDetail: (detail: MarketingDecisionDetailKey) => void;
  persistedNotifications: MarketingPersistedNotification[];
}) {
  const [activeInsight, setActiveInsight] = useState<MarketingInsightModalData | null>(null);

  if (activeSection === 'summary') {
    return <div className="reports-stack">
      {creatorSummary ? <MarketingCreatorPanel summary={creatorSummary} /> : null}
      <MarketingLeadsSection leads={marketing.leads} mode="summary" />
    </div>;
  }

  if (activeSection === 'leads') {
    if (!personalLeads || !personalPerformance) return (
      <article className="panel reports-empty">
        <EmptyState title={personalLeadsLoading ? 'Identificando tu usuario de Odoo' : 'No se pudo identificar tu usuario de Odoo'}>
          {personalLeadsLoading
            ? 'Preparando los indicadores de los leads que creaste.'
            : personalLeadsError
              ? 'No se pudo consultar la vinculación de Odoo. Intenta actualizar el módulo.'
              : personalCreatorReason ?? 'Para mostrar Mis Leads, vincula esta cuenta con el usuario que figura como Usuario de creación en Odoo.'}
        </EmptyState>
      </article>
    );
    return <MarketingPersonalLeadsSection
      current={personalPerformance.current}
      previous={personalPerformance.previous}
      rangeLabel={personalLeads.currentRangeLabel}
      previousRangeLabel={personalLeads.previousRangeLabel}
      intake={personalLeads.intake}
    />;
  }

  if (activeSection === 'segments') {
    return (
      <div className="reports-stack">
        <MarketingPanel title="Distribución RFM" subtitle="Peso de cada grupo para enfocar inversión y mensajes.">
          <MarketingBarChart
            rows={marketing.segmentBars}
            subtitle="Clientes por segmento"
            title="Base comercial segmentada"
          />
        </MarketingPanel>
        <MarketingPanel title="Segmentación de clientes" subtitle="RFM y valor comercial para decidir campañas por grupo.">
          <div className="marketing-card-grid">
            {marketing.segments.map((segment) => (
              <article className="reports-info-card" key={segment.label}>
                <div className="reports-info-copy">
                  <strong>{segment.label}</strong>
                  <p>{segment.recommendation}</p>
                </div>
                <div className="policy-card-quick-facts">
                  <span>{formatNumber(segment.customers)} clientes</span>
                  <span>{segment.shareLabel}</span>
                </div>
              </article>
            ))}
          </div>
        </MarketingPanel>
        <MarketingPanel title="Cartera prioritaria" subtitle="Clientes que conviene trabajar por valor, recompra o riesgo.">
          <div className="marketing-two-column">
            <MarketingRanking title="Clientes de alto valor en riesgo" rows={marketing.atRiskCustomers} />
            <MarketingRanking title="Clientes con mayor potencial" rows={marketing.highValueCustomers} />
          </div>
        </MarketingPanel>
      </div>
    );
  }

  if (activeSection === 'campaigns') {
    return (
      <MarketingPanel title="Campañas sugeridas" subtitle="Ideas accionables basadas en segmentos, categorías y comportamiento de compra.">
        <div className="marketing-card-grid">
          {marketing.campaigns.map((campaign) => (
            <article className="reports-info-card" key={campaign.title}>
              <div className="reports-info-copy">
                <strong>{campaign.title}</strong>
                <p>{campaign.description}</p>
              </div>
              <div className="policy-card-quick-facts">
                <span>{campaign.metric}</span>
                <span>{campaign.priority}</span>
              </div>
              <div className="marketing-action-strip">
                <span>{campaign.audience}</span>
                <span>{campaign.kpi}</span>
              </div>
            </article>
          ))}
        </div>
      </MarketingPanel>
    );
  }

  if (activeSection === 'opportunities') {
    return (
      <MarketingPanel title="Dónde enfocar el esfuerzo" subtitle="Clientes, productos y categorías con mayor señal para mercadotecnia.">
        <div className="marketing-two-column">
          <MarketingBarChart
            rows={marketing.categoryBars}
            subtitle="Mayor participación en facturación"
            title="Categorías principales"
          />
          <MarketingBarChart
            rows={marketing.productBars}
            subtitle="Productos con más ingresos y clientes"
            title="Productos principales"
          />
        </div>
        <div className="marketing-panel-offset" />
        <div className="marketing-two-column">
          <MarketingRanking title="Categorías con tracción" rows={marketing.topCategories} />
          <MarketingRanking title="Productos para empujar" rows={marketing.topProducts} />
        </div>
        <div className="marketing-two-column marketing-panel-offset">
          <MarketingRanking title="Clientes para venta cruzada" rows={marketing.crossSellCustomers} />
          <MarketingRanking title="Productos con señal de recompra" rows={marketing.repurchaseProducts} />
        </div>
      </MarketingPanel>
    );
  }

  if (activeSection === 'crm') {
    return (
      <div className="reports-stack">
        <MarketingPanel title="Embudo CRM" subtitle="Volumen y valor esperado por etapa para coordinar campañas con ventas.">
          <MarketingFunnelChart rows={marketing.crmFunnel} />
        </MarketingPanel>
        <MarketingPanel title="Pipeline CRM" subtitle="Oportunidades y leads activos para coordinar marketing con ventas.">
          <div className="reports-kpi-list reports-kpi-list-roomy">
            {marketing.crmKpis.map((kpi) => (
              <div className="stat-card" key={kpi.label}>
                <span><Target size={18} /></span>
                <div>
                  <small>{kpi.label}</small>
                  <strong>{kpi.value}</strong>
                </div>
              </div>
            ))}
          </div>
        </MarketingPanel>
        <MarketingPanel title="Seguimiento de oportunidades" subtitle="Señales para campañas, contacto comercial y limpieza del CRM.">
          <div className="marketing-two-column">
            <MarketingRanking title="Etapas del embudo" rows={marketing.crmStages} />
            <MarketingRanking title="Oportunidades a atender" rows={marketing.crmFollowUps} />
          </div>
        </MarketingPanel>
      </div>
    );
  }

  if (activeSection === 'alerts') {
    return (
      <div className="reports-stack">
        <MarketingNotificationCenter
          marketing={marketing}
          persistedNotifications={persistedNotifications}
          onOpenInsight={setActiveInsight}
        />
        <MarketingPanel title="Alertas de marketing" subtitle="Señales para mejorar campañas, leads y retención.">
          <div className="marketing-card-grid">
            {marketing.alerts.map((alert) => (
              <article className={`reports-info-card marketing-alert marketing-alert-${alert.tone}`} key={alert.title}>
                <div className="reports-info-copy">
                  <strong>{alert.title}</strong>
                  <p>{alert.description}</p>
                </div>
                <div className="policy-card-quick-facts">
                  <span>{alert.action}</span>
                </div>
              </article>
            ))}
          </div>
        </MarketingPanel>
        {activeInsight ? <MarketingInsightModal insight={activeInsight} onClose={() => setActiveInsight(null)} /> : null}
      </div>
    );
  }

  return (
    <div className="reports-stack">
      <div className="marketing-overview-grid">
        <MarketingHealthCard
          score={marketing.health.score}
          signals={marketing.health.signals}
          tone={marketing.health.tone}
        />
        <MarketingBarChart
          rows={marketing.categoryBars}
          subtitle="Participación por facturación sin impuestos"
          title="Categorías que explican la demanda"
        />
      </div>
      <LazyMarketingBlock minHeight={280}>
        {() => (
          <MarketingPanel title="Audiencias y productos" subtitle="Distribución de clientes por segmento y productos con mayor demanda en el periodo.">
            <div className="marketing-two-column">
              <MarketingSegmentDonutChart segments={marketing.segments} />
              <MarketingBarChart rows={marketing.productBars} title="Productos que impulsan la demanda" subtitle="Facturación por producto" />
            </div>
          </MarketingPanel>
        )}
      </LazyMarketingBlock>
      <LazyMarketingBlock minHeight={220}>
        {() => (
          <MarketingNotificationCenter
            marketing={marketing}
            persistedNotifications={persistedNotifications}
            onOpenInsight={setActiveInsight}
          />
        )}
      </LazyMarketingBlock>
      <LazyMarketingBlock minHeight={190}>
        {() => (
          <MarketingPanel title="Resumen estratégico" subtitle="KPIs principales para orientar decisiones de marketing.">
            <div className="reports-kpi-list reports-kpi-list-roomy">
              {marketing.kpis.map((kpi) => (
                <MarketingKpiInfoCard
                  explanation={getMarketingKpiExplanation(kpi.label)}
                  icon={<PieChart size={18} />}
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                />
              ))}
            </div>
          </MarketingPanel>
        )}
      </LazyMarketingBlock>
      <LazyMarketingBlock minHeight={430}>
        {() => (
          <MarketingPanel title="Mapa de decisiones" subtitle="Acciones priorizadas por impacto comercial y urgencia.">
            <div className="marketing-decision-grid">
              {marketing.decisions.map((decision) => (
                <article className={`marketing-decision-card marketing-decision-${decision.tone}`} key={decision.title}>
                  <span>{decision.area}</span>
                  <strong>{decision.title}</strong>
                  <p>{decision.description}</p>
                  <button
                    type="button"
                    className="marketing-decision-tag"
                    onClick={() => onSelectDecisionDetail(decision.detailKey)}
                  >
                    {decision.metric}
                  </button>
                </article>
              ))}
            </div>
            <MarketingDecisionDetail detailKey={activeDecisionDetail} marketing={marketing} />
          </MarketingPanel>
        )}
      </LazyMarketingBlock>
      <LazyMarketingBlock minHeight={360}>
        {() => (
          <MarketingPanel title="Modelo de decisión" subtitle="Modelos con datos, KPIs y acciones recomendadas.">
            <div className="marketing-method-grid">
              {marketing.methods.map((method) => (
                <article className="reports-info-card" key={method.title}>
                  <div className="reports-info-copy">
                    <strong>{method.title}</strong>
                    <p>{method.description}</p>
                  </div>
                  <div className="policy-card-quick-facts">
                    <button
                      type="button"
                      className="marketing-insight-chip"
                      onClick={() => setActiveInsight(buildMarketingInsightModal({
                        action: method.action,
                        description: method.description,
                        metric: method.metric,
                        rows: method.csvRows ?? method.rows,
                        title: method.title,
                        type: 'method',
                      }))}
                    >
                      {method.metric}
                    </button>
                    <button
                      type="button"
                      className="marketing-insight-chip"
                      onClick={() => setActiveInsight(buildMarketingInsightModal({
                        action: method.action,
                        description: method.description,
                        metric: method.metric,
                        rows: method.csvRows ?? method.rows,
                        title: method.title,
                        type: 'method',
                      }))}
                    >
                      {method.action}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="marketing-export-button"
                    onClick={() => exportMarketingRowsCsv(method.title, method.csvRows ?? method.rows)}
                  >
                    <Download size={14} />
                    Descargar CSV
                  </button>
                  <MarketingMethodChart marketing={marketing} title={method.title} />
                </article>
              ))}
            </div>
          </MarketingPanel>
        )}
      </LazyMarketingBlock>
      <LazyMarketingBlock minHeight={260}>
        {() => (
          <MarketingPanel title="Lectura ejecutiva" subtitle="Qué dicen los datos y cómo actuar.">
            <div className="marketing-card-grid">
              {marketing.executiveNotes.map((note) => (
                <article className="reports-info-card" key={note.title}>
                  <div className="reports-info-copy">
                    <strong>{note.title}</strong>
                    <p>{note.description}</p>
                  </div>
                  <div className="policy-card-quick-facts">
                    <button
                      type="button"
                      className="marketing-insight-chip"
                      onClick={() => setActiveInsight(buildMarketingInsightModal({
                        action: note.action,
                        description: note.description,
                        metric: note.metric,
                        rows: note.rows,
                        title: note.title,
                        type: 'executive',
                      }))}
                    >
                      {note.metric}
                    </button>
                    <button
                      type="button"
                      className="marketing-insight-chip"
                      onClick={() => setActiveInsight(buildMarketingInsightModal({
                        action: note.action,
                        description: note.description,
                        metric: note.metric,
                        rows: note.rows,
                        title: note.title,
                        type: 'executive',
                      }))}
                    >
                      {note.action}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </MarketingPanel>
        )}
      </LazyMarketingBlock>
      {activeInsight ? <MarketingInsightModal insight={activeInsight} onClose={() => setActiveInsight(null)} /> : null}
    </div>
  );
}

function MarketingCreatorPanel({
  personal = false,
  summary,
}: {
  personal?: boolean;
  summary: ReturnType<typeof summarizeMarketingLeadCreators>;
}) {
  const waiting = summary.created - summary.progressed;
  return (
    <MarketingPanel
      title={personal ? 'Leads creados por mí' : 'Leads creados por usuario'}
      subtitle="Creados dentro del periodo aplicado. 'En otra etapa' muestra los que hoy ya no están en Nuevo, incluidos ganados y perdidos; no representa un historial de cambios de etapa."
    >
      <div className="marketing-lead-kpis marketing-creator-kpis">
        <article className="marketing-lead-kpi">
          <span className="marketing-lead-kpi-label">Leads creados</span>
          <strong>{formatNumber(summary.created)}</strong>
          <span className="marketing-lead-kpi-delta">Según Usuario de creación en Odoo</span>
        </article>
        <article className="marketing-lead-kpi tone-good">
          <span className="marketing-lead-kpi-label">En otra etapa</span>
          <strong>{formatNumber(summary.progressed)}</strong>
          <span className="marketing-lead-kpi-delta">{formatPercent(summary.created ? summary.progressed / summary.created * 100 : 0)} de los creados</span>
        </article>
        <article className="marketing-lead-kpi">
          <span className="marketing-lead-kpi-label">Aún en etapa inicial</span>
          <strong>{formatNumber(waiting)}</strong>
          <span className="marketing-lead-kpi-delta">Pendientes de avance visible</span>
        </article>
      </div>
      {!personal && summary.rows.length ? <div className="marketing-creator-list">
        {summary.rows.map((row) => (
          <article className="marketing-creator-row" key={row.creatorId ?? 'unknown'}>
            <div className="marketing-creator-row-head">
              <strong title={row.creatorName}>{row.creatorName}</strong>
              <span>{formatNumber(row.created)} creados · {formatNumber(row.progressed)} en otra etapa</span>
            </div>
            <div className="marketing-creator-row-track" aria-label={`${row.creatorName}: ${row.progressed} de ${row.created} en otra etapa`} role="img">
              <span style={{ width: `${row.created ? row.progressed / row.created * 100 : 0}%` }} />
            </div>
            <small>{formatNumber(row.won)} ganados · {formatNumber(row.lost)} perdidos · {formatNumber(row.created - row.progressed)} en etapa inicial</small>
          </article>
        ))}
      </div> : !personal ? <p className="marketing-empty-note">No hay leads creados con los filtros aplicados.</p> : null}
    </MarketingPanel>
  );
}

function MarketingLeadsSection({
  isMarketingAgent = false,
  leads,
  mode,
}: {
  isMarketingAgent?: boolean;
  leads: MarketingLeadsAnalytics;
  mode: 'summary' | 'personal';
}) {
  const [activeKpi, setActiveKpi] = useState<MarketingLeadKpiKey | null>(null);
  const current = leads.current;
  const previous = leads.previous;
  const marketingAgentScore = leads.previousReady ? buildMarketingAgentScore(current, previous) : null;
  const comparisonLabel = `vs. ${leads.previousRangeLabel}`;
  const leadKpis = [
    { key: 'assigned', label: 'Leads asignados', value: formatNumber(current.assigned), delta: formatLeadDelta(current.assigned, previous.assigned), tone: 'neutral' },
    { key: 'won', label: 'Leads ganados', value: formatNumber(current.won), delta: formatLeadDelta(current.won, previous.won), tone: 'good' },
    { key: 'lost', label: 'Leads perdidos', value: formatNumber(current.lost), delta: formatLeadDelta(current.lost, previous.lost), tone: 'risk' },
    { key: 'billed', label: 'Facturación sin impuestos', value: formatCurrency(current.billedAmount), delta: formatLeadDelta(current.billedAmount, previous.billedAmount), tone: 'good' },
    { key: 'wonRate', label: 'Cumplimiento de cierre', value: formatPercent(current.wonRate), delta: formatLeadDelta(current.wonRate, previous.wonRate, true), tone: 'good' },
    { key: 'open', label: 'En seguimiento', value: formatNumber(current.open), delta: formatLeadDelta(current.open, previous.open), tone: 'neutral' },
  ] as const;

  return (
    <div className="reports-stack marketing-leads-section">
      {isMarketingAgent && marketingAgentScore ? (
        <MarketingPanel
          title="Mi calificación de leads"
          subtitle="Resume los leads creados por tu usuario de Odoo dentro de los filtros aplicados."
        >
          <MarketingAgentProfileCard score={marketingAgentScore} current={current} />
        </MarketingPanel>
      ) : null}
      <MarketingPanel
        title={mode === 'personal' ? 'Mis resultados de leads del periodo' : 'Resultados de leads del periodo'}
        subtitle={`${leads.currentRangeLabel} · ${comparisonLabel}. Asignados por fecha de asignación; ganados y perdidos por fecha de cierre; facturación por fecha de factura.${mode === 'personal' ? ' La facturación se vincula por cliente y puede figurar en más de un agente creador.' : ''}`}
      >
        <div className="marketing-lead-kpis">
          {leadKpis.map((kpi) => (
            <article className={`marketing-lead-kpi tone-${kpi.tone}`} key={kpi.label}>
              <span className="marketing-lead-kpi-label">{kpi.label}</span>
              <strong title={kpi.value}>{kpi.value}</strong>
              <span className="marketing-lead-kpi-delta">{leads.previousReady ? `${kpi.delta} vs. periodo anterior` : 'Comparación anterior pendiente'}</span>
              <button type="button" className="marketing-lead-kpi-more" onClick={() => setActiveKpi(kpi.key)}>
                Ver más
              </button>
            </article>
          ))}
        </div>
      </MarketingPanel>

      <MarketingPanel
        title="Lectura ejecutiva de leads"
        subtitle="Indicadores visuales para identificar calidad del embudo, presión de seguimiento y evolución frente al corte anterior."
      >
        <MarketingLeadOverviewCharts
          current={current}
          previous={previous}
          previousReady={leads.previousReady}
          previousRangeLabel={leads.previousRangeLabel}
        />
        {leads.previousReady ? <MarketingLeadDecisionCards current={current} previous={previous} /> : null}
      </MarketingPanel>

      <MarketingPanel
        title="Prospección y origen de leads"
        subtitle="Leads creados en el periodo seleccionado. El origen corresponde a la fuente registrada en Odoo; no se infiere del nombre del cliente."
      >
        <MarketingLeadAcquisitionCharts
          current={current}
          intake={leads.intake}
          previous={previous}
          previousReady={leads.previousReady}
        />
      </MarketingPanel>

      <MarketingPanel
        title="De la prospección a la factura"
        subtitle="Coincidencias entre leads nuevos y facturas publicadas del mismo cliente y vendedor dentro del periodo; no implica atribución causal de la venta."
      >
        <MarketingLeadInvoiceConversion current={current} previous={previous} previousReady={leads.previousReady} />
        <MarketingLeadSellerConversionChart current={current} previous={previous} previousReady={leads.previousReady} />
      </MarketingPanel>

      <MarketingPanel
        title="Oportunidades abiertas y seguimiento"
        subtitle={`Estado operativo de los leads del corte ${leads.currentRangeLabel}. Los importes esperados no son facturación.`}
      >
        <MarketingLeadCrmOverview crm={leads.crm} />
      </MarketingPanel>

      {leads.previousReady ? <MarketingPanel
        title="Tendencia de facturación de clientes con lead"
        subtitle={`Facturación sin impuestos del periodo de clientes vinculados a leads: periodo seleccionado vs. ${leads.previousRangeLabel}.`}
      >
        <MarketingLeadBillingTrendChart
          current={current}
          previous={previous}
          previousRangeLabel={leads.previousRangeLabel}
        />
      </MarketingPanel> : null}

      <MarketingPanel
        title="Cumplimiento por agente de ventas"
        subtitle="La barra compara cierres ganados y perdidos del corte, junto con asignados aún en seguimiento; el porcentaje es ganados entre todos los cierres del periodo."
      >
        <MarketingLeadPerformanceChart current={current} />
      </MarketingPanel>

      <MarketingPanel
        title="Detalle operativo"
        subtitle="El detalle completo se conserva para auditoría y campañas; aquí se muestra el volumen listo para descargar sin saturar el tablero."
      >
        <div className="marketing-detail-actions marketing-leads-actions">
          <div className="marketing-leads-detail-summary">
            <strong>{formatNumber(leads.currentRows.length)}</strong>
            <span>leads incluidos en el periodo seleccionado</span>
          </div>
          <button
            type="button"
            className="marketing-export-button"
            onClick={() => exportMarketingRowsCsv(mode === 'personal' ? 'Mis Leads del periodo' : 'Leads del periodo', leads.currentRows)}
          >
            <Download size={14} />
            Descargar CSV
          </button>
        </div>
      </MarketingPanel>
      {activeKpi ? (
        <MarketingRowsModal detail={leads.kpiDetails[activeKpi]} onClose={() => setActiveKpi(null)} />
      ) : null}
    </div>
  );
}

type PersonalMarketingMetric = 'created' | 'quoted' | 'billed' | 'won' | 'lost' | 'activation' | 'openQuotes' | 'pendingWon' | 'delayedWon';

function MarketingPersonalLeadsSection({
  current,
  previous,
  rangeLabel,
  previousRangeLabel,
  intake,
}: {
  current: PersonalMarketingPeriod;
  previous: PersonalMarketingPeriod | null;
  rangeLabel: string;
  previousRangeLabel: string;
  intake: MarketingLeadIntakePoint[];
}) {
  const [activeMetric, setActiveMetric] = useState<PersonalMarketingMetric | null>(null);
  const activation = current.createdLeads.length
    ? current.createdWithQuote / current.createdLeads.length * 100 : 0;
  const previousActivation = previous?.createdLeads.length
    ? previous.createdWithQuote / previous.createdLeads.length * 100 : 0;
  const metrics = [
    { key: 'created', label: 'Leads creados', value: formatNumber(current.createdLeads.length), previousValue: previous?.createdLeads.length ?? 0, currentValue: current.createdLeads.length, tone: 'neutral', note: 'Fecha de creación en Odoo' },
    { key: 'quoted', label: 'Valor cotizado', value: formatCurrency(current.quoteAmount), previousValue: previous?.quoteAmount ?? 0, currentValue: current.quoteAmount, tone: 'quote', note: `${formatNumber(current.quotes.length)} cotizaciones creadas, incluidas las confirmadas` },
    { key: 'billed', label: 'Facturado sin impuestos', value: formatCurrency(current.billedAmount), previousValue: previous?.billedAmount ?? 0, currentValue: current.billedAmount, tone: 'good', note: `${formatNumber(current.billedCustomers)} clientes en su primera compra` },
    { key: 'won', label: 'Ganados', value: formatNumber(current.wonLeads.length), previousValue: previous?.wonLeads.length ?? 0, currentValue: current.wonLeads.length, tone: 'good', note: 'Primer cierre en CRM o primera compra, sin duplicar' },
    { key: 'lost', label: 'Perdidos', value: formatNumber(current.lostLeads.length), previousValue: previous?.lostLeads.length ?? 0, currentValue: current.lostLeads.length, tone: 'risk', note: 'Cerrados en el periodo' },
    { key: 'activation', label: 'Leads nuevos cotizados', value: formatPercent(activation), previousValue: previousActivation, currentValue: activation, tone: 'neutral', note: `${formatNumber(current.createdWithQuote)} de ${formatNumber(current.createdLeads.length)} creados y cotizados en el corte` },
  ] as const;
  const quotedLeadIds = new Set(current.quotedLeadIds);
  const firstSoldLeadIds = new Set(current.firstSoldLeadIds);
  const leadRows = (leads: OdooCrmLeadRecord[]): MarketingMiniRow[] => leads.map((lead) => ({
    label: lead.name || lead.customerName || `Lead ${lead.id}`,
    leadId: lead.id,
    customerName: lead.customerName,
    email: lead.emailFrom,
    phone: lead.phone,
    seller: lead.sellerName,
    status: lead.stageName,
    meta: [`CRM #${lead.id}`, lead.customerName ? `Cliente: ${lead.customerName}` : null,
      lead.sellerName ? `Vendedor: ${lead.sellerName}` : null,
      lead.closedDate ? `Cierre: ${marketingCrmDateKey(lead.closedDate)}` : null].filter(Boolean).join(' · '),
    value: lead.stageName || 'Lead creado',
  }));
  const quoteRows = (links: PersonalMarketingPeriod['quotes']): MarketingMiniRow[] => links.map(({ document, lead }) => ({
    label: document.name || `Cotización #${document.id}`,
    customerName: document.customerName,
    email: lead.emailFrom,
    phone: lead.phone,
    seller: document.sellerName,
    status: document.state === 'draft' || document.state === 'sent' ? 'Cotización abierta' : 'Orden confirmada',
    meta: [`Lead CRM #${lead.id}`, `Cliente: ${document.customerName}`,
      document.sellerName ? `Vendedor: ${document.sellerName}` : null,
      `Creada: ${marketingCrmDateKey(document.createDate ?? document.quotationDate)}`].filter(Boolean).join(' · '),
    value: formatCurrency(document.amountUntaxed),
  }));
  const invoiceRows = (): MarketingMiniRow[] => current.invoices.map(({ document, lead }) => ({
    label: document.name || `Factura #${document.id}`,
    customerName: document.customerName,
    email: lead.emailFrom,
    phone: lead.phone,
    seller: document.sellerName,
    status: document.moveType === 'out_refund' ? 'Nota de crédito' : 'Factura publicada',
    meta: [`Lead CRM #${lead.id}`, `Cliente: ${document.customerName}`,
      document.sellerName ? `Vendedor: ${document.sellerName}` : null,
      `Fecha: ${marketingCrmDateKey(document.invoiceDate)}`].filter(Boolean).join(' · '),
    value: formatCurrency(document.untaxedAmountSigned),
  }));
  const detailRows: Record<PersonalMarketingMetric, () => MarketingMiniRow[]> = {
    created: () => leadRows(current.createdLeads),
    quoted: () => quoteRows(current.quotes),
    billed: invoiceRows,
    won: () => leadRows(current.wonLeads).map((row) => firstSoldLeadIds.has(row.leadId ?? 0)
      ? { ...row, status: 'Ganado; primera compra registrada', value: 'Primera compra facturada', meta: `${row.meta} · Primera compra facturada en el periodo` }
      : row),
    lost: () => leadRows(current.lostLeads),
    activation: () => leadRows(current.createdLeads.filter((lead) => quotedLeadIds.has(lead.id))),
    openQuotes: () => quoteRows(current.openQuotes),
    pendingWon: () => current.pendingCrmWins.map(({ lead, firstPurchaseDate, crmWonDate }) => ({
      ...leadRows([lead])[0],
      status: 'Pendiente al cierre del periodo',
      value: 'Actualizar CRM',
      meta: `Primera compra: ${firstPurchaseDate} · ${crmWonDate ? `Marcado ganado después: ${crmWonDate}` : 'Aún no figura como ganado en CRM'}`,
    })),
    delayedWon: () => current.delayedCrmWins.map(({ lead, firstPurchaseDate, crmWonDate, delayDays }) => ({
      ...leadRows([lead])[0],
      status: 'Ganado registrado con retraso',
      value: `${formatNumber(delayDays)} ${delayDays === 1 ? 'día' : 'días'}`,
      meta: `Primera compra: ${firstPurchaseDate} · Cierre en CRM: ${crmWonDate}`,
    })),
  };
  const detailTitles: Record<PersonalMarketingMetric, string> = {
    created: 'Mis leads creados', quoted: 'Cotizaciones vinculadas', billed: 'Primeras facturas y sus notas de crédito vinculadas',
    won: 'Mis leads ganados', lost: 'Mis leads perdidos', activation: 'Leads creados que llegaron a cotización',
    openQuotes: 'Cotizaciones abiertas por cerrar',
    pendingWon: 'Primera compra pendiente de registrar como ganada',
    delayedWon: 'Ganados registrados después de la primera compra',
  };
  const activeDetail: MarketingDecisionDetailModel | null = activeMetric ? {
    title: detailTitles[activeMetric],
    description: `${rangeLabel}. Se muestran únicamente registros vinculados al usuario de creación de tus leads. El vínculo de cotizaciones y facturas se infiere por cliente, compañía, vendedor y fecha; no prueba por sí solo que el lead causó la venta.`,
    tableRows: detailRows[activeMetric](), chartRows: [], chartTitle: '', chartSubtitle: '',
  } : null;
  const topOpenQuotes = [...current.openQuotes].sort((a, b) => b.document.amountUntaxed - a.document.amountUntaxed).slice(0, 5);

  return <div className="reports-stack marketing-personal-leads">
    <div className="marketing-personal-intro">
      <div><span>Mi impacto comercial</span><h2>De mis leads a oportunidades e ingresos</h2>
        <p>Actividad propia en {rangeLabel}. Los cierres, cotizaciones y facturas se miden por la fecha en que ocurrieron, aunque el lead se haya creado antes.</p></div>
      <strong>{formatNumber(current.quotes.length + current.invoices.length)} documentos vinculados</strong>
    </div>

    <div className="marketing-personal-metrics">
      {metrics.map((metric) => <article className={`marketing-personal-metric tone-${metric.tone}`} key={metric.key}>
        <div className="marketing-personal-metric-top"><span>{metric.label}</span><button type="button" onClick={() => setActiveMetric(metric.key)}>Ver detalle</button></div>
        <strong title={metric.value}>{metric.value}</strong>
        <small>{metric.note}</small>
        <em>{previous ? `${formatLeadDelta(metric.currentValue, metric.previousValue, metric.key === 'activation')} vs. ${previousRangeLabel}` : 'Comparación anterior pendiente'}</em>
      </article>)}
    </div>

    <div className="marketing-personal-visuals">
      <MarketingPanel title="Valor generado en el periodo" subtitle="Cotizaciones creadas frente a primeras compras facturadas, netas de notas de crédito vinculadas. No es una tasa de conversión directa.">
        <MarketingPersonalValueChart current={current} />
      </MarketingPanel>
      <MarketingPanel title="Resultado de los cierres" subtitle="Cada lead se cuenta como ganado en su primer cierre en CRM o primera compra. El seguimiento distingue las actualizaciones tardías del CRM.">
        <MarketingPersonalClosureChart current={current} previous={previous} onShowPending={() => setActiveMetric('pendingWon')} onShowDelayed={() => setActiveMetric('delayedWon')} />
      </MarketingPanel>
    </div>

    <div className="marketing-personal-visuals">
      <MarketingPanel title="Prospección que avanza" subtitle="Origen y ritmo de creación de tus leads. Úsalo para priorizar los canales que producen oportunidades reales.">
        <MarketingPersonalAcquisitionChart current={current} previous={previous} intake={intake} />
      </MarketingPanel>
      <MarketingPanel title="Cotizaciones pendientes de cierre" subtitle="Órdenes en borrador o enviadas, creadas en el periodo y vinculadas a tus leads. No son ingresos facturados.">
        <div className="marketing-personal-open-total"><span>Importe abierto sin impuestos</span><strong>{formatCurrency(current.openQuoteAmount)}</strong></div>
        <div className="marketing-personal-open-list">
          {topOpenQuotes.length ? topOpenQuotes.map(({ document, lead }) => <div key={document.id}>
            <span><strong>{document.name}</strong><small>{document.customerName || lead.customerName || 'Cliente sin nombre'}</small></span>
            <b>{formatCurrency(document.amountUntaxed)}</b>
          </div>) : <p className="marketing-empty-note">No hay cotizaciones abiertas vinculadas en este periodo.</p>}
        </div>
        {current.openQuotes.length ? <button type="button" className="marketing-personal-open-action" onClick={() => setActiveMetric('openQuotes')}>Ver todas las cotizaciones</button> : null}
      </MarketingPanel>
    </div>

    <p className="marketing-personal-method">Los importes se vinculan mediante el cliente creado o asociado al lead. Si un cliente tiene varios leads, se exige coincidencia de vendedor cuando ambos lo tienen y se usa el lead elegible más reciente. La facturación cuenta solo la primera factura histórica de cada cliente y resta notas de crédito vinculadas a ella; las compras posteriores no se atribuyen a Marketing. Esta asociación ayuda a medir contribución comercial, pero no demuestra causalidad.</p>
    {activeDetail ? <MarketingRowsModal detail={activeDetail} onClose={() => setActiveMetric(null)} /> : null}
  </div>;
}

function MarketingPersonalValueChart({ current }: { current: PersonalMarketingPeriod }) {
  const values = current.series.flatMap((point) => [point.quoted, point.billed]);
  const maximum = Math.max(1, ...values);
  const minimum = Math.min(0, ...values);
  const y = (value: number) => 24 + (maximum - value) / (maximum - minimum) * 132;
  const x = (index: number) => current.series.length < 2 ? 210 : 28 + index * 364 / (current.series.length - 1);
  const points = (key: 'quoted' | 'billed') => current.series.map((point, index) => `${x(index)},${y(point[key])}`).join(' ');
  return <div className="marketing-personal-value-chart">
    <div className="marketing-personal-value-legend"><span><i className="quoted" />Cotizado {formatCurrency(current.quoteAmount)}</span><span><i className="billed" />Facturado {formatCurrency(current.billedAmount)}</span></div>
    <svg viewBox="0 0 420 210" role="img" aria-label="Evolución de valor cotizado y facturado de clientes vinculados a mis leads">
      <defs><linearGradient id="marketing-personal-quote-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#bd7650" stopOpacity=".23" /><stop offset="100%" stopColor="#bd7650" stopOpacity="0" /></linearGradient></defs>
      <line x1="26" x2="394" y1={y(0)} y2={y(0)} className="marketing-personal-zero" />
      {current.series.length > 1 ? <polygon points={`${x(0)},${y(0)} ${points('quoted')} ${x(current.series.length - 1)},${y(0)}`} fill="url(#marketing-personal-quote-fill)" /> : null}
      <polyline points={points('quoted')} className="marketing-personal-line quoted" />
      <polyline points={points('billed')} className="marketing-personal-line billed" />
      {current.series.map((point, index) => <g key={`${index}-${point.label}`}>
        <circle cx={x(index)} cy={y(point.quoted)} r="4" className="marketing-personal-dot quoted"><title>{point.label}: {formatCurrency(point.quoted)} cotizado</title></circle>
        <circle cx={x(index)} cy={y(point.billed)} r="4" className="marketing-personal-dot billed"><title>{point.label}: {formatCurrency(point.billed)} facturado</title></circle>
        {index === 0 || index === current.series.length - 1 || current.series.length <= 7 ? <text x={x(index)} y="196" textAnchor="middle">{point.label}</text> : null}
      </g>)}
    </svg>
    <small>Facturado incluye solo primeras compras y sus notas de crédito vinculadas. Las líneas muestran importes por tramo, no el acumulado.</small>
  </div>;
}

function MarketingPersonalClosureChart({ current, previous, onShowPending, onShowDelayed }: {
  current: PersonalMarketingPeriod;
  previous: PersonalMarketingPeriod | null;
  onShowPending: () => void;
  onShowDelayed: () => void;
}) {
  const won = current.wonLeads.length;
  const lost = current.lostLeads.length;
  const total = won + lost;
  const wonShare = total ? won / total * 100 : 0;
  const style = { '--marketing-lead-donut': total
    ? `conic-gradient(#39715a 0 ${wonShare}%, #bd685d ${wonShare}% 100%)`
    : 'conic-gradient(#dfe8e3 0 100%)' } as CSSProperties;
  return <div className="marketing-personal-closure-section">
    <div className="marketing-personal-closure">
      <div className="marketing-lead-donut" style={style}><div><strong>{formatPercent(wonShare)}</strong><span>ganados</span></div></div>
      <div className="marketing-personal-closure-stats">
        <div><i className="won" /><span>Ganados</span><strong>{formatNumber(won)}</strong><small>{previous ? `${formatLeadDelta(won, previous.wonLeads.length)} vs. anterior` : 'Cierres del periodo'}</small></div>
        <div><i className="lost" /><span>Perdidos</span><strong>{formatNumber(lost)}</strong><small>{previous ? `${formatLeadDelta(lost, previous.lostLeads.length)} vs. anterior` : 'Cierres del periodo'}</small></div>
        <p>{total ? `${formatNumber(total)} resultados del periodo. Un mismo lead puede figurar en ambos si se perdió en CRM y también registró su primera compra.` : 'Aún no hay cierres ni primeras compras vinculadas en este corte.'}</p>
      </div>
    </div>
    <div className="marketing-personal-closure-followups">
      <div><span>Primera compra sin ganar en CRM</span><strong>{formatNumber(current.pendingCrmWins.length)}</strong><small>Al cierre del periodo seleccionado</small><button type="button" onClick={onShowPending}>Ver leads</button></div>
      <div><span>Ganados registrados tarde</span><strong>{formatNumber(current.delayedCrmWins.length)}</strong><small>Marcados después de la primera compra</small><button type="button" onClick={onShowDelayed}>Ver leads</button></div>
      <div><span>Demora mediana</span><strong>{current.medianDelayDays === null ? '—' : `${formatNumber(current.medianDelayDays)} días`}</strong><small>Solo cierres tardíos del periodo</small></div>
    </div>
  </div>;
}

function MarketingPersonalAcquisitionChart({ current, previous, intake }: {
  current: PersonalMarketingPeriod;
  previous: PersonalMarketingPeriod | null;
  intake: MarketingLeadIntakePoint[];
}) {
  const quoted = new Set(current.quotedLeadIds);
  const grouped = new Map<string, { count: number; quoted: number }>();
  current.createdLeads.forEach((lead) => {
    const source = lead.sourceName?.trim() || 'Sin origen registrado';
    const row = grouped.get(source) ?? { count: 0, quoted: 0 };
    row.count += 1;
    if (quoted.has(lead.id)) row.quoted += 1;
    grouped.set(source, row);
  });
  const sources = [...grouped].map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  const topSources = sources.slice(0, 5);
  const rest = sources.slice(5).reduce((sum, row) => ({ count: sum.count + row.count, quoted: sum.quoted + row.quoted }), { count: 0, quoted: 0 });
  if (rest.count) topSources.push({ name: 'Otros orígenes', ...rest });
  const maxSource = Math.max(1, ...topSources.map((row) => row.count));
  const maxIntake = Math.max(1, ...intake.flatMap((point) => [point.current, point.previous]));
  return <div className="marketing-lead-acquisition-grid">
    <article className="marketing-lead-donut-card">
      <div className="marketing-chart-heading"><div><strong>Origen de mis leads</strong><p>Leads creados y cotizados durante el corte.</p></div><span className="marketing-chart-period">{formatNumber(current.createdLeads.length)} creados</span></div>
      {topSources.length ? <div className="marketing-lead-source-chart">{topSources.map((row) => <div className="marketing-lead-source-row" key={row.name}>
        <div><span title={row.name}>{row.name}</span><strong>{formatNumber(row.count)}</strong></div>
        <i className="marketing-lead-source-track"><em style={{ width: `${row.count / maxSource * 100}%` }} /></i>
        <small>{formatNumber(row.quoted)} llegaron a cotización en el periodo</small>
      </div>)}</div> : <p className="marketing-empty-note">No hay leads creados en este periodo.</p>}
    </article>
    <article className="marketing-lead-comparison-card">
      <div className="marketing-chart-heading"><div><strong>Ritmo de captación</strong><p>Mis leads nuevos, por tramo comparable.</p></div><span className="marketing-chart-period">{formatNumber(current.createdLeads.length)} vs. {previous ? formatNumber(previous.createdLeads.length) : '...'}</span></div>
      {previous ? <><div className="marketing-lead-intake-chart" role="img" aria-label="Mis leads creados por tramo del periodo actual y anterior" style={{ '--intake-count': intake.length } as CSSProperties}>
        {intake.map((point, index) => <div className="marketing-lead-intake-column" key={`${point.label}-${index}`} title={`${point.label}: ${point.current} actuales, ${point.previous} anteriores`}>
          <div className="marketing-lead-intake-bars"><i className="current" style={{ height: `${point.current / maxIntake * 100}%` }} /><i className="previous" style={{ height: `${point.previous / maxIntake * 100}%` }} /></div><span>{point.label}</span>
        </div>)}
      </div><div className="marketing-lead-comparison-legend"><span><i className="current" />Actual</span><span><i className="previous" />Anterior</span><strong>{formatLeadDelta(current.createdLeads.length, previous.createdLeads.length)} vs. anterior</strong></div></>
        : <p className="marketing-empty-note">Cargando el periodo anterior para comparar la captación.</p>}
    </article>
  </div>;
}

function MarketingLeadAcquisitionCharts({
  current,
  intake,
  previous,
  previousReady,
}: {
  current: MarketingLeadPeriodSummary;
  intake: MarketingLeadIntakePoint[];
  previous: MarketingLeadPeriodSummary;
  previousReady: boolean;
}) {
  const topSources = current.sourceRows.slice(0, 5);
  const otherSources = current.sourceRows.slice(5);
  const remaining = otherSources.reduce((total, row) => total + row.count, 0);
  const remainingInvoiced = otherSources.reduce((total, row) => total + row.invoiced, 0);
  const maxSource = Math.max(1, ...topSources.map((row) => row.count), remaining);
  const maxIntake = Math.max(1, ...intake.flatMap((point) => [point.current, point.previous]));
  const unknown = current.sourceRows.find((row) => row.name === 'Sin origen registrado')?.count ?? 0;

  return (
    <div className="marketing-lead-acquisition-grid">
      <article className="marketing-lead-donut-card">
        <div className="marketing-chart-heading">
          <div>
            <strong>Origen de los leads creados</strong>
            <p>Volumen por canal y oportunidades ganadas dentro de cada canal.</p>
          </div>
          <span className="marketing-chart-period">{formatNumber(current.created)} nuevos</span>
        </div>
        {current.created && !current.sourceReady ? (
          <p className="marketing-empty-note">Actualiza los datos de Odoo para consultar el origen de estos leads.</p>
        ) : current.created ? (
          <div className="marketing-lead-source-chart">
            {topSources.map((row) => (
              <div className="marketing-lead-source-row" key={row.name}>
                <div><span title={row.name}>{row.name}</span><strong>{formatNumber(row.count)}</strong></div>
                <i className="marketing-lead-source-track"><em style={{ width: `${row.count / maxSource * 100}%` }} /></i>
                <small>{formatNumber(row.won)} ganados · {formatNumber(row.invoiced)} con factura · {formatPercent(row.count ? row.invoiced / row.count * 100 : 0)} del origen</small>
              </div>
            ))}
            {remaining > 0 ? <div className="marketing-lead-source-row">
              <div><span>Otros orígenes</span><strong>{formatNumber(remaining)}</strong></div>
              <i className="marketing-lead-source-track"><em style={{ width: `${remaining / maxSource * 100}%` }} /></i>
              <small>{formatNumber(remainingInvoiced)} con factura · {formatPercent(remainingInvoiced / remaining * 100)} del grupo</small>
            </div> : null}
            {unknown > 0 ? <p className="marketing-lead-source-note">{formatNumber(unknown)} leads no tienen fuente de origen registrada en Odoo.</p> : null}
          </div>
        ) : <p className="marketing-empty-note">No hay leads creados en este periodo.</p>}
      </article>
      <article className="marketing-lead-comparison-card">
        <div className="marketing-chart-heading">
          <div>
            <strong>Ritmo de captación</strong>
            <p>Leads nuevos a lo largo del periodo, alineados con el corte anterior.</p>
          </div>
          <span className="marketing-chart-period">{formatNumber(current.created)} vs. {previousReady ? formatNumber(previous.created) : '...'}</span>
        </div>
        {previousReady ? (
          <div
            className="marketing-lead-intake-chart"
            role="img"
            aria-label="Leads nuevos por tramo del periodo actual y anterior"
            style={{ '--intake-count': intake.length } as CSSProperties}
          >
            {intake.map((point, index) => (
              <div className="marketing-lead-intake-column" key={`${point.label}-${index}`} title={`${point.label}: ${point.current} actuales, ${point.previous} anteriores`}>
                <div className="marketing-lead-intake-bars">
                  <i className="current" style={{ height: `${point.current / maxIntake * 100}%` }} />
                  <i className="previous" style={{ height: `${point.previous / maxIntake * 100}%` }} />
                </div>
                <span>{point.label}</span>
              </div>
            ))}
          </div>
        ) : <p className="marketing-empty-note">Cargando el periodo anterior para comparar la captación.</p>}
        {previousReady ? <div className="marketing-lead-comparison-legend">
          <span><i className="current" />Actual</span>
          <span><i className="previous" />Anterior</span>
          <strong>{formatLeadDelta(current.created, previous.created)} vs. periodo anterior</strong>
        </div> : null}
      </article>
    </div>
  );
}

function MarketingLeadInvoiceConversion({
  current,
  previous,
  previousReady,
}: {
  current: MarketingLeadPeriodSummary;
  previous: MarketingLeadPeriodSummary;
  previousReady: boolean;
}) {
  const rate = current.linked ? current.invoiced / current.linked * 100 : 0;
  const previousRate = previous.linked ? previous.invoiced / previous.linked * 100 : 0;
  const coverage = current.created ? current.linked / current.created * 100 : 0;
  const donutStyle = {
    '--marketing-lead-donut': `conic-gradient(#39715a 0 ${rate}%, #e2ece5 ${rate}% 100%)`,
  } as CSSProperties;

  return (
    <div className="marketing-lead-invoice-overview">
      <div className="marketing-lead-donut" style={donutStyle} role="img" aria-label={`${formatPercent(rate)} de leads vinculados tienen una factura coincidente`}>
        <div><strong>{formatPercent(rate)}</strong><span>con factura</span></div>
      </div>
      <div className="marketing-lead-invoice-facts">
        <div><span>Leads creados</span><strong>{formatNumber(current.created)}</strong><small>{previousReady ? formatLeadDelta(current.created, previous.created) : 'Comparación pendiente'} vs. anterior</small></div>
        <div><span>Con cliente y vendedor vinculados</span><strong>{formatNumber(current.linked)}</strong><small>{formatPercent(coverage)} de los leads nuevos</small></div>
        <div><span>Con factura coincidente</span><strong>{formatNumber(current.invoiced)}</strong><small>{previousReady ? `${formatLeadDelta(rate, previousRate, true)} de tasa` : 'Comparación pendiente'}</small></div>
      </div>
      <p>La tasa usa como base solo los leads con cliente y vendedor vinculados. Una factura se asocia a un único lead; los leads sin vínculo no se consideran ventas perdidas.</p>
    </div>
  );
}

function MarketingLeadSellerConversionChart({
  current,
  previous,
  previousReady,
}: {
  current: MarketingLeadPeriodSummary;
  previous: MarketingLeadPeriodSummary;
  previousReady: boolean;
}) {
  const sellers = current.sellerRows.filter((row) => row.created > 0)
    .sort((a, b) => b.created - a.created || a.sellerName.localeCompare(b.sellerName, 'es-MX'));
  const max = Math.max(1, ...sellers.map((row) => row.created));
  const previousBySeller = new Map(previous.sellerRows.map((row) => [String(row.sellerId ?? row.sellerName), row]));

  return <div className="marketing-lead-seller-invoice-chart">
    <div className="marketing-chart-heading">
      <div><strong>Prospección por vendedor</strong><p>Leads creados y coincidencias con factura del mismo cliente y vendedor.</p></div>
      <span className="marketing-chart-period">{formatNumber(sellers.length)} vendedores</span>
    </div>
    <div className="marketing-lead-seller-invoice-list">
      {sellers.length ? sellers.map((row) => {
        const previousRow = previousBySeller.get(String(row.sellerId ?? row.sellerName));
        const rate = row.linked ? row.invoiced / row.linked * 100 : 0;
        const previousRate = previousRow?.linked ? previousRow.invoiced / previousRow.linked * 100 : 0;
        return <div className="marketing-lead-seller-invoice-row" key={`${row.sellerId ?? 'none'}-${row.sellerName}`}>
          <div className="marketing-lead-seller-invoice-label"><strong title={row.sellerName}>{row.sellerName}</strong><small>{formatNumber(row.created)} nuevos · {formatNumber(row.invoiced)} con factura</small></div>
          <div className="marketing-lead-seller-invoice-track" title={`${row.created} creados; ${row.invoiced} con factura`}>
            <i style={{ width: `${row.created / max * 100}%` }} />
            <em style={{ width: `${row.invoiced / max * 100}%` }} />
          </div>
          <div className="marketing-lead-seller-invoice-rate"><strong>{row.linked ? formatPercent(rate) : 'Sin vínculo'}</strong><small>{previousReady && row.linked && previousRow?.linked ? `${formatLeadDelta(rate, previousRate, true)} vs. anterior` : `${formatNumber(row.linked)} vinculados`}</small></div>
        </div>;
      }) : <p className="marketing-empty-note">No hay leads nuevos por vendedor en este periodo.</p>}
    </div>
  </div>;
}

function MarketingLeadCrmOverview({ crm }: { crm: ReturnType<typeof buildCrmMarketingInsights> }) {
  const kpis = [
    { label: 'Leads y oportunidades', value: formatNumber(crm.totalCount) },
    { label: 'Abiertas', value: formatNumber(crm.openCount) },
    { label: 'Valor esperado', value: formatCurrency(crm.pipelineAmount) },
    { label: 'Valor esperado ponderado', value: formatCurrency(crm.weightedPipeline) },
    { label: 'Cambios en los últimos 7 días', value: formatNumber(crm.recentChanges) },
    { label: 'Vencidas o sin movimiento en 7 días', value: formatNumber(crm.attentionCount) },
  ];
  const maxAttention = Math.max(1, ...crm.attentionBySeller.map((row) => row.count));
  return <div className="marketing-lead-crm-overview">
    <div className="marketing-lead-crm-kpis">{kpis.map((kpi) => <div key={kpi.label}><span>{kpi.label}</span><strong>{kpi.value}</strong></div>)}</div>
    <div className="marketing-lead-crm-charts">
      <div className="marketing-lead-crm-funnel"><div className="marketing-chart-heading"><div><strong>Etapas de oportunidades abiertas</strong><p>Cantidad y valor esperado por etapa de los leads incluidos en el filtro.</p></div></div><MarketingFunnelChart rows={crm.funnelRows} /></div>
      <MarketingBarChart
        title="Seguimiento pendiente por vendedor"
        subtitle="Leads abiertos vencidos o sin cambios recientes; cada lead se cuenta una vez."
        rows={crm.attentionBySeller.map((row) => ({
          label: row.sellerName,
          meta: `${formatCurrency(row.expectedRevenue)} de valor esperado`,
          sharePct: row.count / maxAttention * 100,
          value: formatNumber(row.count),
        }))}
      />
    </div>
  </div>;
}

function MarketingLeadOverviewCharts({
  current,
  previous,
  previousReady,
  previousRangeLabel,
}: {
  current: MarketingLeadPeriodSummary;
  previous: MarketingLeadPeriodSummary;
  previousReady: boolean;
  previousRangeLabel: string;
}) {
  const total = current.won + current.lost;
  const donutStyle = {
    '--marketing-lead-donut': total > 0
      ? `conic-gradient(#39715a 0 ${current.wonRate}%, #bd685d ${current.wonRate}% 100%)`
      : 'conic-gradient(#dfe8e3 0 100%)',
  } as CSSProperties;

  const comparisonRows = [
    { current: current.assigned, label: 'Asignados', previous: previous.assigned, value: formatNumber },
    { current: current.won, label: 'Ganados', previous: previous.won, value: formatNumber },
    { current: current.lost, label: 'Perdidos', previous: previous.lost, value: formatNumber },
    { current: current.open, label: 'En seguimiento', previous: previous.open, value: formatNumber },
  ];
  const maxComparison = Math.max(1, ...comparisonRows.flatMap((row) => [row.current, row.previous]));

  return (
    <div className={`marketing-lead-overview-grid${previousReady ? '' : ' is-loading'}`}>
      <article className="marketing-lead-donut-card">
        <div className="marketing-chart-heading">
          <div>
            <strong>Cierre y seguimiento</strong>
            <p>Ganados frente a perdidos cerrados en el periodo. Los asignados son una cohorte distinta.</p>
          </div>
          <span className="marketing-chart-period">{formatNumber(total)} casos</span>
        </div>
        <div className="marketing-lead-donut-layout">
          <div className="marketing-lead-donut" style={donutStyle}>
            <div>
              <strong>{formatPercent(current.wonRate)}</strong>
              <span>cierre</span>
            </div>
          </div>
          <div className="marketing-lead-donut-legend">
            <div><i className="won" /><span>Ganados en el corte</span><strong>{formatNumber(current.won)}</strong></div>
            <div><i className="lost" /><span>Perdidos en el corte</span><strong>{formatNumber(current.lost)}</strong></div>
            <div><i className="open" /><span>Asignados en seguimiento</span><strong>{formatNumber(current.open)}</strong></div>
          </div>
        </div>
      </article>

      <article className="marketing-lead-comparison-card">
        <div className="marketing-chart-heading">
          <div>
            <strong>Tendencia contra el periodo anterior</strong>
            <p>{previousReady ? `Las barras comparan cada indicador con ${previousRangeLabel}.` : 'El periodo actual ya está disponible; el anterior se añade al terminar la consulta.'}</p>
          </div>
          <span className="marketing-chart-period">{previousReady ? 'Actual vs anterior' : 'Periodo actual'}</span>
        </div>
        <div className="marketing-lead-comparison-chart">
          {comparisonRows.map((row) => (
            <div className="marketing-lead-comparison-row" key={row.label}>
              <div className="marketing-lead-comparison-label">
                <span>{row.label}</span>
                <strong>{row.value(row.current)}</strong>
              </div>
              <div className="marketing-lead-dual-track">
                <i className="current" style={{ width: `${row.current / maxComparison * 100}%` }} />
                {previousReady ? <i className="previous" style={{ width: `${row.previous / maxComparison * 100}%` }} /> : null}
              </div>
              <span className="marketing-lead-comparison-delta">{previousReady ? formatLeadDelta(row.current, row.previous) : '—'}</span>
            </div>
          ))}
        </div>
        <div className="marketing-lead-comparison-legend">
          <span><i className="current" />Periodo seleccionado</span>
          {previousReady ? <span><i className="previous" />Periodo anterior</span> : null}
        </div>
      </article>
    </div>
  );
}

function MarketingLeadBillingTrendChart({
  current,
  previous,
  previousRangeLabel,
}: {
  current: MarketingLeadPeriodSummary;
  previous: MarketingLeadPeriodSummary;
  previousRangeLabel: string;
}) {
  const values = [previous.billedAmount, current.billedAmount];
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = index === 0 ? 42 : 258;
    const y = 126 - (value / max) * 88;
    return `${x},${Math.max(28, y)}`;
  });

  return (
    <div className="marketing-lead-billing-trend">
      <div className="marketing-lead-billing-trend-summary">
        <div>
          <span>Facturación actual</span>
          <strong>{formatCurrency(current.billedAmount)}</strong>
          <small>{formatLeadDelta(current.billedAmount, previous.billedAmount)} vs periodo anterior</small>
        </div>
        <div>
          <span>Periodo anterior</span>
          <strong>{formatCurrency(previous.billedAmount)}</strong>
          <small>{previousRangeLabel}</small>
        </div>
      </div>
      <div className="marketing-lead-billing-svg-wrap">
        <svg viewBox="0 0 300 160" role="img" aria-label="Tendencia de facturación de clientes con lead contra el periodo anterior">
          <defs>
            <linearGradient id="marketing-billing-gradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#9aaca3" />
              <stop offset="100%" stopColor="#39715a" />
            </linearGradient>
          </defs>
          <line x1="28" y1="126" x2="272" y2="126" className="axis" />
          <line x1="28" y1="82" x2="272" y2="82" className="grid" />
          <line x1="28" y1="38" x2="272" y2="38" className="grid" />
          <polyline points={points.join(' ')} className="trend-line" style={{ stroke: 'url(#marketing-billing-gradient)' }} />
          {points.map((point, index) => {
            const [x, y] = point.split(',');
            return <circle key={`${index}-${point}`} cx={x} cy={y} r="5" className={`trend-point ${index === 0 ? 'previous' : 'current'}`} />;
          })}
          <text x="42" y="148" textAnchor="middle">Anterior</text>
          <text x="258" y="148" textAnchor="middle">Actual</text>
        </svg>
        <div className="marketing-lead-comparison-legend">
          <span><i className="previous" />Periodo anterior</span>
          <span><i className="current" />Periodo actual</span>
        </div>
      </div>
    </div>
  );
}

type MarketingAgentScore = {
  dimensions: Array<{ label: string; score: number }>;
  rating: string;
  summary: string;
  tone: 'good' | 'warning' | 'risk';
  total: number;
};

function buildMarketingAgentScore(
  current: MarketingLeadPeriodSummary,
  previous: MarketingLeadPeriodSummary,
): MarketingAgentScore {
  const handlingScore = current.created > 0 ? (current.invoiced / current.created) * 100 : 0;
  const followUpScore = current.assigned > 0 ? ((current.assigned - current.open) / current.assigned) * 100 : 0;
  const billingTrendScore = previous.billedAmount <= 0
    ? (current.billedAmount > 0 ? 100 : 0)
    : clampNumber(50 + ((current.billedAmount - previous.billedAmount) / previous.billedAmount) * 50, 0, 100);
  const dimensions = [
    { label: 'Conversión de leads', score: current.wonRate },
    { label: 'De lead a factura', score: handlingScore },
    { label: 'Seguimiento', score: followUpScore },
    { label: 'Tendencia de facturación', score: billingTrendScore },
  ];
  const total = Math.round(
    dimensions[0].score * 0.4 +
    dimensions[1].score * 0.25 +
    dimensions[2].score * 0.2 +
    dimensions[3].score * 0.15,
  );
  const tone = total >= 75 ? 'good' : total >= 55 ? 'warning' : 'risk';
  const rating = total >= 85 ? 'Excelente' : total >= 75 ? 'Sólido' : total >= 55 ? 'En desarrollo' : 'Requiere atención';

  return {
    dimensions: dimensions.map((dimension) => ({ ...dimension, score: Math.round(clampNumber(dimension.score, 0, 100)) })),
    rating,
    summary: total >= 75
      ? 'El embudo muestra un desempeño saludable; mantén la cadencia y enfoca las mejoras en los leads pendientes.'
      : 'Hay oportunidad de mejorar el seguimiento y la conversión antes de ampliar el volumen de leads.',
    tone,
    total: clampNumber(total, 0, 100),
  };
}

function MarketingAgentProfileCard({
  current,
  score,
}: {
  current: MarketingLeadPeriodSummary;
  score: MarketingAgentScore;
}) {
  return (
    <div className={`marketing-agent-profile-card score-${score.tone}`}>
      <div className="marketing-agent-score-ring" style={{ '--marketing-score': `${score.total * 3.6}deg` } as CSSProperties}>
        <div><strong>{score.total}</strong><span>de 100</span></div>
      </div>
      <div className="marketing-agent-profile-copy">
        <span>Calificación de Mis Leads</span>
        <h3>{score.rating}</h3>
        <p>{score.summary}</p>
        <small>{formatNumber(current.assigned)} leads · {formatNumber(current.won)} ganados · {formatCurrency(current.billedAmount)} atribuible</small>
      </div>
      <div className="marketing-agent-score-dimensions">
        {score.dimensions.map((dimension) => (
          <div key={dimension.label}>
            <span>{dimension.label}<b>{dimension.score}</b></span>
            <i><em style={{ width: `${dimension.score}%` }} /></i>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketingAgentProfileModal({
  current,
  onClose,
  score,
}: {
  current: MarketingLeadPeriodSummary;
  onClose: () => void;
  score: MarketingAgentScore;
}) {
  return (
    <div className="modal-backdrop marketing-agent-profile-backdrop" role="dialog" aria-modal="true" aria-label="Calificación de Mis Leads">
      <article className="modal-card marketing-agent-profile-modal">
        <header className="modal-head">
          <div>
            <span>Desempeño comercial del CRM</span>
            <h2>Calificación de Mis Leads</h2>
            <p>Resultado de los leads creados por tu usuario de Odoo, con los filtros aplicados y frente al periodo anterior. La facturación vinculada por cliente no demuestra causalidad de un lead.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar perfil"><X size={18} /></button>
        </header>
        <MarketingAgentProfileCard current={current} score={score} />
      </article>
    </div>
  );
}

function MarketingLeadDecisionCards({
  current,
  previous,
}: {
  current: MarketingLeadPeriodSummary;
  previous: MarketingLeadPeriodSummary;
}) {
  const followUpShare = current.assigned > 0 ? (current.open / current.assigned) * 100 : 0;
  const previousFollowUpShare = previous.assigned > 0 ? (previous.open / previous.assigned) * 100 : 0;
  const cards = [
    {
      label: 'Facturación de clientes con lead',
      value: formatCurrency(current.billedAmount),
      delta: formatLeadDelta(current.billedAmount, previous.billedAmount),
      note: 'Facturas del corte, sin duplicar clientes',
    },
    {
      label: 'Presión de seguimiento',
      value: formatPercent(followUpShare),
      delta: formatLeadDelta(followUpShare, previousFollowUpShare, true),
      note: 'Leads que aún requieren acción',
    },
    {
      label: 'Ganados y perdidos',
      value: formatNumber(current.won + current.lost),
      delta: formatLeadDelta(current.won + current.lost, previous.won + previous.lost),
      note: 'Cierres ganados y perdidos en el corte',
    },
  ];

  return (
    <div className="marketing-lead-decision-cards">
      {cards.map((card) => (
        <article key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.delta} vs periodo anterior</small>
          <p>{card.note}</p>
        </article>
      ))}
    </div>
  );
}

function MarketingLeadPerformanceChart({ current }: { current: MarketingLeadPeriodSummary }) {
  if (!current.sellerRows.length) {
    return <p className="marketing-empty-note">No hay leads asignados en el periodo seleccionado.</p>;
  }
  const maxAssigned = Math.max(1, ...current.sellerRows.map((row) => row.won + row.lost + row.open));

  return (
    <div className="marketing-lead-performance-chart">
      <p className="marketing-chart-caveat">Los ganados y perdidos pueden provenir de asignaciones de otros periodos.</p>
      <div className="marketing-lead-chart-legend">
        <span><i className="won" />Ganados</span>
        <span><i className="lost" />Perdidos</span>
        <span><i className="open" />En seguimiento</span>
      </div>
      {current.sellerRows.map((row) => (
        <div className="marketing-lead-performance-row" key={`${row.sellerId ?? 'none'}-${row.sellerName}`}>
          <div className="marketing-lead-performance-label">
            <strong>{row.sellerName}</strong>
            <small>{formatNumber(row.assigned)} asignados · {formatCurrency(row.billedAmount)} facturado</small>
          </div>
          <div className="marketing-lead-performance-track" aria-label={`${row.sellerName}: ${formatPercent(row.wonRate)} de cumplimiento`}>
            <i className="won" style={{ width: `${Math.max(0, row.won / maxAssigned * 100)}%` }} />
            <i className="lost" style={{ width: `${Math.max(0, row.lost / maxAssigned * 100)}%` }} />
            <i className="open" style={{ width: `${Math.max(0, row.open / maxAssigned * 100)}%` }} />
          </div>
          <strong className="marketing-lead-performance-rate">{formatPercent(row.wonRate)}</strong>
        </div>
      ))}
    </div>
  );
}

function LazyMarketingBlock({
  children,
  minHeight = 260,
}: {
  children: () => ReactNode;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (shouldRender) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: '360px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldRender]);

  return (
    <div ref={ref}>
      {shouldRender ? children() : <MarketingSectionSkeleton minHeight={minHeight} />}
    </div>
  );
}

function MarketingSectionSkeleton({ minHeight }: { minHeight: number }) {
  return (
    <article className="panel reports-static-panel marketing-panel marketing-lazy-skeleton" style={{ minHeight }}>
      <div className="marketing-skeleton-line short" />
      <div className="marketing-skeleton-line" />
      <div className="marketing-skeleton-grid">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function MarketingPanel({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <article className="panel reports-static-panel marketing-panel">
      <div className="panel-header">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="reports-panel-body">{children}</div>
    </article>
  );
}

function MarketingHealthCard({
  score,
  signals,
  tone,
}: {
  score: number;
  signals: Array<{ label: string; value: string }>;
  tone: 'good' | 'risk' | 'warning';
}) {
  return (
    <article className={`marketing-health-card marketing-health-${tone}`}>
      <div className="marketing-health-copy">
        <span>Salud de marketing</span>
        <strong>{formatNumber(score)}%</strong>
        <p>Índice combinado de conversión, concentración, cartera en riesgo y seguimiento CRM.</p>
      </div>
      <div
        aria-label={`Salud de marketing ${formatNumber(score)} por ciento`}
        className="marketing-health-gauge"
        role="img"
        style={{ '--marketing-score': `${score}%` } as CSSProperties}
      >
        <span>{formatNumber(score)}</span>
      </div>
      <div className="marketing-health-signals">
        {signals.map((signal) => (
          <div className="marketing-health-signal" key={signal.label}>
            <span>{signal.label}</span>
            <MarketingInfoPopover explanation={getMarketingHealthSignalExplanation(signal.label)} />
            <strong>{signal.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function MarketingKpiInfoCard({
  explanation,
  icon,
  label,
  value,
}: {
  explanation: MarketingInfoExplanation;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="stat-card marketing-kpi-info-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <MarketingInfoPopover explanation={explanation} />
    </div>
  );
}

function MarketingInfoPopover({ explanation }: { explanation: MarketingInfoExplanation }) {
  return (
    <span className="marketing-info-popover-wrap">
      <button
        type="button"
        className="marketing-info-button"
        aria-label={`Explicación de ${explanation.title}`}
      >
        <Info size={14} />
      </button>
      <span className="marketing-info-popover" role="tooltip">
        <strong>{explanation.title}</strong>
        <span>{explanation.definition}</span>
        <em>{explanation.importance}</em>
      </span>
    </span>
  );
}

function MarketingBarChart({
  rows,
  subtitle,
  title,
}: {
  rows: MarketingBarRow[];
  subtitle: string;
  title: string;
}) {
  return (
    <article className="marketing-chart-card">
      <div className="reports-info-copy">
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
      <div className="marketing-bars">
        {rows.length > 0 ? rows.map((row) => (
          <div className="marketing-bar-row" key={row.label}>
            <div>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="marketing-bar-track">
              <span style={{ width: `${Math.max(3, Math.min(100, row.sharePct))}%` }} />
            </div>
            {row.meta ? <small>{row.meta}</small> : null}
          </div>
        )) : (
          <p className="marketing-empty-note">No hay datos suficientes para graficar este corte.</p>
        )}
      </div>
    </article>
  );
}

function MarketingSegmentDonutChart({ segments }: { segments: MarketingViewModel['segments'] }) {
  const colors = ['#39715a', '#be805e', '#6e90a4', '#aa9a68', '#b76d74'];
  const visible = segments.filter((segment) => segment.customers > 0).slice(0, 5);
  const total = segments.reduce((sum, segment) => sum + segment.customers, 0);
  let offset = 0;
  const stops = visible.map((segment, index) => {
    const start = offset;
    offset += total ? segment.customers / total * 100 : 0;
    return `${colors[index]} ${start}% ${offset}%`;
  });
  if (offset < 100) stops.push(`#e1e8e1 ${offset}% 100%`);

  return <article className="marketing-chart-card marketing-segment-chart">
    <div className="reports-info-copy"><strong>Clientes por segmento</strong><p>Audiencias RFM para decidir retención, recompra y recuperación.</p></div>
    <div className="marketing-segment-layout">
      <div className="marketing-segment-ring" style={{ background: total ? `conic-gradient(${stops.join(', ')})` : '#e1e8e1' }} role="img" aria-label={`${formatNumber(total)} clientes segmentados`}>
        <div><strong>{formatNumber(total)}</strong><span>clientes</span></div>
      </div>
      <div className="marketing-segment-legend">
        {visible.map((segment, index) => <div key={segment.label}><i style={{ background: colors[index] }} /><span>{segment.label}</span><strong>{segment.shareLabel}</strong></div>)}
      </div>
    </div>
  </article>;
}

function MarketingMethodChart({ marketing, title }: { marketing: MarketingViewModel; title: string }) {
  const rows = title === 'RFM para segmentación'
    ? marketing.segmentBars
    : title === 'Pareto comercial'
      ? marketing.decisionDetails.audiences.chartRows
      : title === 'Pipeline ponderado'
        ? marketing.leads.crm.funnelRows.map((row) => ({ label: row.label, value: row.amount, sharePct: row.sharePct, meta: row.value }))
        : marketing.leads.crm.attentionBySeller.slice(0, 5).map((row) => ({
          label: row.sellerName,
          value: formatNumber(row.count),
          sharePct: row.count / Math.max(1, marketing.leads.crm.attentionBySeller[0]?.count ?? 1) * 100,
          meta: `${formatCurrency(row.expectedRevenue)} esperado`,
        }));
  return <MarketingBarChart rows={rows} title={title === 'Higiene de leads' ? 'Seguimiento por vendedor' : 'Distribución visible'} subtitle="Detalle visual del indicador" />;
}

function MarketingFunnelChart({ rows }: { rows: MarketingFunnelRow[] }) {
  return (
    <div className="marketing-funnel">
      {rows.length > 0 ? rows.map((row) => (
        <article className="marketing-funnel-step" key={row.label}>
          <div>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.amount}</small>
          </div>
          <div className="marketing-funnel-track">
            <span style={{ width: `${Math.max(8, Math.min(100, row.sharePct))}%` }} />
          </div>
        </article>
      )) : (
        <p className="marketing-empty-note">No hay leads u oportunidades abiertas para construir el embudo.</p>
      )}
    </div>
  );
}

function MarketingDecisionDetail({
  detailKey,
  marketing,
}: {
  detailKey: MarketingDecisionDetailKey;
  marketing: MarketingViewModel;
}) {
  const [isRowsModalOpen, setIsRowsModalOpen] = useState(false);
  const detail = marketing.decisionDetails[detailKey];

  return (
    <article className="marketing-detail-panel">
      <div className="marketing-detail-head">
        <div className="reports-info-copy">
          <strong>{detail.title}</strong>
          <p>{detail.description}</p>
        </div>
        <div className="marketing-detail-actions">
          <button
            type="button"
            className="marketing-export-button"
            onClick={() => exportMarketingRowsCsv(detail.title, detail.tableRows)}
          >
            <Download size={14} />
            Descargar CSV / Excel
          </button>
          <button
            type="button"
            className="marketing-export-button marketing-view-button"
            onClick={() => setIsRowsModalOpen(true)}
            aria-label={`Ver datos de ${detail.title}`}
          >
            <Eye size={15} />
            Ver datos
          </button>
        </div>
      </div>
      <div className="marketing-detail-chart-only">
        <MarketingBarChart rows={detail.chartRows} subtitle={detail.chartSubtitle} title={detail.chartTitle} />
      </div>
      {isRowsModalOpen ? (
        <MarketingRowsModal
          detail={detail}
          onClose={() => setIsRowsModalOpen(false)}
        />
      ) : null}
    </article>
  );
}

function MarketingRowsModal({
  detail,
  onClose,
}: {
  detail: MarketingDecisionDetailModel;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const visibleRows = filterMarketingRows(detail.tableRows, searchTerm);

  return (
    <div className="modal-backdrop marketing-insight-backdrop" role="dialog" aria-modal="true" aria-label={detail.title}>
      <article className="modal-card marketing-insight-modal marketing-rows-modal">
        <header className="modal-head marketing-insight-head">
          <div>
            <span>Datos completos</span>
            <h2>{detail.title}</h2>
            <p>{detail.description}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar datos">
            <X size={18} />
          </button>
        </header>
        <div className="marketing-insight-body">
          <div className="marketing-insight-table-head">
            <div className="reports-info-copy">
              <strong>{formatNumber(visibleRows.length)} de {formatNumber(detail.tableRows.length)} registros disponibles</strong>
              <p>Registros de Odoo y contexto asociados al indicador seleccionado.</p>
            </div>
            <button
              type="button"
              className="marketing-export-button"
              onClick={() => exportMarketingRowsCsv(detail.title, visibleRows)}
            >
              <Download size={14} />
              Descargar CSV / Excel
            </button>
          </div>
          <MarketingRowsSearch value={searchTerm} onChange={setSearchTerm} />
          <MarketingMiniTable rows={visibleRows} />
        </div>
      </article>
    </div>
  );
}

function MarketingMiniTable({ rows }: { rows: MarketingMiniRow[] }) {
  return (
    <div className="marketing-mini-table">
      {rows.length > 0 ? rows.map((row) => (
        <div key={`${row.label}-${row.value}`}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          {row.email || row.phone ? (
            <small className="marketing-contact-line">
              {[row.email ? `Correo: ${row.email}` : null, row.phone ? `Teléfono: ${row.phone}` : null]
                .filter(Boolean)
                .join(' · ')}
            </small>
          ) : null}
          {row.address ? <small className="marketing-contact-line">Dirección: {row.address}</small> : null}
          {row.meta ? <small>{row.meta}</small> : null}
        </div>
      )) : (
        <p className="marketing-empty-note">No hay datos suficientes para este detalle.</p>
      )}
    </div>
  );
}

function MarketingRowsSearch({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="marketing-modal-search">
      <span>Buscar en los datos</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cliente, vendedor, producto, correo, teléfono, categoría..."
      />
    </label>
  );
}

function MarketingNotificationCenter({
  marketing,
  onOpenInsight,
  persistedNotifications,
}: {
  marketing: MarketingViewModel;
  onOpenInsight: (insight: MarketingInsightModalData) => void;
  persistedNotifications: MarketingPersistedNotification[];
}) {
  const generatedNotifications = buildMarketingActionNotifications(marketing);
  const persistedByFingerprint = persistedNotifications.reduce((map, notification) => {
    const fingerprint = typeof notification.metadata?.fingerprint === 'string'
      ? notification.metadata.fingerprint
      : '';
    if (fingerprint) {
      map.set(fingerprint, notification);
    }
    return map;
  }, new Map<string, MarketingPersistedNotification>());

  return (
    <MarketingPanel
      title="Centro de notificaciones"
      subtitle="Prioridades accionables para mejorar mercadotecnia, leads, segmentación y retención."
    >
      <div className="marketing-notification-grid">
        {generatedNotifications.map((notification) => {
          const persisted = persistedByFingerprint.get(notification.fingerprint);
          const isRead = persisted?.is_read === true;
          return (
            <article
              className={`marketing-notification-card marketing-notification-${notification.tone}${isRead ? ' is-read' : ''}`}
              key={notification.fingerprint}
            >
              <div className="marketing-notification-head">
                <span>{notification.metric}</span>
                <small>{notification.severity === 'critical' ? 'Prioridad crítica' : 'Prioridad media'}</small>
              </div>
              <strong>{notification.title}</strong>
              <p>{notification.description}</p>
              <div className="marketing-action-strip">
                <span>{notification.action}</span>
                {isRead ? <span>Leída</span> : null}
              </div>
              <div className="marketing-notification-actions">
                <button
                  type="button"
                  className="marketing-export-button"
                  onClick={() => onOpenInsight(buildMarketingInsightModal({
                    action: notification.action,
                    description: notification.description,
                    metric: notification.metric,
                    rows: notification.rows,
                    title: notification.title,
                    type: 'notification',
                  }))}
                >
                  Ver plan de acción
                </button>
                <button
                  type="button"
                  className="marketing-export-button"
                  onClick={() => exportMarketingRowsCsv(notification.title, notification.rows)}
                >
                  <Download size={14} />
                  CSV
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </MarketingPanel>
  );
}

function MarketingInsightModal({
  insight,
  onClose,
}: {
  insight: MarketingInsightModalData;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const visibleRows = filterMarketingRows(insight.rows, searchTerm);

  return (
    <div className="modal-backdrop marketing-insight-backdrop" role="dialog" aria-modal="true" aria-label={insight.title}>
      <article className="modal-card marketing-insight-modal">
        <header className="modal-head marketing-insight-head">
          <div>
            <span>{insight.type === 'method' ? 'Modelo de decisión' : insight.type === 'executive' ? 'Lectura ejecutiva' : 'Notificación accionable'}</span>
            <h2>{insight.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar análisis">
            <X size={18} />
          </button>
        </header>
        <div className="marketing-insight-body">
          <section className="marketing-insight-summary">
            <div>
              <small>KPI</small>
              <strong>{insight.metric}</strong>
            </div>
            <div>
              <small>Acción recomendada</small>
              <strong>{insight.action}</strong>
            </div>
          </section>

          <section className="reports-info-copy">
            <strong>Lectura del dato</strong>
            <p>{insight.description}</p>
          </section>

          <section className="marketing-insight-grid">
            <div>
              <strong>Observaciones</strong>
              <ul>
                {insight.observations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <strong>Ideas de mejora</strong>
              <ul>
                {insight.ideas.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <strong>Proyección</strong>
              <p>{insight.projection}</p>
            </div>
            <div>
              <strong>Método recomendado</strong>
              <ul>
                {insight.methods.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </section>

          <section>
            <div className="marketing-insight-table-head">
              <div className="reports-info-copy">
                <strong>Datos que originan la decisión</strong>
                <p>{formatNumber(visibleRows.length)} de {formatNumber(insight.rows.length)} registros asociados al indicador.</p>
              </div>
              <button
                type="button"
                className="marketing-export-button"
                onClick={() => exportMarketingRowsCsv(insight.title, visibleRows)}
              >
                <Download size={14} />
                Descargar CSV
              </button>
            </div>
            <MarketingRowsSearch value={searchTerm} onChange={setSearchTerm} />
            <MarketingMiniTable rows={visibleRows} />
          </section>
        </div>
      </article>
    </div>
  );
}

function MarketingRanking({ rows, title }: { rows: MarketingRankRow[]; title: string }) {
  return (
    <article className="reports-info-card marketing-ranking">
      <div className="reports-info-copy">
        <strong>{title}</strong>
        <p>Ordenado por facturación sin impuestos del periodo.</p>
      </div>
      <div className="marketing-ranking-list">
        {rows.map((row, index) => (
          <div key={row.label}>
            <span>{index + 1}. {row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

type MarketingInfoExplanation = {
  definition: string;
  importance: string;
  title: string;
};

type MarketingViewModel = {
  alerts: Array<{ action: string; description: string; title: string; tone: 'good' | 'risk' | 'warning' }>;
  atRiskCustomers: MarketingRankRow[];
  campaigns: Array<{
    audience: string;
    description: string;
    kpi: string;
    metric: string;
    priority: string;
    title: string;
  }>;
  categoryCampaignRows: MarketingMiniRow[];
  categoryBars: MarketingBarRow[];
  crmFollowUps: MarketingRankRow[];
  crmFunnel: MarketingFunnelRow[];
  crmKpis: Array<{ label: string; value: string }>;
  crmStages: MarketingRankRow[];
  crossSellCustomers: MarketingRankRow[];
  decisionDetails: Record<MarketingDecisionDetailKey, MarketingDecisionDetailModel>;
  decisions: Array<{
    area: string;
    description: string;
    detailKey: MarketingDecisionDetailKey;
    metric: string;
    title: string;
    tone: 'good' | 'risk' | 'warning';
  }>;
  executiveNotes: Array<{
    action: string;
    description: string;
    metric: string;
    rows: MarketingMiniRow[];
    title: string;
  }>;
  health: {
    score: number;
    signals: Array<{ label: string; value: string }>;
    tone: 'good' | 'risk' | 'warning';
  };
  highValueCustomers: MarketingRankRow[];
  kpis: Array<{ label: string; value: string }>;
  leads: MarketingLeadsAnalytics;
  methods: Array<{
    action: string;
    csvRows?: MarketingMiniRow[];
    description: string;
    metric: string;
    rows: MarketingMiniRow[];
    title: string;
  }>;
  productBars: MarketingBarRow[];
  productCampaignRows: MarketingMiniRow[];
  repurchaseProducts: MarketingRankRow[];
  segmentBars: MarketingBarRow[];
  segments: Array<{ customers: number; label: string; recommendation: string; shareLabel: string }>;
  topCategories: MarketingRankRow[];
  topProducts: MarketingRankRow[];
};

type MarketingRankRow = {
  label: string;
  meta?: string;
  value: string;
};

type MarketingDecisionDetailKey = 'risk' | 'demand' | 'crm' | 'audiences';

type MarketingDecisionDetailModel = {
  chartRows: MarketingBarRow[];
  chartSubtitle: string;
  chartTitle: string;
  description: string;
  tableRows: MarketingMiniRow[];
  title: string;
};

type MarketingMiniRow = {
  address?: string | null;
  categories?: string | null;
  contact?: string;
  customerId?: number | null;
  customerName?: string | null;
  email?: string | null;
  label: string;
  leadId?: number;
  meta?: string;
  phone?: string | null;
  products?: string | null;
  seller?: string | null;
  status?: string | null;
  value: string;
};

type MarketingBarRow = {
  label: string;
  meta?: string;
  sharePct: number;
  value: string;
};

type MarketingFunnelRow = {
  amount: string;
  label: string;
  sharePct: number;
  value: string;
};

type MarketingPersistedNotification = Pick<
  SalesAgentNotificationRow,
  'id' | 'title' | 'message' | 'recommendation' | 'severity' | 'is_read' | 'last_detected_at' | 'metadata'
>;

type MarketingActionNotification = {
  action: string;
  category: SalesAgentNotificationRow['category'];
  description: string;
  fingerprint: string;
  metric: string;
  rows: MarketingMiniRow[];
  severity: SalesAgentNotificationRow['severity'];
  title: string;
  tone: 'risk' | 'warning' | 'good';
};

type MarketingInsightModalData = {
  action: string;
  description: string;
  ideas: string[];
  metric: string;
  methods: string[];
  observations: string[];
  projection: string;
  rows: MarketingMiniRow[];
  title: string;
  type: 'method' | 'executive' | 'notification';
};

type MarketingLeadSellerRow = {
  assigned: number;
  billedAmount: number;
  created: number;
  invoiced: number;
  linked: number;
  lost: number;
  open: number;
  sellerId: number | null;
  sellerName: string;
  won: number;
  wonRate: number;
};

type MarketingLeadPeriodSummary = {
  assigned: number;
  billedAmount: number;
  created: number;
  invoiced: number;
  linked: number;
  lost: number;
  open: number;
  sellerRows: MarketingLeadSellerRow[];
  sourceReady: boolean;
  sourceRows: MarketingLeadSourceRow[];
  won: number;
  wonRate: number;
};

type MarketingLeadsAnalytics = {
  crm: ReturnType<typeof buildCrmMarketingInsights>;
  current: MarketingLeadPeriodSummary;
  kpiDetails: Record<MarketingLeadKpiKey, MarketingDecisionDetailModel>;
  currentRows: MarketingMiniRow[];
  currentRangeLabel: string;
  intake: MarketingLeadIntakePoint[];
  previous: MarketingLeadPeriodSummary;
  previousReady: boolean;
  previousRangeLabel: string;
};

type MarketingLeadKpiKey = 'assigned' | 'won' | 'lost' | 'billed' | 'wonRate' | 'open';

function buildMarketingViewModel(
  snapshot: ReturnType<typeof buildCommercialDashboard>,
  dataset: OdooCommercialDataset,
  previousFilters: ReportFilters | null = null,
  previousDataset: OdooCommercialDataset | null = null,
): MarketingViewModel {
  const totalClients = snapshot.clientLifecycle.rows.length;
  const atRisk = snapshot.clientLifecycle.summary.atRiskCustomers;
  const topCategory = snapshot.sellers.categoryBreakdown[0] ?? null;
  const topProducts = snapshot.products.topByRevenue.slice(0, 6);
  const topProduct = topProducts[0] ?? null;
  const conversion = snapshot.conversion.overall.current;
  const leads = buildMarketingLeadsAnalytics({
    dataset,
    filters: snapshot.filters,
    previousDataset,
    previousFilters,
  });
  const concentration = snapshot.pareto.customers.rows.slice(0, 5).reduce((sum, row) => sum + row.individualPct, 0);
  const crm = buildCrmMarketingInsights(marketingLeadsForPeriod(dataset, snapshot.filters), snapshot.filters.endDate);
  const customerContactIndex = buildCustomerContactIndex(dataset);
  const atRiskShare = totalClients > 0 ? (atRisk / totalClients) * 100 : 0;
  const healthScore = calculateMarketingHealthScore({
    atRiskShare,
    concentration,
    conversion,
    staleCrmShare: crm.openCount > 0 ? (crm.staleCount / crm.openCount) * 100 : 0,
  });
  const healthTone = healthScore >= 75 ? 'good' : healthScore >= 55 ? 'warning' : 'risk';
  const atRiskCustomersAll = snapshot.clientLifecycle.rows
    .filter((row) => row.currentStatus === 'en_riesgo' || row.riskLevel === 'alto')
    .sort((left, right) => right.revenue - left.revenue);
  const atRiskCustomers = atRiskCustomersAll.slice(0, 8);
  const highValueCustomers = snapshot.clientLifecycle.rows
    .filter((row) => row.revenue > 0)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 8);
  const repeatProducts = snapshot.products.topByRevenue
    .filter((row) => row.repeatPurchaseRate > 0 || row.uniqueCustomers > 1)
    .sort((left, right) => right.repeatPurchaseRate - left.repeatPurchaseRate || right.revenue - left.revenue)
    .slice(0, 8);
  const crossSellCustomersAll = snapshot.pareto.customers.rows
    .filter((row) => row.classification === 'A' || row.classification === 'B')
    .sort((left, right) => right.value - left.value);
  const crossSellCustomers = crossSellCustomersAll.slice(0, 8);
  const categoryBars = snapshot.sellers.categoryBreakdown.slice(0, 6).map((row) => ({
    label: row.categoryName,
    meta: `${formatNumber(row.activeSellers)} vendedores activos`,
    sharePct: row.sharePct,
    value: formatCurrency(row.soldAmount),
  }));
  const productBars = topProducts.map((row) => ({
    label: row.productName,
    meta: `${formatNumber(row.uniqueCustomers)} clientes`,
    sharePct: row.revenueSharePct,
    value: formatCurrency(row.revenue),
  }));
  const segmentBars = snapshot.clientLifecycle.rfmSegments
    .slice()
    .sort((left, right) => right.customers - left.customers)
    .map((segment) => ({
      label: segment.segment,
      sharePct: totalClients > 0 ? (segment.customers / totalClients) * 100 : 0,
      value: formatNumber(segment.customers),
    }));
  const customerActivityRows = buildCustomerActivityCampaignRows({
    contactIndex: customerContactIndex,
    dataset,
    endDate: snapshot.filters.endDate,
    startDate: snapshot.filters.startDate,
  });
  const customerActivityByKey = indexMarketingRowsByCustomer(customerActivityRows);
  const customerCampaignRows = snapshot.clientLifecycle.rows
    .slice()
    .sort((left, right) => right.revenue - left.revenue)
    .map((row) => buildCustomerCampaignRow(customerContactIndex, row, customerActivityByKey));
  const rfmCustomerRows = customerCampaignRows
    .slice()
    .sort((left, right) => {
      const leftRisk = left.meta?.includes('en_riesgo') ? 1 : 0;
      const rightRisk = right.meta?.includes('en_riesgo') ? 1 : 0;
      return rightRisk - leftRisk || parseCurrencyish(right.value) - parseCurrencyish(left.value);
    });
  const portfolioAttentionRows = snapshot.clientLifecycle.rows
    .filter((row) => ['en_riesgo', 'casi_perdido', 'dormido', 'perdido', 'observacion'].includes(row.currentStatus))
    .sort((left, right) => {
      const statusPriority = marketingClientStatusPriority(right.currentStatus) - marketingClientStatusPriority(left.currentStatus);
      return statusPriority || right.revenue - left.revenue;
    })
    .map((row) => buildCustomerCampaignRow(customerContactIndex, row, customerActivityByKey));
  const categoryCustomerRows = buildCategoryCustomerCampaignRows({
    contactIndex: customerContactIndex,
    dataset,
    endDate: snapshot.filters.endDate,
    startDate: snapshot.filters.startDate,
    topCategoryName: topCategory?.categoryName ?? null,
  });
  const topProductCustomerRows = buildProductCustomerCampaignRows({
    contactIndex: customerContactIndex,
    dataset,
    endDate: snapshot.filters.endDate,
    startDate: snapshot.filters.startDate,
    topProductName: topProduct?.productName ?? null,
  });
  const riskChartRows = atRiskCustomers.slice(0, 6).map((row) => ({
    label: row.customerName,
    meta: `${row.daysSinceLastPurchase ?? 0} días sin compra`,
    sharePct: atRiskCustomers[0]?.revenue ? (row.revenue / atRiskCustomers[0].revenue) * 100 : 0,
    value: formatCurrency(row.revenue),
  }));
  const riskTableRows = atRiskCustomersAll.map((row) =>
    buildCustomerCampaignRow(customerContactIndex, row, customerActivityByKey),
  );
  const audienceRows = crossSellCustomersAll.map((row) => {
    const customerId = Number.isFinite(Number(row.key)) ? Number(row.key) : null;
    const activity = readMarketingActivityInfo(customerActivityByKey, customerId, row.label);
    const contact = readCustomerContactInfo(customerContactIndex, customerId, row.label);
    return {
      ...contact,
      ...activity,
      customerId,
      customerName: row.label,
      label: row.label,
      meta: [
        `${formatNumber(row.orders)} órdenes`,
        `Clasificación ${row.classification}`,
        activity?.seller ? `Vendedor: ${activity.seller}` : null,
        activity?.products ? `Productos: ${activity.products}` : null,
      ].filter(Boolean).join(' · '),
      status: row.classification,
      value: formatCurrency(row.value),
    };
  });

  return {
    health: {
      score: healthScore,
      signals: [
        { label: 'Conversión', value: formatPercent(conversion) },
        { label: 'Clientes en riesgo', value: formatPercent(atRiskShare) },
        { label: 'Concentración top 5', value: formatPercent(concentration) },
        { label: 'CRM sin seguimiento', value: formatNumber(crm.staleCount) },
      ],
      tone: healthTone,
    },
    kpis: [
      { label: 'Facturación segmentable', value: formatCurrency(snapshot.invoicing.invoicedAmount.current) },
      { label: 'Clientes activos', value: formatNumber(snapshot.clientLifecycle.summary.activeCustomers) },
      { label: 'Clientes en riesgo', value: formatNumber(atRisk) },
      { label: 'Conversión comercial', value: formatPercent(conversion) },
      { label: 'Ticket promedio', value: formatCurrency(snapshot.sales.averageTicket.current) },
      { label: 'Pipeline CRM ponderado', value: formatCurrency(crm.weightedPipeline) },
      { label: 'Leads u oportunidades activas', value: formatNumber(crm.openCount) },
      { label: 'Oportunidades sin seguimiento', value: formatNumber(crm.staleCount) },
    ],
    leads,
    categoryBars,
    categoryCampaignRows: categoryCustomerRows,
    crmKpis: [
      { label: 'Leads y oportunidades', value: formatNumber(crm.totalCount) },
      { label: 'Abiertas', value: formatNumber(crm.openCount) },
      { label: 'Pipeline estimado', value: formatCurrency(crm.pipelineAmount) },
      { label: 'Pipeline ponderado', value: formatCurrency(crm.weightedPipeline) },
      { label: 'Cambios últimos 7 días', value: formatNumber(crm.recentChanges) },
      { label: 'Vencidas o sin próxima acción', value: formatNumber(crm.overdueCount + crm.staleCount) },
    ],
    crmFunnel: crm.funnelRows,
    decisions: [
      {
        area: 'Retención',
        title: atRisk > 0 ? 'Recuperar antes de captar más' : 'Proteger cartera activa',
        description:
          atRisk > 0
            ? 'Hay clientes con valor que necesitan contacto, contenido o incentivo de recompra antes de perder recurrencia.'
            : 'La base activa luce estable; conviene sostener frecuencia y satisfacción.',
        metric: `${formatNumber(atRisk)} clientes en riesgo`,
        detailKey: 'risk',
        tone: atRisk > 0 ? 'warning' : 'good',
      },
      {
        area: 'Demanda',
        title: topCategory ? `Impulsar ${topCategory.categoryName}` : 'Esperar mayor señal por categoría',
        description:
          topCategory
            ? 'La categoría líder puede usarse para campañas por industria, bundles o mensajes de especialidad.'
            : 'No hay suficiente concentración por categoría para una apuesta fuerte.',
        metric: topCategory ? `${formatPercent(topCategory.sharePct)} de participación` : 'Sin categoría líder',
        detailKey: 'demand',
        tone: topCategory && topCategory.sharePct >= 35 ? 'good' : 'warning',
      },
      {
        area: 'CRM',
        title: crm.staleCount > 0 ? 'Cerrar fugas del embudo' : 'Mantener cadencia CRM',
        description:
          crm.staleCount > 0
            ? 'Las oportunidades sin movimiento requieren campañas de seguimiento, recordatorios o contenidos técnicos.'
            : 'El embudo no muestra abandono crítico con los datos actuales.',
        metric: `${formatNumber(crm.staleCount)} sin seguimiento`,
        detailKey: 'crm',
        tone: crm.staleCount > 0 ? 'risk' : 'good',
      },
      {
        area: 'Concentración',
        title: concentration >= 70 ? 'Reducir dependencia de pocos clientes' : 'Escalar audiencias similares',
        description:
          concentration >= 70
            ? 'La facturación depende demasiado de pocos clientes; conviene ampliar cuentas parecidas y campañas lookalike.'
            : 'La concentración permite diseñar campañas por clusters sin depender de una sola cuenta.',
        metric: `Top 5: ${formatPercent(concentration)}`,
        detailKey: 'audiences',
        tone: concentration >= 70 ? 'risk' : 'good',
      },
    ],
    decisionDetails: {
      risk: {
        chartRows: riskChartRows,
        chartSubtitle: 'Valor facturado de clientes con señal de riesgo',
        chartTitle: 'Clientes en riesgo que originan el KPI',
        description: 'Estos clientes explican el dato de riesgo; prioriza contacto humano, campaña de recompra y propuesta con vigencia.',
        tableRows: riskTableRows,
        title: 'Detalle de clientes en riesgo',
      },
      demand: {
        chartRows: categoryBars,
        chartSubtitle: 'Participación del mes corriente por categoría',
        chartTitle: 'Categorías que originan la participación',
        description: 'La participación se calcula desde facturación sin impuestos del mes corriente. Usa las categorías líderes para campañas, bundles y contenidos técnicos.',
        tableRows: categoryCustomerRows.length > 0 ? categoryCustomerRows : snapshot.sellers.categoryBreakdown.slice(0, 8).map((row) => ({
          label: row.categoryName,
          meta: `${formatNumber(row.activeSellers)} vendedores · líder: ${row.topSellerName ?? 'Sin vendedor'}`,
          value: `${formatCurrency(row.soldAmount)} · ${formatPercent(row.sharePct)}`,
        })),
        title: 'Detalle de participación por categoría',
      },
      crm: {
        chartRows: crm.funnelRows.map((row) => ({
          label: row.label,
          meta: row.amount,
          sharePct: row.sharePct,
          value: row.value,
        })),
        chartSubtitle: 'Etapas y oportunidades que explican las fugas',
        chartTitle: 'Fugas del embudo CRM',
        description: 'Las fugas salen de oportunidades abiertas con fecha vencida o sin cambios recientes. Marketing puede activar recordatorios, contenido técnico y cadencias por vendedor.',
        tableRows: crm.sellerRows,
        title: 'Detalle de higiene de leads',
      },
      audiences: {
        chartRows: crossSellCustomers.slice(0, 6).map((row) => ({
          label: row.label,
          meta: `${formatNumber(row.orders)} órdenes`,
          sharePct: crossSellCustomers[0]?.value ? (row.value / crossSellCustomers[0].value) * 100 : 0,
          value: formatCurrency(row.value),
        })),
        chartSubtitle: 'Clientes base para audiencias similares',
        chartTitle: 'Clientes Pareto para escalar audiencias',
        description: 'Estos clientes sirven como punto de partida para campañas lookalike, casos de uso por industria y venta cruzada.',
        tableRows: audienceRows,
        title: 'Detalle para escalar audiencias',
      },
    },
    executiveNotes: [
      {
        title: 'Segmentar antes de pautar',
        description:
          'Prioriza campañas por valor, frecuencia y recencia de compra. Evita mensajes genéricos a toda la base cuando hay clientes con ciclos y categorías diferentes.',
        metric: `${formatNumber(totalClients)} clientes segmentados`,
        action: 'Usar RFM por campaña',
        rows: rfmCustomerRows,
      },
      {
        title: 'Usar ventas reales como señal de demanda',
        description:
          topCategory
            ? `${topCategory.categoryName} concentra ${formatPercent(topCategory.sharePct)} de la facturación por categoría; puede servir como eje de campañas, remarketing y venta cruzada.`
            : 'Aún no hay una categoría líder suficientemente clara en el periodo analizado.',
        metric: topCategory ? `${formatCurrency(topCategory.soldAmount)} en categoría líder` : 'Sin categoría líder',
        action: 'Crear campaña por categoría',
        rows: categoryCustomerRows.length > 0 ? categoryCustomerRows : customerActivityRows.length > 0 ? customerActivityRows : snapshot.sellers.categoryBreakdown.slice(0, 8).map((row) => ({
          label: row.categoryName,
          meta: `${formatNumber(row.activeSellers)} vendedores · líder: ${row.topSellerName ?? 'Sin vendedor'}`,
          value: `${formatCurrency(row.soldAmount)} · ${formatPercent(row.sharePct)}`,
        })),
      },
      {
        title: 'Cerrar fugas de cartera',
        description:
          atRisk > 0
            ? `${formatNumber(atRisk)} clientes aparecen en riesgo. Marketing debe apoyar con recuperación, recordatorios y ofertas de recompra.`
            : 'La cartera no muestra un volumen crítico de clientes en riesgo en este corte.',
        metric: `${formatCurrency(snapshot.clientLifecycle.summary.valueAtRisk)} en valor en riesgo`,
        action: atRisk > 0 ? 'Activar flujo de recompra' : 'Monitorear',
        rows: portfolioAttentionRows.length > 0 ? portfolioAttentionRows : riskTableRows,
      },
      {
        title: 'Alinear CRM con demanda real',
        description:
          crm.openCount > 0
            ? `Hay ${formatNumber(crm.openCount)} leads u oportunidades abiertas con ${formatCurrency(crm.weightedPipeline)} de pipeline ponderado. Conviene priorizar las que tienen fecha vencida o no han tenido movimiento.`
            : 'No hay pipeline abierto detectado en el corte disponible; conviene revisar captura de oportunidades en CRM.',
        metric: `${formatNumber(crm.staleCount)} sin seguimiento`,
        action: crm.staleCount > 0 ? 'Asignar cadencia CRM' : 'Mantener cadencia',
        rows: crm.followUps.length > 0 ? crm.followUps : crm.sellerRows,
      },
    ],
    methods: [
      {
        title: 'RFM para segmentación',
        description:
          'Clasifica clientes por recencia, frecuencia y valor para definir mensajes distintos: retención, recompra, recuperación o crecimiento.',
        metric: `${formatNumber(totalClients)} clientes`,
        action: 'Priorizar por recencia y valor',
        rows: snapshot.clientLifecycle.rfmSegments.slice(0, 5).map((segment) => ({
          label: segment.segment,
          value: formatNumber(segment.customers),
          meta: segmentRecommendation(segment.segment),
        })),
        csvRows: rfmCustomerRows,
      },
      {
        title: 'Pareto comercial',
        description:
          'Identifica clientes, productos y categorías que explican la mayor parte de la facturación para decidir dónde concentrar campañas.',
        metric: `Top 5 clientes: ${formatPercent(concentration)}`,
        action: concentration >= 70 ? 'Diversificar demanda' : 'Crear audiencias similares',
        rows: audienceRows.slice(0, 5),
        csvRows: audienceRows,
      },
      {
        title: 'Pipeline ponderado',
        description:
          'Combina ingreso esperado y probabilidad CRM para estimar potencial comercial accionable sin confundir oportunidad con venta cerrada.',
        metric: formatCurrency(crm.weightedPipeline),
        action: 'Seguir oportunidades vencidas',
        rows: crm.followUps.slice(0, 5).map((row) => ({
          label: row.label,
          meta: row.meta,
          value: row.value,
        })),
        csvRows: crm.followUps,
      },
      {
        title: 'Higiene de leads',
        description:
          'Detecta oportunidades vencidas, sin seguimiento o con datos incompletos para reducir fugas antes de invertir más presupuesto.',
        metric: `${formatNumber(crm.staleCount)} sin seguimiento`,
        action: 'Revisar agentes y fechas',
        rows: crm.sellerRows,
        csvRows: crm.followUps.length > 0 ? crm.followUps : crm.sellerRows,
      },
    ],
    segments: snapshot.clientLifecycle.rfmSegments.map((segment) => ({
      customers: segment.customers,
      label: segment.segment,
      recommendation: segmentRecommendation(segment.segment),
      shareLabel: totalClients > 0 ? `${formatPercent((segment.customers / totalClients) * 100)} de la base` : 'Sin base',
    })),
    campaigns: [
      {
        title: 'Recuperación de clientes en riesgo',
        description:
          'Campaña de contacto directo, caso de uso y oferta de recompra para clientes con alto valor y baja recencia.',
        metric: `${formatNumber(atRisk)} clientes en riesgo`,
        priority: atRisk > 0 ? 'Prioridad alta' : 'Monitorear',
        audience: 'Clientes RFM en riesgo',
        kpi: 'Recompra y recuperación',
      },
      {
        title: 'Venta cruzada por categoría líder',
        description:
          topCategory
            ? `Diseñar bundles o mensajes por industria alrededor de ${topCategory.categoryName}.`
            : 'Esperar una categoría con más tracción antes de invertir pauta específica.',
        metric: topCategory ? formatCurrency(topCategory.soldAmount) : 'Sin categoría líder',
        priority: 'Prioridad media',
        audience: 'Clientes activos y recurrentes',
        kpi: 'Ticket promedio',
      },
      {
        title: 'Reactivación por producto principal',
        description:
          topProduct
            ? `Buscar clientes que compraron ${topProduct.productName} y no han recomprado para activar recordatorios o accesorios relacionados.`
            : 'No hay producto suficiente para campaña de recompra.',
        metric: topProduct ? formatCurrency(topProduct.revenue) : 'Sin producto líder',
        priority: 'Prioridad media',
        audience: 'Compradores históricos',
        kpi: 'Frecuencia de recompra',
      },
      {
        title: 'Seguimiento de oportunidades CRM',
        description:
          crm.staleCount > 0
            ? 'Enviar recordatorios, casos de éxito o contenido técnico a oportunidades sin movimiento reciente.'
            : 'Mantener automatizaciones ligeras para leads nuevos y oportunidades activas.',
        metric: `${formatNumber(crm.staleCount)} sin seguimiento`,
        priority: crm.staleCount > 0 ? 'Prioridad alta' : 'Monitorear',
        audience: 'Leads y oportunidades abiertas',
        kpi: 'Avance de etapa CRM',
      },
    ],
    alerts: [
      {
        title: concentration >= 70 ? 'Alta concentración de clientes' : 'Concentración controlada',
        description: `Los cinco principales clientes representan ${formatPercent(concentration)} de la facturación.`,
        action: concentration >= 70 ? 'Diversificar campañas' : 'Mantener monitoreo',
        tone: concentration >= 70 ? 'risk' : 'good',
      },
      {
        title: conversion < 50 ? 'Conversión comercial baja' : 'Conversión comercial saludable',
        description: `La conversión actual es ${formatPercent(conversion)}.`,
        action: conversion < 50 ? 'Crear campaña de rescate de cotizaciones' : 'Replicar mensajes ganadores',
        tone: conversion < 50 ? 'warning' : 'good',
      },
      {
        title: atRisk > 0 ? 'Clientes por recuperar' : 'Cartera estable',
        description: `${formatNumber(atRisk)} clientes requieren atención de marketing/ventas.`,
        action: atRisk > 0 ? 'Activar flujo de recompra' : 'Sostener frecuencia',
        tone: atRisk > 0 ? 'warning' : 'good',
      },
      {
        title: crm.staleCount > 0 ? 'Oportunidades sin seguimiento' : 'CRM con seguimiento reciente',
        description:
          crm.staleCount > 0
            ? `${formatNumber(crm.staleCount)} oportunidades no tienen cambios recientes; pueden necesitar campaña o llamada.`
            : 'Las oportunidades abiertas no muestran una señal crítica de abandono con la información disponible.',
        action: crm.staleCount > 0 ? 'Priorizar contacto' : 'Mantener cadencia',
        tone: crm.staleCount > 0 ? 'warning' : 'good',
      },
      {
        title: crm.overdueCount > 0 ? 'Fechas CRM vencidas' : 'Fechas CRM controladas',
        description:
          crm.overdueCount > 0
            ? `${formatNumber(crm.overdueCount)} oportunidades tienen fecha límite vencida.`
            : 'No se detectan fechas límite vencidas en las oportunidades disponibles.',
        action: crm.overdueCount > 0 ? 'Actualizar próxima acción' : 'Continuar',
        tone: crm.overdueCount > 0 ? 'risk' : 'good',
      },
      ...dataset.dataQualityAlerts.slice(0, 3).map((alert) => ({
        title: 'Calidad de datos Odoo',
        description: alert,
        action: 'Revisar origen',
        tone: 'warning' as const,
      })),
    ],
    atRiskCustomers: atRiskCustomers.map((row) => ({
      label: row.customerName,
      value: `${formatCurrency(row.revenue)} · ${row.daysSinceLastPurchase ?? 0} días`,
    })),
    highValueCustomers: highValueCustomers.map((row) => ({
      label: row.customerName,
      value: `${formatCurrency(row.revenue)} · ${formatNumber(row.totalOrders)} compras`,
    })),
    productBars,
    productCampaignRows: topProductCustomerRows,
    crossSellCustomers: crossSellCustomers.map((row) => ({
      label: row.label,
      value: `${formatCurrency(row.value)} · ${row.classification}`,
    })),
    crmFollowUps: crm.followUps,
    crmStages: crm.stageRows,
    repurchaseProducts: repeatProducts.map((row) => ({
      label: row.productName,
      value: `${formatPercent(row.repeatPurchaseRate)} recompra · ${formatCurrency(row.revenue)}`,
    })),
    segmentBars,
    topCategories: snapshot.sellers.categoryBreakdown.slice(0, 8).map((row) => ({
      label: row.categoryName,
      value: `${formatCurrency(row.soldAmount)} · ${formatPercent(row.sharePct)}`,
    })),
    topProducts: topProducts.map((row) => ({
      label: row.productName,
      value: `${formatCurrency(row.revenue)} · ${formatNumber(row.uniqueCustomers)} clientes`,
    })),
  };
}

function buildMarketingLeadsAnalytics({
  dataset,
  filters,
  previousDataset,
  previousFilters,
}: {
  dataset: OdooCommercialDataset;
  filters: ReportFilters;
  previousDataset: OdooCommercialDataset | null;
  previousFilters: ReportFilters | null;
}): MarketingLeadsAnalytics {
  const current = summarizeMarketingLeadPeriod(dataset, filters);
  const previous = previousDataset && previousFilters
    ? summarizeMarketingLeadPeriod(previousDataset, previousFilters)
    : emptyMarketingLeadPeriod();

  return {
    crm: buildCrmMarketingInsights(marketingLeadsForPeriod(dataset, filters), filters.endDate),
    current,
    currentRows: buildMarketingLeadRows(dataset, filters),
    kpiDetails: buildMarketingLeadKpiDetails(dataset, filters),
    currentRangeLabel: formatPeriodLabel(filters.startDate, filters.endDate),
    intake: previousDataset && previousFilters
      ? buildMarketingLeadIntakeSeries(
          marketingNewLeadsForPeriod(marketingLeadsForPeriod(dataset, filters), filters),
          filters,
          marketingNewLeadsForPeriod(marketingLeadsForPeriod(previousDataset, previousFilters), previousFilters),
          previousFilters,
        )
      : [],
    previous,
    previousReady: Boolean(previousDataset && previousFilters),
    previousRangeLabel: previousFilters
      ? formatPeriodLabel(previousFilters.startDate, previousFilters.endDate)
      : 'Periodo anterior pendiente de cargar',
  };
}

function summarizeMarketingLeadPeriod(
  dataset: OdooCommercialDataset,
  filters: ReportFilters,
): MarketingLeadPeriodSummary {
  const leads = dataset.crmLeads ?? [];
  const assignedLeads = marketingAssignedLeadsForPeriod(leads, filters);
  const wonLeads = marketingWonLeadsForPeriod(leads, filters);
  const lostLeads = marketingLostLeadsForPeriod(leads, filters);
  const wonIds = new Set(wonLeads.map((lead) => lead.id));
  const lostIds = new Set(lostLeads.map((lead) => lead.id));
  const assignedIds = new Set(assignedLeads.map((lead) => lead.id));
  const openLeads = assignedLeads.filter((lead) => lead.active && !wonIds.has(lead.id) && !lostIds.has(lead.id) &&
    !(lead.stageIsWon ?? lead.probability >= 100) && !isClosedStage(lead.stageName));
  const openIds = new Set(openLeads.map((lead) => lead.id));
  const createdLeads = marketingNewLeadsForPeriod(leads, filters);
  const createdIds = new Set(createdLeads.map((lead) => lead.id));
  const invoicedLeadIds = matchMarketingLeadsToInvoices(createdLeads, dataset, filters);
  const leadBilling = sumMarketingLeadCustomerInvoices(leads, dataset, filters);
  const rows = new Map<string, MarketingLeadSellerRow>();

  leads.forEach((lead) => {
    if (!assignedIds.has(lead.id) && !wonIds.has(lead.id) && !lostIds.has(lead.id) &&
      !createdIds.has(lead.id) && !(lead.sellerId && leadBilling.bySeller.has(lead.sellerId))) return;
    const sellerName = lead.sellerName || 'Sin vendedor';
    const key = String(lead.sellerId ?? 'none');
    const existing = rows.get(key) ?? {
      assigned: 0,
      billedAmount: 0,
      created: 0,
      invoiced: 0,
      linked: 0,
      lost: 0,
      open: 0,
      sellerId: lead.sellerId,
      sellerName,
      won: 0,
      wonRate: 0,
    };
    if (assignedIds.has(lead.id)) existing.assigned += 1;
    if (createdIds.has(lead.id)) {
      existing.created += 1;
      if (lead.customerId && lead.sellerId) existing.linked += 1;
      if (invoicedLeadIds.has(lead.id)) existing.invoiced += 1;
    }
    if (wonIds.has(lead.id)) existing.won += 1;
    if (lostIds.has(lead.id)) existing.lost += 1;
    if (openIds.has(lead.id)) existing.open += 1;
    rows.set(key, existing);
  });

  marketingLeadCustomerInvoiceRows(leads, dataset, filters).forEach((invoice) => {
    if (!invoice.sellerId || rows.has(String(invoice.sellerId))) return;
    rows.set(String(invoice.sellerId), {
      assigned: 0,
      billedAmount: 0,
      created: 0,
      invoiced: 0,
      linked: 0,
      lost: 0,
      open: 0,
      sellerId: invoice.sellerId,
      sellerName: invoice.sellerName || 'Sin vendedor',
      won: 0,
      wonRate: 0,
    });
  });

  rows.forEach((row) => {
    row.billedAmount = row.sellerId ? leadBilling.bySeller.get(row.sellerId) ?? 0 : 0;
    row.wonRate = row.won + row.lost > 0 ? (row.won / (row.won + row.lost)) * 100 : 0;
  });

  return {
    assigned: assignedLeads.length,
    billedAmount: leadBilling.total,
    created: createdLeads.length,
    invoiced: invoicedLeadIds.size,
    linked: createdLeads.filter((lead) => lead.customerId && lead.sellerId).length,
    lost: lostLeads.length,
    open: openLeads.length,
    sellerRows: [...rows.values()].sort((left, right) =>
      right.won - left.won || right.wonRate - left.wonRate || right.assigned - left.assigned || left.sellerName.localeCompare(right.sellerName, 'es-MX'),
    ),
    sourceReady: createdLeads.every((lead) => Object.prototype.hasOwnProperty.call(lead, 'sourceName')),
    sourceRows: buildMarketingLeadSourceRows(createdLeads, (lead) => wonIds.has(lead.id), invoicedLeadIds),
    won: wonLeads.length,
    wonRate: wonLeads.length + lostLeads.length > 0
      ? (wonLeads.length / (wonLeads.length + lostLeads.length)) * 100 : 0,
  };
}

function emptyMarketingLeadPeriod(): MarketingLeadPeriodSummary {
  return {
    assigned: 0,
    billedAmount: 0,
    created: 0,
    invoiced: 0,
    linked: 0,
    lost: 0,
    open: 0,
    sellerRows: [],
    sourceReady: true,
    sourceRows: [],
    won: 0,
    wonRate: 0,
  };
}

function buildMarketingLeadRows(dataset: OdooCommercialDataset, filters: ReportFilters): MarketingMiniRow[] {
  const invoicesByCustomer = buildMarketingInvoiceCustomerIndex(dataset, filters);
  const allLeads = dataset.crmLeads ?? [];
  const assignedIds = new Set(marketingAssignedLeadsForPeriod(allLeads, filters).map((lead) => lead.id));
  const wonIds = new Set(marketingWonLeadsForPeriod(allLeads, filters).map((lead) => lead.id));
  const lostIds = new Set(marketingLostLeadsForPeriod(allLeads, filters).map((lead) => lead.id));
  const createdIds = new Set(marketingNewLeadsForPeriod(allLeads, filters).map((lead) => lead.id));
  return allLeads.filter((lead) => createdIds.has(lead.id) || assignedIds.has(lead.id) || wonIds.has(lead.id) || lostIds.has(lead.id))
    .map((lead) => {
      const billedAmount = lead.customerId ? invoicesByCustomer.get(lead.customerId)?.amount ?? 0 : 0;
      const statusLabel = wonIds.has(lead.id)
        ? 'Ganado en el periodo'
        : lostIds.has(lead.id)
          ? 'Perdido en el periodo'
          : assignedIds.has(lead.id) ? 'Asignado en el periodo' : 'Creado en el periodo';
      const referenceDate = parseDate(lead.closedDate ?? lead.writeDate ?? lead.createDate);
      const days = referenceDate ? Math.max(0, daysBetween(referenceDate, parseDate(filters.endDate) ?? new Date())) : null;
      return {
        customerName: lead.customerName,
        email: lead.emailFrom,
        label: lead.name || lead.customerName || `Lead ${lead.id}`,
        leadId: lead.id,
        meta: [
          `CRM #${lead.id}`,
          lead.sellerName ? `Vendedor: ${lead.sellerName}` : null,
          lead.customerName ? `Cliente: ${lead.customerName}` : null,
          lead.stageName ? `Etapa: ${lead.stageName}` : null,
          lead.assignmentDate ? `Asignación: ${marketingCrmDateKey(lead.assignmentDate)}` : null,
          (wonIds.has(lead.id) || lostIds.has(lead.id)) && lead.closedDate ? `Cierre: ${marketingCrmDateKey(lead.closedDate)}` : null,
          lostIds.has(lead.id) && lead.lostReasonName ? `Motivo: ${lead.lostReasonName}` : null,
          lead.deadlineDate ? `Fecha límite: ${lead.deadlineDate}` : null,
          days !== null ? `${formatNumber(days)} días desde última actividad` : null,
          `Esperado: ${formatCurrency(Math.max(0, lead.expectedRevenue))}`,
          billedAmount ? 'La facturación del cliente puede figurar en más de un lead; el KPI no la duplica.' : null,
        ].filter(Boolean).join(' · '),
        phone: lead.phone,
        seller: lead.sellerName ?? 'Sin vendedor',
        status: statusLabel,
        value: `${statusLabel} · ${formatCurrency(billedAmount)} facturado`,
      };
    })
    .sort((left, right) => left.status === 'Perdido en el periodo' ? -1 : right.status === 'Perdido en el periodo' ? 1 : left.label.localeCompare(right.label, 'es-MX'));
}

function buildMarketingLeadKpiDetails(
  dataset: OdooCommercialDataset,
  filters: ReportFilters,
): Record<MarketingLeadKpiKey, MarketingDecisionDetailModel> {
  const leads = dataset.crmLeads ?? [];
  const assigned = marketingAssignedLeadsForPeriod(leads, filters);
  const won = marketingWonLeadsForPeriod(leads, filters);
  const lost = marketingLostLeadsForPeriod(leads, filters);
  const open = assigned.filter((lead) => lead.active && !(lead.stageIsWon ?? lead.probability >= 100) &&
    !isClosedStage(lead.stageName));
  const rowsByLead = new Map(buildMarketingLeadRows(dataset, filters).map((row) => [row.leadId, row]));
  const leadRows = (selected: typeof leads) => selected.map((lead) => rowsByLead.get(lead.id)).filter((row): row is MarketingMiniRow => Boolean(row));
  const invoiceRows: MarketingMiniRow[] = marketingLeadCustomerInvoiceRows(leads, dataset, filters).map((invoice) => ({
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    label: invoice.name || `Factura #${invoice.id}`,
    meta: [
      `account.move #${invoice.id}`,
      `Fecha de factura: ${invoice.invoiceDate}`,
      invoice.moveType === 'out_refund' ? 'Nota de crédito' : 'Factura de cliente',
      invoice.companyName ? `Compañía: ${invoice.companyName}` : null,
      invoice.customerName ? `Cliente: ${invoice.customerName}` : null,
      invoice.sellerName ? `Vendedor: ${invoice.sellerName}` : null,
      `Estado: ${invoice.state}`,
    ].filter(Boolean).join(' · '),
    seller: invoice.sellerName,
    status: invoice.moveType === 'out_refund' ? 'Nota de crédito' : 'Factura',
    value: formatCurrency(invoice.untaxedAmountSigned),
  }));
  const make = (title: string, description: string, tableRows: MarketingMiniRow[]): MarketingDecisionDetailModel => ({
    title,
    description: `${description} Periodo: ${formatPeriodLabel(filters.startDate, filters.endDate)}. Se respetan los filtros de compañía y vendedor aplicados arriba.`,
    tableRows,
    chartRows: [],
    chartTitle: title,
    chartSubtitle: '',
  });
  return {
    assigned: make('Leads asignados', 'crm.lead con vendedor y date_open (fecha de asignación) dentro del periodo; incluye leads creados antes y los que después fueron archivados.', leadRows(assigned)),
    won: make('Leads ganados', 'crm.lead activo en etapa ganada (crm.stage.is_won) y date_closed dentro del periodo, sin importar la fecha de creación.', leadRows(won)),
    lost: make('Leads perdidos', 'Filtro Odoo Lost: active = false, probability = 0 y date_closed dentro del periodo. El motivo de pérdida se muestra cuando está registrado.', leadRows(lost)),
    billed: make('Facturación sin impuestos', 'account.move publicado de tipo factura o nota de crédito de cliente, con invoice_date dentro del periodo y cliente vinculado a un lead creado antes de la factura. Cada documento se suma una sola vez; la asociación por cliente no demuestra causalidad del lead.', invoiceRows),
    wonRate: make('Cumplimiento de cierre', 'Leads ganados / (ganados + perdidos), usando exclusivamente cierres ocurridos dentro del periodo. El mismo lead puede haber sido asignado en otro periodo.', leadRows([...won, ...lost])),
    open: make('En seguimiento', 'De los leads asignados en el periodo, aquellos que permanecen activos y no están en etapa ganada al momento de consultar. Es un estado actual de esa cohorte, no una reconstrucción histórica.', leadRows(open)),
  };
}

function buildCrmMarketingInsights(leads: OdooCrmLeadRecord[], periodEnd: string) {
  const today = new Date(`${periodEnd}T12:00:00Z`);
  const activeLeads = leads.filter((lead) => lead.active !== false);
  const openLeads = activeLeads.filter((lead) => !lead.closedDate && !isClosedStage(lead.stageName));
  const pipelineAmount = openLeads.reduce((sum, lead) => sum + Math.max(0, lead.expectedRevenue), 0);
  const weightedPipeline = openLeads.reduce(
    (sum, lead) => sum + Math.max(0, lead.expectedRevenue) * clampPercent(lead.probability) / 100,
    0,
  );
  const recentChanges = activeLeads.filter((lead) => {
    const date = parseDate(lead.writeDate ?? lead.createDate);
    return date ? daysBetween(date, today) >= 0 && daysBetween(date, today) <= 7 : false;
  }).length;
  const staleLeads = openLeads.filter((lead) => {
    const lastUpdate = parseDate(lead.writeDate ?? lead.createDate);
    return lastUpdate ? daysBetween(lastUpdate, today) >= 7 : false;
  });
  const overdueLeads = openLeads.filter((lead) => {
    const deadline = parseDate(lead.deadlineDate);
    return deadline ? deadline < startOfDay(today) : false;
  });
  const stageRows = Array.from(groupBy(openLeads, (lead) => lead.stageName || 'Sin etapa').entries())
    .map(([stage, rows]) => ({
      label: stage,
      value: `${formatNumber(rows.length)} · ${formatCurrency(
        rows.reduce((sum, lead) => sum + Math.max(0, lead.expectedRevenue), 0),
      )}`,
      rawValue: rows.length,
      rawAmount: rows.reduce((sum, lead) => sum + Math.max(0, lead.expectedRevenue), 0),
    }))
    .sort((left, right) => right.rawValue - left.rawValue)
    .slice(0, 8);
  const maxStageCount = Math.max(1, ...stageRows.map((row) => row.rawValue));
  const funnelRows = stageRows.map((row) => ({
    amount: formatCurrency(row.rawAmount),
    label: row.label,
    sharePct: (row.rawValue / maxStageCount) * 100,
    value: `${formatNumber(row.rawValue)} oportunidades`,
  }));
  const attentionLeads = [...staleLeads, ...overdueLeads]
    .filter((lead, index, rows) => rows.findIndex((row) => row.id === lead.id) === index)
    .sort((left, right) => {
      const leftDeadline = parseDate(left.deadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDeadline = parseDate(right.deadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDeadline - rightDeadline || right.expectedRevenue - left.expectedRevenue;
    });
  const followUps = attentionLeads.slice(0, 8)
    .map((lead) => {
      const contact = [lead.emailFrom, lead.phone].filter(Boolean).join(' · ');
      const lastUpdate = parseDate(lead.writeDate ?? lead.createDate);
      return {
        contact: contact ? `Contacto CRM: ${contact}` : 'Contacto no disponible en CRM',
        customerName: lead.customerName ?? lead.name,
        email: lead.emailFrom,
        label: lead.name || lead.customerName || `Lead ${lead.id}`,
        meta: [
          lead.customerName ? `Cliente: ${lead.customerName}` : null,
          contact ? `Contacto: ${contact}` : null,
          lead.deadlineDate ? `Fecha límite: ${lead.deadlineDate}` : null,
          lastUpdate ? `${daysBetween(lastUpdate, today)} días sin cambio` : null,
        ].filter(Boolean).join(' · '),
        phone: lead.phone,
        seller: lead.sellerName ?? null,
        status: lead.stageName ?? null,
        value: `${lead.sellerName ?? 'Sin vendedor'} · ${formatCurrency(lead.expectedRevenue)}`,
      };
    });
  const attentionBySeller = Array.from(groupBy(attentionLeads, (lead) => lead.sellerName || 'Sin vendedor').entries())
    .map(([sellerName, rows]) => ({
      sellerName,
      count: rows.length,
      expectedRevenue: rows.reduce((sum, lead) => sum + Math.max(0, lead.expectedRevenue), 0),
    }))
    .sort((a, b) => b.count - a.count || a.sellerName.localeCompare(b.sellerName, 'es-MX'));
  const sellerRows = Array.from(groupBy(staleLeads, (lead) => lead.sellerName || 'Sin vendedor').entries())
    .map(([sellerName, rows]) => ({
      label: sellerName,
      meta: `${formatCurrency(rows.reduce((sum, lead) => sum + Math.max(0, lead.expectedRevenue), 0))} en oportunidades`,
      rawValue: rows.length,
      value: `${formatNumber(rows.length)} sin seguimiento`,
    }))
    .sort((left, right) => right.rawValue - left.rawValue)
    .slice(0, 8)
    .map(({ label, meta, value }) => ({ label, meta, value }));

  return {
    attentionCount: attentionLeads.length,
    attentionBySeller,
    followUps,
    openCount: openLeads.length,
    overdueCount: overdueLeads.length,
    pipelineAmount,
    recentChanges,
    funnelRows,
    sellerRows,
    stageRows: stageRows.map(({ label, value }) => ({ label, value })),
    staleCount: staleLeads.length,
    totalCount: activeLeads.length,
    weightedPipeline,
  };
}

function normalizeMarketingKey(value: string | null | undefined) {
  return `${value ?? ''}`.trim().toLocaleLowerCase('es-MX');
}

type MarketingContactIndex = {
  byId: Map<number, MarketingContactInfo>;
  byName: Map<string, MarketingContactInfo>;
};

type MarketingContactInfo = {
  address: string | null;
  contact: string;
  email: string | null;
  phone: string | null;
};

function buildCustomerContactIndex(dataset: OdooCommercialDataset): MarketingContactIndex {
  const byId = new Map<number, MarketingContactInfo>();
  const byName = new Map<string, MarketingContactInfo>();

  (dataset.customerContacts ?? []).forEach((contact) => {
    const info = buildContactInfo({
      addressParts: [contact.street, contact.street2, contact.city, contact.stateName, contact.zip, contact.countryName],
      email: contact.email,
      name: contact.customerName,
      phone: contact.mobile ?? contact.phone,
    });
    if (contact.customerId) byId.set(contact.customerId, info);
    byName.set(normalizeMarketingKey(contact.customerName), info);
    if (contact.commercialPartnerName) {
      byName.set(normalizeMarketingKey(contact.commercialPartnerName), info);
    }
  });

  (dataset.crmLeads ?? []).forEach((lead) => {
    if (!lead.customerName && !lead.customerId) return;
    const existing = lead.customerId ? byId.get(lead.customerId) : byName.get(normalizeMarketingKey(lead.customerName));
    const merged = buildContactInfo({
      addressParts: [],
      email: existing?.email ?? lead.emailFrom,
      name: lead.customerName ?? existing?.contact ?? 'Cliente CRM',
      phone: existing?.phone ?? lead.phone,
      fallback: existing,
    });
    if (lead.customerId) byId.set(lead.customerId, merged);
    if (lead.customerName) byName.set(normalizeMarketingKey(lead.customerName), merged);
  });

  return { byId, byName };
}

function buildContactInfo({
  addressParts,
  email,
  fallback,
  name,
  phone,
}: {
  addressParts: Array<string | null | undefined>;
  email: string | null | undefined;
  fallback?: MarketingContactInfo | null;
  name: string;
  phone: string | null | undefined;
}): MarketingContactInfo {
  const normalizedEmail = email?.trim() || fallback?.email || null;
  const normalizedPhone = phone?.trim() || fallback?.phone || null;
  const address = addressParts.filter(Boolean).join(', ') || fallback?.address || null;
  const contactBits = [
    normalizedEmail ? `Correo: ${normalizedEmail}` : null,
    normalizedPhone ? `Teléfono: ${normalizedPhone}` : null,
    address ? `Dirección: ${address}` : null,
  ].filter(Boolean);

  return {
    address,
    contact: contactBits.length > 0 ? contactBits.join(' · ') : `Contacto no disponible para ${name}`,
    email: normalizedEmail,
    phone: normalizedPhone,
  };
}

function readCustomerContactInfo(
  index: MarketingContactIndex,
  customerId: number | null | undefined,
  customerName: string | null | undefined,
): MarketingContactInfo {
  const byId = customerId ? index.byId.get(customerId) : null;
  if (byId) return byId;
  const byName = index.byName.get(normalizeMarketingKey(customerName));
  if (byName) return byName;
  return {
    address: null,
    contact: `Contacto no disponible para ${customerName || 'este registro'}`,
    email: null,
    phone: null,
  };
}

function buildCustomerCampaignRow(
  contactIndex: MarketingContactIndex,
  row: {
    averagePurchaseGapDays?: number | null;
    currentStatus?: string;
    customerId?: number | null;
    customerName: string;
    daysSinceLastPurchase?: number | null;
    revenue: number;
    rfmSegment?: string;
    sellerName?: string;
    totalOrders?: number;
  },
  activityIndex?: MarketingCustomerActivityIndex,
): MarketingMiniRow {
  const contact = readCustomerContactInfo(contactIndex, row.customerId, row.customerName);
  const activity = readMarketingActivityInfo(activityIndex, row.customerId, row.customerName);
  return {
    ...contact,
    ...activity,
    customerId: row.customerId ?? activity?.customerId ?? null,
    customerName: row.customerName,
    label: row.customerName,
    meta: [
      row.sellerName || activity?.seller ? `Vendedor: ${row.sellerName || activity?.seller}` : null,
      row.currentStatus ? `Estado: ${row.currentStatus}` : null,
      row.rfmSegment ? `Segmento: ${row.rfmSegment}` : null,
      activity?.products ? `Productos: ${activity.products}` : null,
      activity?.categories ? `Categorías: ${activity.categories}` : null,
      Number.isFinite(row.daysSinceLastPurchase) ? `${row.daysSinceLastPurchase} días desde última compra` : null,
      Number.isFinite(row.averagePurchaseGapDays) ? `Recompra promedio: ${Math.round(row.averagePurchaseGapDays ?? 0)} días` : null,
      `${formatNumber(row.totalOrders ?? 0)} compras`,
    ].filter(Boolean).join(' · '),
    seller: row.sellerName || activity?.seller || null,
    status: row.currentStatus ?? row.rfmSegment ?? activity?.status ?? null,
    value: formatCurrency(row.revenue),
  };
}

type MarketingCustomerActivityInfo = Pick<
  MarketingMiniRow,
  'categories' | 'customerId' | 'customerName' | 'products' | 'seller' | 'status'
>;

type MarketingCustomerActivityIndex = {
  byId: Map<number, MarketingCustomerActivityInfo>;
  byName: Map<string, MarketingCustomerActivityInfo>;
};

function indexMarketingRowsByCustomer(rows: MarketingMiniRow[]): MarketingCustomerActivityIndex {
  const byId = new Map<number, MarketingCustomerActivityInfo>();
  const byName = new Map<string, MarketingCustomerActivityInfo>();

  rows.forEach((row) => {
    const info: MarketingCustomerActivityInfo = {
      categories: row.categories ?? null,
      customerId: row.customerId ?? null,
      customerName: row.customerName ?? row.label,
      products: row.products ?? null,
      seller: row.seller ?? null,
      status: row.status ?? null,
    };
    if (typeof row.customerId === 'number') byId.set(row.customerId, info);
    byName.set(normalizeMarketingKey(row.customerName ?? row.label), info);
  });

  return { byId, byName };
}

function readMarketingActivityInfo(
  index: MarketingCustomerActivityIndex | undefined,
  customerId: number | null | undefined,
  customerName: string | null | undefined,
) {
  if (!index) return null;
  const byId = customerId ? index.byId.get(customerId) : null;
  if (byId) return byId;
  return index.byName.get(normalizeMarketingKey(customerName)) ?? null;
}

function buildCustomerActivityCampaignRows({
  contactIndex,
  dataset,
  endDate,
  startDate,
}: {
  contactIndex: MarketingContactIndex;
  dataset: OdooCommercialDataset;
  endDate: string;
  startDate: string;
}) {
  return buildInvoiceLineCustomerRows({
    contactIndex,
    dataset,
    endDate,
    startDate,
  });
}

function buildCategoryCustomerCampaignRows({
  contactIndex,
  dataset,
  endDate,
  startDate,
  topCategoryName,
}: {
  contactIndex: MarketingContactIndex;
  dataset: OdooCommercialDataset;
  endDate: string;
  startDate: string;
  topCategoryName: string | null;
}) {
  if (!topCategoryName) return [];
  return buildInvoiceLineCustomerRows({
    categoryName: topCategoryName,
    contactIndex,
    dataset,
    endDate,
    startDate,
  });
}

function buildProductCustomerCampaignRows({
  contactIndex,
  dataset,
  endDate,
  startDate,
  topProductName,
}: {
  contactIndex: MarketingContactIndex;
  dataset: OdooCommercialDataset;
  endDate: string;
  startDate: string;
  topProductName: string | null;
}) {
  if (!topProductName) return [];
  return buildInvoiceLineCustomerRows({
    contactIndex,
    dataset,
    endDate,
    productName: topProductName,
    startDate,
  });
}

function buildInvoiceLineCustomerRows({
  categoryName,
  contactIndex,
  dataset,
  endDate,
  productName,
  startDate,
}: {
  categoryName?: string | null;
  contactIndex: MarketingContactIndex;
  dataset: OdooCommercialDataset;
  endDate: string;
  productName?: string | null;
  startDate: string;
}) {
  const buckets = new Map<string, {
    categories: Set<string>;
    customerId: number | null;
    customerName: string;
    invoiceCount: Set<number>;
    products: Map<string, number>;
    revenue: number;
    sellers: Set<string>;
    units: number;
  }>();

  dataset.invoiceLines
    .filter((line) => isMarketingDateInRange(line.invoiceDate, startDate, endDate))
    .filter((line) => !categoryName || normalizeMarketingKey(line.categoryName) === normalizeMarketingKey(categoryName))
    .filter((line) => !productName || normalizeMarketingKey(line.productName) === normalizeMarketingKey(productName))
    .filter((line) => line.customerId !== null || Boolean(line.customerName))
    .forEach((line) => {
      const key = `${line.customerId ?? line.customerName}`;
      const bucket = buckets.get(key) ?? {
        categories: new Set<string>(),
        customerId: line.customerId,
        customerName: line.customerName,
        invoiceCount: new Set<number>(),
        products: new Map<string, number>(),
        revenue: 0,
        sellers: new Set<string>(),
        units: 0,
      };
      bucket.revenue += line.untaxedAmount;
      bucket.units += Math.abs(line.quantity);
      bucket.invoiceCount.add(line.invoiceId);
      if (line.categoryName) bucket.categories.add(line.categoryName);
      if (line.sellerName) bucket.sellers.add(line.sellerName);
      if (line.productName) {
        bucket.products.set(line.productName, (bucket.products.get(line.productName) ?? 0) + Math.abs(line.quantity));
      }
      buckets.set(key, bucket);
    });

  return [...buckets.values()]
    .sort((left, right) => right.revenue - left.revenue)
    .map((row) => {
      const contact = readCustomerContactInfo(contactIndex, row.customerId, row.customerName);
      const products = formatMarketingProductList(row.products);
      const categories = [...row.categories].join(' | ') || null;
      const seller = [...row.sellers].join(' | ') || null;
      return {
        ...contact,
        categories,
        customerId: row.customerId,
        customerName: row.customerName,
        label: row.customerName,
        meta: [
          categoryName ? `Categoría: ${categoryName}` : categories ? `Categorías: ${categories}` : null,
          productName ? `Producto: ${productName}` : products ? `Productos: ${products}` : null,
          seller ? `Vendedor: ${seller}` : null,
          `${formatNumber(row.units)} unidades`,
          `${formatNumber(row.invoiceCount.size)} facturas`,
        ].filter(Boolean).join(' · '),
        products,
        seller,
        value: formatCurrency(row.revenue),
      };
    });
}

function formatMarketingProductList(products: Map<string, number>) {
  const entries = [...products.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, units]) => `${name} (${formatNumber(units)} pzas.)`);
  return entries.join(' | ') || null;
}

function isMarketingDateInRange(value: string | null | undefined, startDate: string, endDate: string) {
  if (!value) return false;
  const date = value.slice(0, 10);
  return date >= startDate && date <= endDate;
}

function parseCurrencyish(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildMarketingActionNotifications(marketing: MarketingViewModel): MarketingActionNotification[] {
  const notifications: MarketingActionNotification[] = [];
  const alertRows = marketing.decisionDetails.risk.tableRows;
  const crmRows = marketing.decisionDetails.crm.tableRows.length > 0
    ? marketing.decisionDetails.crm.tableRows
    : marketing.crmFollowUps;
  const demandRows = marketing.decisionDetails.demand.tableRows;
  const audienceRows = marketing.decisionDetails.audiences.tableRows;
  const categoryCampaignRows = marketing.categoryCampaignRows;
  const productCampaignRows = marketing.productCampaignRows;
  const segmentRows = marketing.segments.slice(0, 8).map((segment) => ({
    label: segment.label,
    meta: segment.recommendation,
    value: `${formatNumber(segment.customers)} clientes · ${segment.shareLabel}`,
  }));

  marketing.alerts
    .filter((alert) => alert.tone !== 'good')
    .forEach((alert) => {
      const category = resolveMarketingNotificationCategory(alert.title);
      notifications.push({
        action: alert.action,
        category,
        description: alert.description,
        fingerprint: `marketing:${slugifyFilename(alert.title)}:${slugifyFilename(alert.action)}:${alert.tone}`,
        metric: alert.action,
        rows: category === 'crm_lead'
          ? crmRows
          : category === 'portfolio_concentration'
            ? audienceRows
            : category === 'low_conversion'
              ? marketing.crmFollowUps
              : alertRows,
        severity: alert.tone === 'risk' ? 'critical' : 'warning',
        title: alert.title,
        tone: alert.tone,
      });
    });

  if (marketing.decisionDetails.risk.tableRows.length > 0) {
    notifications.push({
      action: 'Crear flujo de recompra con contacto consultivo',
      category: 'inactive_client',
      description: 'Hay clientes con valor y baja recencia. Conviene priorizar mensajes personalizados antes de lanzar campañas generales.',
      fingerprint: 'marketing:clientes-riesgo:recompra',
      metric: `${formatNumber(marketing.decisionDetails.risk.tableRows.length)} clientes priorizados`,
      rows: alertRows,
      severity: 'warning',
      title: 'Clientes de valor requieren recuperación',
      tone: 'warning',
    });
  }

  if (crmRows.length > 0) {
    notifications.push({
      action: 'Asignar cadencia de seguimiento y limpiar próximas acciones',
      category: 'crm_lead',
      description: 'Existen oportunidades o agentes con señales de baja interacción. Marketing puede apoyar con recordatorios, casos de éxito y contenido técnico.',
      fingerprint: 'marketing:crm:higiene-leads',
      metric: `${formatNumber(crmRows.length)} focos CRM`,
      rows: crmRows,
      severity: 'critical',
      title: 'Higiene de leads y oportunidades',
      tone: 'risk',
    });
  }

  if (demandRows.length > 0) {
    notifications.push({
      action: 'Diseñar campaña por categoría y validar oferta con ventas',
      category: 'sales_decline',
      description: 'Las categorías con mayor participación muestran dónde hay demanda comprobada para enfocar pauta, contenido y bundles.',
      fingerprint: 'marketing:demanda:categorias',
      metric: `${formatNumber(categoryCampaignRows.length || demandRows.length)} clientes/categorías con señal`,
      rows: categoryCampaignRows.length > 0 ? categoryCampaignRows : demandRows,
      severity: 'opportunity',
      title: 'Categorías con demanda comercial',
      tone: 'good',
    });
  }

  if (productCampaignRows.length > 0) {
    notifications.push({
      action: 'Crear campaña de recompra o complemento del producto líder',
      category: 'sales_decline',
      description: 'El producto líder ya tiene compradores identificables. Conviene activar recompra, accesorios o casos de uso relacionados.',
      fingerprint: 'marketing:producto:clientes-compradores',
      metric: `${formatNumber(productCampaignRows.length)} clientes compradores`,
      rows: productCampaignRows,
      severity: 'opportunity',
      title: 'Clientes para campaña por producto',
      tone: 'good',
    });
  }

  if (segmentRows.length > 0) {
    notifications.push({
      action: 'Separar audiencias por RFM antes de enviar campañas',
      category: 'portfolio_concentration',
      description: 'La base de clientes tiene segmentos con necesidades distintas. Evita un solo mensaje para todos.',
      fingerprint: 'marketing:segmentacion:rfm',
      metric: `${formatNumber(segmentRows.length)} segmentos disponibles`,
      rows: segmentRows,
      severity: 'opportunity',
      title: 'Segmentación lista para campaña',
      tone: 'good',
    });
  }

  return notifications
    .filter((notification, index, rows) =>
      rows.findIndex((candidate) => candidate.fingerprint === notification.fingerprint) === index,
    )
    .slice(0, 10);
}

function buildMarketingInsightModal({
  action,
  description,
  metric,
  rows,
  title,
  type,
}: {
  action: string;
  description: string;
  metric: string;
  rows: MarketingMiniRow[];
  title: string;
  type: MarketingInsightModalData['type'];
}): MarketingInsightModalData {
  const topRow = rows[0] ?? null;
  const rowsWithEmail = rows.filter((row) => Boolean(row.email)).length;
  const rowsWithPhone = rows.filter((row) => Boolean(row.phone)).length;
  const rowsWithContact = rows.filter((row) => Boolean(row.email || row.phone || row.contact)).length;
  const rowsWithSeller = rows.filter((row) => row.meta?.toLocaleLowerCase('es-MX').includes('vendedor')).length;

  return {
    action,
    description,
    ideas: [
      topRow ? `Iniciar con "${topRow.label}" porque encabeza el grupo analizado.` : 'Construir una lista mínima antes de lanzar campaña.',
      rowsWithContact > 0
        ? 'Separar los registros con correo o teléfono disponible para contacto directo y campañas.'
        : 'Completar datos de contacto en CRM antes de automatizar comunicaciones.',
      'Crear dos mensajes: uno consultivo para cuentas de alto valor y otro educativo para audiencias amplias.',
      'Medir respuesta por segmento para saber qué mensaje genera recompra, avance de etapa o solicitud de cotización.',
    ],
    methods: [
      type === 'method' ? 'Aplicar el modelo como regla de priorización semanal.' : 'Convertir la lectura ejecutiva en una lista de trabajo.',
      'Trabajar por lote pequeño: 10 a 20 cuentas o productos por campaña para medir impacto.',
      'Definir responsable, fecha de contacto, mensaje usado y resultado esperado.',
      'Revisar resultados contra facturación, conversión y avance CRM en la siguiente actualización.',
    ],
    metric,
    observations: [
      `El indicador muestra: ${metric}.`,
      rows.length > 0
        ? `Hay ${formatNumber(rows.length)} registros asociados a esta decisión.`
        : 'No hay registros suficientes para detallar el origen del indicador.',
      `${formatNumber(rowsWithEmail)} registros tienen correo y ${formatNumber(rowsWithPhone)} tienen teléfono disponible.`,
      topRow ? `Primer foco de atención: ${topRow.label} (${topRow.value}).` : 'Sin registro líder disponible.',
      rowsWithSeller > 0
        ? 'La información incluye responsable comercial para coordinar seguimiento.'
        : 'No todos los registros tienen responsable visible en este corte.',
    ],
    projection: rows.length > 0
      ? 'Si se ejecuta una campaña controlada y se recupera una parte de estos registros, el impacto debería verse primero en respuestas, avance CRM o recompra; después en facturación del siguiente periodo.'
      : 'La confiabilidad de la proyección es limitada hasta contar con más datos o registros asociados.',
    rows,
    title,
    type,
  };
}

function calculateMarketingHealthScore({
  atRiskShare,
  concentration,
  conversion,
  staleCrmShare,
}: {
  atRiskShare: number;
  concentration: number;
  conversion: number;
  staleCrmShare: number;
}) {
  const conversionScore = clampPercent(conversion);
  const riskScore = 100 - clampPercent(atRiskShare * 1.8);
  const concentrationScore = 100 - Math.max(0, clampPercent(concentration) - 40) * 1.4;
  const crmScore = 100 - clampPercent(staleCrmShare);
  return Math.round(clampPercent(
    conversionScore * 0.34 +
    riskScore * 0.26 +
    concentrationScore * 0.2 +
    crmScore * 0.2,
  ));
}

function getMarketingKpiExplanation(label: string): MarketingInfoExplanation {
  const explanations: Record<string, MarketingInfoExplanation> = {
    'Facturación segmentable': {
      title: 'Facturación segmentable',
      definition: 'Total facturado sin impuestos que puede analizarse por cliente, producto, categoría, vendedor y comportamiento de compra.',
      importance: 'Ayuda a Marketing a priorizar campañas donde ya existe demanda real y evita invertir presupuesto en audiencias sin señal comercial.',
    },
    'Clientes activos': {
      title: 'Clientes activos',
      definition: 'Clientes con actividad reciente según los criterios de recencia usados por el modelo comercial.',
      importance: 'Permite proteger la base que sí compra, diseñar campañas de recurrencia y detectar si el crecimiento depende de pocos clientes.',
    },
    'Clientes en riesgo': {
      title: 'Clientes en riesgo',
      definition: 'Clientes cuyo tiempo sin compra o comportamiento reciente indica posible pérdida de recurrencia.',
      importance: 'Es una alerta temprana para campañas de recuperación, llamadas consultivas y mensajes de recompra antes de que la cuenta se enfríe.',
    },
    'Conversión comercial': {
      title: 'Conversión comercial',
      definition: 'Relación entre órdenes ganadas y el total de oportunidades comerciales medidas como órdenes más cotizaciones.',
      importance: 'Muestra si las campañas y mensajes están generando ventas reales o solo actividad sin cierre; Marketing puede ajustar propuesta, audiencia y timing.',
    },
    'Ticket promedio': {
      title: 'Ticket promedio',
      definition: 'Valor promedio facturado por operación dentro del periodo analizado.',
      importance: 'Sirve para orientar bundles, descuentos mínimos, cross-sell y campañas que busquen elevar el valor de cada compra.',
    },
    'Pipeline CRM ponderado': {
      title: 'Pipeline CRM ponderado',
      definition: 'Valor esperado de oportunidades CRM ajustado por su probabilidad de cierre.',
      importance: 'Ayuda a Marketing a decidir qué leads u oportunidades necesitan contenido, remarketing o seguimiento para acelerar el avance del embudo.',
    },
    'Leads u oportunidades activas': {
      title: 'Leads u oportunidades activas',
      definition: 'Cantidad de registros CRM abiertos o activos que todavía pueden convertirse en venta.',
      importance: 'Permite coordinar campañas con ventas y evitar que oportunidades con potencial queden sin contacto.',
    },
    'Oportunidades sin seguimiento': {
      title: 'Oportunidades sin seguimiento',
      definition: 'Leads u oportunidades abiertas con señales de atraso, fecha vencida o falta de movimiento reciente.',
      importance: 'Indica fugas del embudo; Marketing puede activar recordatorios, casos de éxito, correos técnicos o campañas de rescate.',
    },
  };

  return explanations[label] ?? {
    title: label,
    definition: 'Indicador calculado desde los datos comerciales disponibles en Odoo.',
    importance: 'Ayuda a convertir datos operativos en decisiones de segmentación, campañas y seguimiento comercial.',
  };
}

function getMarketingHealthSignalExplanation(label: string): MarketingInfoExplanation {
  const explanations: Record<string, MarketingInfoExplanation> = {
    Conversión: {
      title: 'Conversión',
      definition: 'Porcentaje de cierre comercial entre órdenes y cotizaciones del periodo.',
      importance: 'Para Marketing es clave porque valida si las campañas atraen oportunidades con intención real de compra o si se requiere ajustar mensaje, audiencia u oferta.',
    },
    'Clientes en riesgo': {
      title: 'Clientes en riesgo',
      definition: 'Proporción de clientes con señales de baja recencia, posible abandono o pérdida de frecuencia.',
      importance: 'Permite priorizar campañas de recuperación antes de perder clientes que ya tienen historial y suelen ser más rentables que captar clientes nuevos.',
    },
    'Concentración top 5': {
      title: 'Concentración top 5',
      definition: 'Porcentaje de facturación explicado por los cinco clientes principales.',
      importance: 'Marketing debe vigilarlo porque una concentración alta aumenta dependencia; sirve para crear audiencias similares, diversificar demanda y reducir riesgo comercial.',
    },
    'CRM sin seguimiento': {
      title: 'CRM sin seguimiento',
      definition: 'Cantidad de oportunidades o leads que no muestran movimiento reciente o tienen fechas vencidas.',
      importance: 'Es una señal directa de fuga del embudo: Marketing puede apoyar con automatizaciones, contenido de nutrición y alertas para que ventas retome el contacto.',
    },
  };

  return explanations[label] ?? {
    title: label,
    definition: 'Señal incluida en el índice de salud de marketing.',
    importance: 'Ayuda a priorizar acciones de mercadotecnia con impacto comercial medible.',
  };
}

function segmentRecommendation(segment: string) {
  const normalized = segment.toLocaleLowerCase('es-MX');
  if (normalized.includes('campe')) return 'Cuidar con beneficios, lanzamientos anticipados y comunicación personalizada.';
  if (normalized.includes('riesgo')) return 'Activar recompra, llamada consultiva y oferta con vigencia corta.';
  if (normalized.includes('nuevo')) return 'Educar, confirmar satisfacción y empujar la segunda compra.';
  if (normalized.includes('dorm')) return 'Campaña de reactivación con motivo claro y bajo esfuerzo de respuesta.';
  return 'Usar mensajes segmentados según categoría comprada, ticket y recencia.';
}

function marketingClientStatusPriority(status: string) {
  if (status === 'perdido') return 5;
  if (status === 'dormido') return 4;
  if (status === 'casi_perdido') return 3;
  if (status === 'en_riesgo') return 2;
  if (status === 'observacion') return 1;
  return 0;
}

function groupBy<T>(rows: T[], keyGetter: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyGetter(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  return grouped;
}

function isClosedStage(stageName: string | null) {
  const normalized = (stageName ?? '').toLocaleLowerCase('es-MX');
  return normalized.includes('ganad') || normalized.includes('perdid') || normalized.includes('cerrad');
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysBetween(start: Date, end: Date) {
  const milliseconds = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.floor(milliseconds / 86_400_000);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function formatPeriodLabel(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${formatter.format(new Date(`${startDate}T00:00:00.000Z`))} - ${formatter.format(new Date(`${endDate}T00:00:00.000Z`))}`;
}

function describeMarketingSelection(ids: number[] | undefined, options: ReportOption[], allLabel: string) {
  if (ids?.includes(-1)) return 'Ninguno';
  if (!ids?.length) return allLabel;
  return ids.map((id) => options.find((option) => Number(option.id) === id)?.label ?? `ID ${id}`).join(', ');
}

function buildSummaryMarketingReport(
  marketing: MarketingViewModel,
  creators: ReturnType<typeof summarizeMarketingLeadCreators> | null,
  period: string,
  scope: string,
): MarketingReportDocument {
  const { current, previous, previousReady, previousRangeLabel, intake, crm } = marketing.leads;
  const reportBars = (title: string, rows: MarketingBarRow[], note?: string): MarketingReportChart => ({
    kind: 'bars', title, note,
    bars: rows.map((row) => ({ label: row.label, value: row.sharePct, display: `${row.value}${row.meta ? ` · ${row.meta}` : ''}` })),
  });
  const reportRows = (title: string, rows: MarketingMiniRow[]) => ({
    title,
    columns: ['Nombre', 'Valor', 'Observación', 'Vendedor', 'Estado'],
    rows: rows.map((row) => [row.label, row.value, row.meta ?? '', row.seller ?? '', row.status ?? '']),
  });
  const comparisonBars: MarketingReportChart = {
    kind: 'bars', title: 'Tendencia contra el periodo anterior',
    comparisonLabel: previousReady ? previousRangeLabel : undefined,
    note: previousReady ? 'Cohortes comparables según la fecha de cada indicador.' : 'Periodo anterior pendiente; no se presenta como cero.',
    bars: [
      { label: 'Asignados', value: current.assigned, display: formatNumber(current.assigned), comparison: previousReady ? previous.assigned : undefined, comparisonDisplay: previousReady ? formatNumber(previous.assigned) : undefined },
      { label: 'Ganados', value: current.won, display: formatNumber(current.won), comparison: previousReady ? previous.won : undefined, comparisonDisplay: previousReady ? formatNumber(previous.won) : undefined },
      { label: 'Perdidos', value: current.lost, display: formatNumber(current.lost), comparison: previousReady ? previous.lost : undefined, comparisonDisplay: previousReady ? formatNumber(previous.lost) : undefined },
      { label: 'En seguimiento', value: current.open, display: formatNumber(current.open), comparison: previousReady ? previous.open : undefined, comparisonDisplay: previousReady ? formatNumber(previous.open) : undefined },
    ],
  };
  const charts: MarketingReportChart[] = [
    { kind: 'donut', title: 'Cierre y seguimiento', value: current.won, total: current.won + current.lost,
      primaryLabel: 'Ganados', secondaryLabel: 'Perdidos', note: `Asignados aún en seguimiento: ${formatNumber(current.open)}. Los asignados forman otra cohorte.` },
    comparisonBars,
    { kind: 'bars', title: 'Origen de los leads creados', note: 'El origen registrado en Odoo; no se infiere.',
      bars: current.sourceRows.map((row) => ({ label: row.name, value: row.count, display: `${formatNumber(row.count)} · ${formatNumber(row.won)} ganados · ${formatNumber(row.invoiced)} con factura` })) },
    { kind: 'bars', title: 'Ritmo de captación', comparisonLabel: previousReady ? previousRangeLabel : undefined,
      note: previousReady ? undefined : 'Comparación pendiente.',
      bars: intake.map((point) => ({ label: point.label, value: point.current, display: formatNumber(point.current),
        comparison: previousReady ? point.previous : undefined, comparisonDisplay: previousReady ? formatNumber(point.previous) : undefined })) },
    { kind: 'donut', title: 'De la prospección a la factura', value: current.invoiced, total: current.linked,
      primaryLabel: 'Con factura coincidente', secondaryLabel: 'Vinculados sin factura', note: `${formatNumber(current.created)} creados · ${formatNumber(current.linked)} con cliente y vendedor vinculados. Coincidencia, no causalidad.` },
    { kind: 'bars', title: 'Prospección por vendedor', bars: current.sellerRows.filter((row) => row.created > 0)
      .map((row) => ({ label: row.sellerName, value: row.created, display: `${formatNumber(row.created)} creados · ${formatNumber(row.invoiced)} con factura` })) },
    { kind: 'bars', title: 'Etapas de oportunidades abiertas', bars: crm.funnelRows.map((row) => ({ label: row.label, value: Number((row.value.match(/^[\d.,]+/)?.[0] ?? '0').replace(/\D/g, '')), display: `${row.value} · ${row.amount}` })) },
    { kind: 'bars', title: 'Seguimiento pendiente por vendedor', bars: crm.attentionBySeller.map((row) => ({ label: row.sellerName, value: row.count, display: `${formatNumber(row.count)} · ${formatCurrency(row.expectedRevenue)} esperado` })) },
    { kind: 'bars', title: 'Cumplimiento por agente de ventas', bars: current.sellerRows.map((row) => ({ label: row.sellerName, value: row.won, display: `${formatNumber(row.won)} ganados · ${formatNumber(row.lost)} perdidos · ${formatPercent(row.wonRate)} cierre` })) },
  ];
  if (previousReady) charts.push({ kind: 'trend', title: 'Facturación de clientes con lead', primaryLabel: 'Facturación sin impuestos', points: [
    { label: previousRangeLabel, value: previous.billedAmount, display: formatCurrency(previous.billedAmount) },
    { label: period, value: current.billedAmount, display: formatCurrency(current.billedAmount) },
  ] });
  return {
    title: 'Marketing · Resumen', period, scope,
    sections: [
      { title: 'Salud de marketing y demanda',
        metrics: [
          { label: 'Salud de marketing', value: `${formatNumber(marketing.health.score)}%` },
          ...marketing.health.signals.map((signal) => ({ label: signal.label, value: signal.value })),
          ...marketing.kpis.map((kpi) => ({ label: kpi.label, value: kpi.value })),
        ],
        charts: [
          reportBars('Categorías que explican la demanda', marketing.categoryBars, 'Participación por facturación sin impuestos.'),
          reportBars('Productos que impulsan la demanda', marketing.productBars, 'Facturación por producto.'),
          { kind: 'bars', title: 'Clientes por segmento', note: 'Audiencias RFM para retención, recompra y recuperación.',
            bars: marketing.segments.map((segment) => ({ label: segment.label, value: segment.customers,
              display: `${formatNumber(segment.customers)} clientes · ${segment.shareLabel} · ${segment.recommendation}` })) },
        ] },
      ...(creators ? [{ title: 'Leads creados por usuario', metrics: [
        { label: 'Creados', value: formatNumber(creators.created) },
        { label: 'En otra etapa', value: formatNumber(creators.progressed) },
        { label: 'Aún en etapa inicial', value: formatNumber(creators.created - creators.progressed) },
      ], charts: [{ kind: 'bars' as const, title: 'Actividad por creador', bars: creators.rows.map((row) => ({ label: row.creatorName, value: row.created, display: `${formatNumber(row.created)} creados · ${formatNumber(row.progressed)} en otra etapa · ${formatNumber(row.won)} ganados · ${formatNumber(row.lost)} perdidos` })) }] }] : []),
      { title: 'Resultados de leads del periodo', note: 'Asignación, cierre y facturación usan sus respectivas fechas en Odoo.',
        metrics: [
          { label: 'Leads asignados', value: formatNumber(current.assigned) },
          { label: 'Leads ganados', value: formatNumber(current.won) },
          { label: 'Leads perdidos', value: formatNumber(current.lost) },
          { label: 'Facturación sin impuestos', value: formatCurrency(current.billedAmount) },
          { label: 'Cumplimiento de cierre', value: formatPercent(current.wonRate) },
          { label: 'En seguimiento', value: formatNumber(current.open) },
        ], charts },
      { title: 'Oportunidades abiertas y seguimiento', metrics: [
        { label: 'Leads y oportunidades', value: formatNumber(crm.totalCount) },
        { label: 'Abiertas', value: formatNumber(crm.openCount) },
        { label: 'Valor esperado', value: formatCurrency(crm.pipelineAmount) },
        { label: 'Valor ponderado', value: formatCurrency(crm.weightedPipeline) },
        { label: 'Cambios recientes', value: formatNumber(crm.recentChanges) },
        { label: 'Vencidas o sin movimiento', value: formatNumber(crm.attentionCount) },
      ], tables: [{ title: 'Cierre por agente', columns: ['Vendedor', 'Asignados', 'Ganados', 'Perdidos', 'Facturación', '% cierre'],
        rows: current.sellerRows.map((row) => [row.sellerName, formatNumber(row.assigned), formatNumber(row.won), formatNumber(row.lost), formatCurrency(row.billedAmount), formatPercent(row.wonRate)]) }] },
      { title: 'Leads incluidos en el corte', note: 'No se publican datos de contacto en enlaces compartidos.',
        tables: [{ title: 'Detalle operativo', columns: ['Lead', 'Cliente', 'Vendedor', 'Estado', 'Valor'],
          rows: marketing.leads.currentRows.map((row) => [row.label, row.customerName ?? '', row.seller ?? '', row.status ?? '', row.value]) }] },
      { title: 'Mapa de decisiones', note: 'Las recomendaciones corresponden a los filtros aplicados.',
        metrics: marketing.decisions.map((decision) => ({ label: `${decision.area} · ${decision.title}`, value: decision.metric, note: decision.description })),
        charts: Object.values(marketing.decisionDetails).map((detail) => reportBars(detail.chartTitle, detail.chartRows, detail.chartSubtitle)),
        tables: Object.values(marketing.decisionDetails).map((detail) => reportRows(detail.title, detail.tableRows)) },
      { title: 'Modelo de decisión',
        metrics: marketing.methods.map((method) => ({ label: method.title, value: method.metric, note: `${method.description} Acción: ${method.action}` })),
        charts: [
          reportBars('RFM para segmentación', marketing.segmentBars),
          reportBars('Pareto comercial', marketing.decisionDetails.audiences.chartRows),
          { kind: 'bars', title: 'Pipeline ponderado', bars: crm.funnelRows.map((row) => ({ label: row.label,
            value: row.sharePct, display: `${row.amount} · ${row.value}` })) },
          { kind: 'bars', title: 'Higiene de leads por vendedor', bars: crm.attentionBySeller.map((row) => ({
            label: row.sellerName, value: row.count,
            display: `${formatNumber(row.count)} pendientes · ${formatCurrency(row.expectedRevenue)} esperado`,
          })) },
        ],
        tables: marketing.methods.map((method) => reportRows(method.title, method.csvRows ?? method.rows)) },
      { title: 'Lectura ejecutiva y alertas',
        metrics: [
          ...marketing.executiveNotes.map((note) => ({ label: note.title, value: note.metric, note: `${note.description} Acción: ${note.action}` })),
          ...marketing.alerts.map((alert) => ({ label: alert.title, value: alert.description, note: alert.action })),
        ],
        tables: marketing.executiveNotes.map((note) => reportRows(note.title, note.rows)) },
    ],
  };
}

function buildPersonalMarketingReport(
  current: PersonalMarketingPeriod,
  previous: PersonalMarketingPeriod | null,
  leads: MarketingLeadsAnalytics,
  period: string,
  scope: string,
  creatorName: string,
): MarketingReportDocument {
  const quotedLeadIds = new Set(current.quotedLeadIds);
  const sourceMap = new Map<string, { count: number; quoted: number }>();
  current.createdLeads.forEach((lead) => {
    const key = lead.sourceName?.trim() || 'Sin origen registrado';
    const row = sourceMap.get(key) ?? { count: 0, quoted: 0 };
    row.count += 1;
    if (quotedLeadIds.has(lead.id)) row.quoted += 1;
    sourceMap.set(key, row);
  });
  const rate = current.createdLeads.length ? current.createdWithQuote / current.createdLeads.length * 100 : 0;
  return {
    title: `Marketing · Mis Leads · ${creatorName}`, period,
    scope: `${scope} · Agente de marketing: ${creatorName} · Leads creados por su usuario de Odoo`,
    sections: [
      { title: 'Mi impacto comercial', note: 'Solo se atribuye la primera compra del cliente; una coincidencia no prueba causalidad.', metrics: [
        { label: 'Leads creados', value: formatNumber(current.createdLeads.length), note: 'Fecha de creación' },
        { label: 'Valor cotizado', value: formatCurrency(current.quoteAmount), note: `${formatNumber(current.quotes.length)} cotizaciones` },
        { label: 'Facturado sin impuestos', value: formatCurrency(current.billedAmount), note: `${formatNumber(current.billedCustomers)} clientes en primera compra` },
        { label: 'Ganados', value: formatNumber(current.wonLeads.length) },
        { label: 'Perdidos', value: formatNumber(current.lostLeads.length) },
        { label: 'Leads nuevos cotizados', value: formatPercent(rate) },
      ], charts: [
        { kind: 'trend', title: 'Valor generado en el periodo', note: 'Cotizado y primeras compras facturadas por tramo.', primaryLabel: 'Cotizado', comparisonLabel: 'Facturado',
          points: current.series.map((point) => ({ label: point.label, value: point.quoted, display: formatCurrency(point.quoted), comparison: point.billed, comparisonDisplay: formatCurrency(point.billed) })) },
        { kind: 'donut', title: 'Resultado de los cierres', value: current.wonLeads.length,
          total: current.wonLeads.length + current.lostLeads.length, primaryLabel: 'Ganados', secondaryLabel: 'Perdidos' },
        { kind: 'bars', title: 'Origen de mis leads', bars: [...sourceMap].sort((a, b) => b[1].count - a[1].count)
          .map(([label, row]) => ({ label, value: row.count, display: `${formatNumber(row.count)} creados · ${formatNumber(row.quoted)} cotizados` })) },
        { kind: 'bars', title: 'Ritmo de captación', comparisonLabel: previous ? leads.previousRangeLabel : undefined,
          note: previous ? undefined : 'Periodo anterior pendiente; no se presenta como cero.',
          bars: leads.intake.map((point) => ({ label: point.label, value: point.current, display: formatNumber(point.current),
            comparison: previous ? point.previous : undefined, comparisonDisplay: previous ? formatNumber(point.previous) : undefined })) },
        { kind: 'bars', title: 'Cotizaciones pendientes de cierre', bars: current.openQuotes.map(({ document }) => ({ label: document.name || `Orden ${document.id}`, value: document.amountUntaxed, display: formatCurrency(document.amountUntaxed) })) },
      ] },
      { title: 'Seguimiento de cierres y cotizaciones', metrics: [
        { label: 'Cotizaciones abiertas', value: formatNumber(current.openQuotes.length) },
        { label: 'Importe abierto', value: formatCurrency(current.openQuoteAmount) },
        { label: 'Primera compra sin ganar en CRM', value: formatNumber(current.pendingCrmWins.length) },
        { label: 'Ganados registrados tarde', value: formatNumber(current.delayedCrmWins.length) },
        { label: 'Demora mediana', value: current.medianDelayDays === null ? 'Sin dato' : `${formatNumber(current.medianDelayDays)} días` },
      ], tables: [
        { title: 'Leads creados', columns: ['Lead', 'Cliente', 'Vendedor', 'Etapa'], rows: current.createdLeads.map((lead) => [lead.name, lead.customerName ?? '', lead.sellerName ?? '', lead.stageName ?? '']) },
        { title: 'Ganados', columns: ['Lead', 'Cliente', 'Vendedor', 'Cierre'], rows: current.wonLeads.map((lead) => [lead.name, lead.customerName ?? '', lead.sellerName ?? '', marketingCrmDateKey(lead.closedDate) ?? 'Primera compra']) },
        { title: 'Perdidos', columns: ['Lead', 'Cliente', 'Vendedor', 'Cierre'], rows: current.lostLeads.map((lead) => [lead.name, lead.customerName ?? '', lead.sellerName ?? '', marketingCrmDateKey(lead.closedDate) ?? '']) },
        { title: 'Cotizaciones vinculadas', columns: ['Documento', 'Cliente', 'Vendedor', 'Sin impuestos'], rows: current.quotes.map(({ document }) => [document.name || `Orden ${document.id}`, document.customerName, document.sellerName ?? '', formatCurrency(document.amountUntaxed)]) },
        { title: 'Primeras facturas vinculadas', columns: ['Documento', 'Cliente', 'Vendedor', 'Sin impuestos'], rows: current.invoices.map(({ document }) => [document.name || `Factura ${document.id}`, document.customerName, document.sellerName ?? '', formatCurrency(document.untaxedAmountSigned)]) },
        { title: 'Primera compra pendiente de marcar como ganada', columns: ['Lead', 'Cliente', 'Primera compra'],
          rows: current.pendingCrmWins.map(({ lead, firstPurchaseDate }) => [lead.name, lead.customerName ?? '', firstPurchaseDate]) },
        { title: 'Ganados registrados tarde', columns: ['Lead', 'Cliente', 'Primera compra', 'Cierre CRM', 'Demora'],
          rows: current.delayedCrmWins.map(({ lead, firstPurchaseDate, crmWonDate, delayDays }) => [lead.name, lead.customerName ?? '', firstPurchaseDate, crmWonDate ?? '', `${formatNumber(delayDays)} días`]) },
      ] },
    ],
  };
}

function downloadMarketingReportHtml(html: string, title: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugifyFilename(title)}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function printMarketingReportHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.title = 'Reporte de Marketing para guardar PDF';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
  frame.srcdoc = html;
}

function readMarketingRowMeta(row: MarketingRankRow | MarketingMiniRow) {
  return 'meta' in row && typeof row.meta === 'string' ? row.meta : '';
}

function readMarketingRowTextField(
  row: MarketingRankRow | MarketingMiniRow,
  field: 'address' | 'categories' | 'contact' | 'customerName' | 'email' | 'phone' | 'products' | 'seller' | 'status',
) {
  const value = (row as Partial<Record<
    'address' | 'categories' | 'contact' | 'customerName' | 'email' | 'phone' | 'products' | 'seller' | 'status',
    string | null | undefined
  >>)[field];
  return typeof value === 'string' ? value : '';
}

function filterMarketingRows(rows: MarketingMiniRow[], searchTerm: string) {
  const normalized = normalizeMarketingKey(searchTerm);
  if (!normalized) return rows;
  return rows.filter((row) =>
    [
      row.label,
      row.value,
      row.customerName,
      row.seller,
      row.products,
      row.categories,
      row.email,
      row.phone,
      row.address,
      row.contact,
      row.status,
      row.meta,
    ].some((value) => normalizeMarketingKey(value).includes(normalized)),
  );
}

function exportMarketingRowsCsv(title: string, rows: Array<MarketingRankRow | MarketingMiniRow>) {
  const safeTitle = title.trim() || 'Datos de marketing';
  const csvRows = [
    ['Reporte', safeTitle],
    ['Generado', new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date())],
    [],
    [
      'Cliente / Registro',
      'Valor',
      'Vendedor',
      'Producto(s) comprado(s)',
      'Categoría(s)',
      'Correo',
      'Teléfono',
      'Dirección',
      'Contacto completo',
      'Estado / Segmento',
      'Contexto',
    ],
    ...rows.map((row) => [
      row.label,
      row.value,
      readMarketingRowTextField(row, 'seller'),
      readMarketingRowTextField(row, 'products'),
      readMarketingRowTextField(row, 'categories'),
      readMarketingRowTextField(row, 'email'),
      readMarketingRowTextField(row, 'phone'),
      readMarketingRowTextField(row, 'address'),
      readMarketingRowTextField(row, 'contact'),
      readMarketingRowTextField(row, 'status'),
      readMarketingRowMeta(row),
    ]),
  ];
  const csv = csvRows
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n');
  const filename = `${slugifyFilename(safeTitle)}-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string | number | null | undefined) {
  const text = `${value ?? ''}`.replace(/\r?\n/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function slugifyFilename(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'marketing';
}

async function listMarketingAgentNotifications(userId: string): Promise<MarketingPersistedNotification[]> {
  const { data, error } = await supabase
    .from('sales_agent_notifications')
    .select('id,title,message,recommendation,severity,is_read,last_detected_at,metadata')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('is_read', { ascending: true })
    .order('last_detected_at', { ascending: false })
    .limit(40);

  if (error) throw error;

  return ((data ?? []) as MarketingPersistedNotification[])
    .filter((notification) => notification.metadata?.source === 'marketing_dashboard');
}

async function syncMarketingAgentNotifications(
  userId: string,
  userEmail: string,
  marketing: MarketingViewModel,
) {
  const actionableAlerts = buildMarketingActionNotifications(marketing)
    .filter((notification) => notification.tone !== 'good')
    .slice(0, 8);
  if (!actionableAlerts.length) return;

  const now = new Date().toISOString();
  const rows = actionableAlerts.map((notification) => ({
    user_id: userId,
    seller_email: userEmail.trim().toLowerCase() || 'marketing@tectronic.mx',
    fingerprint: notification.fingerprint,
    category: notification.category,
    severity: notification.severity === 'opportunity' ? 'warning' : notification.severity,
    title: notification.title,
    message: notification.description,
    recommendation: notification.action,
    entity_type: notification.category === 'crm_lead'
      ? 'crm_lead'
      : 'portfolio',
    entity_key: slugifyFilename(`${notification.title}-${notification.action}`),
    metadata: {
      source: 'marketing_dashboard',
      action: notification.action,
      fingerprint: notification.fingerprint,
      metric: notification.metric,
      rows: notification.rows.slice(0, 5),
      tone: notification.tone,
    },
    last_detected_at: now,
    dismissed_at: null,
  } satisfies DatabaseSalesAgentNotificationInsert));
  const fingerprints = rows.map((row) => row.fingerprint);
  const { data: existingRows, error: existingError } = await supabase
    .from('sales_agent_notifications')
    .select('fingerprint,dismissed_at')
    .eq('user_id', userId)
    .in('fingerprint', fingerprints);

  if (existingError) return;

  const dismissedFingerprints = new Set(
    (existingRows ?? [])
      .filter((row) => row.dismissed_at !== null)
      .map((row) => row.fingerprint),
  );
  const rowsToUpsert = rows.filter((row) => !dismissedFingerprints.has(row.fingerprint));
  if (!rowsToUpsert.length) return;

  await supabase
    .from('sales_agent_notifications')
    .upsert(rowsToUpsert, { onConflict: 'user_id,fingerprint' });
}

type DatabaseSalesAgentNotificationInsert = Omit<
  SalesAgentNotificationRow,
  'id' | 'is_read' | 'dismissed_at' | 'first_detected_at' | 'created_at' | 'updated_at'
> & {
  dismissed_at?: string | null;
};

function resolveMarketingNotificationCategory(title: string): SalesAgentNotificationRow['category'] {
  const normalized = title.toLocaleLowerCase('es-MX');
  if (normalized.includes('crm') || normalized.includes('oportunidad') || normalized.includes('fecha')) {
    return 'crm_lead';
  }
  if (normalized.includes('concentr')) return 'portfolio_concentration';
  if (normalized.includes('convers')) return 'low_conversion';
  if (normalized.includes('cliente')) return 'inactive_client';
  return 'sales_decline';
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatLeadDelta(current: number, previous: number, isPercentagePoint = false) {
  if (previous === 0) return current === 0 ? 'Sin cambio' : 'Nuevo';
  const delta = isPercentagePoint ? current - previous : (current - previous) / Math.abs(previous) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}${isPercentagePoint ? ' pp' : '%'}`;
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
