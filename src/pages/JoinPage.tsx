import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { Home, Users, Plus, LogIn } from 'lucide-react';

export default function JoinPage() {
  const navigate = useNavigate();
  const { sessionId, nickname, saveNickname } = useSession();
  const [mode, setMode] = useState<'pick' | 'create' | 'join'>('pick');
  const [name, setName] = useState(nickname);
  const [address, setAddress] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !address.trim() || !askingPrice.trim()) {
      setError('All fields are required');
      return;
    }
    const price = parseFloat(askingPrice.replace(/,/g, ''));
    if (isNaN(price) || price <= 0) {
      setError('Enter a valid asking price');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim(), asking_price: price }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      saveNickname(name.trim());

      // Join the room as host
      await fetch(`/api/rooms/${data.room_code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, nickname: name.trim() }),
      });

      navigate(`/host/${data.room_code}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim() || !roomCode.trim()) {
      setError('Nickname and room code are required');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/rooms/${roomCode.trim().toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, nickname: name.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      saveNickname(name.trim());
      navigate(`/play/${roomCode.trim().toUpperCase()}`);
    } catch (err: any) {
      setError(err.message || 'Failed to join room');
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
              <label style={styles.label}>Your Nickname</label>
              <input
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Property Address</label>
              <input
                style={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="742 Evergreen Terrace"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Asking Price ($)</label>
              <input
                style={styles.input}
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="450,000"
                inputMode="numeric"
              />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button
              style={{ ...styles.submitBtn, opacity: submitting ? 0.6 : 1 }}
              onClick={handleCreate}
              disabled={submitting}
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
              <label style={styles.label}>Your Nickname</label>
              <input
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Room Code</label>
              <input
                style={{ ...styles.input, textAlign: 'center', fontSize: 24, letterSpacing: 8, textTransform: 'uppercase' }}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.slice(0, 4))}
                placeholder="ABCD"
                maxLength={4}
                inputMode="text"
              />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button
              style={{ ...styles.submitBtn, opacity: submitting ? 0.6 : 1 }}
              onClick={handleJoin}
              disabled={submitting}
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
        <button style={styles.footerLink} onClick={() => navigate('/markets')}>
          <Users size={14} /> Browse Markets
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
  },
  logo: {
    textAlign: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '8px 0 4px',
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
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontSize: 14,
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
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 15,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  error: {
    color: 'var(--accent-danger)',
    fontSize: 13,
    textAlign: 'center',
    margin: 0,
  },
  submitBtn: {
    padding: '14px 20px',
    background: 'var(--accent-primary)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
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
