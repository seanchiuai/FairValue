import type { House } from '../../types';
import './HostPropertySummary.css';

interface HostPropertySummaryProps {
  house: House;
  probOver: number;
}

export default function HostPropertySummary({ house, probOver }: HostPropertySummaryProps) {
  const probPercent = Math.round(probOver * 100);
  const outcomeClass = probPercent >= 50 ? 'host-property-summary__prob--over' : 'host-property-summary__prob--under';

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
      </div>
      <div className="host-property-summary__probability">
        <span className={`host-property-summary__prob ${outcomeClass}`}>{probPercent}%</span>
        <span className="host-property-summary__label">think OVER</span>
      </div>
    </section>
  );
}
