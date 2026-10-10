import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db, type CandleRecord } from '../data/db';
import { nativeBridge } from '../native/nativeBridge';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file data'));
    reader.readAsDataURL(blob);
  });
}

function guessMimeType(filename: string, blobType: string): string {
  if (blobType) return blobType;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

// A file that is already in the app cache is copied to the phone's Downloads/MarketScope folder.
// Only if that is impossible (very old Android) does the share menu open instead.
async function deliverNativeFile(fileUri: string, filename: string, mimeType: string): Promise<void> {
  let savedLocation = '';
  try {
    const result = await nativeBridge.saveToDownloads(fileUri, filename, mimeType);
    savedLocation = result.location;
  } catch (err) {
    savedLocation = '';
  }

  if (savedLocation) {
    try {
      await Filesystem.deleteFile({ path: filename, directory: Directory.Cache });
    } catch (err) {
      // the cache copy is harmless if it cannot be removed
    }
    alert('Saved to ' + savedLocation);
    return;
  }

  try {
    await Share.share({
      title: filename,
      dialogTitle: 'Save or send ' + filename,
      url: fileUri,
    });
  } catch (err: any) {
    const message = String(err?.message || err || '');
    if (!message.toLowerCase().includes('cancel')) throw err;
  }
}

export async function saveAndShareFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
    });
    await deliverNativeFile(written.uri, filename, guessMimeType(filename, blob.type));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function saveBlobChunked(
  blob: Blob,
  filename: string,
  onProgress?: (fraction: number) => void,
  shouldCancel?: () => boolean
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    await saveAndShareFile(blob, filename);
    return;
  }
  const CHUNK = 3 * 1024 * 1024;
  let offset = 0;
  let uri = '';
  while (offset < blob.size) {
    if (shouldCancel && shouldCancel()) {
      try {
        await Filesystem.deleteFile({ path: filename, directory: Directory.Cache });
      } catch (e) {}
      throw new Error('Export cancelled');
    }
    const data = await blobToBase64(blob.slice(offset, offset + CHUNK));
    if (offset === 0) {
      const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
      uri = written.uri;
    } else {
      await Filesystem.appendFile({ path: filename, data, directory: Directory.Cache });
    }
    offset += CHUNK;
    if (onProgress) onProgress(Math.min(1, offset / blob.size));
  }
  await deliverNativeFile(uri, filename, guessMimeType(filename, blob.type));
}

export async function exportCandlesCsvInChunks(onProgress?: (rows: number) => void): Promise<number> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const filename = `marketscope-candles-${yyyy}-${mm}-${dd}-${hh}${min}.csv`;
  const header = 'source,symbol,timeframe,open_time_ms,open_time_utc,open,high,low,close,volume,closed\n';
  const native = Capacitor.isNativePlatform();
  const webParts: string[] = [];
  let fileUri = '';

  if (native) {
    const created = await Filesystem.writeFile({
      path: filename,
      data: header,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    fileUri = created.uri;
  } else {
    webParts.push(header);
  }

  const pageSize = 10000;
  let rows = 0;
  let lastKey: [string, string, string, number] | null = null;

  while (true) {
    const page: CandleRecord[] = lastKey
      ? await db.candles.where('[src+sym+tf+t]').above(lastKey).limit(pageSize).toArray()
      : await db.candles.orderBy('[src+sym+tf+t]').limit(pageSize).toArray();
    if (page.length === 0) break;

    let text = '';
    for (const c of page) {
      text +=
        c.src + ',' + c.sym + ',' + c.tf + ',' + c.t + ',' + new Date(c.t).toISOString() + ',' +
        c.o + ',' + c.h + ',' + c.l + ',' + c.c + ',' + c.v + ',' + (c.closed ? 1 : 0) + '\n';
    }

    if (native) {
      await Filesystem.appendFile({
        path: filename,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
    } else {
      webParts.push(text);
    }

    rows += page.length;
    if (onProgress) onProgress(rows);

    const lastRow = page[page.length - 1];
    lastKey = [lastRow.src, lastRow.sym, lastRow.tf, lastRow.t];
    if (page.length < pageSize) break;
  }

  if (native) {
    await deliverNativeFile(fileUri, filename, 'text/csv');
  } else {
    await saveAndShareFile(new Blob(webParts, { type: 'text/csv' }), filename);
  }

  return rows;
}
