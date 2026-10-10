import JSZip from 'jszip';
import Dexie from 'dexie';
import { db } from '../data/db';

export interface SecondsExportProgress {
  stage: string;
  detail: string;
  percent: number;
}

export const SECONDS_EXPORT_CANCELLED = 'Export cancelled';

export async function exportSecondsZip(
  symbols: string[],
  hours: number | null,
  onProgress: (p: SecondsExportProgress) => void,
  shouldCancel: () => boolean
): Promise<{ blob: Blob; filename: string; rows: number }> {
  const startT = hours === null ? 0 : Date.now() - hours * 3600000;

  let totalRows = 0;
  for (const sym of symbols) {
    const c = await db.secondCandles
      .where('[sym+t]')
      .between([sym, startT], [sym, Dexie.maxKey])
      .count();
    totalRows += c;
  }

  if (totalRows === 0) {
    throw new Error('No seconds stored for the chosen range.');
  }

  if (totalRows > 1000000) {
    throw new Error('Too many rows (' + totalRows.toLocaleString() + '). Choose a shorter range.');
  }

  const zip = new JSZip();
  let done = 0;
  const manifestSymbols: Record<string, { count: number; firstT: number | null; lastT: number | null }> = {};

  const header = 'sym,open_time_ms,open_time_utc,open,high,low,close,volume,trades,taker_buy_base_volume,taker_buy_quote_volume\n';

  for (const sym of symbols) {
    let lower = startT;
    let inclusive = true;
    const lines: string[] = [];
    let symFirstT: number | null = null;
    let symLastT: number | null = null;

    while (true) {
      if (shouldCancel()) {
        throw new Error(SECONDS_EXPORT_CANCELLED);
      }

      const rows = await db.secondCandles
        .where('[sym+t]')
        .between([sym, lower], [sym, Dexie.maxKey], inclusive, true)
        .limit(20000)
        .toArray();

      if (rows.length === 0) {
        break;
      }

      if (symFirstT === null && rows.length > 0) {
        symFirstT = rows[0].t;
      }
      symLastT = rows[rows.length - 1].t;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const line =
          r.sym +
          ',' +
          r.t +
          ',' +
          new Date(r.t).toISOString() +
          ',' +
          r.o +
          ',' +
          r.h +
          ',' +
          r.l +
          ',' +
          r.c +
          ',' +
          r.v +
          ',' +
          (r.nt ?? '') +
          ',' +
          (r.tbv ?? '') +
          ',' +
          (r.tbq ?? '');
        lines.push(line);
      }

      lower = rows[rows.length - 1].t;
      inclusive = false;

      done += rows.length;
      onProgress({
        stage: 'Reading ' + sym,
        detail: done.toLocaleString() + ' of ' + totalRows.toLocaleString() + ' rows',
        percent: Math.round((done / totalRows) * 60),
      });

      await new Promise((r) => setTimeout(r, 0));

      if (shouldCancel()) {
        throw new Error(SECONDS_EXPORT_CANCELLED);
      }

      if (rows.length < 20000) {
        break;
      }
    }

    const csvContent = header + lines.join('\n') + (lines.length > 0 ? '\n' : '');
    zip.file(sym + '_seconds.csv', csvContent);

    manifestSymbols[sym] = {
      count: lines.length,
      firstT: symFirstT,
      lastT: symLastT,
    };
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    source: 'binance',
    interval: '1s',
    symbols,
    rangeHours: hours === null ? 'all' : hours,
    perSymbol: manifestSymbols,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  onProgress({
    stage: 'Compressing',
    detail: 'cannot be cancelled',
    percent: 60,
  });

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } },
    (meta) => {
      onProgress({
        stage: 'Compressing',
        detail: 'cannot be cancelled',
        percent: 60 + Math.round(meta.percent * 0.35),
      });
    }
  );

  if (shouldCancel()) {
    throw new Error(SECONDS_EXPORT_CANCELLED);
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const filename = 'marketscope-seconds-' + yyyy + '-' + mm + '-' + dd + '-' + hh + min + '.zip';

  return { blob, filename, rows: totalRows };
}
