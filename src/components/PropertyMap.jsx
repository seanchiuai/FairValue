import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Price-to-color: green (low) → grey (mid) → red (high)
function priceColor(price, min, max) {
  if (max === min) return '#8E8E93';
  const t = (price - min) / (max - min); // 0 = cheapest, 1 = most expensive
  // Green (#34C759) → Grey (#8E8E93) → Red (#FF3B30)
  if (t <= 0.5) {
    const s = t * 2; // 0→1 within green-to-grey
    const r = Math.round(52 + (142 - 52) * s);
    const g = Math.round(199 + (142 - 199) * s);
    const b = Math.round(89 + (147 - 89) * s);
    return `rgb(${r},${g},${b})`;
  } else {
    const s = (t - 0.5) * 2; // 0→1 within grey-to-red
    const r = Math.round(142 + (255 - 142) * s);
    const g = Math.round(142 + (59 - 142) * s);
    const b = Math.round(147 + (48 - 147) * s);
    return `rgb(${r},${g},${b})`;
  }
}

function shortPrice(n) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

function createPriceIcon(price, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background: ${color};
      color: white;
      font-size: 11px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 4px 10px;
      border-radius: 8px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      border: 2px solid rgba(255,255,255,0.8);
      text-align: center;
      position: relative;
      display: inline-block;
    "><span>${shortPrice(price)}</span><div style="
      position: absolute;
      bottom: -6px; left: 50%;
      transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 6px solid ${color};
    "></div></div>`,
    iconSize: null,
    iconAnchor: [30, 32],
    popupAnchor: [0, -32],
  });
}

function PropertyMap({ properties }) {
  if (!properties.length) return null;

  const validProps = properties.filter(p => p.latitude && p.longitude);
  if (!validProps.length) return <div className="map-empty">No location data available</div>;

  const centerLat = validProps.reduce((s, p) => s + p.latitude, 0) / validProps.length;
  const centerLng = validProps.reduce((s, p) => s + p.longitude, 0) / validProps.length;

  const prices = validProps.map(p => p.price).filter(Boolean);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const formatPrice = (n) => n ? `$${n.toLocaleString()}` : '';
  const getThumb = (p) => p.photos?.[0]?.url || '';

  return (
    <div className="map-wrap">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={14}
        style={{ width: '100%', height: '100%', borderRadius: '20px' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validProps.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={createPriceIcon(p.price, priceColor(p.price, minPrice, maxPrice))}
          >
            <Popup>
              <div className="map-popup">
                {getThumb(p) && <img src={getThumb(p)} alt="" className="map-popup-img" />}
                <div className="map-popup-info">
                  <strong className="map-popup-price">{formatPrice(p.price)}</strong>
                  <span className="map-popup-addr">{p.address}</span>
                  <span className="map-popup-specs">
                    {p.bedrooms && `${p.bedrooms}bd`} {p.bathrooms && `${p.bathrooms}ba`} {p.livingArea && `${p.livingArea.toLocaleString()}sqft`}
                  </span>
                  <Link to={`/market/${p.id}`} className="map-popup-link">View Details →</Link>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="map-legend">
        <span className="map-legend-label">{shortPrice(minPrice)}</span>
        <div className="map-legend-bar" />
        <span className="map-legend-label">{shortPrice(maxPrice)}</span>
      </div>

      <style>{`
        .map-wrap {
          height: 500px;
          margin: 0 32px 16px;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 8px 40px rgba(0,0,0,0.1);
          border: 1px solid rgba(255,255,255,0.6);
          position: relative;
        }
        .map-empty {
          height: 300px; display: flex;
          align-items: center; justify-content: center;
          color: var(--text-muted); font-size: 15px;
        }
        .map-legend {
          position: absolute; bottom: 16px; left: 50%;
          transform: translateX(-50%); z-index: 999;
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.6);
          border-radius: 980px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }
        .map-legend-label {
          font-size: 11px; font-weight: 600;
          color: #636366;
        }
        .map-legend-bar {
          width: 80px; height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, #34C759, #8E8E93, #FF3B30);
        }
        .map-popup {
          display: flex; flex-direction: column;
          gap: 8px; min-width: 180px;
        }
        .map-popup-img {
          width: 100%; height: 100px;
          object-fit: cover; border-radius: 8px;
        }
        .map-popup-info {
          display: flex; flex-direction: column; gap: 2px;
        }
        .map-popup-price {
          font-size: 16px; font-weight: 700;
          color: #1C1C1E;
        }
        .map-popup-addr {
          font-size: 12px; color: #636366;
        }
        .map-popup-specs {
          font-size: 11px; color: #8E8E93;
        }
        .map-popup-link {
          font-size: 12px; color: #007AFF;
          text-decoration: none; font-weight: 600;
          margin-top: 4px;
        }
        .map-popup-link:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .map-wrap { height: 350px; margin: 0 16px 12px; border-radius: 20px; }
        }
      `}</style>
    </div>
  );
}

export default PropertyMap;
