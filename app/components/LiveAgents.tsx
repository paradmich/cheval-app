'use client'

import { useEffect, useState } from 'react'

interface AgentRun {
  id: string
  name: string
  status: 'Active' | 'Alert' | 'Idle'
  lastRunISO: string
  headline: string
  finding: string
  detail?: string | null
  sourceUrl?: string | null
  sourceLabel?: string | null
}
interface AgentsData {
  configured: boolean
  agents: AgentRun[]
  history: { id: string; at: string; headline: string }[]
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (!Number.isFinite(mins)) return '—'
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}
const statusTone: Record<string, string> = { Active: 'g', Alert: 'r', Idle: 'm' }

/**
 * Live panel for the AI Agents view: shows agents that actually run on a
 * schedule (via Vercel Cron → /api/agents/run), with their real last-run time
 * and latest finding — distinct from the static agent mockup below it.
 */
export default function LiveAgents() {
  const [data, setData] = useState<AgentsData | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/agents')
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const agents = data?.agents ?? []

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-soft)' }}>
      <div className="ch">
        <h3>● Live Agents <span className="muted sans" style={{ fontWeight: 400 }}>· scheduled, autonomous</span></h3>
        <span className="muted sans">runs ~3×/day · read-only</span>
      </div>

      {!data ? (
        <p className="muted sans" style={{ fontSize: 12 }}>Loading agent status…</p>
      ) : agents.length === 0 ? (
        <p className="muted sans" style={{ fontSize: 12 }}>
          No scheduled runs recorded yet. The FX Research Agent runs on a schedule (a few times
          daily) and its latest finding will appear here.
        </p>
      ) : (
        agents.map((a) => (
          <div className="item" key={a.id}>
            <div className="ico" style={{ background: 'var(--gold-soft)' }}>📊</div>
            <div>
              <div className="t">{a.name}</div>
              <div className="s">
                <b>{a.headline}.</b> {a.finding}
                {a.detail ? <span className="muted"> · {a.detail}</span> : null}
              </div>
              {a.sourceUrl ? (
                <a
                  href={a.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                  style={{ display: 'inline-block', marginTop: 4 }}
                >
                  ↗ {a.sourceLabel || 'View source'}
                </a>
              ) : null}
            </div>
            <div className="meta">
              <span className={`pill ${statusTone[a.status] ?? 'm'}`}>{a.status}</span>
              <div className="dd">ran {ago(a.lastRunISO)}</div>
            </div>
          </div>
        ))
      )}

      {data && data.history && data.history.length > 0 ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div className="lbl" style={{ marginBottom: 8 }}>Recent agent activity</div>
          {data.history.slice(0, 8).map((h, i) => (
            <div
              key={i}
              className="sans"
              style={{ display: 'flex', gap: 9, alignItems: 'baseline', padding: '3.5px 0', fontSize: 11.5, borderBottom: '1px solid var(--line)' }}
            >
              <span style={{ color: 'var(--gold)' }}>●</span>
              <span style={{ color: 'var(--mut)', width: 150, flexShrink: 0 }}>
                {agents.find((a) => a.id === h.id)?.name ?? h.id}
              </span>
              <span style={{ color: 'var(--txt)', flex: 1 }}>{h.headline}</span>
              <span style={{ color: 'var(--mut)', flexShrink: 0 }}>{ago(h.at)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
