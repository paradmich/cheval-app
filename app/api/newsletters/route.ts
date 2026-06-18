import Anthropic from '@anthropic-ai/sdk'
import { passOk, supaEnv, supaFetch } from '../../lib/supabaseRest'

/**
 * Investor newsletters — table `cheval_newsletters`. Passcode-gated.
 *   GET                      → list (drafts + sent archive)
 *   POST { action:'draft' }  → Claude drafts {subject, body} from market context (not saved)
 *   POST { action:'save' }   → insert/update a draft (by id)
 *   POST { action:'send' }   → send the newsletter to all investors via Resend, mark sent
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TABLE = 'cheval_newsletters'

function notConfigured() {
  return Response.json({ error: 'not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY / APP_PASSCODE)' })
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string', description: 'Email subject line' },
    body: { type: 'string', description: 'Plain-text body with paragraphs separated by blank lines' },
  },
  required: ['subject', 'body'],
} as const

async function aiDraft(origin: string, topic: string): Promise<{ subject: string; body: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  // Market context = today's cross-asset agent findings.
  let context = ''
  try {
    const res = await fetch(`${origin}/api/agents`, { cache: 'no-store' })
    const d = (await res.json()) as { agents?: { name: string; headline: string; finding: string }[] }
    context = (d.agents ?? [])
      .map((a) => `${a.name}: ${a.headline}. ${a.finding}`)
      .join('\n')
  } catch {
    /* draft without context */
  }
  const client = new Anthropic()
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    system:
      'You draft investor (LP) update emails for Cheval Holdings, a private family office. ' +
      'Write a concise, measured, professional LP update. Structure: (1) a brief market ' +
      'environment paragraph grounded in the provided cross-asset context, (2) a portfolio / ' +
      'positioning note — keep it general and use clearly-marked placeholders like ' +
      '“[insert fund performance]” or “[distribution detail]” where Cheval-specific numbers ' +
      'are needed, (3) a short outlook, (4) a sign-off from the Cheval Holdings team. Plain ' +
      'text, paragraphs separated by blank lines. No hype; never give investment advice.',
    messages: [
      {
        role: 'user',
        content: `Topic/angle: ${topic || 'periodic LP update'}\n\nToday's cross-asset market context:\n${context || '(none available)'}`,
      },
    ],
  })
  const text = res.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') return null
  try {
    return JSON.parse(text.text) as { subject: string; body: string }
  } catch {
    return null
  }
}

function brandedHtml(subject: string, body: string): string {
  const paras = body
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 12px;font:400 14px/1.65 Georgia,serif;color:#2c2922;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:24px;">
    <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fffdf8;border-radius:14px;border:1px solid #e7e3da;">
      <tr><td style="padding:26px 30px 10px;">
        <div style="font:600 12px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#b08a3e;">♞ Cheval Holdings</div>
        <div style="font:600 22px/1.25 Georgia,serif;color:#1d1b16;margin:8px 0 2px;">${subject}</div>
        <div style="font:400 12px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#9a9488;">Investor Update</div>
      </td></tr>
      <tr><td style="padding:10px 30px 26px;">${paras}
        <div style="font:400 11px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#b3afa6;margin-top:18px;border-top:1px solid #eceae4;padding-top:12px;">
          Cheval Holdings · private investor communication. Not an offer to sell or a solicitation of any investment.
        </div>
      </td></tr>
    </table>
  </body></html>`
}

export async function GET(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const res = await supaFetch(TABLE, '?select=*&order=created_at.desc', { method: 'GET' }, url, key)
  if (!res.ok) return Response.json({ error: `db ${res.status}` }, { status: 502 })
  return Response.json({ newsletters: await res.json() })
}

export async function POST(req: Request) {
  const { url, key, pass } = supaEnv()
  if (!url || !key || !pass) return notConfigured()
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const raw = (await req.json()) as Record<string, unknown>
  const action = String(raw.action ?? '')
  const origin = new URL(req.url).origin

  if (action === 'draft') {
    const draft = await aiDraft(origin, String(raw.topic ?? ''))
    if (!draft) return Response.json({ error: 'draft unavailable (set ANTHROPIC_API_KEY)' }, { status: 200 })
    return Response.json(draft)
  }

  if (action === 'save') {
    const row = { subject: String(raw.subject ?? ''), body: String(raw.body ?? ''), status: 'draft' as const }
    const id = raw.id ? String(raw.id) : ''
    const res = id
      ? await supaFetch(TABLE, `?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }, url, key)
      : await supaFetch(TABLE, '', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }, url, key)
    if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
    return Response.json({ newsletter: ((await res.json()) as unknown[])[0] })
  }

  if (action === 'send') {
    const subject = String(raw.subject ?? '')
    const body = String(raw.body ?? '')
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.AGENT_DIGEST_FROM
    if (!subject || !body) return Response.json({ error: 'subject and body required' }, { status: 400 })
    if (!apiKey || !from) return Response.json({ error: 'Resend not configured' }, { status: 200 })

    // Recipients = investors with an email.
    const invRes = await supaFetch('cheval_investors', '?select=email&email=not.is.null', { method: 'GET' }, url, key)
    const investors = invRes.ok ? ((await invRes.json()) as { email: string }[]) : []
    const emails = [...new Set(investors.map((i) => (i.email || '').trim()).filter(Boolean))]
    if (emails.length === 0) return Response.json({ error: 'no investor emails to send to' }, { status: 200 })

    const html = brandedHtml(subject, body)
    const batch = emails.slice(0, 100).map((to) => ({ from, to: [to], subject, html }))
    const sendRes = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (!sendRes.ok) return Response.json({ error: (await sendRes.text()).slice(0, 200) }, { status: 502 })

    // Archive: upsert as sent.
    const row = { subject, body, status: 'sent', sent_at: new Date().toISOString(), recipients: emails.length }
    const id = raw.id ? String(raw.id) : ''
    if (id) await supaFetch(TABLE, `?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(row) }, url, key)
    else await supaFetch(TABLE, '', { method: 'POST', body: JSON.stringify(row) }, url, key)

    return Response.json({ sent: true, recipients: emails.length })
  }

  return Response.json({ error: 'unknown action' }, { status: 400 })
}
