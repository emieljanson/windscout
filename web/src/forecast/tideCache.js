import { isNormalizedTide } from './normalizeTide'

export const TIDE_CACHE_KEY = 'windscout.tides'
export const TIDE_CACHE_VERSION = 1

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
    const envelope = JSON.parse(target.getItem(TIDE_CACHE_KEY))
    if (!envelope || envelope.version !== TIDE_CACHE_VERSION || !envelope.spots ||
        typeof envelope.spots !== 'object' || Array.isArray(envelope.spots)) return null
    return envelope
  } catch {
    return null
  }
}

function identity(spotId, timezone) {
  return `${spotId}\n${timezone}`
}

export function readCachedTide(spotId, timezone, storage) {
  const value = readEnvelope(storage)?.spots?.[identity(spotId, timezone)]
  return isNormalizedTide(value) && value.spotId === spotId && value.timezone === timezone
    ? value
    : null
}

export function writeCachedTide(tide, storage) {
  if (!isNormalizedTide(tide)) return false
  const target = availableStorage(storage)
  if (!target) return false
  try {
    const envelope = readEnvelope(target) ?? { version: TIDE_CACHE_VERSION, spots: {} }
    envelope.spots[identity(tide.spotId, tide.timezone)] = tide
    target.setItem(TIDE_CACHE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}
