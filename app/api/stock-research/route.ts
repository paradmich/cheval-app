import Anthropic from '@anthropic-ai/sdk'
import {
  STOCK_INDICES,
  STOCK_SYMBOLS,
  STOCK_TAG,
  STOCK_WATCHLIST,
  type StockTag,
} from '../../lib/stockData'

/**
 * Stock Research agent.
 *
 * Live data: per-symbol snapshots (price, 1D change, P/E, market cap, 52-week
 * position, news tone, trend/valuation classification) from Finnhub via the
 * Apify actor `ryanclinton/finnhub-stock-data` (snapshot mode). Needs
 * APIFY_TOKEN + a free FINNHUB_API_KEY (passed as the actor's apiKey input).
 * Claude generates commentary + a per-ticker signal.
 *
 * Degrades gracefully: without the keys the tab shows a notice; without
 * ANTHROPIC_API_KEY signals fall back to the actor's own trend classification.
 *
 * Response memoised in-process 15 min; force-dynamic so it self-heals.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTOR = 'ryanclinton~finnhub-stock-data'
const CACHE_TTL_MS = 60 * 60 * 1000
let responseCache: { at: number; body: unknown } | null = null

type PillTone = 'g' | 'r' | 'b' | 'gold' | 'm'

interface FinnhubItem {
  symbol: string
  price?: { currentPrice?: number; changePercent?: number }
  profile?: { name?: string; marketCap?: number; marketCapTier?: string }
  valuation?: { peRatio?: number | null; note?: string }
  pricePosition52w?: number | null
  newsTone?: { positive: number; negative: number; neutral: number }
  newsMomentum?: string
  marketState?: { trend?: string; valuation?: string; volatility?: string; newsTone?: string }
  summary?: string
}

interface Snap {
  symbol: string
  name: string
  tag: StockTag | null
  price: number | null
  change1d: number | null
  pe: number | null
  marketCap: number | null
  pos52w: number | null
  trend: string | null
  valuation: string | null
  newsTone: string | null
  summary: string | null
}

interface Signal {
  symbol: string
  signal: string
  signalTone: PillTone
}
interface Commentary {
  icon: string
  title: string
  body: string
}

async function fetchSnapshots(
  token: string,
  finnhub: string,
  debug?: string[],
): Promise<FinnhubItem[] | null> {
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=55&memory=2048`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        apiKey: finnhub,
        mode: 'snapshot',
        symbols: STOCK_SYMBOLS,
        outputProfile: 'standard',
      }),
    })
    if (!res.ok) {
      debug?.push(`stock HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
      return null
    }
    const items = (await res.json()) as FinnhubItem[]
    if (!Array.isArray(items) || items.length === 0) {
      debug?.push('stock empty')
      return null
    }
    return items
  } catch (e) {
    debug?.push(`stock err: ${String(e).slice(0, 120)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function toSnap(it: FinnhubItem): Snap {
  return {
    symbol: it.symbol,
    name: it.profile?.name ?? it.symbol,
    tag: STOCK_TAG[it.symbol] ?? null,
    price: it.price?.currentPrice ?? null,
    change1d: it.price?.changePercent ?? null,
    pe: it.valuation?.peRatio ?? null,
    marketCap: it.profile?.marketCap ?? null,
    pos52w: it.pricePosition52w ?? null,
    trend: it.marketState?.trend ?? null,
    valuation: it.marketState?.valuation ?? null,
    newsTone: it.marketState?.newsTone ?? null,
    summary: it.summary ?? null,
  }
}

/** Fallback signal from the actor's own trend classification. */
function fallbackSignal(s: Snap): Signal {
  const t = (s.trend ?? '').toLowerCase()
  if (t.includes('advanc')) return { symbol: s.symbol, signal: 'Bullish', signalTone: 'g' }
  if (t.includes('declin')) return { symbol: s.symbol, signal: 'Bearish', signalTone: 'r' }
  if (s.tag === 'core') return { symbol: s.symbol, signal: 'Core', signalTone: 'm' }
  return { symbol: s.symbol, signal: 'Hold', signalTone: 'b' }
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
          body: { type: 'string', description: 'One or two sentences' },
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
          symbol: { type: 'string' },
          signal: { type: 'string', description: 'e.g. Bullish, Bearish, Hold, Trim, Core' },
          signalTone: { type: 'string', enum: SIGNAL_TONES },
        },
        required: ['symbol', 'signal', 'signalTone'],
      },
    },
  },
  required: ['commentary', 'signals'],
} as const

