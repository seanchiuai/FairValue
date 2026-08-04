export const PROPERTY_COMPARE_STORAGE_KEY = 'fv_property_compare_v1';
export const MAX_COMPARE_PROPERTIES = 4;

function normalizeIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === MAX_COMPARE_PROPERTIES) break;
  }
  return ids;
}

export function readComparedPropertyIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return normalizeIds(JSON.parse(localStorage.getItem(PROPERTY_COMPARE_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function writeComparedPropertyIds(ids: string[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROPERTY_COMPARE_STORAGE_KEY, JSON.stringify(normalizeIds(ids)));
  } catch {
    // Keep comparison usable when browser storage is unavailable.
  }
}

export function buildComparePath(ids: string[]) {
  const normalized = normalizeIds(ids);
  return normalized.length ? `/compare?ids=${normalized.map(encodeURIComponent).join(',')}` : '/compare';
}

export function toggleComparedProperty(ids: string[], propertyId: string) {
  const normalizedId = propertyId.trim();
  if (!normalizedId) return normalizeIds(ids);
  const current = normalizeIds(ids);
  if (current.includes(normalizedId)) return current.filter((id) => id !== normalizedId);
  if (current.length >= MAX_COMPARE_PROPERTIES) return current;
  return [...current, normalizedId];
}

export function formatComparisonMoney(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) || value <= 0
    ? 'Not available'
    : `$${Math.round(value).toLocaleString()}`;
}

export function formatComparisonPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? 'Not available' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
