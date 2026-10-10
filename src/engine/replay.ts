import { type PatternCandle, PATTERN_HORIZONS } from './patterns';
import { lookalikeDrafts, TF_MS } from './predictor';
import { discoverWords, candleLetters, WORD_LETTERS, WORD_LENGTHS } from './discovery';
import { breakEven, exactUpperP, normalQuantile, effectiveN, trialStatus } from './arena';

export interface ReplayParams {
  stride: number;
  rangeCandles: number | null;
  windowMax: number;
  includeDiscovery: boolean;
  payoutPct: number;
  seed: number;
}

export interface ReplayTrialRow {
  key: string;
  finderId: 'lookalike' | 'discovery' | 'control' | 'mom1';
  label: string;
  h: number;
  N: number;
  wins: number;
  ties: number;
  expired: number;
  winRate: number;
  breakEven: number;
  neff: number | null;
  de: number | null;
  pValue: number | null;
  boundPts: number | null;
  thirdsAbove: number;
  alwaysUp: number;
  status: string;
  isReference: boolean;
}

export interface ReplayResult {
  runAt: number;
  sym: string;
  tf: string;
  params: ReplayParams;
  rangeLabel: string;
  speedLabel: string;
  stepsEvaluated: number;
  startT: number;
  endT: number;
  durationMs: number;
  K: number;
  leakWarning: boolean;
  trials: ReplayTrialRow[];
}

