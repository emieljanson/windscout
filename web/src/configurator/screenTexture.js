import * as THREE from 'three'
import { brouwersdamForecast } from '../fixtures/brouwersdam'
import {
  RENDERER_CONTRACT_VERSION,
  RENDERER_HEIGHT,
  RENDERER_PALETTE_BYTES,
  RENDERER_WIDTH,
  loadSharedRenderer,
} from '../renderer/sharedRenderer'

export const PALETTE_BLACK = 0
export const PALETTE_WHITE = 1
export const PALETTE_RED = 3

const SAMPLE_TIMES = Object.freeze(['08', '11', '14', '17', '20'])
const DISPLAY_MODES = Object.freeze({
  'background-fade': 0,
  'threshold-line': 1,
  solid: 2,
})

function rendererSample(sample, sampleIndex) {
  return {
    time: sample.time ?? SAMPLE_TIMES[sampleIndex],
    sustainedKt: sample.sustainedKt ?? sample[0],
    gustKt: sample.gustKt ?? sample[1],
    destinationDegrees: sample.destinationDegrees ?? sample[2],
    available: sample.available ?? true,
    weather: sample.weather ?? 1,
  }
}

export function createRendererInput(forecast, config) {
  const displayMode = DISPLAY_MODES[config.treatment]
  if (displayMode === undefined) throw new Error(`Unknown display treatment: ${config.treatment}`)

  return {
    version: RENDERER_CONTRACT_VERSION,
    spotName: forecast.spotName ?? forecast.spot,
    coordinates: forecast.coordinates,
    provider: forecast.provider ?? 'OPEN-METEO',
    updatedTime: forecast.updatedTime ?? forecast.updated,
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

export function paletteToRgba(palette, target = new Uint8Array(RENDERER_PALETTE_BYTES * 4)) {
  if (!(palette instanceof Uint8Array) || palette.byteLength !== RENDERER_PALETTE_BYTES) {
    throw new Error('The canonical renderer must return one complete 800 × 480 palette frame')
  }
  if (!(target instanceof Uint8Array) || target.byteLength !== RENDERER_PALETTE_BYTES * 4) {
    throw new Error('The screen texture target must fit one complete RGBA frame')
  }

  for (let pixel = 0; pixel < palette.length; pixel += 1) {
    const paletteValue = palette[pixel]
    const offset = pixel * 4
    if (paletteValue === PALETTE_BLACK) {
      target[offset] = 0
      target[offset + 1] = 0
      target[offset + 2] = 0
    } else if (paletteValue === PALETTE_WHITE) {
      target[offset] = 255
      target[offset + 1] = 255
      target[offset + 2] = 255
    } else if (paletteValue === PALETTE_RED) {
      target[offset] = 255
      target[offset + 1] = 0
      target[offset + 2] = 0
    } else {
      throw new Error(`The canonical renderer returned unsupported palette value ${paletteValue}`)
    }
    target[offset + 3] = 255
  }
  return target
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
  let stagingRgba
  let disposed = false

  function renderFrame(nextForecast, nextConfig) {
    const input = createRendererInput(nextForecast, nextConfig)
    const rgba = paletteToRgba(renderer.render(input), stagingRgba)

    if (!texture) {
      texture = new THREE.DataTexture(
        rgba,
        RENDERER_WIDTH,
        RENDERER_HEIGHT,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      )
      texture.colorSpace = THREE.SRGBColorSpace
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.LinearFilter
      texture.generateMipmaps = false
      texture.flipY = true
      stagingRgba = new Uint8Array(RENDERER_PALETTE_BYTES * 4)
    } else {
      const previousFrame = texture.image.data
      texture.image.data = rgba
      stagingRgba = previousFrame
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
