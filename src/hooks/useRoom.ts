import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { executeBuy, priceOver, buyWithBudget } from '../lib/lmsr';
import type {
  Market,
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

export function useRoom(roomCode: string, sessionId: string) {
  const [market, setMarket] = useState<Market | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [house, setHouse] = useState<House | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [settled, setSettled] = useState(false);
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [loading, setLoading] = useState(true);
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
          setActivity(data.activity || []);
          setAiEnabled(data.ai_enabled);
          setSettled(data.settled);
        }
      }
    } catch { /* ignore corrupt cache */ }

    fetch(`/api/rooms/${roomCode}/state`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setMarket(data.market);
          setPlayers(data.players);
          setHouse(data.house);
          setActivity(data.activity || []);
          setAiEnabled(data.ai_enabled);
          setSettled(data.settled);
          // Persist to cache
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
          } catch { /* quota exceeded */ }
        }
        setLoading(false);
      })
      .catch(() => {
        console.warn('Failed to load room state');
        setLoading(false);
      });
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

  const onBet = useCallback(
    (data: WsBetMessage) => {
      setMarket(data.market);
      if (data.player) updatePlayerInList(data.player);
      if (data.activity) {
        const entry = data.activity;
        setActivity((prev) => [...prev, entry]);
      }
    },
    [updatePlayerInList]
  );

  const onJoin = useCallback((data: WsJoinMessage) => {
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
  }, []);

  const onAiTrade = useCallback((data: WsAiTradeMessage) => {
    setMarket(data.market);
    if (data.activity) {
      const entry = data.activity;
      setActivity((prev) => [...prev, entry]);
    }
  }, []);

  const onSettle = useCallback((data: WsSettleMessage) => {
    setSettled(true);
    setSettleResult({
      winning_outcome: data.winning_outcome,
      actual_price: data.actual_price,
      results: data.results,
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
  }, []);

  const fetchRoomState = useCallback(() => {
    if (!roomCode) return;
    fetch(`/api/rooms/${roomCode}/state`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setMarket(data.market);
          setPlayers(data.players);
          setActivity(data.activity || []);
          setAiEnabled(data.ai_enabled);
          if (data.settled) setSettled(true);
          try {
            localStorage.setItem(`fv_room_${roomCode}`, JSON.stringify({ data, ts: Date.now() }));
          } catch { /* quota exceeded */ }
        }
      })
      .catch(() => console.warn('Failed to refresh room state'));
  }, [roomCode]);

  const { connected, connectionState, send } = useWebSocket({
    roomCode,
    onBet,
    onJoin,
    onAiTrade,
    onSettle,
    onReconnected: fetchRoomState,
  });

  // Poll for state when WebSocket is disconnected (fallback)
  useEffect(() => {
    if (connected || !roomCode) return;
    const interval = setInterval(() => {
      fetch(`/api/rooms/${roomCode}/state`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) {
            setMarket(data.market);
            setPlayers(data.players);
            setActivity(data.activity || []);
            setAiEnabled(data.ai_enabled);
            if (data.settled) setSettled(true);
          }
        })
        .catch(() => console.warn('Polling fallback: failed to fetch room state'));
    }, 3000);
    return () => clearInterval(interval);
  }, [connected, roomCode]);

  const myPlayer = players.find((p) => p.session_id === sessionId) || null;

  const joinRoom = useCallback(
    async (nickname: string) => {
      const res = await fetch(`/api/rooms/${roomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, nickname }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.market) setMarket(data.market);
      if (data.players) setPlayers(data.players);
      if (data.house) setHouse(data.house);
      if (data.activity) setActivity(data.activity);
      return data;
    },
    [roomCode, sessionId]
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
        const res = await fetch(`/api/rooms/${roomCode}/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, outcome, wager }),
        });
        const data = await res.json();
        if (data.error) {
          // Rollback on error
          if (prevMarket) setMarket(prevMarket);
          setPlayers(prevPlayers);
          throw new Error(data.error);
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
    [roomCode, sessionId, market, players, updatePlayerInList]
  );

  return {
    market,
    players,
    myPlayer,
    house,
    activity,
    aiEnabled,
    setAiEnabled,
    settled,
    settleResult,
    connected,
    connectionState,
    loading,
    placeBet,
    joinRoom,
    send,
  };
}
