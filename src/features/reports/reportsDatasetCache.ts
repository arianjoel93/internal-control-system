import type { OdooCommercialDataset, ReportFilters } from './odooSalesCore';
import type { ReportRequestedDomain } from './odooSalesCore';

// The delivery customer fields were added to the Odoo dataset. Use a new cache
// namespace so prior snapshots cannot keep displaying the generic partner name.
const REPORTS_DATASET_CACHE_STORAGE_KEY = 'tectronic-reports-dataset-cache-v5';
const LEGACY_REPORTS_DATASET_CACHE_STORAGE_KEYS = [
  'tectronic-reports-dataset-cache-v1',
  'tectronic-reports-dataset-cache-v2',
  'tectronic-reports-dataset-cache-v3',
  'tectronic-reports-dataset-cache-v4',
];
// Full Odoo datasets are the largest client-side payload in the application.
// Keep only the active report and its warm-up range within a bounded budget.
const MAX_CACHE_ENTRIES = 2;
const MAX_CACHE_BYTES = 3_000_000;

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
    clearLegacyDatasetCaches(storage);
    const parsed = readCacheState(storage);
    const key = buildReportsDatasetCacheKey(filters, requestedDomain, userId);
    const nextEntry: CachedReportsDatasetEntry = {
      key,
      savedAt: new Date().toISOString(),
      data: dataset,
      loadMode,
    };
    let nextEntries = [
      nextEntry,
      ...(Array.isArray(parsed.entries) ? parsed.entries.filter((entry) => entry.key !== key) : []),
    ].slice(0, MAX_CACHE_ENTRIES);

    let serialized = serializeState(nextEntries);
    while (nextEntries.length > 1 && byteLength(serialized) > MAX_CACHE_BYTES) {
      nextEntries = nextEntries.slice(0, -1);
      serialized = serializeState(nextEntries);
    }

    // Do not evict a usable snapshot to save one oversized response. Odoo will
    // refresh it normally, while local storage remains responsive for the rest
    // of the application.
    if (byteLength(serialized) > MAX_CACHE_BYTES) return false;

    return writeReportsCache(storage, serialized, nextEntry);
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

function readCacheState(storage: Storage): CachedReportsDatasetState {
  const raw = storage.getItem(REPORTS_DATASET_CACHE_STORAGE_KEY);
  if (!raw) return { entries: [] };
  try {
    const parsed = JSON.parse(raw) as CachedReportsDatasetState;
    return Array.isArray(parsed.entries) ? parsed : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function serializeState(entries: CachedReportsDatasetEntry[]) {
  return JSON.stringify({ entries } satisfies CachedReportsDatasetState);
}

function writeReportsCache(
  storage: Storage,
  serialized: string,
  fallbackEntry: CachedReportsDatasetEntry,
) {
  try {
    storage.setItem(REPORTS_DATASET_CACHE_STORAGE_KEY, serialized);
    return true;
  } catch {
    try {
      storage.removeItem(REPORTS_DATASET_CACHE_STORAGE_KEY);
      clearLegacyDatasetCaches(storage);
      const fallbackSerialized = serializeState([fallbackEntry]);
      if (byteLength(fallbackSerialized) > MAX_CACHE_BYTES) return false;
      storage.setItem(REPORTS_DATASET_CACHE_STORAGE_KEY, fallbackSerialized);
      return true;
    } catch {
      return false;
    }
  }
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function clearLegacyDatasetCaches(storage: Storage) {
  for (const key of LEGACY_REPORTS_DATASET_CACHE_STORAGE_KEYS) {
    storage.removeItem(key);
  }
}
