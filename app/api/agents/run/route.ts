import { writeAgentRun, type AgentRun } from '../../../lib/agentStore'

/**
 * Autonomous agent runner. Triggered by Vercel Cron (see vercel.json) a few
 * times a day — and manually for testing. Currently runs the FX Research
 * Agent: it reuses the live /api/fx-research pipeline, derives a compact
 * status + finding, and persists it so the AI Agents dashboard reflects the
 * latest scheduled run.
 *
 * Auth: if CRON_SECRET is set, require it (Vercel Cron sends it as a Bearer
 * token automatically; manual callers pass ?key=). If unset, the endpoint is
 * open — set CRON_SECRET in Vercel env to lock it down.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  const key = new URL(req.url).searchParams.get('key')
  return key === secret
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const token = process.env.APIFY_TOKEN
  if (!token) {
    return Response.json({ ran: false, error: 'no APIFY_TOKEN' }, { status: 200 })
  }

  const origin = new URL(req.url).origin
  let run: AgentRun

  try {
    const res = await fetch(`${origin}/api/fx-research`, { cache: 'no-store' })
    const d = (await res.json()) as {
      live?: boolean
      commentary?: { title: string; body: string }[]
      stats?: { nextHighImpact?: { event: string; inDays: number } | null }
      watchlist?: { pair: string; signal: string }[]
    }
    const top = d.commentary?.[0]
    const next = d.stats?.nextHighImpact ?? null
    // Flag if a high-impact event lands today/tomorrow.
    const imminent = !!next && next.inDays <= 1
    const signals = (d.watchlist ?? [])
      .map((w) => `${w.pair} ${w.signal}`)
      .slice(0, 6)
      .join(' · ')

    run = {
      id: 'fx-research',
      name: 'FX Research Agent',
      status: !d.live ? 'Idle' : imminent ? 'Alert' : 'Active',
      lastRunISO: new Date().toISOString(),
      headline: top?.title ?? 'FX market scan complete',
      finding: top?.body ?? signals,
      detail: next ? `Next high-impact: ${next.event} (${next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : `in ${next.inDays}d`})` : signals,
    }
  } catch (e) {
    run = {
      id: 'fx-research',
      name: 'FX Research Agent',
      status: 'Idle',
      lastRunISO: new Date().toISOString(),
      headline: 'Run failed',
      finding: `Could not complete FX scan: ${String(e).slice(0, 80)}`,
      detail: null,
    }
  }

  const stored = await writeAgentRun(token, run)
  return Response.json({ ran: true, stored, run })
}
