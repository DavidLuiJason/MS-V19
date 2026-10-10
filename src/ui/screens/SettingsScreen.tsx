import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../state/store';
import { BinanceAdapter } from '../../collector/exchangeAdapter';
import { MAX_TRACKED_SYMBOLS, getLongestHeartbeatGap } from '../../data/repositories';
import { MarketScannerModal } from '../components/MarketScannerModal';
import { isNativeApp, nativeBridge } from '../../native/nativeBridge';
import {
  ChevronRight,
  Plus,
  Trash2,
  X,
  BatteryCharging,
  AlertCircle,
  Check,
  Search,
} from 'lucide-react';

const validatorAdapter = new BinanceAdapter();

function formatGap(ms: number | null): string {
  if (ms === null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return `${sec} s`;
  }
  const min = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  if (min < 60) {
    return `${min} m ${remainingSec} s`;
  }
  const hr = Math.floor(min / 60);
  const remainingMin = min % 60;
  return `${hr} h ${remainingMin} m`;
}

export const SettingsScreen: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  const [showSymbolsSheet, setShowSymbolsSheet] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [isValidatingSymbol, setIsValidatingSymbol] = useState(false);

  const [showBatterySheet, setShowBatterySheet] = useState(false);

  const native = isNativeApp();
  const [batteryStatus, setBatteryStatus] = useState<boolean | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [gap1h, setGap1h] = useState<number | null>(null);
  const [gap24h, setGap24h] = useState<number | null>(null);

  const loadHealthGaps = async () => {
    try {
      const [h1, h24] = await Promise.all([
        getLongestHeartbeatGap(3600000),
        getLongestHeartbeatGap(86400000),
      ]);
      setGap1h(h1);
      setGap24h(h24);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadHealthGaps();
  }, []);

  useEffect(() => {
    if (!native) return;

    const checkBattery = async () => {
      try {
        const unrestricted = await nativeBridge.getBatteryStatus();
        setBatteryStatus(unrestricted);
      } catch {
        // ignore
      }
    };

    checkBattery();

    const handleVisibility = () => {
      if (!document.hidden) {
        checkBattery();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [native]);

  const handleAddSymbol = async () => {
    const sym = newSymbolInput.trim().toUpperCase();
    if (!sym) return;

    if (settings.trackedSymbols.length >= MAX_TRACKED_SYMBOLS) {
      setSymbolError('Limit reached (20). Remove a pair to add another.');
      return;
    }

    if (settings.trackedSymbols.includes(sym)) {
      setSymbolError(`${sym} is already being tracked`);
      return;
    }

    setIsValidatingSymbol(true);
    setSymbolError(null);

    try {
      validatorAdapter.setHost(settings.dataSource);
      const allValid = await validatorAdapter.fetchSymbols();
      if (!allValid.includes(sym)) {
        setSymbolError(`"${sym}" is not an active TRADING pair on Binance ${settings.dataSource.toUpperCase()}`);
        return;
      }

      const updated = [...settings.trackedSymbols, sym];
      await updateSettings({ trackedSymbols: updated });
      setNewSymbolInput('');
    } catch (err: any) {
      setSymbolError(err.message || 'Validation request failed. Please check connection.');
    } finally {
      setIsValidatingSymbol(false);
    }
  };

  const handleRemoveSymbol = async (sym: string) => {
    if (settings.trackedSymbols.length <= 1) {
      alert('You must keep at least one tracked symbol.');
      return;
    }
    const updated = settings.trackedSymbols.filter((s) => s !== sym);
    await updateSettings({ trackedSymbols: updated });
  };

  const handleUpdateLimit = async (field: 'maxStake' | 'dailyLossLimit', val: string) => {
    const num = Math.max(0, Number(val) || 0);
    const updated = {
      ...settings.safetyLimits,
      [field]: num,
    };
    await updateSettings({ safetyLimits: updated });
  };

  return (
    <div className="p-4 space-y-5 pb-20">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight mb-1">Settings</h2>
        <p className="text-xs text-slate-400">Data source, collection rules, and safety parameters</p>
      </div>

      {/* 1. Markets Section */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
          Markets
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl divide-y divide-slate-800/80 overflow-hidden shadow-lg text-xs">
          {/* Tracked Symbols */}
          <div
            onClick={() => setShowSymbolsSheet(true)}
            className="flex items-center justify-between p-4 hover:bg-slate-800/40 transition cursor-pointer"
          >
            <div>
              <div className="font-semibold text-white">Tracked Symbols</div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                {settings.trackedSymbols.join(', ')}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </div>

          {/* Data Source */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="font-semibold text-white">Data Source</div>
              <div className="text-slate-400 text-[11px] mt-0.5">Public REST & WebSocket feeds</div>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => updateSettings({ dataSource: 'global' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  settings.dataSource === 'global'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Global
              </button>
              <button
                onClick={() => updateSettings({ dataSource: 'us' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  settings.dataSource === 'us'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Binance.US
              </button>
            </div>
          </div>

          {/* Record Raw Ticks */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="font-semibold text-white">Record Raw Ticks</div>
              <div className="text-slate-400 text-[11px] mt-0.5">Store order book updates every 250ms</div>
            </div>
            <button
              onClick={() => updateSettings({ recordRawTicks: !settings.recordRawTicks })}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 ${
                settings.recordRawTicks ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Raw Tick Retention */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="font-semibold text-white">Raw Tick Retention</div>
              <div className="text-slate-400 text-[11px] mt-0.5">Roll older ticks into quote bars</div>
            </div>
            <div className="flex items-center gap-1">
              {[1, 3, 7, 14, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => updateSettings({ rawTickRetentionDays: days })}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono font-semibold transition ${
                    settings.rawTickRetentionDays === days
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Safety Limits Section (Numeric, Stored only) */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
          Safety Limits
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl divide-y divide-slate-800/80 overflow-hidden shadow-lg text-xs">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="font-semibold text-white">Max Stake</div>
              <div className="text-slate-400 text-[11px] mt-0.5">Maximum position size per trade</div>
            </div>
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 w-28">
              <span className="text-slate-400 font-mono text-xs">$</span>
              <input
                type="number"
                value={settings.safetyLimits.maxStake}
                onChange={(e) => handleUpdateLimit('maxStake', e.target.value)}
                className="bg-transparent text-white font-mono text-xs w-full focus:outline-none text-right"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4">
            <div>
              <div className="font-semibold text-white">Daily Loss Limit</div>
              <div className="text-slate-400 text-[11px] mt-0.5">Auto-pause upon reaching threshold</div>
            </div>
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 w-28">
              <span className="text-slate-400 font-mono text-xs">$</span>
              <input
                type="number"
                value={settings.safetyLimits.dailyLossLimit}
                onChange={(e) => handleUpdateLimit('dailyLossLimit', e.target.value)}
                className="bg-transparent text-white font-mono text-xs w-full focus:outline-none text-right"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Background Collection Section */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
          Background Collection
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg text-xs space-y-3">
          {native ? (
            <>
              {/* Keep collecting in background */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-white">Keep collecting in background</div>
                  <button
                    onClick={async () => {
                      setNotificationError(null);
                      if (!settings.backgroundService) {
                        const granted = await nativeBridge.requestNotificationPermission();
                        if (!granted) {
                          setNotificationError('Notification permission is required to keep collecting.');
                          return;
                        }
                        await updateSettings({ backgroundService: true });
                      } else {
                        await updateSettings({ backgroundService: false });
                      }
                    }}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 ${
                      settings.backgroundService ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                  </button>
                </div>
                {notificationError && (
                  <div className="text-rose-400 text-xs mt-1">{notificationError}</div>
                )}
              </div>

              {/* Set battery to Unrestricted */}
              <div
                onClick={() => nativeBridge.openBatterySettings()}
                className="flex items-center justify-between hover:bg-slate-800/40 p-1 -m-1 rounded-xl transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <BatteryCharging className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Set battery to Unrestricted</div>
                    {batteryStatus !== null && (
                      <div className="text-[11px] text-slate-400">
                        {batteryStatus
                          ? 'Currently: Unrestricted'
                          : 'Currently: Optimized (Android may stop collection)'}
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800/60">
                Keeps collecting with the screen off while this is on. Closing MarketScope from recent apps stops collection.
              </p>
            </>
          ) : (
            <>
              <div
                onClick={() => setShowBatterySheet(true)}
                className="flex items-center justify-between hover:bg-slate-800/40 p-1 -m-1 rounded-xl transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <BatteryCharging className="w-4 h-4" />
                  </div>
                  <div className="font-semibold text-white">Set battery to Unrestricted</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800/60">
                Keeps collecting reliably in the Android app (next build). In a browser, collection pauses when the page is frozen.
              </p>
            </>
          )}

          {/* Collection health */}
          <div className="border-t border-slate-800/60 pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Collection health</span>
              <button
                onClick={loadHealthGaps}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Longest silent period · last hour</span>
                <span className="font-mono text-slate-200">{formatGap(gap1h)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Longest silent period · last 24 hours</span>
                <span className="font-mono text-slate-200">{formatGap(gap24h)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Normal is about 5 seconds. Larger values mean collection stopped (screen off, app closed, or phone asleep).
            </p>
          </div>
        </div>
      </div>

      {/* Tracked Symbols Sheet */}
      {showSymbolsSheet && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end">
          <div className="absolute inset-0" onClick={() => setShowSymbolsSheet(false)} />
          <div className="relative bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 max-w-md mx-auto w-full z-10 shadow-2xl">
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Tracked Symbols</h3>
                <div className="text-xs text-slate-400">Validated against Binance exchange info</div>
              </div>
              <button
                onClick={() => setShowSymbolsSheet(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scan Market Button */}
            <button
              onClick={() => setShowScannerModal(true)}
              className="w-full mb-3 py-2 px-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-98"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Scan Binance Active Markets</span>
            </button>

            {/* Add symbol input */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="e.g. ADAUSDT, DOGEUSDT"
                value={newSymbolInput}
                onChange={(e) => {
                  setNewSymbolInput(e.target.value.toUpperCase());
                  setSymbolError(null);
                }}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono uppercase text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                onClick={handleAddSymbol}
                disabled={isValidatingSymbol || !newSymbolInput.trim()}
                className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                {isValidatingSymbol ? 'Checking...' : 'Add'}
              </button>
            </div>

            {symbolError && (
              <div className="mb-3 text-[11px] text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{symbolError}</span>
              </div>
            )}

            {/* List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pt-1">
              {settings.trackedSymbols.map((sym) => (
                <div
                  key={sym}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                >
                  <span className="font-bold text-slate-100 font-mono">{sym}</span>
                  <button
                    onClick={() => handleRemoveSymbol(sym)}
                    className="text-slate-400 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Android Battery Sheet */}
      {showBatterySheet && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end">
          <div className="absolute inset-0" onClick={() => setShowBatterySheet(false)} />
          <div className="relative bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 max-w-md mx-auto w-full z-10 shadow-2xl space-y-4">
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-2" />

            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Android Battery Optimization</h3>
              <button
                onClick={() => setShowBatterySheet(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                To ensure uninterrupted background data collection when the screen is locked:
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-slate-400">
                <li>Open Android <strong className="text-white">Settings</strong> &gt; <strong className="text-white">Apps</strong>.</li>
                <li>Locate and select <strong className="text-white">MarketScope</strong>.</li>
                <li>Tap <strong className="text-white">Battery</strong> or <strong className="text-white">App Battery Usage</strong>.</li>
                <li>Select <strong className="text-cyan-400">Unrestricted</strong> instead of Optimized.</li>
              </ol>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                In web browser mode, mobile operating systems suspend background tabs after several minutes of inactivity. The native companion app maintains persistent foreground service workers.
              </div>
            </div>

            <button
              onClick={() => setShowBatterySheet(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-semibold text-xs hover:bg-slate-700 transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <MarketScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
      />
    </div>
  );
};
