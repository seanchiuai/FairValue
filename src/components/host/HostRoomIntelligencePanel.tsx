import { ListChecks, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { RoomMarketIntelligence } from '../../lib/marketIntelligence';
import './HostRoomIntelligencePanel.css';

interface HostRoomIntelligencePanelProps {
  intelligence: RoomMarketIntelligence;
}

function confidenceClass(confidence: RoomMarketIntelligence['confidence']) {
  return `host-room-intelligence__badge host-room-intelligence__badge--${confidence}`;
}

export default function HostRoomIntelligencePanel({ intelligence }: HostRoomIntelligencePanelProps) {
  return (
    <section
      className="host-room-intelligence"
      aria-label="Live Room Intelligence"
      data-testid="host-room-intelligence-panel"
    >
      <div className="host-room-intelligence__head">
        <div>
          <div className="host-room-intelligence__title">
            <Sparkles size={16} aria-hidden="true" /> Live Room Intelligence
          </div>
          <p className="host-room-intelligence__summary">{intelligence.summary}</p>
        </div>
        <span className={confidenceClass(intelligence.confidence)}>
          {intelligence.confidence} confidence
        </span>
      </div>

      <div className="host-room-intelligence__metrics">
        {intelligence.live_metrics.map((metric) => (
          <div key={metric.label} className="host-room-intelligence__metric">
            <span className="host-room-intelligence__metric-label">{metric.label}</span>
            <span className="host-room-intelligence__metric-value">{metric.value}</span>
            <span className="host-room-intelligence__metric-detail">{metric.detail}</span>
          </div>
        ))}
      </div>

      <div className="host-room-intelligence__movement">
        <h3 className="host-room-intelligence__subtitle">
          <TrendingUp size={15} aria-hidden="true" /> Movement read
        </h3>
        <ul className="host-room-intelligence__list">
          {intelligence.movement_explanations.map((item, index) => (
            <li key={`movement-${index}-${item}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="host-room-intelligence__columns">
        <div className="host-room-intelligence__column">
          <h3 className="host-room-intelligence__subtitle">
            <Target size={15} aria-hidden="true" /> Pressure points
          </h3>
          <ul className="host-room-intelligence__list">
            {intelligence.pressure_points.slice(0, 3).map((item, index) => (
              <li key={`pressure-${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="host-room-intelligence__column">
          <h3 className="host-room-intelligence__subtitle">
            <ListChecks size={15} aria-hidden="true" /> Host script
          </h3>
          <ul className="host-room-intelligence__list">
            {intelligence.host_script.map((item, index) => (
              <li key={`script-${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="host-room-intelligence__footer">
        {intelligence.provenance_notes.map((note, index) => (
          <span key={`provenance-${index}-${note}`}>{note}</span>
        ))}
      </div>
    </section>
  );
}
