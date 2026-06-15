/**
 * Crypto Research watchlist — CoinGecko coin IDs the Crypto Research agent
 * tracks, with a portfolio tag mirroring the mockup (held / watch / stable).
 * Live market data is fetched per-id from the CoinGecko Apify actor; this file
 * just defines which coins and how they're labelled.
 */

export type CoinTag = 'held' | 'watch' | 'stable'

export interface CoinSpec {
  /** CoinGecko coin id (e.g. "bitcoin"). */
  id: string
  tag: CoinTag
}

export const CRYPTO_WATCHLIST: CoinSpec[] = [
  { id: 'bitcoin', tag: 'held' },
  { id: 'ethereum', tag: 'held' },
  { id: 'solana', tag: 'held' },
  { id: 'ripple', tag: 'watch' },
  { id: 'chainlink', tag: 'watch' },
  { id: 'cardano', tag: 'watch' },
  { id: 'dogecoin', tag: 'watch' },
  { id: 'usd-coin', tag: 'stable' },
]

export const CRYPTO_COIN_IDS = CRYPTO_WATCHLIST.map((c) => c.id)
export const COIN_TAG: Record<string, CoinTag> = Object.fromEntries(
  CRYPTO_WATCHLIST.map((c) => [c.id, c.tag]),
)
