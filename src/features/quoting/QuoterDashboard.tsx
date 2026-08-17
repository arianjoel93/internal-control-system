import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  BookOpen,
  Calculator,
  Clock3,
  FileSpreadsheet,
  Layers3,
  Percent,
  RefreshCw,
  Ruler,
  Sparkles,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { openModuleDocs } from '../../lib/moduleDocs';
import { supabase } from '../../lib/supabase';
import { SidebarUserFooter } from '../admin/SidebarUserFooter';
import { fetchUsdMxnExchangeRate } from '../admin/calculatorService';

type QuoterDashboardProps = {
  session: Session;
  onOpenHub: () => void;
};

type InkLevel = 'low' | 'medium' | 'high';
type OrientationMode = 'optimized' | 'front' | 'rotated';

type LabelMaterial = {
  code: string;
  name: string;
  rollWidthMm: number;
  rollLengthM: number;
  costPerTemplate: Record<InkLevel, number>;
};

type QuoteForm = {
  exchangeRate: number;
  widthMm: number;
  heightMm: number;
  thousands: number;
  laminated: boolean;
  varnishPasses: number;
  automaticLabeling: boolean;
  margin: number;
  orientation: OrientationMode;
};

type MaterialQuote = LabelMaterial & {
  usdPrices: Record<InkLevel, number>;
  distributorPrices: Record<InkLevel, number>;
  publicPrices: Record<InkLevel, number>;
  publicTotals: Record<InkLevel, number>;
};

const BASE_WIDTH_MM = 80;
const BASE_HEIGHT_MM = 120;
const BASE_EXCHANGE_RATE = 19;
const AVAILABLE_WIDTH_MM = 324;
const AVAILABLE_LENGTH_MM = 3000;
const LABEL_GAP_MM = 3;
const MINIMUM_ORDER_MXN = 1500;
const MINIMUM_UNIT_PRICE = 0.597;
const MONEY_DECIMALS = 3;
const LAMINATE_COST = 0.5;
const VARNISH_COST = 1;

const MARGIN_OPTIONS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

const MATERIALS: LabelMaterial[] = [
  {
    code: 'CS01',
    name: 'Couché Digital',
    rollWidthMm: 340,
    rollLengthM: 1524,
    costPerTemplate: { low: 3.86, medium: 4.87, high: 5.29 },
  },
  {
    code: 'BM01',
    name: 'Metalizado BOPP + White',
    rollWidthMm: 340,
    rollLengthM: 1524,
    costPerTemplate: { low: 6.43, medium: 7.43, high: 8.43 },
  },
  {
    code: 'BB01',
    name: 'BOPP blanco',
    rollWidthMm: 340,
    rollLengthM: 1524,
    costPerTemplate: { low: 4.35, medium: 5.14, high: 5.86 },
  },
  {
    code: 'BT01',
    name: 'Transparente + White',
    rollWidthMm: 340,
    rollLengthM: 1524,
    costPerTemplate: { low: 5.29, medium: 6.29, high: 7.29 },
  },
  {
    code: 'TX01',
    name: 'Texturizado',
    rollWidthMm: 340,
    rollLengthM: 1524,
    costPerTemplate: { low: 7.43, medium: 8.14, high: 8.86 },
  },
];

const initialForm: QuoteForm = {
  exchangeRate: BASE_EXCHANGE_RATE,
  widthMm: BASE_WIDTH_MM,
  heightMm: BASE_HEIGHT_MM,
  thousands: 1,
  laminated: true,
  varnishPasses: 0,
  automaticLabeling: false,
  margin: 0.3,
  orientation: 'optimized',
};

