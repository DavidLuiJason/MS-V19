import Dexie from 'dexie';
import { db, type PredictionRecord } from '../data/db';
import { TF_MS, lookalikeDrafts, discoveryDrafts, type PredictionDraft } from '../engine/predictor';
import { discoverWords, type DiscoveryResult } from '../engine/discovery';
import type { PatternCandle } from '../engine/patterns';
import { getOpenPredictions, updatePrediction, addPredictionIfNew } from '../data/predictions';
import { getSetting, logError } from '../data/repositories';
import { recordArenaSignal, recordArenaOutcome, registerTrial } from '../data/arena';

let busy = false;

// Scored predictions whose spread-aware score could not be computed yet (quote bar not saved yet): id -> time scored.
const costRetry = new Map<string, number>();
const COST_RETRY_MS = 15 * 60 * 1000;

type CostScore = { costResultPct?: number; costStatus?: 'won' | 'lost' | 'tie' };

async function costScoreFor(p: PredictionRecord, stepMs: number): Promise<CostScore> {
  try {
    const entryBar = await db.quoteBars.get(['binance', p.sym, p.entryT + stepMs - 60000]);
    const exitBar = await db.quoteBars.get(['binance', p.sym, p.targetT + stepMs - 60000]);
    if (!entryBar || !exitBar) return {};
    let costResultPct: number | undefined;
    if (p.direction === 'up') {
      if (entryBar.askC > 0) costResultPct = ((exitBar.bidC - entryBar.askC) / entryBar.askC) * 100;
    } else {
      if (entryBar.bidC > 0) costResultPct = ((entryBar.bidC - exitBar.askC) / entryBar.bidC) * 100;
    }
    if (costResultPct === undefined) return {};
    const costStatus: 'won' | 'lost' | 'tie' = costResultPct > 0 ? 'won' : costResultPct < 0 ? 'lost' : 'tie';
    return { costResultPct, costStatus };
  } catch {
    return {};
  }
}

// One bet at a time: true when a prediction of the same kind (coin, timeframe, source, pattern word) is still running at entryT.
async function overlapsRunning(sym: string, tf: string, source: string, note: string, entryT: number): Promise<boolean> {
  const recent = await db.predictions
    .where('[sym+tf+t]')
    .between([sym, tf, Dexie.minKey], [sym, tf, Dexie.maxKey])
    .reverse()
    .limit(60)
    .toArray();
  return recent.some((r) => r.source === source && r.note === note && r.entryT < entryT && r.targetT > entryT);
}
const discoveryCache = new Map<string, { result: DiscoveryResult; t: number }>();

