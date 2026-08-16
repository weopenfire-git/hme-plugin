import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, parseRules, renderRules, ttlForTier } from '../src/memory/rules.ts'

describe('parseRules', () => {
  it('uses defaults when empty', () => {
    const r = parseRules('')
    expect(r.v1Ttl).toBe('never')
    expect(r.v2Ttl).toBe('365d')
    expect(r.v3Ttl).toBe('90d')
  })
  it('overrides from file', () => {
    const r = parseRules('# header\nv2_ttl: 30d\nv3_ttl: never')
    expect(r.v2Ttl).toBe('30d')
    expect(r.v3Ttl).toBe('never')
    expect(r.v1Ttl).toBe('never')
  })
})

describe('ttlForTier', () => {
  it('V1 never', () => {
    expect(ttlForTier(DEFAULT_RULES, 1)).toBeUndefined()
  })
  it('V2 default', () => {
    expect(ttlForTier(DEFAULT_RULES, 2)).toBe('365d')
  })
  it('V3 default and undefined', () => {
    expect(ttlForTier(DEFAULT_RULES, 3)).toBe('90d')
    expect(ttlForTier(DEFAULT_RULES, undefined)).toBe('90d')
  })
})

describe('renderRules', () => {
  it('round-trips', () => {
    const text = renderRules(DEFAULT_RULES)
    expect(parseRules(text)).toEqual(DEFAULT_RULES)
  })
})