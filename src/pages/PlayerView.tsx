import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useRoom } from '../hooks/useRoom';
import { createChart, IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts';
import { Wifi, WifiOff, TrendingUp, TrendingDown, DollarSign, Trophy } from 'lucide-react';

export default function PlayerView() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { sessionId, nickname: savedNickname, saveNickname } = useSession();
  const {
    market,
    myPlayer,
    house,
    settled,
    settleResult,
    connected,
    loading,
    placeBet,
    joinRoom,
  } = useRoom(roomCode || '', sessionId);

  const [wager, setWager] = useState<number>(25);
  const [betting, setBetting] = useState(false);
  const [betError, setBetError] = useState('');
  const [joinName, setJoinName] = useState(savedNickname);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const dataPointsRef = useRef<LineData[]>([]);
  const timeCounterRef = useRef(0);

  // Create chart once player has joined
  useEffect(() => {
    if (!myPlayer || !chartContainerRef.current) return;
    if (chartRef.current) return; // already created

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#A9B7C8',
      },
      grid: {
        vertLines: { color: 'rgba(58, 74, 93, 0.3)' },
        horzLines: { color: 'rgba(58, 74, 93, 0.3)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 160,
      rightPriceScale: {
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addLineSeries({
      color: '#4BA3FF',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${Math.round(price)}%`,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Seed with initial point
    if (market) {
      timeCounterRef.current += 1;
      const point: LineData = { time: timeCounterRef.current as Time, value: market.prob_over * 100 };
      dataPointsRef.current.push(point);
      series.setData(dataPointsRef.current);
    }

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [myPlayer, market]);

  // Update chart when market changes (bets from any player via WebSocket)
  const prevMarketRef = useRef<typeof market>(null);
  useEffect(() => {
    if (!market || !seriesRef.current) return;
    if (prevMarketRef.current === null) {
      prevMarketRef.current = market;
      return;
    }
    if (prevMarketRef.current === market) return;
    prevMarketRef.current = market;

    timeCounterRef.current += 1;
    const point: LineData = { time: timeCounterRef.current as Time, value: market.prob_over * 100 };
    dataPointsRef.current.push(point);
    seriesRef.current.setData(dataPointsRef.current);
  }, [market]);

  // Periodic tick to keep the chart line extending
  useEffect(() => {
    if (!market || !myPlayer) return;
    const interval = setInterval(() => {
      if (!seriesRef.current || !market) return;
      timeCounterRef.current += 1;
      const point: LineData = { time: timeCounterRef.current as Time, value: market.prob_over * 100 };
      dataPointsRef.current.push(point);
      seriesRef.current.setData(dataPointsRef.current);
    }, 2000);
    return () => clearInterval(interval);
  }, [market, myPlayer]);

  const handleBet = async (outcome: 'over' | 'under') => {
    if (betting || !wager || wager <= 0) return;
    setBetting(true);
    setBetError('');
    try {
      await placeBet(outcome, wager);
    } catch (err: any) {
      setBetError(err.message);
    } finally {
      setBetting(false);
    }
  };

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.loading}>Connecting to room...</div>
      </div>
    );
  }

  if (!house || !market) {
    return (
      <div style={s.page}>
        <div style={s.loading}>Room not found</div>
      </div>
    );
  }

  // Player hasn't joined yet — show nickname form
  if (!myPlayer) {
    const handleJoin = async () => {
      if (!joinName.trim()) {
        setJoinError('Enter your name');
        return;
      }
      setJoining(true);
      setJoinError('');
      try {
        await joinRoom(joinName.trim());
        saveNickname(joinName.trim());
      } catch (err: any) {
        setJoinError(err.message || 'Failed to join');
      } finally {
        setJoining(false);
      }
    };

    return (
      <div style={s.page}>
        <div style={s.joinContainer}>
          <div style={s.joinTitle}>Join Game</div>
          <div style={s.joinRoomCode}>{roomCode}</div>
          {house && (
            <div style={s.joinProperty}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{house.address}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Asking: ${house.asking_price.toLocaleString()}
              </div>
            </div>
          )}
          <div style={s.joinField}>
            <label style={s.joinLabel}>Your Name</label>
            <input
              style={s.joinInput}
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>
          {joinError && <div style={s.joinError}>{joinError}</div>}
          <button
            style={{ ...s.joinBtn, opacity: joining ? 0.6 : 1 }}
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </div>
    );
  }

  const probPercent = Math.round(market.prob_over * 100);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.roomBadge}>{roomCode}</span>
          {connected ? (
            <Wifi size={14} color="var(--accent-success)" />
          ) : (
            <WifiOff size={14} color="var(--accent-danger)" />
          )}
        </div>
        <div style={s.balanceBox}>
          <DollarSign size={14} color="var(--accent-warning)" />
          <span style={s.balanceValue}>
            {myPlayer ? myPlayer.balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '1,000'}
          </span>
        </div>
      </div>

      {/* Property Info */}
      <div style={s.propertyCard}>
        <div style={s.propertyAddress}>{house.address}</div>
        <div style={s.propertyPrice}>
          Asking: ${house.asking_price.toLocaleString()}
        </div>
      </div>

      {/* Settle Result */}
      {settled && settleResult && (
        <div style={s.settleCard}>
          <Trophy size={24} color="var(--accent-warning)" />
          <div style={s.settleTitle}>Market Settled</div>
          <div style={s.settleDetail}>
            Actual price: ${settleResult.actual_price.toLocaleString()}
          </div>
          <div
            style={{
              ...s.settleOutcome,
              color:
                settleResult.winning_outcome === 'over'
                  ? 'var(--accent-success)'
                  : 'var(--accent-danger)',
            }}
          >
            {settleResult.winning_outcome.toUpperCase()} wins!
          </div>
          {settleResult.results.map((r) => (
            <div key={r.nickname} style={s.resultRow}>
              <span>{r.nickname}</span>
              <span style={{ color: r.payout > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                {r.payout > 0 ? `+$${r.payout.toFixed(0)}` : '$0'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Market State */}
      {!settled && (
        <>
          <div style={s.probContainer}>
            <div style={s.probBar}>
              <div
                style={{
                  ...s.probFill,
                  width: `${probPercent}%`,
                  background:
                    probPercent >= 50
                      ? 'var(--accent-success)'
                      : 'var(--accent-danger)',
                }}
              />
            </div>
            <div style={s.probLabels}>
              <span style={{ color: 'var(--accent-success)', fontWeight: 700, fontSize: 18 }}>
                {probPercent}% OVER
              </span>
              <span style={{ color: 'var(--accent-danger)', fontWeight: 700, fontSize: 18 }}>
                {100 - probPercent}% UNDER
              </span>
            </div>
          </div>

          {/* Live probability chart */}
          <div style={s.chartCard}>
            <div style={s.chartHeader}>
              <span style={s.chartLabel}>Live Market</span>
              <span style={s.chartLegend}><span style={s.chartDot} /> OVER %</span>
            </div>
            <div ref={chartContainerRef} style={{ width: '100%', height: 160 }} />
          </div>

          {/* Positions */}
          {myPlayer && myPlayer.bets.length > 0 && (
            <div style={s.positionsCard}>
              <div style={s.positionsTitle}>My Positions</div>
              {myPlayer.bets.map((bet, i) => (
                <div key={i} style={s.positionRow}>
                  <span
                    style={{
                      ...s.positionOutcome,
                      color:
                        bet.outcome === 'over'
                          ? 'var(--accent-success)'
                          : 'var(--accent-danger)',
                    }}
                  >
                    {bet.outcome.toUpperCase()}
                  </span>
                  <span style={s.positionWager}>${bet.wager.toFixed(0)}</span>
                  <span style={s.positionProb}>@ {Math.round(bet.prob_at_entry * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Bet Panel (sticky bottom) */}
      {!settled && (
        <div style={s.betPanel}>
          {betError && <div style={s.betError}>{betError}</div>}
          <div style={s.presets}>
            {[10, 25, 50, 100].map((amount) => (
              <button
                key={amount}
                style={{
                  ...s.presetBtn,
                  background:
                    wager === amount
                      ? 'var(--accent-primary)'
                      : 'var(--bg-input)',
                  color: wager === amount ? '#fff' : 'var(--text-secondary)',
                }}
                onClick={() => setWager(amount)}
              >
                ${amount}
              </button>
            ))}
            <input
              style={s.customInput}
              type="number"
              value={wager || ''}
              onChange={(e) => setWager(Number(e.target.value))}
              placeholder="$"
              inputMode="numeric"
            />
          </div>
          <div style={s.betButtons}>
            <button
              style={{ ...s.betBtn, ...s.overBtn, opacity: betting ? 0.6 : 1 }}
              onClick={() => handleBet('over')}
              disabled={betting}
            >
              <TrendingUp size={20} />
              OVER
            </button>
            <button
              style={{ ...s.betBtn, ...s.underBtn, opacity: betting ? 0.6 : 1 }}
              onClick={() => handleBet('under')}
              disabled={betting}
            >
              <TrendingDown size={20} />
              UNDER
            </button>
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
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 180,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: 'var(--text-muted)',
    fontSize: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--bg-nav)',
    borderBottom: '1px solid var(--border-subtle)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  roomBadge: {
    padding: '4px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--accent-primary)',
    letterSpacing: 2,
  },
  balanceBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  propertyCard: {
    margin: '12px 16px',
    padding: '14px 16px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  propertyAddress: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  propertyPrice: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  probContainer: {
    margin: '0 16px 12px',
  },
  probBar: {
    height: 8,
    background: 'var(--bg-input)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  probFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  probLabels: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  chartCard: {
    margin: '0 16px 12px',
    padding: '12px 14px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  chartLegend: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  chartDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#4BA3FF',
    display: 'inline-block',
  },
  positionsCard: {
    margin: '0 16px 12px',
    padding: 14,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  positionsTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  positionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 14,
  },
  positionOutcome: {
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 0.5,
    minWidth: 50,
  },
  positionWager: {
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  positionProb: {
    color: 'var(--text-muted)',
    fontSize: 12,
    marginLeft: 'auto',
  },
  betPanel: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'var(--bg-nav)',
    borderTop: '1px solid var(--border-subtle)',
    padding: '12px 16px',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    zIndex: 200,
  },
  betError: {
    color: 'var(--accent-danger)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  presets: {
    display: 'flex',
    gap: 8,
    marginBottom: 10,
  },
  presetBtn: {
    flex: 1,
    padding: '10px 0',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 48,
    touchAction: 'manipulation',
  },
  customInput: {
    width: 64,
    padding: '10px 8px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    textAlign: 'center',
    outline: 'none',
    minHeight: 48,
    touchAction: 'manipulation',
  },
  betButtons: {
    display: 'flex',
    gap: 10,
  },
  betBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 0',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    minHeight: 52,
    touchAction: 'manipulation',
    color: '#fff',
  },
  overBtn: {
    background: 'var(--accent-success)',
  },
  underBtn: {
    background: 'var(--accent-danger)',
  },
  settleCard: {
    margin: '12px 16px',
    padding: 20,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  settleTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  settleDetail: {
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  settleOutcome: {
    fontSize: 22,
    fontWeight: 800,
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: '6px 0',
    borderTop: '1px solid var(--border-subtle)',
    fontSize: 14,
    color: 'var(--text-primary)',
  },
  joinContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
    gap: 16,
  },
  joinTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  joinRoomCode: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 6,
    color: 'var(--accent-primary)',
  },
  joinProperty: {
    textAlign: 'center',
    padding: '12px 16px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    width: '100%',
    maxWidth: 320,
  },
  joinField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    maxWidth: 320,
  },
  joinLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  joinInput: {
    padding: '14px 16px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    color: 'var(--text-primary)',
    fontSize: 16,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
  },
  joinError: {
    color: 'var(--accent-danger)',
    fontSize: 13,
  },
  joinBtn: {
    padding: '14px 24px',
    background: 'var(--accent-primary)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
    maxWidth: 320,
    minHeight: 48,
    touchAction: 'manipulation',
  },
};
