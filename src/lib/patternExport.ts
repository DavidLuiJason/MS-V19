import Dexie from 'dexie';
import JSZip from 'jszip';
import { db } from '../data/db';
import {
  PATTERN_DEFINITIONS,
  PATTERN_HORIZONS,
  studyPatterns,
  getEventOutcome,
  type PatternCandle,
  type PatternStudy,
} from '../engine/patterns';
import { discoverWords, type DiscoveryResult } from '../engine/discovery';
import {
  lookalikeNow,
  lookalikeBacktest,
  type LookalikeNow,
  type LookalikeBacktest,
} from '../engine/lookalike';

export type PatternReport = 'rules' | 'occurrences' | 'discovery' | 'lookalike';

export const PATTERN_REPORTS: Array<{ id: PatternReport; label: string }> = [
  { id: 'rules', label: 'Results' },
  { id: 'occurrences', label: 'Occurrences' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'lookalike', label: 'Look-alike' },
];

export const PATTERN_MAX_CANDLES = 50000;
export const PATTERN_MIN_CANDLES = 500;
const LOOKALIKE_BACKTEST_HORIZON = 5;

type Cell = string | number | boolean | null | undefined;
type Row = Cell[];

const csvCell = (value: Cell): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

const csvText = (rows: Row[]): string => rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

// Same loading rule the Patterns screen uses: newest saved closed candles for one coin and timeframe.
async function loadCandles(symbol: string, timeframe: string): Promise<PatternCandle[]> {
  const rows = await db.candles
    .where('[src+sym+tf+t]')
    .between(['binance', symbol, timeframe, Dexie.minKey], ['binance', symbol, timeframe, Dexie.maxKey])
    .reverse()
    .limit(PATTERN_MAX_CANDLES)
    .toArray();
  return rows
    .reverse()
    .filter((r) => r.closed)
    .map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }));
}

const dataHeader = ['coin', 'timeframe', 'candles_used', 'data_from_utc', 'data_to_utc'];
const dataColumns = (symbol: string, timeframe: string, candles: PatternCandle[]): Array<string | number> => [
  symbol,
  timeframe,
  candles.length,
  candles.length > 0 ? new Date(candles[0].t).toISOString() : '',
  candles.length > 0 ? new Date(candles[candles.length - 1].t).toISOString() : '',
];

function rulesRows(symbol: string, timeframe: string, candles: PatternCandle[], study: PatternStudy): Row[] {
  const rows: Row[] = [
    [
      ...dataHeader,
      'pattern_id', 'pattern_name', 'family', 'direction', 'look_ahead_candles',
      'samples', 'wins', 'win_rate', 'random_baseline', 'edge_points',
      'avg_win_pct', 'avg_loss_pct',
      'train_samples', 'train_win_rate', 'train_baseline',
      'test_samples', 'test_win_rate', 'test_baseline', 'verdict',
    ],
  ];
  for (const def of PATTERN_DEFINITIONS) {
    for (const s of study.stats.filter((x) => x.patternId === def.id)) {
      rows.push([
        ...dataColumns(symbol, timeframe, candles),
        def.id, def.name, def.family, def.direction, s.horizon,
        s.samples, s.wins, s.winRate.toFixed(4), s.baselineWinRate.toFixed(4), s.edgePoints.toFixed(2),
        s.avgGainPct.toFixed(4), s.avgLossPct.toFixed(4),
        s.trainSamples, s.trainWinRate.toFixed(4), s.trainBaseline.toFixed(4),
        s.testSamples, s.testWinRate.toFixed(4), s.testBaseline.toFixed(4), s.verdict,
      ]);
    }
  }
  return rows;
}

function occurrenceRows(symbol: string, timeframe: string, candles: PatternCandle[], study: PatternStudy): Row[] {
  const rows: Row[] = [
    [
      'coin', 'timeframe', 'pattern_id', 'pattern_name', 'family', 'direction', 'time_utc', 'price',
      ...PATTERN_HORIZONS.map((h) => 'move_after_' + h + '_candles_pct'),
    ],
  ];
  for (const e of study.events) {
    const def = PATTERN_DEFINITIONS.find((d) => d.id === e.patternId);
    if (!def) continue;
    rows.push([
      symbol, timeframe, def.id, def.name, def.family, def.direction, new Date(e.t).toISOString(), e.price,
      ...PATTERN_HORIZONS.map((h) => {
        const out = getEventOutcome(candles, e, h, def.direction);
        return out === null ? '' : out.toFixed(4);
      }),
    ]);
  }
  return rows;
}

