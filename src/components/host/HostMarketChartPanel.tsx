import type { Market } from '../../types';
import './HostMarketChartPanel.css';

interface HostMarketChartPanelProps {
  market: Market;
  chartRef: (element: HTMLDivElement | null) => void;
}

export default function HostMarketChartPanel({ market, chartRef }: HostMarketChartPanelProps) {
  return (
    <section
      className="host-market-chart"
      aria-label="Host market probability chart"
      data-testid="host-market-chart-panel"
    >
      <div className="host-market-chart__header">
        <h2 className="host-market-chart__title">Market Probability</h2>
        <div className="host-market-chart__legend" aria-label="Chart legend">
          <span className="host-market-chart__legend-item">
            <span className="host-market-chart__legend-dot host-market-chart__legend-dot--probability" />
            OVER probability
          </span>
          <span className="host-market-chart__legend-item">
            <span className="host-market-chart__legend-dot host-market-chart__legend-dot--fair-value" />
            Fair value ($)
          </span>
        </div>
      </div>
      <div ref={chartRef} className="host-market-chart__canvas" />
      <div className="host-market-chart__stats">
        <div className="host-market-chart__stat">
          <span className="host-market-chart__stat-label">Total Trades</span>
          <span className="host-market-chart__stat-value" data-testid="total-trades">{market.total_trades}</span>
        </div>
        <div className="host-market-chart__stat">
          <span className="host-market-chart__stat-label">Volume</span>
          <span className="host-market-chart__stat-value" data-testid="total-volume">${market.total_wagered.toFixed(0)}</span>
        </div>
        <div className="host-market-chart__stat">
          <span className="host-market-chart__stat-label">Avg Bet</span>
          <span className="host-market-chart__stat-value" data-testid="avg-bet">${market.avg_bet_size.toFixed(0)}</span>
        </div>
      </div>
    </section>
  );
}
