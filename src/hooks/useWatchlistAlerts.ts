import { useCallback, useEffect, useState } from 'react';
import { buildUserAuthHeaders } from '../lib/fairValueAuth';

export interface WatchlistAlert {
  alert_id: string;
  alert_type: 'price_below' | 'price_above';
  property_id: string;
  threshold: number;
  current_price: number;
  triggered_at: number;
  status: 'ready' | 'acknowledged';
  delivery_channel: 'in_app_profile';
  acknowledged_at?: number | null;
  message?: string | null;
  property?: {
    property_id: string;
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    provider_source?: string;
    observed_at?: string | null;
  } | null;
}

interface AlertsResponse {
  schema_version?: string;
  alerts?: WatchlistAlert[];
  error?: string;
}

function isWatchlistAlert(value: unknown): value is WatchlistAlert {
  const alert = value as WatchlistAlert;
  return (
    typeof alert?.alert_id === 'string' &&
    (alert.alert_type === 'price_below' || alert.alert_type === 'price_above') &&
    typeof alert.property_id === 'string' &&
    Number.isFinite(alert.threshold) &&
    Number.isFinite(alert.current_price) &&
    Number.isFinite(alert.triggered_at) &&
    (alert.status === 'ready' || alert.status === 'acknowledged')
  );
}

function normalizeAlerts(value: unknown): WatchlistAlert[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isWatchlistAlert)
    .sort((left, right) => right.triggered_at - left.triggered_at || left.alert_id.localeCompare(right.alert_id));
}

async function readAlertsResponse(response: Response): Promise<AlertsResponse> {
  return response.json().catch(() => ({}));
}

async function fetchAlerts(userToken: string, evaluate: boolean) {
  const response = await fetch(evaluate ? '/api/me/alerts/evaluate' : '/api/me/alerts', {
    method: evaluate ? 'POST' : 'GET',
    headers: buildUserAuthHeaders(userToken),
  });
  const data = await readAlertsResponse(response);
  if (!response.ok || data.error) throw new Error(data.error || 'Watchlist alerts unavailable');
  if (data.schema_version !== 'fairvalue.userWatchlistAlerts.v1') throw new Error('Watchlist alerts response was invalid');
  return normalizeAlerts(data.alerts);
}

async function acknowledgeAlert(userToken: string, alertId: string) {
  const response = await fetch(`/api/me/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    headers: buildUserAuthHeaders(userToken),
  });
  const data = await readAlertsResponse(response);
  if (!response.ok || data.error) throw new Error(data.error || 'Watchlist alert update failed');
  return normalizeAlerts(data.alerts);
}

export function useWatchlistAlerts(userToken: string) {
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshAlerts = useCallback(async (evaluate = false) => {
    if (!userToken) {
      setAlerts([]);
      setError('');
      setLoading(false);
      return [];
    }
    setLoading(true);
    setError('');
    try {
      const nextAlerts = await fetchAlerts(userToken, evaluate);
      setAlerts(nextAlerts);
      return nextAlerts;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Watchlist alerts unavailable';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  const acknowledgeWatchlistAlert = useCallback(async (alertId: string) => {
    if (!userToken) return [];
    setLoading(true);
    setError('');
    try {
      const nextAlerts = await acknowledgeAlert(userToken, alertId);
      setAlerts(nextAlerts);
      return nextAlerts;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Watchlist alert update failed';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    refreshAlerts(true);
  }, [refreshAlerts]);

  return {
    watchlistAlerts: alerts,
    watchlistAlertsLoading: loading,
    watchlistAlertsError: error,
    refreshWatchlistAlerts: refreshAlerts,
    acknowledgeWatchlistAlert,
  };
}
