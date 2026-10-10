import React, { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../../state/store';
import { BinanceAdapter, type ScannerTicker } from '../../collector/exchangeAdapter';
import { MAX_TRACKED_SYMBOLS } from '../../data/repositories';
import { formatPrice, formatPercent } from '../../lib/formatters';
import { splitSymbol, formatPair, QUOTE_ASSETS } from '../../lib/symbols';
import {
  Search,
  X,
  Check,
  Plus,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  ArrowUpDown,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type SortField = 'quoteVolume' | 'priceChangePercent' | 'lastPrice' | 'symbol';
type SortDir = 'asc' | 'desc';

export const MarketScannerModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useAppStore();

  const [tickers, setTickers] = useState<ScannerTicker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedQuote, setSelectedQuote] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('quoteVolume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchTickers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const adapter = new BinanceAdapter();
      adapter.setHost(settings.dataSource);
      const data = await adapter.fetchAllTickers24h();
      const tradingSymbols = await adapter.fetchSymbols();
      const tradingSet = new Set(tradingSymbols);
      setTickers(data.filter((t) => tradingSet.has(t.symbol)));
    } catch (err: any) {
      setError(err.message || 'Failed to scan Binance tickers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTickers();
      setActionFeedback(null);
    }
  }, [isOpen, settings.dataSource]);

  const handleToggleTrack = async (sym: string) => {
    const isTracked = settings.trackedSymbols.includes(sym);
    if (isTracked) {
      if (settings.trackedSymbols.length <= 1) {
        setActionFeedback('At least one symbol must be tracked.');
        setTimeout(() => setActionFeedback(null), 2500);
        return;
      }
      const updated = settings.trackedSymbols.filter((s) => s !== sym);
      await updateSettings({ trackedSymbols: updated });
    } else {
      if (settings.trackedSymbols.length >= MAX_TRACKED_SYMBOLS) {
        setActionFeedback(`Limit reached (${MAX_TRACKED_SYMBOLS}). Remove a pair to add another.`);
        setTimeout(() => setActionFeedback(null), 3000);
        return;
      }
      const updated = [...settings.trackedSymbols, sym];
      await updateSettings({ trackedSymbols: updated });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filteredTickers = useMemo(() => {
    let result = tickers;

    // Filter by quote asset
    if (selectedQuote !== 'ALL') {
      result = result.filter((t) => {
        const { quote } = splitSymbol(t.symbol);
        return quote === selectedQuote;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      result = result.filter(
        (t) => t.symbol.toUpperCase().includes(q) || formatPair(t.symbol).toUpperCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'symbol') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return result.slice(0, 150); // limit to top 150 for fast rendering
  }, [tickers, selectedQuote, searchQuery, sortField, sortDir]);

  if (!isOpen) return null;

  const quoteTabs = ['ALL', ...QUOTE_ASSETS];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex flex-col justify-end sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full mx-auto z-10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 shrink-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" />
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white tracking-tight">Market Scanner</h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Binance {settings.dataSource.toUpperCase()} ·{' '}
                <span className="text-cyan-400 font-semibold font-mono">
                  {settings.trackedSymbols.length}/{MAX_TRACKED_SYMBOLS}
                </span>{' '}
                Tracked
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchTickers}
                disabled={isLoading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-50"
                title="Refresh Tickers"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Feedback banner */}
          {actionFeedback && (
            <div className="mt-2.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{actionFeedback}</span>
            </div>
          )}

          {/* Search bar */}
          <div className="relative mt-3">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search symbol (e.g. BTC, SOL, PEPE)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono uppercase"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quote Asset Filter Tabs */}
          <div className="flex gap-1 overflow-x-auto pt-3 pb-1 no-scrollbar text-xs">
            {quoteTabs.map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuote(q)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition shrink-0 ${
                  selectedQuote === q
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Sort Bar */}
        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800/60 grid grid-cols-12 text-[10px] font-semibold text-slate-400 uppercase tracking-wider items-center shrink-0">
          <div
            className="col-span-4 flex items-center gap-1 cursor-pointer hover:text-slate-200"
            onClick={() => handleSort('symbol')}
          >
            <span>Pair</span>
            <ArrowUpDown className="w-2.5 h-2.5" />
          </div>
          <div
            className="col-span-3 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-slate-200"
            onClick={() => handleSort('lastPrice')}
          >
            <span>Price</span>
            <ArrowUpDown className="w-2.5 h-2.5" />
          </div>
          <div
            className="col-span-3 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-slate-200"
            onClick={() => handleSort('priceChangePercent')}
          >
            <span>24h %</span>
            <ArrowUpDown className="w-2.5 h-2.5" />
          </div>
          <div className="col-span-2 text-right">Track</div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 p-1">
          {isLoading && tickers.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
              <span>Scanning Binance active markets...</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-xs space-y-2">
              <p className="text-rose-400">{error}</p>
              <button
                onClick={fetchTickers}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs hover:bg-slate-700"
              >
                Retry
              </button>
            </div>
          ) : filteredTickers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No trading pairs match your search or filter.
            </div>
          ) : (
            filteredTickers.map((t) => {
              const isTracked = settings.trackedSymbols.includes(t.symbol);
              const { base, quote } = splitSymbol(t.symbol);
              const isPositive = t.priceChangePercent >= 0;

              return (
                <div
                  key={t.symbol}
                  className="grid grid-cols-12 px-3 py-2.5 items-center hover:bg-slate-800/40 text-xs transition"
                >
                  {/* Pair Name */}
                  <div className="col-span-4 flex items-center gap-1.5 truncate">
                    <span className="font-bold text-white font-mono">{base}</span>
                    <span className="text-[10px] text-slate-500 font-mono">/{quote}</span>
                  </div>

                  {/* Price */}
                  <div className="col-span-3 text-right font-mono font-medium text-slate-200 tabular-nums">
                    {formatPrice(t.lastPrice)}
                  </div>

                  {/* 24h Change */}
                  <div className="col-span-3 text-right font-mono tabular-nums">
                    <span
                      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                        isPositive
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-rose-400 bg-rose-500/10'
                      }`}
                    >
                      {formatPercent(t.priceChangePercent)}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() => handleToggleTrack(t.symbol)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition ${
                        isTracked
                          ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40'
                          : 'bg-slate-800 text-slate-200 hover:bg-cyan-500 hover:text-slate-950 border border-slate-700'
                      }`}
                    >
                      {isTracked ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>On</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Track</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>
            Showing {filteredTickers.length} active pair{filteredTickers.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
