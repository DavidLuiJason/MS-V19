import React, { useState, useEffect, useCallback } from 'react';
import Dexie from 'dexie';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { db } from '../../data/db';
import { getSetting } from '../../data/repositories';
import { buildSecLabReport } from '../../data/secondsLab';
import {
  getMinerConfig,
  getMinerState,
  getMinerLibrary,
} from '../../lib/patternMiner';
import { libStatus } from '../../engine/miner';
import { breakEven } from '../../engine/arena';

function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

interface RowState {
  loading: boolean;
  dot: 'green' | 'amber' | 'slate';
  text1: string;
  text2?: string;
  isOffline?: boolean;
}

export function ResearchOverview({
  onOpenTab,
}: {
  onOpenTab: (id: string) => void;
}) {
  const [dataRow, setDataRow] = useState<RowState>({
    loading: true,
    dot: 'slate',
    text1: 'Checking...',
  });
  const [liveRow, setLiveRow] = useState<RowState>({
    loading: true,
    dot: 'slate',
    text1: 'Checking...',
  });
  const [secRow, setSecRow] = useState<RowState>({
    loading: true,
    dot: 'slate',
    text1: 'Checking...',
  });
  const [replayRow, setReplayRow] = useState<RowState>({
    loading: true,
    dot: 'slate',
    text1: 'Checking...',
  });
  const [minerRow, setMinerRow] = useState<RowState>({
    loading: true,
    dot: 'slate',
    text1: 'Checking...',
  });

  const [nextStep, setNextStep] = useState<string>('Checking next step...');

  const loadDataRow = useCallback(async () => {
    setDataRow((prev) => ({ ...prev, loading: true }));
    try {
      const newest = await db.candles.orderBy('t').last();
      const syms = await getSetting<string[]>('trackedSymbols', [
        'BTCUSDT',
        'ETHUSDT',
        'SOLUSDT',
      ]);
      const firstSym = syms[0] || 'BTCUSDT';

      const secCount = await db.secondCandles
        .where('[sym+t]')
        .between([firstSym, Date.now() - 3600000], [firstSym, Dexie.maxKey])
        .count();

      if (!newest) {
        setDataRow({
          loading: false,
          dot: 'amber',
          text1: `OFFLINE: no candles stored | Seconds captured in the last hour for ${firstSym}: ${secCount} of 3600`,
          isOffline: true,
        });
        return;
      }

      const ageMs = Date.now() - newest.t;
      const isLive = ageMs <= 300000;
      const ageStr = isLive
        ? `LIVE: newest candle ${Math.floor(ageMs / 1000)} seconds ago`
        : `OFFLINE: last data ${formatAge(ageMs)}`;

      setDataRow({
        loading: false,
        dot: isLive ? 'green' : 'amber',
        text1: `${ageStr} | Seconds captured in the last hour for ${firstSym}: ${secCount} of 3600`,
        isOffline: !isLive,
      });
    } catch {
      setDataRow({
        loading: false,
        dot: 'slate',
        text1: 'unavailable',
        isOffline: false,
      });
    }
  }, []);

  const loadLiveRow = useCallback(async () => {
    setLiveRow((prev) => ({ ...prev, loading: true }));
    try {
      const predLabEnabled = await getSetting<boolean>('predLabEnabled', false);
      const mode = await getSetting<string>('predLabMode', 'auto');
      const total = await db.predictions.count();
      setLiveRow({
        loading: false,
        dot: predLabEnabled ? 'green' : 'slate',
        text1: `${predLabEnabled ? 'On' : 'Off'} | mode ${mode} | ${total} bets stored`,
      });
    } catch {
      setLiveRow({
        loading: false,
        dot: 'slate',
        text1: 'unavailable',
      });
    }
  }, []);

  const loadSecRow = useCallback(async () => {
    setSecRow((prev) => ({ ...prev, loading: true }));
    try {
      const payouts = await getSetting('secLabPayouts', {
        p5: 105,
        p15: 115,
        p30: 120,
      });
      const rep = await buildSecLabReport(payouts);

      const trials = rep.trials || [];
      const hasCandidate = trials.some(
        (t) => t.status === 'CANDIDATE (unconfirmed)'
      );
      const allEarlyOrCollecting =
        trials.length > 0 &&
        trials.every(
          (t) => t.status === 'TOO EARLY' || t.status === 'COLLECTING'
        );

      let verdictText = '';
      let dot: 'green' | 'amber' | 'slate' = 'slate';

      if (hasCandidate) {
        verdictText = 'Candidate found. Not proven. Needs confirmation on fresh data.';
        dot = 'green';
      } else if (trials.length === 0 || allEarlyOrCollecting) {
        let largestN = 0;
        for (const t of trials) {
          if (t.N > largestN) largestN = t.N;
        }
        verdictText = `Still collecting: not enough bets yet (largest sample ${largestN}).`;
        dot = 'amber';
      } else {
        const belowBreakEvenCount = trials.filter(
          (t) => t.status === 'NO EDGE FOUND'
        ).length;
        verdictText = `No edge found so far in ${belowBreakEvenCount} of ${trials.length} trials; the rest are not proven.`;
        dot = 'slate';
      }

      setSecRow({
        loading: false,
        dot,
        text1: `${rep.K} trials | ${rep.totals.counted} bets counted`,
        text2: verdictText,
      });
    } catch {
      setSecRow({
        loading: false,
        dot: 'slate',
        text1: 'unavailable',
      });
    }
  }, []);

  const loadReplayRow = useCallback(async () => {
    setReplayRow((prev) => ({ ...prev, loading: true }));
    try {
      const r = await getSetting<any>('replayResult', null);
      if (!r) {
        setReplayRow({
          loading: false,
          dot: 'slate',
          text1: 'Not run yet',
        });
        return;
      }

      const ctrlRow = (r.trials || []).find(
        (t: any) => t.finderId === 'control'
      );
      let ctrlText = '';
      if (ctrlRow) {
        const ctrlWin = (ctrlRow.winRate * 100).toFixed(1);
        ctrlText = ` | coin-flip control ${ctrlWin}% (should be near 50%)`;
      }

      const dateStr = new Date(r.runAt).toLocaleDateString();
      const text = `${r.sym} ${r.tf}, ${r.stepsEvaluated} steps, ${dateStr}${ctrlText}`;

      setReplayRow({
        loading: false,
        dot: r.leakWarning ? 'amber' : 'green',
        text1: text,
      });
    } catch {
      setReplayRow({
        loading: false,
        dot: 'slate',
        text1: 'unavailable',
      });
    }
  }, []);

  const loadMinerRow = useCallback(async () => {
    setMinerRow((prev) => ({ ...prev, loading: true }));
    try {
      const cfg = await getMinerConfig();
      const st = await getMinerState();
      const lib = await getMinerLibrary();
      const payoutPct = await getSetting<number>('arenaPayoutPct', 95);
      const be = breakEven(payoutPct);
      const K = Math.max(1, lib.kKeys.length * 2);

      let promisingCount = 0;
      let testedOver200 = 0;

      for (const entry of Object.values(lib.entries)) {
        if (entry.testN >= 200) {
          testedOver200++;
        }
        const s = libStatus(entry, K, be);
        if (
          s.status === 'PROMISING (history)' ||
          s.status === 'SURVIVES TESTING-COUNT (history)'
        ) {
          promisingCount++;
        }
      }

      const expected = Math.round(0.05 * testedOver200);
      const entriesCount = Object.keys(lib.entries).length;

      setMinerRow({
        loading: false,
        dot: cfg.enabled ? 'green' : 'amber',
        text1: `${cfg.enabled ? 'Running' : 'Paused'} | ${st.status}`,
        text2: `Library ${entriesCount} patterns; ${promisingCount} say PROMISING; up to about ${expected} would do that by luck alone`,
      });
    } catch {
      setMinerRow({
        loading: false,
        dot: 'slate',
        text1: 'unavailable',
      });
    }
  }, []);

  const evaluateNextStep = useCallback(async () => {
    try {
      const newest = await db.candles.orderBy('t').last();
      const isOffline = !newest || Date.now() - newest.t > 300000;
      if (isOffline) {
        setNextStep(
          'Data is OFFLINE. Open the installed app with internet and VPN on so it can collect.'
        );
        return;
      }

      const cfg = await getMinerConfig();
      const candleCount = await db.candles.count();
      if (!cfg.enabled && candleCount >= 10000) {
        setNextStep('Start the Pattern Miner (Miner tab).');
        return;
      }

      const replayRes = await getSetting('replayResult', null);
      if (!replayRes) {
        setNextStep('Run an offline replay (Replay tab).');
        return;
      }

      setNextStep(
        'Nothing to do now. Keep the app collecting and check back in a few days.'
      );
    } catch {
      setNextStep('Status check unavailable.');
    }
  }, []);

  const reloadAll = useCallback(() => {
    loadDataRow();
    loadLiveRow();
    loadSecRow();
    loadReplayRow();
    loadMinerRow();
    evaluateNextStep();
  }, [
    loadDataRow,
    loadLiveRow,
    loadSecRow,
    loadReplayRow,
    loadMinerRow,
    evaluateNextStep,
  ]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const renderDot = (color: 'green' | 'amber' | 'slate') => {
    const bg =
      color === 'green'
        ? 'bg-emerald-400'
        : color === 'amber'
        ? 'bg-amber-400'
        : 'bg-slate-500';
    return <span className={`w-2 h-2 rounded-full shrink-0 ${bg}`} />;
  };

  const renderStatusRow = (
    title: string,
    tabId: string,
    state: RowState
  ) => {
    return (
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="mt-1">{renderDot(state.dot)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{title}</span>
            </div>
            <div className="text-[11px] text-slate-400 leading-tight truncate mt-0.5">
              {state.loading ? 'Checking...' : state.text1}
            </div>
            {state.text2 && !state.loading && (
              <div className="text-[11px] text-slate-500 leading-tight truncate mt-0.5">
                {state.text2}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenTab(tabId)}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-semibold text-cyan-300 transition active:scale-95"
        >
          <span>Open</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed px-1">
        Is there any method that beats break-even? These are the systems that test it.
      </p>

      <div className="space-y-2">
        {renderStatusRow('Data', 'seconds', dataRow)}
        {renderStatusRow('Live bets', 'live', liveRow)}
        {renderStatusRow('Seconds Lab', 'seconds', secRow)}
        {renderStatusRow('Offline replay', 'replay', replayRow)}
        {renderStatusRow('Pattern Miner', 'miner', minerRow)}
      </div>

      {/* Next step box */}
      <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 space-y-1">
        <div className="font-semibold text-cyan-300 uppercase tracking-wider text-[10px]">
          Next Step
        </div>
        <div className="leading-relaxed">{nextStep}</div>
      </div>

      {/* Refresh button */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={reloadAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-400 hover:text-white transition active:scale-95"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}
