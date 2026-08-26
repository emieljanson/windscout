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
  }
}

export function createRendererInput(forecast, config) {
  const displayMode = DISPLAY_MODES[config.treatment]
  if (displayMode === undefined) throw new Error(`Unknown display treatment: ${config.treatment}`)

  return {
    version: RENDERER_CONTRACT_VERSION,
    spotName: forecast.spotName,
    coordinates: forecast.coordinates,
    provider: forecast.model ?? forecast.provider ?? 'OPEN-METEO',
    updatedTime: forecast.updatedTime,
    state: forecast.state ?? 0,
    refreshFailed: forecast.refreshFailed ?? false,
    ageHours: forecast.ageHours ?? 0,
    batteryPercent: forecast.batteryPercent ?? -1,
    displayMode,
    thresholdKt: config.threshold,
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
