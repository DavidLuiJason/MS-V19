import { db, type PredictionRecord } from './db';
import { wilsonRange } from '../engine/patterns';

export interface PredictionStatsGroup {
  wins: number;
  losses: number;
  ties: number;
  open: number;
  expired: number;
  samples: number;
  winRate: number | null;
  avgBaseline: number | null;
  edgePoints: number | null;
  avgGainPct: number | null;
  avgLossPct: number | null;
  wilsonLow: number | null;
  wilsonHigh: number | null;
  verdict: 'Too early (needs 100)' | 'Beats random' | 'Worse than random' | 'Not proven';
  costSamples: number;
  costWinRate: number | null;
  costAvgResultPct: number | null;
  byMode: {
    live: { samples: number; winRate: number | null };
    catchup: { samples: number; winRate: number | null };
  };
}

export interface PredictionStatsResult {
  overall: PredictionStatsGroup;
  lookalike: PredictionStatsGroup;
  discovery: PredictionStatsGroup;
}

export async function addPredictionIfNew(rec: PredictionRecord): Promise<boolean> {
  const existing = await db.predictions.get(rec.id);
  if (!existing) {
    await db.predictions.add(rec);
    return true;
  }
  return false;
}

export async function getOpenPredictions(limit?: number): Promise<PredictionRecord[]> {
  let query = db.predictions.where('status').equals('open').sortBy('targetT');
  const list = await query;
  return typeof limit === 'number' && limit > 0 ? list.slice(0, limit) : list;
}

export async function updatePrediction(id: string, changes: Partial<PredictionRecord>): Promise<number> {
  return await db.predictions.update(id, changes);
}

export async function getRecentPredictions(n = 20): Promise<PredictionRecord[]> {
  return await db.predictions.orderBy('t').reverse().limit(n).toArray();
}

export async function getAllPredictions(): Promise<PredictionRecord[]> {
  return await db.predictions.toArray();
}

function computeStatsForGroup(records: PredictionRecord[]): PredictionStatsGroup {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let open = 0;
  let expired = 0;

  let baselineSum = 0;
  let gainSum = 0;
  let lossSum = 0;

  let costWins = 0;
  let costLosses = 0;
  let costSum = 0;

  let liveWins = 0;
  let liveSamples = 0;
  let catchupWins = 0;
  let catchupSamples = 0;

  for (const r of records) {
    if (r.status === 'won') {
      wins++;
      baselineSum += r.baseline;
      if (typeof r.resultPct === 'number') {
        gainSum += r.resultPct;
      }
      const mode = r.mode || 'live';
      if (mode === 'catchup') {
        catchupSamples++;
        catchupWins++;
      } else {
        liveSamples++;
        liveWins++;
      }
    } else if (r.status === 'lost') {
      losses++;
      baselineSum += r.baseline;
      if (typeof r.resultPct === 'number') {
        lossSum += r.resultPct;
      }
      const mode = r.mode || 'live';
      if (mode === 'catchup') {
        catchupSamples++;
      } else {
        liveSamples++;
      }
    } else if (r.status === 'tie') {
      ties++;
    } else if (r.status === 'open') {
      open++;
    } else if (r.status === 'expired') {
      expired++;
    }

    if (r.costStatus === 'won') {
      costWins++;
      if (typeof r.costResultPct === 'number') {
        costSum += r.costResultPct;
      }
    } else if (r.costStatus === 'lost') {
      costLosses++;
      if (typeof r.costResultPct === 'number') {
        costSum += r.costResultPct;
      }
    }
  }

  const costSamples = costWins + costLosses;
  const costWinRate = costSamples > 0 ? costWins / costSamples : null;
  const costAvgResultPct = costSamples > 0 ? costSum / costSamples : null;

  const byMode = {
    live: {
      samples: liveSamples,
      winRate: liveSamples > 0 ? liveWins / liveSamples : null,
    },
    catchup: {
      samples: catchupSamples,
      winRate: catchupSamples > 0 ? catchupWins / catchupSamples : null,
    },
  };

  const samples = wins + losses;
  if (samples === 0) {
    return {
      wins,
      losses,
      ties,
      open,
      expired,
      samples: 0,
      winRate: null,
      avgBaseline: null,
      edgePoints: null,
      avgGainPct: null,
      avgLossPct: null,
      wilsonLow: null,
      wilsonHigh: null,
      verdict: 'Too early (needs 100)',
      costSamples,
      costWinRate,
      costAvgResultPct,
      byMode,
    };
  }

  const winRate = wins / samples;
  const avgBaseline = baselineSum / samples;
  const edgePoints = (winRate - avgBaseline) * 100;
  const avgGainPct = wins > 0 ? gainSum / wins : null;
  const avgLossPct = losses > 0 ? lossSum / losses : null;

  const { low, high } = wilsonRange(wins, samples, 1.96);
  const wilsonLow = low;
  const wilsonHigh = high;

  let verdict: 'Too early (needs 100)' | 'Beats random' | 'Worse than random' | 'Not proven';
  if (samples < 100) {
    verdict = 'Too early (needs 100)';
  } else if (wilsonLow > avgBaseline) {
    verdict = 'Beats random';
  } else if (wilsonHigh < avgBaseline) {
    verdict = 'Worse than random';
  } else {
    verdict = 'Not proven';
  }

  return {
    wins,
    losses,
    ties,
    open,
    expired,
    samples,
    winRate,
    avgBaseline,
    edgePoints,
    avgGainPct,
    avgLossPct,
    wilsonLow,
    wilsonHigh,
    verdict,
    costSamples,
    costWinRate,
    costAvgResultPct,
    byMode,
  };
}

export async function getPredictionStats(): Promise<PredictionStatsResult> {
  const records = await db.predictions.toArray();
  const overall = computeStatsForGroup(records);
  const lookalike = computeStatsForGroup(records.filter((r) => r.source === 'lookalike'));
  const discovery = computeStatsForGroup(records.filter((r) => r.source === 'discovery'));

  return { overall, lookalike, discovery };
}
