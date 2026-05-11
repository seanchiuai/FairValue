import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useRoom } from '../hooks/useRoom';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import { buildHostAuthHeaders, readHostToken } from '../lib/fairValueAuth';
import CogneeChat from '../components/CogneeChat';
import ConnectionIndicator from '../components/ConnectionIndicator';
import Leaderboard from '../components/host/Leaderboard';
import ActivityFeed from '../components/host/ActivityFeed';
import SettleModal from '../components/host/SettleModal';
import QRCard from '../components/host/QRCard';
import SkeletonChart from '../components/skeletons/SkeletonChart';
import SkeletonLeaderboard from '../components/skeletons/SkeletonLeaderboard';
import ReconnectingOverlay from '../components/ReconnectingOverlay';
import TrustNotice from '../components/TrustNotice';
import { useToast } from '../contexts/ToastContext';
import { Users, Bot, Gavel, Trophy, ShieldAlert } from 'lucide-react';

const hostAuthorityNoticeId = 'host-authority-warning';

type ToggleAIResponse = {
  ai_enabled?: boolean;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export default function HostView() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { sessionId, userToken, identityReady } = useSession();
  const {
    market,
    players,
    house,
    activity,
    aiEnabled,
    hostUserId,
    setAiEnabled,
    settled,
    settleResult,
    connectionState,
    loading,
  } = useRoom(roomCode || '', sessionId, userToken);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [ngrokUrl, setNgrokUrl] = useState(
    () => sessionStorage.getItem('fv_ngrok_url') || ''
  );
  const hostToken = useMemo(
    () => readHostToken(roomCode),
    [roomCode]
  );
  const canUseHostIdentity = Boolean(identityReady && userToken && hostUserId === sessionId);
  const hostAuthHeaders = useMemo(
    () => buildHostAuthHeaders({ userToken: canUseHostIdentity ? userToken : '', hostToken }),
    [canUseHostIdentity, userToken, hostToken]
  );
  const hasHostAuthority = Boolean(canUseHostIdentity || hostToken);
  const wasConnectedRef = useRef(false);
  const settleButtonRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();
  if (connectionState === 'connected') wasConnectedRef.current = true;

  // Chart
  const { addPoint, loadHistory, setRef: chartRef } = useMarketChart({ height: 300 });
  const historyLoadedRef = useRef(false);

  useEffect(() => {
    if (!roomCode || !house) return;
    fetch(`/api/markets/by-property/room-${roomCode}/chart`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ prob: number; time: string }>) => {
        if (data.length > 0) {
          const points = data.map((d) => ({
            probOver: d.prob,
            fairValue: calculateImpliedPrice(d.prob, house.asking_price),
          }));
          loadHistory(points);
        }
        historyLoadedRef.current = true;
      })
      .catch(() => {
        console.warn('Chart history unavailable');
        historyLoadedRef.current = true;
      });
  }, [roomCode, house, loadHistory]);

  useEffect(() => {
    if (!market || !house) return;
    if (!historyLoadedRef.current) return;
    addPoint({
      probOver: market.prob_over,
      fairValue: calculateImpliedPrice(market.prob_over, house.asking_price),
    });
  }, [market, house, addPoint]);

  const handleToggleAI = useCallback(async () => {
    if (!roomCode) return;
    if (!hasHostAuthority) {
      showToast('Host authority is missing for this room.', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${roomCode}/toggle-ai`, {
        method: 'POST',
        headers: hostAuthHeaders,
      });
      const data = await readJson<ToggleAIResponse>(res);
      if (!res.ok || data.error) {
        showToast(data.error || 'Unable to toggle AI bot', 'error');
        return;
      }
      if (typeof data.ai_enabled !== 'boolean') {
        showToast('AI toggle response was invalid', 'error');
        return;
      }
      setAiEnabled(data.ai_enabled);
      showToast(`AI bot ${data.ai_enabled ? 'enabled' : 'disabled'}.`, 'success');
    } catch {
      showToast('Unable to toggle AI bot', 'error');
    }
  }, [roomCode, hasHostAuthority, hostAuthHeaders, setAiEnabled, showToast]);

  const handleNgrokChange = useCallback((url: string) => {
    setNgrokUrl(url);
    sessionStorage.setItem('fv_ngrok_url', url);
  }, []);

  const closeSettleModal = useCallback(() => {
    setShowSettleModal(false);
    window.requestAnimationFrame(() => settleButtonRef.current?.focus());
  }, []);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => b.balance - a.balance),
    [players]
  );

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.topBar}>
          <span style={s.roomCodeBig}>{roomCode}</span>
        </div>
        <div style={s.layout}>
          <div style={s.leftCol}>
            <SkeletonChart />
          </div>
          <div style={s.rightCol}>
            <SkeletonLeaderboard />
          </div>
        </div>
      </div>
    );
  }

  if (!house || !market) {
    return (
      <div style={s.page}>
        <div style={s.loadingText}>Room not found</div>
      </div>
    );
  }

  const probPercent = Math.round(market.prob_over * 100);
  const trimmedNgrok = ngrokUrl.trim().replace(/\/$/, '');
  const baseUrl = trimmedNgrok && trimmedNgrok.startsWith('https://') ? trimmedNgrok : window.location.origin;
  const joinUrl = `${baseUrl}/play/${roomCode}`;

  return (
    <div style={s.page}>
      {/* Top Bar */}
      <div style={s.topBar}>
        <div style={s.topBarLeft}>
          <span style={s.roomCodeBig}>{roomCode}</span>
          <span style={s.playerCount} data-testid="host-player-count">
            <Users size={14} /> {players.length} player{players.length !== 1 ? 's' : ''}
          </span>
          <ConnectionIndicator state={connectionState} />
        </div>
        <div style={s.topBarRight}>
          {!settled && (
            <>
              <button
                style={{
                  ...s.controlBtn,
                  background: aiEnabled ? 'var(--accent-primary)' : 'var(--bg-input)',
                  color: aiEnabled ? '#fff' : 'var(--text-secondary)',
                  opacity: hasHostAuthority ? 1 : 0.45,
                }}
                onClick={handleToggleAI}
                aria-label={`AI bot ${aiEnabled ? 'enabled' : 'disabled'}`}
                aria-pressed={aiEnabled}
                aria-describedby={!hasHostAuthority ? hostAuthorityNoticeId : undefined}
                disabled={!hasHostAuthority}
                title={hasHostAuthority ? undefined : 'Host authority missing for this room'}
              >
                <Bot size={14} /> AI {aiEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                ref={settleButtonRef}
                style={{
                  ...s.controlBtn,
                  background: 'var(--accent-warning)',
                  color: '#fff',
                  opacity: hasHostAuthority ? 1 : 0.45,
                }}
                onClick={() => setShowSettleModal(true)}
                aria-describedby={!hasHostAuthority ? hostAuthorityNoticeId : undefined}
                disabled={!hasHostAuthority}
                title={hasHostAuthority ? undefined : 'Host authority missing for this room'}
              >
                <Gavel size={14} /> Settle
              </button>
            </>
          )}
        </div>
      </div>

      {!settled && !hasHostAuthority && (
        <div
          id={hostAuthorityNoticeId}
          style={s.hostAuthorityNotice}
          role="status"
          aria-live="polite"
          data-testid="host-authority-warning"
        >
          <ShieldAlert size={16} color="#8A4E00" aria-hidden="true" />
          <div>
            <div style={s.hostAuthorityTitle}>Host controls unavailable</div>
            <div style={s.hostAuthorityText}>
              Open the original host browser session for this room. AI and settlement controls require host authority.
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div style={s.layout}>
        <div style={s.leftCol}>
          {/* Property */}
          <div style={s.propertyCard}>
            <div style={s.propertyTop}>
              <div>
                <div style={s.propAddress}>{house.address}</div>
                <div style={s.propPrice}>
                  Asking: <strong>${house.asking_price.toLocaleString()}</strong>
                </div>
              </div>
              <div style={s.probBig}>
                <span style={{ color: probPercent >= 50 ? 'var(--accent-success)' : 'var(--accent-danger)', fontSize: 32, fontWeight: 800 }}>
                  {probPercent}%
                </span>
                <span style={s.probLabel}>think OVER</span>
              </div>
            </div>
          </div>

          <TrustNotice
            testId="host-room-trust-notice"
            title="Room trust note"
            tone="dark"
          />

          {/* Settle Result */}
          {settled && settleResult && (
            <div style={s.settleResultCard} data-testid="host-settlement-result">
              <Trophy size={28} color="var(--accent-warning)" />
              <div style={{ fontSize: 20, fontWeight: 700 }}>Market Settled</div>
              <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
                Actual: ${settleResult.actual_price.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: settleResult.winning_outcome === 'over' ? 'var(--accent-success)' : 'var(--accent-danger)',
                }}
              >
                {settleResult.winning_outcome.toUpperCase()} WINS
              </div>
              <TrustNotice
                testId="host-settlement-trust-notice"
                title="Settlement evidence"
                compact
                tone="dark"
                points={[
                  'This recap uses simulation credits only.',
                  'The actual price is host-entered settlement evidence, not a FairValue appraisal.',
                  'Room events preserve joins, bets, and settlement for replay.',
                ]}
              />
            </div>
          )}

          {/* Chart */}
          <div style={s.chartCard}>
            <div style={s.chartHeader}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Market Probability</span>
              <div style={s.legend}>
                <span style={s.legendDot} /> OVER probability
                <span style={{ ...s.legendDot, background: '#3BA776', marginLeft: 12 }} /> Fair value ($)
              </div>
            </div>
            <div ref={chartRef} style={{ width: '100%', height: 300 }} />
            <div style={s.statsRow}>
              <div style={s.statBox}>
                <span style={s.statLabel}>Total Trades</span>
                <span style={s.statValue} data-testid="total-trades">{market.total_trades}</span>
              </div>
              <div style={s.statBox}>
                <span style={s.statLabel}>Volume</span>
                <span style={s.statValue} data-testid="total-volume">${market.total_wagered.toFixed(0)}</span>
              </div>
              <div style={s.statBox}>
                <span style={s.statLabel}>Avg Bet</span>
                <span style={s.statValue} data-testid="avg-bet">${market.avg_bet_size.toFixed(0)}</span>
              </div>
            </div>
          </div>

          <CogneeChat
            propertyId={roomCode || ''}
            askingPrice={house.asking_price}
            market={market}
            activity={activity}
            players={players}
          />
        </div>

        <div style={s.rightCol}>
          <QRCard joinUrl={joinUrl} ngrokUrl={ngrokUrl} onNgrokChange={handleNgrokChange} />
          <Leaderboard players={sortedPlayers} />
          <ActivityFeed activity={activity} />
        </div>
      </div>

      <ReconnectingOverlay state={connectionState} wasConnected={wasConnectedRef.current} />

      {showSettleModal && (
        <SettleModal
          house={house}
          roomCode={roomCode || ''}
          hostToken={hostToken}
          userToken={canUseHostIdentity ? userToken : ''}
          onClose={closeSettleModal}
        />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  loadingText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: 'var(--text-muted)',
    fontSize: 18,
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 24px',
    background: 'var(--bg-nav)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  roomCodeBig: {
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--accent-primary)',
    letterSpacing: 4,
  },
  playerCount: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  topBarRight: {
    display: 'flex',
    gap: 8,
  },
  hostAuthorityNotice: {
    width: 'calc(100% - 48px)',
    maxWidth: 1392,
    boxSizing: 'border-box',
    margin: '12px auto 0',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    background: '#FFF7E8',
    border: '1px solid #C37B13',
    borderRadius: 8,
    color: 'var(--text-primary)',
  },
  hostAuthorityTitle: {
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 2,
  },
  hostAuthorityText: {
    fontSize: 12,
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 360px',
    gap: 16,
    padding: '16px 24px',
    maxWidth: 1440,
    margin: '0 auto',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  propertyCard: {
    padding: 20,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  propertyTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  propAddress: {
    fontSize: 20,
    fontWeight: 700,
  },
  propPrice: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    marginTop: 4,
  },
  probBig: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  probLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  settleResultCard: {
    padding: 24,
    background: 'var(--bg-surface)',
    border: '2px solid var(--accent-warning)',
    borderRadius: 12,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  chartCard: {
    padding: 20,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4BA3FF',
    display: 'inline-block',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginTop: 16,
  },
  statBox: {
    padding: 12,
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 700,
  },
};
