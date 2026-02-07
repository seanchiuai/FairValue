import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useRoom } from '../hooks/useRoom';
import { QRCodeSVG } from 'qrcode.react';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import {
  Wifi,
  WifiOff,
  Users,
  Bot,
  Gavel,
  Trophy,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from 'lucide-react';

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
    connected,
    loading,
  } = useRoom(roomCode || '', sessionId);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [actualPrice, setActualPrice] = useState('');
  const [settling, setSettling] = useState(false);
  const [ngrokUrl, setNgrokUrl] = useState(
    () => sessionStorage.getItem('fv_ngrok_url') || ''
  );

  // Chart
  const { addPoint, loadHistory, setRef: chartRef } = useMarketChart({ height: 300 });
  const historyLoadedRef = useRef(false);

  // Fetch chart history on mount
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
        historyLoadedRef.current = true;
      });
  }, [roomCode, house, loadHistory]);

  // Push a chart point whenever market or house state changes
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

  const handleSettle = useCallback(async () => {
    if (!roomCode || !actualPrice) return;
    const price = parseFloat(actualPrice.replace(/,/g, ''));
    if (isNaN(price) || price <= 0) return;
    setSettling(true);
    await fetch(`/api/rooms/${roomCode}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_price: price }),
    });
    setSettling(false);
    setShowSettleModal(false);
  }, [roomCode, actualPrice]);

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.loadingText}>Loading room...</div>
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
  const baseUrl = ngrokUrl.trim() ? ngrokUrl.trim().replace(/\/$/, '') : window.location.origin;
  const joinUrl = `${baseUrl}/play/${roomCode}`;
  const sortedPlayers = [...players].sort((a, b) => b.balance - a.balance);

  return (
    <div style={s.page}>
      {/* Top Bar */}
      <div style={s.topBar}>
        <div style={s.topBarLeft}>
          <span style={s.roomCodeBig}>{roomCode}</span>
          <span style={s.playerCount}>
            <Users size={14} /> {players.length} player{players.length !== 1 ? 's' : ''}
          </span>
          {connected ? (
            <Wifi size={14} color="var(--accent-success)" />
          ) : (
            <WifiOff size={14} color="var(--accent-danger)" />
          )}
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
        {/* Left Column: Property + Chart + Stats */}
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
                <span style={{ color: probPercent >= 50 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
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
              <div style={s.settleResultTitle}>Market Settled</div>
              <div style={s.settleResultPrice}>
                Actual: ${settleResult.actual_price.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color:
                    settleResult.winning_outcome === 'over'
                      ? 'var(--accent-success)'
                      : 'var(--accent-danger)',
                }}
              >
                {settleResult.winning_outcome.toUpperCase()} WINS
              </div>
            </div>
          )}

          {/* Chart */}
          <div style={s.chartCard}>
            <div style={s.chartHeader}>
              <span style={s.chartTitle}>Market Probability</span>
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
        </div>

        {/* Right Column: QR + Leaderboard + Activity */}
        <div style={s.rightCol}>
          {/* QR Code */}
          <div style={s.qrCard}>
            <div style={s.qrTitle}>Scan to Join</div>
            <div style={s.qrWrapper}>
              <QRCodeSVG value={joinUrl} size={160} bgColor="#FFFFFF" fgColor="#000000" style={{ borderRadius: 8, padding: 8 }} />
            </div>
            <div style={s.qrUrl}>{joinUrl}</div>
            <div style={s.ngrokField}>
              <label style={s.ngrokLabel}>Ngrok / Public URL</label>
              <input
                style={s.ngrokInput}
                value={ngrokUrl}
                onChange={(e) => {
                  setNgrokUrl(e.target.value);
                  sessionStorage.setItem('fv_ngrok_url', e.target.value);
                }}
                placeholder="https://abcd-1234.ngrok-free.app"
              />
            </div>
          </div>

          {/* Leaderboard */}
          <div style={s.leaderCard}>
            <div style={s.sectionTitle}>
              <Trophy size={14} color="var(--accent-warning)" /> Leaderboard
            </div>
            {sortedPlayers.length === 0 && (
              <div style={s.emptyText}>Waiting for players...</div>
            )}
            {sortedPlayers.map((p, i) => (
              <div key={p.session_id} style={s.leaderRow}>
                <span style={s.leaderRank}>#{i + 1}</span>
                <span style={s.leaderName}>{p.nickname}</span>
                <span style={s.leaderBalance}>
                  <DollarSign size={12} />{p.balance.toFixed(0)}
                </span>
              </div>
            ))}
          </div>

          {/* Activity Feed */}
          <div style={s.activityCard}>
            <div style={s.sectionTitle}>Activity</div>
            <div style={s.activityList}>
              {activity.length === 0 && (
                <div style={s.emptyText}>No activity yet</div>
              )}
              {[...activity].reverse().slice(0, 30).map((a, i) => (
                <div key={i} style={s.activityItem}>
                  {a.type === 'bet' && (
                    <>
                      {a.outcome === 'over' ? (
                        <TrendingUp size={12} color="var(--accent-success)" />
                      ) : (
                        <TrendingDown size={12} color="var(--accent-danger)" />
                      )}
                      <span>
                        <strong>{a.nickname}</strong> bet ${a.wager?.toFixed(0)} on{' '}
                        <span
                          style={{
                            color:
                              a.outcome === 'over'
                                ? 'var(--accent-success)'
                                : 'var(--accent-danger)',
                            fontWeight: 700,
                          }}
                        >
                          {a.outcome?.toUpperCase()}
                        </span>
                      </span>
                    </>
                  )}
                  {a.type === 'ai_trade' && (
                    <>
                      <Bot size={12} color="var(--accent-primary)" />
                      <span>
                        AI bet ${a.wager?.toFixed(0)} on{' '}
                        <span
                          style={{
                            color:
                              a.outcome === 'over'
                                ? 'var(--accent-success)'
                                : 'var(--accent-danger)',
                            fontWeight: 700,
                          }}
                        >
                          {a.outcome?.toUpperCase()}
                        </span>
                      </span>
                    </>
                  )}
                  {a.type === 'join' && (
                    <>
                      <Users size={12} color="var(--text-muted)" />
                      <span><strong>{a.nickname}</strong> joined</span>
                    </>
                  )}
                  {a.type === 'settle' && (
                    <>
                      <Gavel size={12} color="var(--accent-warning)" />
                      <span>
                        Market settled — <strong>{a.winning_outcome?.toUpperCase()}</strong> wins
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Settle Modal */}
      {showSettleModal && (
        <div style={s.modalOverlay} onClick={() => setShowSettleModal(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Settle Market</h3>
            <p style={s.modalDesc}>
              Enter the actual appraisal/sale price to determine the winner.
            </p>
            <div style={s.modalField}>
              <label style={s.modalLabel}>Actual Price ($)</label>
              <input
                style={s.modalInput}
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
                placeholder="450,000"
                inputMode="numeric"
                autoFocus
              />
            </div>
            <p style={s.modalHint}>
              Asking: ${house.asking_price.toLocaleString()} —{' '}
              {actualPrice && !isNaN(parseFloat(actualPrice.replace(/,/g, '')))
                ? parseFloat(actualPrice.replace(/,/g, '')) >= house.asking_price
                  ? 'OVER wins'
                  : 'UNDER wins'
                : 'enter a price'}
            </p>
            <div style={s.modalButtons}>
              <button style={s.modalCancel} onClick={() => setShowSettleModal(false)}>
                Cancel
              </button>
              <button
                style={{ ...s.modalConfirm, opacity: settling ? 0.6 : 1 }}
                onClick={handleSettle}
                disabled={settling}
              >
                {settling ? 'Settling...' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
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
  chartTitle: {
    fontSize: 15,
    fontWeight: 600,
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
  qrCard: {
    padding: 20,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    textAlign: 'center',
  },
  qrTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qrWrapper: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 10,
  },
  qrUrl: {
    fontSize: 11,
    color: 'var(--text-muted)',
    wordBreak: 'break-all',
  },
  ngrokField: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  ngrokLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ngrokInput: {
    padding: '8px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  leaderCard: {
    padding: 16,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--text-muted)',
    padding: '8px 0',
  },
  leaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 14,
  },
  leaderRank: {
    fontWeight: 700,
    color: 'var(--text-muted)',
    minWidth: 24,
    fontSize: 12,
  },
  leaderName: {
    flex: 1,
    fontWeight: 600,
  },
  leaderBalance: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    fontWeight: 700,
    color: 'var(--accent-warning)',
  },
  activityCard: {
    padding: 16,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    flex: 1,
    overflow: 'hidden',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 400,
    overflowY: 'auto',
  },
  activityItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--text-secondary)',
    padding: '6px 0',
    borderBottom: '1px solid var(--border-subtle)',
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
  settleResultTitle: {
    fontSize: 20,
    fontWeight: 700,
  },
  settleResultPrice: {
    fontSize: 16,
    color: 'var(--text-secondary)',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
    padding: 24,
    width: 380,
    maxWidth: '90vw',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  modalDesc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    margin: '0 0 16px',
  },
  modalField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInput: {
    padding: '12px 14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 18,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  modalHint: {
    fontSize: 13,
    color: 'var(--text-muted)',
    margin: '0 0 16px',
  },
  modalButtons: {
    display: 'flex',
    gap: 8,
  },
  modalCancel: {
    flex: 1,
    padding: '10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
  },
  modalConfirm: {
    flex: 1,
    padding: '10px',
    background: 'var(--accent-warning)',
    border: 'none',
    borderRadius: 8,
    color: '#000',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
