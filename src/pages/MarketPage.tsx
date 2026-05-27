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
  Bookmark,
  GraduationCap,
  Info,
  Database,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Gavel,
  AlertTriangle,
  ListChecks,
  Scale,
  Sparkles,
  Target
} from 'lucide-react';
import { useProperties } from '../data/properties';
import { usePropertyDataManifest } from '../data/propertyManifest';
import { useSession } from '../hooks/useSession';
import { usePropertyWatchlist } from '../hooks/usePropertyWatchlist';
import { buildUserAuthHeaders, saveHostToken } from '../lib/fairValueAuth';
import { getRoomJoinError, readRoomMutationResponse } from '../lib/roomResponses';
import { useMarketChart } from '../hooks/useMarketChart';
import { calculateImpliedPrice } from '../lib/lmsr';
import { generateMarketIntelligence } from '../lib/marketIntelligence';
import { useToast } from '../contexts/ToastContext';
import './MarketPage.css';

const startRoomErrorId = 'market-start-room-error';

type RoomCreateResponse = {
  room_code?: string;
  host_token?: string;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

function formatDataTimestamp(value?: string | null) {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const MarketPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const { properties, loading } = useProperties();
  const { manifest, loading: manifestLoading } = usePropertyDataManifest();
  const { ensureIdentity } = useSession();
  const { isWatched, toggleProperty } = usePropertyWatchlist();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
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
      .catch(() => console.warn('Chart history unavailable'));
  }, [propertyId, property, loadHistory]);

  const handleStartBid = async () => {
    if (!property || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const identity = await ensureIdentity();
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildUserAuthHeaders(identity.user_token),
        },
        body: JSON.stringify({
          address: property.address,
          asking_price: property.price,
          host_user_id: identity.user_id,
        }),
      });
      const data = await readJson<RoomCreateResponse>(res);
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create room');
      if (!data.room_code || !data.host_token) throw new Error('Room creation response was invalid');
      saveHostToken(data.room_code, data.host_token);

      const joinRes = await fetch(`/api/rooms/${data.room_code}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildUserAuthHeaders(identity.user_token),
        },
        body: JSON.stringify({
          session_id: identity.user_id,
          user_id: identity.user_id,
          nickname: 'Host',
        }),
      });
      const joinData = await readRoomMutationResponse(joinRes);
      const joinError = getRoomJoinError(
        joinRes,
        joinData,
        'Failed to join room as host',
        'Host join response was invalid'
      );
      if (joinError) throw new Error(joinError);

      navigate(`/host/${data.room_code}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start room';
      setCreateError(message);
      showToast(message, 'error');
      setCreating(false);
    }
  };

  const handleToggleWatchlist = () => {
    if (!property) return;
    const added = toggleProperty(property.id);
    showToast(added ? 'Property added to watchlist' : 'Property removed from watchlist', 'success');
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
  const provenanceSource = property.attributionInfo?.mlsName
    || property.listingDataSource
    || property.listingSource
    || property.priceHistory.find((entry) => entry.source)?.source
    || 'Zillow property snapshot';
  const freshnessDate = formatDataTimestamp(
    property.attributionInfo?.lastChecked
      || property.attributionInfo?.lastUpdated
      || property.priceHistory[0]?.date
      || null
  );
  const freshnessLabel = freshnessDate ? ` Checked ${freshnessDate}.` : '';
  const manifestRecord = manifest?.records.find((record) => record.property_id === property.id) || null;
  const sourceHash = manifest?.source_files[0]?.sha256.slice(0, 12) || null;
  const latestObserved = formatDataTimestamp(manifest?.freshness.latest_observed_at || null);
  const providerSummary = manifest?.provider_summary.slice(0, 2).map((entry) => `${entry.provider} (${entry.count})`).join(', ');
  const dataQualityText = manifestRecord
    ? `${manifestRecord.field_coverage_percent}% tracked-field coverage; ${
        manifestRecord.missing_critical_fields.length
          ? `missing critical fields: ${manifestRecord.missing_critical_fields.join(', ')}`
          : 'critical fields present'
      }.`
    : manifestLoading
      ? 'Dataset manifest loading.'
      : 'Dataset manifest unavailable for this property.';
  const datasetText = manifest
    ? `${manifest.property_count} records, latest source observation ${latestObserved || 'undated'}, providers ${providerSummary || 'unspecified'}, source hash ${sourceHash}.`
    : 'The manifest check runs in repo verification so stale static data changes fail fast.';
  const intelligence = generateMarketIntelligence(property);
  const watched = isWatched(property.id);

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
            <button
              type="button"
              className={`watchlist-toggle ${watched ? 'active' : ''}`}
              onClick={handleToggleWatchlist}
              aria-pressed={watched}
              aria-label={`${watched ? 'Remove from' : 'Add to'} watchlist`}
            >
              <Bookmark size={16} />
              {watched ? 'Watching' : 'Watch'}
            </button>
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

        {/* Market Trust */}
        <section className="detail-section market-trust-section" aria-labelledby="market-trust-title" data-testid="market-trust-section">
          <div className="market-trust-head">
            <h2 id="market-trust-title" className="section-title"><ShieldCheck size={18} /> Market Trust</h2>
            <span className="market-trust-pill">Simulation market</span>
          </div>
          <div className="market-trust-list">
            <div className="market-trust-row">
              <Info size={17} aria-hidden="true" />
              <div>
                <span className="trust-row-title">Simulation credits</span>
                <p>FairValue balances and wagers are play-money credits for a valuation game, not real-money trades or investment products.</p>
              </div>
            </div>
            <div className="market-trust-row">
              <TrendingUp size={17} aria-hidden="true" />
              <div>
                <span className="trust-row-title">LMSR probability</span>
                <p>The blue Over % is the LMSR market probability that the final value settles above the asking price.</p>
              </div>
            </div>
            <div className="market-trust-row">
              <DollarSign size={17} aria-hidden="true" />
              <div>
                <span className="trust-row-title">Implied fair value</span>
                <p>The green fair-value line translates that probability around the {formatPrice(property.price)} asking price. It is market-implied, not an appraisal.</p>
              </div>
            </div>
            <div className="market-trust-row">
              <Database size={17} aria-hidden="true" />
              <div>
                <span className="trust-row-title">Listing provenance</span>
                <p>Property context comes from {provenanceSource}.{freshnessLabel} Zestimate, rent, tax, and school values are reference data, not settlement authority.</p>
              </div>
            </div>
            <div className="market-trust-row">
              <ListChecks size={17} aria-hidden="true" />
              <div>
                <span className="trust-row-title">Data quality contract</span>
                <p>{dataQualityText} {datasetText}</p>
              </div>
            </div>
            <div className="market-trust-row">
              <Gavel size={17} aria-hidden="true" />
              <div>
                <span className="trust-row-title">Settlement evidence</span>
                <p>In multiplayer rooms, the host settles with an actual appraisal or sale price; room events preserve joins, bets, and settlement for replay.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Market Intelligence */}
        <section className="detail-section intelligence-section" aria-labelledby="market-intelligence-title" data-testid="market-intelligence-section">
          <div className="intelligence-head">
            <div>
              <h2 id="market-intelligence-title" className="section-title"><Sparkles size={18} /> Market Intelligence</h2>
              <p className="intelligence-summary">{intelligence.summary}</p>
            </div>
            <span className={`intelligence-confidence ${intelligence.confidence}`}>
              {intelligence.confidence} confidence
            </span>
          </div>

          <div className="intelligence-metrics" aria-label="Market intelligence metrics">
            {intelligence.metrics.map((metric) => (
              <div key={metric.label} className={`intelligence-metric ${metric.tone}`}>
                <span className="intelligence-metric-label">{metric.label}</span>
                <span className="intelligence-metric-value">{metric.value}</span>
                <span className="intelligence-metric-detail">{metric.detail}</span>
              </div>
            ))}
          </div>

          <div className="intelligence-cases">
            <div className="intelligence-case positive">
              <h3><TrendingUp size={16} /> Bull case</h3>
              <ul>
                {intelligence.bullish_cases.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="intelligence-case negative">
              <h3><TrendingDown size={16} /> Bear case</h3>
              <ul>
                {intelligence.bearish_cases.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="intelligence-case caution">
              <h3><AlertTriangle size={16} /> Uncertainty map</h3>
              <ul>
                {intelligence.uncertainty_cases.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="intelligence-prompts" aria-label="Scenario prompts">
            <h3><Target size={16} /> Scenario prompts</h3>
            <div className="prompt-list">
              {intelligence.scenario_prompts.map((prompt) => (
                <div key={prompt.label} className="prompt-item">
                  <span className="prompt-label">{prompt.label}</span>
                  <p className="prompt-question">{prompt.question}</p>
                  <p className="prompt-rationale">{prompt.rationale}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="intelligence-settlement">
            <h3><ListChecks size={16} /> Settlement checklist</h3>
            <ul>
              {intelligence.settlement_checklist.map((item) => (
                <li key={item}><Scale size={14} aria-hidden="true" /> {item}</li>
              ))}
            </ul>
          </div>
        </section>

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
              {createError && (
                <p id={startRoomErrorId} className="bid-error" role="alert" aria-live="assertive">
                  {createError}
                </p>
              )}
            </div>
            <button
              className="bid-cta-btn"
              onClick={handleStartBid}
              disabled={creating}
              aria-describedby={createError ? startRoomErrorId : undefined}
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
