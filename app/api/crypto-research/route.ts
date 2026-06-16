import Anthropic from '@anthropic-ai/sdk'
import { CRYPTO_COIN_IDS, COIN_TAG, type CoinTag } from '../../lib/cryptoData'

/**
 * Crypto Research agent.
 *
 * Live data: per-coin market data (price, 24h/7d change, market cap, volume,
 * ATH distance) from CoinGecko via the Apify actor
 * `gentle_cloud/cryptocurrency-market-data-scraper` (needs APIFY_TOKEN). Claude
 * generates market commentary and a per-coin signal. Degrades gracefully:
 * without APIFY_TOKEN there's no market feed (cryptoLive=false); without
 * ANTHROPIC_API_KEY signals fall back to a rule-based read.
 *
 * Response memoised in-process for 15 minutes; force-dynamic so it isn't
 * statically cached and self-heals when the upstream recovers.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APIFY_CRYPTO_ACTOR = 'gentle_cloud~cryptocurrency-market-data-scraper'
const APIFY_RESERVE_ACTOR = 'gochujang~cex-reserve-tracker' // exchange reserves (free)
const STABLES = new Set(['USDT', 'USDC', 'DAI'])
const CACHE_TTL_MS = 15 * 60 * 1000
let responseCache: { at: number; body: unknown } | null = null

type PillTone = 'g' | 'r' | 'b' | 'gold' | 'm'

interface ApifyCoinItem {
  coin_id: string
  symbol: string
  name: string
  rank: number | null
  current_price: number
  market_cap: number
  total_volume_24h: number
  price_change_pct_24h: number | null
  price_change_pct_7d: number | null
  ath: number | null
  ath_change_pct: number | null
}

interface Coin {
  id: string
  symbol: string
  name: string
  tag: CoinTag
  price: number
  change24h: number | null
  change7d: number | null
  marketCap: number
  volume24h: number
  athChangePct: number | null
}

interface CoinSignal {
  symbol: string
  signal: string
  signalTone: PillTone
}

interface Commentary {
  icon: string
  title: string
  body: string
}

/** Fetch live market data for the watchlist coins from CoinGecko via Apify. */
async function fetchCoins(token: string, debug?: string[]): Promise<Coin[] | null> {
  const url = `https://api.apify.com/v2/acts/${APIFY_CRYPTO_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=55&memory=2048`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      // top_coins is one batched /coins/markets call (fast); specific_coins
      // fetches each coin's detail sequentially and times out on serverless.
      // The watchlist is selected from the result by id below.
      body: JSON.stringify({
        mode: 'top_coins',
        vs_currency: 'usd',
        top_n: 100,
      }),
    })
    if (!res.ok) {
      debug?.push(`crypto HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
      return null
    }
    const items = (await res.json()) as ApifyCoinItem[]
    if (!Array.isArray(items) || items.length === 0) {
      debug?.push('crypto empty')
      return null
    }
    const byId = new Map(items.map((it) => [it.coin_id, it]))
    // Preserve the watchlist order.
    return CRYPTO_COIN_IDS.flatMap((id) => {
      const it = byId.get(id)
      if (!it) return []
      return [
        {
          id,
          symbol: (it.symbol || '').toUpperCase(),
          name: it.name,
          tag: COIN_TAG[id] ?? 'watch',
          price: it.current_price,
          change24h: it.price_change_pct_24h,
          change7d: it.price_change_pct_7d,
          marketCap: it.market_cap,
          volume24h: it.total_volume_24h,
          athChangePct: it.ath_change_pct,
        },
      ]
    })
  } catch (e) {
    debug?.push(`crypto err: ${String(e).slice(0, 120)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface ReserveItem {
  exchange: string
  asset: string
  balance_usd: number
}

interface Reserves {
  stablecoinUsd: number
  ethUsd: number
  totalUsd: number
  byExchange: { exchange: string; usd: number }[]
}

/** Aggregate live CEX on-chain reserves (ETH + stablecoins) from Apify. */
async function fetchReserves(token: string, debug?: string[]): Promise<Reserves | null> {
  const url = `https://api.apify.com/v2/acts/${APIFY_RESERVE_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=55&memory=2048`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        exchanges: ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'Bitfinex'],
        assets: ['ETH', 'USDT', 'USDC', 'DAI'],
        minBalanceUsd: 5_000_000,
        sortBy: 'balance_usd_desc',
        limit: 120,
      }),
    })
    if (!res.ok) {
      debug?.push(`reserves HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
      return null
    }
    const items = (await res.json()) as ReserveItem[]
    if (!Array.isArray(items) || items.length === 0) {
      debug?.push('reserves empty')
      return null
    }
    let stablecoinUsd = 0
    let ethUsd = 0
    const byEx = new Map<string, number>()
    for (const it of items) {
      const usd = Number(it.balance_usd) || 0
      if (it.asset === 'ETH') ethUsd += usd
      else if (STABLES.has(it.asset)) stablecoinUsd += usd
      byEx.set(it.exchange, (byEx.get(it.exchange) ?? 0) + usd)
    }
    const byExchange = [...byEx.entries()]
      .map(([exchange, usd]) => ({ exchange, usd }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 5)
    return { stablecoinUsd, ethUsd, totalUsd: stablecoinUsd + ethUsd, byExchange }
  } catch (e) {
    debug?.push(`reserves err: ${String(e).slice(0, 120)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Rule-based fallback signal from 7d momentum when the AI layer is off. */
function fallbackSignal(c: Coin): CoinSignal {
  if (c.tag === 'stable') return { symbol: c.symbol, signal: 'Stable', signalTone: 'm' }
  const basis = c.change7d ?? c.change24h ?? 0
  if (basis > 15) return { symbol: c.symbol, signal: 'Take profit', signalTone: 'gold' }
  if (basis > 3) return { symbol: c.symbol, signal: 'Bullish', signalTone: 'g' }
  if (basis < -3) return { symbol: c.symbol, signal: 'Bearish', signalTone: 'r' }
  return { symbol: c.symbol, signal: 'Neutral', signalTone: 'b' }
}

const SIGNAL_TONES: PillTone[] = ['g', 'r', 'b', 'gold', 'm']

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    commentary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          icon: { type: 'string', description: 'A single emoji' },
          title: { type: 'string', description: 'Short bolded lead, ≤6 words' },
          body: { type: 'string', description: 'One or two sentences of analysis' },
        },
        required: ['icon', 'title', 'body'],
      },
    },
    signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          symbol: { type: 'string', description: 'Coin ticker, e.g. BTC' },
          signal: {
            type: 'string',
            description: 'e.g. Bullish, Bearish, Neutral, Take profit, Watch, Stable',
          },
          signalTone: { type: 'string', enum: SIGNAL_TONES },
        },
        required: ['symbol', 'signal', 'signalTone'],
      },
    },
  },
  required: ['commentary', 'signals'],
} as const

