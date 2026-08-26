import { describe, expect, it } from 'vitest'
import { normalizeForecast } from '../src/forecast/normalizeForecast'
import { SPOTS } from '../src/spots'

function responseFor({ hours = [8, 11, 14, 17, 20], speedUnit = 'kn', omit = '' } = {}) {
  const times = []
  for (let day = 26; day <= 30; day += 1) {
    for (const hour of hours) times.push(`2026-08-${day}T${String(hour).padStart(2, '0')}:00`)
  }
  const hourly = {
    time: times,
    wind_speed_10m: times.map((_, index) => 10.4 + index),
    wind_gusts_10m: times.map((_, index) => 16.6 + index),
    wind_direction_10m: times.map((_, index) => (index === 0 ? 190 : 90)),
    cloud_cover: times.map((_, index) => index === 0 ? 21 : 70),
    precipitation: times.map((_, index) => index === 1 ? 1 : 0),
    is_day: times.map(() => 1),
  }
  delete hourly[omit]
  return {
    timezone: 'Europe/Amsterdam',
    hourly_units: {
      wind_speed_10m: speedUnit,
      wind_gusts_10m: 'kn',
      wind_direction_10m: '°',
      cloud_cover: '%',
      precipitation: 'mm',
    },
    hourly,
  }
}

describe('forecast normalizer', () => {
  it('creates the canonical five-day renderer input at 08/11/14/17/20 local time', () => {
    const forecast = normalizeForecast(responseFor(), SPOTS[1], {
      firstDate: '2026-08-26',
      retrievedAt: Date.parse('2026-08-26T12:05:00Z'),
    })
    expect(forecast).toMatchObject({
      schemaVersion: 1,
      spotId: 'brouwersdam',
      spotName: 'BROUWERSDAM',
      timezone: 'Europe/Amsterdam',
      provider: 'OPEN-METEO',
      model: 'KNMI SEAMLESS',
      coordinates: `51°45'02"N 3°51'28"E`,
      updatedTime: '26 AUG 2PM',
    })
    expect(forecast.days.map((day) => day.day)).toEqual(['TODAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])
    expect(forecast.days[0].date).toBe('26 AUG')
    expect(forecast.days[0].samples.map((sample) => sample.time)).toEqual(['08', '11', '14', '17', '20'])
    expect(forecast.days[0].samples[0]).toMatchObject({
      sustainedKt: 10, gustKt: 17, destinationDegrees: 10, weather: 3, available: true,
    })
    expect(forecast.days[0].samples[1].weather).toBe(7)
  })

  it.each([
    ['missing core hourly arrays', { omit: 'wind_gusts_10m' }],
    ['an incompatible speed unit', { speedUnit: 'km/h' }],
    ['an incomplete target-hour sequence', { hours: [8, 11, 14, 20] }],
  ])('rejects %s', (_name, options) => {
    expect(() => normalizeForecast(responseFor(options), SPOTS[1], {
      firstDate: '2026-08-26', retrievedAt: 1_777_000_000_000,
    })).toThrow()
  })

  it('keeps weather unavailable when optional weather arrays are absent', () => {
    const forecast = normalizeForecast(responseFor({ omit: 'cloud_cover' }), SPOTS[1], {
      firstDate: '2026-08-26', retrievedAt: 1_777_000_000_000,
    })
    expect(forecast.days.flatMap((day) => day.samples).every((sample) => sample.weather === 0)).toBe(true)
  })
})
