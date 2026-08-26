export const HERO_CAMERA = Object.freeze({
  position: Object.freeze([0.235, 0.115, 0.34]),
  target: Object.freeze([0, 0, 0]),
})

export const ORBIT_LIMITS = Object.freeze({
  minAzimuth: -0.68,
  maxAzimuth: 0.68,
  minPolar: 0.94,
  maxPolar: 1.72,
  minDistance: 0.29,
  maxDistance: 0.58,
})

export function shouldUse2DMode({ width, reducedMotion, webglAvailable }) {
  return width < 960 || reducedMotion || !webglAvailable
}

export function applyHeroPose(camera, controls) {
  camera.position.set(...HERO_CAMERA.position)
  controls.target.set(...HERO_CAMERA.target)
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

