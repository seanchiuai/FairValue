import type { UserReputation } from '../../types';
import './PlayerReputationPanel.css';

interface PlayerReputationPanelProps {
  reputation: UserReputation | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

function formatPercent(value: number | null) {
  if (value == null) return 'New';
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number | null) {
  if (value == null) return 'New';
  return `${Math.round(value)}/100`;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatMarketFormat(value: string) {
  return value.replace(/_/g, ' ');
}

function formatRoomAccuracy(correct: number, total: number) {
  if (!total) return 'No scored bets';
  return `${correct}/${total} correct`;
}

export default function PlayerReputationPanel({
  reputation,
  loading,
  error,
  onRefresh,
}: PlayerReputationPanelProps) {
  const hasRooms = Boolean(reputation && reputation.rooms_played > 0);
  const recentRooms = reputation?.recent_rooms.slice(0, 3) || [];

  return (
    <section
      className="player-reputation"
      aria-label="Private player reputation"
      data-testid="player-reputation-panel"
    >
      <div className="player-reputation__header">
        <div className="player-reputation__title-block">
          <div>
            <span className="player-reputation__eyebrow">Private reputation</span>
            <h2>My prediction record</h2>
          </div>
        </div>
        <button
          type="button"
          className="player-reputation__refresh"
          title="Refresh private reputation"
          aria-label="Refresh private reputation"
          disabled={loading}
          onClick={onRefresh}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="player-reputation__message" role="status">
          Private reputation unavailable.
        </div>
      )}

      {!error && loading && !reputation && (
        <div className="player-reputation__message" role="status">
          Loading reputation...
        </div>
      )}

      {!error && reputation && (
        <>
          <div className="player-reputation__stats">
            <div className="player-reputation__stat">
              <span>Rooms</span>
              <strong>{reputation.rooms_played}</strong>
            </div>
            <div className="player-reputation__stat">
              <span>Accuracy</span>
              <strong>{formatPercent(reputation.accuracy)}</strong>
            </div>
            <div className="player-reputation__stat">
              <span>Calibration</span>
              <strong>{formatScore(reputation.average_calibration_score)}</strong>
            </div>
            <div className="player-reputation__stat">
              <span>Reasons</span>
              <strong>{reputation.reason_count}</strong>
            </div>
          </div>

          <div className="player-reputation__totals">
            <span>{reputation.total_bets} bets</span>
            <span>{formatMoney(reputation.total_wagered)} wagered</span>
            <span>{formatMoney(reputation.total_payout)} payout</span>
          </div>

          {hasRooms ? (
            <div className="player-reputation__recent" aria-label="Recent settled rooms">
              {recentRooms.map((room) => (
                <div key={room.room_code} className="player-reputation__room">
                  <div className="player-reputation__room-main">
                    <strong>{room.room_code}</strong>
                    <span>{formatMarketFormat(room.market_format)}</span>
                  </div>
                  <div className="player-reputation__room-score">
                    <strong>{formatRoomAccuracy(room.correct_bets, room.bet_count)}</strong>
                    <span>{formatScore(room.calibration_score)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="player-reputation__message">
              No settled rooms yet.
            </div>
          )}

          <p className="player-reputation__limits">
            Simulation-credit rooms only. Private session IDs, user tokens, host tokens, and raw evidence are excluded.
          </p>
        </>
      )}
    </section>
  );
}
