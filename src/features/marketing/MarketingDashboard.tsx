import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Clock3,
  Download,
  Eye,
  Info,
  LineChart,
  Megaphone,
  PieChart,
  RefreshCcw,
  Target,
  Users,
  X,
} from 'lucide-react';
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
  type ReportVisibilityScope,
} from '../reports/odooSalesCore';
import { buildCommercialDashboard } from '../reports/reportsAnalytics';
import { getCommercialDataset } from '../reports/reportsService';
import {
  readStoredCommercialDataset,
  readStoredCommercialDatasetMode,
  saveStoredCommercialDataset,
} from '../reports/reportsDatasetCache';
import { SidebarUserFooter } from '../admin/SidebarUserFooter';

type MarketingSection = 'summary' | 'segments' | 'campaigns' | 'opportunities' | 'crm' | 'alerts';

type MarketingDashboardProps = {
  session: Session;
  userRole: AdminUserRole;
  visibilityScope: ReportVisibilityScope;
  onOpenHub: () => void;
};

const marketingSections: Array<{ id: MarketingSection; label: string; icon: ReactNode }> = [
  { id: 'summary', label: 'Resumen', icon: <LineChart size={18} /> },
  { id: 'segments', label: 'Segmentación', icon: <Users size={18} /> },
  { id: 'campaigns', label: 'Campañas', icon: <Megaphone size={18} /> },
  { id: 'opportunities', label: 'Oportunidades', icon: <Target size={18} /> },
  { id: 'crm', label: 'CRM y leads', icon: <Clock3 size={18} /> },
  { id: 'alerts', label: 'Alertas', icon: <Bell size={18} /> },
];

