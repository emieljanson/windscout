export const HERO_CAMERA = Object.freeze({
  position: Object.freeze([0.19, 0.095, 0.29]),
  target: Object.freeze([0, 0, 0]),
})

export const NARROW_CAMERA = Object.freeze({
  position: Object.freeze([0.1, 0.07, 0.66]),
  target: Object.freeze([0, 0, 0]),
})

export const ORBIT_LIMITS = Object.freeze({
  minAzimuth: -0.68,
  maxAzimuth: 0.68,
  minPolar: 0.94,
  maxPolar: 1.72,
  minDistance: 0.29,
  maxDistance: 0.75,
})

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
