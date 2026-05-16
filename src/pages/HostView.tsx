import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useRoom } from '../hooks/useRoom';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import { generateRoomMarketIntelligence } from '../lib/marketIntelligence';
import { buildHostAuthHeaders, readHostToken } from '../lib/fairValueAuth';
import CogneeChat from '../components/CogneeChat';
import ConnectionIndicator from '../components/ConnectionIndicator';
import Leaderboard from '../components/host/Leaderboard';
import ActivityFeed from '../components/host/ActivityFeed';
import SettleModal from '../components/host/SettleModal';
import QRCard from '../components/host/QRCard';
import HostRoomIntelligencePanel from '../components/host/HostRoomIntelligencePanel';
import HostDraftAuditCard from '../components/host/HostDraftAuditCard';
import HostTopBar from '../components/host/HostTopBar';
import HostAuthorityNotice from '../components/host/HostAuthorityNotice';
import HostPropertySummary from '../components/host/HostPropertySummary';
import SkeletonChart from '../components/skeletons/SkeletonChart';
import SkeletonLeaderboard from '../components/skeletons/SkeletonLeaderboard';
import ReconnectingOverlay from '../components/ReconnectingOverlay';
import TrustNotice from '../components/TrustNotice';
import RoomLoadError from '../components/RoomLoadError';
import { useToast } from '../contexts/ToastContext';
import { Trophy } from 'lucide-react';
import './HostView.css';

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
    draftAudit,
    activity,
    aiEnabled,
    hostUserId,
    setAiEnabled,
    settled,
    settleResult,
    connectionState,
    loading,
    loadError,
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
  const roomIntelligence = useMemo(
    () => house && market
      ? generateRoomMarketIntelligence({ house, market, players, activity, draftAudit })
      : null,
    [house, market, players, activity, draftAudit]
  );

  if (loading) {
    return (
      <div className="host-view">
        <HostTopBar
          roomCode={roomCode}
          playerCount={0}
          connectionState={connectionState}
          aiEnabled={aiEnabled}
          settled={settled}
          hasHostAuthority={hasHostAuthority}
          hostAuthorityNoticeId={hostAuthorityNoticeId}
          settleButtonRef={settleButtonRef}
          onToggleAI={handleToggleAI}
          onOpenSettle={() => setShowSettleModal(true)}
          showStatus={false}
          showActions={false}
        />
        <div className="host-view__layout">
          <div className="host-view__left">
            <SkeletonChart />
          </div>
          <div className="host-view__right">
            <SkeletonLeaderboard />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !house || !market) {
    return <RoomLoadError roomCode={roomCode} message={loadError || 'Room not found'} />;
  }

  const trimmedNgrok = ngrokUrl.trim().replace(/\/$/, '');
  const baseUrl = trimmedNgrok && trimmedNgrok.startsWith('https://') ? trimmedNgrok : window.location.origin;
  const joinUrl = `${baseUrl}/play/${roomCode}`;

  return (
    <div className="host-view">
      <HostTopBar
        roomCode={roomCode}
        playerCount={players.length}
        connectionState={connectionState}
        aiEnabled={aiEnabled}
        settled={settled}
        hasHostAuthority={hasHostAuthority}
        hostAuthorityNoticeId={hostAuthorityNoticeId}
        settleButtonRef={settleButtonRef}
        onToggleAI={handleToggleAI}
        onOpenSettle={() => setShowSettleModal(true)}
      />

      {!settled && !hasHostAuthority && (
        <HostAuthorityNotice id={hostAuthorityNoticeId} />
      )}

      {/* Main Layout */}
      <div className="host-view__layout">
        <div className="host-view__left">
          <HostPropertySummary house={house} probOver={market.prob_over} />

          {draftAudit && <HostDraftAuditCard draftAudit={draftAudit} />}

          {!showSettleModal && roomIntelligence && (
            <HostRoomIntelligencePanel intelligence={roomIntelligence} />
          )}

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

        <div className="host-view__right">
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
