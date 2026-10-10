import { db, type SettingRecord, type CollectorLogRecord, type ErrorLogRecord, type ClickerProfileRecord, type PaperLedgerRecord } from './db';

export const PAPER_DEFAULT_START = 10000;
export const MAX_TRACKED_SYMBOLS = 20;
const MAX_PAPER_AMOUNT = 1000000000;

export interface AppSettings {
  dataSource: 'global' | 'us';
  trackedSymbols: string[];
  recordRawTicks: boolean;
  rawTickRetentionDays: number;
  safetyLimits: {
    maxStake: number;
    dailyLossLimit: number;
  };
  collectorPaused: boolean;
  collectorStartTime: number;
  emergencyStopped: boolean;
  backgroundService: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  dataSource: 'global',
  trackedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  recordRawTicks: true,
  rawTickRetentionDays: 3,
  safetyLimits: {
    maxStake: 500,
    dailyLossLimit: 1000,
  },
  collectorPaused: false,
  collectorStartTime: Date.now(),
  emergencyStopped: false,
  backgroundService: false,
};

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const row = await db.settings.get(key);
  if (row === undefined || row.value === undefined) {
    return defaultValue;
  }
  return row.value as T;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function loadAllSettings(): Promise<AppSettings> {
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];
  const settings: any = { ...DEFAULT_SETTINGS };

  for (const key of keys) {
    const row = await db.settings.get(key);
    if (row && row.value !== undefined) {
      settings[key] = row.value;
    }
  }

  return settings as AppSettings;
}

export async function logError(screen: string, message: string, stack?: string): Promise<void> {
  try {
    await db.errorLog.add({
      t: Date.now(),
      screen,
      message,
      stack,
    });
  } catch (e) {
    console.error('Failed to log error to errorLog table:', e);
  }
}

export async function getDatabaseStats() {
  const [ticksCount, quoteBarsCount, candlesCount, gapsCount] = await Promise.all([
    db.ticks.count(),
    db.quoteBars.count(),
    db.candles.count(),
    db.collectorLog.where('type').equals('gap').count(),
  ]);

  let storageUsed = 0;
  let storageQuota = 0;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      storageUsed = estimate.usage || 0;
      storageQuota = estimate.quota || 0;
    } catch {
      // fallback
    }
  }

  // Get most recent tick or candle for "Last data received"
  const latestTick = await db.ticks.orderBy('t').last();
  const latestCandle = await db.candles.orderBy('t').last();
  const lastDataTime = Math.max(latestTick?.t || 0, latestCandle?.t || 0);

  return {
    ticksCount,
    quoteBarsCount,
    candlesCount,
    gapsCount,
    storageUsed,
    storageQuota,
    lastDataTime,
  };
}

export async function getGapsList(): Promise<CollectorLogRecord[]> {
  return await db.collectorLog
    .where('type')
    .equals('gap')
    .reverse()
    .sortBy('t');
}

export async function updateGapStatus(id: number, status: 'open' | 'repaired' | 'unrecoverable') {
  await db.collectorLog.update(id, { status });
}

export async function ensurePaperRun(): Promise<string> {
  const existingRunId = await getSetting<string | null>('paperRunId', null);
  if (existingRunId) {
    const entryCount = await db.paperLedger.where('runId').equals(existingRunId).count();
    if (entryCount > 0) {
      return existingRunId;
    }
  }

  const runId = crypto.randomUUID();
  await setSetting('paperRunId', runId);
  await db.paperLedger.add({
    id: crypto.randomUUID(),
    t: Date.now(),
    runId,
    type: 'start',
    amount: PAPER_DEFAULT_START,
  });
  return runId;
}

export async function getPaperBalance(): Promise<number> {
  const runId = await getSetting<string | null>('paperRunId', null);
  if (!runId) {
    return 0;
  }
  const entries = await db.paperLedger.where('runId').equals(runId).toArray();
  const sum = entries.reduce((acc, entry) => acc + entry.amount, 0);
  return Math.round(sum * 100) / 100;
}

export async function getPaperLedger(limit = 10): Promise<PaperLedgerRecord[]> {
  const runId = await getSetting<string | null>('paperRunId', null);
  if (!runId) {
    return [];
  }
  const entries = await db.paperLedger.where('runId').equals(runId).reverse().sortBy('t');
  return entries.slice(0, limit);
}

export async function addPaperFunds(amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter an amount greater than 0');
  }
  if (amount > MAX_PAPER_AMOUNT) {
    throw new Error('Maximum is 1,000,000,000');
  }
  const cleanAmount = Math.round(amount * 100) / 100;
  const runId = await ensurePaperRun();
  await db.paperLedger.add({
    id: crypto.randomUUID(),
    t: Date.now(),
    runId,
    type: 'adjust',
    amount: cleanAmount,
  });
}

