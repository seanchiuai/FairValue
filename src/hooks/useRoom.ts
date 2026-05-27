import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { executeBuy, buyWithBudget } from '../lib/lmsr';
import { buildUserAuthHeaders } from '../lib/fairValueAuth';
import {
  getRoomJoinError,
  getRoomStateError,
  isValidRoomStateResponse,
  readRoomMutationResponse,
  type RoomMutationResponse,
} from '../lib/roomResponses';
import type {
  Market,
  MarketDraftAudit,
  PlayerData,
  House,
  ActivityEntry,
  SettleResult,
  SettleResultEntry,
  WsBetMessage,
  WsJoinMessage,
  WsAiTradeMessage,
  WsSettleMessage,
} from '../types';

const CONNECTED_RECONCILE_INTERVAL_MS = 5000;

function generateBetIdempotencyKey() {
  const randomUUID = window.crypto?.randomUUID;
  if (typeof randomUUID === 'function') return randomUUID.call(window.crypto);
  return `bet-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useRoom(roomCode: string, sessionId: string, userToken = '') {
  const [market, setMarket] = useState<Market | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [house, setHouse] = useState<House | null>(null);
  const [draftAudit, setDraftAudit] = useState<MarketDraftAudit | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const initialFetchDone = useRef(false);

  // Fetch initial state (with offline cache fallback)
  useEffect(() => {
    if (!roomCode || initialFetchDone.current) return;
    initialFetchDone.current = true;

    // Try localStorage cache first for instant display
    const cacheKey = `fv_room_${roomCode}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 5 * 60 * 1000) {
          setMarket(data.market);
          setPlayers(data.players);
          setHouse(data.house);
          setDraftAudit(data.draft_audit || null);
          setActivity(data.activity || []);
          setAiEnabled(data.ai_enabled);
          setHostUserId(data.host_user_id || null);
          setSettled(data.settled);
          if (data.settlement) setSettleResult(data.settlement);
        }
      }
    } catch { /* ignore corrupt cache */ }

    fetch(`/api/rooms/${roomCode}/state`)
      .then(async (r) => {
        const data = await readRoomMutationResponse(r);
        const error = getRoomStateError(r, data);
        if (error) {
          setLoadError(error);
          return;
        }
        setLoadError('');
        setMarket(data.market || null);
        setPlayers(data.players || []);
        setHouse(data.house || null);
        setDraftAudit(data.draft_audit || null);
        setActivity(data.activity || []);
        setAiEnabled(Boolean(data.ai_enabled));
        setHostUserId(data.host_user_id || null);
        setSettled(Boolean(data.settled));
        if (data.settlement) setSettleResult(data.settlement);
        // Persist to cache
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
        } catch { /* quota exceeded */ }
      })
      .catch(() => {
        setLoadError('Room state unavailable');
      })
      .finally(() => setLoading(false));
  }, [roomCode]);

  const updatePlayerInList = useCallback((updatedPlayer: PlayerData) => {
    setPlayers((prev) => {
      const idx = prev.findIndex((p) => p.session_id === updatedPlayer.session_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedPlayer;
        return next;
      }
      return [...prev, updatedPlayer];
    });
  }, []);

  const applyFreshRoomState = useCallback((data: RoomMutationResponse) => {
    if (!isValidRoomStateResponse(data)) return false;
    setMarket(data.market || null);
    setPlayers(data.players || []);
    setHouse(data.house || null);
    setDraftAudit(data.draft_audit || null);
    setActivity(data.activity || []);
    setAiEnabled(Boolean(data.ai_enabled));
    setHostUserId(data.host_user_id || null);
    if (data.settled) setSettled(true);
    if (data.settlement) setSettleResult(data.settlement);
    try {
      localStorage.setItem(`fv_room_${roomCode}`, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* quota exceeded */ }
    return true;
  }, [roomCode]);

  const fetchRoomState = useCallback(() => {
    if (!roomCode) return;
    fetch(`/api/rooms/${roomCode}/state`)
      .then(async (r) => {
        const data = await readRoomMutationResponse(r);
        if (!r.ok || data.error) return;
        applyFreshRoomState(data);
      })
      .catch(() => {});
  }, [roomCode, applyFreshRoomState]);

  const { connected, connectionState, send } = useWebSocket({
    roomCode,
    onBet: useCallback(
      (data: WsBetMessage) => {
        setMarket(data.market);
        if (data.player) updatePlayerInList(data.player);
        if (data.activity) {
          const entry = data.activity;
          setActivity((prev) => [...prev, entry]);
        }
      },
      [updatePlayerInList]
    ),
    onJoin: useCallback((data: WsJoinMessage) => {
      if (data.player) {
        const player = data.player;
        setPlayers((prev) => {
          if (prev.find((p) => p.session_id === player.session_id)) return prev;
          return [...prev, player];
        });
      }
      if (data.activity) {
        const entry = data.activity;
        setActivity((prev) => [...prev, entry]);
      }
    }, []),
    onAiTrade: useCallback((data: WsAiTradeMessage) => {
      setMarket(data.market);
      if (data.activity) {
        const entry = data.activity;
        setActivity((prev) => [...prev, entry]);
      }
    }, []),
    onSettle: useCallback((data: WsSettleMessage) => {
      setSettled(true);
      setSettleResult({
        winning_outcome: data.winning_outcome,
        actual_price: data.actual_price,
        results: data.results,
        evidence_packet: data.evidence_packet || null,
      });
      if (data.activity) {
        const entry = data.activity;
        setActivity((prev) => [...prev, entry]);
      }
      if (data.results) {
        setPlayers((prev) =>
          prev.map((p) => {
            const result = data.results.find((r: SettleResultEntry) => r.nickname === p.nickname);
            if (result) return { ...p, balance: result.final_balance };
            return p;
          })
        );
      }
    }, []),
    onReconnected: fetchRoomState,
  });

  // WebSocket remains the primary path; this catches rare missed broadcasts while a browser still reports connected.
  useEffect(() => {
    if (!connected || !roomCode) return;
    const interval = setInterval(fetchRoomState, CONNECTED_RECONCILE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [connected, roomCode, fetchRoomState]);

  // Poll for state when WebSocket is disconnected (fallback)
  useEffect(() => {
    if (connected || !roomCode) return;
    const interval = setInterval(() => {
      fetch(`/api/rooms/${roomCode}/state`)
        .then(async (r) => {
          const data = await readRoomMutationResponse(r);
          if (!r.ok || data.error) return;
          applyFreshRoomState(data);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [connected, roomCode, applyFreshRoomState]);

  const myPlayer = players.find((p) => p.session_id === sessionId) || null;

  const joinRoom = useCallback(
    async (
      nickname: string,
      identityOverride?: { sessionId?: string; userToken?: string }
    ) => {
      const activeSessionId = identityOverride?.sessionId || sessionId;
      const activeUserToken = identityOverride?.userToken || userToken;
      if (!activeSessionId) throw new Error('User identity is still loading');
      const res = await fetch(`/api/rooms/${roomCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildUserAuthHeaders(activeUserToken),
        },
        body: JSON.stringify({
          session_id: activeSessionId,
          ...(activeUserToken ? { user_id: activeSessionId } : {}),
          nickname,
        }),
      });
      const data = await readRoomMutationResponse(res);
      const error = getRoomJoinError(res, data);
      if (error) throw new Error(error);
      setMarket(data.market || null);
      setPlayers(data.players || []);
      setHouse(data.house || null);
      setDraftAudit(data.draft_audit || null);
      if (data.activity) setActivity(data.activity);
      setHostUserId(data.host_user_id || null);
      if (data.settled) setSettled(true);
      if (data.settlement) setSettleResult(data.settlement);
      return data;
    },
    [roomCode, sessionId, userToken]
  );

  const placeBet = useCallback(
    async (outcome: 'over' | 'under', wager: number) => {
      // Optimistic update: predict new state using LMSR math
      const prevMarket = market;
      const prevPlayers = players;

      if (market) {
        const shares = buyWithBudget(outcome, wager, market.q_over, market.q_under, market.b);
        const result = executeBuy(outcome, shares, market.q_over, market.q_under, market.b);
        setMarket({
          ...market,
          q_over: result.newQOver,
          q_under: result.newQUnder,
          prob_over: result.newProbOver,
          prob_under: 1 - result.newProbOver,
          total_trades: market.total_trades + 1,
          total_wagered: market.total_wagered + wager,
        });
        // Optimistically deduct balance
        const currentPlayer = players.find((p) => p.session_id === sessionId);
        if (currentPlayer) {
          updatePlayerInList({ ...currentPlayer, balance: currentPlayer.balance - wager });
        }
      }

      try {
        const idempotencyKey = generateBetIdempotencyKey();
        if (!sessionId) throw new Error('User identity is still loading');
        const res = await fetch(`/api/rooms/${roomCode}/bet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            ...buildUserAuthHeaders(userToken),
          },
          body: JSON.stringify({
            session_id: sessionId,
            ...(userToken ? { user_id: sessionId } : {}),
            outcome,
            wager,
          }),
        });
        const data = await readRoomMutationResponse(res);
        if (!res.ok || data.error || !data.market || !data.player) {
          // Rollback on error
          if (prevMarket) setMarket(prevMarket);
          setPlayers(prevPlayers);
          throw new Error(data.error || (res.ok ? 'Bet response was invalid' : 'Bet failed'));
        }
        // Server response overwrites optimistic state (corrects for concurrent bets)
        setMarket(data.market);
        if (data.player) updatePlayerInList(data.player);
        return data;
      } catch (err) {
        // Rollback on network failure
        if (prevMarket) setMarket(prevMarket);
        setPlayers(prevPlayers);
        throw err;
      }
    },
    [roomCode, sessionId, userToken, market, players, updatePlayerInList]
  );

  return {
    market,
    players,
    myPlayer,
    house,
    draftAudit,
    activity,
    aiEnabled,
    hostUserId,
    setAiEnabled,
    settled,
    settleResult,
    connected,
    connectionState,
    loading,
    loadError,
    placeBet,
    joinRoom,
    send,
  };
}
