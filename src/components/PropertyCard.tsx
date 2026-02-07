import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRight, Bed, Bath, Maximize } from 'lucide-react';
import { Property } from '../data/properties';
import './PropertyCard.css';

interface PropertyCardProps {
  property: Property;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  const formatPrice = (n: number) => n ? `$${n.toLocaleString()}` : '—';

  return (
    <Link to={`/market/${property.id}`} className="market-card">
      <div className="card-header">
        <div className="property-info">
          <div className="card-price">{formatPrice(property.price)}</div>
          <h3 className="property-address">{property.address}</h3>
          <div className="property-location">
            <MapPin size={12} />
            <span className="location-text">{property.city}, {property.state} {property.zipCode}</span>
          </div>
          <div className="card-specs-inline">
            {property.bedrooms != null && <span><Bed size={12} /> {property.bedrooms}</span>}
            {property.bathrooms != null && <span><Bath size={12} /> {property.bathrooms}</span>}
            {property.livingArea != null && <span><Maximize size={12} /> {property.livingArea.toLocaleString()}</span>}
          </div>
        </div>
      </div>

      <div className="card-action">
        <span className="action-text">View Details</span>
        <ArrowRight size={16} />
      </div>
    </Link>
  );
};

export default PropertyCard;
