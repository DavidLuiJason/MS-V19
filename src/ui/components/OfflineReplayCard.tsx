import React, { useState, useEffect, useRef, useCallback } from 'react';
import { History, Play, X, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { getSetting, setSetting } from '../../data/repositories';
import {
  countStoredCandles,
  runOfflineReplay,
  type ReplayResult,
} from '../../lib/replayRunner';

export const OfflineReplayCard: React.FC = () => {
  const { settings } = useAppStore();

  const [mode, setMode] = useState<'live' | 'offline'>('live');
  const [selectedSym, setSelectedSym] = useState<string>('BTCUSDT');
  const [selectedTf, setSelectedTf] = useState<string>('1m');
  const [rangeDays, setRangeDays] = useState<number | null>(null);
  const [stride, setStride] = useState<number>(3);
  const [includeDiscovery, setIncludeDiscovery] = useState<boolean>(true);

  const [coinCounts, setCoinCounts] = useState<Record<string, number>>({});
  const [tfCounts, setTfCounts] = useState<Record<string, number>>({});

  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressDetail, setProgressDetail] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ReplayResult | null>(null);
  const [shownCount, setShownCount] = useState<number>(20);

  const cancelRef = useRef(false);
  const timerRef = useRef<any>(null);
  const startTimerRef = useRef(0);

  const trackedSymbols =
    settings.trackedSymbols && settings.trackedSymbols.length > 0
      ? settings.trackedSymbols
      : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

  useEffect(() => {
    async function init() {
      const savedMode = await getSetting<string>('predLabMode', 'live');
      if (savedMode === 'offline' || savedMode === 'live') {
        setMode(savedMode);
      }
      const savedRes = await getSetting<ReplayResult | null>('replayResult', null);
      if (savedRes) {
        setResult(savedRes);
      }
    }
    init();
  }, []);

  const loadCounts = useCallback(async () => {
    const newCoinCounts: Record<string, number> = {};
    for (const s of trackedSymbols) {
      newCoinCounts[s] = await countStoredCandles(s, '1m');
    }
    setCoinCounts(newCoinCounts);

    const sym = selectedSym || trackedSymbols[0] || 'BTCUSDT';
    const newTfCounts: Record<string, number> = {};
    for (const t of ['1m', '5m', '15m']) {
      newTfCounts[t] = await countStoredCandles(sym, t);
    }
    setTfCounts(newTfCounts);
  }, [trackedSymbols, selectedSym]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleSetMode = async (nextMode: 'live' | 'offline') => {
    setMode(nextMode);
    await setSetting('predLabMode', nextMode);
  };

  useEffect(() => {
    if (isRunning) {
      startTimerRef.current = Date.now();
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimerRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const handleRunReplay = async () => {
    setIsRunning(true);
    setIsCancelling(false);
    cancelRef.current = false;
    setError(null);
    setProgressPercent(0);
    setProgressDetail('Starting replay...');
    try {
      const res = await runOfflineReplay(
        selectedSym,
        selectedTf,
        rangeDays,
        stride,
        includeDiscovery,
        (percent, detail) => {
          setProgressPercent(percent);
          setProgressDetail(detail);
        },
        () => cancelRef.current
      );
      if (res !== null) {
        setResult(res);
        setShownCount(20);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setIsRunning(false);
      setIsCancelling(false);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsCancelling(true);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDurationMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const chosenCount = tfCounts[selectedTf] ?? 0;
  const isSelectionDisabled = chosenCount < 1500;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-4 shadow-xl">
      {/* Title */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-white">Prediction Lab: Live or Offline</h3>
        <History className="w-4 h-4 text-cyan-400" />
      </div>

      {/* Mode switch */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
          <button
            onClick={() => handleSetMode('live')}
            className={`py-2 px-3 rounded-xl font-medium text-xs transition ${
              mode === 'live'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Live (online)
          </button>
          <button
            onClick={() => handleSetMode('offline')}
            className={`py-2 px-3 rounded-xl font-medium text-xs transition ${
              mode === 'offline'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Offline replay
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 px-1">
          {mode === 'live'
            ? 'Live: Prediction Lab bets on new candles as they arrive (needs the collector and internet).'
            : 'Offline: no new live bets are made. The replay below uses candles already stored on this phone. No internet or VPN needed.'}
        </p>
      </div>

      {/* Replay setup */}
      <div className="space-y-4 pt-2 border-t border-slate-800/80">
        {/* Coin selector */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Coin (1m candle count)
          </label>
          <div className="flex flex-wrap gap-2">
            {trackedSymbols.map((sym) => {
              const count = coinCounts[sym] ?? 0;
              const disabled = count < 1500;
              const isSelected = selectedSym === sym;
              return (
                <button
                  key={sym}
                  onClick={() => setSelectedSym(sym)}
                  disabled={disabled}
                  className={`py-1.5 px-3 rounded-xl text-xs font-mono transition border ${
                    isSelected
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold'
                      : disabled
                      ? 'bg-slate-950/40 text-slate-600 border-slate-800/40 cursor-not-allowed'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {sym} <span className="text-[10px] text-slate-500">({count.toLocaleString()})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeframe selector */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Timeframe (count for {selectedSym})
          </label>
          <div className="flex gap-2">
            {['1m', '5m', '15m'].map((tf) => {
              const count = tfCounts[tf] ?? 0;
              const disabled = count < 1500;
              const isSelected = selectedTf === tf;
              return (
                <button
                  key={tf}
                  onClick={() => setSelectedTf(tf)}
                  disabled={disabled}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-mono transition border text-center ${
                    isSelected
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold'
                      : disabled
                      ? 'bg-slate-950/40 text-slate-600 border-slate-800/40 cursor-not-allowed'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {tf} <span className="text-[10px] text-slate-500">({count.toLocaleString()})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Range selector */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Range
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Last 7 days', val: 7 },
              { label: 'Last 14 days', val: 14 },
              { label: 'All stored', val: null },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setRangeDays(opt.val)}
                className={`py-1.5 px-2 rounded-xl text-xs transition border text-center ${
                  rangeDays === opt.val
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Speed selector */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Speed
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Fast: every 3rd candle', val: 3 },
              { label: 'Thorough: every candle', val: 1 },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setStride(opt.val)}
                className={`py-1.5 px-2 rounded-xl text-xs transition border text-center ${
                  stride === opt.val
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeDiscovery}
            onChange={(e) => setIncludeDiscovery(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-xs text-slate-300">Include pattern discovery</span>
        </label>

        {/* Run button */}
        <button
          onClick={handleRunReplay}
          disabled={isRunning || isSelectionDisabled}
          className="w-full py-3 rounded-2xl bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 active:scale-98 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4 fill-current" />
          Run offline replay
        </button>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Running Progress Bar Card */}
        {isRunning && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-cyan-400 font-medium">{progressDetail || 'Evaluating steps...'}</span>
              <span className="text-slate-400 font-mono">{progressPercent}%</span>
            </div>

            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">Elapsed: {formatTimer(elapsedSeconds)}</span>
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition flex items-center gap-1 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                {isCancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Still working. Keep this screen open. If the timer stops counting, the phone is busy; wait.
            </p>
          </div>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3">
          <div className="text-xs text-slate-400 font-mono leading-relaxed">
            Last run: {new Date(result.runAt).toLocaleString()} | {result.sym} {result.tf} |{' '}
            {result.rangeLabel} | {result.speedLabel} | {result.stepsEvaluated} steps | took{' '}
            {formatDurationMs(result.durationMs)} | K = {result.K}
          </div>

          {result.leakWarning && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>WARNING: the coin-flip control is far from 50%. Something is wrong. Do not trust this run.</span>
            </div>
          )}

          <div className="space-y-2">
            {result.trials.slice(0, shownCount).map((row) => {
              const statusBadgeCls =
                row.status === 'CANDIDATE (unconfirmed)'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : row.status === 'NO EDGE FOUND'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700';

              const neffStr = row.neff !== null ? Math.round(row.neff).toString() : '-';
              const pStr =
                row.pValue !== null
                  ? row.pValue < 0.0001
                    ? '<0.0001'
                    : row.pValue.toFixed(4)
                  : '-';
              const boundStr =
                row.boundPts !== null
                  ? (row.boundPts >= 0 ? '+' : '') + row.boundPts.toFixed(1)
                  : '-';

              return (
                <div
                  key={row.key}
                  className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {row.label}
                      {row.isReference ? ' (reference)' : ''}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${statusBadgeCls}`}
                    >
                      {row.status}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono leading-relaxed">
                    N {row.N} | N_eff {neffStr} | win {(row.winRate * 100).toFixed(1)}% | break-even{' '}
                    {(row.breakEven * 100).toFixed(1)}% | up-share {(row.alwaysUp * 100).toFixed(1)}% | bound{' '}
                    {boundStr} pts | p {pStr} | thirds above {row.thirdsAbove} of 3
                  </div>
                </div>
              );
            })}
          </div>

          {shownCount < result.trials.length && (
            <button
              onClick={() => setShownCount((c) => c + 20)}
              className="w-full py-2.5 rounded-xl border border-slate-800 bg-slate-800/60 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
            >
              Show 20 more
            </button>
          )}
        </div>
      )}

      {/* Explanation text */}
      <p className="text-[11px] text-slate-500 leading-relaxed mt-4 pt-3 border-t border-slate-800/60">
        Replay never sees the future: at each step the finders only get candles up to that moment.
        The coin-flip control should land near 50%. The reference row is a known weak effect used as a
        check. Replay results are history-only and separate from live evidence. A good result here only
        means worth watching live, never proof.
      </p>
    </div>
  );
};
