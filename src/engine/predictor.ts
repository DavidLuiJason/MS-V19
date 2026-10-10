import type { PatternCandle } from './patterns';
import { lookalikeNow } from './lookalike';
import type { DiscoveryResult } from './discovery';

export const TF_MS: Record<string, number> = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '1h': 3600000,
  '4h': 14400000,
  '1d': 86400000,
};

export interface PredictionDraft {
  source: 'lookalike' | 'discovery';
  direction: 'up' | 'down';
  horizon: number;
  confidence: number;
  baseline: number;
  note: string;
}

export function lookalikeDrafts(candles: PatternCandle[]): PredictionDraft[] {
  const result = lookalikeNow(candles, [5]);
  if (!result.usable || result.neighbors < 30) return [];
  const h = result.horizons[0];
  if (!h) return [];
  if (h.upShare >= 0.60) {
    return [{ source: 'lookalike', direction: 'up', horizon: 5, confidence: h.upShare, baseline: h.baselineUp, note: '' }];
  }
  if (h.upShare <= 0.40) {
    return [{ source: 'lookalike', direction: 'down', horizon: 5, confidence: 1 - h.upShare, baseline: 1 - h.baselineUp, note: '' }];
  }
  return [];
}

export function discoveryDrafts(result: DiscoveryResult): PredictionDraft[] {
  const drafts: PredictionDraft[] = [];
  for (const d of result.passed) {
    if (d.activeNow === true) {
      drafts.push({
        source: 'discovery',
        direction: d.direction === 'bullish' ? 'up' : 'down',
        horizon: d.horizon,
        confidence: d.testWinRate,
        baseline: d.testBaseline,
        note: d.word,
      });
    }
  }
  return drafts;
}
