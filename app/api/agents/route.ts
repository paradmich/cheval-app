import { readAgentState } from '../../lib/agentStore'

/**
 * Reads persisted autonomous-agent state for the AI Agents dashboard. Returns
 * the latest scheduled run per agent plus a short activity history.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const token = process.env.APIFY_TOKEN
  if (!token) return Response.json({ agents: [], history: [], configured: false })
  const state = await readAgentState(token)
  const order = ['cio-brief', 'fx-research', 'crypto-research', 'stock-research']
  const agents = Object.values(state.agents).sort(
    (a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99),
  )
  return Response.json({ configured: true, agents, history: state.history })
}
