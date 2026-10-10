import Dexie from 'dexie';
import { db } from '../data/db';
import { getSetting, setSetting } from '../data/repositories';
import { TF_MS } from '../engine/predictor';
import { candleLetters } from '../engine/discovery';
import { breakEven } from '../engine/arena';
import {
  mineSlice,
  MINER_TYPES,
  type MinerTypeId,
  type MinerCandle,
  type LibEntry,
} from '../engine/miner';

export interface MinerConfig {
  enabled: boolean;
  sym: string;
  tf: string;
  windowDays: number;
}

export interface MinerState {
  sym: string;
  tf: string;
  windowDays: number;
  doneSlices: number[];
  typeIdx: number;
  sliceIdx: number | null;
  jobs: number;
  totalSlices: number;
  status: string;
  lastRunAt: number;
}

export interface MinerLibrary {
  entries: Record<string, LibEntry>;
  kKeys: string[];
}

const DEFAULT_CONFIG: MinerConfig = {
  enabled: false,
  sym: 'BTCUSDT',
  tf: '1m',
  windowDays: 7,
};

const DEFAULT_STATE: MinerState = {
  sym: 'BTCUSDT',
  tf: '1m',
  windowDays: 7,
  doneSlices: [],
  typeIdx: 0,
  sliceIdx: null,
  jobs: 0,
  totalSlices: 0,
  status: 'Not started',
  lastRunAt: 0,
};

const DEFAULT_LIBRARY: MinerLibrary = {
  entries: {},
  kKeys: [],
};

const listeners = new Set<() => void>();

function notifyListeners() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

