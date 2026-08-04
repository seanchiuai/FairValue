import { useCallback, useEffect, useState } from 'react';
import { buildUserAuthHeaders } from '../lib/fairValueAuth';

export interface RoomLibraryRoom {
  room_code: string;
  address: string;
  asking_price: number;
  market_format: string;
  phase: {
    status: string;
    label: string;
    betting_locked: boolean;
    updated_at: number | null;
  };
  settled: boolean;
  created_at: number;
  settled_at: number | null;
  last_activity_at: number;
  player_count: number;
  total_wagered: number;
  event_sequence: number;
  winning_outcome: string | null;
  actual_price: number | null;
  is_host: boolean;
}

interface RoomLibraryResponse {
  rooms?: RoomLibraryRoom[];
  error?: string;
}

export function useRoomLibrary(userToken?: string) {
  const [rooms, setRooms] = useState<RoomLibraryRoom[]>([]);
  const [loading, setLoading] = useState(Boolean(userToken));
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userToken) {
      setRooms([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/me/rooms?status=all&limit=100', {
        headers: buildUserAuthHeaders(userToken),
      });
      const data = await response.json().catch(() => ({})) as RoomLibraryResponse;
      if (!response.ok || data.error) throw new Error(data.error || 'Room library unavailable');
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Room library unavailable');
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return { rooms, loading, error, refresh };
}
