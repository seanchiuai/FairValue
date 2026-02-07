import React from 'react';

// Inline Home icon SVG
const HomeIcon = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export function MarketThumbnail({ imageUrl, title }) {
  if (imageUrl) {
    return (
      <div className="market-thumbnail">
        <img
          src={imageUrl}
          alt={title}
          className="thumbnail-image"
        />
        <style>{`
          .market-thumbnail {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            background: #F0F0F2;
            overflow: hidden;
            border-radius: 12px 12px 0 0;
          }

          .thumbnail-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
        `}</style>
      </div>
    );
  }

  // Fallback placeholder
  return (
    <div className="market-thumbnail-placeholder">
      <HomeIcon size={32} />
      <style>{`
        .market-thumbnail-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: linear-gradient(135deg, #F0F0F2 0%, #E8E8ED 100%);
          border-radius: 12px 12px 0 0;
          color: #AEAEB2;
        }
      `}</style>
    </div>
  );
}

export default MarketThumbnail;
