export interface PatternCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type PatternDirection = 'bullish' | 'bearish';
export type PatternFamily = 'classic' | 'new' | 'original';
export type PatternVerdict = 'holds' | 'broke' | 'fails' | 'unclear';

export interface PatternDefinition {
  id: string;
  name: string;
  direction: PatternDirection;
  family: PatternFamily;
  description: string;
}

export interface PatternEvent {
  patternId: string;
  index: number;
  t: number;
  price: number;
}

export interface PatternStat {
  patternId: string;
  horizon: number;
  samples: number;
  wins: number;
  winRate: number;
  avgGainPct: number;
  avgLossPct: number;
  baselineWinRate: number;
  edgePoints: number;
  ciLow: number;
  ciHigh: number;
  trainSamples: number;
  trainWinRate: number;
  trainBaseline: number;
  testSamples: number;
  testWinRate: number;
  testBaseline: number;
  verdict: PatternVerdict;
}

export interface PatternStudy {
  candleCount: number;
  from: number;
  to: number;
  splitIndex: number;
  stats: PatternStat[];
  events: PatternEvent[];
}

export const PATTERN_HORIZONS = [1, 3, 5, 10];
export const MIN_PATTERN_SAMPLES = 30;
export const MIN_TEST_SAMPLES = 20;
export const TRAIN_FRACTION = 0.7;
export const PATTERN_WARMUP = 120;
const WARMUP = PATTERN_WARMUP;

