import { describe, expect, it, vi } from 'vitest'
import { buildForecastUrl, fetchOpenMeteoForecasts } from '../src/forecast/openMeteo'
import { FORECAST_MODEL_IDS, getForecastModel } from '../src/forecast/models'
import { SPOTS } from '../src/spots'

function minimalResponse(modelIds = FORECAST_MODEL_IDS) {
  const times = []
  for (let day = 26; day <= 30; day += 1) {
    for (const hour of [8, 11, 14, 17, 20]) times.push(`2026-08-${day}T${String(hour).padStart(2, '0')}:00`)
  }
  const hourlyUnits = { time: 'iso8601' }
  const hourly = { time: times }
  modelIds.forEach((modelId, modelIndex) => {
    Object.assign(hourlyUnits, {
      [`wind_speed_10m_${modelId}`]: 'kn',
      [`wind_gusts_10m_${modelId}`]: 'kn',
      [`wind_direction_10m_${modelId}`]: '°',
      [`cloud_cover_${modelId}`]: '%',
      [`precipitation_${modelId}`]: 'mm',
      [`is_day_${modelId}`]: '',
    })
    Object.assign(hourly, {
      [`wind_speed_10m_${modelId}`]: times.map((_, index) => 10 + modelIndex * 4 + index / 10),
      [`wind_gusts_10m_${modelId}`]: times.map((_, index) => 15 + modelIndex * 4 + index / 10),
      [`wind_direction_10m_${modelId}`]: times.map(() => 90),
      [`cloud_cover_${modelId}`]: times.map(() => 10),
      [`precipitation_${modelId}`]: times.map(() => 0),
      [`is_day_${modelId}`]: times.map(() => 1),
    })
  })
  return {
    timezone: 'Europe/Amsterdam',
    hourly_units: hourlyUnits,
    hourly,
  }
}

describe('Open-Meteo forecast client', () => {
  it('requests best fit plus every curated comparison model in one call', () => {
    const url = new URL(buildForecastUrl(SPOTS[1]))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('51.750600')
    expect(url.searchParams.get('longitude')).toBe('3.857700')
    expect(url.searchParams.get('models')).toBe(FORECAST_MODEL_IDS.join(','))
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
    const forecasts = await fetchOpenMeteoForecasts(SPOTS[1], {
      fetchImpl,
      now: () => Date.parse('2026-08-26T12:00:00Z'),
      firstDate: '2026-08-26',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(Object.keys(forecasts)).toEqual(FORECAST_MODEL_IDS)
    expect(forecasts.best_match).toMatchObject({
      spotId: 'brouwersdam', modelId: 'best_match', model: 'BEST FIT',
    })
    expect(forecasts.gfs_seamless.model).toBe(getForecastModel('gfs_seamless').screenLabel)
    expect(forecasts.gfs_seamless.days[0].samples[0].sustainedKt)
      .toBeGreaterThan(forecasts.best_match.days[0].samples[0].sustainedKt)
  })

  it('rejects a non-success response and clears its timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    await expect(fetchOpenMeteoForecasts(SPOTS[1], { fetchImpl, timeoutMs: 25 }))
      .rejects.toThrow('HTTP 503')
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('aborts a request that exceeds the browser timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const pending = fetchOpenMeteoForecasts(SPOTS[1], { fetchImpl, timeoutMs: 25 })
    const result = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(25)
    await result
    vi.useRealTimers()
  })
})
