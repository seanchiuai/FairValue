import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { buildUserAuthHeaders, saveHostToken } from '../lib/fairValueAuth';
import { getRoomJoinError, readRoomMutationResponse } from '../lib/roomResponses';
import {
  MarketDraft,
  formatDraftPrice,
  generateMarketDraft,
  parseAskingPrice,
  validateMarketDraft,
} from '../lib/marketDrafts';
import { useToast } from '../contexts/ToastContext';
import { AlertTriangle, CheckCircle2, FileText, Home, LogIn, Plus, Users, WandSparkles } from 'lucide-react';

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
  const [mode, setMode] = useState<'pick' | 'create' | 'join' | 'studio'>('pick');
  const [name, setName] = useState(nickname);
  const [address, setAddress] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [studioText, setStudioText] = useState('');
  const [studioDraft, setStudioDraft] = useState<MarketDraft | null>(null);
  const [studioAddress, setStudioAddress] = useState('');
  const [studioPrice, setStudioPrice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sanitize = (s: string, max: number) => s.trim().replace(/<[^>]*>/g, '').slice(0, max);
  const formatRoomCodeInput = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const createErrorId = 'create-room-error';
  const joinErrorId = 'join-room-error';
  const studioErrorId = 'studio-room-error';
  const createErrorMessage = mode === 'create' ? error || identityError : '';
  const joinErrorMessage = mode === 'join' ? error || identityError : '';
  const studioErrorMessage = mode === 'studio' ? error || identityError : '';
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

  const createRoomAndJoinHost = async (cleanName: string, cleanAddress: string, price: number) => {
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
  };

  const parseRoomPrice = (value: string) =>
    parseAskingPrice(value) || parseFloat(value.replace(/[$,]/g, ''));

  const handleCreate = async () => {
    const cleanName = sanitize(name, 20);
    const cleanAddress = sanitize(address, 100);
    if (!cleanName || !cleanAddress || !askingPrice.trim()) {
      setError('All fields are required');
      return;
    }
    const price = parseRoomPrice(askingPrice);
    if (isNaN(price) || price <= 0 || price > 100_000_000) {
      setError('Enter a valid asking price (up to $100M)');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await createRoomAndJoinHost(cleanName, cleanAddress, price);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateDraft = () => {
    if (!studioText.trim()) {
      setError('Paste a listing, address, or property notes first');
      return;
    }
    const draft = generateMarketDraft(studioText);
    setStudioDraft(draft);
    setStudioAddress(draft.address);
    setStudioPrice(draft.asking_price ? String(draft.asking_price) : '');
    setError('');
  };

  const handleStudioCreate = async () => {
    const cleanName = sanitize(name, 20);
    const cleanAddress = sanitize(studioAddress, 100);
    const parsedPrice = parseRoomPrice(studioPrice);
    const validation = validateMarketDraft({
      address: cleanAddress,
      asking_price: Number.isNaN(parsedPrice) ? null : parsedPrice,
    });
    if (!cleanName) {
      setError('Host nickname is required');
      return;
    }
    if (!validation.valid) {
      setError(validation.issues.join(' '));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await createRoomAndJoinHost(cleanName, cleanAddress, parsedPrice);
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
      <div style={{ ...styles.container, ...(mode === 'studio' ? styles.studioContainer : null) }}>
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
            <button style={styles.pickBtn} onClick={() => setMode('studio')}>
              <WandSparkles size={24} />
              <span style={styles.pickLabel}>Market Studio</span>
              <span style={styles.pickDesc}>Generate a room from pasted listing text</span>
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

        {mode === 'studio' && (
          <div style={styles.form}>
            <div style={styles.studioHeading}>
              <FileText size={19} color="var(--accent-primary)" aria-hidden="true" />
              <h2 style={styles.formTitle}>Market Studio</h2>
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="studio-host-nickname">Host Nickname</label>
              <input
                id="studio-host-nickname"
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Host nickname"
                aria-describedby={studioErrorMessage ? studioErrorId : undefined}
                aria-invalid={studioErrorMessage === 'Host nickname is required' || undefined}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="market-studio-source">Listing Text</label>
              <textarea
                id="market-studio-source"
                style={styles.textarea}
                value={studioText}
                onChange={(e) => setStudioText(e.target.value)}
                aria-label="Listing text"
                aria-describedby={studioErrorMessage ? studioErrorId : undefined}
                placeholder="Paste listing text, address, asking price, beds, baths, and sqft..."
                rows={7}
              />
            </div>
            <button
              type="button"
              style={styles.secondaryActionBtn}
              onClick={handleGenerateDraft}
            >
              <WandSparkles size={16} aria-hidden="true" />
              Generate Market Draft
            </button>

            {studioDraft && (
              <section style={styles.draftCard} aria-label="Generated market draft" data-testid="market-studio-draft">
                <div style={styles.draftTopline}>
                  <span style={styles.generatedPill}>
                    <CheckCircle2 size={13} aria-hidden="true" />
                    {studioDraft.provenance.confidence} confidence
                  </span>
                  <span style={styles.generatedSource}>{studioDraft.provenance.source}</span>
                </div>
                <h3 style={styles.draftQuestion}>{studioDraft.market_question}</h3>
                <p style={styles.draftSummary}>{studioDraft.generated_summary}</p>

                <div style={styles.field}>
                  <label style={styles.label} htmlFor="studio-property-address">Generated Address</label>
                  <input
                    id="studio-property-address"
                    style={styles.input}
                    value={studioAddress}
                    onChange={(e) => setStudioAddress(e.target.value)}
                    aria-label="Generated property address"
                    aria-describedby={studioErrorMessage ? studioErrorId : undefined}
                    placeholder="Property address"
                    maxLength={100}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label} htmlFor="studio-asking-price">Generated Asking Price ($)</label>
                  <input
                    id="studio-asking-price"
                    style={styles.input}
                    value={studioPrice}
                    onChange={(e) => setStudioPrice(e.target.value)}
                    aria-label="Generated asking price"
                    aria-describedby={studioErrorMessage ? studioErrorId : undefined}
                    placeholder="1,250,000"
                    inputMode="numeric"
                  />
                </div>

                <div style={styles.draftMetaGrid}>
                  <span>{studioDraft.beds ? `${studioDraft.beds} beds` : 'Beds unknown'}</span>
                  <span>{studioDraft.baths ? `${studioDraft.baths} baths` : 'Baths unknown'}</span>
                  <span>{studioDraft.sqft ? `${studioDraft.sqft.toLocaleString()} sqft` : 'Sqft unknown'}</span>
                  <span>{studioDraft.home_type || 'Type unknown'}</span>
                </div>

                <div style={styles.draftChecklist}>
                  <div style={styles.draftSubhead}>Settlement evidence</div>
                  <ul style={styles.draftList}>
                    {studioDraft.evidence_required.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div style={styles.warningBox}>
                  <AlertTriangle size={15} aria-hidden="true" />
                  <div>
                    {studioDraft.warnings.map((warning) => (
                      <p key={warning} style={styles.warningText}>{warning}</p>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {studioErrorMessage && <p id={studioErrorId} style={styles.error} role="alert">{studioErrorMessage}</p>}
            <button
              style={{ ...styles.submitBtn, opacity: submitting || identityLoading || !studioDraft ? 0.6 : 1 }}
              onClick={handleStudioCreate}
              disabled={submitting || identityLoading || !studioDraft}
            >
              {submitting ? 'Creating...' : 'Create Room From Draft'}
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
  studioContainer: {
    maxWidth: 680,
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
  studioHeading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  textarea: {
    padding: '13px 14px',
    background: 'rgba(120,120,128,0.08)',
    border: '1px solid rgba(0,0,0,0.04)',
    borderRadius: 14,
    color: 'var(--text-primary)',
    fontSize: 14,
    lineHeight: 1.5,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    minHeight: 150,
  },
  secondaryActionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 980,
    color: 'var(--text-primary)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 2px 10px rgba(0,0,0,0.04)',
  },
  draftCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    background: 'rgba(255,255,255,0.52)',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72), 0 8px 22px rgba(0,0,0,0.05)',
  },
  draftTopline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  generatedPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 9px',
    borderRadius: 980,
    background: 'var(--accent-success-subtle)',
    color: 'var(--accent-success)',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'capitalize' as const,
  },
  generatedSource: {
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  draftQuestion: {
    margin: 0,
    color: 'var(--text-primary)',
    fontSize: 19,
    lineHeight: 1.25,
  },
  draftSummary: {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1.45,
  },
  draftMetaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 8,
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 600,
  },
  draftChecklist: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  draftSubhead: {
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 800,
  },
  draftList: {
    margin: 0,
    paddingLeft: 18,
    color: 'var(--text-secondary)',
    fontSize: 13,
    lineHeight: 1.45,
  },
  warningBox: {
    display: 'flex',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    background: 'var(--accent-warning-subtle)',
    color: 'var(--accent-warning)',
    border: '1px solid rgba(161,92,0,0.16)',
  },
  warningText: {
    margin: '0 0 4px',
    fontSize: 12,
    lineHeight: 1.35,
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