function bn(usd: number): string {
  return usd >= 1e9 ? `${(usd / 1e9).toFixed(1)}B` : `${(usd / 1e6).toFixed(0)}M`
}

async function generateAI(
  coins: Coin[],
  reserves: Reserves | null,
): Promise<{ commentary: Commentary[]; signals: CoinSignal[] } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const client = new Anthropic()
  const data = {
    coins: coins.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      tag: c.tag,
      price: c.price,
      change24hPct: c.change24h?.toFixed(2) ?? null,
      change7dPct: c.change7d?.toFixed(2) ?? null,
      marketCapUsd: c.marketCap,
      fromAthPct: c.athChangePct?.toFixed(1) ?? null,
    })),
    exchangeReserves: reserves
      ? {
          stablecoinDryPowderUsd: `$${bn(reserves.stablecoinUsd)}`,
          ethOnExchangesUsd: `$${bn(reserves.ethUsd)}`,
        }
      : null,
  }

  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system:
      'You are the Crypto Research agent for a private wealth office. Given live ' +
      'market data for a watchlist (price, 24h/7d change, market cap, distance ' +
      'from all-time high, and a portfolio tag of held/watch/stable), produce ' +
      'concise institutional commentary and a directional signal per coin. ' +
      'Ground every claim in the data — momentum, relative strength, market-cap ' +
      'tiers, and how extended each coin is vs its ATH. For coins tagged "held", ' +
      'a strong 7d run (e.g. >15%) can warrant a "Take profit" signal; "stable" ' +
      'coins are "Stable". exchangeReserves is live on-chain smart-money context: ' +
      'a large stablecoin "dry powder" balance parked on exchanges = sidelined ' +
      'buying power (supportive), while a heavy/rising ETH balance on exchanges ' +
      'can signal distribution; reference it in at least one insight when notable. ' +
      'This is research only; never instruct to place a trade. Return exactly 3 ' +
      'commentary insights and one signal per coin.',
    messages: [
      { role: 'user', content: `Today's crypto watchlist (JSON):\n${JSON.stringify(data, null, 2)}` },
    ],
  })

  const text = res.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') return null
  try {
    return JSON.parse(text.text) as { commentary: Commentary[]; signals: CoinSignal[] }
  } catch {
    return null
  }
}

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${Math.round(p).toLocaleString('en-US')}`
  if (p >= 1) return `$${p.toFixed(2)}`
  return `$${p.toFixed(4)}`
}

function fmtMcap(m: number): string {
  if (m >= 1e12) return `$${(m / 1e12).toFixed(2)}T`
  if (m >= 1e9) return `$${(m / 1e9).toFixed(1)}B`
  if (m >= 1e6) return `$${(m / 1e6).toFixed(0)}M`
  return `$${m.toLocaleString('en-US')}`
}

export async function GET() {
  if (responseCache && Date.now() - responseCache.at < CACHE_TTL_MS) {
    return Response.json(responseCache.body)
  }

  const token = process.env.APIFY_TOKEN
  const debug: string[] = []
  if (!token) debug.push('no APIFY_TOKEN in env')
  const [coins, reserves] = token
    ? await Promise.all([fetchCoins(token, debug), fetchReserves(token, debug)])
    : [null, null]

  if (!coins || coins.length === 0) {
    if (debug.length) console.error('[crypto-research] apify:', debug.join(' | '))
    // No live feed — return a clear, non-cached "needs token" state.
    return Response.json(
      { cryptoLive: false, generatedAt: new Date().toISOString() },
      { status: 200 },
    )
  }

  const ai = await generateAI(coins, reserves)
  const signals = ai?.signals?.length ? ai.signals : coins.map(fallbackSignal)
  const commentary: Commentary[] = ai?.commentary?.length
    ? ai.commentary
    : [
        {
          icon: '🧭',
          title: 'AI commentary offline',
          body: 'Live prices shown; signals are rule-based. Set ANTHROPIC_API_KEY to enable agent commentary.',
        },
      ]
  const sigBySym = new Map(signals.map((s) => [s.symbol, s]))

  // Stats: BTC, ETH, biggest 24h mover (excl. stables), watchlist market cap.
  const btc = coins.find((c) => c.symbol === 'BTC')
  const eth = coins.find((c) => c.symbol === 'ETH')
  const movers = coins.filter((c) => c.tag !== 'stable' && c.change24h !== null)
  const topMover = movers.slice().sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0))[0]
  const watchlistMcap = coins.reduce((s, c) => s + (c.marketCap || 0), 0)

  const body = {
    cryptoLive: true,
    aiEnabled: !!ai,
    generatedAt: new Date().toISOString(),
    stats: {
      btc: btc ? { price: fmtPrice(btc.price), change24h: btc.change24h } : null,
      eth: eth ? { price: fmtPrice(eth.price), change24h: eth.change24h } : null,
      topMover: topMover
        ? { symbol: topMover.symbol, change24h: topMover.change24h }
        : null,
      watchlistMcap: fmtMcap(watchlistMcap),
    },
    watchlist: coins.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      tag: c.tag,
      price: fmtPrice(c.price),
      change24h: c.change24h,
      change7d: c.change7d,
      marketCap: fmtMcap(c.marketCap),
      fromAth: c.athChangePct,
      signal: sigBySym.get(c.symbol)?.signal ?? 'Neutral',
      signalTone: sigBySym.get(c.symbol)?.signalTone ?? 'b',
    })),
    commentary,
    reserves: reserves
      ? {
          stablecoinUsd: `$${bn(reserves.stablecoinUsd)}`,
          ethUsd: `$${bn(reserves.ethUsd)}`,
          totalUsd: `$${bn(reserves.totalUsd)}`,
          byExchange: reserves.byExchange.map((e) => ({
            exchange: e.exchange,
            usd: `$${bn(e.usd)}`,
          })),
        }
      : null,
  }

  responseCache = { at: Date.now(), body }
  return Response.json(body)
}
