export type FedexEstimateTarget = {
  fedexZone: string | null;
  serviceCode?: string | null;
  packageCount: number;
  physicalWeight: number;
  volumetricWeight: number;
  billableWeight: number;
  volumeCm3: number;
  environment: 'PRODUCTION' | 'SANDBOX';
  currency: string;
  now?: Date;
};

export type FedexHistoricalCandidate = {
  id: string;
  amount: number;
  currency: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  serviceCode: string | null;
  serviceName: string | null;
  packageCount: number;
  physicalWeight: number;
  volumetricWeight: number;
  billableWeight: number;
  volumeCm3: number;
  fedexZone: string | null;
  createdAt: string;
  source?: 'shipping_quotes' | 'odoo_delivery';
  orderName?: string | null;
};

export type ScoredFedexCandidate = FedexHistoricalCandidate & {
  similarityScore: number;
  recencyWeight: number;
  weightedAmount: number;
  isOutlier?: boolean;
};

export type FedexEstimateResult = {
  estimatedAmount: number | null;
  estimatedLow: number | null;
  estimatedHigh: number | null;
  medianAmount: number | null;
  averageAmount: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  p25Amount: number | null;
  p75Amount: number | null;
  confidence: 'MUY_ALTA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INSUFICIENTE';
  confidenceScore: number;
  comparables: ScoredFedexCandidate[];
  outlierQuoteIds: string[];
};

export function scoreFedexCandidate(target: FedexEstimateTarget, candidate: FedexHistoricalCandidate) {
  const zone = target.fedexZone && candidate.fedexZone && target.fedexZone === candidate.fedexZone ? 40 : 0;
  const service = target.serviceCode && candidate.serviceCode && target.serviceCode === candidate.serviceCode ? 20 : 0;
  const weightDifference = relativeDifference(target.billableWeight, candidate.billableWeight);
  const weight = weightDifference <= 0.1 ? 20 : Math.max(0, 20 * (1 - weightDifference));
  const packageDifference = Math.abs(target.packageCount - candidate.packageCount);
  const packages = packageDifference === 0 ? 10 : packageDifference === 1 ? 5 : 0;
  const volumeDifference = relativeDifference(target.volumeCm3, candidate.volumeCm3);
  const volume = volumeDifference <= 0.2 ? 10 : Math.max(0, 10 * (1 - volumeDifference));
  return Math.max(0, Math.min(100, round(zone + service + weight + packages + volume, 2)));
}

export function recencyWeight(createdAt: string, now = new Date()) {
  const days = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 30) return 1;
  if (days <= 90) return 0.9;
  if (days <= 180) return 0.8;
  return 0.7;
}

