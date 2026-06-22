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

/** Upsert one agent's run into the stored state (keeps last 12 history items). */
export async function writeAgentRun(run: AgentRun): Promise<boolean> {
  const { url, key } = supaEnv()
  if (!url || !key) return false
  const prev = await readAgentState()
  const next: AgentState = {
    agents: { ...prev.agents, [run.id]: run },
    history: [{ id: run.id, at: run.lastRunISO, headline: run.headline }, ...prev.history].slice(0, 12),
  }
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
