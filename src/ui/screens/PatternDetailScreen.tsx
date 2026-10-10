import React from 'react';
import { ArrowLeft, Shapes, TrendingUp } from 'lucide-react';

interface Props {
  onBack: () => void;
  patternId?: string | null;
}

export const PatternDetailScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="p-4 space-y-4 pb-20">
      {/* Header with back arrow */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-bold text-white tracking-tight">Pattern Detail</h2>
      </div>

      {/* Pattern Detail Card Layout */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              BTC
            </div>
            <div>
              <div className="font-bold text-sm text-white">BTC/USDT</div>
              <div className="text-xs text-slate-400">Pattern Evaluation</div>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Pending
          </span>
        </div>

        {/* Empty State Card */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-2.5">
            <Shapes className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200 mb-1">
            No patterns recorded yet
          </h4>
          <p className="text-xs text-slate-400">
            Available in the next build
          </p>
        </div>

        {/* Pattern Snapshot Section (UI layout) */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Pattern Snapshot
          </div>
          <div className="grid grid-cols-3 gap-2 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/60 text-center">
            <div>
              <div className="text-[11px] text-slate-400">Before</div>
              <div className="text-xs font-bold text-slate-300 mt-1 font-mono">—</div>
              <div className="text-[10px] text-slate-500 font-mono">—</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">During</div>
              <div className="text-xs font-bold text-slate-300 mt-1 font-mono">—</div>
              <div className="text-[10px] text-slate-500 font-mono">—</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">After</div>
              <div className="text-xs font-bold text-slate-300 mt-1 font-mono">—</div>
              <div className="text-[10px] text-slate-500 font-mono">—</div>
            </div>
          </div>
        </div>

        {/* Outcome Stats */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Outcome Stats
          </div>
          <div className="space-y-2 text-xs bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/60">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Return</span>
              <span className="text-slate-300 font-mono font-medium">—</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Best move</span>
              <span className="text-slate-300 font-mono font-medium">—</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Worst move</span>
              <span className="text-slate-300 font-mono font-medium">—</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
