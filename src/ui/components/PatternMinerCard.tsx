import React, { useState, useEffect, useCallback } from 'react';
import { Pickaxe, Play, Pause, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { getSetting } from '../../data/repositories';
import { breakEven } from '../../engine/arena';
import {
  MINER_TYPES,
  libStatus,
  type LibEntry,
} from '../../engine/miner';
import {
  getMinerConfig,
  setMinerConfig,
  getMinerState,
  getMinerLibrary,
  subscribeMiner,
  startMiner,
  stopMiner,
  resetMiner,
  type MinerConfig,
  type MinerState,
  type MinerLibrary,
} from '../../lib/patternMiner';

export const PatternMinerCard: React.FC = () => {
  const { settings } = useAppStore();

  const [config, setConfig] = useState<MinerConfig>({
    enabled: false,
    sym: 'BTCUSDT',
    tf: '1m',
    windowDays: 7,
  });

  const [state, setState] = useState<MinerState>({
    sym: 'BTCUSDT',
    tf: '1m',
    windowDays: 7,
    doneSlices: [],
    typeIdx: 0,
    sliceIdx: null,
    jobs: 0,
    totalSlices: 0,
    status: 'Not started',
    lastRunAt: 0,
  });

  const [library, setLibrary] = useState<MinerLibrary>({
    entries: {},
    kKeys: [],
  });

  const [payoutPct, setPayoutPct] = useState<number>(95);
  const [showAll, setShowAll] = useState<boolean>(false);
  const [shownCount, setShownCount] = useState<number>(15);

  const trackedSymbols =
    settings.trackedSymbols && settings.trackedSymbols.length > 0
      ? settings.trackedSymbols
      : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

  const reload = useCallback(async () => {
    try {
      const cfg = await getMinerConfig();
      const st = await getMinerState();
      const lib = await getMinerLibrary();
      const pct = await getSetting<number>('arenaPayoutPct', 95);
      setConfig(cfg);
      setState(st);
      setLibrary(lib);
      setPayoutPct(pct);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    reload();
    const unsub = subscribeMiner(() => {
      reload();
    });
    const interval = setInterval(reload, 5000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [reload]);

  const handleConfigChange = async (
    key: 'sym' | 'tf' | 'windowDays',
    val: any
  ) => {
    if (config[key] === val) return;
    const hasLibrary = Object.keys(library.entries).length > 0;
    if (hasLibrary) {
      const ok = window.confirm(
        'This starts a fresh library for the new setting. Continue?'
      );
      if (!ok) return;
      await resetMiner();
    }
    const next = { ...config, [key]: val };
    setConfig(next);
    await setMinerConfig(next);
  };

  const handleToggleRun = async () => {
    if (config.enabled) {
      const next = { ...config, enabled: false };
      setConfig(next);
      stopMiner();
      await setMinerConfig(next);
    } else {
      const next = { ...config, enabled: true };
      setConfig(next);
      await setMinerConfig(next);
      startMiner();
    }
  };

  const handleReset = async () => {
    const ok = window.confirm('Reset miner library and progress?');
    if (!ok) return;
    await resetMiner();
    setShownCount(15);
  };

  // Evaluate and sort library entries
  const be = breakEven(payoutPct);
  const K = Math.max(1, library.kKeys.length * 2);

  const statusPriority: Record<string, number> = {
    'SURVIVES TESTING-COUNT (history)': 1,
    'PROMISING (history)': 2,
    'NOT PROVEN': 3,
    'TOO EARLY': 4,
    'NO EDGE FOUND': 5,
  };

  const evaluatedRows: Array<{
    entry: LibEntry;
    status: string;
    winRate: number;
    pValue: number | null;
    boundPts: number | null;
  }> = [];

  for (const entry of Object.values(library.entries)) {
    const st = libStatus(entry, K, be);
    evaluatedRows.push({
      entry,
      status: st.status,
      winRate: st.winRate,
      pValue: st.pValue,
      boundPts: st.boundPts,
    });
  }

  evaluatedRows.sort((a, b) => {
    const pA = statusPriority[a.status] ?? 99;
    const pB = statusPriority[b.status] ?? 99;
    if (pA !== pB) return pA - pB;
    return b.entry.testN - a.entry.testN;
  });

  const filteredRows = showAll
    ? evaluatedRows
    : evaluatedRows.filter(
        (r) => r.status !== 'TOO EARLY' && r.status !== 'NO EDGE FOUND'
      );

  const displayedRows = filteredRows.slice(0, shownCount);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-4 shadow-xl">
      {/* Title */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-white">Pattern Miner (continuous)</h3>
        <Pickaxe className="w-4 h-4 text-cyan-400" />
      </div>

      {/* Explanation */}
      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
        Studies one pattern type after another over blocks of stored candles. For each block it picks
        Up or Down from the first 70%, then checks that choice on the last 30%, which it has not seen.
        It pools the checked results across blocks and counts every pattern tried, so lucky ones are not
        mistaken for skill. A good status only means worth watching live, never proof. More stored history
        gives more blocks. No internet needed.
      </p>

      {/* Setup */}
      <div className="space-y-3 pt-3 border-t border-slate-800/80 mb-4">
        {/* Coin selector */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Coin
          </label>
          <div className="flex flex-wrap gap-2">
            {trackedSymbols.map((sym) => (
              <button
                key={sym}
                onClick={() => handleConfigChange('sym', sym)}
                className={`py-1.5 px-3 rounded-xl text-xs font-mono transition border ${
                  config.sym === sym
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Timeframe selector */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Timeframe
          </label>
          <div className="flex gap-2">
            {['1m', '5m', '15m'].map((tf) => (
              <button
                key={tf}
                onClick={() => handleConfigChange('tf', tf)}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-mono transition border text-center ${
                  config.tf === tf
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Window selector */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Block Window
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[3, 7, 14].map((days) => (
              <button
                key={days}
                onClick={() => handleConfigChange('windowDays', days)}
                className={`py-1.5 px-2 rounded-xl text-xs transition border text-center ${
                  config.windowDays === days
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>

        {/* Controls: Start/Pause and Reset */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={handleToggleRun}
            className={`py-2.5 px-4 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-2 ${
              config.enabled
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow'
            }`}
          >
            {config.enabled ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Start miner
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            className="py-2.5 px-4 rounded-2xl font-semibold text-xs border border-slate-800 bg-slate-950 text-slate-400 hover:text-white transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset miner
          </button>
        </div>
      </div>

      {/* Status Area */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono mb-4">
        <div className="text-cyan-400 font-semibold">{state.status}</div>
        <div className="text-slate-400 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span>Blocks done: {state.doneSlices.length} of {state.totalSlices}</span>
          <span>Jobs run: {state.jobs}</span>
          <span>Patterns tested (distinct): {library.kKeys.length}</span>
          <span>Library: {Object.keys(library.entries).length} patterns</span>
          <span>
            Last step:{' '}
            {state.lastRunAt > 0
              ? new Date(state.lastRunAt).toLocaleTimeString()
              : 'never'}
          </span>
        </div>
      </div>

      {/* Library List */}
      <div className="space-y-3 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Library Results ({filteredRows.length})
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
            />
            <span>Show all</span>
          </label>
        </div>

        {Object.keys(library.entries).length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800/60">
            No patterns yet. Start the miner.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800/60">
            No patterns beyond TOO EARLY or NO EDGE FOUND. Turn on &ldquo;Show all&rdquo; to view early trials.
          </div>
        ) : (
          <div className="space-y-2">
            {displayedRows.map(({ entry, status, winRate, pValue, boundPts }) => {
              const typeDef = MINER_TYPES.find((t) => t.id === entry.typeId);
              const typeName = typeDef?.name || entry.typeId;

              const statusBadgeCls =
                status === 'SURVIVES TESTING-COUNT (history)' ||
                status === 'PROMISING (history)'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : status === 'NO EDGE FOUND'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700';

              const pStr =
                pValue !== null
                  ? pValue < 0.0001
                    ? '<0.0001'
                    : pValue.toFixed(4)
                  : '-';
              const boundStr =
                boundPts !== null
                  ? (boundPts >= 0 ? '+' : '') + boundPts.toFixed(1)
                  : '-';

              const isUp = entry.dir === 'up';

              return (
                <div
                  key={entry.id}
                  className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white">
                      {typeName} {entry.cat} {isUp ? '↗' : '↘'}{' '}
                      {isUp ? 'Buy (up)' : 'Sell (down)'} in {entry.h} candles
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${statusBadgeCls}`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono leading-relaxed">
                    tested {entry.testN} | win {(winRate * 100).toFixed(1)}% | break-even{' '}
                    {(be * 100).toFixed(1)}% | blocks above {entry.slicesAbove} of{' '}
                    {entry.slices} | p {pStr} | bound {boundStr} pts
                  </div>
                </div>
              );
            })}

            {shownCount < filteredRows.length && (
              <button
                onClick={() => setShownCount((c) => c + 15)}
                className="w-full py-2.5 rounded-xl border border-slate-800 bg-slate-800/60 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
              >
                Show 15 more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
