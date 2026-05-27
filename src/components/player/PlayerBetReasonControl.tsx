import './PlayerBetReasonControl.css';

interface PlayerBetReasonControlProps {
  value: string;
  maxLength: number;
  describedBy?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}

export default function PlayerBetReasonControl({
  value,
  maxLength,
  describedBy,
  invalid,
  onChange,
}: PlayerBetReasonControlProps) {
  const remaining = Math.max(0, maxLength - value.length);

  return (
    <div className="player-bet-reason">
      <div className="player-bet-reason__header">
        <label className="player-bet-reason__label" htmlFor="player-bet-reason">
          Reason
        </label>
        <span className="player-bet-reason__count">{remaining}</span>
      </div>
      <textarea
        id="player-bet-reason"
        className="player-bet-reason__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Public bet reason"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        placeholder="Optional thesis for this bet"
        maxLength={maxLength}
        rows={2}
      />
      <div className="player-bet-reason__note">Public, replayed with this bet.</div>
    </div>
  );
}
