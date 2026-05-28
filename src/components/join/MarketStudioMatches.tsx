import { Database } from 'lucide-react';
import { formatDraftPrice } from '../../lib/marketDrafts';
import type { MarketDraftPropertyMatch } from '../../lib/marketStudioDrafts';
import './MarketStudioMatches.css';

interface MarketStudioMatchesProps {
  matches: MarketDraftPropertyMatch[];
  onUseMatch: (match: MarketDraftPropertyMatch) => void;
}

export default function MarketStudioMatches({ matches, onUseMatch }: MarketStudioMatchesProps) {
  if (matches.length === 0) return null;

  return (
    <section
      className="market-studio-matches"
      aria-label="Existing property matches"
      data-testid="market-studio-matches"
    >
      <div className="market-studio-matches__header">
        <Database size={15} aria-hidden="true" />
        <span>Existing property match</span>
      </div>
      {matches.map((match) => (
        <div key={match.property_id} className="market-studio-matches__item">
          <div className="market-studio-matches__copy">
            <span className="market-studio-matches__title">{match.address}</span>
            <span className="market-studio-matches__meta">
              {match.city}, {match.state} {match.zip} - {formatDraftPrice(match.asking_price)} - {match.score}% {match.confidence}
            </span>
            <span className="market-studio-matches__reasons">
              {match.reasons.slice(0, 3).join(', ')}
            </span>
          </div>
          <button
            type="button"
            className="market-studio-matches__button"
            aria-label={`Use local property ${match.address}`}
            onClick={() => onUseMatch(match)}
          >
            Use Local Property
          </button>
        </div>
      ))}
    </section>
  );
}
