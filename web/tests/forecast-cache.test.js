import { describe, expect, it } from 'vitest'
import { clearCachedForecast, readCachedForecast, writeCachedForecast } from '../src/forecast/forecastCache'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function forecast(modelId = 'best_match', model = 'BEST FIT') {
  return {
    schemaVersion: 1,
    spotId: 'brouwersdam',
    spotName: 'BROUWERSDAM',
    coordinates: `51°45'02"N 3°51'28"E`,
    timezone: 'Europe/Amsterdam',
    provider: 'OPEN-METEO',
    modelId,
    model,
    updatedTime: '26 AUG 2PM',
    retrievedAt: 1_777_000_000_000,
    days: Array.from({ length: 5 }, (_, day) => ({
      localDate: `2026-08-${26 + day}`,
      day: day === 0 ? 'TODAY' : 'THURSDAY',
      date: `${26 + day} AUG`,
      samples: [8, 11, 14, 17, 20].map((hour) => ({
        time: String(hour).padStart(2, '0'), sustainedKt: 12, gustKt: 18,
        destinationDegrees: 270, available: true, weather: 1,
      })),
    })),
  }
}

describe('forecast cache', () => {
  it('round-trips independent model forecasts for the same spot', () => {
    const storage = memoryStorage()
    expect(writeCachedForecast(forecast(), storage)).toBe(true)
    expect(writeCachedForecast(forecast('gfs_seamless', 'NOAA GFS'), storage)).toBe(true)
    expect(readCachedForecast('brouwersdam', 'best_match', storage)).toEqual(forecast())
    expect(readCachedForecast('brouwersdam', 'gfs_seamless', storage))
      .toEqual(forecast('gfs_seamless', 'NOAA GFS'))
    expect(readCachedForecast('edam', 'best_match', storage)).toBeNull()
  })

  it.each([
    '{not-json',
    JSON.stringify({ version: 99, spots: {} }),
    JSON.stringify({ version: 2, spots: { brouwersdam: { best_match: { schemaVersion: 1 } } } }),
  ])('rejects malformed or incompatible cache content', (value) => {
    const storage = memoryStorage()
    storage.setItem('windscout.forecasts', value)
    expect(readCachedForecast('brouwersdam', 'best_match', storage)).toBeNull()
  })

  it('can clear a stale cache safely', () => {
    const storage = memoryStorage()
    writeCachedForecast(forecast(), storage)
    clearCachedForecast(storage)
    expect(readCachedForecast('brouwersdam', 'best_match', storage)).toBeNull()
  })

  it('rejects structurally valid data that cannot cross the renderer bridge', () => {
    const storage = memoryStorage()
    const oversizedName = forecast()
    oversizedName.spotName = 'x'.repeat(96)
    expect(writeCachedForecast(oversizedName, storage)).toBe(false)

    const oversizedWind = forecast()
    oversizedWind.days[0].samples[0].sustainedKt = 32768
    expect(writeCachedForecast(oversizedWind, storage)).toBe(false)
  })
})
