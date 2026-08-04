import { ArrowRight, GitCompareArrows, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildComparePath } from '../lib/propertyComparison';
import './CompareTray.css';

interface CompareTrayProps {
  propertyIds: string[];
  max: number;
  onRemove: (propertyId: string) => void;
  onClear: () => void;
}

export default function CompareTray({ propertyIds, max, onRemove, onClear }: CompareTrayProps) {
  if (propertyIds.length === 0) return null;

  return (
    <aside className="compare-tray" aria-label="Property comparison tray">
      <div className="compare-tray__summary">
        <GitCompareArrows size={17} aria-hidden="true" />
        <strong>Compare properties</strong>
        <span>{propertyIds.length}/{max} selected</span>
      </div>
      <div className="compare-tray__items">
        {propertyIds.map((propertyId) => (
          <span key={propertyId} className="compare-tray__item">
            {propertyId}
            <button type="button" onClick={() => onRemove(propertyId)} aria-label={`Remove property ${propertyId} from comparison`}>
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="compare-tray__actions">
        <button type="button" className="compare-tray__clear" onClick={onClear}>Clear</button>
        <Link to={buildComparePath(propertyIds)} className="compare-tray__open">
          Open comparison <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
