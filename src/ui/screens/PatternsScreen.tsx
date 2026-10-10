import React, { useEffect, useMemo, useState } from 'react';
import Dexie from 'dexie';
import { Shapes, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { db } from '../../data/db';
import {
  PATTERN_DEFINITIONS,
  PATTERN_HORIZONS,
  MIN_PATTERN_SAMPLES,
  studyPatterns,
  getEventOutcome,
  type PatternCandle,
  type PatternStudy,
} from '../../engine/patterns';
import { discoverWords, WORD_LENGTHS, type DiscoveryResult } from '../../engine/discovery';
import {
  lookalikeNow,
  lookalikeBacktest,
  LOOKALIKE_WINDOW,
  LOOKALIKE_NEIGHBORS,
  type LookalikeNow,
  type LookalikeBacktest,
} from '../../engine/lookalike';

interface Props {
  onSelectPattern?: (patternId: string) => void;
}

type Mode = 'rules' | 'discover' | 'lookalike';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const MAX_STUDY_CANDLES = 50000;
const MIN_CANDLES_TO_STUDY = 500;

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const signed = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';

const LETTER_STYLE: Record<string, string> = {
  D: 'bg-rose-500/30 text-rose-200 border-rose-500/50',
  d: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  n: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
  u: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  U: 'bg-emerald-500/30 text-emerald-200 border-emerald-500/50',
};

const FAMILY_LABEL: Record<string, string> = {
  classic: 'Classic',
  new: 'New',
  original: 'Original',
};

export const PatternsScreen: React.FC<Props> = () => {
  const { patternFilter, setPatternFilter, settings, gapsVersion } = useAppStore();

  const [mode, setMode] = useState<Mode>('rules');
  const [symbolChoice, setSymbolChoice] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [horizon, setHorizon] = useState(5);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [candles, setCandles] = useState<PatternCandle[]>([]);
  const [loading, setLoading] = useState(true);

  const [study, setStudy] = useState<PatternStudy | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [lookalike, setLookalike] = useState<LookalikeNow | null>(null);
  const [backtest, setBacktest] = useState<LookalikeBacktest | null>(null);
  const [lookalikeBusy, setLookalikeBusy] = useState(false);
  const [lookalikeDone, setLookalikeDone] = useState(false);

  const symbol: string = settings.trackedSymbols.includes(symbolChoice)
    ? symbolChoice
    : settings.trackedSymbols[0] || '';

  // Load the newest saved closed candles for the chosen coin and timeframe.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!symbol) {
        setCandles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const rows = await db.candles
          .where('[src+sym+tf+t]')
          .between(['binance', symbol, timeframe, Dexie.minKey], ['binance', symbol, timeframe, Dexie.maxKey])
          .reverse()
          .limit(MAX_STUDY_CANDLES)
          .toArray();
        if (cancelled) return;
        const list: PatternCandle[] = rows
          .reverse()
          .filter((r) => r.closed)
          .map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }));
        setCandles(list);
      } catch {
        if (!cancelled) setCandles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, gapsVersion]);

  const enoughData = candles.length >= MIN_CANDLES_TO_STUDY;

  // Reset results whenever the data changes.
  useEffect(() => {
    setStudy(null);
    setDiscovery(null);
    setLookalike(null);
    setBacktest(null);
    setLookalikeDone(false);
  }, [candles]);

  // Rules study runs by itself (shortly after the screen paints so it does not freeze the phone).
  useEffect(() => {
    if (mode !== 'rules' || !enoughData) return;
    const timer = setTimeout(() => {
      setStudy(studyPatterns(candles));
    }, 30);
    return () => clearTimeout(timer);
  }, [mode, candles, enoughData]);

  const runDiscovery = () => {
    setDiscovering(true);
    setTimeout(() => {
      setDiscovery(discoverWords(candles));
      setDiscovering(false);
    }, 30);
  };

  const runLookalike = () => {
    setLookalikeBusy(true);
    setLookalikeDone(false);
    setBacktest(null);
    setTimeout(async () => {
      setLookalike(lookalikeNow(candles));
      const bt = await lookalikeBacktest(candles, horizon);
      setBacktest(bt);
      setLookalikeBusy(false);
      setLookalikeDone(true);
    }, 30);
  };

  const filterTabs: Array<{ id: 'all' | 'wins' | 'losses' | 'pending'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'wins', label: 'Wins' },
    { id: 'losses', label: 'Losses' },
    { id: 'pending', label: 'Pending' },
  ];

  const ruleRows = useMemo(() => {
    if (!study) return [];
    return PATTERN_DEFINITIONS.map((def) => ({
      def,
      stat: study.stats.find((s) => s.patternId === def.id && s.horizon === horizon),
    }))
      .filter((r) => r.stat !== undefined)
      .filter((r) => {
        const verdict = r.stat!.verdict;
        if (patternFilter === 'wins') return verdict === 'holds';
        if (patternFilter === 'losses') return verdict === 'broke' || verdict === 'fails';
        if (patternFilter === 'pending') return verdict === 'unclear';
        return true;
      })
      .sort((a, b) => {
        const rank = (v: string) => (v === 'holds' ? 0 : v === 'broke' ? 1 : v === 'unclear' ? 2 : 3);
        const diff = rank(a.stat!.verdict) - rank(b.stat!.verdict);
        if (diff !== 0) return diff;
        return b.stat!.edgePoints - a.stat!.edgePoints;
      });
  }, [study, horizon, patternFilter]);

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
      active
        ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
        : 'bg-slate-800/60 border-slate-800 text-slate-400'
    }`;

  const verdictLabel = (v: string) =>
    v === 'holds'
      ? { text: 'Holds up', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
      : v === 'broke'
        ? { text: 'Broke on new data', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' }
        : v === 'fails'
          ? { text: 'Worse than random', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30' }
          : { text: 'Not proven', cls: 'bg-slate-700/40 text-slate-400 border-slate-600/50' };

  return (
    <div className="p-4 space-y-4 pb-20">
      <div>
        {/* Exception (a): Screen 4's title must read "Patterns" */}
        <h2 className="text-xl font-bold text-white tracking-tight mb-1">Patterns</h2>
        <p className="text-xs text-slate-400">Automated technical pattern detection and evaluation</p>
      </div>

      {/* Mode switch */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
        {([
          { id: 'rules', label: 'Rules' },
          { id: 'discover', label: 'Discover' },
          { id: 'lookalike', label: 'Look-alike' },
        ] as Array<{ id: Mode; label: string }>).map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
              mode === m.id ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Study settings */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 space-y-3">
        <div>
          <div className="text-[11px] text-slate-400 mb-1.5">Coin</div>
          <div className="flex flex-wrap gap-2">
            {settings.trackedSymbols.map((sym: string) => (
              <button key={sym} onClick={() => setSymbolChoice(sym)} className={chip(sym === symbol)}>
                {sym}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400 mb-1.5">Timeframe</div>
          <div className="flex flex-wrap gap-2">
            {TIMEFRAMES.map((tf) => (
              <button key={tf} onClick={() => setTimeframe(tf)} className={chip(tf === timeframe)}>
                {tf}
              </button>
            ))}
          </div>
        </div>
        {mode !== 'discover' && (
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">Look ahead (candles after the signal)</div>
            <div className="flex flex-wrap gap-2">
              {PATTERN_HORIZONS.map((h) => (
                <button key={h} onClick={() => setHorizon(h)} className={chip(h === horizon)}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="text-[11px] font-mono text-slate-400">
          {loading
            ? 'Loading saved candles...'
            : `Based on ${candles.length.toLocaleString()} saved candles` +
              (candles.length > 0
                ? ` (${new Date(candles[0].t).toLocaleDateString()} to ${new Date(
                    candles[candles.length - 1].t
                  ).toLocaleDateString()})`
                : '')}
        </div>
      </div>

      {!loading && !enoughData && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 text-center flex flex-col items-center justify-center my-6">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3">
            <Shapes className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">Not enough saved candles</h3>
          <p className="text-xs text-slate-400 max-w-xs">
            You have {candles.length.toLocaleString()} closed {timeframe} candles for {symbol || 'this coin'}. At least{' '}
            {MIN_CANDLES_TO_STUDY} are needed. Go to More, then Data &amp; Storage, then Download Past Charts.
          </p>
        </div>
      )}

      {/* ===================== RULES ===================== */}
      {mode === 'rules' && enoughData && (
        <>
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPatternFilter(tab.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                  patternFilter === tab.id
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 -mt-2 px-1">
            Wins = held up on data it never saw · Losses = broke on new data or worse than random · Pending = not proven yet
          </div>

          {!study ? (
            <div className="text-xs text-slate-400 text-center py-8">Analyzing {candles.length.toLocaleString()} candles...</div>
          ) : (
            <div className="space-y-2">
              {ruleRows.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-6">No patterns in this group.</div>
              )}
              {ruleRows.map(({ def, stat }) => {
                const s = stat!;
                const open = expandedId === def.id;
                const vl = verdictLabel(s.verdict);
                const recent = study.events.filter((e) => e.patternId === def.id).slice(-5).reverse();
                return (
                  <div key={def.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedId(open ? null : def.id)}
                      className="w-full p-3.5 flex items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{def.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              def.direction === 'bullish'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {def.direction === 'bullish' ? 'Up signal' : 'Down signal'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${vl.cls}`}>
                            {vl.text}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] border border-slate-700 text-slate-400">
                            {FAMILY_LABEL[def.family]}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-bold font-mono text-white">
                            {s.samples > 0 ? pct(s.winRate) : '—'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">{s.samples.toLocaleString()} samples</div>
                        </div>
                        {open ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {open && (
                      <div className="px-3.5 pb-3.5 space-y-3 border-t border-slate-800/80 pt-3">
                        <p className="text-xs text-slate-400">{def.description}</p>

                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 text-[11px] font-mono text-slate-300 space-y-1">
                          <div>
                            All data: {s.samples > 0 ? pct(s.winRate) : '—'} won, random is {pct(s.baselineWinRate)} (
                            {s.edgePoints >= 0 ? '+' : ''}
                            {s.edgePoints.toFixed(1)} pts)
                          </div>
                          <div>
                            First 70% (training): {s.trainSamples > 0 ? pct(s.trainWinRate) : '—'} vs random{' '}
                            {pct(s.trainBaseline)} · {s.trainSamples.toLocaleString()} samples
                          </div>
                          <div>
                            Last 30% (unseen): {s.testSamples > 0 ? pct(s.testWinRate) : '—'} vs random{' '}
                            {pct(s.testBaseline)} · {s.testSamples.toLocaleString()} samples
                          </div>
                        </div>

                        <div className="text-xs">
                          <div className="grid grid-cols-5 gap-1 text-[10px] text-slate-500 pb-1">
                            <div>Ahead</div>
                            <div className="text-right">Samples</div>
                            <div className="text-right">Win rate</div>
                            <div className="text-right">Avg win</div>
                            <div className="text-right">Avg loss</div>
                          </div>
                          {study.stats
                            .filter((x) => x.patternId === def.id)
                            .map((x) => (
                              <div key={x.horizon} className="grid grid-cols-5 gap-1 py-1 font-mono text-slate-300">
                                <div>{x.horizon}</div>
                                <div className="text-right">{x.samples.toLocaleString()}</div>
                                <div className="text-right">{x.samples > 0 ? pct(x.winRate) : '—'}</div>
                                <div className="text-right text-emerald-400">
                                  {x.wins > 0 ? signed(x.avgGainPct) : '—'}
                                </div>
                                <div className="text-right text-rose-400">
                                  {x.samples - x.wins > 0 ? signed(x.avgLossPct) : '—'}
                                </div>
                              </div>
                            ))}
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">Latest times this pattern appeared</div>
                          {recent.length === 0 ? (
                            <div className="text-xs text-slate-500">None found in the saved candles.</div>
                          ) : (
                            recent.map((e) => {
                              const out = getEventOutcome(candles, e, horizon, def.direction);
                              return (
                                <div key={e.index} className="flex items-center justify-between py-1 text-xs font-mono">
                                  <span className="text-slate-400">{new Date(e.t).toLocaleString()}</span>
                                  <span className="text-slate-300">
                                    {e.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                                  </span>
                                  <span
                                    className={
                                      out === null ? 'text-slate-500' : out > 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }
                                  >
                                    {out === null ? 'waiting' : signed(out)}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3.5 text-[11px] text-slate-400 space-y-1.5">
            <div>
              What this means: a pattern is a recurring situation on the chart. The question is whether, after it appears,
              price moves the way the pattern claims more often than plain chance. The first 70% of your candles is used to
              find a tendency, and the last 30% is data it has never seen. "Holds up" means it beat chance on both. Only
              those are worth testing further with paper money.
            </div>
            <div>
              Entry is at the close of the signal candle, only closed candles are used, and fees are not included. With
              {' '}{PATTERN_DEFINITIONS.length} patterns and 4 look-ahead settings, a few can look good by luck, so check the
              same pattern on other coins and timeframes. Most patterns will honestly show "Not proven".
            </div>
          </div>
        </>
      )}

      {/* ===================== DISCOVER ===================== */}
      {mode === 'discover' && enoughData && (
        <>
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 space-y-3">
            <div className="text-sm font-bold text-white">Auto-discovery</div>
            <p className="text-xs text-slate-400">
              Instead of me choosing patterns, the app turns every candle into a letter and tests every {WORD_LENGTHS[0]}- and{' '}
              {WORD_LENGTHS[1]}-candle sequence by itself. A sequence is kept only if it beats chance on the first 70% of
              your candles with a very strict test, and then still beats chance on the last 30%.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(['D', 'd', 'n', 'u', 'U'] as const).map((ch) => (
                <span key={ch} className={`px-2 py-1 rounded-lg border text-[10px] font-mono ${LETTER_STYLE[ch]}`}>
                  {ch} = {ch === 'D' ? 'big red' : ch === 'd' ? 'small red' : ch === 'n' ? 'tiny' : ch === 'u' ? 'small green' : 'big green'}
                </span>
              ))}
            </div>
            <button
              onClick={runDiscovery}
              disabled={discovering}
              className="w-full py-3 rounded-2xl bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 active:scale-95 transition disabled:opacity-40"
            >
              {discovering ? 'Searching...' : discovery ? 'Search again' : 'Start discovery'}
            </button>
          </div>

          {discovery && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-400 px-1">
                Tested {discovery.testedCombos.toLocaleString()} combinations. {discovery.passed.length} passed both tests.
                About {discovery.luckyExpected.toFixed(2)} would pass by pure luck.
              </div>
              {discovery.passed.length === 0 && (
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400">
                  Nothing passed. That is a real result: on this coin and timeframe, no short candle sequence predicted price
                  on data it had not seen. Try another coin or timeframe, or download more history.
                </div>
              )}
              {discovery.passed.map((d) => (
                <div key={d.word + d.horizon + d.direction} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      {d.word.split('').map((ch, idx) => (
                        <span key={idx} className={`w-6 h-6 flex items-center justify-center rounded-md border text-xs font-mono font-bold ${LETTER_STYLE[ch] || ''}`}>
                          {ch}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {d.activeNow && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                          Active now
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          d.direction === 'bullish'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {d.direction === 'bullish' ? 'Up' : 'Down'} in {d.horizon}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 space-y-0.5">
                    <div>
                      Training: {pct(d.trainWinRate)} vs random {pct(d.trainBaseline)} · {d.trainSamples.toLocaleString()} samples
                    </div>
                    <div>
                      Unseen: {pct(d.testWinRate)} vs random {pct(d.testBaseline)} · {d.testSamples.toLocaleString()} samples
                    </div>
                    <div className="text-slate-500">Last seen {new Date(d.lastSeen).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3.5 text-[11px] text-slate-400">
            Letters compare each candle's body with the normal candle size, so "big" and "small" adjust to the coin and
            timeframe. A result is a historical tendency, not a promise. Fees are not included.
          </div>
        </>
      )}

      {/* ===================== LOOK-ALIKE ===================== */}
      {mode === 'lookalike' && enoughData && (
        <>
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 space-y-3">
            <div className="text-sm font-bold text-white">Look-alike search</div>
            <p className="text-xs text-slate-400">
              Takes the shape of the last {LOOKALIKE_WINDOW} candles, finds the {LOOKALIKE_NEIGHBORS} most similar moments in
              your saved history, and shows what happened next. It then checks itself: it goes back in time, pretends not to
              know the future, and sees how often its guess was right.
            </p>
            <button
              onClick={runLookalike}
              disabled={lookalikeBusy}
              className="w-full py-3 rounded-2xl bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 active:scale-95 transition disabled:opacity-40"
            >
              {lookalikeBusy ? 'Comparing...' : lookalikeDone ? 'Run again' : 'Compare now with history'}
            </button>
          </div>

          {lookalike && !lookalike.usable && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400">
              Not enough similar history yet. Download more past charts for this coin and timeframe.
            </div>
          )}

          {lookalike && lookalike.usable && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="text-xs text-slate-300">
                Found {lookalike.neighbors} similar moments. What happened after them:
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500 pb-1">
                <div>Ahead</div>
                <div className="text-right">Went up</div>
                <div className="text-right">Normal</div>
                <div className="text-right">Avg move</div>
              </div>
              {lookalike.horizons.map((h) => (
                <div key={h.horizon} className="grid grid-cols-4 gap-1 py-1 text-xs font-mono text-slate-300">
                  <div>{h.horizon}</div>
                  <div
                    className={`text-right ${
                      h.upShare >= h.baselineUp + 0.1
                        ? 'text-emerald-400'
                        : h.upShare <= h.baselineUp - 0.1
                          ? 'text-rose-400'
                          : ''
                    }`}
                  >
                    {pct(h.upShare)}
                  </div>
                  <div className="text-right text-slate-500">{pct(h.baselineUp)}</div>
                  <div className="text-right">{signed(h.avgMovePct)}</div>
                </div>
              ))}
              <div className="text-[10px] text-slate-500">
                "Normal" is how often price went up after any candle. A difference only matters if the self-check below
                confirms it.
              </div>
            </div>
          )}

          {lookalikeBusy && lookalike && lookalike.usable && (
            <div className="text-xs text-slate-400 text-center">Running the self-check on past moments...</div>
          )}

          {backtest && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-white">Self-check ({backtest.horizon} candles ahead)</div>
              <div className="text-[11px] font-mono text-slate-300">
                Right {backtest.correct} of {backtest.queries} times = {pct(backtest.accuracy)}. Always guessing "up" would
                have been right {pct(backtest.alwaysUpRate)}.
              </div>
              <div className="text-[11px] font-mono text-slate-300">
                When it was confident (65%+ or 35%-): {backtest.confidentQueries} times,{' '}
                {backtest.confidentQueries > 0 ? pct(backtest.confidentAccuracy) + ' right' : 'none'}.
              </div>
              <div className="text-[10px] text-slate-500">
                With only about {backtest.queries} checks, differences of a few points are noise. Treat it as useful only if
                it stays clearly above the "always up" line across several coins and timeframes.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
