import {
  db,
  type ArenaSignalRecord,
  type ArenaOutcomeRecord,
  type ArenaTrialRecord,
  type PredictionRecord,
} from './db';
import { TF_MS } from '../engine/predictor';
import {
  breakEven,
  exactUpperP,
  normalQuantile,
  effectiveN,
  trialStatus,
  wilsonRange,
} from '../engine/arena';

export const ARENA_MAX_DELAY_MS = 120000;
export const ARENA_FINDER_VERSION = 'v1';

export interface ArenaTotals {
  recorded: number;
  counted: number;
  notCountedCatchup: number;
  notCountedLate: number;
  ties: number;
  expired: number;
  open: number;
}

export interface ArenaTrialRow {
  trialId: string;
  label: string;
  N: number;
  wins: number;
  winRate: number;
  wilsonLow: number;
  wilsonHigh: number;
  breakEven: number;
  neff: number | null;
  de: number | null;
  pValue: number;
  bound: number; // in points (x100)
  bestCaseExpectancy: number;
  alwaysUp: number;
  alwaysDown: number;
  thirdsAbove: number;
  status: string;
}

export interface ArenaReport {
  K: number;
  totals: ArenaTotals;
  trials: ArenaTrialRow[];
}

/**
 * Adds an ArenaTrialRecord if the id does not exist (never overwrites).
 */
export async function registerTrial(rec: ArenaTrialRecord): Promise<void> {
  try {
    const existing = await db.arenaTrials.get(rec.id);
    if (!existing) {
      await db.arenaTrials.add(rec);
    }
  } catch (err: any) {
    if (err?.name !== 'ConstraintError') {
      // ignore
    }
  }
}

/**
 * Computes signal ID and trial ID for a prediction record.
 */
export function getSignalAndTrialId(p: PredictionRecord): {
  trialId: string;
  signalId: string;
  entryObsT: number;
  configHash: string;
} {
  const finderId = p.source;
  const configHash = p.source === 'lookalike' ? 'up60dn40n30' : 'w:' + p.note;
  const stepMs = TF_MS[p.tf] || 60000;
  const entryObsT = p.entryT + stepMs;
  const src = 'binance';
  const trialId = `${finderId}|${ARENA_FINDER_VERSION}|${configHash}|${src}|${p.sym}|${p.tf}|${p.horizon}`;
  const signalId = `${trialId}|${entryObsT}`;
  return { trialId, signalId, entryObsT, configHash };
}

/**
 * Records an ArenaSignal from a PredictionRecord.
 * Registers a trial first, then adds the signal (never overwrites).
 */
export async function recordArenaSignal(p: PredictionRecord): Promise<void> {
  const { trialId, signalId, entryObsT, configHash } = getSignalAndTrialId(p);
  const stepMs = TF_MS[p.tf] || 60000;
  const exitTargetT = p.targetT + stepMs;
  const decisionT = p.t;
  const delayMs = p.t - entryObsT;
  const src = 'binance';
  const mode = p.mode || 'live';
  const eligible = mode === 'live' && delayMs <= ARENA_MAX_DELAY_MS;

  // Register trial before signal (count 0 for discovery, count 1 for lookalike)
  const trialKind: 'config' = 'config';
  const trialCount = p.source === 'lookalike' ? 1 : 0;
  await registerTrial({
    id: trialId,
    createdAt: p.t,
    kind: trialKind,
    finderId: p.source,
    sym: p.sym,
    tf: p.tf,
    count: trialCount,
  });

  const signal: ArenaSignalRecord = {
    id: signalId,
    trialId,
    predictionId: p.id,
    finderId: p.source,
    finderVersion: ARENA_FINDER_VERSION,
    configHash,
    src,
    sym: p.sym,
    tf: p.tf,
    horizon: p.horizon,
    direction: p.direction,
    mode,
    decisionT,
    entryObsT,
    entryPrice: p.entryPrice,
    exitTargetT,
    delayMs,
    eligible,
    confidence: p.confidence,
    baseline: p.baseline,
  };

  try {
    const existing = await db.arenaSignals.get(signalId);
    if (!existing) {
      await db.arenaSignals.add(signal);
    }
  } catch (err: any) {
    if (err?.name !== 'ConstraintError') {
      // ignore
    }
  }
}

