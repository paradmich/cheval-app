import Anthropic from '@anthropic-ai/sdk'
import {
  CENTRAL_BANKS,
  ECONOMIC_CALENDAR,
  REFERENCE_MACRO,
  WATCHLIST_PAIRS,
  type CalendarEvent,
  type Pair,
  type PillTone,
} from '../../lib/fxData'

/**
 * FX Market Research agent.
 *
 * Live data:
 *  - Spot rates + 1D/1W changes + a DXY proxy, from the free no-key
 *    Frankfurter / ECB feed.
 *  - Economic calendar, scraped live from ForexFactory via the Apify actor
 *    `gochujang/economic-calendar-tracker` (needs APIFY_TOKEN). Falls back to
 *    the curated calendar in app/lib/fxData.ts when the token is absent or the
 *    scrape fails.
 *
 * Curated snapshot: central-bank policy + 10Y/VIX (app/lib/fxData.ts).
 *
 * Claude turns the combined picture into market commentary and a per-pair
 * signal. Degrades gracefully to a rule-based signal when ANTHROPIC_API_KEY is
 * absent.
 *
 * The assembled response is memoised in-process for 15 minutes so a page load
 * doesn't re-hit Frankfurter, Apify, or Anthropic on every request.
 */
export const revalidate = 900
export const maxDuration = 60

const FRANKFURTER = 'https://api.frankfurter.dev/v1'
const SYMBOLS = 'EUR,GBP,JPY,AUD,CAD,CHF,SEK'

// Apify actors (~ is the API path separator for "/").
const APIFY_CALENDAR_ACTOR = 'gochujang~economic-calendar-tracker' // free, ForexFactory
const APIFY_NEWS_ACTOR = 'cloud9_ai~investing-news-scraper' // pay-per-item
const APIFY_SENTIMENT_ACTOR = 'xtracto~myfxbook-community-outlook' // Myfxbook retail positioning
const CALENDAR_CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD']

// Watchlist pair → Myfxbook Community Outlook symbol.
const PAIR_TO_SYMBOL: Record<Pair, string> = {
  'EUR/USD': 'EURUSD',
  'GBP/USD': 'GBPUSD',
  'USD/JPY': 'USDJPY',
  'AUD/USD': 'AUDUSD',
  'USD/CAD': 'USDCAD',
  'USD/CHF': 'USDCHF',
}

const CACHE_TTL_MS = 15 * 60 * 1000
let responseCache: { at: number; body: unknown } | null = null

// DXY = trade-weighted USD index. Geometric weights per the ICE definition.
const DXY_CONST = 50.14348112
const DXY_WEIGHTS: Record<string, number> = {
  EUR: 0.576,
  JPY: 0.136,
  GBP: 0.119,
  CAD: 0.091,
  SEK: 0.042,
  CHF: 0.036,
}

type Rates = Record<string, number> // currency-per-USD, base USD

interface PairQuote {
  pair: Pair
  rate: number
  change1d: number | null
  change1w: number | null
  trend: '↗' | '↘' | '→'
}

interface PairSignal {
  pair: string
  signal: string
  signalTone: PillTone
}

interface Commentary {
  icon: string
  title: string
  body: string
}

/** USD-base rate → the conventionally quoted pair value. */
function quoteFromRates(pair: Pair, r: Rates): number {
  switch (pair) {
    case 'EUR/USD':
      return 1 / r.EUR
    case 'GBP/USD':
      return 1 / r.GBP
    case 'USD/JPY':
      return r.JPY
    case 'AUD/USD':
      return 1 / r.AUD
    case 'USD/CAD':
      return r.CAD
    case 'USD/CHF':
      return r.CHF
  }
}

function dxy(r: Rates): number {
  let v = DXY_CONST
  for (const [ccy, w] of Object.entries(DXY_WEIGHTS)) v *= Math.pow(r[ccy], w)
  return v
}

function pct(now: number, then: number): number {
  return ((now - then) / then) * 100
}

