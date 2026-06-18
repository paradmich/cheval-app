import Anthropic from '@anthropic-ai/sdk'
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

const CIO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string', description: 'The single dominant cross-asset theme, ≤7 words' },
    brief: { type: 'string', description: '2–3 sentences tying the desks together' },
    watch: { type: 'string', description: 'One line: the key thing to watch next' },
  },
  required: ['headline', 'brief', 'watch'],
} as const

/**
 * Cross-Asset CIO Brief: a synthesis agent. Reads the desk agents' findings and
 * writes one unified read that ties FX, Crypto, and Equity together. Leads the
 * daily email and the AI Agents dashboard.
 */
async function runCioBrief(desks: AgentRun[], now: string): Promise<AgentRun> {
  const anyAlert = desks.some((r) => r.status === 'Alert')
  const base: AgentRun = {
    id: 'cio-brief',
    name: 'CIO · Cross-Asset Brief',
    lastRunISO: now,
    status: anyAlert ? 'Alert' : 'Active',
    headline: 'Cross-asset summary',
    finding: desks.map((r) => `${r.name.replace(/ (Research )?Agent/, '')}: ${r.headline}`).join(' · '),
    detail: null,
  }
  if (!process.env.ANTHROPIC_API_KEY) return base

  try {
    const client = new Anthropic()
    const input = desks.map((r) => ({
      desk: r.name,
      status: r.status,
      headline: r.headline,
      finding: r.finding,
      detail: r.detail,
    }))
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CIO_SCHEMA } },
      system:
        'You are the CIO of a private wealth office. You receive today\'s findings from the ' +
        'FX, Crypto, and Equity research desks. Write ONE cross-asset brief that ties them ' +
        'together: name the single dominant theme driving markets today, how the asset ' +
        'classes connect (e.g. a softer dollar lifting crypto and risk assets), and the key ' +
        'thing to watch next. Concise and institutional. Research only; never instruct to trade.',
      messages: [{ role: 'user', content: `Today's desk findings (JSON):\n${JSON.stringify(input, null, 2)}` }],
    })
    const text = res.content.find((b) => b.type === 'text')
    if (text && text.type === 'text') {
      const j = JSON.parse(text.text) as { headline: string; brief: string; watch: string }
      base.headline = j.headline || base.headline
      base.finding = j.brief || base.finding
      base.detail = j.watch || null
    }
  } catch {
    /* keep the rule-based base */
  }
  return base
}

/**
 * Run every desk agent (fresh) + the CIO synthesis, persist each, and return
 * the runs with the CIO brief first (leads the dashboard and the email).
 */
export async function runAllAgents(origin: string, token: string): Promise<AgentRun[]> {
  const now = new Date().toISOString()
  const desks = await Promise.all(
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
  await Promise.all(desks.map((r) => writeAgentRun(token, r)))
  const cio = await runCioBrief(desks, now)
  await writeAgentRun(token, cio)
  return [cio, ...desks]
}
