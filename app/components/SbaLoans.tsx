'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

interface Loan {
  id: string
  borrower: string | null
  lender: string | null
  program: string | null
  original_amount: number | null
  current_balance: number | null
  interest_rate: number | null
  rate_type: string | null
  term_months: number | null
  monthly_payment: number | null
  origination_date: string | null
  maturity_date: string | null
  next_payment_date: string | null
  status: string | null
  use_of_proceeds: string | null
  notes: string | null
}

type Form = Record<string, string>

const BLANK: Form = {
  borrower: '', lender: '', program: '7(a)', original_amount: '', current_balance: '',
  interest_rate: '', rate_type: 'Fixed', term_months: '', monthly_payment: '',
  origination_date: '', maturity_date: '', next_payment_date: '', status: 'Current',
  use_of_proceeds: '', notes: '',
}

const PROGRAMS = ['7(a)', '504', 'Express', 'EIDL', 'Microloan', 'Other']
const STATUSES = ['Current', 'Deferred', 'Delinquent', 'Paid off']
const statusTone: Record<string, string> = { Current: 'g', Deferred: 'gold', Delinquent: 'r', 'Paid off': 'm' }

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

export default function SbaLoans() {
  const [pass, setPass] = useState<string | null>(null)
  const [passInput, setPassInput] = useState('')
  const [loans, setLoans] = useState<Loan[] | null>(null)
  const [locked, setLocked] = useState(false)
  const [form, setForm] = useState<Form>({ ...BLANK })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const p = typeof window !== 'undefined' ? localStorage.getItem('chevalPass') : null
    if (p) setPass(p)
  }, [])

  const load = useCallback(async (p: string) => {
    const res = await fetch('/api/sba-loans', { headers: { 'x-cheval-pass': p } })
    if (res.status === 401) {
      setLocked(true)
      setLoans(null)
      return
    }
    const d = await res.json()
    setLocked(false)
    setLoans(d.loans ?? [])
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
  function startEdit(l: Loan) {
    setEditingId(l.id)
    setForm({
      borrower: l.borrower ?? '', lender: l.lender ?? '', program: l.program ?? '7(a)',
      original_amount: l.original_amount?.toString() ?? '', current_balance: l.current_balance?.toString() ?? '',
      interest_rate: l.interest_rate?.toString() ?? '', rate_type: l.rate_type ?? 'Fixed',
      term_months: l.term_months?.toString() ?? '', monthly_payment: l.monthly_payment?.toString() ?? '',
      origination_date: l.origination_date ?? '', maturity_date: l.maturity_date ?? '',
      next_payment_date: l.next_payment_date ?? '', status: l.status ?? 'Current',
      use_of_proceeds: l.use_of_proceeds ?? '', notes: l.notes ?? '',
    })
    setMsg('')
  }
  function cancelEdit() {
    setEditingId(null)
    setForm({ ...BLANK })
  }

  async function save() {
    if (!pass) return
    setBusy(true)
    setMsg('')
    try {
      const editing = !!editingId
      const res = await fetch('/api/sba-loans', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json', 'x-cheval-pass': pass },
        body: JSON.stringify(editing ? { id: editingId, ...form } : form),
      })
      if (!res.ok) {
        setMsg('Could not save — check the fields.')
      } else {
        cancelEdit()
        await load(pass)
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!pass) return
    await fetch(`/api/sba-loans?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-cheval-pass': pass },
    })
    await load(pass)
  }

  // --- Locked / passcode gate ---
  if (!pass || locked) {
    return (
      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-soft)' }}>
        <div className="ch"><h3>🏦 SBA Loans <span className="muted sans" style={{ fontWeight: 400 }}>· private</span></h3></div>
        <p className="muted sans" style={{ fontSize: 12, marginBottom: 10 }}>
          {locked ? 'Incorrect passcode.' : 'Enter the passcode to view and manage SBA loans.'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={passInput}
            onChange={(e) => setPassInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="Passcode"
            className="sans"
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 13 }}
          />
          <button onClick={unlock} className="sans" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Unlock</button>
        </div>
      </div>
    )
  }

  const list = loans ?? []
  const totalOrig = list.reduce((s, l) => s + (l.original_amount ?? 0), 0)
  const totalBal = list.reduce((s, l) => s + (l.current_balance ?? 0), 0)
  const totalPmt = list.reduce((s, l) => s + (l.monthly_payment ?? 0), 0)

  const inputStyle: CSSProperties = { padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 12.5, width: '100%', fontFamily: "'Helvetica Neue',sans-serif" }

  return (
    <>
      <div className="grid four stats">
        <div className="card stat"><div className="lbl">SBA Loans</div><div className="v">{list.length}</div><div className="d neu">tracked</div></div>
        <div className="card stat"><div className="lbl">Total Original</div><div className="v">{money(totalOrig)}</div><div className="d neu">borrowed</div></div>
        <div className="card stat"><div className="lbl">Outstanding Balance</div><div className="v">{money(totalBal)}</div><div className="d down">owed</div></div>
        <div className="card stat"><div className="lbl">Monthly Payment</div><div className="v">{money(totalPmt)}</div><div className="d neu">combined</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch">
          <h3>🏦 SBA Loans</h3>
          <span className="muted sans">live · private tracker</span>
        </div>
        {list.length === 0 ? (
          <p className="muted sans" style={{ fontSize: 12 }}>No loans yet — add one below.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Borrower</th><th>Lender</th><th>Program</th>
                <th className="r">Original</th><th className="r">Balance</th><th className="r">Rate</th>
                <th className="r">Payment</th><th className="r">Next Pmt</th><th className="r">Status</th><th className="r"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id}>
                  <td><span className="sym">{l.borrower || '—'}</span></td>
                  <td>{l.lender || '—'}</td>
                  <td>{l.program || '—'}</td>
                  <td className="r num">{money(l.original_amount)}</td>
                  <td className="r num">{money(l.current_balance)}</td>
                  <td className="r num">{pct(l.interest_rate)}</td>
                  <td className="r num">{money(l.monthly_payment)}</td>
                  <td className="r">{shortDate(l.next_payment_date)}</td>
                  <td className="r"><span className={`pill ${statusTone[l.status ?? ''] ?? 'm'}`}>{l.status || '—'}</span></td>
                  <td className="r">
                    <span onClick={() => startEdit(l)} className="link" style={{ marginRight: 8 }}>Edit</span>
                    <span onClick={() => remove(l.id)} className="link" style={{ color: 'var(--red)' }}>Del</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch">
          <h3>{editingId ? 'Edit loan' : 'Add a loan'}</h3>
          {editingId ? <span onClick={cancelEdit} className="link">Cancel edit</span> : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <input style={inputStyle} placeholder="Borrower / entity" value={form.borrower} onChange={(e) => set('borrower', e.target.value)} />
          <input style={inputStyle} placeholder="Lender" value={form.lender} onChange={(e) => set('lender', e.target.value)} />
          <select style={inputStyle} value={form.program} onChange={(e) => set('program', e.target.value)}>
            {PROGRAMS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input style={inputStyle} type="number" placeholder="Original amount" value={form.original_amount} onChange={(e) => set('original_amount', e.target.value)} />
          <input style={inputStyle} type="number" placeholder="Current balance" value={form.current_balance} onChange={(e) => set('current_balance', e.target.value)} />
          <input style={inputStyle} type="number" step="0.01" placeholder="Interest rate %" value={form.interest_rate} onChange={(e) => set('interest_rate', e.target.value)} />
          <select style={inputStyle} value={form.rate_type} onChange={(e) => set('rate_type', e.target.value)}>
            <option>Fixed</option><option>Variable</option>
          </select>
          <input style={inputStyle} type="number" placeholder="Term (months)" value={form.term_months} onChange={(e) => set('term_months', e.target.value)} />
          <input style={inputStyle} type="number" placeholder="Monthly payment" value={form.monthly_payment} onChange={(e) => set('monthly_payment', e.target.value)} />
          <label style={{ fontSize: 10, color: 'var(--mut)' }} className="sans">Originated<input style={inputStyle} type="date" value={form.origination_date} onChange={(e) => set('origination_date', e.target.value)} /></label>
          <label style={{ fontSize: 10, color: 'var(--mut)' }} className="sans">Maturity<input style={inputStyle} type="date" value={form.maturity_date} onChange={(e) => set('maturity_date', e.target.value)} /></label>
          <label style={{ fontSize: 10, color: 'var(--mut)' }} className="sans">Next payment<input style={inputStyle} type="date" value={form.next_payment_date} onChange={(e) => set('next_payment_date', e.target.value)} /></label>
          <select style={inputStyle} value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input style={{ ...inputStyle, gridColumn: 'span 2' }} placeholder="Use of proceeds" value={form.use_of_proceeds} onChange={(e) => set('use_of_proceeds', e.target.value)} />
          <input style={{ ...inputStyle, gridColumn: 'span 3' }} placeholder="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={save} disabled={busy} className="sans" style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add loan'}
          </button>
          {msg ? <span className="muted sans" style={{ fontSize: 12, color: 'var(--red)' }}>{msg}</span> : null}
        </div>
      </div>
    </>
  )
}
