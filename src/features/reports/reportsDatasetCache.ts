import type { OdooCommercialDataset, ReportFilters } from './odooSalesCore';
import type { ReportRequestedDomain } from './odooSalesCore';

const REPORTS_DATASET_CACHE_STORAGE_KEY = 'tectronic-reports-dataset-cache-v4';
const MAX_CACHE_ENTRIES = 8;

type CachedReportsDatasetEntry = {
  key: string;
  savedAt: string;
  data: OdooCommercialDataset;
  loadMode?: 'fast' | 'full';
};

type CachedReportsDatasetState = {
  entries: CachedReportsDatasetEntry[];
};

export function readStoredCommercialDataset(
  filters: ReportFilters,
  requestedDomain: ReportRequestedDomain,
  userId: string,
): OdooCommercialDataset | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(REPORTS_DATASET_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReportsDatasetState;
    if (!Array.isArray(parsed.entries)) return null;
    const key = buildReportsDatasetCacheKey(filters, requestedDomain, userId);
    return parsed.entries.find((entry) => entry.key === key)?.data ?? null;
  } catch {
    return null;
  }
}

export function saveStoredCommercialDataset(
  filters: ReportFilters,
  dataset: OdooCommercialDataset,
  requestedDomain: ReportRequestedDomain,
  userId: string,
  loadMode: 'fast' | 'full' = 'full',
) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const raw = storage.getItem(REPORTS_DATASET_CACHE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CachedReportsDatasetState) : { entries: [] };
    const key = buildReportsDatasetCacheKey(filters, requestedDomain, userId);
    const nextEntry: CachedReportsDatasetEntry = {
      key,
      savedAt: new Date().toISOString(),
      data: dataset,
      loadMode,
    };
    const nextEntries = [
      nextEntry,
      ...(Array.isArray(parsed.entries) ? parsed.entries.filter((entry) => entry.key !== key) : []),
    ].slice(0, MAX_CACHE_ENTRIES);

    storage.setItem(
      REPORTS_DATASET_CACHE_STORAGE_KEY,
      JSON.stringify({ entries: nextEntries } satisfies CachedReportsDatasetState),
    );
    return true;
  } catch {
    return false;
  }
}

export function readStoredCommercialDatasetMode(
  filters: ReportFilters,
  requestedDomain: ReportRequestedDomain,
  userId: string,
) {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(REPORTS_DATASET_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReportsDatasetState;
    if (!Array.isArray(parsed.entries)) return null;
    const key = buildReportsDatasetCacheKey(filters, requestedDomain, userId);
    const entry = parsed.entries.find((candidate) => candidate.key === key);
    return entry?.loadMode === 'fast' ? 'fast' : entry ? 'full' : null;
  } catch {
    return null;
  }
}

function buildReportsDatasetCacheKey(
  filters: ReportFilters,
  requestedDomain: ReportRequestedDomain,
  userId: string,
) {
  return JSON.stringify({
    userId,
    startDate: filters.startDate,
    endDate: filters.endDate,
    companyIds: normalizeNumberList(filters.companyIds, filters.companyId),
    sellerIds: normalizeNumberList(filters.sellerIds, filters.sellerId),
    teamId: filters.teamId ?? null,
    customerId: filters.customerId ?? null,
    productId: filters.productId ?? null,
    categoryId: filters.categoryId ?? null,
    currencyCode: filters.currencyCode ?? null,
    channel: filters.channel ?? null,
    stateScope: filters.stateScope,
    grouping: filters.grouping,
    visibilityScope: filters.visibilityScope,
    requestedDomain,
  });
}

function normalizeNumberList(values?: number[], fallbackValue?: number | null) {
  const normalized = Array.isArray(values)
    ? values.filter((value) => Number.isFinite(value))
    : fallbackValue === null || fallbackValue === undefined
      ? []
      : [fallbackValue];

  return [...new Set(normalized)].sort((left, right) => left - right);
}

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}
