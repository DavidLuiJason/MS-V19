import React, { useEffect, useState } from 'react';
import Dexie from 'dexie';
import { Clock } from 'lucide-react';
import { db } from '../../data/db';
import { useAppStore } from '../../state/store';
import { getSetting, setSetting } from '../../data/repositories';

interface SecondsCaptureSetting {
  enabled: boolean;
  retentionHours: number;
}

interface CoinStat {
  sym: string;
  totalCount: number;
  ageSec: number | null;
  last10mCount: number;
}

export const SecondsDataCard: React.FC = () => {
  const { settings } = useAppStore();
  const trackedSymbols = settings.trackedSymbols;

  const [enabled, setEnabled] = useState<boolean>(true);
  const [retentionHours, setRetentionHours] = useState<number>(72);
  const [coinStats, setCoinStats] = useState<CoinStat[]>([]);

  useEffect(() => {
    getSetting<SecondsCaptureSetting>('secondsCapture', { enabled: true, retentionHours: 72 }).then((saved) => {
      const en = typeof saved?.enabled === 'boolean' ? saved.enabled : true;
      const hours = [24, 72, 168].includes(Number(saved?.retentionHours)) ? Number(saved.retentionHours) : 72;
      setEnabled(en);
      setRetentionHours(hours);
    });
  }, []);

  const handleToggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await setSetting('secondsCapture', { enabled: next, retentionHours });
  };

  const handleSetRetention = async (hours: number) => {
    setRetentionHours(hours);
    await setSetting('secondsCapture', { enabled, retentionHours: hours });
  };

  const loadStats = async () => {
    if (trackedSymbols.length === 0) {
      setCoinStats([]);
      return;
    }

    try {
      const tenMinsAgo = Date.now() - 600000;
      const recentRows = await db.secondCandles.where('t').above(tenMinsAgo).toArray();
      const recentBySym = new Map<string, number>();
      for (const row of recentRows) {
        recentBySym.set(row.sym, (recentBySym.get(row.sym) || 0) + 1);
      }

      const now = Date.now();
      const statsList: CoinStat[] = await Promise.all(
        trackedSymbols.map(async (sym) => {
          const range = db.secondCandles.where('[sym+t]').between([sym, Dexie.minKey], [sym, Dexie.maxKey]);
          const totalCount = await range.count();
          const lastCandle = await range.last();
          const ageSec = lastCandle ? Math.max(0, Math.floor((now - lastCandle.t) / 1000)) : null;
          const last10mCount = recentBySym.get(sym) || 0;
          return { sym, totalCount, ageSec, last10mCount };
        })
      );
      setCoinStats(statsList);
    } catch (err) {
      console.error('Failed to load seconds stats:', err);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 15000);
    return () => clearInterval(interval);
  }, [trackedSymbols]);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
      {/* Title & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white tracking-wide">Seconds data (1-second candles)</h2>
        </div>
        <button
          onClick={handleToggleEnabled}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
            enabled
              ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
              : 'bg-slate-800/60 border-slate-800 text-slate-400'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Retention buttons */}
      <div className="space-y-1.5">
        <div className="text-[11px] text-slate-400">Retention window</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '24h', hours: 24 },
            { label: '72h', hours: 72 },
            { label: '7 days', hours: 168 },
          ].map((btn) => (
            <button
              key={btn.hours}
              onClick={() => handleSetRetention(btn.hours)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                retentionHours === btn.hours
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notice */}
      <div className="text-[11px] text-slate-400">
        Changes apply within 30 seconds. Missing seconds are auto-healed up to 10 minutes behind live data.
      </div>

      {/* Tracked coins list */}
      {trackedSymbols.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-500">No coins tracked.</div>
      ) : (
        <div className="space-y-2">
          {coinStats.map((stat) => {
            const pct = ((stat.last10mCount / 600) * 100).toFixed(1);
            return (
              <div key={stat.sym} className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white font-mono">{stat.sym}</span>
                  <span className="text-xs font-mono text-slate-400">
                    Age: <span className="text-slate-200 font-semibold">{stat.ageSec !== null ? `${stat.ageSec}s` : '—'}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">
                    Stored seconds: <span className="text-cyan-400 font-bold">{stat.totalCount.toLocaleString()}</span>
                  </span>
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  last 10 min: {stat.last10mCount} of 600 seconds captured ({pct}%)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
