import {
  useEffect,
  useMemo,
  useState,
  startTransition,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  DollarSign,
  Download,
  FileText,
  Filter,
  Info,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageCircle,
  MoreVertical,
  PieChart,
  RefreshCcw,
  Share2,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { OdooLoadingModal } from '../../components/OdooLoadingModal';
import { openModuleDocs } from '../../lib/moduleDocs';
import { SidebarUserFooter } from '../admin/SidebarUserFooter';
import { supabase } from '../../lib/supabase';
import {
  buildCommercialDashboard,
  type AgentMetricFormat,
  type AgentPerformanceProfile,
  type AgentYearDimensionRow,
  type AgentYearSection,
  type AnnualGrowthSnapshot,
  type ClientLifecycleRow,
  type CommercialDashboardSnapshot,
  type ExecutiveMetric,
  type Hallazgo,
  type HallazgoLevel,
  type ParetoRow,
  type ProductAnalysisRow,
  type RiskLevel,
  type SellerCategoryPerformanceRow,
  type SellerCategorySummary,
  type SellerPerformanceRow,
  type SellerTimelineSummary,
  type TrendPoint,
} from './reportsAnalytics';
import {
  defaultReportsConfig,
  type OdooCommercialDataset,
  type OdooInvoiceRecord,
  type OdooOrderRecord,
  type ParetoMetricKey,
  type ReportOption,
  type ReportFilters,
  type ReportGrouping,
  type ReportRequestedDomain,
  type ReportsConfig,
  type ReportVisibilityScope,
  type SellerGoalConfig,
} from './odooSalesCore';
import {
  getStoredReportsPreferences,
  saveStoredReportsPreferences,
} from './reportsPreferencesService';
import {
  readStoredCommercialDataset,
  readStoredCommercialDatasetMode,
  saveStoredCommercialDataset,
} from './reportsDatasetCache';
import {
  readStoredSalesForecastDataset,
  saveStoredSalesForecastDataset,
} from './reportsForecastCache';
import {
  getSalesForecastDataset,
  type SalesForecastDataset,
} from './reportsForecastService';
import {
  buildPurchaseDashboard,
  type PurchaseBuyerRow,
  type PurchaseCategoryRow,
  type PurchaseDashboardSnapshot,
  type PurchaseProductRow,
  type PurchaseSupplierRow,
  type PurchaseTrendPoint,
} from './reportsPurchasingAnalytics';
import { getCommercialDataset } from './reportsService';
import {
  buildAgentPerformanceScore,
  buildSalesAgentNotifications,
  SALES_PERFORMANCE_BIBLIOGRAPHY,
  type AgentPerformanceScore,
} from './salesAgentIntelligence';
import {
  createSharedSalesReport,
  dismissSalesAgentNotification,
  dismissSalesAgentNotifications,
  listSalesAgentNotifications,
  markAllSalesAgentNotificationsRead,
  markSalesAgentNotificationRead,
  syncSalesAgentNotifications,
  type SalesAgentNotification,
} from './salesReportsCollaborationService';

type ReportsSection =
  | 'executive'
  | 'conversion'
  | 'clients'
  | 'products'
  | 'sellers'
  | 'purchases'
  | 'pareto'
  | 'forecasts'
  | 'details';

type ReportsDashboardProps = {
  session: Session;
  visibilityScope: ReportVisibilityScope;
  canAccessSales: boolean;
  canAccessPurchases: boolean;
  onOpenHub: () => void;
};

type QuickRangeKey =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'current_month'
  | 'previous_month'
  | 'current_quarter'
  | 'current_year'
  | 'previous_year';

type TableColumn<T> = {
  id: string;
  label: string;
  sortable?: boolean;
  sortValue?: (row: T) => number | string;
  render: (row: T) => ReactNode;
};

type ReportKpi = {
  label: string;
  value: string;
  note?: string;
};

type ReportTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

type ReportChart = {
  title: string;
  subtitle?: string;
  labels: string[];
  series: Array<{
    label: string;
    color: string;
    values: number[];
    formatter: 'currency' | 'number' | 'percent';
  }>;
};

type SectionReport = {
  fileBase: string;
  companyName: string;
  logoSrc: string;
  title: string;
  subtitle: string;
  objective: string;
  generatedAtIso: string;
  generatedAt: string;
  kpis: ReportKpi[];
  highlights: string[];
  tables: ReportTable[];
  sellerName?: string | null;
  position?: string;
  score?: AgentPerformanceScore;
  charts?: ReportChart[];
  bibliography?: Array<{ citation: string; url: string }>;
};

type DetailKey =
  | 'pendingQuotes'
  | 'expiredQuotes'
  | 'cancelledQuotes'
  | 'convertedQuotes'
  | 'confirmedOrders'
  | 'postedInvoices'
  | 'atRiskClients'
  | 'dormantClients'
  | 'lostClients'
  | 'reactivatedClients'
  | 'negativeMarginProducts'
  | 'lowConversionSellers';

const REPORTS_CONFIG_STORAGE_KEY = 'tectronic-reports-config-v2';
const REPORT_COMPANY_NAME = 'Corporación Tectronic';
const REPORT_LOGO_SRC = '/tectronic-logo.png';
const DEFAULT_COMPANY_FILTER_LABEL = 'Corporación Tectronic';
const DEFAULT_COMPANY_FILTER_NAME = 'CorporaciÃ³n Tectronic';
const EMPTY_FILTER_SELECTION_ID = -1;

const reportSections: Array<{
  id: ReportsSection;
  label: string;
  icon: ReactNode;
}> = [
  { id: 'executive', label: 'Resumen ejecutivo', icon: <LayoutDashboard size={18} /> },
  { id: 'conversion', label: 'Conversión', icon: <Target size={18} /> },
  { id: 'clients', label: 'Clientes', icon: <Users size={18} /> },
  { id: 'products', label: 'Productos', icon: <Boxes size={18} /> },
  { id: 'sellers', label: 'Vendedores', icon: <Trophy size={18} /> },
  { id: 'purchases', label: 'Compras', icon: <ShoppingCart size={18} /> },
  { id: 'pareto', label: 'Pareto', icon: <BarChart3 size={18} /> },
  { id: 'forecasts', label: 'Pronósticos', icon: <TrendingUp size={18} /> },
  { id: 'details', label: 'Detalle analítico', icon: <ShoppingBag size={18} /> },
];

const quickRanges: Array<{ key: QuickRangeKey; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: 'last_7_days', label: 'Últimos 7 días' },
  { key: 'last_30_days', label: 'Últimos 30 días' },
  { key: 'current_month', label: 'Mes actual' },
  { key: 'previous_month', label: 'Último mes' },
  { key: 'current_quarter', label: 'Trimestre actual' },
  { key: 'current_year', label: 'Año actual' },
  { key: 'previous_year', label: 'Año anterior' },
];

const reportsSidebarSalesNav: Array<{
  id: ReportsSection;
  label: string;
  icon: ReactNode;
  detailKey?: DetailKey;
}> = [
  { id: 'executive', label: 'Resumen', icon: <BarChart3 size={18} /> },
  { id: 'conversion', label: 'Conversión', icon: <FileText size={18} /> },
  { id: 'clients', label: 'Clientes', icon: <Users size={18} /> },
  { id: 'products', label: 'Productos', icon: <Boxes size={18} /> },
  { id: 'sellers', label: 'Vendedores', icon: <UserRound size={18} /> },
  { id: 'pareto', label: 'Pareto', icon: <PieChart size={18} /> },
  { id: 'forecasts', label: 'Pronósticos', icon: <TrendingUp size={18} /> },
] as const;

const reportsSidebarPurchaseNav: Array<{
  id: ReportsSection;
  label: string;
  icon: ReactNode;
}> = [{ id: 'purchases', label: 'Análisis de compra', icon: <ShoppingCart size={18} /> }] as const;

const reportsSidebarPrimaryNav: Array<{
  id: string;
  label: string;
  icon: ReactNode;
}> = [];

const reportsSidebarAdminNav: Array<{
  id: string;
  label: string;
  icon: ReactNode;
}> = [];

