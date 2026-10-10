import React, { useEffect, useState, useRef } from 'react';
import { getArenaReport, type ArenaReport } from '../../data/arena';
import { getSetting, setSetting } from '../../data/repositories';
import { ShieldCheck, ChevronDown } from 'lucide-react';

const PAYOUT_OPTIONS = [90, 95, 105, 115, 120];

export const ArenaCard: React.FC = () => {
  const [payoutPct, setPayoutPct] = useState<number>(95);
  const [report, setReport] = useState<ArenaReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [visibleCount, setVisibleCount] = useState<number>(15);
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    getSetting<number>('arenaPayoutPct', 95).then((saved) => {
      if (PAYOUT_OPTIONS.includes(saved)) {
        setPayoutPct(saved);
      }
    });
  }, []);

  const loadReport = async (payout: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await getArenaReport(payout);
      setReport(data);
    } catch {
      // keep prior report on transient error
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(payoutPct);
    const interval = setInterval(() => {
      loadReport(payoutPct);
    }, 15000);
    return () => clearInterval(interval);
  }, [payoutPct]);

  const handlePayoutChange = async (pct: number) => {
    setPayoutPct(pct);
    await setSetting('arenaPayoutPct', pct);
    loadReport(pct);
  };

  const getStatusBadge = (status: string) => {
    let cls = 'bg-slate-800/80 text-slate-400 border-slate-700';
    if (status === 'CANDIDATE (unconfirmed)') {
      cls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    } else if (status === 'NO EDGE FOUND') {
      cls = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    } else if (status === 'COLLECTING') {
      cls = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    } else if (status === 'TOO EARLY') {
      cls = 'bg-slate-800 text-slate-400 border-slate-700';
    } else if (status === 'NOT PROVEN') {
      cls = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
        {status}
      </span>
    );
  };

  const hasData = report && report.totals.recorded > 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
      {/* Title & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white tracking-wide">Arena (evidence)</h2>
        </div>
        {report && (
          <span className="text-[11px] font-mono text-slate-400">
            Trials counted (K): <span className="font-bold text-cyan-400">{report.K.toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* Payout percentage selector */}
      <div className="space-y-1.5">
        <div className="text-[11px] text-slate-400">Target Payout</div>
        <div className="grid grid-cols-5 gap-1.5">
          {PAYOUT_OPTIONS.map((pct) => (
            <button
              key={pct}
              onClick={() => handlePayoutChange(pct)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                payoutPct === pct
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {!hasData && !loading ? (
        <div className="py-6 text-center text-xs text-slate-500">
          No Arena bets yet. Turn the Prediction Lab on.
        </div>
      ) : report ? (
        <>
          {/* Exclusion report summary */}
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 space-y-2">
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Exclusion & Accounting Report
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Signals Recorded</span>
                <span className="font-bold text-white">{report.totals.recorded}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Counted (Eligible)</span>
                <span className="font-bold text-emerald-400">{report.totals.counted}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Catch-up (Excluded)</span>
                <span className="text-slate-400">{report.totals.notCountedCatchup}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Late {'>'}2m (Excluded)</span>
                <span className="text-slate-400">{report.totals.notCountedLate}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Ties (Excluded)</span>
                <span className="text-slate-400">{report.totals.ties}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Expired (Excluded)</span>
                <span className="text-slate-400">{report.totals.expired}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Open Bets</span>
                <span className="text-cyan-400 font-bold">{report.totals.open}</span>
              </div>
            </div>
          </div>

          {/* Trials List */}
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Eligible Trials ({report.trials.length})
            </div>

            {report.trials.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                No eligible trials scored yet.
              </div>
            ) : (
              report.trials.slice(0, visibleCount).map((row) => (
                <div
                  key={row.trialId}
                  className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 space-y-2.5"
                >
                  {/* Row Header */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-white truncate">{row.label}</span>
                    {getStatusBadge(row.status)}
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">N</span>
                      <span className="text-slate-200 font-bold">{row.N}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">N eff</span>
                      <span className="text-slate-200">
                        {row.neff !== null ? Math.round(row.neff) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">Win Rate</span>
                      <span className="text-emerald-400 font-bold">
                        {(row.winRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">Break-even</span>
                      <span className="text-slate-400">{(row.breakEven * 100).toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">p-value</span>
                      <span className="text-cyan-400">
                        {row.pValue < 0.0001 ? '<0.0001' : row.pValue.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">Bound</span>
                      <span
                        className={
                          row.bound >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                        }
                      >
                        {row.bound >= 0 ? '+' : ''}
                        {row.bound.toFixed(2)} pts
                      </span>
                    </div>
                  </div>

                  {/* Secondary Details */}
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900 gap-1 font-mono">
                    <div>
                      <span className="text-slate-500 font-sans">Expectancy: </span>
                      <span
                        className={
                          row.bestCaseExpectancy >= 0
                            ? 'text-emerald-400 font-bold'
                            : 'text-rose-400'
                        }
                      >
                        {row.bestCaseExpectancy >= 0 ? '+' : ''}
                        {row.bestCaseExpectancy.toFixed(3)} / 1.00
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans">Always-Up: </span>
                      <span>{(row.alwaysUp * 100).toFixed(1)}%</span>
                      <span className="mx-1 text-slate-600">·</span>
                      <span className="text-slate-500 font-sans">Always-Down: </span>
                      <span>{(row.alwaysDown * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Show more button */}
            {report.trials.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((c) => c + 15)}
                className="w-full py-2 rounded-xl border border-slate-800 bg-slate-800/60 hover:bg-slate-800 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition"
              >
                <span>Show 15 more</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
