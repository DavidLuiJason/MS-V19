import React from 'react';
import { useAppStore } from '../../state/store';
import { ArrowLeft } from 'lucide-react';

interface Props {
  title?: string;
  onBack?: () => void;
  showBack?: boolean;
}

export const TopBar: React.FC<Props> = ({ title, onBack, showBack }) => {
  const { collectorState, collectorLabel, isPaused } = useAppStore();

  const getDotColor = () => {
    if (isPaused || collectorState === 'paused') return 'bg-slate-400';
    if (collectorState === 'unreachable') return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]';
    if (collectorState === 'reconnecting') return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)] animate-pulse';
    return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]';
  };

  const getShortStatusText = () => {
    if (isPaused) return 'Paused';
    if (collectorState === 'unreachable') return 'Unreachable';
    if (collectorState === 'reconnecting') return 'Connecting';
    return 'Collecting';
  };

  return (
    <header className="h-13 min-h-[52px] px-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30 shrink-0">
      <div className="flex items-center gap-2">
        {showBack && onBack ? (
          <button
            onClick={onBack}
            className="w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 active:scale-95 transition"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : null}
        <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
          {title || 'MarketScope'}
        </h1>
      </div>

      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/90 border border-slate-800/80"
        title={collectorLabel}
      >
        <span className={`w-2 h-2 rounded-full ${getDotColor()}`} />
        <span className="text-[11px] font-medium text-slate-300 capitalize tracking-tight">
          {getShortStatusText()}
        </span>
      </div>
    </header>
  );
};
