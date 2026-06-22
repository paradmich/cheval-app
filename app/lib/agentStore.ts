import { supaEnv, supaFetch } from './supabaseRest'

/**
 * Persistence for autonomous agent state — backed by Supabase (table
 * `cheval_agent_state`, one JSON row keyed 'state'). Previously this used an
 * Apify key-value store, but that tied the whole agent layer to Apify usage:
 * when the Apify monthly limit was hit, even reading agent findings failed.
 * Supabase keeps the dashboard + Ask working independent of the Apify feeds.
 */

const STATE_KEY = 'state'

export interface AgentRun {
  id: string
  name: string
  status: 'Active' | 'Alert' | 'Idle'
  lastRunISO: string
  headline: string
  finding: string
  detail?: string | null
  /** A clickable source for the finding (Trump post, news article, etc.). */
  sourceUrl?: string | null
  sourceLabel?: string | null
}

export interface AgentState {
  agents: Record<string, AgentRun>
  history: { id: string; at: string; headline: string }[]
}

const EMPTY: AgentState = { agents: {}, history: [] }

export async function readAgentState(): Promise<AgentState> {
  const { url, key } = supaEnv()
  if (!url || !key) return EMPTY
  try {
    const res = await supaFetch('cheval_agent_state', `?key=eq.${STATE_KEY}&select=value`, { method: 'GET' }, url, key)
    if (!res.ok) return EMPTY
    const rows = (await res.json()) as { value?: Partial<AgentState> }[]
    const v = rows[0]?.value
    return { agents: v?.agents ?? {}, history: v?.history ?? [] }
  } catch {
    return EMPTY
  }
}

/**
 * Persist a batch of agent runs in ONE upsert. Always write all runs from a
 * cycle together — never call this concurrently for the same row, or parallel
 * upserts to the single 'state' key clobber each other.
 */
export async function writeAgentRuns(runs: AgentRun[]): Promise<boolean> {
  const { url, key } = supaEnv()
  if (!url || !key || runs.length === 0) return false
  const prev = await readAgentState()
  const agents = { ...prev.agents }
  let history = prev.history
  for (const run of runs) {
    agents[run.id] = run
    history = [{ id: run.id, at: run.lastRunISO, headline: run.headline }, ...history]
  }
  const next: AgentState = { agents, history: history.slice(0, 12) }
  try {
    const res = await supaFetch(
      'cheval_agent_state',
      '?on_conflict=key',
      {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: STATE_KEY, value: next, updated_at: new Date().toISOString() }),
      },
      url,
      key,
    )
    return res.ok
  } catch {
    return false
  }
}

/** Convenience for a single run. */
export function writeAgentRun(run: AgentRun): Promise<boolean> {
  return writeAgentRuns([run])
}
