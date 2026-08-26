import { FORECAST_MODEL_IDS, FORECAST_MODELS } from './models'
import { normalizeForecastModels } from './normalizeForecast'

export const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
export const OPEN_METEO_TIMEOUT_MS = 10_000

export function buildForecastUrl(spot, modelIds = FORECAST_MODEL_IDS) {
  const parameters = new URLSearchParams({
    latitude: Number(spot.latitude).toFixed(6),
    longitude: Number(spot.longitude).toFixed(6),
    hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,precipitation,is_day,temperature_2m',
    wind_speed_unit: 'kn',
    timezone: 'Europe/Amsterdam',
    models: modelIds.join(','),
    forecast_days: '5',
  })
  return `${OPEN_METEO_ENDPOINT}?${parameters}`
}

export async function fetchOpenMeteoForecasts(spot, {
  fetchImpl = globalThis.fetch,
  timeoutMs = OPEN_METEO_TIMEOUT_MS,
  now = Date.now,
  firstDate,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Forecast requests are unavailable in this browser.')
  const controller = new AbortController()
  let didTimeout = false
  const timeout = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetchImpl(buildForecastUrl(spot), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response?.ok) throw new Error(`Forecast request failed (HTTP ${response?.status ?? 'error'}).`)
    const retrievedAt = now()
    return normalizeForecastModels(await response.json(), spot, {
      models: FORECAST_MODELS,
      retrievedAt,
      firstDate,
    })
  } catch (error) {
    if (didTimeout) throw new Error('Forecast request timed out.', { cause: error })
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
