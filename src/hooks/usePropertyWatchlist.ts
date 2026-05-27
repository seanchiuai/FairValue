import { useCallback, useMemo, useState } from 'react';

export const PROPERTY_WATCHLIST_STORAGE_KEY = 'fv_property_watchlist_v1';

export interface PropertyWatchlistItem {
  property_id: string;
  added_at: number;
}

function isWatchlistItem(value: unknown): value is PropertyWatchlistItem {
  const item = value as PropertyWatchlistItem;
  return (
    typeof item?.property_id === 'string' &&
    item.property_id.trim().length > 0 &&
    Number.isFinite(item.added_at)
  );
}

function normalizeWatchlist(value: unknown): PropertyWatchlistItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: PropertyWatchlistItem[] = [];
  for (const raw of value) {
    if (!isWatchlistItem(raw)) continue;
    const propertyId = raw.property_id.trim();
    if (!propertyId || seen.has(propertyId)) continue;
    seen.add(propertyId);
    items.push({
      property_id: propertyId,
      added_at: raw.added_at,
    });
  }
  return items.sort((left, right) => right.added_at - left.added_at);
}

export function readPropertyWatchlist(): PropertyWatchlistItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return normalizeWatchlist(JSON.parse(localStorage.getItem(PROPERTY_WATCHLIST_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

function persistPropertyWatchlist(items: PropertyWatchlistItem[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROPERTY_WATCHLIST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Keep the in-memory watchlist; storage can be unavailable in private modes.
  }
}

export function usePropertyWatchlist() {
  const [items, setItems] = useState<PropertyWatchlistItem[]>(() => readPropertyWatchlist());
  const ids = useMemo(() => new Set(items.map((item) => item.property_id)), [items]);

  const setAndPersist = useCallback((nextItems: PropertyWatchlistItem[]) => {
    setItems(nextItems);
    persistPropertyWatchlist(nextItems);
  }, []);

  const addProperty = useCallback((propertyId: string) => {
    const normalizedId = propertyId.trim();
    if (!normalizedId || ids.has(normalizedId)) return false;
    setAndPersist([{ property_id: normalizedId, added_at: Math.floor(Date.now() / 1000) }, ...items]);
    return true;
  }, [ids, items, setAndPersist]);

  const removeProperty = useCallback((propertyId: string) => {
    const normalizedId = propertyId.trim();
    if (!normalizedId || !ids.has(normalizedId)) return false;
    setAndPersist(items.filter((item) => item.property_id !== normalizedId));
    return true;
  }, [ids, items, setAndPersist]);

  const toggleProperty = useCallback((propertyId: string) => {
    const normalizedId = propertyId.trim();
    if (!normalizedId) return false;
    if (ids.has(normalizedId)) {
      removeProperty(normalizedId);
      return false;
    }
    addProperty(normalizedId);
    return true;
  }, [addProperty, ids, removeProperty]);

  const isWatched = useCallback((propertyId?: string | null) => {
    return Boolean(propertyId && ids.has(propertyId));
  }, [ids]);

  return {
    watchlistItems: items,
    isWatched,
    addProperty,
    removeProperty,
    toggleProperty,
  };
}
