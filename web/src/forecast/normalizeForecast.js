const REQUIRED_HOURS = Object.freeze([8, 11, 14, 17, 20])
const CORE_FIELDS = Object.freeze([
  'time',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
])
const DAY_NAMES = Object.freeze([
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
])
const MONTH_NAMES = Object.freeze([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
])

function fail(message) {
  throw new Error(`Invalid Open-Meteo forecast: ${message}`)
}

function dateParts(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) fail(`invalid local date ${date}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const value = new Date(Date.UTC(year, month - 1, day))
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    fail(`invalid local date ${date}`)
  }
  return { year, month, day, value }
}

function addDays(date, amount) {
  const { value } = dateParts(date)
  value.setUTCDate(value.getUTCDate() + amount)
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function localDateAt(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function updatedTimeAt(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    hour12: true,
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.day} ${values.month.toUpperCase()} ${values.hour}${values.dayPeriod.toUpperCase()}`
}

function dms(value, positive, negative) {
  const absolute = Math.abs(value)
  let degrees = Math.trunc(absolute)
  const minutesFull = (absolute - degrees) * 60
  let minutes = Math.trunc(minutesFull)
  let seconds = Math.floor((minutesFull - minutes) * 60 + 0.5)
  if (seconds === 60) {
    seconds = 0
    minutes += 1
  }
  if (minutes === 60) {
    minutes = 0
    degrees += 1
  }
  return `${degrees}\u00b0${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"${value >= 0 ? positive : negative}`
}

function weatherState(cloudCover, precipitation, isDay) {
  if (![cloudCover, precipitation, isDay].every(Number.isFinite) ||
      cloudCover < 0 || cloudCover > 100 || precipitation < 0 || precipitation > 655.35 ||
      (isDay !== 0 && isDay !== 1)) return 0
  const precipitationHundredths = Math.round(precipitation * 100)
  if (precipitationHundredths >= 250) return 8
  if (precipitationHundredths >= 100) return 7
  if (precipitationHundredths >= 10) return 6
  if (cloudCover <= 20) return isDay ? 1 : 2
  if (cloudCover <= 60) return isDay ? 3 : 4
  return 5
}

function validateCoreResponse(response) {
  if (!response || typeof response !== 'object') fail('response is missing')
  if (response.timezone !== 'Europe/Amsterdam') fail('timezone must be Europe/Amsterdam')
  const units = response.hourly_units
  if (!units || units.wind_speed_10m !== 'kn' || units.wind_gusts_10m !== 'kn' ||
      units.wind_direction_10m !== '\u00b0') fail('wind units do not match the renderer contract')
  const hourly = response.hourly
  if (!hourly || typeof hourly !== 'object') fail('hourly data is missing')
  const count = Array.isArray(hourly.time) ? hourly.time.length : 0
  if (!count || CORE_FIELDS.some((field) => !Array.isArray(hourly[field]) || hourly[field].length !== count)) {
    fail('core hourly arrays are missing or misaligned')
  }
  return { hourly, units, count }
}

