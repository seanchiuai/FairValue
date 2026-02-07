import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Bed, Bath, Maximize } from 'lucide-react';

function FeaturedMarket({ property }) {
  const formatPrice = (n) => n ? `$${n.toLocaleString()}` : '';
  const heroImg = property.photos?.[0]?.fullUrl || property.photos?.[0]?.url || property.imgSrc;

  return (
    <div className="feat-wrap">
      <Link to={`/market/${property.id}`} className="feat-hero">
        <img src={heroImg} alt={property.address} className="feat-img" />
        <div className="feat-gradient" />

        {/* Glass info panel */}
        <div className="feat-glass-panel">
          <div className="feat-info">
            <div className="feat-price">{formatPrice(property.price)}</div>
            <h1 className="feat-title">{property.address}</h1>
            <div className="feat-loc"><MapPin size={13} />{property.city}, {property.state} {property.zipCode}</div>
            <div className="feat-specs">
              {property.bedrooms != null && <span><Bed size={14} /> {property.bedrooms} bd</span>}
              {property.bathrooms != null && <span><Bath size={14} /> {property.bathrooms} ba</span>}
              {property.livingArea != null && <span><Maximize size={14} /> {property.livingArea.toLocaleString()} sqft</span>}
              {property.yearBuilt && <span>Built {property.yearBuilt}</span>}
            </div>
          </div>
          <div className="feat-cta">
            <span>View Details</span>
            <ArrowRight size={16} />
          </div>
        </div>

        <div className="feat-badge-float">Featured</div>
      </Link>

      <style>{`
        .feat-wrap { margin: 24px 32px; }

        .feat-hero {
          display: block; text-decoration: none; color: inherit;
          position: relative; border-radius: 28px;
          overflow: hidden;
          box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 2px 12px rgba(0,0,0,0.06);
        }

        .feat-img {
          width: 100%; aspect-ratio: 21/8; min-height: 300px;
          object-fit: cover; display: block;
          transition: transform 0.6s cubic-bezier(0.4,0,0.2,1);
        }
        .feat-hero:hover .feat-img { transform: scale(1.03); }

        .feat-gradient {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 50%, transparent 100%);
        }

        .feat-badge-float {
          position: absolute; top: 20px; left: 20px;
          padding: 7px 16px;
          background: rgba(255,255,255,0.6);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.7);
          border-radius: 980px;
          font-size: 12px; font-weight: 700;
          color: #FF9500; text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 16px rgba(0,0,0,0.08);
        }

        .feat-glass-panel {
          position: absolute; bottom: 20px; left: 20px; right: 20px;
          padding: 20px 24px;
          background: transparent;
          border: none;
          border-radius: 20px;
          display: flex; align-items: flex-end;
          justify-content: space-between; gap: 16px;
        }

        .feat-info { position: relative; z-index: 1; }
        .feat-price {
          font-size: 30px; font-weight: 700;
          color: white; letter-spacing: -0.8px;
          margin-bottom: 2px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }
        .feat-title {
          font-size: 18px; font-weight: 600;
          color: white; margin: 0 0 4px;
          text-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        .feat-loc {
          display: flex; align-items: center; gap: 4px;
          color: rgba(255,255,255,0.9); font-size: 13px;
          margin-bottom: 8px;
          text-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .feat-specs {
          display: flex; gap: 14px;
          color: rgba(255,255,255,0.9); font-size: 13px; font-weight: 500;
          text-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .feat-specs span {
          display: inline-flex; align-items: center; gap: 4px;
        }

        .feat-cta {
          position: relative; z-index: 1;
          display: flex; align-items: center; gap: 6px;
          padding: 10px 20px;
          background: rgba(255,255,255,0.35);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 980px;
          color: white; font-size: 14px; font-weight: 600;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 16px rgba(0,0,0,0.1);
          transition: all 0.25s;
        }
        .feat-hero:hover .feat-cta {
          background: rgba(255,255,255,0.45);
        }

        @media (max-width: 768px) {
          .feat-wrap { margin: 16px; }
          .feat-img { aspect-ratio: 16/10; min-height: 220px; }
          .feat-price { font-size: 24px; }
          .feat-title { font-size: 15px; }
          .feat-glass-panel { padding: 14px 16px; flex-direction: column; align-items: flex-start; gap: 10px; }
          .feat-specs { gap: 8px; font-size: 12px; }
        }
      `}</style>
    </div>
  );
}

export default FeaturedMarket;
