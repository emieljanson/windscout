import { describe, expect, it } from 'vitest'
import { readCachedTide, writeCachedTide } from '../src/forecast/tideCache'

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function tide(spotId = 'brouwersdam') {
  return {
    schemaVersion: 1,
    spotId,
    timezone: 'Europe/Amsterdam',
    provider: 'OPEN-METEO MARINE',
    retrievedAt: 1_777_000_000_000,
    capability: 'available',
    samples: Array.from({ length: 120 }, (_, index) => ({
      timestamp: Date.UTC(2026, 7, 25, 22) / 1000 + index * 3600,
      localDate: `2026-08-${String(26 + Math.floor(index / 24)).padStart(2, '0')}`,
      localTime: `${String(index % 24).padStart(2, '0')}:00`,
      seaLevelMm: index - 60,
    })),
  }
}

describe('tide cache', () => {
  it('round-trips by spot and timezone, independent of wind model', () => {
    const target = storage()
    expect(writeCachedTide(tide(), target)).toBe(true)
    expect(readCachedTide('brouwersdam', 'Europe/Amsterdam', target)).toEqual(tide())
    expect(readCachedTide('edam', 'Europe/Amsterdam', target)).toBeNull()
  })

  it('rejects old schemas and corrupt values', () => {
    const target = storage()
    target.setItem('windscout.tides', JSON.stringify({ version: 0, spots: {} }))
    expect(readCachedTide('brouwersdam', 'Europe/Amsterdam', target)).toBeNull()
    expect(writeCachedTide({ ...tide(), schemaVersion: 0 }, target)).toBe(false)
  })
})
