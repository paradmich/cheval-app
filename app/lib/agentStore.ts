/**
 * Tiny persistence layer for autonomous agent state, backed by an Apify
 * key-value store (reuses APIFY_TOKEN — no separate database needed).
 *
 * Scheduled agent runs (via /api/agents/run, triggered by Vercel Cron) write
 * their latest state here; the AI Agents dashboard (/api/agents) reads it. This
 * is what makes an agent "active" rather than only on-demand: it runs on a
 * schedule and its findings persist between page views.
 */

const STORE_NAME = 'cheval-agent-state'
const STATE_KEY = 'state'

export interface AgentRun {
  id: string
  name: string
  status: 'Active' | 'Alert' | 'Idle'
  lastRunISO: string
  headline: string
  finding: string
  detail?: string | null
}

export interface AgentState {
  agents: Record<string, AgentRun>
  history: { id: string; at: string; headline: string }[]
}

const EMPTY: AgentState = { agents: {}, history: [] }

let cachedStoreId: string | null = null

/** Resolve (get-or-create) the named KV store id for the given token. */
async function storeId(token: string): Promise<string | null> {
  if (cachedStoreId) return cachedStoreId
  try {
    const res = await fetch(
      `https://api.apify.com/v2/key-value-stores?name=${STORE_NAME}&token=${token}`,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { id?: string } }
    cachedStoreId = json.data?.id ?? null
    return cachedStoreId
  } catch {
    return null
  }
}

export async function readAgentState(token: string): Promise<AgentState> {
  const id = await storeId(token)
  if (!id) return EMPTY
  try {
    const res = await fetch(
      `https://api.apify.com/v2/key-value-stores/${id}/records/${STATE_KEY}?token=${token}`,
    )
    if (res.status === 404) return EMPTY
    if (!res.ok) return EMPTY
    const json = (await res.json()) as Partial<AgentState>
    return { agents: json.agents ?? {}, history: json.history ?? [] }
  } catch {
    return EMPTY
  }
}

/** Upsert one agent's run into the stored state (keeps last 12 history items). */
export async function writeAgentRun(token: string, run: AgentRun): Promise<boolean> {
  const id = await storeId(token)
  if (!id) return false
  const prev = await readAgentState(token)
  const next: AgentState = {
    agents: { ...prev.agents, [run.id]: run },
    history: [{ id: run.id, at: run.lastRunISO, headline: run.headline }, ...prev.history].slice(0, 12),
  }
  try {
    const res = await fetch(
      `https://api.apify.com/v2/key-value-stores/${id}/records/${STATE_KEY}?token=${token}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      },
    )
    return res.ok
  } catch {
    return false
  }
}
