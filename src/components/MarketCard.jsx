import React from 'react';
import { Link } from 'react-router-dom';
import { Bed, Bath, Maximize, MapPin } from 'lucide-react';

function MarketCard({ property }) {
  const formatPrice = (n) => n ? `$${n.toLocaleString()}` : '—';
  const typeLabel = (t) => {
    const map = { SINGLE_FAMILY: 'House', CONDO: 'Condo', MULTI_FAMILY: 'Multi-Family', APARTMENT: 'Apartment', LOT: 'Lot' };
    return map[t] || t;
  };

  return (
    <Link to={`/market/${property.id}`} className="glass-card">
      <div className="gc-image">
        {property.imgSrc ? (
          <img src={property.imgSrc} alt={property.address} loading="lazy" />
        ) : (
          <div className="gc-image-placeholder" />
        )}
        <div className="gc-badges">
          <span className="gc-badge-type">{typeLabel(property.homeType)}</span>
          {property.homeStatus === 'RECENTLY_SOLD' && (
            <span className="gc-badge-sold">Sold</span>
          )}
        </div>
      </div>

      <div className="gc-body">
        <div className="gc-price">{formatPrice(property.price)}</div>
        <div className="gc-specs">
          {property.bedrooms != null && <span><Bed size={13} /> {property.bedrooms}</span>}
          {property.bathrooms != null && <span><Bath size={13} /> {property.bathrooms}</span>}
          {property.livingArea != null && <span><Maximize size={13} /> {property.livingArea.toLocaleString()}</span>}
        </div>
        <h3 className="gc-address">{property.address}</h3>
        <div className="gc-location">
          <MapPin size={11} />
          <span>{property.city}, {property.state} {property.zipCode}</span>
        </div>
        {property.zestimate > 0 && property.price > 0 && (
          <div className="gc-zest">
            Zestimate {formatPrice(property.zestimate)}
            <span className={property.zestimate >= property.price ? 'zup' : 'zdown'}>
              {' '}{property.zestimate >= property.price ? '+' : ''}{(((property.zestimate - property.price) / property.price) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <style>{`
        .glass-card {
          display: block;
          text-decoration: none;
          color: inherit;
          background: rgba(255,255,255,0.5);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.6);
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.8),
            inset 0 -1px 0 rgba(0,0,0,0.03),
            0 4px 24px rgba(0,0,0,0.06),
            0 1px 4px rgba(0,0,0,0.04);
          position: relative;
        }
        .glass-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 50%;
          background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%);
          border-radius: 24px 24px 0 0;
          pointer-events: none;
          z-index: 1;
          opacity: 0.6;
          transition: opacity 0.3s;
        }
        .glass-card:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.9),
            0 12px 40px rgba(0,0,0,0.1),
            0 4px 12px rgba(0,0,0,0.06);
          border-color: rgba(255,255,255,0.8);
        }
        .glass-card:hover::before { opacity: 1; }

        .gc-image {
          position: relative;
          width: 100%;
          aspect-ratio: 16/10;
          overflow: hidden;
        }
        .gc-image img {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.5s cubic-bezier(0.4,0,0.2,1);
        }
        .glass-card:hover .gc-image img { transform: scale(1.05); }
        .gc-image-placeholder {
          width: 100%; height: 100%;
          background: linear-gradient(135deg, rgba(200,200,210,0.3), rgba(180,180,190,0.2));
        }

        .gc-badges {
          position: absolute;
          top: 10px; left: 10px;
          display: flex; gap: 6px;
          z-index: 2;
        }
        .gc-badge-type {
          padding: 5px 12px;
          background: rgba(255,255,255,0.75);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 980px;
          font-size: 11px; font-weight: 600;
          color: rgba(0,0,0,0.7);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.08);
        }
        .gc-badge-sold {
          padding: 5px 12px;
          background: rgba(52,199,89,0.85);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 980px;
          font-size: 11px; font-weight: 600;
          color: white;
          box-shadow: 0 2px 8px rgba(52,199,89,0.25);
        }

        .gc-body { padding: 14px 16px 16px; position: relative; z-index: 2; }

        .gc-price {
          font-size: 22px; font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.5px;
          margin-bottom: 4px;
        }
        .gc-specs {
          display: flex; gap: 12px;
          margin-bottom: 8px;
        }
        .gc-specs span {
          display: inline-flex; align-items: center;
          gap: 4px; font-size: 13px;
          color: var(--text-secondary); font-weight: 500;
        }
        .gc-address {
          margin: 0 0 2px; font-size: 14px;
          font-weight: 600; color: var(--text-primary);
          letter-spacing: -0.2px;
        }
        .gc-location {
          display: flex; align-items: center;
          gap: 3px; color: var(--text-muted);
          font-size: 12px; margin-bottom: 8px;
        }
        .gc-zest {
          font-size: 12px; color: var(--text-secondary);
          padding-top: 10px;
          border-top: 1px solid rgba(0,0,0,0.05);
        }
        .zup { color: #34C759; font-weight: 600; }
        .zdown { color: #FF3B30; font-weight: 600; }
      `}</style>
    </Link>
  );
}

export default MarketCard;
