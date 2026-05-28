import './RoomEntryForm.css';

type CreateRoomField = 'name' | 'address' | 'askingPrice';

interface CreateRoomFormProps {
  name: string;
  address: string;
  askingPrice: string;
  errorId: string;
  errorMessage: string;
  submitting: boolean;
  identityLoading: boolean;
  isFieldInvalid: (field: CreateRoomField) => boolean;
  onNameChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onAskingPriceChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function CreateRoomForm({
  name,
  address,
  askingPrice,
  errorId,
  errorMessage,
  submitting,
  identityLoading,
  isFieldInvalid,
  onNameChange,
  onAddressChange,
  onAskingPriceChange,
  onSubmit,
  onBack,
}: CreateRoomFormProps) {
  const disabled = submitting || identityLoading;
  const describedBy = errorMessage ? errorId : undefined;

  return (
    <div className="room-entry-form">
      <h2 className="room-entry-form__title">Create a Room</h2>
      <div className="room-entry-form__field">
        <label className="room-entry-form__label" htmlFor="create-host-nickname">
          Your Nickname
        </label>
        <input
          id="create-host-nickname"
          className="room-entry-form__input"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Host nickname"
          aria-describedby={describedBy}
          aria-invalid={isFieldInvalid('name') || undefined}
          placeholder="Enter your name"
          maxLength={20}
          autoFocus
        />
      </div>
      <div className="room-entry-form__field">
        <label className="room-entry-form__label" htmlFor="create-property-address">
          Property Address
        </label>
        <input
          id="create-property-address"
          className="room-entry-form__input"
          value={address}
          onChange={(event) => onAddressChange(event.target.value)}
          aria-label="Property address"
          aria-describedby={describedBy}
          aria-invalid={isFieldInvalid('address') || undefined}
          placeholder="742 Evergreen Terrace"
          maxLength={100}
        />
      </div>
      <div className="room-entry-form__field">
        <label className="room-entry-form__label" htmlFor="create-asking-price">
          Asking Price ($)
        </label>
        <input
          id="create-asking-price"
          className="room-entry-form__input"
          value={askingPrice}
          onChange={(event) => onAskingPriceChange(event.target.value)}
          aria-label="Asking price"
          aria-describedby={describedBy}
          aria-invalid={isFieldInvalid('askingPrice') || undefined}
          placeholder="450,000"
          inputMode="numeric"
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
        {submitting ? 'Creating...' : 'Create Room'}
      </button>
      <button className="room-entry-form__back" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
