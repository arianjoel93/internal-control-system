import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { BookOpen, Calculator, Clock3, DollarSign, RefreshCw } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { EmptyState } from '../../components/EmptyState';
import { openModuleDocs } from '../../lib/moduleDocs';
import { supabase } from '../../lib/supabase';
import { SidebarUserFooter } from './SidebarUserFooter';
import {
  calculateFinalPrice,
  fetchUsdMxnExchangeRate,
  type CalculatorCurrency,
  type FinalPriceResult,
} from './calculatorService';

type CalculatorDashboardProps = {
  session: Session;
  onOpenHub: () => void;
};

type DisplayCurrency = 'MXN' | 'USD';

type CalculationHistoryItem = {
  id: string;
  createdAt: string;
  cost: number;
  costCurrency: CalculatorCurrency;
  exchangeRate: number;
  marginPercent: number;
  finalPriceMXN: number;
  finalPriceUSD: number;
};

const historyStoragePrefix = 'tectronic-calculator-history';

export function CalculatorDashboard({ session, onOpenHub }: CalculatorDashboardProps) {
  const historyStorageKey = buildHistoryStorageKey(session.user.id);
  const [cost, setCost] = useState('');
  const [costCurrency, setCostCurrency] = useState<CalculatorCurrency>('USD');
  const [marginPercent, setMarginPercent] = useState('');
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('MXN');
  const [apiExchangeRate, setApiExchangeRate] = useState<number | null>(null);
  const [manualExchangeRate, setManualExchangeRate] = useState('');
  const [useManualExchangeRate, setUseManualExchangeRate] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [lastRateCheck, setLastRateCheck] = useState('');
  const [rateDate, setRateDate] = useState('');
  const [result, setResult] = useState<FinalPriceResult | null>(null);
  const [formError, setFormError] = useState('');
  const [history, setHistory] = useState<CalculationHistoryItem[]>(() => readHistory(historyStorageKey));

  const exchangeRate = useMemo(() => {
    if (useManualExchangeRate || !apiExchangeRate) {
      return Number(manualExchangeRate);
    }
    return apiExchangeRate;
  }, [apiExchangeRate, manualExchangeRate, useManualExchangeRate]);

  useEffect(() => {
    refreshExchangeRate();
  }, []);

  async function refreshExchangeRate() {
    setRateLoading(true);
    setRateError('');
    try {
      const response = await fetchUsdMxnExchangeRate();
      setApiExchangeRate(response.rate);
      setRateDate(response.date);
      setLastRateCheck(new Date().toISOString());
      setUseManualExchangeRate(false);
    } catch (error) {
      setRateError(error instanceof Error ? error.message : 'No se pudo consultar el tipo de cambio.');
      setUseManualExchangeRate(true);
    } finally {
      setRateLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    try {
      const calculation = calculateFinalPrice({
        cost: Number(cost),
        costCurrency,
        exchangeRate,
        marginPercent: Number(marginPercent),
      });
      setResult(calculation);

      const nextItem: CalculationHistoryItem = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        cost: Number(cost),
        costCurrency,
        exchangeRate,
        marginPercent: Number(marginPercent),
        finalPriceMXN: calculation.finalPriceMXN,
        finalPriceUSD: calculation.finalPriceUSD,
      };
      const nextHistory = [nextItem, ...history].slice(0, 8);
      setHistory(nextHistory);
      writeHistory(historyStorageKey, nextHistory);
    } catch (error) {
      setResult(null);
      setFormError(error instanceof Error ? error.message : 'Revisa los datos de la calculadora.');
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Calculadora</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones de calculadora">
          <button className="active" type="button">
            <Calculator size={18} />
            Precio de producto
          </button>
          <button type="button" onClick={() => openModuleDocs('calculator')}>
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
        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Cálculo comercial</p>
              <h2>Calculadora</h2>
            </div>
            <div className="header-actions">
              <button type="button" className="secondary-button" onClick={() => openModuleDocs('calculator')}>
                <BookOpen size={18} />
                Docs
              </button>
              <button type="button" className="secondary-button" onClick={refreshExchangeRate} disabled={rateLoading}>
                <RefreshCw size={18} />
                {rateLoading ? 'Consultando...' : 'Actualizar tipo de cambio'}
              </button>
            </div>
          </div>

          <div className="calculator-layout">
            <article className="panel">
              <div className="panel-header">
                <h2>Datos del producto</h2>
                <span>{rateLoading ? 'Consultando API' : 'USD/MXN'}</span>
              </div>
              <form className="compact-form calculator-form" onSubmit={submit}>
                <div className="form-grid">
                  <label className="field">
                    <span>Costo base</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cost}
                      onChange={(event) => setCost(event.target.value)}
                      placeholder="Ej. 100"
                    />
                  </label>
                  <label className="field">
                    <span>Moneda del costo</span>
                    <select value={costCurrency} onChange={(event) => setCostCurrency(event.target.value as CalculatorCurrency)}>
                      <option value="USD">USD</option>
                      <option value="MXN">MXN</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Margen %</span>
                    <input
                      type="number"
                      min="0"
                      max="99.99"
                      step="0.01"
                      value={marginPercent}
                      onChange={(event) => setMarginPercent(event.target.value)}
                      placeholder="Ej. 30"
                    />
                  </label>
                  <label className="field">
                    <span>Tipo de cambio usado</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={useManualExchangeRate ? manualExchangeRate : apiExchangeRate?.toString() ?? ''}
                      onChange={(event) => {
                        setManualExchangeRate(event.target.value);
                        setUseManualExchangeRate(true);
                      }}
                      disabled={!useManualExchangeRate && Boolean(apiExchangeRate)}
                      placeholder="Ej. 18.25"
                    />
                  </label>
                </div>

                <div className="calculator-options">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={useManualExchangeRate}
                      onChange={(event) => setUseManualExchangeRate(event.target.checked)}
                    />
                    Capturar tipo de cambio manual
                  </label>
                  <label className="calculator-switch">
                    <span>Resultado principal</span>
                    <button
                      type="button"
                      className={displayCurrency === 'MXN' ? 'active' : undefined}
                      onClick={() => setDisplayCurrency('MXN')}
                    >
                      MXN
                    </button>
                    <button
                      type="button"
                      className={displayCurrency === 'USD' ? 'active' : undefined}
                      onClick={() => setDisplayCurrency('USD')}
                    >
                      USD
                    </button>
                  </label>
                </div>

                <ExchangeRateStatus
                  rate={apiExchangeRate}
                  isManual={useManualExchangeRate}
                  error={rateError}
                  lastRateCheck={lastRateCheck}
                  rateDate={rateDate}
                />

                {formError ? <p className="form-error">{formError}</p> : null}
                <button type="submit">
                  <DollarSign size={18} />
                  Calcular
                </button>
              </form>
            </article>

            <CalculatorResults
              result={result}
              cost={Number(cost)}
              costCurrency={costCurrency}
              exchangeRate={exchangeRate}
              marginPercent={Number(marginPercent)}
              displayCurrency={displayCurrency}
            />
          </div>

          <CalculatorHistory history={history} />
        </section>
      </main>
    </div>
  );
}