interface TrialState {
  finderId: 'lookalike' | 'discovery' | 'control' | 'mom1';
  label: string;
  h: number;
  flags: number[];
  times: number[];
  upMoves: number;
  ties: number;
  expired: number;
  busyUntil: number;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function runReplay(
  candles: PatternCandle[],
  sym: string,
  tf: string,
  params: ReplayParams,
  rangeLabel: string,
  speedLabel: string,
  onProgress: (percent: number, detail: string) => void,
  shouldCancel: () => boolean
): Promise<ReplayResult | null> {
  const startTime = Date.now();
  const n = candles.length;
  const stepMs = TF_MS[tf] || 60000;
  if (n < 1500) {
    throw new Error('Not enough stored candles (need at least 1,500).');
  }

  const startIdx =
    params.rangeCandles === null
      ? 1000
      : Math.max(1000, n - 1 - params.rangeCandles);
  const lastIdx = n - 2;
  if (startIdx > lastIdx) {
    throw new Error('Not enough candles for this range.');
  }

  const lettersAll = params.includeDiscovery ? candleLetters(candles) : null;
  const rand = mulberry32(params.seed);
  const refreshEvery = Math.max(1, Math.round(21600000 / stepMs)); // 6 hours of candles

  const trialStates = new Map<string, TrialState>();

  let currentI = startIdx;

  function place(
    key: string,
    finderId: 'lookalike' | 'discovery' | 'control' | 'mom1',
    label: string,
    h: number,
    dir: 'up' | 'down'
  ): void {
    let state = trialStates.get(key);
    if (!state) {
      state = {
        finderId,
        label,
        h,
        flags: [],
        times: [],
        upMoves: 0,
        ties: 0,
        expired: 0,
        busyUntil: -1,
      };
      trialStates.set(key, state);
    }

    if (currentI < state.busyUntil) return;

    const exitIdx = currentI + h;
    if (exitIdx > n - 1) return;

    if (candles[exitIdx].t !== candles[currentI].t + h * stepMs) {
      state.expired++;
      state.busyUntil = exitIdx;
      return;
    }

    const entry = candles[currentI].c;
    const exit = candles[exitIdx].c;
    if (exit === entry) {
      state.ties++;
    } else {
      const win = (dir === 'up') === (exit > entry);
      state.flags.push(win ? 1 : 0);
      state.times.push(candles[currentI].t);
      if (exit > entry) {
        state.upMoves++;
      }
    }

    state.busyUntil = exitIdx;
  }

  let steps = 0;
  let lastRefresh = -9999999;
  let passed: Array<{ word: string; horizon: number; direction: 'bullish' | 'bearish' }> = [];

  for (let i = startIdx; i <= lastIdx; i += params.stride) {
    currentI = i;
    steps++;

    if (steps % 5 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }

    if (steps % 10 === 0) {
      const percent = Math.round(((i - startIdx) / (lastIdx - startIdx)) * 100);
      const avgMs = (Date.now() - startTime) / steps;
      const totalSteps = Math.floor((lastIdx - startIdx) / params.stride) + 1;
      const remainingSteps = Math.max(0, totalSteps - steps);
      const minutesLeft = Math.ceil((remainingSteps * avgMs) / 60000);
      const detail =
        steps <= 20
          ? `${steps} steps, estimating`
          : `${steps} steps, about ${minutesLeft} min left`;
      onProgress(percent, detail);
    }

    if (shouldCancel()) {
      return null;
    }

    const window = candles.slice(Math.max(0, i + 1 - params.windowMax), i + 1);
    if (window[window.length - 1].t !== candles[i].t) {
      throw new Error('Replay safety check failed');
    }

    // 1) Lookalike
    const lookalikeKey = 'lookalike|h5';
    const lookalikeState = trialStates.get(lookalikeKey);
    if (!lookalikeState || i >= lookalikeState.busyUntil) {
      const drafts = lookalikeDrafts(window);
      for (const draft of drafts) {
        place(lookalikeKey, 'lookalike', 'Lookalike (h5)', 5, draft.direction);
      }
    }

    // 2) Discovery (only if params.includeDiscovery)
    if (params.includeDiscovery && lettersAll) {
      if (lastRefresh < 0 || i - lastRefresh >= refreshEvery) {
        passed = discoverWords(window).passed;
        lastRefresh = i;
      }
      for (const d of passed) {
        const L = d.word.length;
        if (i - L + 1 < 0) continue;
        let matches = true;
        for (let k = 0; k < L; k++) {
          if (lettersAll[i - L + 1 + k] !== d.word[k]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          const dir = d.direction === 'bullish' ? 'up' : 'down';
          place(
            'discovery|' + d.word + '|h' + d.horizon + '|' + dir,
            'discovery',
            'Discovery ' + d.word + ' -> ' + dir + ' h' + d.horizon,
            d.horizon,
            dir
          );
        }
      }
    }

    // 3) Control: key 'control|h5', label 'Control: coin flip (h5)'
    const controlKey = 'control|h5';
    const controlState = trialStates.get(controlKey);
    if (!controlState || i >= controlState.busyUntil) {
      const dir = rand() < 0.5 ? 'up' : 'down';
      place(controlKey, 'control', 'Control: coin flip (h5)', 5, dir);
    }

    // 4) Reference: key 'mom1|h1', label 'Reference: same direction as the last candle (h1)'
    const mom1Key = 'mom1|h1';
    const diff = candles[i].c - candles[i - 1].c;
    if (diff !== 0) {
      place(
        mom1Key,
        'mom1',
        'Reference: same direction as the last candle (h1)',
        1,
        diff > 0 ? 'up' : 'down'
      );
    }
  }

  const K =
    (params.includeDiscovery
      ? WORD_LENGTHS.reduce((acc, L) => acc + Math.pow(WORD_LETTERS.length, L), 0) *
        PATTERN_HORIZONS.length *
        2
      : 0) + 3;

  const rows: ReplayTrialRow[] = [];
  const be = breakEven(params.payoutPct);
  const weekly = tf === '1h' || tf === '4h' || tf === '1d';

  for (const [key, state] of trialStates.entries()) {
    const N = state.flags.length;
    if (N === 0) continue;

    const wins = state.flags.reduce((a, b) => a + b, 0);
    const winRate = wins / N;
    const eff = effectiveN(state.flags, state.times, weekly);
    const neff = eff.neff;
    const de = eff.de;

    const pValue =
      neff !== null && neff > 0
        ? exactUpperP(Math.round(winRate * neff), Math.round(neff), be)
        : null;

    const boundPts =
      neff !== null && neff > 0
        ? (winRate - be + (normalQuantile(1 - 0.05 / K) * 0.5) / Math.sqrt(neff)) * 100
        : null;

    let thirdsAbove = 0;
    const t1End = Math.floor(N / 3);
    const t2End = Math.floor((2 * N) / 3);
    const t1 = state.flags.slice(0, t1End);
    const t2 = state.flags.slice(t1End, t2End);
    const t3 = state.flags.slice(t2End);
    if (t1.length > 0 && t1.reduce((a, b) => a + b, 0) / t1.length > be) thirdsAbove++;
    if (t2.length > 0 && t2.reduce((a, b) => a + b, 0) / t2.length > be) thirdsAbove++;
    if (t3.length > 0 && t3.reduce((a, b) => a + b, 0) / t3.length > be) thirdsAbove++;

    const alwaysUp = state.upMoves / N;
    const status = trialStatus(
      N,
      neff,
      boundPts === null ? 0 : boundPts / 100,
      pValue === null ? 1 : pValue,
      thirdsAbove
    );
    const isReference = state.finderId === 'control' || state.finderId === 'mom1';

    rows.push({
      key,
      finderId: state.finderId,
      label: state.label,
      h: state.h,
      N,
      wins,
      ties: state.ties,
      expired: state.expired,
      winRate,
      breakEven: be,
      neff,
      de,
      pValue,
      boundPts,
      thirdsAbove,
      alwaysUp,
      status,
      isReference,
    });
  }

  const primaryRows: ReplayTrialRow[] = [];
  const discoveryRows: ReplayTrialRow[] = [];

  const lookalikeRow = rows.find((r) => r.finderId === 'lookalike');
  const controlRow = rows.find((r) => r.finderId === 'control');
  const mom1Row = rows.find((r) => r.finderId === 'mom1');

  if (lookalikeRow) primaryRows.push(lookalikeRow);
  if (controlRow) primaryRows.push(controlRow);
  if (mom1Row) primaryRows.push(mom1Row);

  for (const r of rows) {
    if (r.finderId === 'discovery') {
      discoveryRows.push(r);
    }
  }

  discoveryRows.sort((a, b) => b.N - a.N);
  const maxDiscovery = Math.max(0, 60 - primaryRows.length);
  const selectedDiscovery = discoveryRows.slice(0, maxDiscovery);

  const finalRows = [...primaryRows, ...selectedDiscovery];

  const leakWarning =
    controlRow !== undefined &&
    controlRow.N >= 300 &&
    Math.abs(controlRow.winRate - 0.5) > 0.05;

  const durationMs = Date.now() - startTime;

  return {
    runAt: Date.now(),
    sym,
    tf,
    params,
    rangeLabel,
    speedLabel,
    stepsEvaluated: steps,
    startT: candles[startIdx].t,
    endT: candles[lastIdx].t,
    durationMs,
    K,
    leakWarning,
    trials: finalRows,
  };
}
