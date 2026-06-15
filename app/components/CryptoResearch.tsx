'use client'

import { useEffect, useState } from 'react'

interface Stats {
  btc: { price: string; change24h: number | null } | null
  eth: { price: string; change24h: number | null } | null
  topMover: { symbol: string; change24h: number | null } | null
  watchlistMcap: string
}
interface Row {
  symbol: string
  name: string
  tag: string
  price: string
  change24h: number | null
  change7d: number | null
  marketCap: string
  fromAth: number | null
  signal: string
  signalTone: string
}
interface Insight {
  icon: string
  title: string
  body: string
}
interface CryptoData {
  cryptoLive: boolean
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
const tagTone: Record<string, string> = { held: 'g', watch: 'gold', stable: 'm' }

export default function CryptoResearch() {
  const [data, setData] = useState<CryptoData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/crypto-research')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the crypto research feed.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="muted sans" style={{ padding: 4 }}>{error}</p>
  if (!data) return <p className="muted sans" style={{ padding: 4 }}>Loading live crypto research…</p>
  if (!data.cryptoLive || !data.stats || !data.watchlist) {
    return (
      <p className="muted sans" style={{ padding: 4 }}>
        Live crypto market feed requires <code>APIFY_TOKEN</code>. Add it to enable the CoinGecko feed.
      </p>
    )
  }

  const { stats } = data

  return (
    <>
      <div className="grid four stats">
        <div className="card stat">
          <div className="lbl">Bitcoin</div>
          <div className="v">{stats.btc?.price ?? '—'}</div>
          <div className={stats.btc && (stats.btc.change24h ?? 0) >= 0 ? 'd up' : 'd down'}>
            {stats.btc ? `${(stats.btc.change24h ?? 0) >= 0 ? '▲' : '▼'} ${pctText(stats.btc.change24h)} 24h` : ''}
          </div>
        </div>
        <div className="card stat">
          <div className="lbl">Ethereum</div>
          <div className="v">{stats.eth?.price ?? '—'}</div>
          <div className={stats.eth && (stats.eth.change24h ?? 0) >= 0 ? 'd up' : 'd down'}>
            {stats.eth ? `${(stats.eth.change24h ?? 0) >= 0 ? '▲' : '▼'} ${pctText(stats.eth.change24h)} 24h` : ''}
          </div>
        </div>
        <div className="card stat">
          <div className="lbl">Top 24h Mover</div>
          <div className="v" style={{ fontSize: 19 }}>{stats.topMover?.symbol ?? '—'}</div>
          <div className="d up">{stats.topMover ? `▲ ${pctText(stats.topMover.change24h)}` : ''}</div>
        </div>
        <div className="card stat">
          <div className="lbl">Watchlist Mkt Cap</div>
          <div className="v">{stats.watchlistMcap}</div>
          <div className="d neu">tracked coins</div>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="ch">
            <h3>Watchlist · Coins</h3>
            <span className="muted sans">live · CoinGecko</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th className="r">Price</th>
                <th className="r">24h</th>
                <th className="r">7d</th>
                <th className="r">Mkt Cap</th>
                <th className="r">AI Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.watchlist.map((row) => (
                <tr key={row.symbol}>
                  <td>
                    <span className="sym">{row.symbol}</span>{' '}
                    <span className={`pill ${tagTone[row.tag] ?? 'm'}`}>{row.tag}</span>
                  </td>
                  <td className="r num">{row.price}</td>
                  <td className={pctClass(row.change24h)}>{pctText(row.change24h)}</td>
                  <td className={pctClass(row.change7d)}>{pctText(row.change7d)}</td>
                  <td className="r num">{row.marketCap}</td>
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
        Live: prices, 24h/7d moves &amp; market caps from CoinGecko (via Apify).
        Commentary &amp; signals
        {data.aiEnabled ? ' generated by Claude' : ' rule-based — set ANTHROPIC_API_KEY for AI'}.
        Research only — read-only, no trades placed from this view.
      </p>
    </>
  )
}
