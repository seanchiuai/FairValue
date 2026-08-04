import React from 'react';
import { Link } from 'react-router-dom';
import { Bed, Bath, GitCompareArrows, Maximize, MapPin } from 'lucide-react';
import Sparkline from './Sparkline';
import './MarketCard.css';

function MarketCard({ property, chartData, compared = false, onToggleCompare }) {
  const formatPrice = (n) => n ? `$${n.toLocaleString()}` : '—';
  const typeLabel = (t) => {
    const map = { SINGLE_FAMILY: 'House', CONDO: 'Condo', MULTI_FAMILY: 'Multi-Family', APARTMENT: 'Apartment', LOT: 'Lot' };
    return map[t] || t;
  };

  return (
    <article className={`market-card-wrapper${compared ? ' is-compared' : ''}`}>
      <Link to={`/market/${property.id}`} className="market-card-link">
      <div className="card-image">
        {property.imgSrc ? (
          <img src={property.imgSrc} alt={property.address} loading="lazy" />
        ) : (
          <div className="card-image-placeholder" />
        )}
        <div className="card-badges">
          <span className="card-type-badge">{typeLabel(property.homeType)}</span>
        </div>
      </div>

      {chartData && (
        <div className="card-chart">
          <Sparkline data={chartData} width={320} height={48} />
        </div>
      )}

      <div className="card-body">
        <div className="card-price">{formatPrice(property.price)}</div>

        <div className="card-specs">
          {property.bedrooms != null && (
            <span className="card-spec"><Bed size={13} /> {property.bedrooms} bd</span>
          )}
          {property.bathrooms != null && (
            <span className="card-spec"><Bath size={13} /> {property.bathrooms} ba</span>
          )}
          {property.livingArea != null && (
            <span className="card-spec"><Maximize size={13} /> {property.livingArea.toLocaleString()} sqft</span>
          )}
        </div>

        <h3 className="card-address">{property.address}</h3>
        <div className="card-location">
          <MapPin size={11} />
          <span>{property.city}, {property.state} {property.zipCode}</span>
        </div>

        {property.zestimate && (
          <div className="card-zestimate">
            Zestimate: {formatPrice(property.zestimate)}
            {property.price > 0 && property.zestimate > 0 && (
              <span className={property.zestimate > property.price ? 'zest-up' : 'zest-down'}>
                {' '}({property.zestimate > property.price ? '+' : ''}{(((property.zestimate - property.price) / property.price) * 100).toFixed(1)}%)
              </span>
            )}
          </div>
        )}
      </div>
      </Link>
      {onToggleCompare && (
        <button
          type="button"
          className={`card-compare-button${compared ? ' active' : ''}`}
          onClick={() => onToggleCompare(property.id)}
          aria-pressed={compared}
          aria-label={`${compared ? 'Remove' : 'Add'} ${property.address} ${compared ? 'from' : 'to'} comparison`}
        >
          <GitCompareArrows size={14} aria-hidden="true" />
          {compared ? 'Compared' : 'Compare'}
        </button>
      )}
    </article>
  );
}

export default MarketCard;