export function subscribeMiner(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getMinerConfig(): Promise<MinerConfig> {
  return await getSetting<MinerConfig>('minerConfig', DEFAULT_CONFIG);
}

export async function setMinerConfig(cfg: MinerConfig): Promise<void> {
  await setSetting('minerConfig', cfg);
  notifyListeners();
}

export async function getMinerState(): Promise<MinerState> {
  return await getSetting<MinerState>('minerState', DEFAULT_STATE);
}

async function setMinerState(st: MinerState): Promise<void> {
  await setSetting('minerState', st);
  notifyListeners();
}

export async function getMinerLibrary(): Promise<MinerLibrary> {
  return await getSetting<MinerLibrary>('minerLibrary', DEFAULT_LIBRARY);
}

async function setMinerLibrary(lib: MinerLibrary): Promise<void> {
  await setSetting('minerLibrary', lib);
  notifyListeners();
}

let isRunning = false;
let stopRequested = false;

export function isMinerRunning(): boolean {
  return isRunning;
}

export function stopMiner(): void {
  stopRequested = true;
}

export async function resetMiner(): Promise<void> {
  stopMiner();
  const cfg = await getMinerConfig();
  await setMinerState({
    ...DEFAULT_STATE,
    sym: cfg.sym,
    tf: cfg.tf,
    windowDays: cfg.windowDays,
  });
  await setMinerLibrary({ entries: {}, kKeys: [] });
  notifyListeners();
}

export function startMiner(): void {
  if (isRunning) return;
  stopRequested = false;
  runLoop().catch(() => {});
}

export async function resumeMinerIfEnabled(): Promise<void> {
  const cfg = await getMinerConfig();
  if (cfg.enabled) {
    startMiner();
  }
}

async function runLoop(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    while (!stopRequested) {
      try {
        const config = await getMinerConfig();
        if (!config.enabled) {
          break;
        }

        let state = await getMinerState();
        let library = await getMinerLibrary();

        // a) If state.sym, state.tf or state.windowDays differ from config, reset state & library first
        if (
          state.sym !== config.sym ||
          state.tf !== config.tf ||
          state.windowDays !== config.windowDays
        ) {
          state = {
            ...DEFAULT_STATE,
            sym: config.sym,
            tf: config.tf,
            windowDays: config.windowDays,
          };
          library = { entries: {}, kKeys: [] };
          await setMinerState(state);
          await setMinerLibrary(library);
        }

        const sym = config.sym;
        const tf = config.tf;
        const windowDays = config.windowDays;
        const stepMs = TF_MS[tf] || 60000;
        const blockMs = windowDays * 86400000;

        // b) Find first and last closed candle
        const firstCandle = await db.candles
          .where('[src+sym+tf+t]')
          .between(['binance', sym, tf, Dexie.minKey], ['binance', sym, tf, Dexie.maxKey])
          .filter((r) => !!r.closed)
          .first();

        const lastCandle = await db.candles
          .where('[src+sym+tf+t]')
          .between(['binance', sym, tf, Dexie.minKey], ['binance', sym, tf, Dexie.maxKey])
          .filter((r) => !!r.closed)
          .last();

        if (!firstCandle || !lastCandle) {
          state.status = `No stored candles for ${sym} ${tf}`;
          await setMinerState(state);
          for (let s = 0; s < 60 && !stopRequested; s++) {
            await new Promise((r) => setTimeout(r, 1000));
          }
          continue;
        }

        const firstT = firstCandle.t;
        const lastT = lastCandle.t;

        const kMin = Math.ceil(firstT / blockMs);
        const kMax = Math.floor((lastT + stepMs) / blockMs) - 1;
        const totalSlices = Math.max(0, kMax - kMin + 1);
        state.totalSlices = totalSlices;

        // c) Pick the NEWEST complete slice not in state.doneSlices
        const doneSet = new Set(state.doneSlices);
        let chosenSlice: number | null = null;

        // If sliceIdx was set and not in doneSlices, resume that slice
        if (
          state.sliceIdx !== null &&
          !doneSet.has(state.sliceIdx) &&
          state.sliceIdx >= kMin &&
          state.sliceIdx <= kMax
        ) {
          chosenSlice = state.sliceIdx;
        } else {
          for (let k = kMax; k >= kMin; k--) {
            if (!doneSet.has(k)) {
              chosenSlice = k;
              break;
            }
          }
        }

        if (chosenSlice === null) {
          state.status = 'Up to date. Waiting for more data.';
          state.sliceIdx = null;
          state.typeIdx = 0;
          await setMinerState(state);
          for (let s = 0; s < 60 && !stopRequested; s++) {
            await new Promise((r) => setTimeout(r, 1000));
          }
          continue;
        }

        const k = chosenSlice;
        state.sliceIdx = k;

        // d) Load candles for chosen slice
        const rawCandles = await db.candles
          .where('[src+sym+tf+t]')
          .between(
            ['binance', sym, tf, k * blockMs - 200 * stepMs],
            ['binance', sym, tf, (k + 1) * blockMs - 1],
            true,
            true
          )
          .filter((r) => !!r.closed)
          .toArray();

        rawCandles.sort((a, b) => a.t - b.t);

        const loadedCandles: MinerCandle[] = rawCandles.map((r) => ({
          t: r.t,
          o: r.o,
          h: r.h,
          l: r.l,
          c: r.c,
          v: r.v,
          tbv: r.tbv,
        }));

        let sliceStartIdx = -1;
        let sliceEndIdx = -1;
        for (let idx = 0; idx < loadedCandles.length; idx++) {
          if (loadedCandles[idx].t >= k * blockMs) {
            sliceStartIdx = idx;
            break;
          }
        }
        for (let idx = loadedCandles.length - 1; idx >= 0; idx--) {
          if (loadedCandles[idx].t < (k + 1) * blockMs) {
            sliceEndIdx = idx;
            break;
          }
        }

        const expectedCandles = (windowDays * 86400000) / stepMs;
        const actualSliceCandles =
          sliceStartIdx !== -1 && sliceEndIdx !== -1 && sliceEndIdx >= sliceStartIdx
            ? sliceEndIdx - sliceStartIdx + 1
            : 0;

        if (actualSliceCandles < 0.5 * expectedCandles) {
          if (!doneSet.has(k)) {
            state.doneSlices.push(k);
          }
          state.sliceIdx = null;
          state.typeIdx = 0;
          state.status = 'Skipped sparse slice';
          await setMinerState(state);
          continue;
        }

        const letters = candleLetters(loadedCandles);
        const payoutPct = await getSetting<number>('arenaPayoutPct', 95);
        const be = breakEven(payoutPct);

        // e) For typeIdx from state.typeIdx to 7
        for (let typeIdx = state.typeIdx; typeIdx <= 7; typeIdx++) {
          if (stopRequested) break;

          const typeDef = MINER_TYPES[typeIdx];
          const typeId = typeDef.id;

          const jobResult = mineSlice(
            typeId,
            loadedCandles,
            letters,
            sliceStartIdx,
            sliceEndIdx,
            stepMs,
            be
          );

          const now = Date.now();
          for (const row of jobResult.rows) {
            const id = `${sym}|${tf}|${typeId}|${row.cat}|h${row.h}|${row.dir}`;
            let entry = library.entries[id];
            if (!entry) {
              entry = {
                id,
                sym,
                tf,
                typeId,
                cat: row.cat,
                h: row.h,
                dir: row.dir,
                slices: 0,
                slicesAbove: 0,
                trainN: 0,
                trainWins: 0,
                testN: 0,
                testWins: 0,
                firstMinedAt: now,
                lastMinedAt: now,
              };
              library.entries[id] = entry;
            }
            entry.slices += 1;
            if (row.testN >= 10 && row.testWins / row.testN > be) {
              entry.slicesAbove += 1;
            }
            entry.trainN += row.trainN;
            entry.trainWins += row.trainWins;
            entry.testN += row.testN;
            entry.testWins += row.testWins;
            entry.lastMinedAt = now;
          }

          const kKeySet = new Set(library.kKeys);
          for (const hyp of jobResult.hypotheses) {
            kKeySet.add(hyp);
          }
          library.kKeys = Array.from(kKeySet);

          // Keep at most 1500 entries (drop entries with smallest testN first)
          const allEntryKeys = Object.keys(library.entries);
          if (allEntryKeys.length > 1500) {
            const sortedEntries = Object.values(library.entries).sort(
              (a, b) => a.testN - b.testN
            );
            const toDropCount = allEntryKeys.length - 1500;
            for (let d = 0; d < toDropCount; d++) {
              delete library.entries[sortedEntries[d].id];
            }
          }

          const startDateStr = new Date(k * blockMs).toLocaleDateString();
          const endDateStr = new Date((k + 1) * blockMs).toLocaleDateString();

          state.status = `Mining block ${k} (${startDateStr} to ${endDateStr}), type ${
            typeIdx + 1
          } of 8: ${typeDef.name}`;
          state.typeIdx = typeIdx + 1;
          state.sliceIdx = k;
          state.jobs += 1;
          state.totalSlices = totalSlices;
          state.lastRunAt = now;

          await setMinerLibrary(library);
          await setMinerState(state);

          await new Promise((r) => setTimeout(r, 300));
        }

        // f) After last type (typeIdx reached 8)
        if (state.typeIdx >= 8 && !stopRequested) {
          if (!state.doneSlices.includes(k)) {
            state.doneSlices.push(k);
          }
          state.typeIdx = 0;
          state.sliceIdx = null;
          await setMinerState(state);
        }
      } catch (err: any) {
        try {
          const st = await getMinerState();
          st.status = 'Error: ' + (err?.message || String(err));
          await setMinerState(st);
        } catch {
          // ignore
        }
        for (let s = 0; s < 30 && !stopRequested; s++) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  } finally {
    isRunning = false;
    stopRequested = false;
  }
}
