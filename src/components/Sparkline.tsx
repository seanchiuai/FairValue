import React from 'react';

interface SparklineProps {
  data: number[];       // prob_over values 0–1
  width?: number;
  height?: number;
}

export default function Sparkline({ data, width = 280, height = 48 }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: '#AEAEB2' }}>Waiting for trades...</span>
      </div>
    );
  }

  const padding = 2;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  // Scale data: y-axis range from min-margin to max+margin for visible movement
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.1; // avoid division by zero
  const yMin = Math.max(0, min - range * 0.15);
  const yMax = Math.min(1, max + range * 0.15);
  const yRange = yMax - yMin || 0.1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * chartW;
    const y = padding + (1 - (v - yMin) / yRange) * chartH;
    return `${x},${y}`;
  });

  const polylinePoints = points.join(' ');

  // Closed polygon for the gradient fill area
  const fillPoints = [
    ...points,
    `${padding + chartW},${padding + chartH}`,
    `${padding},${padding + chartH}`,
  ].join(' ');

  const current = data[data.length - 1];
  const prev = data[data.length - 2];
  const trending = current >= prev ? 'up' : 'down';
  const lineColor = trending === 'up' ? '#34C759' : '#FF3B30';

  const gradientId = `spark-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <polygon points={fillPoints} fill={`url(#${gradientId})`} />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{
        position: 'absolute',
        top: 4,
        right: 6,
        fontSize: 11,
        fontWeight: 600,
        color: lineColor,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(4px)',
        padding: '1px 6px',
        borderRadius: 4,
      }}>
        {(current * 100).toFixed(0)}% Over
      </div>
    </div>
  );
}
