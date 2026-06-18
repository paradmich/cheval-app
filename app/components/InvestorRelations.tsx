'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

interface Investor {
  id: string
  name: string | null
  email: string | null
  entity: string | null
  commitment: number | null
  deal: string | null
  status: string | null
}
interface Newsletter {
  id: string
  created_at: string
  sent_at: string | null
  subject: string | null
  body: string | null
  status: string | null
  recipients: number | null
}

const input: CSSProperties = { padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 12.5, width: '100%', fontFamily: "'Helvetica Neue',sans-serif" }
const btn: CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const btnGhost: CSSProperties = { ...btn, background: 'var(--card2)', color: 'var(--txt)', border: '1px solid var(--line)' }

function money(v: number | null): string {
  return v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export default function InvestorRelations() {
  const [pass, setPass] = useState<string | null>(null)
  const [passInput, setPassInput] = useState('')
  const [locked, setLocked] = useState(false)
  const [investors, setInvestors] = useState<Investor[]>([])
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [inv, setInv] = useState({ name: '', email: '', entity: '', commitment: '', status: 'Active' })
  const [invEdit, setInvEdit] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const p = typeof window !== 'undefined' ? localStorage.getItem('chevalPass') : null
    if (p) setPass(p)
  }, [])

  const load = useCallback(async (p: string) => {
    const h = { 'x-cheval-pass': p }
    const [a, b] = await Promise.all([fetch('/api/investors', { headers: h }), fetch('/api/newsletters', { headers: h })])
    if (a.status === 401) { setLocked(true); return }
    setLocked(false)
    setInvestors((await a.json()).investors ?? [])
    setNewsletters((await b.json()).newsletters ?? [])
  }, [])

  useEffect(() => { if (pass) load(pass) }, [pass, load])

  function unlock() {
    const p = passInput.trim()
    if (!p) return
    localStorage.setItem('chevalPass', p)
    setPass(p)
  }
  async function api(path: string, init: RequestInit) {
    if (!pass) return null
    const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', 'x-cheval-pass': pass, ...(init.headers ?? {}) } })
    return res
  }

  async function saveInvestor() {
    const res = await api('/api/investors', { method: invEdit ? 'PATCH' : 'POST', body: JSON.stringify(invEdit ? { id: invEdit, ...inv } : inv) })
    if (res?.ok) { setInv({ name: '', email: '', entity: '', commitment: '', status: 'Active' }); setInvEdit(null); if (pass) load(pass) }
  }
  async function delInvestor(id: string) {
    await api(`/api/investors?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (pass) load(pass)
  }
  function editInvestor(i: Investor) {
    setInvEdit(i.id)
    setInv({ name: i.name ?? '', email: i.email ?? '', entity: i.entity ?? '', commitment: i.commitment?.toString() ?? '', status: i.status ?? 'Active' })
  }

  async function aiDraft() {
    setBusy('draft'); setMsg('')
    const res = await api('/api/newsletters', { method: 'POST', body: JSON.stringify({ action: 'draft' }) })
    const d = res ? await res.json() : null
    if (d?.subject) { setSubject(d.subject); setBody(d.body); setDraftId(null) }
    else setMsg(d?.error || 'Draft failed.')
    setBusy('')
  }
  async function saveDraft() {
    setBusy('save')
    const res = await api('/api/newsletters', { method: 'POST', body: JSON.stringify({ action: 'save', id: draftId, subject, body }) })
    const d = res ? await res.json() : null
    if (d?.newsletter) { setDraftId(d.newsletter.id); if (pass) load(pass); setMsg('Draft saved.') }
    setBusy('')
  }
  async function send() {
    if (!subject || !body) { setMsg('Add a subject and body first.'); return }
    if (!window.confirm(`Send "${subject}" to ${investors.filter((i) => i.email).length} investor(s)?`)) return
    setBusy('send'); setMsg('')
    const res = await api('/api/newsletters', { method: 'POST', body: JSON.stringify({ action: 'send', id: draftId, subject, body }) })
    const d = res ? await res.json() : null
    if (d?.sent) { setMsg(`Sent to ${d.recipients} investor(s).`); setSubject(''); setBody(''); setDraftId(null); if (pass) load(pass) }
    else setMsg(d?.error || 'Send failed.')
    setBusy('')
  }

  if (!pass || locked) {
    return (
      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-soft)' }}>
        <div className="ch"><h3>🤝 Investor Relations <span className="muted sans" style={{ fontWeight: 400 }}>· private</span></h3></div>
        <p className="muted sans" style={{ fontSize: 12, marginBottom: 10 }}>{locked ? 'Incorrect passcode.' : 'Enter the passcode to manage investors & newsletters.'}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} placeholder="Passcode" style={{ ...input, flex: 1 }} />
          <button onClick={unlock} style={btn}>Unlock</button>
        </div>
      </div>
    )
  }

  const totalCommit = investors.reduce((s, i) => s + (i.commitment ?? 0), 0)

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch"><h3>📇 Investor Directory</h3><span className="muted sans">{investors.length} LPs · {money(totalCommit)} committed</span></div>
        {investors.length > 0 && (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Entity</th><th className="r">Commitment</th><th className="r">Status</th><th className="r"></th></tr></thead>
            <tbody>
              {investors.map((i) => (
                <tr key={i.id}>
                  <td><span className="sym">{i.name || '—'}</span></td>
                  <td>{i.email || '—'}</td>
                  <td>{i.entity || '—'}</td>
                  <td className="r num">{money(i.commitment)}</td>
                  <td className="r"><span className={`pill ${i.status === 'Active' ? 'g' : 'gold'}`}>{i.status || '—'}</span></td>
                  <td className="r"><span onClick={() => editInvestor(i)} className="link" style={{ marginRight: 8 }}>Edit</span><span onClick={() => delInvestor(i.id)} className="link" style={{ color: 'var(--red)' }}>Del</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginTop: 12 }}>
          <input style={input} placeholder="Name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
          <input style={input} placeholder="Email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
          <input style={input} placeholder="Entity" value={inv.entity} onChange={(e) => setInv({ ...inv, entity: e.target.value })} />
          <input style={input} type="number" placeholder="Commitment" value={inv.commitment} onChange={(e) => setInv({ ...inv, commitment: e.target.value })} />
          <select style={input} value={inv.status} onChange={(e) => setInv({ ...inv, status: e.target.value })}><option>Active</option><option>Prospect</option></select>
        </div>
        <div style={{ marginTop: 10 }}>
          <button onClick={saveInvestor} style={btn}>{invEdit ? 'Save investor' : 'Add investor'}</button>
          {invEdit ? <button onClick={() => { setInvEdit(null); setInv({ name: '', email: '', entity: '', commitment: '', status: 'Active' }) }} style={{ ...btnGhost, marginLeft: 8 }}>Cancel</button> : null}
        </div>
      </div>

      <div className="card ai" style={{ marginBottom: 16 }}>
        <div className="ch"><h3>✦ Investor Newsletter</h3><span className="muted sans">AI-drafted · sent via Resend</span></div>
        <input style={{ ...input, marginBottom: 8 }} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea style={{ ...input, minHeight: 200, resize: 'vertical' }} placeholder="Write the update, or click ✦ AI Draft to generate one from today's market context…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={aiDraft} disabled={!!busy} style={btnGhost}>{busy === 'draft' ? 'Drafting…' : '✦ AI Draft'}</button>
          <button onClick={saveDraft} disabled={!!busy} style={btnGhost}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
          <button onClick={send} disabled={!!busy} style={btn}>{busy === 'send' ? 'Sending…' : 'Send to investors'}</button>
          {msg ? <span className="muted sans" style={{ fontSize: 12 }}>{msg}</span> : null}
        </div>
      </div>

      <div className="card">
        <div className="ch"><h3>Newsletter Archive</h3><span className="muted sans">drafts &amp; sent</span></div>
        {newsletters.length === 0 ? (
          <p className="muted sans" style={{ fontSize: 12 }}>No newsletters yet.</p>
        ) : (
          <table>
            <thead><tr><th>Subject</th><th className="r">Status</th><th className="r">Recipients</th><th className="r">Sent</th><th className="r"></th></tr></thead>
            <tbody>
              {newsletters.map((n) => (
                <tr key={n.id}>
                  <td><span className="sym">{n.subject || '(untitled)'}</span></td>
                  <td className="r"><span className={`pill ${n.status === 'sent' ? 'g' : 'gold'}`}>{n.status}</span></td>
                  <td className="r num">{n.recipients ?? '—'}</td>
                  <td className="r">{when(n.sent_at)}</td>
                  <td className="r"><span onClick={() => { setSubject(n.subject ?? ''); setBody(n.body ?? ''); setDraftId(n.status === 'sent' ? null : n.id) }} className="link">{n.status === 'sent' ? 'Reuse' : 'Open'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
