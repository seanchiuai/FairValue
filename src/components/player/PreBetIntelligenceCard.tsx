import type { PlayerBetPreview } from '../../lib/playerBetPreview';
import './PreBetIntelligenceCard.css';

interface PreBetIntelligenceCardProps {
  preview: PlayerBetPreview;
}

export default function PreBetIntelligenceCard({ preview }: PreBetIntelligenceCardProps) {
  return (
    <section
      className="prebet-card"
      aria-label="Pre-bet intelligence"
      data-testid="player-prebet-intelligence"
    >
      <div className="prebet-card__header">
        <span className="prebet-card__kicker">Pre-bet read</span>
        <span className="prebet-card__headline">{preview.headline}</span>
      </div>
      <div className="prebet-card__reasons">
        <p className="prebet-card__reason" data-testid="player-prebet-believe">
          <strong>Reason to believe:</strong> {preview.reason_to_believe}
        </p>
        <p className="prebet-card__reason" data-testid="player-prebet-doubt">
          <strong>Reason to doubt:</strong> {preview.reason_to_doubt}
        </p>
      </div>
      <div className="prebet-card__preview-grid">
        <span className="prebet-card__preview-chip" data-testid="player-prebet-over">
          {preview.outcomes.over.summary}
        </span>
        <span className="prebet-card__preview-chip" data-testid="player-prebet-under">
          {preview.outcomes.under.summary}
        </span>
      </div>
      {preview.balance_warning && (
        <div className="prebet-card__warning" data-testid="player-prebet-balance-warning" aria-live="polite">
          {preview.balance_warning}
        </div>
      )}
      <div className="prebet-card__provenance">{preview.provenance}</div>
    </section>
  );
}
