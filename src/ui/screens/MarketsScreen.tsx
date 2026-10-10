import React, { useState } from 'react';
import { useAppStore } from '../../state/store';
import { formatPrice, formatPercent } from '../../lib/formatters';
import { splitSymbol } from '../../lib/symbols';
import { MarketScannerModal } from '../components/MarketScannerModal';
import { SourceBadge } from '../components/SourceBadge';
import { Search } from 'lucide-react';

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

export const MarketsScreen: React.FC<Props> = ({ onSelectSymbol }) => {
  const { settings, latestTicks, tickers24h } = useAppStore();
  const [showScanner, setShowScanner] = useState(false);

  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight mb-1">Markets</h2>
          <p className="text-xs text-slate-400 mb-1.5">Binance feed · best Buy / Sell price and 24h change</p>
          <SourceBadge feed="binance" />
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Scanner</span>
        </button>
      </div>

      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        {/* Table Header */}
        <div className="grid grid-cols-12 px-4 py-3 bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          <div className="col-span-4">Symbol</div>
          <div className="col-span-3 text-right">Buy</div>
          <div className="col-span-3 text-right">Sell</div>
          <div className="col-span-2 text-right">24h</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-800/50">
          {settings.trackedSymbols.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No tracked symbols. Add symbols in Settings.
            </div>
          ) : (
            settings.trackedSymbols.map((sym) => {
              const tick = latestTicks[sym];
              const buyLiquidity = tick ? tick.ask : undefined; // ask
              const sellLiquidity = tick ? tick.bid : undefined; // bid
              const spread = tick ? tick.ask - tick.bid : undefined;
              const change24h = tickers24h[sym];

              const formattedSym = splitSymbol(sym).base;

              return (
                <div
                  key={sym}
                  onClick={() => onSelectSymbol(sym)}
                  className="grid grid-cols-12 px-4 py-3.5 items-center hover:bg-slate-800/40 active:bg-slate-800/70 transition cursor-pointer"
                >
                  {/* Symbol */}
                  <div className="col-span-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-xs font-bold text-amber-400">
                      {sym.substring(0, 3)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{formattedSym}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {spread !== undefined ? `Spr ${spread.toFixed(2)}` : splitSymbol(sym).quote}
                      </div>
                    </div>
                  </div>

                  {/* Buy (Ask) */}
                  <div className="col-span-3 text-right font-mono font-medium text-xs text-emerald-400 tabular-nums">
                    {formatPrice(buyLiquidity)}
                  </div>

                  {/* Sell (Bid) */}
                  <div className="col-span-3 text-right font-mono font-medium text-xs text-rose-400 tabular-nums">
                    {formatPrice(sellLiquidity)}
                  </div>

                  {/* 24h Change */}
                  <div className="col-span-2 text-right">
                    {change24h !== undefined ? (
                      <span
                        className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded-md ${
                          change24h >= 0
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-rose-400 bg-rose-500/10'
                        }`}
                      >
                        {formatPercent(change24h)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <MarketScannerModal isOpen={showScanner} onClose={() => setShowScanner(false)} />
    </div>
  );
};
