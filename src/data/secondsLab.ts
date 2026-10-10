import Dexie from 'dexie';
import { db } from './db';
import {
  SL_FINDERS,
  SL_HORIZONS,
  slBreakEven,
  slEffective,
  slExactUpperP,
  slNormalQuantile,
  slStatus,
} from '../engine/secondsLab';

export interface SecLabTrialStats {
  id: string;
  finderId: string;
  sym: string;
  h: number;
  payout: number;
  recorded: number;
  ineligible: number;
  ties: number;
  expired: number;
  N: number;
  winRate: number;
  breakEven: number;
  neff: number | null;
  de: number | null;
  pValue: number | null;
  bound: number | null;
  bestCaseExpectancy: number | null;
  thirdsAbove: number;
  status: string;
  alwaysUp: number;
  alwaysDown: number;
}

export interface SecLabReport {
  K: number;
  totals: {
    recorded: number;
    counted: number;
    ties: number;
    expired: number;
    ineligible: number;
  };
  trials: SecLabTrialStats[];
  controlWinRate: number | null;
}

let currentRunPromise: Promise<SecLabReport> | null = null;
let lastResult: SecLabReport | null = null;

async function doBuildSecLabReport(payouts: {
  p5: number;
  p15: number;
  p30: number;
}): Promise<SecLabReport> {
  const trialCount = await db.secTrials.count();
  const K = Math.max(1, trialCount);

  const allTrials = await db.secTrials.toArray();

  const trialsStats: SecLabTrialStats[] = [];
  const totals = {
    recorded: 0,
    counted: 0,
    ties: 0,
    expired: 0,
    ineligible: 0,
  };

  let coinWins = 0;
  let coinN = 0;

  for (const trial of allTrials) {
    // Yield to keep UI responsive
    await new Promise((r) => setTimeout(r, 0));

    let recorded = 0;
    let ineligible = 0;
    let ties = 0;
    let expired = 0;

    const wins01: number[] = [];
    const times: number[] = [];
    let upCount = 0;

    await db.secBets
      .where('[trialId+decisionT]')
      .between([trial.id, Dexie.minKey], [trial.id, Dexie.maxKey])
      .each((bet) => {
        recorded++;
        if (!bet.eligible) {
          ineligible++;
        }
        if (bet.outcome === 'tie') {
          ties++;
        } else if (bet.outcome === 'expired') {
          expired++;
        } else if (bet.eligible && (bet.outcome === 'won' || bet.outcome === 'lost')) {
          const isWin = bet.outcome === 'won' ? 1 : 0;
          wins01.push(isWin);
          times.push(bet.entryObsT);

          const priceRose =
            (bet.dir === 'up' && bet.outcome === 'won') ||
            (bet.dir === 'down' && bet.outcome === 'lost');
          if (priceRose) {
            upCount++;
          }
        }
      });

    const N = wins01.length;
    const wins = wins01.reduce((acc, val) => acc + val, 0);
    const winRate = N > 0 ? wins / N : 0;

    const payout =
      trial.h === 5 ? payouts.p5 : trial.h === 15 ? payouts.p15 : payouts.p30;
    const breakEven = slBreakEven(payout);

    const { neff, de } = slEffective(wins01, times);

    let pValue = 1;
    let bound = 0;
    let bestCaseExpectancy: number | null = null;

    if (neff !== null && neff > 0) {
      pValue = slExactUpperP(
        Math.round(winRate * neff),
        Math.round(neff),
        breakEven
      );
      const zK = slNormalQuantile(1 - 0.05 / K);
      const margin = (zK * 0.5) / Math.sqrt(neff);
      bound = winRate - breakEven + margin;
      bestCaseExpectancy = (1 + payout / 100) * (winRate + margin) - 1;
    } else {
      bound = winRate - breakEven;
    }

    let thirdsAbove = 0;
    if (N >= 3) {
      const partSize = Math.floor(N / 3);
      const p1 = wins01.slice(0, partSize);
      const p2 = wins01.slice(partSize, 2 * partSize);
      const p3 = wins01.slice(2 * partSize);
      for (const part of [p1, p2, p3]) {
        if (part.length > 0) {
          const r = part.reduce((acc, v) => acc + v, 0) / part.length;
          if (r > breakEven) thirdsAbove++;
        }
      }
    }

    const status = slStatus(N, neff, bound, pValue, thirdsAbove);
    const alwaysUp = N > 0 ? upCount / N : 0.5;
    const alwaysDown = 1 - alwaysUp;

    totals.recorded += recorded;
    totals.counted += N;
    totals.ties += ties;
    totals.expired += expired;
    totals.ineligible += ineligible;

    if (trial.finderId === 'coin') {
      coinWins += wins;
      coinN += N;
    }

    trialsStats.push({
      id: trial.id,
      finderId: trial.finderId,
      sym: trial.sym,
      h: trial.h,
      payout,
      recorded,
      ineligible,
      ties,
      expired,
      N,
      winRate,
      breakEven,
      neff,
      de,
      pValue: neff !== null ? pValue : null,
      bound,
      bestCaseExpectancy,
      thirdsAbove,
      status,
      alwaysUp,
      alwaysDown,
    });
  }

  const controlWinRate = coinN > 0 ? (coinWins / coinN) * 100 : null;

  return {
    K,
    totals,
    trials: trialsStats,
    controlWinRate,
  };
}

export async function buildSecLabReport(payouts: {
  p5: number;
  p15: number;
  p30: number;
}): Promise<SecLabReport> {
  if (currentRunPromise) {
    if (lastResult) {
      return lastResult;
    }
    return currentRunPromise;
  }

  currentRunPromise = (async () => {
    try {
      const res = await doBuildSecLabReport(payouts);
      lastResult = res;
      return res;
    } finally {
      currentRunPromise = null;
    }
  })();

  return currentRunPromise;
}
