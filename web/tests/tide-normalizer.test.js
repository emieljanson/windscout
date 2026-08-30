import { describe, expect, it } from 'vitest'
import { isNormalizedTide, normalizeTide } from '../src/forecast/normalizeTide'
import { SPOTS } from '../src/spots'

function hourlyResponse({ start = Date.UTC(2026, 7, 25, 22) / 1000, count = 120, values } = {}) {
  const time = Array.from({ length: count }, (_, index) => start + index * 3600)
  const minutelyTime = Array.from({ length: (count - 1) * 4 + 1 }, (_, index) => start + index * 900)
  return {
    timezone: 'Europe/Amsterdam',
    utc_offset_seconds: 7200,
    hourly_units: { time: 'unixtime', sea_level_height_msl: 'm' },
    hourly: {
      time,
      sea_level_height_msl: values ?? time.map((_, index) => Math.sin(index / 6) * 0.8),
    },
    minutely_15_units: { time: 'unixtime', sea_level_height_msl: 'm' },
    minutely_15: {
      time: minutelyTime,
      sea_level_height_msl: minutelyTime.map((_, index) =>
        Math.cos((index - 25) * Math.PI / 24) * 0.8),
    },
  }
}

describe('tide normalizer', () => {
  it('normalizes a bounded five-local-day hourly sea-level series', () => {
    const tide = normalizeTide(hourlyResponse(), SPOTS[1], { retrievedAt: 1_777_000_000_000 })
    expect(tide).toMatchObject({
      schemaVersion: 2,
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
    expect(tide.extrema).toContainEqual(expect.objectContaining({
      localDate: '2026-08-26',
      localTime: '06:15',
      type: 'high',
    }))
    expect(isNormalizedTide(tide)).toBe(true)
  })

  it('falls back seamlessly to whole-hour extrema when quarter-hour data is absent', () => {
    const response = hourlyResponse()
    delete response.minutely_15_units
    delete response.minutely_15

    const tide = normalizeTide(response, SPOTS[1], { retrievedAt: 1_777_000_000_000 })

    expect(tide.extrema.length).toBeGreaterThan(0)
    expect(tide.extrema.every((extremum) => extremum.localTime.endsWith(':00'))).toBe(true)
    expect(isNormalizedTide(tide)).toBe(true)
  })

  it('marks flat sea-level data unsupported instead of drawing an unlabeled tide row', () => {
    const response = hourlyResponse({ values: Array(120).fill(0.1) })
    response.minutely_15.sea_level_height_msl.fill(0.1)

    const tide = normalizeTide(response, SPOTS[1], { retrievedAt: 1_777_000_000_000 })

    expect(tide).toMatchObject({ capability: 'unsupported', samples: [], extrema: [] })
    expect(isNormalizedTide(tide)).toBe(true)
  })

  it('returns unsupported only when every sea-level value is null', () => {
    const tide = normalizeTide(hourlyResponse({ values: Array(120).fill(null) }), SPOTS[1], {
      retrievedAt: 1_777_000_000_000,
    })
    expect(tide).toMatchObject({ capability: 'unsupported', samples: [], extrema: [] })
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
