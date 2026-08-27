import { describe, expect, it, vi } from 'vitest'

import {
  reverseGeoapifyLocation,
  searchGeoapifyPlaces,
} from '../src/map/geoapify'

function response(results, ok = true) {
  return {
    ok,
    status: ok ? 200 : 429,
    json: vi.fn().mockResolvedValue({ results }),
  }
}

describe('Geoapify place provider', () => {
  it('normalizes a small result set with coordinates and timezone', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([{
      place_id: 'edam-id',
      name: 'Edam',
      city: 'Edam',
      state: 'North Holland',
      country: 'Netherlands',
      formatted: 'Edam, North Holland, Netherlands',
      lat: 52.5126,
      lon: 5.0486,
      timezone: { name: 'Europe/Amsterdam' },
    }]))

    await expect(searchGeoapifyPlaces('Edam', {
      apiKey: 'test-key',
      fetchImpl,
    })).resolves.toEqual([{
      id: 'edam-id',
      name: 'Edam',
      description: 'North Holland, Netherlands',
      latitude: 52.5126,
      longitude: 5.0486,
      timezone: 'Europe/Amsterdam',
    }])
    const url = new URL(fetchImpl.mock.calls[0][0])
    expect(url.searchParams.get('text')).toBe('Edam')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('lang')).toBe('en')
  })

  it('does not search until a meaningful query and key are present', async () => {
    const fetchImpl = vi.fn()
    await expect(searchGeoapifyPlaces('e', { apiKey: 'test-key', fetchImpl })).resolves.toEqual([])
    await expect(searchGeoapifyPlaces('Edam', { apiKey: '', fetchImpl }))
      .rejects.toThrow('Geoapify is not configured')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('looks up the final pin timezone separately from the initial result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([{
      lat: 52.51,
      lon: 5.05,
      timezone: { name: 'Europe/Amsterdam' },
    }]))
    await expect(reverseGeoapifyLocation({ latitude: 52.51, longitude: 5.05 }, {
      apiKey: 'test-key',
      fetchImpl,
    })).resolves.toMatchObject({ timezone: 'Europe/Amsterdam' })
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toContain('/reverse')
  })

  it('surfaces provider failures as a concise search error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([], false))
    await expect(searchGeoapifyPlaces('Edam', { apiKey: 'test-key', fetchImpl }))
      .rejects.toThrow('Location search is temporarily unavailable')
  })

  it.each([
    ['autocomplete', (options) => searchGeoapifyPlaces('Edam', options)],
    ['reverse lookup', (options) => reverseGeoapifyLocation({ latitude: 52.51, longitude: 5.05 }, options)],
  ])('bounds a stalled %s request', async (_label, call) => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const pending = call({ apiKey: 'test-key', fetchImpl, timeoutMs: 25 })
    const result = expect(pending).rejects.toThrow('Location search is temporarily unavailable')
    await vi.advanceTimersByTimeAsync(25)
    await result
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})
