const encoder = new TextEncoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function constantTimeEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length)
  let mismatch = left.length ^ right.length
  for (let i = 0; i < max; i += 1) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0)
  }
  return mismatch === 0
}

async function signature(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return base64Url(new Uint8Array(signed))
}

function message(widgetId: string, sessionId: string, expiresAt: number): string {
  return `v1:${widgetId}:${sessionId}:${expiresAt}`
}

export async function issueSessionToken(
  secret: string,
  widgetId: string,
  sessionId: string,
  nowMs = Date.now(),
  ttlSeconds = 2 * 60 * 60,
): Promise<string> {
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds
  const mac = await signature(secret, message(widgetId, sessionId, expiresAt))
  return `${expiresAt}.${mac}`
}

export async function verifySessionToken(
  secret: string,
  token: unknown,
  widgetId: string,
  sessionId: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (typeof token !== 'string' || token.length > 200) return false
  const parts = token.split('.')
  if (parts.length !== 2 || !/^\d{10}$/.test(parts[0])) return false
  const expiresAt = Number(parts[0])
  const nowSeconds = Math.floor(nowMs / 1000)
  if (!Number.isSafeInteger(expiresAt) || expiresAt < nowSeconds || expiresAt > nowSeconds + 24 * 60 * 60) {
    return false
  }
  const expected = await signature(secret, message(widgetId, sessionId, expiresAt))
  return constantTimeEqual(expected, parts[1])
}
