import { supaEnv, passOk, supaFetch, pick } from '../../lib/supabaseRest'

/**
 * Retirement account tracker CRUD — backed by `cheval_retirement` in the My
 * Supernova Supabase project via the service role (RLS-locked, server-only).
 * Passcode-gated (x-cheval-pass).
 */
export const dynamic = 'force-dynamic'

const FIELDS = [
  'account_type',
  'provider',
  'owner',
  'balance',
  'contributions_ytd',
  'annual_limit',
  'employer_match',
  'allocation',
  'vested_pct',
  'as_of_date',
  'notes',
] as const
const NUMERIC = new Set(['balance', 'contributions_ytd', 'annual_limit', 'vested_pct'])

const notConfigured = () =>
  Response.json({ error: 'Retirement tracker not configured (Supabase / passcode)' }, { status: 200 })

export async function GET(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const res = await supaFetch('cheval_retirement', '?select=*&order=created_at.desc', { method: 'GET' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ accounts: await res.json() })
}

export async function POST(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const body = pick((await req.json()) as Record<string, unknown>, FIELDS, NUMERIC)
  const res = await supaFetch('cheval_retirement', '', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) }, url, key)
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  const rows = (await res.json()) as unknown[]
  return Response.json({ account: rows[0] })
}

export async function PATCH(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json()) as Record<string, unknown>
  const id = String(raw.id ?? '')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const body = pick(raw, FIELDS, NUMERIC)
  const res = await supaFetch(`cheval_retirement`, `?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) }, url, key)
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  const rows = (await res.json()) as unknown[]
  return Response.json({ account: rows[0] })
}

export async function DELETE(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const res = await supaFetch('cheval_retirement', `?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ ok: true })
}
