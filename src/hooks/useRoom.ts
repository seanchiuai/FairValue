import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';

interface Market {
  prob_over: number;
  prob_under: number;
  q_over: number;
  q_under: number;
  total_trades: number;
  total_wagered: number;
  avg_bet_size: number;
  b: number;
}

interface PlayerData {
  session_id: string;
  nickname: string;
  balance: number;
  bets: Array<{
    outcome: string;
    wager: number;
    shares: number;
    prob_at_entry: number;
    timestamp: number;
  }>;
}

interface House {
  address: string;
  asking_price: number;
}

interface ActivityEntry {
  type: string;
  nickname?: string;
  outcome?: string;
  wager?: number;
  timestamp: number;
  actual_price?: number;
  winning_outcome?: string;
}

interface SettleResult {
  winning_outcome: string;
  actual_price: number;
  results: Array<{ nickname: string; payout: number; final_balance: number }>;
}

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

  // Fetch initial state
  useEffect(() => {
    if (!roomCode || initialFetchDone.current) return;
    initialFetchDone.current = true;

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
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    (data: any) => {
      setMarket(data.market);
      if (data.player) updatePlayerInList(data.player);
      if (data.activity) setActivity((prev) => [...prev, data.activity]);
    },
    [updatePlayerInList]
  );

  const onJoin = useCallback((data: any) => {
    if (data.player) {
      setPlayers((prev) => {
        if (prev.find((p) => p.session_id === data.player.session_id)) return prev;
        return [...prev, data.player];
      });
    }
    if (data.activity) setActivity((prev) => [...prev, data.activity]);
  }, []);

  const onAiTrade = useCallback((data: any) => {
    setMarket(data.market);
    if (data.activity) setActivity((prev) => [...prev, data.activity]);
  }, []);

  const onSettle = useCallback((data: any) => {
    setSettled(true);
    setSettleResult({
      winning_outcome: data.winning_outcome,
      actual_price: data.actual_price,
      results: data.results,
    });
    if (data.activity) setActivity((prev) => [...prev, data.activity]);
    // Update player balances from results
    if (data.results) {
      setPlayers((prev) =>
        prev.map((p) => {
          const result = data.results.find((r: any) => r.nickname === p.nickname);
          if (result) return { ...p, balance: result.final_balance };
          return p;
        })
      );
    }
  }, []);

  const { connected } = useWebSocket({
    roomCode,
    onBet,
    onJoin,
    onAiTrade,
    onSettle,
  });

  const myPlayer = players.find((p) => p.session_id === sessionId) || null;

  const placeBet = useCallback(
    async (outcome: 'over' | 'under', wager: number) => {
      const res = await fetch(`/api/rooms/${roomCode}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, outcome, wager }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Update local state immediately for the bettor
      setMarket(data.market);
      if (data.player) updatePlayerInList(data.player);
      return data;
    },
    [roomCode, sessionId, updatePlayerInList]
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
    loading,
    placeBet,
  };
}
