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
  outcomes?: Array<{
    id: string;
    q: number;
    probability: number;
  }>;
  probabilities?: Record<string, number>;
  quantities?: Record<string, number>;
  q_over: number;
  q_under: number;
  total_trades: number;
  total_wagered: number;
  avg_bet_size: number;
  b: number;
}

export interface RoomMarketConfig {
  schema_version?: string;
  market_format?: string;
  threshold_price?: number;
  band_low?: number;
  band_high?: number;
  yield_threshold?: number;
  threshold_percent?: number;
  settlement_price_hint?: number;
  budget_threshold?: number;
  outcomes?: string[];
  liquidity_b?: number;
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
    reason?: string | null;
  }>;
}

export interface House {
  address: string;
  asking_price: number;
}

export interface MarketDraftAudit {
  schema_version: string;
  source_type: string;
  property_id: string | null;
  normalized_fields: {
    address: string;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    asking_price: number;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    home_type?: string | null;
  };
  provenance: {
    source: string;
    confidence: 'low' | 'medium' | 'high';
    matchedSignals: string[];
  };
  market_question: string;
  market_format: string;
  market_template?: {
    market_format: string;
    label: string;
    status: string;
    pricing_engine: string;
    outcome_schema: {
      type: string;
      outcomes: string[];
    };
    settlement_inputs: string[];
    settlement_rule: string;
  } | null;
  liquidity_b: number;
  settlement_rule: string;
  evidence_required: string[];
  generated_summary?: string | null;
  warnings: string[];
  source_text_hash: string | null;
  source_text_length: number;
  validation: {
    status: string;
    checked_at: number;
    issues: string[];
  };
}

export interface RoomPhase {
  status: 'open' | 'discussion' | 'locked' | 'settled';
  label: string;
  betting_locked: boolean;
  duration_seconds: number | null;
  timer_started_at: number | null;
  timer_ends_at: number | null;
  updated_at: number | null;
}

export interface ActivityEntry {
  type: string;
  nickname?: string;
  outcome?: string;
  wager?: number;
  reason?: string | null;
  timestamp: number;
  actual_price?: number;
  winning_outcome?: string;
  phase_status?: string;
  phase_label?: string;
  betting_locked?: boolean;
  timer_ends_at?: number | null;
  event_sequence?: number;
}

export interface RoomEvent {
  id: string;
  room_code: string;
  sequence: number;
  type: string;
  payload: Record<string, any>;
  timestamp: number;
  request_id?: string;
}

export interface SettleResultEntry {
  nickname: string;
  payout: number;
  final_balance: number;
}

export interface PlayerReputationEntry {
  rank: number | null;
  nickname: string;
  bet_count: number;
  reason_count: number;
  correct_bets: number;
  incorrect_bets: number;
  total_wagered: number;
  winning_wagered: number;
  accuracy: number | null;
  average_entry_confidence: number | null;
  average_brier_score: number | null;
  calibration_score: number | null;
  payout: number;
  final_balance: number;
  badge: string;
}

export interface ReputationLeader {
  rank: number | null;
  nickname: string;
  badge: string;
  bet_count: number;
  reason_count: number;
  accuracy: number | null;
  calibration_score: number | null;
}

export interface RoomReputationSummary {
  schema_version: string;
  scoring_model: string;
  status: 'settled' | 'unscored';
  winning_outcome: string | null;
  player_count: number;
  eligible_player_count: number;
  total_bets: number;
  reason_count: number;
  correct_bets: number;
  accuracy: number | null;
  average_entry_confidence: number | null;
  average_brier_score: number | null;
  average_calibration_score: number | null;
  top_players: ReputationLeader[];
  players: PlayerReputationEntry[];
  limitations: string[];
}

export interface UserReputationRoom {
  room_code: string;
  market_format: string;
  settled_at: number;
  nickname: string;
  winning_outcome: string | null;
  bet_count: number;
  correct_bets: number;
  reason_count: number;
  total_wagered: number;
  payout: number;
  average_brier_score: number | null;
  calibration_score: number | null;
}

export interface UserReputation {
  schema_version: string;
  user_id: string;
  nickname: string;
  rooms_played: number;
  total_bets: number;
  correct_bets: number;
  accuracy: number | null;
  reason_count: number;
  total_wagered: number;
  total_payout: number;
  average_brier_score: number | null;
  average_calibration_score: number | null;
  market_formats: Record<string, number>;
  last_settled_at: number | null;
  recent_rooms: UserReputationRoom[];
  limitations: string[];
}

export interface SettlementEvidenceItem {
  type: string;
  label: string;
  source: string;
  reference: string | null;
  observed_at: string | null;
  confidence: 'low' | 'medium' | 'high';
  notes: string | null;
}

export interface SettlementEvidencePacket {
  schema_version: string;
  status: 'host_attested' | 'metadata_attached';
  actual_price: number;
  summary: string;
  items: SettlementEvidenceItem[];
  limitations: string[];
}

export interface SettleResult {
  winning_outcome: string;
  actual_price: number;
  settlement_price?: number | null;
  annual_rent?: number | null;
  rent_yield?: number | null;
  verified_cost?: number | null;
  budget_threshold?: number | null;
  results: SettleResultEntry[];
  evidence_packet?: SettlementEvidencePacket | null;
  reputation_summary?: RoomReputationSummary | null;
}

export interface PublicVerificationArtifact {
  schema_version: string;
  room_code: string;
  generated_at: string;
  status: 'verified' | 'replay_mismatch' | 'unsettled';
  settled: boolean;
  event_stream: {
    event_count: number;
    last_sequence: number;
  };
  replay: {
    live_match: boolean;
    mismatch_count: number;
    replay_hash: string;
    live_hash: string;
  };
  settlement: {
    winning_outcome: string;
    actual_price: number;
    evidence_packet_status: string;
    evidence_packet_hash: string | null;
    evidence_item_count: number;
    reputation_schema_version?: string | null;
    reputation_player_count?: number;
    reputation_eligible_player_count?: number;
    reputation_average_calibration_score?: number | null;
    reputation_top_players?: ReputationLeader[];
  } | null;
  public_recap: {
    digest_hash: string;
    source: string;
  };
  trust_limitations: string[];
  signature: {
    status: 'signed' | 'unsigned_local';
    algorithm: string | null;
    key_hint: string | null;
    payload_hash: string;
    value: string | null;
    reason?: string;
  };
}

// --- WebSocket message types (discriminated union) ---

export type WsBetMessage = {
  type: 'bet';
  market: Market;
  player?: PlayerData;
  activity?: ActivityEntry;
  reason?: string | null;
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
  evidence_packet?: SettlementEvidencePacket | null;
  reputation_summary?: RoomReputationSummary | null;
  phase?: RoomPhase;
  activity?: ActivityEntry;
};

export type WsPhaseMessage = {
  type: 'phase';
  phase: RoomPhase;
  ai_enabled?: boolean;
  activity?: ActivityEntry;
  event_sequence?: number;
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
  | WsPhaseMessage
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

export interface CogneeCitation {
  id?: string;
  label: string;
  detail: string;
}

export type CogneeSearchResponse = CogneeSearchResultItem[] | {
  search_result?: string | string[];
  results?: CogneeSearchResultItem[];
  data?: CogneeSearchResultItem[];
  content?: string;
  text?: string;
  message?: string;
  degraded?: boolean;
  local_analysis?: boolean;
  citations?: CogneeCitation[];
  limitations?: string[];
};