/**
 * Records an ArenaOutcome for a PredictionRecord.
 * Only adds if the corresponding signal exists and outcome is absent.
 */
export async function recordArenaOutcome(
  p: PredictionRecord,
  result: 'won' | 'lost' | 'tie' | 'expired',
  exitPrice?: number,
  exitObsT: number = Date.now()
): Promise<void> {
  const { signalId } = getSignalAndTrialId(p);

  const signal = await db.arenaSignals.get(signalId);
  if (!signal) {
    // Prediction made before this update is ignored
    return;
  }

  let pctMove: number | undefined;
  if (exitPrice !== undefined && p.entryPrice > 0) {
    pctMove = ((exitPrice - p.entryPrice) / p.entryPrice) * 100;
    if (p.direction === 'down') {
      pctMove *= -1;
    }
  }

  const outcome: ArenaOutcomeRecord = {
    signalId,
    result,
    exitPrice,
    exitObsT,
    pctMove,
  };

  try {
    const existing = await db.arenaOutcomes.get(signalId);
    if (!existing) {
      await db.arenaOutcomes.add(outcome);
    }
  } catch (err: any) {
    if (err?.name !== 'ConstraintError') {
      // ignore
    }
  }
}

let inFlightReport: Promise<ArenaReport> | null = null;

/**
 * Computes the full Arena evidence report.
 * Safe to call concurrently; subsequent callers share the in-flight run.
 */
export async function getArenaReport(payoutPct: number): Promise<ArenaReport> {
  if (inFlightReport) {
    return inFlightReport;
  }
  inFlightReport = (async () => {
    try {
      return await computeArenaReport(payoutPct);
    } finally {
      inFlightReport = null;
    }
  })();
  return inFlightReport;
}

