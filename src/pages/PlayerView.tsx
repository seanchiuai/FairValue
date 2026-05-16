import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useRoom } from '../hooks/useRoom';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import { generatePlayerBetPreview } from '../lib/playerBetPreview';
import { TrendingUp, TrendingDown, DollarSign, Trophy, Share2 } from 'lucide-react';
import ConnectionIndicator from '../components/ConnectionIndicator';
import ReconnectingOverlay from '../components/ReconnectingOverlay';
import TrustNotice from '../components/TrustNotice';
import RoomLoadError from '../components/RoomLoadError';
import { RateLimiter } from '../lib/rateLimiter';
import { useToast } from '../contexts/ToastContext';

const playerJoinErrorId = 'player-join-error';
const playerBetErrorId = 'player-bet-error';

export default function PlayerView() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const {
    sessionId,
    userToken,
    nickname: savedNickname,
    saveNickname,
    identityLoading,
    identityError,
    ensureIdentity,
  } = useSession();
  const {
    market,
    myPlayer,
    house,
    activity,
    settled,
    settleResult,
    connectionState,
    loading,
    loadError,
    placeBet,
    joinRoom,
  } = useRoom(roomCode || '', sessionId, userToken);

  // Chart
  const { addPoint, loadHistory, setRef: chartRef } = useMarketChart({ height: 200 });
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

  const [wager, setWager] = useState<number>(25);
  const [betting, setBetting] = useState(false);
  const [betError, setBetError] = useState('');
  const [joinName, setJoinName] = useState(savedNickname);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const wasConnectedRef = useRef(false);
  const rateLimiterRef = useRef(new RateLimiter(5, 1));
  const { showToast } = useToast();
  if (connectionState === 'connected') wasConnectedRef.current = true;

  const betPreview = useMemo(() => {
    if (!house || !market || !myPlayer) return null;
    return generatePlayerBetPreview({
      house,
      market,
      player: myPlayer,
      wager,
      activity,
    });
  }, [activity, house, market, myPlayer, wager]);

  const handleBet = async (outcome: 'over' | 'under') => {
    if (betting) return;
    if (!wager || wager <= 0) {
      const message = 'Enter a wager greater than $0';
      setBetError(message);
      showToast(message, 'error');
      return;
    }
    if (!rateLimiterRef.current.canAct()) {
      const wait = Math.ceil(rateLimiterRef.current.timeUntilNext() / 1000);
      const message = `Slow down! Wait ${wait}s before betting again.`;
      setBetError(message);
      showToast(message, 'error');
      return;
    }
    setBetting(true);
    setBetError('');
    try {
      await placeBet(outcome, wager);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bet failed';
      setBetError(message);
      showToast(message, 'error');
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

  if (loadError || !house || !market) {
    return <RoomLoadError roomCode={roomCode} message={loadError || 'Room not found'} />;
  }

  // Player hasn't joined yet — show nickname form
  if (!myPlayer) {
    const displayedJoinError = joinError || identityError;
    const joinNameInvalid = joinError === 'Enter your name';
    const handleJoin = async () => {
      const sanitized = joinName.trim().replace(/<[^>]*>/g, '').slice(0, 20);
      if (!sanitized) {
        const message = 'Enter your name';
        setJoinError(message);
        showToast(message, 'error');
        return;
      }
      setJoining(true);
      setJoinError('');
      try {
        const identity = await ensureIdentity();
        await joinRoom(sanitized, {
          sessionId: identity.user_id,
          userToken: identity.user_token,
        });
        saveNickname(sanitized);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to join';
        setJoinError(message);
        showToast(message, 'error');
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
          <div style={s.joinTrustWrap}>
            <TrustNotice
              testId="player-entry-trust-notice"
              title="Before you join"
              compact
              tone="dark"
            />
          </div>
          <div style={s.joinField}>
            <label style={s.joinLabel} htmlFor="player-join-nickname">Your Name</label>
            <input
              id="player-join-nickname"
              style={s.joinInput}
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              aria-label="Player nickname"
              aria-describedby={displayedJoinError ? playerJoinErrorId : undefined}
              aria-invalid={joinNameInvalid || undefined}
              placeholder="Enter your name"
              maxLength={20}
              aria-required="true"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>
          {displayedJoinError && (
            <div id={playerJoinErrorId} style={s.joinError} role="alert" aria-live="assertive">
              {displayedJoinError}
            </div>
          )}
          <button
            style={{ ...s.joinBtn, opacity: joining || identityLoading ? 0.6 : 1 }}
            onClick={handleJoin}
            disabled={joining || identityLoading}
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
          <ConnectionIndicator state={connectionState} />
        </div>
        <div style={s.balanceBox}>
          <DollarSign size={14} color="var(--accent-warning)" />
          <span style={s.balanceValue} data-testid="player-balance">
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

      <div style={s.roomTrustWrap}>
        <TrustNotice
          testId="player-room-trust-notice"
          title="Market mechanics"
          compact
          tone="dark"
          points={[
            'Your balance and wagers are simulation credits only.',
            'Over/Under prices come from LMSR probability, not an appraisal.',
            'The host settles with actual sale or appraisal evidence.',
          ]}
        />
      </div>

      {!settled && betPreview && (
        <section
          style={s.preBetCard}
          aria-label="Pre-bet intelligence"
          data-testid="player-prebet-intelligence"
        >
          <div style={s.preBetHeader}>
            <span style={s.preBetKicker}>Pre-bet read</span>
            <span style={s.preBetHeadline}>{betPreview.headline}</span>
          </div>
          <div style={s.preBetReasons}>
            <p style={s.preBetReason} data-testid="player-prebet-believe">
              <strong>Reason to believe:</strong> {betPreview.reason_to_believe}
            </p>
            <p style={s.preBetReason} data-testid="player-prebet-doubt">
              <strong>Reason to doubt:</strong> {betPreview.reason_to_doubt}
            </p>
          </div>
          <div style={s.previewGrid}>
            <span style={s.previewChip} data-testid="player-prebet-over">
              {betPreview.outcomes.over.summary}
            </span>
            <span style={s.previewChip} data-testid="player-prebet-under">
              {betPreview.outcomes.under.summary}
            </span>
          </div>
          {betPreview.balance_warning && (
            <div style={s.previewWarning}>{betPreview.balance_warning}</div>
          )}
          <div style={s.previewProvenance}>{betPreview.provenance}</div>
        </section>
      )}

      {/* Settle Result */}
      {settled && settleResult && (
        <div style={s.settleCard} data-testid="player-settlement-result">
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
          <TrustNotice
            testId="player-settlement-trust-notice"
            title="Settlement recap"
            compact
            tone="dark"
            points={[
              'Payouts are simulation credits only.',
              'The actual price is host-entered settlement evidence, not a FairValue appraisal.',
              'The room event history preserves this outcome for replay.',
            ]}
          />
          {roomCode && (
            <Link to={`/recap/${roomCode}`} style={s.settleRecapLink} data-testid="player-recap-link">
              <Share2 size={15} aria-hidden="true" /> View public recap
            </Link>
          )}
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
            <div
              style={s.probBar}
              role="progressbar"
              aria-valuenow={probPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${probPercent}% probability of going over asking price`}
            >
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

          {/* Chart */}
          <div style={s.chartCard}>
            <div style={s.chartHeader}>
              <span style={s.chartTitle}>Market Probability</span>
              <div style={s.legend}>
                <span style={s.legendDot} /> Over %
                <span style={{ ...s.legendDot, background: '#3BA776', marginLeft: 8 }} /> Fair value
              </div>
            </div>
            <div ref={chartRef} style={{ width: '100%', height: 200 }} />
          </div>

          {/* Positions */}
          {myPlayer && myPlayer.bets.length > 0 && (
            <div style={s.positionsCard} data-testid="player-positions">
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
          {betError && (
            <div id={playerBetErrorId} style={s.betError} role="alert" aria-live="assertive" data-testid="bet-error">
              {betError}
            </div>
          )}
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
                aria-label={`Set wager to $${amount}`}
              >
                ${amount}
              </button>
            ))}
            <input
              style={s.customInput}
              type="number"
              value={wager === 0 ? '0' : wager || ''}
              onChange={(e) => {
                const val = Math.max(0, Math.min(Number(e.target.value), myPlayer ? myPlayer.balance : 10000));
                setWager(val);
                if (betError) setBetError('');
              }}
              placeholder="$"
              aria-label="Custom wager"
              aria-describedby={betError ? playerBetErrorId : undefined}
              aria-invalid={Boolean(betError) || undefined}
              inputMode="numeric"
              min={1}
              max={myPlayer ? myPlayer.balance : 10000}
            />
          </div>
          <div style={s.betButtons}>
            <button
              style={{ ...s.betBtn, ...s.overBtn, opacity: betting ? 0.6 : 1 }}
              onClick={() => handleBet('over')}
              disabled={betting}
              aria-label={`Bet $${wager} on OVER`}
            >
              <TrendingUp size={20} />
              OVER
            </button>
            <button
              style={{ ...s.betBtn, ...s.underBtn, opacity: betting ? 0.6 : 1 }}
              onClick={() => handleBet('under')}
              aria-label={`Bet $${wager} on UNDER`}
              disabled={betting}
            >
              <TrendingDown size={20} />
              UNDER
            </button>
          </div>
        </div>
      )}

      <ReconnectingOverlay state={connectionState} wasConnected={wasConnectedRef.current} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 190,
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
    padding: '12px 12px 8px',
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
  chartTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  legendDot: {
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
  preBetCard: {
    margin: '0 16px 12px',
    padding: '12px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
  },
  preBetHeader: {
    display: 'grid',
    gap: 3,
    marginBottom: 7,
  },
  preBetKicker: {
    color: 'var(--text-muted)',
    fontSize: 10,
    lineHeight: 1.2,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  preBetHeadline: {
    color: 'var(--text-primary)',
    fontSize: 12,
    lineHeight: 1.25,
    fontWeight: 800,
  },
  preBetReasons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 7,
    marginBottom: 8,
  },
  preBetReason: {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: 11,
    lineHeight: 1.35,
    minWidth: 0,
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
    gap: 6,
  },
  previewChip: {
    display: 'block',
    padding: '7px 8px',
    borderRadius: 7,
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    lineHeight: 1.3,
    minWidth: 0,
  },
  previewWarning: {
    marginTop: 6,
    color: 'var(--accent-warning)',
    fontSize: 11,
    lineHeight: 1.3,
  },
  previewProvenance: {
    marginTop: 6,
    color: 'var(--text-muted)',
    fontSize: 10,
    lineHeight: 1.3,
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
  settleRecapLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--accent-primary)',
    fontSize: 13,
    fontWeight: 800,
    textDecoration: 'none',
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
  joinTrustWrap: {
    width: '100%',
    maxWidth: 320,
  },
  roomTrustWrap: {
    margin: '0 16px 12px',
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
