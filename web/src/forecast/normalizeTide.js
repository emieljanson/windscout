const TIDE_SCHEMA_VERSION = 1
const MIN_TIDE_SAMPLES = 119
const MAX_TIDE_SAMPLES = 121

function fail(message) {
  throw new Error(`Invalid Open-Meteo marine forecast: ${message}`)
}

function localParts(timestampSeconds, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestampSeconds * 1000))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    localDate: `${values.year}-${values.month}-${values.day}`,
    localTime: `${values.hour}:${values.minute}`,
  }
}

function roundSymmetric(value) {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

export function normalizeTide(response, spot, { retrievedAt = Date.now() } = {}) {
  if (!spot?.id || !Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude) ||
      typeof spot.timezone !== 'string' || !spot.timezone) fail('spot is invalid')
  if (!Number.isFinite(retrievedAt) || retrievedAt <= 0) fail('retrieval time is invalid')
  if (!response || response.timezone !== spot.timezone) fail('timezone does not match the spot')
  if (response.hourly_units?.time !== 'unixtime' ||
      response.hourly_units?.sea_level_height_msl !== 'm') fail('units do not match the tide contract')

  const times = response.hourly?.time
  const values = response.hourly?.sea_level_height_msl
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
    fail('hourly arrays are missing or misaligned')
  }
  if (times.length < MIN_TIDE_SAMPLES || times.length > MAX_TIDE_SAMPLES) {
    fail('five-day hourly window has an unexpected size')
  }
  if (values.every((value) => value === null)) {
    return {
      schemaVersion: TIDE_SCHEMA_VERSION,
      spotId: spot.id,
      timezone: spot.timezone,
      provider: 'OPEN-METEO MARINE',
      retrievedAt,
      capability: 'unsupported',
      samples: [],
    }
  }
  if (values.some((value) => value === null)) fail('sea-level values are partially unavailable')

  const samples = times.map((timestamp, index) => {
    if (!Number.isInteger(timestamp) || timestamp <= 0 ||
        (index > 0 && timestamp - times[index - 1] !== 3600)) fail('times are not an ascending hourly series')
    const value = values[index]
    if (!Number.isFinite(value) || value < -2147483.648 || value > 2147483.647) {
      fail(`invalid sea-level value at index ${index}`)
    }
    return {
      timestamp,
      ...localParts(timestamp, spot.timezone),
      seaLevelMm: roundSymmetric(value * 1000),
    }
  })
  if (new Set(samples.map((sample) => sample.localDate)).size !== 5) {
    fail('series does not cover exactly five local dates')
  }

  return {
    schemaVersion: TIDE_SCHEMA_VERSION,
    spotId: spot.id,
    timezone: spot.timezone,
    provider: 'OPEN-METEO MARINE',
    retrievedAt,
    capability: 'available',
    samples,
  }
}

export function isNormalizedTide(value) {
  if (!value || value.schemaVersion !== TIDE_SCHEMA_VERSION || typeof value.spotId !== 'string' ||
      !value.spotId || typeof value.timezone !== 'string' || !value.timezone ||
      value.provider !== 'OPEN-METEO MARINE' || !Number.isFinite(value.retrievedAt) ||
      value.retrievedAt <= 0 || !['available', 'unsupported'].includes(value.capability) ||
      !Array.isArray(value.samples)) return false
  if (value.capability === 'unsupported') return value.samples.length === 0
  if (value.samples.length < MIN_TIDE_SAMPLES || value.samples.length > MAX_TIDE_SAMPLES) return false
  const dates = new Set()
  return value.samples.every((sample, index) => {
    if (!sample || !Number.isInteger(sample.timestamp) || sample.timestamp <= 0 ||
        (index > 0 && sample.timestamp - value.samples[index - 1].timestamp !== 3600) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(sample.localDate) ||
        !/^\d{2}:00$/.test(sample.localTime) || !Number.isInteger(sample.seaLevelMm)) return false
    dates.add(sample.localDate)
    return true
  }) && dates.size === 5
}

export { MAX_TIDE_SAMPLES, MIN_TIDE_SAMPLES, TIDE_SCHEMA_VERSION }