async function generateAI(
  holdings: Snap[],
): Promise<{ commentary: Commentary[]; signals: Signal[] } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const client = new Anthropic()
  const data = holdings.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    tag: s.tag,
    change1dPct: s.change1d?.toFixed(2) ?? null,
    pe: s.pe?.toFixed(1) ?? null,
    pos52wPct: s.pos52w?.toFixed(0) ?? null,
    trend: s.trend,
    valuation: s.valuation,
    newsTone: s.newsTone,
  }))

  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system:
      'You are the Equity Research agent for a private wealth office. Given live ' +
      'per-stock snapshots (1D change, P/E, position in the 52-week range, trend ' +
      'and valuation classification, and news tone), produce concise institutional ' +
      'commentary and a directional signal per ticker. Ground every claim in the ' +
      'data — momentum, how extended valuation is, 52-week position, and news ' +
      'tone. A held name that is up strongly, richly valued, and near the top of ' +
      'its 52-week range can warrant "Trim"; broad-market ETFs (tag "core") are ' +
      '"Core". This is research only; never instruct to place a trade. Return ' +
      'exactly 3 commentary insights and one signal per ticker.',
    messages: [
      { role: 'user', content: `Today's equity watchlist (JSON):\n${JSON.stringify(data, null, 2)}` },
    ],
  })
  const text = res.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') return null
  try {
    return JSON.parse(text.text) as { commentary: Commentary[]; signals: Signal[] }
  } catch {
    return null
  }
}

function fmtPrice(p: number | null): string {
  if (p === null) return '—'
  return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtPe(pe: number | null): string {
  return pe === null ? '—' : `${pe.toFixed(0)}x`
}

export async function GET() {
  if (responseCache && Date.now() - responseCache.at < CACHE_TTL_MS) {
    return Response.json(responseCache.body)
  }

  const token = process.env.APIFY_TOKEN
  const finnhub = process.env.FINNHUB_API_KEY
  const debug: string[] = []
  const items = token && finnhub ? await fetchSnapshots(token, finnhub, debug) : null

  if (!items) {
    if (debug.length) console.error('[stock-research] apify:', debug.join(' | '))
    return Response.json(
      {
        stockLive: false,
        needsKey: !finnhub,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 },
    )
  }

  const bySym = new Map(items.map((it) => [it.symbol, toSnap(it)]))
  const holdings = STOCK_WATCHLIST.flatMap((w) => {
    const s = bySym.get(w.symbol)
    return s ? [s] : []
  })
  const indices = STOCK_INDICES.map((i) => ({ label: i.label, snap: bySym.get(i.symbol) ?? null }))

  const ai = await generateAI(holdings)
  const signals = ai?.signals?.length ? ai.signals : holdings.map(fallbackSignal)
  const commentary: Commentary[] = ai?.commentary?.length
    ? ai.commentary
    : [
        {
          icon: '🧭',
          title: 'AI commentary offline',
          body: 'Live quotes shown; signals use the feed’s trend classification. Set ANTHROPIC_API_KEY for agent commentary.',
        },
      ]
  const sigBySym = new Map(signals.map((s) => [s.symbol, s]))

  const movers = holdings.filter((s) => s.change1d !== null)
  const topMover = movers.slice().sort((a, b) => (b.change1d ?? 0) - (a.change1d ?? 0))[0]
  const advancing = holdings.filter((s) => (s.change1d ?? 0) > 0).length

  const sourceSym = topMover?.symbol ?? holdings[0]?.symbol ?? null
  const body = {
    stockLive: true,
    aiEnabled: !!ai,
    generatedAt: new Date().toISOString(),
    sourceUrl: sourceSym ? `https://finance.yahoo.com/quote/${sourceSym}` : null,
    sourceLabel: sourceSym ? `${sourceSym} on Yahoo Finance` : null,
    stats: {
      indices: indices.map((i) => ({
        label: i.label,
        price: fmtPrice(i.snap?.price ?? null),
        change1d: i.snap?.change1d ?? null,
      })),
      topMover: topMover ? { symbol: topMover.symbol, change1d: topMover.change1d } : null,
      advancing: `${advancing}/${holdings.length}`,
    },
    watchlist: holdings.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      tag: s.tag,
      price: fmtPrice(s.price),
      change1d: s.change1d,
      pe: fmtPe(s.pe),
      pos52w: s.pos52w,
      signal: sigBySym.get(s.symbol)?.signal ?? 'Hold',
      signalTone: sigBySym.get(s.symbol)?.signalTone ?? 'b',
    })),
    commentary,
  }

  responseCache = { at: Date.now(), body }
  return Response.json(body)
}
