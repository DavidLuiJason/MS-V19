import React, { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, HelpCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { db, type PredictionRecord } from '../../data/db';
import { getPredictionStats, getRecentPredictions, type PredictionStatsResult, type PredictionStatsGroup } from '../../data/predictions';
import { getSetting, setSetting } from '../../data/repositories';
import { ArenaCard } from '../components/ArenaCard';
import { SecondsDataCard } from '../components/SecondsDataCard';
import { SecondsLabCard } from '../components/SecondsLabCard';
import { SecondsExportCard } from '../components/SecondsExportCard';
import { EvidenceSummaryCard } from '../components/EvidenceSummaryCard';
import { OfflineReplayCard } from '../components/OfflineReplayCard';
import { PatternMinerCard } from '../components/PatternMinerCard';
import { SectionTabs } from '../components/SectionTabs';
import { InfoToggle } from '../components/InfoToggle';
import { ResearchOverview } from '../components/ResearchOverview';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

export const ReliabilityReportScreen: React.FC = () => {
  const { settings } = useAppStore();

  const [tab, setTab] = useState<string>('overview');
  const [enabled, setEnabled] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(['5m', '15m']);

  const [stats, setStats] = useState<PredictionStatsResult | null>(null);
  const [recent, setRecent] = useState<PredictionRecord[]>([]);
  const shownRef = useRef(5);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function loadConfig() {
      const en = await getSetting<boolean>('predLabEnabled', false);
      const defaultSyms = settings.trackedSymbols.slice(0, 3);
      const syms = await getSetting<string[]>('predLabSymbols', defaultSyms.length > 0 ? defaultSyms : ['BTCUSDT']);
      const tfs = await getSetting<string[]>('predLabTimeframes', ['5m', '15m']);
      setEnabled(en);
      setSelectedSymbols(syms);
      setSelectedTimeframes(tfs);
    }
    loadConfig();
  }, [settings.trackedSymbols]);

  const loadData = async () => {
    try {
      const s = await getPredictionStats();
      const r = await getRecentPredictions(shownRef.current);
      setTotalCount(await db.predictions.count());
      setStats(s);
      setRecent(r);
    } catch {
      // ignore errors
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await setSetting('predLabEnabled', next);
  };

  const handleToggleSymbol = async (sym: string) => {
    const next = selectedSymbols.includes(sym)
      ? selectedSymbols.filter((s) => s !== sym)
      : [...selectedSymbols, sym];
    setSelectedSymbols(next);
    await setSetting('predLabSymbols', next);
  };

  const handleToggleTimeframe = async (tf: string) => {
    const next = selectedTimeframes.includes(tf)
      ? selectedTimeframes.filter((t) => t !== tf)
      : [...selectedTimeframes, tf];
    setSelectedTimeframes(next);
    await setSetting('predLabTimeframes', next);
  };

  const overall = stats?.overall;
  const winPctLabel = overall && overall.winRate !== null ? `${(overall.winRate * 100).toFixed(1)}%` : '—';
  const gaugeDash = overall && overall.winRate !== null ? `${Math.round(overall.winRate * 100)}, 100` : '0, 100';
  const gaugeLabel = overall && overall.winRate !== null ? `${Math.round(overall.winRate * 100)}%` : '—';
  const sampleCount = overall ? overall.samples : 0;

  const gainText = overall && overall.avgGainPct !== null ? `+${Math.abs(overall.avgGainPct).toFixed(2)}%` : '—';
  const lossText = overall && overall.avgLossPct !== null ? `-${Math.abs(overall.avgLossPct).toFixed(2)}%` : '—';
  const confidenceText =
    overall && overall.wilsonLow !== null && overall.wilsonHigh !== null
      ? `${(overall.wilsonLow * 100).toFixed(1)}% - ${(overall.wilsonHigh * 100).toFixed(1)}%`
      : '—';

  const costLine =
    overall && overall.costWinRate !== null && overall.costAvgResultPct !== null
      ? `After buy/sell spread: win rate ${(overall.costWinRate * 100).toFixed(1)}% (${overall.costSamples} samples), average ${overall.costAvgResultPct >= 0 ? '+' : ''}${overall.costAvgResultPct.toFixed(2)}%`
      : 'After buy/sell spread: —';

  const liveWinText =
    overall?.byMode?.live?.winRate !== null && overall?.byMode?.live?.winRate !== undefined
      ? `${(overall.byMode.live.winRate * 100).toFixed(1)}%`
      : '—';
  const catchupWinText =
    overall?.byMode?.catchup?.winRate !== null && overall?.byMode?.catchup?.winRate !== undefined
      ? `${(overall.byMode.catchup.winRate * 100).toFixed(1)}%`
      : '—';
  const liveSamples = overall ? overall.byMode.live.samples : '—';
  const catchupSamples = overall ? overall.byMode.catchup.samples : '—';

  const modeLine = `Live: ${liveSamples} · win ${liveWinText}   |   Catch-up: ${catchupSamples} · win ${catchupWinText}`;

  const totalPredictions =
    (overall?.samples ?? 0) + (overall?.open ?? 0) + (overall?.ties ?? 0) + (overall?.expired ?? 0);

  const renderSourceRow = (name: string, group?: PredictionStatsGroup) => {
    if (!group) return null;
    const wr = group.winRate !== null ? `${(group.winRate * 100).toFixed(1)}%` : '—';
    const base = group.avgBaseline !== null ? `${(group.avgBaseline * 100).toFixed(1)}%` : '—';
    const edge =
      group.edgePoints !== null
        ? `${group.edgePoints >= 0 ? '+' : ''}${group.edgePoints.toFixed(1)} pts`
        : '—';

    let verdictClass = 'bg-slate-800 text-slate-400 border border-slate-700';
    if (group.verdict === 'Beats random') {
      verdictClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    } else if (group.verdict === 'Worse than random') {
      verdictClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
    }

    return (
      <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">{name}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${verdictClass}`}>
            {group.verdict}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs font-mono">
          <div>
            <div className="text-[10px] text-slate-500 font-sans">Samples</div>
            <div className="text-slate-200 font-bold">{group.samples}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-sans">Win Rate</div>
            <div className="text-slate-200 font-bold">{wr}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-sans">Baseline</div>
            <div className="text-slate-400">{base}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-sans">Edge</div>
            <div className={group.edgePoints !== null && group.edgePoints >= 0 ? 'text-emerald-400' : 'text-slate-400'}>
              {edge}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-900">
          Open: {group.open} · Not counted (ties/expired): {group.ties + group.expired}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4 pb-20">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight mb-1">Research Lab</h2>
        <p className="text-xs text-slate-400">Tests whether any method beats break-even. Pick a section below.</p>
      </div>

      <SectionTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'live', label: 'Live bets' },
          { id: 'seconds', label: 'Seconds' },
          { id: 'replay', label: 'Replay' },
          { id: 'miner', label: 'Miner' },
          { id: 'evidence', label: 'Evidence' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && <ResearchOverview onOpenTab={setTab} />}

      <div hidden={tab !== 'live'} className="space-y-4">
        {/* Prediction Lab Configuration Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Prediction Lab</h3>
            <p className="text-[11px] text-slate-400">Automated signal testing and verification</p>
          </div>
          <button
            onClick={handleToggleEnabled}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
              enabled
                ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800/60 border-slate-800 text-slate-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
            {enabled ? 'Active (ON)' : 'Disabled (OFF)'}
          </button>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 mb-1.5 font-medium">Coins</div>
          <div className="flex flex-wrap gap-2">
            {settings.trackedSymbols.map((sym) => {
              const selected = selectedSymbols.includes(sym);
              return (
                <button
                  key={sym}
                  onClick={() => handleToggleSymbol(sym)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                    selected
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
                      : 'bg-slate-800/60 border-slate-800 text-slate-400'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 mb-1.5 font-medium">Timeframes</div>
          <div className="flex flex-wrap gap-2">
            {TIMEFRAMES.map((tf) => {
              const selected = selectedTimeframes.includes(tf);
              return (
                <button
                  key={tf}
                  onClick={() => handleToggleTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                    selected
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
                      : 'bg-slate-800/60 border-slate-800 text-slate-400'
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
          Predictions only. No trades are made. Results are judged by candle closes.
        </div>
      </div>

      {/* Top Stat Cards & Circular Progress */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium mb-1">Win Rate</div>
            <div className="text-3xl font-extrabold text-white font-mono">{winPctLabel}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Sample size: {sampleCount}</div>
          </div>

          {/* Circular Gauge */}
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-cyan-500"
                strokeDasharray={gaugeDash}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-xs font-mono font-bold text-slate-400">{gaugeLabel}</span>
          </div>
        </div>

        {/* Exception (b): Screen 7: Average Gain shows only the average gain value, and a second stat "Average Loss" sits beside it */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/60">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Average Gain
            </div>
            <div className="text-base font-bold text-emerald-400 font-mono">{gainText}</div>
          </div>

          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/60">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              Average Loss
            </div>
            <div className="text-base font-bold text-rose-400 font-mono">{lossText}</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-1 px-1">
          <span className="text-slate-400">Confidence Range</span>
          <span className="text-slate-300 font-mono font-medium">{confidenceText}</span>
        </div>

        <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px] text-slate-400">
          <div>{costLine}</div>
          <div>{modeLine}</div>
        </div>
      </div>

      {/* Results vs Random Baseline Section */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider px-1">
          Results vs Random Baseline
        </div>

        {totalPredictions === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
            <h4 className="text-sm font-semibold text-slate-300 mb-0.5">No predictions yet</h4>
            <p className="text-xs text-slate-500">No predictions yet. Turn the Prediction Lab on.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {renderSourceRow('Look-alike', stats?.lookalike)}
            {renderSourceRow('Discovery', stats?.discovery)}
          </div>
        )}
      </div>

      {/* Latest Predictions List */}
      {recent.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider px-1">
            Latest predictions
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 shadow-xl divide-y divide-slate-800/80 space-y-2">
            {recent.map((pred) => {
              const isUp = pred.direction === 'up';
              const statusCls =
                pred.status === 'won'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : pred.status === 'lost'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : pred.status === 'open'
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700';

              const resText =
                pred.resultPct !== undefined
                  ? `${pred.resultPct >= 0 ? '+' : ''}${pred.resultPct.toFixed(2)}%`
                  : null;

              return (
                <div key={pred.id} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {isUp ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                    </span>
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{pred.sym}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{pred.tf}</span>
                        <span className="text-[10px] text-slate-500 capitalize">({pred.source})</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {new Date(pred.t).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {resText && (
                      <span
                        className={`font-mono font-bold text-xs ${
                          pred.resultPct && pred.resultPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {resText}
                      </span>
                    )}
                    {pred.mode === 'catchup' && (
                      <span className="text-[10px] text-slate-400 font-medium">catch-up</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusCls}`}>
                      {pred.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-500 text-center mt-2">Showing {recent.length} of {totalCount} predictions</div>
          {recent.length < totalCount && (
            <button
              onClick={() => {
                shownRef.current += 5;
                loadData();
              }}
              className="w-full mt-2 py-2.5 rounded-xl border border-slate-800 bg-slate-800/60 text-xs font-bold text-slate-300"
            >
              Show 5 more
            </button>
          )}
        </div>
      )}

      {/* Info Callout */}
      <div className="px-1">
        <InfoToggle>
          Baseline comparisons calculate whether pattern win rates outperform a binomial random entry distribution at 95% confidence intervals.
        </InfoToggle>
      </div>

      <ArenaCard />
      </div>

      <div hidden={tab !== 'seconds'} className="space-y-4">
        <SecondsDataCard />
        <SecondsLabCard />
        <SecondsExportCard />
      </div>

      <div hidden={tab !== 'replay'} className="space-y-4">
        <OfflineReplayCard />
      </div>

      <div hidden={tab !== 'miner'} className="space-y-4">
        <PatternMinerCard />
      </div>

      <div hidden={tab !== 'evidence'} className="space-y-4">
        <EvidenceSummaryCard />
      </div>
    </div>
  );
};
