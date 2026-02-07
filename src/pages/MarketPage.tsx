import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Bed, 
  Bath, 
  Maximize, 
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Search,
  Brain,
  Loader2,
  MapPin,
  Building2,
  Gavel,
  ExternalLink,
  Wifi,
  WifiOff,
  Users
} from 'lucide-react';
import { createChart, IChartApi, ISeriesApi, LineData } from 'lightweight-charts';
import { properties, Property } from '../data/properties';
import PhotoGallery from '../components/PhotoGallery';
import './MarketPage.css';

interface Bet {
  id: string;
  direction: 'higher' | 'lower';
  amount: number;
  priceAtBet: number;
  timestamp: Date;
}

const MarketPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const fairValueSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  const property: Property = properties.find(p => p.id === propertyId) || properties[0];
  const originalPrice = property.price;

  // Room state
  const [roomCode, setRoomCode] = useState<string>('');
  const [sessionId] = useState(() => localStorage.getItem('fv_session') || (() => { const id = Math.random().toString(36).slice(2, 10); localStorage.setItem('fv_session', id); return id; })());
  const [nickname] = useState(() => localStorage.getItem('fv_nickname') || `Trader${Math.floor(Math.random() * 999)}`);
  const [connected, setConnected] = useState(false);
  const [traders, setTraders] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  
  // Market state
  const [fairValue, setFairValue] = useState(originalPrice);
  const [volume, setVolume] = useState(0);
  const [betAmount, setBetAmount] = useState<string>('');
  const [bets, setBets] = useState<Bet[]>([]);

  // AI Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showAISearch, setShowAISearch] = useState<boolean>(false);

  // Auto-create room for this property and connect WebSocket
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;

    const setupRoom = async () => {
      try {
        // Create room for this property
        const createRes = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: property.address, asking_price: originalPrice }),
        });
        const createData = await createRes.json();
        if (cancelled) return;
        const code = createData.room_code;
        setRoomCode(code);

        // Join the room
        await fetch(`/api/rooms/${code}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, nickname }),
        });

        // Connect WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${code}`);
        wsRef.current = ws;
        ws.onopen = () => setConnected(true);
        ws.onclose = () => setConnected(false);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'bet' || data.type === 'ai_trade') {
              if (data.market) {
                const m = data.market;
                const fv = originalPrice * (1 + (m.prob_over - 0.5) * 0.3);
                setFairValue(fv);
                setVolume(m.total_wagered || 0);
                setTraders(m.total_trades || 0);
                // Update chart
                if (fairValueSeriesRef.current) {
                  const ts = Date.now() / 1000 as LineData['time'];
                  fairValueSeriesRef.current.update({ time: ts, value: fv });
                }
              }
            }
            if (data.type === 'join') {
              setTraders(t => t + 1);
            }
          } catch {}
        };

        // Fetch initial state
        const stateRes = await fetch(`/api/rooms/${code}/state`);
        const stateData = await stateRes.json();
        if (!cancelled && stateData.market) {
          const m = stateData.market;
          const fv = originalPrice * (1 + (m.prob_over - 0.5) * 0.3);
          setFairValue(fv);
          setVolume(m.total_wagered || 0);
          setTraders(m.total_trades || 0);
        }
      } catch (err) {
        console.log('Backend not available, using local trading');
      }
    };

    setupRoom();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [propertyId, property.address, originalPrice, sessionId, nickname]);

  // Keep WebSocket alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Initialize chart with glass-matching colors
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8E8E93' },
      grid: { vertLines: { color: 'rgba(0,0,0,0.04)' }, horzLines: { color: 'rgba(0,0,0,0.04)' } },
      width: chartContainerRef.current.clientWidth,
      height: 260,
      rightPriceScale: { borderColor: 'rgba(0,0,0,0.05)' },
      timeScale: { borderColor: 'rgba(0,0,0,0.05)' },
    });

    const series = chart.addLineSeries({
      color: '#34C759', lineWidth: 2,
      lastValueVisible: true, priceLineVisible: false,
    });

    chartRef.current = chart;
    fairValueSeriesRef.current = series;

    const initialData: LineData[] = [];
    const now = Date.now();
    for (let i = 20; i >= 0; i--) {
      const ts = (now - i * 60000) / 1000 as LineData['time'];
      initialData.push({ time: ts, value: originalPrice });
    }
    series.setData(initialData);

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, [originalPrice]);

  const placeBet = async (direction: 'higher' | 'lower') => {
    const wager = parseFloat(betAmount);
    if (!wager || wager <= 0) return;

    const outcome = direction === 'higher' ? 'over' : 'under';

    // Try backend first
    if (roomCode) {
      try {
        const res = await fetch(`/api/rooms/${roomCode}/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, outcome, wager }),
        });
        const data = await res.json();
        if (!data.error && data.market) {
          const m = data.market;
          const fv = originalPrice * (1 + (m.prob_over - 0.5) * 0.3);
          setFairValue(fv);
          setVolume(m.total_wagered || 0);
          setTraders(m.total_trades || 0);
          
          const newBet: Bet = { id: Math.random().toString(36).slice(2), direction, amount: wager, priceAtBet: fairValue, timestamp: new Date() };
          setBets(prev => [newBet, ...prev]);
          setBetAmount('');
          
          if (fairValueSeriesRef.current) {
            fairValueSeriesRef.current.update({ time: Date.now() / 1000 as LineData['time'], value: fv });
          }
          return;
        }
      } catch {}
    }

    // Fallback: local trading
    const delta = direction === 'higher' ? wager * 0.001 : -wager * 0.001;
    const newFV = fairValue * (1 + delta);
    setFairValue(newFV);
    setVolume(v => v + wager);
    setTraders(t => t + 1);
    const newBet: Bet = { id: Math.random().toString(36).slice(2), direction, amount: wager, priceAtBet: fairValue, timestamp: new Date() };
    setBets(prev => [newBet, ...prev]);
    setBetAmount('');
    if (fairValueSeriesRef.current) {
      fairValueSeriesRef.current.update({ time: Date.now() / 1000 as LineData['time'], value: newFV });
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  const formatPrice = (n: number) => n ? `$${n.toLocaleString()}` : '—';
  const typeLabel = (t: string) => {
    const map: Record<string, string> = { SINGLE_FAMILY: 'Single Family', CONDO: 'Condo', MULTI_FAMILY: 'Multi-Family', APARTMENT: 'Apartment', LOT: 'Lot' };
    return map[t] || t;
  };

  const priceDelta = fairValue - originalPrice;
  const priceDeltaPercent = ((priceDelta / originalPrice) * 100).toFixed(1);

  const heroImg = property.photos?.find(p => p.width === 1536)?.url
    || property.photos?.find(p => p.width === 960)?.url
    || property.imgSrc;

  const priceDiff = property.zestimate && property.price ? property.zestimate - property.price : null;
  const priceDiffPct = priceDiff !== null && property.price ? ((priceDiff / property.price) * 100).toFixed(1) : null;

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setTimeout(() => {
      setSearchResults({
        answer: `Fair value is currently ${formatCurrency(fairValue)} (${priceDelta >= 0 ? '+' : ''}${priceDeltaPercent}% from sale price). ${traders} traders have placed ${formatCurrency(volume)} in total volume. ${priceDelta > 0 ? 'Bullish sentiment suggests the market thinks this property is undervalued.' : priceDelta < 0 ? 'Bearish sentiment suggests the market thinks this property was overvalued.' : 'The market is neutral on this property.'}`
      });
      setIsSearching(false);
    }, 800);
  };

  return (
    <div className="market-page">
      <nav className="market-nav">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          <span>Back</span>
        </Link>
        <div className="nav-title">{property.address}</div>
        <Link to="/join" className="nav-bid-link">
          <Gavel size={14} />
          <span>Host a Bid</span>
        </Link>
      </nav>

      <div className="market-content">
        {/* Hero */}
        <div className="detail-hero">
          <img src={heroImg} alt={property.address} className="detail-hero-img" />
          <div className="detail-hero-badges">
            <span className="badge-type">{typeLabel(property.homeType)}</span>
          </div>
        </div>

        {/* Photo Gallery */}
        {property.photos && property.photos.length > 1 && (
          <PhotoGallery photos={property.photos} />
        )}

        {/* Price + Specs Header */}
        <div className="detail-header-card">
          <div className="detail-price-row">
            <div className="detail-price-section">
              <div className="detail-price-label">Sale Price</div>
              <div className="detail-price">{formatPrice(originalPrice)}</div>
            </div>
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

        {/* Trading Card */}
        <div className="detail-section glass-trade">
          <div className="trade-header">
            <h2 className="section-title"><TrendingUp size={18} /> Live Trading</h2>
            <span className={`live-badge ${connected ? 'on' : 'off'}`}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? 'Live' : 'Local'}
            </span>
          </div>

          <div className="stats-row">
            <div className="stat-pill">
              <span className="stat-pill-label">Fair Value</span>
              <span className="stat-pill-value">{formatCurrency(fairValue)}</span>
              <span className={`stat-pill-delta ${priceDelta >= 0 ? 'positive' : 'negative'}`}>
                {priceDelta >= 0 ? '+' : ''}{priceDeltaPercent}%
              </span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-label">Volume</span>
              <span className="stat-pill-value">{formatCurrency(volume)}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-label"><Users size={11} /> Traders</span>
              <span className="stat-pill-value">{traders}</span>
            </div>
          </div>

          <div className="trade-input-row">
            <div className="trade-input-wrap">
              <DollarSign size={15} className="trade-input-icon" />
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="Amount"
                className="trade-input"
              />
            </div>
            <button className="trade-btn higher" onClick={() => placeBet('higher')}>
              <TrendingUp size={16} /> Higher
            </button>
            <button className="trade-btn lower" onClick={() => placeBet('lower')}>
              <TrendingDown size={16} /> Lower
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="detail-section">
          <div className="chart-head">
            <h2 className="section-title">Price Chart</h2>
            <div className="chart-legend">
              <span className="legend-dot green" /> Fair Value
              <span className="legend-dot blue" /> Trend
            </div>
          </div>
          <div ref={chartContainerRef} className="chart-container" />
        </div>

        {/* Positions */}
        {bets.length > 0 && (
          <div className="detail-section">
            <h2 className="section-title">Your Positions</h2>
            <div className="positions-list">
              {bets.map((bet) => (
                <div key={bet.id} className="position-item">
                  <div className={`position-tag ${bet.direction}`}>
                    {bet.direction === 'higher' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {bet.direction === 'higher' ? 'LONG' : 'SHORT'}
                  </div>
                  <span className="position-amount">{formatCurrency(bet.amount)}</span>
                  <span className="position-entry">@ {formatCurrency(bet.priceAtBet)}</span>
                  <span className="position-time">{bet.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {property.description && (
          <div className="detail-section">
            <h2 className="section-title">About this Home</h2>
            <p className="detail-description">{property.description}</p>
          </div>
        )}

        {/* Price History */}
        {property.priceHistory && property.priceHistory.length > 0 && (
          <div className="detail-section">
            <h2 className="section-title"><Clock size={16} /> Price History</h2>
            <div className="price-history-table">
              <div className="ph-header">
                <span>Date</span><span>Event</span><span>Price</span>
              </div>
              {property.priceHistory.slice(0, 8).map((h: any, i: number) => (
                <div key={i} className="ph-row">
                  <span className="ph-date">{h.date ? new Date(h.date).toLocaleDateString() : '—'}</span>
                  <span className="ph-event">{h.event || '—'}</span>
                  <span className="ph-price">{h.price ? formatPrice(h.price) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Schools */}
        {property.schools && property.schools.length > 0 && (
          <div className="detail-section">
            <h2 className="section-title">Nearby Schools</h2>
            <div className="schools-list">
              {property.schools.map((s: any, i: number) => (
                <div key={i} className="school-item">
                  <div className="school-info">
                    <span className="school-name">{s.name}</span>
                    <span className="school-meta">{s.level} · {s.distance}</span>
                  </div>
                  {s.rating != null && (
                    <span className={`school-rating ${s.rating >= 7 ? 'good' : s.rating >= 4 ? 'avg' : 'low'}`}>
                      {s.rating}/10
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Insights */}
        <div className="detail-section">
          <div className="ai-toggle" onClick={() => setShowAISearch(!showAISearch)}>
            <div className="ai-toggle-left"><Brain size={18} /> <span>AI Market Insights</span></div>
            <span className="ai-chevron">{showAISearch ? '−' : '+'}</span>
          </div>
          {showAISearch && (
            <div className="ai-body">
              <div className="ai-input-row">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Ask about this property..."
                  className="ai-input"
                />
                <button className="ai-btn" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
                </button>
              </div>
              {searchResults?.answer && (
                <div className="ai-answer">{searchResults.answer}</div>
              )}
            </div>
          )}
        </div>

        {/* Bid CTA */}
        <div className="detail-section bid-section">
          <div className="bid-section-inner">
            <div className="bid-text">
              <h2 className="section-title"><Gavel size={18} /> Multiplayer Mode</h2>
              <p className="bid-desc">Host a live bidding game with friends and test your instincts.</p>
            </div>
            <Link to="/join" className="bid-cta-btn">Start a Bid</Link>
          </div>
        </div>

        {/* Zillow Link */}
        <div className="detail-cta">
          <a href={property.hdpUrl} target="_blank" rel="noopener noreferrer" className="zillow-link">
            <ExternalLink size={16} /> View on Zillow
          </a>
        </div>
      </div>
    </div>
  );
};

export default MarketPage;
