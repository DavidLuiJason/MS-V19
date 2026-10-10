import React, { useState } from 'react';
import { useAppStore } from '../../state/store';
import { formatPrice } from '../../lib/formatters';
import { formatPair } from '../../lib/symbols';
import { TradingViewChart } from '../components/TradingViewChart';
import { SourceBadge } from '../components/SourceBadge';
import { ChevronDown, ArrowLeft } from 'lucide-react';

interface Props {
  onBack?: () => void;
}

export const LiveMarketScreen: React.FC<Props> = ({ onBack }) => {
  const {
    selectedSymbol,
    setSelectedSymbol,
    selectedTimeframe,
    setSelectedTimeframe,
    settings,
    latestTicks,
    indicatorsEnabled,
    setIndicatorsEnabled,
    activeIndicators,
    toggleIndicator,
  } = useAppStore();

  const [showSymbolPicker, setShowSymbolPicker] = useState(false);

  const tick = latestTicks[selectedSymbol];
  const buyLiquidity = tick?.ask; // ask = Ask
  const sellLiquidity = tick?.bid; // bid = Bid
  const spread = tick ? tick.ask - tick.bid : undefined;

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];

  return (
    <div className="p-4 space-y-4 pb-20">
      <SourceBadge feed="binance" />

      {/* 1. Header with Symbol Picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowSymbolPicker(!showSymbolPicker)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 text-white font-bold text-base transition"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>{formatPair(selectedSymbol)}</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {showSymbolPicker && (
              <div className="absolute top-full left-0 mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-1 z-30 divide-y divide-slate-800/60">
                {settings.trackedSymbols.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSelectedSymbol(s);
                      setShowSymbolPicker(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-800 transition ${
                      s === selectedSymbol ? 'text-cyan-400 bg-slate-800/50' : 'text-slate-200'
                    }`}
                  >
                    {formatPair(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Spread Badge */}
        {spread !== undefined && (
          <div className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-slate-900 border border-slate-800 text-slate-300">
            Spread <span className="text-white font-bold">{spread.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* 2. Large Ask & Bid Numbers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3.5">
          <div className="text-[11px] font-medium text-slate-400 mb-0.5">Buy</div>
          <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
            {formatPrice(buyLiquidity)}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3.5 text-right">
          <div className="text-[11px] font-medium text-slate-400 mb-0.5">Sell</div>
          <div className="text-xl font-bold font-mono text-rose-400 tabular-nums">
            {formatPrice(sellLiquidity)}
          </div>
        </div>
      </div>

      {/* Chart Legend */}
      <div className="flex items-center justify-between px-1 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span className="text-slate-400 text-[11px]">Buy</span>
            <span className="text-slate-200 font-mono text-[11px] font-semibold">
              {formatPrice(buyLiquidity)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="text-slate-400 text-[11px]">Sell</span>
            <span className="text-slate-200 font-mono text-[11px] font-semibold">
              {formatPrice(sellLiquidity)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Candlestick Chart */}
      <TradingViewChart
        symbol={selectedSymbol}
        timeframe={selectedTimeframe}
        buyPrice={buyLiquidity}
        sellPrice={sellLiquidity}
      />

      {/* 4. Timeframe Chips */}
      <div className="flex items-center justify-between gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedTimeframe === tf
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tf.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 5. Indicator Toggle Row (MA 20, EMA 20, RSI 14, MACD 12/26/9) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white">Indicators</span>
          <button
            onClick={() => setIndicatorsEnabled(!indicatorsEnabled)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 ${
              indicatorsEnabled ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-md transform transition" />
          </button>
        </div>

        {indicatorsEnabled && (
          <div className="grid grid-cols-4 gap-2 pt-1 animate-in fade-in duration-200">
            <button
              onClick={() => toggleIndicator('ma')}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition ${
                activeIndicators.ma
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 font-semibold'
                  : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              MA 20
            </button>

            <button
              onClick={() => toggleIndicator('ema')}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition ${
                activeIndicators.ema
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 font-semibold'
                  : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              EMA 20
            </button>

            <button
              onClick={() => toggleIndicator('rsi')}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition ${
                activeIndicators.rsi
                  ? 'bg-sky-500/20 border-sky-500/50 text-sky-400 font-semibold'
                  : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              RSI 14
            </button>

            <button
              onClick={() => toggleIndicator('macd')}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition ${
                activeIndicators.macd
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 font-semibold'
                  : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              MACD
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
