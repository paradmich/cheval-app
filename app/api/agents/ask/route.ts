import Anthropic from '@anthropic-ai/sdk'
import { readAgentState } from '../../../lib/agentStore'
import { passOk } from '../../../lib/supabaseRest'

/**
 * Ask an agent a question. Reads the agent's latest stored finding and has
 * Claude answer as that desk, grounded in its finding + general market
 * knowledge. Passcode-gated (x-cheval-pass). Uses Anthropic only — works even
 * when the Apify feeds are paused.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const PERSONA: Record<string, string> = {
  'cio-brief': 'the Chief Investment Officer',
  'fx-research': 'the FX research desk',
  'crypto-research': 'the crypto research desk',
  'stock-research': 'the equity research desk',
  'trump-monitor': 'the policy & Truth Social monitor',
}

export async function GET() {
  return Response.json({ ok: true })
}

export async function POST(req: Request) {
  const pass = process.env.APP_PASSCODE
  if (!pass) return Response.json({ error: 'not configured' }, { status: 200 })
  if (!passOk(req, pass)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI not configured' }, { status: 200 })

  const { agentId, question } = (await req.json()) as { agentId?: string; question?: string }
  if (!agentId || !question?.trim()) return Response.json({ error: 'agentId and question required' }, { status: 400 })

  const token = process.env.APIFY_TOKEN ?? ''
  const state = await readAgentState(token)
  const agent = state.agents[agentId]
  if (!agent) return Response.json({ error: 'unknown agent' }, { status: 404 })

  const persona = PERSONA[agentId] ?? agent.name
  const context = [
    `Latest finding (${new Date(agent.lastRunISO).toISOString()}): ${agent.headline}. ${agent.finding}`,
    agent.detail ? `Detail: ${agent.detail}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new Anthropic()
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 700,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system:
        `You are ${persona} for a private wealth office (Cheval Holdings). Answer the user's ` +
        `question concisely and specifically, grounded in your latest finding below plus your ` +
        `general market knowledge. 2-4 sentences, institutional tone, no preamble. This is ` +
        `research only — never instruct to place a trade or move funds.\n\n${context}`,
      messages: [{ role: 'user', content: question.trim() }],
    })
    const text = res.content.find((b) => b.type === 'text')
    return Response.json({ answer: text && text.type === 'text' ? text.text : 'No answer.' })
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 120) }, { status: 200 })
  }
}
