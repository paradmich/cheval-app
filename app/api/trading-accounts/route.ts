import { pick, passOk, supaEnv, supaFetch } from '../../lib/supabaseRest'

/**
 * TradeSmart (MT5) master + child accounts — table `cheval_trading_accounts`,
 * passcode-gated. Manual-entry today; the GET shape (label, login, role,
 * balance, equity, open_pnl) is what a future MetaApi live feed will return,
 * so the UI doesn't change when we swap the data source.
 */
export const dynamic = 'force-dynamic'

const TABLE = 'cheval_trading_accounts'
const FIELDS = ['label', 'login', 'role', 'balance', 'equity', 'open_pnl', 'currency', 'status', 'notes'] as const
const NUMERIC = new Set(['balance', 'equity', 'open_pnl'])

function notConfigured() {
  return Response.json({ error: 'not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY / APP_PASSCODE)' })
}

export async function GET(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  // Master first (role desc: 'Master' > 'Child'), then by creation.
  const res = await supaFetch(TABLE, '?select=*&order=role.desc,created_at.asc', { method: 'GET' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ accounts: await res.json(), source: 'manual' })
}

export async function POST(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const body = pick((await req.json()) as Record<string, unknown>, FIELDS, NUMERIC)
  const res = await supaFetch(TABLE, '', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) }, url, key)
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  return Response.json({ account: ((await res.json()) as unknown[])[0] })
}

export async function PATCH(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json()) as Record<string, unknown>
  const id = String(raw.id ?? '')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const body = pick(raw, FIELDS, NUMERIC)
  const res = await supaFetch(TABLE, `?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) }, url, key)
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  return Response.json({ account: ((await res.json()) as unknown[])[0] })
}

export async function DELETE(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const res = await supaFetch(TABLE, `?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ ok: true })
}
