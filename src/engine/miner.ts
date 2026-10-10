import type { PatternCandle } from './patterns';
import { exactUpperP, normalQuantile } from './arena';

export type MinerTypeId =
  | 'runs'
  | 'shape'
  | 'moveSize'
  | 'volRegime'
  | 'volSurge'
  | 'timeOfDay'
  | 'rangePos'
  | 'flow';

export const MINER_TYPES: { id: MinerTypeId; name: string }[] = [
  { id: 'runs', name: 'Candle runs' },
  { id: 'shape', name: 'Candle shape' },
  { id: 'moveSize', name: 'Move size' },
  { id: 'volRegime', name: 'Volatility regime' },
  { id: 'volSurge', name: 'Volume surge' },
  { id: 'timeOfDay', name: 'Time of day' },
  { id: 'rangePos', name: 'Position in range' },
  { id: 'flow', name: 'Buy/sell pressure' },
];

export const MINER_HORIZONS = [1, 3, 5, 10];

export type MinerCandle = PatternCandle & { tbv?: number };

export function minerLabels(
  typeId: MinerTypeId,
  candles: MinerCandle[],
  letters: string[] | null
): string[][] {
  const n = candles.length;
  const result: string[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = [];
  }

  if (n === 0) return result;

  const dirAt = (i: number): 'U' | 'D' | 'F' => {
    if (i < 1) return 'F';
    const cNow = candles[i].c;
    const cPrev = candles[i - 1].c;
    if (cNow > cPrev) return 'U';
    if (cNow < cPrev) return 'D';
    return 'F';
  };

  const retAbs = (i: number): number => {
    if (i < 1) return 0;
    const cPrev = candles[i - 1].c;
    if (cPrev === 0) return 0;
    return Math.abs(candles[i].c - cPrev) / cPrev;
  };

  // Precompute dirAt and retAbs for performance
  const dirs: ('U' | 'D' | 'F')[] = new Array(n);
  const rets: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    dirs[i] = dirAt(i);
    rets[i] = retAbs(i);
  }

  for (let i = 0; i < n; i++) {
    const d = dirs[i];

    switch (typeId) {
      case 'runs': {
        // for k = 2, 3 and 4, if i >= k and none of dirAt(i-k+1..i) is 'F' then add 'r' + k + ':' + those k letters
        for (const k of [2, 3, 4]) {
          if (i >= k) {
            let hasF = false;
            let str = '';
            for (let j = i - k + 1; j <= i; j++) {
              if (dirs[j] === 'F') {
                hasF = true;
                break;
              }
              str += dirs[j];
            }
            if (!hasF) {
              result[i].push('r' + k + ':' + str);
            }
          }
        }
        break;
      }

      case 'shape': {
        // if i >= 1, letters is not null and letters[i-1] and letters[i] are both not '?' then 's:' + letters[i-1] + letters[i]
        if (i >= 1 && letters !== null) {
          const lPrev = letters[i - 1];
          const lNow = letters[i];
          if (lPrev && lNow && lPrev !== '?' && lNow !== '?') {
            result[i].push('s:' + lPrev + lNow);
          }
        }
        break;
      }

      case 'moveSize': {
        // needs i >= 61; m60 = mean of retAbs(j) for j = i-60..i-1; skip if m60 is 0 or dirAt(i) is 'F'; z = retAbs(i) / m60; bucket = z >= 2 ? 'big' : z >= 1 ? 'mid' : 'small'; label 'm:' + bucket + dirAt(i)
        if (i >= 61 && d !== 'F') {
          let sum = 0;
          for (let j = i - 60; j <= i - 1; j++) {
            sum += rets[j];
          }
          const m60 = sum / 60;
          if (m60 > 0) {
            const z = rets[i] / m60;
            const bucket = z >= 2 ? 'big' : z >= 1 ? 'mid' : 'small';
            result[i].push('m:' + bucket + d);
          }
        }
        break;
      }

      case 'volRegime': {
        // needs i >= 61; a10 = mean retAbs over j = i-9..i; a60 = mean retAbs over j = i-59..i; skip if a60 is 0 or dirAt(i) is 'F'; ratio = a10 / a60; bucket = ratio < 0.6 ? 'squeeze' : ratio > 1.4 ? 'burst' : 'normal'; label 'v:' + bucket + dirAt(i)
        if (i >= 61 && d !== 'F') {
          let s10 = 0;
          for (let j = i - 9; j <= i; j++) {
            s10 += rets[j];
          }
          let s60 = 0;
          for (let j = i - 59; j <= i; j++) {
            s60 += rets[j];
          }
          const a10 = s10 / 10;
          const a60 = s60 / 60;
          if (a60 > 0) {
            const ratio = a10 / a60;
            const bucket = ratio < 0.6 ? 'squeeze' : ratio > 1.4 ? 'burst' : 'normal';
            result[i].push('v:' + bucket + d);
          }
        }
        break;
      }

      case 'volSurge': {
        // needs i >= 61; med = median of v[j] for j = i-60..i-1; skip if med is 0 or dirAt(i) is 'F'; ratio = v[i] / med; bucket = ratio < 0.7 ? 'low' : ratio > 1.5 ? 'surge' : 'normal'; label 'u:' + bucket + dirAt(i)
        if (i >= 61 && d !== 'F') {
          const arr: number[] = new Array(60);
          for (let j = 0; j < 60; j++) {
            arr[j] = candles[i - 60 + j].v;
          }
          arr.sort((a, b) => a - b);
          const med = (arr[29] + arr[30]) / 2;
          if (med > 0) {
            const ratio = candles[i].v / med;
            const bucket = ratio < 0.7 ? 'low' : ratio > 1.5 ? 'surge' : 'normal';
            result[i].push('u:' + bucket + d);
          }
        }
        break;
      }

      case 'timeOfDay': {
        // skip if dirAt(i) is 'F'; block = Math.floor(new Date(candles[i].t).getUTCHours() / 4); label 't:' + block + dirAt(i)
        if (d !== 'F') {
          const block = Math.floor(new Date(candles[i].t).getUTCHours() / 4);
          result[i].push('t:' + block + d);
        }
        break;
      }

      case 'rangePos': {
        // needs i >= 30; lo = minimum of l[j] and hi = maximum of h[j] for j = i-29..i; skip if hi equals lo or dirAt(i) is 'F'; pos = (c[i] - lo) / (hi - lo); bucket = pos < 0.2 ? 'low' : pos > 0.8 ? 'high' : 'mid'; label 'p:' + bucket + dirAt(i)
        if (i >= 30 && d !== 'F') {
          let lo = candles[i - 29].l;
          let hi = candles[i - 29].h;
          for (let j = i - 28; j <= i; j++) {
            if (candles[j].l < lo) lo = candles[j].l;
            if (candles[j].h > hi) hi = candles[j].h;
          }
          if (hi > lo) {
            const pos = (candles[i].c - lo) / (hi - lo);
            const bucket = pos < 0.2 ? 'low' : pos > 0.8 ? 'high' : 'mid';
            result[i].push('p:' + bucket + d);
          }
        }
        break;
      }

      case 'flow': {
        // skip if v[i] <= 0 or tbv[i] is not a finite number or dirAt(i) is 'F'; share = tbv[i] / v[i]; bucket = share < 0.42 ? 'sellers' : share > 0.58 ? 'buyers' : 'balanced'; label 'f:' + bucket + dirAt(i)
        const tbv = candles[i].tbv;
        if (
          candles[i].v > 0 &&
          typeof tbv === 'number' &&
          Number.isFinite(tbv) &&
          d !== 'F'
        ) {
          const share = tbv / candles[i].v;
          const bucket =
            share < 0.42 ? 'sellers' : share > 0.58 ? 'buyers' : 'balanced';
          result[i].push('f:' + bucket + d);
        }
        break;
      }
    }
  }

  return result;
}