export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  { id: 'bullish_engulfing', name: 'Bullish Engulfing', direction: 'bullish', family: 'classic', description: 'A red candle is followed by a green candle whose body fully covers the red body.' },
  { id: 'bearish_engulfing', name: 'Bearish Engulfing', direction: 'bearish', family: 'classic', description: 'A green candle is followed by a red candle whose body fully covers the green body.' },
  { id: 'hammer', name: 'Hammer', direction: 'bullish', family: 'classic', description: 'After a 3-candle fall, a candle with a long lower wick and its body near the top.' },
  { id: 'shooting_star', name: 'Shooting Star', direction: 'bearish', family: 'classic', description: 'After a 3-candle rise, a candle with a long upper wick and its body near the bottom.' },
  { id: 'rsi_oversold_cross', name: 'RSI leaves oversold', direction: 'bullish', family: 'classic', description: 'RSI (14) crosses back above 30 after being below it.' },
  { id: 'rsi_overbought_cross', name: 'RSI leaves overbought', direction: 'bearish', family: 'classic', description: 'RSI (14) crosses back below 70 after being above it.' },
  { id: 'ema_cross_up', name: 'EMA 9 crosses above EMA 21', direction: 'bullish', family: 'classic', description: 'The fast average (9) moves from below to above the slow average (21).' },
  { id: 'ema_cross_down', name: 'EMA 9 crosses below EMA 21', direction: 'bearish', family: 'classic', description: 'The fast average (9) moves from above to below the slow average (21).' },
  { id: 'breakout_up', name: 'Breakout above 20-candle high', direction: 'bullish', family: 'classic', description: 'A candle closes above the highest high of the previous 20 candles (first close only).' },
  { id: 'breakout_down', name: 'Breakdown below 20-candle low', direction: 'bearish', family: 'classic', description: 'A candle closes below the lowest low of the previous 20 candles (first close only).' },

  { id: 'squeeze_break_up', name: 'Squeeze breakout up', direction: 'bullish', family: 'new', description: 'Price was unusually quiet (tightest 10% of the last 100 candles) in the last 10 candles, then closes above the 20-candle high.' },
  { id: 'squeeze_break_down', name: 'Squeeze breakout down', direction: 'bearish', family: 'new', description: 'Price was unusually quiet in the last 10 candles, then closes below the 20-candle low.' },
  { id: 'sweep_reclaim_up', name: 'Stop-run reclaim (up)', direction: 'bullish', family: 'new', description: 'A candle dips below the 20-candle low, then closes back above it with a long lower wick (a shake-out of sellers).' },
  { id: 'sweep_reclaim_down', name: 'Stop-run reclaim (down)', direction: 'bearish', family: 'new', description: 'A candle spikes above the 20-candle high, then closes back below it with a long upper wick (a shake-out of buyers).' },
  { id: 'absorption_up', name: 'Absorption at lows', direction: 'bullish', family: 'new', description: 'Very high volume (2x normal) but a small body, while price sits in the bottom quarter of its 20-candle range.' },
  { id: 'absorption_down', name: 'Absorption at highs', direction: 'bearish', family: 'new', description: 'Very high volume (2x normal) but a small body, while price sits in the top quarter of its 20-candle range.' },
  { id: 'exhaustion_up', name: 'Selling exhaustion', direction: 'bullish', family: 'new', description: 'Five red candles in a row, and the last one has a smaller body than the four before it.' },
  { id: 'exhaustion_down', name: 'Buying exhaustion', direction: 'bearish', family: 'new', description: 'Five green candles in a row, and the last one has a smaller body than the four before it.' },
  { id: 'stretch_snap_up', name: 'Stretched low snap-back', direction: 'bullish', family: 'new', description: 'Price closes 2.5+ standard deviations below its 50-candle average, and the candle closes green.' },
  { id: 'stretch_snap_down', name: 'Stretched high snap-back', direction: 'bearish', family: 'new', description: 'Price closes 2.5+ standard deviations above its 50-candle average, and the candle closes red.' },
  { id: 'impulse_up', name: 'Power candle up', direction: 'bullish', family: 'new', description: 'A green candle at least 2x the normal range, closing in its top 20%, on 1.5x volume.' },
  { id: 'impulse_down', name: 'Power candle down', direction: 'bearish', family: 'new', description: 'A red candle at least 2x the normal range, closing in its bottom 20%, on 1.5x volume.' },
  { id: 'pullback_up', name: 'Trend pullback (up)', direction: 'bullish', family: 'new', description: 'In an uptrend (EMA 21 above EMA 50), price touches EMA 21 and closes back above it on a green candle.' },
  { id: 'pullback_down', name: 'Trend pullback (down)', direction: 'bearish', family: 'new', description: 'In a downtrend (EMA 21 below EMA 50), price touches EMA 21 and closes back below it on a red candle.' },

  { id: 'trap_release_up', name: 'Trap Release (up)', direction: 'bullish', family: 'original', description: 'Original combo: a quiet squeeze in the last 10 candles, then a stop-run below the lows that is reclaimed. Quiet markets store energy, the shake-out traps sellers, the reclaim points the way.' },
  { id: 'trap_release_down', name: 'Trap Release (down)', direction: 'bearish', family: 'original', description: 'Original combo: a quiet squeeze in the last 10 candles, then a stop-run above the highs that fails. Quiet markets store energy, the shake-out traps buyers, the failure points the way.' },
];