/** Fetch the business-day series from `start` to latest, base USD. */
async function fetchSeries(start: string): Promise<Record<string, Rates>> {
  const res = await fetch(`${FRANKFURTER}/${start}..?base=USD&symbols=${SYMBOLS}`, {
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`)
  const json = (await res.json()) as { rates: Record<string, Rates> }
  return json.rates
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function buildQuotes(series: Record<string, Rates>): {
  quotes: PairQuote[]
  dxyNow: number
  dxyChange1d: number | null
} {
  const dates = Object.keys(series).sort() // ascending
  const latest = dates[dates.length - 1]
  const prev = dates[dates.length - 2] // ~1 business day back
  // ~1 week = 5 business days back, clamped to what's available
  const weekIdx = Math.max(0, dates.length - 6)
  const weekAgo = dates[weekIdx]

  const rNow = series[latest]
  const rPrev = prev ? series[prev] : undefined
  const rWeek = series[weekAgo]

  const quotes: PairQuote[] = WATCHLIST_PAIRS.map((pair) => {
    const rate = quoteFromRates(pair, rNow)
    const c1d = rPrev ? pct(rate, quoteFromRates(pair, rPrev)) : null
    const c1w = rWeek ? pct(rate, quoteFromRates(pair, rWeek)) : null
    const basis = c1w ?? c1d ?? 0
    const trend = basis > 0.05 ? '↗' : basis < -0.05 ? '↘' : '→'
    return { pair, rate, change1d: c1d, change1w: c1w, trend }
  })

  const dxyNow = dxy(rNow)
  const dxyChange1d = rPrev ? pct(dxyNow, dxy(rPrev)) : null
  return { quotes, dxyNow, dxyChange1d }
}

function fmtRate(pair: Pair, rate: number): string {
  return pair === 'USD/JPY' ? rate.toFixed(2) : rate.toFixed(4)
}

function upcoming(
  list: CalendarEvent[],
  today: string,
): (CalendarEvent & { inDays: number })[] {
  const t = Date.parse(today)
  return list
    .filter((e) => Date.parse(e.date) >= t)
    .map((e) => ({ ...e, inDays: Math.round((Date.parse(e.date) - t) / 86_400_000) }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

const APIFY_IMPACT: Record<string, CalendarEvent['impact']> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
}

interface ApifyCalendarItem {
  title: string
  country: string
  impact: string
  date_iso: string
  forecast: string | null
  previous: string | null
}

/** "2026-06-17T14:00:00-04:00" → "2:00 PM ET" (the feed is already ET). */
function etTime(iso: string): string {
  const hm = iso.slice(11, 16)
  if (!/^\d\d:\d\d$/.test(hm)) return ''
  let h = Number(hm.slice(0, 2))
  const m = hm.slice(3, 5)
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ap} ET`
}

/**
 * Pull the live economic calendar from Apify (ForexFactory). Returns null on
 * any failure so the caller can fall back to the curated list.
 */
async function fetchApifyCalendar(token: string): Promise<CalendarEvent[] | null> {
  const url = `https://api.apify.com/v2/acts/${APIFY_CALENDAR_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=55`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        includeNextWeek: true,
        countries: CALENDAR_CCYS,
        impactLevels: ['high', 'medium'],
        sortBy: 'date_asc',
        limit: 40,
      }),
    })
    if (!res.ok) return null
    const items = (await res.json()) as ApifyCalendarItem[]
    if (!Array.isArray(items) || items.length === 0) return null
    return items
      .filter((it) => typeof it.date_iso === 'string' && it.date_iso.length >= 10)
      .map((it) => ({
        date: it.date_iso.slice(0, 10),
        time: etTime(it.date_iso) || undefined,
        event: it.title,
        ccy: it.country,
        impact: APIFY_IMPACT[String(it.impact).toLowerCase()] ?? 'Med',
        forecast: it.forecast?.trim() ? it.forecast.trim() : '—',
      }))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface ApifyNewsItem {
  title: string
  link: string
  pubDate: string
  category: string
}

export interface Headline {
  title: string
  url: string
  pubDate: string
}

/**
 * Pull recent FX / economy headlines from Apify (Investing.com). Returns null
 * on failure so commentary still runs without news grounding.
 */
async function fetchApifyNews(token: string): Promise<Headline[] | null> {
  const url = `https://api.apify.com/v2/acts/${APIFY_NEWS_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=55`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ categories: ['forex', 'economy'], maxResults: 14 }),
    })
    if (!res.ok) return null
    const items = (await res.json()) as ApifyNewsItem[]
    if (!Array.isArray(items) || items.length === 0) return null
    return items
      .filter((it) => it.title?.trim())
      .map((it) => ({ title: it.title.trim(), url: it.link, pubDate: it.pubDate }))
      .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface ApifySentimentItem {
  symbol: string
  longPercentage: number
  shortPercentage: number
}

export interface Sentiment {
  long: number
  short: number
}

/**
 * Pull Myfxbook Community Outlook retail positioning (% long vs short) for the
 * watchlist pairs. A crowded side (>=70%) is a classic contrarian signal.
 * Returns null on failure so the rest of the agent still runs.
 */