export function MarketingDashboard({ session, userRole, visibilityScope, onOpenHub }: MarketingDashboardProps) {
  const [activeSection, setActiveSection] = useState<MarketingSection>('summary');
  const [activeDecisionDetail, setActiveDecisionDetail] = useState<MarketingDecisionDetailKey>('risk');
  const [monthlyReportStatus, setMonthlyReportStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [monthlyReportError, setMonthlyReportError] = useState<string | null>(null);
  const filters = useMemo(() => buildMarketingFilters(visibilityScope), [visibilityScope]);
  const previousMonthFilters = useMemo(() => buildPreviousMonthMarketingFilters(filters), [filters]);
  const cachedDataset = useMemo(
    () => readStoredCommercialDataset(filters, 'sales', session.user.id),
    [filters, session.user.id],
  );
  const cachedDatasetMode = useMemo(
    () => readStoredCommercialDatasetMode(filters, 'sales', session.user.id),
    [filters, session.user.id],
  );
  const previousMonthCachedDataset = useMemo(
    () => readStoredCommercialDataset(previousMonthFilters, 'sales', session.user.id),
    [previousMonthFilters, session.user.id],
  );
  const previousMonthCachedDatasetMode = useMemo(
    () => readStoredCommercialDatasetMode(previousMonthFilters, 'sales', session.user.id),
    [previousMonthFilters, session.user.id],
  );
  const previousMonthReportQuery = useQuery({
    queryKey: [
      'marketing-previous-month-report',
      session.user.id,
      previousMonthFilters.startDate,
      previousMonthFilters.endDate,
    ],
    queryFn: () => readMarketingMonthlyReport({
      periodEnd: previousMonthFilters.endDate,
      periodStart: previousMonthFilters.startDate,
      userId: session.user.id,
    }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
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
  const fastDatasetQuery = useQuery({
    queryKey: ['marketing-dashboard-dataset', session.user.id, visibilityScope, 'fast', filters],
    queryFn: () => getCommercialDataset(filters, 'sales', 'fast'),
    initialData: () => cachedDataset ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const fullDatasetQuery = useQuery({
    queryKey: ['marketing-dashboard-dataset', session.user.id, visibilityScope, 'full', filters],
    queryFn: () => getCommercialDataset(filters, 'sales', 'full'),
    enabled:
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
  const isDatasetFetching = fastDatasetQuery.isFetching || fullDatasetQuery.isFetching;

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

  const snapshot = useMemo(
    () => displayDataset ? buildCommercialDashboard(displayDataset, filters, defaultReportsConfig) : null,
    [displayDataset, filters],
  );
  const marketing = useMemo(
    () => snapshot && displayDataset ? buildMarketingViewModel(snapshot, displayDataset) : null,
    [displayDataset, snapshot],
  );
  useEffect(() => {
    if (!marketing || userRole !== 'marketing_agent') return;
    void syncMarketingAgentNotifications(session.user.id, session.user.email ?? '', marketing)
      .then(() => refetchPersistedNotifications());
  }, [marketing, refetchPersistedNotifications, session.user.email, session.user.id, userRole]);
  const handleDownloadPreviousMonthReport = async () => {
    setMonthlyReportStatus('loading');
    setMonthlyReportError(null);

    try {
      const storedReport = previousMonthReportQuery.data;
      if (storedReport?.report_html) {
        downloadHtmlReport(
          storedReport.report_html,
          `reporte-marketing-${previousMonthFilters.startDate}-${previousMonthFilters.endDate}.html`,
        );
        setMonthlyReportStatus('ready');
        return;
      }

      let previousDataset = previousMonthCachedDatasetMode === 'full' ? previousMonthCachedDataset : null;
      if (!previousDataset) {
        previousDataset = await getCommercialDataset(previousMonthFilters, 'sales', 'full');
        saveStoredCommercialDataset(previousMonthFilters, previousDataset, 'sales', session.user.id, 'full');
      }
      const previousSnapshot = buildCommercialDashboard(previousDataset, previousMonthFilters, defaultReportsConfig);
      const previousMarketing = buildMarketingViewModel(previousSnapshot, previousDataset);
      const periodLabel = formatPeriodLabel(previousMonthFilters.startDate, previousMonthFilters.endDate);
      const reportHtml = buildMarketingMonthlyReportHtml(previousMarketing, periodLabel);
      await saveMarketingMonthlyReport({
        html: reportHtml,
        marketing: previousMarketing,
        periodEnd: previousMonthFilters.endDate,
        periodLabel,
        periodStart: previousMonthFilters.startDate,
        userId: session.user.id,
      });
      void previousMonthReportQuery.refetch();
      downloadHtmlReport(reportHtml, `reporte-marketing-${previousMonthFilters.startDate}-${previousMonthFilters.endDate}.html`);
      setMonthlyReportStatus('ready');
    } catch (error) {
      setMonthlyReportStatus('error');
      setMonthlyReportError(error instanceof Error ? error.message : 'No se pudo generar el reporte del mes anterior.');
    }
  };

  return (
    <div className="admin-shell reports-shell marketing-shell">
      <OdooLoadingModal
        open={isDatasetFetching}
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
                  key={section.id}
                  type="button"
                  className={activeSection === section.id ? 'active' : undefined}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.icon}
                  {section.label}
                </button>
              ))}
              <button type="button" onClick={() => openModuleDocs('marketing')}>
                <BookOpen size={18} />
                Docs
              </button>
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
              <h1>Marketing</h1>
              <p>Segmentación, CRM, campañas sugeridas y alertas para orientar mercadotecnia con datos reales de Odoo.</p>
            </div>
            <div className="marketing-heading-actions">
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
                  void fastDatasetQuery.refetch();
                  void fullDatasetQuery.refetch();
                }}
              >
                <RefreshCcw size={16} />
                Actualizar
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={monthlyReportStatus === 'loading'}
                onClick={() => void handleDownloadPreviousMonthReport()}
              >
                <Download size={16} />
                {monthlyReportStatus === 'loading' ? 'Preparando reporte...' : 'Descargar reporte del mes anterior'}
              </button>
            </div>
          </div>

          {monthlyReportError ? (
            <div className="marketing-inline-error">{monthlyReportError}</div>
          ) : null}

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

          {marketing ? (
            <MarketingSectionContent
              activeDecisionDetail={activeDecisionDetail}
              activeSection={activeSection}
              marketing={marketing}
              onSelectDecisionDetail={setActiveDecisionDetail}
              persistedNotifications={persistedNotificationsQuery.data ?? []}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function MarketingSectionContent({
  activeDecisionDetail,
  activeSection,
  marketing,
  onSelectDecisionDetail,
  persistedNotifications,
}: {
  activeDecisionDetail: MarketingDecisionDetailKey;
  activeSection: MarketingSection;
  marketing: MarketingViewModel;
  onSelectDecisionDetail: (detail: MarketingDecisionDetailKey) => void;
  persistedNotifications: MarketingPersistedNotification[];
}) {
  const [activeInsight, setActiveInsight] = useState<MarketingInsightModalData | null>(null);

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
      <MarketingNotificationCenter
        marketing={marketing}
        persistedNotifications={persistedNotifications}
        onOpenInsight={setActiveInsight}
      />
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
              <MarketingMiniTable rows={method.rows} />
            </article>
          ))}
        </div>
      </MarketingPanel>
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
      {activeInsight ? <MarketingInsightModal insight={activeInsight} onClose={() => setActiveInsight(null)} /> : null}
    </div>
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
              <p>Clientes, vendedores, productos, contacto y contexto asociados al indicador seleccionado.</p>
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

function buildMarketingViewModel(
  snapshot: ReturnType<typeof buildCommercialDashboard>,
  dataset: OdooCommercialDataset,
): MarketingViewModel {
  const totalClients = snapshot.clientLifecycle.rows.length;
  const atRisk = snapshot.clientLifecycle.summary.atRiskCustomers;
  const topCategory = snapshot.sellers.categoryBreakdown[0] ?? null;
  const topProducts = snapshot.products.topByRevenue.slice(0, 6);
  const topProduct = topProducts[0] ?? null;
  const conversion = snapshot.conversion.overall.current;
  const concentration = snapshot.pareto.customers.rows.slice(0, 5).reduce((sum, row) => sum + row.individualPct, 0);
  const crm = buildCrmMarketingInsights(dataset.crmLeads ?? []);
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

function buildCrmMarketingInsights(leads: OdooCrmLeadRecord[]) {
  const today = new Date();
  const activeLeads = leads.filter((lead) => lead.active !== false);
  const openLeads = activeLeads.filter((lead) => !lead.closedDate && !isClosedStage(lead.stageName));
  const pipelineAmount = openLeads.reduce((sum, lead) => sum + Math.max(0, lead.expectedRevenue), 0);
  const weightedPipeline = openLeads.reduce(
    (sum, lead) => sum + Math.max(0, lead.expectedRevenue) * clampPercent(lead.probability) / 100,
    0,
  );
  const recentChanges = activeLeads.filter((lead) => {
    const date = parseDate(lead.writeDate ?? lead.createDate);
    return date ? daysBetween(date, today) <= 7 : false;
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
  const followUps = [...staleLeads, ...overdueLeads]
    .filter((lead, index, rows) => rows.findIndex((row) => row.id === lead.id) === index)
    .sort((left, right) => {
      const leftDeadline = parseDate(left.deadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDeadline = parseDate(right.deadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDeadline - rightDeadline || right.expectedRevenue - left.expectedRevenue;
    })
    .slice(0, 8)
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

function buildMarketingFilters(visibilityScope: ReportVisibilityScope): ReportFilters {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;

  return {
    startDate,
    endDate,
    companyId: null,
    companyIds: [],
    sellerId: null,
    sellerIds: [],
    teamId: null,
    customerId: null,
    productId: null,
    categoryId: null,
    currencyCode: null,
    channel: null,
    stateScope: 'all',
    grouping: 'month',
    visibilityScope,
  };
}

function buildPreviousMonthMarketingFilters(filters: ReportFilters): ReportFilters {
  const currentStart = new Date(`${filters.startDate}T00:00:00.000Z`);
  const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1));
  const previousEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0));

  return {
    ...filters,
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10),
  };
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

function buildMarketingMonthlyReportHtml(marketing: MarketingViewModel, periodLabel: string) {
  const listItems = (rows: MarketingRankRow[] | MarketingMiniRow[]) => rows
    .slice(0, 10)
    .map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(readMarketingRowTextField(row, 'seller'))}</td><td>${escapeHtml(readMarketingRowTextField(row, 'products'))}</td><td>${escapeHtml(row.value)}</td><td>${escapeHtml(readMarketingRowTextField(row, 'email'))}</td><td>${escapeHtml(readMarketingRowTextField(row, 'phone'))}</td><td>${escapeHtml(readMarketingRowTextField(row, 'address'))}</td><td>${escapeHtml(readMarketingRowMeta(row))}</td></tr>`)
    .join('');
  const kpis = marketing.kpis
    .map((kpi) => `<article><span>${escapeHtml(kpi.label)}</span><strong>${escapeHtml(kpi.value)}</strong></article>`)
    .join('');
  const decisions = marketing.decisions
    .map((decision) => `<article><small>${escapeHtml(decision.area)}</small><h3>${escapeHtml(decision.title)}</h3><p>${escapeHtml(decision.description)}</p><b>${escapeHtml(decision.metric)}</b></article>`)
    .join('');

  return `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8" />
  <title>Reporte ejecutivo de Marketing - ${escapeHtml(periodLabel)}</title>
  <style>
    body{font-family:Georgia,'Times New Roman',serif;background:#f4f1ea;color:#243532;margin:0;padding:32px}
    header,section{background:#fff;border:1px solid #dce4dd;border-radius:24px;margin:0 0 18px;padding:24px}
    h1,h2,h3,p{margin-top:0} h1{font-size:32px} h2{font-size:20px;color:#2f7d73}
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
    article{border:1px solid #e1e8e2;border-radius:18px;padding:16px;background:#fbfaf7}
    article span,small{color:#63746f;text-transform:uppercase;letter-spacing:.08em;font-size:11px}
    article strong{display:block;font-size:22px;margin-top:8px}
    table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e1e8e2;padding:10px;text-align:left} th{color:#2f7d73}
  </style>
</head>
<body>
  <header>
    <small>Corporación Tectronic</small>
    <h1>Reporte ejecutivo de Marketing</h1>
    <p>Periodo analizado: ${escapeHtml(periodLabel)}. Datos generados desde Odoo y conservados en Supabase.</p>
  </header>
  <section><h2>KPIs del mes</h2><div class="kpis">${kpis}</div></section>
  <section><h2>Mapa de decisiones</h2><div class="kpis">${decisions}</div></section>
  <section><h2>Clientes en riesgo</h2><table><thead><tr><th>Cliente</th><th>Vendedor</th><th>Productos</th><th>Valor</th><th>Correo</th><th>Teléfono</th><th>Dirección</th><th>Contexto</th></tr></thead><tbody>${listItems(marketing.decisionDetails.risk.tableRows)}</tbody></table></section>
  <section><h2>Categorías principales</h2><table><thead><tr><th>Cliente</th><th>Vendedor</th><th>Productos</th><th>Valor</th><th>Correo</th><th>Teléfono</th><th>Dirección</th><th>Contexto</th></tr></thead><tbody>${listItems(marketing.decisionDetails.demand.tableRows)}</tbody></table></section>
  <section><h2>Higiene de leads</h2><table><thead><tr><th>Cliente / oportunidad</th><th>Vendedor</th><th>Productos</th><th>Valor</th><th>Correo</th><th>Teléfono</th><th>Dirección</th><th>Contexto</th></tr></thead><tbody>${listItems(marketing.decisionDetails.crm.tableRows)}</tbody></table></section>
</body>
</html>`;
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

async function saveMarketingMonthlyReport({
  html,
  marketing,
  periodEnd,
  periodLabel,
  periodStart,
  userId,
}: {
  html: string;
  marketing: MarketingViewModel;
  periodEnd: string;
  periodLabel: string;
  periodStart: string;
  userId: string;
}) {
  const snapshot = {
    alerts: marketing.alerts,
    decisions: marketing.decisions,
    health: marketing.health,
    kpis: marketing.kpis,
    periodLabel,
  };
  const { error } = await supabase.from('marketing_report_exports').insert({
    created_by: userId,
    period_end: periodEnd,
    period_label: periodLabel,
    period_start: periodStart,
    report_html: html,
    snapshot,
    title: 'Reporte ejecutivo de Marketing',
  });

  if (error) {
    throw new Error(`No se pudo guardar el reporte en Supabase: ${error.message}`);
  }
}

async function readMarketingMonthlyReport({
  periodEnd,
  periodStart,
  userId,
}: {
  periodEnd: string;
  periodStart: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from('marketing_report_exports')
    .select('id, report_html, period_label, created_at')
    .eq('created_by', userId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo consultar el reporte guardado: ${error.message}`);
  }

  return data;
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

function downloadHtmlReport(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