export async function reducePaperFunds(amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter an amount greater than 0');
  }
  if (amount > MAX_PAPER_AMOUNT) {
    throw new Error('Maximum is 1,000,000,000');
  }
  const cleanAmount = Math.round(amount * 100) / 100;
  const currentBalance = await getPaperBalance();
  if (currentBalance - cleanAmount < 0) {
    throw new Error("Balance can't go below 0");
  }
  const runId = await ensurePaperRun();
  await db.paperLedger.add({
    id: crypto.randomUUID(),
    t: Date.now(),
    runId,
    type: 'adjust',
    amount: -cleanAmount,
  });
}

export async function setPaperBalance(target: number): Promise<void> {
  if (!Number.isFinite(target) || target < 0) {
    throw new Error("Balance can't go below 0");
  }
  if (target > MAX_PAPER_AMOUNT) {
    throw new Error('Maximum is 1,000,000,000');
  }
  const cleanTarget = Math.round(target * 100) / 100;
  const currentBalance = await getPaperBalance();
  const diff = Math.round((cleanTarget - currentBalance) * 100) / 100;
  if (diff === 0) {
    return;
  }
  const runId = await ensurePaperRun();
  await db.paperLedger.add({
    id: crypto.randomUUID(),
    t: Date.now(),
    runId,
    type: 'adjust',
    amount: diff,
  });
}

export async function resetPaperAccount(startAmount: number): Promise<void> {
  if (!Number.isFinite(startAmount) || startAmount < 0) {
    throw new Error("Balance can't go below 0");
  }
  if (startAmount > MAX_PAPER_AMOUNT) {
    throw new Error('Maximum is 1,000,000,000');
  }
  const cleanStart = Math.round(startAmount * 100) / 100;
  const newRunId = crypto.randomUUID();
  await setSetting('paperRunId', newRunId);
  await db.paperLedger.add({
    id: crypto.randomUUID(),
    t: Date.now(),
    runId: newRunId,
    type: 'start',
    amount: cleanStart,
  });
}

export async function removeLegacyTradeSettings(): Promise<void> {
  await db.settings.bulkDelete([
    'tradeTypes',
    'tradeTemplatesSeeded',
    'selectedTemplateId',
    'selectedTradeType',
  ]);
}

export interface OptionLimits {
  amountPerTrade: number | null;
  maxSpendPerDay: number | null;
}

export async function getOptionLimits(platformId: string, optionId: string): Promise<OptionLimits> {
  return await getSetting<OptionLimits>(`limits:${platformId}:${optionId}`, {
    amountPerTrade: null,
    maxSpendPerDay: null,
  });
}

export async function saveOptionLimits(
  platformId: string,
  optionId: string,
  limits: OptionLimits
): Promise<void> {
  const { amountPerTrade, maxSpendPerDay } = limits;

  let cleanAmount: number | null = null;
  if (amountPerTrade !== null) {
    if (typeof amountPerTrade !== 'number' || !Number.isFinite(amountPerTrade) || amountPerTrade <= 0 || amountPerTrade > 1000000) {
      throw new Error('Enter a number greater than 0');
    }
    cleanAmount = Math.round(amountPerTrade * 100) / 100;
  }

  let cleanMaxSpend: number | null = null;
  if (maxSpendPerDay !== null) {
    if (typeof maxSpendPerDay !== 'number' || !Number.isFinite(maxSpendPerDay) || maxSpendPerDay <= 0 || maxSpendPerDay > 1000000) {
      throw new Error('Enter a number greater than 0');
    }
    cleanMaxSpend = Math.round(maxSpendPerDay * 100) / 100;
  }

  if (cleanAmount !== null && cleanMaxSpend !== null) {
    if (cleanMaxSpend < cleanAmount) {
      throw new Error('Max spend per day must be at least the amount per trade');
    }
  }

  await setSetting(`limits:${platformId}:${optionId}`, {
    amountPerTrade: cleanAmount,
    maxSpendPerDay: cleanMaxSpend,
  });
}

export async function getLongestHeartbeatGap(windowMs: number): Promise<number | null> {
  const since = Date.now() - windowMs;
  const rows = await db.collectorLog
    .where('t')
    .above(since)
    .filter((row) => row.type === 'heartbeat')
    .sortBy('t');

  if (rows.length < 2) return null;

  let maxGap = 0;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].t - rows[i - 1].t;
    if (gap > maxGap) {
      maxGap = gap;
    }
  }
  return maxGap;
}

