/**
 * Curated FX context the agent maintains by hand: central-bank policy, the
 * economic-calendar feed, and reference macro levels (10Y, VIX) that the free
 * no-key rate feed (Frankfurter / ECB) does not provide.
 *
 * Spot rates and the DXY proxy are LIVE (computed in the API route from
 * Frankfurter). Everything in this file is a snapshot — update the dates and
 * levels as policy and the calendar move. Dates are absolute ISO so the route
 * can compute "in N days" relative to the request date.
 */

export type Impact = 'High' | 'Med' | 'Low'

export interface CalendarEvent {
  /** ISO date (YYYY-MM-DD) of the release */
  date: string
  /** Optional time-of-day label, e.g. "8:30 ET" */
  time?: string
  event: string
  /** ISO 4217 currency the event drives */
  ccy: string
  impact: Impact
  /** Consensus forecast, or "—" if none */
  forecast: string
}

export interface CentralBank {
  name: string
  ccy: string
  /** Current policy rate, percent */
  rate: number
  /** ISO date of the next scheduled meeting */
  nextMeeting: string
  /** Short policy-bias label shown in the table */
  bias: string
  /** Pill tone for the bias cell */
  biasTone: PillTone
}

export type PillTone = 'g' | 'r' | 'b' | 'gold' | 'm'

/** The six majors the watchlist tracks, in display order. */
export const WATCHLIST_PAIRS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'USD/CHF',
] as const

export type Pair = (typeof WATCHLIST_PAIRS)[number]

/**
 * Reference macro levels not available from the free FX feed. Update by hand;
 * the UI labels these as a snapshot rather than live.
 */
export const REFERENCE_MACRO = {
  us10yPct: 4.31,
  us10yChangeBp: 3,
  vix: 13.8,
  vixNote: 'Calm · risk-on',
  asOf: '2026-06-15',
}

/** Central-bank policy snapshot (agent-maintained). */
export const CENTRAL_BANKS: CentralBank[] = [
  { name: 'Fed', ccy: 'USD', rate: 3.75, nextMeeting: '2026-06-17', bias: 'Hold → cut watch', biasTone: 'b' },
  { name: 'ECB', ccy: 'EUR', rate: 2.5, nextMeeting: '2026-07-16', bias: 'Easing done', biasTone: 'b' },
  { name: 'BoE', ccy: 'GBP', rate: 3.75, nextMeeting: '2026-06-18', bias: 'Hold', biasTone: 'b' },
  { name: 'BoJ', ccy: 'JPY', rate: 0.75, nextMeeting: '2026-07-31', bias: 'Hiking bias', biasTone: 'g' },
  { name: 'RBA', ccy: 'AUD', rate: 4.35, nextMeeting: '2026-07-07', bias: 'Hold', biasTone: 'b' },
  { name: 'BoC', ccy: 'CAD', rate: 2.25, nextMeeting: '2026-07-29', bias: 'Hold', biasTone: 'b' },
]

/**
 * Economic-calendar feed (agent-maintained). The route filters to upcoming
 * events relative to the request date and derives the "next high-impact" card.
 */
export const ECONOMIC_CALENDAR: CalendarEvent[] = [
  { date: '2026-06-16', time: '8:30 ET', event: 'US Retail Sales (MoM)', ccy: 'USD', impact: 'Med', forecast: '0.3%' },
  { date: '2026-06-17', time: '14:00 ET', event: 'FOMC Rate Decision', ccy: 'USD', impact: 'High', forecast: 'Hold' },
  { date: '2026-06-18', time: '7:00 ET', event: 'BoE Rate Decision', ccy: 'GBP', impact: 'High', forecast: '−25 bp' },
  { date: '2026-06-18', time: '8:30 ET', event: 'US Initial Jobless Claims', ccy: 'USD', impact: 'Med', forecast: '231K' },
  { date: '2026-06-19', time: '2:00 ET', event: 'UK Retail Sales (MoM)', ccy: 'GBP', impact: 'Med', forecast: '0.2%' },
  { date: '2026-06-25', time: '8:30 ET', event: 'US Core PCE (MoM)', ccy: 'USD', impact: 'High', forecast: '0.2%' },
  { date: '2026-07-04', time: '8:30 ET', event: 'US Non-Farm Payrolls', ccy: 'USD', impact: 'High', forecast: '155K' },
]
