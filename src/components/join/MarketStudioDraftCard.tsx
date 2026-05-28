import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { MarketDraft } from '../../lib/marketDrafts';
import './MarketStudioDraftCard.css';

interface MarketStudioDraftCardProps {
  draft: MarketDraft;
  address: string;
  askingPrice: string;
  errorId?: string;
  errorMessage?: string;
  onAddressChange: (value: string) => void;
  onAskingPriceChange: (value: string) => void;
}

export default function MarketStudioDraftCard({
  draft,
  address,
  askingPrice,
  errorId,
  errorMessage,
  onAddressChange,
  onAskingPriceChange,
}: MarketStudioDraftCardProps) {
  const describedBy = errorMessage ? errorId : undefined;

  return (
    <section
      className="market-studio-draft"
      aria-label="Generated market draft"
      data-testid="market-studio-draft"
    >
      <div className="market-studio-draft__topline">
        <span className="market-studio-draft__pill">
          <CheckCircle2 size={13} aria-hidden="true" />
          {draft.provenance.confidence} confidence
        </span>
        <span className="market-studio-draft__source">{draft.provenance.source}</span>
      </div>
      {draft.property_id && (
        <div className="market-studio-draft__linked-property">
          Linked to local property {draft.property_id}
        </div>
      )}
      <h3 className="market-studio-draft__question">{draft.market_question}</h3>
      <p className="market-studio-draft__summary">{draft.generated_summary}</p>

      <div className="market-studio-draft__field">
        <label className="market-studio-draft__label" htmlFor="studio-property-address">
          Generated Address
        </label>
        <input
          id="studio-property-address"
          className="market-studio-draft__input"
          value={address}
          onChange={(event) => onAddressChange(event.target.value)}
          aria-label="Generated property address"
          aria-describedby={describedBy}
          placeholder="Property address"
          maxLength={100}
        />
      </div>
      <div className="market-studio-draft__field">
        <label className="market-studio-draft__label" htmlFor="studio-asking-price">
          Generated Asking Price ($)
        </label>
        <input
          id="studio-asking-price"
          className="market-studio-draft__input"
          value={askingPrice}
          onChange={(event) => onAskingPriceChange(event.target.value)}
          aria-label="Generated asking price"
          aria-describedby={describedBy}
          placeholder="1,250,000"
          inputMode="numeric"
        />
      </div>

      <div className="market-studio-draft__meta-grid">
        <span>{draft.beds ? `${draft.beds} beds` : 'Beds unknown'}</span>
        <span>{draft.baths ? `${draft.baths} baths` : 'Baths unknown'}</span>
        <span>{draft.sqft ? `${draft.sqft.toLocaleString()} sqft` : 'Sqft unknown'}</span>
        <span>{draft.home_type || 'Type unknown'}</span>
      </div>

      <div className="market-studio-draft__checklist">
        <div className="market-studio-draft__subhead">Settlement evidence</div>
        <ul className="market-studio-draft__list">
          {draft.evidence_required.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="market-studio-draft__warning">
        <AlertTriangle size={15} aria-hidden="true" />
        <div>
          {draft.warnings.map((warning) => (
            <p key={warning} className="market-studio-draft__warning-text">
              {warning}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