async function fetchMyfxbookSentiment(
  token: string,
): Promise<Map<Pair, Sentiment> | null> {
  const url = `https://api.apify.com/v2/acts/${APIFY_SENTIMENT_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=55`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  const symbolToPair = new Map(
    (Object.entries(PAIR_TO_SYMBOL) as [Pair, string][]).map(([p, s]) => [s, p]),
  )
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ symbols: Object.values(PAIR_TO_SYMBOL) }),
    })
    if (!res.ok) return null
    const items = (await res.json()) as ApifySentimentItem[]
    if (!Array.isArray(items) || items.length === 0) return null
    const map = new Map<Pair, Sentiment>()
    for (const it of items) {
      const pair = symbolToPair.get(it.symbol)
      if (pair && typeof it.longPercentage === 'number') {
        map.set(pair, { long: it.longPercentage, short: it.shortPercentage })
      }
    }
    return map.size ? map : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Rule-based fallback signal when the AI layer is unavailable. */
function fallbackSignal(q: PairQuote): PairSignal {
  const basis = q.change1w ?? q.change1d ?? 0
  // For USD-quoted pairs (USD/XXX) a rise = USD strength; flip the read.
  const usdBase = q.pair.startsWith('USD/')
  const bullishUsd = basis > 0.15
  const bearishUsd = basis < -0.15
  if (usdBase) {
    if (bullishUsd) return { pair: q.pair, signal: 'Long USD', signalTone: 'g' }
    if (bearishUsd) return { pair: q.pair, signal: 'Short USD', signalTone: 'r' }
  } else {
    if (basis > 0.15) return { pair: q.pair, signal: 'Bullish', signalTone: 'g' }
    if (basis < -0.15) return { pair: q.pair, signal: 'Bearish', signalTone: 'r' }
  }
  return { pair: q.pair, signal: 'Neutral', signalTone: 'b' }
}

const SIGNAL_TONES: PillTone[] = ['g', 'r', 'b', 'gold']

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
          pair: { type: 'string', enum: WATCHLIST_PAIRS as unknown as string[] },
          signal: {
            type: 'string',
            description: 'e.g. Bullish, Bearish, Neutral, Long USD, Short USD',
          },
          signalTone: { type: 'string', enum: SIGNAL_TONES },
        },
        required: ['pair', 'signal', 'signalTone'],
      },
    },
  },
  required: ['commentary', 'signals'],
} as const

async function generateAI(
  quotes: PairQuote[],
  dxyNow: number,
  banks: typeof CENTRAL_BANKS,
  events: ReturnType<typeof upcoming>,
  headlines: Headline[] | null,
  sentiment: Map<Pair, Sentiment> | null,
): Promise<{ commentary: Commentary[]; signals: PairSignal[] } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const client = new Anthropic()
  const data = {
    dxy: dxyNow.toFixed(1),
    pairs: quotes.map((q) => {
      const s = sentiment?.get(q.pair)
      return {
        pair: q.pair,
        rate: fmtRate(q.pair, q.rate),
        change1d: q.change1d?.toFixed(2) ?? null,
        change1w: q.change1w?.toFixed(2) ?? null,
        retailLongPct: s?.long ?? null,
        retailShortPct: s?.short ?? null,
      }
    }),
    centralBanks: banks.map((b) => ({ ccy: b.ccy, rate: b.rate, bias: b.bias })),
    upcomingEvents: events
      .slice(0, 5)
      .map((e) => ({ event: e.event, ccy: e.ccy, impact: e.impact, inDays: e.inDays })),
    macro: { us10yPct: REFERENCE_MACRO.us10yPct, vix: REFERENCE_MACRO.vix },
    recentHeadlines: headlines?.slice(0, 12).map((h) => h.title) ?? [],
  }

  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system:
      'You are the FX Market Research agent for a private wealth office. ' +
      'Given live G10 spot rates with 1D/1W changes, central-bank policy, the ' +
      'economic calendar, reference macro, and recent market headlines, produce ' +
      'concise institutional FX commentary and a directional signal for each pair. ' +
      'Ground every claim in the data provided — rate differentials, momentum, ' +
      'upcoming catalysts, and the headlines. When a headline explains a move or ' +
      'a catalyst (e.g. a geopolitical event, an intervention call, a bank ' +
      'recommendation), reference that driver concretely rather than describing ' +
      'price action generically. retailLongPct/retailShortPct are Myfxbook retail ' +
      'positioning — treat a crowded side (>=70%) as a CONTRARIAN signal (heavy ' +
      'retail longs lean bearish for the pair, and vice versa) and call it out ' +
      'when notable. This is research only; never instruct to place a trade. ' +
      'Return exactly 3 commentary insights and one signal per pair.',
    messages: [
      {
        role: 'user',
        content: `Today's FX picture (JSON):\n${JSON.stringify(data, null, 2)}`,
      },
    ],
  })

  const text = res.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') return null
  try {
    return JSON.parse(text.text) as { commentary: Commentary[]; signals: PairSignal[] }
  } catch {
    return null
  }
}

