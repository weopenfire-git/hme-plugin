import type { MemoryValue } from './archive.ts'

/**
 * Expiry rules, loadable from a user-editable file. Defaults mirror the
 * 'keep the precious 1/10' philosophy: V1 (identity/lessons) never expires;
 * V2 (methods) and V3 (transient facts) get a default TTL. Users may change
 * the rules; the rules only affect writes made after the change — old
 * absolute expiry markers are never recalculated.
 */
export interface ExpiryRules {
  /** Default TTL string for each value tier; 'never' means no expiry. */
  v1Ttl: string
  v2Ttl: string
  v3Ttl: string
}

/** Default rules. V1 always 'never'. */
export const DEFAULT_RULES: ExpiryRules = {
  v1Ttl: 'never',
  v2Ttl: '365d',
  v3Ttl: '90d',
}

/** Resolve the effective TTL string for a tier given user rules over defaults. */
export function ttlForTier(rules: ExpiryRules, value: MemoryValue | undefined): string | undefined {
  if (value === 1) return rules.v1Ttl === 'never' ? undefined : rules.v1Ttl
  if (value === 2) return rules.v2Ttl === 'never' ? undefined : rules.v2Ttl
  return rules.v3Ttl === 'never' ? undefined : rules.v3Ttl
}

/** Parse a rules markdown file into ExpiryRules, using defaults for missing keys. */
export function parseRules(text: string): ExpiryRules {
  const rules: ExpiryRules = { ...DEFAULT_RULES }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const m = /^(v[123]_ttl)\s*[:=]\s*(.+)$/.exec(line)
    if (!m) continue
    const val = m[2].trim()
    if (m[1] === 'v1_ttl') rules.v1Ttl = val
    else if (m[1] === 'v2_ttl') rules.v2Ttl = val
    else if (m[1] === 'v3_ttl') rules.v3Ttl = val
  }
  return rules
}

/** Render the rules file with a header comment. */
export function renderRules(rules: ExpiryRules): string {
  return [
    '# Expiry rules (edit freely; changes affect only future writes, never',
    '# recalculate existing entries). Value tiers: V1 identity/lessons,',
    "# V2 methods, V3 transient facts. Use d/w/y units or 'never'.",
    'v1_ttl: ' + rules.v1Ttl,
    'v2_ttl: ' + rules.v2Ttl,
    'v3_ttl: ' + rules.v3Ttl,
    '',
  ].join('\n')
}