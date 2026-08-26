import { describe, expect, it } from 'vitest'
import { E1002_MODEL, validateModelProvenance } from '../src/assets/e1002'

describe('E1002 model contract', () => {
  it('records the documented enclosure and native screen proportions', () => {
    expect(E1002_MODEL.enclosureMm).toEqual({ width: 176, height: 120, depth: 17, standDepth: 53 })
    expect(E1002_MODEL.screenAspect).toBeCloseTo(1.6667, 3)
    expect(E1002_MODEL.maxBytes).toBe(3 * 1024 * 1024)
  })

  it('requires every scene role and keeps publication blocked', () => {
    const provenance = {
      source: { url: E1002_MODEL.sourceUrl },
      output: { bytes: 900_000, roles: [...E1002_MODEL.requiredRoles] },
      publication: { redistributionConfirmed: false },
    }
    expect(validateModelProvenance(provenance)).toBe(true)
    provenance.publication.redistributionConfirmed = true
    expect(validateModelProvenance(provenance)).toBe(false)
  })

  it('rejects an oversized or incomplete model record', () => {
    expect(validateModelProvenance({
      source: { url: E1002_MODEL.sourceUrl },
      output: { bytes: E1002_MODEL.maxBytes + 1, roles: ['BODY'] },
      publication: { redistributionConfirmed: false },
    })).toBe(false)
  })
})

