import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Home, 
  Bed, 
  Bath, 
  Maximize, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Users,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Property } from '../data/properties';
import './PropertyCard.css';

interface PropertyCardProps {
  property: Property;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const priceDiff = property.marketPrice - property.currentPrice;
  const priceDiffPercent = ((priceDiff / property.currentPrice) * 100).toFixed(1);
  const isHigher = priceDiff > 0;

  // Calculate days left (mock)
  const daysLeft = Math.max(1, 30 - property.daysOnMarket);

  return (
    <Link to={`/market/${property.id}`} className="market-card">
      {/* Card Header */}
      <div className="card-header">
        <div className="property-tile">
          <Home size={28} strokeWidth={1.5} />
        </div>
        
        <div className="property-info">
          <h3 className="property-address">{property.address}</h3>
          <div className="property-location">
            <span className="neighborhood-tag">Mission District</span>
            <span className="location-text">{property.city}, {property.state} {property.zipCode}</span>
          </div>
        </div>
      </div>

      {/* Property Specs */}
      <div className="property-specs">
        <div className="spec-item">
          <Bed size={14} />
          <span>{property.beds} <span className="spec-label">beds</span></span>
        </div>
        <div className="spec-item">
          <Bath size={14} />
          <span>{property.baths} <span className="spec-label">baths</span></span>
        </div>
        <div className="spec-item">
          <Maximize size={14} />
          <span>{property.sqft.toLocaleString()} <span className="spec-label">sqft</span></span>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="pricing-section">
        <div className="price-row">
          <div className="price-block">
            <span className="price-label">List Price</span>
            <span className="price-value list">{formatCurrency(property.currentPrice)}</span>
          </div>
          
          <div className="price-arrow">
            <ArrowRight size={16} />
          </div>
          
          <div className="price-block">
            <span className="price-label">Implied Fair Value</span>
            <span className={`price-value implied ${isHigher ? 'positive' : 'negative'}`}>
              {formatCurrency(property.marketPrice)}
            </span>
          </div>
        </div>

        <div className={`delta-row ${isHigher ? 'positive' : 'negative'}`}>
          {isHigher ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span className="delta-amount">
            {isHigher ? '+' : ''}{formatCurrency(Math.abs(priceDiff))}
          </span>
          <span className="delta-percent">
            ({isHigher ? '+' : ''}{priceDiffPercent}%)
          </span>
          <span className="delta-label">
            {isHigher ? 'Above list' : 'Below list'}
          </span>
        </div>
      </div>

      {/* Market Stats */}
      <div className="market-stats">
        <div className="stat-item">
          <DollarSign size={14} />
          <span className="stat-value">${(property.volume / 1000).toFixed(0)}k vol</span>
        </div>
        <div className="stat-item">
          <Users size={14} />
          <span className="stat-value">{property.participantCount.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <Clock size={14} />
          <span className="stat-value">{daysLeft}d left</span>
        </div>
      </div>

      {/* Card Action */}
      <div className="card-action">
        <span className="action-text">View Market</span>
        <ArrowRight size={16} />
      </div>
    </Link>
  );
};

export default PropertyCard;
