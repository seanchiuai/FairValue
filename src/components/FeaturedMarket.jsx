import React from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  Clock,
  ArrowRight
} from 'lucide-react';
import { MarketThumbnail } from './MarketThumbnail';
import { MarketImageUploader } from './MarketImageUploader';

function FeaturedMarket({ 
  property, 
  imageUrl, 
  onImageUpload, 
  onImageRemove 
}) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const priceDelta = property.marketPrice - property.currentPrice;
  const priceDeltaPercent = ((priceDelta / property.currentPrice) * 100).toFixed(1);

  const handleUpload = async (file) => {
    await onImageUpload(property.id, file);
  };

  const handleRemove = async () => {
    await onImageRemove(property.id);
  };

  return (
    <div className="featured-market-wrapper">
      <div className="featured-hero">
        <div className="featured-content">
          {/* Thumbnail in left content area */}
          <div className="featured-thumbnail-container">
            <MarketThumbnail 
              imageUrl={imageUrl} 
              title={property.address}
            />
            <div className="featured-uploader">
              <MarketImageUploader
                marketId={property.id}
                imageUrl={imageUrl}
                onUpload={handleUpload}
                onRemove={handleRemove}
              />
            </div>
          </div>

          <div className="featured-badge">
            <TrendingUp size={14} />
            <span>Trending</span>
          </div>
          
          <h1 className="featured-title">{property.address}</h1>
          
          <div className="featured-location">
            <span>Mission District, {property.city}, {property.state} {property.zipCode}</span>
          </div>

          <p className="featured-description">
            High-activity market with {property.participantCount.toLocaleString()} traders predicting the appraisal outcome.
            {property.daysOnMarket < 7 && ' New listing with strong early volume.'}
          </p>

          <div className="featured-stats">
            <div className="featured-stat">
              <DollarSign size={16} className="stat-icon" />
              <div>
                <span className="stat-label">Volume</span>
                <span className="stat-value">${(property.volume / 1000).toFixed(0)}k</span>
              </div>
            </div>
            <div className="featured-stat">
              <Users size={16} className="stat-icon" />
              <div>
                <span className="stat-label">Traders</span>
                <span className="stat-value">{property.participantCount.toLocaleString()}</span>
              </div>
            </div>
            <div className="featured-stat">
              <Clock size={16} className="stat-icon" />
              <div>
                <span className="stat-label">Ends in</span>
                <span className="stat-value">14 days</span>
              </div>
            </div>
          </div>
        </div>

        <div className="featured-cta">
          <div className="price-preview">
            <div className="price-row">
              <span className="price-label">List Price</span>
              <span className="price-value">
                ${property.currentPrice.toLocaleString()}
              </span>
            </div>
            <div className="price-row">
              <span className="price-label">Implied Fair Value</span>
              <span className={`price-value ${priceDelta >= 0 ? 'positive' : 'negative'}`}>
                ${property.marketPrice.toLocaleString()}
                <span className="delta-badge">
                  {priceDelta >= 0 ? '+' : ''}{priceDeltaPercent}%
                </span>
              </span>
            </div>
          </div>
          <button className="btn-view-market">
            View Market
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <style>{`
        .featured-market-wrapper {
          margin: 24px;
        }

        .featured-hero {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 0;
          background: #2C3A4A;
          border: 1px solid #3A4A5D;
          border-radius: 12px;
          overflow: hidden;
        }

        .featured-content {
          display: flex;
          flex-direction: column;
          padding: 24px;
        }

        .featured-thumbnail-container {
          margin-bottom: 16px;
          position: relative;
        }

        .featured-thumbnail-container .market-thumbnail,
        .featured-thumbnail-container .market-thumbnail-placeholder {
          max-width: 400px;
        }

        .featured-uploader {
          margin-top: 8px;
        }

        .featured-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #273445;
          border: 1px solid #3A4A5D;
          border-radius: 4px;
          color: #C8A24A;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 14px;
          width: fit-content;
        }

        .featured-title {
          font-size: 26px;
          font-weight: 700;
          margin: 0 0 6px 0;
          letter-spacing: -0.3px;
          color: #EAF0F7;
        }

        .featured-location {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #A9B7C8;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .featured-description {
          color: #7F93A8;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 20px;
          max-width: 480px;
        }

        .featured-stats {
          display: flex;
          gap: 24px;
        }

        .featured-stat {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .stat-icon {
          color: #7F93A8;
        }

        .featured-stat .stat-label {
          display: block;
          font-size: 11px;
          color: #7F93A8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .featured-stat .stat-value {
          display: block;
          font-size: 16px;
          font-weight: 600;
          color: #EAF0F7;
        }

        .featured-cta {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 16px;
          padding: 24px;
          background: #273445;
          border-left: 1px solid #3A4A5D;
        }

        .price-preview {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .price-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px 16px;
          background: #2C3A4A;
          border: 1px solid #3A4A5D;
          border-radius: 8px;
        }

        .price-label {
          font-size: 11px;
          color: #7F93A8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .price-value {
          font-size: 18px;
          font-weight: 600;
          color: #EAF0F7;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .price-value.positive {
          color: #3BA776;
        }

        .price-value.negative {
          color: #C05656;
        }

        .delta-badge {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          background: #273445;
          color: #A9B7C8;
          font-weight: 500;
        }

        .btn-view-market {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 24px;
          background: #4BA3FF;
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .btn-view-market:hover {
          background: #2F8EFF;
        }

        @media (max-width: 1024px) {
          .featured-hero {
            grid-template-columns: 1fr;
          }

          .featured-cta {
            border-left: none;
            border-top: 1px solid #3A4A5D;
          }

          .featured-thumbnail-container .market-thumbnail,
          .featured-thumbnail-container .market-thumbnail-placeholder {
            max-width: 100%;
          }
        }

        @media (max-width: 768px) {
          .featured-market-wrapper {
            margin: 16px;
          }

          .featured-title {
            font-size: 20px;
          }

          .featured-stats {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

export default FeaturedMarket;
