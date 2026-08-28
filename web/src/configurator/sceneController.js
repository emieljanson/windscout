export const HERO_CAMERA = Object.freeze({
  position: Object.freeze([-0.18, 0.09, 0.42]),
  target: Object.freeze([0, 0, 0]),
})

export const NARROW_CAMERA = Object.freeze({
  position: Object.freeze([-0.075, 0.045, 0.67]),
  target: Object.freeze([0, 0, 0]),
})

export const ORBIT_LIMITS = Object.freeze({
  // Reveal the enclosure depth and side controls while keeping the active
  // display comfortably readable throughout the inspection range.
  minAzimuth: -0.9,
  maxAzimuth: 0.9,
  minPolar: 0.72,
  // Keep the camera above the surface so the product always retains a visible
  // ground plane instead of being viewed from underneath against empty space.
  maxPolar: 1.43,
  minDistance: 0.29,
  maxDistance: 0.75,
})

const COMPACT_LAYOUT_MAX_WIDTH = 56 * 16
const COMPACT_STAGE_GAP = 12
const PRODUCT_HEIGHT_RATIO = 0.44
const COMPACT_PRODUCT_FIT_WIDTH = 540
const MIN_COMPOSITION_ZOOM = 0.55

export function calculateSceneComposition({ width, height, settingsTop }) {
  if (width > COMPACT_LAYOUT_MAX_WIDTH) {
    return {
      availableHeight: height,
      viewOffsetX: Math.round(width * 0.13),
      viewOffsetY: 0,
      zoom: 1,
    }
  }

  const measuredTop = Number.isFinite(settingsTop) ? settingsTop : height
  const availableHeight = Math.max(0, Math.round(Math.min(measuredTop, height) - COMPACT_STAGE_GAP))
  const viewOffsetY = Math.max(0, Math.round((height - availableHeight) / 2))
  const comfortableProductHeight = Math.max(height * PRODUCT_HEIGHT_RATIO, 1)
  const widthZoom = Math.min(1, width / COMPACT_PRODUCT_FIT_WIDTH)
  const zoom = Math.max(
    MIN_COMPOSITION_ZOOM,
    Math.min(widthZoom, availableHeight / comfortableProductHeight),
  )

  return {
    availableHeight,
    viewOffsetX: 0,
    viewOffsetY,
    zoom,
  }
}

export function applyHeroPose(camera, controls, aspect = 1.5) {
  const pose = aspect < 0.9 ? NARROW_CAMERA : HERO_CAMERA
  camera.position.set(...pose.position)
  controls.target.set(...pose.target)
  controls.update()
}

export function configureOrbitControls(controls) {
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.rotateSpeed = 0.58
  controls.zoomSpeed = 0.7
  controls.minAzimuthAngle = ORBIT_LIMITS.minAzimuth
  controls.maxAzimuthAngle = ORBIT_LIMITS.maxAzimuth
  controls.minPolarAngle = ORBIT_LIMITS.minPolar
  controls.maxPolarAngle = ORBIT_LIMITS.maxPolar
  controls.minDistance = ORBIT_LIMITS.minDistance
  controls.maxDistance = ORBIT_LIMITS.maxDistance
}

export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}