function discoveryRows(symbol: string, timeframe: string, candles: PatternCandle[], discovery: DiscoveryResult): Row[] {
  const rows: Row[] = [
    [
      ...dataHeader, 'combinations_tested', 'expected_by_luck',
      'sequence', 'direction', 'look_ahead_candles',
      'train_samples', 'train_win_rate', 'train_baseline',
      'test_samples', 'test_win_rate', 'test_baseline', 'active_now', 'last_seen_utc',
    ],
  ];
  if (discovery.passed.length === 0) {
    rows.push([
      ...dataColumns(symbol, timeframe, candles),
      discovery.testedCombos,
      discovery.luckyExpected.toFixed(3),
      'none passed',
    ]);
  }
  for (const d of discovery.passed) {
    rows.push([
      ...dataColumns(symbol, timeframe, candles), discovery.testedCombos, discovery.luckyExpected.toFixed(3),
      d.word, d.direction, d.horizon,
      d.trainSamples, d.trainWinRate.toFixed(4), d.trainBaseline.toFixed(4),
      d.testSamples, d.testWinRate.toFixed(4), d.testBaseline.toFixed(4),
      d.activeNow ? 'yes' : 'no', new Date(d.lastSeen).toISOString(),
    ]);
  }
  return rows;
}

function lookalikeRows(
  symbol: string,
  timeframe: string,
  candles: PatternCandle[],
  lookalike: LookalikeNow,
  backtest: LookalikeBacktest | null
): Row[] {
  const rows: Row[] = [
    [
      ...dataHeader, 'similar_moments', 'look_ahead_candles', 'went_up_share', 'normal_up_share', 'avg_move_pct',
      'selfcheck_look_ahead', 'selfcheck_checks', 'selfcheck_correct', 'selfcheck_accuracy', 'selfcheck_always_up_rate',
    ],
  ];
  for (const h of lookalike.horizons) {
    rows.push([
      ...dataColumns(symbol, timeframe, candles), lookalike.neighbors, h.horizon, h.upShare.toFixed(4), h.baselineUp.toFixed(4), h.avgMovePct.toFixed(4),
      backtest ? backtest.horizon : '', backtest ? backtest.queries : '', backtest ? backtest.correct : '',
      backtest ? backtest.accuracy.toFixed(4) : '', backtest ? backtest.alwaysUpRate.toFixed(4) : '',
    ]);
  }
  return rows;
}

export interface PatternExportResult {
  blob: Blob;
  filename: string;
  files: number;
  skippedSeries: string[];
}

export async function exportPatternsZip(
  symbols: string[],
  timeframes: string[],
  reports: PatternReport[],
  onProgress?: (text: string) => void
): Promise<PatternExportResult> {
  const zip = new JSZip();
  const skippedSeries: string[] = [];
  let files = 0;
  const total = symbols.length * timeframes.length;
  let done = 0;

  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      done += 1;
      const label = symbol + ' ' + timeframe;
      onProgress?.('Studying ' + label + ' (' + done + ' of ' + total + ')...');
      await pause();
      const candles = await loadCandles(symbol, timeframe);
      if (candles.length < PATTERN_MIN_CANDLES) {
        skippedSeries.push(label + ' (' + candles.length + ' candles)');
        continue;
      }
      const stem = symbol + '-' + timeframe;

      if (reports.includes('rules') || reports.includes('occurrences')) {
        const study = studyPatterns(candles);
        if (reports.includes('rules')) {
          zip.file('patterns-summary-' + stem + '.csv', csvText(rulesRows(symbol, timeframe, candles, study)));
          files += 1;
        }
        if (reports.includes('occurrences')) {
          zip.file('patterns-occurrences-' + stem + '.csv', csvText(occurrenceRows(symbol, timeframe, candles, study)));
          files += 1;
        }
      }
      if (reports.includes('discovery')) {
        await pause();
        zip.file('discovery-' + stem + '.csv', csvText(discoveryRows(symbol, timeframe, candles, discoverWords(candles))));
        files += 1;
      }
      if (reports.includes('lookalike')) {
        await pause();
        const lookalike = lookalikeNow(candles);
        if (lookalike.usable) {
          const backtest = await lookalikeBacktest(candles, LOOKALIKE_BACKTEST_HORIZON);
          zip.file('lookalike-' + stem + '.csv', csvText(lookalikeRows(symbol, timeframe, candles, lookalike, backtest)));
          files += 1;
        } else {
          skippedSeries.push(label + ' look-alike (not enough similar moments)');
        }
      }
    }
  }

  if (files === 0) {
    throw new Error(
      'No pattern files were made. Each coin and timeframe needs at least ' +
        PATTERN_MIN_CANDLES +
        ' saved candles. Use Download Past Charts first.'
    );
  }

  onProgress?.('Packing file...');
  const blob = await zip.generateAsync({ type: 'blob' });
  const now = new Date();
  const stamp =
    String(now.getUTCFullYear()) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    '-' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0');
  return { blob, filename: 'marketscope-patterns-' + stamp + '.zip', files, skippedSeries };
}
