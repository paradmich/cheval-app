import { passOk } from '../../lib/supabaseRest'

/**
 * Perplexity Sonar research proxy — cited, web-grounded financial answers.
 * `mode: 'sec'` switches Sonar into SEC-filings/finance search mode (real-time
 * stock data + filings). Passcode-gated (x-cheval-pass). Graceful when the key
 * is absent (returns needsKey) — independent of Apify.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface SonarResp {
  choices?: { message?: { content?: string } }[]
  citations?: string[]
  search_results?: { title?: string; url?: string }[]
}

export async function GET() {
  return Response.json({ configured: !!process.env.PERPLEXITY_API_KEY })
}

export async function POST(req: Request) {
  const pass = process.env.APP_PASSCODE
  if (!pass) return Response.json({ error: 'not configured' }, { status: 200 })
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.PERPLEXITY_API_KEY
  if (!key) return Response.json({ needsKey: true }, { status: 200 })

  const { question, mode } = (await req.json()) as { question?: string; mode?: string }
  if (!question?.trim()) return Response.json({ error: 'question required' }, { status: 400 })

  const body: Record<string, unknown> = {
    model: 'sonar',
    messages: [
      {
        role: 'system',
        content:
          'You are a financial research analyst for a private wealth office (Cheval Holdings). ' +
          'Answer concisely and specifically with up-to-date, sourced information that matters to ' +
          'an investor — prices, catalysts, filings, risks. Ground every claim in current data. ' +
          'This is research only; never instruct to place a trade.',
      },
      { role: 'user', content: question.trim() },
    ],
  }
  if (mode === 'sec') body.search_mode = 'sec'

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return Response.json({ error: `Perplexity ${res.status}: ${(await res.text()).slice(0, 160)}` }, { status: 200 })
    const d = (await res.json()) as SonarResp
    const answer = d.choices?.[0]?.message?.content ?? ''
    const sr = Array.isArray(d.search_results)
      ? d.search_results.filter((s) => s.url).map((s) => ({ title: s.title || s.url!, url: s.url! }))
      : []
    const cites = Array.isArray(d.citations)
      ? d.citations.map((u, i) => ({ title: sr[i]?.title || u, url: u }))
      : []
    return Response.json({ answer, sources: sr.length ? sr : cites })
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 120) }, { status: 200 })
  }
}
