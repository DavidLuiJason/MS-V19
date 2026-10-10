export interface IndicatorPoint {
  time: number; // unix timestamp in seconds for lightweight-charts or ms
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

interface PriceData {
  t: number; // ms
  c: number; // close price
}

/**
 * Pure Simple Moving Average (SMA)
 */
export function calculateSMA(data: PriceData[], period = 20): IndicatorPoint[] {
  if (data.length < period) return [];

  const results: IndicatorPoint[] = [];
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    sum += data[i].c;
    if (i >= period) {
      sum -= data[i - period].c;
    }

    if (i >= period - 1) {
      results.push({
        time: Math.floor(data[i].t / 1000),
        value: Number((sum / period).toFixed(4)),
      });
    }
  }

  return results;
}

/**
 * Pure Exponential Moving Average (EMA)
 */
export function calculateEMA(data: PriceData[], period = 20): IndicatorPoint[] {
  if (data.length < period) return [];

  const results: IndicatorPoint[] = [];
  const k = 2 / (period + 1);

  // First EMA is simple average of first `period` elements
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].c;
  }
  let prevEma = sum / period;

  results.push({
    time: Math.floor(data[period - 1].t / 1000),
    value: Number(prevEma.toFixed(4)),
  });

  for (let i = period; i < data.length; i++) {
    const currentEma = data[i].c * k + prevEma * (1 - k);
    results.push({
      time: Math.floor(data[i].t / 1000),
      value: Number(currentEma.toFixed(4)),
    });
    prevEma = currentEma;
  }

  return results;
}

/**
 * Pure Relative Strength Index (RSI) using Wilder's smoothing
 */
export function calculateRSI(data: PriceData[], period = 14): IndicatorPoint[] {
  if (data.length <= period) return [];

  const results: IndicatorPoint[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i].c - data[i - 1].c;
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  results.push({
    time: Math.floor(data[period].t / 1000),
    value: Number(rsi.toFixed(2)),
  });

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].c - data[i - 1].c;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    results.push({
      time: Math.floor(data[i].t / 1000),
      value: Number(rsi.toFixed(2)),
    });
  }

  return results;
}

/**
 * Pure Moving Average Convergence Divergence (MACD 12/26/9)
 */
export function calculateMACD(
  data: PriceData[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDPoint[] {
  if (data.length < slowPeriod + signalPeriod) return [];

  // Compute fast & slow EMAs
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);

  // Map by timestamp
  const fastMap = new Map<number, number>();
  for (const p of fastEMA) {
    fastMap.set(p.time, p.value);
  }

  // MACD line = fastEMA - slowEMA
  const macdLinePoints: { t: number; c: number }[] = [];
  for (const s of slowEMA) {
    const fVal = fastMap.get(s.time);
    if (fVal !== undefined) {
      macdLinePoints.push({
        t: s.time * 1000,
        c: fVal - s.value,
      });
    }
  }

  // Signal line = EMA of MACD line over signalPeriod
  const signalEMA = calculateEMA(macdLinePoints, signalPeriod);
  const signalMap = new Map<number, number>();
  for (const s of signalEMA) {
    signalMap.set(s.time, s.value);
  }

  const results: MACDPoint[] = [];
  for (const m of macdLinePoints) {
    const secTime = Math.floor(m.t / 1000);
    const sigVal = signalMap.get(secTime);
    if (sigVal !== undefined) {
      results.push({
        time: secTime,
        macd: Number(m.c.toFixed(4)),
        signal: Number(sigVal.toFixed(4)),
        histogram: Number((m.c - sigVal).toFixed(4)),
      });
    }
  }

  return results;
}
