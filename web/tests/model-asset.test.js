import { describe, expect, it } from 'vitest'
import { E1002_MODEL, validateModelProvenance } from '../src/assets/e1002'

describe('E1002 model contract', () => {
  it('records the documented enclosure and native screen proportions', () => {
    expect(E1002_MODEL.enclosureMm).toEqual({ width: 176, height: 120, depth: 17, standDepth: 53 })
    expect(E1002_MODEL.screenAspect).toBeCloseTo(1.6667, 3)
    expect(E1002_MODEL.maxBytes).toBe(3 * 1024 * 1024)
    expect(E1002_MODEL.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('records the fine CAD edge and normal treatment used by the product render', async () => {
    const provenance = await import('../public/devices/e1002/provenance.json', { with: { type: 'json' } })

    expect(provenance.default.conversion.linearDeflectionMm).toBeLessThanOrEqual(0.2)
    expect(provenance.default.conversion.angularDeflection).toBeLessThanOrEqual(0.25)
    expect(provenance.default.conversion.normalTreatment).toMatch(/crease/i)
    expect(provenance.default.conversion.normalTreatment).toMatch(/planar front-face/i)
  })

  it('requires every scene role and recorded publication permission', () => {
    const provenance = {
      source: { url: E1002_MODEL.sourceUrl, sha256: E1002_MODEL.sourceSha256 },
      output: { bytes: 900_000, roles: [...E1002_MODEL.requiredRoles] },
      publication: { redistributionConfirmed: true, permissionBasis: 'Confirmed by project owner.' },
    }
    expect(validateModelProvenance(provenance)).toBe(true)
    provenance.publication.redistributionConfirmed = false
    expect(validateModelProvenance(provenance)).toBe(false)
  })

  it('rejects an oversized or incomplete model record', () => {
    expect(validateModelProvenance({
      source: { url: E1002_MODEL.sourceUrl, sha256: E1002_MODEL.sourceSha256 },
      output: { bytes: E1002_MODEL.maxBytes + 1, roles: ['BODY'] },
      publication: { redistributionConfirmed: true, permissionBasis: 'Confirmed by project owner.' },
    })).toBe(false)
  })
})
