import { describe, expect, it } from 'vitest'
import { normalizeApprovedDomain } from '../../src/lib/approvedDomain'

describe('approved domains', () => {
  it('normalizes full hostnames and rejects dangerously broad entries', () => {
    expect(normalizeApprovedDomain('https://Portal.Example.com:443/path')).toBe('portal.example.com')
    expect(normalizeApprovedDomain('*.example.com')).toBeNull()
    expect(normalizeApprovedDomain('com')).toBeNull()
    expect(normalizeApprovedDomain('example.com.attacker.test')).toBe('example.com.attacker.test')
  })
})
