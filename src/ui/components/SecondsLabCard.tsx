import React, { useEffect, useState, useRef } from 'react';
import { Zap } from 'lucide-react';
import { buildSecLabReport, type SecLabReport } from '../../data/secondsLab';
import { getSetting, setSetting } from '../../data/repositories';

interface SecLabSetting {
  enabled: boolean;
  retentionDays: number;
}

interface SecLabPayoutsSetting {
  p5: number;
  p15: number;
  p30: number;
}

const FINDER_ORDER = ['coin', 'mom5', 'rev5', 'flow10'];

export const SecondsLabCard: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<number>(7);
  const [payouts, setPayouts] = useState<SecLabPayoutsSetting>({ p5: 105, p15: 115, p30: 120 });
  const [report, setReport] = useState<SecLabReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [visibleCount, setVisibleCount] = useState<number>(12);

  const isRefreshingRef = useRef<boolean>(false);

  useEffect(() => {
    async function loadConfig() {
      const savedLab = await getSetting<SecLabSetting>('secLab', { enabled: true, retentionDays: 7 });
      const en = typeof savedLab?.enabled === 'boolean' ? savedLab.enabled : true;
      const days = [7, 14, 30].includes(Number(savedLab?.retentionDays)) ? Number(savedLab.retentionDays) : 7;
      setEnabled(en);
      setRetentionDays(days);

      const savedPayouts = await getSetting<SecLabPayoutsSetting>('secLabPayouts', {
        p5: 105,
        p15: 115,
        p30: 120,
      });
      const p5 = Number(savedPayouts?.p5) || 105;
      const p15 = Number(savedPayouts?.p15) || 115;
      const p30 = Number(savedPayouts?.p30) || 120;
      setPayouts({ p5, p15, p30 });
    }
    loadConfig();
  }, []);

  const fetchReport = async (p: SecLabPayoutsSetting) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const rep = await buildSecLabReport(p);
      setReport(rep);
    } catch (err) {
      console.error('Failed to build seconds lab report:', err);
    } finally {
      isRefreshingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(payouts);
    const interval = setInterval(() => {
      fetchReport(payouts);
    }, 60000);
    return () => clearInterval(interval);
  }, [payouts]);

  const handleToggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await setSetting('secLab', { enabled: next, retentionDays });
  };

  const handleSetRetention = async (days: number) => {
    setRetentionDays(days);
    await setSetting('secLab', { enabled, retentionDays: days });
  };

  const handlePayoutChange = async (key: 'p5' | 'p15' | 'p30', val: number) => {
    const next = { ...payouts, [key]: val };
    setPayouts(next);
    await setSetting('secLabPayouts', next);
    fetchReport(next);
  };

  const getStatusBadgeClass = (status: string) => {
    if (status === 'CANDIDATE (unconfirmed)') {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
    if (status === 'NO EDGE FOUND') {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
    if (status === 'COLLECTING') {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
    if (status === 'TOO EARLY') {
      return 'bg-slate-800 text-slate-400 border-slate-700';
    }
    return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
  };

  const hasData = report && report.totals.recorded > 0;

  const sortedTrials = [...(report?.trials || [])].sort((a, b) => {
    const fA = FINDER_ORDER.indexOf(a.finderId);
    const fB = FINDER_ORDER.indexOf(b.finderId);
    if (fA !== fB) return (fA === -1 ? 99 : fA) - (fB === -1 ? 99 : fB);
    if (a.sym !== b.sym) return a.sym.localeCompare(b.sym);
    return a.h - b.h;
  });

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
      {/* Title & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white tracking-wide">Seconds Lab (paper bets)</h2>
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
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => handleSetRetention(d)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                retentionDays === d
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {/* Payout percent inputs */}
      <div className="space-y-1.5">
        <div className="text-[11px] text-slate-400">Payout Percent by Horizon</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">5s Payout %</label>
            <input
              type="number"
              value={payouts.p5}
              onChange={(e) => handlePayoutChange('p5', Number(e.target.value))}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">15s Payout %</label>
            <input
              type="number"
              value={payouts.p15}
              onChange={(e) => handlePayoutChange('p15', Number(e.target.value))}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">30s Payout %</label>
            <input
              type="number"
              value={payouts.p30}
              onChange={(e) => handlePayoutChange('p30', Number(e.target.value))}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* Notice text */}
      <div className="text-[11px] text-slate-400">
        Win rule: Up wins if the price is higher at the end. Spread Rush&apos;s extra spread condition is not modelled. Binance prices, not Cwallet&apos;s.
      </div>

      {/* Stats summary & Exclusion line */}
      {report && (
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 space-y-1.5">
          <div className="text-xs font-mono text-slate-300">
            Trials counted (K): <span className="font-bold text-cyan-400">{report.K}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Recorded: {report.totals.recorded} · Counted: {report.totals.counted} · Ties: {report.totals.ties} · Expired: {report.totals.expired} · Late: {report.totals.ineligible}
          </div>
          <div className="text-xs font-mono text-slate-300">
            Control (coin flip) win rate:{' '}
            <span className="font-bold text-cyan-400">
              {report.controlWinRate !== null ? `${report.controlWinRate.toFixed(1)}%` : '—'}
            </span>{' '}
            <span className="text-slate-500 text-[11px] font-sans">(should stay near 50%)</span>
          </div>
        </div>
      )}

      {/* Trials list or empty state */}
      {!hasData && !loading ? (
        <div className="py-6 text-center text-xs text-slate-500">
          No Seconds Lab bets yet. Needs the Seconds data capture switched on.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTrials.slice(0, visibleCount).map((trial) => (
            <div key={trial.id} className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white font-mono">
                  {trial.finderId} · {trial.sym} · {trial.h}s
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadgeClass(trial.status)}`}>
                  {trial.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400">
                <span>N: <span className="text-slate-200">{trial.N}</span></span>
                <span>Eff N: <span className="text-slate-200">{trial.neff !== null ? Math.round(trial.neff) : '—'}</span></span>
                <span>Win: <span className="text-slate-200">{(trial.winRate * 100).toFixed(1)}%</span></span>
                <span>Break-even: <span className="text-slate-200">{(trial.breakEven * 100).toFixed(1)}%</span></span>
                <span>
                  Bound:{' '}
                  <span className={trial.bound !== null && trial.bound >= 0 ? 'text-emerald-400' : 'text-slate-200'}>
                    {trial.bound !== null
                      ? `${trial.bound >= 0 ? '+' : ''}${(trial.bound * 100).toFixed(1)} pts`
                      : '—'}
                  </span>
                </span>
              </div>
            </div>
          ))}

          {sortedTrials.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((prev) => prev + 12)}
              className="w-full py-2 rounded-xl border border-slate-800 bg-slate-800/60 text-xs font-bold text-slate-300 hover:bg-slate-800"
            >
              Show 12 more
            </button>
          )}
        </div>
      )}
    </div>
  );
};
