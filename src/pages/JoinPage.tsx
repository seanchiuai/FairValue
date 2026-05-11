import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { buildUserAuthHeaders, saveHostToken } from '../lib/fairValueAuth';
import { getRoomJoinError, readRoomMutationResponse } from '../lib/roomResponses';
import { useToast } from '../contexts/ToastContext';
import { Home, Users, Plus, LogIn } from 'lucide-react';

type RoomCreateResponse = {
  room_code?: string;
  host_token?: string;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export default function JoinPage() {
  const navigate = useNavigate();
  const {
    nickname,
    saveNickname,
    identityLoading,
    identityError,
    ensureIdentity,
  } = useSession();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'pick' | 'create' | 'join'>('pick');
  const [name, setName] = useState(nickname);
  const [address, setAddress] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sanitize = (s: string, max: number) => s.trim().replace(/<[^>]*>/g, '').slice(0, max);
  const formatRoomCodeInput = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const createErrorId = 'create-room-error';
  const joinErrorId = 'join-room-error';
  const createErrorMessage = mode === 'create' ? error || identityError : '';
  const joinErrorMessage = mode === 'join' ? error || identityError : '';
  const createFieldInvalid = (field: 'name' | 'address' | 'askingPrice') => {
    if (!error) return false;
    if (error === 'All fields are required') return true;
    return field === 'askingPrice' && error.startsWith('Enter a valid asking price');
  };
  const joinFieldInvalid = (field: 'name' | 'roomCode') => {
    if (!error) return false;
    if (error === 'Nickname and room code are required') return true;
    return field === 'roomCode' && (
      error.startsWith('Room code') ||
      error === 'Room not found'
    );
  };

  useEffect(() => {
    if (!name && nickname) setName(nickname);
  }, [name, nickname]);

  const handleCreate = async () => {
    const cleanName = sanitize(name, 20);
    const cleanAddress = sanitize(address, 100);
    if (!cleanName || !cleanAddress || !askingPrice.trim()) {
      setError('All fields are required');
      return;
    }
    const price = parseFloat(askingPrice.replace(/,/g, ''));
    if (isNaN(price) || price <= 0 || price > 100_000_000) {
      setError('Enter a valid asking price (up to $100M)');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const identity = await ensureIdentity();
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildUserAuthHeaders(identity.user_token),
        },
        body: JSON.stringify({
          address: cleanAddress,
          asking_price: price,
          host_user_id: identity.user_id,
        }),
      });
      const data = await readJson<RoomCreateResponse>(res);
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create room');
      if (!data.room_code || !data.host_token) throw new Error('Room creation response was invalid');

      saveNickname(cleanName);
      saveHostToken(data.room_code, data.host_token);

      // Join the room as host
      const joinRes = await fetch(`/api/rooms/${data.room_code}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildUserAuthHeaders(identity.user_token),
        },
        body: JSON.stringify({
          session_id: identity.user_id,
          user_id: identity.user_id,
          nickname: cleanName,
        }),
      });
      const joinData = await readRoomMutationResponse(joinRes);
      const joinError = getRoomJoinError(
        joinRes,
        joinData,
        'Failed to join room as host',
        'Host join response was invalid'
      );
      if (joinError) throw new Error(joinError);

      navigate(`/host/${data.room_code}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    const cleanName = sanitize(name, 20);
    const cleanCode = formatRoomCodeInput(roomCode);
    if (!cleanName || !cleanCode) {
      setError('Nickname and room code are required');
      return;
    }
    if (!/^[A-Z0-9]{4}$/.test(cleanCode)) {
      setError('Room code must be 4 letters or numbers');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const identity = await ensureIdentity();
      const res = await fetch(`/api/rooms/${cleanCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildUserAuthHeaders(identity.user_token),
        },
        body: JSON.stringify({
          session_id: identity.user_id,
          user_id: identity.user_id,
          nickname: cleanName,
        }),
      });
      const data = await readRoomMutationResponse(res);
      const joinError = getRoomJoinError(res, data);
      if (joinError) throw new Error(joinError);

      saveNickname(cleanName);
      navigate(`/play/${cleanCode}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to join room';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.logo}>
          <Home size={32} color="var(--accent-primary)" />
          <h1 style={styles.title}>FairValue</h1>
          <p style={styles.subtitle}>Real Estate Prediction Market</p>
        </div>

        {mode === 'pick' && (
          <div style={styles.pickContainer}>
            <button style={styles.pickBtn} onClick={() => setMode('create')}>
              <Plus size={24} />
              <span style={styles.pickLabel}>Create Room</span>
              <span style={styles.pickDesc}>Host a game on TV/projector</span>
            </button>
            <button style={styles.pickBtn} onClick={() => setMode('join')}>
              <LogIn size={24} />
              <span style={styles.pickLabel}>Join Room</span>
              <span style={styles.pickDesc}>Play from your phone</span>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div style={styles.form}>
            <h2 style={styles.formTitle}>Create a Room</h2>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="create-host-nickname">Your Nickname</label>
              <input
                id="create-host-nickname"
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Host nickname"
                aria-describedby={createErrorMessage ? createErrorId : undefined}
                aria-invalid={createFieldInvalid('name') || undefined}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="create-property-address">Property Address</label>
              <input
                id="create-property-address"
                style={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                aria-label="Property address"
                aria-describedby={createErrorMessage ? createErrorId : undefined}
                aria-invalid={createFieldInvalid('address') || undefined}
                placeholder="742 Evergreen Terrace"
                maxLength={100}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="create-asking-price">Asking Price ($)</label>
              <input
                id="create-asking-price"
                style={styles.input}
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                aria-label="Asking price"
                aria-describedby={createErrorMessage ? createErrorId : undefined}
                aria-invalid={createFieldInvalid('askingPrice') || undefined}
                placeholder="450,000"
                inputMode="numeric"
              />
            </div>
            {createErrorMessage && <p id={createErrorId} style={styles.error} role="alert">{createErrorMessage}</p>}
            <button
              style={{ ...styles.submitBtn, opacity: submitting || identityLoading ? 0.6 : 1 }}
              onClick={handleCreate}
              disabled={submitting || identityLoading}
            >
              {submitting ? 'Creating...' : 'Create Room'}
            </button>
            <button style={styles.backBtn} onClick={() => { setMode('pick'); setError(''); }}>
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div style={styles.form}>
            <h2 style={styles.formTitle}>Join a Room</h2>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="join-player-nickname">Your Nickname</label>
              <input
                id="join-player-nickname"
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Player nickname"
                aria-describedby={joinErrorMessage ? joinErrorId : undefined}
                aria-invalid={joinFieldInvalid('name') || undefined}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="join-room-code">Room Code</label>
              <input
                id="join-room-code"
                style={{ ...styles.input, textAlign: 'center', fontSize: 24, letterSpacing: 8, textTransform: 'uppercase' }}
                value={roomCode}
                onChange={(e) => setRoomCode(formatRoomCodeInput(e.target.value))}
                aria-label="Room code"
                aria-describedby={joinErrorMessage ? joinErrorId : undefined}
                aria-invalid={joinFieldInvalid('roomCode') || undefined}
                placeholder="A1B2"
                maxLength={4}
                inputMode="text"
              />
            </div>
            {joinErrorMessage && <p id={joinErrorId} style={styles.error} role="alert">{joinErrorMessage}</p>}
            <button
              style={{ ...styles.submitBtn, opacity: submitting || identityLoading ? 0.6 : 1 }}
              onClick={handleJoin}
              disabled={submitting || identityLoading}
            >
              {submitting ? 'Joining...' : 'Join Room'}
            </button>
            <button style={styles.backBtn} onClick={() => { setMode('pick'); setError(''); }}>
              Back
            </button>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <button style={styles.footerLink} onClick={() => navigate('/')}>
          <Users size={14} /> Browse Markets
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-mesh)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    background: 'rgba(255,255,255,0.45)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 28,
    padding: '36px 28px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 8px 40px rgba(0,0,0,0.08)',
  },
  logo: {
    textAlign: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '8px 0 4px',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: 'var(--text-muted)',
  },
  pickContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  pickBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '24px 16px',
    background: 'rgba(255,255,255,0.5)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 20,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
    fontSize: 14,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 12px rgba(0,0,0,0.04)',
  },
  pickLabel: {
    fontWeight: 700,
    fontSize: 16,
  },
  pickDesc: {
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
    margin: 0,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: '12px 14px',
    background: 'rgba(120,120,128,0.08)',
    border: '1px solid rgba(0,0,0,0.04)',
    borderRadius: 14,
    color: 'var(--text-primary)',
    fontSize: 15,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  error: {
    color: 'var(--accent-danger)',
    fontSize: 13,
    textAlign: 'center',
    margin: 0,
  },
  submitBtn: {
    padding: '14px 20px',
    background: 'rgba(0,122,255,0.9)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 980,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 16px rgba(0,122,255,0.25)',
  },
  backBtn: {
    padding: '10px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'center',
  },
  footer: {
    marginTop: 32,
  },
  footerLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 13,
    cursor: 'pointer',
  },
};
