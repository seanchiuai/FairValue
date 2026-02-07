import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
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
import { MarketThumbnail } from './MarketThumbnail';
import { MarketImageUploader } from './MarketImageUploader';
import './MarketCard.css';

function MarketCard({ 
  property, 
  imageUrl, 
  onImageUpload, 
  onImageRemove 
}) {
  const [showUploader, setShowUploader] = useState(false);

  const formatCurrency = (value) => {
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
  const daysLeft = Math.max(1, 30 - property.daysOnMarket);

  const handleUpload = async (file) => {
    await onImageUpload(property.id, file);
  };

  const handleRemove = async () => {
    await onImageRemove(property.id);
  };

  return (
    <div 
      className="market-card-wrapper"
      onMouseEnter={() => setShowUploader(true)}
      onMouseLeave={() => setShowUploader(false)}
    >
      <Link to={`/market/${property.id}`} className="market-card">
        {/* Thumbnail Section */}
        <div className="card-thumbnail-section">
          <MarketThumbnail 
            imageUrl={imageUrl} 
            title={property.address}
          />
          
          {/* Upload Controls - Show on Hover */}
          {showUploader && (
            <div className="thumbnail-overlay">
              <MarketImageUploader
                marketId={property.id}
                imageUrl={imageUrl}
                onUpload={handleUpload}
                onRemove={handleRemove}
              />
            </div>
          )}
        </div>

        {/* Card Header */}
        <div className="card-header">
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

      <style>{`
        .market-card-wrapper {
          position: relative;
        }

        .card-thumbnail-section {
          position: relative;
          margin-bottom: 12px;
        }

        .thumbnail-overlay {
          position: absolute;
          bottom: 8px;
          left: 8px;
          right: 8px;
          z-index: 10;
          background: rgba(31, 42, 54, 0.95);
          border: 1px solid #3A4A5D;
          border-radius: 6px;
          padding: 8px;
          backdrop-filter: blur(4px);
        }

        .market-card {
          display: block;
          background: #2C3A4A;
          border: 1px solid #3A4A5D;
          border-radius: 10px;
          padding: 16px;
          text-decoration: none;
          color: inherit;
          transition: all 0.15s ease;
        }

        .market-card:hover {
          border-color: #455670;
          background: #314255;
        }

        .card-header {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }

        .property-info {
          flex: 1;
          min-width: 0;
        }

        .property-address {
          margin: 0 0 4px 0;
          font-size: 15px;
          font-weight: 600;
          color: #EAF0F7;
          letter-spacing: -0.2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .property-location {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .neighborhood-tag {
          display: inline-flex;
          padding: 2px 6px;
          background: #273445;
          border: 1px solid #3A4A5D;
          border-radius: 4px;
          color: #4BA3FF;
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .location-text {
          color: #7F93A8;
          font-size: 11px;
        }

        .property-specs {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          padding: 10px 0;
          border-top: 1px solid #3A4A5D;
          border-bottom: 1px solid #3A4A5D;
        }

        .spec-item {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #A9B7C8;
          font-size: 12px;
          font-weight: 500;
        }

        .spec-item svg {
          color: #7F93A8;
        }

        .spec-label {
          color: #7F93A8;
          font-weight: 400;
        }

        .pricing-section {
          margin-bottom: 12px;
        }

        .price-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .price-block {
          flex: 1;
        }

        .price-label {
          display: block;
          font-size: 10px;
          color: #7F93A8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .price-value {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #EAF0F7;
        }

        .price-value.list {
          color: #A9B7C8;
        }

        .price-value.implied.positive {
          color: #3BA776;
        }

        .price-value.implied.negative {
          color: #C05656;
        }

        .price-arrow {
          color: #7F93A8;
          padding: 0 6px;
        }

        .delta-row {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }

        .delta-row.positive {
          background: rgba(59, 167, 118, 0.1);
          color: #3BA776;
        }

        .delta-row.negative {
          background: rgba(192, 86, 86, 0.1);
          color: #C05656;
        }

        .delta-amount {
          font-weight: 600;
        }

        .delta-percent {
          opacity: 0.85;
        }

        .delta-label {
          margin-left: auto;
          opacity: 0.75;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .market-stats {
          display: flex;
          gap: 14px;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #3A4A5D;
        }

        .market-stats .stat-item {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #7F93A8;
          font-size: 11px;
        }

        .market-stats .stat-item svg {
          color: #7F93A8;
        }

        .market-stats .stat-value {
          font-weight: 500;
          color: #A9B7C8;
        }

        .card-action {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 0;
          color: #7F93A8;
          font-size: 12px;
          font-weight: 500;
          transition: color 0.15s ease;
        }

        .market-card:hover .card-action {
          color: #4BA3FF;
        }
      `}</style>
    </div>
  );
}

export default MarketCard;
