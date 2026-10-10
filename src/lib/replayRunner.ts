import Dexie from 'dexie';
import { db } from '../data/db';
import { getSetting, setSetting } from '../data/repositories';
import { TF_MS } from '../engine/predictor';
import type { PatternCandle } from '../engine/patterns';
import {
  runReplay,
  type ReplayParams,
  type ReplayResult,
  type ReplayTrialRow,
} from '../engine/replay';

export type { ReplayParams, ReplayResult, ReplayTrialRow };

export async function countStoredCandles(sym: string, tf: string): Promise<number> {
  return await db.candles
    .where('[src+sym+tf+t]')
    .between(['binance', sym, tf, Dexie.minKey], ['binance', sym, tf, Dexie.maxKey])
    .filter((r) => !!r.closed)
    .count();
}

export async function runOfflineReplay(
  sym: string,
  tf: string,
  rangeDays: number | null,
  stride: number,
  includeDiscovery: boolean,
  onProgress: (percent: number, detail: string) => void,
  shouldCancel: () => boolean
): Promise<ReplayResult | null> {
  const rows = await db.candles
    .where('[src+sym+tf+t]')
    .between(['binance', sym, tf, Dexie.minKey], ['binance', sym, tf, Dexie.maxKey])
    .filter((r) => !!r.closed)
    .toArray();

  rows.sort((a, b) => a.t - b.t);

  const candles: PatternCandle[] = rows.map((r) => ({
    t: r.t,
    o: r.o,
    h: r.h,
    l: r.l,
    c: r.c,
    v: r.v,
  }));

  const payoutPct = await getSetting<number>('arenaPayoutPct', 95);
  const stepMs = TF_MS[tf] || 60000;
  const rangeCandles =
    rangeDays === null ? null : Math.round((rangeDays * 86400000) / stepMs);
  const rangeLabel = rangeDays === null ? 'All stored' : 'Last ' + rangeDays + ' days';
  const speedLabel =
    stride === 1
      ? 'Thorough (every candle)'
      : 'Fast (every ' + stride + 'rd candle)';

  const params: ReplayParams = {
    stride,
    rangeCandles,
    windowMax: 20000,
    includeDiscovery,
    payoutPct,
    seed: 20261010,
  };

  const result = await runReplay(
    candles,
    sym,
    tf,
    params,
    rangeLabel,
    speedLabel,
    onProgress,
    shouldCancel
  );

  if (result !== null) {
    await setSetting('replayResult', result);
  }

  return result;
}
