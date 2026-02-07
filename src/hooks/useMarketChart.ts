import { useEffect, useRef, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts';

interface UseMarketChartOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  height?: number;
  tickIntervalMs?: number;
}

interface ChartHandle {
  addPoint: (data: { probOver: number; fairValue: number }) => void;
}

export function useMarketChart({
  containerRef,
  height = 300,
  tickIntervalMs = 2000,
}: UseMarketChartOptions): ChartHandle {
  const chartRef = useRef<IChartApi | null>(null);
  const probSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const fairValueSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const probDataRef = useRef<LineData[]>([]);
  const fvDataRef = useRef<LineData[]>([]);
  const timeCounterRef = useRef(0);
  const latestRef = useRef<{ probOver: number; fairValue: number } | null>(null);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#A9B7C8',
      },
      grid: {
        vertLines: { color: 'rgba(58, 74, 93, 0.3)' },
        horzLines: { color: 'rgba(58, 74, 93, 0.3)' },
      },
      width: containerRef.current.clientWidth,
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

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
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
  }, [containerRef, height]);

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

  return { addPoint };
}