export function ReportsDashboard({
  session,
  visibilityScope,
  canAccessSales,
  canAccessPurchases,
  onOpenHub,
}: ReportsDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = normalizeReportsSection(searchParams.get('reportsSection')) ?? 'executive';
  const selectedDetailKey =
    normalizeReportDetailKey(searchParams.get('reportDetail')) ?? 'pendingQuotes';
  const [filters, setFilters] = useState<ReportFilters>(() =>
    buildDefaultFilters(visibilityScope),
  );
  const [config, setConfig] = useState<ReportsConfig>(() => loadStoredConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [companyDefaultPending, setCompanyDefaultPending] = useState(true);
  const [sellerCatalog, setSellerCatalog] = useState<Array<{ sellerId: number | null; sellerName: string }>>([]);
  const [completeSectionsReady, setCompleteSectionsReady] = useState(false);
  const datasetFetchFilters = useMemo<ReportFilters>(
    () => ({
      ...buildDefaultFilters(visibilityScope),
      startDate: filters.startDate,
      endDate: filters.endDate,
      visibilityScope: filters.visibilityScope,
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
    }),
    [filters.endDate, filters.startDate, filters.visibilityScope, visibilityScope],
  );
  const requestedDatasetDomain: ReportRequestedDomain =
    activeSection === 'purchases' || !canAccessSales ? 'purchases' : 'sales';
  const notificationFetchFilters = useMemo<ReportFilters>(
    () => buildOperationalNotificationFilters(visibilityScope),
    [visibilityScope],
  );
  const datasetCacheOwnerKey =
    `${session.user.id}:${session.user.email?.trim().toLowerCase() ?? ''}`;

  useEffect(() => {
    if (activeSection === 'purchases' && !canAccessPurchases) {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('reportsSection', 'executive');
        return nextParams;
      }, { replace: true });
      return;
    }

    if (!canAccessSales && canAccessPurchases && activeSection !== 'purchases') {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('reportsSection', 'purchases');
        nextParams.delete('reportDetail');
        return nextParams;
      }, { replace: true });
    }
  }, [activeSection, canAccessPurchases, canAccessSales, setSearchParams]);

  const preferencesQuery = useQuery({
    queryKey: ['reports-preferences', session.user.id],
    queryFn: () => getStoredReportsPreferences(),
  });
  const cachedDataset = useMemo(
    () => readStoredCommercialDataset(datasetFetchFilters, requestedDatasetDomain, datasetCacheOwnerKey),
    [datasetCacheOwnerKey, datasetFetchFilters, requestedDatasetDomain],
  );
  const cachedDatasetMode = useMemo(
    () => readStoredCommercialDatasetMode(datasetFetchFilters, requestedDatasetDomain, datasetCacheOwnerKey),
    [datasetCacheOwnerKey, datasetFetchFilters, requestedDatasetDomain],
  );
  const lastMonthPrefetchFilters = useMemo<ReportFilters>(() => {
    const range = buildQuickRange('last_30_days');
    return {
      ...datasetFetchFilters,
      ...range,
      grouping: recommendedGroupingForRange(range),
    };
  }, [datasetFetchFilters]);
  const cachedLastMonthDataset = useMemo(
    () => readStoredCommercialDataset(lastMonthPrefetchFilters, requestedDatasetDomain, datasetCacheOwnerKey),
    [datasetCacheOwnerKey, lastMonthPrefetchFilters, requestedDatasetDomain],
  );
  const cachedForecastDataset = useMemo(
    () => readStoredSalesForecastDataset(datasetCacheOwnerKey, visibilityScope),
    [datasetCacheOwnerKey, visibilityScope],
  );
  const isDefaultSevenDayRange = useMemo(() => {
    const range = buildQuickRange('last_7_days');
    return filters.startDate === range.startDate && filters.endDate === range.endDate;
  }, [filters.endDate, filters.startDate]);

  useEffect(() => {
    queueMicrotask(() => setCompleteSectionsReady(false));
  }, [datasetCacheOwnerKey, datasetFetchFilters, requestedDatasetDomain]);

  useEffect(() => {
    if (preferencesHydrated || preferencesQuery.isPending) {
      return;
    }

    queueMicrotask(() => {
      setConfig(mergeStoredConfig(preferencesQuery.data?.config ?? loadStoredConfig()));
      setFilters(mergeStoredFilters(preferencesQuery.data?.filters, visibilityScope));
      setCompanyDefaultPending(!preferencesQuery.data);
      setPreferencesHydrated(true);
    });
  }, [preferencesHydrated, preferencesQuery.data, preferencesQuery.isPending, visibilityScope]);

  useEffect(() => {
    queueMicrotask(() => {
      setFilters((current) =>
        current.visibilityScope === visibilityScope
          ? current
          : { ...current, visibilityScope },
      );
    });
  }, [visibilityScope]);

  useEffect(() => {
    if (!preferencesHydrated) {
      return;
    }

    window.localStorage.setItem(
      REPORTS_CONFIG_STORAGE_KEY,
      JSON.stringify(config),
    );

    void saveStoredReportsPreferences({ config, filters }).catch((error) => {
      console.error('No se pudieron guardar las preferencias del reporte.', error);
    });
  }, [config, filters, preferencesHydrated]);

  const fastDatasetQuery = useQuery({
    queryKey: ['commercial-dashboard-dataset', datasetCacheOwnerKey, requestedDatasetDomain, 'fast', datasetFetchFilters],
    queryFn: () => getCommercialDataset(datasetFetchFilters, requestedDatasetDomain, 'fast'),
    enabled: preferencesHydrated,
    initialData: () => cachedDataset ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const canRunFullDatasetQuery =
    preferencesHydrated &&
    Boolean(fastDatasetQuery.data) &&
    !fastDatasetQuery.isFetching &&
    (!cachedDataset || cachedDatasetMode === 'fast');
  const lastMonthPrefetchQuery = useQuery({
    queryKey: [
      'commercial-dashboard-dataset',
      datasetCacheOwnerKey,
      requestedDatasetDomain,
      'prefetch-last-30-days',
      lastMonthPrefetchFilters,
    ],
    queryFn: () => getCommercialDataset(lastMonthPrefetchFilters, requestedDatasetDomain, 'fast'),
    enabled:
      preferencesHydrated &&
      isDefaultSevenDayRange &&
      Boolean(fastDatasetQuery.data) &&
      !fastDatasetQuery.isFetching &&
      !cachedLastMonthDataset,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const forecastDatasetQuery = useQuery({
    queryKey: ['sales-forecast-dataset', datasetCacheOwnerKey, visibilityScope],
    queryFn: getSalesForecastDataset,
    enabled: preferencesHydrated && canAccessSales,
    initialData: () => cachedForecastDataset ?? undefined,
    staleTime: 1000 * 60 * 60 * 12,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const fullDatasetQuery = useQuery({
    queryKey: ['commercial-dashboard-dataset', datasetCacheOwnerKey, requestedDatasetDomain, 'full', datasetFetchFilters],
    queryFn: () => getCommercialDataset(datasetFetchFilters, requestedDatasetDomain, 'full'),
    enabled:
      canRunFullDatasetQuery &&
      completeSectionsReady &&
      activeSection !== 'executive' &&
      (!isDefaultSevenDayRange || Boolean(cachedLastMonthDataset) || Boolean(lastMonthPrefetchQuery.data)),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!preferencesHydrated || !fastDatasetQuery.data || fastDatasetQuery.isFetching) {
      return;
    }

    if (activeSection !== 'executive') {
      queueMicrotask(() => setCompleteSectionsReady(true));
      return;
    }

    if (
      isDefaultSevenDayRange &&
      !cachedLastMonthDataset &&
      !lastMonthPrefetchQuery.data
    ) {
      return;
    }

    return scheduleReportIdleWork(() => setCompleteSectionsReady(true));
  }, [
    activeSection,
    cachedLastMonthDataset,
    fastDatasetQuery.data,
    fastDatasetQuery.isFetching,
    isDefaultSevenDayRange,
    lastMonthPrefetchQuery.data,
    preferencesHydrated,
  ]);
  const datasetQuery = fastDatasetQuery;
  const displayDataset = fullDatasetQuery.data ?? datasetQuery.data ?? null;
  const datasetError = fullDatasetQuery.error ?? datasetQuery.error;
  const isDatasetFetching = datasetQuery.isFetching || fullDatasetQuery.isFetching;

  useEffect(() => {
    if (!preferencesHydrated || !displayDataset) {
      return;
    }

    queueMicrotask(() => {
      setFilters((current) => {
        const nextFilters = alignFiltersWithDataset(current, displayDataset, companyDefaultPending);
        return areFiltersEqual(current, nextFilters) ? current : nextFilters;
      });
      setCompanyDefaultPending(false);
      setSellerCatalog((current) => mergeSellerCatalog(current, displayDataset.availableFilters.sellers));
    });
  }, [companyDefaultPending, displayDataset, preferencesHydrated]);

  useEffect(() => {
    if (!preferencesHydrated || !displayDataset) {
      return;
    }

    saveStoredCommercialDataset(
      datasetFetchFilters,
      displayDataset,
      requestedDatasetDomain,
      datasetCacheOwnerKey,
      fullDatasetQuery.data ? 'full' : 'fast',
    );
  }, [
    datasetFetchFilters,
    displayDataset,
    fullDatasetQuery.data,
    preferencesHydrated,
    requestedDatasetDomain,
    datasetCacheOwnerKey,
  ]);

  useEffect(() => {
    if (!preferencesHydrated || !lastMonthPrefetchQuery.data) {
      return;
    }

    saveStoredCommercialDataset(
      lastMonthPrefetchFilters,
      lastMonthPrefetchQuery.data,
      requestedDatasetDomain,
      datasetCacheOwnerKey,
      'fast',
    );
  }, [
    datasetCacheOwnerKey,
    lastMonthPrefetchFilters,
    lastMonthPrefetchQuery.data,
    preferencesHydrated,
    requestedDatasetDomain,
  ]);

  useEffect(() => {
    if (!preferencesHydrated || !forecastDatasetQuery.data) {
      return;
    }

    saveStoredSalesForecastDataset(
      datasetCacheOwnerKey,
      visibilityScope,
      forecastDatasetQuery.data,
    );
  }, [
    datasetCacheOwnerKey,
    forecastDatasetQuery.data,
    preferencesHydrated,
    visibilityScope,
  ]);

  const displayFilters = filters;
  const snapshot = useMemo<CommercialDashboardSnapshot | null>(() => {
    if (!displayDataset) return null;
    return buildCommercialDashboard(displayDataset, displayFilters, config);
  }, [config, displayDataset, displayFilters]);
  const purchaseSnapshot = useMemo<PurchaseDashboardSnapshot | null>(() => {
    if (!displayDataset || activeSection !== 'purchases') return null;
    return buildPurchaseDashboard(displayDataset, displayFilters);
  }, [activeSection, displayDataset, displayFilters]);
  const activeSectionMeta = reportSections.find((section) => section.id === activeSection);
  const sellerSectionLabel = visibilityScope === 'own' ? 'Ventas' : 'Vendedores';
  const lastUpdatedLabel = formatRelativeUpdate(displayDataset?.fetchedAt ?? null);
  const showingPreview = Boolean(displayDataset && fullDatasetQuery.isFetching && !fullDatasetQuery.data);
  const isAgentProfile = visibilityScope === 'own' && Boolean(snapshot?.agentProfile);
  const notificationDatasetQuery = useQuery({
    queryKey: [
      'commercial-dashboard-dataset',
      datasetCacheOwnerKey,
      'sales',
      'agent-notifications',
      notificationFetchFilters,
    ],
    queryFn: () => getCommercialDataset(notificationFetchFilters, 'sales', 'full'),
    enabled:
      preferencesHydrated &&
      visibilityScope === 'own' &&
      canAccessSales &&
      !fullDatasetQuery.data &&
      !fullDatasetQuery.isFetching &&
      !fullDatasetQuery.error,
    staleTime: 15 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });
  const notificationSourceDataset = fullDatasetQuery.data ?? notificationDatasetQuery.data;
  const notificationDrafts = useMemo(
    () => (notificationSourceDataset ? buildSalesAgentNotifications(notificationSourceDataset) : []),
    [notificationSourceDataset],
  );
  const notificationSignature = useMemo(
    () =>
      notificationDrafts
        .map((notification) => `${notification.fingerprint}:${notification.message}`)
        .join('|'),
    [notificationDrafts],
  );
  const notificationsQuery = useQuery({
    queryKey: ['sales-agent-notifications', session.user.id],
    queryFn: listSalesAgentNotifications,
    enabled: isAgentProfile,
    staleTime: 60_000,
  });
  const refetchNotifications = notificationsQuery.refetch;

  useEffect(() => {
    if (!isAgentProfile || !session.user.email || !notificationSourceDataset) return;
    let active = true;
    void syncSalesAgentNotifications(session.user.email, notificationDrafts)
      .then(() => {
        if (active) void refetchNotifications();
      })
      .catch((error) => {
        console.error('No se pudieron actualizar las alertas comerciales.', error);
      });
    return () => {
      active = false;
    };
  }, [
    isAgentProfile,
    notificationSourceDataset,
    notificationDrafts,
    notificationSignature,
    refetchNotifications,
    session.user.email,
  ]);

  function openDetail(detailKey: DetailKey) {
    startTransition(() => {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('reportsSection', 'details');
        nextParams.set('reportDetail', detailKey);
        return nextParams;
      });
    });
  }

  function handleSidebarSalesClick(sectionId: ReportsSection, detailKey?: DetailKey) {
    startTransition(() => {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('reportsSection', sectionId);
        if (detailKey) {
          nextParams.set('reportDetail', detailKey);
        } else if (sectionId !== 'details') {
          nextParams.delete('reportDetail');
        }
        return nextParams;
      });
    });
  }

  return (
    <div className="admin-shell reports-shell">
      <OdooLoadingModal
        open={isDatasetFetching}
        title={requestedDatasetDomain === 'purchases'
          ? 'Preparando el análisis de compras'
          : 'Preparando los reportes de ventas'}
      />
      <aside className="admin-sidebar reports-sidebar">
        <div className="reports-sidebar-brand">
          <button type="button" className="admin-module-back reports-brand-button" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Reportes</span>
          </button>
        </div>

        <div className="reports-sidebar-scroll">
          <nav className="admin-nav reports-nav-group" aria-label="Navegación principal">
            {reportsSidebarPrimaryNav.map((item) => (
              <button key={item.id} type="button">
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          {canAccessSales ? (
            <>
              <div className="reports-nav-divider"></div>
              <section className="reports-nav-section">
                <p>VENTAS</p>
                <nav className="admin-nav reports-nav-group" aria-label="Ventas">
                  {reportsSidebarSalesNav.map((item) => {
                    const isActive =
                      item.id === 'details'
                        ? activeSection === 'details'
                        : activeSection === item.id;

                    return (
                      <button
                        key={item.label}
                        type="button"
                        className={isActive ? 'active' : undefined}
                        onClick={() => handleSidebarSalesClick(item.id, item.detailKey)}
                      >
                        {item.icon}
                        {item.id === 'sellers' && visibilityScope === 'own' ? 'Ventas' : item.label}
                      </button>
                    );
                  })}
                </nav>
              </section>
            </>
          ) : null}

          <div className="reports-nav-divider"></div>

          {canAccessPurchases ? <section className="reports-nav-section">
            <p>COMPRAS</p>
            <nav className="admin-nav reports-nav-group" aria-label="Compras">
              {reportsSidebarPurchaseNav.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={activeSection === item.id ? 'active' : undefined}
                  onClick={() => handleSidebarSalesClick(item.id)}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          </section> : null}

          <div className="reports-nav-divider"></div>

          <section className="reports-nav-section">
            <p>ADMINISTRACIÓN</p>
            <nav className="admin-nav reports-nav-group" aria-label="Administración">
              {reportsSidebarAdminNav.map((item) => (
                <button key={item.id} type="button">
                  {item.icon}
                  {item.label}
                </button>
              ))}
              <button type="button" onClick={() => openModuleDocs('reports')}>
                <FileText size={18} />
                Docs
              </button>
            </nav>
          </section>
        </div>

        <SidebarUserFooter
          email={session.user.email}
          statusLabel="Sesión activa"
          onSignOut={() => {
            void supabase.auth.signOut();
          }}
        />
      </aside>

      <main className="admin-workspace reports-workspace">
        <section className={`admin-section reports-screen reports-screen-${activeSection}`}>
          <ReportsTopBar
            isRefreshing={isDatasetFetching}
            notificationCenter={
              isAgentProfile ? (
                <AgentNotificationsCenter
                  notifications={notificationsQuery.data ?? []}
                  onDismiss={async (id) => {
                    await dismissSalesAgentNotification(id);
                    await refetchNotifications();
                  }}
                  onDismissMany={async (ids) => {
                    await dismissSalesAgentNotifications(ids);
                    await refetchNotifications();
                  }}
                  onRead={async (id) => {
                    await markSalesAgentNotificationRead(id);
                    await refetchNotifications();
                  }}
                  onReadAll={async () => {
                    await markAllSalesAgentNotificationsRead();
                    await refetchNotifications();
                  }}
                />
              ) : null
            }
            onOpenSettings={() => setSettingsOpen(true)}
            onRefresh={() => {
              void datasetQuery.refetch().then(() => fullDatasetQuery.refetch());
              if (activeSection === 'forecasts') void forecastDatasetQuery.refetch();
            }}
            updatedLabel={lastUpdatedLabel}
          />
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Análisis comercial Odoo</p>
              <h2>{activeSection === 'sellers' ? sellerSectionLabel : activeSectionMeta?.label ?? 'Dashboard de análisis comercial'}</h2>
              <p className="page-subtitle">
                Un tablero ejecutivo, claro y accionable para explicar qué está ocurriendo
                en ventas, facturación, margen, clientes y desempeño comercial.
              </p>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openModuleDocs('reports')}
              >
                <FileText size={16} />
                Docs
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 size={16} />
                Configuración
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  void datasetQuery.refetch().then(() => fullDatasetQuery.refetch());
                  if (activeSection === 'forecasts') void forecastDatasetQuery.refetch();
                }}
                disabled={isDatasetFetching || (activeSection === 'forecasts' && forecastDatasetQuery.isFetching)}
              >
                <RefreshCcw size={16} />
                {isDatasetFetching || (activeSection === 'forecasts' && forecastDatasetQuery.isFetching) ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>
          </div>

          {activeSection !== 'forecasts' ? (
            <FilterToolbar
              activeFilters={filters}
              companyLocked={visibilityScope === 'own'}
              dataset={displayDataset ?? undefined}
              sellerLocked={visibilityScope === 'own'}
              sellerOptions={displayDataset?.availableFilters.sellers ?? []}
              onApplyQuickRange={(key) =>
                setFilters((current) => {
                  const range = buildQuickRange(key);
                  return {
                    ...current,
                    ...range,
                    grouping: recommendedGroupingForRange(range),
                  };
                })
              }
              onChange={setFilters}
            />
          ) : null}

          {showingPreview ? (
            <article className="panel reports-static-panel">
              <div className="reports-panel-body">
                <strong>Vista rápida cargada</strong>
                <p>
                  Se muestra primero la última semana comparada contra la semana anterior mientras
                  se actualiza el rango completo seleccionado.
                </p>
              </div>
            </article>
          ) : null}

          {!displayDataset && datasetQuery.isLoading ? (
            <div className="loading-grid">
              <div className="skeleton-card"></div>
              <div className="skeleton-card"></div>
              <div className="skeleton-card"></div>
              <div className="skeleton-card"></div>
              <div className="skeleton-card wide"></div>
              <div className="skeleton-card wide"></div>
            </div>
          ) : null}

          {!displayDataset && datasetError ? (
            <article className="panel reports-empty">
              <EmptyState title="No se pudo cargar el dashboard comercial">
                  {datasetError instanceof Error ? datasetError.message : 'No se pudo consultar Odoo.'}
              </EmptyState>
            </article>
          ) : null}

          {displayDataset && datasetError ? (
            <article className="panel reports-static-panel">
              <div className="reports-panel-body">
                <strong>Seguimos mostrando información para que puedas continuar</strong>
                <p>{datasetError instanceof Error ? datasetError.message : 'No fue posible completar la actualización completa en este momento. Puedes seguir trabajando con la información ya cargada.'}</p>
              </div>
            </article>
          ) : null}

          {activeSection === 'forecasts' ? (
            <div className="reports-page reports-page-forecasts">
              <ForecastsSection
                dataset={forecastDatasetQuery.data ?? null}
                error={forecastDatasetQuery.error}
                isLoading={forecastDatasetQuery.isLoading || forecastDatasetQuery.isFetching}
                onRefresh={() => forecastDatasetQuery.refetch()}
              />
            </div>
          ) : null}

          {displayDataset && snapshot && activeSection !== 'forecasts' && (activeSection !== 'purchases' || purchaseSnapshot) ? (
            <div className={`reports-page reports-page-${activeSection}`}>
              {activeSection === 'executive' ? (
                isAgentProfile && snapshot.agentProfile ? (
                  <AgentProfileSection
                    profile={snapshot.agentProfile}
                    section="summary"
                    snapshot={snapshot}
                  />
                ) : (
                  <>
                    <ReportsMetricDeck
                      filters={filters}
                      metrics={snapshot.summaryMetrics}
                      onOpenDetail={openDetail}
                    />
                    <ExecutiveSectionV2
                      hallazgos={snapshot.hallazgos}
                      onOpenDetail={openDetail}
                      snapshot={snapshot}
                    />
                  </>
                )
              ) : null}

              {activeSection === 'conversion' ? (
                isAgentProfile && snapshot.agentProfile ? (
                  <AgentProfileSection
                    profile={snapshot.agentProfile}
                    section="conversion"
                    snapshot={snapshot}
                  />
                ) : (
                  <ConversionSectionV2 snapshot={snapshot} />
                )
              ) : null}

              {activeSection === 'clients' ? (
                isAgentProfile && snapshot.agentProfile ? (
                  <AgentProfileSection
                    profile={snapshot.agentProfile}
                    section="clients"
                    snapshot={snapshot}
                  />
                ) : (
                  <ClientsSectionV2 snapshot={snapshot} onOpenDetail={openDetail} />
                )
              ) : null}

              {activeSection === 'products' ? (
                isAgentProfile && snapshot.agentProfile ? (
                  <AgentProfileSection
                    profile={snapshot.agentProfile}
                    section="products"
                    snapshot={snapshot}
                  />
                ) : (
                  <ProductsSectionV2 snapshot={snapshot} onOpenDetail={openDetail} />
                )
              ) : null}

              {activeSection === 'sellers' ? (
                isAgentProfile && snapshot.agentProfile ? (
                  <AgentProfileSection
                    profile={snapshot.agentProfile}
                    section="sales"
                    snapshot={snapshot}
                  />
                ) : (
                  <SellersSectionV2
                    snapshot={snapshot}
                    sectionLabel={sellerSectionLabel}
                    onOpenDetail={openDetail}
                  />
                )
              ) : null}

              {activeSection === 'purchases' && purchaseSnapshot ? (
                <PurchasesSection snapshot={purchaseSnapshot} />
              ) : null}

              {activeSection === 'pareto' ? (
                isAgentProfile && snapshot.agentProfile ? (
                  <AgentProfileSection
                    profile={snapshot.agentProfile}
                    section="pareto"
                    snapshot={snapshot}
                  />
                ) : (
                  <ParetoSectionV2 snapshot={snapshot} />
                )
              ) : null}

              {activeSection === 'details' ? (
                <DetailsSectionV2
                  dataset={displayDataset}
                  selectedDetailKey={selectedDetailKey}
                  snapshot={snapshot}
                  onChangeDetail={(detailKey) => {
                    setSearchParams((currentParams) => {
                      const nextParams = new URLSearchParams(currentParams);
                      nextParams.set('reportsSection', 'details');
                      nextParams.set('reportDetail', detailKey);
                      return nextParams;
                    });
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      </main>

      {settingsOpen ? (
        <SettingsModal
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSave={setConfig}
          sellers={sellerCatalog}
        />
      ) : null}
    </div>
  );
}

function ExecutiveSection({
  snapshot,
  onOpenDetail,
}: {
  snapshot: CommercialDashboardSnapshot;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  return (
    <div className="reports-grid">
      <article className="panel reports-hero-card">
        <div className="panel-header">
          <strong>Evolución temporal</strong>
          <span>
            Agrupación actual: {groupingLabel(snapshot.filters.grouping)} · Comparación con
            período anterior
          </span>
        </div>
        <div className="reports-chart-card">
          <TrendPanel points={snapshot.trend} />
          <div className="reports-chart-summary">
            <SummaryChip
              label="Cotizaciones vencidas"
              value={formatNumber(snapshot.quoteSummary.expiredQuotes)}
              onClick={() => onOpenDetail('expiredQuotes')}
            />
            <SummaryChip
              label="Clientes en riesgo"
              value={formatNumber(snapshot.clientLifecycle.summary.atRiskCustomers)}
              onClick={() => onOpenDetail('atRiskClients')}
            />
            <SummaryChip
              label="Productos margen negativo"
              value={formatNumber(snapshot.products.negativeMargin.length)}
              onClick={() => onOpenDetail('negativeMarginProducts')}
            />
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <strong>Resumen comercial</strong>
          <span>Separación entre cotización, venta y facturación</span>
        </div>
        <div className="reports-insights">
          <ComparisonRow
            label="Cotizaciones"
            comparison={snapshot.quoteSummary.totalQuotes}
            formatter={formatNumber}
          />
          <ComparisonRow
            label="Conversión comercial"
            comparison={snapshot.conversion.overall}
            formatter={formatPercent}
          />
          <ComparisonRow
            label="Órdenes de venta"
            comparison={snapshot.sales.confirmedOrders}
            formatter={formatNumber}
          />
          <ComparisonRow
            label="Facturas publicadas"
            comparison={snapshot.invoicing.invoiceCount}
            formatter={formatNumber}
          />
          <ComparisonRow
            label="Total sin impuestos"
            comparison={snapshot.invoicing.invoicedAmount}
            formatter={formatCurrency}
          />
          <ComparisonRow
            label="Ticket promedio facturado"
            comparison={snapshot.sales.averageTicket}
            formatter={formatCurrency}
          />
          <ComparisonRow
            label="Clientes nuevos"
            comparison={snapshot.sales.newCustomers}
            formatter={formatNumber}
          />
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <strong>Clientes</strong>
          <span>Estados, retención y reactivación</span>
        </div>
        <div className="reports-panel-body">
          <div className="policy-card-quick-facts">
            <span>Nuevos: {formatNumber(snapshot.clientLifecycle.summary.newCustomers)}</span>
            <span>Activos: {formatNumber(snapshot.clientLifecycle.summary.activeCustomers)}</span>
            <span>En riesgo: {formatNumber(snapshot.clientLifecycle.summary.atRiskCustomers)}</span>
            <span>Dormidos: {formatNumber(snapshot.clientLifecycle.summary.dormantCustomers)}</span>
            <span>Perdidos: {formatNumber(snapshot.clientLifecycle.summary.lostCustomers)}</span>
            <span>Reactivados: {formatNumber(snapshot.clientLifecycle.summary.reactivatedCustomers)}</span>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <strong>Vendedores</strong>
          <span>Desempeño y conversión</span>
        </div>
        <div className="reports-panel-body">
          <MiniRanking
            rows={snapshot.sellers.rankingByRevenue.slice(0, 5)}
            primary={(row) => row.sellerName}
            secondary={(row) => `${formatPercent(row.conversionPct)} conversión`}
            value={(row) => formatCurrency(row.invoicedAmount)}
          />
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <strong>Productos</strong>
          <span>Rentabilidad y participación</span>
        </div>
        <div className="reports-panel-body">
          <MiniRanking
            rows={snapshot.products.topByRevenue.slice(0, 5)}
            primary={(row) => row.productName}
            secondary={(row) => `${formatPercent(row.marginPct ?? 0)} margen`}
            value={(row) => formatCurrency(row.revenue)}
          />
        </div>
      </article>
    </div>
  );
}

function ConversionSection({ snapshot }: { snapshot: CommercialDashboardSnapshot }) {
  return (
    <div className="reports-grid">
      <article className="panel reports-hero-card">
        <div className="panel-header">
          <strong>Conversión comercial</strong>
          <span>Numerador: órdenes confirmadas · Denominador: cotizaciones evaluables del período</span>
        </div>
        <div className="reports-panel-body">
          <div className="inventory-stats reports-kpis">
            <KpiBox label="Conversión general" value={formatPercent(snapshot.conversion.overall.current)} />
            <KpiBox label="Cotizaciones pendientes" value={formatNumber(snapshot.quoteSummary.pendingQuotes)} />
            <KpiBox label="Cotizaciones vencidas" value={formatNumber(snapshot.quoteSummary.expiredQuotes)} />
            <KpiBox label="Tiempo prom. de conversión" value={`${snapshot.quoteSummary.averageConversionDays.current.toFixed(1)} días`} />
          </div>
        </div>
      </article>

      <ConversionTablePanel title="Conversión por vendedor" rows={snapshot.conversion.bySeller} />
      <ConversionTablePanel title="Conversión por cliente" rows={snapshot.conversion.byCustomer.slice(0, 20)} />
      <ConversionTeamPiePanel rows={snapshot.conversion.byTeam} />
      <ConversionTablePanel title="Conversión por mes" rows={snapshot.conversion.byMonth} />
      <ConversionTablePanel title="Conversión por rango de importe" rows={snapshot.conversion.byRange} />
      <ConversionTablePanel title="Conversión por producto" rows={snapshot.conversion.byProduct} />
    </div>
  );
}

function ClientsSection({
  snapshot,
  onOpenDetail,
}: {
  snapshot: CommercialDashboardSnapshot;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  return (
    <div className="reports-grid">
      <article className="panel reports-hero-card">
        <div className="panel-header">
          <strong>Ciclo de vida y RFM</strong>
          <span>Recencia, frecuencia, valor monetario, retención y abandono</span>
        </div>
        <div className="reports-panel-body">
          <div className="inventory-stats reports-kpis">
            <KpiBox label="Valor en riesgo" value={formatCurrency(snapshot.clientLifecycle.summary.valueAtRisk)} />
            <KpiBox label="Retención" value={formatPercent(snapshot.clientLifecycle.summary.retentionPct)} />
            <KpiBox label="Reactivación" value={formatPercent(snapshot.clientLifecycle.summary.reactivationPct)} />
            <KpiBox label="Riesgo de abandono" value={formatPercent(snapshot.clientLifecycle.summary.churnRiskPct)} />
          </div>
          <div className="policy-card-quick-facts">
            {snapshot.clientLifecycle.rfmSegments.map((segment) => (
              <span key={segment.segment}>
                {segment.segment}: {formatNumber(segment.customers)}
              </span>
            ))}
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <strong>Clientes a priorizar</strong>
          <span>Estados y riesgo</span>
        </div>
        <div className="reports-panel-body">
          <div className="header-actions">
            <button type="button" className="secondary-button" onClick={() => onOpenDetail('atRiskClients')}>
              Ver en riesgo
            </button>
            <button type="button" className="secondary-button" onClick={() => onOpenDetail('reactivatedClients')}>
              Ver reactivados
            </button>
          </div>
          <DataTable
            rows={snapshot.clientLifecycle.rows.slice(0, 40)}
            storageKey="clients"
            columns={[
              column<ClientLifecycleRow>('customer', 'Cliente', (row) => row.customerName, (row) => row.customerName),
              column<ClientLifecycleRow>('status', 'Estado', (row) => renderStatusPill(row.currentStatus, row.riskLevel), (row) => row.currentStatus),
              column<ClientLifecycleRow>('previous', 'Estado anterior', (row) => row.previousStatus ?? '-', (row) => row.previousStatus ?? ''),
              column<ClientLifecycleRow>('revenue', 'Facturación', (row) => formatCurrency(row.revenue), (row) => row.revenue),
              column<ClientLifecycleRow>('margin', 'Margen', (row) => formatCurrency(row.margin), (row) => row.margin),
              column<ClientLifecycleRow>('days', 'Días sin comprar', (row) => formatNullableNumber(row.daysSinceLastPurchase), (row) => row.daysSinceLastPurchase ?? 0),
              column<ClientLifecycleRow>('rfm', 'RFM', (row) => `${row.rfmScore} - ${row.rfmSegment}`, (row) => row.rfmScore),
              column<ClientLifecycleRow>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
            ]}
          />
        </div>
      </article>
    </div>
  );
}

function ProductsSection({
  snapshot,
  onOpenDetail,
}: {
  snapshot: CommercialDashboardSnapshot;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  return (
    <div className="reports-grid">
      <article className="panel reports-hero-card">
        <div className="panel-header">
          <strong>Análisis de productos</strong>
          <span>Venta, margen, matriz de rentabilidad y señales de deterioro</span>
        </div>
        <div className="reports-panel-body">
          <div className="policy-card-quick-facts">
            <span>Alta venta / alto margen: {snapshot.products.matrix.alta_venta_alto_margen}</span>
            <span>Alta venta / bajo margen: {snapshot.products.matrix.alta_venta_bajo_margen}</span>
            <span>Baja venta / alto margen: {snapshot.products.matrix.baja_venta_alto_margen}</span>
            <span>Baja venta / bajo margen: {snapshot.products.matrix.baja_venta_bajo_margen}</span>
          </div>
          <div className="header-actions">
            <button type="button" className="secondary-button" onClick={() => onOpenDetail('negativeMarginProducts')}>
              Productos con margen negativo
            </button>
          </div>
        </div>
      </article>

      <ProductTablePanel title="Productos más vendidos del período" rows={snapshot.products.topByUnits} />
      <ProductTablePanel title="Top por facturación" rows={snapshot.products.topByRevenue} />
      <ProductTablePanel title="Top por margen" rows={snapshot.products.topByMargin} />
      <ProductTablePanel title="Alta facturación y bajo margen" rows={snapshot.products.highRevenueLowMargin} />
      {snapshot.sellers.categoryBreakdown.map((category) => (
        <SellerCategoryRankingPanel key={category.categoryName} category={category} />
      ))}
    </div>
  );
}

function SellersSection({
  snapshot,
  onOpenDetail,
}: {
  snapshot: CommercialDashboardSnapshot;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  return (
    <div className="reports-grid">
      <article className="panel reports-hero-card">
        <div className="panel-header">
          <strong>Ranking de vendedores</strong>
          <span>Facturación, margen, conversión, captación y ranking compuesto configurable</span>
        </div>
        <div className="reports-panel-body">
          <div className="header-actions">
            <button type="button" className="secondary-button" onClick={() => onOpenDetail('lowConversionSellers')}>
              Vendedores con baja conversión
            </button>
          </div>
        </div>
      </article>

      <SellerRankingTablePanel
        title="Ranking por facturación"
        subtitle="Vendedor y total facturado sin impuestos publicado en Contabilidad"
        rows={snapshot.sellers.rankingByRevenue}
        variant="revenue"
      />
      <SellerRankingTablePanel
        title="Ranking por margen"
        subtitle="Vendedor y margen bruto generado"
        rows={snapshot.sellers.rankingByMargin}
        variant="margin"
      />
      <SellerRankingTablePanel
        title="Ranking por conversión"
        subtitle="Vendedor y porcentaje de cierre comercial"
        rows={snapshot.sellers.rankingByConversion}
        variant="conversion"
      />
      <SellerRankingTablePanel
        title="Ranking compuesto"
        subtitle="Vendedor y score ponderado con la configuración actual"
        rows={snapshot.sellers.weightedRanking}
        variant="weightedScore"
      />
    </div>
  );
}

function ParetoSection({ snapshot }: { snapshot: CommercialDashboardSnapshot }) {
  return (
    <div className="reports-grid">
      <ParetoTablePanel summary={snapshot.pareto.customers} />
      <ParetoTablePanel summary={snapshot.pareto.products} />
      <ParetoTablePanel summary={snapshot.pareto.sellers} />
    </div>
  );
}

function DetailsSection({
  dataset,
  selectedDetailKey,
  snapshot,
  onChangeDetail,
}: {
  dataset: OdooCommercialDataset;
  selectedDetailKey: DetailKey;
  snapshot: CommercialDashboardSnapshot;
  onChangeDetail: (detailKey: DetailKey) => void;
}) {
  const detailTabs: Array<{ key: DetailKey; label: string }> = [
    { key: 'pendingQuotes', label: 'Cotizaciones pendientes' },
    { key: 'expiredQuotes', label: 'Cotizaciones vencidas' },
    { key: 'cancelledQuotes', label: 'Cotizaciones canceladas' },
    { key: 'convertedQuotes', label: 'Cotizaciones convertidas' },
    { key: 'confirmedOrders', label: 'Órdenes de venta' },
    { key: 'postedInvoices', label: 'Facturas publicadas' },
    { key: 'atRiskClients', label: 'Clientes en riesgo' },
    { key: 'negativeMarginProducts', label: 'Productos con margen negativo' },
    { key: 'lowConversionSellers', label: 'Vendedores con baja conversión' },
  ];

  const currentRows = snapshot.details[selectedDetailKey];

  return (
    <article className="panel reports-hero-card">
      <div className="panel-header">
        <strong>Detalle analítico y navegación a registros</strong>
        <span>Abre el subconjunto de registros relacionado con cada hallazgo o indicador</span>
      </div>
      <div className="reports-panel-body">
        <div className="policy-card-quick-facts">
          {detailTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={selectedDetailKey === tab.key ? 'secondary-button' : 'ghost-button'}
              onClick={() => onChangeDetail(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {renderDetailTable(dataset, selectedDetailKey, currentRows)}
      </div>
    </article>
  );
}

const legacyReportsLayoutReference = {
  ExecutiveSection,
  ConversionSection,
  ClientsSection,
  ProductsSection,
  SellersSection,
  ParetoSection,
  DetailsSection,
  buildFiltersSummary,
  formatMetricChange,
};

void legacyReportsLayoutReference;

function renderDetailTable(
  dataset: OdooCommercialDataset,
  selectedDetailKey: DetailKey,
  rows:
    | OdooOrderRecord[]
    | OdooInvoiceRecord[]
    | ClientLifecycleRow[]
    | ProductAnalysisRow[]
    | SellerPerformanceRow[],
) {
  if (
    selectedDetailKey === 'pendingQuotes' ||
    selectedDetailKey === 'expiredQuotes' ||
    selectedDetailKey === 'cancelledQuotes' ||
    selectedDetailKey === 'convertedQuotes' ||
    selectedDetailKey === 'confirmedOrders'
  ) {
    const orderRows = rows as OdooOrderRecord[];
    return (
        <DataTable
          rows={orderRows}
          storageKey={`detail-${selectedDetailKey}`}
          columns={[
          column<OdooOrderRecord>(
            'name',
            'Documento',
            (row) => renderOdooLink(dataset, 'sale.order', row.id, row.name),
            (row) => row.name,
          ),
          column<OdooOrderRecord>('state', 'Estado', (row) => row.state, (row) => row.state),
          column<OdooOrderRecord>('customer', 'Cliente', (row) => row.customerName, (row) => row.customerName),
          column<OdooOrderRecord>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
          column<OdooOrderRecord>('quotation', 'Fecha de cotización', (row) => formatDate(row.quotationDate), (row) => row.quotationDate ?? ''),
          column<OdooOrderRecord>('confirmation', 'Fecha de confirmación', (row) => formatDate(row.confirmationDate), (row) => row.confirmationDate ?? ''),
          column<OdooOrderRecord>('amount', 'Importe', (row) => formatCurrency(row.amountUntaxed), (row) => row.amountUntaxed),
        ]}
      />
    );
  }

  if (selectedDetailKey === 'postedInvoices') {
    const invoiceRows = rows as OdooInvoiceRecord[];
    return (
        <DataTable
          rows={invoiceRows}
          storageKey="detail-postedInvoices"
          columns={[
          column<OdooInvoiceRecord>(
            'name',
            'Factura',
            (row) => renderOdooLink(dataset, 'account.move', row.id, row.name),
            (row) => row.name,
          ),
          column<OdooInvoiceRecord>('type', 'Tipo', (row) => row.moveType, (row) => row.moveType),
          column<OdooInvoiceRecord>('customer', 'Cliente', (row) => row.customerName, (row) => row.customerName),
          column<OdooInvoiceRecord>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
          column<OdooInvoiceRecord>('date', 'Fecha', (row) => formatDate(row.invoiceDate), (row) => row.invoiceDate ?? ''),
          column<OdooInvoiceRecord>('amount', 'Importe', (row) => formatCurrency(row.untaxedAmountSigned), (row) => row.untaxedAmountSigned),
          column<OdooInvoiceRecord>('payment', 'Pago', (row) => row.paymentState ?? '-', (row) => row.paymentState ?? ''),
        ]}
      />
    );
  }

  if (
    selectedDetailKey === 'atRiskClients' ||
    selectedDetailKey === 'dormantClients' ||
    selectedDetailKey === 'lostClients' ||
    selectedDetailKey === 'reactivatedClients'
  ) {
    const clientRows = rows as ClientLifecycleRow[];
    return (
      <DataTable
        rows={clientRows}
        storageKey={`detail-${selectedDetailKey}`}
        columns={[
          column<ClientLifecycleRow>('customer', 'Cliente', (row) => row.customerName, (row) => row.customerName),
          column<ClientLifecycleRow>('status', 'Estado', (row) => renderStatusPill(row.currentStatus, row.riskLevel), (row) => row.currentStatus),
          column<ClientLifecycleRow>('revenue', 'Facturación', (row) => formatCurrency(row.revenue), (row) => row.revenue),
          column<ClientLifecycleRow>('margin', 'Margen', (row) => formatCurrency(row.margin), (row) => row.margin),
          column<ClientLifecycleRow>('days', 'Días sin compra', (row) => formatNullableNumber(row.daysSinceLastPurchase), (row) => row.daysSinceLastPurchase ?? 0),
          column<ClientLifecycleRow>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
        ]}
      />
    );
  }

  if (selectedDetailKey === 'negativeMarginProducts') {
    const productRows = rows as ProductAnalysisRow[];
    return (
      <ProductTable rows={productRows} storageKey="detail-negativeMarginProducts" />
    );
  }

  const sellerRows = rows as SellerPerformanceRow[];
  return <SellerTable rows={sellerRows} storageKey="detail-lowConversionSellers" />;
}

function ReportsTopBar({
  isRefreshing,
  notificationCenter,
  onOpenSettings,
  onRefresh,
  updatedLabel,
}: {
  isRefreshing: boolean;
  notificationCenter?: ReactNode;
  onOpenSettings: () => void;
  onRefresh: () => void;
  updatedLabel: string;
}) {
  return (
    <header className="reports-topbar">
      <div>
        <h1>Reportes de ventas</h1>
        <p>Análisis comercial y de desempeño</p>
      </div>
      <div className="reports-topbar-actions">
        {notificationCenter}
        <button type="button" className="reports-refresh-status" onClick={onRefresh}>
          <RefreshCcw size={15} className={isRefreshing ? 'is-spinning' : undefined} />
          <span>{updatedLabel}</span>
        </button>
        <button
          type="button"
          className="reports-topbar-icon"
          aria-label="Más opciones"
          onClick={onOpenSettings}
        >
          <MoreVertical size={18} />
        </button>
      </div>
    </header>
  );
}

function AgentNotificationsCenter({
  notifications,
  onDismiss,
  onDismissMany,
  onRead,
  onReadAll,
}: {
  notifications: SalesAgentNotification[];
  onDismiss: (id: string) => Promise<void>;
  onDismissMany: (ids: string[]) => Promise<void>;
  onRead: (id: string) => Promise<void>;
  onReadAll: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const visibleSelectedIds = notifications
    .filter((notification) => selectedIds.has(notification.id))
    .map((notification) => notification.id);
  const allSelected = notifications.length > 0 && visibleSelectedIds.length === notifications.length;

  const runNotificationAction = async (key: string, action: () => Promise<void>) => {
    setPendingAction(key);
    try {
      await action();
    } finally {
      setPendingAction(null);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSelection = () => {
    setSelectedIds((current) => {
      if (allSelected) return new Set();
      const next = new Set(current);
      notifications.forEach((notification) => next.add(notification.id));
      return next;
    });
  };

  const dismissSelected = async () => {
    if (!visibleSelectedIds.length) return;
    await onDismissMany(visibleSelectedIds);
    setSelectedIds(new Set());
  };

  return (
    <div className="sales-notification-center">
      <button
        type="button"
        className="reports-topbar-icon sales-notification-trigger"
        aria-label={`Notificaciones comerciales${unreadCount ? `, ${unreadCount} sin leer` : ''}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Bell size={17} />
        {unreadCount ? <span>{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
      </button>
      {isOpen ? (
        <section className="sales-notification-menu">
          <header>
            <div>
              <strong>Oportunidades de seguimiento</strong>
              <span>Prioridades detectadas en tu información comercial</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Cerrar notificaciones"
              onClick={() => setIsOpen(false)}
            >
              <X size={15} />
            </button>
          </header>
          {notifications.length ? (
            <div className="sales-notification-toolbar">
              <button
                type="button"
                onClick={() => void runNotificationAction('read-all', onReadAll)}
                disabled={!unreadCount || pendingAction !== null}
              >
                <CheckCheck size={14} />
                Marcar todas como leídas
              </button>
              <button
                type="button"
                onClick={toggleAllSelection}
                disabled={pendingAction !== null}
              >
                {allSelected ? 'Quitar selección' : 'Seleccionar todas'}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void runNotificationAction('dismiss-selected', dismissSelected)}
                disabled={!visibleSelectedIds.length || pendingAction !== null}
              >
                <Trash2 size={14} />
                Eliminar seleccionadas
              </button>
            </div>
          ) : null}
          <div className="sales-notification-list">
            {notifications.length ? notifications.map((notification) => (
              <article
                key={notification.id}
                className={`sales-notification-item severity-${notification.severity}${notification.is_read ? ' is-read' : ''}`}
              >
                <div className="sales-notification-item-head">
                  <label className="sales-notification-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(notification.id)}
                      onChange={() => toggleSelection(notification.id)}
                    />
                    <span>{notification.is_read ? 'Revisada' : 'Nueva'}</span>
                  </label>
                  <span>{notification.severity === 'critical' ? 'Prioridad alta' : notification.severity === 'warning' ? 'Atención' : 'Oportunidad'}</span>
                  <button
                    type="button"
                    aria-label={`Eliminar ${notification.title}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runNotificationAction(notification.id, () => onDismiss(notification.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
                <small>{notification.recommendation}</small>
                {!notification.is_read ? (
                  <button
                    type="button"
                    className="sales-notification-read"
                    disabled={pendingAction !== null}
                    onClick={() => void runNotificationAction(notification.id, () => onRead(notification.id))}
                  >
                    Marcar como leída
                  </button>
                ) : null}
              </article>
            )) : (
              <div className="sales-notification-empty">
                <CheckCircle2 size={22} />
                <strong>Sin alertas pendientes</strong>
                <span>Tu cartera no presenta prioridades nuevas con los filtros actuales.</span>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReportsMetricDeck({
  filters,
  metrics,
  onOpenDetail,
}: {
  filters: ReportFilters;
  metrics: ExecutiveMetric[];
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const metricMap = new Map(metrics.map((metric) => [metric.id, metric]));
  const previousRange = buildPreviousPeriodRange(filters);
  const previousLabel = formatReferenceComparisonRange(previousRange.startDate, previousRange.endDate);
  const cards = [
    {
      id: 'quotes_count',
      title: 'Cotizaciones',
      icon: <FileText size={22} />,
      tone: 'blue',
    },
    {
      id: 'confirmed_sales',
      title: 'Órdenes',
      icon: <ShoppingCart size={22} />,
      tone: 'sky',
    },
    {
      id: 'average_ticket',
      title: 'Ticket promedio',
      icon: <DollarSign size={22} />,
      tone: 'blue',
    },
    {
      id: 'conversion',
      title: 'Conversión comercial',
      icon: <Target size={22} />,
      tone: 'sky',
    },
    {
      id: 'invoiced',
      title: 'Facturas publicadas',
      icon: <FileText size={22} />,
      tone: 'amber',
    },
    {
      id: 'margin',
      title: 'Total sin impuestos',
      icon: <PieChart size={22} />,
      tone: 'mint',
    },
  ] as const;

  return (
    <div className="reports-kpi-reference-grid">
      {cards.map((card) => {
        const metric = metricMap.get(card.id);
        if (!metric) return null;

        return (
          <article
            key={card.id}
            className={`reports-kpi-reference-card tone-${card.tone}${flippedCardId === card.id ? ' is-flipped' : ''}`}
          >
            <div className="reports-kpi-reference-inner">
              <button
                type="button"
                className="reports-kpi-reference-face reports-kpi-reference-front"
                onClick={() =>
                  setFlippedCardId((current) => (current === card.id ? null : card.id))
                }
              >
                <div className="reports-kpi-reference-head">
                  <div className="reports-kpi-reference-title">
                    <span>{card.title}</span>
                    <Info size={14} />
                  </div>
                  <span className="reports-kpi-reference-icon">{card.icon}</span>
                </div>
                <strong>{metric.formattedCurrent}</strong>
                <small className={`reports-kpi-reference-change trend-${metric.comparison.trend}`}>
                  {formatMetricChangeChip(metric.comparison)} <span>vs. {previousLabel}</span>
                </small>
                <span className="reports-kpi-reference-cta">
                  Haz clic para ver qué significa
                  <ChevronRight size={14} />
                </span>
              </button>

              <div className="reports-kpi-reference-face reports-kpi-reference-back">
                <strong>{card.title}</strong>
                <p>{metric.definition}</p>
                <div className="reports-kpi-reference-back-actions">
                  {metric.detailKey ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onOpenDetail(metric.detailKey as DetailKey)}
                    >
                      Abrir detalle
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="secondary-button reports-kpi-reference-return"
                    onClick={() => setFlippedCardId(null)}
                  >
                    Volver al indicador
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

type AgentProfileSectionKey =
  | 'summary'
  | 'conversion'
  | 'clients'
  | 'products'
  | 'sales'
  | 'pareto';

const agentProfileSectionMeta: Record<
  AgentProfileSectionKey,
  {
    title: string;
    description: string;
    rowsTitle: string;
    rowLabel: string;
    rowFormat: AgentMetricFormat;
  }
> = {
  summary: {
    title: 'Mi resumen comercial',
    description:
      'Una lectura personal de resultados, ritmo de venta y señales que requieren acción inmediata.',
    rowsTitle: 'Clientes que impulsan o frenan el resultado',
    rowLabel: 'Cliente',
    rowFormat: 'currency',
  },
  conversion: {
    title: 'Mi conversión comercial',
    description:
      'Compara la capacidad de convertir cotizaciones en facturación frente al mismo periodo del año anterior.',
    rowsTitle: 'Conversión comparada por cliente',
    rowLabel: 'Cliente',
    rowFormat: 'percent',
  },
  clients: {
    title: 'Mi cartera de clientes',
    description:
      'Identifica captación, retención, reactivación, riesgo y cambios de facturación dentro de tu cartera.',
    rowsTitle: 'Crecimiento y deterioro por cliente',
    rowLabel: 'Cliente',
    rowFormat: 'currency',
  },
  products: {
    title: 'Mis productos',
    description:
      'Muestra qué productos ganaron tracción, cuáles retrocedieron y cómo cambió tu mezcla comercial.',
    rowsTitle: 'Comparativo de facturación por producto',
    rowLabel: 'Producto',
    rowFormat: 'currency',
  },
  sales: {
    title: 'Mis ventas',
    description:
      'Concentra facturación, órdenes, ticket y desempeño por categoría para explicar tu resultado.',
    rowsTitle: 'Comparativo de ventas por categoría',
    rowLabel: 'Categoría',
    rowFormat: 'currency',
  },
  pareto: {
    title: 'Mi concentración comercial',
    description:
      'Detecta cuánto dependes de pocos clientes o productos y dónde conviene diversificar.',
    rowsTitle: 'Elementos que concentran el resultado',
    rowLabel: 'Elemento',
    rowFormat: 'currency',
  },
};

function AgentProfileSection({
  profile,
  section,
  snapshot,
}: {
  profile: AgentPerformanceProfile;
  section: AgentProfileSectionKey;
  snapshot: CommercialDashboardSnapshot;
}) {
  const analysis = profile[section] as AgentYearSection;
  const meta = agentProfileSectionMeta[section];
  const [selectedMetric, setSelectedMetric] = useState<AgentYearSection['metrics'][number] | null>(null);
  const performanceScore = buildAgentPerformanceScore(profile);
  const report =
    section === 'summary'
      ? buildAgentComprehensiveReport(snapshot, performanceScore)
      : buildAgentProfileSectionReport(snapshot, section);
  const columns: Array<TableColumn<AgentYearDimensionRow>> = [
    column<AgentYearDimensionRow>(
      'label',
      meta.rowLabel,
      (row) => row.label,
      (row) => row.label,
    ),
    column<AgentYearDimensionRow>(
      'current',
      'Periodo actual',
      (row) => formatAgentDimensionValue(row.current, meta.rowFormat),
      (row) => row.current,
    ),
    column<AgentYearDimensionRow>(
      'previous',
      'Mismo periodo año anterior',
      (row) => formatAgentDimensionValue(row.previous, meta.rowFormat),
      (row) => row.previous,
    ),
    column<AgentYearDimensionRow>(
      'change',
      'Variación',
      (row) => renderAgentChange(row.differencePct, row.difference),
      (row) => row.differencePct ?? row.difference,
    ),
  ];
  if (section !== 'conversion') {
    columns.push(
      column<AgentYearDimensionRow>(
        'share',
        'Participación actual',
        (row) => formatPercent(row.currentSharePct),
        (row) => row.currentSharePct,
      ),
    );
  }

  return (
    <div className="reports-stack agent-profile-dashboard">
      <section className="agent-profile-hero">
        <div>
          <span className="agent-profile-badge">Perfil personal de ventas</span>
          <h3>{meta.title}</h3>
          <p>{meta.description}</p>
        </div>
        <div className="agent-profile-hero-side">
          <AgentPerformanceScoreSummary score={performanceScore} />
          <SectionReportActions report={report} />
        </div>
        <div className="agent-profile-identity">
          <span>
            <UserRound size={16} />
            {profile.sellerName}
          </span>
          <span>
            <Boxes size={16} />
            {profile.companyName}
          </span>
        </div>
        <div className="agent-profile-periods">
          <div>
            <small>Periodo analizado</small>
            <strong>{profile.currentPeriodLabel}</strong>
          </div>
          <div>
            <small>{profile.comparisonContext}</small>
            <strong>{profile.previousYearPeriodLabel}</strong>
          </div>
        </div>
      </section>

      {section === 'summary' ? <AgentPerformanceScoreCard score={performanceScore} /> : null}

      <AgentMetricDeck
        comparisonLabel={profile.comparisonContext}
        metrics={analysis.metrics}
        onOpenMetric={setSelectedMetric}
      />

      {selectedMetric ? (
        <StaticPanel
          title={`Detalle de ${selectedMetric.label}`}
          subtitle={`${profile.currentPeriodLabel} frente a ${profile.previousYearPeriodLabel}`}
        >
          <div className="policy-card-quick-facts">
            <span>Actual: {formatAgentMetricValueUi(selectedMetric.comparison.current, selectedMetric.format)}</span>
            <span>Anterior: {formatAgentMetricValueUi(selectedMetric.comparison.previous, selectedMetric.format)}</span>
            <span>Variación: {formatAgentComparisonDelta(selectedMetric.comparison)}</span>
          </div>
          {analysis.rows.length ? (
            <DataTable
              rows={analysis.rows}
              storageKey={`agent-${section}-${selectedMetric.id}-detail`}
              columns={columns}
            />
          ) : (
            <EmptyState title="Sin detalle disponible">
              No hay registros suficientes para abrir un detalle de este indicador.
            </EmptyState>
          )}
        </StaticPanel>
      ) : null}

      {section === 'summary' ? (
        <StaticPanel
          title="Evolución contra el año anterior"
          subtitle="La línea comparativa respeta exactamente las mismas fechas del periodo seleccionado"
        >
          <TrendPanel points={snapshot.trend} />
        </StaticPanel>
      ) : null}

      <section className="agent-insight-grid">
        <article className="agent-insight-column positive">
          <header>
            <CheckCircle2 size={20} />
            <div>
              <strong>Lo más positivo</strong>
              <span>Señales que conviene sostener o escalar</span>
            </div>
          </header>
          {analysis.positives.map((insight) => (
            <div key={insight.id} className={`agent-insight-item tone-${insight.tone}`}>
              <TrendingUp size={17} />
              <div>
                <strong>{insight.title}</strong>
                <p>{insight.detail}</p>
              </div>
            </div>
          ))}
        </article>

        <article className="agent-insight-column attention">
          <header>
            <CircleAlert size={20} />
            <div>
              <strong>Áreas de atención</strong>
              <span>Retrocesos o riesgos que necesitan seguimiento</span>
            </div>
          </header>
          {analysis.attention.map((insight) => (
            <div key={insight.id} className={`agent-insight-item tone-${insight.tone}`}>
              <TrendingDown size={17} />
              <div>
                <strong>{insight.title}</strong>
                <p>{insight.detail}</p>
              </div>
            </div>
          ))}
        </article>
      </section>

      <StaticPanel
        title={meta.rowsTitle}
        subtitle={`${profile.currentPeriodLabel} frente a ${profile.previousYearPeriodLabel}`}
      >
        {analysis.rows.length ? (
          <DataTable
            rows={analysis.rows}
            storageKey={`agent-${section}-year-comparison`}
            columns={columns}
          />
        ) : (
          <EmptyState title="Sin datos comparables">
            No hay registros suficientes en alguno de los dos periodos para construir esta comparación.
          </EmptyState>
        )}
      </StaticPanel>
    </div>
  );
}

function AgentMetricDeck({
  comparisonLabel,
  metrics,
  onOpenMetric,
}: {
  comparisonLabel: string;
  metrics: AgentYearSection['metrics'];
  onOpenMetric: (metric: AgentYearSection['metrics'][number]) => void;
}) {
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);

  return (
    <section className="reports-kpi-reference-grid agent-year-kpi-reference-grid" aria-label="Indicadores comparativos">
      {metrics.map((metric) => {
        const tone = getAgentReferenceMetricTone(metric);
        return (
          <article
            key={metric.id}
            className={`reports-kpi-reference-card agent-year-kpi-reference-card tone-${tone}${flippedCardId === metric.id ? ' is-flipped' : ''}`}
          >
            <div className="reports-kpi-reference-inner">
              <button
                type="button"
                className="reports-kpi-reference-face reports-kpi-reference-front"
                onClick={() => setFlippedCardId((current) => (current === metric.id ? null : metric.id))}
              >
                <div className="reports-kpi-reference-head">
                  <div className="reports-kpi-reference-title">
                    <span>{metric.label}</span>
                    <Info size={14} />
                  </div>
                  <span className="reports-kpi-reference-icon">{getAgentMetricIcon(metric)}</span>
                </div>
                <strong>{formatAgentMetricValueUi(metric.comparison.current, metric.format)}</strong>
                <small className={`reports-kpi-reference-change trend-${metric.comparison.trend}`}>
                  {formatAgentComparisonDelta(metric.comparison)} <span>vs. {comparisonLabel}</span>
                </small>
                <span className="reports-kpi-reference-cta">
                  Haz clic para ver qué significa
                  <ChevronRight size={14} />
                </span>
              </button>

              <div className="reports-kpi-reference-face reports-kpi-reference-back">
                <strong>{metric.label}</strong>
                <p>{getAgentMetricDefinition(metric)}</p>
                <div className="reports-kpi-reference-back-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onOpenMetric(metric)}
                  >
                    Abrir detalle
                  </button>
                  <button
                    type="button"
                    className="secondary-button reports-kpi-reference-return"
                    onClick={() => setFlippedCardId(null)}
                  >
                    Volver al indicador
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function AgentPerformanceScoreCard({ score }: { score: AgentPerformanceScore }) {
  return (
    <section className="agent-performance-score">
      <div
        className="agent-performance-score-ring"
        style={{ '--agent-score': `${score.total * 3.6}deg` } as CSSProperties}
        aria-label={`Calificación comercial ${score.total} de 100`}
      >
        <div>
          <strong>{score.total}</strong>
          <span>de 100</span>
        </div>
      </div>
      <div className="agent-performance-score-copy">
        <span>Calificación de desempeño comercial</span>
        <h3>{score.rating}</h3>
        <p>{score.summary}</p>
        <small>{score.methodologyNote}</small>
      </div>
      <div className="agent-performance-score-dimensions">
        {score.dimensions.map((dimension) => (
          <div key={dimension.id}>
            <span>
              {dimension.label}
              <b>{dimension.score}</b>
            </span>
            <i><em style={{ width: `${dimension.score}%` }} /></i>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentPerformanceScoreSummary({ score }: { score: AgentPerformanceScore }) {
  return (
    <aside className="agent-performance-score-summary">
      <div
        className="agent-performance-score-summary-ring"
        style={{ '--agent-score': `${score.total * 3.6}deg` } as CSSProperties}
        aria-label={`Calificación global del periodo ${score.total} de 100`}
      >
        <strong>{score.total}</strong>
      </div>
      <div>
        <span>Calificación global del periodo</span>
        <strong>{score.total}/100</strong>
        <small>{score.rating}</small>
      </div>
    </aside>
  );
}

function getAgentMetricTone(metric: AgentYearSection['metrics'][number]) {
  if (metric.comparison.difference === 0 || metric.lowerIsBetter === null) return 'neutral';
  const favorable =
    metric.lowerIsBetter
      ? metric.comparison.difference < 0
      : metric.comparison.difference > 0;
  return favorable ? 'positive' : 'attention';
}

function getAgentReferenceMetricTone(metric: AgentYearSection['metrics'][number]) {
  const tone = getAgentMetricTone(metric);
  if (tone === 'attention') return 'amber';
  if (metric.format === 'currency') return 'mint';
  if (metric.format === 'percent') return 'sky';
  return 'blue';
}

function getAgentMetricIcon(metric: AgentYearSection['metrics'][number]) {
  if (metric.id.includes('quote')) return <FileText size={22} />;
  if (metric.id.includes('order')) return <ShoppingCart size={22} />;
  if (metric.id.includes('ticket') || metric.id.includes('revenue') || metric.id.includes('refund')) {
    return <DollarSign size={22} />;
  }
  if (metric.id.includes('conversion') || metric.id.includes('retention') || metric.id.includes('repurchase')) {
    return <Target size={22} />;
  }
  if (metric.id.includes('product') || metric.id.includes('unit')) return <Boxes size={22} />;
  if (metric.id.includes('client') || metric.id.includes('customer')) return <Users size={22} />;
  if (metric.id.includes('invoice')) return <FileText size={22} />;
  return <PieChart size={22} />;
}

function getAgentMetricDefinition(metric: AgentYearSection['metrics'][number]) {
  const definitions: Record<string, string> = {
    quotes: 'Cotizaciones creadas en Ventas durante el período seleccionado, filtradas para este vendedor.',
    revenue: 'Total sin impuestos neto tomado de Contabilidad > Análisis de facturas, incluyendo facturas y notas de crédito publicadas.',
    billed_orders: 'Órdenes de venta confirmadas del período, filtradas por este vendedor.',
    average_ticket: 'Total sin impuestos neto dividido entre pedidos únicos facturados del período.',
    conversion: 'Cotizaciones del período que terminaron en facturación publicada frente al total de cotizaciones evaluables.',
    invoice_count: 'Número de documentos contables publicados del período, incluyendo facturas de cliente y notas de crédito.',
    new_customers: 'Clientes cuya primera compra histórica ocurre dentro del período analizado.',
    refunds: 'Notas de crédito publicadas del período. Se muestran como indicador separado y también reducen el total neto facturado.',
    product_revenue: 'Total sin impuestos por productos facturados en Contabilidad para este vendedor.',
    units: 'Unidades netas facturadas; las notas de crédito descuentan unidades cuando corresponda.',
    active_products: 'Productos con facturación neta distinta de cero en el período.',
    average_product_revenue: 'Promedio de facturación neta por producto activo.',
    sales_revenue: 'Total sin impuestos neto para explicar ventas por categoría y mezcla comercial.',
    sales_orders: 'Órdenes de venta confirmadas para este vendedor dentro del período.',
    sales_ticket: 'Total sin impuestos neto dividido entre pedidos únicos facturados del período.',
    sales_refunds: 'Importe de notas de crédito publicadas asociado al vendedor.',
    invoice_count_sales: 'Documentos contables publicados asociados al vendedor.',
  };

  return definitions[metric.id] ?? 'Indicador comparativo del vendedor frente al mismo período del año anterior, respetando filtros de fecha, vendedor y compañía.';
}

function formatAgentMetricValueUi(value: number, format: AgentMetricFormat) {
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percent') return formatPercent(value);
  if (format === 'days') return `${value.toFixed(1)} días`;
  return formatNumber(value);
}

function formatAgentDimensionValue(value: number, format: AgentMetricFormat) {
  return formatAgentMetricValueUi(value, format);
}

function formatAgentComparisonDelta(comparison: ExecutiveMetric['comparison']) {
  if (comparison.differencePct === null) {
    return comparison.current === 0 ? 'Sin cambio' : 'Sin base anterior';
  }
  return `${comparison.differencePct >= 0 ? '+' : ''}${comparison.differencePct.toFixed(1)}%`;
}

function renderAgentChange(differencePct: number | null, difference: number) {
  const tone = difference > 0 ? 'positive' : difference < 0 ? 'attention' : 'neutral';
  const label =
    differencePct === null
      ? difference === 0
        ? 'Sin cambio'
        : 'Sin base anterior'
      : `${differencePct >= 0 ? '+' : ''}${differencePct.toFixed(1)}%`;
  return <span className={`agent-table-change tone-${tone}`}>{label}</span>;
}

function ExecutiveSectionV2({
  hallazgos,
  snapshot,
  onOpenDetail,
}: {
  hallazgos: Hallazgo[];
  snapshot: CommercialDashboardSnapshot;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  const report = buildExecutiveSectionReport(snapshot, hallazgos);
  const previousRange = buildPreviousPeriodRange(snapshot.filters);
  const currentRangeLabel = formatReferenceComparisonRange(
    snapshot.filters.startDate,
    snapshot.filters.endDate,
  );
  const previousRangeLabel = formatReferenceComparisonRange(
    previousRange.startDate,
    previousRange.endDate,
  );

  return (
    <div className="reports-stack">
      <SectionReportActions report={report} />

      <AccordionPanel
        defaultOpen
        title="Evolución del período"
        subtitle={`Agrupación actual: ${groupingLabelEs(snapshot.filters.grouping)} y comparación contra el período anterior`}
      >
        <TrendPanel points={snapshot.trend} />
        <div className="reports-stack-compact">
          <SummaryChip
            label="Cotizaciones vencidas"
            value={formatNumber(snapshot.quoteSummary.expiredQuotes)}
            onClick={() => onOpenDetail('expiredQuotes')}
          />
          <SummaryChip
            label="Clientes en riesgo"
            value={formatNumber(snapshot.clientLifecycle.summary.atRiskCustomers)}
            onClick={() => onOpenDetail('atRiskClients')}
          />
          <SummaryChip
            label="Productos con margen negativo"
            value={formatNumber(snapshot.products.negativeMargin.length)}
            onClick={() => onOpenDetail('negativeMarginProducts')}
          />
        </div>
      </AccordionPanel>

      <AccordionPanel
        defaultOpen
        title="Lectura ejecutiva"
        subtitle="Qué está ocurriendo en ventas, facturación y rentabilidad"
      >
        <div className="reports-period-context">
          <span>
            <strong>PerÃ­odo analizado:</strong> {currentRangeLabel}
          </span>
          <span>
            <strong>ComparaciÃ³n:</strong> {previousRangeLabel}
          </span>
        </div>
        <div className="reports-stack-compact">
          <ComparisonRow label="Cotizaciones" comparison={snapshot.quoteSummary.totalQuotes} comparisonLabel={previousRangeLabel} formatter={formatNumber} />
          <ComparisonRow label="Conversión comercial" comparison={snapshot.conversion.overall} formatter={formatPercent} />
          <ComparisonRow label="Órdenes de venta" comparison={snapshot.sales.confirmedOrders} formatter={formatNumber} />
          <ComparisonRow label="Facturas publicadas" comparison={snapshot.invoicing.invoiceCount} formatter={formatNumber} />
          <ComparisonRow label="Total sin impuestos" comparison={snapshot.invoicing.invoicedAmount} formatter={formatCurrency} />
          <ComparisonRow label="Ticket promedio facturado" comparison={snapshot.sales.averageTicket} formatter={formatCurrency} />
          <ComparisonRow label="Clientes nuevos" comparison={snapshot.sales.newCustomers} formatter={formatNumber} />
        </div>
        <GaugePanel
          title="Margen comercial del período"
          value={snapshot.sales.marginPct.current}
          max={60}
          warning={12}
          good={24}
          description="Mide la rentabilidad del período con base en el margen bruto sobre la venta sin impuestos."
        />
      </AccordionPanel>

      <AccordionPanel
        title="Crecimiento vs año anterior"
        subtitle={`${snapshot.annualGrowth.currentLabel} comparado contra ${snapshot.annualGrowth.previousLabel}`}
      >
        <AnnualGrowthPanel growth={snapshot.annualGrowth} />
      </AccordionPanel>

      <HallazgosPanel hallazgos={hallazgos} onOpenDetail={onOpenDetail} />

      <AccordionPanel
        title="Enfoque inmediato"
        subtitle="Resumen puntual para priorizar seguimiento comercial"
      >
        <SectionInfoCard
          title="Clientes"
          description="Estados principales de la cartera para detectar riesgos y reactivaciones."
        >
          <div className="policy-card-quick-facts">
            <span>Nuevos: {formatNumber(snapshot.clientLifecycle.summary.newCustomers)}</span>
            <span>Activos: {formatNumber(snapshot.clientLifecycle.summary.activeCustomers)}</span>
            <span>En riesgo: {formatNumber(snapshot.clientLifecycle.summary.atRiskCustomers)}</span>
          </div>
        </SectionInfoCard>

        <SectionInfoCard
          title="Vendedores con mayor facturación"
          description="Ranking rápido para identificar quién sostiene el período actual."
        >
          <MiniRanking
            rows={snapshot.sellers.rankingByRevenue.slice(0, 5)}
            primary={(row) => row.sellerName}
            secondary={(row) => `${formatPercent(row.conversionPct)} de conversión`}
            value={(row) => formatCurrency(row.invoicedAmount)}
          />
        </SectionInfoCard>

        <SectionInfoCard
          title="Productos con mayor facturación"
          description="Productos que más aportan al valor vendido en el período."
        >
          <MiniRanking
            rows={snapshot.products.topByRevenue.slice(0, 5)}
            primary={(row) => row.productName}
            secondary={(row) => `${formatPercent(row.marginPct ?? 0)} de margen`}
            value={(row) => formatCurrency(row.revenue)}
          />
        </SectionInfoCard>
      </AccordionPanel>
    </div>
  );
}

function ConversionSectionV2({ snapshot }: { snapshot: CommercialDashboardSnapshot }) {
  const report = buildConversionSectionReport(snapshot);

  return (
    <div className="reports-stack">
      <SectionLead
        title="Conversión comercial"
        actions={<SectionReportActions report={report} />}
      />

      <AccordionPanel
        defaultOpen
        title="Resumen de conversión"
        subtitle="Numerador: órdenes confirmadas. Denominador: cotizaciones evaluables del período."
      >
        <div className="reports-kpi-list">
          <KpiBox label="Conversión general" value={formatPercent(snapshot.conversion.overall.current)} />
          <KpiBox label="Cotizaciones pendientes" value={formatNumber(snapshot.quoteSummary.pendingQuotes)} />
          <KpiBox label="Cotizaciones vencidas" value={formatNumber(snapshot.quoteSummary.expiredQuotes)} />
          <KpiBox
            label="Tiempo promedio de conversión"
            value={`${snapshot.quoteSummary.averageConversionDays.current.toFixed(1)} días`}
          />
        </div>
        <GaugePanel
          title="Nivel de conversión"
          value={snapshot.conversion.overall.current}
          max={100}
          warning={25}
          good={45}
          description="Indica qué tan eficientemente se convierten las cotizaciones en órdenes confirmadas."
        />
      </AccordionPanel>

      <AccordionPanel
        title="Lectura por mes"
        subtitle="Panorama rápido para ubicar dónde mejora o cae el cierre comercial"
      >
        <MiniRanking
          rows={snapshot.conversion.byMonth}
          primary={(row) => row.label}
          secondary={(row) => `${formatNumber(row.converted)} órdenes convertidas`}
          value={(row) => formatPercent(row.conversionPct)}
        />
      </AccordionPanel>

      <ConversionTablePanel title="Conversión por vendedor" rows={snapshot.conversion.bySeller} />
      <ConversionTablePanel title="Conversión por cliente" rows={snapshot.conversion.byCustomer.slice(0, 20)} />
      <ConversionTablePanel title="Conversión por equipo" rows={snapshot.conversion.byTeam} />
      <ConversionTablePanel title="Conversión por mes" rows={snapshot.conversion.byMonth} />
      <ConversionTablePanel title="Conversión por rango de importe" rows={snapshot.conversion.byRange} />
      <ConversionTablePanel title="Conversión por producto" rows={snapshot.conversion.byProduct} />
    </div>
  );
}

function ClientsSectionV2({
  snapshot,
  onOpenDetail,
}: {
  snapshot: CommercialDashboardSnapshot;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  const [selectedRfmSegment, setSelectedRfmSegment] = useState<string | null>(null);
  const activeRfmSegment = selectedRfmSegment ?? snapshot.clientLifecycle.rfmSegments[0]?.segment ?? null;
  const activeRfmRows = useMemo(
    () =>
      activeRfmSegment
        ? snapshot.clientLifecycle.rows.filter((row) => row.rfmSegment === activeRfmSegment)
        : [],
    [activeRfmSegment, snapshot.clientLifecycle.rows],
  );
  const activeRfmRevenue = activeRfmRows.reduce((total, row) => total + row.revenue, 0);
  const activeRfmMargin = activeRfmRows.reduce((total, row) => total + row.margin, 0);
  const report = buildClientsSectionReport(snapshot);

  return (
    <div className="reports-stack">
      <SectionLead
        title="Clientes"
        description="Clasifica la cartera por recencia, frecuencia, valor y señales de abandono o reactivación."
        actions={<SectionReportActions report={report} />}
      />

      <StaticPanel
        title="Estado de la cartera"
        subtitle="Estados ejecutivos basados en recencia y frecuencia histórica adaptativa de compra"
      >
        <div className="reports-kpi-list">
          <KpiBox label="Clientes nuevos" value={formatNumber(snapshot.clientLifecycle.summary.newCustomers)} />
          <KpiBox label="Clientes activos" value={formatNumber(snapshot.clientLifecycle.summary.activeCustomers)} />
          <KpiBox label="Clientes en riesgo" value={formatNumber(snapshot.clientLifecycle.summary.atRiskCustomers)} />
        </div>
        <GaugePanel
          title="Riesgo de abandono"
          value={snapshot.clientLifecycle.summary.churnRiskPct}
          max={100}
          warning={20}
          good={10}
          inverse
          description="Mientras más alto sea este indicador, mayor es la probabilidad de fuga de ingresos futuros."
        />
        <div className="policy-card-quick-facts">
          <span>Valor en riesgo: {formatCurrency(snapshot.clientLifecycle.summary.valueAtRisk)}</span>
          <span>Retención: {formatPercent(snapshot.clientLifecycle.summary.retentionPct)}</span>
        </div>
      </StaticPanel>

      <StaticPanel
        title="Segmentos RFM"
        subtitle="Haz clic en un segmento para ver clientes, estadísticas y vendedor responsable"
      >
        <div className="reports-chip-list">
          {snapshot.clientLifecycle.rfmSegments.map((segment) => (
            <button
              key={segment.segment}
              type="button"
              className={activeRfmSegment === segment.segment ? 'secondary-button' : 'ghost-button'}
              onClick={() => setSelectedRfmSegment(segment.segment)}
            >
              {segment.segment}: {formatNumber(segment.customers)}
            </button>
          ))}
        </div>
        {activeRfmSegment ? (
          <div className="reports-stack-compact">
            <div className="reports-kpi-list">
              <KpiBox label="Clientes del segmento" value={formatNumber(activeRfmRows.length)} />
              <KpiBox label="Facturación acumulada" value={formatCurrency(activeRfmRevenue)} />
              <KpiBox
                label="Ticket promedio"
                value={formatCurrency(activeRfmRows.length > 0 ? activeRfmRevenue / activeRfmRows.length : 0)}
              />
              <KpiBox label="Margen acumulado" value={formatCurrency(activeRfmMargin)} />
            </div>
            <DataTable
              rows={activeRfmRows}
              storageKey={`rfm-${activeRfmSegment}`}
              columns={[
                column<ClientLifecycleRow>('customer', 'Cliente', (row) => row.customerName, (row) => row.customerName),
                column<ClientLifecycleRow>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
                column<ClientLifecycleRow>('status', 'Estado', (row) => renderStatusPill(row.currentStatus, row.riskLevel), (row) => row.currentStatus),
                column<ClientLifecycleRow>('orders', 'Órdenes', (row) => formatNumber(row.totalOrders), (row) => row.totalOrders),
                column<ClientLifecycleRow>('revenue', 'Facturación', (row) => formatCurrency(row.revenue), (row) => row.revenue),
                column<ClientLifecycleRow>('ticket', 'Ticket promedio', (row) => formatCurrency(row.averageTicket), (row) => row.averageTicket),
                column<ClientLifecycleRow>('lastPurchase', 'Última compra', (row) => formatDate(row.lastPurchaseDate), (row) => row.lastPurchaseDate ?? ''),
              ]}
            />
          </div>
        ) : null}
      </StaticPanel>

      <StaticPanel
        title="Clientes a priorizar"
        subtitle="Acciones directas para seguimiento comercial"
      >
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={() => onOpenDetail('atRiskClients')}>
            Ver clientes en riesgo
          </button>
        </div>
        <DataTable
          rows={snapshot.clientLifecycle.rows.slice(0, 40)}
          storageKey="clients-v2"
          columns={[
            column<ClientLifecycleRow>('customer', 'Cliente', (row) => row.customerName, (row) => row.customerName),
            column<ClientLifecycleRow>('status', 'Estado', (row) => renderStatusPill(row.currentStatus, row.riskLevel), (row) => row.currentStatus),
            column<ClientLifecycleRow>('previous', 'Estado anterior', (row) => row.previousStatus ?? '-', (row) => row.previousStatus ?? ''),
            column<ClientLifecycleRow>('revenue', 'Facturación', (row) => formatCurrency(row.revenue), (row) => row.revenue),
            column<ClientLifecycleRow>('margin', 'Margen', (row) => formatCurrency(row.margin), (row) => row.margin),
            column<ClientLifecycleRow>('days', 'Días sin comprar', (row) => formatNullableNumber(row.daysSinceLastPurchase), (row) => row.daysSinceLastPurchase ?? 0),
            column<ClientLifecycleRow>('rfm', 'RFM', (row) => `${row.rfmScore} - ${row.rfmSegment}`, (row) => row.rfmScore),
            column<ClientLifecycleRow>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
          ]}
        />
      </StaticPanel>
    </div>
  );
}

function ProductsSectionV2({
  snapshot,
  onOpenDetail,
}: {
  snapshot: CommercialDashboardSnapshot;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  const report = buildProductsSectionReport(snapshot);

  return (
    <div className="reports-stack">
      <SectionLead
        title="Productos"
        description="Ubica qué productos venden, cuáles dejan mejor margen y dónde hay deterioro comercial."
        actions={<SectionReportActions report={report} />}
      />

      <StaticPanel
        title="Radar de rentabilidad"
        subtitle="Matriz ejecutiva para detectar combinaciones de volumen y rentabilidad"
      >
        <div className="policy-card-quick-facts">
          <span>Alta venta / alto margen: {snapshot.products.matrix.alta_venta_alto_margen}</span>
          <span>Alta venta / bajo margen: {snapshot.products.matrix.alta_venta_bajo_margen}</span>
          <span>Baja venta / alto margen: {snapshot.products.matrix.baja_venta_alto_margen}</span>
          <span>Baja venta / bajo margen: {snapshot.products.matrix.baja_venta_bajo_margen}</span>
        </div>
        <button type="button" className="secondary-button" onClick={() => onOpenDetail('negativeMarginProducts')}>
          Ver productos con margen negativo
        </button>
      </StaticPanel>

      <ProductTablePanel title="Productos más vendidos del período" rows={snapshot.products.topByUnits} />
      <ProductTablePanel title="Top por facturación" rows={snapshot.products.topByRevenue} />
      <ProductTablePanel title="Top por margen" rows={snapshot.products.topByMargin} />
      <ProductTablePanel title="Alta facturación y bajo margen" rows={snapshot.products.highRevenueLowMargin} />
      {snapshot.sellers.categoryBreakdown.map((category) => (
        <SellerCategoryRankingPanel key={category.categoryName} category={category} />
      ))}
    </div>
  );
}

function SellersSectionV2({
  snapshot,
  sectionLabel,
  onOpenDetail,
}: {
  snapshot: CommercialDashboardSnapshot;
  sectionLabel: string;
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  const lowConversionRows = snapshot.details.lowConversionSellers
    .slice()
    .sort((a, b) => a.conversionPct - b.conversionPct);
  const report = buildSellersSectionReport(snapshot);
  const [selectedTimeline, setSelectedTimeline] = useState<SellerTimelineSummary | null>(null);

  return (
    <div className="reports-stack">
      <SectionLead
        title={sectionLabel}
        description="Compara desempeño por valor vendido, margen, conversión, captación y peso por categoría de producto."
        actions={<SectionReportActions report={report} />}
      />

      <StaticPanel
        title="Vendedores con baja conversión"
        subtitle="Se muestran vendedores con menos de 50% de conversión y suficientes cotizaciones, ordenados del menor al mayor."
      >
        <button type="button" className="secondary-button" onClick={() => onOpenDetail('lowConversionSellers')}>
          Ver vendedores con baja conversión
        </button>
        {lowConversionRows.length > 0 ? (
          <MiniRanking
            rows={lowConversionRows}
            primary={(row) => row.sellerName}
            secondary={(row) => `${formatNumber(row.quotes)} cotizaciones · ${formatNumber(row.confirmedOrders)} órdenes`}
            value={(row) => formatPercent(row.conversionPct)}
          />
        ) : (
          <EmptyState title="Sin vendedores con baja conversión">
            No hay vendedores por debajo del 50% con el volumen mínimo de cotizaciones.
          </EmptyState>
        )}
      </StaticPanel>

      <StaticPanel
        title="Ventas por categoría de producto"
        subtitle="Muestra qué porcentaje de las ventas representa cada categoría y qué vendedores la sostienen."
      >
        {snapshot.sellers.categoryBreakdown.length > 0 ? (
          <div className="reports-stack-compact">
            <SellerCategoryMixPanel rows={snapshot.sellers.categoryBreakdown} />
            <SellerCategoryOverviewPanel rows={snapshot.sellers.categoryBreakdown} />
          </div>
        ) : (
          <EmptyState title="Sin ventas por categoría">
            No hay líneas confirmadas con categoría dentro del período seleccionado.
          </EmptyState>
        )}
      </StaticPanel>

      <StaticPanel
        title="Metas y seguimiento por vendedor"
        subtitle="Programa metas por vendedor y abre su evolución mes a mes comparada contra el año anterior."
      >
        <SellerGoalsOverviewPanel
          rows={snapshot.sellers.goalProgress}
          onViewSeller={(sellerName) =>
            setSelectedTimeline(
              snapshot.sellers.timelines.find((timeline) => timeline.sellerName === sellerName) ?? null,
            )
          }
        />
      </StaticPanel>

      <SellerRankingTablePanel
        title="Ranking por facturación"
        subtitle="Vendedor y total facturado sin impuestos publicado en Contabilidad"
        rows={snapshot.sellers.rankingByRevenue}
        variant="revenue"
      />
      <SellerRankingTablePanel
        title="Ranking por margen"
        subtitle="Vendedor y margen bruto generado"
        rows={snapshot.sellers.rankingByMargin}
        variant="margin"
      />
      <SellerRankingTablePanel
        title="Ranking por conversión"
        subtitle="Vendedor y porcentaje de cierre comercial"
        rows={snapshot.sellers.rankingByConversion}
        variant="conversion"
      />
      <SellerRankingTablePanel
        title="Ranking por clientes nuevos"
        subtitle="Vendedor y clientes captados en el período"
        rows={snapshot.sellers.rankingByNewCustomers}
        variant="newCustomers"
      />
      <SellerRankingTablePanel
        title="Ranking por clientes en riesgo"
        subtitle="Vendedor, clientes en riesgo y porcentaje sobre su cartera"
        rows={snapshot.sellers.rankingByAtRiskCustomers}
        variant="atRiskCustomers"
      />
      <SellerRankingTablePanel
        title="Ranking por clientes rescatados"
        subtitle="Vendedor y clientes reactivados durante el período"
        rows={snapshot.sellers.rankingByReactivatedCustomers}
        variant="reactivatedCustomers"
      />
      <SellerRankingTablePanel
        title="Ranking compuesto"
        subtitle="Vendedor y score ponderado con la configuración actual"
        rows={snapshot.sellers.weightedRanking}
        variant="weightedScore"
      />
      {selectedTimeline ? (
        <SellerTimelineModal seller={selectedTimeline} onClose={() => setSelectedTimeline(null)} />
      ) : null}
    </div>
  );
}

function PurchasesSection({ snapshot }: { snapshot: PurchaseDashboardSnapshot }) {
  const report = buildPurchasesSectionReport(snapshot);
  const previousRange = buildPreviousPeriodRange(snapshot.filters);
  const currentRangeLabel = formatReferenceComparisonRange(
    snapshot.filters.startDate,
    snapshot.filters.endDate,
  );
  const previousRangeLabel = formatReferenceComparisonRange(
    previousRange.startDate,
    previousRange.endDate,
  );
  const topProduct = snapshot.products.topBySpend[0] ?? null;
  const leastProduct = snapshot.products.leastBySpend[0] ?? null;
  const topSupplier = snapshot.suppliers.topBySpend[0] ?? null;
  const topBuyer = snapshot.buyers.topBySpend[0] ?? null;

  return (
    <div className="reports-stack">
      <SectionLead
        title="Compras"
        description="Concentra la lectura de abastecimiento para ver qué se compra, a quién se compra, quién compra y cómo cambia el gasto contra el período anterior."
        actions={<SectionReportActions report={report} />}
      />

      <StaticPanel
        title="Resumen de abastecimiento"
        subtitle={`${currentRangeLabel} comparado contra ${previousRangeLabel}`}
      >
        <div className="reports-kpi-list reports-kpi-list-roomy">
          <KpiBox label="Compra ordenada" value={formatCurrency(snapshot.summary.orderedAmount.current)} />
          <KpiBox label="Facturación proveedor" value={formatCurrency(snapshot.summary.billedAmount.current)} />
          <KpiBox label="Proveedores activos" value={formatNumber(snapshot.summary.supplierCount.current)} />
          <KpiBox label="Compradores activos" value={formatNumber(snapshot.summary.buyerCount.current)} />
          <KpiBox label="Orden promedio" value={formatCurrency(snapshot.summary.averageOrderValue.current)} />
          <KpiBox label="Notas de crédito" value={formatCurrency(snapshot.summary.refundAmount.current)} />
        </div>
        <div className="reports-kpi-list reports-kpi-list-roomy">
          <ComparisonRow label="Compra ordenada" comparison={snapshot.summary.orderedAmount} comparisonLabel={previousRangeLabel} formatter={formatCurrency} />
          <ComparisonRow label="Facturación proveedor" comparison={snapshot.summary.billedAmount} comparisonLabel={previousRangeLabel} formatter={formatCurrency} />
          <ComparisonRow label="Proveedores activos" comparison={snapshot.summary.supplierCount} comparisonLabel={previousRangeLabel} formatter={formatNumber} />
          <ComparisonRow label="Compradores activos" comparison={snapshot.summary.buyerCount} comparisonLabel={previousRangeLabel} formatter={formatNumber} />
        </div>
      </StaticPanel>

      <StaticPanel
        title="Evolución de compras"
        subtitle="Compara compras ordenadas, compras facturadas y el mismo período anterior en un solo vistazo"
      >
        <PurchaseTrendPanel points={snapshot.trend} />
      </StaticPanel>

      <StaticPanel
        title="Lectura inmediata"
        subtitle="Señales rápidas para ubicar concentración, categorías dominantes y focos de gasto"
      >
        <div className="reports-stack-compact">
          <SectionInfoCard
            title="Producto más comprado"
            description="Producto que más gasto facturado concentra dentro del período."
          >
            <MiniRanking
              rows={topProduct ? [topProduct] : []}
              primary={(row) => row.productName}
              secondary={(row) => `${row.categoryName || 'Sin categoría'} · ${formatPercent(row.spendSharePct)} del gasto`}
              value={(row) => formatCurrency(row.billedAmount)}
            />
          </SectionInfoCard>

          <SectionInfoCard
            title="Producto con menor compra"
            description="Producto con compra facturada más baja dentro de los registros visibles."
          >
            <MiniRanking
              rows={leastProduct ? [leastProduct] : []}
              primary={(row) => row.productName}
              secondary={(row) => `${row.categoryName || 'Sin categoría'} · ${formatNumber(row.billCount)} facturas`}
              value={(row) => formatCurrency(row.billedAmount)}
            />
          </SectionInfoCard>

          <SectionInfoCard
            title="Proveedor con mayor gasto"
            description="Proveedor que absorbe la mayor parte del gasto facturado en el período."
          >
            <MiniRanking
              rows={topSupplier ? [topSupplier] : []}
              primary={(row) => row.supplierName}
              secondary={(row) => `${formatPercent(row.spendSharePct)} del gasto · ${formatNumber(row.billCount)} facturas`}
              value={(row) => formatCurrency(row.billedAmount)}
            />
          </SectionInfoCard>

          <SectionInfoCard
            title="Comprador con mayor ejecución"
            description="Responsable interno con mayor gasto comprado o facturado visible."
          >
            <MiniRanking
              rows={topBuyer ? [topBuyer] : []}
              primary={(row) => row.buyerName}
              secondary={(row) => `${formatNumber(row.orderCount)} órdenes · ${formatNumber(row.supplierCount)} proveedores`}
              value={(row) => formatCurrency(row.billedAmount)}
            />
          </SectionInfoCard>
        </div>
      </StaticPanel>

      <StaticPanel
        title="Participación por categoría"
        subtitle="Muestra qué porcentaje del gasto representa cada categoría y cuánto se pidió u ordenó"
      >
        <PurchaseCategoryMixPanel rows={snapshot.categories.topBySpend} />
      </StaticPanel>

      <PurchaseProductsTablePanel
        title="Productos con mayor compra facturada"
        rows={snapshot.products.topBySpend}
      />
      <PurchaseProductsTablePanel
        title="Productos con menor compra facturada"
        rows={snapshot.products.leastBySpend}
      />
      <PurchaseProductsTablePanel
        title="Productos con mayor volumen comprado"
        rows={snapshot.products.topByQuantity}
      />
      <PurchaseSuppliersTablePanel
        title="Proveedores con mayor gasto"
        rows={snapshot.suppliers.topBySpend}
      />
      <PurchaseBuyersTablePanel
        title="Compradores con mayor ejecución"
        rows={snapshot.buyers.topBySpend}
      />
      <PurchaseCategoriesTablePanel
        title="Categorías con mayor compra facturada"
        rows={snapshot.categories.topBySpend}
      />
    </div>
  );
}

function ParetoSectionV2({ snapshot }: { snapshot: CommercialDashboardSnapshot }) {
  const report = buildParetoSectionReport(snapshot);

  return (
    <div className="reports-stack">
      <SectionLead
        title="Pareto"
        description="Identifica qué pocos elementos concentran la mayor parte del resultado comercial."
        actions={<SectionReportActions report={report} />}
      />

      <ParetoAccordion summary={snapshot.pareto.customers} />
      <ParetoAccordion summary={snapshot.pareto.products} />
      <ParetoAccordion summary={snapshot.pareto.sellers} />
    </div>
  );
}

type ForecastRecommendation = {
  title: string;
  description: string;
  metric: string;
};

type AnnualForecastTotal = {
  activeMonths: number;
  total: number;
  values: number[];
  year: number;
};

function ForecastsSection({
  dataset,
  error,
  isLoading,
  onRefresh,
}: {
  dataset: SalesForecastDataset | null;
  error: unknown;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const forecast = useMemo(
    () => (dataset ? buildAnnualSalesForecast(dataset) : null),
    [dataset],
  );

  if (!forecast) {
    return (
      <div className="reports-stack">
        <SectionLead
          title="Pronósticos"
          description="Se está preparando el histórico de facturación de Corporación Tectronic para proyectar el cierre del año natural."
        />
        <article className="panel reports-empty">
          {isLoading ? (
            <EmptyState title="Preparando pronóstico">
              Estamos consultando datos agregados de Contabilidad en Odoo. Esto no modifica información y quedará guardado para próximas consultas.
            </EmptyState>
          ) : (
            <EmptyState title="No se pudo preparar el pronóstico">
              {error instanceof Error ? error.message : 'No hay datos históricos disponibles todavía.'}
            </EmptyState>
          )}
          <div className="reports-panel-body">
            <button type="button" className="secondary-button" onClick={onRefresh}>
              <RefreshCcw size={16} />
              Reintentar pronóstico
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="reports-stack">
      <SectionLead
        title={forecast.scopeLabel}
        description="Se ejecuta en segundo plano, sin filtros visibles, con histórico agregado de Contabilidad en Odoo para Corporación Tectronic."
      />

      <StaticPanel
        title="Pronóstico del año natural"
        subtitle={`${forecast.companyName} · datos al ${forecast.currentDateLabel} · histórico ${forecast.historicalRangeLabel}`}
      >
        <div className="reports-kpi-list reports-kpi-list-roomy">
          <KpiBox label={`Facturación ${forecast.currentYear} acumulada`} value={formatCurrency(forecast.yearToDate)} />
          <KpiBox label="Cierre anual proyectado" value={formatCurrency(forecast.annualForecast)} />
          <KpiBox label="Pronóstico restante del año" value={formatCurrency(forecast.remainingForecast)} />
          <KpiBox label="Ritmo mensual requerido" value={formatCurrency(forecast.requiredMonthlyRunRate)} />
          <KpiBox label="Confiabilidad" value={`${forecast.confidenceLabel} · ${forecast.confidenceScore.toFixed(0)}%`} />
        </div>
        <ForecastProjectionChart models={forecast.modelResults} points={forecast.series} />
      </StaticPanel>

      <StaticPanel
        title="Cono de probabilidad"
        subtitle="Rango conservador, base y optimista para el cierre del año natural."
      >
        <div className="reports-kpi-list reports-kpi-list-roomy">
          <KpiBox label="Escenario conservador" value={formatCurrency(forecast.probabilityCone.conservative)} />
          <KpiBox label="Escenario base" value={formatCurrency(forecast.probabilityCone.expected)} />
          <KpiBox label="Escenario optimista" value={formatCurrency(forecast.probabilityCone.optimistic)} />
          <KpiBox label="Incertidumbre estimada" value={formatPercent(forecast.probabilityCone.uncertaintyPct)} />
        </div>
        <SectionInfoCard
          title="Cómo leer este rango"
          description="El escenario base es el ensamble ponderado de varios modelos. El conservador y el optimista reflejan el error histórico, la dispersión entre modelos y la variación desestacionalizada del negocio."
        >
          <div className="policy-card-quick-facts">
            <span>Restante conservador: {formatCurrency(forecast.probabilityCone.remainingConservative)}</span>
            <span>Restante base: {formatCurrency(forecast.probabilityCone.remainingExpected)}</span>
            <span>Restante optimista: {formatCurrency(forecast.probabilityCone.remainingOptimistic)}</span>
          </div>
        </SectionInfoCard>
      </StaticPanel>

      <StaticPanel
        title="Modelos utilizados"
        subtitle="Se combinan modelos simples y auditables para evitar depender de una sola lectura del histórico."
      >
        <div className="reports-stack-compact">
          <SectionInfoCard
            title="Modelo recomendado"
            description={`Se toma como referencia principal ${forecast.bestModelLabel}, que promedia modelos con mayor peso para los que tienen menor error histórico.`}
          >
            <div className="policy-card-quick-facts">
              <span>Error estimado: {forecast.bestModelErrorPct === null ? 'Sin base suficiente' : formatPercent(forecast.bestModelErrorPct)}</span>
              <span>Confiabilidad: {forecast.confidenceLabel}</span>
              <span>Cierre anual: {formatCurrency(forecast.annualForecast)}</span>
            </div>
          </SectionInfoCard>
          <MiniRanking
            rows={forecast.modelResults}
            primary={(row) => row.label}
            secondary={(row) =>
              row.errorPct === null
                ? row.explanation
                : `${row.explanation} · error histórico ${formatPercent(row.errorPct)}`
            }
            value={(row) => formatCurrency(row.annualForecast)}
          />
        </div>
      </StaticPanel>

      <StaticPanel
        title="Qué hacer para aumentar ventas"
        subtitle="Acciones sugeridas a partir del mismo corte de Odoo y del alcance visible para este usuario."
      >
        <div className="reports-stack-compact">
          {forecast.recommendations.map((recommendation) => (
            <SectionInfoCard
              key={recommendation.title}
              title={recommendation.title}
              description={recommendation.description}
            >
              <div className="policy-card-quick-facts">
                <span>{recommendation.metric}</span>
              </div>
            </SectionInfoCard>
          ))}
        </div>
      </StaticPanel>

      <StaticPanel
        title="Metodología y confiabilidad"
        subtitle="Cómo leer el pronóstico"
      >
        <div className="reports-stack-compact">
          <SectionInfoCard
            title="Base estadística"
            description="El cálculo usa `read_group` sobre Análisis de facturas de Odoo, agrupado por mes, para traer totales agregados y no descargar miles de facturas. No modifica datos de Odoo."
          >
            <div className="policy-card-quick-facts">
              <span>Fuente: Contabilidad · Análisis de facturas</span>
            </div>
          </SectionInfoCard>
          <SectionInfoCard
            title="Lectura de confianza"
            description="La confiabilidad combina años completos válidos, error histórico del ensamble, dispersión entre modelos y volatilidad desestacionalizada. Es más alta cuando el patrón de temporada se repite con estabilidad."
          >
            <div className="policy-card-quick-facts">
              {forecast.confidenceDrivers.map((driver) => (
                <span key={driver}>{driver}</span>
              ))}
            </div>
          </SectionInfoCard>
          <SectionInfoCard
            title="Limpieza y normalización"
            description={forecast.dataQualitySummary.methodNote}
          >
            <div className="policy-card-quick-facts">
              <span>Años históricos revisados: {forecast.dataQualitySummary.totalYears}</span>
              <span>Años usados para temporada: {forecast.dataQualitySummary.validYears}</span>
              <span>
                Años excluidos: {forecast.dataQualitySummary.excludedYears.length > 0 ? forecast.dataQualitySummary.excludedYears.join(', ') : 'ninguno'}
              </span>
            </div>
          </SectionInfoCard>
          <SectionInfoCard
            title="Referencias de práctica"
            description="La metodología usa estacionalidad anual robusta, ritmo contra año anterior, media móvil, tendencia lineal y suavizamiento reciente, con validación histórica para explicar qué tan confiable es el resultado."
          >
            <div className="policy-card-quick-facts">
              <span>Modelos: estacionalidad, YoY, MA, tendencia y suavizamiento</span>
            </div>
          </SectionInfoCard>
        </div>
      </StaticPanel>
    </div>
  );
}

type AnnualForecastModelResult = {
  id: 'seasonalPace' | 'lastYearPace' | 'linearTrend' | 'movingAverage' | 'seasonalSmoothed';
  label: string;
  annualForecast: number;
  remainingForecast: number;
  errorPct: number | null;
  explanation: string;
  monthlySeries: number[];
};

type AnnualForecastProbabilityCone = {
  conservative: number;
  expected: number;
  optimistic: number;
  remainingConservative: number;
  remainingExpected: number;
  remainingOptimistic: number;
  uncertaintyPct: number;
};

type AnnualForecastDataQualitySummary = {
  excludedYears: number[];
  methodNote: string;
  totalYears: number;
  validYears: number;
};

type AnnualSalesForecastResult = {
  scopeLabel: string;
  companyName: string;
  currentYear: number;
  currentDateLabel: string;
  historicalRangeLabel: string;
  yearToDate: number;
  annualForecast: number;
  remainingForecast: number;
  requiredMonthlyRunRate: number;
  confidenceLabel: 'Alta' | 'Media' | 'Baja';
  confidenceScore: number;
  bestModelLabel: string;
  bestModelErrorPct: number | null;
  confidenceDrivers: string[];
  dataQualitySummary: AnnualForecastDataQualitySummary;
  modelResults: AnnualForecastModelResult[];
  probabilityCone: AnnualForecastProbabilityCone;
  recommendations: ForecastRecommendation[];
  series: Array<{
    coneHigh?: number;
    coneLow?: number;
    forecast?: boolean;
    label: string;
    modelValues?: Record<AnnualForecastModelResult['id'], number>;
    value: number;
  }>;
};

function buildAnnualSalesForecast(dataset: SalesForecastDataset): AnnualSalesForecastResult {
  const year = dataset.currentYear;
  const currentDate = new Date(`${dataset.currentDate}T00:00:00.000Z`);
  const currentMonthIndex = currentDate.getUTCMonth();
  const elapsedMonthFraction = calculateElapsedMonthFraction(currentDate);
  const monthlyByYear = buildMonthlyAmountMatrix(dataset.monthly);
  const currentYearValues = monthlyByYear.get(year) ?? Array(12).fill(0);
  const yearToDate =
    currentYearValues.slice(0, currentMonthIndex).reduce((total, value) => total + value, 0) +
    currentYearValues[currentMonthIndex];
  const annualTotals = buildAnnualTotals(monthlyByYear);
  const completedAnnualTotals = annualTotals.filter((entry) => entry.year < year && entry.total > 0);
  const validSeasonalYears = completedAnnualTotals.filter((entry) => entry.activeMonths >= 10);
  const excludedYears = completedAnnualTotals
    .filter((entry) => entry.activeMonths < 10)
    .map((entry) => entry.year);
  const seasonalShares = buildAverageSeasonalShares(monthlyByYear, year);
  const elapsedSeasonalShare =
    seasonalShares.slice(0, currentMonthIndex).reduce((total, value) => total + value, 0) +
    (seasonalShares[currentMonthIndex] ?? 0) * elapsedMonthFraction;
  const modelResults = buildAnnualForecastModels({
    annualTotals,
    currentMonthIndex,
    currentYearValues,
    elapsedMonthFraction,
    elapsedSeasonalShare,
    seasonalShares,
    year,
    yearToDate,
  });
  const ensemble = buildAnnualForecastEnsemble(modelResults, yearToDate);
  const annualForecast = ensemble.annualForecast;
  const remainingForecast = Math.max(0, annualForecast - yearToDate);
  const remainingMonthEquivalent = Math.max(1, 12 - currentMonthIndex - elapsedMonthFraction);
  const requiredMonthlyRunRate = remainingForecast / remainingMonthEquivalent;
  const deseasonalizedVolatilityPct = calculateDeseasonalizedVolatilityPct(validSeasonalYears, seasonalShares);
  const confidenceScore = calculateAnnualForecastConfidence(
    validSeasonalYears.length,
    ensemble.errorPct,
    deseasonalizedVolatilityPct,
    ensemble.spreadPct,
  );
  const probabilityCone = buildForecastProbabilityCone(
    annualForecast,
    yearToDate,
    ensemble.errorPct,
    deseasonalizedVolatilityPct,
    ensemble.spreadPct,
  );
  const confidenceLabel = confidenceScore >= 75 ? 'Alta' : confidenceScore >= 55 ? 'Media' : 'Baja';
  const confidenceDrivers = [
    `Años completos usados: ${validSeasonalYears.length}`,
    `Error histórico del ensamble: ${ensemble.errorPct === null ? 'sin base suficiente' : formatPercent(ensemble.errorPct)}`,
    `Dispersión entre modelos: ${formatPercent(ensemble.spreadPct)}`,
    `Volatilidad desestacionalizada: ${formatPercent(deseasonalizedVolatilityPct)}`,
  ];

  return {
    scopeLabel:
      dataset.visibilityScope === 'own'
        ? 'Pronóstico personal de ventas'
        : 'Pronóstico comercial consolidado',
    companyName: dataset.companyName,
    currentYear: year,
    currentDateLabel: formatDate(dataset.currentDate),
    historicalRangeLabel: `${formatDate(dataset.historicalStartDate)} - ${formatDate(dataset.historicalEndDate)}`,
    yearToDate,
    annualForecast,
    remainingForecast,
    requiredMonthlyRunRate,
    confidenceLabel,
    confidenceScore,
    bestModelLabel: 'el ensamble ponderado',
    bestModelErrorPct: ensemble.errorPct,
    confidenceDrivers,
    dataQualitySummary: {
      excludedYears,
      methodNote:
        'Se usan años con al menos 10 meses activos para construir la temporada. Los meses atípicos se reducen mediante participaciones medianas y volatilidad MAD, para que un pico comercial no distorsione todo el año.',
      totalYears: completedAnnualTotals.length,
      validYears: validSeasonalYears.length,
    },
    modelResults,
    probabilityCone,
    recommendations: buildAnnualForecastRecommendations(
      dataset,
      annualForecast,
      remainingForecast,
      requiredMonthlyRunRate,
    ),
    series: buildAnnualForecastSeries(
      currentYearValues,
      seasonalShares,
      annualForecast,
      currentMonthIndex,
      year,
      probabilityCone,
      modelResults,
    ),
  };
}

function buildAnnualForecastModels({
  annualTotals,
  currentMonthIndex,
  currentYearValues,
  elapsedMonthFraction,
  elapsedSeasonalShare,
  seasonalShares,
  year,
  yearToDate,
}: {
  annualTotals: AnnualForecastTotal[];
  currentMonthIndex: number;
  currentYearValues: number[];
  elapsedMonthFraction: number;
  elapsedSeasonalShare: number;
  seasonalShares: number[];
  year: number;
  yearToDate: number;
}): AnnualForecastModelResult[] {
  const completedAnnualTotals = annualTotals.filter((entry) => entry.year < year && entry.total > 0 && entry.activeMonths >= 10);
  const lastYear = completedAnnualTotals[completedAnnualTotals.length - 1] ?? null;
  const currentElapsedValues = currentYearValues.slice(0, currentMonthIndex + 1);
  const historicalAnnualValues = completedAnnualTotals.map((entry) => entry.total);
  const seasonalAnnualForecast = elapsedSeasonalShare > 0 ? yearToDate / elapsedSeasonalShare : yearToDate;
  const smoothedAnnualForecast = forecastSeasonalSmoothedAnnual({
    completedAnnualTotals,
    currentMonthIndex,
    currentYearValues,
    elapsedMonthFraction,
    seasonalAnnualForecast,
    seasonalShares,
  });
  const linearRemainingForecast = forecastRemainingMonthsWithLinearTrend(
    currentElapsedValues,
    currentMonthIndex,
    elapsedMonthFraction,
  );
  const movingAverageAnnualForecast =
    yearToDate +
    forecastMovingAverage(currentElapsedValues.filter((value) => value > 0)) *
      Math.max(0, 12 - currentMonthIndex - elapsedMonthFraction);
  const lastYearComparable = lastYear
    ? calculateComparableYearToDate(lastYear.values, currentMonthIndex, elapsedMonthFraction)
    : 0;
  const lastYearPaceForecast =
    lastYear && lastYearComparable > 0
      ? lastYear.total * (yearToDate / lastYearComparable)
      : forecastMovingAverage(historicalAnnualValues);

  return [
    {
      id: 'seasonalPace' as const,
      label: 'Ritmo estacional del año',
      annualForecast: seasonalAnnualForecast,
      remainingForecast: seasonalAnnualForecast - yearToDate,
      errorPct: backtestAnnualSeasonalityError(completedAnnualTotals, currentMonthIndex, elapsedMonthFraction),
      explanation: 'Proyecta el cierre según el avance del año y la participación histórica de cada mes.',
    },
    {
      id: 'seasonalSmoothed' as const,
      label: 'Estacional suavizado',
      annualForecast: smoothedAnnualForecast,
      remainingForecast: smoothedAnnualForecast - yearToDate,
      errorPct: backtestAnnualSeasonalityError(completedAnnualTotals, currentMonthIndex, elapsedMonthFraction),
      explanation: 'Ajusta la temporada histórica con el ritmo reciente, reduciendo el peso de picos aislados.',
    },
    {
      id: 'lastYearPace' as const,
      label: 'Ritmo contra año anterior',
      annualForecast: lastYearPaceForecast,
      remainingForecast: lastYearPaceForecast - yearToDate,
      errorPct: backtestLastYearPaceError(completedAnnualTotals, currentMonthIndex, elapsedMonthFraction),
      explanation: 'Compara el avance actual contra el mismo corte del año anterior.',
    },
    {
      id: 'linearTrend' as const,
      label: 'Tendencia lineal',
      annualForecast: yearToDate + linearRemainingForecast,
      remainingForecast: linearRemainingForecast,
      errorPct: null,
      explanation: 'Extiende la pendiente de los meses transcurridos hacia el resto del año.',
    },
    {
      id: 'movingAverage' as const,
      label: 'Media móvil mensual',
      annualForecast: movingAverageAnnualForecast,
      remainingForecast: movingAverageAnnualForecast - yearToDate,
      errorPct: null,
      explanation: 'Usa el promedio reciente para estimar los meses pendientes.',
    },
  ].map((model) => {
    const annualForecast = clampForecast(model.annualForecast);
    return {
      ...model,
      annualForecast,
      remainingForecast: Math.max(0, annualForecast - yearToDate),
      monthlySeries: buildMonthlyForecastValues(
        currentYearValues,
        seasonalShares,
        annualForecast,
        currentMonthIndex,
      ),
    };
  });
}

function buildAnnualForecastEnsemble(models: AnnualForecastModelResult[], yearToDate: number) {
  const usableModels = models.filter((model) => model.annualForecast > 0);
  if (usableModels.length === 0) {
    return {
      annualForecast: yearToDate,
      remainingForecast: 0,
      errorPct: null as number | null,
      spreadPct: 0,
    };
  }

  const observedErrors = usableModels
    .map((model) => model.errorPct)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const fallbackError = observedErrors.length > 0 ? median(observedErrors) : 18;
  const weightedModels = usableModels.map((model) => {
    const error = model.errorPct ?? fallbackError;
    return {
      model,
      error,
      weight: 1 / Math.max(6, error),
    };
  });
  const totalWeight = weightedModels.reduce((sum, entry) => sum + entry.weight, 0);
  const annualForecast =
    totalWeight > 0
      ? weightedModels.reduce((sum, entry) => sum + entry.model.annualForecast * entry.weight, 0) / totalWeight
      : mean(usableModels.map((model) => model.annualForecast));
  const errorPct =
    totalWeight > 0
      ? weightedModels.reduce((sum, entry) => sum + entry.error * entry.weight, 0) / totalWeight
      : fallbackError;

  return {
    annualForecast: Math.max(yearToDate, clampForecast(annualForecast)),
    remainingForecast: Math.max(0, annualForecast - yearToDate),
    errorPct,
    spreadPct: calculateRobustRelativeSpreadPct(usableModels.map((model) => model.annualForecast)),
  };
}

function buildAnnualForecastRecommendations(
  dataset: SalesForecastDataset,
  annualForecast: number,
  remainingForecast: number,
  requiredMonthlyRunRate: number,
): ForecastRecommendation[] {
  const recommendations: ForecastRecommendation[] = [];
  const topCategory = dataset.currentYearCategories[0] ?? null;
  const topCustomer = dataset.currentYearCustomers[0] ?? null;
  const topSeller = dataset.currentYearSellers[0] ?? null;
  const currentAverage = calculateCurrentYearMonthlyAverage(dataset);

  if (requiredMonthlyRunRate > currentAverage * 1.15) {
    recommendations.push({
      title: 'Cerrar la brecha del ritmo mensual',
      description:
        'El resto del año exige vender por encima del promedio actual. Conviene revisar cartera pendiente, cotizaciones abiertas y oportunidades de recompra antes de depender solo de nuevos prospectos.',
      metric: `Requerido: ${formatCurrency(requiredMonthlyRunRate)} al mes`,
    });
  }

  if (topCustomer && topCustomer.sharePct >= 25) {
    recommendations.push({
      title: 'Reducir concentración en clientes clave',
      description:
        'Un porcentaje alto en un solo cliente vuelve el pronóstico vulnerable. Busca cuentas parecidas y arma ofertas cruzadas para distribuir mejor el cierre del año.',
      metric: `${topCustomer.label}: ${formatPercent(topCustomer.sharePct)} de la facturación`,
    });
  }

  if (topCategory) {
    recommendations.push({
      title: 'Usar la categoría líder como palanca',
      description:
        'La categoría con mayor facturación puede convertirse en campaña de recompra, paquetes o venta cruzada para acelerar el ritmo mensual requerido.',
      metric: `${topCategory.label}: ${formatCurrency(topCategory.amount)}`,
    });
  }

  if (dataset.visibilityScope !== 'own' && topSeller) {
    recommendations.push({
      title: 'Replicar el patrón del vendedor líder',
      description:
        'Revisa mezcla de clientes, frecuencia de seguimiento y categorías vendidas por el vendedor líder para convertirlo en guía del equipo.',
      metric: `${topSeller.label}: ${formatCurrency(topSeller.amount)}`,
    });
  }

  if (remainingForecast > 0) {
    recommendations.push({
      title: 'Convertir el pronóstico en cuota operativa',
      description:
        'Divide el monto restante por mes y por vendedor/cartera. Así el forecast deja de ser una cifra pasiva y se vuelve una meta semanal verificable.',
      metric: `Restante esperado: ${formatCurrency(remainingForecast)}`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Mantener ritmo y proteger el forecast',
      description:
        'Los indicadores no muestran alertas críticas. La mejor acción es sostener seguimiento, cuidar la recompra y monitorear que el cierre alcance el ritmo proyectado.',
      metric: `Cierre anual proyectado: ${formatCurrency(annualForecast)}`,
    });
  }

  return recommendations.slice(0, 5);
}

function buildMonthlyAmountMatrix(points: SalesForecastDataset['monthly']) {
  const matrix = new Map<number, number[]>();

  points.forEach((point) => {
    const date = new Date(`${point.month}-01T00:00:00.000Z`);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    if (!matrix.has(year)) matrix.set(year, Array(12).fill(0));
    matrix.get(year)![month] += point.amount;
  });

  return matrix;
}

function buildAnnualTotals(matrix: Map<number, number[]>) {
  return [...matrix.entries()]
    .map(([year, values]) => ({
      activeMonths: values.filter((value) => Math.abs(value) > 0).length,
      year,
      values,
      total: values.reduce((sum, value) => sum + value, 0),
    }))
    .sort((left, right) => left.year - right.year);
}

function buildAverageSeasonalShares(matrix: Map<number, number[]>, currentYear: number) {
  const fullYears = buildAnnualTotals(matrix)
    .filter((entry) => entry.year < currentYear && entry.total > 0 && entry.activeMonths >= 10)
    .map((entry) => entry.values);
  const baseShares = Array(12).fill(1 / 12);
  if (fullYears.length === 0) return baseShares;
  const sharesByMonth: number[][] = Array.from({ length: 12 }, () => []);

  fullYears.forEach((values) => {
    const total = values.reduce((sum, value) => sum + value, 0);
    values.forEach((value, index) => {
      sharesByMonth[index].push(total > 0 ? value / total : 0);
    });
  });

  const robustShares = sharesByMonth.map((values) => median(values));
  const totalShare = robustShares.reduce((sum, value) => sum + value, 0);
  return totalShare > 0 ? robustShares.map((value) => value / totalShare) : baseShares;
}

function buildAnnualForecastSeries(
  currentYearValues: number[],
  seasonalShares: number[],
  annualForecast: number,
  currentMonthIndex: number,
  year: number,
  probabilityCone: AnnualForecastProbabilityCone,
  modelResults: AnnualForecastModelResult[],
) {
  return Array.from({ length: 12 }, (_, index) => ({
    label: new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, index, 1)),
    ),
    value: index <= currentMonthIndex ? currentYearValues[index] ?? 0 : annualForecast * (seasonalShares[index] ?? 0),
    coneLow: index <= currentMonthIndex
      ? currentYearValues[index] ?? 0
      : probabilityCone.conservative * (seasonalShares[index] ?? 0),
    coneHigh: index <= currentMonthIndex
      ? currentYearValues[index] ?? 0
      : probabilityCone.optimistic * (seasonalShares[index] ?? 0),
    forecast: index > currentMonthIndex,
    modelValues: modelResults.reduce((values, model) => ({
      ...values,
      [model.id]: model.monthlySeries[index] ?? 0,
    }), {} as Record<AnnualForecastModelResult['id'], number>),
  }));
}

function buildMonthlyForecastValues(
  currentYearValues: number[],
  seasonalShares: number[],
  annualForecast: number,
  currentMonthIndex: number,
) {
  return Array.from({ length: 12 }, (_, index) =>
    index <= currentMonthIndex
      ? currentYearValues[index] ?? 0
      : annualForecast * (seasonalShares[index] ?? 0),
  );
}

function calculateElapsedMonthFraction(date: Date) {
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.min(1, Math.max(1 / daysInMonth, date.getUTCDate() / daysInMonth));
}

function calculateComparableYearToDate(values: number[], currentMonthIndex: number, elapsedMonthFraction: number) {
  return (
    values.slice(0, currentMonthIndex).reduce((sum, value) => sum + value, 0) +
    (values[currentMonthIndex] ?? 0) * elapsedMonthFraction
  );
}

function forecastSeasonalSmoothedAnnual({
  completedAnnualTotals,
  currentMonthIndex,
  currentYearValues,
  elapsedMonthFraction,
  seasonalAnnualForecast,
  seasonalShares,
}: {
  completedAnnualTotals: AnnualForecastTotal[];
  currentMonthIndex: number;
  currentYearValues: number[];
  elapsedMonthFraction: number;
  seasonalAnnualForecast: number;
  seasonalShares: number[];
}) {
  const historicalBaseline = forecastMovingAverage(completedAnnualTotals.slice(-3).map((entry) => entry.total));
  const baseline = historicalBaseline > 0 ? historicalBaseline : seasonalAnnualForecast;
  const recentStart = Math.max(0, currentMonthIndex - 2);
  const recentActual =
    currentYearValues.slice(recentStart, currentMonthIndex).reduce((sum, value) => sum + value, 0) +
    (currentYearValues[currentMonthIndex] ?? 0) * elapsedMonthFraction;
  const recentExpectedShare =
    seasonalShares.slice(recentStart, currentMonthIndex).reduce((sum, value) => sum + value, 0) +
    (seasonalShares[currentMonthIndex] ?? 0) * elapsedMonthFraction;
  const recentExpected = baseline * recentExpectedShare;
  const recentRatio = recentExpected > 0 ? recentActual / recentExpected : 1;
  const dampedRecentRatio = 1 + (recentRatio - 1) * 0.35;

  return seasonalAnnualForecast * Math.min(1.4, Math.max(0.65, dampedRecentRatio));
}

function forecastRemainingMonthsWithLinearTrend(
  values: number[],
  currentMonthIndex: number,
  elapsedMonthFraction: number,
) {
  const nextMonthForecast = forecastLinearTrend(values);
  const remainingMonthEquivalent = Math.max(0, 12 - currentMonthIndex - elapsedMonthFraction);
  return Math.max(0, nextMonthForecast) * remainingMonthEquivalent;
}

function backtestAnnualSeasonalityError(
  annualTotals: AnnualForecastTotal[],
  currentMonthIndex: number,
  elapsedMonthFraction: number,
) {
  if (annualTotals.length < 3) return null;
  const errors: number[] = [];

  annualTotals.forEach((target, index) => {
    const priorYears = annualTotals.slice(0, index);
    if (priorYears.length < 2 || target.total <= 0) return;
    const historicalShares = buildAverageSeasonalShares(
      new Map(priorYears.map((entry) => [entry.year, entry.values])),
      target.year,
    );
    const elapsedShare =
      historicalShares.slice(0, currentMonthIndex).reduce((sum, value) => sum + value, 0) +
      (historicalShares[currentMonthIndex] ?? 0) * elapsedMonthFraction;
    const actualToDate = calculateComparableYearToDate(target.values, currentMonthIndex, elapsedMonthFraction);
    if (elapsedShare <= 0 || actualToDate <= 0) return;
    errors.push(Math.abs((target.total - actualToDate / elapsedShare) / target.total) * 100);
  });

  return errors.length > 0 ? mean(errors) : null;
}

function backtestLastYearPaceError(
  annualTotals: AnnualForecastTotal[],
  currentMonthIndex: number,
  elapsedMonthFraction: number,
) {
  if (annualTotals.length < 2) return null;
  const errors: number[] = [];

  annualTotals.forEach((target, index) => {
    const previous = annualTotals[index - 1];
    if (!previous || previous.total <= 0 || target.total <= 0) return;
    const previousToDate = calculateComparableYearToDate(previous.values, currentMonthIndex, elapsedMonthFraction);
    const targetToDate = calculateComparableYearToDate(target.values, currentMonthIndex, elapsedMonthFraction);
    if (previousToDate <= 0 || targetToDate <= 0) return;
    const forecast = previous.total * (targetToDate / previousToDate);
    errors.push(Math.abs((target.total - forecast) / target.total) * 100);
  });

  return errors.length > 0 ? mean(errors) : null;
}

function calculateAnnualForecastConfidence(
  completedYears: number,
  errorPct: number | null,
  deseasonalizedVolatilityPct: number,
  modelSpreadPct: number,
) {
  const base = 92;
  const errorPenalty = errorPct === null ? 20 : Math.min(34, errorPct * 0.9);
  const samplePenalty = completedYears >= 4 ? 0 : completedYears >= 3 ? 8 : completedYears >= 2 ? 18 : 30;
  const volatilityPenalty = Math.min(20, deseasonalizedVolatilityPct * 0.3);
  const spreadPenalty = Math.min(18, modelSpreadPct * 0.55);
  return Math.min(92, Math.max(35, base - errorPenalty - samplePenalty - volatilityPenalty - spreadPenalty));
}

function buildForecastProbabilityCone(
  annualForecast: number,
  yearToDate: number,
  errorPct: number | null,
  deseasonalizedVolatilityPct: number,
  modelSpreadPct: number,
): AnnualForecastProbabilityCone {
  const uncertaintyPct = Math.min(
    40,
    Math.max(8, (errorPct ?? 18) * 0.7 + deseasonalizedVolatilityPct * 0.25 + modelSpreadPct * 0.35),
  );
  const conservative = Math.max(yearToDate, annualForecast * (1 - uncertaintyPct / 100));
  const optimistic = annualForecast * (1 + uncertaintyPct / 100);

  return {
    conservative: clampForecast(conservative),
    expected: clampForecast(annualForecast),
    optimistic: clampForecast(optimistic),
    remainingConservative: Math.max(0, conservative - yearToDate),
    remainingExpected: Math.max(0, annualForecast - yearToDate),
    remainingOptimistic: Math.max(0, optimistic - yearToDate),
    uncertaintyPct,
  };
}

function calculateDeseasonalizedVolatilityPct(annualTotals: AnnualForecastTotal[], seasonalShares: number[]) {
  const residuals: number[] = [];

  annualTotals.forEach((entry) => {
    entry.values.forEach((value, index) => {
      const expected = entry.total * (seasonalShares[index] ?? 0);
      if (expected > 0 && value > 0) {
        residuals.push(((value - expected) / expected) * 100);
      }
    });
  });

  if (residuals.length >= 6) {
    return medianAbsoluteDeviation(residuals) * 1.4826;
  }

  return calculateVolatilityPct(annualTotals.map((entry) => entry.total));
}

function calculateCurrentYearMonthlyAverage(dataset: SalesForecastDataset) {
  const currentYearPrefix = `${dataset.currentYear}-`;
  const elapsedMonths = dataset.monthly.filter((point) => point.month.startsWith(currentYearPrefix) && point.amount > 0);
  return elapsedMonths.length > 0 ? mean(elapsedMonths.map((point) => point.amount)) : 0;
}

function ForecastProjectionChart({
  models,
  points,
}: {
  models: AnnualForecastModelResult[];
  points: AnnualSalesForecastResult['series'];
}) {
  if (points.length === 0) {
    return <EmptyState title="Sin base de pronóstico">No hay puntos suficientes para proyectar.</EmptyState>;
  }

  const modelPalette: Record<AnnualForecastModelResult['id'], string> = {
    lastYearPace: '#6f8f72',
    linearTrend: '#b77945',
    movingAverage: '#7d8b9a',
    seasonalPace: '#b45f4d',
    seasonalSmoothed: '#5f8c8b',
  };
  const leftPadding = 64;
  const rightPadding = 16;
  const topPadding = 18;
  const bottomPadding = 34;
  const width = 720;
  const height = 238;
  const chartWidth = width - leftPadding - rightPadding;
  const chartHeight = height - topPadding - bottomPadding;
  const modelValues = models.flatMap((model) => model.monthlySeries);
  const coneValues = points.flatMap((point) => [point.coneLow ?? point.value, point.coneHigh ?? point.value]);
  const maxValue = Math.max(1, ...points.map((point) => point.value), ...modelValues, ...coneValues);
  const stepX = points.length === 1 ? chartWidth : chartWidth / (points.length - 1);
  const pointFor = (value: number, index: number) => {
    const x = leftPadding + index * stepX;
    const y = topPadding + chartHeight - (value / maxValue) * chartHeight;
    return { x, y };
  };
  const linePoints = points
    .map((point, index) => {
      const { x, y } = pointFor(point.value, index);
      return `${x},${y}`;
    })
    .join(' ');
  const forecastStartIndex = Math.max(0, points.findIndex((point) => point.forecast) - 1);
  const coneTopPoints = points
    .slice(forecastStartIndex)
    .map((point, offset) => {
      const { x, y } = pointFor(point.coneHigh ?? point.value, forecastStartIndex + offset);
      return `${x},${y}`;
    });
  const coneBottomPoints = points
    .slice(forecastStartIndex)
    .map((point, offset) => {
      const { x, y } = pointFor(point.coneLow ?? point.value, forecastStartIndex + offset);
      return `${x},${y}`;
    })
    .reverse();
  const conePolygon = [...coneTopPoints, ...coneBottomPoints].join(' ');
  const ySteps = 4;
  const gridValues = Array.from({ length: ySteps + 1 }, (_, index) =>
    (maxValue / ySteps) * (ySteps - index),
  );

  return (
    <div className="reports-chart">
      <div className="reports-chart-legend">
        <span><i className="tone-invoiced"></i>Histórico visible</span>
        <span><i className="tone-sold"></i>Media del ensamble</span>
        <span><i className="tone-margin"></i>Cono de probabilidad</span>
        {models.slice(0, 5).map((model) => (
          <span key={model.id}>
            <i style={{ background: modelPalette[model.id] }}></i>
            {model.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg">
        {gridValues.map((gridValue) => {
          const y = topPadding + chartHeight - (gridValue / maxValue) * chartHeight;
          return (
            <g key={gridValue}>
              <line
                x1={leftPadding}
                x2={leftPadding + chartWidth}
                y1={y}
                y2={y}
                className="reports-chart-grid-line"
              />
              <text x={leftPadding - 8} y={y + 4} textAnchor="end" className="reports-chart-axis-label">
                {formatCurrencyCompact(gridValue)}
              </text>
            </g>
          );
        })}
        {conePolygon ? (
          <polygon
            points={conePolygon}
            fill="rgba(180, 95, 77, 0.13)"
            stroke="rgba(180, 95, 77, 0.24)"
            strokeWidth="1"
          />
        ) : null}
        {models.slice(0, 5).map((model) => (
          <polyline
            key={model.id}
            fill="none"
            stroke={modelPalette[model.id]}
            strokeDasharray="5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.45"
            opacity="0.72"
            points={model.monthlySeries
              .map((value, index) => {
                const { x, y } = pointFor(value, index);
                return `${x},${y}`;
              })
              .join(' ')}
          />
        ))}
        <polyline
          fill="none"
          stroke="var(--reports-chart-current)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePoints}
        />
        {points.map((point, index) => {
          const { x, y } = pointFor(point.value, index);
          return (
            <g key={`${point.label}-${index}`}>
              <circle
                cx={x}
                cy={y}
                r={point.forecast ? 4 : 3}
                fill={point.forecast ? 'var(--reports-chart-previous)' : 'var(--reports-chart-current)'}
              />
              {(index === 0 || index === points.length - 1 || index % 2 === 1) ? (
                <text x={x} y={height - 10} textAnchor="middle" className="reports-chart-axis-label">
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function forecastMovingAverage(values: number[]) {
  const windowSize = Math.min(3, values.length);
  return mean(values.slice(-windowSize));
}

function forecastLinearTrend(values: number[]) {
  if (values.length <= 1) return values[0] ?? 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;

  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  return intercept + slope * n;
}

function calculateVolatilityPct(values: number[]) {
  const average = mean(values);
  if (average <= 0 || values.length <= 1) return 0;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return (Math.sqrt(variance) / average) * 100;
}

function calculateRobustRelativeSpreadPct(values: number[]) {
  const center = median(values.filter((value) => value > 0));
  if (center <= 0 || values.length <= 1) return 0;
  return (medianAbsoluteDeviation(values) * 1.4826 / center) * 100;
}

function clampForecast(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function medianAbsoluteDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function DetailsSectionV2({
  dataset,
  selectedDetailKey,
  snapshot,
  onChangeDetail,
}: {
  dataset: OdooCommercialDataset;
  selectedDetailKey: DetailKey;
  snapshot: CommercialDashboardSnapshot;
  onChangeDetail: (detailKey: DetailKey) => void;
}) {
  const detailTabs: Array<{ key: DetailKey; label: string }> = [
    { key: 'pendingQuotes', label: 'Cotizaciones pendientes' },
    { key: 'expiredQuotes', label: 'Cotizaciones vencidas' },
    { key: 'cancelledQuotes', label: 'Cotizaciones canceladas' },
    { key: 'convertedQuotes', label: 'Cotizaciones convertidas' },
    { key: 'confirmedOrders', label: 'Órdenes de venta' },
    { key: 'postedInvoices', label: 'Facturas publicadas' },
    { key: 'atRiskClients', label: 'Clientes en riesgo' },
    { key: 'negativeMarginProducts', label: 'Productos con margen negativo' },
    { key: 'lowConversionSellers', label: 'Vendedores con baja conversión' },
  ];

  return (
    <div className="reports-stack">
      <SectionLead
        title="Detalle y navegación"
        description="Abre subconjuntos de registros relacionados con hallazgos, riesgos o indicadores clave."
      />

      <AccordionPanel
        defaultOpen
        title="Explorar registros"
        subtitle="Selecciona el conjunto de datos que quieres revisar"
      >
        <div className="reports-chip-list">
          {detailTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={selectedDetailKey === tab.key ? 'secondary-button' : 'ghost-button'}
              onClick={() => onChangeDetail(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {renderDetailTable(dataset, selectedDetailKey, snapshot.details[selectedDetailKey])}
      </AccordionPanel>
    </div>
  );
}

function SectionLead({
  actions,
  title,
  description,
}: {
  actions?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <article className="panel reports-section-lead">
      <div className="reports-panel-body">
        <div className="reports-section-lead-head">
          <h3>{title}</h3>
          {actions}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
    </article>
  );
}

function SectionReportActions({ report }: { report: SectionReport }) {
  const reportShareKey = `${report.generatedAtIso}|${report.sellerName ?? ''}|${report.subtitle}|${report.title}`;
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'preparing' | 'ready' | 'copied' | 'error'>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareKey, setShareKey] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const currentShareUrl = shareKey === reportShareKey ? shareUrl : null;

  async function prepareShareLink() {
    if (currentShareUrl || shareStatus === 'preparing') return;
    setShareStatus('preparing');
    setShareError(null);
    try {
      const url = await createSharedSalesReport({
        companyName: report.companyName,
        sellerName: report.sellerName,
        title: report.title,
        reportPeriod: report.subtitle,
        reportHtml: buildSectionReportHtml(report),
        score: report.score?.total,
      });
      setShareUrl(url);
      setShareKey(reportShareKey);
      setShareStatus('ready');
    } catch (error) {
      setShareStatus('error');
      setShareError(
        error instanceof Error
          ? `No se pudo preparar el enlace. ${error.message}`
          : 'No se pudo preparar el enlace.',
      );
    }
  }

  async function handleCopyShareUrl() {
    if (!currentShareUrl) return;
    try {
      await navigator.clipboard.writeText(currentShareUrl);
    } catch {
      window.prompt('Copia el enlace del reporte:', currentShareUrl);
    }
    setShareStatus('copied');
    window.setTimeout(() => setShareStatus('ready'), 2400);
  }

  function handleOpenShareModal() {
    setIsShareModalOpen(true);
    void prepareShareLink();
  }

  useEffect(() => {
    if (!isShareModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsShareModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShareModalOpen]);

  const shareText = currentShareUrl
    ? `Reporte comercial: ${report.title}\n${report.subtitle}\n${currentShareUrl}`
    : '';
  const whatsappUrl = currentShareUrl
    ? `https://wa.me/?text=${encodeURIComponent(shareText)}`
    : undefined;
  const mailUrl = currentShareUrl
    ? `mailto:?subject=${encodeURIComponent(report.title)}&body=${encodeURIComponent(shareText)}`
    : undefined;

  return (
    <>
      <div className="reports-section-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={handleOpenShareModal}
        >
          <Share2 size={16} />
          Compartir reporte
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => downloadSectionReportPdf(report)}
        >
          <FileText size={16} />
          Exportar PDF
        </button>
      </div>
      {isShareModalOpen ? (
        <div
          className="report-share-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsShareModalOpen(false);
          }}
        >
          <section
            aria-labelledby="report-share-title"
            aria-modal="true"
            className="report-share-modal"
            role="dialog"
          >
            <div className="report-share-modal-head">
              <div>
                <span>Compartir reporte</span>
                <h2 id="report-share-title">{report.title}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar"
                onClick={() => setIsShareModalOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <p className="report-share-modal-copy">
              El reporte quedará disponible como una página fija con el mismo diseño del PDF para revisarlo sin entrar al sistema.
            </p>

            {shareStatus === 'preparing' ? (
              <div className="report-share-status">
                <RefreshCcw size={16} />
                Preparando enlace seguro...
              </div>
            ) : null}

            {shareError ? (
              <div className="report-share-status is-error">
                <CircleAlert size={16} />
                {shareError}
                <button type="button" className="text-button" onClick={() => void prepareShareLink()}>
                  Reintentar
                </button>
              </div>
            ) : null}

            <div className="report-share-options">
              <a
                className={`report-share-option is-whatsapp${currentShareUrl ? '' : ' is-disabled'}`}
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (!currentShareUrl) event.preventDefault();
                }}
              >
                <MessageCircle size={18} />
                <span>WhatsApp</span>
              </a>
              <button
                type="button"
                className="report-share-option is-copy"
                disabled={!currentShareUrl}
                onClick={() => void handleCopyShareUrl()}
              >
                {shareStatus === 'copied' ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                <span>{shareStatus === 'copied' ? 'Enlace copiado' : 'Copiar link'}</span>
              </button>
              <a
                className={`report-share-option is-email${currentShareUrl ? '' : ' is-disabled'}`}
                href={mailUrl}
                onClick={(event) => {
                  if (!currentShareUrl) event.preventDefault();
                }}
              >
                <Mail size={18} />
                <span>Correo</span>
              </a>
            </div>

            <div className="report-share-link-preview">
              <span>Enlace del reporte</span>
              <strong>{currentShareUrl ?? 'Generando enlace...'}</strong>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function AccordionPanel({
  children,
  defaultOpen = false,
  subtitle,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  subtitle?: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <article className={`panel reports-accordion${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="reports-accordion-trigger"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <ChevronRight size={18} />
      </button>
      {isOpen ? <div className="reports-accordion-content">{children}</div> : null}
    </article>
  );
}

function StaticPanel({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <article className="panel reports-static-panel">
      <div className="panel-header">
        <div>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
      </div>
      <div className="reports-panel-body">{children}</div>
    </article>
  );
}

function SectionInfoCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="reports-info-card">
      <div className="reports-info-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function GaugePanel({
  description,
  good,
  inverse = false,
  max,
  title,
  value,
  warning,
}: {
  description: string;
  good: number;
  inverse?: boolean;
  max: number;
  title: string;
  value: number;
  warning: number;
}) {
  const safeValue = Math.max(0, Math.min(value, max));
  const normalized = safeValue / Math.max(max, 1);
  const radius = 56;
  const centerX = 72;
  const startX = centerX - radius;
  const valueX = startX + radius * 2 * normalized;
  const toneClass = inverse
    ? value <= good
      ? 'good'
      : value <= warning
        ? 'warning'
        : 'bad'
    : value >= good
      ? 'good'
      : value >= warning
        ? 'warning'
        : 'bad';

  return (
    <section className="reports-gauge-card">
      {title || description ? (
        <div className="reports-gauge-head">
          {title ? <strong>{title}</strong> : null}
          {description ? <small>{description}</small> : null}
        </div>
      ) : null}
      <div className="reports-gauge-visual">
        <svg viewBox="0 0 144 92" className={`reports-gauge-svg tone-${toneClass}`}>
          <path d="M 16 72 A 56 56 0 0 1 128 72" pathLength="100" className="reports-gauge-track" />
          <path
            d="M 16 72 A 56 56 0 0 1 128 72"
            pathLength="100"
            className="reports-gauge-fill"
            style={{ strokeDasharray: `${normalized * 100} 100` }}
          />
          <line x1={valueX} y1={72} x2={valueX} y2={18} className="reports-gauge-needle" />
          <text x={centerX} y={64} textAnchor="middle" className="reports-gauge-value">
            {value.toFixed(1)}%
          </text>
          <text x="16" y="86" textAnchor="middle" className="reports-gauge-label">
            0
          </text>
          <text x="128" y="86" textAnchor="middle" className="reports-gauge-label">
            {max}
          </text>
        </svg>
      </div>
    </section>
  );
}

function ParetoAccordion({
  summary,
}: {
  summary: {
    title: string;
    statement: string;
    rows: ParetoRow[];
  };
}) {
  return (
    <StaticPanel title={summary.title} subtitle={summary.statement}>
      <ParetoPreviewChart rows={summary.rows.slice(0, 8)} />
      <DataTable
        rows={summary.rows}
        storageKey={`pareto-v2-${summary.title}`}
        columns={[
          column<ParetoRow>('position', '#', (row) => row.position, (row) => row.position),
          column<ParetoRow>('label', 'Elemento', (row) => row.label, (row) => row.label),
          column<ParetoRow>('value', 'Valor', (row) => formatCurrency(row.value), (row) => row.value),
          column<ParetoRow>('orders', 'Órdenes', (row) => formatNumber(row.orders), (row) => row.orders),
          column<ParetoRow>('units', 'Unidades', (row) => formatNumber(row.units), (row) => row.units),
          column<ParetoRow>('share', '% individual', (row) => formatPercent(row.individualPct), (row) => row.individualPct),
          column<ParetoRow>('accum', '% acumulado', (row) => formatPercent(row.accumulatedPct), (row) => row.accumulatedPct),
          column<ParetoRow>('class', 'ABC', (row) => row.classification, (row) => row.classification),
        ]}
      />
    </StaticPanel>
  );
}

function ParetoPreviewChart({ rows }: { rows: ParetoRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Sin datos">No hay suficientes elementos para calcular Pareto.</EmptyState>;
  }

  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="reports-pareto-preview">
      {rows.map((row) => (
        <div key={row.key} className="reports-pareto-row">
          <div className="reports-pareto-copy">
            <strong>{row.label}</strong>
            <small>{formatPercent(row.accumulatedPct)} acumulado</small>
          </div>
          <div className="reports-pareto-bars">
            <span
              className="reports-pareto-bar"
              style={{ width: `${(row.value / maxValue) * 100}%` }}
            />
            <span
              className="reports-pareto-line-dot"
              style={{ left: `${Math.min(row.accumulatedPct, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PurchaseTrendPanel({ points }: { points: PurchaseTrendPoint[] }) {
  if (points.length === 0) {
    return <EmptyState title="Sin evolución">No hay datos para la serie temporal de compras.</EmptyState>;
  }

  const leftPadding = 64;
  const rightPadding = 14;
  const topPadding = 16;
  const bottomPadding = 28;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [
      point.previousBilledAmount,
      point.billedAmount,
      point.orderedAmount,
    ]),
  );
  const width = 720;
  const height = 240;
  const chartWidth = width - leftPadding - rightPadding;
  const chartHeight = height - topPadding - bottomPadding;
  const stepX = points.length === 1 ? chartWidth : chartWidth / (points.length - 1);
  const ySteps = 4;
  const gridValues = Array.from({ length: ySteps + 1 }, (_, index) =>
    (maxValue / ySteps) * (ySteps - index),
  );

  const buildLine = (valueGetter: (point: PurchaseTrendPoint) => number) =>
    points
      .map((point, index) => {
        const x = leftPadding + index * stepX;
        const y = topPadding + chartHeight - (valueGetter(point) / maxValue) * chartHeight;
        return `${x},${y}`;
      })
      .join(' ');
  const previousBilledLine = buildLine((point) => point.previousBilledAmount);
  const previousBilledArea = `${leftPadding},${height - bottomPadding} ${previousBilledLine} ${leftPadding + chartWidth},${height - bottomPadding}`;

  return (
    <div className="reports-chart">
      <div className="reports-chart-legend">
        <span><i className="tone-sold"></i>Facturación período anterior</span>
        <span><i className="tone-invoiced"></i>Facturación proveedor</span>
        <span><i className="tone-margin"></i>Órdenes de compra</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg">
        {gridValues.map((gridValue) => {
          const y = topPadding + chartHeight - (gridValue / maxValue) * chartHeight;
          return (
            <g key={gridValue}>
              <line
                x1={leftPadding}
                x2={leftPadding + chartWidth}
                y1={y}
                y2={y}
                className="reports-chart-grid-line"
              />
              <text x={leftPadding - 8} y={y + 4} textAnchor="end" className="reports-chart-axis-label">
                {formatCurrencyCompact(gridValue)}
              </text>
            </g>
          );
        })}
        <polygon fill="url(#reports-purchase-area-gradient)" points={previousBilledArea} />
        <defs>
          <linearGradient id="reports-purchase-area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--reports-chart-previous-fill-strong)" />
            <stop offset="100%" stopColor="var(--reports-chart-previous-fill-soft)" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="var(--reports-chart-previous)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={previousBilledLine}
        />
        <polyline
          fill="none"
          stroke="var(--reports-chart-margin)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={buildLine((point) => point.orderedAmount)}
        />
        <polyline
          fill="none"
          stroke="var(--reports-chart-current)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={buildLine((point) => point.billedAmount)}
        />
      </svg>
    </div>
  );
}

function PurchaseCategoryMixPanel({ rows }: { rows: PurchaseCategoryRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Sin categorías">No hay compras facturadas por categoría en el período.</EmptyState>;
  }

  const maxSpend = Math.max(...rows.map((row) => row.billedAmount), 1);

  return (
    <div className="reports-pareto-preview">
      {rows.map((row) => (
        <div key={`${row.categoryId ?? row.categoryName}`} className="reports-pareto-row">
          <div className="reports-pareto-copy">
            <strong>{row.categoryName}</strong>
            <small>
              {formatPercent(row.spendSharePct)} del gasto · {formatNumber(row.productCount)} productos
            </small>
          </div>
          <div className="reports-pareto-bars">
            <span
              className="reports-pareto-bar"
              style={{ width: `${(row.billedAmount / maxSpend) * 100}%` }}
            />
            <span
              className="reports-pareto-line-dot"
              style={{ left: `${Math.min(row.spendSharePct, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PurchaseProductsTablePanel({
  rows,
  title,
}: {
  rows: PurchaseProductRow[];
  title: string;
}) {
  return (
    <StaticPanel title={title}>
      <DataTable
        rows={rows}
        storageKey={`purchase-products-${title}`}
        columns={[
          column<PurchaseProductRow>('product', 'Producto', (row) => row.productName, (row) => row.productName),
          column<PurchaseProductRow>('category', 'Categoría', (row) => row.categoryName ?? 'Sin categoría', (row) => row.categoryName ?? ''),
          column<PurchaseProductRow>('billed', 'Facturado', (row) => formatCurrency(row.billedAmount), (row) => row.billedAmount),
          column<PurchaseProductRow>('ordered', 'Ordenado', (row) => formatCurrency(row.orderedAmount), (row) => row.orderedAmount),
          column<PurchaseProductRow>('quantity', 'Cantidad', (row) => formatNumber(row.quantity), (row) => row.quantity),
          column<PurchaseProductRow>('share', '% gasto', (row) => formatPercent(row.spendSharePct), (row) => row.spendSharePct),
          column<PurchaseProductRow>('suppliers', 'Proveedores', (row) => formatNumber(row.supplierCount), (row) => row.supplierCount),
          column<PurchaseProductRow>('change', 'Vs. período anterior', (row) => formatNullablePercent(row.billedAmountChangePct), (row) => row.billedAmountChangePct ?? Number.NEGATIVE_INFINITY),
        ]}
      />
    </StaticPanel>
  );
}

function PurchaseSuppliersTablePanel({
  rows,
  title,
}: {
  rows: PurchaseSupplierRow[];
  title: string;
}) {
  return (
    <StaticPanel title={title}>
      <DataTable
        rows={rows}
        storageKey={`purchase-suppliers-${title}`}
        columns={[
          column<PurchaseSupplierRow>('supplier', 'Proveedor', (row) => row.supplierName, (row) => row.supplierName),
          column<PurchaseSupplierRow>('billed', 'Facturado', (row) => formatCurrency(row.billedAmount), (row) => row.billedAmount),
          column<PurchaseSupplierRow>('ordered', 'Ordenado', (row) => formatCurrency(row.orderedAmount), (row) => row.orderedAmount),
          column<PurchaseSupplierRow>('bills', 'Facturas', (row) => formatNumber(row.billCount), (row) => row.billCount),
          column<PurchaseSupplierRow>('orders', 'Órdenes', (row) => formatNumber(row.orderCount), (row) => row.orderCount),
          column<PurchaseSupplierRow>('products', 'Productos', (row) => formatNumber(row.productCount), (row) => row.productCount),
          column<PurchaseSupplierRow>('avg', 'Factura promedio', (row) => formatCurrency(row.averageBill), (row) => row.averageBill),
          column<PurchaseSupplierRow>('share', '% gasto', (row) => formatPercent(row.spendSharePct), (row) => row.spendSharePct),
          column<PurchaseSupplierRow>('change', 'Vs. período anterior', (row) => formatNullablePercent(row.billedAmountChangePct), (row) => row.billedAmountChangePct ?? Number.NEGATIVE_INFINITY),
        ]}
      />
    </StaticPanel>
  );
}

function PurchaseBuyersTablePanel({
  rows,
  title,
}: {
  rows: PurchaseBuyerRow[];
  title: string;
}) {
  return (
    <StaticPanel title={title}>
      <DataTable
        rows={rows}
        storageKey={`purchase-buyers-${title}`}
        columns={[
          column<PurchaseBuyerRow>('buyer', 'Comprador', (row) => row.buyerName, (row) => row.buyerName),
          column<PurchaseBuyerRow>('billed', 'Facturado', (row) => formatCurrency(row.billedAmount), (row) => row.billedAmount),
          column<PurchaseBuyerRow>('ordered', 'Ordenado', (row) => formatCurrency(row.orderedAmount), (row) => row.orderedAmount),
          column<PurchaseBuyerRow>('bills', 'Facturas', (row) => formatNumber(row.billCount), (row) => row.billCount),
          column<PurchaseBuyerRow>('orders', 'Órdenes', (row) => formatNumber(row.orderCount), (row) => row.orderCount),
          column<PurchaseBuyerRow>('suppliers', 'Proveedores', (row) => formatNumber(row.supplierCount), (row) => row.supplierCount),
          column<PurchaseBuyerRow>('avg', 'Orden promedio', (row) => formatCurrency(row.averageOrderValue), (row) => row.averageOrderValue),
          column<PurchaseBuyerRow>('change', 'Vs. período anterior', (row) => formatNullablePercent(row.billedAmountChangePct), (row) => row.billedAmountChangePct ?? Number.NEGATIVE_INFINITY),
        ]}
      />
    </StaticPanel>
  );
}

function PurchaseCategoriesTablePanel({
  rows,
  title,
}: {
  rows: PurchaseCategoryRow[];
  title: string;
}) {
  return (
    <StaticPanel title={title}>
      <DataTable
        rows={rows}
        storageKey={`purchase-categories-${title}`}
        columns={[
          column<PurchaseCategoryRow>('category', 'Categoría', (row) => row.categoryName, (row) => row.categoryName),
          column<PurchaseCategoryRow>('billed', 'Facturado', (row) => formatCurrency(row.billedAmount), (row) => row.billedAmount),
          column<PurchaseCategoryRow>('ordered', 'Ordenado', (row) => formatCurrency(row.orderedAmount), (row) => row.orderedAmount),
          column<PurchaseCategoryRow>('quantity', 'Cantidad', (row) => formatNumber(row.quantity), (row) => row.quantity),
          column<PurchaseCategoryRow>('products', 'Productos', (row) => formatNumber(row.productCount), (row) => row.productCount),
          column<PurchaseCategoryRow>('suppliers', 'Proveedores', (row) => formatNumber(row.supplierCount), (row) => row.supplierCount),
          column<PurchaseCategoryRow>('share', '% gasto', (row) => formatPercent(row.spendSharePct), (row) => row.spendSharePct),
          column<PurchaseCategoryRow>('change', 'Vs. período anterior', (row) => formatNullablePercent(row.billedAmountChangePct), (row) => row.billedAmountChangePct ?? Number.NEGATIVE_INFINITY),
        ]}
      />
    </StaticPanel>
  );
}

function HallazgosPanel({
  hallazgos,
  onOpenDetail,
}: {
  hallazgos: Hallazgo[];
  onOpenDetail: (detailKey: DetailKey) => void;
}) {
  if (hallazgos.length === 0) {
    return null;
  }

  return (
    <AccordionPanel
      defaultOpen
      title="Hallazgos comerciales"
      subtitle="Mensajes analíticos determinísticos basados en datos del período"
    >
      <div className="reports-insights">
        {hallazgos.map((hallazgo) => (
          <article
            key={hallazgo.id}
            className={`reports-insight-card tone-${mapHallazgoTone(hallazgo.level)}`}
          >
            <div className="timeline-card-header">
              <strong>{hallazgo.title}</strong>
              <span className="permission-chip allowed">{hallazgo.level}</span>
            </div>
            <p>{hallazgo.evidence}</p>
            <p>{hallazgo.explanation}</p>
            <p>
              <strong>Recomendación:</strong> {hallazgo.recommendation}
            </p>
            {hallazgo.detailKey ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOpenDetail(hallazgo.detailKey as DetailKey)}
              >
                Abrir detalle
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </AccordionPanel>
  );
}

function FilterToolbar({
  activeFilters,
  companyLocked,
  dataset,
  sellerLocked,
  sellerOptions,
  onApplyQuickRange,
  onChange,
}: {
  activeFilters: ReportFilters;
  companyLocked: boolean;
  dataset: OdooCommercialDataset | undefined;
  sellerLocked: boolean;
  sellerOptions: ReportOption[];
  onApplyQuickRange: (key: QuickRangeKey) => void;
  onChange: (filters: ReportFilters) => void;
}) {
  const quickRangeValue = detectQuickRange(activeFilters);
  const showLegacyFilterGrid = dataset?.database === '__legacy_filters__';

  return (
    <article
      className="panel reports-filter-shell reports-filter-shell-reference"
      title={buildFiltersSummaryEs(activeFilters)}
    >
      <div className="reports-filter-inline-row">
        <label className="reports-inline-filter reports-inline-filter-period">
          <span className="reports-inline-filter-icon">
            <CalendarDays size={16} />
          </span>
          <select
            value={quickRangeValue}
            onChange={(event) => onApplyQuickRange(event.target.value as QuickRangeKey)}
          >
            {quickRanges.map((range) => (
              <option key={range.key} value={range.key}>
                {range.label}
              </option>
            ))}
          </select>
        </label>

        <InlineCompanyFilter
          label="Compañía"
          locked={companyLocked}
          selectedIds={resolveActiveCompanyIds(activeFilters, dataset?.availableFilters.companies ?? [])}
          onChange={(companyIds) => onChange({ ...activeFilters, companyId: null, companyIds })}
          options={dataset?.availableFilters.companies ?? []}
        />
        <InlineSellerFilter
          label="Vendedores"
          locked={sellerLocked}
          selectedIds={resolveActiveSellerIds(activeFilters, sellerOptions)}
          onChange={(sellerIds) => onChange({ ...activeFilters, sellerId: null, sellerIds })}
          options={sellerOptions}
        />
        <InlineFilterSelect
          label="Cliente"
          value={activeFilters.customerId ?? ''}
          onChange={(value) => onChange({ ...activeFilters, customerId: parseNullableNumber(value) })}
          options={dataset?.availableFilters.customers ?? []}
          emptyLabel="Todos"
        />
        <InlineFilterSelect
          label="Producto"
          value={activeFilters.productId ?? ''}
          onChange={(value) => onChange({ ...activeFilters, productId: parseNullableNumber(value) })}
          options={dataset?.availableFilters.products ?? []}
          emptyLabel="Todos"
        />
        <InlineFilterSelect
          label="Categoría"
          value={activeFilters.categoryId ?? ''}
          onChange={(value) => onChange({ ...activeFilters, categoryId: parseNullableNumber(value) })}
          options={dataset?.availableFilters.categories ?? []}
          emptyLabel="Todas"
        />
        <InlineFilterSelect
          label="Equipo de ventas"
          value={activeFilters.teamId ?? ''}
          onChange={(value) => onChange({ ...activeFilters, teamId: parseNullableNumber(value) })}
          options={dataset?.availableFilters.teams ?? []}
          emptyLabel="Todos"
        />
      </div>

      <div className="reports-filter-range">
        <CalendarDays size={15} />
        <span>{formatReferenceDateRange(activeFilters.startDate, activeFilters.endDate)}</span>
      </div>

      {showLegacyFilterGrid ? (
        <div className="reports-panel-body">
          <div className="form-grid reports-filter-grid">
          <Field label="Fecha inicial">
            <input
              type="date"
              value={activeFilters.startDate}
              onChange={(event) => onChange({ ...activeFilters, startDate: event.target.value })}
            />
          </Field>
          <Field label="Fecha final">
            <input
              type="date"
              value={activeFilters.endDate}
              onChange={(event) => onChange({ ...activeFilters, endDate: event.target.value })}
            />
          </Field>
          <Field label="Compañía">
            {companyLocked ? (
              <div className="reports-seller-filter-locked">
                <LockKeyhole size={15} />
                <span>
                  {dataset?.companyScope?.label ??
                    dataset?.availableFilters.companies[0]?.label ??
                    'Compañía asociada'}
                </span>
              </div>
            ) : (
              <select
                value={activeFilters.companyId ?? ''}
                onChange={(event) => onChange({ ...activeFilters, companyId: parseNullableNumber(event.target.value) })}
              >
                <option value="">Todas</option>
                {dataset?.availableFilters.companies.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Vendedores">
            {sellerLocked ? (
              <div className="reports-seller-filter-locked">
                <LockKeyhole size={15} />
                <span>{dataset?.sellerScope?.label ?? sellerOptions[0]?.label ?? 'Vendedor asociado'}</span>
              </div>
            ) : (
              <SellerChecklistField
                options={dataset?.availableFilters.sellers ?? []}
                selectedIds={resolveActiveSellerIds(activeFilters, dataset?.availableFilters.sellers ?? [])}
                onChange={(sellerIds) => onChange({ ...activeFilters, sellerId: null, sellerIds })}
              />
            )}
          </Field>
          <Field label="Equipo">
            <select
              value={activeFilters.teamId ?? ''}
              onChange={(event) => onChange({ ...activeFilters, teamId: parseNullableNumber(event.target.value) })}
            >
              <option value="">Todos</option>
              {dataset?.availableFilters.teams.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cliente">
            <select
              value={activeFilters.customerId ?? ''}
              onChange={(event) => onChange({ ...activeFilters, customerId: parseNullableNumber(event.target.value) })}
            >
              <option value="">Todos</option>
              {dataset?.availableFilters.customers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Producto">
            <select
              value={activeFilters.productId ?? ''}
              onChange={(event) => onChange({ ...activeFilters, productId: parseNullableNumber(event.target.value) })}
            >
              <option value="">Todos</option>
              {dataset?.availableFilters.products.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select
              value={activeFilters.categoryId ?? ''}
              onChange={(event) => onChange({ ...activeFilters, categoryId: parseNullableNumber(event.target.value) })}
            >
              <option value="">Todas</option>
              {dataset?.availableFilters.categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moneda">
            <select
              value={activeFilters.currencyCode ?? ''}
              onChange={(event) => onChange({ ...activeFilters, currencyCode: event.target.value || null })}
            >
              <option value="">Todas</option>
              {dataset?.availableFilters.currencies.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Canal">
            <select
              value={activeFilters.channel ?? ''}
              onChange={(event) => onChange({ ...activeFilters, channel: event.target.value || null })}
            >
              <option value="">Todos</option>
              {dataset?.availableFilters.channels.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado comercial">
            <select
              value={activeFilters.stateScope}
              onChange={(event) =>
                onChange({
                  ...activeFilters,
                  stateScope: event.target.value as ReportFilters['stateScope'],
                })
              }
            >
              <option value="all">Todos</option>
              <option value="quotation">Cotizaciones</option>
              <option value="confirmed">Órdenes de venta</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </Field>
          <Field label="Agrupación temporal">
            <select
              value={activeFilters.grouping}
              onChange={(event) =>
                onChange({
                  ...activeFilters,
                  grouping: event.target.value as ReportGrouping,
                })
              }
            >
              <option value="day">Día</option>
              <option value="month">Mes</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Año</option>
            </select>
          </Field>
        </div>
      </div>
      ) : null}
    </article>
  );
}

function InlineFilterSelect({
  emptyLabel,
  label,
  onChange,
  options,
  value,
}: {
  emptyLabel: string;
  label: string;
  onChange: (value: string) => void;
  options: ReportOption[];
  value: number | string;
}) {
  return (
    <label className="reports-inline-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InlineCompanyFilter({
  label,
  locked = false,
  onChange,
  options,
  selectedIds,
}: {
  label: string;
  locked?: boolean;
  onChange: (companyIds: number[]) => void;
  options: ReportOption[];
  selectedIds: number[];
}) {
  const [open, setOpen] = useState(false);
  const normalizedOptions = useMemo(() => normalizeNumberOptions(options), [options]);
  const allCompanyIds = useMemo(() => normalizedOptions.map((option) => option.id), [normalizedOptions]);
  const noCompaniesSelected = selectedIds.includes(EMPTY_FILTER_SELECTION_ID);
  const appliedSelection = useMemo(
    () => (noCompaniesSelected ? [] : selectedIds.length > 0 ? selectedIds : allCompanyIds),
    [allCompanyIds, noCompaniesSelected, selectedIds],
  );
  const [draftIds, setDraftIds] = useState<number[]>(appliedSelection);
  const lockedLabel =
    normalizedOptions.find((option) => appliedSelection.includes(option.id))?.label ??
    normalizedOptions[0]?.label ??
    'Compañía asociada';

  const closeMenu = () => {
    setDraftIds(appliedSelection);
    setOpen(false);
  };

  const applyDraft = () => {
    const orderedSelection = allCompanyIds.filter((companyId) => draftIds.includes(companyId));
    onChange(orderedSelection.length > 0 ? orderedSelection : [EMPTY_FILTER_SELECTION_ID]);
    setOpen(false);
  };

  return (
    <div className={`reports-inline-multiselect ${open ? 'is-open' : ''} ${locked ? 'is-locked' : ''}`}>
      <button
        type="button"
        className="reports-inline-multiselect-trigger"
        disabled={locked}
        title={locked ? 'El reporte está limitado a la compañía principal de tu usuario en Odoo.' : undefined}
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }

          setDraftIds(appliedSelection);
          setOpen(true);
        }}
      >
        <div className="reports-inline-multiselect-copy">
          <span>{locked ? 'Compañía asociada' : label}</span>
          <strong>{locked ? lockedLabel : formatCompanySelectionLabel(selectedIds, normalizedOptions)}</strong>
        </div>
        {locked ? <LockKeyhole size={15} /> : <ChevronDown size={16} />}
      </button>
      {open && !locked ? (
        <div className="reports-inline-multiselect-menu">
          <div className="reports-inline-multiselect-actions">
            <button type="button" className="ghost-button" onClick={() => setDraftIds(allCompanyIds)}>
              Seleccionar todas
            </button>
            <button type="button" className="ghost-button" onClick={() => setDraftIds([])}>
              Desmarcar todas
            </button>
          </div>
          <div className="reports-inline-multiselect-list">
            {normalizedOptions.map((option) => {
              const checked = draftIds.includes(option.id);
              return (
                <label key={option.id} className="reports-multiselect-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setDraftIds(toggleDraftSellerSelection(draftIds, option.id))}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          <div className="reports-inline-multiselect-footer">
            <button type="button" className="ghost-button" onClick={closeMenu}>
              Cancelar
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={applyDraft}
              disabled={sameNumberList(draftIds, appliedSelection)}
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InlineSellerFilter({
  label,
  locked = false,
  onChange,
  options,
  selectedIds,
}: {
  label: string;
  locked?: boolean;
  onChange: (sellerIds: number[]) => void;
  options: ReportOption[];
  selectedIds: number[];
}) {
  const [open, setOpen] = useState(false);
  const normalizedOptions = useMemo(() => normalizeNumberOptions(options), [options]);
  const allSellerIds = useMemo(() => normalizedOptions.map((option) => option.id), [normalizedOptions]);
  const noSellersSelected = selectedIds.includes(EMPTY_FILTER_SELECTION_ID);
  const appliedSelection = useMemo(
    () => (noSellersSelected ? [] : selectedIds.length > 0 ? selectedIds : allSellerIds),
    [allSellerIds, noSellersSelected, selectedIds],
  );
  const [draftIds, setDraftIds] = useState<number[]>(appliedSelection);
  const lockedLabel =
    normalizedOptions.find((option) => appliedSelection.includes(option.id))?.label ??
    normalizedOptions[0]?.label ??
    'Vendedor asociado';

  const closeMenu = () => {
    setDraftIds(appliedSelection);
    setOpen(false);
  };

  const applyDraft = () => {
    const orderedSelection = allSellerIds.filter((sellerId) => draftIds.includes(sellerId));
    onChange(orderedSelection.length > 0 ? orderedSelection : [EMPTY_FILTER_SELECTION_ID]);
    setOpen(false);
  };

  return (
    <div className={`reports-inline-multiselect ${open ? 'is-open' : ''} ${locked ? 'is-locked' : ''}`}>
      <button
        type="button"
        className="reports-inline-multiselect-trigger"
        disabled={locked}
        title={locked ? 'El reporte está limitado al vendedor asociado con tu cuenta.' : undefined}
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }

          setDraftIds(appliedSelection);
          setOpen(true);
        }}
      >
        <div className="reports-inline-multiselect-copy">
          <span>{locked ? 'Vendedor asociado' : label}</span>
          <strong>{locked ? lockedLabel : formatSellerSelectionLabel(selectedIds, normalizedOptions)}</strong>
        </div>
        {locked ? <LockKeyhole size={15} /> : <ChevronDown size={16} />}
      </button>
      {open && !locked ? (
        <div className="reports-inline-multiselect-menu">
          <div className="reports-inline-multiselect-actions">
            <button type="button" className="ghost-button" onClick={() => setDraftIds(allSellerIds)}>
              Seleccionar todos
            </button>
            <button type="button" className="ghost-button" onClick={() => setDraftIds([])}>
              Desmarcar todos
            </button>
          </div>
          <div className="reports-inline-multiselect-list">
            {normalizedOptions.map((option) => {
              const checked = draftIds.includes(option.id);
              return (
                <label key={option.id} className="reports-multiselect-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setDraftIds(toggleDraftSellerSelection(draftIds, option.id))
                    }
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          <div className="reports-inline-multiselect-footer">
            <button type="button" className="ghost-button" onClick={closeMenu}>
              Cancelar
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={applyDraft}
              disabled={sameNumberList(draftIds, appliedSelection)}
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SellerChecklistField({
  onChange,
  options,
  selectedIds,
}: {
  onChange: (sellerIds: number[]) => void;
  options: ReportOption[];
  selectedIds: number[];
}) {
  const normalizedOptions = normalizeNumberOptions(options);

  if (normalizedOptions.length === 0) {
    return <div className="reports-seller-checklist">Sin vendedores disponibles.</div>;
  }

  return (
    <div className="reports-seller-checklist">
      <div className="reports-inline-multiselect-actions">
        <button type="button" className="ghost-button" onClick={() => onChange(normalizedOptions.map((option) => option.id))}>
          Marcar todos
        </button>
      </div>
      <div className="reports-seller-checklist-grid">
        {normalizedOptions.map((option) => (
          <label key={option.id} className="reports-multiselect-option">
            <input
              type="checkbox"
              checked={selectedIds.includes(option.id)}
              onChange={() =>
                onChange(toggleSellerSelection(selectedIds, option.id, normalizedOptions.map((item) => item.id)))
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ConversionTablePanel({
  rows,
  title,
}: {
  rows: Array<{
    key: string;
    label: string;
    quotes: number;
    converted: number;
    cancelled: number;
    pending: number;
    expired: number;
    conversionPct: number;
    averageConversionDays: number;
  }>;
  title: string;
}) {
  return (
    <AccordionPanel title={title} subtitle={`${rows.length} filas`}>
        <DataTable
          rows={rows}
          storageKey={title}
          columns={[
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('label', 'Elemento', (row) => row.label, (row) => row.label),
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('quotes', 'Cotizaciones', (row) => formatNumber(row.quotes), (row) => row.quotes),
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('converted', 'Convertidas', (row) => formatNumber(row.converted), (row) => row.converted),
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('pending', 'Pendientes', (row) => formatNumber(row.pending), (row) => row.pending),
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('expired', 'Vencidas', (row) => formatNumber(row.expired), (row) => row.expired),
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('cancelled', 'Canceladas', (row) => formatNumber(row.cancelled), (row) => row.cancelled),
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('conversionPct', 'Conversión', (row) => formatPercent(row.conversionPct), (row) => row.conversionPct),
            column<CommercialDashboardSnapshot['conversion']['bySeller'][number]>('days', 'Días prom.', (row) => row.averageConversionDays.toFixed(1), (row) => row.averageConversionDays),
          ]}
        />
    </AccordionPanel>
  );
}

function ConversionTeamPiePanel({
  rows,
}: {
  rows: CommercialDashboardSnapshot['conversion']['byTeam'];
}) {
  const palette = ['#1178d4', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const visibleRows = rows.filter((row) => row.quotes > 0).slice(0, 6);
  const total = visibleRows.reduce(
    (accumulator, row) => accumulator + (row.converted > 0 ? row.converted : row.quotes),
    0,
  );

  const segments = visibleRows.reduce<
    Array<{
      color: string;
      path: string;
      row: CommercialDashboardSnapshot['conversion']['byTeam'][number];
      share: number;
    }>
  >((accumulator, row, index) => {
    const value = row.converted > 0 ? row.converted : row.quotes;
    const ratioValue = total > 0 ? value / total : 0;
    const previousShare = accumulator.reduce(
      (shareAccumulator, segment) => shareAccumulator + segment.share,
      0,
    );
    const startAngle = (previousShare / 100) * Math.PI * 2 - Math.PI / 2;
    const endAngle = ((previousShare + ratioValue * 100) / 100) * Math.PI * 2 - Math.PI / 2;

    return [
      ...accumulator,
      {
        color: palette[index % palette.length],
        path: describePieArc(58, 58, 46, startAngle, endAngle),
        row,
        share: ratioValue * 100,
      },
    ];
  }, []);

  return (
    <AccordionPanel
      title="Conversión por equipo"
      subtitle="Participación de equipos y calidad de cierre dentro del período"
    >
      <div className="reports-conversion-team">
        <div className="reports-conversion-team-chart" aria-hidden="true">
          <svg viewBox="0 0 116 116" className="reports-pie-svg">
            <circle cx="58" cy="58" r="46" className="reports-pie-track" />
            {segments.map((segment) => (
              <path
                key={segment.row.key}
                d={segment.path}
                className="reports-pie-segment"
                stroke={segment.color}
              />
            ))}
          </svg>
          <div className="reports-pie-center">
            <strong>{formatNumber(visibleRows.length)}</strong>
            <span>equipos</span>
          </div>
        </div>

        <div className="reports-conversion-team-legend">
          {visibleRows.map((row, index) => (
            <article key={row.key} className="reports-conversion-team-item">
              <div>
                <span
                  className="reports-conversion-team-dot"
                  style={{ backgroundColor: palette[index % palette.length] }}
                />
                <strong>{row.label}</strong>
              </div>
              <small>
                {formatNumber(row.converted)} convertidas de {formatNumber(row.quotes)} cotizaciones
              </small>
              <span>
                {formatPercent(row.conversionPct)} | {formatPercent((segments[index]?.share ?? 0))}
              </span>
            </article>
          ))}
        </div>
      </div>
    </AccordionPanel>
  );
}

function ProductTablePanel({
  rows,
  title,
}: {
  rows: ProductAnalysisRow[];
  title: string;
}) {
  return (
    <StaticPanel title={title} subtitle={`${rows.length} productos`}>
      <ProductTable rows={rows} storageKey={title} />
    </StaticPanel>
  );
}

function SellerGoalsOverviewPanel({
  rows,
  onViewSeller,
}: {
  rows: CommercialDashboardSnapshot['sellers']['goalProgress'];
  onViewSeller: (sellerName: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState title="Sin vendedores disponibles">
        Todavía no hay vendedores con volumen suficiente para mostrar seguimiento.
      </EmptyState>
    );
  }

  return (
    <div className="reports-bar-list">
      {rows.map((row) => (
        <div key={row.sellerName} className="reports-bar-row reports-bar-row-stack">
          <div className="reports-bar-copy">
            <strong>{row.sellerName}</strong>
            <small>
              Facturación {formatCurrency(row.soldAmount)} / meta {formatCurrency(row.salesTarget)}
            </small>
            <small>
              Nuevos {formatNumber(row.newCustomers)} / {formatNumber(row.newCustomersTarget)} · Reactivados {formatNumber(row.reactivatedCustomers)} / {formatNumber(row.reactivatedCustomersTarget)}
            </small>
          </div>
          <div className="reports-bar-track">
            <span style={{ width: `${Math.min(row.salesProgressPct, 100)}%` }} />
          </div>
          <div className="reports-bar-meta">
            <strong>{formatPercent(row.salesProgressPct)}</strong>
            <button type="button" className="secondary-button" onClick={() => onViewSeller(row.sellerName)}>
              Ver
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildSellerGoalDrafts(
  existingGoals: SellerGoalConfig[],
  sellers: Array<{ sellerId: number | null; sellerName: string }>,
) {
  const goals = new Map<string, SellerGoalConfig>();

  existingGoals.forEach((goal) => {
    goals.set(`${goal.sellerId ?? 'seller'}:${goal.sellerName}`, {
      sellerId: goal.sellerId,
      sellerName: goal.sellerName,
      salesTarget: goal.salesTarget ?? 0,
      newCustomersTarget: goal.newCustomersTarget ?? 0,
      reactivatedCustomersTarget: goal.reactivatedCustomersTarget ?? 0,
    });
  });

  sellers.forEach((seller) => {
    const key = `${seller.sellerId ?? 'seller'}:${seller.sellerName}`;
    const existing = goals.get(key);
    goals.set(key, {
      sellerId: seller.sellerId,
      sellerName: seller.sellerName,
      salesTarget: existing?.salesTarget ?? 0,
      newCustomersTarget: existing?.newCustomersTarget ?? 0,
      reactivatedCustomersTarget: existing?.reactivatedCustomersTarget ?? 0,
    });
  });

  return Array.from(goals.values()).sort((left, right) => left.sellerName.localeCompare(right.sellerName, 'es'));
}

function SellerTimelineModal({
  seller,
  onClose,
}: {
  seller: SellerTimelineSummary;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Seguimiento de ${seller.sellerName}`}>
      <section className="modal-card modal-wide">
        <div className="modal-head">
          <h2>{seller.sellerName}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            x
          </button>
        </div>
        <div className="compact-form">
          <div className="reports-kpi-list">
            <KpiBox label="Facturación acumulada" value={formatCurrency(seller.soldAmount.current)} />
            <KpiBox label="Clientes nuevos" value={formatNumber(seller.newCustomers.current)} />
            <KpiBox label="Clientes reactivados" value={formatNumber(seller.reactivatedCustomers.current)} />
            <KpiBox label="Vs. año anterior" value={formatMetricChangeEs(seller.soldAmount)} />
          </div>
          <div className="policy-card-quick-facts">
            <span>Meta facturación: {formatCurrency(seller.goal?.salesTarget ?? 0)}</span>
            <span>Meta clientes nuevos: {formatNumber(seller.goal?.newCustomersTarget ?? 0)}</span>
            <span>Meta reactivados: {formatNumber(seller.goal?.reactivatedCustomersTarget ?? 0)}</span>
          </div>
          <DataTable
            rows={seller.months}
            storageKey={`seller-timeline-${seller.sellerName}`}
            columns={[
              column<SellerTimelineSummary['months'][number]>('month', 'Mes', (row) => row.label, (row) => row.monthKey),
              column<SellerTimelineSummary['months'][number]>('sold', 'Facturación', (row) => formatCurrency(row.soldAmount), (row) => row.soldAmount),
              column<SellerTimelineSummary['months'][number]>('previousSold', 'Facturación año anterior', (row) => formatCurrency(row.previousSoldAmount), (row) => row.previousSoldAmount),
              column<SellerTimelineSummary['months'][number]>('new', 'Clientes nuevos', (row) => formatNumber(row.newCustomers), (row) => row.newCustomers),
              column<SellerTimelineSummary['months'][number]>('previousNew', 'Nuevos año anterior', (row) => formatNumber(row.previousNewCustomers), (row) => row.previousNewCustomers),
              column<SellerTimelineSummary['months'][number]>('reactivated', 'Reactivados', (row) => formatNumber(row.reactivatedCustomers), (row) => row.reactivatedCustomers),
              column<SellerTimelineSummary['months'][number]>('previousReactivated', 'Reactivados año anterior', (row) => formatNumber(row.previousReactivatedCustomers), (row) => row.previousReactivatedCustomers),
            ]}
          />
        </div>
      </section>
    </div>
  );
}

type SellerRankingVariant =
  | 'revenue'
  | 'margin'
  | 'conversion'
  | 'newCustomers'
  | 'atRiskCustomers'
  | 'reactivatedCustomers'
  | 'weightedScore';

function SellerRankingTablePanel({
  rows,
  subtitle,
  title,
  variant,
}: {
  rows: SellerPerformanceRow[];
  subtitle: string;
  title: string;
  variant: SellerRankingVariant;
}) {
  const orderedRows = useMemo(
    () => sortSellerRowsForVariant(rows, variant),
    [rows, variant],
  );

  return (
    <StaticPanel title={title} subtitle={subtitle}>
      <DataTable
        rows={orderedRows}
        storageKey={`${title}-${variant}`}
        columns={buildSellerRankingColumns(variant)}
      />
    </StaticPanel>
  );
}

const sellerCategoryPalette = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

function SellerCategoryMixPanel({
  rows,
}: {
  rows: SellerCategorySummary[];
}) {
  const visibleRows = rows.slice(0, 6);
  const totalShare = visibleRows.reduce((sum, row) => sum + row.sharePct, 0);
  const segments = visibleRows.reduce<
    Array<{
      path: string;
      color: string;
      row: SellerCategorySummary;
    }>
  >((items, row, index) => {
    const previousShare = visibleRows
      .slice(0, index)
      .reduce((sum, currentRow) => sum + currentRow.sharePct, 0);
    const startAngle = (-Math.PI / 2) + (previousShare / 100) * (Math.PI * 2);
    const endAngle = startAngle + (row.sharePct / 100) * (Math.PI * 2);
    items.push({
      path: describePieArc(58, 58, 46, startAngle, endAngle),
      color: sellerCategoryPalette[index % sellerCategoryPalette.length],
      row,
    });
    return items;
  }, []);

  return (
    <article className="panel">
      <div className="panel-header">
        <strong>Participación por categoría</strong>
        <span>Distribución del valor vendido por línea de producto</span>
      </div>
      <div className="reports-panel-body">
        <div className="reports-conversion-team">
          <div className="reports-conversion-team-chart" aria-hidden="true">
            <svg viewBox="0 0 116 116" className="reports-pie-svg">
              <circle cx="58" cy="58" r="46" className="reports-pie-track" />
              {segments.map((segment) => (
                <path
                  key={segment.row.categoryName}
                  d={segment.path}
                  className="reports-pie-segment"
                  style={{ stroke: segment.color }}
                />
              ))}
            </svg>
            <div className="reports-pie-center">
              <strong>{formatPercent(totalShare)}</strong>
              <span>categorías top</span>
            </div>
          </div>
          <div className="reports-conversion-team-legend">
            {visibleRows.map((row, index) => (
              <article key={row.categoryName} className="reports-conversion-team-item">
                <div>
                  <span
                    className="reports-conversion-team-dot"
                    style={{ backgroundColor: sellerCategoryPalette[index % sellerCategoryPalette.length] }}
                  />
                  <strong>{row.categoryName}</strong>
                </div>
                <small>
                  {formatCurrency(row.soldAmount)} · {row.activeSellers} vendedores
                </small>
                <span>
                  {formatPercent(row.sharePct)} | líder: {row.topSellerName ?? 'Sin vendedor'}
                </span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function SellerCategoryOverviewPanel({
  rows,
}: {
  rows: SellerCategorySummary[];
}) {
  const maxValue = Math.max(...rows.map((row) => row.soldAmount), 0);

  return (
    <article className="panel">
      <div className="panel-header">
        <strong>Comparativo entre categorías</strong>
        <span>Barras para distinguir peso relativo y vendedor dominante</span>
      </div>
      <div className="reports-panel-body">
        <div className="reports-bar-list">
          {rows.map((row, index) => (
            <div key={row.categoryName} className="reports-bar-row reports-bar-row-stack">
              <div className="reports-bar-copy">
                <strong>{row.categoryName}</strong>
                <small>
                  {row.topSellerName ?? 'Sin vendedor'} lidera con {formatCurrency(row.topSellerAmount)}
                </small>
              </div>
              <div className="reports-bar-track">
                <span
                  style={{
                    width: `${maxValue > 0 ? (row.soldAmount / maxValue) * 100 : 0}%`,
                    background: sellerCategoryPalette[index % sellerCategoryPalette.length],
                  }}
                />
              </div>
              <div className="reports-bar-meta">
                <strong>{formatCurrency(row.soldAmount)}</strong>
                <small>{formatPercent(row.sharePct)} del total vendido</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function SellerCategoryRankingPanel({
  category,
}: {
  category: SellerCategorySummary;
}) {
  const maxValue = Math.max(...category.sellerRows.map((row) => row.soldAmount), 0);

  return (
    <StaticPanel
      title={`Ranking en ${category.categoryName}`}
      subtitle={`${formatPercent(category.sharePct)} de las ventas totales · ${category.activeSellers} vendedores con ventas`}
    >
      <div className="reports-stack-compact">
        <div className="reports-bar-list">
          {category.sellerRows.slice(0, 8).map((row) => (
            <div key={`${category.categoryName}-${row.sellerName}`} className="reports-bar-row reports-bar-row-stack">
              <div className="reports-bar-copy">
                <strong>{row.sellerName}</strong>
                <small>
                  {formatPercent(row.categorySharePct)} de la categoría · {formatPercent(row.sellerMixPct)} de sus ventas
                </small>
              </div>
              <div className="reports-bar-track">
                <span
                  style={{
                    width: `${maxValue > 0 ? (row.soldAmount / maxValue) * 100 : 0}%`,
                    background: '#2563eb',
                  }}
                />
              </div>
              <div className="reports-bar-meta">
                <strong>{formatCurrency(row.soldAmount)}</strong>
                <small>{formatNumber(row.orderCount)} órdenes</small>
              </div>
            </div>
          ))}
        </div>
        <DataTable
          rows={category.sellerRows}
          storageKey={`seller-category-${category.categoryName}`}
          columns={[
            column<SellerCategoryPerformanceRow>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
            column<SellerCategoryPerformanceRow>('sold', 'Ventas', (row) => formatCurrency(row.soldAmount), (row) => row.soldAmount),
            column<SellerCategoryPerformanceRow>('categoryShare', '% categoría', (row) => formatPercent(row.categorySharePct), (row) => row.categorySharePct),
            column<SellerCategoryPerformanceRow>('sellerMix', '% ventas del vendedor', (row) => formatPercent(row.sellerMixPct), (row) => row.sellerMixPct),
            column<SellerCategoryPerformanceRow>('orders', 'Órdenes', (row) => formatNumber(row.orderCount), (row) => row.orderCount),
            column<SellerCategoryPerformanceRow>('units', 'Unidades', (row) => formatNumber(row.units), (row) => row.units),
          ]}
        />
      </div>
    </StaticPanel>
  );
}

function buildSellerRankingColumns(
  variant: SellerRankingVariant,
): Array<TableColumn<SellerPerformanceRow>> {
  const sellerColumn = column<SellerPerformanceRow>(
    'seller',
    'Vendedor',
    (row) => row.sellerName,
    (row) => row.sellerName,
  );

  switch (variant) {
    case 'revenue':
      return [
        sellerColumn,
        column<SellerPerformanceRow>(
          'sold',
          'Facturación',
          (row) => formatCurrency(row.invoicedAmount),
          (row) => row.invoicedAmount,
        ),
      ];
    case 'margin':
      return [
        sellerColumn,
        column<SellerPerformanceRow>(
          'margin',
          'Margen',
          (row) => formatCurrency(row.margin),
          (row) => row.margin,
        ),
      ];
    case 'conversion':
      return [
        sellerColumn,
        column<SellerPerformanceRow>(
          'conversion',
          'Conversión',
          (row) => formatPercent(row.conversionPct),
          (row) => row.conversionPct,
        ),
      ];
    case 'newCustomers':
      return [
        sellerColumn,
        column<SellerPerformanceRow>(
          'newCustomers',
          'Clientes nuevos',
          (row) => formatNumber(row.newCustomers),
          (row) => row.newCustomers,
        ),
      ];
    case 'atRiskCustomers':
      return [
        sellerColumn,
        column<SellerPerformanceRow>(
          'atRiskCustomers',
          'Clientes en riesgo',
          (row) => formatNumber(row.atRiskCustomers),
          (row) => row.atRiskCustomers,
        ),
        column<SellerPerformanceRow>(
          'atRiskShare',
          '% sobre cartera',
          (row) =>
            formatPercent(
              row.customersServed > 0 ? (row.atRiskCustomers / row.customersServed) * 100 : 0,
            ),
          (row) => (row.customersServed > 0 ? row.atRiskCustomers / row.customersServed : 0),
        ),
      ];
    case 'reactivatedCustomers':
      return [
        sellerColumn,
        column<SellerPerformanceRow>(
          'reactivatedCustomers',
          'Clientes rescatados',
          (row) => formatNumber(row.reactivatedCustomers),
          (row) => row.reactivatedCustomers,
        ),
      ];
    case 'weightedScore':
      return [
        sellerColumn,
        column<SellerPerformanceRow>(
          'weightedScore',
          'Score',
          (row) => row.weightedScore.toFixed(1),
          (row) => row.weightedScore,
        ),
      ];
  }
}

function sortSellerRowsForVariant(
  rows: SellerPerformanceRow[],
  variant: SellerRankingVariant,
) {
  const orderedRows = rows.slice();

  switch (variant) {
    case 'revenue':
      return orderedRows.sort((a, b) => b.invoicedAmount - a.invoicedAmount);
    case 'margin':
      return orderedRows.sort((a, b) => b.margin - a.margin);
    case 'conversion':
      return orderedRows.sort((a, b) => b.conversionPct - a.conversionPct);
    case 'newCustomers':
      return orderedRows.sort((a, b) => b.newCustomers - a.newCustomers);
    case 'atRiskCustomers':
      return orderedRows.sort((a, b) => {
        if (b.atRiskCustomers !== a.atRiskCustomers) return b.atRiskCustomers - a.atRiskCustomers;
        const leftShare = a.customersServed > 0 ? a.atRiskCustomers / a.customersServed : 0;
        const rightShare = b.customersServed > 0 ? b.atRiskCustomers / b.customersServed : 0;
        return rightShare - leftShare;
      });
    case 'reactivatedCustomers':
      return orderedRows.sort((a, b) => b.reactivatedCustomers - a.reactivatedCustomers);
    case 'weightedScore':
      return orderedRows.sort((a, b) => b.weightedScore - a.weightedScore);
  }
}

function ParetoTablePanel({
  summary,
}: {
  summary: {
    title: string;
    statement: string;
    rows: ParetoRow[];
  };
}) {
  return (
    <article className="panel">
      <div className="panel-header">
        <strong>{summary.title}</strong>
        <span>{summary.statement}</span>
      </div>
      <div className="reports-panel-body">
        <DataTable
          rows={summary.rows}
          storageKey={summary.title}
          columns={[
            column<ParetoRow>('position', '#', (row) => row.position, (row) => row.position),
            column<ParetoRow>('label', 'Elemento', (row) => row.label, (row) => row.label),
            column<ParetoRow>('value', 'Valor', (row) => formatCurrency(row.value), (row) => row.value),
            column<ParetoRow>('orders', 'Ordenes', (row) => formatNumber(row.orders), (row) => row.orders),
            column<ParetoRow>('units', 'Unidades', (row) => formatNumber(row.units), (row) => row.units),
            column<ParetoRow>('share', '% individual', (row) => formatPercent(row.individualPct), (row) => row.individualPct),
            column<ParetoRow>('accum', '% acumulado', (row) => formatPercent(row.accumulatedPct), (row) => row.accumulatedPct),
            column<ParetoRow>('class', 'ABC', (row) => row.classification, (row) => row.classification),
          ]}
        />
      </div>
    </article>
  );
}

function ProductTable({
  rows,
  storageKey,
}: {
  rows: ProductAnalysisRow[];
  storageKey: string;
}) {
  return (
    <DataTable
      rows={rows}
      storageKey={storageKey}
      columns={[
        column<ProductAnalysisRow>('product', 'Producto', (row) => row.productName, (row) => row.productName),
        column<ProductAnalysisRow>('category', 'Categoría', (row) => row.categoryName ?? '-', (row) => row.categoryName ?? ''),
        column<ProductAnalysisRow>('revenue', 'Facturación', (row) => formatCurrency(row.revenue), (row) => row.revenue),
        column<ProductAnalysisRow>('margin', 'Margen', (row) => formatCurrency(row.margin), (row) => row.margin),
        column<ProductAnalysisRow>('marginPct', '% margen', (row) => formatPercent(row.marginPct ?? 0), (row) => row.marginPct ?? 0),
        column<ProductAnalysisRow>('units', 'Unidades', (row) => formatNumber(row.units), (row) => row.units),
        column<ProductAnalysisRow>('customers', 'Clientes', (row) => formatNumber(row.uniqueCustomers), (row) => row.uniqueCustomers),
        column<ProductAnalysisRow>('repeat', 'Recompra', (row) => formatPercent(row.repeatPurchaseRate), (row) => row.repeatPurchaseRate),
        column<ProductAnalysisRow>('change', 'Variación', (row) => formatNullablePercent(row.revenueChangePct), (row) => row.revenueChangePct ?? 0),
        column<ProductAnalysisRow>('flags', 'Señales', (row) => row.flags.join(', ') || '-', (row) => row.flags.join(', ')),
      ]}
    />
  );
}

function SellerTable({
  rows,
  storageKey,
}: {
  rows: SellerPerformanceRow[];
  storageKey: string;
}) {
  return (
    <DataTable
      rows={rows}
      storageKey={storageKey}
      columns={[
        column<SellerPerformanceRow>('seller', 'Vendedor', (row) => row.sellerName, (row) => row.sellerName),
        column<SellerPerformanceRow>('quotes', 'Cotizaciones', (row) => formatNumber(row.quotes), (row) => row.quotes),
        column<SellerPerformanceRow>('orders', 'Órdenes', (row) => formatNumber(row.confirmedOrders), (row) => row.confirmedOrders),
        column<SellerPerformanceRow>('conversion', 'Conversión', (row) => formatPercent(row.conversionPct), (row) => row.conversionPct),
        column<SellerPerformanceRow>('sold', 'Ventas confirmadas', (row) => formatCurrency(row.soldAmount), (row) => row.soldAmount),
        column<SellerPerformanceRow>('invoiced', 'Facturación', (row) => formatCurrency(row.invoicedAmount), (row) => row.invoicedAmount),
        column<SellerPerformanceRow>('margin', 'Margen', (row) => formatCurrency(row.margin), (row) => row.margin),
        column<SellerPerformanceRow>('ticket', 'Ticket prom.', (row) => formatCurrency(row.averageTicket), (row) => row.averageTicket),
        column<SellerPerformanceRow>('new', 'Clientes nuevos', (row) => formatNumber(row.newCustomers), (row) => row.newCustomers),
        column<SellerPerformanceRow>('risk', 'En riesgo', (row) => formatNumber(row.atRiskCustomers), (row) => row.atRiskCustomers),
        column<SellerPerformanceRow>('reactivated', 'Rescatados', (row) => formatNumber(row.reactivatedCustomers), (row) => row.reactivatedCustomers),
        column<SellerPerformanceRow>('score', 'Score', (row) => row.weightedScore.toFixed(1), (row) => row.weightedScore),
      ]}
    />
  );
}

function TrendPanel({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <EmptyState title="Sin tendencia">No hay datos para la serie temporal.</EmptyState>;
  }

  const leftPadding = 64;
  const rightPadding = 14;
  const topPadding = 16;
  const bottomPadding = 28;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [
      point.previousInvoicedAmount,
      point.invoicedAmount,
    ]),
  );
  const width = 720;
  const height = 240;
  const chartWidth = width - leftPadding - rightPadding;
  const chartHeight = height - topPadding - bottomPadding;
  const stepX = points.length === 1 ? chartWidth : chartWidth / (points.length - 1);
  const ySteps = 4;
  const gridValues = Array.from({ length: ySteps + 1 }, (_, index) =>
    (maxValue / ySteps) * (ySteps - index),
  );

  const buildLine = (valueGetter: (point: TrendPoint) => number) =>
    points
      .map((point, index) => {
        const x = leftPadding + index * stepX;
        const y = topPadding + chartHeight - (valueGetter(point) / maxValue) * chartHeight;
        return `${x},${y}`;
      })
      .join(' ');
  const previousInvoicedLine = buildLine((point) => point.previousInvoicedAmount);
  const previousInvoicedArea = `${leftPadding},${height - bottomPadding} ${previousInvoicedLine} ${leftPadding + chartWidth},${height - bottomPadding}`;

  return (
    <div className="reports-chart">
      <div className="reports-chart-legend">
        <span><i className="tone-sold"></i>Facturación periodo anterior</span>
        <span><i className="tone-invoiced"></i>Facturación</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg">
        {gridValues.map((gridValue) => {
          const y = topPadding + chartHeight - (gridValue / maxValue) * chartHeight;
          return (
            <g key={gridValue}>
              <line
                x1={leftPadding}
                x2={leftPadding + chartWidth}
                y1={y}
                y2={y}
                className="reports-chart-grid-line"
              />
              <text x={leftPadding - 8} y={y + 4} textAnchor="end" className="reports-chart-axis-label">
                {formatCurrencyCompact(gridValue)}
              </text>
            </g>
          );
        })}
        <polygon
          fill="url(#reports-area-gradient)"
          points={previousInvoicedArea}
        />
        <defs>
          <linearGradient id="reports-area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--reports-chart-previous-fill-strong)" />
            <stop offset="100%" stopColor="var(--reports-chart-previous-fill-soft)" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="var(--reports-chart-previous)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={previousInvoicedLine}
        />
        <polyline
          fill="none"
          stroke="var(--reports-chart-current)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={buildLine((point) => point.invoicedAmount)}
        />
        {points.map((point, index) => {
          const x = leftPadding + index * stepX;
          const y =
            topPadding + chartHeight - (point.previousInvoicedAmount / maxValue) * chartHeight;
          return (
            <circle
              key={point.bucketKey}
              cx={x}
              cy={y}
              r="2.5"
              fill="var(--reports-chart-previous)"
            />
          );
        })}
      </svg>
    </div>
  );
}

function MiniRanking<T>({
  rows,
  primary,
  secondary,
  value,
}: {
  rows: T[];
  primary: (row: T) => string;
  secondary: (row: T) => string;
  value: (row: T) => string;
}) {
  return (
    <div className="reports-bar-list">
      {rows.map((row, index) => (
        <div key={index} className="reports-bar-row">
          <div className="reports-bar-copy">
            <strong>{primary(row)}</strong>
            <small>{secondary(row)}</small>
          </div>
          <div className="reports-bar-meta">
            <strong>{value(row)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function ComparisonRow({
  comparison,
  comparisonLabel,
  formatter,
  label,
}: {
  comparison: CommercialDashboardSnapshot['sales']['soldAmount'];
  comparisonLabel?: string;
  formatter: (value: number) => string;
  label: string;
}) {
  return (
    <div className="policy-inline-status reports-summary-chip">
      <span>{label}</span>
      <strong>{formatter(comparison.current)}</strong>
      <small className={comparison.trend === 'down' ? 'tone-bad' : 'tone-good'}>
        {formatMetricChangeEs(comparison)}
        {comparisonLabel ? ` vs. ${comparisonLabel}` : ''}
      </small>
    </div>
  );
}

function AnnualGrowthPanel({
  growth,
}: {
  growth: AnnualGrowthSnapshot;
}) {
  return (
    <div className="reports-stack-compact">
      <div className="reports-kpi-list">
        <ComparisonRow label="Margen bruto acumulado" comparison={growth.marginAmount} formatter={formatCurrency} />
        <ComparisonRow label="Facturación acumulada" comparison={growth.invoicedAmount} formatter={formatCurrency} />
        <ComparisonRow label="Clientes nuevos acumulados" comparison={growth.newCustomers} formatter={formatNumber} />
      </div>
      <article className="reports-info-card">
        <div className="reports-info-copy">
          <strong>{growth.signalTitle}</strong>
          <p>{growth.signalDescription}</p>
        </div>
      </article>
    </div>
  );
}

function KpiBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>
        <TrendingUp size={18} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function describePieArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
}

function SummaryChip({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="policy-inline-status reports-summary-chip"
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function SettingsModal({
  config,
  onClose,
  onSave,
  sellers,
}: {
  config: ReportsConfig;
  onClose: () => void;
  onSave: (config: ReportsConfig) => void;
  sellers: Array<{ sellerId: number | null; sellerName: string }>;
}) {
  const [draft, setDraft] = useState<ReportsConfig>(config);
  const goalDrafts = useMemo(() => buildSellerGoalDrafts(draft.sellerGoals, sellers), [draft.sellerGoals, sellers]);

  function updateNumeric<K extends keyof ReportsConfig>(key: K, value: number) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateSellerGoal(
    sellerName: string,
    key: keyof Pick<SellerGoalConfig, 'salesTarget' | 'newCustomersTarget' | 'reactivatedCustomersTarget'>,
    value: number,
  ) {
    setDraft((current) => ({
      ...current,
      sellerGoals: buildSellerGoalDrafts(current.sellerGoals, sellers).map((goal) =>
        goal.sellerName === sellerName ? { ...goal, [key]: Math.max(0, value) } : goal,
      ),
    }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Configuración de reportes">
      <section className="modal-card modal-wide">
        <div className="modal-head">
          <h2>Configuración analítica</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            x
          </button>
        </div>
        <div className="compact-form">
          <div className="form-grid">
            <Field label="Cliente reciente (días)">
              <input type="number" value={draft.clientRecentDays} onChange={(event) => updateNumeric('clientRecentDays', Number(event.target.value))} />
            </Field>
            <Field label="Cliente activo (días)">
              <input type="number" value={draft.clientActiveDays} onChange={(event) => updateNumeric('clientActiveDays', Number(event.target.value))} />
            </Field>
            <Field label="En riesgo (días)">
              <input type="number" value={draft.clientRiskDays} onChange={(event) => updateNumeric('clientRiskDays', Number(event.target.value))} />
            </Field>
            <Field label="Casi perdido (días)">
              <input type="number" value={draft.clientAlmostLostDays} onChange={(event) => updateNumeric('clientAlmostLostDays', Number(event.target.value))} />
            </Field>
            <Field label="Dormido (días)">
              <input type="number" value={draft.clientDormantDays} onChange={(event) => updateNumeric('clientDormantDays', Number(event.target.value))} />
            </Field>
            <Field label="Perdido (días)">
              <input type="number" value={draft.clientLostDays} onChange={(event) => updateNumeric('clientLostDays', Number(event.target.value))} />
            </Field>
            <Field label="Mínimo compras frecuente">
              <input type="number" value={draft.frequentPurchaseCount} onChange={(event) => updateNumeric('frequentPurchaseCount', Number(event.target.value))} />
            </Field>
            <Field label="Percentil alto valor">
              <input type="number" step="0.01" value={draft.highValuePercentile} onChange={(event) => updateNumeric('highValuePercentile', Number(event.target.value))} />
            </Field>
            <Field label="Pareto A">
              <input type="number" step="0.01" value={draft.paretoThresholdA} onChange={(event) => updateNumeric('paretoThresholdA', Number(event.target.value))} />
            </Field>
            <Field label="Pareto B">
              <input type="number" step="0.01" value={draft.paretoThresholdB} onChange={(event) => updateNumeric('paretoThresholdB', Number(event.target.value))} />
            </Field>
            <Field label="Agrupación predeterminada">
              <select value={draft.defaultGrouping} onChange={(event) => setDraft({ ...draft, defaultGrouping: event.target.value as ReportGrouping })}>
                <option value="day">Día</option>
                <option value="month">Mes</option>
                <option value="quarter">Trimestre</option>
                <option value="year">Año</option>
              </select>
            </Field>
            <Field label="Métrica Pareto">
              <select value={draft.defaultParetoMetric} onChange={(event) => setDraft({ ...draft, defaultParetoMetric: event.target.value as ParetoMetricKey })}>
                <option value="revenue">Facturación</option>
                <option value="margin">Margen</option>
                <option value="units">Unidades</option>
                <option value="orders">Órdenes</option>
              </select>
            </Field>
            <Field label="Incluir impuestos">
              <select value={draft.includeTaxes ? 'yes' : 'no'} onChange={(event) => setDraft({ ...draft, includeTaxes: event.target.value === 'yes' })}>
                <option value="no">No</option>
                <option value="yes">Sí</option>
              </select>
            </Field>
            <Field label="Método de margen">
              <select value={draft.marginMethod} onChange={(event) => setDraft({ ...draft, marginMethod: event.target.value as ReportsConfig['marginMethod'] })}>
                <option value="line_margin">Margen directo de línea</option>
                <option value="line_purchase_price">Costo de línea</option>
                <option value="product_standard_cost">Costo estándar de producto</option>
              </select>
            </Field>
          </div>

          <h3>Ponderaciones del ranking compuesto</h3>
          <div className="form-grid">
            <Field label="Facturación %">
              <input type="number" value={draft.sellerRankingWeights.sold_amount} onChange={(event) => setDraft({ ...draft, sellerRankingWeights: { ...draft.sellerRankingWeights, sold_amount: Number(event.target.value) } })} />
            </Field>
            <Field label="Margen %">
              <input type="number" value={draft.sellerRankingWeights.margin} onChange={(event) => setDraft({ ...draft, sellerRankingWeights: { ...draft.sellerRankingWeights, margin: Number(event.target.value) } })} />
            </Field>
            <Field label="Conversión %">
              <input type="number" value={draft.sellerRankingWeights.conversion} onChange={(event) => setDraft({ ...draft, sellerRankingWeights: { ...draft.sellerRankingWeights, conversion: Number(event.target.value) } })} />
            </Field>
            <Field label="Clientes nuevos %">
              <input type="number" value={draft.sellerRankingWeights.new_customers} onChange={(event) => setDraft({ ...draft, sellerRankingWeights: { ...draft.sellerRankingWeights, new_customers: Number(event.target.value) } })} />
            </Field>
            <Field label="Retencion %">
              <input type="number" value={draft.sellerRankingWeights.retention} onChange={(event) => setDraft({ ...draft, sellerRankingWeights: { ...draft.sellerRankingWeights, retention: Number(event.target.value) } })} />
            </Field>
          </div>

          <h3>Metas por vendedor</h3>
          {goalDrafts.length > 0 ? (
            <div className="form-grid">
              {goalDrafts.map((goal) => (
                <article key={`${goal.sellerId ?? 'seller'}-${goal.sellerName}`} className="panel reports-goal-card">
                  <div className="panel-header">
                    <strong>{goal.sellerName}</strong>
                    <span>Seguimiento comercial</span>
                  </div>
                  <div className="reports-panel-body reports-stack-compact">
                    <Field label="Meta de ventas">
                      <input type="number" value={goal.salesTarget} onChange={(event) => updateSellerGoal(goal.sellerName, 'salesTarget', Number(event.target.value))} />
                    </Field>
                    <Field label="Meta clientes nuevos">
                      <input type="number" value={goal.newCustomersTarget} onChange={(event) => updateSellerGoal(goal.sellerName, 'newCustomersTarget', Number(event.target.value))} />
                    </Field>
                    <Field label="Meta clientes reactivados">
                      <input type="number" value={goal.reactivatedCustomersTarget} onChange={(event) => updateSellerGoal(goal.sellerName, 'reactivatedCustomersTarget', Number(event.target.value))} />
                    </Field>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="page-subtitle">Carga el reporte de vendedores para poder programar metas por vendedor.</p>
          )}

          <div className="permission-modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              Guardar configuración
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DataTable<T>({
  columns,
  rows,
  storageKey,
}: {
  columns: Array<TableColumn<T>>;
  rows: T[];
  storageKey: string;
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const normalized = search.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((column) => {
        const value = column.sortValue ? column.sortValue(row) : '';
        return `${value}`.toLowerCase().includes(normalized);
      }),
    );
  }, [columns, rows, search]);

  const sortableColumns = useMemo(
    () => columns.filter((column) => column.sortable !== false && column.sortValue),
    [columns],
  );

  const sortedRows = useMemo(() => {
    if (!sortBy) return filteredRows;
    const column = columns.find((item) => item.id === sortBy);
    if (!column?.sortValue) return filteredRows;
    const sortValue = column.sortValue;
    return [...filteredRows].sort((left, right) => {
      const leftValue = sortValue(left);
      const rightValue = sortValue(right);
      if (leftValue === rightValue) return 0;
      const result = leftValue > rightValue ? 1 : -1;
      return direction === 'asc' ? result : -result;
    });
  }, [columns, direction, filteredRows, sortBy]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = sortedRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <label className="inline-search">
          <Filter size={16} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Filtrar tabla"
          />
        </label>
        <label className="reports-table-sort-control">
          <span>Ordenar por</span>
          <select
            value={sortBy ?? ''}
            onChange={(event) => {
              setSortBy(event.target.value || null);
              setDirection('desc');
              setPage(1);
            }}
          >
            <option value="">Orden original</option>
            {sortableColumns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label className="reports-table-sort-control">
          <span>Dirección</span>
          <select
            value={direction}
            disabled={!sortBy}
            onChange={(event) => {
              setDirection(event.target.value as 'asc' | 'desc');
              setPage(1);
            }}
          >
            <option value="desc">Mayor a menor</option>
            <option value="asc">Menor a mayor</option>
          </select>
        </label>
        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadCsv(columns, sortedRows, storageKey)}
          >
            <Download size={16} />
            Exportar
          </button>
          <span>
            Pagina {currentPage} de {pageCount}
          </span>
        </div>
      </div>
      <table className="records-table reports-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id}>
                <button
                  type="button"
                  className="folio-button"
                  onClick={() => {
                    if (!column.sortable && !column.sortValue) return;
                    setPage(1);
                    if (sortBy === column.id) {
                      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortBy(column.id);
                      setDirection('desc');
                    }
                  }}
                >
                  {column.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.id}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {visibleRows.length === 0 ? (
        <EmptyState title="Sin resultados">No hay filas para mostrar con el filtro actual.</EmptyState>
      ) : null}
      <div className="permission-modal-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setPage(Math.max(1, Math.min(currentPage, pageCount) - 1))}
          disabled={currentPage <= 1}
        >
          Anterior
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setPage((current) => Math.min(pageCount, Math.min(currentPage, current) + 1))}
          disabled={currentPage >= pageCount}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function column<T>(
  id: string,
  label: string,
  render: (row: T) => ReactNode,
  sortValue: (row: T) => string | number,
): TableColumn<T> {
  return {
    id,
    label,
    render,
    sortable: true,
    sortValue,
  };
}

function renderStatusPill(status: string, riskLevel: RiskLevel = 'bajo') {
  return (
    <span className={`permission-chip reports-status-pill priority-${riskLevel}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function renderOdooLink(
  dataset: OdooCommercialDataset,
  model: string,
  recordId: number,
  label: string,
) {
  const url = `${dataset.odooBaseUrl}/web#id=${recordId}&model=${model}&view_type=form`;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function scheduleReportIdleWork(callback: () => void) {
  if (typeof window === 'undefined') {
    callback();
    return undefined;
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const idleId = idleWindow.requestIdleCallback(callback, { timeout: 1800 });
    return () => idleWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, 900);
  return () => window.clearTimeout(timeoutId);
}

function loadStoredConfig() {
  const raw = window.localStorage.getItem(REPORTS_CONFIG_STORAGE_KEY);
  if (!raw) return defaultReportsConfig;
  try {
    const parsed = JSON.parse(raw) as ReportsConfig;
    return {
      ...defaultReportsConfig,
      ...parsed,
      sellerRankingWeights: {
        ...defaultReportsConfig.sellerRankingWeights,
        ...parsed.sellerRankingWeights,
      },
      sellerGoals: Array.isArray(parsed.sellerGoals) ? parsed.sellerGoals : defaultReportsConfig.sellerGoals,
    };
  } catch {
    return defaultReportsConfig;
  }
}

export function buildDefaultFilters(visibilityScope: ReportVisibilityScope): ReportFilters {
  const quickRange = buildQuickRange('last_7_days');
  return {
    ...quickRange,
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
    grouping: 'day',
    visibilityScope,
  };
}

function buildOperationalNotificationFilters(
  visibilityScope: ReportVisibilityScope,
): ReportFilters {
  const quickRange = buildQuickRange('last_30_days');
  return {
    ...buildDefaultFilters(visibilityScope),
    startDate: quickRange.startDate,
    endDate: quickRange.endDate,
    visibilityScope,
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
  };
}

function mergeStoredConfig(rawConfig: Partial<ReportsConfig> | ReportsConfig) {
  const parsed = rawConfig ?? {};
  return {
    ...defaultReportsConfig,
    ...parsed,
    sellerRankingWeights: {
      ...defaultReportsConfig.sellerRankingWeights,
      ...(parsed.sellerRankingWeights ?? {}),
    },
    sellerGoals: Array.isArray(parsed.sellerGoals) ? parsed.sellerGoals : defaultReportsConfig.sellerGoals,
  } satisfies ReportsConfig;
}

function mergeStoredFilters(
  rawFilters: Partial<ReportFilters> | null | undefined,
  visibilityScope: ReportVisibilityScope,
): ReportFilters {
  const defaults = buildDefaultFilters(visibilityScope);
  if (!rawFilters) {
    return defaults;
  }

  if (shouldMigrateLegacyDefaultFilters(rawFilters)) {
    return defaults;
  }

  const sellerIds = Array.isArray(rawFilters.sellerIds)
    ? rawFilters.sellerIds.filter((value) => Number.isFinite(value))
    : rawFilters.sellerId
      ? [rawFilters.sellerId]
      : [];
  const companyIds = Array.isArray(rawFilters.companyIds)
    ? rawFilters.companyIds.filter((value) => Number.isFinite(value))
    : rawFilters.companyId
      ? [rawFilters.companyId]
      : [];

  return {
    ...defaults,
    ...rawFilters,
    startDate: defaults.startDate,
    endDate: defaults.endDate,
    companyId: null,
    companyIds: visibilityScope === 'own' ? [] : companyIds,
    sellerId: null,
    sellerIds: visibilityScope === 'own' ? [] : sellerIds,
    grouping: defaults.grouping,
    visibilityScope,
  };
}

function alignFiltersWithDataset(
  filters: ReportFilters,
  dataset: OdooCommercialDataset,
  applyDefaultCompany: boolean,
): ReportFilters {
  const validCompanyIds = new Set(dataset.availableFilters.companies.map((option) => Number(option.id)));
  const companyOptions = normalizeNumberOptions(dataset.availableFilters.companies);
  const sellerOptions = normalizeNumberOptions(dataset.availableFilters.sellers);
  const scopedCompanyId =
    dataset.scopeApplied === 'own' ? Number(dataset.companyScope?.id) : null;
  const scopedSellerId =
    dataset.scopeApplied === 'own' ? Number(dataset.sellerScope?.id) : null;
  const defaultCompany = dataset.availableFilters.companies.find(
    (option) =>
      [DEFAULT_COMPANY_FILTER_LABEL, DEFAULT_COMPANY_FILTER_NAME].some(
        (companyName) => normalizeText(option.label) === normalizeText(companyName),
      ),
  );

  const companyIds = resolveActiveCompanyIds(filters, dataset.availableFilters.companies);
  const noCompaniesSelected = filters.companyIds?.includes(EMPTY_FILTER_SELECTION_ID) ?? false;
  const validCompanyFilterIds = companyIds.filter((companyId) =>
    companyOptions.some((option) => option.id === companyId),
  );
  const sellerIds = resolveActiveSellerIds(filters, dataset.availableFilters.sellers);
  const noSellersSelected = filters.sellerIds?.includes(EMPTY_FILTER_SELECTION_ID) ?? false;
  const validSellerIds = sellerIds.filter((sellerId) =>
    sellerOptions.some((option) => option.id === sellerId),
  );

  return {
    ...filters,
    companyId: null,
    companyIds:
      Number.isFinite(scopedCompanyId)
        ? [scopedCompanyId as number]
        : noCompaniesSelected
        ? [EMPTY_FILTER_SELECTION_ID]
        : validCompanyFilterIds.length > 0
        ? validCompanyFilterIds
        : applyDefaultCompany && defaultCompany && validCompanyIds.has(Number(defaultCompany.id))
          ? [Number(defaultCompany.id)]
          : companyOptions.map((option) => option.id),
    sellerId: null,
    sellerIds:
      Number.isFinite(scopedSellerId)
        ? [scopedSellerId as number]
        : noSellersSelected
        ? [EMPTY_FILTER_SELECTION_ID]
        : validSellerIds.length > 0
        ? validSellerIds
        : sellerOptions.map((option) => option.id),
  };
}

function mergeSellerCatalog(
  current: Array<{ sellerId: number | null; sellerName: string }>,
  options: ReportOption[],
) {
  const catalog = new Map<string, { sellerId: number | null; sellerName: string }>();

  current.forEach((seller) => {
    catalog.set(`${seller.sellerId ?? 'seller'}:${seller.sellerName}`, seller);
  });

  normalizeNumberOptions(options).forEach((option) => {
    catalog.set(`${option.id}:${option.label}`, {
      sellerId: option.id,
      sellerName: option.label,
    });
  });

  return Array.from(catalog.values()).sort((left, right) => left.sellerName.localeCompare(right.sellerName, 'es'));
}

function areFiltersEqual(left: ReportFilters, right: ReportFilters) {
  return (
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.companyId === right.companyId &&
    sameNumberList(left.companyIds, right.companyIds) &&
    left.sellerId === right.sellerId &&
    sameNumberList(left.sellerIds, right.sellerIds) &&
    left.teamId === right.teamId &&
    left.customerId === right.customerId &&
    left.productId === right.productId &&
    left.categoryId === right.categoryId &&
    left.currencyCode === right.currencyCode &&
    left.channel === right.channel &&
    left.stateScope === right.stateScope &&
    left.grouping === right.grouping &&
    left.visibilityScope === right.visibilityScope
  );
}

function sameNumberList(left?: number[], right?: number[]) {
  const leftList = left ?? [];
  const rightList = right ?? [];
  if (leftList.length !== rightList.length) return false;
  return leftList.every((value, index) => value === rightList[index]);
}

function normalizeNumberOptions(options: ReportOption[]) {
  return options
    .map((option) => ({ id: Number(option.id), label: option.label }))
    .filter((option) => Number.isFinite(option.id));
}

function resolveActiveCompanyIds(filters: ReportFilters, options: ReportOption[]) {
  const optionIds = normalizeNumberOptions(options).map((option) => option.id);
  if (filters.companyIds?.includes(EMPTY_FILTER_SELECTION_ID)) {
    return [EMPTY_FILTER_SELECTION_ID];
  }

  if (Array.isArray(filters.companyIds) && filters.companyIds.length > 0) {
    return filters.companyIds.filter((companyId) => optionIds.includes(companyId));
  }

  if (filters.companyId !== null && filters.companyId !== undefined && optionIds.includes(filters.companyId)) {
    return [filters.companyId];
  }

  return optionIds;
}

function resolveActiveSellerIds(filters: ReportFilters, options: ReportOption[]) {
  const optionIds = normalizeNumberOptions(options).map((option) => option.id);
  if (filters.sellerIds?.includes(EMPTY_FILTER_SELECTION_ID)) {
    return [EMPTY_FILTER_SELECTION_ID];
  }

  if (Array.isArray(filters.sellerIds) && filters.sellerIds.length > 0) {
    return filters.sellerIds.filter((sellerId) => optionIds.includes(sellerId));
  }

  if (filters.sellerId !== null && filters.sellerId !== undefined && optionIds.includes(filters.sellerId)) {
    return [filters.sellerId];
  }

  return optionIds;
}

function toggleSellerSelection(selectedIds: number[], sellerId: number, allIds: number[]) {
  const currentIds = selectedIds.length > 0 ? selectedIds : allIds;
  const nextIds = currentIds.includes(sellerId)
    ? currentIds.filter((value) => value !== sellerId)
    : [...currentIds, sellerId];

  return nextIds.length > 0 ? nextIds : allIds;
}

function toggleDraftSellerSelection(selectedIds: number[], sellerId: number) {
  return selectedIds.includes(sellerId)
    ? selectedIds.filter((value) => value !== sellerId)
    : [...selectedIds, sellerId];
}

function formatSellerSelectionLabel(selectedIds: number[], options: Array<{ id: number; label: string }>) {
  if (selectedIds.includes(EMPTY_FILTER_SELECTION_ID)) return 'Ninguno';
  if (options.length === 0) return 'Sin opciones';
  if (selectedIds.length === 0 || selectedIds.length === options.length) return 'Todos';
  if (selectedIds.length === 1) {
    return options.find((option) => option.id === selectedIds[0])?.label ?? '1 vendedor';
  }
  return `${selectedIds.length} vendedores`;
}

function formatCompanySelectionLabel(selectedIds: number[], options: Array<{ id: number; label: string }>) {
  if (selectedIds.includes(EMPTY_FILTER_SELECTION_ID)) return 'Ninguna';
  if (options.length === 0) return 'Sin opciones';
  if (selectedIds.length === 0 || selectedIds.length === options.length) return 'Todas';
  if (selectedIds.length === 1) {
    return options.find((option) => option.id === selectedIds[0])?.label ?? '1 compañía';
  }
  return `${selectedIds.length} compañías`;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildQuickRange(key: QuickRangeKey) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const start = new Date(end);

  if (key === 'today') {
    return { startDate: toDateInput(start), endDate: toDateInput(end) };
  }

  if (key === 'last_7_days') {
    start.setUTCDate(end.getUTCDate() - 6);
    return { startDate: toDateInput(start), endDate: toDateInput(end) };
  }

  if (key === 'last_30_days') {
    start.setUTCDate(end.getUTCDate() - 29);
    return { startDate: toDateInput(start), endDate: toDateInput(end) };
  }

  if (key === 'current_month') {
    const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    return { startDate: toDateInput(monthStart), endDate: toDateInput(end) };
  }

  if (key === 'previous_month') {
    const prevMonthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
    return { startDate: toDateInput(prevMonthStart), endDate: toDateInput(prevMonthEnd) };
  }

  if (key === 'current_quarter') {
    const quarterMonth = Math.floor(end.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(end.getUTCFullYear(), quarterMonth, 1));
    return { startDate: toDateInput(quarterStart), endDate: toDateInput(end) };
  }

  if (key === 'current_year') {
    const yearStart = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
    return { startDate: toDateInput(yearStart), endDate: toDateInput(end) };
  }

  const previousYearStart = new Date(Date.UTC(end.getUTCFullYear() - 1, 0, 1));
  const previousYearEnd = new Date(Date.UTC(end.getUTCFullYear() - 1, 11, 31));
  return { startDate: toDateInput(previousYearStart), endDate: toDateInput(previousYearEnd) };
}

function recommendedGroupingForRange(range: { startDate: string; endDate: string }) {
  const days = diffRangeDays(range.startDate, range.endDate);
  if (days <= 45) return 'day';
  if (days <= 210) return 'month';
  if (days <= 540) return 'quarter';
  return 'year';
}

function diffRangeDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isFullMonthRange(start: Date, end: Date) {
  return (
    start.getUTCDate() === 1 &&
    end.getUTCFullYear() === start.getUTCFullYear() &&
    end.getUTCMonth() === start.getUTCMonth() &&
    end.getUTCDate() ===
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

function isFullQuarterRange(start: Date, end: Date) {
  const quarterStartMonth = Math.floor(start.getUTCMonth() / 3) * 3;
  return (
    start.getUTCDate() === 1 &&
    start.getUTCMonth() === quarterStartMonth &&
    end.getUTCMonth() === quarterStartMonth + 2 &&
    end.getUTCDate() ===
      new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

function isFullYearRange(start: Date, end: Date) {
  return (
    start.getUTCMonth() === 0 &&
    start.getUTCDate() === 1 &&
    end.getUTCMonth() === 11 &&
    end.getUTCDate() === 31
  );
}

function parseNullableNumber(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeReportsSection(value: string | null): ReportsSection | null {
  if (
    value === 'executive' ||
    value === 'conversion' ||
    value === 'clients' ||
    value === 'products' ||
    value === 'sellers' ||
    value === 'purchases' ||
    value === 'pareto' ||
    value === 'forecasts' ||
    value === 'details'
  ) {
    return value;
  }

  return null;
}

function normalizeReportDetailKey(value: string | null): DetailKey | null {
  if (
    value === 'pendingQuotes' ||
    value === 'expiredQuotes' ||
    value === 'cancelledQuotes' ||
    value === 'convertedQuotes' ||
    value === 'confirmedOrders' ||
    value === 'postedInvoices' ||
    value === 'atRiskClients' ||
    value === 'dormantClients' ||
    value === 'lostClients' ||
    value === 'reactivatedClients' ||
    value === 'negativeMarginProducts' ||
    value === 'lowConversionSellers'
  ) {
    return value;
  }

  return null;
}

function detectQuickRange(filters: ReportFilters): QuickRangeKey {
  const keys: QuickRangeKey[] = [
    'today',
    'last_7_days',
    'last_30_days',
    'current_month',
    'previous_month',
    'current_quarter',
    'current_year',
    'previous_year',
  ];

  return (
    keys.find((key) => {
      const range = buildQuickRange(key);
      return range.startDate === filters.startDate && range.endDate === filters.endDate;
    }) ?? 'last_7_days'
  );
}

function shouldMigrateLegacyDefaultFilters(rawFilters: Partial<ReportFilters>) {
  const legacyRange = buildQuickRange('last_30_days');

  if (
    rawFilters.startDate !== legacyRange.startDate ||
    rawFilters.endDate !== legacyRange.endDate
  ) {
    return false;
  }

  const hasOtherExplicitFilters =
    rawFilters.teamId !== null ||
    rawFilters.customerId !== null ||
    rawFilters.productId !== null ||
    rawFilters.categoryId !== null ||
    rawFilters.currencyCode !== null ||
    rawFilters.channel !== null ||
    rawFilters.stateScope === 'confirmed' ||
    rawFilters.grouping === 'month' ||
    rawFilters.grouping === 'quarter' ||
    rawFilters.grouping === 'year';

  return !hasOtherExplicitFilters;
}

function buildPreviousPeriodRange(filters: ReportFilters) {
  const currentStart = new Date(`${filters.startDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${filters.endDate}T00:00:00.000Z`);

  if (isFullMonthRange(currentStart, currentEnd)) {
    const previousMonthEnd = new Date(
      Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0),
    );
    const previousMonthStart = new Date(
      Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1),
    );
    return {
      startDate: toDateInput(previousMonthStart),
      endDate: toDateInput(previousMonthEnd),
    };
  }

  if (isFullQuarterRange(currentStart, currentEnd)) {
    const quarterStartMonth = Math.floor(currentStart.getUTCMonth() / 3) * 3;
    const previousQuarterStartMonth = quarterStartMonth - 3;
    return {
      startDate: toDateInput(
        new Date(Date.UTC(currentStart.getUTCFullYear(), previousQuarterStartMonth, 1)),
      ),
      endDate: toDateInput(
        new Date(Date.UTC(currentStart.getUTCFullYear(), previousQuarterStartMonth + 3, 0)),
      ),
    };
  }

  if (isFullYearRange(currentStart, currentEnd)) {
    return {
      startDate: toDateInput(new Date(Date.UTC(currentStart.getUTCFullYear() - 1, 0, 1))),
      endDate: toDateInput(new Date(Date.UTC(currentStart.getUTCFullYear() - 1, 11, 31))),
    };
  }

  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const previousEnd = new Date(currentStart.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - durationMs);

  return {
    startDate: toDateInput(previousStart),
    endDate: toDateInput(previousEnd),
  };
}

function formatReferenceDateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const start = formatter.format(new Date(`${startDate}T00:00:00.000Z`));
  const end = formatter.format(new Date(`${endDate}T00:00:00.000Z`));
  return `${start} - ${end}`;
}

function formatReferenceComparisonRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const start = formatter.format(new Date(`${startDate}T00:00:00.000Z`));
  const end = formatter.format(new Date(`${endDate}T00:00:00.000Z`));
  const year = new Date(`${endDate}T00:00:00.000Z`).getUTCFullYear();
  return `${start} - ${end} ${year}`;
}

function formatMetricChangeChip(comparison: ExecutiveMetric['comparison']) {
  if (comparison.differencePct === null) return '0.0%';
  const prefix = comparison.differencePct > 0 ? '↑' : comparison.differencePct < 0 ? '↓' : '•';
  return `${prefix} ${Math.abs(comparison.differencePct).toFixed(1)}%`;
}

function formatRelativeUpdate(isoDate: string | null) {
  if (!isoDate) return 'Actualizado hace unos minutos';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `Actualizado: hace ${diffMinutes} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  return `Actualizado: hace ${diffHours} h`;
}

function buildFiltersSummary(filters: ReportFilters) {
  const companySummary = buildCompanySummaryLabel(filters);
  const sellerSummary = buildSellerSummaryLabel(filters);
  const parts = [
    `${filters.startDate} a ${filters.endDate}`,
    companySummary,
    sellerSummary,
    filters.teamId ? `Equipo ${filters.teamId}` : null,
    filters.customerId ? `Cliente ${filters.customerId}` : null,
    filters.productId ? `Producto ${filters.productId}` : null,
    filters.categoryId ? `Categoría ${filters.categoryId}` : null,
    filters.currencyCode ? `Moneda ${filters.currencyCode}` : null,
    filters.channel ? `Canal ${filters.channel}` : null,
    filters.stateScope !== 'all' ? `Estado ${filters.stateScope}` : null,
    `Agrupación ${groupingLabel(filters.grouping)}`,
  ].filter(Boolean);

  return parts.join(' · ');
}

function groupingLabel(grouping: ReportGrouping) {
  if (grouping === 'month') return 'Mes';
  if (grouping === 'quarter') return 'Trimestre';
  if (grouping === 'year') return 'Año';
  return 'Día';
}

function mapHallazgoTone(level: HallazgoLevel) {
  if (level === 'critico') return 'warning';
  if (level === 'atencion') return 'warning';
  if (level === 'positivo') return 'good';
  return 'neutral';
}

function formatMetricChange(comparison: ExecutiveMetric['comparison']) {
  if (comparison.differencePct === null) return 'Sin comparación';
  return `${comparison.differencePct >= 0 ? '+' : ''}${comparison.differencePct.toFixed(1)}% vs. período anterior`;
}

function buildFiltersSummaryEs(filters: ReportFilters) {
  const companySummary = buildCompanySummaryLabel(filters);
  const sellerSummary = buildSellerSummaryLabel(filters);
  const parts = [
    `${filters.startDate} a ${filters.endDate}`,
    companySummary,
    sellerSummary,
    filters.teamId ? `Equipo ${filters.teamId}` : null,
    filters.customerId ? `Cliente ${filters.customerId}` : null,
    filters.productId ? `Producto ${filters.productId}` : null,
    filters.categoryId ? `Categoría ${filters.categoryId}` : null,
    filters.currencyCode ? `Moneda ${filters.currencyCode}` : null,
    filters.channel ? `Canal ${filters.channel}` : null,
    filters.stateScope !== 'all' ? `Estado ${filters.stateScope}` : null,
    `Agrupación ${groupingLabelEs(filters.grouping)}`,
  ].filter(Boolean);

  return parts.join(' · ');
}

function buildCompanySummaryLabel(filters: ReportFilters) {
  if (filters.companyIds?.includes(EMPTY_FILTER_SELECTION_ID)) {
    return 'Ninguna compañía';
  }

  if (Array.isArray(filters.companyIds) && filters.companyIds.length > 0) {
    return filters.companyIds.length === 1 ? '1 compañía' : `${filters.companyIds.length} compañías`;
  }

  if (filters.companyId) {
    return `Compañía ${filters.companyId}`;
  }

  return null;
}

function buildSellerSummaryLabel(filters: ReportFilters) {
  if (filters.sellerIds?.includes(EMPTY_FILTER_SELECTION_ID)) {
    return 'Ningún vendedor';
  }

  if (Array.isArray(filters.sellerIds) && filters.sellerIds.length > 0) {
    return filters.sellerIds.length === 1 ? '1 vendedor' : `${filters.sellerIds.length} vendedores`;
  }

  if (filters.sellerId) {
    return `Vendedor ${filters.sellerId}`;
  }

  return null;
}

function groupingLabelEs(grouping: ReportGrouping) {
  if (grouping === 'month') return 'Mes';
  if (grouping === 'quarter') return 'Trimestre';
  if (grouping === 'year') return 'Año';
  return 'Día';
}

function formatMetricChangeEs(comparison: ExecutiveMetric['comparison']) {
  if (comparison.differencePct === null) return 'Sin comparación';
  return `${comparison.differencePct >= 0 ? '+' : ''}${comparison.differencePct.toFixed(1)}% vs. período anterior`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyCompact(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatNullablePercent(value: number | null) {
  return value === null ? '-' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNullableNumber(value: number | null) {
  return value === null ? '-' : formatNumber(value);
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function downloadCsv<T>(columns: Array<TableColumn<T>>, rows: T[], storageKey: string) {
  const csvRows = [
    columns.map((column) => `"${column.label.replaceAll('"', '""')}"`).join(','),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const rendered = column.sortValue ? column.sortValue(row) : '';
          return `"${`${rendered}`.replaceAll('"', '""')}"`;
        })
        .join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${storageKey}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildAgentComprehensiveReport(
  snapshot: CommercialDashboardSnapshot,
  score: AgentPerformanceScore,
): SectionReport {
  const profile = snapshot.agentProfile;
  if (!profile) {
    return buildExecutiveSectionReport(snapshot, snapshot.hallazgos);
  }
  const generatedAtIso = new Date().toISOString();
  const sections: AgentProfileSectionKey[] = [
    'conversion',
    'clients',
    'products',
    'sales',
    'pareto',
  ];
  const highlights = sections.flatMap((section) => {
    const analysis = profile[section] as AgentYearSection;
    const title = agentProfileSectionMeta[section].title;
    return [
      ...analysis.positives
        .filter((item) => item.tone !== 'neutral')
        .slice(0, 1)
        .map((item) => `Fortaleza · ${title}: ${item.title}. ${item.detail}`),
      ...analysis.attention
        .filter((item) => item.tone !== 'neutral')
        .slice(0, 1)
        .map((item) => `Prioridad · ${title}: ${item.title}. ${item.detail}`),
    ];
  });
  const trendPoints = snapshot.trend.slice(-12);
  const categoryRows = profile.sales.rows.slice(0, 8);
  const clientRows = profile.clients.rows.slice(0, 8);

  return {
    fileBase: `reporte-integral-${normalizeFileName(profile.sellerName)}`,
    companyName: profile.companyName || REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    sellerName: profile.sellerName,
    position: 'Agente de ventas',
    title: `Reporte integral de desempeño · ${profile.sellerName}`,
    subtitle: `${profile.currentPeriodLabel} comparado con ${profile.previousYearPeriodLabel}. ${profile.comparisonContext}.`,
    objective:
      'Presentar una lectura integral y accionable del desempeño del agente para reconocer fortalezas, recuperar oportunidades y priorizar clientes, productos y actividades comerciales.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    score,
    kpis: [
      {
        label: 'Calificación comercial',
        value: `${score.total}/100`,
        note: score.rating,
      },
      ...profile.summary.metrics.map((metric) => ({
        label: metric.label,
        value: formatAgentMetricValueUi(metric.comparison.current, metric.format),
        note: `${formatAgentComparisonDelta(metric.comparison)} vs. ${profile.previousYearPeriodLabel}`,
      })),
    ],
    highlights,
    charts: [
      {
        title: 'Evolución de facturación',
        subtitle: 'Periodo actual frente al mismo periodo del año anterior',
        labels: trendPoints.map((point) => point.label),
        series: [
          {
            label: 'Facturación actual',
            color: '#b66a4d',
            values: trendPoints.map((point) => point.invoicedAmount),
            formatter: 'currency',
          },
          {
            label: 'Año anterior',
            color: '#6c88a8',
            values: trendPoints.map((point) => point.previousInvoicedAmount),
            formatter: 'currency',
          },
        ],
      },
      {
        title: 'Ventas por categoría',
        subtitle: 'Mezcla comercial del agente',
        labels: categoryRows.map((row) => row.label),
        series: [
          {
            label: 'Periodo actual',
            color: '#8c6958',
            values: categoryRows.map((row) => row.current),
            formatter: 'currency',
          },
          {
            label: 'Año anterior',
            color: '#9aa6a1',
            values: categoryRows.map((row) => row.previous),
            formatter: 'currency',
          },
        ],
      },
      {
        title: 'Clientes que más aportan',
        subtitle: 'Comparativo de facturación por cliente',
        labels: clientRows.map((row) => row.label),
        series: [
          {
            label: 'Periodo actual',
            color: '#74805d',
            values: clientRows.map((row) => row.current),
            formatter: 'currency',
          },
          {
            label: 'Año anterior',
            color: '#c6b7aa',
            values: clientRows.map((row) => row.previous),
            formatter: 'currency',
          },
        ],
      },
    ],
    tables: sections.map((section) => buildAgentReportTable(profile, section)),
    bibliography: [...SALES_PERFORMANCE_BIBLIOGRAPHY],
  };
}

function buildAgentReportTable(
  profile: AgentPerformanceProfile,
  section: AgentProfileSectionKey,
): ReportTable {
  const analysis = profile[section] as AgentYearSection;
  const meta = agentProfileSectionMeta[section];
  return {
    title: meta.title,
    columns: [
      meta.rowLabel,
      'Periodo actual',
      'Mismo periodo año anterior',
      'Variación',
      ...(section === 'conversion' ? [] : ['Participación actual']),
    ],
    rows: analysis.rows.slice(0, 20).map((row) => [
      row.label,
      formatAgentDimensionValue(row.current, meta.rowFormat),
      formatAgentDimensionValue(row.previous, meta.rowFormat),
      row.differencePct === null
        ? row.difference === 0
          ? 'Sin cambio'
          : 'Sin base anterior'
        : `${row.differencePct >= 0 ? '+' : ''}${row.differencePct.toFixed(1)}%`,
      ...(section === 'conversion' ? [] : [formatPercent(row.currentSharePct)]),
    ]),
  };
}

function buildAgentProfileSectionReport(
  snapshot: CommercialDashboardSnapshot,
  section: AgentProfileSectionKey,
): SectionReport {
  const profile = snapshot.agentProfile;
  if (!profile) {
    return buildExecutiveSectionReport(snapshot, snapshot.hallazgos);
  }
  const generatedAtIso = new Date().toISOString();
  const analysis = profile[section] as AgentYearSection;
  const meta = agentProfileSectionMeta[section];
  const highlights = [
    ...analysis.positives.map((item) => `Fortaleza: ${item.title}. ${item.detail}`),
    ...analysis.attention.map((item) => `Atención: ${item.title}. ${item.detail}`),
  ];

  return {
    fileBase: `reporte-personal-${section}`,
    companyName: profile.companyName || REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    sellerName: profile.sellerName,
    position: 'Agente de ventas',
    title: `${meta.title} · ${profile.sellerName}`,
    subtitle: `${profile.currentPeriodLabel} comparado con ${profile.previousYearPeriodLabel}. ${profile.comparisonContext}.`,
    objective:
      'Evaluar el desempeño personal del agente frente al mismo periodo del año anterior, destacando avances, retrocesos y prioridades comerciales.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: analysis.metrics.map((metric) => ({
      label: metric.label,
      value: formatAgentMetricValueUi(metric.comparison.current, metric.format),
      note: `${formatAgentComparisonDelta(metric.comparison)} vs. ${profile.previousYearPeriodLabel}`,
    })),
    highlights,
    tables: [
      {
        title: meta.rowsTitle,
        columns: [
          meta.rowLabel,
          'Periodo actual',
          'Mismo periodo año anterior',
          'Variación',
          'Participación actual',
        ],
        rows: analysis.rows.map((row) => [
          row.label,
          formatAgentDimensionValue(row.current, meta.rowFormat),
          formatAgentDimensionValue(row.previous, meta.rowFormat),
          row.differencePct === null
            ? row.difference === 0
              ? 'Sin cambio'
              : 'Sin base anterior'
            : `${row.differencePct >= 0 ? '+' : ''}${row.differencePct.toFixed(1)}%`,
          section === 'conversion' ? '-' : formatPercent(row.currentSharePct),
        ]),
      },
    ],
  };
}

function normalizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildExecutiveSectionReport(
  snapshot: CommercialDashboardSnapshot,
  hallazgos: Hallazgo[],
): SectionReport {
  const generatedAtIso = new Date().toISOString();
  const atRiskRows = snapshot.clientLifecycle.rows
    .filter((row) => row.currentStatus === 'en_riesgo')
    .slice()
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  return {
    fileBase: 'reporte-resumen-ejecutivo',
    companyName: REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    title: 'Reporte ejecutivo comercial',
    subtitle: `Período ${formatReferenceDateRange(snapshot.filters.startDate, snapshot.filters.endDate)}. Lectura consolidada para dirección comercial.`,
    objective: 'Entregar una lectura gerencial del período para ubicar riesgos, fortalezas y prioridades inmediatas del flujo comercial.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: snapshot.summaryMetrics.map((metric) => ({
      label: metric.label,
      value: metric.formattedCurrent,
      note: formatMetricChangeEs(metric.comparison),
    })),
    highlights: hallazgos.map(
      (item) => `${item.title}. ${item.evidence} Recomendación: ${item.recommendation}`,
    ),
    tables: [
      {
        title: 'Vendedores con mayor facturación',
        columns: ['Vendedor', 'Facturación', 'Conversión', 'Margen'],
        rows: snapshot.sellers.rankingByRevenue.slice(0, 15).map((row) => [
          row.sellerName,
          formatCurrency(row.invoicedAmount),
          formatPercent(row.conversionPct),
          formatCurrency(row.margin),
        ]),
      },
      {
        title: 'Productos con mayor facturación',
        columns: ['Producto', 'Facturación', 'Margen', '% margen'],
        rows: snapshot.products.topByRevenue.slice(0, 15).map((row) => [
          row.productName,
          formatCurrency(row.revenue),
          formatCurrency(row.margin),
          formatPercent(row.marginPct ?? 0),
        ]),
      },
      {
        title: 'Clientes en riesgo con mayor impacto',
        columns: ['Cliente', 'Vendedor', 'Facturación', 'Margen', 'Días sin compra'],
        rows: atRiskRows.map((row) => [
          row.customerName,
          row.sellerName,
          formatCurrency(row.revenue),
          formatCurrency(row.margin),
          formatNullableNumber(row.daysSinceLastPurchase),
        ]),
      },
    ],
  };
}

function buildConversionSectionReport(snapshot: CommercialDashboardSnapshot): SectionReport {
  const generatedAtIso = new Date().toISOString();
  return {
    fileBase: 'reporte-conversion-comercial',
    companyName: REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    title: 'Reporte de conversión comercial',
    subtitle: `Período ${formatReferenceDateRange(snapshot.filters.startDate, snapshot.filters.endDate)}. Seguimiento de cotizaciones, cierres y puntos de fuga.`,
    objective: 'Detectar en qué etapa se frena la conversión comercial para enfocar seguimiento, cierre y recuperación de oportunidades.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: [
      {
        label: 'Conversión general',
        value: formatPercent(snapshot.conversion.overall.current),
        note: formatMetricChangeEs(snapshot.conversion.overall),
      },
      {
        label: 'Cotizaciones pendientes',
        value: formatNumber(snapshot.quoteSummary.pendingQuotes),
      },
      {
        label: 'Cotizaciones vencidas',
        value: formatNumber(snapshot.quoteSummary.expiredQuotes),
      },
      {
        label: 'Tiempo promedio de conversión',
        value: `${snapshot.quoteSummary.averageConversionDays.current.toFixed(1)} días`,
        note: formatMetricChangeEs(snapshot.quoteSummary.averageConversionDays),
      },
    ],
    highlights: [
      `Cotizaciones: ${formatNumber(snapshot.quoteSummary.totalQuotes.current)}.`,
      `Órdenes convertidas: ${formatNumber(snapshot.quoteSummary.convertedQuotes)}.`,
      'Enfoque del reporte: detectar dónde se frena el flujo entre cotización y cierre.',
    ],
    tables: [
      buildConversionReportTable('Conversión por vendedor', snapshot.conversion.bySeller),
      buildConversionReportTable('Conversión por cliente', snapshot.conversion.byCustomer.slice(0, 20)),
      buildConversionReportTable('Conversión por mes', snapshot.conversion.byMonth),
      buildConversionReportTable('Conversión por rango de importe', snapshot.conversion.byRange),
      buildConversionReportTable('Conversión por producto', snapshot.conversion.byProduct),
    ],
  };
}

function buildClientsSectionReport(snapshot: CommercialDashboardSnapshot): SectionReport {
  const generatedAtIso = new Date().toISOString();
  const prioritizedRows = snapshot.clientLifecycle.rows
    .slice()
    .sort((a, b) => {
      const riskGap = riskPriority(b.currentStatus) - riskPriority(a.currentStatus);
      if (riskGap !== 0) return riskGap;
      return b.revenue - a.revenue;
    })
    .slice(0, 30);

  return {
    fileBase: 'reporte-clientes',
    companyName: REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    title: 'Reporte de clientes',
    subtitle: `Período ${formatReferenceDateRange(snapshot.filters.startDate, snapshot.filters.endDate)}. Panorama de cartera, riesgo y valor comercial.`,
    objective: 'Identificar el estado de la cartera, el nivel de riesgo y las cuentas que deben priorizarse para proteger ingresos.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: [
      { label: 'Clientes nuevos', value: formatNumber(snapshot.clientLifecycle.summary.newCustomers) },
      { label: 'Clientes activos', value: formatNumber(snapshot.clientLifecycle.summary.activeCustomers) },
      { label: 'Clientes en riesgo', value: formatNumber(snapshot.clientLifecycle.summary.atRiskCustomers) },
      { label: 'Valor en riesgo', value: formatCurrency(snapshot.clientLifecycle.summary.valueAtRisk) },
      { label: 'Retención', value: formatPercent(snapshot.clientLifecycle.summary.retentionPct) },
      { label: 'Riesgo de abandono', value: formatPercent(snapshot.clientLifecycle.summary.churnRiskPct) },
    ],
    highlights: [
      `Segmentos RFM identificados: ${formatNumber(snapshot.clientLifecycle.rfmSegments.length)}.`,
      'La lectura prioriza clientes en riesgo con mayor facturación histórica.',
    ],
    tables: [
      {
        title: 'Clientes a priorizar',
        columns: ['Cliente', 'Estado', 'Vendedor', 'Facturación', 'Margen', 'Días sin comprar', 'RFM'],
        rows: prioritizedRows.map((row) => [
          row.customerName,
          row.currentStatus,
          row.sellerName,
          formatCurrency(row.revenue),
          formatCurrency(row.margin),
          formatNullableNumber(row.daysSinceLastPurchase),
          `${row.rfmScore} - ${row.rfmSegment}`,
        ]),
      },
      {
        title: 'Segmentos RFM',
        columns: ['Segmento', 'Clientes'],
        rows: snapshot.clientLifecycle.rfmSegments.map((segment) => [
          segment.segment,
          formatNumber(segment.customers),
        ]),
      },
    ],
  };
}

function buildProductsSectionReport(snapshot: CommercialDashboardSnapshot): SectionReport {
  const generatedAtIso = new Date().toISOString();
  return {
    fileBase: 'reporte-productos',
    companyName: REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    title: 'Reporte de productos',
    subtitle: `Período ${formatReferenceDateRange(snapshot.filters.startDate, snapshot.filters.endDate)}. Análisis de rentabilidad, volumen y deterioro comercial.`,
    objective: 'Ubicar qué productos impulsan ventas, cuáles destruyen margen y dónde conviene ajustar precio, mezcla o empuje comercial.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: [
      { label: 'Alta venta / alto margen', value: formatNumber(snapshot.products.matrix.alta_venta_alto_margen) },
      { label: 'Alta venta / bajo margen', value: formatNumber(snapshot.products.matrix.alta_venta_bajo_margen) },
      { label: 'Baja venta / alto margen', value: formatNumber(snapshot.products.matrix.baja_venta_alto_margen) },
      { label: 'Baja venta / bajo margen', value: formatNumber(snapshot.products.matrix.baja_venta_bajo_margen) },
    ],
    highlights: [
      `Productos con margen negativo detectados: ${formatNumber(snapshot.products.negativeMargin.length)}.`,
      'La prioridad directiva debe concentrarse en alta facturación con bajo margen y en margen negativo.',
    ],
    tables: [
      buildProductReportTable('Top por facturación', snapshot.products.topByRevenue),
      buildProductReportTable('Productos más vendidos del período', snapshot.products.topByUnits),
      buildProductReportTable('Top por margen', snapshot.products.topByMargin),
      buildProductReportTable('Alta facturación y bajo margen', snapshot.products.highRevenueLowMargin),
      buildProductReportTable('Productos con margen negativo', snapshot.products.negativeMargin),
      ...snapshot.sellers.categoryBreakdown.map((category) =>
        buildSellerCategoryReportTable(`Ranking por categoría: ${category.categoryName}`, category.sellerRows),
      ),
    ],
  };
}

function buildSellersSectionReport(snapshot: CommercialDashboardSnapshot): SectionReport {
  const generatedAtIso = new Date().toISOString();
  const lowConversionRows = snapshot.details.lowConversionSellers
    .slice()
    .sort((a, b) => a.conversionPct - b.conversionPct);
  const topCategory = snapshot.sellers.categoryBreakdown[0];
  const secondCategory = snapshot.sellers.categoryBreakdown[1];

  return {
    fileBase: 'reporte-vendedores',
    companyName: REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    title: 'Reporte de vendedores',
    subtitle: `Período ${formatReferenceDateRange(snapshot.filters.startDate, snapshot.filters.endDate)}. Análisis de desempeño, conversión y riesgo comercial por ejecutivo.`,
    objective:
      'Comparar desempeño comercial por vendedor para detectar baja conversión, concentración de margen, exposición de cartera y dependencia por categoría de producto.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: [
      { label: 'Umbral mínimo de órdenes', value: formatNumber(snapshot.sellers.minOrderThreshold) },
      { label: 'Vendedores con baja conversión', value: formatNumber(lowConversionRows.length) },
      {
        label: 'Mejor conversión',
        value: snapshot.sellers.rankingByConversion[0]
          ? `${snapshot.sellers.rankingByConversion[0].sellerName} - ${formatPercent(snapshot.sellers.rankingByConversion[0].conversionPct)}`
          : '-',
      },
      {
        label: 'Mayor margen',
        value: snapshot.sellers.rankingByMargin[0]
          ? `${snapshot.sellers.rankingByMargin[0].sellerName} - ${formatCurrency(snapshot.sellers.rankingByMargin[0].margin)}`
          : '-',
      },
      {
        label: 'Categoría líder',
        value: topCategory
          ? `${topCategory.categoryName} - ${formatPercent(topCategory.sharePct)}`
          : '-',
      },
      {
        label: 'Segunda categoría',
        value: secondCategory
          ? `${secondCategory.categoryName} - ${formatPercent(secondCategory.sharePct)}`
          : '-',
      },
    ],
    highlights: [
      'Las tablas se ordenan por el KPI central de cada ranking para acelerar la toma de decisiones.',
      'La baja conversión se reporta solo para vendedores con volumen suficiente y menos de 50% de cierre.',
      topCategory
        ? `${topCategory.categoryName} concentra ${formatPercent(topCategory.sharePct)} de las ventas del período y su vendedor líder es ${topCategory.topSellerName ?? 'Sin vendedor'}.`
        : 'No hubo ventas por categoría en el período seleccionado.',
    ],
    tables: [
      buildSellerReportTable('Vendedores con baja conversión', lowConversionRows),
      buildSellerReportTable('Ranking por facturación', snapshot.sellers.rankingByRevenue),
      buildSellerReportTable('Ranking por margen', snapshot.sellers.rankingByMargin),
      buildSellerReportTable('Ranking por conversión', snapshot.sellers.rankingByConversion),
      buildSellerReportTable('Ranking por clientes nuevos', snapshot.sellers.rankingByNewCustomers),
      buildSellerReportTable('Ranking por clientes en riesgo', snapshot.sellers.rankingByAtRiskCustomers),
      buildSellerReportTable('Ranking compuesto', snapshot.sellers.weightedRanking),
    ],
  };
}

function buildPurchasesSectionReport(snapshot: PurchaseDashboardSnapshot): SectionReport {
  const generatedAtIso = new Date().toISOString();

  return {
    fileBase: 'reporte-compras',
    companyName: REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    title: 'Reporte de compras',
    subtitle: `Período ${formatReferenceDateRange(snapshot.filters.startDate, snapshot.filters.endDate)}. Panorama de abastecimiento, gasto y concentración por producto, proveedor y comprador.`,
    objective: 'Analizar qué productos y categorías absorben el gasto, cuáles proveedores concentran la compra y cómo evoluciona el abastecimiento frente al período anterior.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: [
      {
        label: 'Compra ordenada',
        value: formatCurrency(snapshot.summary.orderedAmount.current),
        note: formatMetricChangeEs(snapshot.summary.orderedAmount),
      },
      {
        label: 'Facturación proveedor',
        value: formatCurrency(snapshot.summary.billedAmount.current),
        note: formatMetricChangeEs(snapshot.summary.billedAmount),
      },
      {
        label: 'Proveedores activos',
        value: formatNumber(snapshot.summary.supplierCount.current),
        note: formatMetricChangeEs(snapshot.summary.supplierCount),
      },
      {
        label: 'Compradores activos',
        value: formatNumber(snapshot.summary.buyerCount.current),
        note: formatMetricChangeEs(snapshot.summary.buyerCount),
      },
      {
        label: 'Orden promedio',
        value: formatCurrency(snapshot.summary.averageOrderValue.current),
        note: formatMetricChangeEs(snapshot.summary.averageOrderValue),
      },
      {
        label: 'Notas de crédito',
        value: formatCurrency(snapshot.summary.refundAmount.current),
        note: formatMetricChangeEs(snapshot.summary.refundAmount),
      },
    ],
    highlights: [
      snapshot.products.topBySpend[0]
        ? `Producto con mayor compra facturada: ${snapshot.products.topBySpend[0].productName} con ${formatCurrency(snapshot.products.topBySpend[0].billedAmount)}.`
        : 'No se detectó un producto líder en compras para el período.',
      snapshot.suppliers.topBySpend[0]
        ? `Proveedor con mayor gasto: ${snapshot.suppliers.topBySpend[0].supplierName} con ${formatCurrency(snapshot.suppliers.topBySpend[0].billedAmount)}.`
        : 'No se detectó un proveedor líder en compras para el período.',
      snapshot.buyers.topBySpend[0]
        ? `Comprador con mayor ejecución: ${snapshot.buyers.topBySpend[0].buyerName} con ${formatCurrency(snapshot.buyers.topBySpend[0].billedAmount)} facturados.`
        : 'No se detectó un comprador líder en compras para el período.',
    ],
    tables: [
      {
        title: 'Productos con mayor compra facturada',
        columns: ['Producto', 'Categoría', 'Facturado', 'Ordenado', 'Cantidad', '% gasto'],
        rows: snapshot.products.topBySpend.map((row) => [
          row.productName,
          row.categoryName ?? 'Sin categoría',
          formatCurrency(row.billedAmount),
          formatCurrency(row.orderedAmount),
          formatNumber(row.quantity),
          formatPercent(row.spendSharePct),
        ]),
      },
      {
        title: 'Proveedores con mayor gasto',
        columns: ['Proveedor', 'Facturado', 'Ordenado', 'Facturas', 'Órdenes', '% gasto'],
        rows: snapshot.suppliers.topBySpend.map((row) => [
          row.supplierName,
          formatCurrency(row.billedAmount),
          formatCurrency(row.orderedAmount),
          formatNumber(row.billCount),
          formatNumber(row.orderCount),
          formatPercent(row.spendSharePct),
        ]),
      },
      {
        title: 'Compradores con mayor ejecución',
        columns: ['Comprador', 'Facturado', 'Ordenado', 'Facturas', 'Órdenes', 'Proveedores'],
        rows: snapshot.buyers.topBySpend.map((row) => [
          row.buyerName,
          formatCurrency(row.billedAmount),
          formatCurrency(row.orderedAmount),
          formatNumber(row.billCount),
          formatNumber(row.orderCount),
          formatNumber(row.supplierCount),
        ]),
      },
      {
        title: 'Categorías con mayor compra facturada',
        columns: ['Categoría', 'Facturado', 'Ordenado', 'Cantidad', 'Productos', '% gasto'],
        rows: snapshot.categories.topBySpend.map((row) => [
          row.categoryName,
          formatCurrency(row.billedAmount),
          formatCurrency(row.orderedAmount),
          formatNumber(row.quantity),
          formatNumber(row.productCount),
          formatPercent(row.spendSharePct),
        ]),
      },
    ],
  };
}

function buildParetoSectionReport(snapshot: CommercialDashboardSnapshot): SectionReport {
  const generatedAtIso = new Date().toISOString();
  return {
    fileBase: 'reporte-pareto',
    companyName: REPORT_COMPANY_NAME,
    logoSrc: REPORT_LOGO_SRC,
    title: 'Reporte Pareto comercial',
    subtitle: `Período ${formatReferenceDateRange(snapshot.filters.startDate, snapshot.filters.endDate)}. Concentración del resultado en clientes, productos y vendedores.`,
    objective: 'Mostrar qué clientes, productos y vendedores concentran la mayor parte del resultado para orientar foco y recursos.',
    generatedAtIso,
    generatedAt: formatDateTimeLabel(generatedAtIso),
    kpis: [
      { label: 'Clientes clase A', value: formatNumber(snapshot.pareto.customers.rows.filter((row) => row.classification === 'A').length) },
      { label: 'Productos clase A', value: formatNumber(snapshot.pareto.products.rows.filter((row) => row.classification === 'A').length) },
      { label: 'Vendedores clase A', value: formatNumber(snapshot.pareto.sellers.rows.filter((row) => row.classification === 'A').length) },
    ],
    highlights: [
      snapshot.pareto.customers.statement,
      snapshot.pareto.products.statement,
      snapshot.pareto.sellers.statement,
    ],
    tables: [
      buildParetoReportTable(snapshot.pareto.customers),
      buildParetoReportTable(snapshot.pareto.products),
      buildParetoReportTable(snapshot.pareto.sellers),
    ],
  };
}

function buildConversionReportTable(
  title: string,
  rows: Array<{
    label: string;
    quotes: number;
    converted: number;
    pending: number;
    expired: number;
    cancelled: number;
    conversionPct: number;
    averageConversionDays: number;
  }>,
): ReportTable {
  return {
    title,
    columns: ['Elemento', 'Cotizaciones', 'Convertidas', 'Pendientes', 'Vencidas', 'Canceladas', 'Conversión', 'Días prom.'],
    rows: rows.map((row) => [
      row.label,
      formatNumber(row.quotes),
      formatNumber(row.converted),
      formatNumber(row.pending),
      formatNumber(row.expired),
      formatNumber(row.cancelled),
      formatPercent(row.conversionPct),
      row.averageConversionDays.toFixed(1),
    ]),
  };
}

function buildProductReportTable(title: string, rows: ProductAnalysisRow[]): ReportTable {
  return {
    title,
    columns: ['Producto', 'Categoría', 'Facturación', 'Margen', '% margen', 'Unidades', 'Clientes'],
    rows: rows.map((row) => [
      row.productName,
      row.categoryName ?? '-',
      formatCurrency(row.revenue),
      formatCurrency(row.margin),
      formatPercent(row.marginPct ?? 0),
      formatNumber(row.units),
      formatNumber(row.uniqueCustomers),
    ]),
  };
}

function buildSellerReportTable(title: string, rows: SellerPerformanceRow[]): ReportTable {
  return {
    title,
    columns: ['Vendedor', 'Cotizaciones', 'Órdenes', 'Conversión', 'Facturación', 'Margen', 'Clientes nuevos', 'En riesgo'],
    rows: rows.map((row) => [
      row.sellerName,
      formatNumber(row.quotes),
      formatNumber(row.confirmedOrders),
      formatPercent(row.conversionPct),
      formatCurrency(row.invoicedAmount),
      formatCurrency(row.margin),
      formatNumber(row.newCustomers),
      formatNumber(row.atRiskCustomers),
    ]),
  };
}

function buildSellerCategoryReportTable(
  title: string,
  rows: SellerCategoryPerformanceRow[],
): ReportTable {
  return {
    title,
    columns: ['Vendedor', 'Ventas', '% categoría', '% mezcla vendedor', 'Órdenes', 'Unidades', 'Margen'],
    rows: rows.map((row) => [
      row.sellerName,
      formatCurrency(row.soldAmount),
      formatPercent(row.categorySharePct),
      formatPercent(row.sellerMixPct),
      formatNumber(row.orderCount),
      formatNumber(row.units),
      formatCurrency(row.margin),
    ]),
  };
}

function buildParetoReportTable(summary: CommercialDashboardSnapshot['pareto']['customers']): ReportTable {
  return {
    title: summary.title,
    columns: ['#', 'Elemento', 'Valor', 'Ordenes', 'Unidades', '% individual', '% acumulado', 'Clase'],
    rows: summary.rows.map((row) => [
      formatNumber(row.position),
      row.label,
      formatCurrency(row.value),
      formatNumber(row.orders),
      formatNumber(row.units),
      formatPercent(row.individualPct),
      formatPercent(row.accumulatedPct),
      row.classification,
    ]),
  };
}

function downloadSectionReportPdf(report: SectionReport) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    frame.remove();
    window.alert('No se pudo preparar la vista del reporte para imprimir.');
    return;
  }

  const cleanup = () => {
    window.setTimeout(() => {
      frame.remove();
    }, 500);
  };

  frameWindow.document.open();
  frameWindow.document.write(buildSectionReportHtml(report));
  frameWindow.document.close();
  frame.onload = () => {
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    }, 250);
  };
}

function buildSectionReportHtml(report: SectionReport) {
  const kpiCards = report.kpis
    .map(
      (kpi, index) => `
        <article class="kpi-card">
          <div class="kpi-card-head">
            ${reportKpiIcon(index)}
            <span>${escapeHtml(kpi.label)}</span>
          </div>
          <strong>${escapeHtml(kpi.value)}</strong>
          ${kpi.note ? `<small>${escapeHtml(kpi.note)}</small>` : '<small>Indicador del periodo</small>'}
        </article>
      `,
    )
    .join('');

  const highlightItems = report.highlights
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

  const tables = report.tables
    .map(
      (table) => `
        <section class="report-block">
          <h3>${escapeHtml(table.title)}</h3>
          <table>
            <thead>
              <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${table.rows
                .map(
                  (row) => `
                    <tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>
                  `,
                )
                .join('')}
            </tbody>
          </table>
        </section>
      `,
    )
    .join('');
  const scoreSection = report.score
    ? `
      <section class="score-section report-block">
        <div class="score-ring" style="--score-angle: ${report.score.total * 3.6}deg">
          <div><strong>${report.score.total}</strong><span>de 100</span></div>
        </div>
        <div class="score-copy">
          <span>Calificación de desempeño comercial</span>
          <h2>${escapeHtml(report.score.rating)}</h2>
          <p>${escapeHtml(report.score.summary)}</p>
          <small>${escapeHtml(report.score.methodologyNote)}</small>
        </div>
        <div class="score-dimensions">
          ${report.score.dimensions.map((dimension) => `
            <div class="score-dimension">
              <div><span>${escapeHtml(dimension.label)} · ${dimension.weight}%</span><strong>${dimension.score}</strong></div>
              <i><em style="width: ${dimension.score}%"></em></i>
              <small>${escapeHtml(dimension.evidence)}</small>
            </div>
          `).join('')}
        </div>
      </section>
    `
    : '';
  const charts = (report.charts ?? []).map(buildReportChartHtml).join('');
  const bibliography = report.bibliography?.length
    ? `
      <section class="report-block bibliography">
        <span class="section-kicker">Metodología y fuentes</span>
        <h2>Referencias de desempeño comercial</h2>
        <p>Las fuentes orientan la selección de dimensiones. Los pesos corresponden a un modelo interno y deben revisarse según las metas y el ciclo comercial de la empresa.</p>
        <ol>
          ${report.bibliography.map((source) => `
            <li>${escapeHtml(source.citation)}<br /><a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a></li>
          `).join('')}
        </ol>
      </section>
    `
    : '';

  const generatedDate = formatDateOnlyLabel(report.generatedAtIso);
  const generatedTime = formatTimeOnlyLabel(report.generatedAtIso);
  const scoreBadge = report.score
    ? `
      <div class="hero-score-badge" aria-label="Calificación global ${report.score.total} de 100">
        <div class="hero-score-ring" style="--score-angle: ${report.score.total * 3.6}deg">
          <strong>${report.score.total}</strong>
        </div>
        <div>
          <span>Calificación global del periodo</span>
          <strong>${escapeHtml(report.score.rating)}</strong>
        </div>
      </div>
    `
    : '';

  return `<!DOCTYPE html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(report.title)}</title>
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #e8e4de;
          color: #22303a;
          font-family: "Aptos", "Segoe UI", Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background:
            linear-gradient(90deg, rgba(182,106,77,.035) 1px, transparent 1px),
            #fcfbf8;
          background-size: 28px 28px;
          padding: 16mm 15mm 18mm;
        }
        .hero {
          background:
            radial-gradient(circle at top right, rgba(182, 106, 77, 0.16), transparent 38%),
            linear-gradient(135deg, #fffdf9, #f2e9e2);
          border-radius: 24px;
          padding: 24px 26px 26px;
          box-shadow: 0 14px 34px rgba(83, 58, 45, .08);
        }
        .hero-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 18px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }
        .brand img {
          width: 58px;
          height: 58px;
          object-fit: contain;
          border-radius: 16px;
          background: rgba(255,255,255,.72);
          padding: 8px;
        }
        .brand-copy span {
          display: block;
          margin-bottom: 4px;
          color: #736759;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .brand-copy strong {
          display: block;
          font-size: 26px;
          line-height: 1.1;
          color: #1f2a33;
        }
        .hero-badges {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 10px;
        }
        .hero-tag {
          border-radius: 999px;
          background: #6f412f;
          color: #fffaf6;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 8px 12px;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .hero-score-badge {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-height: 40px;
          border: 1px solid rgba(111, 65, 47, .16);
          border-radius: 999px;
          background: rgba(255, 253, 249, .88);
          padding: 5px 12px 5px 6px;
          box-shadow: 0 8px 20px rgba(83, 58, 45, .07);
        }
        .hero-score-ring {
          --score-angle: 0deg;
          display: grid;
          place-items: center;
          width: 31px;
          height: 31px;
          border-radius: 50%;
          background: conic-gradient(#b66a4d var(--score-angle), #eaded5 0deg);
        }
        .hero-score-ring::before {
          grid-area: 1 / 1;
          width: 22px;
          height: 22px;
          border-radius: inherit;
          background: #fffaf6;
          content: "";
        }
        .hero-score-ring strong {
          z-index: 1;
          grid-area: 1 / 1;
          color: #6f412f;
          font-size: 10px;
          line-height: 1;
        }
        .hero-score-badge span,
        .hero-score-badge strong {
          display: block;
          white-space: nowrap;
        }
        .hero-score-badge span {
          color: #7b6b5e;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .hero-score-badge > div:last-child > strong {
          margin-top: 1px;
          color: #2d3438;
          font-size: 11px;
          line-height: 1.1;
        }
        .hero h1 {
          margin: 0 0 8px;
          font-size: 30px;
          line-height: 1.12;
          color: #1f2a33;
        }
        .hero p {
          margin: 0;
          color: #5f665f;
          line-height: 1.55;
        }
        .hero-datetime {
          margin-top: 10px;
          color: #6f6557;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .hero-datetime strong {
          color: #4e473e;
        }
        .hero-objective {
          margin-top: 18px;
          max-width: 680px;
          border-left: 3px solid #b66a4d;
          padding-left: 14px;
        }
        .hero-objective span {
          display: block;
          margin-bottom: 6px;
          color: #776b5e;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .hero-objective p {
          margin: 0;
          color: #23303a;
          font-size: 14px;
          line-height: 1.45;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 18px 0 22px;
        }
        .kpi-card {
          border-radius: 18px;
          background: linear-gradient(180deg, #ffffff, #f5f0eb);
          padding: 14px 15px;
          box-shadow: 0 8px 22px rgba(61, 48, 40, .065);
          break-inside: avoid;
        }
        .kpi-card-head {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kpi-icon {
          width: 27px;
          height: 27px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          text-align: center;
          justify-content: center;
          flex: 0 0 27px;
          line-height: 0;
          color: #8f5038;
          background: #f0dfd5;
        }
        .kpi-icon svg {
          display: grid;
          place-items: center;
          text-align: center;
          justify-content: center;
          width: 15px;
          height: 15px;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
          overflow: visible;
        }
        .kpi-card span,
        .kpi-card small {
          display: grid;
          place-items: center;
          color: #6f6557;
        }
        .kpi-card strong {
          display: block;
          margin: 6px 0 4px;
          font-size: 22px;
          line-height: 1.1;
          color: #23303a;
        }
        .report-block {
          margin-top: 22px;
          break-inside: auto;
        }
        .report-block h2,
        .report-block h3 {
          margin: 0 0 10px;
          color: #23303a;
        }
        .section-kicker,
        .score-copy > span {
          display: block;
          margin-bottom: 6px;
          color: #8f5038;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .score-section {
          display: grid;
          grid-template-columns: 132px minmax(0, 1fr);
          gap: 18px 22px;
          align-items: center;
          border-radius: 24px;
          background: linear-gradient(135deg, #fff, #f3eee8);
          padding: 20px 22px;
          box-shadow: 0 10px 26px rgba(61, 48, 40, .07);
          break-inside: avoid;
        }
        .score-ring {
          --score-angle: 0deg;
          display: grid;
          width: 118px;
          height: 118px;
          place-items: center;
          border-radius: 50%;
          background: conic-gradient(#b66a4d var(--score-angle), #e5ddd5 0deg);
        }
        .score-ring::before {
          grid-area: 1 / 1;
          width: 88px;
          height: 88px;
          border-radius: 50%;
          background: #fffdf9;
          content: "";
        }
        .score-ring > div {
          z-index: 1;
          grid-area: 1 / 1;
          text-align: center;
        }
        .score-ring strong,
        .score-ring span {
          display: block;
        }
        .score-ring strong { color: #6f412f; font-size: 34px; line-height: 1; }
        .score-ring span { margin-top: 4px; color: #786b61; font-size: 10px; }
        .score-copy h2 { margin: 0 0 7px; font-size: 21px; }
        .score-copy p { margin: 0 0 7px; color: #46535b; line-height: 1.5; }
        .score-copy small { color: #746c65; line-height: 1.45; }
        .score-dimensions {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 18px;
        }
        .score-dimension > div {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #4a5357;
          font-size: 11px;
        }
        .score-dimension i,
        .chart-bar-track {
          display: block;
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: #e8e1db;
        }
        .score-dimension em {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #8f5038, #c48467);
        }
        .score-dimension small {
          display: block;
          margin-top: 5px;
          color: #776f69;
          font-size: 9px;
          line-height: 1.35;
        }
        .chart-card {
          border-radius: 20px;
          background: #fff;
          padding: 17px 18px;
          box-shadow: 0 9px 24px rgba(61, 48, 40, .06);
          break-inside: avoid;
        }
        .chart-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .chart-head h3 { margin: 0; }
        .chart-head p { margin: 3px 0 0; color: #756c65; font-size: 11px; }
        .chart-legend { display: flex; flex-wrap: wrap; gap: 8px; }
        .chart-legend span { color: #665e58; font-size: 10px; }
        .chart-legend i {
          display: inline-block;
          width: 9px;
          height: 9px;
          margin-right: 4px;
          border-radius: 50%;
        }
        .chart-row {
          display: grid;
          grid-template-columns: 126px minmax(0, 1fr);
          gap: 11px;
          align-items: start;
          padding: 7px 0;
          border-top: 1px solid #eee9e4;
        }
        .chart-row > strong {
          overflow: hidden;
          color: #3c474d;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chart-series { display: grid; gap: 5px; }
        .chart-series-line {
          display: grid;
          grid-template-columns: 84px minmax(0, 1fr) 74px;
          gap: 7px;
          align-items: center;
          font-size: 9px;
        }
        .chart-series-line > span { color: #756c65; }
        .chart-series-line > strong { color: #3f494e; text-align: right; }
        .chart-bar-track em {
          display: block;
          min-width: 2px;
          height: 100%;
          border-radius: inherit;
        }
        .report-block ul {
          margin: 0;
          padding-left: 18px;
          color: #4a565f;
          line-height: 1.6;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          overflow: hidden;
          border-radius: 14px;
          break-inside: auto;
        }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        thead th {
          background: #ebe5dc;
          color: #463f36;
          text-align: left;
        }
        th, td {
          border: 1px solid #ded7cd;
          padding: 8px 9px;
          vertical-align: top;
        }
        tbody tr:nth-child(even) {
          background: #f7f4ef;
        }
        tbody tr:nth-child(odd) {
          background: #fdfbf8;
        }
        .bibliography {
          border-radius: 18px;
          background: #f3eee8;
          padding: 17px 19px;
          break-inside: avoid;
        }
        .bibliography > p,
        .bibliography li { color: #5c625f; font-size: 10px; line-height: 1.5; }
        .bibliography a { color: #8f5038; text-decoration: none; }
        @page {
          margin: 14mm;
        }
        @media print {
          body { background: #ffffff; }
          .page {
            width: auto;
            min-height: auto;
            margin: 0;
            padding: 0;
          }
          .hero,
          .kpi-card,
          .score-section,
          .chart-card { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="hero">
          <div class="hero-top">
            <div class="brand">
              <img src="${escapeHtml(report.logoSrc)}" alt="Logo de ${escapeHtml(report.companyName)}" />
              <div class="brand-copy">
                <span>Reporte empresarial</span>
                <strong>${escapeHtml(report.companyName)}</strong>
              </div>
            </div>
            <div class="hero-badges">
              <div class="hero-tag">${escapeHtml(report.position ?? 'Análisis comercial')}</div>
              ${scoreBadge}
            </div>
          </div>
          <h1>${escapeHtml(report.title)}</h1>
          <p>${escapeHtml(report.subtitle)}</p>
          <div class="hero-datetime">
            <strong>Fecha de emisión:</strong> ${escapeHtml(generatedDate)} · ${escapeHtml(generatedTime)}
          </div>
          <section class="hero-objective">
            <span>Objetivo del reporte</span>
            <p>${escapeHtml(report.objective)}</p>
          </section>
        </section>
        ${scoreSection}
        ${report.kpis.length > 0 ? `<section class="kpi-grid">${kpiCards}</section>` : ''}
        ${charts}
        ${report.highlights.length > 0 ? `<section class="report-block"><h2>Hallazgos clave</h2><ul>${highlightItems}</ul></section>` : ''}
        ${tables}
        ${bibliography}
      </main>
    </body>
  </html>`;
}

function buildReportChartHtml(chart: ReportChart) {
  const maxValue = Math.max(
    1,
    ...chart.series.flatMap((series) => series.values.map((value) => Math.abs(value))),
  );
  const rows = chart.labels.map((label, rowIndex) => `
    <div class="chart-row">
      <strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong>
      <div class="chart-series">
        ${chart.series.map((series) => {
          const value = series.values[rowIndex] ?? 0;
          const width = Math.min(100, (Math.abs(value) / maxValue) * 100);
          return `
            <div class="chart-series-line">
              <span>${escapeHtml(series.label)}</span>
              <i class="chart-bar-track"><em style="width:${width}%;background:${escapeHtml(series.color)}"></em></i>
              <strong>${escapeHtml(formatReportChartValue(value, series.formatter))}</strong>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  return `
    <section class="report-block chart-card">
      <div class="chart-head">
        <div>
          <span class="section-kicker">Visualización comparativa</span>
          <h3>${escapeHtml(chart.title)}</h3>
          ${chart.subtitle ? `<p>${escapeHtml(chart.subtitle)}</p>` : ''}
        </div>
        <div class="chart-legend">
          ${chart.series.map((series) => `<span><i style="background:${escapeHtml(series.color)}"></i>${escapeHtml(series.label)}</span>`).join('')}
        </div>
      </div>
      ${rows}
    </section>
  `;
}

function formatReportChartValue(
  value: number,
  formatter: ReportChart['series'][number]['formatter'],
) {
  if (formatter === 'currency') return formatCurrencyCompact(value);
  if (formatter === 'percent') return formatPercent(value);
  return formatNumber(value);
}

function reportKpiIcon(index: number) {
  const icons = [
    '<svg viewBox="0 0 24 24"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3m10-10h-3M5 12H2"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6m-6 4h6"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 20c0-4 2-7 6-7s6 3 6 7m0-5c3 0 5 2 5 5"/></svg>',
  ];
  return `<span class="kpi-icon">${icons[index % icons.length]}</span>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDateOnlyLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
  }).format(new Date(value));
}

function formatTimeOnlyLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeStyle: 'short',
  }).format(new Date(value));
}

function riskPriority(status: ClientLifecycleRow['currentStatus']) {
  if (status === 'perdido') return 5;
  if (status === 'casi_perdido') return 4;
  if (status === 'en_riesgo') return 3;
  if (status === 'observacion') return 2;
  if (status === 'dormido') return 1;
  return 0;
}
