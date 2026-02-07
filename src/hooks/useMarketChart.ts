import { useEffect, useRef, useCallback, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts';

interface ChartHandle {
  addPoint: (data: { probOver: number; fairValue: number }) => void;
  loadHistory: (points: Array<{ probOver: number; fairValue: number }>) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

export function useMarketChart({
  height = 300,
  tickIntervalMs = 2000,
}: { height?: number; tickIntervalMs?: number } = {}): ChartHandle {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const probSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const fairValueSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const probDataRef = useRef<LineData[]>([]);
  const fvDataRef = useRef<LineData[]>([]);
  const timeCounterRef = useRef(0);
  const latestRef = useRef<{ probOver: number; fairValue: number } | null>(null);

  // Callback ref — triggers state change when DOM element appears
  const setRef = useCallback((el: HTMLDivElement | null) => {
    setContainer(el);
  }, []);

  // Create chart when container appears in DOM
  useEffect(() => {
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#A9B7C8',
      },
      grid: {
        vertLines: { color: 'rgba(58, 74, 93, 0.3)' },
        horzLines: { color: 'rgba(58, 74, 93, 0.3)' },
      },
      width: container.clientWidth,
      height,
      rightPriceScale: {
        scaleMargins: { top: 0.1, bottom: 0.1 },
        visible: false,
      },
      leftPriceScale: {
        scaleMargins: { top: 0.1, bottom: 0.1 },
        visible: true,
      },
      timeScale: {
        visible: false,
      },
    });

    // Blue line: probability % on left axis
    const probSeries = chart.addLineSeries({
      color: '#4BA3FF',
      lineWidth: 2,
      priceScaleId: 'left',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${Math.round(price)}%`,
      },
    });

    // Green line: fair value on right axis
    chart.applyOptions({
      rightPriceScale: {
        visible: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    });

    const fvSeries = chart.addLineSeries({
      color: '#3BA776',
      lineWidth: 2,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${Math.round(price).toLocaleString()}`,
      },
    });

    chartRef.current = chart;
    probSeriesRef.current = probSeries;
    fairValueSeriesRef.current = fvSeries;

    // If we already have buffered data (from loadHistory or addPoint), render it
    if (probDataRef.current.length > 0) {
      probSeries.setData(probDataRef.current);
      fvSeries.setData(fvDataRef.current);
    } else if (latestRef.current) {
      timeCounterRef.current += 1;
      const time = timeCounterRef.current as Time;
      const probPoint: LineData = { time, value: latestRef.current.probOver * 100 };
      const fvPoint: LineData = { time, value: latestRef.current.fairValue };
      probDataRef.current.push(probPoint);
      fvDataRef.current.push(fvPoint);
      probSeries.setData(probDataRef.current);
      fvSeries.setData(fvDataRef.current);
    }

    const handleResize = () => {
      if (container) {
        chart.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      probSeriesRef.current = null;
      fairValueSeriesRef.current = null;
      probDataRef.current = [];
      fvDataRef.current = [];
      timeCounterRef.current = 0;
    };
  }, [container, height]);

  // Periodic tick: extend both lines so the chart looks "live"
  useEffect(() => {
    const interval = setInterval(() => {
      const latest = latestRef.current;
      if (!probSeriesRef.current || !fairValueSeriesRef.current || !latest) return;

      timeCounterRef.current += 1;
      const time = timeCounterRef.current as Time;

      const probPoint: LineData = { time, value: latest.probOver * 100 };
      const fvPoint: LineData = { time, value: latest.fairValue };

      probDataRef.current.push(probPoint);
      fvDataRef.current.push(fvPoint);

      probSeriesRef.current.setData(probDataRef.current);
      fairValueSeriesRef.current.setData(fvDataRef.current);
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, [tickIntervalMs]);

  const addPoint = useCallback((data: { probOver: number; fairValue: number }) => {
    latestRef.current = data;

    if (!probSeriesRef.current || !fairValueSeriesRef.current) return;

    timeCounterRef.current += 1;
    const time = timeCounterRef.current as Time;

    const probPoint: LineData = { time, value: data.probOver * 100 };
    const fvPoint: LineData = { time, value: data.fairValue };

    probDataRef.current.push(probPoint);
    fvDataRef.current.push(fvPoint);

    probSeriesRef.current.setData(probDataRef.current);
    fairValueSeriesRef.current.setData(fvDataRef.current);
  }, []);

  const loadHistory = useCallback((points: Array<{ probOver: number; fairValue: number }>) => {
    if (points.length === 0) return;

    probDataRef.current = [];
    fvDataRef.current = [];
    timeCounterRef.current = 0;

    for (const pt of points) {
      timeCounterRef.current += 1;
      const time = timeCounterRef.current as Time;
      probDataRef.current.push({ time, value: pt.probOver * 100 });
      fvDataRef.current.push({ time, value: pt.fairValue });
    }

    latestRef.current = points[points.length - 1];

    if (probSeriesRef.current && fairValueSeriesRef.current) {
      probSeriesRef.current.setData(probDataRef.current);
      fairValueSeriesRef.current.setData(fvDataRef.current);
    }
  }, []);

  return { addPoint, loadHistory, setRef };
}
