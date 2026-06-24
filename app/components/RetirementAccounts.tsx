'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

interface Acct {
  id: string
  account_type: string | null
  provider: string | null
  owner: string | null
  balance: number | null
  contributions_ytd: number | null
  annual_limit: number | null
  employer_match: string | null
  allocation: string | null
  vested_pct: number | null
  as_of_date: string | null
  notes: string | null
}

type Form = Record<string, string>
const BLANK: Form = {
  account_type: '401(k)', provider: '', owner: '', balance: '', contributions_ytd: '',
  annual_limit: '', employer_match: '', allocation: '', vested_pct: '', as_of_date: '', notes: '',
}
const TYPES = ['401(k)', 'Roth 401(k)', 'Traditional IRA', 'Roth IRA', 'SEP-IRA', 'SIMPLE IRA', 'Solo 401(k)', '403(b)', 'HSA', 'Pension', 'Other']

function money(v: number | null | undefined): string {
  if (v == null) return '—'
  return `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
function pct(v: number | null): string {
  return v == null ? '—' : `${v}%`
}
function shortDate(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}
const inputStyle: CSSProperties = { padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 12.5, width: '100%', fontFamily: "'Helvetica Neue',sans-serif" }
const btn: CSSProperties = { padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }

export default function RetirementAccounts() {
  const [pass, setPass] = useState<string | null>(null)
  const [passInput, setPassInput] = useState('')
  const [accts, setAccts] = useState<Acct[] | null>(null)
  const [locked, setLocked] = useState(false)
  const [form, setForm] = useState<Form>({ ...BLANK })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const p = typeof window !== 'undefined' ? localStorage.getItem('chevalPass') : null
    if (p) setPass(p)
  }, [])

  const load = useCallback(async (p: string) => {
    const res = await fetch('/api/retirement', { headers: { 'x-cheval-pass': p } })
    if (res.status === 401) {
      setLocked(true)
      setAccts(null)
      return
    }
    const d = await res.json()
    setLocked(false)
    setAccts(d.accounts ?? [])
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
  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }
  function startEdit(a: Acct) {
    setEditingId(a.id)
    setForm({
      account_type: a.account_type ?? '401(k)', provider: a.provider ?? '', owner: a.owner ?? '',
      balance: a.balance?.toString() ?? '', contributions_ytd: a.contributions_ytd?.toString() ?? '',
      annual_limit: a.annual_limit?.toString() ?? '', employer_match: a.employer_match ?? '',
      allocation: a.allocation ?? '', vested_pct: a.vested_pct?.toString() ?? '',
      as_of_date: a.as_of_date ?? '', notes: a.notes ?? '',
    })
  }
  function cancelEdit() {
    setEditingId(null)
    setForm({ ...BLANK })
  }

  async function save() {
    if (!pass) return
    setBusy(true)
    try {
      const editing = !!editingId
      await fetch('/api/retirement', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json', 'x-cheval-pass': pass },
        body: JSON.stringify(editing ? { id: editingId, ...form } : form),
      })
      cancelEdit()
      await load(pass)
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    if (!pass) return
    await fetch(`/api/retirement?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-cheval-pass': pass } })
    await load(pass)
  }

  if (!pass || locked) {
    return (
      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-soft)' }}>
        <div className="ch"><h3>🪺 Retirement <span className="muted sans" style={{ fontWeight: 400 }}>· private</span></h3></div>
        <p className="muted sans" style={{ fontSize: 12, marginBottom: 10 }}>{locked ? 'Incorrect passcode.' : 'Enter the passcode to view and manage retirement accounts.'}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} placeholder="Passcode" className="sans" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={unlock} style={btn}>Unlock</button>
        </div>
      </div>
    )
  }

  const list = accts ?? []
  const totalBal = list.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totalContrib = list.reduce((s, a) => s + (a.contributions_ytd ?? 0), 0)

  return (
    <>
      <div className="grid four stats">
        <div className="card stat"><div className="lbl">Accounts</div><div className="v">{list.length}</div><div className="d neu">tracked</div></div>
        <div className="card stat"><div className="lbl">Total Value</div><div className="v">{money(totalBal)}</div><div className="d up">retirement</div></div>
        <div className="card stat"><div className="lbl">Contributions YTD</div><div className="v">{money(totalContrib)}</div><div className="d neu">this year</div></div>
        <div className="card stat"><div className="lbl">Account Types</div><div className="v" style={{ fontSize: 17 }}>{new Set(list.map((a) => a.account_type).filter(Boolean)).size || '—'}</div><div className="d neu">distinct</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch"><h3>🪺 Retirement Accounts</h3><span className="muted sans">live · private tracker</span></div>
        {list.length === 0 ? (
          <p className="muted sans" style={{ fontSize: 12 }}>No accounts yet — add one below.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th><th>Provider</th><th>Owner</th>
                <th className="r">Balance</th><th className="r">Contrib YTD</th><th className="r">Vested</th>
                <th className="r">As of</th><th className="r"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td><span className="sym">{a.account_type || '—'}</span></td>
                  <td>{a.provider || '—'}</td>
                  <td>{a.owner || '—'}</td>
                  <td className="r num">{money(a.balance)}</td>
                  <td className="r num">{money(a.contributions_ytd)}</td>
                  <td className="r num">{pct(a.vested_pct)}</td>
                  <td className="r">{shortDate(a.as_of_date)}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <span onClick={() => startEdit(a)} className="link" style={{ marginRight: 8 }}>Edit</span>
                    <span onClick={() => remove(a.id)} className="link" style={{ color: 'var(--red)' }}>Del</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch">
          <h3>{editingId ? 'Edit account' : 'Add an account'}</h3>
          {editingId ? <span onClick={cancelEdit} className="link">Cancel edit</span> : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <select style={inputStyle} value={form.account_type} onChange={(e) => set('account_type', e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input style={inputStyle} placeholder="Provider / custodian" value={form.provider} onChange={(e) => set('provider', e.target.value)} />
          <input style={inputStyle} placeholder="Owner / entity" value={form.owner} onChange={(e) => set('owner', e.target.value)} />
          <input style={inputStyle} type="number" placeholder="Balance" value={form.balance} onChange={(e) => set('balance', e.target.value)} />
          <input style={inputStyle} type="number" placeholder="Contributions YTD" value={form.contributions_ytd} onChange={(e) => set('contributions_ytd', e.target.value)} />
          <input style={inputStyle} type="number" placeholder="Annual limit" value={form.annual_limit} onChange={(e) => set('annual_limit', e.target.value)} />
          <input style={inputStyle} placeholder="Employer match (e.g. 4%)" value={form.employer_match} onChange={(e) => set('employer_match', e.target.value)} />
          <input style={inputStyle} type="number" step="0.1" placeholder="Vested %" value={form.vested_pct} onChange={(e) => set('vested_pct', e.target.value)} />
          <label style={{ fontSize: 10, color: 'var(--mut)' }} className="sans">As of<input style={inputStyle} type="date" value={form.as_of_date} onChange={(e) => set('as_of_date', e.target.value)} /></label>
          <input style={{ ...inputStyle, gridColumn: 'span 3' }} placeholder="Allocation (e.g. 80/20 stocks/bonds, target-date 2045)" value={form.allocation} onChange={(e) => set('allocation', e.target.value)} />
          <input style={{ ...inputStyle, gridColumn: 'span 3' }} placeholder="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={save} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add account'}</button>
        </div>
      </div>
    </>
  )
}
