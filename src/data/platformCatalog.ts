export type FeedId = 'binance' | 'cwallet_screen';

export interface CatalogOption {
  id: string;
  name: string;
  group: string;
  available: boolean;
  feed: FeedId | null;
  chartTimeframes: string[];
  readings: string[];
  platformControls: string[];
  buttons: string[];
}

export interface CatalogPlatform {
  id: 'cwallet' | 'binance';
  name: string;
  options: CatalogOption[];
}

export const FEED_LABELS: Record<FeedId, string> = {
  binance: 'Binance feed',
  cwallet_screen: 'Cwallet screen capture',
};

const CWALLET_TIMEFRAMES = ['Tick', '5s', '15s', '30s', '1m', '5m'];

export const PLATFORM_CATALOG: CatalogPlatform[] = [
  {
    id: 'cwallet',
    name: 'Cwallet',
    options: [
      { id: 'spot', name: 'Spot', group: 'Spot', available: false, feed: null, chartTimeframes: [], readings: [], platformControls: [], buttons: [] },
      { id: 'perpetual_futures', name: 'Perpetual Futures', group: 'Futures', available: false, feed: null, chartTimeframes: [], readings: [], platformControls: [], buttons: [] },
      {
        id: 'leverage_1001x', name: '1001x Leverage', group: 'Futures', available: true, feed: 'cwallet_screen',
        chartTimeframes: CWALLET_TIMEFRAMES,
        readings: ['Live price', 'Leverage', 'Order type', 'TP/SL', 'Liquidation Price (Buy)', 'Liquidation Price (Sell)'],
        platformControls: ['Pair selector', 'Chart timeframe', 'Leverage slider (1X-1000X)', 'Order type', 'TP/SL'],
        buttons: ['Leverage slider', 'Order type', 'Amount field', 'Half (1/2)', 'Double (2x)', 'TP/SL checkbox', 'Buy', 'Sell'],
      },
      {
        id: 'trend_trade', name: 'Trend Trade', group: 'Futures', available: true, feed: 'cwallet_screen',
        chartTimeframes: CWALLET_TIMEFRAMES,
        readings: ['Live price', 'Round time left', 'Payout 5s', 'Payout 15s', 'Your pick', 'Result'],
        platformControls: ['Pair selector', 'Chart timeframe', 'Time (5s / 15s)'],
        buttons: ['Time 5s', 'Time 15s', 'Amount field', 'Half (1/2)', 'Double (2x)', 'Up', 'Down'],
      },
      {
        id: 'market_battle', name: 'Market Battle', group: 'Futures', available: true, feed: 'cwallet_screen',
        chartTimeframes: [],
        readings: ['Room (stake range)', 'Start price', 'Live price', 'Countdown', 'Up pool', 'Down pool', 'Up players', 'Down players', 'Up payout', 'Down payout', 'Round result'],
        platformControls: ['Pair selector', 'Room'],
        buttons: ['Room selector', 'Amount field', 'Half (1/2)', 'Double (2x)', 'Up', 'Down'],
      },
      { id: 'tap_grid', name: 'Tap Grid', group: 'Futures', available: false, feed: null, chartTimeframes: [], readings: [], platformControls: [], buttons: [] },
      {
        id: 'spread_rush', name: 'Spread Rush', group: 'Futures', available: true, feed: 'cwallet_screen',
        chartTimeframes: CWALLET_TIMEFRAMES,
        readings: ['Live price', 'Round time left', 'Payout 5s', 'Payout 15s', 'Payout 30s', 'Spread 5s', 'Spread 15s', 'Spread 30s', 'Your pick', 'Result'],
        platformControls: ['Pair selector', 'Chart timeframe', 'Time (5s / 15s / 30s)'],
        buttons: ['Time 5s', 'Time 15s', 'Time 30s', 'Amount field', 'Half (1/2)', 'Double (2x)', 'Up', 'Down'],
      },
    ],
  },
  {
    id: 'binance',
    name: 'Binance',
    options: [
      {
        id: 'spot', name: 'Spot', group: 'Spot', available: true, feed: 'binance',
        chartTimeframes: ['1m', '5m', '15m', '1h', '4h', '1D'],
        readings: ['Buy', 'Sell', 'Spread', '24h change'],
        platformControls: ['Pair selector', 'Chart timeframe'],
        buttons: [],
      },
    ],
  },
];

export function getPlatform(platformId: string): CatalogPlatform | undefined {
  return PLATFORM_CATALOG.find((p) => p.id === platformId);
}

export function getOption(platformId: string, optionId: string): CatalogOption | undefined {
  return getPlatform(platformId)?.options.find((o) => o.id === optionId);
}
