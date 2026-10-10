import { calcAtr, PATTERN_HORIZONS, PATTERN_WARMUP, TRAIN_FRACTION, type PatternCandle } from './patterns';

export interface Discovery {
  word: string;
  horizon: number;
  direction: 'bullish' | 'bearish';
  trainSamples: number;
  trainWinRate: number;
  trainBaseline: number;
  trainZ: number;
  testSamples: number;
  testWinRate: number;
  testBaseline: number;
  testZ: number;
  activeNow: boolean;
  lastSeen: number;
}

export interface DiscoveryResult {
  testedCombos: number;
  passed: Discovery[];
  luckyExpected: number;
  candleCount: number;
}

// One letter per candle: how big its body is compared with the normal range (ATR).
// D = big red, d = small red, n = tiny, u = small green, U = big green.
export const WORD_LETTERS = ['D', 'd', 'n', 'u', 'U'];
export const WORD_LENGTHS = [3, 4];
const TRAIN_Z = 4.0;
const TEST_Z = 1.645;
const MIN_TRAIN = 100;
const MIN_TEST = 30;

function letterFor(c: PatternCandle, atrPrev: number): string {
  if (!(atrPrev > 0)) return '?';
  const r = (c.c - c.o) / atrPrev;
  if (r <= -1) return 'D';
  if (r <= -0.3) return 'd';
  if (r < 0.3) return 'n';
  if (r < 1) return 'u';
  return 'U';
}

export function candleLetters(candles: PatternCandle[]): string[] {
  const atr = calcAtr(candles, 14);
  const letters: string[] = new Array(candles.length).fill('?');
  for (let i = 1; i < candles.length; i++) letters[i] = letterFor(candles[i], atr[i - 1]);
  return letters;
}

function zScore(wins: number, n: number, p0: number): number {
  if (n === 0 || p0 <= 0 || p0 >= 1) return 0;
  return (wins / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
}

export function discoverWords(candles: PatternCandle[]): DiscoveryResult {
  const n = candles.length;
  const result: DiscoveryResult = { testedCombos: 0, passed: [], luckyExpected: 0, candleCount: n };
  if (n < 400) return result;

  const letters = candleLetters(candles);
  const split = Math.floor(n * TRAIN_FRACTION);
  const start = PATTERN_WARMUP;

  // index lists per word (word ends at candle i)
  const byWord: Record<string, number[]> = {};
  for (const L of WORD_LENGTHS) {
    for (let i = Math.max(start, L); i < n; i++) {
      let w = '';
      let ok = true;
      for (let k = i - L + 1; k <= i; k++) {
        const ch = letters[k];
        if (ch === '?') {
          ok = false;
          break;
        }
        w += ch;
      }
      if (!ok) continue;
      if (!byWord[w]) byWord[w] = [];
      byWord[w].push(i);
    }
  }

  // baselines per horizon and segment
  const upTrain: Record<number, number> = {}, downTrain: Record<number, number> = {};
  const upTest: Record<number, number> = {}, downTest: Record<number, number> = {};
  for (const h of PATTERN_HORIZONS) {
    let u1 = 0, d1 = 0, t1 = 0, u2 = 0, d2 = 0, t2 = 0;
    for (let j = start; j + h < n; j++) {
      const up = candles[j + h].c > candles[j].c;
      const down = candles[j + h].c < candles[j].c;
      if (j + h < split) {
        t1++;
        if (up) u1++;
        else if (down) d1++;
      } else if (j >= split) {
        t2++;
        if (up) u2++;
        else if (down) d2++;
      }
    }
    upTrain[h] = t1 ? u1 / t1 : 0;
    downTrain[h] = t1 ? d1 / t1 : 0;
    upTest[h] = t2 ? u2 / t2 : 0;
    downTest[h] = t2 ? d2 / t2 : 0;
  }

  const nowWords: string[] = [];
  for (const L of WORD_LENGTHS) {
    let w = '';
    for (let k = n - L; k < n; k++) w += letters[k];
    nowWords.push(w);
  }

  for (const word of Object.keys(byWord)) {
    const idx = byWord[word];
    for (const h of PATTERN_HORIZONS) {
      let trN = 0, trUp = 0, trDown = 0, teN = 0, teUp = 0, teDown = 0;
      for (const i of idx) {
        if (i + h >= n) continue;
        const up = candles[i + h].c > candles[i].c;
        const down = candles[i + h].c < candles[i].c;
        if (i + h < split) {
          trN++;
          if (up) trUp++;
          else if (down) trDown++;
        } else if (i >= split) {
          teN++;
          if (up) teUp++;
          else if (down) teDown++;
        }
      }
      if (trN < MIN_TRAIN) continue;
      for (const dir of ['bullish', 'bearish'] as const) {
        result.testedCombos++;
        const trWins = dir === 'bullish' ? trUp : trDown;
        const teWins = dir === 'bullish' ? teUp : teDown;
        const trBase = dir === 'bullish' ? upTrain[h] : downTrain[h];
        const teBase = dir === 'bullish' ? upTest[h] : downTest[h];
        const trZ = zScore(trWins, trN, trBase);
        if (trZ < TRAIN_Z) continue;
        const teZ = zScore(teWins, teN, teBase);
        if (teN >= MIN_TEST && teZ >= TEST_Z) {
          result.passed.push({
            word,
            horizon: h,
            direction: dir,
            trainSamples: trN,
            trainWinRate: trWins / trN,
            trainBaseline: trBase,
            trainZ: trZ,
            testSamples: teN,
            testWinRate: teWins / teN,
            testBaseline: teBase,
            testZ: teZ,
            activeNow: nowWords.includes(word),
            lastSeen: candles[idx[idx.length - 1]].t,
          });
        }
      }
    }
  }

  // Chance of a random combination passing both tests: P(z>=4.0) * P(z>=1.645)
  const pTrain = 0.0000317;
  const pTest = 0.05;
  result.luckyExpected = result.testedCombos * pTrain * pTest;
  result.passed.sort((a, b) => b.testZ + b.trainZ - (a.testZ + a.trainZ));
  result.passed = result.passed.slice(0, 15);
  return result;
}