async function computeArenaReport(payoutPct: number): Promise<ArenaReport> {
  // Read the 3 tables once
  const [allTrials, allSignals, allOutcomes] = await Promise.all([
    db.arenaTrials.toArray(),
    db.arenaSignals.toArray(),
    db.arenaOutcomes.toArray(),
  ]);

  // Compute K = max(1, sum of arenaTrials.count)
  let sumCount = 0;
  for (const tr of allTrials) {
    sumCount += tr.count || 0;
  }
  const K = Math.max(1, sumCount);

  // Map outcomes by signalId
  const outcomeMap = new Map<string, ArenaOutcomeRecord>();
  for (let i = 0; i < allOutcomes.length; i++) {
    const oc = allOutcomes[i];
    outcomeMap.set(oc.signalId, oc);
    if (i > 0 && i % 2000 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const totals: ArenaTotals = {
    recorded: allSignals.length,
    counted: 0,
    notCountedCatchup: 0,
    notCountedLate: 0,
    ties: 0,
    expired: 0,
    open: 0,
  };

  type BetRecord = {
    signal: ArenaSignalRecord;
    outcome: ArenaOutcomeRecord;
  };

  // Group eligible won/lost bets by trialId
  const trialBetsMap = new Map<string, BetRecord[]>();

  for (let i = 0; i < allSignals.length; i++) {
    const s = allSignals[i];
    const oc = outcomeMap.get(s.id);

    if (!oc) {
      totals.open++;
    } else if (oc.result === 'expired') {
      totals.expired++;
    } else if (oc.result === 'tie') {
      totals.ties++;
    } else if (oc.result === 'won' || oc.result === 'lost') {
      if (s.eligible) {
        totals.counted++;
        let list = trialBetsMap.get(s.trialId);
        if (!list) {
          list = [];
          trialBetsMap.set(s.trialId, list);
        }
        list.push({ signal: s, outcome: oc });
      } else {
        if (s.mode === 'catchup') {
          totals.notCountedCatchup++;
        } else {
          totals.notCountedLate++;
        }
      }
    }

    if (i > 0 && i % 2000 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const be = breakEven(payoutPct);
  const zMult = normalQuantile(1 - 0.05 / K);
  const rows: ArenaTrialRow[] = [];

  for (const [trialId, bets] of trialBetsMap.entries()) {
    // Sort chronologically by entryObsT
    bets.sort((a, b) => a.signal.entryObsT - b.signal.entryObsT);

    const N = bets.length;
    const wins = bets.filter((b) => b.outcome.result === 'won').length;
    const winRate = wins / N;

    const { low: wilsonLow, high: wilsonHigh } = wilsonRange(wins, N, 1.96);

    const s0 = bets[0].signal;
    const isWeekly = s0.tf === '1h' || s0.tf === '4h' || s0.tf === '1d';
    const outcomesSeries = bets.map((b) => (b.outcome.result === 'won' ? 1 : 0));
    const entryTimesSeries = bets.map((b) => b.signal.entryObsT);

    const eff = effectiveN(outcomesSeries, entryTimesSeries, isWeekly);
    const neff = eff.neff;
    const de = eff.de;

    let pValue = 1;
    if (neff !== null && neff > 0) {
      const nRound = Math.round(neff);
      const wRound = Math.round(winRate * neff);
      pValue = exactUpperP(wRound, nRound, be);
    }

    // bound = (winRate - breakEven) + normalQuantile(1 - 0.05/K) * 0.5 / sqrt(neff) (points = x100)
    let bound = 0;
    let bestCaseExpectancy = 0;
    if (neff !== null && neff > 0) {
      const margin = (zMult * 0.5) / Math.sqrt(neff);
      bound = (winRate - be + margin) * 100;
      bestCaseExpectancy = (1 + payoutPct / 100) * (winRate + margin) - 1;
    }

    // alwaysUp & alwaysDown
    let upCount = 0;
    let totalExitCount = 0;
    for (const b of bets) {
      if (b.outcome.exitPrice !== undefined && b.signal.entryPrice !== undefined) {
        totalExitCount++;
        if (b.outcome.exitPrice > b.signal.entryPrice) {
          upCount++;
        }
      }
    }
    const alwaysUp = totalExitCount > 0 ? upCount / totalExitCount : 0;
    const alwaysDown = 1 - alwaysUp;

    // thirdsAbove: how many of the 3 chronological thirds have win rate > breakEven
    const t1 = Math.floor(N / 3);
    const t2 = Math.floor((2 * N) / 3);
    const chunk1 = bets.slice(0, t1);
    const chunk2 = bets.slice(t1, t2);
    const chunk3 = bets.slice(t2);

    let thirdsAbove = 0;
    if (chunk1.length > 0 && chunk1.filter((b) => b.outcome.result === 'won').length / chunk1.length > be) {
      thirdsAbove++;
    }
    if (chunk2.length > 0 && chunk2.filter((b) => b.outcome.result === 'won').length / chunk2.length > be) {
      thirdsAbove++;
    }
    if (chunk3.length > 0 && chunk3.filter((b) => b.outcome.result === 'won').length / chunk3.length > be) {
      thirdsAbove++;
    }

    // trialStatus: checks N < 30, neff null/ < 300, bound < 0, candidate, not proven
    const status = trialStatus(N, neff, bound / 100, pValue, thirdsAbove);

    const finderName = s0.finderId === 'lookalike' ? 'Lookalike' : 'Discovery';
    const label = `${s0.sym} ${s0.tf} · ${finderName} (${s0.configHash})`;

    rows.push({
      trialId,
      label,
      N,
      wins,
      winRate,
      wilsonLow,
      wilsonHigh,
      breakEven: be,
      neff,
      de,
      pValue,
      bound,
      bestCaseExpectancy,
      alwaysUp,
      alwaysDown,
      thirdsAbove,
      status,
    });
  }

  // Sort by N descending
  rows.sort((a, b) => b.N - a.N);

  return {
    K,
    totals,
    trials: rows,
  };
}