export async function GET() {
  if (responseCache && Date.now() - responseCache.at < CACHE_TTL_MS) {
    return Response.json(responseCache.body)
  }

  const today = new Date().toISOString().slice(0, 10)

  let quotes: PairQuote[]
  let dxyNow: number
  let dxyChange1d: number | null
  const live = true

  try {
    const series = await fetchSeries(isoDaysAgo(12))
    const built = buildQuotes(series)
    quotes = built.quotes
    dxyNow = built.dxyNow
    dxyChange1d = built.dxyChange1d
  } catch {
    // Frankfurter unreachable — surface the curated structure with no live rates.
    return Response.json(
      {
        live: false,
        error: 'rate feed unavailable',
        generatedAt: new Date().toISOString(),
      },
      { status: 200 },
    )
  }

  // Calendar (ForexFactory), news, and Myfxbook retail sentiment: live via Apify
  // when a token is set, else curated / omitted.
  const token = process.env.APIFY_TOKEN
  const [apifyCalendar, headlines, sentiment] = token
    ? await Promise.all([
        fetchApifyCalendar(token),
        fetchApifyNews(token),
        fetchMyfxbookSentiment(token),
      ])
    : [null, null, null]
  const calendarLive = !!apifyCalendar
  const newsLive = !!headlines
  const sentimentLive = !!sentiment
  const events = upcoming(apifyCalendar ?? ECONOMIC_CALENDAR, today)
  const nextHigh = events.find((e) => e.impact === 'High') ?? events[0]

  const ai = await generateAI(quotes, dxyNow, CENTRAL_BANKS, events, headlines, sentiment)
  const signals: PairSignal[] = ai?.signals?.length
    ? ai.signals
    : quotes.map(fallbackSignal)
  const commentary: Commentary[] = ai?.commentary?.length
    ? ai.commentary
    : [
        {
          icon: '🧭',
          title: 'AI commentary offline',
          body: 'Live rates and signals are rule-based. Set ANTHROPIC_API_KEY to enable agent commentary.',
        },
      ]

  const signalByPair = new Map(signals.map((s) => [s.pair, s]))

  const body = {
    live,
    aiEnabled: !!ai,
    calendarLive,
    newsLive,
    sentimentLive,
    headlines: (headlines ?? []).slice(0, 4),
    generatedAt: new Date().toISOString(),
    stats: {
      dxy: dxyNow.toFixed(1),
      dxyChange1d,
      us10yPct: REFERENCE_MACRO.us10yPct,
      us10yChangeBp: REFERENCE_MACRO.us10yChangeBp,
      vix: REFERENCE_MACRO.vix,
      vixNote: REFERENCE_MACRO.vixNote,
      macroAsOf: REFERENCE_MACRO.asOf,
      nextHighImpact: nextHigh
        ? { event: nextHigh.event, inDays: nextHigh.inDays }
        : null,
    },
    watchlist: quotes.map((q) => {
      const s = sentiment?.get(q.pair) ?? null
      return {
        pair: q.pair,
        rate: fmtRate(q.pair, q.rate),
        change1d: q.change1d,
        change1w: q.change1w,
        trend: q.trend,
        signal: signalByPair.get(q.pair)?.signal ?? 'Neutral',
        signalTone: signalByPair.get(q.pair)?.signalTone ?? 'b',
        retailLong: s?.long ?? null,
        retailShort: s?.short ?? null,
      }
    }),
    commentary,
    calendar: events.slice(0, 6).map((e) => ({
      when: e.inDays === 0 ? `Today${e.time ? ' ' + e.time : ''}` : labelDate(e.date, e.inDays),
      event: e.event,
      ccy: e.ccy,
      impact: e.impact,
      forecast: e.forecast,
    })),
    centralBanks: CENTRAL_BANKS.map((b) => ({
      name: b.name,
      ccy: b.ccy,
      rate: b.rate.toFixed(2),
      nextMeeting: shortDate(b.nextMeeting),
      bias: b.bias,
      biasTone: b.biasTone,
    })),
  }

  responseCache = { at: Date.now(), body }
  return Response.json(body)
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function labelDate(iso: string, inDays: number): string {
  if (inDays === 1) return 'Tomorrow'
  return shortDate(iso)
}
