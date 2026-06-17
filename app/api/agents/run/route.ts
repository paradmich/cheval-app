import { runAllAgents } from '../../../lib/agents'

/**
 * Autonomous agent runner. Triggered by Vercel Cron (see vercel.json) a few
 * times a day — and manually for testing. Runs every agent (FX, Crypto,
 * Equity), each reusing its live research pipeline, and persists status +
 * findings so the AI Agents dashboard reflects the latest scheduled run.
 *
 * Auth: if CRON_SECRET is set, require it (Vercel Cron sends it as a Bearer
 * token automatically; manual callers pass ?key=). If unset, the endpoint is
 * open.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  return new URL(req.url).searchParams.get('key') === secret
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const token = process.env.APIFY_TOKEN
  if (!token) return Response.json({ ran: false, error: 'no APIFY_TOKEN' })

  const origin = new URL(req.url).origin
  const runs = await runAllAgents(origin, token)
  return Response.json({ ran: true, count: runs.length, runs })
}