function ExchangeRateStatus({
  rate,
  isManual,
  error,
  lastRateCheck,
  rateDate,
}: {
  rate: number | null;
  isManual: boolean;
  error: string;
  lastRateCheck: string;
  rateDate: string;
}) {
  return (
    <div className={error ? 'calculator-rate-status warning' : 'calculator-rate-status'}>
      <Clock3 size={18} />
      <div>
        <strong>
          {isManual ? 'Usando tipo de cambio manual' : rate ? `Tipo de cambio API: ${formatRate(rate)}` : 'Sin tipo de cambio API'}
        </strong>
        <small>
          {error
            ? error
            : lastRateCheck
              ? `Última consulta: ${formatDateTime(lastRateCheck)}${rateDate ? ` · Fecha de tasa: ${rateDate}` : ''}`
              : 'Pendiente de consulta'}
        </small>
      </div>
    </div>
  );
}

function CalculatorResults({
  result,
  cost,
  costCurrency,
  exchangeRate,
  marginPercent,
  displayCurrency,
}: {
  result: FinalPriceResult | null;
  cost: number;
  costCurrency: CalculatorCurrency;
  exchangeRate: number;
  marginPercent: number;
  displayCurrency: DisplayCurrency;
}) {
  if (!result) {
    return (
      <article className="panel calculator-result-panel">
        <EmptyState title="Sin cálculo">Completa los datos y presiona Calcular para ver el precio final.</EmptyState>
      </article>
    );
  }

  const primaryValue = displayCurrency === 'MXN' ? result.finalPriceMXN : result.finalPriceUSD;

  return (
    <article className="panel calculator-result-panel">
      <div className="panel-header warranty">
        <div>
          <h2>Resultados</h2>
          <small>Margen real: {formatPercent(result.realMarginPercent)}</small>
        </div>
        <span className="status-badge status-active">{displayCurrency}</span>
      </div>
      <div className="calculator-primary-result">
        <span>Resultado principal</span>
        <strong>{formatCurrency(primaryValue, displayCurrency)}</strong>
      </div>
      <div className="summary-grid calculator-summary-grid">
        <SummaryRow label="Costo base ingresado" value={formatCurrency(cost, costCurrency)} />
        <SummaryRow label="Moneda original" value={costCurrency} />
        <SummaryRow label="Tipo de cambio usado" value={formatRate(exchangeRate)} />
        <SummaryRow label="Costo convertido a MXN" value={formatCurrency(result.baseCostMXN, 'MXN')} />
        <SummaryRow label="Margen aplicado" value={formatPercent(marginPercent)} />
        <SummaryRow label="Utilidad MXN" value={formatCurrency(result.profitMXN, 'MXN')} />
        <SummaryRow label="Utilidad USD" value={formatCurrency(result.profitUSD, 'USD')} />
        <SummaryRow label="Precio final MXN" value={formatCurrency(result.finalPriceMXN, 'MXN')} />
        <SummaryRow label="Precio final USD" value={formatCurrency(result.finalPriceUSD, 'USD')} />
      </div>
    </article>
  );
}

