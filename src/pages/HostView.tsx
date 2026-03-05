import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useRoom } from '../hooks/useRoom';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import CogneeChat from '../components/CogneeChat';
import ConnectionIndicator from '../components/ConnectionIndicator';
import Leaderboard from '../components/host/Leaderboard';
import ActivityFeed from '../components/host/ActivityFeed';
import SettleModal from '../components/host/SettleModal';
import QRCard from '../components/host/QRCard';
import SkeletonChart from '../components/skeletons/SkeletonChart';
import SkeletonLeaderboard from '../components/skeletons/SkeletonLeaderboard';
import ReconnectingOverlay from '../components/ReconnectingOverlay';
import { Users, Bot, Gavel, Trophy } from 'lucide-react';

export default function HostView() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { sessionId } = useSession();
  const {
    market,
    players,
    house,
    activity,
    aiEnabled,
    setAiEnabled,
    settled,
    settleResult,
    connectionState,
    loading,
  } = useRoom(roomCode || '', sessionId);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [ngrokUrl, setNgrokUrl] = useState(
    () => sessionStorage.getItem('fv_ngrok_url') || ''
  );
  const wasConnectedRef = useRef(false);
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
    try {
      const res = await fetch(`/api/rooms/${roomCode}/toggle-ai`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        console.error('Toggle AI failed:', data.error);
        return;
      }
      setAiEnabled(data.ai_enabled);
    } catch (err) {
      console.error('Toggle AI failed:', err);
    }
  }, [roomCode, setAiEnabled]);

  const handleNgrokChange = useCallback((url: string) => {
    setNgrokUrl(url);
    sessionStorage.setItem('fv_ngrok_url', url);
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
          <span style={s.playerCount}>
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
                }}
                onClick={handleToggleAI}
                aria-label={`AI bot ${aiEnabled ? 'enabled' : 'disabled'}`}
                aria-pressed={aiEnabled}
              >
                <Bot size={14} /> AI {aiEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                style={{ ...s.controlBtn, background: 'var(--accent-warning)', color: '#000' }}
                onClick={() => setShowSettleModal(true)}
              >
                <Gavel size={14} /> Settle
              </button>
            </>
          )}
        </div>
      </div>

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

          {/* Settle Result */}
          {settled && settleResult && (
            <div style={s.settleResultCard}>
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
                <span style={s.statValue}>{market.total_trades}</span>
              </div>
              <div style={s.statBox}>
                <span style={s.statLabel}>Volume</span>
                <span style={s.statValue}>${market.total_wagered.toFixed(0)}</span>
              </div>
              <div style={s.statBox}>
                <span style={s.statLabel}>Avg Bet</span>
                <span style={s.statValue}>${market.avg_bet_size.toFixed(0)}</span>
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
          onClose={() => setShowSettleModal(false)}
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
