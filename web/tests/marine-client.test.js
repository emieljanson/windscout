import { describe, expect, it, vi } from 'vitest'
import { buildMarineUrl, fetchOpenMeteoTide } from '../src/forecast/openMeteoMarine'
import { SPOTS } from '../src/spots'

function response() {
  const time = Array.from({ length: 120 }, (_, index) => Date.UTC(2026, 7, 25, 22) / 1000 + index * 3600)
  return {
    timezone: 'Europe/Amsterdam',
    utc_offset_seconds: 7200,
    hourly_units: { time: 'unixtime', sea_level_height_msl: 'm' },
    hourly: { time, sea_level_height_msl: time.map((_, index) => Math.sin(index / 6)) },
  }
}

describe('Open-Meteo marine client', () => {
  it('requests hourly sea-level data for the selected spot', () => {
    const url = new URL(buildMarineUrl(SPOTS[1]))
    expect(url.origin + url.pathname).toBe('https://marine-api.open-meteo.com/v1/marine')
    expect(url.searchParams.get('hourly')).toBe('sea_level_height_msl')
    expect(url.searchParams.get('forecast_days')).toBe('5')
    expect(url.searchParams.get('timeformat')).toBe('unixtime')
    expect(url.searchParams.get('cell_selection')).toBe('sea')
  })

  it('fetches independently and reports timeout without changing forecast state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => response() })
    await expect(fetchOpenMeteoTide(SPOTS[1], {
      fetchImpl, now: () => 1_777_000_000_000,
    })).resolves.toMatchObject({ capability: 'available', spotId: 'brouwersdam' })

    vi.useFakeTimers()
    const stalled = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const pending = expect(fetchOpenMeteoTide(SPOTS[1], { fetchImpl: stalled, timeoutMs: 25 }))
      .rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(25)
    await pending
    vi.useRealTimers()
  })
})
