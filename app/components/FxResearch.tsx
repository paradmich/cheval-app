'use client'

import { useEffect, useState } from 'react'

interface Stats {
  dxy: string
  dxyChange1d: number | null
  us10yPct: number
  us10yChangeBp: number
  vix: number
  vixNote: string
  macroAsOf: string
  nextHighImpact: { event: string; inDays: number } | null
}
interface Row {
  pair: string
  rate: string
  change1d: number | null
  change1w: number | null
  trend: string
  signal: string
  signalTone: string
}
interface Insight {
  icon: string
  title: string
  body: string
}
interface CalRow {
  when: string
  event: string
  ccy: string
  impact: string
  forecast: string
}
interface BankRow {
  name: string
  ccy: string
  rate: string
  nextMeeting: string
  bias: string
  biasTone: string
}
interface Headline {
  title: string
  url: string
  pubDate: string
}
interface FxData {
  live: boolean
  aiEnabled: boolean
  calendarLive?: boolean
  newsLive?: boolean
  headlines?: Headline[]
  generatedAt: string
  error?: string
  stats?: Stats
  watchlist?: Row[]
  commentary?: Insight[]
  calendar?: CalRow[]
  centralBanks?: BankRow[]
}

function pctClass(v: number | null): string {
  if (v === null) return 'r num'
  return v > 0 ? 'r num up' : v < 0 ? 'r num down' : 'r num'
}
function pctText(v: number | null): string {
  if (v === null) return '—'
  const s = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${s}${Math.abs(v).toFixed(1)}%`
}
function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}
const impactTone: Record<string, string> = { High: 'r', Med: 'gold', Low: 'b' }

export default function FxResearch() {
  const [data, setData] = useState<FxData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/fx-research')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the FX research feed.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="muted sans" style={{ padding: 4 }}>{error}</p>
  if (!data) return <p className="muted sans" style={{ padding: 4 }}>Loading live FX research…</p>
  if (!data.live || !data.stats || !data.watchlist) {
    return (
      <p className="muted sans" style={{ padding: 4 }}>
        Live rate feed is temporarily unavailable. Try again shortly.
      </p>
    )
  }

  const { stats } = data
  const dxyClass = stats.dxyChange1d === null ? 'd neu' : stats.dxyChange1d >= 0 ? 'd up' : 'd down'

  return (
    <>
      <div className="grid four stats">
        <div className="card stat">
          <div className="lbl">Dollar Index (DXY)</div>
          <div className="v">{stats.dxy}</div>
          <div className={dxyClass}>
            {stats.dxyChange1d === null
              ? 'live'
              : `${stats.dxyChange1d >= 0 ? '▲' : '▼'} ${pctText(stats.dxyChange1d)}`}
          </div>
        </div>
        <div className="card stat">
          <div className="lbl">US 10-Year</div>
          <div className="v">{stats.us10yPct.toFixed(2)}%</div>
          <div className={stats.us10yChangeBp >= 0 ? 'd up' : 'd down'}>
            {stats.us10yChangeBp >= 0 ? '▲' : '▼'} {Math.abs(stats.us10yChangeBp)} bp
          </div>
        </div>
        <div className="card stat">
          <div className="lbl">Risk (VIX)</div>
          <div className="v">{stats.vix.toFixed(1)}</div>
          <div className="d neu">{stats.vixNote}</div>
        </div>
        <div className="card stat">
          <div className="lbl">Next High-Impact</div>
          <div className="v" style={{ fontSize: 17 }}>
            {stats.nextHighImpact?.event ?? '—'}
          </div>
          <div className="d down">
            {stats.nextHighImpact
              ? stats.nextHighImpact.inDays === 0
                ? 'today'
                : `in ${stats.nextHighImpact.inDays} day${stats.nextHighImpact.inDays === 1 ? '' : 's'}`
              : ''}
          </div>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="ch">
            <h3>Watchlist · Major Pairs</h3>
            <span className="muted sans">live · ECB reference feed</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Pair</th>
                <th className="r">Rate</th>
                <th className="r">1D</th>
                <th className="r">1W</th>
                <th className="r">Trend</th>
                <th className="r">AI Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.watchlist.map((row) => (
                <tr key={row.pair}>
                  <td>
                    <span className="sym">{row.pair}</span>
                  </td>
                  <td className="r num">{row.rate}</td>
                  <td className={pctClass(row.change1d)}>{pctText(row.change1d)}</td>
                  <td className={pctClass(row.change1w)}>{pctText(row.change1w)}</td>
                  <td className="r">{row.trend}</td>
                  <td className="r">
                    <span className={`pill ${row.signalTone}`}>{row.signal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card ai">
          <div className="ch">
            <h3>✦ AI Market Commentary</h3>
            <span className={`pill ${data.aiEnabled ? 'g' : 'm'}`}>
              {data.aiEnabled ? `Updated ${ago(data.generatedAt)}` : 'Rule-based'}
            </span>
          </div>
          {data.commentary?.map((c, i) => (
            <div className="insight" key={i}>
              <span>{c.icon}</span>
              <p>
                <b>{c.title}.</b> {c.body}
              </p>
            </div>
          ))}
          {data.newsLive && data.headlines && data.headlines.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <div className="lbl" style={{ marginBottom: 6 }}>📰 Grounded in</div>
              {data.headlines.slice(0, 3).map((h, i) => (
                <a
                  key={i}
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="muted sans"
                  style={{ display: 'block', fontSize: 11, lineHeight: 1.5, marginBottom: 3, color: 'var(--mut)', textDecoration: 'none' }}
                >
                  ↗ {h.title}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="ch">
            <h3>Economic Calendar</h3>
            <span className="muted sans">
              {data.calendarLive ? 'live · ForexFactory' : 'next releases'}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th className="r">Ccy</th>
                <th className="r">Impact</th>
                <th className="r">Forecast</th>
              </tr>
            </thead>
            <tbody>
              {data.calendar?.map((e, i) => (
                <tr key={i}>
                  <td>{e.when}</td>
                  <td>{e.event}</td>
                  <td className="r">{e.ccy}</td>
                  <td className="r">
                    <span className={`pill ${impactTone[e.impact] ?? 'b'}`}>{e.impact}</span>
                  </td>
                  <td className="r num">{e.forecast}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="ch">
            <h3>Central Bank Rates · Carry</h3>
            <span className="muted sans">policy &amp; bias</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Bank</th>
                <th className="r">Rate</th>
                <th className="r">Next Mtg</th>
                <th className="r">Bias</th>
              </tr>
            </thead>
            <tbody>
              {data.centralBanks?.map((b) => (
                <tr key={b.name}>
                  <td>
                    <span className="sym">{b.name}</span> {b.ccy}
                  </td>
                  <td className="r num">{b.rate}%</td>
                  <td className="r">{b.nextMeeting}</td>
                  <td className="r">
                    <span className={`pill ${b.biasTone}`}>{b.bias}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted sans" style={{ marginTop: 14, fontSize: 11 }}>
        Live: spot rates, 1D/1W moves &amp; DXY proxy from the free ECB reference feed
        (Frankfurter){data.calendarLive ? '; economic calendar scraped from ForexFactory via Apify' : ''}.
        Snapshot (agent-maintained): central-bank policy
        {data.calendarLive ? '' : ', the economic calendar'} and 10Y/VIX (as of {stats.macroAsOf}).
        Commentary &amp; signals
        {data.aiEnabled ? ' generated by Claude' : ' rule-based — set ANTHROPIC_API_KEY for AI'}
        {data.newsLive ? ', grounded in live Investing.com headlines (Apify)' : ''}.
        Research only — read-only, no orders placed from this view.
      </p>
    </>
  )
}
