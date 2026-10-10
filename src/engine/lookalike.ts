import { PATTERN_HORIZONS, type PatternCandle } from './patterns';

export const LOOKALIKE_WINDOW = 24;
export const LOOKALIKE_NEIGHBORS = 50;
const MAX_CANDIDATES = 10000;

export interface LookalikeHorizon {
  horizon: number;
  samples: number;
  upShare: number;
  avgMovePct: number;
  baselineUp: number;
}

export interface LookalikeNow {
  usable: boolean;
  neighbors: number;
  horizons: LookalikeHorizon[];
  examples: { t: number; distance: number }[];
}

export interface LookalikeBacktest {
  queries: number;
  horizon: number;
  correct: number;
  accuracy: number;
  alwaysUpRate: number;
  confidentQueries: number;
  confidentAccuracy: number;
}

// z-normalised closing-price shape for the window ending at candle e
function windowVector(candles: PatternCandle[], e: number, L: number, out: Float32Array, offset: number): boolean {
  let sum = 0;
  for (let k = 0; k < L; k++) sum += candles[e - L + 1 + k].c;
  const mean = sum / L;
  let sq = 0;
  for (let k = 0; k < L; k++) {
    const d = candles[e - L + 1 + k].c - mean;
    sq += d * d;
  }
  const sd = Math.sqrt(sq / L);
  if (!(sd > 0)) return false;
  for (let k = 0; k < L; k++) out[offset + k] = (candles[e - L + 1 + k].c - mean) / sd;
  return true;
}

interface Prepared {
  L: number;
  vectors: Float32Array;
  valid: Uint8Array;
}

function prepare(candles: PatternCandle[], L: number): Prepared {
  const n = candles.length;
  const vectors = new Float32Array(n * L);
  const valid = new Uint8Array(n);
  for (let e = L - 1; e < n; e++) {
    valid[e] = windowVector(candles, e, L, vectors, e * L) ? 1 : 0;
  }
  return { L, vectors, valid };
}

// Finds the closest earlier windows to the one ending at `queryEnd`, using only candles up to `queryEnd`.
function nearest(
  candles: PatternCandle[],
  prep: Prepared,
  queryEnd: number,
  maxHorizon: number,
  k: number
): { e: number; d: number }[] {
  const { L, vectors, valid } = prep;
  if (!valid[queryEnd]) return [];
  const lastCandidate = Math.min(queryEnd - L, queryEnd - maxHorizon);
  const firstCandidate = Math.max(L - 1, lastCandidate - MAX_CANDIDATES);
  const qOff = queryEnd * L;
  const scored: { e: number; d: number }[] = [];
  for (let e = firstCandidate; e <= lastCandidate; e++) {
    if (!valid[e]) continue;
    const off = e * L;
    let dist = 0;
    for (let j = 0; j < L; j++) {
      const diff = vectors[off + j] - vectors[qOff + j];
      dist += diff * diff;
    }
    scored.push({ e, d: Math.sqrt(dist) });
  }
  scored.sort((a, b) => a.d - b.d);
  const picked: { e: number; d: number }[] = [];
  const spacing = Math.floor(L / 2);
  for (const s of scored) {
    let tooClose = false;
    for (const p of picked) {
      if (Math.abs(p.e - s.e) < spacing) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) picked.push(s);
    if (picked.length >= k) break;
  }
  return picked;
}

export function lookalikeNow(candles: PatternCandle[], horizons: number[] = PATTERN_HORIZONS): LookalikeNow {
  const n = candles.length;
  const L = LOOKALIKE_WINDOW;
  const maxH = Math.max(...horizons);
  if (n < L + maxH + 200) return { usable: false, neighbors: 0, horizons: [], examples: [] };
  const prep = prepare(candles, L);
  const picks = nearest(candles, prep, n - 1, maxH, LOOKALIKE_NEIGHBORS);
  if (picks.length < 10) return { usable: false, neighbors: picks.length, horizons: [], examples: [] };

  const out: LookalikeHorizon[] = [];
  for (const h of horizons) {
    let up = 0, total = 0, moveSum = 0;
    for (const p of picks) {
      if (p.e + h >= n) continue;
      total++;
      const move = (candles[p.e + h].c - candles[p.e].c) / candles[p.e].c;
      moveSum += move;
      if (move > 0) up++;
    }
    let bUp = 0, bTotal = 0;
    for (let j = L; j + h < n; j++) {
      bTotal++;
      if (candles[j + h].c > candles[j].c) bUp++;
    }
    out.push({
      horizon: h,
      samples: total,
      upShare: total ? up / total : 0,
      avgMovePct: total ? (moveSum / total) * 100 : 0,
      baselineUp: bTotal ? bUp / bTotal : 0,
    });
  }
  return {
    usable: true,
    neighbors: picks.length,
    horizons: out,
    examples: picks.slice(0, 5).map((p) => ({ t: candles[p.e].t, distance: p.d })),
  };
}

// Honest check: pretend we are standing at past moments, use only the data before them, and see if the majority vote was right.
export async function lookalikeBacktest(
  candles: PatternCandle[],
  horizon: number,
  maxQueries = 100
): Promise<LookalikeBacktest | null> {
  const n = candles.length;
  const L = LOOKALIKE_WINDOW;
  const maxH = Math.max(...PATTERN_HORIZONS);
  if (n < 1000) return null;
  const prep = prepare(candles, L);
  const firstQuery = Math.floor(n * 0.8);
  const lastQuery = n - 1 - horizon;
  if (lastQuery <= firstQuery) return null;
  const stride = Math.max(1, Math.floor((lastQuery - firstQuery) / maxQueries));

  let queries = 0, correct = 0, upCount = 0, confident = 0, confidentCorrect = 0;
  let counter = 0;
  for (let q = firstQuery; q <= lastQuery; q += stride) {
    const picks = nearest(candles, prep, q, maxH, LOOKALIKE_NEIGHBORS);
    if (picks.length >= 10) {
      let up = 0;
      let total = 0;
      for (const p of picks) {
        if (p.e + horizon > q) continue;
        total++;
        if (candles[p.e + horizon].c > candles[p.e].c) up++;
      }
      if (total >= 10) {
        const share = up / total;
        const actualUp = candles[q + horizon].c > candles[q].c;
        const actualDown = candles[q + horizon].c < candles[q].c;
        if (actualUp || actualDown) {
          queries++;
          if (actualUp) upCount++;
          const predictUp = share >= 0.5;
          if (predictUp === actualUp) correct++;
          if (share >= 0.65 || share <= 0.35) {
            confident++;
            if (predictUp === actualUp) confidentCorrect++;
          }
        }
      }
    }
    counter++;
    if (counter % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (queries === 0) return null;
  return {
    queries,
    horizon,
    correct,
    accuracy: correct / queries,
    alwaysUpRate: upCount / queries,
    confidentQueries: confident,
    confidentAccuracy: confident ? confidentCorrect / confident : 0,
  };
}
