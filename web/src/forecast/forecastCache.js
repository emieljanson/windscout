import { isNormalizedForecast } from './normalizeForecast'

export const FORECAST_CACHE_KEY = 'windscout.forecasts'
export const FORECAST_CACHE_VERSION = 1

function availableStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function readEnvelope(storage) {
  const target = availableStorage(storage)
  if (!target) return null
  try {
    const envelope = JSON.parse(target.getItem(FORECAST_CACHE_KEY))
    if (!envelope || envelope.version !== FORECAST_CACHE_VERSION ||
        !envelope.spots || typeof envelope.spots !== 'object' || Array.isArray(envelope.spots)) return null
    return envelope
  } catch {
    return null
  }
}

export function readCachedForecast(spotId, storage) {
  const forecast = readEnvelope(storage)?.spots?.[spotId]
  return isNormalizedForecast(forecast) && forecast.spotId === spotId ? forecast : null
}

export function writeCachedForecast(forecast, storage) {
  if (!isNormalizedForecast(forecast)) return false
  const target = availableStorage(storage)
  if (!target) return false
  try {
    const envelope = readEnvelope(target) ?? { version: FORECAST_CACHE_VERSION, spots: {} }
    envelope.spots[forecast.spotId] = forecast
    target.setItem(FORECAST_CACHE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

export function clearCachedForecast(storage) {
  try {
    availableStorage(storage)?.removeItem(FORECAST_CACHE_KEY)
  } catch {
    // Storage is an optional browser optimization; failures are intentionally non-fatal.
  }
}
