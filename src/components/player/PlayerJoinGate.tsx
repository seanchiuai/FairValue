import type { House } from '../../types';
import TrustNotice from '../TrustNotice';
import './PlayerJoinGate.css';

interface PlayerJoinGateProps {
  roomCode?: string;
  house: House;
  joinName: string;
  joining: boolean;
  identityLoading: boolean;
  displayedJoinError: string;
  joinNameInvalid: boolean;
  errorId: string;
  onJoinNameChange: (name: string) => void;
  onJoin: () => void;
}

export default function PlayerJoinGate({
  roomCode,
  house,
  joinName,
  joining,
  identityLoading,
  displayedJoinError,
  joinNameInvalid,
  errorId,
  onJoinNameChange,
  onJoin,
}: PlayerJoinGateProps) {
  const busy = joining || identityLoading;

  return (
    <div className="player-join-gate">
      <div className="player-join-gate__title">Join Game</div>
      <div className="player-join-gate__room-code">{roomCode}</div>
      <div className="player-join-gate__property">
        <div className="player-join-gate__address">{house.address}</div>
        <div className="player-join-gate__price">
          Asking: ${house.asking_price.toLocaleString()}
        </div>
      </div>
      <div className="player-join-gate__trust">
        <TrustNotice
          testId="player-entry-trust-notice"
          title="Before you join"
          compact
          tone="dark"
        />
      </div>
      <div className="player-join-gate__field">
        <label className="player-join-gate__label" htmlFor="player-join-nickname">
          Your Name
        </label>
        <input
          id="player-join-nickname"
          className="player-join-gate__input"
          value={joinName}
          onChange={(event) => onJoinNameChange(event.target.value)}
          aria-label="Player nickname"
          aria-describedby={displayedJoinError ? errorId : undefined}
          aria-invalid={joinNameInvalid || undefined}
          placeholder="Enter your name"
          maxLength={20}
          aria-required="true"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') onJoin();
          }}
        />
      </div>
      {displayedJoinError && (
        <div id={errorId} className="player-join-gate__error" role="alert" aria-live="assertive">
          {displayedJoinError}
        </div>
      )}
      <button
        className={`player-join-gate__button${busy ? ' player-join-gate__button--busy' : ''}`}
        onClick={onJoin}
        disabled={busy}
      >
        {joining ? 'Joining...' : 'Join Room'}
      </button>
    </div>
  );
}
