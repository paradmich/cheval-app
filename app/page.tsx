'use client'

import { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BODY, NAVSCRIPT } from './mockup'
import FxResearch from './components/FxResearch'

/**
 * Renders the Cheval Holdings mockup. The static markup is injected once via
 * dangerouslySetInnerHTML and the original nav-switching script runs after
 * mount. Real sections replace the static markup incrementally.
 *
 * The FX Market Research view is a live React component (Frankfurter rates +
 * Claude commentary). It is mounted into the empty #fxresearch section with its
 * OWN isolated React root via createRoot — not a portal. Portaling into a node
 * inside a dangerouslySetInnerHTML subtree is unstable (React treats that DOM
 * as opaque and keeps resetting it, which strands the portal and loops). A
 * separate root owns a node the outer React never reconciles, so it's stable.
 */
export default function Page() {
  const hostRef = useRef<HTMLDivElement>(null)
  const navInit = useRef(false)

  useEffect(() => {
    const section = hostRef.current?.querySelector<HTMLElement>('#fxresearch')

    if (!navInit.current) {
      navInit.current = true
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        new Function(NAVSCRIPT)()
      } catch (e) {
        console.error('nav init failed', e)
      }
    }

    let root: Root | undefined
    let mount: HTMLDivElement | undefined
    if (section) {
      mount = document.createElement('div')
      section.appendChild(mount)
      root = createRoot(mount)
      root.render(<FxResearch />)
    }

    return () => {
      root?.unmount()
      mount?.remove()
    }
  }, [])

  return <div ref={hostRef} dangerouslySetInnerHTML={{ __html: BODY }} />
}
