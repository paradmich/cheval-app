import { supaEnv, passOk, supaFetch } from '../../lib/supabaseRest'

/**
 * Buy box (acquisition criteria) — two records, keyed by asset_class
 * ('real_estate' | 'business'), each holding a freeform `criteria` JSON the UI
 * defines. Service-role + RLS-locked; passcode-gated like the other private
 * routes. Deals are scored against these by /api/deals.
 */
export const dynamic = 'force-dynamic'

const notConfigured = () =>
  Response.json({ error: 'Acquisitions not configured (Supabase / passcode)' }, { status: 200 })

export async function GET(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const res = await supaFetch('cheval_buybox', '?select=*', { method: 'GET' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ buyboxes: await res.json() })
}

export async function POST(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json()) as { asset_class?: string; criteria?: unknown }
  const asset_class = raw.asset_class === 'business' ? 'business' : 'real_estate'
  const criteria = raw.criteria && typeof raw.criteria === 'object' ? raw.criteria : {}
  const body = { asset_class, criteria, updated_at: new Date().toISOString() }
  const res = await supaFetch(
    'cheval_buybox',
    '?on_conflict=asset_class',
    { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) },
    url,
    key,
  )
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  const rows = (await res.json()) as unknown[]
  return Response.json({ buybox: rows[0] })
}
