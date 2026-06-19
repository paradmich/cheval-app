import Anthropic from '@anthropic-ai/sdk'
import { supaEnv, passOk, supaFetch, pick } from '../../lib/supabaseRest'

/**
 * Acquisition deal pipeline CRUD + AI fit-scoring. Each deal carries an
 * asset_class ('real_estate' | 'business'); on create (and on demand) Claude
 * scores its fit (0-100) against the matching buy box and writes a short
 * summary. Service-role + RLS-locked; passcode-gated.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FIELDS = [
  'asset_class',
  'name',
  'location',
  'asking_price',
  'headline_metric',
  'status',
  'source_url',
  'notes',
] as const
const NUMERIC = new Set(['asking_price'])

const notConfigured = () =>
  Response.json({ error: 'Acquisitions not configured (Supabase / passcode)' }, { status: 200 })

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

const SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fitScore: { type: 'integer', description: '0-100 fit vs the buy box' },
    fitSummary: { type: 'string', description: '2-3 sentences: what matches, what misses, the verdict' },
  },
  required: ['fitScore', 'fitSummary'],
} as const

async function getBuybox(asset_class: string, url: string, key: string): Promise<unknown> {
  const res = await supaFetch(
    'cheval_buybox',
    `?asset_class=eq.${asset_class}&select=criteria`,
    { method: 'GET' },
    url,
    key,
  )
  if (!res.ok) return null
  const rows = (await res.json()) as { criteria?: unknown }[]
  return rows[0]?.criteria ?? null
}

/** Score a deal against its buy box and persist fit_score/fit_summary. */
async function scoreAndUpdate(deal: Deal, url: string, key: string): Promise<Deal> {
  if (!process.env.ANTHROPIC_API_KEY) return deal
  const criteria = await getBuybox(deal.asset_class, url, key)
  if (!criteria || (typeof criteria === 'object' && Object.keys(criteria).length === 0)) return deal

  try {
    const client = new Anthropic()
    const dealInfo = {
      assetClass: deal.asset_class,
      name: deal.name,
      location: deal.location,
      askingPrice: deal.asking_price,
      headlineMetric: deal.headline_metric,
      details: deal.details ?? {},
      notes: deal.notes,
    }
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCORE_SCHEMA } },
      system:
        'You are an acquisitions analyst for a private investment office. Given a BUY BOX ' +
        '(the acquisition criteria) and a candidate DEAL, score how well the deal fits the buy ' +
        'box from 0 (no fit) to 100 (perfect fit). Weigh the hard criteria (price range, ' +
        'returns/cap rate or EBITDA multiple, size, market/industry, strategy) most heavily. ' +
        'Be honest and specific about what matches and what misses. Research only; never ' +
        'instruct to transact.',
      messages: [
        {
          role: 'user',
          content: `BUY BOX (JSON):\n${JSON.stringify(criteria, null, 2)}\n\nDEAL (JSON):\n${JSON.stringify(dealInfo, null, 2)}`,
        },
      ],
    })
    const text = res.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return deal
    const j = JSON.parse(text.text) as { fitScore: number; fitSummary: string }
    const fit_score = Math.max(0, Math.min(100, Math.round(j.fitScore)))
    const upd = await supaFetch(
      'cheval_deals',
      `?id=eq.${encodeURIComponent(deal.id)}`,
      {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ fit_score, fit_summary: j.fitSummary }),
      },
      url,
      key,
    )
    if (upd.ok) {
      const rows = (await upd.json()) as Deal[]
      return rows[0] ?? { ...deal, fit_score, fit_summary: j.fitSummary }
    }
    return { ...deal, fit_score, fit_summary: j.fitSummary }
  } catch {
    return deal
  }
}

export async function GET(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const res = await supaFetch('cheval_deals', '?select=*&order=created_at.desc', { method: 'GET' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ deals: await res.json() })
}

export async function POST(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json()) as Record<string, unknown>

  // Re-score an existing deal.
  if (raw.action === 'rescore' && raw.id) {
    const get = await supaFetch('cheval_deals', `?id=eq.${encodeURIComponent(String(raw.id))}&select=*`, { method: 'GET' }, url, key)
    const rows = (await get.json()) as Deal[]
    if (!rows[0]) return Response.json({ error: 'not found' }, { status: 404 })
    const scored = await scoreAndUpdate(rows[0], url, key)
    return Response.json({ deal: scored })
  }

  // Create.
  const body = pick(raw, FIELDS, NUMERIC)
  if (!body.asset_class) body.asset_class = 'real_estate'
  if (raw.details && typeof raw.details === 'object') body.details = raw.details
  const res = await supaFetch('cheval_deals', '', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) }, url, key)
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  const rows = (await res.json()) as Deal[]
  const scored = rows[0] ? await scoreAndUpdate(rows[0], url, key) : null
  return Response.json({ deal: scored ?? rows[0] })
}

export async function PATCH(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json()) as Record<string, unknown>
  const id = String(raw.id ?? '')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const body = pick(raw, FIELDS, NUMERIC)
  if (raw.details && typeof raw.details === 'object') body.details = raw.details
  const res = await supaFetch(
    'cheval_deals',
    `?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) },
    url,
    key,
  )
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
  const rows = (await res.json()) as Deal[]
  return Response.json({ deal: rows[0] })
}

export async function DELETE(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const res = await supaFetch('cheval_deals', `?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ ok: true })
}
