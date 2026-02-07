import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Bed, Bath, Maximize } from 'lucide-react';

function FeaturedMarket({ property }) {
  const formatPrice = (n) => n ? `$${n.toLocaleString()}` : '';
  
  // Use the largest available photo for the hero
  const heroImg = property.photos?.find(p => p.width === 1536)?.url
    || property.photos?.find(p => p.width === 960)?.url
    || property.imgSrc;

  return (
    <div className="featured-market-wrapper">
      <Link to={`/market/${property.id}`} className="featured-hero">
        <div className="featured-image">
          <img src={heroImg} alt={property.address} />
          <div className="featured-overlay">
            <div className="featured-badge">Featured Property</div>
            <div className="featured-info">
              <div className="featured-price">{formatPrice(property.price)}</div>
              <h1 className="featured-title">{property.address}</h1>
              <div className="featured-location">
                <MapPin size={14} />
                <span>{property.city}, {property.state} {property.zipCode}</span>
              </div>
              <div className="featured-specs">
                {property.bedrooms != null && <span><Bed size={14} /> {property.bedrooms} bd</span>}
                {property.bathrooms != null && <span><Bath size={14} /> {property.bathrooms} ba</span>}
                {property.livingArea != null && <span><Maximize size={14} /> {property.livingArea.toLocaleString()} sqft</span>}
                {property.yearBuilt && <span>Built {property.yearBuilt}</span>}
              </div>
            </div>
            <div className="featured-cta-btn">
              <span>View Details</span>
              <ArrowRight size={18} />
            </div>
          </div>
        </div>
      </Link>

      <style>{`
        .featured-market-wrapper {
          margin: 24px 32px;
        }
        .featured-hero {
          display: block;
          text-decoration: none;
          color: inherit;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .featured-image {
          position: relative;
          width: 100%;
          aspect-ratio: 21 / 8;
          min-height: 300px;
          overflow: hidden;
        }
        .featured-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.5s ease;
        }
        .featured-hero:hover .featured-image img {
          transform: scale(1.02);
        }
        .featured-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 50%, transparent 100%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 36px;
        }
        .featured-badge {
          position: absolute;
          top: 20px;
          left: 20px;
          padding: 6px 14px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(8px);
          border-radius: 8px;
          color: #FF9500;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .featured-info {
          margin-bottom: 16px;
        }
        .featured-price {
          font-size: 34px;
          font-weight: 700;
          color: #FFFFFF;
          letter-spacing: -1px;
          margin-bottom: 4px;
        }
        .featured-title {
          font-size: 22px;
          font-weight: 600;
          margin: 0 0 6px 0;
          color: #FFFFFF;
          letter-spacing: -0.3px;
        }
        .featured-location {
          display: flex;
          align-items: center;
          gap: 5px;
          color: rgba(255,255,255,0.8);
          font-size: 14px;
          margin-bottom: 8px;
        }
        .featured-specs {
          display: flex;
          gap: 16px;
          color: rgba(255,255,255,0.85);
          font-size: 14px;
          font-weight: 500;
        }
        .featured-specs span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .featured-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          background: rgba(255,255,255,0.2);
          backdrop-filter: blur(8px);
          border-radius: 980px;
          color: #FFFFFF;
          font-size: 14px;
          font-weight: 500;
          width: fit-content;
          transition: background 0.2s ease;
        }
        .featured-hero:hover .featured-cta-btn {
          background: rgba(255,255,255,0.3);
        }
        @media (max-width: 768px) {
          .featured-market-wrapper { margin: 16px; }
          .featured-image { aspect-ratio: 16/10; min-height: 220px; }
          .featured-price { font-size: 26px; }
          .featured-title { font-size: 18px; }
          .featured-overlay { padding: 20px; }
          .featured-specs { gap: 10px; font-size: 12px; }
        }
      `}</style>
    </div>
  );
}

export default FeaturedMarket;
