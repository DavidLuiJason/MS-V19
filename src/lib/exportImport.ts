import JSZip from 'jszip';
import {
  db,
  type TickRecord,
  type QuoteBarRecord,
  type CandleRecord,
  type CollectorLogRecord,
  type SettingRecord,
  type ClickerProfileRecord,
  type PaperLedgerRecord,
  type PredictionRecord,
  type ArenaSignalRecord,
  type ArenaOutcomeRecord,
  type ArenaTrialRecord,
  type SecBetRecord,
  type SecTrialRecord,
} from '../data/db';

export type ExportScope = 'all' | 'candles' | 'liquidity' | 'settings_profiles' | 'predictions';

export interface ExportProgress {
  stage: string;
  detail: string;
  percent: number;
}

export interface ExportOptions {
  onProgress?: (p: ExportProgress) => void;
  shouldCancel?: () => boolean;
}

export const EXPORT_CANCELLED = 'Export cancelled';

async function pagedNdjson(
  table: any,
  onRows: (n: number) => void,
  shouldCancel?: () => boolean
): Promise<{ text: string; count: number }> {
  const lines: string[] = [];
  let offset = 0;
  const PAGE_SIZE = 25000;

  while (true) {
    const page = await table.offset(offset).limit(PAGE_SIZE).toArray();
    for (let i = 0; i < page.length; i++) {
      lines.push(JSON.stringify(page[i]));
    }
    offset += page.length;
    onRows(page.length);

    await new Promise((r) => setTimeout(r, 0));

    if (shouldCancel && shouldCancel()) {
      throw new Error(EXPORT_CANCELLED);
    }

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  const text = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  return { text, count: lines.length };
}

export interface ManifestTableEntry {
  file: string;
  count: number;
  sha256: string;
}

export interface Manifest {
  format: 'ms-data';
  version: 1;
  createdAt: string;
  app: 'MarketScope';
  appVersion: '1.0.0';
  tables: Record<string, ManifestTableEntry>;
}

export interface ImportSummary {
  tables: {
    name: string;
    file: string;
    totalInFile: number;
    added: number;
    skipped: number;
    status: 'imported' | 'skipped_unknown' | 'error';
    error?: string;
  }[];
  skippedUnknownTables: string[];
}

export async function calculateSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function exportDataZip(
  scope: ExportScope = 'all',
  options: ExportOptions = {}
): Promise<{ blob: Blob; filename: string }> {
  const zip = new JSZip();
  const tables: Record<string, ManifestTableEntry> = {};

  const includeCandles = scope === 'all' || scope === 'candles';
  const includeLiquidity = scope === 'all' || scope === 'liquidity';
  const includeSettings = scope === 'all' || scope === 'settings_profiles';
  const includePredictions = scope === 'all' || scope === 'predictions';

  const plannedRows =
    (includeLiquidity ? (await db.ticks.count()) + (await db.quoteBars.count()) : 0) +
    (includeCandles ? await db.candles.count() : 0) +
    (includePredictions ? await db.predictions.count() : 0);

  let rowsRead = 0;
  const report = (stage: string, detail: string) => {
    const percent = plannedRows > 0 ? Math.min(60, Math.round((rowsRead / plannedRows) * 60)) : 0;
    options.onProgress?.({ stage, detail, percent });
  };

  if (includeLiquidity) {
    // ticks
    const ticksRes = await pagedNdjson(
      db.ticks,
      (n) => {
        rowsRead += n;
        report('Reading ticks', rowsRead.toLocaleString() + ' of ' + plannedRows.toLocaleString() + ' rows');
      },
      options.shouldCancel
    );
    const ticksSha = await calculateSha256(ticksRes.text);
    zip.file('ticks.ndjson', ticksRes.text);
    tables['ticks'] = { file: 'ticks.ndjson', count: ticksRes.count, sha256: ticksSha };

    // quoteBars
    const quoteBarsRes = await pagedNdjson(
      db.quoteBars,
      (n) => {
        rowsRead += n;
        report('Reading quote bars', rowsRead.toLocaleString() + ' of ' + plannedRows.toLocaleString() + ' rows');
      },
      options.shouldCancel
    );
    const quoteBarsSha = await calculateSha256(quoteBarsRes.text);
    zip.file('quoteBars.ndjson', quoteBarsRes.text);
    tables['quoteBars'] = { file: 'quoteBars.ndjson', count: quoteBarsRes.count, sha256: quoteBarsSha };
  }

  if (includeCandles) {
    // candles
    const candlesRes = await pagedNdjson(
      db.candles,
      (n) => {
        rowsRead += n;
        report('Reading candles', rowsRead.toLocaleString() + ' of ' + plannedRows.toLocaleString() + ' rows');
      },
      options.shouldCancel
    );
    const candlesSha = await calculateSha256(candlesRes.text);
    zip.file('candles.ndjson', candlesRes.text);
    tables['candles'] = { file: 'candles.ndjson', count: candlesRes.count, sha256: candlesSha };
  }

  if (scope === 'all') {
    // gaps from collectorLog where type === 'gap'
    const gaps = await db.collectorLog.where('type').equals('gap').toArray();
    const gapsNdjson = gaps.map((row) => JSON.stringify(row)).join('\n') + (gaps.length > 0 ? '\n' : '');
    const gapsSha = await calculateSha256(gapsNdjson);
    zip.file('gaps.ndjson', gapsNdjson);
    tables['gaps'] = { file: 'gaps.ndjson', count: gaps.length, sha256: gapsSha };
  }

  if (includeSettings) {
    // settings
    const settings = await db.settings.toArray();
    const settingsNdjson = settings.map((row) => JSON.stringify(row)).join('\n') + (settings.length > 0 ? '\n' : '');
    const settingsSha = await calculateSha256(settingsNdjson);
    zip.file('settings.ndjson', settingsNdjson);
    tables['settings'] = { file: 'settings.ndjson', count: settings.length, sha256: settingsSha };

    // clickerProfiles
    const profiles = await db.clickerProfiles.toArray();
    const profilesNdjson = profiles.map((row) => JSON.stringify(row)).join('\n') + (profiles.length > 0 ? '\n' : '');
    const profilesSha = await calculateSha256(profilesNdjson);
    zip.file('clickerProfiles.ndjson', profilesNdjson);
    tables['clickerProfiles'] = { file: 'clickerProfiles.ndjson', count: profiles.length, sha256: profilesSha };

    // paperLedger
    const ledger = await db.paperLedger.toArray();
    const ledgerNdjson = ledger.map((row) => JSON.stringify(row)).join('\n') + (ledger.length > 0 ? '\n' : '');
    const ledgerSha = await calculateSha256(ledgerNdjson);
    zip.file('paperLedger.ndjson', ledgerNdjson);
    tables['paperLedger'] = { file: 'paperLedger.ndjson', count: ledger.length, sha256: ledgerSha };
  }

  if (includePredictions) {
    const predictionsRes = await pagedNdjson(
      db.predictions,
      (n) => {
        rowsRead += n;
        report('Reading predictions', rowsRead.toLocaleString() + ' of ' + plannedRows.toLocaleString() + ' rows');
      },
      options.shouldCancel
    );
    const predictionsSha = await calculateSha256(predictionsRes.text);
    zip.file('predictions.ndjson', predictionsRes.text);
    tables['predictions'] = { file: 'predictions.ndjson', count: predictionsRes.count, sha256: predictionsSha };

    const arenaSignals = await db.arenaSignals.toArray();
    const arenaSignalsNdjson = arenaSignals.map((row) => JSON.stringify(row)).join('\n') + (arenaSignals.length > 0 ? '\n' : '');
    const arenaSignalsSha = await calculateSha256(arenaSignalsNdjson);
    zip.file('arenaSignals.ndjson', arenaSignalsNdjson);
    tables['arenaSignals'] = { file: 'arenaSignals.ndjson', count: arenaSignals.length, sha256: arenaSignalsSha };

    const arenaOutcomes = await db.arenaOutcomes.toArray();
    const arenaOutcomesNdjson = arenaOutcomes.map((row) => JSON.stringify(row)).join('\n') + (arenaOutcomes.length > 0 ? '\n' : '');
    const arenaOutcomesSha = await calculateSha256(arenaOutcomesNdjson);
    zip.file('arenaOutcomes.ndjson', arenaOutcomesNdjson);
    tables['arenaOutcomes'] = { file: 'arenaOutcomes.ndjson', count: arenaOutcomes.length, sha256: arenaOutcomesSha };

    const arenaTrials = await db.arenaTrials.toArray();
    const arenaTrialsNdjson = arenaTrials.map((row) => JSON.stringify(row)).join('\n') + (arenaTrials.length > 0 ? '\n' : '');
    const arenaTrialsSha = await calculateSha256(arenaTrialsNdjson);
    zip.file('arenaTrials.ndjson', arenaTrialsNdjson);
    tables['arenaTrials'] = { file: 'arenaTrials.ndjson', count: arenaTrials.length, sha256: arenaTrialsSha };

    const secBetLines: string[] = [];
    await db.secBets.orderBy('decisionT').each((row) => {
      secBetLines.push(JSON.stringify(row));
    });
    const secBetsNdjson = secBetLines.join('\n') + (secBetLines.length > 0 ? '\n' : '');
    const secBetsSha = await calculateSha256(secBetsNdjson);
    zip.file('secBets.ndjson', secBetsNdjson);
    tables['secBets'] = { file: 'secBets.ndjson', count: secBetLines.length, sha256: secBetsSha };

    const secTrials = await db.secTrials.toArray();
    const secTrialsNdjson = secTrials.map((row) => JSON.stringify(row)).join('\n') + (secTrials.length > 0 ? '\n' : '');
    const secTrialsSha = await calculateSha256(secTrialsNdjson);
    zip.file('secTrials.ndjson', secTrialsNdjson);
    tables['secTrials'] = { file: 'secTrials.ndjson', count: secTrials.length, sha256: secTrialsSha };
  }

  const manifest: Manifest = {
    format: 'ms-data',
    version: 1,
    createdAt: new Date().toISOString(),
    app: 'MarketScope',
    appVersion: '1.0.0',
    tables,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  options.onProgress?.({ stage: 'Compressing', detail: 'cannot be cancelled', percent: 60 });
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } },
    (meta) => {
      options.onProgress?.({
        stage: 'Compressing',
        detail: 'cannot be cancelled',
        percent: 60 + Math.round(meta.percent * 0.3),
      });
    }
  );

  if (options.shouldCancel && options.shouldCancel()) throw new Error(EXPORT_CANCELLED);

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const filename = `marketscope-${yyyy}-${mm}-${dd}-${hh}${min}.msdata.zip`;

  return { blob, filename };
}

