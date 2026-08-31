import { describe, expect, it } from 'vitest'
import {
  boundedAnswers,
  boundedInt,
  boundedText,
  boundedUuidArray,
  isUuid,
  LIMITS,
  readJsonBody,
} from '../../supabase/functions/_shared/guard'
import {
  corsHeaders,
  isHostAllowed,
  normalizeDomain,
  requestHost,
} from '../../supabase/functions/_shared/origin'
import { approvedHttpsUrl } from '../../src/lib/approvedUrl'
import { issueSessionToken, verifySessionToken } from '../../supabase/functions/_shared/session-token'

describe('public edge-function guards', () => {
  it('normalizes configured domains without permitting suffix lookalikes', () => {
    expect(normalizeDomain('https://Example.COM:443/path')).toBe('example.com')
    expect(normalizeDomain('*.example.com')).toBe('')
    expect(normalizeDomain('com')).toBe('')
    expect(isHostAllowed('app.example.com', ['example.com'])).toBe(true)
    expect(isHostAllowed('example.com.attacker.test', ['example.com'])).toBe(false)
  })

  it('fails closed for missing domains and headerless requests', () => {
    expect(isHostAllowed('example.com', [])).toBe(false)
    expect(isHostAllowed(null, ['example.com'])).toBe(false)
  })

  it('issues embed URLs only for absolute HTTPS assets', () => {
    expect(approvedHttpsUrl('https://cdn.example.com/widget.js')).toBe('https://cdn.example.com/widget.js')
    expect(approvedHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(approvedHttpsUrl('http://cdn.example.com/widget.js')).toBeNull()
    expect(approvedHttpsUrl('/widget.js')).toBeNull()
  })

  it('extracts only a parsed Origin or Referer hostname', () => {
    expect(requestHost(new Request('https://edge.test', {
      headers: { Origin: 'https://Portal.Example.com/path' },
    }))).toBe('portal.example.com')
    expect(requestHost(new Request('https://edge.test'))).toBeNull()
  })

  it('varies locked CORS responses by origin', () => {
    const headers = corsHeaders(
      new Request('https://edge.test', { headers: { Origin: 'https://example.com' } }),
      'Content-Type',
      true,
    )
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com')
    expect(headers.Vary).toBe('Origin')
  })

  it('bounds UUID arrays, answer keys, text, and integers', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(isUuid(id)).toBe(true)
    expect(boundedUuidArray([id, id, 'invalid'])).toEqual([id])
    expect(boundedText(`  ${'x'.repeat(20)}  `, 5)).toBe('xxxxx')
    expect(boundedInt(10.8, 0, 10)).toBe(10)

    const answers = Object.fromEntries(
      Array.from({ length: LIMITS.answerKeys + 5 }, (_, index) => [
        `q-${index}`,
        'x'.repeat(LIMITS.textField + 10),
      ]),
    )
    const bounded = boundedAnswers(answers)
    expect(Object.keys(bounded)).toHaveLength(LIMITS.answerKeys)
    expect(String(bounded['q-0'])).toHaveLength(LIMITS.textField)
  })

  it('rejects oversized and non-object JSON bodies', async () => {
    const oversized = new Request('https://edge.test', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(20_000) }),
    })
    expect(await readJsonBody(oversized)).toBeNull()

    const arrayBody = new Request('https://edge.test', {
      method: 'POST',
      body: '[]',
    })
    expect(await readJsonBody(arrayBody)).toBeNull()
  })

  it('binds signed session tokens to widget, session, and expiry', async () => {
    const secret = 'a'.repeat(32)
    const now = Date.UTC(2026, 7, 25)
    const widgetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const token = await issueSessionToken(secret, widgetId, sessionId, now, 60)

    expect(await verifySessionToken(secret, token, widgetId, sessionId, now)).toBe(true)
    expect(await verifySessionToken(secret, token, widgetId, crypto.randomUUID(), now)).toBe(false)
    expect(await verifySessionToken(secret, `${token}x`, widgetId, sessionId, now)).toBe(false)
    expect(await verifySessionToken(secret, token, widgetId, sessionId, now + 61_000)).toBe(false)
  })
})
