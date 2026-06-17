import { writeAgentRun, type AgentRun } from './agentStore'

/**
 * Shared autonomous-agent runner. Each agent reuses its live research endpoint,
 * maps the result to a compact status + finding, and persists it. Used by the
 * scheduled refresh (/api/agents/run, ~3×/day) and the daily email digest
 * (/api/agents/digest, 1×/day). Read-only/watch-only — research + report only.
 */

type Json = Record<string, unknown>
type Fields = Pick<AgentRun, 'status' | 'headline' | 'finding' | 'detail'>

interface AgentDef {
  id: string
  name: string
  endpoint: string
  map: (d: Json) => Fields
}

const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : [])
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function fxFields(d: Json): Fields {
  const top = arr(d.commentary)[0] ?? {}
  const stats = obj(d.stats)
  const next = stats.nextHighImpact ? obj(stats.nextHighImpact) : null
  const inDays = next ? num(next.inDays) : null
  const imminent = next != null && inDays != null && inDays <= 1
  return {
    status: !d.live ? 'Idle' : imminent ? 'Alert' : 'Active',
    headline: str(top.title) || 'FX market scan complete',
    finding: str(top.body),
    detail: next
      ? `Next high-impact: ${str(next.event)} (${inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays}d`})`
      : null,
  }
}

function cryptoFields(d: Json): Fields {
  const top = arr(d.commentary)[0] ?? {}
  const wl = arr(d.watchlist)
  const alert = wl.some((c) => {
    const c7 = num(c.change7d)
    return (c7 != null && c7 <= -10) || str(c.signal) === 'Take profit'
  })
  const reserves = d.reserves ? obj(d.reserves) : null
  const mover = obj(obj(d.stats).topMover)
  return {
    status: !d.cryptoLive ? 'Idle' : alert ? 'Alert' : 'Active',
    headline: str(top.title) || 'Crypto market scan complete',
    finding: str(top.body),
    detail: reserves?.stablecoinUsd
      ? `Stablecoin dry powder ${str(reserves.stablecoinUsd)}`
      : mover.symbol
        ? `Top mover ${str(mover.symbol)}`
        : null,
  }
}

function stockFields(d: Json): Fields {
  const top = arr(d.commentary)[0] ?? {}
  const wl = arr(d.watchlist)
  const alert = wl.some((s) => {
    const c1 = num(s.change1d)
    return c1 != null && c1 <= -5
  })
  const stats = obj(d.stats)
  const mover = obj(stats.topMover)
  const detail = [
    stats.advancing ? `Breadth ${str(stats.advancing)} advancing` : null,
    mover.symbol ? `top ${str(mover.symbol)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    status: !d.stockLive ? 'Idle' : alert ? 'Alert' : 'Active',
    headline: str(top.title) || 'Equity market scan complete',
    finding: str(top.body),
    detail: detail || null,
  }
}

const AGENTS: AgentDef[] = [
  { id: 'fx-research', name: 'FX Research Agent', endpoint: '/api/fx-research', map: fxFields },
  { id: 'crypto-research', name: 'Crypto Research Agent', endpoint: '/api/crypto-research', map: cryptoFields },
  { id: 'stock-research', name: 'Equity Research Agent', endpoint: '/api/stock-research', map: stockFields },
]

/** Run every agent (fresh), persist each, and return the runs. */
export async function runAllAgents(origin: string, token: string): Promise<AgentRun[]> {
  const now = new Date().toISOString()
  const runs = await Promise.all(
    AGENTS.map(async (a): Promise<AgentRun> => {
      try {
        const res = await fetch(`${origin}${a.endpoint}`, { cache: 'no-store' })
        const d = (await res.json()) as Json
        return { id: a.id, name: a.name, lastRunISO: now, ...a.map(d) }
      } catch (e) {
        return {
          id: a.id,
          name: a.name,
          lastRunISO: now,
          status: 'Idle',
          headline: 'Run failed',
          finding: `Could not complete scan: ${String(e).slice(0, 80)}`,
          detail: null,
        }
      }
    }),
  )
  await Promise.all(runs.map((r) => writeAgentRun(token, r)))
  return runs
}
