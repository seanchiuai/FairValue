import './RoomEntryForm.css';

type JoinRoomField = 'name' | 'roomCode';

interface JoinRoomFormProps {
  name: string;
  roomCode: string;
  errorId: string;
  errorMessage: string;
  submitting: boolean;
  identityLoading: boolean;
  isFieldInvalid: (field: JoinRoomField) => boolean;
  formatRoomCodeInput: (value: string) => string;
  onNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function JoinRoomForm({
  name,
  roomCode,
  errorId,
  errorMessage,
  submitting,
  identityLoading,
  isFieldInvalid,
  formatRoomCodeInput,
  onNameChange,
  onRoomCodeChange,
  onSubmit,
  onBack,
}: JoinRoomFormProps) {
  const disabled = submitting || identityLoading;
  const describedBy = errorMessage ? errorId : undefined;

  return (
    <div className="room-entry-form">
      <h2 className="room-entry-form__title">Join a Room</h2>
      <div className="room-entry-form__field">
        <label className="room-entry-form__label" htmlFor="join-player-nickname">
          Your Nickname
        </label>
        <input
          id="join-player-nickname"
          className="room-entry-form__input"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Player nickname"
          aria-describedby={describedBy}
          aria-invalid={isFieldInvalid('name') || undefined}
          placeholder="Enter your name"
          maxLength={20}
          autoFocus
        />
      </div>
      <div className="room-entry-form__field">
        <label className="room-entry-form__label" htmlFor="join-room-code">
          Room Code
        </label>
        <input
          id="join-room-code"
          className="room-entry-form__input room-entry-form__input--code"
          value={roomCode}
          onChange={(event) => onRoomCodeChange(formatRoomCodeInput(event.target.value))}
          aria-label="Room code"
          aria-describedby={describedBy}
          aria-invalid={isFieldInvalid('roomCode') || undefined}
          placeholder="A1B2"
          maxLength={4}
          inputMode="text"
        />
      </div>
      {errorMessage && (
        <p id={errorId} className="room-entry-form__error" role="alert">
          {errorMessage}
        </p>
      )}
      <button
        className={`room-entry-form__submit${disabled ? ' room-entry-form__submit--busy' : ''}`}
        onClick={onSubmit}
        disabled={disabled}
      >
        {submitting ? 'Joining...' : 'Join Room'}
      </button>
      <button className="room-entry-form__back" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
