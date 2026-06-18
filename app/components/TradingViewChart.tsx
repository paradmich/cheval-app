'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * TradingView Advanced Chart widget (free, embeddable, read-only). Incorporates
 * TradingView's charting into the cheval-app without any broker connection —
 * pure analysis, consistent with the watch-only model. Sits above the
 * TradeSmart accounts tracker in the Intermediate-Term Trading section.
 */
const SYMBOLS: { label: string; tv: string }[] = [
  { label: 'EUR/USD', tv: 'FX:EURUSD' },
  { label: 'GBP/USD', tv: 'FX:GBPUSD' },
  { label: 'USD/JPY', tv: 'FX:USDJPY' },
  { label: 'AUD/USD', tv: 'FX:AUDUSD' },
  { label: 'USD/CAD', tv: 'FX:USDCAD' },
  { label: 'USD/CHF', tv: 'FX:USDCHF' },
  { label: 'DXY (Dollar Index)', tv: 'TVC:DXY' },
  { label: 'Gold', tv: 'TVC:GOLD' },
  { label: 'Bitcoin', tv: 'BINANCE:BTCUSDT' },
  { label: 'S&P 500', tv: 'SP:SPX' },
  { label: 'US 10Y Yield', tv: 'TVC:US10Y' },
]

export default function TradingViewChart() {
  const ref = useRef<HTMLDivElement>(null)
  const [sym, setSym] = useState('FX:EURUSD')

  useEffect(() => {
    const host = ref.current
    if (!host) return
    host.innerHTML = ''
    const widget = document.createElement('div')
    widget.className = 'tradingview-widget-container__widget'
    widget.style.height = '100%'
    widget.style.width = '100%'
    host.appendChild(widget)

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol: sym,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'light',
      style: '1',
      locale: 'en',
      autosize: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      details: false,
      support_host: 'https://www.tradingview.com',
    })
    host.appendChild(script)

    return () => {
      host.innerHTML = ''
    }
  }, [sym])

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="ch">
        <h3>📈 TradingView Chart</h3>
        <select
          value={sym}
          onChange={(e) => setSym(e.target.value)}
          className="sans"
          style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 12 }}
        >
          {SYMBOLS.map((s) => (
            <option key={s.tv} value={s.tv}>{s.label}</option>
          ))}
        </select>
      </div>
      <div ref={ref} className="tradingview-widget-container" style={{ height: 480, width: '100%' }} />
      <p className="muted sans" style={{ marginTop: 10, fontSize: 11 }}>
        Live TradingView charting — read-only analysis. Your TradeSmart account equity &amp; P&amp;L appear below (live via MetaApi once the MT5 investor passwords are connected).
      </p>
    </div>
  )
}