function calcEma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function calcRsi(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function calcAtr(candles: PatternCandle[], period: number): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n <= period) return out;
  const tr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const pc = candles[i - 1].c;
    tr[i] = Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - pc), Math.abs(candles[i].l - pc));
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function detectPatterns(candles: PatternCandle[]): PatternEvent[] {
  const n = candles.length;
  const events: PatternEvent[] = [];
  if (n <= WARMUP + 1) return events;

  const closes = candles.map((c) => c.c);
  const rsi = calcRsi(closes, 14);
  const ema9 = calcEma(closes, 9);
  const ema21 = calcEma(closes, 21);
  const ema50 = calcEma(closes, 50);
  const atr = calcAtr(candles, 14);

  const highestPrior = (i: number): number => {
    let m = -Infinity;
    for (let j = i - 20; j < i; j++) if (candles[j].h > m) m = candles[j].h;
    return m;
  };
  const lowestPrior = (i: number): number => {
    let m = Infinity;
    for (let j = i - 20; j < i; j++) if (candles[j].l < m) m = candles[j].l;
    return m;
  };

  // Bollinger bandwidth (20) and "squeeze" flag = bandwidth in the lowest 10% of the previous 100 values
  const bbw: number[] = new Array(n).fill(NaN);
  for (let i = 19; i < n; i++) {
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += closes[j];
    const mean = sum / 20;
    let sq = 0;
    for (let j = i - 19; j <= i; j++) sq += (closes[j] - mean) * (closes[j] - mean);
    const sd = Math.sqrt(sq / 20);
    bbw[i] = mean > 0 ? (4 * sd) / mean : NaN;
  }
  const squeeze: boolean[] = new Array(n).fill(false);
  for (let i = 119; i < n; i++) {
    if (isNaN(bbw[i])) continue;
    let lessOrEqual = 0;
    let counted = 0;
    for (let j = i - 100; j < i; j++) {
      if (isNaN(bbw[j])) continue;
      counted++;
      if (bbw[j] <= bbw[i]) lessOrEqual++;
    }
    squeeze[i] = counted >= 80 && lessOrEqual / counted <= 0.1;
  }
  const squeezeRecent = (i: number): boolean => {
    for (let j = i - 10; j < i; j++) if (squeeze[j]) return true;
    return false;
  };

  const push = (patternId: string, i: number) => {
    events.push({ patternId, index: i, t: candles[i].t, price: candles[i].c });
  };

  for (let i = WARMUP; i < n; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const range = cur.h - cur.l;
    const body = Math.abs(cur.c - cur.o);
    const hp = highestPrior(i);
    const lp = lowestPrior(i);

    // ----- Classic -----
    if (prev.c < prev.o && cur.c > cur.o && cur.o <= prev.c && cur.c >= prev.o) push('bullish_engulfing', i);
    if (prev.c > prev.o && cur.c < cur.o && cur.o >= prev.c && cur.c <= prev.o) push('bearish_engulfing', i);

    if (range > 0) {
      const lower = Math.min(cur.o, cur.c) - cur.l;
      const upper = cur.h - Math.max(cur.o, cur.c);
      if (lower >= 0.6 * range && upper <= 0.15 * range && closes[i - 1] < closes[i - 4]) push('hammer', i);
      if (upper >= 0.6 * range && lower <= 0.15 * range && closes[i - 1] > closes[i - 4]) push('shooting_star', i);
    }

    if (!isNaN(rsi[i]) && !isNaN(rsi[i - 1])) {
      if (rsi[i - 1] < 30 && rsi[i] >= 30) push('rsi_oversold_cross', i);
      if (rsi[i - 1] > 70 && rsi[i] <= 70) push('rsi_overbought_cross', i);
    }

    if (!isNaN(ema9[i]) && !isNaN(ema21[i]) && !isNaN(ema9[i - 1]) && !isNaN(ema21[i - 1])) {
      if (ema9[i - 1] <= ema21[i - 1] && ema9[i] > ema21[i]) push('ema_cross_up', i);
      if (ema9[i - 1] >= ema21[i - 1] && ema9[i] < ema21[i]) push('ema_cross_down', i);
    }

    const brokeUp = cur.c > hp && prev.c <= highestPrior(i - 1);
    const brokeDown = cur.c < lp && prev.c >= lowestPrior(i - 1);
    if (brokeUp) push('breakout_up', i);
    if (brokeDown) push('breakout_down', i);

    // ----- New -----
    const recentSqueeze = squeezeRecent(i);
    if (recentSqueeze && brokeUp) push('squeeze_break_up', i);
    if (recentSqueeze && brokeDown) push('squeeze_break_down', i);

    let sweepUp = false;
    let sweepDown = false;
    if (range > 0) {
      const lower = Math.min(cur.o, cur.c) - cur.l;
      const upper = cur.h - Math.max(cur.o, cur.c);
      sweepUp = cur.l < lp && cur.c > lp && lower >= 0.5 * range;
      sweepDown = cur.h > hp && cur.c < hp && upper >= 0.5 * range;
    }
    if (sweepUp) push('sweep_reclaim_up', i);
    if (sweepDown) push('sweep_reclaim_down', i);

    // Absorption
    let volSum = 0;
    for (let j = i - 20; j < i; j++) volSum += candles[j].v;
    const volAvg = volSum / 20;
    const priorRange = hp - lp;
    if (range > 0 && volAvg > 0 && priorRange > 0 && cur.v >= 2 * volAvg && body <= 0.3 * range) {
      const position = (cur.c - lp) / priorRange;
      if (position <= 0.25) push('absorption_up', i);
      if (position >= 0.75) push('absorption_down', i);
    }

    // Exhaustion
    {
      let allRed = true;
      let allGreen = true;
      for (let j = i - 4; j <= i; j++) {
        if (!(candles[j].c < candles[j].o)) allRed = false;
        if (!(candles[j].c > candles[j].o)) allGreen = false;
      }
      if (allRed || allGreen) {
        let prevBodies = 0;
        for (let j = i - 4; j < i; j++) prevBodies += Math.abs(candles[j].c - candles[j].o);
        if (body < prevBodies / 4) {
          if (allRed) push('exhaustion_up', i);
          if (allGreen) push('exhaustion_down', i);
        }
      }
    }

    // Stretch snap-back
    {
      let sum = 0;
      for (let j = i - 50; j < i; j++) sum += closes[j];
      const mean = sum / 50;
      let sq = 0;
      for (let j = i - 50; j < i; j++) sq += (closes[j] - mean) * (closes[j] - mean);
      const sd = Math.sqrt(sq / 50);
      if (sd > 0) {
        const z = (cur.c - mean) / sd;
        if (z <= -2.5 && cur.c > cur.o) push('stretch_snap_up', i);
        if (z >= 2.5 && cur.c < cur.o) push('stretch_snap_down', i);
      }
    }

    // Power candle
    if (range > 0 && !isNaN(atr[i - 1]) && volAvg > 0 && range >= 2 * atr[i - 1] && cur.v >= 1.5 * volAvg) {
      const closePos = (cur.c - cur.l) / range;
      if (cur.c > cur.o && closePos >= 0.8) push('impulse_up', i);
      if (cur.c < cur.o && closePos <= 0.2) push('impulse_down', i);
    }

    // Trend pullback
    if (!isNaN(ema21[i]) && !isNaN(ema50[i]) && !isNaN(ema21[i - 1]) && !isNaN(ema50[i - 1])) {
      if (ema21[i] > ema50[i] && ema21[i - 1] > ema50[i - 1] && cur.l <= ema21[i] && cur.c > ema21[i] && cur.c > cur.o) push('pullback_up', i);
      if (ema21[i] < ema50[i] && ema21[i - 1] < ema50[i - 1] && cur.h >= ema21[i] && cur.c < ema21[i] && cur.c < cur.o) push('pullback_down', i);
    }

    // ----- Original combos -----
    if (recentSqueeze && sweepUp) push('trap_release_up', i);
    if (recentSqueeze && sweepDown) push('trap_release_down', i);
  }
  return events;
}

