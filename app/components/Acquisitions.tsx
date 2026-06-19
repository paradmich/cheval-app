'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

interface Deal {
  id: string
  asset_class: string
  name: string
  location: string | null
  asking_price: number | null
  headline_metric: string | null
  status: string
  source_url: string | null
  details: Record<string, unknown> | null
  notes: string | null
  fit_score: number | null
  fit_summary: string | null
}
interface BuyBox {
  asset_class: string
  criteria: Record<string, string>
}
type Field = { key: string; label: string; type?: 'text' | 'number' | 'select'; options?: string[]; span?: number }

const CLASSES = [
  { key: 'real_estate', label: 'Real Estate' },
  { key: 'business', label: 'Business' },
]
const STATUSES = ['Sourced', 'Reviewing', 'LOI', 'Due Diligence', 'Closed', 'Passed']
const statusTone: Record<string, string> = { Sourced: 'b', Reviewing: 'gold', LOI: 'gold', 'Due Diligence': 'g', Closed: 'g', Passed: 'm' }

const CRITERIA: Record<string, Field[]> = {
  real_estate: [
    { key: 'assetTypes', label: 'Asset types', span: 2 },
    { key: 'markets', label: 'Target markets', span: 2 },
    { key: 'priceMin', label: 'Price min', type: 'number' },
    { key: 'priceMax', label: 'Price max', type: 'number' },
    { key: 'unitsMin', label: 'Units min', type: 'number' },
    { key: 'unitsMax', label: 'Units max', type: 'number' },
    { key: 'pricePerDoorMax', label: 'Max $/door', type: 'number' },
    { key: 'capRateMin', label: 'Min cap %', type: 'number' },
    { key: 'cashOnCashMin', label: 'Min CoC %', type: 'number' },
    { key: 'strategy', label: 'Strategy', type: 'select', options: ['Value-add', 'Stabilized', 'Opportunistic', 'Development'] },
    { key: 'holdYears', label: 'Hold (yrs)', type: 'number' },
    { key: 'maxLeverage', label: 'Max leverage %', type: 'number' },
    { key: 'notes', label: 'Notes', span: 4 },
  ],
  business: [
    { key: 'industries', label: 'Industries', span: 2 },
    { key: 'geography', label: 'Geography', span: 2 },
    { key: 'revenueMin', label: 'Revenue min', type: 'number' },
    { key: 'revenueMax', label: 'Revenue max', type: 'number' },
    { key: 'ebitdaMin', label: 'EBITDA min', type: 'number' },
    { key: 'ebitdaMax', label: 'EBITDA max', type: 'number' },
    { key: 'ebitdaMarginMin', label: 'Min margin %', type: 'number' },
    { key: 'multipleMax', label: 'Max multiple x', type: 'number' },
    { key: 'dealSizeMin', label: 'Deal size min', type: 'number' },
    { key: 'dealSizeMax', label: 'Deal size max', type: 'number' },
    { key: 'ownershipMin', label: 'Min ownership %', type: 'number' },
    { key: 'type', label: 'Type', type: 'select', options: ['Platform', 'Add-on', 'Either'] },
    { key: 'ownerTransition', label: 'Owner transition', span: 2 },
    { key: 'notes', label: 'Notes', span: 2 },
  ],
}
const DEAL_DETAILS: Record<string, Field[]> = {
  real_estate: [
    { key: 'units', label: 'Units', type: 'number' },
    { key: 'capRate', label: 'Cap %', type: 'number' },
    { key: 'pricePerDoor', label: '$/door', type: 'number' },
    { key: 'noi', label: 'NOI', type: 'number' },
  ],
  business: [
    { key: 'revenue', label: 'Revenue', type: 'number' },
    { key: 'ebitda', label: 'EBITDA', type: 'number' },
    { key: 'multiple', label: 'Multiple x', type: 'number' },
    { key: 'margin', label: 'Margin %', type: 'number' },
  ],
}

