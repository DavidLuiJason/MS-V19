import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../state/store';
import { getPlatform, getOption } from '../../data/platformCatalog';
import { getOptionLimits, saveOptionLimits } from '../../data/repositories';
import { SourceBadge } from '../components/SourceBadge';
import { formatPrice, formatPercent } from '../../lib/formatters';
import { formatPair } from '../../lib/symbols';

export const TradeOptionScreen: React.FC = () => {
  const {
    openTradeOption,
    closeOption,
    setActiveTab,
    settings,
    selectedSymbol,
    setSelectedSymbol,
    latestTicks,
    tickers24h,
  } = useAppStore();

  if (!openTradeOption) return null;

  const { platformId, optionId } = openTradeOption;
  const platform = getPlatform(platformId);
  const option = getOption(platformId, optionId);

  if (!platform || !option) return null;

  const [amountInput, setAmountInput] = useState('');
  const [maxSpendInput, setMaxSpendInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setSaveError(null);
    setSaveSuccess(false);

    async function loadLimits() {
      try {
        const limits = await getOptionLimits(platformId, optionId);
        if (isMounted) {
          setAmountInput(limits.amountPerTrade !== null ? limits.amountPerTrade.toString() : '');
          setMaxSpendInput(limits.maxSpendPerDay !== null ? limits.maxSpendPerDay.toString() : '');
        }
      } catch {
        // ignore
      }
    }

    loadLimits();
    return () => {
      isMounted = false;
    };
  }, [platformId, optionId]);

  const handleSaveLimits = async () => {
    setSaveError(null);
    setSaveSuccess(false);

    const amountVal = amountInput.trim() === '' ? null : Number(amountInput.trim());
    const maxSpendVal = maxSpendInput.trim() === '' ? null : Number(maxSpendInput.trim());

    try {
      await saveOptionLimits(platformId, optionId, {
        amountPerTrade: amountVal,
        maxSpendPerDay: maxSpendVal,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save limits');
    }
  };

  const handleOpenMarkets = () => {
    closeOption();
    setActiveTab('markets');
  };

  const tick = latestTicks[selectedSymbol];
  const askVal = tick?.ask;
  const bidVal = tick?.bid;
  const spreadVal = askVal !== undefined && bidVal !== undefined ? askVal - bidVal : undefined;
  const change24h = tickers24h[selectedSymbol];

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* 1. Header */}
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          {platform.name}
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">{option.name}</h2>
          <SourceBadge feed={option.feed} />
        </div>
      </div>

      {/* 2. Chart card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
          Chart
        </span>

        {option.feed === 'binance' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Charts for the Binance feed are in Markets → Live Market.
            </p>
            <button
              onClick={handleOpenMarkets}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition"
            >
              Open Markets
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-200">No Cwallet chart yet</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              This chart will show Cwallet's own price data once Cwallet screen capture is connected (Android app, next build). MarketScope never draws a substitute chart from another source.
            </p>
            {option.chartTimeframes.length > 0 && (
              <p className="text-[11px] text-slate-500 pt-1">
                Cwallet chart timeframes: {option.chartTimeframes.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3. Readings card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
          Readings
        </span>

        {option.id === 'spot' && platform.id === 'binance' ? (
          <div className="space-y-3">
            {/* Symbol Chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {settings.trackedSymbols.map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition ${
                    sym === selectedSymbol
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {formatPair(sym)}
                </button>
              ))}
            </div>

            {/* Price readings rows */}
            <div className="divide-y divide-slate-800/60 text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">Buy</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {formatPrice(askVal)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">Sell</span>
                <span className="font-mono text-rose-400 font-semibold">
                  {formatPrice(bidVal)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">Spread</span>
                <span className="font-mono text-slate-300 font-medium">
                  {formatPrice(spreadVal)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">24h change</span>
                <div className="font-mono">
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
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="divide-y divide-slate-800/60 text-xs">
              {option.readings.map((reading) => (
                <div key={reading} className="flex items-center justify-between py-2">
                  <span className="text-slate-400">{reading}</span>
                  <span className="font-mono text-slate-500">—</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 pt-1">
              Values appear when Cwallet screen capture is connected (Android app, next build).
            </p>
          </div>
        )}
      </div>

      {/* 4. Your limits card (only when option.available) */}
      {option.available && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Your limits
          </span>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Amount per trade (USDT)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="e.g. 50"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Max spend per day (USDT)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={maxSpendInput}
                onChange={(e) => setMaxSpendInput(e.target.value)}
                placeholder="e.g. 200"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleSaveLimits}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition"
              >
                Save
              </button>

              <div>
                {saveError && <span className="text-rose-400 text-xs">{saveError}</span>}
                {saveSuccess && <span className="text-emerald-400 text-xs font-semibold">Saved</span>}
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Stored for paper trading and the auto-clicker in later builds. MarketScope only uses these saved values and never types an amount by itself.
            </p>
          </div>
        </div>
      )}

      {/* 5. Set on the platform itself card */}
      {option.platformControls.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Set on the platform itself
          </span>
          <div className="flex flex-wrap gap-1.5">
            {option.platformControls.map((ctrl) => (
              <span
                key={ctrl}
                className="text-[11px] px-2 py-1 rounded-lg bg-slate-800 text-slate-300"
              >
                {ctrl}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">MarketScope does not change these.</p>
        </div>
      )}

      {/* 6. Auto-clicker buttons card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
          Auto-clicker buttons
        </span>
        {option.buttons.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {option.buttons.map((btn) => (
              <span
                key={btn}
                className="text-[11px] px-2 py-1 rounded-lg bg-slate-800 text-slate-300"
              >
                {btn}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No buttons defined for this option yet.</p>
        )}
        <p className="text-[11px] text-slate-500">
          Buttons the auto-clicker will use for this option (setup comes in a later build).
        </p>
      </div>
    </div>
  );
};
