import { normalizeTide } from './normalizeTide'

export const OPEN_METEO_MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine'
export const OPEN_METEO_MARINE_TIMEOUT_MS = 10_000

export function buildMarineUrl(spot) {
  const parameters = new URLSearchParams({
    latitude: Number(spot.latitude).toFixed(6),
    longitude: Number(spot.longitude).toFixed(6),
    hourly: 'sea_level_height_msl',
    minutely_15: 'sea_level_height_msl',
    timezone: spot.timezone,
    forecast_days: '5',
    timeformat: 'unixtime',
    cell_selection: 'sea',
  })
  return `${OPEN_METEO_MARINE_ENDPOINT}?${parameters}`
}

export async function fetchOpenMeteoTide(spot, {
  fetchImpl = globalThis.fetch,
  timeoutMs = OPEN_METEO_MARINE_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Marine forecast requests are unavailable in this browser.')
  const controller = new AbortController()
  let didTimeout = false
  const timeout = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetchImpl(buildMarineUrl(spot), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response?.ok) throw new Error(`Marine forecast request failed (HTTP ${response?.status ?? 'error'}).`)
    return normalizeTide(await response.json(), spot, { retrievedAt: now() })
  } catch (error) {
    if (didTimeout) throw new Error('Marine forecast request timed out.', { cause: error })
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