async function runCycle(): Promise<void> {
  if (busy) return;
  busy = true;

  try {
    // A) SCORING PASS (always runs, even when disabled)
    const openPreds = await getOpenPredictions(200);
    const now = Date.now();

    for (const p of openPreds) {
      try {
        const stepMs = TF_MS[p.tf] || 60000;
        const candle = await db.candles.get(['binance', p.sym, p.tf, p.targetT]);

        if (candle && candle.closed === true) {
          const exitPrice = candle.c;
          let status: 'won' | 'lost' | 'tie';

          if (p.direction === 'up') {
            if (exitPrice > p.entryPrice) status = 'won';
            else if (exitPrice < p.entryPrice) status = 'lost';
            else status = 'tie';
          } else {
            if (exitPrice < p.entryPrice) status = 'won';
            else if (exitPrice > p.entryPrice) status = 'lost';
            else status = 'tie';
          }

          let resultPct = p.entryPrice > 0 ? ((exitPrice - p.entryPrice) / p.entryPrice) * 100 : 0;
          if (p.direction === 'down') {
            resultPct *= -1;
          }

          // Spread-aware second score
          const { costResultPct, costStatus } = await costScoreFor(p, stepMs);
          if (costStatus === undefined) costRetry.set(p.id, Date.now());

          await updatePrediction(p.id, {
            status,
            exitPrice,
            resultPct,
            scoredAt: Date.now(),
            costResultPct,
            costStatus,
          });
          try {
            await recordArenaOutcome(p, status, exitPrice, Date.now());
          } catch (err: any) {
            try {
              logError('Arena', `Outcome recording failed for ${p.id}: ${String(err)}`);
            } catch {}
          }
        } else if (!candle && now > p.targetT + stepMs + 6 * 3600 * 1000) {
          await updatePrediction(p.id, {
            status: 'expired',
            scoredAt: Date.now(),
          });
          try {
            await recordArenaOutcome(p, 'expired', undefined, Date.now());
          } catch (err: any) {
            try {
              logError('Arena', `Expired outcome recording failed for ${p.id}: ${String(err)}`);
            } catch {}
          }
        }
      } catch (err) {
        logError('PredictionRunner', `Scoring failed for ${p.id}: ${String(err)}`);
      }
    }

    // A2) RETRY the spread-aware score for recently scored predictions whose quote bars were not saved yet
    for (const [id, scoredAtMs] of Array.from(costRetry.entries())) {
      if (Date.now() - scoredAtMs > COST_RETRY_MS) {
        costRetry.delete(id);
        continue;
      }
      try {
        const rec = await db.predictions.get(id);
        if (!rec || rec.costStatus !== undefined) {
          costRetry.delete(id);
          continue;
        }
        const cs = await costScoreFor(rec, TF_MS[rec.tf] || 60000);
        if (cs.costStatus !== undefined) {
          await updatePrediction(id, cs);
          costRetry.delete(id);
        }
      } catch {
        // try again next cycle
      }
    }

    // B) PREDICTION PASS (only if predLabEnabled)
    const predLabEnabled = await getSetting<boolean>('predLabEnabled', false);
    if (!predLabEnabled) {
      await db.settings.where('key').startsWith('predLab:last:').delete();
      return;
    }

    const predLabMode = await getSetting<string>('predLabMode', 'auto');
    if (predLabMode === 'offline') {
      return;
    }
    if (predLabMode === 'auto') {
      const newestCandle = await db.candles.orderBy('t').last();
      if (!newestCandle || Date.now() - newestCandle.t > 300000) {
        return;
      }
    }

    const tracked = await getSetting<string[]>('trackedSymbols', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    const defaultSymbols = tracked.slice(0, 3);
    const symbols = await getSetting<string[]>('predLabSymbols', defaultSymbols);
    const timeframes = await getSetting<string[]>('predLabTimeframes', ['5m', '15m']);

    // e) Delete 'predLab:last:' records whose pair is not in the currently selected coins x timeframes
    const validKeys = new Set<string>();
    for (const sym of symbols) {
      for (const tf of timeframes) {
        validKeys.add(`predLab:last:${sym}|${tf}`);
      }
    }

    const existingLastRecords = await db.settings
      .where('key')
      .startsWith('predLab:last:')
      .toArray();

    for (const rec of existingLastRecords) {
      if (!validKeys.has(rec.key)) {
        await db.settings.delete(rec.key);
      }
    }

    for (const sym of symbols) {
      for (const tf of timeframes) {
        const pairKey = `${sym}|${tf}`;
        const lastKey = `predLab:last:${pairKey}`;
        const stepMs = TF_MS[tf] || 60000;

        try {
          // b) Load candles exactly as now (newest 20000 closed candles, skip pair if fewer than 500)
          const rows = await db.candles
            .where('[src+sym+tf+t]')
            .between(['binance', sym, tf, Dexie.minKey], ['binance', sym, tf, Dexie.maxKey])
            .reverse()
            .limit(20000)
            .toArray();

          const candles: PatternCandle[] = rows
            .reverse()
            .filter((r) => r.closed)
            .map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }));

          if (candles.length < 500) continue;

          // a) Progress is stored in db.settings under key 'predLab:last:' + sym + '|' + tf with the value entryT (a number)
          const storedRecord = await db.settings.get(lastKey);
          const storedValue: number | undefined =
            storedRecord && typeof storedRecord.value === 'number'
              ? storedRecord.value
              : undefined;

          // c) Candidates = candles with t greater than stored value.
          // If NO stored value exists, only candidate is newest candle (never back-fill on first use).
          // Ignore candidate whose t + TF_MS[tf] is older than 24 hours before now.
          const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
          let candidateIndices: number[] = [];

          if (storedValue === undefined) {
            const lastIdx = candles.length - 1;
            if (candles[lastIdx].t + stepMs >= cutoff24h) {
              candidateIndices = [lastIdx];
            } else {
              await db.settings.put({ key: lastKey, value: candles[lastIdx].t });
            }
          } else {
            for (let idx = 0; idx < candles.length; idx++) {
              const c = candles[idx];
              if (c.t > storedValue) {
                if (c.t + stepMs >= cutoff24h) {
                  candidateIndices.push(idx);
                }
              }
            }
            if (candidateIndices.length === 0 && candles[candles.length - 1].t > storedValue) {
              await db.settings.put({ key: lastKey, value: candles[candles.length - 1].t });
            }
          }

          // Sort candidates oldest first (already ascending indices) and handle at most 30 per pair per cycle
          const candidatesToProcess = candidateIndices.slice(0, 30);

          for (const i of candidatesToProcess) {
            const candle = candles[i];
            const isNewest = i === candles.length - 1;

            // d) mode = 'live' if Date.now() - (candle.t + TF_MS[tf]) <= 3 * TF_MS[tf], otherwise 'catchup'
            const mode: 'live' | 'catchup' =
              Date.now() - (candle.t + stepMs) <= 3 * stepMs ? 'live' : 'catchup';

            // Use ONLY candles[0..i] (candles.slice(0, i + 1)); future must never be visible
            const historySlice = candles.slice(0, i + 1);

            // Newest gets lookalikeDrafts + discoveryDrafts; older candidates get lookalikeDrafts ONLY
            try {
              await registerTrial({
                id: `lookalike|v1|up60dn40n30|binance|${sym}|${tf}|5`,
                kind: 'config',
                finderId: 'lookalike',
                sym,
                tf,
                count: 1,
                createdAt: Date.now(),
              });
            } catch (err: any) {
              try {
                logError('Arena', `Lookalike trial register failed: ${String(err)}`);
              } catch {}
            }
            const lDrafts = lookalikeDrafts(historySlice);
            let dDrafts: PredictionDraft[] = [];

            if (isNewest) {
              const cachedDisc = discoveryCache.get(pairKey);
              let discResult: DiscoveryResult;
              if (!cachedDisc || Date.now() - cachedDisc.t > 6 * 3600 * 1000) {
                discResult = discoverWords(historySlice);
                try {
                  await registerTrial({
                    id: 'search|discovery|v1|' + pairKey + '|' + candle.t,
                    kind: 'search',
                    finderId: 'discovery',
                    sym,
                    tf,
                    count: discResult.testedCombos,
                    createdAt: Date.now(),
                  });
                } catch (err: any) {
                  try {
                    logError('Arena', `Discovery trial register failed: ${String(err)}`);
                  } catch {}
                }
                discoveryCache.set(pairKey, { result: discResult, t: Date.now() });
              } else {
                discResult = cachedDisc.result;
              }
              dDrafts = discoveryDrafts(discResult);
            }

            const drafts = [...lDrafts, ...dDrafts];
            for (const draft of drafts) {
              if (await overlapsRunning(sym, tf, draft.source, draft.note, candle.t)) continue;
              const id = `${sym}|${tf}|${draft.source}|${draft.note}|${draft.horizon}|${candle.t}`;
              const targetT = candle.t + draft.horizon * stepMs;

              const rec: PredictionRecord = {
                id,
                t: Date.now(),
                sym,
                tf,
                source: draft.source,
                direction: draft.direction,
                horizon: draft.horizon,
                entryT: candle.t,
                entryPrice: candle.c,
                targetT,
                confidence: draft.confidence,
                baseline: draft.baseline,
                note: draft.note,
                status: 'open',
                mode,
              };

              const added = await addPredictionIfNew(rec);
              if (added) {
                try {
                  await recordArenaSignal(rec);
                } catch (err: any) {
                  try {
                    logError('Arena', `Signal recording failed for ${rec.id}: ${String(err)}`);
                  } catch {}
                }
              }
            }

            // Write the 'predLab:last:...' value = candle.t, even if it produced no draft
            await db.settings.put({ key: lastKey, value: candle.t });

            // 50 ms pause (setTimeout) after each candidate so the phone stays smooth
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        } catch (err) {
          logError('PredictionRunner', `Prediction pass failed for ${pairKey}: ${String(err)}`);
        }
      }
    }
  } catch (err) {
    logError('PredictionRunner', `Cycle failed: ${String(err)}`);
  } finally {
    busy = false;
  }
}

export function startPredictionRunner(): () => void {
  const intervalId = setInterval(() => {
    runCycle().catch((err) => {
      try {
        logError('PredictionRunner', String(err?.message || err));
      } catch {}
    });
  }, 20000);

  // Trigger first cycle promptly
  setTimeout(() => {
    runCycle().catch((err) => {
      try {
        logError('PredictionRunner', String(err?.message || err));
      } catch {}
    });
  }, 1000);

  return () => {
    clearInterval(intervalId);
  };
}
