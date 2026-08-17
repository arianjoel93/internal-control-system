import type { SalesForecastDataset } from './reportsForecastService';

const SALES_FORECAST_CACHE_STORAGE_KEY = 'tectronic-sales-forecast-cache-v1';
const FORECAST_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_FORECAST_CACHE_ENTRIES = 4;

type CachedForecastEntry = {
  key: string;
  savedAt: string;
  data: SalesForecastDataset;
};

type CachedForecastState = {
  entries: CachedForecastEntry[];
};

export function readStoredSalesForecastDataset(
  userKey: string,
  visibilityScope: string,
): SalesForecastDataset | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(SALES_FORECAST_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedForecastState;
    if (!Array.isArray(parsed.entries)) return null;
    const key = buildForecastCacheKey(userKey, visibilityScope);
    const entry = parsed.entries.find((candidate) => candidate.key === key);
    if (!entry) return null;
    const savedAt = new Date(entry.savedAt).getTime();
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > FORECAST_CACHE_TTL_MS) {
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function saveStoredSalesForecastDataset(
  userKey: string,
  visibilityScope: string,
  data: SalesForecastDataset,
) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const raw = storage.getItem(SALES_FORECAST_CACHE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CachedForecastState) : { entries: [] };
    const key = buildForecastCacheKey(userKey, visibilityScope);
    const nextEntry: CachedForecastEntry = {
      key,
      savedAt: new Date().toISOString(),
      data,
    };
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    storage.setItem(
      SALES_FORECAST_CACHE_STORAGE_KEY,
      JSON.stringify({
        entries: [
          nextEntry,
          ...entries.filter((entry) => entry.key !== key),
        ].slice(0, MAX_FORECAST_CACHE_ENTRIES),
      } satisfies CachedForecastState),
    );
    return true;
  } catch {
    return false;
  }
}

function buildForecastCacheKey(userKey: string, visibilityScope: string) {
  const year = new Date().getFullYear();
  return JSON.stringify({
    userKey,
    visibilityScope,
    company: 'corporacion-tectronic',
    year,
  });
}

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}
