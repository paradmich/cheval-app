'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BODY, NAVSCRIPT } from './mockup'
import FxResearch from './components/FxResearch'
import CryptoResearch from './components/CryptoResearch'
import StockResearch from './components/StockResearch'
import LiveAgents from './components/LiveAgents'
import SbaLoans from './components/SbaLoans'

/**
 * Renders the Cheval Holdings mockup. The static markup is injected once via
 * dangerouslySetInnerHTML and the original nav-switching script runs after
 * mount. Real sections replace the static markup incrementally.
 *
 * Each live section (FX, Crypto, …) is mounted into its empty mockup section
 * with its OWN isolated React root via createRoot — not a portal. Portaling
 * into a node inside a dangerouslySetInnerHTML subtree is unstable (React
 * treats that DOM as opaque and keeps resetting it, which strands the portal
 * and loops). A separate root owns a node the outer React never reconciles.
 */
/**
 * Live React sections mounted into the mockup. Most replace an emptied section
 * (append); `prepend` mounts above existing mockup content (used for the AI
 * Agents view, which keeps its static catalogue below the live panel).
 */
const LIVE_SECTIONS: { id: string; node: ReactNode; prepend?: boolean }[] = [
  { id: 'fxresearch', node: <FxResearch /> },
  { id: 'cryptoresearch', node: <CryptoResearch /> },
  { id: 'stockresearch', node: <StockResearch /> },
  { id: 'agents', node: <LiveAgents />, prepend: true },
  { id: 'financing', node: <SbaLoans />, prepend: true },
]

export default function Page() {
  const hostRef = useRef<HTMLDivElement>(null)
  const navInit = useRef(false)

  useEffect(() => {
    if (!navInit.current) {
      navInit.current = true
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        new Function(NAVSCRIPT)()
      } catch (e) {
        console.error('nav init failed', e)
      }
    }

    const mounted: { root: Root; mount: HTMLDivElement }[] = []
    for (const { id, node, prepend } of LIVE_SECTIONS) {
      const section = hostRef.current?.querySelector<HTMLElement>(`#${id}`)
      if (!section) continue
      const mount = document.createElement('div')
      if (prepend && section.firstChild) section.insertBefore(mount, section.firstChild)
      else section.appendChild(mount)
      const root = createRoot(mount)
      root.render(node)
      mounted.push({ root, mount })
    }

    return () => {
      for (const { root, mount } of mounted) {
        root.unmount()
        mount.remove()
      }
    }
  }, [])

  return <div ref={hostRef} dangerouslySetInnerHTML={{ __html: BODY }} />
}