export async function importDataZip(file: File): Promise<ImportSummary> {
  const zip = await JSZip.loadAsync(file);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid archive: manifest.json is missing.');
  }

  let manifest: Manifest;
  try {
    const manifestText = await manifestFile.async('text');
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('Invalid archive: manifest.json is corrupted or unreadable.');
  }

  if (manifest.format !== 'ms-data') {
    throw new Error(`Unsupported format "${manifest.format}". Expected "ms-data".`);
  }

  if (manifest.version !== 1) {
    throw new Error(`Unsupported version ${manifest.version}. Only version 1 is supported.`);
  }

  const summary: ImportSummary = {
    tables: [],
    skippedUnknownTables: [],
  };

  const knownTables = new Set([
    'ticks',
    'quoteBars',
    'candles',
    'gaps',
    'settings',
    'clickerProfiles',
    'paperLedger',
    'predictions',
    'arenaSignals',
    'arenaOutcomes',
    'arenaTrials',
    'secBets',
    'secTrials',
  ]);

  for (const [tableName, meta] of Object.entries(manifest.tables)) {
    if (!knownTables.has(tableName)) {
      summary.skippedUnknownTables.push(tableName);
      summary.tables.push({
        name: tableName,
        file: meta.file,
        totalInFile: meta.count,
        added: 0,
        skipped: meta.count,
        status: 'skipped_unknown',
      });
      continue;
    }

    const tableZipFile = zip.file(meta.file);
    if (!tableZipFile) {
      throw new Error(`Missing table data file "${meta.file}" referenced in manifest.`);
    }

    const contentText = await tableZipFile.async('text');
    const computedSha = await calculateSha256(contentText);

    if (computedSha !== meta.sha256) {
      throw new Error(
        `Integrity check failed for ${meta.file}. Expected SHA-256 ${meta.sha256}, got ${computedSha}. File is corrupted.`
      );
    }

    const lines = contentText.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length !== meta.count) {
      throw new Error(
        `Count mismatch in ${meta.file}. Manifest specifies ${meta.count} records, but found ${lines.length} lines.`
      );
    }

    const CHUNK_SIZE = 5000;
    let addedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      const chunkLines = lines.slice(i, i + CHUNK_SIZE);
      const parsedRecords = chunkLines.map((line) => JSON.parse(line));

      if (tableName === 'ticks') {
        const batch = parsedRecords as TickRecord[];
        const countBefore = await db.ticks.count();
        await db.ticks.bulkPut(batch);
        const countAfter = await db.ticks.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (batch.length - Math.max(0, diff));
      } else if (tableName === 'quoteBars') {
        const batch = parsedRecords as QuoteBarRecord[];
        const countBefore = await db.quoteBars.count();
        await db.quoteBars.bulkPut(batch);
        const countAfter = await db.quoteBars.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (batch.length - Math.max(0, diff));
      } else if (tableName === 'candles') {
        const batch = parsedRecords as CandleRecord[];
        const countBefore = await db.candles.count();
        await db.candles.bulkPut(batch);
        const countAfter = await db.candles.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (batch.length - Math.max(0, diff));
      } else if (tableName === 'gaps') {
        const batch = parsedRecords as CollectorLogRecord[];
        const countBefore = await db.collectorLog.count();
        await db.collectorLog.bulkPut(batch);
        const countAfter = await db.collectorLog.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (batch.length - Math.max(0, diff));
      } else if (tableName === 'settings') {
        const rawBatch = parsedRecords as SettingRecord[];
        // NEVER changes the current 'paperRunId'
        const batch = rawBatch.filter((s) => s.key !== 'paperRunId');
        const countBefore = await db.settings.count();
        await db.settings.bulkPut(batch);
        const countAfter = await db.settings.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (rawBatch.length - Math.max(0, diff));
      } else if (tableName === 'clickerProfiles') {
        const batch = parsedRecords as ClickerProfileRecord[];
        const countBefore = await db.clickerProfiles.count();
        await db.clickerProfiles.bulkPut(batch);
        const countAfter = await db.clickerProfiles.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (batch.length - Math.max(0, diff));
      } else if (tableName === 'paperLedger') {
        const batch = parsedRecords as PaperLedgerRecord[];
        const countBefore = await db.paperLedger.count();
        await db.paperLedger.bulkPut(batch);
        const countAfter = await db.paperLedger.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (batch.length - Math.max(0, diff));
      } else if (tableName === 'predictions') {
        const batch = parsedRecords as PredictionRecord[];
        const existing = await db.predictions.bulkGet(batch.map((b) => b.id));
        const toPut: PredictionRecord[] = [];
        for (let j = 0; j < batch.length; j++) {
          const ex = existing[j];
          if (!ex || ex.status === 'open') {
            toPut.push(batch[j]);
          }
        }
        const countBefore = await db.predictions.count();
        if (toPut.length > 0) {
          await db.predictions.bulkPut(toPut);
        }
        const countAfter = await db.predictions.count();
        const diff = countAfter - countBefore;
        addedCount += Math.max(0, diff);
        skippedCount += (batch.length - Math.max(0, diff));
      } else if (tableName === 'arenaSignals') {
        const batch = parsedRecords as ArenaSignalRecord[];
        const existing = await db.arenaSignals.bulkGet(batch.map((b) => b.id));
        const toAdd: ArenaSignalRecord[] = [];
        for (let j = 0; j < batch.length; j++) {
          if (!existing[j]) {
            toAdd.push(batch[j]);
          }
        }
        if (toAdd.length > 0) {
          await db.arenaSignals.bulkAdd(toAdd);
        }
        addedCount += toAdd.length;
        skippedCount += (batch.length - toAdd.length);
      } else if (tableName === 'arenaOutcomes') {
        const batch = parsedRecords as ArenaOutcomeRecord[];
        const existing = await db.arenaOutcomes.bulkGet(batch.map((b) => b.signalId));
        const toAdd: ArenaOutcomeRecord[] = [];
        for (let j = 0; j < batch.length; j++) {
          if (!existing[j]) {
            toAdd.push(batch[j]);
          }
        }
        if (toAdd.length > 0) {
          await db.arenaOutcomes.bulkAdd(toAdd);
        }
        addedCount += toAdd.length;
        skippedCount += (batch.length - toAdd.length);
      } else if (tableName === 'arenaTrials') {
        const batch = parsedRecords as ArenaTrialRecord[];
        const existing = await db.arenaTrials.bulkGet(batch.map((b) => b.id));
        const toAdd: ArenaTrialRecord[] = [];
        for (let j = 0; j < batch.length; j++) {
          if (!existing[j]) {
            toAdd.push(batch[j]);
          }
        }
        if (toAdd.length > 0) {
          await db.arenaTrials.bulkAdd(toAdd);
        }
        addedCount += toAdd.length;
        skippedCount += (batch.length - toAdd.length);
      } else if (tableName === 'secBets') {
        const batch = parsedRecords as SecBetRecord[];
        const existing = await db.secBets.bulkGet(batch.map((b) => b.id));
        const toAdd = batch.filter((_, j) => !existing[j]);
        if (toAdd.length > 0) await db.secBets.bulkAdd(toAdd);
        addedCount += toAdd.length;
        skippedCount += batch.length - toAdd.length;
      } else if (tableName === 'secTrials') {
        const batch = parsedRecords as SecTrialRecord[];
        const existing = await db.secTrials.bulkGet(batch.map((b) => b.id));
        const toAdd = batch.filter((_, j) => !existing[j]);
        if (toAdd.length > 0) await db.secTrials.bulkAdd(toAdd);
        addedCount += toAdd.length;
        skippedCount += batch.length - toAdd.length;
      }
    }

    summary.tables.push({
      name: tableName,
      file: meta.file,
      totalInFile: lines.length,
      added: addedCount,
      skipped: skippedCount,
      status: 'imported',
    });
  }

  return summary;
}

export async function exportCandlesCsv(): Promise<{ blob: Blob; filename: string }> {
  const candles = await db.candles.toArray();
  candles.sort((a, b) => a.sym.localeCompare(b.sym) || a.tf.localeCompare(b.tf) || a.t - b.t);
  const lines: string[] = ['source,symbol,timeframe,open_time_ms,open_time_utc,open,high,low,close,volume,closed'];
  for (const c of candles) {
    lines.push(
      [c.src, c.sym, c.tf, c.t, new Date(c.t).toISOString(), c.o, c.h, c.l, c.c, c.v, c.closed ? 1 : 0].join(',')
    );
  }
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const filename = `marketscope-candles-${yyyy}-${mm}-${dd}-${hh}${min}.csv`;
  return { blob, filename };
}
