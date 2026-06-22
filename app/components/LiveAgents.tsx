'use client'

import { useEffect, useState, type CSSProperties } from 'react'

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
const inp: CSSProperties = { flex: 1, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 12.5, fontFamily: "'Helvetica Neue',sans-serif" }

/**
 * Live panel for the AI Agents view: shows the agents that run on a schedule
 * (via Vercel Cron → /api/agents/run) with their real status + latest finding,
 * and lets you ASK each agent a question (Claude answers as that desk, grounded
 * in its latest finding — passcode-gated via /api/agents/ask).
 */
export default function LiveAgents() {
  const [data, setData] = useState<AgentsData | null>(null)
  const [pass, setPass] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    setPass(typeof window !== 'undefined' ? localStorage.getItem('chevalPass') : null)
    let cancelled = false
    fetch('/api/agents')
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function ask(agentId: string) {
    const question = q.trim()
    if (!question || !pass) return
    setBusy(agentId)
    setAnswers((a) => ({ ...a, [agentId]: '' }))
    try {
      const res = await fetch('/api/agents/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cheval-pass': pass },
        body: JSON.stringify({ agentId, question }),
      })
      const d = await res.json()
      setAnswers((a) => ({ ...a, [agentId]: d.answer || d.error || 'No answer.' }))
    } catch {
      setAnswers((a) => ({ ...a, [agentId]: 'Could not reach the agent.' }))
    } finally {
      setBusy(null)
    }
  }

  const agents = data?.agents ?? []

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-soft)' }}>
      <div className="ch">
        <h3>● Live Agents <span className="muted sans" style={{ fontWeight: 400 }}>· scheduled · interactive</span></h3>
        <span className="muted sans">ask any agent · read-only</span>
      </div>

      {!data ? (
        <p className="muted sans" style={{ fontSize: 12 }}>Loading agent status…</p>
      ) : agents.length === 0 ? (
        <p className="muted sans" style={{ fontSize: 12 }}>
          No scheduled runs recorded yet — agents publish their findings here after their next run.
        </p>
      ) : (
        agents.map((a) => (
          <div key={a.id} style={{ borderBottom: '1px solid var(--line)', padding: '2px 0' }}>
            <div className="item" style={{ borderBottom: 'none' }}>
              <div className="ico" style={{ background: 'var(--gold-soft)' }}>📊</div>
              <div>
                <div className="t">{a.name}</div>
                <div className="s">
                  <b>{a.headline}.</b> {a.finding}
                  {a.detail ? <span className="muted"> · {a.detail}</span> : null}
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 12 }}>
                  {a.sourceUrl ? (
                    <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">↗ {a.sourceLabel || 'View source'}</a>
                  ) : null}
                  <span className="link" onClick={() => { setOpen(open === a.id ? null : a.id); setQ('') }}>
                    {open === a.id ? 'Close' : '💬 Ask'}
                  </span>
                </div>
              </div>
              <div className="meta">
                <span className={`pill ${statusTone[a.status] ?? 'm'}`}>{a.status}</span>
                <div className="dd">ran {ago(a.lastRunISO)}</div>
              </div>
            </div>

            {open === a.id ? (
              <div style={{ padding: '4px 0 12px 46px' }}>
                {!pass ? (
                  <p className="muted sans" style={{ fontSize: 11.5 }}>
                    Unlock a private section (SBA, Investor Relations, or Acquisitions) with the passcode once, then you can chat with agents.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="sans"
                        style={inp}
                        placeholder={`Ask the ${a.name}…`}
                        value={busy === a.id ? '' : q}
                        disabled={busy === a.id}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && ask(a.id)}
                      />
                      <button
                        onClick={() => ask(a.id)}
                        disabled={busy === a.id}
                        className="sans"
                        style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', opacity: busy === a.id ? 0.6 : 1 }}
                      >
                        {busy === a.id ? '…' : 'Ask'}
                      </button>
                    </div>
                    {answers[a.id] ? (
                      <p className="sans" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 8, color: 'var(--txt)' }}>{answers[a.id]}</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
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
