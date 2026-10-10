import Dexie from 'dexie';
import { db, type TickRecord, type QuoteBarRecord, type CandleRecord, type CollectorLogRecord, type SecondCandleRecord, type SecBetRecord, type SecTrialRecord } from '../data/db';
import { BinanceAdapter, type ExchangeAdapter } from './exchangeAdapter';
import { SL_FINDERS, SL_HORIZONS, SL_VERSION, SL_MAX_DELAY_MS, slTrialId } from '../engine/secondsLab';

let adapter: ExchangeAdapter = new BinanceAdapter();
let trackedSymbols: string[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
let dataSource: 'global' | 'us' = 'global';
let recordRawTicks = true;
let rawTickRetentionDays = 3;
let isPaused = false;
let currentAdapterStatus: 'connecting' | 'connected' | 'reconnecting' | 'unreachable' | 'paused' | 'idle' = 'idle';
let reconnectAttempt = 0;
let backfillStatusText: string | null = null;

let secondsEnabled = false;
let secondsRetentionHours = 72;
let secondsTimer: any = null;
let secondsCleanTimer: any = null;
let secondsHealTimer: any = null;
let isHealingSeconds = false;
const secondsHealCursors = new Map<string, number>();
const secondBatch = new Map<string, SecondCandleRecord>();

let secLabEnabled = false;
let secLabRetentionDays = 7;
let secLabTimer: any = null;
let secLabFlushTimer: any = null;
let secLabPruneTimer: any = null;
const secRing = new Map<string, SecondCandleRecord[]>();
const secPending = new Map<string, any[]>();
let secBetBatch: SecBetRecord[] = [];

// Real-time tick coalescing per symbol (at most one stored tick per symbol per 250ms)
const pendingTicksPerSymbol = new Map<string, TickRecord>();
const lastStoredTickTimePerSymbol = new Map<string, number>();

// In-memory quote bars for current minute per symbol
const currentMinuteQuoteBars = new Map<string, QuoteBarRecord>();

// Batches to be written to DB every 1 second
let tickBatch: TickRecord[] = [];
let quoteBarBatch = new Map<string, QuoteBarRecord>();
let candleBatch = new Map<string, CandleRecord>();

// Ticks received in the last 60 seconds for ticks/min calculation
const tickTimestamps: number[] = [];

// Timers
let flushTimer: any = null;
let heartbeatTimer: any = null;
let ticker24hTimer: any = null;
let retentionTimer: any = null;

function calculateTicksPerMin(): number {
  const now = Date.now();
  const cutoff = now - 60000;
  while (tickTimestamps.length > 0 && tickTimestamps[0] < cutoff) {
    tickTimestamps.shift();
  }
  return tickTimestamps.length;
}

function getDynamicStatusLabel(): string {
  if (isPaused) {
    return 'Paused';
  }
  if (currentAdapterStatus === 'unreachable') {
    return 'Data source unreachable';
  }
  if (currentAdapterStatus === 'reconnecting') {
    return `Reconnecting (attempt ${reconnectAttempt})`;
  }
  if (backfillStatusText) {
    return backfillStatusText;
  }
  if (currentAdapterStatus === 'connecting') {
    return 'Connecting...';
  }
  if (currentAdapterStatus === 'connected') {
    const tpm = calculateTicksPerMin();
    return `Collecting: ${trackedSymbols.length} symbols, ${tpm} ticks/min`;
  }
  return 'Initializing';
}

function getStatusState(): 'collecting' | 'reconnecting' | 'unreachable' | 'paused' {
  if (isPaused) return 'paused';
  if (currentAdapterStatus === 'unreachable') return 'unreachable';
  if (currentAdapterStatus === 'reconnecting' || backfillStatusText !== null) return 'reconnecting';
  if (currentAdapterStatus === 'connected') return 'collecting';
  return 'reconnecting';
}

// 1-second batch flush to IndexedDB
async function flushBatches() {
  const ticksToWrite = tickBatch;
  tickBatch = [];

  const quoteBarsToWrite = Array.from(quoteBarBatch.values());
  quoteBarBatch.clear();

  const candlesToWrite = Array.from(candleBatch.values());
  candleBatch.clear();

  const secondsToWrite = Array.from(secondBatch.values());
  secondBatch.clear();

  try {
    if (ticksToWrite.length > 0) {
      await db.ticks.bulkPut(ticksToWrite);
    }
    if (quoteBarsToWrite.length > 0) {
      await db.quoteBars.bulkPut(quoteBarsToWrite);
    }
    if (candlesToWrite.length > 0) {
      await db.candles.bulkPut(candlesToWrite);
    }
  } catch (err) {
    console.error('Worker error flushing batches to Dexie:', err);
  }

  try {
    if (secondsToWrite.length > 0) {
      await db.secondCandles.bulkPut(secondsToWrite);
    }
  } catch (err) {
    console.error('Worker error writing second candles:', err);
  }
}

// Heartbeat every 5 seconds
async function emitHeartbeat() {
  const now = Date.now();
  const ticksPerMin = calculateTicksPerMin();
  const stateLabel = getDynamicStatusLabel();
  const statusState = getStatusState();

  try {
    await db.collectorLog.add({
      t: now,
      type: 'heartbeat',
      state: stateLabel,
      symbols: trackedSymbols,
      ticksPerMin,
    });
  } catch {
    // ignore
  }

  self.postMessage({
    type: 'heartbeat',
    data: {
      t: now,
      state: stateLabel,
      statusState,
      ticksPerMin,
      symbols: trackedSymbols,
      isPaused,
    },
  });
}

// Fetch 24hr change periodically
async function update24hTickers() {
  if (isPaused || currentAdapterStatus !== 'connected') return;
  for (const sym of trackedSymbols) {
    try {
      const res = await adapter.fetch24hr(sym);
      self.postMessage({
        type: 'ticker24h',
        data: res,
      });
    } catch {
      // ignore
    }
  }
}

// Tick message handler
function handleBookTicker(data: any) {
  const sym = data.s;
  if (!trackedSymbols.includes(sym)) return;

  const now = Date.now();
  tickTimestamps.push(now);

  const u = Number(data.u);
  const bid = Number(data.b);
  const bidQty = Number(data.B);
  const ask = Number(data.a);
  const askQty = Number(data.A);

  const tick: TickRecord = {
    src: 'binance',
    sym,
    u,
    t: now,
    bid,
    ask,
    bidQty,
    askQty,
  };

  // Notify UI immediately for ring buffer / live display
  self.postMessage({
    type: 'liveTick',
    data: tick,
  });

  // Continuous quote bar calculation (1-minute quote bar)
  const minuteT = Math.floor(now / 60000) * 60000;
  const quoteKey = `${sym}_${minuteT}`;
  const spread = ask - bid;

  let qBar = currentMinuteQuoteBars.get(quoteKey);
  if (!qBar || qBar.t !== minuteT) {
    qBar = {
      src: 'binance',
      sym,
      t: minuteT,
      bidO: bid,
      bidH: bid,
      bidL: bid,
      bidC: bid,
      askO: ask,
      askH: ask,
      askL: ask,
      askC: ask,
      spreadAvg: spread,
      spreadMax: spread,
      tickCount: 1,
    };
  } else {
    qBar.bidH = Math.max(qBar.bidH, bid);
    qBar.bidL = Math.min(qBar.bidL, bid);
    qBar.bidC = bid;
    qBar.askH = Math.max(qBar.askH, ask);
    qBar.askL = Math.min(qBar.askL, ask);
    qBar.askC = ask;
    qBar.spreadMax = Math.max(qBar.spreadMax, spread);
    qBar.spreadAvg = (qBar.spreadAvg * qBar.tickCount + spread) / (qBar.tickCount + 1);
    qBar.tickCount++;
  }
  currentMinuteQuoteBars.set(quoteKey, qBar);
  quoteBarBatch.set(quoteKey, qBar);

  // Raw tick coalescing: at most one stored tick per symbol per 250 ms (store the latest)
  if (recordRawTicks) {
    pendingTicksPerSymbol.set(sym, tick);
    const lastStored = lastStoredTickTimePerSymbol.get(sym) || 0;
    if (now - lastStored >= 250) {
      lastStoredTickTimePerSymbol.set(sym, now);
      tickBatch.push(tick);
      pendingTicksPerSymbol.delete(sym);
    }
  }
}

const numOrUndef = (x: any): number | undefined => {
  if (x === undefined || x === null) return undefined;
  const v = Number(x);
  return Number.isFinite(v) ? v : undefined;
};

// Kline message handler
function handleKline(data: any) {
  const sym = data.s;
  if (!trackedSymbols.includes(sym)) return;

  const k = data.k;
  const candle: CandleRecord = {
    src: 'binance',
    sym,
    tf: k.i,
    t: Number(k.t),
    o: Number(k.o),
    h: Number(k.h),
    l: Number(k.l),
    c: Number(k.c),
    v: Number(k.v),
    closed: Boolean(k.x),
    nt: numOrUndef(k.n),
    tbv: numOrUndef(k.V),
    tbq: numOrUndef(k.Q),
  };

  const candleKey = `${sym}_${candle.tf}_${candle.t}`;
  candleBatch.set(candleKey, candle);

  self.postMessage({
    type: 'liveCandle',
    data: candle,
  });
}

function handleSecondKline(data: any) {
  const sym = data.s;
  if (!trackedSymbols.includes(sym)) return;

  const k = data.k;
  if (!k || !k.x) return;

  const secNum = (x: any): number | undefined => {
    if (x === undefined || x === null) return undefined;
    const v = Number(x);
    return Number.isFinite(v) ? v : undefined;
  };

  secondBatch.set(sym + '_' + k.t, {
    sym,
    t: Number(k.t),
    o: Number(k.o),
    h: Number(k.h),
    l: Number(k.l),
    c: Number(k.c),
    v: Number(k.v),
    nt: secNum(k.n),
    tbv: secNum(k.V),
    tbq: secNum(k.Q),
  });
  try { secLabOnSecond(sym, { sym, t: Number(k.t), o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c), v: Number(k.v), nt: secNum(k.n), tbv: secNum(k.V), tbq: secNum(k.Q) }); } catch { /* ignore */ }
}

