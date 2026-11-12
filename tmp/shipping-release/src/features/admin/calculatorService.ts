export type CalculatorCurrency = 'USD' | 'MXN';

export type CalculateFinalPriceInput = {
  cost: number;
  costCurrency: CalculatorCurrency;
  exchangeRate: number;
  marginPercent: number;
};

export type FinalPriceResult = {
  baseCostMXN: number;
  baseCostUSD: number;
  marginDecimal: number;
  finalPriceMXN: number;
  finalPriceUSD: number;
  profitMXN: number;
  profitUSD: number;
  realMarginPercent: number;
};

export type ExchangeRateResult = {
  rate: number;
  date: string;
  source: string;
};

export async function fetchUsdMxnExchangeRate(): Promise<ExchangeRateResult> {
  const primaryResponse = await fetch('https://api.frankfurter.dev/v2/rate/USD/MXN');
  if (primaryResponse.ok) {
    const data = await primaryResponse.json() as { rate?: number; date?: string };
    if (Number(data.rate) > 0) {
      return {
        rate: Number(data.rate),
        date: data.date ?? new Date().toISOString().slice(0, 10),
        source: 'Frankfurter',
      };
    }
  }

  const fallbackResponse = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN');
  if (!fallbackResponse.ok) {
    throw new Error('No se pudo consultar el tipo de cambio.');
  }

  const fallbackData = await fallbackResponse.json() as { rates?: { MXN?: number }; date?: string };
  const fallbackRate = Number(fallbackData.rates?.MXN);
  if (!fallbackRate || fallbackRate <= 0) {
    throw new Error('La API no devolvió un tipo de cambio válido.');
  }

  return {
    rate: fallbackRate,
    date: fallbackData.date ?? new Date().toISOString().slice(0, 10),
    source: 'Frankfurter',
  };
}

export function calculateFinalPrice({
  cost,
  costCurrency,
  exchangeRate,
  marginPercent,
}: CalculateFinalPriceInput): FinalPriceResult {
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error('El costo base debe ser mayor a 0.');
  }
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('El tipo de cambio debe ser mayor a 0.');
  }
  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    throw new Error('El margen debe ser mayor o igual a 0 y menor a 100.');
  }

  const marginDecimal = marginPercent / 100;
  const baseCostMXN = costCurrency === 'USD' ? cost * exchangeRate : cost;
  const baseCostUSD = costCurrency === 'USD' ? cost : cost / exchangeRate;
  const finalPriceMXN = baseCostMXN / (1 - marginDecimal);
  const finalPriceUSD = finalPriceMXN / exchangeRate;
  const profitMXN = finalPriceMXN - baseCostMXN;
  const profitUSD = profitMXN / exchangeRate;
  const realMarginPercent = finalPriceMXN === 0 ? 0 : (profitMXN / finalPriceMXN) * 100;

  return {
    baseCostMXN,
    baseCostUSD,
    marginDecimal,
    finalPriceMXN,
    finalPriceUSD,
    profitMXN,
    profitUSD,
    realMarginPercent,
  };
}
