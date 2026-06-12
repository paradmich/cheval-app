'use client'

import { useEffect, useRef } from 'react'
import { BODY, NAVSCRIPT } from './mockup'

/**
 * Renders the Cheval Holdings mockup. The markup is injected and the original
 * nav-switching script runs after mount. Replace sections with real React
 * components + data (Supabase, read-only integrations) incrementally.
 */
export default function Page() {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(NAVSCRIPT)()
    } catch (e) {
      console.error('nav init failed', e)
    }
  }, [])
  return <div dangerouslySetInnerHTML={{ __html: BODY }} />
}
