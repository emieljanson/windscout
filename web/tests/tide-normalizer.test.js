import { describe, expect, it } from 'vitest'
import { isNormalizedTide, normalizeTide } from '../src/forecast/normalizeTide'
import { SPOTS } from '../src/spots'

function hourlyResponse({ start = Date.UTC(2026, 7, 25, 22) / 1000, count = 120, values } = {}) {
  const time = Array.from({ length: count }, (_, index) => start + index * 3600)
  return {
    timezone: 'Europe/Amsterdam',
    utc_offset_seconds: 7200,
    hourly_units: { time: 'unixtime', sea_level_height_msl: 'm' },
    hourly: {
      time,
      sea_level_height_msl: values ?? time.map((_, index) => Math.sin(index / 6) * 0.8),
    },
  }
}

describe('tide normalizer', () => {
  it('normalizes a bounded five-local-day hourly sea-level series', () => {
    const tide = normalizeTide(hourlyResponse(), SPOTS[1], { retrievedAt: 1_777_000_000_000 })
    expect(tide).toMatchObject({
      schemaVersion: 1,
      spotId: 'brouwersdam',
      timezone: 'Europe/Amsterdam',
      provider: 'OPEN-METEO MARINE',
      capability: 'available',
    })
    expect(tide.samples).toHaveLength(120)
    expect(tide.samples[0]).toMatchObject({
      timestamp: Date.UTC(2026, 7, 25, 22) / 1000,
      localDate: '2026-08-26',
      localTime: '00:00',
      seaLevelMm: 0,
    })
    expect(isNormalizedTide(tide)).toBe(true)
  })

  it('returns unsupported only when every sea-level value is null', () => {
    const tide = normalizeTide(hourlyResponse({ values: Array(120).fill(null) }), SPOTS[1], {
      retrievedAt: 1_777_000_000_000,
    })
    expect(tide).toMatchObject({ capability: 'unsupported', samples: [] })
    expect(isNormalizedTide(tide)).toBe(true)
  })

  it('rejects partial, misaligned, and non-hourly series', () => {
    const partial = hourlyResponse()
    partial.hourly.sea_level_height_msl[12] = null
    expect(() => normalizeTide(partial, SPOTS[1])).toThrow('partially unavailable')

    const misaligned = hourlyResponse()
    misaligned.hourly.time.pop()
    expect(() => normalizeTide(misaligned, SPOTS[1])).toThrow('misaligned')

    const nonHourly = hourlyResponse()
    nonHourly.hourly.time[2] += 60
    expect(() => normalizeTide(nonHourly, SPOTS[1])).toThrow('hourly')
  })

  it('accepts a 121-hour five-day window across the autumn DST transition', () => {
    const start = Date.UTC(2026, 9, 23, 22) / 1000
    const tide = normalizeTide(hourlyResponse({ start, count: 121 }), SPOTS[1], {
      retrievedAt: 1_777_000_000_000,
    })
    expect(tide.samples).toHaveLength(121)
    expect(new Set(tide.samples.map((sample) => sample.localDate))).toEqual(new Set([
      '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28',
    ]))
    expect(tide.samples.filter((sample) => sample.localDate === '2026-10-25' && sample.localTime === '02:00'))
      .toHaveLength(2)
  })
})
