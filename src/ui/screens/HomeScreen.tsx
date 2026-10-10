import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../state/store';
import { getDatabaseStats } from '../../data/repositories';
import { formatPrice, formatUptime, formatRelativeTime, formatBytes } from '../../lib/formatters';
import { formatPair } from '../../lib/symbols';
import { Activity, Pause, Play, TrendingUp, Layers, CheckCircle2, Database, Clock } from 'lucide-react';

export const HomeScreen: React.FC = () => {
  const {
    collectorLabel,
    collectorState,
    isPaused,
    uptimeMs,
    settings,
    latestTicks,
    toggleCollectorPause,
    setActiveTab,
    setSelectedSymbol,
  } = useAppStore();

  const [dbStats, setDbStats] = useState({
    ticksCount: 0,
    quoteBarsCount: 0,
    candlesCount: 0,
    gapsCount: 0,
    storageUsed: 0,
    storageQuota: 0,
    lastDataTime: 0,
  });

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      const stats = await getDatabaseStats();
      if (isMounted) {
        setDbStats(stats);
      }
    }
    loadStats();
    const interval = setInterval(loadStats, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleOpenMarket = (sym: string) => {
    setSelectedSymbol(sym);
    setActiveTab('markets');
  };

  // Find latest tick time across tracked symbols or dbStats
  const latestTickTimes = Object.values(latestTicks).map((t) => t.t);
  const mostRecentDataTime = Math.max(dbStats.lastDataTime, ...latestTickTimes, 0);

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* 1. Collector Status Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Activity className={`w-6 h-6 ${!isPaused && collectorState === 'collecting' ? 'animate-pulse' : ''}`} />
              </div>
              <span
                className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${
                  isPaused ? 'bg-slate-500' : collectorState === 'unreachable' ? 'bg-rose-500' : 'bg-emerald-400'
                }`}
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Collector Status</div>
              <div className="text-base font-bold text-white tracking-tight">
                {isPaused ? 'Paused' : collectorLabel}
              </div>
            </div>
          </div>

          {/* Pause / Resume Button */}
          <button
            onClick={toggleCollectorPause}
            className={`p-2.5 rounded-xl border transition active:scale-95 flex items-center justify-center ${
              isPaused
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title={isPaused ? 'Resume collector' : 'Pause collector'}
          >
            {isPaused ? <Play className="w-4 h-4 fill-emerald-400" /> : <Pause className="w-4 h-4" />}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-slate-800/80">
          <div>
            <div className="text-[11px] text-slate-400 mb-0.5">Uptime</div>
            <div className="text-sm font-bold text-slate-100 tabular-nums">
              {formatUptime(uptimeMs)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 mb-0.5">Last data</div>
            <div className="text-sm font-bold text-slate-100 tabular-nums">
              {formatRelativeTime(mostRecentDataTime)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Key Markets */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold text-slate-200 tracking-tight">Key Markets</h2>
          <button
            onClick={() => setActiveTab('markets')}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
          >
            View all
          </button>
        </div>

        <div className="space-y-3">
          {settings.trackedSymbols.map((sym) => {
            const tick = latestTicks[sym];
            const buyLiquidity = tick ? tick.ask : undefined; // ask = Ask
            const sellLiquidity = tick ? tick.bid : undefined; // bid = Bid
            const spread = tick ? tick.ask - tick.bid : undefined;

            const formattedSym = formatPair(sym);

            return (
              <div
                key={sym}
                onClick={() => handleOpenMarket(sym)}
                className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 rounded-2xl p-4 transition cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xs">
                      {sym.substring(0, 3)}
                    </div>
                    <span className="font-semibold text-sm text-white">{formattedSym}</span>
                  </div>
                  {spread !== undefined ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                      {spread.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">Waiting data</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
                  <div>
                    <div className="text-[11px] text-slate-400 mb-0.5">Buy</div>
                    <div className="text-base font-bold text-emerald-400 font-mono tabular-nums">
                      {formatPrice(buyLiquidity)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400 mb-0.5">Sell</div>
                    <div className="text-base font-bold text-rose-400 font-mono tabular-nums">
                      {formatPrice(sellLiquidity)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Today's Patterns & Paper P&L Cards (Show 0 and — with 'Not active yet' until later builds) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400 font-medium">Today's Patterns</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-white font-mono tabular-nums">0</div>
          <div className="text-[11px] text-slate-500 mt-1">Not active yet</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400 font-medium">Paper P&L</span>
            <TrendingUp className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-xl font-bold text-slate-400 font-mono tabular-nums">—</div>
          <div className="text-[11px] text-slate-500 mt-1">Not active yet</div>
        </div>
      </div>

      {/* 4. Real Statistics Card */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 space-y-3">
        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          System Statistics
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Patterns detected</span>
            <span className="text-slate-200 font-mono font-medium">0</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Win rate</span>
            <span className="text-slate-400 font-mono font-medium">—</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Sample size</span>
            <span className="text-slate-200 font-mono font-medium">0</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Ticks stored</span>
            <span className="text-slate-200 font-mono font-medium tabular-nums">
              {dbStats.ticksCount.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Candles stored</span>
            <span className="text-slate-200 font-mono font-medium tabular-nums">
              {dbStats.candlesCount.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Storage used</span>
            <span className="text-slate-200 font-mono font-medium tabular-nums">
              {formatBytes(dbStats.storageUsed)}
            </span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-slate-400">Last data received</span>
            <span className="text-slate-200 font-mono font-medium">
              {formatRelativeTime(mostRecentDataTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
