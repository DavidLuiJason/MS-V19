export interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isClosed: boolean;
  trades?: number;
  takerBuyBase?: number;
  takerBuyQuote?: number;
}

export interface ScannerTicker {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  bidPrice: number;
  askPrice: number;
  count: number;
}

export interface ExchangeAdapter {
  connect(
    symbols: string[],
    onMessage: (msg: any) => void,
    onStatusChange: (status: 'connecting' | 'connected' | 'reconnecting' | 'unreachable' | 'paused' | 'idle', details?: any) => void
  ): void;
  disconnect(): void;
  subscribe(symbols: string[]): void;
  fetchKlines(symbol: string, interval: string, startTime?: number, limit?: number): Promise<KlineData[]>;
  fetchSymbols(): Promise<string[]>;
  fetch24hr(symbol: string): Promise<{ symbol: string; priceChangePercent: number }>;
  fetchAllTickers24h(): Promise<ScannerTicker[]>;
  setHost(dataSource: 'global' | 'us'): void;
  setSecondsEnabled?(enabled: boolean): void;
}

const numOrUndef = (x: any): number | undefined => { if (x === undefined || x === null) return undefined; const v = Number(x); return Number.isFinite(v) ? v : undefined; };

export class BinanceAdapter implements ExchangeAdapter {
  private dataSource: 'global' | 'us' = 'global';
  private ws: WebSocket | null = null;
  private symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  private onMessageCb: ((msg: any) => void) | null = null;
  private onStatusCb: ((status: 'connecting' | 'connected' | 'reconnecting' | 'unreachable' | 'paused' | 'idle', details?: any) => void) | null = null;
  
  private secondsEnabled = false;
  private reconnectAttempt = 0;
  private reconnectTimer: any = null;
  private isManuallyClosed = false;

  setSecondsEnabled(enabled: boolean): void {
    if (this.secondsEnabled === enabled) return;
    this.secondsEnabled = enabled;
    if (this.ws && !this.isManuallyClosed && this.onMessageCb && this.onStatusCb) {
      this.disconnect();
      this.connect(this.symbols, this.onMessageCb, this.onStatusCb);
    }
  }

  get restBase(): string {
    return this.dataSource === 'us' ? 'https://api.binance.us' : 'https://api.binance.com';
  }

  get wsBase(): string {
    return this.dataSource === 'us' ? 'wss://stream.binance.us:9443' : 'wss://stream.binance.com:9443';
  }

  setHost(dataSource: 'global' | 'us') {
    if (this.dataSource !== dataSource) {
      this.dataSource = dataSource;
      if (this.ws && !this.isManuallyClosed) {
        this.disconnect();
        this.connect(this.symbols, this.onMessageCb!, this.onStatusCb!);
      }
    }
  }

  connect(
    symbols: string[],
    onMessage: (msg: any) => void,
    onStatusChange: (status: 'connecting' | 'connected' | 'reconnecting' | 'unreachable' | 'paused' | 'idle', details?: any) => void
  ): void {
    this.isManuallyClosed = false;
    this.symbols = symbols;
    this.onMessageCb = onMessage;
    this.onStatusCb = onStatusChange;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    if (this.symbols.length === 0) {
      this.onStatusCb?.('idle', { message: 'No symbols to track' });
      return;
    }

    const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
    const streamNames: string[] = [];

    for (const sym of this.symbols) {
      const lower = sym.toLowerCase();
      streamNames.push(`${lower}@bookTicker`);
      for (const intv of intervals) {
        streamNames.push(`${lower}@kline_${intv}`);
      }
      if (this.secondsEnabled && this.dataSource === 'global') {
        streamNames.push(lower + '@kline_1s');
      }
    }

    const streamUrl = `${this.wsBase}/stream?streams=${streamNames.join('/')}`;
    this.onStatusCb?.(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting', { attempt: this.reconnectAttempt });

    try {
      this.ws = new WebSocket(streamUrl);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.onStatusCb?.('connected', { symbols: this.symbols });
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.onMessageCb?.(parsed);
        } catch {
          // ignore corrupted frame
        }
      };

      this.ws.onerror = (err) => {
        // Handled in onclose
      };

      this.ws.onclose = () => {
        if (this.isManuallyClosed) {
          return;
        }
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempt++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt - 1), 30000);

    if (this.reconnectAttempt > 6) {
      this.onStatusCb?.('unreachable', { attempt: this.reconnectAttempt, delay });
    } else {
      this.onStatusCb?.('reconnecting', { attempt: this.reconnectAttempt, delay });
    }

    this.reconnectTimer = setTimeout(() => {
      if (!this.isManuallyClosed && this.onMessageCb && this.onStatusCb) {
        this.connect(this.symbols, this.onMessageCb, this.onStatusCb);
      }
    }, delay);
  }

  disconnect(): void {
    this.isManuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.onStatusCb?.('paused', {});
  }

  subscribe(symbols: string[]): void {
    this.symbols = symbols;
    if (!this.isManuallyClosed && this.onMessageCb && this.onStatusCb) {
      this.connect(this.symbols, this.onMessageCb, this.onStatusCb);
    }
  }

  async fetchKlines(symbol: string, interval: string, startTime?: number, limit = 1000): Promise<KlineData[]> {
    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      interval,
      limit: limit.toString(),
    });
    if (startTime) {
      params.append('startTime', startTime.toString());
    }

    const resp = await fetch(`${this.restBase}/api/v3/klines?${params.toString()}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch klines: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json();
    return data.map((item: any[]) => ({
      openTime: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: Number(item[6]),
      isClosed: true,
      trades: numOrUndef(item[8]),
      takerBuyBase: numOrUndef(item[9]),
      takerBuyQuote: numOrUndef(item[10]),
    }));
  }

  async fetchSymbols(): Promise<string[]> {
    const resp = await fetch(`${this.restBase}/api/v3/exchangeInfo`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch exchangeInfo: ${resp.status}`);
    }
    const data = await resp.json();
    return data.symbols
      .filter((s: any) => s.status === 'TRADING')
      .map((s: any) => s.symbol as string);
  }

  async fetch24hr(symbol: string): Promise<{ symbol: string; priceChangePercent: number }> {
    const resp = await fetch(`${this.restBase}/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch 24hr ticker for ${symbol}: ${resp.status}`);
    }
    const data = await resp.json();
    return {
      symbol: data.symbol,
      priceChangePercent: Number(data.priceChangePercent),
    };
  }

  async fetchAllTickers24h(): Promise<ScannerTicker[]> {
    const resp = await fetch(`${this.restBase}/api/v3/ticker/24hr`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch 24hr tickers: ${resp.status}`);
    }
    const data = await resp.json();
    return data.map((t: any) => ({
      symbol: t.symbol,
      lastPrice: Number(t.lastPrice),
      priceChangePercent: Number(t.priceChangePercent),
      highPrice: Number(t.highPrice),
      lowPrice: Number(t.lowPrice),
      volume: Number(t.volume),
      quoteVolume: Number(t.quoteVolume),
      bidPrice: Number(t.bidPrice),
      askPrice: Number(t.askPrice),
      count: Number(t.count),
    }));
  }
}
