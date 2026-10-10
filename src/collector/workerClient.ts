import type { AppSettings } from '../data/repositories';
import type { TickRecord, CandleRecord } from '../data/db';
import { useAppStore } from '../state/store';

class WorkerClient {
  private worker: Worker | null = null;
  private isInitialized = false;

  init(settings: AppSettings) {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

      this.worker.onmessage = (event) => {
        const { type, data } = event.data;
        const store = useAppStore.getState();

        switch (type) {
          case 'liveTick': {
            const tick = data as TickRecord;
            store.addLiveTick(tick);
            break;
          }

          case 'liveCandle': {
            const candle = data as CandleRecord;
            store.updateLiveCandle(candle);
            break;
          }

          case 'heartbeat': {
            store.setCollectorHeartbeat(data);
            break;
          }

          case 'status': {
            store.setCollectorStatus(data);
            break;
          }

          case 'ticker24h': {
            store.setTicker24h(data.symbol, data.priceChangePercent);
            break;
          }

          case 'gapsUpdated': {
            store.refreshGaps();
            break;
          }

          case 'historyProgress': {
            store.setHistoryProgress(data);
            break;
          }
        }
      };

      this.worker.postMessage({
        type: 'init',
        data: {
          dataSource: settings.dataSource,
          trackedSymbols: settings.trackedSymbols,
          recordRawTicks: settings.recordRawTicks,
          rawTickRetentionDays: settings.rawTickRetentionDays,
          collectorPaused: settings.collectorPaused,
        },
      });

      // Handle visibility changes
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.scanGaps();
        }
      });
    } catch (err) {
      console.error('Failed to initialize Collector Worker:', err);
    }
  }

  pause() {
    this.worker?.postMessage({ type: 'pause' });
  }

  resume() {
    this.worker?.postMessage({ type: 'resume' });
  }

  setDataSource(dataSource: 'global' | 'us') {
    this.worker?.postMessage({ type: 'setDataSource', data: dataSource });
  }

  setTrackedSymbols(symbols: string[]) {
    this.worker?.postMessage({ type: 'setTrackedSymbols', data: symbols });
  }

  setRecordRawTicks(enabled: boolean) {
    this.worker?.postMessage({ type: 'setRecordRawTicks', data: enabled });
  }

  setRetentionDays(days: number) {
    this.worker?.postMessage({ type: 'setRetentionDays', data: days });
  }

  scanGaps() {
    this.worker?.postMessage({ type: 'scanGaps' });
  }

  repairGap(gapId: number) {
    this.worker?.postMessage({ type: 'repairGap', data: { gapId } });
  }

  repairAllGaps() {
    this.worker?.postMessage({ type: 'repairAllGaps' });
  }

  downloadHistory(symbols: string[], timeframes: string[], fromMs: number, toMs: number) {
    this.worker?.postMessage({ type: 'downloadHistory', data: { symbols, timeframes, fromMs, toMs } });
  }

  cancelHistory() {
    this.worker?.postMessage({ type: 'cancelHistory' });
  }
}

export const workerClient = new WorkerClient();