export function estimateFedexHistory(target: FedexEstimateTarget, candidates: FedexHistoricalCandidate[]): FedexEstimateResult {
  const now = target.now ?? new Date();
  const comparable = candidates
    .filter((candidate) => candidate.currency === target.currency && candidate.environment === target.environment)
    .map((candidate) => {
      const weight = recencyWeight(candidate.createdAt, now);
      return {
        ...candidate,
        similarityScore: scoreFedexCandidate(target, candidate),
        recencyWeight: weight,
        weightedAmount: candidate.amount * weight,
      };
    })
    .sort((left, right) => right.similarityScore - left.similarityScore || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 10);

  if (!comparable.length) return emptyEstimate();

  const amounts = comparable.map((candidate) => candidate.amount).sort((left, right) => left - right);
  const q1 = percentile(amounts, 0.25);
  const q3 = percentile(amounts, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const outliers = comparable.filter((candidate) => amounts.length >= 4 && (candidate.amount < lowerFence || candidate.amount > upperFence));
  const inliers = comparable.filter((candidate) => !outliers.some((outlier) => outlier.id === candidate.id));
  const values = inliers.length ? inliers : comparable;
  const weightedMedianAmount = weightedMedian(values);
  const averageAmount = values.reduce((sum, candidate) => sum + candidate.amount, 0) / values.length;
  const min = Math.min(...values.map((candidate) => candidate.amount));
  const max = Math.max(...values.map((candidate) => candidate.amount));
  const p25 = percentile(values.map((candidate) => candidate.amount).sort((left, right) => left - right), 0.25);
  const p75 = percentile(values.map((candidate) => candidate.amount).sort((left, right) => left - right), 0.75);
  const score = round(weightedAverage(values.map((candidate) => [candidate.similarityScore, candidate.recencyWeight])), 2);
  const dispersion = weightedMedianAmount ? (p75 - p25) / weightedMedianAmount : 1;
  const confidence = confidenceLevel({ score, count: values.length, environment: target.environment, dispersion });

  return {
    estimatedAmount: round(weightedMedianAmount, 4),
    estimatedLow: round(p25, 4),
    estimatedHigh: round(p75, 4),
    medianAmount: round(median(values.map((candidate) => candidate.amount)), 4),
    averageAmount: round(averageAmount, 4),
    minimumAmount: round(min, 4),
    maximumAmount: round(max, 4),
    p25Amount: round(p25, 4),
    p75Amount: round(p75, 4),
    confidence,
    confidenceScore: score,
    comparables: comparable.map((candidate) => ({ ...candidate, isOutlier: outliers.some((outlier) => outlier.id === candidate.id) })),
    outlierQuoteIds: outliers.map((candidate) => candidate.id),
  };
}

function confidenceLevel(input: { score: number; count: number; environment: 'PRODUCTION' | 'SANDBOX'; dispersion: number }) {
  if (input.count < 3) return 'INSUFICIENTE' as const;
  if (input.environment === 'SANDBOX') {
    if (input.count >= 8 && input.score >= 80 && input.dispersion <= 0.25) return 'ALTA' as const;
    if (input.count >= 5 && input.score >= 65) return 'MEDIA' as const;
    return 'BAJA' as const;
  }
  if (input.count >= 8 && input.score >= 85 && input.dispersion <= 0.2) return 'MUY_ALTA' as const;
  if (input.count >= 5 && input.score >= 70 && input.dispersion <= 0.35) return 'ALTA' as const;
  if (input.count >= 3 && input.score >= 55) return 'MEDIA' as const;
  return 'BAJA' as const;
}

function weightedMedian(candidates: Array<{ amount: number; recencyWeight: number }>) {
  const ordered = candidates.slice().sort((left, right) => left.amount - right.amount);
  const totalWeight = ordered.reduce((sum, candidate) => sum + candidate.recencyWeight, 0);
  let cumulative = 0;
  for (const candidate of ordered) {
    cumulative += candidate.recencyWeight;
    if (cumulative >= totalWeight / 2) return candidate.amount;
  }
  return ordered[ordered.length - 1]?.amount ?? 0;
}

function weightedAverage(values: Array<[number, number]>) {
  const weight = values.reduce((sum, [, factor]) => sum + factor, 0);
  return weight ? values.reduce((sum, [value, factor]) => sum + value * factor, 0) / weight : 0;
}

function percentile(values: number[], position: number) {
  if (!values.length) return 0;
  const index = (values.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function median(values: number[]) {
  return percentile(values.slice().sort((left, right) => left - right), 0.5);
}

function relativeDifference(left: number, right: number) {
  const divisor = Math.max(Math.abs(left), Math.abs(right), 0.0001);
  return Math.abs(left - right) / divisor;
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function emptyEstimate(): FedexEstimateResult {
  return {
    estimatedAmount: null,
    estimatedLow: null,
    estimatedHigh: null,
    medianAmount: null,
    averageAmount: null,
    minimumAmount: null,
    maximumAmount: null,
    p25Amount: null,
    p75Amount: null,
    confidence: 'INSUFICIENTE',
    confidenceScore: 0,
    comparables: [],
    outlierQuoteIds: [],
  };
}
