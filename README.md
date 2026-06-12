# Cheval Holdings — Private Wealth OS

A private, AI-powered **family-office operating system** for Cheval Holdings — one consolidated place to monitor every account, holding, revenue line, fund, and governance function, on a **read-only / watch-only** security model (the app reads & reports; it never moves funds).

## Stack
- **Next.js (App Router) + React + TypeScript** — deploy on **Vercel**
- Current UI is the interactive mockup (`app/mockup.ts` markup + `app/globals.css`), injected client-side. Sections are being replaced with real React components + data over time.

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
