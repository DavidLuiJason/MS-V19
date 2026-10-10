export function formatPrice(price: number | undefined | null, decimals = 2): string {
  if (price === undefined || price === null || isNaN(price)) return '—';
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatUptime(ms: number): string {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatRelativeTime(timestamp: number | undefined | null): string {
  if (!timestamp || timestamp <= 0) return 'Never';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);

  if (diffSec < 2) return 'Just now';
  if (diffSec < 60) return `${diffSec} sec ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hr ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays} days ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i >= 2 ? 2 : 1))} ${sizes[i]}`;
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    const val = abs / 1_000_000_000;
    return `${sign}${val >= 100 ? Math.round(val) : parseFloat(val.toFixed(1))}B`;
  }
  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    return `${sign}${val >= 100 ? Math.round(val) : parseFloat(val.toFixed(1))}M`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    return `${sign}${val >= 100 ? Math.round(val) : parseFloat(val.toFixed(1))}K`;
  }
  return `${sign}${parseFloat(abs.toFixed(1))}`;
}
