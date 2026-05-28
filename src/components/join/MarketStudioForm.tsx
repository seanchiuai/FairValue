import { FileText, Save, WandSparkles } from 'lucide-react';
import type { MarketDraft } from '../../lib/marketDrafts';
import type { MarketDraftPropertyMatch, SavedMarketStudioDraft } from '../../lib/marketStudioDrafts';
import MarketStudioDraftCard from './MarketStudioDraftCard';
import MarketStudioMatches from './MarketStudioMatches';
import MarketStudioSavedDrafts from './MarketStudioSavedDrafts';
import './MarketStudioForm.css';

interface MarketStudioFormProps {
  savedDrafts: SavedMarketStudioDraft[];
  name: string;
  studioText: string;
  studioDraft: MarketDraft | null;
  studioAddress: string;
  studioPrice: string;
  propertyMatches: MarketDraftPropertyMatch[];
  matchingProperties: boolean;
  errorId: string;
  errorMessage: string;
  submitting: boolean;
  identityLoading: boolean;
  onSavedDraftLoad: (draft: SavedMarketStudioDraft) => void;
  onSavedDraftDelete: (id: string) => void;
  onNameChange: (value: string) => void;
  onStudioTextChange: (value: string) => void;
  onGenerateDraft: () => void;
  onUsePropertyMatch: (match: MarketDraftPropertyMatch) => void;
  onDraftAddressChange: (value: string) => void;
  onDraftAskingPriceChange: (value: string) => void;
  onSaveDraft: () => void;
  onCreateRoom: () => void;
  onBack: () => void;
}

export default function MarketStudioForm({
  savedDrafts,
  name,
  studioText,
  studioDraft,
  studioAddress,
  studioPrice,
  propertyMatches,
  matchingProperties,
  errorId,
  errorMessage,
  submitting,
  identityLoading,
  onSavedDraftLoad,
  onSavedDraftDelete,
  onNameChange,
  onStudioTextChange,
  onGenerateDraft,
  onUsePropertyMatch,
  onDraftAddressChange,
  onDraftAskingPriceChange,
  onSaveDraft,
  onCreateRoom,
  onBack,
}: MarketStudioFormProps) {
  const errorDescription = errorMessage ? errorId : undefined;
  const createDisabled = submitting || identityLoading || !studioDraft;

  return (
    <div className="market-studio-form">
      <div className="market-studio-form__heading">
        <FileText size={19} color="var(--accent-primary)" aria-hidden="true" />
        <h2 className="market-studio-form__title">Market Studio</h2>
      </div>
      <MarketStudioSavedDrafts
        drafts={savedDrafts}
        onLoad={onSavedDraftLoad}
        onDelete={onSavedDraftDelete}
      />
      <div className="market-studio-form__field">
        <label className="market-studio-form__label" htmlFor="studio-host-nickname">
          Host Nickname
        </label>
        <input
          id="studio-host-nickname"
          className="market-studio-form__input"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Host nickname"
          aria-describedby={errorDescription}
          aria-invalid={errorMessage === 'Host nickname is required' || undefined}
          placeholder="Enter your name"
          maxLength={20}
          autoFocus
        />
      </div>
      <div className="market-studio-form__field">
        <label className="market-studio-form__label" htmlFor="market-studio-source">
          Listing Text
        </label>
        <textarea
          id="market-studio-source"
          className="market-studio-form__textarea"
          value={studioText}
          onChange={(event) => onStudioTextChange(event.target.value)}
          aria-label="Listing text"
          aria-describedby={errorDescription}
          placeholder="Paste listing text, address, asking price, beds, baths, and sqft..."
          rows={7}
        />
      </div>
      <button
        type="button"
        className="market-studio-form__secondary-action"
        onClick={onGenerateDraft}
      >
        <WandSparkles size={16} aria-hidden="true" />
        Generate Market Draft
      </button>

      {matchingProperties && (
        <p className="market-studio-form__matching-text">Checking local property dataset...</p>
      )}

      <MarketStudioMatches
        matches={propertyMatches}
        onUseMatch={onUsePropertyMatch}
      />

      {studioDraft && (
        <MarketStudioDraftCard
          draft={studioDraft}
          address={studioAddress}
          askingPrice={studioPrice}
          errorId={errorId}
          errorMessage={errorMessage}
          onAddressChange={onDraftAddressChange}
          onAskingPriceChange={onDraftAskingPriceChange}
        />
      )}

      {errorMessage && (
        <p id={errorId} className="market-studio-form__error" role="alert">
          {errorMessage}
        </p>
      )}
      {studioDraft && (
        <button
          type="button"
          className="market-studio-form__secondary-action"
          onClick={onSaveDraft}
        >
          <Save size={16} aria-hidden="true" />
          Save Draft
        </button>
      )}
      <button
        className={`market-studio-form__submit${createDisabled ? ' market-studio-form__submit--busy' : ''}`}
        onClick={onCreateRoom}
        disabled={createDisabled}
      >
        {submitting ? 'Creating...' : 'Create Room From Draft'}
      </button>
      <button className="market-studio-form__back" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
