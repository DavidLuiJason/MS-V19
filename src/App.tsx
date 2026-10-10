import React, { useEffect, useState } from 'react';
import { useAppStore } from './state/store';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { TopBar } from './ui/components/TopBar';
import { BottomNav } from './ui/components/BottomNav';

import { HomeScreen } from './ui/screens/HomeScreen';
import { MarketsScreen } from './ui/screens/MarketsScreen';
import { LiveMarketScreen } from './ui/screens/LiveMarketScreen';
import { PatternsScreen } from './ui/screens/PatternsScreen';
import { PatternDetailScreen } from './ui/screens/PatternDetailScreen';
import { TradingScreen } from './ui/screens/TradingScreen';
import { ReliabilityReportScreen } from './ui/screens/ReliabilityReportScreen';
import { DataStorageScreen } from './ui/screens/DataStorageScreen';
import { AutoClickerScreen } from './ui/screens/AutoClickerScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { TradeOptionScreen } from './ui/screens/TradeOptionScreen';
import { getPlatform, getOption } from './data/platformCatalog';
import { isNativeApp, nativeBridge } from './native/nativeBridge';
import { logError } from './data/repositories';
import { startPredictionRunner } from './lib/predictionRunner';

export default function App() {
  const {
    activeTab,
    activeSubScreen,
    closeSubScreen,
    openSubScreen,
    openTradeOption,
    closeOption,
    setSelectedSymbol,
    initSettings,
    settingsLoaded,
    settings,
  } = useAppStore();

  const [inLiveMarketView, setInLiveMarketView] = useState(false);

  useEffect(() => {
    initSettings();
  }, []);

  useEffect(() => {
    return startPredictionRunner();
  }, []);

  useEffect(() => {
    if (!settingsLoaded || !isNativeApp()) return;
    if (!settings.backgroundService) {
      nativeBridge.stopService().catch(() => {});
      return;
    }
    const label = () => useAppStore.getState().collectorLabel + ' · ' + new Date().toLocaleTimeString();
    nativeBridge.startService(label()).catch((e) => logError('App', 'startService failed: ' + String(e)));
    const id = setInterval(() => {
      nativeBridge.updateService(label()).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [settingsLoaded, settings.backgroundService]);

  const handleSelectSymbolFromMarkets = (sym: string) => {
    setSelectedSymbol(sym);
    setInLiveMarketView(true);
  };

  const getScreenTitle = () => {
    if (activeSubScreen === 'reliability') return 'Reliability Report';
    if (activeSubScreen === 'data_storage') return 'Data & Storage';
    if (activeSubScreen === 'auto_clicker') return 'Auto-Clicker Setup';
    if (activeSubScreen === 'settings') return 'Settings';
    if (activeSubScreen === 'pattern_detail') return 'Pattern Detail';

    if (activeTab === 'markets' && inLiveMarketView) return 'Live Market';
    if (activeTab === 'trading' && openTradeOption) {
      const platform = getPlatform(openTradeOption.platformId);
      const option = getOption(openTradeOption.platformId, openTradeOption.optionId);
      if (platform && option) {
        return `${platform.name} · ${option.name}`;
      }
    }
    return 'MarketScope';
  };

  const showBackButton =
    activeSubScreen !== null ||
    (activeTab === 'markets' && inLiveMarketView) ||
    (activeTab === 'trading' && openTradeOption !== null);

  const handleBack = () => {
    if (activeSubScreen !== null) {
      closeSubScreen();
    } else if (activeTab === 'markets' && inLiveMarketView) {
      setInLiveMarketView(false);
    } else if (activeTab === 'trading' && openTradeOption !== null) {
      closeOption();
    }
  };

  if (!settingsLoaded) {
    return (
      <div className="h-dvh w-full bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>Starting MarketScope...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans select-none antialiased">
      {/* Fixed Top Bar */}
      <TopBar
        title={getScreenTitle()}
        showBack={showBackButton}
        onBack={handleBack}
      />

      {/* Main Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto w-full max-w-md mx-auto relative bg-slate-950">
        {activeSubScreen === 'reliability' ? (
          <ErrorBoundary screenName="Reliability Report">
            <ReliabilityReportScreen />
          </ErrorBoundary>
        ) : activeSubScreen === 'data_storage' ? (
          <ErrorBoundary screenName="Data & Storage">
            <DataStorageScreen />
          </ErrorBoundary>
        ) : activeSubScreen === 'auto_clicker' ? (
          <ErrorBoundary screenName="Auto-Clicker Setup">
            <AutoClickerScreen />
          </ErrorBoundary>
        ) : activeSubScreen === 'settings' ? (
          <ErrorBoundary screenName="Settings">
            <SettingsScreen />
          </ErrorBoundary>
        ) : activeSubScreen === 'pattern_detail' ? (
          <ErrorBoundary screenName="Pattern Detail">
            <PatternDetailScreen onBack={closeSubScreen} />
          </ErrorBoundary>
        ) : activeTab === 'home' ? (
          <ErrorBoundary screenName="Home">
            <HomeScreen />
          </ErrorBoundary>
        ) : activeTab === 'markets' ? (
          inLiveMarketView ? (
            <ErrorBoundary screenName="Live Market">
              <LiveMarketScreen onBack={() => setInLiveMarketView(false)} />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary screenName="Markets">
              <MarketsScreen onSelectSymbol={handleSelectSymbolFromMarkets} />
            </ErrorBoundary>
          )
        ) : activeTab === 'patterns' ? (
          <ErrorBoundary screenName="Patterns">
            <PatternsScreen onSelectPattern={() => openSubScreen('pattern_detail')} />
          </ErrorBoundary>
        ) : activeTab === 'trading' ? (
          openTradeOption !== null ? (
            <ErrorBoundary screenName="Trade Option">
              <TradeOptionScreen />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary screenName="Trading">
              <TradingScreen />
            </ErrorBoundary>
          )
        ) : (
          <ErrorBoundary screenName="Home">
            <HomeScreen />
          </ErrorBoundary>
        )}
      </main>

      {/* Fixed Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
