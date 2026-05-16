import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadProperties } from '../data/properties';
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
import {
  MarketDraftPropertyMatch,
  SavedMarketStudioDraft,
  createDraftFromProperty,
  deleteMarketStudioDraft,
  matchDraftToProperties,
  readSavedMarketStudioDrafts,
  saveMarketStudioDraft,
} from '../lib/marketStudioDrafts';
import { useToast } from '../contexts/ToastContext';
import CreateRoomForm from '../components/join/CreateRoomForm';
import JoinModePicker, { type JoinModePickerMode } from '../components/join/JoinModePicker';
import JoinRoomForm from '../components/join/JoinRoomForm';
import MarketStudioDraftCard from '../components/join/MarketStudioDraftCard';
import MarketStudioMatches from '../components/join/MarketStudioMatches';
import MarketStudioSavedDrafts from '../components/join/MarketStudioSavedDrafts';
import { FileText, Home, Save, Users, WandSparkles } from 'lucide-react';

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
  const [mode, setMode] = useState<'pick' | JoinModePickerMode>('pick');
  const [name, setName] = useState(nickname);
  const [address, setAddress] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [studioText, setStudioText] = useState('');
  const [studioDraft, setStudioDraft] = useState<MarketDraft | null>(null);
  const [studioAddress, setStudioAddress] = useState('');
  const [studioPrice, setStudioPrice] = useState('');
  const [propertyMatches, setPropertyMatches] = useState<MarketDraftPropertyMatch[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<SavedMarketStudioDraft[]>([]);
  const [matchingProperties, setMatchingProperties] = useState(false);
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
  const returnToPicker = () => {
    setMode('pick');
    setError('');
  };

  useEffect(() => {
    if (!name && nickname) setName(nickname);
  }, [name, nickname]);

  useEffect(() => {
    setSavedDrafts(readSavedMarketStudioDrafts());
  }, []);

  const createRoomAndJoinHost = async (
    cleanName: string,
    cleanAddress: string,
    price: number,
    marketDraft?: MarketDraft | null
  ) => {
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
        ...(marketDraft ? { market_draft: marketDraft } : {}),
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

  const applyStudioDraft = (draft: MarketDraft, sourceText = draft.source_text) => {
    setStudioDraft(draft);
    setStudioAddress(draft.address);
    setStudioPrice(draft.asking_price ? String(draft.asking_price) : '');
    setStudioText(sourceText);
  };

  const buildCurrentStudioDraft = () => {
    if (!studioDraft) return null;
    const cleanAddress = sanitize(studioAddress, 100);
    const parsedPrice = parseRoomPrice(studioPrice);
    const asking_price = Number.isNaN(parsedPrice) ? null : parsedPrice;
    const priceTarget = asking_price ? formatDraftPrice(asking_price) : 'the asking price';
    const subject = cleanAddress || 'this property';
    return {
      ...studioDraft,
      address: cleanAddress,
      asking_price,
      market_question: `Will ${subject} appraise above ${priceTarget}?`,
    };
  };

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

  const handleGenerateDraft = async () => {
    if (!studioText.trim()) {
      setError('Paste a listing, address, or property notes first');
      return;
    }
    const draft = generateMarketDraft(studioText);
    applyStudioDraft(draft);
    setPropertyMatches([]);
    setMatchingProperties(true);
    setError('');
    try {
      const properties = await loadProperties();
      setPropertyMatches(matchDraftToProperties(draft, properties));
    } catch {
      setPropertyMatches([]);
    } finally {
      setMatchingProperties(false);
    }
  };

  const handleUsePropertyMatch = (match: MarketDraftPropertyMatch) => {
    const nextDraft = createDraftFromProperty(match.property, studioDraft?.source_text || studioText);
    applyStudioDraft(nextDraft);
    setPropertyMatches([match]);
    setError('');
  };

  const handleLoadSavedDraft = (saved: SavedMarketStudioDraft) => {
    applyStudioDraft(saved.draft);
    setPropertyMatches([]);
    setError('');
  };

  const handleDeleteSavedDraft = (id: string) => {
    setSavedDrafts(deleteMarketStudioDraft(id));
  };

  const handleSaveDraft = () => {
    const currentDraft = buildCurrentStudioDraft();
    if (!currentDraft) {
      setError('Generate a market draft before saving');
      return;
    }
    const validation = validateMarketDraft(currentDraft);
    if (!validation.valid) {
      setError(validation.issues.join(' '));
      return;
    }
    const saved = saveMarketStudioDraft(currentDraft);
    setSavedDrafts(saved);
    setStudioDraft(currentDraft);
    setError('');
    showToast('Market draft saved', 'success');
  };

  const handleStudioCreate = async () => {
    const cleanName = sanitize(name, 20);
    const currentDraft = buildCurrentStudioDraft();
    const validation = validateMarketDraft(currentDraft || { address: '', asking_price: null });
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
      await createRoomAndJoinHost(cleanName, currentDraft!.address, currentDraft!.asking_price!, currentDraft);
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

        {mode === 'pick' && <JoinModePicker onSelect={setMode} />}

        {mode === 'create' && (
          <CreateRoomForm
            name={name}
            address={address}
            askingPrice={askingPrice}
            errorId={createErrorId}
            errorMessage={createErrorMessage}
            submitting={submitting}
            identityLoading={identityLoading}
            isFieldInvalid={createFieldInvalid}
            onNameChange={setName}
            onAddressChange={setAddress}
            onAskingPriceChange={setAskingPrice}
            onSubmit={handleCreate}
            onBack={returnToPicker}
          />
        )}

        {mode === 'studio' && (
          <div style={styles.form}>
            <div style={styles.studioHeading}>
              <FileText size={19} color="var(--accent-primary)" aria-hidden="true" />
              <h2 style={styles.formTitle}>Market Studio</h2>
            </div>
            <MarketStudioSavedDrafts
              drafts={savedDrafts}
              onLoad={handleLoadSavedDraft}
              onDelete={handleDeleteSavedDraft}
            />
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

            {matchingProperties && (
              <p style={styles.matchingText}>Checking local property dataset...</p>
            )}

            <MarketStudioMatches
              matches={propertyMatches}
              onUseMatch={handleUsePropertyMatch}
            />

            {studioDraft && (
              <MarketStudioDraftCard
                draft={studioDraft}
                address={studioAddress}
                askingPrice={studioPrice}
                errorId={studioErrorId}
                errorMessage={studioErrorMessage}
                onAddressChange={setStudioAddress}
                onAskingPriceChange={setStudioPrice}
              />
            )}

            {studioErrorMessage && <p id={studioErrorId} style={styles.error} role="alert">{studioErrorMessage}</p>}
            {studioDraft && (
              <button
                type="button"
                style={styles.secondaryActionBtn}
                onClick={handleSaveDraft}
              >
                <Save size={16} aria-hidden="true" />
                Save Draft
              </button>
            )}
            <button
              style={{ ...styles.submitBtn, opacity: submitting || identityLoading || !studioDraft ? 0.6 : 1 }}
              onClick={handleStudioCreate}
              disabled={submitting || identityLoading || !studioDraft}
            >
              {submitting ? 'Creating...' : 'Create Room From Draft'}
            </button>
            <button style={styles.backBtn} onClick={returnToPicker}>
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <JoinRoomForm
            name={name}
            roomCode={roomCode}
            errorId={joinErrorId}
            errorMessage={joinErrorMessage}
            submitting={submitting}
            identityLoading={identityLoading}
            isFieldInvalid={joinFieldInvalid}
            formatRoomCodeInput={formatRoomCodeInput}
            onNameChange={setName}
            onRoomCodeChange={setRoomCode}
            onSubmit={handleJoin}
            onBack={returnToPicker}
          />
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
  matchingText: {
    margin: '-4px 0 0',
    color: 'var(--text-muted)',
    fontSize: 12,
    textAlign: 'center',
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