// Move in the direction the pattern predicts, in percent, after `horizon` candles. null if not enough later candles.
export function getEventOutcome(
  candles: PatternCandle[],
  event: PatternEvent,
  horizon: number,
  direction: PatternDirection
): number | null {
  const exitIndex = event.index + horizon;
  if (exitIndex >= candles.length) return null;
  const entry = candles[event.index].c;
  if (!(entry > 0)) return null;
  const movePct = ((candles[exitIndex].c - entry) / entry) * 100;
  return direction === 'bullish' ? movePct : -movePct;
}

export function wilsonRange(wins: number, n: number, z: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

// Share of candles j in [from, to) where price was higher / lower `h` candles later.
function baselineShare(candles: PatternCandle[], from: number, to: number, h: number): { up: number; down: number } {
  let up = 0;
  let down = 0;
  let total = 0;
  for (let j = from; j < to && j + h < candles.length; j++) {
    total++;
    if (candles[j + h].c > candles[j].c) up++;
    else if (candles[j + h].c < candles[j].c) down++;
  }
  return { up: total > 0 ? up / total : 0, down: total > 0 ? down / total : 0 };
}

export function studyPatterns(candles: PatternCandle[], horizons: number[] = PATTERN_HORIZONS): PatternStudy {
  const n = candles.length;
  const events = detectPatterns(candles);
  const stats: PatternStat[] = [];
  const split = Math.floor(n * TRAIN_FRACTION);

  const base: Record<number, { all: { up: number; down: number }; train: { up: number; down: number }; test: { up: number; down: number } }> = {};
  for (const h of horizons) {
    base[h] = {
      all: baselineShare(candles, WARMUP, n, h),
      train: baselineShare(candles, WARMUP, split - h, h),
      test: baselineShare(candles, split, n, h),
    };
  }

  for (const def of PATTERN_DEFINITIONS) {
    const own = events.filter((e) => e.patternId === def.id);
    for (const h of horizons) {
      let samples = 0, wins = 0, gainSum = 0, lossSum = 0;
      let trSamples = 0, trWins = 0, teSamples = 0, teWins = 0;
      for (const e of own) {
        const out = getEventOutcome(candles, e, h, def.direction);
        if (out === null) continue;
        samples++;
        if (out > 0) {
          wins++;
          gainSum += out;
        } else {
          lossSum += out;
        }
        if (e.index + h < split) {
          trSamples++;
          if (out > 0) trWins++;
        } else if (e.index >= split) {
          teSamples++;
          if (out > 0) teWins++;
        }
      }
      const bullish = def.direction === 'bullish';
      const b = base[h];
      const baseline = bullish ? b.all.up : b.all.down;
      const trainBaseline = bullish ? b.train.up : b.train.down;
      const testBaseline = bullish ? b.test.up : b.test.down;
      const winRate = samples > 0 ? wins / samples : 0;
      const trainWinRate = trSamples > 0 ? trWins / trSamples : 0;
      const testWinRate = teSamples > 0 ? teWins / teSamples : 0;
      const ci = wilsonRange(wins, samples, 2.576);
      const trainCi = wilsonRange(trWins, trSamples, 2.576);

      let verdict: PatternVerdict = 'unclear';
      if (trSamples >= MIN_PATTERN_SAMPLES && teSamples >= MIN_TEST_SAMPLES) {
        const trainBeat = trainCi.low > trainBaseline;
        const trainWorse = trainCi.high < trainBaseline;
        const testBeat = testWinRate > testBaseline;
        if (trainBeat && testBeat) verdict = 'holds';
        else if (trainBeat && !testBeat) verdict = 'broke';
        else if (trainWorse) verdict = 'fails';
      }

      stats.push({
        patternId: def.id,
        horizon: h,
        samples,
        wins,
        winRate,
        avgGainPct: wins > 0 ? gainSum / wins : 0,
        avgLossPct: samples - wins > 0 ? lossSum / (samples - wins) : 0,
        baselineWinRate: baseline,
        edgePoints: (winRate - baseline) * 100,
        ciLow: ci.low,
        ciHigh: ci.high,
        trainSamples: trSamples,
        trainWinRate,
        trainBaseline,
        testSamples: teSamples,
        testWinRate,
        testBaseline,
        verdict,
      });
    }
  }

  return {
    candleCount: n,
    from: n > 0 ? candles[0].t : 0,
    to: n > 0 ? candles[n - 1].t : 0,
    splitIndex: split,
    stats,
    events,
  };
}
