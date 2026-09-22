import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  FileSpreadsheet,
  PackagePlus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { supabase } from '../../lib/supabase';
import type { ShippingPackageType, ShippingProductDimension, ShippingQuoteDetail, ShippingQuoteRow } from '../../lib/types';
import { SidebarUserFooter } from '../admin/SidebarUserFooter';
import { fetchUsdMxnExchangeRate, type ExchangeRateResult } from '../admin/calculatorService';
import {
  createShippingQuote,
  getShippingBootstrap,
  getShippingQuote,
  importShippingProductDimensions,
  listShippingProductDimensions,
  listShippingQuotes,
  lookupOdooShippingOrder,
  previewShippingProductDimensionsImport,
  saveShippingCarrierConfig,
  saveShippingProductDimension,
  testShippingCarrierConnection,
  type ShippingCarrierConfigDraft,
  type ShippingOrderLookupResult,
  type ShippingProductDimensionsImportPreview,
  type ShippingOrderLine,
  type ShippingPhysicalRules,
} from './shippingQuotesService';
import {
  preparePackages,
  summarizePackages,
} from './shippingQuoteMath';
import { mapPackingToShipment,
  type PackingStrategy, type PackingAssignment } from '../../../supabase/functions/_shared/shipping-packing';
import { ShippingProductInputs, ShippingPackingWorkspace, PhysicalRulesFields } from './ShippingPackingWorkspace';
import { ShippingPackagingSettings } from './ShippingPackagingSettings';
import { buildPackingPreview, packingInputKey } from './packingPreview';

type ShippingSection = 'new' | 'history' | 'settings';
type TemporaryLogisticsOverride = Partial<ShippingOrderLine> & {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
};

type ProductDimensionDraft = ShippingPhysicalRules & {
  id: string;
  sku: string;
  product_name: string | null;
  width_cm: number;
  length_cm: number;
  height_cm: number;
  unit_weight_kg: number | null;
};

type ShippingQuotesDashboardProps = {
  session: Session;
  onOpenHub: () => void;
};

const defaultDestination = {
  countryCode: 'MX',
  postalCode: '',
  stateOrProvinceCode: '',
  city: '',
  neighborhood: '',
  street: '',
};