export interface MinerRow {
  cat: string;
  h: number;
  dir: 'up' | 'down';
  trainN: number;
  trainWins: number;
  testN: number;
  testWins: number;
}

export interface MinerJobResult {
  typeId: MinerTypeId;
  skipped: string | null;
  rows: MinerRow[];
  hypotheses: string[];
}

export function mineSlice(
  typeId: MinerTypeId,
  candles: MinerCandle[],
  letters: string[] | null,
  sliceStartIdx: number,
  sliceEndIdx: number,
  stepMs: number,
  breakEvenValue: number
): MinerJobResult {
  if (typeId === 'flow') {
    let finiteCount = 0;
    for (let i = sliceStartIdx; i <= sliceEndIdx; i++) {
      if (typeof candles[i].tbv === 'number' && Number.isFinite(candles[i].tbv)) {
        finiteCount++;
      }
    }
    if (finiteCount < 500) {
      return {
        typeId,
        skipped: 'no buy/sell data in this slice',
        rows: [],
        hypotheses: [],
      };
    }
  }

  const labels = minerLabels(typeId, candles, letters);
  const trainEnd =
    sliceStartIdx +
    Math.floor((sliceEndIdx - sliceStartIdx + 1) * 0.7) -
    1;

  // State per (category, horizon) key: trainUp, trainDown, testUp, testDown, nextFree (initially 0)
  interface KeyState {
    trainUp: number;
    trainDown: number;
    testUp: number;
    testDown: number;
    nextFree: number;
  }

  const states = new Map<string, KeyState>();

  for (let i = sliceStartIdx; i <= sliceEndIdx; i++) {
    const cLabels = labels[i];
    if (!cLabels || cLabels.length === 0) continue;

    for (const cat of cLabels) {
      for (const h of MINER_HORIZONS) {
        const key = cat + '|h' + h;
        let s = states.get(key);
        if (!s) {
          s = { trainUp: 0, trainDown: 0, testUp: 0, testDown: 0, nextFree: 0 };
          states.set(key, s);
        }

        const portionEnd = i <= trainEnd ? trainEnd : sliceEndIdx;
        if (i < s.nextFree) continue;
        if (i + h > portionEnd) continue;
        if (candles[i + h].t !== candles[i].t + h * stepMs) continue;

        const entry = candles[i].c;
        const exit = candles[i + h].c;
        if (exit === entry) {
          // a tie is not an event and does not set nextFree
          continue;
        }

        const isUp = exit > entry;
        if (i <= trainEnd) {
          if (isUp) s.trainUp++;
          else s.trainDown++;
        } else {
          if (isUp) s.testUp++;
          else s.testDown++;
        }
        s.nextFree = i + h;
      }
    }
  }

  const rows: MinerRow[] = [];
  const hypotheses: string[] = [];

  for (const [key, s] of states.entries()) {
    const trainN = s.trainUp + s.trainDown;
    if (trainN >= 100) {
      hypotheses.push(typeId + '|' + key);
      const dir: 'up' | 'down' = s.trainUp >= s.trainDown ? 'up' : 'down';
      const trainWins = Math.max(s.trainUp, s.trainDown);
      if (trainWins / trainN >= breakEvenValue) {
        const sepIdx = key.lastIndexOf('|h');
        const cat = key.substring(0, sepIdx);
        const h = parseInt(key.substring(sepIdx + 2), 10);
        const testWins = dir === 'up' ? s.testUp : s.testDown;
        const testN = s.testUp + s.testDown;
        rows.push({
          cat,
          h,
          dir,
          trainN,
          trainWins,
          testN,
          testWins,
        });
      }
    }
  }

  return {
    typeId,
    skipped: null,
    rows,
    hypotheses,
  };
}