export function normalizeForecast(response, spot, {
  retrievedAt = Date.now(),
  firstDate = localDateAt(retrievedAt, spot?.timezone ?? 'Europe/Amsterdam'),
} = {}) {
  if (!spot || !spot.id || !Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) {
    fail('spot is invalid')
  }
  if (!Number.isFinite(retrievedAt) || retrievedAt <= 0) fail('retrieval time is invalid')
  dateParts(firstDate)
  const { hourly, units, count } = validateCoreResponse(response)

  const weatherAvailable = ['cloud_cover', 'precipitation', 'is_day']
    .every((field) => Array.isArray(hourly[field]) && hourly[field].length === count) &&
    units.cloud_cover === '%' && units.precipitation === 'mm'
  const sampleByLocalTime = new Map()
  let previousTime = ''

  for (let index = 0; index < count; index += 1) {
    const localTime = hourly.time[index]
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00$/.exec(localTime)
    if (!match || (previousTime && previousTime >= localTime)) fail('hourly times are invalid or not ascending')
    previousTime = localTime
    const [wind, gust, sourceDirection] = [
      hourly.wind_speed_10m[index], hourly.wind_gusts_10m[index], hourly.wind_direction_10m[index],
    ]
    if (![wind, gust, sourceDirection].every(Number.isFinite) || wind < 0 || gust < 0 ||
        wind > 32767 || gust > 32767) fail(`invalid wind value at ${localTime}`)
    const hour = Number(match[2])
    if (!REQUIRED_HOURS.includes(hour) || match[1] < firstDate) continue
    sampleByLocalTime.set(localTime, {
      time: match[2],
      sustainedKt: Math.round(wind),
      gustKt: Math.round(gust),
      destinationDegrees: Math.round(((sourceDirection + 180) % 360 + 360) % 360) % 360,
      available: true,
      weather: weatherAvailable
        ? weatherState(hourly.cloud_cover[index], hourly.precipitation[index], hourly.is_day[index])
        : 0,
    })
  }

  const days = Array.from({ length: 5 }, (_, dayIndex) => {
    const localDate = addDays(firstDate, dayIndex)
    const { value, month, day } = dateParts(localDate)
    const samples = REQUIRED_HOURS.map((hour) => sampleByLocalTime.get(
      `${localDate}T${String(hour).padStart(2, '0')}:00`,
    ))
    if (samples.some((sample) => !sample)) fail(`target hours are incomplete for ${localDate}`)
    return {
      localDate,
      day: dayIndex === 0 ? 'TODAY' : DAY_NAMES[value.getUTCDay()],
      date: `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]}`,
      samples,
    }
  })

  return {
    schemaVersion: 1,
    spotId: spot.id,
    spotName: spot.displayName,
    coordinates: `${dms(spot.latitude, 'N', 'S')} ${dms(spot.longitude, 'E', 'W')}`,
    timezone: spot.timezone,
    provider: 'OPEN-METEO',
    model: 'KNMI SEAMLESS',
    updatedTime: updatedTimeAt(retrievedAt, spot.timezone),
    retrievedAt,
    days,
  }
}

export function isNormalizedForecast(value) {
  if (!value || value.schemaVersion !== 1 || typeof value.spotId !== 'string' || !value.spotId ||
      typeof value.spotName !== 'string' || !value.spotName || typeof value.coordinates !== 'string' ||
      value.timezone !== 'Europe/Amsterdam' || value.provider !== 'OPEN-METEO' ||
      value.model !== 'KNMI SEAMLESS' || typeof value.updatedTime !== 'string' ||
      !Number.isFinite(value.retrievedAt) || value.retrievedAt <= 0 ||
      !Array.isArray(value.days) || value.days.length !== 5) return false

  return value.days.every((day, dayIndex) => {
    if (!day || typeof day.localDate !== 'string' || typeof day.day !== 'string' ||
        typeof day.date !== 'string' || !Array.isArray(day.samples) || day.samples.length !== 5) return false
    try {
      if (dayIndex > 0 && day.localDate !== addDays(value.days[dayIndex - 1].localDate, 1)) return false
    } catch {
      return false
    }
    return day.samples.every((sample, sampleIndex) => sample &&
      sample.time === String(REQUIRED_HOURS[sampleIndex]).padStart(2, '0') &&
      Number.isInteger(sample.sustainedKt) && sample.sustainedKt >= 0 &&
      Number.isInteger(sample.gustKt) && sample.gustKt >= 0 &&
      Number.isInteger(sample.destinationDegrees) && sample.destinationDegrees >= 0 && sample.destinationDegrees < 360 &&
      sample.available === true && Number.isInteger(sample.weather) && sample.weather >= 0 && sample.weather <= 8)
  })
}

export { REQUIRED_HOURS }
