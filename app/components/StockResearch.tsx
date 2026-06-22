'use client'

import { useEffect, useState } from 'react'

interface IndexStat {
  label: string
  price: string
  change1d: number | null
}
interface Stats {
  indices: IndexStat[]
  topMover: { symbol: string; change1d: number | null } | null
  advancing: string
}
interface Row {
  symbol: string
  name: string
  tag: string | null
  price: string
  change1d: number | null
  pe: string
  pos52w: number | null
  signal: string
  signalTone: string
}
interface Insight {
  icon: string
  title: string
  body: string
}
interface StockData {
  stockLive: boolean
  needsKey?: boolean
  aiEnabled?: boolean
  generatedAt: string
  stats?: Stats
  watchlist?: Row[]
  commentary?: Insight[]
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
const tagTone: Record<string, string> = { held: 'g', core: 'm', watch: 'gold' }

export default function StockResearch() {
  const [data, setData] = useState<StockData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stock-research')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the stock research feed.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="muted sans" style={{ padding: 4 }}>{error}</p>
  if (!data) return <p className="muted sans" style={{ padding: 4 }}>Loading live stock research…</p>
  if (!data.stockLive || !data.stats || !data.watchlist) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="ch"><h3>Equity feed paused</h3></div>
        <p className="muted sans" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          {data.needsKey
            ? 'Live equity feed needs a free FINNHUB_API_KEY (plus APIFY_TOKEN) in the project env.'
            : 'The live Finnhub feed isn’t responding — most often because the Apify account hit its monthly usage limit. Raise it in the Apify console (Settings → Limits → Monthly usage), or wait for the cycle to reset, and the data returns automatically.'}
        </p>
      </div>
    )
  }

  const { stats } = data
  const idx = stats.indices

  return (
    <>
      <div className="grid four stats">
        {idx.slice(0, 2).map((i) => (
          <div className="card stat" key={i.label}>
            <div className="lbl">{i.label}</div>
            <div className="v">{i.price}</div>
            <div className={(i.change1d ?? 0) >= 0 ? 'd up' : 'd down'}>
              {`${(i.change1d ?? 0) >= 0 ? '▲' : '▼'} ${pctText(i.change1d)}`}
            </div>
          </div>
        ))}
        <div className="card stat">
          <div className="lbl">Top 1D Mover</div>
          <div className="v" style={{ fontSize: 19 }}>{stats.topMover?.symbol ?? '—'}</div>
          <div className="d up">{stats.topMover ? `▲ ${pctText(stats.topMover.change1d)}` : ''}</div>
        </div>
        <div className="card stat">
          <div className="lbl">Advancing</div>
          <div className="v">{stats.advancing}</div>
          <div className="d neu">holdings green</div>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="ch">
            <h3>Watchlist · Holdings &amp; Targets</h3>
            <span className="muted sans">live · Finnhub</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="r">Price</th>
                <th className="r">1D</th>
                <th className="r">P/E</th>
                <th className="r">52w</th>
                <th className="r">AI Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.watchlist.map((row) => (
                <tr key={row.symbol}>
                  <td>
                    <span className="sym">{row.symbol}</span>
                    {row.tag ? <> <span className={`pill ${tagTone[row.tag] ?? 'm'}`}>{row.tag}</span></> : null}
                  </td>
                  <td className="r num">{row.price}</td>
                  <td className={pctClass(row.change1d)}>{pctText(row.change1d)}</td>
                  <td className="r num">{row.pe}</td>
                  <td className="r num">{row.pos52w === null ? '—' : `${Math.round(row.pos52w)}%`}</td>
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
        </div>
      </div>

      <p className="muted sans" style={{ marginTop: 14, fontSize: 11 }}>
        Live: price, 1D move, P/E, market cap &amp; 52-week position from Finnhub (via Apify).
        Commentary &amp; signals
        {data.aiEnabled ? ' generated by Claude' : ' from the feed’s trend classification — set ANTHROPIC_API_KEY for AI'}.
        Research only — read-only, no orders placed from this view.
      </p>
    </>
  )
}
