import React, { useState } from 'react';
import { useAppStore, type MainTab, type SubScreen } from '../../state/store';
import { Home, BarChart2, Shapes, TrendingUp, MoreHorizontal, ShieldAlert, Database, MousePointerClick, Settings, X } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, activeSubScreen, setActiveTab, openSubScreen } = useAppStore();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // If a subscreen from More is active, More remains highlighted!
  const isMoreActive = activeTab === 'more' || activeSubScreen !== null;

  const handleTabClick = (tab: MainTab) => {
    if (tab === 'more') {
      setShowMoreMenu(true);
    } else {
      setShowMoreMenu(false);
      setActiveTab(tab);
    }
  };

  const handleSelectMoreOption = (sub: SubScreen) => {
    setShowMoreMenu(false);
    setActiveTab('more');
    openSubScreen(sub);
  };

  return (
    <>
      <nav className="h-16 border-t border-slate-800 bg-slate-950/95 backdrop-blur-lg fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto grid grid-cols-5 items-center px-1">
        <button
          onClick={() => handleTabClick('home')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeTab === 'home' && !activeSubScreen ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">Home</span>
        </button>

        <button
          onClick={() => handleTabClick('markets')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeTab === 'markets' && !activeSubScreen ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">Markets</span>
        </button>

        <button
          onClick={() => handleTabClick('patterns')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeTab === 'patterns' && !activeSubScreen ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shapes className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">Patterns</span>
        </button>

        <button
          onClick={() => handleTabClick('trading')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeTab === 'trading' && !activeSubScreen ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">Trading</span>
        </button>

        <button
          onClick={() => handleTabClick('more')}
          className={`flex flex-col items-center justify-center h-full transition ${
            isMoreActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-medium tracking-tight">More</span>
        </button>
      </nav>

      {/* More Options Bottom Drawer */}
      {showMoreMenu && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div
            className="absolute inset-0"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="relative bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 max-w-md mx-auto w-full z-10 animate-in slide-in-from-bottom duration-200 shadow-2xl">
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">More Options</h3>
              <button
                onClick={() => setShowMoreMenu(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleSelectMoreOption('reliability')}
                className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-800/80 active:scale-[0.99] transition text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Reliability Report</div>
                  <div className="text-xs text-slate-400">Performance metrics and baseline analysis</div>
                </div>
              </button>

              <button
                onClick={() => handleSelectMoreOption('data_storage')}
                className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-800/80 active:scale-[0.99] transition text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Data & Storage</div>
                  <div className="text-xs text-slate-400">Health, gaps repair, export and import</div>
                </div>
              </button>

              <button
                onClick={() => handleSelectMoreOption('auto_clicker')}
                className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-800/80 active:scale-[0.99] transition text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <MousePointerClick className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Auto-Clicker Setup</div>
                  <div className="text-xs text-slate-400">Marker coordinates, profiles, safety limits</div>
                </div>
              </button>

              <button
                onClick={() => handleSelectMoreOption('settings')}
                className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-800/80 active:scale-[0.99] transition text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-300">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Settings</div>
                  <div className="text-xs text-slate-400">Feeds, trade types, retention, safety</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
