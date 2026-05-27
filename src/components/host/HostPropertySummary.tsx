import {
  formatMarketLabel,
  formatOutcomeLabel,
  isRenovationBudgetMarket,
  isRangeMarket,
  isRentYieldMarket,
  leadingOutcome,
  rangeBandLabel,
  renovationBudgetThresholdLabel,
  rentYieldThresholdLabel,
} from '../../lib/roomMarketDisplay';
import type { House, Market, RoomMarketConfig } from '../../types';
import './HostPropertySummary.css';

interface HostPropertySummaryProps {
  house: House;
  market: Market;
  marketFormat: string;
  marketConfig: RoomMarketConfig | null;
}

export default function HostPropertySummary({
  house,
  market,
  marketFormat,
  marketConfig,
}: HostPropertySummaryProps) {
  const rangeRoom = isRangeMarket(marketFormat);
  const rentYieldRoom = isRentYieldMarket(marketFormat);
  const renovationBudgetRoom = isRenovationBudgetMarket(marketFormat);
  const leading = leadingOutcome(market, marketConfig);
  const probPercent = rangeRoom
    ? Math.round(leading.probability * 100)
    : Math.round(market.prob_over * 100);
  const outcomeClass = !rangeRoom && probPercent < 50
    ? 'host-property-summary__prob--under'
    : 'host-property-summary__prob--over';
  const label = rangeRoom ? formatOutcomeLabel(leading.id) : 'think OVER';

  return (
    <section
      className="host-property-summary"
      aria-label="Host property market summary"
      data-testid="host-property-summary"
    >
      <div className="host-property-summary__details">
        <div className="host-property-summary__address">{house.address}</div>
        <div className="host-property-summary__price">
          Asking: <strong>${house.asking_price.toLocaleString()}</strong>
        </div>
        <div className="host-property-summary__price">
          {formatMarketLabel(marketFormat)}
          {rangeRoom ? ` · ${rangeBandLabel(marketConfig)}` : ''}
          {rentYieldRoom ? ` · Threshold ${rentYieldThresholdLabel(marketConfig)}` : ''}
          {renovationBudgetRoom ? ` · Budget ${renovationBudgetThresholdLabel(marketConfig)}` : ''}
        </div>
      </div>
      <div className="host-property-summary__probability">
        <span className={`host-property-summary__prob ${outcomeClass}`}>{probPercent}%</span>
        <span className="host-property-summary__label">{label}</span>
      </div>
    </section>
  );
}
