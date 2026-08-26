import { describe, expect, it, vi } from 'vitest'
import { buildForecastUrl, fetchOpenMeteoForecast } from '../src/forecast/openMeteo'
import { SPOTS } from '../src/spots'

function minimalResponse() {
  const times = []
  for (let day = 26; day <= 30; day += 1) {
    for (const hour of [8, 11, 14, 17, 20]) times.push(`2026-08-${day}T${String(hour).padStart(2, '0')}:00`)
  }
  return {
    timezone: 'Europe/Amsterdam',
    hourly_units: {
      wind_speed_10m: 'kn', wind_gusts_10m: 'kn', wind_direction_10m: '°',
      cloud_cover: '%', precipitation: 'mm',
    },
    hourly: {
      time: times,
      wind_speed_10m: times.map((_, index) => 10 + index / 10),
      wind_gusts_10m: times.map((_, index) => 15 + index / 10),
      wind_direction_10m: times.map(() => 90),
      cloud_cover: times.map(() => 10),
      precipitation: times.map(() => 0),
      is_day: times.map(() => 1),
    },
  }
}

describe('Open-Meteo forecast client', () => {
  it('requests the same model, units, timezone and hourly fields as the firmware', () => {
    const url = new URL(buildForecastUrl(SPOTS[1]))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('51.750600')
    expect(url.searchParams.get('longitude')).toBe('3.857700')
    expect(url.searchParams.get('models')).toBe('knmi_seamless')
    expect(url.searchParams.get('wind_speed_unit')).toBe('kn')
    expect(url.searchParams.get('timezone')).toBe('Europe/Amsterdam')
    expect(url.searchParams.get('forecast_days')).toBe('5')
    expect(url.searchParams.get('hourly')?.split(',')).toEqual([
      'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
      'cloud_cover', 'precipitation', 'is_day',
    ])
  })

  it('fetches and normalizes a successful response without a WindScout backend', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => minimalResponse() })
    const forecast = await fetchOpenMeteoForecast(SPOTS[1], {
      fetchImpl,
      now: () => Date.parse('2026-08-26T12:00:00Z'),
      firstDate: '2026-08-26',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(forecast.spotId).toBe('brouwersdam')
    expect(forecast.days).toHaveLength(5)
    expect(forecast.days[0].samples).toHaveLength(5)
  })

  it('rejects a non-success response and clears its timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    await expect(fetchOpenMeteoForecast(SPOTS[1], { fetchImpl, timeoutMs: 25 }))
      .rejects.toThrow('HTTP 503')
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('aborts a request that exceeds the browser timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const pending = fetchOpenMeteoForecast(SPOTS[1], { fetchImpl, timeoutMs: 25 })
    const result = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(25)
    await result
    vi.useRealTimers()
  })
})
