import type { ActivityEntry, House, Market, MarketDraftAudit, PlayerData, RoomPhase, SettleResult } from '../types';

export type RoomMutationResponse = {
  error?: string;
  market?: Market;
  players?: PlayerData[];
  player?: PlayerData;
  house?: House;
  draft_audit?: MarketDraftAudit | null;
  activity?: ActivityEntry[];
  phase?: RoomPhase;
  ai_enabled?: boolean;
  host_user_id?: string | null;
  settled?: boolean;
  settlement?: SettleResult;
  event_sequence?: number;
};

export async function readRoomMutationResponse(response: Response): Promise<RoomMutationResponse> {
  return response.json().catch(() => ({}));
}

export function isValidRoomStateResponse(data: RoomMutationResponse) {
  return Boolean(data.market && data.house && Array.isArray(data.players));
}

export function isValidRoomJoinResponse(data: RoomMutationResponse) {
  return Boolean(isValidRoomStateResponse(data) && data.player);
}

export function getRoomStateError(response: Response, data: RoomMutationResponse) {
  if (!response.ok || data.error) return data.error || 'Room state unavailable';
  if (!isValidRoomStateResponse(data)) return 'Room state response was invalid';
  return '';
}

export function getRoomJoinError(
  response: Response,
  data: RoomMutationResponse,
  fallbackMessage = 'Failed to join room',
  malformedMessage = 'Join response was invalid'
) {
  if (!response.ok || data.error) return data.error || fallbackMessage;
  if (!isValidRoomJoinResponse(data)) return malformedMessage;
  return '';
}
