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
  return Response.json({
    configured: true,
    agents: Object.values(state.agents),
    history: state.history,
  })
}