function handleIncomingMessage(msg: any) {
  if (!msg) return;
  const stream = msg.stream;
  const data = msg.data;

  if (stream && stream.includes('@bookTicker')) {
    handleBookTicker(data);
  } else if (stream && stream.includes('@kline_1s')) {
    handleSecondKline(data);
  } else if (stream && stream.includes('@kline_')) {
    handleKline(data);
  }
}

function handleStatusChange(status: any, details?: any) {
  currentAdapterStatus = status;
  if (status === 'reconnecting') {
    reconnectAttempt = details?.attempt || 1;
  } else if (status === 'connected') {
    reconnectAttempt = 0;
    // On reconnect, scan gaps
    setTimeout(scanForGaps, 1000);
  }

  const stateLabel = getDynamicStatusLabel();
  const statusState = getStatusState();

  self.postMessage({
    type: 'status',
    data: {
      status,
      stateLabel,
      statusState,
      details,
    },
  });
}

let scanInProgress = false;

// Scans for gaps, then automatically re-downloads every missing candle from Binance.
async function scanForGaps() {
  if (scanInProgress) return;
  scanInProgress = true;
  try {
    await scanForGapsInner();
    await repairAllGaps();
    await refreshStaleCandles();
  } finally {
    scanInProgress = false;
  }
}

