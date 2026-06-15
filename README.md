# Cheval Holdings — Private Wealth OS

A private, AI-powered **family-office operating system** for Cheval Holdings — one consolidated place to monitor every account, holding, revenue line, fund, and governance function, on a **read-only / watch-only** security model (the app reads & reports; it never moves funds).

## Stack
- **Next.js (App Router) + React + TypeScript** — deploy on **Vercel**
- Current UI is the interactive mockup (`app/mockup.ts` markup + `app/globals.css`), injected client-side. Sections are being replaced with real React components + data over time.

## Live sections
- **FX Market Research** (`app/components/FxResearch.tsx` + `app/api/fx-research/route.ts`) — the first real agent. Live G10 spot rates, 1D/1W moves, and a DXY proxy come from the free, no-key ECB reference feed ([Frankfurter](https://frankfurter.dev)); central-bank policy, the economic calendar, and 10Y/VIX are an agent-maintained snapshot in `app/lib/fxData.ts`. Claude (`claude-opus-4-8`) turns the combined picture into market commentary + a per-pair signal via `/api/fx-research`, cached 15 min. Without `ANTHROPIC_API_KEY` the live rates still load and signals fall back to a rule-based read. The component mounts into the empty `#fxresearch` section with its own React root (see `app/page.tsx`).
- Set `ANTHROPIC_API_KEY` (see `.env.example`) locally and in the Vercel project to enable AI-generated commentary.

## Develop
```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy (Vercel)
Import this repo in Vercel — the framework auto-detects as **Next.js**. No env vars required for the mockup. Real data (Supabase, brokerage/crypto read-only feeds) gets added incrementally.

## Sections
Overview (Dashboard · AI Agents · Investment Thesis) · Accounts (Intermediate-Term Trading · Gallop Alpha Book · Schwab · Crypto · Cash & Savings · Financing & Leverage) · Markets (FX/Stock/Crypto Research) · Holdings (Real Estate · Private Investments) · Fund Management (Capital Raising · Investor Directory · Investor Relations) · Governance (Advisory Boards) · Revenue (AI Licensing · Affiliates · Products) · Vault & Admin (Documents & Reports · Security & Access).

---
🤖 Scaffolded with [Claude Code](https://claude.com/claude-code)
