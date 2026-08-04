import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Bed, Bath, Maximize } from 'lucide-react';
import './FeaturedMarket.css';

function FeaturedMarket({ property }) {
  const formatPrice = (n) => n ? `$${n.toLocaleString()}` : '';
  const heroImg = property.photos?.length
    ? property.photos.reduce((best, p) => (p.width > (best?.width ?? 0) ? p : best), property.photos[0]).url
    : property.imgSrc;

  return (
    <div className="feat-wrap">
      <Link to={`/market/${property.id}`} className="feat-hero">
        <img src={heroImg} alt={property.address} className="feat-img" />

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

    </div>
  );
}

export default FeaturedMarket;
