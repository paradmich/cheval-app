/**
 * SBA loan tracker CRUD — backed by the `sba_loans` table in the My Supernova
 * Supabase project, accessed via the service role (server-side only) over
 * PostgREST. The table has RLS with no anon policies, so it is unreachable with
 * the public key; only this route (with the secret service key) can touch it.
 *
 * Every method is gated by APP_PASSCODE (sent as `x-cheval-pass`) so the loan
 * data isn't readable/writable from the public app URL without the passcode.
 */
export const dynamic = 'force-dynamic'

const FIELDS = [
  'borrower',
  'lender',
  'program',
  'original_amount',
  'current_balance',
  'interest_rate',
  'rate_type',
  'term_months',
  'monthly_payment',
  'origination_date',
  'maturity_date',
  'next_payment_date',
  'status',
  'use_of_proceeds',
  'notes',
] as const

const NUMERIC = new Set([
  'original_amount',
  'current_balance',
  'interest_rate',
  'monthly_payment',
  'term_months',
])

function env() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY,
    pass: process.env.APP_PASSCODE,
  }
}

function authorized(req: Request, pass: string | undefined): boolean {
  if (!pass) return false // passcode must be configured
  return req.headers.get('x-cheval-pass') === pass
}

/** Keep only known fields; coerce numbers; turn blank strings into null. */
function sanitize(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of FIELDS) {
    if (!(f in input)) continue
    let v = input[f]
    if (v === '' || v === undefined) v = null
    if (v !== null && NUMERIC.has(f)) {
      const n = Number(v)
      v = Number.isFinite(n) ? n : null
    }
    out[f] = v
  }
  return out
}

async function sb(path: string, init: RequestInit, url: string, key: string) {
  return fetch(`${url}/rest/v1/sba_loans${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function notConfigured() {
  return Response.json(
    { error: 'SBA tracker not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY / APP_PASSCODE)' },
    { status: 200 },
  )
}

export async function GET(req: Request) {
  const { url, key, pass } = env()
  if (!url || !key || !pass) return notConfigured()
  if (!authorized(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const res = await sb('?select=*&order=created_at.desc', { method: 'GET' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ loans: await res.json() })
}

export async function POST(req: Request) {
  const { url, key, pass } = env()
  if (!url || !key || !pass) return notConfigured()
  if (!authorized(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const body = sanitize((await req.json()) as Record<string, unknown>)
  const res = await sb('', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) }, url, key)
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  const rows = (await res.json()) as unknown[]
  return Response.json({ loan: rows[0] })
}

export async function PATCH(req: Request) {
  const { url, key, pass } = env()
  if (!url || !key || !pass) return notConfigured()
  if (!authorized(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json()) as Record<string, unknown>
  const id = String(raw.id ?? '')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const body = sanitize(raw)
  const res = await sb(`?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) }, url, key)
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  const rows = (await res.json()) as unknown[]
  return Response.json({ loan: rows[0] })
}

export async function DELETE(req: Request) {
  const { url, key, pass } = env()
  if (!url || !key || !pass) return notConfigured()
  if (!authorized(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const res = await sb(`?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ ok: true })
}
