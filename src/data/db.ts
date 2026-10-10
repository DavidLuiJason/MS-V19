import Dexie, { type Table } from 'dexie';

export interface TickRecord {
  src: string;
  sym: string;
  u: number;
  t: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
}

export interface QuoteBarRecord {
  src: string;
  sym: string;
  t: number; // minute timestamp ms
  bidO: number;
  bidH: number;
  bidL: number;
  bidC: number;
  askO: number;
  askH: number;
  askL: number;
  askC: number;
  spreadAvg: number;
  spreadMax: number;
  tickCount: number;
}

export interface CandleRecord {
  src: string;
  sym: string;
  tf: string; // "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
  t: number;  // open time ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  closed: boolean;
  nt?: number;
  tbv?: number;
  tbq?: number;
}

export interface SecondCandleRecord {
  sym: string;
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  nt?: number;
  tbv?: number;
  tbq?: number;
}

export interface SecBetRecord {
  id: string;
  trialId: string;
  finderId: string;
  finderVersion: string;
  sym: string;
  h: number;
  dir: 'up' | 'down';
  decisionT: number;
  entryObsT: number;
  entryPrice: number;
  delayMs: number;
  eligible: boolean;
  exitPrice?: number;
  outcome: 'won' | 'lost' | 'tie' | 'expired';
  exitObsT: number;
  pct?: number;
}

export interface SecTrialRecord {
  id: string;
  createdAt: number;
  finderId: string;
  sym: string;
  h: number;
}

export interface CollectorLogRecord {
  id?: number;
  t: number;
  type: 'heartbeat' | 'gap' | 'connection' | 'event';
  state?: string;
  symbols?: string[];
  ticksPerMin?: number;
  src?: string;
  sym?: string;
  tf?: string;
  from?: number;
  to?: number;
  status?: 'open' | 'repaired' | 'unrecoverable';
  message?: string;
}

export interface SettingRecord {
  key: string;
  value: any;
}

export interface ErrorLogRecord {
  id?: number;
  t: number;
  screen: string;
  message: string;
  stack?: string;
}

export interface ClickerMarker {
  id: string;
  label: string;
  x: number; // 0..1 fraction
  y: number; // 0..1 fraction
}

export interface ClickerProfileRecord {
  id: string;
  name: string;
  platform: string;
  markers: ClickerMarker[];
}

export interface PaperLedgerRecord {
  id: string;
  t: number;
  runId: string;
  type: 'start' | 'adjust';
  amount: number;
  note?: string;
}

export interface PredictionRecord {
  id: string;
  t: number;
  sym: string;
  tf: string;
  source: 'lookalike' | 'discovery';
  direction: 'up' | 'down';
  horizon: number;
  entryT: number;
  entryPrice: number;
  targetT: number;
  confidence: number;
  baseline: number;
  note: string;
  status: 'open' | 'won' | 'lost' | 'tie' | 'expired';
  exitPrice?: number;
  resultPct?: number;
  scoredAt?: number;
  mode?: 'live' | 'catchup';
  costResultPct?: number;
  costStatus?: 'won' | 'lost' | 'tie';
}

export interface ArenaSignalRecord {
  id: string;
  trialId: string;
  predictionId: string;
  finderId: 'lookalike' | 'discovery';
  finderVersion: string;
  configHash: string;
  src: string;
  sym: string;
  tf: string;
  horizon: number;
  direction: 'up' | 'down';
  mode: 'live' | 'catchup';
  decisionT: number;
  entryObsT: number;
  entryPrice: number;
  exitTargetT: number;
  delayMs: number;
  eligible: boolean;
  confidence: number;
  baseline: number;
}

export interface ArenaOutcomeRecord {
  signalId: string;
  result: 'won' | 'lost' | 'tie' | 'expired';
  exitPrice?: number;
  exitObsT: number;
  pctMove?: number;
}

export interface ArenaTrialRecord {
  id: string;
  createdAt: number;
  kind: 'config' | 'search';
  finderId: string;
  sym: string;
  tf: string;
  count: number;
}

export class MarketScopeDatabase extends Dexie {
  ticks!: Table<TickRecord, [string, string, number]>;
  quoteBars!: Table<QuoteBarRecord, [string, string, number]>;
  candles!: Table<CandleRecord, [string, string, string, number]>;
  collectorLog!: Table<CollectorLogRecord, number>;
  settings!: Table<SettingRecord, string>;
  errorLog!: Table<ErrorLogRecord, number>;
  clickerProfiles!: Table<ClickerProfileRecord, string>;
  paperLedger!: Table<PaperLedgerRecord, string>;
  predictions!: Table<PredictionRecord, string>;
  arenaSignals!: Table<ArenaSignalRecord, string>;
  arenaOutcomes!: Table<ArenaOutcomeRecord, string>;
  arenaTrials!: Table<ArenaTrialRecord, string>;
  secondCandles!: Table<SecondCandleRecord, [string, number]>;
  secBets!: Table<SecBetRecord, string>;
  secTrials!: Table<SecTrialRecord, string>;

  constructor() {
    super('MarketScopeDB');
    this.version(1).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
    });
    this.version(2).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
      paperLedger: 'id, t, runId, type',
    });
    this.version(3).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
      paperLedger: 'id, t, runId, type',
      tradeTemplates: 'id, platform, model, name, createdAt',
    });
    this.version(4).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
      paperLedger: 'id, t, runId, type',
      tradeTemplates: null,
    });
    this.version(5).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
      paperLedger: 'id, t, runId, type',
      tradeTemplates: null,
      predictions: 'id, t, status, source, [sym+tf+t]',
    });
    this.version(6).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
      paperLedger: 'id, t, runId, type',
      tradeTemplates: null,
      predictions: 'id, t, status, source, [sym+tf+t]',
      arenaSignals: 'id, trialId, entryObsT',
      arenaOutcomes: 'signalId, exitObsT',
      arenaTrials: 'id, createdAt',
    });
    this.version(7).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
      paperLedger: 'id, t, runId, type',
      tradeTemplates: null,
      predictions: 'id, t, status, source, [sym+tf+t]',
      arenaSignals: 'id, trialId, entryObsT',
      arenaOutcomes: 'signalId, exitObsT',
      arenaTrials: 'id, createdAt',
      secondCandles: '[sym+t], t',
    });
    this.version(8).stores({
      ticks: '[src+sym+u], sym, t, [sym+t]',
      quoteBars: '[src+sym+t], sym, t, [sym+t]',
      candles: '[src+sym+tf+t], sym, tf, t, [sym+tf+t]',
      collectorLog: '++id, t, type, status, sym, [sym+tf]',
      settings: 'key',
      errorLog: '++id, t, screen',
      clickerProfiles: 'id, name',
      paperLedger: 'id, t, runId, type',
      tradeTemplates: null,
      predictions: 'id, t, status, source, [sym+tf+t]',
      arenaSignals: 'id, trialId, entryObsT',
      arenaOutcomes: 'signalId, exitObsT',
      arenaTrials: 'id, createdAt',
      secondCandles: '[sym+t], t',
      secBets: 'id, [trialId+decisionT], decisionT',
      secTrials: 'id',
    });
  }
}

export const db = new MarketScopeDatabase();
