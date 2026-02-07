import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons in webpack/CRA
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function PropertyMap({ properties }) {
  if (!properties.length) return null;

  // Center on average lat/lng
  const validProps = properties.filter(p => p.latitude && p.longitude);
  if (!validProps.length) return <div className="map-empty">No location data available</div>;

  const centerLat = validProps.reduce((s, p) => s + p.latitude, 0) / validProps.length;
  const centerLng = validProps.reduce((s, p) => s + p.longitude, 0) / validProps.length;

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
          <Marker key={p.id} position={[p.latitude, p.longitude]}>
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

      <style>{`
        .map-wrap {
          height: 500px;
          margin: 0 32px 16px;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 8px 40px rgba(0,0,0,0.1);
          border: 1px solid rgba(255,255,255,0.6);
        }
        .map-empty {
          height: 300px; display: flex;
          align-items: center; justify-content: center;
          color: var(--text-muted); font-size: 15px;
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