// Scan candles for gaps
async function scanForGapsInner() {
  const intervals: { tf: string; stepMs: number }[] = [
    { tf: '1m', stepMs: 60 * 1000 },
    { tf: '5m', stepMs: 5 * 60 * 1000 },
    { tf: '15m', stepMs: 15 * 60 * 1000 },
    { tf: '1h', stepMs: 60 * 60 * 1000 },
    { tf: '4h', stepMs: 4 * 60 * 60 * 1000 },
    { tf: '1d', stepMs: 24 * 60 * 60 * 1000 },
  ];

  for (const sym of trackedSymbols) {
    for (const { tf, stepMs } of intervals) {
      try {
        const seriesRange = db.candles
          .where('[src+sym+tf+t]')
          .between(['binance', sym, tf, Dexie.minKey], ['binance', sym, tf, Dexie.maxKey]);

        const seriesCount = await seriesRange.count();
        if (seriesCount < 2) continue;

        const firstCandle = await seriesRange.first();
        const lastCandle = await seriesRange.last();
        if (!firstCandle || !lastCandle) continue;

        // Fast check: if every step between the first and last candle is present, there are no gaps.
        if (seriesCount === Math.round((lastCandle.t - firstCandle.t) / stepMs) + 1) continue;

        const gapPairs: { curr: number; next: number }[] = [];
        let previousT: number | null = null;
        await seriesRange.each((c) => {
          if (previousT !== null && c.t - previousT > stepMs * 1.5) {
            gapPairs.push({ curr: previousT, next: c.t });
          }
          previousT = c.t;
        });

        for (const pair of gapPairs) {
          const curr = pair.curr;
          const next = pair.next;
          const diff = next - curr;

          if (diff > stepMs * 1.5) {
            // Gap detected!
            const from = curr + stepMs;
            const to = next - stepMs;

            // Check if already logged
            const existing = await db.collectorLog
              .where('type')
              .equals('gap')
              .filter((log) => log.sym === sym && log.tf === tf && log.from === from && log.to === to)
              .first();

            if (!existing) {
              await db.collectorLog.add({
                t: Date.now(),
                type: 'gap',
                src: 'binance',
                sym,
                tf,
                from,
                to,
                status: 'open',
                message: `Missing candles from ${new Date(from).toISOString()} to ${new Date(to).toISOString()}`,
              });
            }
          }
        }
      } catch (err) {
        console.error('Error scanning gaps for', sym, tf, err);
      }
    }
  }

  // Also check tick gaps: tick gaps cannot be recovered
  // Binance provides no historical order book / best bid/ask
  // Check ticks range
  for (const sym of trackedSymbols) {
    try {
      const windowStart = Date.now() - 6 * 60 * 60 * 1000;
      const ticks: { t: number }[] = [];
      const lastBeforeWindow = await db.ticks
        .where('[sym+t]')
        .between([sym, Dexie.minKey], [sym, windowStart], true, false)
        .last();
      if (lastBeforeWindow) ticks.push({ t: lastBeforeWindow.t });
      await db.ticks
        .where('[sym+t]')
        .between([sym, windowStart], [sym, Dexie.maxKey], true, true)
        .each((tk) => {
          ticks.push({ t: tk.t });
        });

      if (ticks.length >= 2) {
        for (let i = 0; i < ticks.length - 1; i++) {
          const diff = ticks[i + 1].t - ticks[i].t;
          // If gap > 2 minutes in active trading
          if (diff > 120000) {
            const from = ticks[i].t;
            const to = ticks[i + 1].t;
            const existing = await db.collectorLog
              .where('type')
              .equals('gap')
              .filter((log) => log.sym === sym && log.tf === 'ticks' && log.from === from)
              .first();

            if (!existing) {
              await db.collectorLog.add({
                t: Date.now(),
                type: 'gap',
                src: 'binance',
                sym,
                tf: 'ticks',
                from,
                to,
                status: 'unrecoverable',
                message: 'Tick gaps cannot be recovered (Binance provides no history for best bid/ask)',
              });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  self.postMessage({ type: 'gapsUpdated' });
}

// Repair candle gaps by paginating REST klines
async function repairGap(gapId: number) {
  const gap = await db.collectorLog.get(gapId);
  if (!gap || gap.status !== 'open' || !gap.sym || !gap.tf || !gap.from || !gap.to) {
    return;
  }

  if (gap.tf === 'ticks') {
    // Tick gaps are unrecoverable
    await db.collectorLog.update(gapId, { status: 'unrecoverable' });
    self.postMessage({ type: 'gapsUpdated' });
    return;
  }

  const sym = gap.sym;
  const tf = gap.tf;
  let currentStartTime = gap.from;
  const endTime = gap.to;

  backfillStatusText = `Backfilling ${sym} ${tf} (0%)`;
  emitHeartbeat();

  try {
    while (currentStartTime < endTime) {
      const klines = await adapter.fetchKlines(sym, tf, currentStartTime, 1000);
      if (klines.length === 0) break;

      const candlesToAdd: CandleRecord[] = klines.map((k) => ({
        src: 'binance',
        sym,
        tf,
        t: k.openTime,
        o: k.open,
        h: k.high,
        l: k.low,
        c: k.close,
        v: k.volume,
        closed: k.isClosed,
      }));

      await db.candles.bulkPut(candlesToAdd);

      const lastKline = klines[klines.length - 1];
      const progress = Math.min(100, Math.round(((lastKline.openTime - gap.from) / (endTime - gap.from)) * 100));
      backfillStatusText = `Backfilling ${sym} ${tf} (${progress}%)`;
      emitHeartbeat();

      if (lastKline.closeTime >= endTime || lastKline.openTime === currentStartTime) {
        break;
      }
      currentStartTime = lastKline.openTime + 1;
    }

    await db.collectorLog.update(gapId, { status: 'repaired' });
  } catch (err) {
    console.error('Failed to repair gap:', err);
  } finally {
    backfillStatusText = null;
    emitHeartbeat();
    self.postMessage({ type: 'gapsUpdated' });
  }
}

async function repairAllGaps() {
  const openGaps = await db.collectorLog
    .where('type')
    .equals('gap')
    .filter((g) => g.status === 'open')
    .toArray();

  for (const gap of openGaps) {
    if (gap.id) {
      await repairGap(gap.id);
    }
  }
}

// Raw tick retention job: rolls older ticks into quote bars and deletes them
async function cleanOldTicks() {
  if (!rawTickRetentionDays || rawTickRetentionDays <= 0) return;
  const cutoff = Date.now() - rawTickRetentionDays * 24 * 60 * 60 * 1000;

  try {
    // Delete ticks older than retention cutoff
    await db.ticks.where('t').below(cutoff).delete();
  } catch (err) {
    console.error('Error running raw tick cleanup:', err);
  }
}

async function applySecondsSetting() {
  try {
    const row = await db.settings.get('secondsCapture');
    const v: any = row && row.value ? row.value : {};
    const enabled = typeof v.enabled === 'boolean' ? v.enabled : true;
    const hours = [24, 72, 168].includes(Number(v.retentionHours)) ? Number(v.retentionHours) : 72;
    secondsRetentionHours = hours;
    if (enabled !== secondsEnabled) {
      secondsEnabled = enabled;
      adapter.setSecondsEnabled?.(enabled);
      if (!enabled) {
        if (secondsHealTimer) {
          clearInterval(secondsHealTimer);
          secondsHealTimer = null;
        }
      } else if (!isPaused && !secondsHealTimer) {
        await loadHealCursors();
        secondsHealTimer = setInterval(healSecondsStep, 1000);
      }
    }
  } catch {
    /* ignore */
  }
}

async function cleanOldSeconds() {
  try {
    const cutoff = Date.now() - secondsRetentionHours * 3600000;
    await db.secondCandles.where('t').below(cutoff).delete();
  } catch (err) {
    console.error('Second candle cleanup error:', err);
  }
}

async function loadHealCursors() {
  try {
    const row = await db.settings.get('secondsHealCursors');
    if (row && row.value && typeof row.value === 'object') {
      for (const [k, v] of Object.entries(row.value)) {
        if (typeof v === 'number') {
          secondsHealCursors.set(k, v);
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function saveHealCursors() {
  try {
    const obj: Record<string, number> = {};
    for (const [k, v] of secondsHealCursors.entries()) {
      obj[k] = v;
    }
    await db.settings.put({ key: 'secondsHealCursors', value: obj });
  } catch {
    /* ignore */
  }
}

async function healSecondsStep() {
  if (!secondsEnabled || isPaused || isHealingSeconds) return;
  isHealingSeconds = true;

  try {
    const now = Date.now();
    const targetEndTime = now - 10 * 60 * 1000;
    const windowStart = now - secondsRetentionHours * 3600000;

    let advancedAny = false;

    for (const sym of trackedSymbols) {
      if (!secondsEnabled || isPaused) break;

      let cursor = secondsHealCursors.get(sym);
      if (cursor === undefined) {
        const first = await db.secondCandles
          .where('[sym+t]')
          .between([sym, windowStart], [sym, Dexie.maxKey])
          .first();
        cursor = first ? Math.max(windowStart, first.t) : windowStart;
        secondsHealCursors.set(sym, cursor);
        advancedAny = true;
      }

      if (cursor < windowStart) {
        cursor = windowStart;
        secondsHealCursors.set(sym, cursor);
        advancedAny = true;
      }

      if (cursor >= targetEndTime) {
        continue;
      }

      const existing = await db.secondCandles
        .where('[sym+t]')
        .between([sym, cursor], [sym, targetEndTime])
        .limit(1001)
        .toArray();

      if (existing.length > 0 && existing[0].t === cursor) {
        let contiguous = cursor;
        for (const c of existing) {
          if (c.t === contiguous) {
            contiguous += 1000;
          } else {
            break;
          }
        }
        cursor = contiguous;
        secondsHealCursors.set(sym, cursor);
        advancedAny = true;
        if (cursor >= targetEndTime) {
          continue;
        }
      }

      const nextExistingTime =
        existing.length > 0 && existing[0].t > cursor ? existing[0].t : targetEndTime;

      const gapSeconds = Math.ceil((nextExistingTime - cursor) / 1000);
      const limit = Math.min(1000, Math.max(1, gapSeconds));

      try {
        const klines = await adapter.fetchKlines(sym, '1s', cursor, limit);
        if (klines && klines.length > 0) {
          const valid = klines.filter((k) => k.openTime <= targetEndTime);
          const records: SecondCandleRecord[] = valid.map((k) => ({
            sym,
            t: k.openTime,
            o: k.open,
            h: k.high,
            l: k.low,
            c: k.close,
            v: k.volume,
            nt: k.trades,
            tbv: k.takerBuyBase,
            tbq: k.takerBuyQuote,
          }));

          if (records.length > 0) {
            await db.secondCandles.bulkPut(records);
          }

          const lastTime = klines[klines.length - 1].openTime;
          cursor = Math.max(cursor + 1000, lastTime + 1000);
          secondsHealCursors.set(sym, cursor);
          advancedAny = true;
        } else {
          cursor = Math.min(cursor + 1000 * 1000, nextExistingTime);
          secondsHealCursors.set(sym, cursor);
          advancedAny = true;
        }
      } catch (err) {
        console.warn(`[SecondsHealer] Error fetching 1s klines for ${sym}:`, err);
        break;
      }

      await new Promise((r) => setTimeout(r, 80));
    }

    if (advancedAny) {
      await saveHealCursors();
    }
  } catch (err) {
    console.error('[SecondsHealer] Healing error:', err);
  } finally {
    isHealingSeconds = false;
  }
}

function secLabOnSecond(sym: string, c: SecondCandleRecord) {
  if (!secLabEnabled) return;

  let ring = secRing.get(sym);
  if (!ring) {
    ring = [];
    secRing.set(sym, ring);
  }
  if (ring.length > 0 && c.t <= ring[ring.length - 1].t) return;
  ring.push(c);
  while (ring.length > 12) {
    ring.shift();
  }

  // 2. Resolve pending bets of this sym
  const pendingList = secPending.get(sym) || [];
  const remainingPending: any[] = [];
  const now = Date.now();

  for (const p of pendingList) {
    if (p.exitT === c.t) {
      const outcome: 'won' | 'lost' | 'tie' =
        c.c === p.entryPrice
          ? 'tie'
          : p.dir === 'up'
          ? c.c > p.entryPrice
            ? 'won'
            : 'lost'
          : c.c < p.entryPrice
          ? 'won'
          : 'lost';
      const exitPrice = c.c;
      const pct =
        ((p.dir === 'up' ? 1 : -1) * (c.c - p.entryPrice)) /
        p.entryPrice *
        100;
      const bet: SecBetRecord = {
        id: p.id,
        trialId: p.trialId,
        finderId: p.finderId,
        finderVersion: p.finderVersion,
        sym: p.sym,
        h: p.h,
        dir: p.dir,
        decisionT: p.decisionT,
        entryObsT: p.entryObsT,
        entryPrice: p.entryPrice,
        delayMs: p.delayMs,
        eligible: p.eligible,
        exitPrice,
        outcome,
        exitObsT: now,
        pct,
      };
      secBetBatch.push(bet);
    } else if (p.exitT < c.t) {
      const bet: SecBetRecord = {
        id: p.id,
        trialId: p.trialId,
        finderId: p.finderId,
        finderVersion: p.finderVersion,
        sym: p.sym,
        h: p.h,
        dir: p.dir,
        decisionT: p.decisionT,
        entryObsT: p.entryObsT,
        entryPrice: p.entryPrice,
        delayMs: p.delayMs,
        eligible: p.eligible,
        outcome: 'expired',
        exitObsT: now,
      };
      secBetBatch.push(bet);
    } else {
      remainingPending.push(p);
    }
  }
  secPending.set(sym, remainingPending);

  // 3. Decide only if c.t % 60000 === 59000
  if (c.t % 60000 !== 59000) return;
  if (ring.length < 11) return;
  const w = ring.slice(ring.length - 11);
  for (let i = 1; i < 11; i++) {
    if (w[i].t !== w[i - 1].t + 1000) return;
  }

  const entryObsT = c.t + 1000;
  const decisionT = Date.now();
  const delayMs = decisionT - entryObsT;
  const eligible = delayMs <= SL_MAX_DELAY_MS;

  // 4. Directions
  const finderDirs: { finderId: string; dir: 'up' | 'down' }[] = [];

  // coin: 'up' if Math.random() < 0.5 else 'down'.
  finderDirs.push({
    finderId: 'coin',
    dir: Math.random() < 0.5 ? 'up' : 'down',
  });

  // mom5: d = w[10].c - w[5].c; 'up' if d > 0, 'down' if d < 0, no bet if d === 0.
  const dMom5 = w[10].c - w[5].c;
  if (dMom5 > 0) {
    finderDirs.push({ finderId: 'mom5', dir: 'up' });
  } else if (dMom5 < 0) {
    finderDirs.push({ finderId: 'mom5', dir: 'down' });
  }

  // rev5: the opposite of mom5 (no bet if d === 0).
  if (dMom5 > 0) {
    finderDirs.push({ finderId: 'rev5', dir: 'down' });
  } else if (dMom5 < 0) {
    finderDirs.push({ finderId: 'rev5', dir: 'up' });
  }

  // flow10: over w[1]..w[10], if any candle has tbv undefined or the volume sum is 0 -> no bet; share = sum(tbv) / sum(v); 'up' if share >= 0.55, 'down' if share <= 0.45, otherwise no bet.
  let flowValid = true;
  let sumTbv = 0;
  let sumVol = 0;
  for (let i = 1; i <= 10; i++) {
    const item = w[i];
    if (item.tbv === undefined || item.tbv === null) {
      flowValid = false;
      break;
    }
    sumTbv += item.tbv;
    sumVol += item.v;
  }
  if (flowValid && sumVol > 0) {
    const share = sumTbv / sumVol;
    if (share >= 0.55) {
      finderDirs.push({ finderId: 'flow10', dir: 'up' });
    } else if (share <= 0.45) {
      finderDirs.push({ finderId: 'flow10', dir: 'down' });
    }
  }

  // 5. For every finder that produced a direction and every h in SL_HORIZONS
  for (const { finderId, dir } of finderDirs) {
    for (const h of SL_HORIZONS) {
      const trialId = slTrialId(finderId, sym, h);
      remainingPending.push({
        id: trialId + '|' + entryObsT,
        trialId,
        finderId,
        finderVersion: SL_VERSION,
        sym,
        h,
        dir,
        decisionT,
        entryObsT,
        entryPrice: c.c,
        delayMs,
        eligible,
        exitT: c.t + h * 1000,
      });
    }
  }
}

async function flushSecLab() {
  const batch = secBetBatch;
  secBetBatch = [];
  if (batch.length > 0) {
    try {
      await db.secBets.bulkAdd(batch);
    } catch {
      /* duplicate ids are ignored, other rows are still added */
    }
  }
}

async function applySecLabSetting() {
  try {
    const row = await db.settings.get('secLab');
    const value: any = row && row.value ? row.value : {};
    const enabled = typeof value.enabled === 'boolean' ? value.enabled : true;
    secLabRetentionDays = [7, 14, 30].includes(Number(value.retentionDays))
      ? Number(value.retentionDays)
      : 7;

    if (enabled) {
      const now = Date.now();
      for (const sym of trackedSymbols) {
        for (const finderId of SL_FINDERS) {
          for (const h of SL_HORIZONS) {
            const id = slTrialId(finderId, sym, h);
            try {
              await db.secTrials.add({
                id,
                createdAt: now,
                finderId,
                sym,
                h,
              });
            } catch {
              // an existing id is ignored; never overwrite
            }
          }
        }
      }
    }

    if (!enabled && secLabEnabled) {
      secRing.clear();
      secPending.clear();
    }
    secLabEnabled = enabled;
  } catch {
    /* ignore */
  }
}

async function pruneSecBets() {
  try {
    await db.secBets.where('decisionT').below(Date.now() - secLabRetentionDays * 86400000).delete();
  } catch {
    /* ignore */
  }
}

function startCollector() {
  adapter.setHost(dataSource);
  adapter.connect(trackedSymbols, handleIncomingMessage, handleStatusChange);

  if (!flushTimer) {
    flushTimer = setInterval(flushBatches, 1000);
  }
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(emitHeartbeat, 5000);
  }
  if (!ticker24hTimer) {
    update24hTickers();
    ticker24hTimer = setInterval(update24hTickers, 60000);
  }
  if (!retentionTimer) {
    cleanOldTicks();
    retentionTimer = setInterval(cleanOldTicks, 24 * 60 * 60 * 1000);
  }
  if (!secondsTimer) {
    secondsTimer = setInterval(applySecondsSetting, 30000);
  }
  if (!secondsCleanTimer) {
    cleanOldSeconds();
    secondsCleanTimer = setInterval(cleanOldSeconds, 600000);
  }
  if (!secondsHealTimer) {
    loadHealCursors().then(() => {
      if (secondsEnabled && !secondsHealTimer) {
        secondsHealTimer = setInterval(healSecondsStep, 1000);
      }
    });
  }
  if (!secLabTimer) secLabTimer = setInterval(applySecLabSetting, 30000);
  if (!secLabFlushTimer) secLabFlushTimer = setInterval(flushSecLab, 1000);
  if (!secLabPruneTimer) {
    pruneSecBets();
    secLabPruneTimer = setInterval(pruneSecBets, 6 * 3600000);
  }
}

function stopCollector() {
  adapter.disconnect();
  isPaused = true;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (secondsTimer) {
    clearInterval(secondsTimer);
    secondsTimer = null;
  }
  if (secondsCleanTimer) {
    clearInterval(secondsCleanTimer);
    secondsCleanTimer = null;
  }
  if (secondsHealTimer) {
    clearInterval(secondsHealTimer);
    secondsHealTimer = null;
  }
  if (secLabTimer) {
    clearInterval(secLabTimer);
    secLabTimer = null;
  }
  if (secLabFlushTimer) {
    clearInterval(secLabFlushTimer);
    secLabFlushTimer = null;
  }
  if (secLabPruneTimer) {
    clearInterval(secLabPruneTimer);
    secLabPruneTimer = null;
  }
  flushSecLab();
  flushBatches();
  emitHeartbeat();
}

// ===== Past chart download and unfinished-candle refresh =====
const HISTORY_STEP_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const HISTORY_MAX_PER_SERIES = 2000000;
let historyRunning = false;
let historyCancelRequested = false;

function postHistoryProgress(running: boolean, percent: number, text: string) {
  self.postMessage({
    type: 'historyProgress',
    data: { running, percent: Math.max(0, Math.min(100, Math.round(percent))), text },
  });
}

// Works out which candle times still have to be downloaded. weExclusive is the end of the wanted window (exclusive).
function planHistoryParts(
  ws: number,
  weExclusive: number,
  stepMs: number,
  firstSaved: number | null,
  lastSaved: number | null,
  savedPartComplete: boolean
): { from: number; until: number }[] {
  if (firstSaved === null || lastSaved === null || !savedPartComplete) {
    return [{ from: ws, until: weExclusive }];
  }
  const parts: { from: number; until: number }[] = [];
  if (ws < firstSaved) {
    parts.push({ from: ws, until: Math.min(weExclusive, firstSaved) });
  }
  if (weExclusive - stepMs > lastSaved) {
    parts.push({ from: Math.max(ws, lastSaved), until: weExclusive });
  }
  return parts.filter((p) => p.until > p.from);
}

async function downloadHistory(symbols: string[], timeframes: string[], fromMs: number, toMs: number) {
  if (historyRunning) return;
  historyRunning = true;
  historyCancelRequested = false;

  const series: { sym: string; tf: string }[] = [];
  for (const sym of symbols) {
    for (const tf of timeframes) {
      if (HISTORY_STEP_MS[tf]) series.push({ sym, tf });
    }
  }

  let totalSaved = 0;
  let percent = 0;
  postHistoryProgress(true, 0, 'Checking what is already saved...');

  try {
    for (let index = 0; index < series.length; index++) {
      const { sym, tf } = series[index];
      const stepMs = HISTORY_STEP_MS[tf];
      const nowAtStart = Date.now();
      const wantedEnd = Math.floor(Math.min(toMs, nowAtStart) / stepMs) * stepMs;
      const wantedStart =
        Math.floor(Math.max(fromMs, wantedEnd - (HISTORY_MAX_PER_SERIES - 1) * stepMs) / stepMs) * stepMs;
      if (wantedEnd < wantedStart) continue;
      const weExclusive = wantedEnd + stepMs;

      // Look at what is already saved so it is not downloaded again.
      const allSaved = db.candles
        .where('[src+sym+tf+t]')
        .between(['binance', sym, tf, Dexie.minKey], ['binance', sym, tf, Dexie.maxKey]);
      const firstSavedRow = await allSaved.first();
      const lastSavedRow = await allSaved.last();
      const firstSaved = firstSavedRow ? firstSavedRow.t : null;
      const lastSaved = lastSavedRow ? lastSavedRow.t : null;

      let savedPartComplete = true;
      if (firstSaved !== null && lastSaved !== null) {
        const overlapFrom = Math.max(wantedStart, firstSaved);
        const overlapTo = Math.min(wantedEnd, lastSaved);
        if (overlapTo >= overlapFrom) {
          const savedCount = await db.candles
            .where('[src+sym+tf+t]')
            .between(['binance', sym, tf, overlapFrom], ['binance', sym, tf, overlapTo], true, true)
            .count();
          const expectedCount = Math.round((overlapTo - overlapFrom) / stepMs) + 1;
          savedPartComplete = savedCount === expectedCount;
        }
      }

      const parts = planHistoryParts(wantedStart, weExclusive, stepMs, firstSaved, lastSaved, savedPartComplete);

      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];
        let start = part.from;

        while (true) {
          if (historyCancelRequested) {
            postHistoryProgress(false, percent, 'Cancelled. ' + totalSaved.toLocaleString() + ' candles were saved.');
            return;
          }

          const klines = await adapter.fetchKlines(sym, tf, start, 1000);
          if (klines.length === 0) break;

          const nowMs = Date.now();
          const records: CandleRecord[] = klines
            .filter((k) => k.closeTime < nowMs && k.openTime < part.until)
            .map((k) => ({
              src: 'binance',
              sym,
              tf,
              t: k.openTime,
              o: k.open,
              h: k.high,
              l: k.low,
              c: k.close,
              v: k.volume,
              closed: true,
            }));
          if (records.length > 0) {
            await db.candles.bulkPut(records);
            totalSaved += records.length;
          }

          const last = klines[klines.length - 1];
          const partFraction = Math.min(
            1,
            Math.max(0, (last.openTime - part.from) / Math.max(1, Math.min(nowMs, part.until) - part.from))
          );
          const seriesFraction = (partIndex + partFraction) / parts.length;
          percent = ((index + seriesFraction) / series.length) * 100;
          postHistoryProgress(true, percent, 'Downloading ' + sym + ' ' + tf + ' - ' + totalSaved.toLocaleString() + ' new candles saved');

          const next = last.openTime + stepMs;
          if (klines.length < 1000 || last.closeTime >= nowMs || next >= part.until || next <= start) break;
          start = next;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    }
    postHistoryProgress(false, 100, 'Done. ' + totalSaved.toLocaleString() + ' candles saved (candles you already had were skipped).');
  } catch (err: any) {
    postHistoryProgress(
      false,
      percent,
      'Stopped: ' + String(err?.message || err) + '. ' + totalSaved.toLocaleString() + ' candles were saved. Press Start download again to continue.'
    );
  } finally {
    historyRunning = false;
    self.postMessage({ type: 'gapsUpdated' });
    setTimeout(scanForGaps, 1000);
  }
}

// Re-downloads recent candles that were saved as unfinished but have since closed (their final update was missed).
async function refreshStaleCandles() {
  const nowMs = Date.now();
  const windowStart = nowMs - 7 * 24 * 60 * 60 * 1000;
  let fixedAny = false;

  for (const sym of trackedSymbols) {
    for (const tf of Object.keys(HISTORY_STEP_MS)) {
      const stepMs = HISTORY_STEP_MS[tf];
      try {
        const stale = await db.candles
          .where('[src+sym+tf+t]')
          .between(['binance', sym, tf, windowStart], ['binance', sym, tf, Dexie.maxKey])
          .filter((c) => !c.closed && c.t + stepMs <= nowMs - 5000)
          .toArray();
        if (stale.length === 0) continue;

        let start = stale[0].t;
        for (const c of stale) {
          if (c.t < start) start = c.t;
        }

        let rounds = 0;
        while (rounds < 30) {
          rounds++;
          const klines = await adapter.fetchKlines(sym, tf, start, 1000);
          if (klines.length === 0) break;
          const checkMs = Date.now();
          const fixed: CandleRecord[] = klines
            .filter((k) => k.closeTime < checkMs)
            .map((k) => ({
              src: 'binance',
              sym,
              tf,
              t: k.openTime,
              o: k.open,
              h: k.high,
              l: k.low,
              c: k.close,
              v: k.volume,
              closed: true,
            }));
          if (fixed.length > 0) {
            await db.candles.bulkPut(fixed);
            fixedAny = true;
          }
          const last = klines[klines.length - 1];
          const next = last.openTime + stepMs;
          if (klines.length < 1000 || next <= start) break;
          start = next;
        }
      } catch (err) {
        console.error('Error refreshing unfinished candles for', sym, tf, err);
      }
    }
  }

  if (fixedAny) {
    self.postMessage({ type: 'gapsUpdated' });
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init': {
      if (data) {
        if (data.dataSource) dataSource = data.dataSource;
        if (data.trackedSymbols) trackedSymbols = data.trackedSymbols;
        if (typeof data.recordRawTicks === 'boolean') recordRawTicks = data.recordRawTicks;
        if (data.rawTickRetentionDays) rawTickRetentionDays = data.rawTickRetentionDays;
        if (typeof data.collectorPaused === 'boolean') isPaused = data.collectorPaused;
      }
      if (!isPaused) {
        await applySecondsSetting();
        await applySecLabSetting();
        startCollector();
      } else {
        currentAdapterStatus = 'paused';
        emitHeartbeat();
      }
      // Scan gaps on start
      setTimeout(scanForGaps, 2000);
      break;
    }

    case 'pause': {
      isPaused = true;
      stopCollector();
      break;
    }

    case 'resume': {
      isPaused = false;
      await applySecondsSetting();
      await applySecLabSetting();
      startCollector();
      break;
    }

    case 'setDataSource': {
      dataSource = data;
      adapter.setHost(dataSource);
      break;
    }

    case 'setTrackedSymbols': {
      trackedSymbols = data;
      adapter.subscribe(trackedSymbols);
      update24hTickers();
      break;
    }

    case 'setRecordRawTicks': {
      recordRawTicks = data;
      break;
    }

    case 'setRetentionDays': {
      rawTickRetentionDays = data;
      cleanOldTicks();
      break;
    }

    case 'scanGaps': {
      await scanForGaps();
      break;
    }

    case 'repairGap': {
      if (data?.gapId) {
        await repairGap(data.gapId);
      }
      break;
    }

    case 'repairAllGaps': {
      await repairAllGaps();
      break;
    }

    case 'downloadHistory': {
      if (data && Array.isArray(data.symbols) && Array.isArray(data.timeframes) && typeof data.fromMs === 'number') {
        downloadHistory(data.symbols, data.timeframes, data.fromMs, typeof data.toMs === 'number' ? data.toMs : Date.now());
      }
      break;
    }

    case 'cancelHistory': {
      historyCancelRequested = true;
      break;
    }
  }
};
