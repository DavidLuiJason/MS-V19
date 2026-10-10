import React from 'react';
import type { FeedId } from '../../data/platformCatalog';

interface Props {
  feed: FeedId | null;
}

export const SourceBadge: React.FC<Props> = ({ feed }) => {
  if (!feed) return null;

  if (feed === 'binance') {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
        Source: Binance feed
      </span>
    );
  }

  if (feed === 'cwallet_screen') {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
        Source: Cwallet screen capture · not connected
      </span>
    );
  }

  return null;
};
