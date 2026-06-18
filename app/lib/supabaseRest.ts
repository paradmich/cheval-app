/**
 * Minimal PostgREST helpers shared by the Supabase-backed routes (SBA loans,
 * investors, newsletters). Uses the service role server-side; the tables are
 * RLS-locked so the public key can't reach them. Every route gates on
 * APP_PASSCODE (x-cheval-pass header).
 */

export function supaEnv() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY,
    pass: process.env.APP_PASSCODE,
  }
}

export function passOk(req: Request, pass: string | undefined): boolean {
  if (!pass) return false
  return req.headers.get('x-cheval-pass') === pass
}

export async function supaFetch(
  table: string,
  qs: string,
  init: RequestInit,
  url: string,
  key: string,
): Promise<Response> {
  return fetch(`${url}/rest/v1/${table}${qs}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

/** Keep only known fields; coerce numerics; blank strings → null. */
export function pick(
  input: Record<string, unknown>,
  fields: readonly string[],
  numeric: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (!(f in input)) continue
    let v = input[f]
    if (v === '' || v === undefined) v = null
    if (v !== null && numeric.has(f)) {
      const n = Number(v)
      v = Number.isFinite(n) ? n : null
    }
    out[f] = v
  }
  return out
}
