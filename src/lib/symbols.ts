export const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY'];

export function splitSymbol(sym: string): { base: string; quote: string } {
  if (!sym) return { base: '', quote: '' };

  let longestQuote = '';

  for (const quote of QUOTE_ASSETS) {
    if (sym.endsWith(quote) && sym.length > quote.length) {
      if (quote.length > longestQuote.length) {
        longestQuote = quote;
      }
    }
  }

  if (longestQuote) {
    const base = sym.slice(0, sym.length - longestQuote.length);
    return { base, quote: longestQuote };
  }

  return { base: sym, quote: '' };
}

export function formatPair(sym: string): string {
  const { base, quote } = splitSymbol(sym);
  return quote ? `${base}/${quote}` : sym;
}
