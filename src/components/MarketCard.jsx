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
      {/* Thumbnail Section - OUTSIDE Link so upload works */}
      <div className="card-thumbnail-section">
        <Link to={`/market/${property.id}`} className="thumbnail-link">
          <MarketThumbnail 
            imageUrl={imageUrl} 
            title={property.address}
          />
        </Link>
        
        {/* Upload Controls - Only show on hover when NO image exists */}
        {showUploader && !imageUrl && (
          <div className="thumbnail-overlay" onClick={(e) => e.stopPropagation()}>
            <MarketImageUploader
              marketId={property.id}
              imageUrl={imageUrl}
              onUpload={handleUpload}
              onRemove={handleRemove}
            />
          </div>
        )}
      </div>

      <Link to={`/market/${property.id}`} className="market-card">
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

        {/* Pricing Section - SINGLE LINE */}
        <div className="pricing-section">
          <div className="price-row-single">
            <div className="price-comparison">
              <span className="price-label">List</span>
              <span className="price-value list">{formatCurrency(property.currentPrice)}</span>
            </div>
            
            <ArrowRight size={14} className="price-arrow" />
            
            <div className="price-comparison">
              <span className="price-label">Fair Value</span>
              <span className={`price-value implied ${isHigher ? 'positive' : 'negative'}`}>
                {formatCurrency(property.marketPrice)}
              </span>
            </div>
            
            <div className={`delta-badge ${isHigher ? 'positive' : 'negative'}`}>
              {isHigher ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{isHigher ? '+' : ''}{priceDiffPercent}%</span>
            </div>
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
          background: #2C3A4A;
          border: 1px solid #3A4A5D;
          border-radius: 10px;
          overflow: hidden;
          transition: all 0.15s ease;
        }

        .market-card-wrapper:hover {
          border-color: #455670;
          background: #314255;
        }

        .card-thumbnail-section {
          position: relative;
          margin: 0;
          padding: 0;
          width: 100%;
        }

        .thumbnail-link {
          display: block;
          text-decoration: none;
        }

        .thumbnail-overlay {
          position: absolute;
          bottom: 12px;
          left: 12px;
          right: 12px;
          z-index: 10;
          background: rgba(31, 42, 54, 0.98);
          border: 1px solid #3A4A5D;
          border-radius: 6px;
          padding: 8px;
        }

        .market-card {
          display: block;
          padding: 14px 16px 16px 16px;
          text-decoration: none;
          color: inherit;
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

        /* SINGLE LINE PRICING */
        .price-row-single {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 12px;
          background: #273445;
          border: 1px solid #3A4A5D;
          border-radius: 8px;
        }

        .price-comparison {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .price-label {
          font-size: 9px;
          color: #7F93A8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .price-value {
          font-size: 13px;
          font-weight: 600;
          color: #EAF0F7;
          white-space: nowrap;
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
          flex-shrink: 0;
        }

        .delta-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .delta-badge.positive {
          background: rgba(59, 167, 118, 0.15);
          color: #3BA776;
        }

        .delta-badge.negative {
          background: rgba(192, 86, 86, 0.15);
          color: #C05656;
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
