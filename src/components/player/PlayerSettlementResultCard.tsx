import { Link } from 'react-router-dom';
import { Share2, Trophy } from 'lucide-react';
import { formatOutcomeLabel } from '../../lib/roomMarketDisplay';
import type { SettleResult } from '../../types';
import TrustNotice from '../TrustNotice';
import './PlayerSettlementResultCard.css';

interface PlayerSettlementResultCardProps {
  roomCode?: string;
  settleResult: SettleResult;
}

export default function PlayerSettlementResultCard({
  roomCode,
  settleResult,
}: PlayerSettlementResultCardProps) {
  const outcome = formatOutcomeLabel(settleResult.winning_outcome);
  const outcomeClass = settleResult.winning_outcome === 'over'
    ? 'player-settlement-result__outcome--over'
    : settleResult.winning_outcome === 'under'
      ? 'player-settlement-result__outcome--under'
      : '';
  const evidencePacket = settleResult.evidence_packet;
  const hasRentYield = Number.isFinite(settleResult.rent_yield);
  const hasRenovationBudget = Number.isFinite(settleResult.verified_cost);
  const rentYieldPercent = hasRentYield ? `${Math.round(Number(settleResult.rent_yield) * 10000) / 100}%` : '';

  return (
    <section className="player-settlement-result" data-testid="player-settlement-result">
      <Trophy size={24} color="var(--accent-warning)" aria-hidden="true" />
      <div className="player-settlement-result__title">Market Settled</div>
      <div className="player-settlement-result__detail">
        {hasRentYield
          ? `Settlement price: $${settleResult.actual_price.toLocaleString()} · Annual rent: $${Number(settleResult.annual_rent || 0).toLocaleString()} · Yield: ${rentYieldPercent}`
          : hasRenovationBudget
            ? `Verified cost: $${Number(settleResult.verified_cost || 0).toLocaleString()} · Budget: $${Number(settleResult.budget_threshold || 0).toLocaleString()}`
          : `Actual price: $${settleResult.actual_price.toLocaleString()}`}
      </div>
      <div className={`player-settlement-result__outcome ${outcomeClass}`}>
        {outcome} wins!
      </div>
      {evidencePacket && (
        <div className="player-settlement-result__evidence" data-testid="player-settlement-evidence-packet">
          <span>Evidence packet</span>
          <strong>{evidencePacket.items.length} public item{evidencePacket.items.length === 1 ? '' : 's'}</strong>
          <p>{evidencePacket.summary}</p>
        </div>
      )}
      <TrustNotice
        testId="player-settlement-trust-notice"
        title="Settlement recap"
        compact
        tone="dark"
        points={[
          'Payouts are simulation credits only.',
          hasRentYield
            ? 'Settlement price and annual rent are host-entered evidence, not a FairValue appraisal or rent roll.'
            : hasRenovationBudget
              ? 'Verified cost and budget threshold are host-entered evidence, not a FairValue construction audit.'
            : 'The actual price is host-entered settlement evidence, not a FairValue appraisal.',
          evidencePacket
            ? 'Evidence metadata is public-safe and does not include private documents.'
            : 'No external evidence metadata is attached.',
          'The room event history preserves this outcome for replay.',
        ]}
      />
      {roomCode && (
        <Link
          to={`/recap/${roomCode}`}
          className="player-settlement-result__recap-link"
          data-testid="player-recap-link"
        >
          <Share2 size={15} aria-hidden="true" />
          View public recap
        </Link>
      )}
      <div className="player-settlement-result__rows" aria-label="Player settlement payouts">
        {settleResult.results.map((result) => {
          const payoutClass = result.payout > 0
            ? 'player-settlement-result__payout--positive'
            : 'player-settlement-result__payout--empty';

          return (
            <div key={result.nickname} className="player-settlement-result__row">
              <span>{result.nickname}</span>
              <span className={`player-settlement-result__payout ${payoutClass}`}>
                {result.payout > 0 ? `+$${result.payout.toFixed(0)}` : '$0'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
