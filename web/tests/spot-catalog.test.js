import { describe, expect, it } from 'vitest'

import { buildRuntimeCatalog } from '../scripts/spots/lib/catalog-builder.mjs'
import { verifyReleaseSample, verifyReleaseSources } from '../scripts/spots/lib/release-gates.mjs'
import { searchSpots } from '../src/spots/searchSpots'

const existing = [
  { id: 'edam', name: 'Edam', displayName: 'EDAM', latitude: 52.5126, longitude: 5.0486, timezone: 'Europe/Amsterdam' },
  { id: 'brouwersdam', name: 'Brouwersdam', displayName: 'BROUWERSDAM', latitude: 51.7506, longitude: 3.8577, timezone: 'Europe/Amsterdam' },
  { id: 'castricum-aan-zee', name: 'Castricum aan Zee', displayName: 'CASTRICUM AAN ZEE', latitude: 52.555, longitude: 4.609, timezone: 'Europe/Amsterdam' },
]
const candidate = {
  id: 'osm:node/99', name: 'Chałupy', latitude: 54.76, longitude: 18.49,
  releaseEligible: true,
}
const accepted = {
  candidateId: candidate.id, outcome: 'accepted', timezone: 'Europe/Warsaw',
  evidenceFingerprint: 'current',
}

describe('runtime spot catalog', () => {
  it('keeps existing ids and includes only accepted or currently approved records', () => {
    const reviewCandidate = { ...candidate, id: 'osm:node/100', name: 'Reviewed Spot' }
    const catalog = buildRuntimeCatalog({
      existing,
      candidates: [candidate, reviewCandidate, { ...candidate, id: 'varun:1', name: 'Rights hold', releaseEligible: false }],
      validationResults: [accepted, {
        candidateId: reviewCandidate.id, outcome: 'needs-review', timezone: 'Europe/Warsaw', evidenceFingerprint: 'review-current',
      }],
      decisions: [{
        candidateId: reviewCandidate.id, action: 'approve', evidenceFingerprint: 'review-current',
        windscoutId: 'reviewed-spot', name: 'Reviewed Corrected', latitude: 54.7, longitude: 18.4,
        timezone: 'Europe/Warsaw',
      }],
    })

    expect(catalog.slice(0, 3).map((spot) => spot.id)).toEqual(['edam', 'brouwersdam', 'castricum-aan-zee'])
    expect(catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Chałupy', timezone: 'Europe/Warsaw' }),
      expect.objectContaining({ id: 'reviewed-spot', name: 'Reviewed Corrected' }),
    ]))
    expect(catalog.some((spot) => spot.name === 'Rights hold')).toBe(false)
  })

  it('does not reuse a stale review decision', () => {
    expect(buildRuntimeCatalog({
      existing: [], candidates: [candidate],
      validationResults: [{ ...accepted, outcome: 'needs-review' }],
      decisions: [{ candidateId: candidate.id, action: 'approve', evidenceFingerprint: 'old' }],
    })).toEqual([])
  })

  it.each([
    [{ ...candidate, latitude: 200 }, 'coordinates'],
    [{ ...candidate, name: 'x'.repeat(100) }, 'renderer'],
    [{ ...candidate, name: 'Bad\0Name' }, 'renderer'],
  ])('rejects invalid generated records', (invalid, message) => {
    expect(() => buildRuntimeCatalog({
      existing: [], candidates: [invalid], validationResults: [accepted], decisions: [],
    })).toThrow(message)
  })
})

describe('catalog search', () => {
  const curated = [
    { id: 'chalupy', name: 'Chałupy' },
    { id: 'cape-town', name: 'Cape Town' },
    { id: 'town-lake', name: 'Town Lake' },
  ]
  const personal = [{ id: 'personal-cape', name: 'Cape Town', personal: true }]

  it('folds accents, punctuation, and case', () => {
    expect(searchSpots([...curated, ...personal], 'chalupy').map((spot) => spot.id)).toContain('chalupy')
    expect(searchSpots([...curated, ...personal], 'CAPE-TOWN')[0].id).toBe('personal-cape')
  })

  it('ranks personal exact, curated exact, prefix, then substring matches', () => {
    expect(searchSpots([...curated, ...personal], 'cape').map((spot) => spot.id).slice(0, 2))
      .toEqual(['personal-cape', 'cape-town'])
    expect(searchSpots([...curated, ...personal], 'town').map((spot) => spot.id))
      .toEqual(['town-lake', 'personal-cape', 'cape-town'])
  })

  it('does not expose the global catalog before two characters and caps results', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `spot-${index}`, name: `Spot ${index}` }))
    expect(searchSpots(many, '')).toEqual([])
    expect(searchSpots(many, 's')).toEqual([])
    expect(searchSpots(many, 'spot')).toHaveLength(20)
  })
})

describe('catalog release gates', () => {
  it('requires release rights and public attribution for contributing sources', () => {
    const manifest = { sources: [{
      id: 'osm-snapshot', adapter: 'osm', releaseEligible: true,
      rights: { license: 'ODbL-1.0', redistribution: true, attribution: '© OpenStreetMap contributors' },
    }] }
    expect(() => verifyReleaseSources({
      manifest,
      candidates: [{ source: 'osm', releaseEligible: true }],
      attributionHtml: '<p>OpenStreetMap contributors ODbL-1.0</p>',
    })).not.toThrow()
    expect(() => verifyReleaseSources({
      manifest,
      candidates: [{ source: 'osm', releaseEligible: true }],
      attributionHtml: '<p>Sources</p>',
    })).toThrow('attribution')
  })

  it('fails closed when dataset redistribution rights are unresolved', () => {
    expect(() => verifyReleaseSources({
      manifest: { sources: [{
        id: 'varun', adapter: 'varun', releaseEligible: false,
        rights: { license: 'unconfirmed', redistribution: false, attribution: 'Varun' },
      }] },
      candidates: [{ source: 'varun', releaseEligible: true }],
      attributionHtml: '<p>Varun unconfirmed</p>',
    })).toThrow('not release-eligible')
  })

  it('requires a passing review sample of at least ten percent', () => {
    const validationResults = Array.from({ length: 20 }, (_, index) => ({ candidateId: `spot-${index}`, outcome: 'accepted' }))
    expect(() => verifyReleaseSample({
      automaticAccepts: 20, reviewed: 2, systematicIssues: [],
      sample: [{ candidateId: 'spot-0', verdict: 'pass' }, { candidateId: 'spot-1', verdict: 'pass' }],
    }, validationResults)).not.toThrow()
    expect(() => verifyReleaseSample({
      automaticAccepts: 20, reviewed: 1, systematicIssues: [], sample: [{ candidateId: 'spot-0', verdict: 'pass' }],
    }, validationResults)).toThrow('at least 2')
  })
})