export function ShippingQuotesDashboard({ session, onOpenHub }: ShippingQuotesDashboardProps) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<ShippingSection>('new');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const bootstrapQuery = useQuery({
    queryKey: ['shipping-quotes-bootstrap', session.user.id],
    queryFn: getShippingBootstrap,
  });
  const bootstrap = bootstrapQuery.data;
  const isAdmin = Boolean(bootstrap?.access.isAdmin);
  const canUse = Boolean(bootstrap?.access.canAccess);

  function openSection(section: ShippingSection) {
    setSelectedQuoteId(null);
    setActiveSection(section);
  }

  return (
    <div className="admin-shell shipping-quotes-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <ArrowLeft size={18} />
            <span className="admin-module-back-label">Cotizador de Envíos</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones del cotizador de envíos">
          <button className={activeSection === 'new' ? 'active' : undefined} type="button" onClick={() => openSection('new')}>
            <PackagePlus size={18} />
            Nueva Cotización
          </button>
          <button className={activeSection === 'history' ? 'active' : undefined} type="button" onClick={() => openSection('history')}>
            <ClipboardList size={18} />
            Historial
          </button>
          {isAdmin ? (
            <button className={activeSection === 'settings' ? 'active' : undefined} type="button" onClick={() => openSection('settings')}>
              <Settings size={18} />
              Configuración
            </button>
          ) : null}
        </nav>
        <SidebarUserFooter
          email={session.user.email}
          onSignOut={() => void supabase.auth.signOut()}
        />
      </aside>

      <main className="admin-workspace shipping-quotes-workspace">
        <section className="admin-section shipping-quotes-section">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">FedEx Rate + Transit Times</p>
              <h2>Cotizador de Envíos</h2>
              <p className="shipping-quotes-muted">
                Tarifas estimadas, servicios disponibles y tiempos de entrega desde FedEx.
              </p>
            </div>
            <div className="shipping-status-strip">
              {bootstrap?.config?.environment === 'SANDBOX' ? <span>FedEx Sandbox</span> : null}
              <span className={bootstrap?.config?.is_active ? 'success' : 'warning'}>
                {bootstrap?.config?.is_active ? 'Activo' : 'Pendiente de configuración'}
              </span>
            </div>
          </div>

          {bootstrapQuery.isLoading ? (
            <article className="panel">
              <EmptyState title="Cargando cotizador">Consultando configuración segura de FedEx...</EmptyState>
            </article>
          ) : null}

          {bootstrapQuery.error ? (
            <article className="panel">
              <EmptyState title="No se pudo cargar el cotizador">
                {bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : 'Reintenta en unos minutos.'}
              </EmptyState>
            </article>
          ) : null}

          {!bootstrapQuery.isLoading && !canUse ? (
            <article className="panel">
              <EmptyState title="Sin acceso">No tienes permisos para usar el Cotizador de Envíos.</EmptyState>
            </article>
          ) : null}

          {bootstrap && canUse ? (
            <div hidden={activeSection !== 'new'}>
              <NewShippingQuoteSection
                config={bootstrap.config}
                packageTypes={bootstrap.packageTypes}
                isAdmin={isAdmin}
                onOpenSettings={() => openSection('settings')}
                onQuoted={() => {
                  queryClient.invalidateQueries({ queryKey: ['shipping-quotes-history'] });
                }}
              />
            </div>
          ) : null}

          {bootstrap && canUse && activeSection === 'history' ? (
            <HistorySection
              viewAll={bootstrap.access.viewAll}
              selectedQuoteId={selectedQuoteId}
              onSelectQuote={setSelectedQuoteId}
            />
          ) : null}

          {bootstrap && canUse && activeSection === 'settings' && isAdmin ? (
            <SettingsSection bootstrap={bootstrap} />
          ) : null}

          {bootstrap && canUse && activeSection === 'settings' && !isAdmin ? (
            <article className="panel">
              <EmptyState title="Acceso denegado">Solo administradores pueden configurar FedEx.</EmptyState>
            </article>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function NewShippingQuoteSection({
  config,
  packageTypes,
  isAdmin,
  onOpenSettings,
  onQuoted,
}: {
  config: Awaited<ReturnType<typeof getShippingBootstrap>>['config'];
  packageTypes: ShippingPackageType[];
  isAdmin: boolean;
  onOpenSettings: () => void;
  onQuoted: () => void;
}) {
  const [destination, setDestination] = useState(defaultDestination);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderResult, setOrderResult] = useState<ShippingOrderLookupResult | null>(null);
  const [lineOverrides, setLineOverrides] = useState<Record<number, TemporaryLogisticsOverride>>({});
  const [packageMessage, setPackageMessage] = useState<string | null>(null);
  const [packingStrategy, setPackingStrategy] = useState<PackingStrategy>('MIN_PACKAGES');
  const [packingEdits, setPackingEdits] = useState<{ key: string; assignments: PackingAssignment[] } | null>(null);
  const [quote, setQuote] = useState<ShippingQuoteDetail | null>(null);
  const [quotedInputKey, setQuotedInputKey] = useState<string | null>(null);
  const lastResolvedPostalCodeRef = useRef<string | null>(null);
  const [postalLookup, setPostalLookup] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });
  const finalPackagingAdjustment = getFinalPackagingAdjustment(config);
  const effectiveOrderLines = useMemo(
    () => orderResult?.lines.map((line) => applyTemporaryLogisticsOverride(line, lineOverrides[line.lineId])) ?? [],
    [lineOverrides, orderResult?.lines],
  );
  const shippableOrderLines = useMemo(() => effectiveOrderLines.filter(line => line.isEligibleForShipping), [effectiveOrderLines]);
  const excludedOrderLines = effectiveOrderLines.filter((line) => !line.isEligibleForShipping);
  const orderLinesWithMissingData = shippableOrderLines.filter((line) => line.missingFields.length);
  const packingKey = packingInputKey(shippableOrderLines, packageTypes, packingStrategy);
  const manualAssignments = packingEdits?.key === packingKey ? packingEdits.assignments : undefined;
  const packing = useMemo(() => buildPackingPreview(shippableOrderLines, packageTypes, packingStrategy, manualAssignments),
    [shippableOrderLines, packageTypes, packingStrategy, manualAssignments]);
  const packages = packing.plan?.status === 'READY_FOR_QUOTE'
    ? mapPackingToShipment(packing.plan, finalPackagingAdjustment.extraVolumetricWeightKg * 5000) : [];
  const prepared = preparePackages({ drafts: packages, packageTypes: [], weightInputMode: 'GROSS_PACKAGE' });
  const summary = { ...summarizePackages(prepared.packages), baseVolumetricWeight: packing.plan?.packages.reduce((sum,p) => sum + p.externalDimensions.length*p.externalDimensions.width*p.externalDimensions.height/5000,0) ?? 0 };
  const currentInputKey = JSON.stringify([packingKey, packing.assignments, destination, config?.updated_at]);
  const displayedQuote = quotedInputKey === currentInputKey ? quote : null;
  const lookupOrderMutation = useMutation({
    mutationFn: lookupOdooShippingOrder,
    onSuccess: (result) => {
      setOrderResult(result);
      setLineOverrides({});
      setPackingEdits(null);
      setQuote(null);
      setPackageMessage(result.lines.some(line => line.isEligibleForShipping) ? null : 'La orden no tiene productos Consumible con la opción Se puede vender para cotizar envío.');
      const odooDestination = {
        countryCode: 'MX',
        postalCode: result.destination.postalCode ?? '',
        stateOrProvinceCode: result.destination.stateOrProvinceCode ?? '',
        city: result.destination.city ?? '',
        neighborhood: result.destination.neighborhood ?? '',
        street: result.destination.street ?? '',
      };
      setDestination(odooDestination);
      setPostalLookup({ status: 'idle', message: '' });
      lastResolvedPostalCodeRef.current = null;
      if (odooDestination.postalCode) void completeMexicoPostalCode(odooDestination.postalCode, odooDestination);
    },
  });
  const quoteMutation = useMutation({
    mutationFn: (inputKey: string) => {
      if (inputKey !== currentInputKey) throw new Error('La distribución cambió. Revisa los paquetes antes de cotizar.');
      return createShippingQuote({
        destination: {
          countryCode: 'MX',
          postalCode: destination.postalCode.trim(),
          stateOrProvinceCode: destination.stateOrProvinceCode.trim() || null,
          city: destination.city.trim() || null,
          neighborhood: destination.neighborhood.trim() || null,
          street: null,
        },
        requestedShipDate: null,
        packages,
        odooOrderId: orderResult?.order.id ?? null,
        odooOrderName: orderResult?.order.name ?? null,
        packingRequest: { version: 1, strategy: packingStrategy, lines: shippableOrderLines, assignments: packing.assignments },
      });
    },
    onSuccess: ({ quote: nextQuote }, inputKey) => {
      setQuote(nextQuote);
      setQuotedInputKey(inputKey);
      onQuoted();
    },
  });
  if (!config?.is_active) {
    return (
      <article className="panel shipping-setup-warning">
        <AlertTriangle size={24} />
        <div>
          <h3>{isAdmin ? 'Configura FedEx antes de cotizar.' : 'El cotizador de envíos todavía no está disponible.'}</h3>
          <p>{isAdmin ? 'Activa la conexión FedEx y captura el origen predeterminado.' : 'Contacta al administrador para habilitar el servicio.'}</p>
        </div>
        {isAdmin ? (
          <button type="button" onClick={onOpenSettings}>
            Ir a configuración
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <div className="shipping-quote-grid">
      <article className="panel shipping-quote-form-panel">
        <div className="panel-header">
          <div>
            {/* <h2>Nueva Cotización de Envío</h2> */}
            <p>Origen predeterminado: Corporación Tectronic, {formatAddress(config)}</p>
          </div>
          <Truck size={24} />
        </div>
        <div className="shipping-quote-form">
          <div className="shipping-form-band shipping-order-lookup">
            <div className="shipping-band-head">
              <div>
                <h3>Buscar orden de Odoo</h3>
                {/* <p>Captura el número de cotización u orden para crear paquetes editables desde sus productos.</p> */}
              </div>
            </div>
            <label className="field">
              {/* <span>Cotización / Orden Odoo</span> */}
              <div className="shipping-postal-row">
                <input
                  value={orderNumber}
                  placeholder="Ej. S57608"
                  onChange={(event) => setOrderNumber(event.target.value)}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={lookupOrderMutation.isPending || !orderNumber.trim()}
                  onClick={() => lookupOrderMutation.mutate(orderNumber.trim())}
                >
                  {lookupOrderMutation.isPending ? <RefreshCw size={16} className="spin-icon" /> : <Search size={16} />}
                  {lookupOrderMutation.isPending ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </label>
            {lookupOrderMutation.error ? <p className="form-error">{lookupOrderMutation.error.message}</p> : null}
            {orderResult ? (
              <div className="shipping-order-panel">
                <div className="shipping-detail-summary compact">
                  {/* <Metric label="Orden" value={orderResult.order.name} /> */}
                  {/* <Metric label="Estado" value={orderResult.order.state} /> */}
                  <Metric label="Cliente" value={orderResult.destination.name ?? 'Sin nombre'} />
                  <Metric label="Total" value={formatMoney(orderResult.order.amountTotal, orderResult.order.currencyCode ?? 'MXN')} />

                  <Metric label="C.P" value={destination.postalCode} />
                  <Metric label="Colonia" value={destination.neighborhood} />
                  <Metric label="Ciudad" value={destination.city} />
                  <Metric label="Estado" value={destination.stateOrProvinceCode} />
                </div>
                <div className="shipping-order-mini-status">
                  <span>{shippableOrderLines.length} producto(s) para envío</span>
                  {orderLinesWithMissingData.length ? <span className="warning">{orderLinesWithMissingData.length} pendiente(s) por completar en paquetes</span> : <span className="success">Listo para revisar paquetes</span>}
                  {excludedOrderLines.length ? <span>{excludedOrderLines.length} omitido(s)</span> : null}
                </div>
                {orderLinesWithMissingData.length ? (
                  <p className="shipping-filter-note">
                    Completa peso y dimensiones faltantes en “Productos de la orden”.
                  </p>
                ) : null}
                {excludedOrderLines.length ? (
                  <p className="shipping-filter-note">
                    {excludedOrderLines.length} producto(s) no entran en la cotización porque no son Consumible o no tienen marcada la opción Se puede vender.
                  </p>
                ) : null}
                {packageMessage ? <p className="form-error">{packageMessage}</p> : null}
              </div>
            ) : null}
          </div>
          {orderResult ? <ShippingProductInputs lines={shippableOrderLines} isAdmin={isAdmin} onChange={line => {
            setLineOverrides(current => ({...current, [line.lineId]: line})); setPackingEdits(null); setQuote(null);
          }} /> : null}
          {postalLookup.status === 'error' ? <p className="form-error">{postalLookup.message}</p> : null}
          {orderResult?.warnings.map(w => <p className="shipping-filter-note" key={w}>{w}</p>)}
          <article className="panel shipping-rate-panel">
          <div className="panel-header">
            <h2>Resultados</h2>
            <span>{displayedQuote?.rates.length ?? 0} servicios</span>
          </div>
          {displayedQuote ? <RateList quote={displayedQuote} /> : <EmptyState title="Sin cotización">Revisa los productos y su distribución para consultar servicios FedEx.</EmptyState>}
        </article>
        </div>
      </article>
      <aside className="shipping-side-column">
        <form className="panel shipping-summary-card" onSubmit={(event) => {
          event.preventDefault();
          if (prepared.errors.length || packing.plan?.status !== 'READY_FOR_QUOTE') return;
          quoteMutation.mutate(currentInputKey);
        }}>
          <div className="shipping-band-head compact">
            <div>
              <h3>Embalaje y resumen</h3>
              <p>Las cajas resultantes se cotizarán juntas con FedEx.</p>
            </div>
          </div>
          {orderResult && packing.plan ? <ShippingPackingWorkspace plan={packing.plan} lines={shippableOrderLines}
            assignments={packing.assignments} packageTypes={packageTypes} strategy={packingStrategy}
            onStrategy={s => {setPackingStrategy(s);setPackingEdits(null);setQuote(null);}}
            onAssignments={assignments => {setPackingEdits({key:packingKey,assignments});setQuote(null);}}
            onRecalculate={() => {setPackingEdits(null);setQuote(null);}} /> : <p>Busca una orden para preparar su distribución.</p>}
          {packing.error ? <p className="form-error">{packing.error}</p> : null}
          <div className="shipping-summary-grid compact">
            <Metric label="Paquetes" value={`${summary.packageCount}`} />
            <Metric label="Peso real" value={`${formatNumber(summary.actualWeight)} kg`} />
            <Metric label="Vol. base" value={`${formatNumber(summary.baseVolumetricWeight)} kg`} />
            <Metric label="Protección final" value={`+${formatNumber(finalPackagingAdjustment.extraVolumetricWeightKg)} kg`} />
            <Metric label="Vol. total" value={`${formatNumber(summary.volumetricWeight)} kg`} />
            <Metric label="Facturable total" value={`${formatNumber(summary.billableWeight)} kg`} />
          </div>
          {(finalPackagingAdjustment.extraVolumetricWeightKg > 0 || finalPackagingAdjustment.materialCostMxn > 0) ? (
            <div className="shipping-final-packaging-summary">
              {finalPackagingAdjustment.extraVolumetricWeightKg > 0 ? (
                <span>Protección final: +{formatNumber(finalPackagingAdjustment.extraVolumetricWeightKg)} kg volumétricos</span>
              ) : null}
              {finalPackagingAdjustment.materialCostMxn > 0 ? (
                <span>Materia prima de empaque: {formatMoney(finalPackagingAdjustment.materialCostMxn, 'MXN')}</span>
              ) : null}
            </div>
          ) : null}
          {prepared.errors.length ? (
            <div className="shipping-errors">
              {prepared.errors.map((error) => <p key={error}>{error}</p>)}
            </div>
          ) : null}
          {quoteMutation.error ? (
            <p className="form-error">{quoteMutation.error.message}</p>
          ) : null}
          <button type="submit" disabled={quoteMutation.isPending || prepared.errors.length > 0 || !packages.length || packing.plan?.status !== 'READY_FOR_QUOTE'}>
            {quoteMutation.isPending ? <RefreshCw size={16} className="spin-icon" /> : <Truck size={16} />}
            {quoteMutation.isPending ? 'Consultando tarifas...' : 'Cotizar con FedEx'}
          </button>
          <small>FedEx devuelve tarifas estimadas; pueden variar al documentar el envío.</small>
        </form>
      </aside>
    </div>
  );

  async function completeMexicoPostalCode(postalCodeValue = destination.postalCode, fallback?: typeof destination) {
    const postalCode = postalCodeValue.replace(/\D/g, '').slice(0, 5);
    if (postalCode.length !== 5) {
      setPostalLookup({ status: 'error', message: 'Escribe un código postal mexicano de 5 dígitos.' });
      return;
    }
    if (lastResolvedPostalCodeRef.current === postalCode) return;
    lastResolvedPostalCodeRef.current = postalCode;
    setPostalLookup({ status: 'loading', message: '' });
    try {
      const result = await lookupMexicoPostalCode(postalCode);
      setDestination((current) => current.postalCode.replace(/\D/g, '').slice(0, 5) === postalCode ? {
        ...current,
        ...fallback,
        countryCode: 'MX',
        postalCode,
        neighborhood: result.neighborhood || fallback?.neighborhood || current.neighborhood,
        city: result.city || fallback?.city || current.city,
        stateOrProvinceCode: result.state || fallback?.stateOrProvinceCode || current.stateOrProvinceCode,
      } : current);
      setPostalLookup({ status: 'success', message: '' });
    } catch (error) {
      lastResolvedPostalCodeRef.current = null;
      setPostalLookup({
        status: 'error',
        message: error instanceof Error ? error.message : 'No se pudo completar el destino con ese código postal.',
      });
    }
  }
}

function HistorySection({
  viewAll,
  selectedQuoteId,
  onSelectQuote,
}: {
  viewAll: boolean;
  selectedQuoteId: string | null;
  onSelectQuote: (id: string | null) => void;
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'SUCCESS' | 'ERROR'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const exchangeRateQuery = useShippingExchangeRate();
  const query = useQuery({
    queryKey: ['shipping-quotes-history', scope, search, status, page],
    queryFn: () => listShippingQuotes({ page, pageSize, scope, search, status, dateFrom: null, dateTo: null }),
  });
  const detailQuery = useQuery({
    queryKey: ['shipping-quote-detail', selectedQuoteId],
    queryFn: () => getShippingQuote(selectedQuoteId ?? ''),
    enabled: Boolean(selectedQuoteId),
  });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <>
      <article className="panel">
        <div className="table-toolbar shipping-history-toolbar">
          <label className="inline-search">
            <ClipboardList size={18} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar folio, usuario o servicio" />
          </label>
          <select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}>
            <option value="all">Todos los estados</option>
            <option value="SUCCESS">Exitosas</option>
            <option value="ERROR">Con error</option>
          </select>
          {viewAll ? (
            <select value={scope} onChange={(event) => { setScope(event.target.value as typeof scope); setPage(1); }}>
              <option value="mine">Mis cotizaciones</option>
              <option value="all">Todas las cotizaciones</option>
            </select>
          ) : null}
        </div>
        <div className="table-wrap">
          <table className="records-table shipping-history-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Destino</th>
                <th>Paquetes</th>
                <th>Peso</th>
                <th>Mejor tarifa</th>
                <th>Servicio</th>
                <th>Entrega</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => (
                <tr key={quote.id}>
                  <td>{quote.quote_number}</td>
                  <td>{formatDateTime(quote.created_at)}</td>
                  <td>{quote.user_email ?? '-'}</td>
                  <td>{formatDestination(quote)}</td>
                  <td>{quote.package_count}</td>
                  <td>{formatNumber(quote.total_billable_weight)} {quote.weight_unit.toLowerCase()}</td>
                  <td>{quote.best_total_amount ? formatMoneyInMxn(quote.best_total_amount, quote.best_currency ?? 'MXN', exchangeRateQuery.data) : '-'}</td>
                  <td>{quote.best_service_name ?? '-'}</td>
                  <td>{quote.best_delivery_label ?? '-'}</td>
                  <td><span className={`status-badge ${quote.status === 'SUCCESS' ? 'success' : 'danger'}`}>{quote.status === 'SUCCESS' ? 'Exitosa' : 'Error'}</span></td>
                  <td>
                    <button type="button" className="table-action" onClick={() => onSelectQuote(quote.id)}>
                      <Eye size={15} />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.isLoading ? <EmptyState title="Cargando historial">Consultando cotizaciones...</EmptyState> : null}
          {!query.isLoading && !rows.length ? <EmptyState title="Sin cotizaciones">Aún no hay cotizaciones para mostrar.</EmptyState> : null}
        </div>
        <div className="pagination-row">
          <span>Página {page} · {total} registros</span>
          <div>
            <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <button type="button" className="secondary-button" disabled={page * pageSize >= total} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
          </div>
        </div>
      </article>
      {selectedQuoteId ? (
        <Modal title="Detalle de cotización" onClose={() => onSelectQuote(null)}>
          {detailQuery.isLoading ? <EmptyState title="Cargando detalle">Consultando cotización...</EmptyState> : null}
          {detailQuery.data?.quote ? <QuoteDetail quote={detailQuery.data.quote} /> : null}
        </Modal>
      ) : null}
    </>
  );
}

function SettingsSection({ bootstrap }: { bootstrap: Awaited<ReturnType<typeof getShippingBootstrap>> }) {
  const queryClient = useQueryClient();
  const [settingsTab, setSettingsTab] = useState<'fedex' | 'products' | 'packaging'>('fedex');
  const [productImportPreview, setProductImportPreview] = useState<ShippingProductDimensionsImportPreview | null>(null);
  const [productImportFileName, setProductImportFileName] = useState('');
  const [editingProduct, setEditingProduct] = useState<ProductDimensionDraft | null>(null);
  const [configDraft, setConfigDraft] = useState<ShippingCarrierConfigDraft>(() => ({
    environment: bootstrap.config?.environment ?? 'SANDBOX',
    is_active: bootstrap.config?.is_active ?? false,
    account_number: '',
    client_id: '',
    client_secret: '',
    origin_country_code: bootstrap.config?.origin_country_code ?? 'MX',
    origin_postal_code: bootstrap.config?.origin_postal_code ?? '',
    origin_state_code: bootstrap.config?.origin_state_code ?? '',
    origin_city: bootstrap.config?.origin_city ?? '',
    origin_street: '',
    preferred_currency: bootstrap.config?.preferred_currency ?? 'MXN',
    pickup_type: bootstrap.config?.pickup_type ?? 'USE_SCHEDULED_PICKUP',
    return_transit_times: bootstrap.config?.return_transit_times ?? true,
    rate_request_types: bootstrap.config?.rate_request_types ?? ['ACCOUNT'],
    rate_display_option: bootstrap.config?.rate_display_option ?? 'LOWER_RATE',
    weight_input_mode: bootstrap.config?.weight_input_mode ?? 'NET_CONTENT',
    final_volume_padding_enabled: bootstrap.config?.final_volume_padding_enabled ?? true,
    final_padding_length_cm: bootstrap.config?.final_padding_length_cm ?? 0,
    final_padding_width_cm: bootstrap.config?.final_padding_width_cm ?? 0,
    final_padding_height_cm: bootstrap.config?.final_padding_height_cm ?? 0,
    final_packaging_cost_enabled: bootstrap.config?.final_packaging_cost_enabled ?? true,
    final_packaging_material_cost: bootstrap.config?.final_packaging_material_cost ?? 0,
  }));
  const saveConfig = useMutation({
    mutationFn: saveShippingCarrierConfig,
    onSuccess: ({ config }) => {
      setConfigDraft((current) => ({
        ...current,
        environment: config.environment,
        is_active: config.is_active,
        account_number: '',
        client_id: '',
        client_secret: '',
        origin_country_code: config.origin_country_code ?? '',
        origin_postal_code: config.origin_postal_code ?? '',
        origin_state_code: config.origin_state_code ?? '',
        origin_city: config.origin_city ?? '',
        preferred_currency: config.preferred_currency ?? 'MXN',
        pickup_type: config.pickup_type ?? 'USE_SCHEDULED_PICKUP',
        return_transit_times: config.return_transit_times,
        rate_request_types: config.rate_request_types,
        rate_display_option: config.rate_display_option,
        weight_input_mode: config.weight_input_mode,
        final_volume_padding_enabled: config.final_volume_padding_enabled,
        final_padding_length_cm: config.final_padding_length_cm,
        final_padding_width_cm: config.final_padding_width_cm,
        final_padding_height_cm: config.final_padding_height_cm,
        final_packaging_cost_enabled: config.final_packaging_cost_enabled,
        final_packaging_material_cost: config.final_packaging_material_cost,
      }));
      void queryClient.invalidateQueries({ queryKey: ['shipping-quotes-bootstrap'] });
    },
  });
  const testConnection = useMutation({ mutationFn: testShippingCarrierConnection });
  const dimensionsQuery = useQuery({
    queryKey: ['shipping-product-dimensions'],
    queryFn: listShippingProductDimensions,
    enabled: settingsTab === 'products',
  });
  const previewImport = useMutation({
    mutationFn: previewShippingProductDimensionsImport,
    onSuccess: (preview, variables) => {
      setProductImportPreview(preview);
      setProductImportFileName(variables.fileName);
    },
  });
  const confirmImport = useMutation({
    mutationFn: importShippingProductDimensions,
    onSuccess: () => {
      setProductImportPreview(null);
      setProductImportFileName('');
      queryClient.invalidateQueries({ queryKey: ['shipping-product-dimensions'] });
    },
  });
  const saveProduct = useMutation({
    mutationFn: saveShippingProductDimension,
    onSuccess: () => {
      setEditingProduct(null);
      queryClient.invalidateQueries({ queryKey: ['shipping-product-dimensions'] });
    },
  });

  return (
    <div className="shipping-settings-stack">
      <div className="shipping-settings-tabs" role="tablist" aria-label="Configuración del cotizador">
        <button type="button" className={settingsTab === 'fedex' ? 'active' : undefined} onClick={() => setSettingsTab('fedex')}>
          <ShieldCheck size={16} />
          FedEx y origen
        </button>
        <button type="button" className={settingsTab === 'products' ? 'active' : undefined} onClick={() => setSettingsTab('products')}>
          <Database size={16} />
          Base de productos
        </button>
        <button type="button" className={settingsTab === 'packaging' ? 'active' : undefined} onClick={() => setSettingsTab('packaging')}><PackagePlus size={16} />Embalajes</button>
      </div>
      {settingsTab === 'fedex' ? (
      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>FedEx</h2>
            <p>Credenciales cifradas y origen predeterminado.</p>
          </div>
          <ShieldCheck size={24} />
        </div>
        <form className="compact-form" onSubmit={(event) => {
          event.preventDefault();
          saveConfig.mutate({ ...configDraft, origin_street: '' });
        }}>
          <div className="shipping-secret-row">
            <span>Account Number actual</span>
            <strong>{bootstrap.config?.account_number_masked ?? 'Sin guardar'}</strong>
            <small>{bootstrap.config?.account_number_masked ? 'Guardado de forma cifrada en Supabase.' : 'Pendiente de configurar.'}</small>
          </div>
          <div className="shipping-secret-row">
            <span>Client ID actual</span>
            <strong>{bootstrap.config?.client_id_masked ?? 'Sin guardar'}</strong>
          </div>
          <div className="shipping-secret-row">
            <span>Client Secret actual</span>
            <strong>{bootstrap.config?.client_secret_configured ? 'Configurado' : 'Sin guardar'}</strong>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Ambiente</span>
              <select value={configDraft.environment} onChange={(event) => setConfigDraft((current) => ({
                ...current,
                environment: event.target.value as 'SANDBOX' | 'PRODUCTION',
              }))}>
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION">Producción</option>
              </select>
            </label>
            <TextInput
              label="Account Number"
              value={configDraft.account_number}
              onChange={(value) => setConfigDraft((current) => ({ ...current, account_number: value }))}
              placeholder={bootstrap.config?.account_number_masked ? `Guardado: ${bootstrap.config.account_number_masked} · dejar vacío para conservar` : 'Número de cuenta FedEx'}
              autoComplete="off"
            />
            <TextInput label="Client ID / API Key" value={configDraft.client_id} onChange={(value) => setConfigDraft((current) => ({ ...current, client_id: value }))} placeholder={bootstrap.config?.client_id_masked ? `Guardado: ${bootstrap.config.client_id_masked} · dejar vacío para conservar` : 'Client ID / API Key de FedEx'} autoComplete="off" />
            <TextInput label="Client Secret" type="password" value={configDraft.client_secret} onChange={(value) => setConfigDraft((current) => ({ ...current, client_secret: value }))} placeholder={bootstrap.config?.client_secret_configured ? 'Configurado · dejar vacío para conservar' : 'Client Secret de FedEx'} autoComplete="new-password" />
            <TextInput label="País origen" value={configDraft.origin_country_code} onChange={(value) => setConfigDraft((current) => ({ ...current, origin_country_code: value }))} maxLength={2} />
            <TextInput label="Código postal origen" value={configDraft.origin_postal_code} onChange={(value) => setConfigDraft((current) => ({ ...current, origin_postal_code: value }))} />
            <TextInput label="Estado origen" value={configDraft.origin_state_code} onChange={(value) => setConfigDraft((current) => ({ ...current, origin_state_code: value }))} />
            <TextInput label="Ciudad origen" value={configDraft.origin_city} onChange={(value) => setConfigDraft((current) => ({ ...current, origin_city: value }))} />
            <TextInput label="Moneda preferida" value={configDraft.preferred_currency} onChange={(value) => setConfigDraft((current) => ({ ...current, preferred_currency: value }))} maxLength={3} />
            <label className="field">
              <span>Captura de peso</span>
              <select value={configDraft.weight_input_mode} onChange={(event) => setConfigDraft((current) => ({ ...current, weight_input_mode: event.target.value as 'NET_CONTENT' | 'GROSS_PACKAGE' }))}>
                <option value="NET_CONTENT">Peso del contenido + tara</option>
                <option value="GROSS_PACKAGE">Peso bruto capturado</option>
              </select>
            </label>
          </div>
          <div className="shipping-final-packaging-card">
            <div>
              <h3>Configuración de embalaje final</h3>
              <p>Valores adicionales para protección final antes de consultar FedEx.</p>
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={configDraft.final_volume_padding_enabled}
                onChange={(event) => setConfigDraft((current) => ({ ...current, final_volume_padding_enabled: event.target.checked }))}
              />
              Sumar dimensiones añadidas al volumen final
            </label>
            <div className="form-grid">
              <NumberInput label="Largo añadido (cm)" value={configDraft.final_padding_length_cm} onChange={(value) => setConfigDraft((current) => ({ ...current, final_padding_length_cm: value ?? 0 }))} />
              <NumberInput label="Ancho añadido (cm)" value={configDraft.final_padding_width_cm} onChange={(value) => setConfigDraft((current) => ({ ...current, final_padding_width_cm: value ?? 0 }))} />
              <NumberInput label="Alto añadido (cm)" value={configDraft.final_padding_height_cm} onChange={(value) => setConfigDraft((current) => ({ ...current, final_padding_height_cm: value ?? 0 }))} />
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={configDraft.final_packaging_cost_enabled}
                onChange={(event) => setConfigDraft((current) => ({ ...current, final_packaging_cost_enabled: event.target.checked }))}
              />
              Sumar costo de materia prima de empaque al resultado final
            </label>
            <NumberInput
              label="Costo de materia prima de empaque"
              value={configDraft.final_packaging_material_cost}
              onChange={(value) => setConfigDraft((current) => ({ ...current, final_packaging_material_cost: value ?? 0 }))}
            />
          </div>
          <label className="check-field">
            <input type="checkbox" checked={configDraft.is_active} onChange={(event) => setConfigDraft((current) => ({ ...current, is_active: event.target.checked }))} />
            Cotizador activo
          </label>
          {saveConfig.error ? <p className="form-error">{saveConfig.error.message}</p> : null}
          {testConnection.error ? <p className="form-error">{testConnection.error.message}</p> : null}
          {testConnection.data ? <p className="form-success">{testConnection.data.message}</p> : null}
          <div className="form-actions">
            <button type="submit" disabled={saveConfig.isPending}>
              <Save size={16} />
              {saveConfig.isPending ? 'Guardando...' : 'Guardar configuración'}
            </button>
            <button type="button" className="secondary-button" disabled={testConnection.isPending} onClick={() => testConnection.mutate()}>
              <CheckCircle2 size={16} />
              {testConnection.isPending ? 'Probando...' : 'Probar conexión'}
            </button>
          </div>
        </form>
      </article>
      ) : settingsTab === 'packaging' ? <ShippingPackagingSettings packageTypes={bootstrap.packageTypes} /> : (
        <article className="panel shipping-products-database-panel">
          <div className="panel-header">
            <div>
              <h2>Base de productos</h2>
              <p>Actualiza peso y dimensiones por referencia/código Legacy para autocompletar paquetes desde Odoo.</p>
            </div>
            <FileSpreadsheet size={24} />
          </div>
          <div className="shipping-import-card">
            <div>
              <strong>Cargar Excel de equipos</strong>
              <span>El sistema compara la columna Equipo con la referencia o código Legacy de Odoo. Si el SKU existe, podrás confirmar si reemplazas sus propiedades.</span>
            </div>
            <label className="secondary-button shipping-file-button">
              <Upload size={16} />
              Seleccionar Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  void fileToBase64(file).then((fileBase64) => {
                    previewImport.mutate({ fileName: file.name, fileBase64 });
                  });
                }}
              />
            </label>
          </div>
          {previewImport.error ? <p className="form-error">{previewImport.error.message}</p> : null}
          {confirmImport.error ? <p className="form-error">{confirmImport.error.message}</p> : null}
          {confirmImport.data ? (
            <p className="form-success">
              Base actualizada: {confirmImport.data.inserted} nuevos, {confirmImport.data.updated} actualizados, {confirmImport.data.unchanged} sin cambios.
            </p>
          ) : null}
          <div className="shipping-dimension-stats">
            <Metric label="Registros" value={`${dimensionsQuery.data?.total ?? 0}`} />
            <Metric label="Última carga" value={dimensionsQuery.data?.rows[0]?.source_file_name ?? 'Sin registros'} />
            <Metric label="Cruce" value="Referencia / Legacy" />
          </div>
          <div className="table-wrap">
            <table className="records-table shipping-dimensions-table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Descripción</th>
                  <th>Medidas</th>
                  <th>Peso</th>
                  <th>Actualizado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(dimensionsQuery.data?.rows ?? []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.sku}</td>
                    <td>{row.product_name ?? '-'}</td>
                    <td>{formatNumber(row.length_cm)} × {formatNumber(row.width_cm)} × {formatNumber(row.height_cm)} cm</td>
                    <td>{row.unit_weight_kg === null ? 'Sin peso físico' : `${formatNumber(row.unit_weight_kg)} kg`}</td>
                    <td>{formatDateTime(row.updated_at)}</td>
                    <td>
                      <button type="button" className="table-action" onClick={() => setEditingProduct(productDimensionToDraft(row))}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dimensionsQuery.isLoading ? <EmptyState title="Cargando base">Consultando productos guardados...</EmptyState> : null}
            {!dimensionsQuery.isLoading && !(dimensionsQuery.data?.rows ?? []).length ? (
              <EmptyState title="Sin productos">La base inicial se cargará desde Supabase al aplicar la migración.</EmptyState>
            ) : null}
          </div>
        </article>
      )}

      {productImportPreview ? (
        <Modal title="Confirmar actualización de base" onClose={() => {
          if (!confirmImport.isPending) setProductImportPreview(null);
        }}>
          <div className="shipping-import-preview">
            <p>
              Archivo <strong>{productImportFileName}</strong>: {productImportPreview.newCount} productos nuevos,
              {' '}{productImportPreview.updateCount} con cambios y {productImportPreview.unchangedCount} sin cambios.
            </p>
            {productImportPreview.conflicts.some((item) => item.changed) ? (
              <div className="shipping-import-conflicts">
                <strong>Productos existentes que se reemplazarán</strong>
                {productImportPreview.conflicts.filter((item) => item.changed).slice(0, 8).map((item) => (
                  <span key={item.sku}>{item.sku}: {formatNumber(item.incoming.length_cm)} × {formatNumber(item.incoming.width_cm)} × {formatNumber(item.incoming.height_cm)} cm · {formatNumber(item.incoming.billable_weight_kg ?? 0)} kg</span>
                ))}
              </div>
            ) : null}
            {productImportPreview.invalidRows.length ? (
              <p className="shipping-filter-note">
                {productImportPreview.invalidRows.length} fila(s) se omitieron por datos incompletos.
              </p>
            ) : null}
            <div className="permission-modal-actions">
              <button
                type="button"
                disabled={confirmImport.isPending}
                onClick={() => confirmImport.mutate({
                  fileName: productImportFileName,
                  rows: productImportPreview.rows,
                  replaceExisting: true,
                })}
              >
                {confirmImport.isPending ? 'Actualizando...' : 'Actualizar base'}
              </button>
              <button type="button" className="secondary-button" disabled={confirmImport.isPending} onClick={() => setProductImportPreview(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {editingProduct ? (
        <Modal title="Editar producto" onClose={() => {
          if (!saveProduct.isPending) setEditingProduct(null);
        }}>
          <form className="shipping-product-edit-form" onSubmit={(event) => {
            event.preventDefault();
            saveProduct.mutate(editingProduct);
          }}>
            <div className="form-grid">
              <TextInput label="Código / referencia" value={editingProduct.sku} onChange={(value) => setEditingProduct((current) => current ? { ...current, sku: value } : current)} />
              <TextInput label="Descripción" value={editingProduct.product_name ?? ''} onChange={(value) => setEditingProduct((current) => current ? { ...current, product_name: value } : current)} />
              <NumberInput label="Largo (cm)" value={editingProduct.length_cm} onChange={(value) => setEditingProduct((current) => current ? { ...current, length_cm: value ?? 0 } : current)} />
              <NumberInput label="Ancho (cm)" value={editingProduct.width_cm} onChange={(value) => setEditingProduct((current) => current ? { ...current, width_cm: value ?? 0 } : current)} />
              <NumberInput label="Alto (cm)" value={editingProduct.height_cm} onChange={(value) => setEditingProduct((current) => current ? { ...current, height_cm: value ?? 0 } : current)} />
              <NumberInput label="Peso físico (kg)" value={editingProduct.unit_weight_kg} onChange={(value) => setEditingProduct((current) => current ? { ...current, unit_weight_kg: value } : current)} />
            </div>
            <PhysicalRulesFields value={editingProduct} onChange={patch => setEditingProduct(current => current ? {...current, ...patch} : current)} />
            {saveProduct.error ? <p className="form-error">{saveProduct.error.message}</p> : null}
            <div className="permission-modal-actions">
              <button type="submit" disabled={saveProduct.isPending}>
                <Save size={16} />
                {saveProduct.isPending ? 'Guardando...' : 'Guardar producto'}
              </button>
              <button type="button" className="secondary-button" disabled={saveProduct.isPending} onClick={() => setEditingProduct(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function QuoteDetail({ quote }: { quote: ShippingQuoteDetail }) {
  const exchangeRateQuery = useShippingExchangeRate();
  return (
    <div className="shipping-quote-detail">
      <div className="shipping-detail-summary">
        <Metric label="Folio" value={quote.quote_number} />
        <Metric label="Fecha" value={formatDateTime(quote.created_at)} />
        <Metric label="Destino" value={formatDestination(quote)} />
        <Metric label="Mejor tarifa" value={quote.best_total_amount ? formatMoneyInMxn(quote.best_total_amount, quote.best_currency ?? 'MXN', exchangeRateQuery.data) : '-'} />
      </div>
      <h3>Paquetes</h3>
      <div className="shipping-detail-list">
        {quote.packages.map((item) => (
          <div key={item.id}>
            <strong>Paquete {item.package_index}</strong>
            <span>{readSnapshotName(item.package_snapshot)} · {item.length} × {item.width} × {item.height} {item.dimension_unit.toLowerCase()}</span>
            <span>Contenido {formatNumber(item.content_weight)} {item.weight_unit.toLowerCase()} · Tara {formatNumber(item.tare_weight)} · Total {formatNumber(item.billable_weight)}</span>
          </div>
        ))}
      </div>
      <h3>Servicios obtenidos</h3>
      <RateList quote={quote} />
    </div>
  );
}

function RateList({ quote }: { quote: ShippingQuoteDetail }) {
  const exchangeRateQuery = useShippingExchangeRate();
  const exchangeRate = exchangeRateQuery.data;
  if (!quote.rates.length) {
    return <EmptyState title="Sin servicios">FedEx no devolvió servicios para esta cotización.</EmptyState>;
  }
  return (
    <div className="shipping-rate-list">
      {quote.rates.map((rate) => (
        <div className="shipping-rate-card" key={rate.id}>
          <div>
            <strong>{rate.service_name}</strong>
            <span>{rate.service_code}</span>
          </div>
          <div>
            <strong>Total final {formatRateTotalInMxn(rate, exchangeRate)}</strong>
            <span>{rate.delivery_label ?? 'Tiempo de entrega no disponible'}</span>
          </div>
          {readFinalPackagingCostMxn(rate.raw_summary) > 0 ? (
            <span className="shipping-rate-conversion">
              FedEx: {formatRateCarrierCostInMxn(rate, exchangeRate)} · Empaque: {formatMoney(readFinalPackagingCostMxn(rate.raw_summary), 'MXN')}
            </span>
          ) : null}
          {shouldShowOriginalCurrency(rate.currency, exchangeRate) ? (
            <span className="shipping-rate-conversion">
              Original FedEx: {formatMoney(rate.total_amount, rate.currency)} · TC USD/MXN {exchangeRate ? formatRate(exchangeRate.rate) : '-'}
            </span>
          ) : null}
          {normalizeCurrencyCode(rate.currency) === 'USD' && exchangeRateQuery.error ? (
            <span className="shipping-rate-conversion warning">No se pudo consultar el tipo de cambio; se muestra el importe original.</span>
          ) : null}
          <small>
            Base {rate.base_amount !== null ? formatMoneyInMxn(rate.base_amount, rate.currency, exchangeRate) : '-'} ·
            Descuentos {rate.discount_amount !== null ? formatMoneyInMxn(rate.discount_amount, rate.currency, exchangeRate) : '-'} ·
            Recargos {rate.surcharge_amount !== null ? formatMoneyInMxn(rate.surcharge_amount, rate.currency, exchangeRate) : '-'} ·
            Impuestos {rate.tax_amount !== null ? formatMoneyInMxn(rate.tax_amount, rate.currency, exchangeRate) : '-'}
          </small>
        </div>
      ))}
    </div>
  );
}

function applyTemporaryLogisticsOverride(
  line: ShippingOrderLookupResult['lines'][number],
  override?: TemporaryLogisticsOverride,
): ShippingOrderLookupResult['lines'][number] {
  if (!override) return line;
  const nextLine = {
    ...line,
    ...override,
    lengthCm: override.lengthCm,
    widthCm: override.widthCm,
    heightCm: override.heightCm,
    weightKg: override.weightKg,
    logisticsSource: 'Datos temporales capturados en el cotizador',
  };
  return {
    ...nextLine,
    missingFields: nextLine.isEligibleForShipping ? calculateMissingLogisticsFields(nextLine) : [],
  };
}

function calculateMissingLogisticsFields(value: {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
}) {
  return [
    !isPositiveNumber(value.lengthCm) ? 'largo' : null,
    !isPositiveNumber(value.widthCm) ? 'ancho' : null,
    !isPositiveNumber(value.heightCm) ? 'alto' : null,
    value.weightKg === null || !Number.isFinite(value.weightKg) || value.weightKg < 0 ? 'peso físico' : null,
  ].filter((item): item is string => Boolean(item));
}

function productDimensionToDraft(row: ShippingProductDimension): ProductDimensionDraft {
  return {
    ...row,
    id: row.id,
    sku: row.sku,
    product_name: row.product_name,
    width_cm: Number(row.width_cm) || 0,
    length_cm: Number(row.length_cm) || 0,
    height_cm: Number(row.height_cm) || 0,
    unit_weight_kg: row.unit_weight_kg === null ? null : Number(row.unit_weight_kg),
  };
}

function getFinalPackagingAdjustment(config: Awaited<ReturnType<typeof getShippingBootstrap>>['config']) {
  const length = Number(config?.final_padding_length_cm ?? 0);
  const width = Number(config?.final_padding_width_cm ?? 0);
  const height = Number(config?.final_padding_height_cm ?? 0);
  const extraVolumetricWeightKg = config?.final_volume_padding_enabled && [length, width, height].every((value) => Number.isFinite(value) && value > 0)
    ? round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 5000, 3)
    : 0;
  const materialCostMxn = config?.final_packaging_cost_enabled && Number.isFinite(Number(config.final_packaging_material_cost))
    ? Math.max(0, Number(config.final_packaging_material_cost))
    : 0;
  return {
    extraVolumetricWeightKg,
    materialCostMxn,
  };
}

function isPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  maxLength,
  autoComplete = 'off',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} required={required} maxLength={maxLength} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} step="0.001" value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="shipping-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop shipping-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="modal-card modal-wide shipping-modal-card">
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

function formatAddress(config: Awaited<ReturnType<typeof getShippingBootstrap>>['config']) {
  if (!config) return 'Sin configurar';
  return [config.origin_city, config.origin_state_code, config.origin_postal_code, config.origin_country_code]
    .filter(Boolean)
    .join(', ') || 'Sin origen configurado';
}

function formatDestination(quote: ShippingQuoteRow) {
  const destination = quote.destination;
  return [destination.neighborhood, destination.city, destination.stateOrProvinceCode, destination.postalCode, destination.countryCode]
    .filter(Boolean)
    .join(', ');
}

async function lookupMexicoPostalCode(postalCode: string) {
  const response = await fetch(`https://sepomex.kurenn.dev/api/v1/zip_codes?zip_code=${encodeURIComponent(postalCode)}&per_page=20`);
  if (!response.ok) throw new Error('No encontré colonia, ciudad y estado para ese código postal.');
  const payload = await response.json() as {
    zip_codes?: Array<{
      d_asenta?: string;
      d_ciudad?: string;
      d_mnpio?: string;
      d_estado?: string;
    }>;
  };
  const place = payload.zip_codes?.[0];
  if (!place) throw new Error('No encontré colonia, ciudad y estado para ese código postal.');
  return {
    neighborhood: place.d_asenta ?? '',
    city: place.d_ciudad || place.d_mnpio || '',
    state: place.d_estado ?? '',
  };
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',').pop() ?? '' : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function useShippingExchangeRate() {
  return useQuery({
    queryKey: ['shipping-usd-mxn-exchange-rate'],
    queryFn: fetchUsdMxnExchangeRate,
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });
}

function convertMoneyToMxn(value: number, currency: string, exchangeRate?: ExchangeRateResult) {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  if (normalizedCurrency === 'MXN') return value;
  if (normalizedCurrency === 'USD' && exchangeRate?.rate) return value * exchangeRate.rate;
  return value;
}

function formatMoneyInMxn(value: number, currency: string, exchangeRate?: ExchangeRateResult) {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  if (normalizedCurrency === 'MXN') return formatMoney(value, 'MXN');
  if (normalizedCurrency === 'USD' && exchangeRate?.rate) return formatMoney(convertMoneyToMxn(value, currency, exchangeRate), 'MXN');
  return formatMoney(value, currency);
}

function formatRateTotalInMxn(
  rate: ShippingQuoteDetail['rates'][number],
  exchangeRate?: ExchangeRateResult,
) {
  const finalPackagingCostMxn = readFinalPackagingCostMxn(rate.raw_summary);
  const converted = convertMoneyToMxn(rate.total_amount, rate.currency, exchangeRate);
  const alreadyIncluded = readNumberFromRecord(rate.raw_summary, 'finalPackagingMaterialCost') > 0;
  const total = alreadyIncluded ? converted : converted + finalPackagingCostMxn;
  return formatMoney(total, 'MXN');
}

function formatRateCarrierCostInMxn(
  rate: ShippingQuoteDetail['rates'][number],
  exchangeRate?: ExchangeRateResult,
) {
  const finalPackagingCostMxn = readFinalPackagingCostMxn(rate.raw_summary);
  const converted = convertMoneyToMxn(rate.total_amount, rate.currency, exchangeRate);
  const alreadyIncluded = readNumberFromRecord(rate.raw_summary, 'finalPackagingMaterialCost') > 0;
  const carrierCost = alreadyIncluded ? Math.max(0, converted - finalPackagingCostMxn) : converted;
  return formatMoney(carrierCost, 'MXN');
}

function readFinalPackagingCostMxn(value: Record<string, unknown>) {
  return Math.max(
    readNumberFromRecord(value, 'finalPackagingMaterialCost'),
    readNumberFromRecord(value, 'finalPackagingMaterialCostPendingMxn'),
  );
}

function readNumberFromRecord(value: Record<string, unknown>, key: string) {
  const parsed = Number(value[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function shouldShowOriginalCurrency(currency: string, exchangeRate?: ExchangeRateResult) {
  return normalizeCurrencyCode(currency) === 'USD' && Boolean(exchangeRate?.rate);
}

function formatRate(value: number) {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatMoney(value: number, currency: string) {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function readSnapshotName(value: Record<string, unknown>) {
  return typeof value.name === 'string' ? value.name : 'Embalaje histórico';
}

function normalizeCurrencyCode(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (normalized === 'NMP') return 'MXN';
  return normalized || 'MXN';
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
