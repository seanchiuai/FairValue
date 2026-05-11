export const FAIRVALUE_USER_TOKEN_HEADER = 'X-FairValue-User-Token';
export const FAIRVALUE_HOST_TOKEN_HEADER = 'X-FairValue-Host-Token';

export interface FairValueIdentity {
  user_id: string;
  user_token: string;
}

export function buildUserAuthHeaders(userToken?: string): Record<string, string> {
  return userToken ? { [FAIRVALUE_USER_TOKEN_HEADER]: userToken } : {};
}

export function buildHostAuthHeaders({
  userToken,
  hostToken,
}: {
  userToken?: string;
  hostToken?: string;
}): Record<string, string> {
  if (userToken) return buildUserAuthHeaders(userToken);
  return hostToken ? { [FAIRVALUE_HOST_TOKEN_HEADER]: hostToken } : {};
}

export function saveHostToken(roomCode: string, hostToken?: string) {
  if (!roomCode || !hostToken) return;
  const key = `fv_host_token_${roomCode}`;
  try {
    sessionStorage.setItem(key, hostToken);
    localStorage.setItem(key, hostToken);
  } catch {
    // Storage can fail in private modes; host identity remains the primary auth.
  }
}

export function readHostToken(roomCode?: string): string {
  if (!roomCode) return '';
  const key = `fv_host_token_${roomCode}`;
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
