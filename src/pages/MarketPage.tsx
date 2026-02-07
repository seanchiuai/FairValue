import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  ExternalLink,
  Building2,
  Bed,
  Bath,
  Maximize,
  Calendar,
  Home,
  DollarSign,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Gavel
} from 'lucide-react';
import { useProperties } from '../data/properties';
import { useSession } from '../hooks/useSession';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import './MarketPage.css';

const MarketPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const { properties, loading } = useProperties();
  const { sessionId } = useSession();
  const [creating, setCreating] = useState(false);
  const property = properties.find(p => p.id === propertyId) || properties[0];

  // Chart with historical data from DB
  const { loadHistory, setRef: chartRef } = useMarketChart({ height: 260 });
  const historyFetchedRef = useRef(false);

  useEffect(() => {
    if (!propertyId || !property || historyFetchedRef.current) return;
    historyFetchedRef.current = true;

    fetch(`/api/markets/by-property/${propertyId}/chart`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ prob: number; time: string }>) => {
        if (data.length > 0) {
          const points = data.map((d) => ({
            probOver: d.prob,
            fairValue: calculateImpliedPrice(d.prob, property.price),
          }));
          loadHistory(points);
        }
      })
      .catch(() => {});
  }, [propertyId, property, loadHistory]);

  const handleStartBid = async () => {
    if (!property || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: property.address,
          asking_price: property.price,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      await fetch(`/api/rooms/${data.room_code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, nickname: 'Host' }),
      });

      navigate(`/host/${data.room_code}`);
    } catch {
      setCreating(false);
    }
  };

  if (loading || !property) {
    return <div className="market-page"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#7F93A8' }}>Loading property...</div></div>;
  }

  const formatPrice = (n: number) => n ? `$${n.toLocaleString()}` : '—';
  const typeLabel = (t: string) => {
    const map: Record<string, string> = { SINGLE_FAMILY: 'Single Family', CONDO: 'Condo', MULTI_FAMILY: 'Multi-Family', APARTMENT: 'Apartment', LOT: 'Lot' };
    return map[t] || t;
  };

  const heroImg = property.photos?.find(p => p.width === 1536)?.url
    || property.photos?.find(p => p.width === 960)?.url
    || property.imgSrc;

  const priceDiff = property.zestimate && property.price
    ? property.zestimate - property.price : null;
  const priceDiffPct = priceDiff !== null && property.price
    ? ((priceDiff / property.price) * 100).toFixed(1) : null;

  return (
    <div className="market-page">
      <nav className="market-nav">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          <span>Back to Markets</span>
        </Link>
        <div className="nav-title">{property.address}</div>
      </nav>

      <div className="market-content">
        {/* Hero */}
        <div className="detail-hero">
          <img src={heroImg} alt={property.address} className="detail-hero-img" />
          <div className="detail-hero-badges">
            <span className="badge-type">{typeLabel(property.homeType)}</span>
          </div>
        </div>

        {/* Price + Specs Header */}
        <div className="detail-header-card">
          <div className="detail-price-row">
            <div className="detail-price">{formatPrice(property.price)}</div>
            {property.zestimate && priceDiff !== null && (
              <div className={`detail-zestimate ${priceDiff >= 0 ? 'up' : 'down'}`}>
                <span className="zest-label">Zestimate</span>
                <span className="zest-value">{formatPrice(property.zestimate)}</span>
                <span className="zest-diff">
                  {priceDiff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {priceDiff >= 0 ? '+' : ''}{priceDiffPct}%
                </span>
              </div>
            )}
          </div>

          <div className="detail-specs">
            {property.bedrooms != null && (
              <div className="spec"><Bed size={16} /><span><strong>{property.bedrooms}</strong> Beds</span></div>
            )}
            {property.bathrooms != null && (
              <div className="spec"><Bath size={16} /><span><strong>{property.bathrooms}</strong> Baths</span></div>
            )}
            {property.livingArea != null && (
              <div className="spec"><Maximize size={16} /><span><strong>{property.livingArea.toLocaleString()}</strong> sqft</span></div>
            )}
            {property.yearBuilt && (
              <div className="spec"><Calendar size={16} /><span>Built <strong>{property.yearBuilt}</strong></span></div>
            )}
            <div className="spec"><Home size={16} /><span>{typeLabel(property.homeType)}</span></div>
          </div>

          <div className="detail-address-line">
            <MapPin size={14} />
            <span>{property.address}, {property.city}, {property.state} {property.zipCode}</span>
          </div>

          {property.brokerageName && (
            <div className="detail-broker">
              <Building2 size={13} />
              <span>Listed by {property.brokerageName}</span>
            </div>
          )}
        </div>

        {/* Market Chart */}
        <div className="detail-section">
          <div className="chart-head">
            <h2 className="section-title"><TrendingUp size={18} /> Market Activity</h2>
            <div className="chart-legend">
              <span className="legend-dot blue" /> Over %
              <span className="legend-dot green" /> Fair Value
            </div>
          </div>
          <div ref={chartRef} className="chart-container" style={{ width: '100%', height: 260 }} />
        </div>

        {/* Financial Highlights */}
        <div className="detail-section">
          <h2 className="section-title"><DollarSign size={18} /> Financial Details</h2>
          <div className="detail-grid">
            <div className="detail-stat">
              <span className="stat-label">Sale Price</span>
              <span className="stat-value">{formatPrice(property.price)}</span>
            </div>
            {property.zestimate && (
              <div className="detail-stat">
                <span className="stat-label">Zestimate</span>
                <span className="stat-value">{formatPrice(property.zestimate)}</span>
              </div>
            )}
            {property.rentZestimate && (
              <div className="detail-stat">
                <span className="stat-label">Rent Estimate</span>
                <span className="stat-value">{formatPrice(property.rentZestimate)}/mo</span>
              </div>
            )}
            {property.propertyTaxRate && (
              <div className="detail-stat">
                <span className="stat-label">Tax Rate</span>
                <span className="stat-value">{property.propertyTaxRate}%</span>
              </div>
            )}
            {property.rentZestimate && property.price > 0 && (
              <div className="detail-stat">
                <span className="stat-label">Gross Yield</span>
                <span className="stat-value">{((property.rentZestimate * 12 / property.price) * 100).toFixed(1)}%</span>
              </div>
            )}
            {property.daysOnZillow != null && (
              <div className="detail-stat">
                <span className="stat-label">Days on Zillow</span>
                <span className="stat-value">{property.daysOnZillow}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {property.description && (
          <div className="detail-section">
            <h2 className="section-title">About This Property</h2>
            <p className="detail-description">{property.description}</p>
          </div>
        )}

        {/* Price History */}
        {property.priceHistory.length > 0 && (
          <div className="detail-section">
            <h2 className="section-title">Price History</h2>
            <div className="price-history-table">
              <div className="ph-header">
                <span>Date</span>
                <span>Event</span>
                <span>Price</span>
              </div>
              {property.priceHistory.map((ph, i) => (
                <div key={i} className="ph-row">
                  <span className="ph-date">{ph.date ? new Date(ph.date).toLocaleDateString() : '—'}</span>
                  <span className="ph-event">{ph.event}</span>
                  <span className="ph-price">{ph.price > 0 ? formatPrice(ph.price) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Schools */}
        {property.schools.length > 0 && (
          <div className="detail-section">
            <h2 className="section-title"><GraduationCap size={18} /> Nearby Schools</h2>
            <div className="schools-list">
              {property.schools.map((school, i) => (
                <div key={i} className="school-item">
                  <div className="school-info">
                    <span className="school-name">{school.name}</span>
                    <span className="school-meta">{school.level} · {school.distance} mi</span>
                  </div>
                  {school.rating && (
                    <div className={`school-rating ${school.rating >= 7 ? 'good' : school.rating >= 4 ? 'avg' : 'low'}`}>
                      {school.rating}/10
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start a Bid */}
        <div className="detail-section bid-section">
          <div className="bid-section-inner">
            <div className="bid-text">
              <h2 className="section-title"><Gavel size={18} /> Multiplayer Mode</h2>
              <p className="bid-desc">Think you know the fair value? Host a live bidding game with friends and test your instincts.</p>
            </div>
            <button
              className="bid-cta-btn"
              onClick={handleStartBid}
              disabled={creating}
              style={{ opacity: creating ? 0.6 : 1 }}
            >
              {creating ? 'Creating room...' : 'Start a Bid'}
            </button>
          </div>
        </div>

        {/* Zillow Link */}
        <div className="detail-cta">
          <a href={property.hdpUrl} target="_blank" rel="noopener noreferrer" className="zillow-link">
            <ExternalLink size={16} />
            View Full Listing on Zillow
          </a>
        </div>
      </div>
    </div>
  );
};

export default MarketPage;
