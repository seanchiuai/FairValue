import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildUserAuthHeaders } from '../lib/fairValueAuth';

export const PROPERTY_WATCHLIST_STORAGE_KEY = 'fv_property_watchlist_v1';

export interface PropertyWatchlistItem {
  property_id: string;
  added_at: number;
  note?: string | null;
  alert_below?: number | null;
  alert_above?: number | null;
}

export type WatchlistSyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export interface UsePropertyWatchlistOptions {
  userToken?: string;
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
      note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 240) : null,
      alert_below: Number.isFinite(Number(raw.alert_below)) && Number(raw.alert_below) > 0 ? Number(raw.alert_below) : null,
      alert_above: Number.isFinite(Number(raw.alert_above)) && Number(raw.alert_above) > 0 ? Number(raw.alert_above) : null,
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

function mergeWatchlists(primary: PropertyWatchlistItem[], secondary: PropertyWatchlistItem[]) {
  const byId = new Map<string, PropertyWatchlistItem>();
  for (const item of [...secondary, ...primary]) {
    byId.set(item.property_id, {
      ...byId.get(item.property_id),
      ...item,
      added_at: Math.max(item.added_at, byId.get(item.property_id)?.added_at || 0),
    });
  }
  return normalizeWatchlist(Array.from(byId.values()));
}

async function readServerWatchlist(userToken: string): Promise<PropertyWatchlistItem[]> {
  const response = await fetch('/api/me/watchlist', {
    headers: buildUserAuthHeaders(userToken),
  });
  if (!response.ok) throw new Error('Watchlist sync unavailable');
  const data = await response.json();
  return normalizeWatchlist(data?.watchlist);
}

async function upsertServerWatchlistItem(userToken: string, item: PropertyWatchlistItem) {
  const response = await fetch(`/api/me/watchlist/${encodeURIComponent(item.property_id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...buildUserAuthHeaders(userToken),
    },
    body: JSON.stringify({
      note: item.note || null,
      alert_below: item.alert_below ?? null,
      alert_above: item.alert_above ?? null,
    }),
  });
  if (!response.ok) throw new Error('Watchlist sync unavailable');
}

async function removeServerWatchlistItem(userToken: string, propertyId: string) {
  const response = await fetch(`/api/me/watchlist/${encodeURIComponent(propertyId)}`, {
    method: 'DELETE',
    headers: buildUserAuthHeaders(userToken),
  });
  if (!response.ok) throw new Error('Watchlist sync unavailable');
}

export function usePropertyWatchlist(options: UsePropertyWatchlistOptions = {}) {
  const { userToken } = options;
  const [items, setItems] = useState<PropertyWatchlistItem[]>(() => readPropertyWatchlist());
  const [syncStatus, setSyncStatus] = useState<WatchlistSyncStatus>(userToken ? 'syncing' : 'local');
  const ids = useMemo(() => new Set(items.map((item) => item.property_id)), [items]);

  const setAndPersist = useCallback((nextItems: PropertyWatchlistItem[]) => {
    const normalized = normalizeWatchlist(nextItems);
    setItems(normalized);
    persistPropertyWatchlist(normalized);
  }, []);

  useEffect(() => {
    if (!userToken) {
      setSyncStatus('local');
      return;
    }
    let cancelled = false;
    setSyncStatus('syncing');
    readServerWatchlist(userToken)
      .then((serverItems) => {
        if (cancelled) return;
        const localItems = readPropertyWatchlist();
        const merged = mergeWatchlists(serverItems, localItems);
        setAndPersist(merged);
        const serverIds = new Set(serverItems.map((item) => item.property_id));
        for (const item of merged) {
          if (!serverIds.has(item.property_id)) {
            upsertServerWatchlistItem(userToken, item).catch(() => {});
          }
        }
        setSyncStatus('synced');
      })
      .catch(() => {
        if (!cancelled) setSyncStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [setAndPersist, userToken]);

  const addProperty = useCallback((propertyId: string) => {
    const normalizedId = propertyId.trim();
    if (!normalizedId || ids.has(normalizedId)) return false;
    const nextItem = { property_id: normalizedId, added_at: Math.floor(Date.now() / 1000), note: null, alert_below: null, alert_above: null };
    setAndPersist([nextItem, ...items]);
    if (userToken) upsertServerWatchlistItem(userToken, nextItem).then(() => setSyncStatus('synced')).catch(() => setSyncStatus('error'));
    return true;
  }, [ids, items, setAndPersist, userToken]);

  const removeProperty = useCallback((propertyId: string) => {
    const normalizedId = propertyId.trim();
    if (!normalizedId || !ids.has(normalizedId)) return false;
    setAndPersist(items.filter((item) => item.property_id !== normalizedId));
    if (userToken) removeServerWatchlistItem(userToken, normalizedId).then(() => setSyncStatus('synced')).catch(() => setSyncStatus('error'));
    return true;
  }, [ids, items, setAndPersist, userToken]);

  const updateProperty = useCallback((propertyId: string, patch: Partial<Pick<PropertyWatchlistItem, 'note' | 'alert_below' | 'alert_above'>>) => {
    const normalizedId = propertyId.trim();
    if (!normalizedId || !ids.has(normalizedId)) return false;
    const nextItems = items.map((item) => item.property_id === normalizedId ? { ...item, ...patch } : item);
    setAndPersist(nextItems);
    const nextItem = nextItems.find((item) => item.property_id === normalizedId);
    if (userToken && nextItem) upsertServerWatchlistItem(userToken, nextItem).then(() => setSyncStatus('synced')).catch(() => setSyncStatus('error'));
    return true;
  }, [ids, items, setAndPersist, userToken]);

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
    syncStatus,
    isServerBacked: syncStatus === 'synced',
    isWatched,
    addProperty,
    removeProperty,
    updateProperty,
    toggleProperty,
  };
}
