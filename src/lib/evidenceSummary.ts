import { db } from '../data/db';
import { getSetting } from '../data/repositories';
import { buildSecLabReport } from '../data/secondsLab';
import { getArenaReport } from '../data/arena';

export async function buildEvidenceSummary(): Promise<string> {
  const parts: string[] = [];

  // Title
  parts.push('MARKETSCOPE EVIDENCE SUMMARY - ' + new Date().toLocaleString());
  parts.push('');

  // b) COLLECTION
  try {
    parts.push('COLLECTION:');
    let trackedSymbols = await getSetting<string[]>('trackedSymbols', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    if (!trackedSymbols || !Array.isArray(trackedSymbols) || trackedSymbols.length === 0) {
      const distinctSyms = new Set<string>();
      await db.secondCandles.each((sc) => distinctSyms.add(sc.sym));
      trackedSymbols = Array.from(distinctSyms);
    }
    if (trackedSymbols.length === 0) {
      trackedSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    }

    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const sym of trackedSymbols) {
      const totalSec = await db.secondCandles.where('sym').equals(sym).count();
      const firstSec = await db.secondCandles.where('sym').equals(sym).first();
      const lastSec = await db.secondCandles.where('sym').equals(sym).last();
      const last60mSec = await db.secondCandles
        .where('[sym+t]')
        .between([sym, oneHourAgo], [sym, now], true, true)
        .count();

      const totalCandles = await db.candles
        .where('sym')
        .equals(sym)
        .filter((c) => c.tf === '1m')
        .count();
      const firstCandle = await db.candles
        .where('sym')
        .equals(sym)
        .filter((c) => c.tf === '1m')
        .first();
      const lastCandle = await db.candles
        .where('sym')
        .equals(sym)
        .filter((c) => c.tf === '1m')
        .last();

      const firstSecStr = firstSec ? new Date(firstSec.t).toLocaleString() : 'none';
      const lastSecStr = lastSec ? new Date(lastSec.t).toLocaleString() : 'none';
      const firstCandleStr = firstCandle ? new Date(firstCandle.t).toLocaleString() : 'none';
      const lastCandleStr = lastCandle ? new Date(lastCandle.t).toLocaleString() : 'none';

      parts.push(
        sym +
          ': seconds stored: ' +
          totalSec.toLocaleString() +
          ' (' +
          firstSecStr +
          ' to ' +
          lastSecStr +
          '), last 60m: ' +
          last60mSec +
          '/3600 | 1m candles: ' +
          totalCandles.toLocaleString() +
          ' (' +
          firstCandleStr +
          ' to ' +
          lastCandleStr +
          ')'
      );
    }
  } catch (err: any) {
    parts.push('(unavailable: ' + (err?.message || String(err)) + ')');
  }
  parts.push('');

  // c) SECONDS LAB
  let secLabTrialsForVerdict: any[] = [];
  try {
    parts.push('SECONDS LAB:');
    const payouts = await getSetting<{ p5: number; p15: number; p30: number }>('secLabPayouts', {
      p5: 105,
      p15: 115,
      p30: 120,
    });
    const rep = await buildSecLabReport(payouts);
    secLabTrialsForVerdict = rep.trials || [];

    const controlStr = rep.controlWinRate !== null ? rep.controlWinRate.toFixed(1) + '%' : 'none';
    parts.push(
      'K = ' +
        rep.K +
        ' | Totals: recorded ' +
        rep.totals.recorded +
        ', counted ' +
        rep.totals.counted +
        ', ties ' +
        rep.totals.ties +
        ', expired ' +
        rep.totals.expired +
        ', ineligible ' +
        rep.totals.ineligible +
        ' | Coin-flip control win rate: ' +
        controlStr
    );

    const sortedTrials = [...(rep.trials || [])].sort((a, b) => b.N - a.N).slice(0, 40);
    for (const tr of sortedTrials) {
      const neffStr = tr.neff !== null ? Math.round(tr.neff).toString() : '-';
      const pStr = tr.pValue !== null ? tr.pValue.toFixed(3) : '-';
      const boundVal = tr.bound !== null ? tr.bound * 100 : null;
      const boundStr = boundVal !== null ? (boundVal >= 0 ? '+' : '') + boundVal.toFixed(1) : '-';
      parts.push(
        tr.finderId +
          ' ' +
          tr.sym +
          ' ' +
          tr.h +
          's | N ' +
          tr.N +
          ' | win ' +
          (tr.winRate * 100).toFixed(1) +
          '% | break-even ' +
          (tr.breakEven * 100).toFixed(1) +
          '% | N_eff ' +
          neffStr +
          ' | p ' +
          pStr +
          ' | bound ' +
          boundStr +
          ' pts | ' +
          tr.status
      );
    }
  } catch (err: any) {
    parts.push('(unavailable: ' + (err?.message || String(err)) + ')');
  }
  parts.push('');

  // d) HISTORY SCREEN
  try {
    parts.push('HISTORY SCREEN:');
    const histResult = await getSetting<any>('secLabHistoryResult', null);
    if (!histResult) {
      parts.push('not run yet');
    } else {
      const runTimeStr = histResult.runTime ? new Date(histResult.runTime).toLocaleString() : 'unknown';
      const startStr = histResult.windowStart ? new Date(histResult.windowStart).toLocaleString() : 'unknown';
      const endStr = histResult.windowEnd ? new Date(histResult.windowEnd).toLocaleString() : 'unknown';
      parts.push('Run time: ' + runTimeStr + ' | Window: ' + startStr + ' to ' + endStr);

      const rows = histResult.verdicts || histResult.rows || [];
      if (Array.isArray(rows) && rows.length > 0) {
        for (const r of rows) {
          parts.push(
            (r.finder || r.finderId) +
              ' ' +
              r.h +
              's | BTC N ' +
              (r.btcN ?? r.btcN ?? '-') +
              ' win ' +
              (r.btcWinRate !== undefined ? r.btcWinRate.toFixed(1) : '-') +
              '% | ETH ' +
              (r.ethWinRate !== undefined ? r.ethWinRate.toFixed(1) : '-') +
              '% | SOL ' +
              (r.solWinRate !== undefined ? r.solWinRate.toFixed(1) : '-') +
              '% | ' +
              (r.verdict || '-')
          );
        }
      } else {
        parts.push('no verdict rows found');
      }
    }
  } catch (err: any) {
    parts.push('(unavailable: ' + (err?.message || String(err)) + ')');
  }
  parts.push('');

  // e) ARENA
  try {
    parts.push('ARENA:');
    const payoutPct = await getSetting<number>('arenaPayoutPct', 95);
    const arenaRep = await getArenaReport(payoutPct);

    if (!arenaRep.trials || arenaRep.trials.length === 0) {
      parts.push('no Arena bets yet');
    } else {
      parts.push(
        'K = ' +
          arenaRep.K +
          ' | Totals: recorded ' +
          arenaRep.totals.recorded +
          ', counted ' +
          arenaRep.totals.counted +
          ', ties ' +
          arenaRep.totals.ties +
          ', expired ' +
          arenaRep.totals.expired +
          ', open ' +
          arenaRep.totals.open
      );

      const sortedArena = [...arenaRep.trials].sort((a, b) => b.N - a.N).slice(0, 15);
      for (const tr of sortedArena) {
        const neffStr = tr.neff !== null ? Math.round(tr.neff).toString() : '-';
        const pStr = tr.pValue !== null ? tr.pValue.toFixed(3) : '-';
        const boundStr = tr.bound !== null ? (tr.bound >= 0 ? '+' : '') + tr.bound.toFixed(1) : '-';
        parts.push(
          tr.label +
            ' | N ' +
            tr.N +
            ' | win ' +
            (tr.winRate * 100).toFixed(1) +
            '% | break-even ' +
            (tr.breakEven * 100).toFixed(1) +
            '% | N_eff ' +
            neffStr +
            ' | p ' +
            pStr +
            ' | bound ' +
            boundStr +
            ' pts | ' +
            tr.status
        );
      }
    }
  } catch (err: any) {
    parts.push('(unavailable: ' + (err?.message || String(err)) + ')');
  }
  parts.push('');

  // OFFLINE REPLAY
  try {
    parts.push('OFFLINE REPLAY (last run):');
    const replayRes = await getSetting<any>('replayResult', null);
    if (!replayRes) {
      parts.push('not run yet');
    } else {
      let header = `${replayRes.sym} ${replayRes.tf} | ${replayRes.rangeLabel} | ${replayRes.speedLabel} | ${replayRes.stepsEvaluated} steps | K = ${replayRes.K}`;
      if (replayRes.leakWarning) {
        header += ' WARNING: control far from 50%';
      }
      parts.push(header);

      const rows = Array.isArray(replayRes.trials) ? replayRes.trials.slice(0, 25) : [];
      for (const r of rows) {
        const neffStr = r.neff !== null ? Math.round(r.neff).toString() : '-';
        const pStr =
          r.pValue !== null ? (r.pValue < 0.0001 ? '<0.0001' : r.pValue.toFixed(4)) : '-';
        const boundStr =
          r.boundPts !== null ? (r.boundPts >= 0 ? '+' : '') + r.boundPts.toFixed(1) : '-';
        parts.push(
          `${r.label} | N ${r.N} | win ${(r.winRate * 100).toFixed(1)}% | break-even ${(r.breakEven * 100).toFixed(1)}% | up-share ${(r.alwaysUp * 100).toFixed(1)}% | N_eff ${neffStr} | p ${pStr} | bound ${boundStr} pts | ${r.status}`
        );
      }
    }
  } catch (err: any) {
    parts.push('(unavailable: ' + (err?.message || String(err)) + ')');
  }
  parts.push('');

  // f) PLAIN VERDICT
  try {
    parts.push('PLAIN VERDICT:');
    const trials = secLabTrialsForVerdict;
    const candidates = trials.filter((t) => t.status === 'CANDIDATE (unconfirmed)');
    if (candidates.length > 0) {
      const labels = candidates.map((c) => `${c.finderId} ${c.sym} ${c.h}s`).join(', ');
      parts.push('CANDIDATE FOUND in: ' + labels + '. Not proven. Needs confirmation on fresh data.');
    } else {
      const allEarlyOrCollecting =
        trials.length > 0 &&
        trials.every((t) => t.status === 'TOO EARLY' || t.status === 'COLLECTING');
      if (trials.length === 0 || allEarlyOrCollecting) {
        let largestN = 0;
        for (const t of trials) {
          if (t.N > largestN) largestN = t.N;
        }
        parts.push('STILL COLLECTING: not enough bets yet. Largest sample so far: N = ' + largestN + '.');
      } else {
        const belowBreakEvenCount = trials.filter((t) => t.status === 'NO EDGE FOUND').length;
        parts.push(
          'NO EDGE FOUND so far: ' +
            belowBreakEvenCount +
            ' of ' +
            trials.length +
            ' trials have a best case below break-even; the rest are not proven.'
        );
      }
    }
  } catch (err: any) {
    parts.push('(unavailable: ' + (err?.message || String(err)) + ')');
  }

  return parts.join('\n');
}
