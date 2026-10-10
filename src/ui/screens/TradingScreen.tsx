import React, { useState } from 'react';
import { useAppStore } from '../../state/store';
import { Wallet, TrendingUp, History, ChevronRight } from 'lucide-react';
import { formatPrice } from '../../lib/formatters';
import { PaperAccountSheet } from '../components/PaperAccountSheet';
import { PLATFORM_CATALOG, getPlatform, type CatalogOption } from '../../data/platformCatalog';

export const TradingScreen: React.FC = () => {
  const {
    selectedPlatformId,
    setSelectedPlatform,
    openOption,
    paperBalance,
  } = useAppStore();

  const [showAdjustSheet, setShowAdjustSheet] = useState(false);

  const currentPlatform = getPlatform(selectedPlatformId) || PLATFORM_CATALOG[0];

  // Group options of currentPlatform while preserving catalog order
  const groups: { groupName: string; options: CatalogOption[] }[] = [];
  for (const opt of currentPlatform.options) {
    let g = groups.find((grp) => grp.groupName === opt.group);
    if (!g) {
      g = { groupName: opt.group, options: [] };
      groups.push(g);
    }
    g.options.push(opt);
  }

  return (
    <div className="p-4 space-y-4 pb-20">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight mb-1">Trading</h2>
        <p className="text-xs text-slate-400">Paper simulation and automated position tracking</p>
      </div>

      {/* Paper Account Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400 font-medium mb-1 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
            Paper Account
          </div>
          <div className="text-2xl font-bold text-white font-mono tracking-tight">
            {paperBalance !== null ? `$${formatPrice(paperBalance, 2)}` : '—'}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-400">
            Simulation
          </div>
          <button
            onClick={() => setShowAdjustSheet(true)}
            className="px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition active:scale-95 cursor-pointer"
          >
            Adjust
          </button>
        </div>
      </div>

      {/* Platform Section */}
      <div className="space-y-3">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider px-1">
          Platform
        </span>

        {/* Segmented Control */}
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_CATALOG.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className={`py-2.5 px-3 rounded-2xl text-xs border transition text-center ${
                selectedPlatformId === p.id
                  ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Options list grouped by group */}
        <div className="space-y-3 pt-1">
          {groups.map((grp) => (
            <div key={grp.groupName} className="space-y-2">
              {grp.options.length >= 2 && (
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-1">
                  {grp.groupName}
                </div>
              )}
              <div className="space-y-2">
                {grp.options.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={opt.available ? () => openOption(currentPlatform.id, opt.id) : undefined}
                    className={`bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3 flex items-center justify-between transition ${
                      opt.available
                        ? 'cursor-pointer hover:bg-slate-800/40 active:scale-[0.99]'
                        : 'opacity-60 cursor-default'
                    }`}
                  >
                    <span className="text-sm font-semibold text-white">{opt.name}</span>
                    {opt.available ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <span className="text-[11px] text-slate-500">Not set up yet</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Open Trades */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Open Trades
          </span>
          <span className="text-xs text-slate-500">0 open</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-slate-300 mb-0.5">No trades yet</h4>
          <p className="text-xs text-slate-500">Available in the next build</p>
        </div>
      </div>

      {/* History */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            History
          </span>
          <span className="text-xs text-slate-500">0 trades</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
            <History className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-slate-300 mb-0.5">No trade history yet</h4>
          <p className="text-xs text-slate-500">Available in the next build</p>
        </div>
      </div>

      {showAdjustSheet && <PaperAccountSheet onClose={() => setShowAdjustSheet(false)} />}
    </div>
  );
};
