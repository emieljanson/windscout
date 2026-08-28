import * as THREE from 'three'
import { brouwersdamForecast } from '../fixtures/brouwersdam'
import {
  RENDERER_HEIGHT,
  RENDERER_RGBA_BYTES,
  RENDERER_WIDTH,
  loadSharedRenderer,
} from '../renderer/sharedRenderer'
import { DISPLAY_MODES, RENDERER_CONTRACT_VERSION } from '../renderer/contract'

function rendererSample(sample) {
  return {
    time: sample.time,
    sustainedKt: sample.sustainedKt,
    gustKt: sample.gustKt,
    destinationDegrees: sample.destinationDegrees,
    available: sample.available,
    weather: sample.weather,
    temperatureTenthsC: sample.temperatureTenthsC ?? 0,
    temperatureAvailable: sample.temperatureAvailable ?? false,
  }
}

function rendererTideSamples(tide, days) {
  if (tide?.capability !== 'available') return []
  const dayIndexes = new Map(days.map((day, index) => [day.localDate, index]))
  return tide.samples.flatMap((sample) => {
    const dayIndex = dayIndexes.get(sample.localDate)
    if (dayIndex === undefined) return []
    return [{
      dayIndex,
      localHour: Number(sample.localTime.slice(0, 2)),
      seaLevelMm: sample.seaLevelMm,
      available: true,
    }]
  })
}

function formatUpdatedTime(forecast, timeFormat) {
  if (!Number.isFinite(forecast.retrievedAt) || !forecast.timezone) return forecast.updatedTime
  const twelveHour = timeFormat === '12-hour'
  const parts = new Intl.DateTimeFormat(twelveHour ? 'en-US' : 'en-GB', {
    timeZone: forecast.timezone,
    day: '2-digit',
    month: 'short',
    hour: twelveHour ? 'numeric' : '2-digit',
    minute: '2-digit',
    hourCycle: twelveHour ? 'h12' : 'h23',
  }).formatToParts(new Date(forecast.retrievedAt))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const date = `${values.day} ${values.month.toUpperCase()}`
  return twelveHour
    ? `${date} ${values.hour}${values.dayPeriod.toUpperCase()}`
    : `${date} ${values.hour}:${values.minute}`
}

export function createRendererInput(forecast, config) {
  const displayMode = config.showThreshold
    ? DISPLAY_MODES['threshold-line']
    : DISPLAY_MODES.solid

  const tide = config.tide ?? forecast.tide
  const tideSamples = rendererTideSamples(tide, forecast.days)
  return {
    version: RENDERER_CONTRACT_VERSION,
    spotName: forecast.spotName,
    coordinates: forecast.coordinates,
    provider: forecast.model ?? forecast.provider ?? 'OPEN-METEO',
    updatedTime: formatUpdatedTime(forecast, config.timeFormat),
    state: forecast.state ?? 0,
    refreshFailed: forecast.refreshFailed ?? false,
    ageHours: forecast.ageHours ?? 0,
    batteryPercent: forecast.batteryPercent ?? 70,
    displayMode,
    thresholdKt: config.threshold,
    showWeather: config.showWeather ?? true,
    showTemperature: config.showTemperature ?? false,
    showTide: config.showTide ?? false,
    use24Hour: config.timeFormat !== '12-hour',
    temperatureFahrenheit: config.temperatureUnit === 'fahrenheit',
    tideAvailable: tide?.capability === 'available' && tideSamples.length >= 2,
    tideSamples,
    days: forecast.days.map((day) => ({
      day: day.day,
      date: day.date,
      samples: day.samples.map(rendererSample),
    })),
  }
}

export async function createScreenTexture({
  forecast = brouwersdamForecast,
  config,
  rendererLoader = loadSharedRenderer,
} = {}) {
  const renderer = await rendererLoader()
  let texture
  let currentForecast = forecast
  let currentConfig = config
  let disposed = false

  function renderFrame(nextForecast, nextConfig) {
    const input = createRendererInput(nextForecast, nextConfig)
    const rgba = renderer.renderPreview(input)
    if (!(rgba instanceof Uint8Array) || rgba.byteLength !== RENDERER_RGBA_BYTES) {
      throw new Error('The canonical renderer must return one complete 800 × 480 RGBA preview')
    }

    if (!texture) {
      texture = new THREE.DataTexture(
        rgba,
        RENDERER_WIDTH,
        RENDERER_HEIGHT,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      )
      texture.colorSpace = THREE.SRGBColorSpace
      texture.magFilter = THREE.LinearFilter
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.generateMipmaps = true
      texture.flipY = true
    } else {
      texture.image.data = rgba
    }
    texture.needsUpdate = true
  }

  try {
    renderFrame(currentForecast, currentConfig)
  } catch (error) {
    renderer.dispose()
    throw error
  }

  return {
    texture,
    update({ forecast: nextForecast = currentForecast, config: nextConfig = currentConfig } = {}) {
      if (disposed) throw new Error('The screen texture has been disposed')
      renderFrame(nextForecast, nextConfig)
      currentForecast = nextForecast
      currentConfig = nextConfig
    },
    dispose() {
      if (disposed) return
      disposed = true
      texture.dispose()
      renderer.dispose()
    },
  }
}
