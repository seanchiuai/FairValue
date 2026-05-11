import { useState, useCallback, useEffect, useRef } from 'react';
import type { FairValueIdentity } from '../lib/fairValueAuth';

interface StoredIdentity extends FairValueIdentity {
  nickname?: string;
}

type IdentityResponse = Partial<FairValueIdentity> & {
  error?: string;
};

const IDENTITY_STORAGE_KEY = 'fv_identity_v1';
const LEGACY_NICKNAME_KEY = 'fv_nickname';
const LEGACY_SESSION_ID_KEY = 'fv_session_id';

function readStoredIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.user_id !== 'string' ||
      typeof parsed?.user_token !== 'string'
    ) {
      return null;
    }
    return {
      user_id: parsed.user_id,
      user_token: parsed.user_token,
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname : undefined,
    };
  } catch {
    return null;
  }
}

function persistIdentity(identity: StoredIdentity) {
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
    sessionStorage.setItem(LEGACY_SESSION_ID_KEY, identity.user_id);
    if (identity.nickname) sessionStorage.setItem(LEGACY_NICKNAME_KEY, identity.nickname);
  } catch {
    // Keep the in-memory identity; storage may be unavailable in private modes.
  }
}

async function readIdentityResponse(response: Response): Promise<IdentityResponse> {
  return response.json().catch(() => ({}));
}

function readInitialNickname(): string {
  const identity = readStoredIdentity();
  if (identity?.nickname) return identity.nickname;
  try {
    return sessionStorage.getItem(LEGACY_NICKNAME_KEY) || '';
  } catch {
    return '';
  }
}

export function useSession() {
  const [identity, setIdentity] = useState<StoredIdentity | null>(() => readStoredIdentity());
  const [identityLoading, setIdentityLoading] = useState(() => !readStoredIdentity());
  const [identityError, setIdentityError] = useState('');
  const [nickname, setNicknameState] = useState<string>(() => readInitialNickname());
  const mintIdentityRef = useRef<Promise<StoredIdentity> | null>(null);

  const ensureIdentity = useCallback(async () => {
    const existing = identity || readStoredIdentity();
    if (existing) {
      if (!identity) setIdentity(existing);
      setIdentityLoading(false);
      setIdentityError('');
      return existing;
    }

    if (mintIdentityRef.current) return mintIdentityRef.current;

    setIdentityLoading(true);
    mintIdentityRef.current = fetch('/api/identity', { method: 'POST' })
      .then(async (res) => {
        const data = await readIdentityResponse(res);
        if (!res.ok || data.error) throw new Error(data.error || 'Identity unavailable');
        if (typeof data.user_id !== 'string' || typeof data.user_token !== 'string') {
          throw new Error('Identity response was invalid');
        }
        const next = {
          user_id: data.user_id,
          user_token: data.user_token,
          nickname: nickname || undefined,
        };
        persistIdentity(next);
        setIdentity(next);
        setIdentityError('');
        return next;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Identity unavailable';
        setIdentityError(message);
        throw new Error(message);
      })
      .finally(() => {
        setIdentityLoading(false);
        mintIdentityRef.current = null;
      });

    return mintIdentityRef.current;
  }, [identity, nickname]);

  useEffect(() => {
    if (identity) return;
    ensureIdentity().catch(() => {});
  }, [identity, ensureIdentity]);

  const saveNickname = useCallback((name: string) => {
    const nextName = name.trim().slice(0, 20);
    try {
      sessionStorage.setItem(LEGACY_NICKNAME_KEY, nextName);
    } catch {
      // ignore storage failures
    }
    setNicknameState(nextName);
    setIdentity((current) => {
      if (!current) return current;
      const next = { ...current, nickname: nextName || undefined };
      persistIdentity(next);
      return next;
    });
  }, []);

  return {
    sessionId: identity?.user_id || '',
    userToken: identity?.user_token || '',
    identityReady: Boolean(identity?.user_id && identity?.user_token),
    identityLoading,
    identityError,
    ensureIdentity,
    nickname,
    saveNickname,
  };
}
