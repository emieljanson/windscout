const TIDE_SCHEMA_VERSION = 2
const MIN_TIDE_SAMPLES = 119
const MAX_TIDE_SAMPLES = 121
const MAX_TIDE_EXTREMA = 32

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

function normalizedSamples(times, values, timezone, intervalSeconds, label) {
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
    fail(`${label} arrays are missing or misaligned`)
  }
  if (values.some((value) => value === null)) fail(`${label} sea-level values are partially unavailable`)

  return times.map((timestamp, index) => {
    if (!Number.isInteger(timestamp) || timestamp <= 0 ||
        (index > 0 && timestamp - times[index - 1] !== intervalSeconds)) {
      fail(`${label} times are not an ascending ${intervalSeconds / 60}-minute series`)
    }
    const value = values[index]
    if (!Number.isFinite(value) || value < -2147483.648 || value > 2147483.647) {
      fail(`invalid ${label} sea-level value at index ${index}`)
    }
    return {
      timestamp,
      ...localParts(timestamp, timezone),
      seaLevelMm: roundSymmetric(value * 1000),
    }
  })
}

function optionalQuarterSamples(response, timezone) {
  const units = response.minutely_15_units
  const series = response.minutely_15
  if (!units || !series || units.time !== 'unixtime' || units.sea_level_height_msl !== 'm') return null
  const times = series.time
  const values = series.sea_level_height_msl
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length ||
      times.length < 473 || times.length > 485 || values.some((value) => value === null)) return null
  try {
    const samples = normalizedSamples(times, values, timezone, 900, 'quarter-hour')
    return new Set(samples.map((sample) => sample.localDate)).size === 5 ? samples : null
  } catch {
    return null
  }
}

function extremaFromSamples(samples) {
  if (samples.length < 3) return []
  const levels = samples.map((sample) => sample.seaLevelMm)
  const threshold = Math.max(10, Math.min(500, Math.round((Math.max(...levels) - Math.min(...levels)) / 10)))
  const extrema = []
  let direction = 0
  let highCandidate = 0
  let lowCandidate = 0

  const add = (index, type) => {
    if (index <= 0 || index >= samples.length - 1 || extrema.length >= MAX_TIDE_EXTREMA) return
    extrema.push({ ...samples[index], type })
  }

  for (let index = 1; index < samples.length; index += 1) {
    const value = levels[index]
    if (direction >= 0 && value >= levels[highCandidate]) highCandidate = index
    if (direction <= 0 && value <= levels[lowCandidate]) lowCandidate = index

    if (direction === 0) {
      if (value - levels[lowCandidate] >= threshold) {
        add(lowCandidate, 'low')
        direction = 1
        highCandidate = index
      } else if (levels[highCandidate] - value >= threshold) {
        add(highCandidate, 'high')
        direction = -1
        lowCandidate = index
      }
    } else if (direction > 0 && levels[highCandidate] - value >= threshold) {
      add(highCandidate, 'high')
      direction = -1
      lowCandidate = index
    } else if (direction < 0 && value - levels[lowCandidate] >= threshold) {
      add(lowCandidate, 'low')
      direction = 1
      highCandidate = index
    }
  }

  return extrema
}

function unsupportedTide(spot, retrievedAt) {
  return {
    schemaVersion: TIDE_SCHEMA_VERSION,
    spotId: spot.id,
    timezone: spot.timezone,
    provider: 'OPEN-METEO MARINE',
    retrievedAt,
    capability: 'unsupported',
    samples: [],
    extrema: [],
  }
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
    return unsupportedTide(spot, retrievedAt)
  }
  const samples = normalizedSamples(times, values, spot.timezone, 3600, 'hourly')
  if (new Set(samples.map((sample) => sample.localDate)).size !== 5) {
    fail('series does not cover exactly five local dates')
  }

  const extrema = extremaFromSamples(optionalQuarterSamples(response, spot.timezone) ?? samples)
  if (extrema.length === 0) return unsupportedTide(spot, retrievedAt)
  return {
    schemaVersion: TIDE_SCHEMA_VERSION,
    spotId: spot.id,
    timezone: spot.timezone,
    provider: 'OPEN-METEO MARINE',
    retrievedAt,
    capability: 'available',
    samples,
    extrema,
  }
}

export function isNormalizedTide(value) {
  if (!value || value.schemaVersion !== TIDE_SCHEMA_VERSION || typeof value.spotId !== 'string' ||
      !value.spotId || typeof value.timezone !== 'string' || !value.timezone ||
      value.provider !== 'OPEN-METEO MARINE' || !Number.isFinite(value.retrievedAt) ||
      value.retrievedAt <= 0 || !['available', 'unsupported'].includes(value.capability) ||
      !Array.isArray(value.samples) || !Array.isArray(value.extrema)) return false
  if (value.capability === 'unsupported') return value.samples.length === 0 && value.extrema.length === 0
  if (value.samples.length < MIN_TIDE_SAMPLES || value.samples.length > MAX_TIDE_SAMPLES) return false
  const dates = new Set()
  const samplesValid = value.samples.every((sample, index) => {
    if (!sample || !Number.isInteger(sample.timestamp) || sample.timestamp <= 0 ||
        (index > 0 && sample.timestamp - value.samples[index - 1].timestamp !== 3600) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(sample.localDate) ||
        !/^\d{2}:00$/.test(sample.localTime) || !Number.isInteger(sample.seaLevelMm)) return false
    dates.add(sample.localDate)
    return true
  }) && dates.size === 5
  if (!samplesValid || value.extrema.length === 0 || value.extrema.length > MAX_TIDE_EXTREMA) return false
  return value.extrema.every((extremum, index) =>
    extremum && Number.isInteger(extremum.timestamp) && extremum.timestamp > 0 &&
    (index === 0 || extremum.timestamp > value.extrema[index - 1].timestamp) &&
    dates.has(extremum.localDate) && /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(extremum.localTime) &&
    Number.isInteger(extremum.seaLevelMm) && ['high', 'low'].includes(extremum.type))
}

export { MAX_TIDE_EXTREMA, MAX_TIDE_SAMPLES, MIN_TIDE_SAMPLES, TIDE_SCHEMA_VERSION }
