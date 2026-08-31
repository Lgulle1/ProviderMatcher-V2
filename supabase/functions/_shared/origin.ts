/**
 * Server-side enforcement of an org's `allowed_domains`.
 *
 * The widget also checks this client-side (widget.js `checkDomain`), but that
 * runs *after* the response lands in the browser, so it hides the UI without
 * protecting the data. These helpers apply the same rule at the edge, before
 * anything is returned.
 *
 * Normalization is intentionally identical to `checkDomain` so a domain list
 * that works in the widget keeps working here: scheme, path, and port stripped,
 * exact host or subdomain match.
 */

/** Strip scheme/path/port from a stored entry so pasted URLs work. */
export function normalizeDomain(entry: unknown): string {
  const host = String(entry ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split('/')[0]
    .split(':')[0]

  // Require a real, fully-qualified hostname. In particular, do not accept
  // wildcards or a public suffix such as `com`, either of which would make the
  // allowlist much broader than its author likely intended.
  if (
    host.length > 253 ||
    !host.includes('.') ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)
  ) {
    return ''
  }
  return host
}

/** Hostname of a request, from Origin, falling back to Referer. */
export function requestHost(req: Request): string | null {
  for (const header of ['origin', 'referer']) {
    const raw = req.headers.get(header)
    if (!raw || raw === 'null') continue
    try {
      return new URL(raw).hostname.toLowerCase()
    } catch {
      continue
    }
  }
  return null
}

/**
 * A missing/invalid domain list is fail-closed. A request with no usable
 * Origin/Referer (curl, server-to-server) is also denied.
 */
export function isHostAllowed(host: string | null, domains: unknown): boolean {
  const list = Array.isArray(domains) ? domains.map(normalizeDomain).filter(Boolean) : []
  if (list.length === 0) return false
  if (!host) return false
  return list.some((d) => host === d || host.endsWith('.' + d))
}

/**
 * CORS headers for a response.
 *
 * When a domain list is configured we echo the caller's origin instead of `*`,
 * which requires `Vary: Origin` — widget-data is served with a public
 * `Cache-Control`, and without Vary a shared cache could hand one tenant's
 * origin header to another caller.
 */
export function corsHeaders(req: Request, allowHeaders: string, locked: boolean): Record<string, string> {
  const origin = req.headers.get('origin')
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
  if (locked && origin) {
    return { ...base, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
  }
  return { ...base, 'Access-Control-Allow-Origin': '*' }
}
