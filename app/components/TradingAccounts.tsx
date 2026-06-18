'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

interface Account {
  id: string
  label: string | null
  login: string | null
  role: string | null
  balance: number | null
  equity: number | null
  open_pnl: number | null
  currency: string | null
  status: string | null
}

const BLANK = { label: '', login: '', role: 'Child', balance: '', equity: '', open_pnl: '', currency: 'USD', status: 'Active' }

const input: CSSProperties = { padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--txt)', fontSize: 12.5, width: '100%', fontFamily: "'Helvetica Neue',sans-serif" }
const btn: CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const btnGhost: CSSProperties = { ...btn, background: 'var(--card2)', color: 'var(--txt)', border: '1px solid var(--line)' }

function money(v: number | null): string {
  return v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
function pnl(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: '—', cls: 'r num' }
  const s = v > 0 ? '+' : v < 0 ? '−' : ''
  return { text: `${s}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, cls: v > 0 ? 'r num up' : v < 0 ? 'r num down' : 'r num' }
}

export default function TradingAccounts() {
  const [pass, setPass] = useState<string | null>(null)
  const [passInput, setPassInput] = useState('')
  const [locked, setLocked] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState({ ...BLANK })
  const [editId, setEditId] = useState<string | null>(null)

  useEffect(() => {
    const p = typeof window !== 'undefined' ? localStorage.getItem('chevalPass') : null
    if (p) setPass(p)
  }, [])

  const load = useCallback(async (p: string) => {
    const res = await fetch('/api/trading-accounts', { headers: { 'x-cheval-pass': p } })
    if (res.status === 401) { setLocked(true); return }
    setLocked(false)
    setAccounts((await res.json()).accounts ?? [])
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
    return fetch(path, { ...init, headers: { 'content-type': 'application/json', 'x-cheval-pass': pass, ...(init.headers ?? {}) } })
  }
  async function save() {
    const res = await api('/api/trading-accounts', { method: editId ? 'PATCH' : 'POST', body: JSON.stringify(editId ? { id: editId, ...form } : form) })
    if (res?.ok) { setForm({ ...BLANK }); setEditId(null); if (pass) load(pass) }
  }
  async function del(id: string) {
    await api(`/api/trading-accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (pass) load(pass)
  }
  function edit(a: Account) {
    setEditId(a.id)
    setForm({ label: a.label ?? '', login: a.login ?? '', role: a.role ?? 'Child', balance: a.balance?.toString() ?? '', equity: a.equity?.toString() ?? '', open_pnl: a.open_pnl?.toString() ?? '', currency: a.currency ?? 'USD', status: a.status ?? 'Active' })
  }

  if (!pass || locked) {
    return (
      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-soft)' }}>
        <div className="ch"><h3>⚡ TradeSmart Accounts <span className="muted sans" style={{ fontWeight: 400 }}>· private</span></h3></div>
        <p className="muted sans" style={{ fontSize: 12, marginBottom: 10 }}>{locked ? 'Incorrect passcode.' : 'Enter the passcode to view trading accounts.'}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} placeholder="Passcode" style={{ ...input, flex: 1 }} />
          <button onClick={unlock} style={btn}>Unlock</button>
        </div>
      </div>
    )
  }

  const totEquity = accounts.reduce((s, a) => s + (a.equity ?? 0), 0)
  const totBalance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totPnl = accounts.reduce((s, a) => s + (a.open_pnl ?? 0), 0)
  const children = accounts.filter((a) => a.role !== 'Master').length

  return (
    <>
      <div className="grid four stats">
        <div className="card stat"><div className="lbl">Accounts</div><div className="v">{accounts.length}</div><div className="d neu">{children} child · master + children</div></div>
        <div className="card stat"><div className="lbl">Total Equity</div><div className="v">{money(totEquity)}</div><div className="d neu">across accounts</div></div>
        <div className="card stat"><div className="lbl">Total Balance</div><div className="v">{money(totBalance)}</div><div className="d neu">combined</div></div>
        <div className="card stat"><div className="lbl">Open P&amp;L</div><div className="v">{pnl(totPnl).text}</div><div className={totPnl >= 0 ? 'd up' : 'd down'}>floating</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch"><h3>⚡ TradeSmart · Master + Child Accounts</h3><span className="muted sans">manual · MT5 feed-ready</span></div>
        {accounts.length === 0 ? (
          <p className="muted sans" style={{ fontSize: 12 }}>No accounts yet — add the master and its child accounts below.</p>
        ) : (
          <table>
            <thead><tr><th>Account</th><th>Login</th><th className="r">Role</th><th className="r">Balance</th><th className="r">Equity</th><th className="r">Open P&amp;L</th><th className="r">Status</th><th className="r"></th></tr></thead>
            <tbody>
              {accounts.map((a) => {
                const p = pnl(a.open_pnl)
                return (
                  <tr key={a.id}>
                    <td><span className="sym">{a.label || '—'}</span></td>
                    <td className="num">{a.login || '—'}</td>
                    <td className="r"><span className={`pill ${a.role === 'Master' ? 'gold' : 'm'}`}>{a.role || 'Child'}</span></td>
                    <td className="r num">{money(a.balance)}</td>
                    <td className="r num">{money(a.equity)}</td>
                    <td className={p.cls}>{p.text}</td>
                    <td className="r"><span className={`pill ${a.status === 'Active' ? 'g' : 'm'}`}>{a.status || '—'}</span></td>
                    <td className="r"><span onClick={() => edit(a)} className="link" style={{ marginRight: 8 }}>Edit</span><span onClick={() => del(a.id)} className="link" style={{ color: 'var(--red)' }}>Del</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
          <input style={input} placeholder="Account label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input style={input} placeholder="MT5 login #" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <select style={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>Master</option><option>Child</option></select>
          <select style={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>Paused</option><option>Closed</option></select>
          <input style={input} type="number" placeholder="Balance" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
          <input style={input} type="number" placeholder="Equity" value={form.equity} onChange={(e) => setForm({ ...form, equity: e.target.value })} />
          <input style={input} type="number" placeholder="Open P&L" value={form.open_pnl} onChange={(e) => setForm({ ...form, open_pnl: e.target.value })} />
          <input style={input} placeholder="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button onClick={save} style={btn}>{editId ? 'Save account' : 'Add account'}</button>
          {editId ? <button onClick={() => { setEditId(null); setForm({ ...BLANK }) }} style={{ ...btnGhost, marginLeft: 8 }}>Cancel</button> : null}
        </div>
        <p className="muted sans" style={{ marginTop: 12, fontSize: 11 }}>
          Manual entry for now. Once you have the MT5 server + read-only investor passwords, this swaps to a live MetaApi feed — same view, real-time equity &amp; P&amp;L per account.
        </p>
      </div>
    </>
  )
}
