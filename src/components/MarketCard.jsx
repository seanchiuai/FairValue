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
    <Link to={`/market/${property.id}`} className="market-card-wrapper">
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

      <style>{`
        .market-card-wrapper {
          display: block;
          text-decoration: none;
          color: inherit;
          background: #FFFFFF;
          border: 1px solid #E8E8ED;
          border-radius: 16px;
          overflow: hidden;
          transition: all 0.25s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .market-card-wrapper:hover {
          border-color: #D2D2D7;
          box-shadow: 0 8px 28px rgba(0,0,0,0.1);
          transform: translateY(-3px);
        }

        .card-image {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 10;
          overflow: hidden;
          background: #F0F0F2;
        }
        .card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }
        .market-card-wrapper:hover .card-image img {
          transform: scale(1.04);
        }
        .card-image-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #F0F0F2 0%, #E8E8ED 100%);
        }

        .card-badges {
          position: absolute;
          top: 10px;
          left: 10px;
          display: flex;
          gap: 6px;
        }
        .card-type-badge {
          padding: 4px 10px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(8px);
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #1D1D1F;
        }
        .card-body {
          padding: 14px 16px 16px;
        }

        .card-price {
          font-size: 22px;
          font-weight: 700;
          color: #1D1D1F;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }

        .card-specs {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }
        .card-spec {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          color: #6E6E73;
          font-weight: 500;
        }

        .card-address {
          margin: 0 0 2px 0;
          font-size: 14px;
          font-weight: 600;
          color: #1D1D1F;
          letter-spacing: -0.2px;
        }

        .card-location {
          display: flex;
          align-items: center;
          gap: 3px;
          color: #AEAEB2;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .card-zestimate {
          font-size: 12px;
          color: #8E8E93;
          padding-top: 8px;
          border-top: 1px solid #F0F0F2;
        }
        .zest-up { color: #34C759; font-weight: 600; }
        .zest-down { color: #FF3B30; font-weight: 600; }
      `}</style>
    </Link>
  );
}

export default MarketCard;
