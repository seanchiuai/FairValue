/**
 * Shared type definitions for FairValue.
 * Single source of truth — no duplicates across hooks/components.
 */

// Re-export types from lib modules
export type { ExecuteBuyResult } from '../lib/lmsr';
export type { BotConfig, BotTradeResult } from '../lib/botEngine';

// --- Core domain types ---

export interface Market {
  prob_over: number;
  prob_under: number;
  q_over: number;
  q_under: number;
  total_trades: number;
  total_wagered: number;
  avg_bet_size: number;
  b: number;
}

export interface PlayerData {
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

export interface House {
  address: string;
  asking_price: number;
}

export interface ActivityEntry {
  type: string;
  nickname?: string;
  outcome?: string;
  wager?: number;
  timestamp: number;
  actual_price?: number;
  winning_outcome?: string;
}

export interface SettleResultEntry {
  nickname: string;
  payout: number;
  final_balance: number;
}

export interface SettleResult {
  winning_outcome: string;
  actual_price: number;
  results: SettleResultEntry[];
}

// --- WebSocket message types (discriminated union) ---

export type WsBetMessage = {
  type: 'bet';
  market: Market;
  player?: PlayerData;
  activity?: ActivityEntry;
};

export type WsJoinMessage = {
  type: 'join';
  player?: PlayerData;
  activity?: ActivityEntry;
};

export type WsLeaveMessage = {
  type: 'leave';
  player?: PlayerData;
};

export type WsAiTradeMessage = {
  type: 'ai_trade';
  market: Market;
  activity?: ActivityEntry;
};

export type WsSettleMessage = {
  type: 'settle';
  winning_outcome: string;
  actual_price: number;
  results: SettleResultEntry[];
  activity?: ActivityEntry;
};

export type WsMarketUpdateMessage = {
  type: 'market_update';
  market: Market;
};

export type WsMessage =
  | WsBetMessage
  | WsJoinMessage
  | WsLeaveMessage
  | WsAiTradeMessage
  | WsSettleMessage
  | WsMarketUpdateMessage;

// --- Chat types ---

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

// --- Cognee service types ---

export interface CogneeSearchResultItem {
  search_result?: string[];
  dataset_name?: string;
  content?: string;
  text?: string;
  description?: string;
  summary?: string;
}

export type CogneeSearchResponse = CogneeSearchResultItem[] | {
  search_result?: string | string[];
  results?: CogneeSearchResultItem[];
  data?: CogneeSearchResultItem[];
  content?: string;
  text?: string;
};
