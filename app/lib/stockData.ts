/**
 * Stock Research watchlist + index proxies. The Finnhub Apify actor is queried
 * in `snapshot` mode for these symbols; index ETFs drive the top stat cards and
 * are excluded from the holdings table.
 */

export type StockTag = 'held' | 'core' | 'watch'

export interface StockSpec {
  symbol: string
  tag: StockTag
}

/** Holdings + targets shown in the watchlist table. */
export const STOCK_WATCHLIST: StockSpec[] = [
  { symbol: 'NVDA', tag: 'held' },
  { symbol: 'MSFT', tag: 'held' },
  { symbol: 'AAPL', tag: 'held' },
  { symbol: 'AMZN', tag: 'watch' },
  { symbol: 'GOOGL', tag: 'watch' },
  { symbol: 'VTI', tag: 'core' },
]

/** Index ETFs → stat-card labels (not shown in the holdings table). */
export const STOCK_INDICES: { symbol: string; label: string }[] = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)' },
  { symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
]

export const STOCK_TAG: Record<string, StockTag> = Object.fromEntries(
  STOCK_WATCHLIST.map((s) => [s.symbol, s.tag]),
)

export const STOCK_SYMBOLS = [
  ...STOCK_INDICES.map((i) => i.symbol),
  ...STOCK_WATCHLIST.map((s) => s.symbol),
]
