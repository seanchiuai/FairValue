import { useEffect, useRef, useState, useCallback } from 'react';

type EventHandler = (data: any) => void;

interface UseWebSocketOptions {
  roomCode: string;
  onBet?: EventHandler;
  onJoin?: EventHandler;
  onLeave?: EventHandler;
  onAiTrade?: EventHandler;
  onSettle?: EventHandler;
  onMarketUpdate?: EventHandler;
}

export function useWebSocket({
  roomCode,
  onBet,
  onJoin,
  onLeave,
  onAiTrade,
  onSettle,
  onMarketUpdate,
}: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handlersRef = useRef({ onBet, onJoin, onLeave, onAiTrade, onSettle, onMarketUpdate });

  // Keep handlers ref current without re-triggering effect
  useEffect(() => {
    handlersRef.current = { onBet, onJoin, onLeave, onAiTrade, onSettle, onMarketUpdate };
  });

  const connect = useCallback(() => {
    if (!roomCode) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${roomCode}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const h = handlersRef.current;
        switch (data.type) {
          case 'bet':
            h.onBet?.(data);
            break;
          case 'join':
            h.onJoin?.(data);
            break;
          case 'leave':
            h.onLeave?.(data);
            break;
          case 'ai_trade':
            h.onAiTrade?.(data);
            break;
          case 'settle':
            h.onSettle?.(data);
            break;
          case 'market_update':
            h.onMarketUpdate?.(data);
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 2 seconds
      reconnectTimerRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [roomCode]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Send periodic pings to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return { connected };
}