function money(v: number | null | undefined): string {
  if (v == null) return '—'
  return `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
function fitTone(s: number | null): string {
  if (s == null) return 'm'
  return s >= 70 ? 'g' : s >= 45 ? 'gold' : 'r'
}
const input: CSSProperties = { padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 12.5, width: '100%', fontFamily: "'Helvetica Neue',sans-serif" }
const btn: CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }

const blankDeal = (): Record<string, string> => ({
  asset_class: 'real_estate', name: '', location: '', asking_price: '', headline_metric: '',
  status: 'Sourced', source_url: '', notes: '',
  units: '', capRate: '', pricePerDoor: '', noi: '', revenue: '', ebitda: '', multiple: '', margin: '',
})

export default function Acquisitions() {
  const [pass, setPass] = useState<string | null>(null)
  const [passInput, setPassInput] = useState('')
  const [locked, setLocked] = useState(false)
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [bb, setBb] = useState<Record<string, Record<string, string>>>({ real_estate: {}, business: {} })
  const [form, setForm] = useState<Record<string, string>>(blankDeal())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedBox, setSavedBox] = useState('')

  useEffect(() => {
    const p = typeof window !== 'undefined' ? localStorage.getItem('chevalPass') : null
    if (p) setPass(p)
  }, [])

  const load = useCallback(async (p: string) => {
    const h = { 'x-cheval-pass': p }
    const [dRes, bRes] = await Promise.all([fetch('/api/deals', { headers: h }), fetch('/api/buybox', { headers: h })])
    if (dRes.status === 401 || bRes.status === 401) {
      setLocked(true)
      setDeals(null)
      return
    }
    setLocked(false)
    const d = await dRes.json()
    setDeals(d.deals ?? [])
    const b = await bRes.json()
    const map: Record<string, Record<string, string>> = { real_estate: {}, business: {} }
    for (const row of (b.buyboxes ?? []) as BuyBox[]) map[row.asset_class] = (row.criteria as Record<string, string>) ?? {}
    setBb(map)
  }, [])

  useEffect(() => {
    if (pass) load(pass)
  }, [pass, load])

  function unlock() {
    const p = passInput.trim()
    if (!p) return
    localStorage.setItem('chevalPass', p)
    setPass(p)
    setPassInput('')
  }

  async function saveBuybox(ac: string) {
    if (!pass) return
    await fetch('/api/buybox', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cheval-pass': pass },
      body: JSON.stringify({ asset_class: ac, criteria: bb[ac] ?? {} }),
    })
    setSavedBox(ac)
    setTimeout(() => setSavedBox(''), 2000)
  }

  async function saveDeal() {
    if (!pass) return
    setBusy(true)
    try {
      const ac = form.asset_class
      const dfields = DEAL_DETAILS[ac] ?? []
      const details: Record<string, string> = {}
      for (const f of dfields) if (form[f.key]) details[f.key] = form[f.key]
      const body = {
        asset_class: ac, name: form.name, location: form.location, asking_price: form.asking_price,
        headline_metric: form.headline_metric, status: form.status, source_url: form.source_url,
        notes: form.notes, details,
        ...(editingId ? { id: editingId } : {}),
      }
      await fetch('/api/deals', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json', 'x-cheval-pass': pass },
        body: JSON.stringify(body),
      })
      setForm(blankDeal())
      setEditingId(null)
      await load(pass)
    } finally {
      setBusy(false)
    }
  }

  async function rescore(id: string) {
    if (!pass) return
    await fetch('/api/deals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cheval-pass': pass },
      body: JSON.stringify({ action: 'rescore', id }),
    })
    await load(pass)
  }
  async function remove(id: string) {
    if (!pass) return
    await fetch(`/api/deals?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-cheval-pass': pass } })
    await load(pass)
  }
  function startEdit(d: Deal) {
    const det = (d.details ?? {}) as Record<string, unknown>
    setEditingId(d.id)
    setForm({
      ...blankDeal(),
      asset_class: d.asset_class, name: d.name, location: d.location ?? '',
      asking_price: d.asking_price?.toString() ?? '', headline_metric: d.headline_metric ?? '',
      status: d.status, source_url: d.source_url ?? '', notes: d.notes ?? '',
      ...Object.fromEntries(Object.entries(det).map(([k, v]) => [k, v == null ? '' : String(v)])),
    })
  }

  if (!pass || locked) {
    return (
      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-soft)' }}>
        <div className="ch"><h3>🎯 Acquisitions <span className="muted sans" style={{ fontWeight: 400 }}>· private</span></h3></div>
        <p className="muted sans" style={{ fontSize: 12, marginBottom: 10 }}>{locked ? 'Incorrect passcode.' : 'Enter the passcode to manage your buy box and deal pipeline.'}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} placeholder="Passcode" className="sans" style={{ ...input, flex: 1 }} />
          <button onClick={unlock} style={btn}>Unlock</button>
        </div>
      </div>
    )
  }

  const list = deals ?? []
  const active = list.filter((d) => !['Closed', 'Passed'].includes(d.status)).length
  const scored = list.filter((d) => d.fit_score != null)
  const avgFit = scored.length ? Math.round(scored.reduce((s, d) => s + (d.fit_score ?? 0), 0) / scored.length) : null

  return (
    <>
      <div className="grid four stats">
        <div className="card stat"><div className="lbl">Pipeline</div><div className="v">{list.length}</div><div className="d neu">deals tracked</div></div>
        <div className="card stat"><div className="lbl">Active</div><div className="v">{active}</div><div className="d neu">not closed/passed</div></div>
        <div className="card stat"><div className="lbl">Avg Fit Score</div><div className="v">{avgFit ?? '—'}</div><div className="d neu">vs buy box</div></div>
        <div className="card stat"><div className="lbl">Best Fit</div><div className="v" style={{ fontSize: 17 }}>{scored.length ? `${Math.max(...scored.map((d) => d.fit_score ?? 0))}` : '—'}</div><div className="d up">top candidate</div></div>
      </div>

      {/* Buy boxes */}
      <div className="grid two" style={{ marginBottom: 16 }}>
        {CLASSES.map((c) => (
          <div className="card" key={c.key}>
            <div className="ch">
              <h3>📦 Buy Box · {c.label}</h3>
              <span onClick={() => saveBuybox(c.key)} className="link">{savedBox === c.key ? 'Saved ✓' : 'Save'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {CRITERIA[c.key].map((f) => (
                <label key={f.key} className="sans" style={{ fontSize: 9.5, color: 'var(--mut)', gridColumn: f.span ? `span ${f.span}` : undefined }}>
                  {f.label}
                  {f.type === 'select' ? (
                    <select style={input} value={bb[c.key]?.[f.key] ?? ''} onChange={(e) => setBb((b) => ({ ...b, [c.key]: { ...b[c.key], [f.key]: e.target.value } }))}>
                      <option value=""></option>
                      {f.options?.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input style={input} type={f.type === 'number' ? 'number' : 'text'} value={bb[c.key]?.[f.key] ?? ''} onChange={(e) => setBb((b) => ({ ...b, [c.key]: { ...b[c.key], [f.key]: e.target.value } }))} />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch"><h3>Deal Pipeline</h3><span className="muted sans">AI fit-scored vs your buy box</span></div>
        {list.length === 0 ? (
          <p className="muted sans" style={{ fontSize: 12 }}>No deals yet — add one below and it&apos;ll be scored against your buy box.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Deal</th><th>Class</th><th>Location</th><th className="r">Asking</th><th className="r">Metric</th>
                <th className="r">Fit</th><th className="r">Status</th><th className="r"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="sym">{d.name}</span>
                    {d.source_url ? <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="link" style={{ marginLeft: 6 }}>↗</a> : null}
                    {d.fit_summary ? <div className="muted sans" style={{ fontSize: 10.5, lineHeight: 1.4, marginTop: 2, maxWidth: 320 }}>{d.fit_summary}</div> : null}
                  </td>
                  <td>{d.asset_class === 'business' ? 'Business' : 'Real Estate'}</td>
                  <td>{d.location || '—'}</td>
                  <td className="r num">{money(d.asking_price)}</td>
                  <td className="r">{d.headline_metric || '—'}</td>
                  <td className="r"><span className={`pill ${fitTone(d.fit_score)}`}>{d.fit_score ?? '—'}</span></td>
                  <td className="r"><span className={`pill ${statusTone[d.status] ?? 'm'}`}>{d.status}</span></td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <span onClick={() => rescore(d.id)} className="link" style={{ marginRight: 7 }}>Score</span>
                    <span onClick={() => startEdit(d)} className="link" style={{ marginRight: 7 }}>Edit</span>
                    <span onClick={() => remove(d.id)} className="link" style={{ color: 'var(--red)' }}>Del</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / edit deal */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch">
          <h3>{editingId ? 'Edit deal' : 'Add a deal'}</h3>
          {editingId ? <span onClick={() => { setEditingId(null); setForm(blankDeal()) }} className="link">Cancel edit</span> : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <select style={input} value={form.asset_class} onChange={(e) => setForm((f) => ({ ...f, asset_class: e.target.value }))}>
            {CLASSES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input style={{ ...input, gridColumn: 'span 2' }} placeholder="Deal name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <select style={input} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <input style={input} placeholder="Location / market" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          <input style={input} type="number" placeholder="Asking price" value={form.asking_price} onChange={(e) => setForm((f) => ({ ...f, asking_price: e.target.value }))} />
          <input style={input} placeholder='Headline metric (e.g. "6.2% cap")' value={form.headline_metric} onChange={(e) => setForm((f) => ({ ...f, headline_metric: e.target.value }))} />
          <input style={input} placeholder="Source URL" value={form.source_url} onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))} />
          {(DEAL_DETAILS[form.asset_class] ?? []).map((f) => (
            <input key={f.key} style={input} type={f.type === 'number' ? 'number' : 'text'} placeholder={f.label} value={form[f.key] ?? ''} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
          ))}
          <input style={{ ...input, gridColumn: 'span 4' }} placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={saveDeal} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving & scoring…' : editingId ? 'Save changes' : 'Add deal + score'}
          </button>
        </div>
      </div>
    </>
  )
}
