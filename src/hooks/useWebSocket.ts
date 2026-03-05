import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  WsBetMessage,
  WsJoinMessage,
  WsLeaveMessage,
  WsAiTradeMessage,
  WsSettleMessage,
  WsMarketUpdateMessage,
} from '../types';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;
const MAX_RETRIES = 10;

interface UseWebSocketOptions {
  roomCode: string;
  onBet?: (data: WsBetMessage) => void;
  onJoin?: (data: WsJoinMessage) => void;
  onLeave?: (data: WsLeaveMessage) => void;
  onAiTrade?: (data: WsAiTradeMessage) => void;
  onSettle?: (data: WsSettleMessage) => void;
  onMarketUpdate?: (data: WsMarketUpdateMessage) => void;
  onReconnected?: () => void;
}

export function useWebSocket({
  roomCode,
  onBet,
  onJoin,
  onLeave,
  onAiTrade,
  onSettle,
  onMarketUpdate,
  onReconnected,
}: UseWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryCountRef = useRef(0);
  const wasConnectedRef = useRef(false);
  const pendingMessagesRef = useRef<string[]>([]);
  const handlersRef = useRef({ onBet, onJoin, onLeave, onAiTrade, onSettle, onMarketUpdate, onReconnected });

  useEffect(() => {
    handlersRef.current = { onBet, onJoin, onLeave, onAiTrade, onSettle, onMarketUpdate, onReconnected };
  });

  const flushPendingMessages = useCallback((ws: WebSocket) => {
    while (pendingMessagesRef.current.length > 0) {
      const msg = pendingMessagesRef.current.shift();
      if (msg && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }, []);

  const connect = useCallback(() => {
    if (!roomCode) return;

    setConnectionState('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${roomCode}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('connected');
      const isReconnect = wasConnectedRef.current;
      retryCountRef.current = 0;
      wasConnectedRef.current = true;
      flushPendingMessages(ws);
      if (isReconnect) {
        handlersRef.current.onReconnected?.();
      }
    };

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
        console.warn('WebSocket: malformed message received');
      }
    };

    ws.onclose = () => {
      setConnectionState('disconnected');
      retryCountRef.current++;

      if (retryCountRef.current > MAX_RETRIES) {
        setConnectionState('failed');
        console.warn('WebSocket: max retries reached, giving up');
        return;
      }

      const delay = Math.min(BASE_DELAY * Math.pow(2, retryCountRef.current - 1) + Math.random() * 1000, MAX_DELAY);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [roomCode, flushPendingMessages]);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    } else {
      pendingMessagesRef.current.push(data);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Periodic pings to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return { connected: connectionState === 'connected', connectionState, send };
}
