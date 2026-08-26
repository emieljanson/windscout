import * as THREE from 'three'
import { brouwersdamForecast } from '../fixtures/brouwersdam'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, renderForecastPreview } from '../renderer/previewRenderer'

export function createScreenTexture(config) {
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH
  canvas.height = PREVIEW_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The forecast preview canvas is unavailable')
  renderForecastPreview(context, brouwersdamForecast, config)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.flipY = false

  return {
    canvas,
    texture,
    update(nextConfig) {
      renderForecastPreview(context, brouwersdamForecast, nextConfig)
      texture.needsUpdate = true
    },
    dispose() {
      texture.dispose()
    },
  }
}