export interface LibEntry {
  id: string;
  sym: string;
  tf: string;
  typeId: MinerTypeId;
  cat: string;
  h: number;
  dir: 'up' | 'down';
  slices: number;
  slicesAbove: number;
  trainN: number;
  trainWins: number;
  testN: number;
  testWins: number;
  firstMinedAt: number;
  lastMinedAt: number;
}

export function libStatus(
  e: LibEntry,
  K: number,
  be: number
): {
  status: string;
  winRate: number;
  pValue: number | null;
  boundPts: number | null;
} {
  const N = e.testN;
  if (N < 200) {
    return {
      status: 'TOO EARLY',
      winRate: N > 0 ? e.testWins / N : 0,
      pValue: null,
      boundPts: null,
    };
  }

  const winRate = e.testWins / N;
  const z = normalQuantile(1 - 0.05 / Math.max(1, K));
  const boundPts = (winRate - be + (z * 0.5) / Math.sqrt(N)) * 100;
  const pValue = exactUpperP(e.testWins, N, be);

  if (boundPts < 0) {
    return { status: 'NO EDGE FOUND', winRate, pValue, boundPts };
  }

  if (
    pValue <= 0.05 / K &&
    e.slices >= 3 &&
    e.slicesAbove * 3 >= e.slices * 2
  ) {
    return { status: 'SURVIVES TESTING-COUNT (history)', winRate, pValue, boundPts };
  }

  if (
    pValue <= 0.05 &&
    e.slices >= 2 &&
    e.slicesAbove * 3 >= e.slices * 2
  ) {
    return { status: 'PROMISING (history)', winRate, pValue, boundPts };
  }

  return { status: 'NOT PROVEN', winRate, pValue, boundPts };
}