export function QuoterDashboard({ session, onOpenHub }: QuoterDashboardProps) {
  const [form, setForm] = useState<QuoteForm>(initialForm);
  const [submittedForm, setSubmittedForm] = useState<QuoteForm>(initialForm);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [rateDate, setRateDate] = useState('');
  const [rateSource, setRateSource] = useState('');
  const [lastRateCheck, setLastRateCheck] = useState('');

  const quotes = useMemo(() => buildMaterialQuotes(submittedForm), [submittedForm]);
  const finalSummary = useMemo(() => buildFinalSummary(quotes), [quotes]);

  useEffect(() => {
    void refreshExchangeRate();
  }, []);

  async function refreshExchangeRate() {
    setRateLoading(true);
    setRateError('');

    try {
      const response = await fetchUsdMxnExchangeRate();
      setRateDate(response.date);
      setRateSource(response.source);
      setLastRateCheck(new Date().toISOString());
      setForm((current) => normalizeForm({ ...current, exchangeRate: response.rate }));
      setSubmittedForm((current) => normalizeForm({ ...current, exchangeRate: response.rate }));
    } catch (error) {
      setRateError(error instanceof Error ? error.message : 'No se pudo consultar el tipo de cambio.');
    } finally {
      setRateLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedForm(normalizeForm(form));
  }

  function updateForm<Key extends keyof QuoteForm>(key: Key, value: QuoteForm[Key]) {
    setForm((current) => normalizeForm({ ...current, [key]: value }));
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Cotizador</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones de cotización">
          <button className="active" type="button">
            <FileSpreadsheet size={18} />
            Etiquetas IMEBA
          </button>
          <button type="button" onClick={() => openModuleDocs('imeba-quoter')}>
            <BookOpen size={18} />
            Docs
          </button>
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
        <section className="admin-section imeba-quoter">
          <div className="imeba-quote-hero">
            <div className="imeba-quote-brand">
              <img src="/imeba-logo.png" alt="IMEBA impresos y etiquetas" />
              <div>
                <p className="eyebrow">Cotizador 2023 etiquetas digitales</p>
                <h2>Cotizador de costos de etiquetas</h2>
                <span>Epson SurePress UV · precios unitarios sin IVA en pesos mexicanos</span>
              </div>
            </div>
            <div className="imeba-quote-hero-card">
              <Sparkles size={22} />
              <span>Pedido mínimo antes de IVA</span>
              <strong>{formatMoney(MINIMUM_ORDER_MXN)}</strong>
            </div>
            <button type="button" className="secondary-button imeba-docs-button" onClick={() => openModuleDocs('imeba-quoter')}>
              <BookOpen size={18} />
              Docs
            </button>
          </div>

          <div className="imeba-quote-layout">
            <article className="panel imeba-quote-input-panel">
              <div className="panel-header">
                <h2>Datos de la etiqueta</h2>
                <span>Basado en el Excel IMEBA</span>
              </div>

              <form className="compact-form imeba-quote-form" onSubmit={submit}>
                <div className="form-grid">
                  <NumberField
                    label="Tipo de cambio"
                    value={form.exchangeRate}
                    min={1}
                    step={0.0001}
                    onChange={(value) => updateForm('exchangeRate', value)}
                  />
                  <SelectField
                    label="Margen de ganancia"
                    value={String(form.margin)}
                    onChange={(value) => updateForm('margin', Number(value))}
                    options={MARGIN_OPTIONS.map((margin) => ({
                      value: String(margin),
                      label: formatPercent(margin),
                    }))}
                  />
                  <NumberField
                    label="Ancho/base del diseño (mm)"
                    value={form.widthMm}
                    min={1}
                    step={0.1}
                    onChange={(value) => updateForm('widthMm', value)}
                  />
                  <NumberField
                    label="Largo/altura del diseño (mm)"
                    value={form.heightMm}
                    min={1}
                    step={0.1}
                    onChange={(value) => updateForm('heightMm', value)}
                  />
                  <NumberField
                    label="Número de millares"
                    value={form.thousands}
                    min={0.001}
                    step={0.001}
                    onChange={(value) => updateForm('thousands', value)}
                  />
                  <SelectField
                    label="Orientación"
                    value={form.orientation}
                    disabled={!form.automaticLabeling}
                    onChange={(value) => updateForm('orientation', value as OrientationMode)}
                    options={[
                      { value: 'optimized', label: 'Manual cualquier orientación' },
                      { value: 'front', label: 'Frente del diseño' },
                      { value: 'rotated', label: 'Rotada 90°' },
                    ]}
                  />
                  <NumberField
                    label="Barniz brillante a registro"
                    value={form.varnishPasses}
                    min={0}
                    step={1}
                    onChange={(value) => updateForm('varnishPasses', Math.round(value))}
                  />
                </div>

                <div className={rateError ? 'imeba-rate-status warning' : 'imeba-rate-status'}>
                  <Clock3 size={18} />
                  <div>
                    <strong>
                      {rateLoading
                        ? 'Consultando tipo de cambio USD/MXN...'
                        : rateError
                          ? 'Usando tipo de cambio capturado'
                          : `Tipo de cambio API: ${formatRate(form.exchangeRate)}`}
                    </strong>
                    <small>
                      {rateError ||
                        (lastRateCheck
                          ? `Fuente: ${rateSource || 'API'} · Fecha de tasa: ${rateDate || 'sin fecha'}`
                          : 'Se consulta automáticamente con la misma API de Calculadora.')}
                    </small>
                  </div>
                  <button type="button" className="secondary-button" onClick={refreshExchangeRate} disabled={rateLoading}>
                    <RefreshCw size={16} className={rateLoading ? 'is-spinning' : undefined} />
                    Actualizar
                  </button>
                </div>

                <div className="imeba-switch-grid">
                  <BooleanField
                    label="Laminado matte o brillante"
                    checked={form.laminated}
                    onChange={(checked) => updateForm('laminated', checked)}
                  />
                  <BooleanField
                    label="Etiquetado automático"
                    checked={form.automaticLabeling}
                    onChange={(checked) =>
                      setForm((current) =>
                        normalizeForm({
                          ...current,
                          automaticLabeling: checked,
                          orientation: checked ? current.orientation : 'optimized',
                        }),
                      )
                    }
                  />
                </div>

                <div className="form-actions">
                  <button type="submit">
                    <Calculator size={18} />
                    Calcular etiquetas
                  </button>
                </div>
              </form>
            </article>

            <div className="imeba-quote-results">
              <article className="panel imeba-formula-panel">
                <div className="panel-header">
                  <h2>Criterios aplicados</h2>
                  <span>Sin IVA</span>
                </div>
                <div className="imeba-criteria-grid">
                  <CriteriaItem
                    icon={<Sparkles size={18} />}
                    label="Mejor total tinta baja"
                    value={formatFinalSummary(finalSummary.low, 'low')}
                  />
                  <CriteriaItem
                    icon={<Sparkles size={18} />}
                    label="Mejor total tinta media"
                    value={formatFinalSummary(finalSummary.medium, 'medium')}
                  />
                  <CriteriaItem
                    icon={<Sparkles size={18} />}
                    label="Mejor total tinta alta"
                    value={formatFinalSummary(finalSummary.high, 'high')}
                  />
                  <CriteriaItem icon={<Calculator size={18} />} label="Cantidad final" value={`${formatNumber(calculateLabelQuantity(submittedForm))} etiquetas`} />
                  <CriteriaItem
                    icon={<Ruler size={18} />}
                    label="Área base"
                    value={`${formatNumber(submittedForm.widthMm)} × ${formatNumber(submittedForm.heightMm)} mm`}
                  />
                  <CriteriaItem icon={<Percent size={18} />} label="Margen" value={formatPercent(submittedForm.margin)} />
                  <CriteriaItem icon={<Layers3 size={18} />} label="Acabados" value={buildFinishLabel(submittedForm)} />
                  <CriteriaItem icon={<BadgeDollarSign size={18} />} label="Moneda" value={`MXN · TC ${formatNumber(submittedForm.exchangeRate)}`} />
                  <CriteriaItem icon={<FileSpreadsheet size={18} />} label="Etiquetas por plantilla" value={formatNumber(calculateLabelsPerTemplate(submittedForm))} />
                </div>
              </article>
            </div>
          </div>

          <article className="panel imeba-price-table-panel">
            <div className="panel-header">
              <h2>Precio distribuidor</h2>
              <span>{buildModeLabel(submittedForm)} · {formatNumber(submittedForm.widthMm)} × {formatNumber(submittedForm.heightMm)} mm</span>
            </div>
            <div className="table-wrap">
              <table className="records-table imeba-price-table">
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th>Material</th>
                    <th>Ancho mm</th>
                    <th>Largo mts</th>
                    <th>Tinta baja</th>
                    <th>Tinta media</th>
                    <th>Tinta alta</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.code}>
                      <td>
                        <strong>{quote.code}</strong>
                      </td>
                      <td>{quote.name}</td>
                      <td>{formatNumber(quote.rollWidthMm)}</td>
                      <td>{formatNumber(quote.rollLengthM)}</td>
                      <td>{formatMoney(quote.distributorPrices.low)}</td>
                      <td>{formatMoney(quote.distributorPrices.medium)}</td>
                      <td>{formatMoney(quote.distributorPrices.high)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel imeba-price-table-panel">
            <div className="panel-header">
              <h2>Precio público</h2>
              <span>{buildModeLabel(submittedForm)} · margen {formatPercent(submittedForm.margin)}</span>
            </div>
            <div className="table-wrap">
              <table className="records-table imeba-price-table">
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th>Material</th>
                    <th>Ancho mm</th>
                    <th>Largo mts</th>
                    <th>Tinta baja</th>
                    <th>Tinta media</th>
                    <th>Tinta alta</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.code}>
                      <td>
                        <strong>{quote.code}</strong>
                      </td>
                      <td>{quote.name}</td>
                      <td>{formatNumber(quote.rollWidthMm)}</td>
                      <td>{formatNumber(quote.rollLengthM)}</td>
                      <td>{formatMoney(quote.publicPrices.low)}</td>
                      <td>{formatMoney(quote.publicPrices.medium)}</td>
                      <td>{formatMoney(quote.publicPrices.high)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel imeba-price-table-panel">
            <div className="panel-header">
              <h2>Total por millares</h2>
              <span>{formatNumber(calculateLabelQuantity(submittedForm))} etiquetas · antes de IVA</span>
            </div>
            <div className="table-wrap">
              <table className="records-table imeba-price-table">
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th>Material</th>
                    <th>Tinta baja</th>
                    <th>Tinta media</th>
                    <th>Tinta alta</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.code}>
                      <td>
                        <strong>{quote.code}</strong>
                      </td>
                      <td>{quote.name}</td>
                      <td>{formatMoney(quote.publicTotals.low)}</td>
                      <td>{formatMoney(quote.publicTotals.medium)}</td>
                      <td>{formatMoney(quote.publicTotals.high)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function buildMaterialQuotes(form: QuoteForm): MaterialQuote[] {
  const normalized = normalizeForm(form);
  const labelQuantity = calculateLabelQuantity(normalized);
  const labelsPerTemplate = calculateLabelsPerTemplate(normalized);
  const finishCost = calculateFinishCost(normalized);

  return MATERIALS.map((material) => {
    const usdPrices = mapInkPrices(material.costPerTemplate, (baseCost) =>
      (baseCost + finishCost) / labelsPerTemplate,
    );
    const distributorPrices = mapInkPrices(usdPrices, (usdPrice) =>
      Math.max(MINIMUM_UNIT_PRICE, usdPrice * normalized.exchangeRate),
    );
    const publicPrices = mapInkPrices(distributorPrices, (price) => price / (1 - normalized.margin));
    const publicTotals = mapInkPrices(publicPrices, (price) =>
      roundMoney(Math.max(MINIMUM_ORDER_MXN, price * labelQuantity)),
    );

    return {
      ...material,
      usdPrices,
      distributorPrices,
      publicPrices,
      publicTotals,
    };
  });
}

function calculateLabelQuantity(form: QuoteForm) {
  return Math.max(1, Math.round(normalizeThousands(form.thousands) * 1000));
}

function buildFinalSummary(quotes: MaterialQuote[]) {
  return {
    low: findBestTotalQuote(quotes, 'low'),
    medium: findBestTotalQuote(quotes, 'medium'),
    high: findBestTotalQuote(quotes, 'high'),
  };
}

function findBestTotalQuote(quotes: MaterialQuote[], inkLevel: InkLevel) {
  return [...quotes].sort((left, right) => left.publicTotals[inkLevel] - right.publicTotals[inkLevel])[0] ?? null;
}

function formatFinalSummary(quote: MaterialQuote | null, inkLevel: InkLevel) {
  if (!quote) return 'Sin dato';
  return `${formatMoney(quote.publicTotals[inkLevel])} · ${quote.code}`;
}

function calculateLabelsPerTemplate(form: QuoteForm) {
  const normalized = normalizeForm(form);
  const widthWithGap = normalized.widthMm + LABEL_GAP_MM;
  const heightWithGap = normalized.heightMm + LABEL_GAP_MM;
  const optionOne = Math.floor(AVAILABLE_WIDTH_MM / widthWithGap) * Math.floor(AVAILABLE_LENGTH_MM / heightWithGap);
  const optionTwo = Math.floor(AVAILABLE_WIDTH_MM / heightWithGap) * Math.floor(AVAILABLE_LENGTH_MM / widthWithGap);
  const selected = normalized.automaticLabeling ? Math.min(optionOne, optionTwo) : Math.max(optionOne, optionTwo);
  return Math.max(1, selected);
}

function calculateFinishCost(form: QuoteForm) {
  return (form.laminated ? LAMINATE_COST : 0) + form.varnishPasses * VARNISH_COST;
}

function buildFinishLabel(form: QuoteForm) {
  const finishes = [
    form.laminated ? 'Laminado activo' : 'Sin laminado',
    form.varnishPasses > 0 ? `${form.varnishPasses} barniz${form.varnishPasses === 1 ? '' : 'es'}` : 'Sin barniz',
    form.automaticLabeling ? 'Etiquetado automático' : 'Acomodo optimizado',
  ];
  return finishes.join(' · ');
}

function buildModeLabel(form: QuoteForm) {
  return form.automaticLabeling ? 'Automático' : 'Manual cualquier orientación';
}

function normalizeForm(form: QuoteForm): QuoteForm {
  return {
    ...form,
    exchangeRate: sanitizeNumber(form.exchangeRate, BASE_EXCHANGE_RATE),
    widthMm: sanitizeNumber(form.widthMm, BASE_WIDTH_MM),
    heightMm: sanitizeNumber(form.heightMm, BASE_HEIGHT_MM),
    thousands: normalizeThousands(form.thousands),
    varnishPasses: Math.max(0, Math.round(sanitizeNumber(form.varnishPasses, 0))),
    margin: MARGIN_OPTIONS.includes(form.margin) ? form.margin : 0.3,
    orientation: form.automaticLabeling ? form.orientation : 'optimized',
  };
}

function mapInkPrices(source: Record<InkLevel, number>, mapper: (value: number) => number): Record<InkLevel, number> {
  return {
    low: mapper(source.low),
    medium: mapper(source.medium),
    high: mapper(source.high),
  };
}

function sanitizeNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeThousands(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function CriteriaItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="imeba-criteria-item">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  step,
  description,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  description?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {description ? <small>{description}</small> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  description,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  description?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? <small>{description}</small> : null}
    </label>
  );
}

function BooleanField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="imeba-toggle-card">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
      </span>
    </label>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: MONEY_DECIMALS,
    maximumFractionDigits: MONEY_DECIMALS,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRate(value: number) {
  return Number.isFinite(value)
    ? value.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : 'Sin dato';
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function roundMoney(value: number) {
  const factor = 10 ** MONEY_DECIMALS;
  return Math.round(value * factor) / factor;
}
