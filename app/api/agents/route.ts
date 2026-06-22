import { readAgentState } from '../../lib/agentStore'

/**
 * Reads persisted autonomous-agent state for the AI Agents dashboard. Returns
 * the latest scheduled run per agent plus a short activity history.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const state = await readAgentState()
  const order = [
    'cio-brief', 'macro-policy', 'trump-monitor',
    'fx-research', 'crypto-research', 'stock-research',
    'capital-raising', 'compliance',
  ]
  const agents = Object.values(state.agents).sort(
    (a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99),
  )
  return Response.json({ configured: true, agents, history: state.history })
}