function CalculatorHistory({ history }: { history: CalculationHistoryItem[] }) {
  if (history.length === 0) return null;

  return (
    <article className="panel">
      <div className="panel-header">
        <h2>Historial local</h2>
        <span>{history.length} cálculos</span>
      </div>
      <div className="table-wrap">
        <table className="records-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Costo</th>
              <th>Tipo de cambio</th>
              <th>Margen</th>
              <th>Precio final MXN</th>
              <th>Precio final USD</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id}>
                <td>{formatDateTime(item.createdAt)}</td>
                <td>{formatCurrency(item.cost, item.costCurrency)}</td>
                <td>{formatRate(item.exchangeRate)}</td>
                <td>{formatPercent(item.marginPercent)}</td>
                <td>{formatCurrency(item.finalPriceMXN, 'MXN')}</td>
                <td>{formatCurrency(item.finalPriceUSD, 'USD')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildHistoryStorageKey(userId: string) {
  return `${historyStoragePrefix}:${userId}`;
}

function readHistory(storageKey: string) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CalculationHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(storageKey: string, history: CalculationHistoryItem[]) {
  localStorage.setItem(storageKey, JSON.stringify(history));
}

function formatCurrency(value: number, currency: CalculatorCurrency) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatRate(value: number) {
  return Number.isFinite(value)
    ? value.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : 'Sin dato';
}

function formatPercent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
