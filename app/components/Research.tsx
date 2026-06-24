'use client'

import { useEffect, useState, type CSSProperties } from 'react'

interface Source {
  title: string
  url: string
}

const QUICK = [
  "What's moving markets today and why?",
  'Latest news and catalysts for NVDA, MSFT, and AAPL',
  "Outlook and key risks into the Fed's next rate decision",
  'How are central-bank policy divergences affecting the dollar right now?',
]

const inp: CSSProperties = { flex: 1, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif" }

export default function Research() {
  const [pass, setPass] = useState<string | null>(null)
  const [passInput, setPassInput] = useState('')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'web' | 'sec'>('web')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [busy, setBusy] = useState(false)
  const [needsKey, setNeedsKey] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setPass(typeof window !== 'undefined' ? localStorage.getItem('chevalPass') : null)
  }, [])

  function unlock() {
    const p = passInput.trim()
    if (!p) return
    localStorage.setItem('chevalPass', p)
    setPass(p)
    setPassInput('')
  }

  async function run(question?: string) {
    const text = (question ?? q).trim()
    if (!text || !pass) return
    setBusy(true)
    setErr('')
    setAnswer('')
    setSources([])
    if (question) setQ(question)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cheval-pass': pass },
        body: JSON.stringify({ question: text, mode }),
      })
      const d = await res.json()
      if (d.needsKey) setNeedsKey(true)
      else if (d.error) setErr(d.error)
      else {
        setAnswer(d.answer || 'No answer.')
        setSources(d.sources || [])
      }
    } catch {
      setErr('Could not reach the research engine.')
    } finally {
      setBusy(false)
    }
  }

  if (!pass) {
    return (
      <div className="card" style={{ borderColor: 'var(--gold-soft)' }}>
        <div className="ch"><h3>🔮 AI Research <span className="muted sans" style={{ fontWeight: 400 }}>· private</span></h3></div>
        <p className="muted sans" style={{ fontSize: 12, marginBottom: 10 }}>Enter the passcode to use AI research.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} placeholder="Passcode" className="sans" style={inp} />
          <button onClick={unlock} className="sans" style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Unlock</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch">
          <h3>🔮 AI Research</h3>
          <span className="muted sans">Perplexity Sonar · cited · real-time</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            className="sans"
            style={inp}
            placeholder="Ask a markets / finance question…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <select className="sans" style={{ ...inp, flex: 'none', width: 130 }} value={mode} onChange={(e) => setMode(e.target.value as 'web' | 'sec')}>
            <option value="web">Web</option>
            <option value="sec">SEC filings</option>
          </select>
          <button onClick={() => run()} disabled={busy} className="sans" style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Researching…' : 'Ask'}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK.map((p) => (
            <span key={p} onClick={() => run(p)} className="sans" style={{ fontSize: 11, padding: '4px 9px', borderRadius: 20, border: '1px solid var(--line)', color: 'var(--mut)', cursor: 'pointer' }}>{p}</span>
          ))}
        </div>

        {needsKey ? (
          <p className="muted sans" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
            Add a <code>PERPLEXITY_API_KEY</code> to the project env to enable Perplexity Sonar research
            (get one at perplexity.ai → API). Until then this panel is ready but inactive.
          </p>
        ) : err ? (
          <p className="muted sans" style={{ fontSize: 12, marginTop: 12, color: 'var(--red)' }}>{err}</p>
        ) : answer ? (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <p className="sans" style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--txt)', whiteSpace: 'pre-wrap' }}>{answer}</p>
            {sources.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <div className="lbl" style={{ marginBottom: 6 }}>Sources</div>
                {sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="sans" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, marginBottom: 3, color: 'var(--gold)', textDecoration: 'none' }}>
                    ↗ {s.title}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
