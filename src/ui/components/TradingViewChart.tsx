import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import Dexie from 'dexie';
import { db, type CandleRecord } from '../../data/db';
import { useAppStore } from '../../state/store';
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD } from '../../engine/indicators';
import { BinanceAdapter } from '../../collector/exchangeAdapter';

interface Props {
  symbol: string;
  timeframe: string;
  buyPrice?: number;
  sellPrice?: number;
}

const restAdapter = new BinanceAdapter();

export const TradingViewChart: React.FC<Props> = ({ symbol, timeframe, buyPrice, sellPrice }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', any> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<'Line', any> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line', any> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line', any> | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<'Line', any> | null>(null);
  const signalSeriesRef = useRef<ISeriesApi<'Line', any> | null>(null);
  const histSeriesRef = useRef<ISeriesApi<'Histogram', any> | null>(null);

  const buyPriceLineRef = useRef<IPriceLine | null>(null);
  const sellPriceLineRef = useRef<IPriceLine | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const { latestCandles, indicatorsEnabled, activeIndicators, gapsVersion } = useAppStore();

  const candlesDataRef = useRef<CandleRecord[]>([]);
  const lastLoadedKeyRef = useRef<string>('');

  // 1. Initialize Chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.1,
          bottom: 0.15,
        },
      },
      crosshair: {
        vertLine: { color: 'rgba(148, 163, 184, 0.3)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(148, 163, 184, 0.3)', width: 1, style: LineStyle.Dashed },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      maSeriesRef.current = null;
      emaSeriesRef.current = null;
      rsiSeriesRef.current = null;
      macdSeriesRef.current = null;
      signalSeriesRef.current = null;
      histSeriesRef.current = null;
      buyPriceLineRef.current = null;
      sellPriceLineRef.current = null;
    };
  }, []);

  // 2. Load Candles from IndexedDB or backfill
  useEffect(() => {
    let isCancelled = false;

    async function loadCandles() {
      const loadKey = symbol + '_' + timeframe;
      const isNewView = lastLoadedKeyRef.current !== loadKey;
      if (isNewView) setIsLoading(true);
      try {
        let stored = (
          await db.candles
            .where('[src+sym+tf+t]')
            .between(['binance', symbol, timeframe, Dexie.minKey], ['binance', symbol, timeframe, Dexie.maxKey])
            .reverse()
            .limit(1500)
            .toArray()
        ).reverse();

        // If no stored candles yet, backfill recent 200 candles immediately via REST
        if (stored.length === 0) {
          try {
            const fetched = await restAdapter.fetchKlines(symbol, timeframe, undefined, 200);
            if (!isCancelled && fetched.length > 0) {
              const records: CandleRecord[] = fetched.map((k) => ({
                src: 'binance',
                sym: symbol,
                tf: timeframe,
                t: k.openTime,
                o: k.open,
                h: k.high,
                l: k.low,
                c: k.close,
                v: k.volume,
                closed: k.isClosed,
              }));
              await db.candles.bulkPut(records);
              stored = records;
            }
          } catch {
            // ignore network failure
          }
        }

        if (isCancelled) return;

        candlesDataRef.current = stored;

        if (candleSeriesRef.current && stored.length > 0) {
          const chartData = stored.map((c) => ({
            time: Math.floor(c.t / 1000) as UTCTimestamp,
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
          }));
          candleSeriesRef.current.setData(chartData);
          if (isNewView) {
            chartRef.current?.timeScale().fitContent();
          }
          lastLoadedKeyRef.current = loadKey;
        }
      } catch (err) {
        console.error('Error loading candles for chart:', err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadCandles();

    return () => {
      isCancelled = true;
    };
  }, [symbol, timeframe, gapsVersion]);

  // 3. Update with live candle updates from worker
  useEffect(() => {
    const key = `${symbol}_${timeframe}`;
    const liveCandle = latestCandles[key];
    if (liveCandle && candleSeriesRef.current) {
      candleSeriesRef.current.update({
        time: Math.floor(liveCandle.t / 1000) as UTCTimestamp,
        open: liveCandle.o,
        high: liveCandle.h,
        low: liveCandle.l,
        close: liveCandle.c,
      });

      // Update in local array
      const arr = candlesDataRef.current;
      const last = arr[arr.length - 1];
      if (last && last.t === liveCandle.t) {
        arr[arr.length - 1] = liveCandle;
      } else if (!last || liveCandle.t > last.t) {
        arr.push(liveCandle);
      }
    }
  }, [latestCandles, symbol, timeframe]);

  // 4. Update Price Lines (two thin lines for sell and buy liquidity)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Ask Price Line (Cyan, Ask)
    if (buyPrice && buyPrice > 0) {
      if (buyPriceLineRef.current) {
        series.removePriceLine(buyPriceLineRef.current);
      }
      buyPriceLineRef.current = series.createPriceLine({
        price: buyPrice,
        color: '#06b6d4',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'Buy',
      });
    }

    // Bid Price Line (Red/Rose, Bid)
    if (sellPrice && sellPrice > 0) {
      if (sellPriceLineRef.current) {
        series.removePriceLine(sellPriceLineRef.current);
      }
      sellPriceLineRef.current = series.createPriceLine({
        price: sellPrice,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'Sell',
      });
    }
  }, [buyPrice, sellPrice]);

  // 5. Update Indicators (MA 20, EMA 20, RSI 14, MACD 12/26/9)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const data = candlesDataRef.current;

    // Clean up previous indicator series
    if (maSeriesRef.current) {
      chart.removeSeries(maSeriesRef.current);
      maSeriesRef.current = null;
    }
    if (emaSeriesRef.current) {
      chart.removeSeries(emaSeriesRef.current);
      emaSeriesRef.current = null;
    }
    if (rsiSeriesRef.current) {
      chart.removeSeries(rsiSeriesRef.current);
      rsiSeriesRef.current = null;
    }
    if (macdSeriesRef.current) {
      chart.removeSeries(macdSeriesRef.current);
      macdSeriesRef.current = null;
    }
    if (signalSeriesRef.current) {
      chart.removeSeries(signalSeriesRef.current);
      signalSeriesRef.current = null;
    }
    if (histSeriesRef.current) {
      chart.removeSeries(histSeriesRef.current);
      histSeriesRef.current = null;
    }

    if (!indicatorsEnabled || data.length === 0) return;

    // MA 20
    if (activeIndicators.ma) {
      const maData = calculateSMA(data, 20);
      if (maData.length > 0) {
        const maSeries = chart.addSeries(LineSeries, {
          color: '#fbbf24',
          lineWidth: 2,
          title: 'MA 20',
        });
        maSeries.setData(
          maData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
          }))
        );
        maSeriesRef.current = maSeries;
      }
    }

    // EMA 20
    if (activeIndicators.ema) {
      const emaData = calculateEMA(data, 20);
      if (emaData.length > 0) {
        const emaSeries = chart.addSeries(LineSeries, {
          color: '#a855f7',
          lineWidth: 2,
          title: 'EMA 20',
        });
        emaSeries.setData(
          emaData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
          }))
        );
        emaSeriesRef.current = emaSeries;
      }
    }

    // RSI 14
    if (activeIndicators.rsi) {
      const rsiData = calculateRSI(data, 14);
      if (rsiData.length > 0) {
        const rsiSeries = chart.addSeries(LineSeries, {
          color: '#38bdf8',
          lineWidth: 2,
          title: 'RSI 14',
          priceScaleId: 'rsi',
        });
        chart.priceScale('rsi').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });
        rsiSeries.setData(
          rsiData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
          }))
        );
        rsiSeriesRef.current = rsiSeries;
      }
    }

    // MACD 12/26/9
    if (activeIndicators.macd) {
      const macdData = calculateMACD(data, 12, 26, 9);
      if (macdData.length > 0) {
        const macdSeries = chart.addSeries(LineSeries, {
          color: '#22d3ee',
          lineWidth: 1,
          title: 'MACD',
          priceScaleId: 'macd',
        });
        const sigSeries = chart.addSeries(LineSeries, {
          color: '#f97316',
          lineWidth: 1,
          title: 'Signal',
          priceScaleId: 'macd',
        });
        const histSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'macd',
        });

        chart.priceScale('macd').applyOptions({
          scaleMargins: { top: 0.75, bottom: 0 },
        });

        macdSeries.setData(
          macdData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.macd,
          }))
        );
        sigSeries.setData(
          macdData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.signal,
          }))
        );
        histSeries.setData(
          macdData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.histogram,
            color: d.histogram >= 0 ? '#10b981' : '#f43f5e',
          }))
        );

        macdSeriesRef.current = macdSeries;
        signalSeriesRef.current = sigSeries;
        histSeriesRef.current = histSeries;
      }
    }
  }, [indicatorsEnabled, activeIndicators]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-[#090d16] border border-slate-800">
      {isLoading && (
        <div className="absolute inset-0 z-10 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center">
          <div className="text-xs text-slate-400 font-medium animate-pulse">Loading chart data...</div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-[280px]" />
    </div>
  );
};
