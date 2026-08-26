import { describe, expect, it } from 'vitest'
import {
  HERO_CAMERA,
  ORBIT_LIMITS,
  applyHeroPose,
  shouldUse2DMode,
} from '../src/configurator/sceneController'

describe('scene controller', () => {
  it('selects the 2D composition for narrow, reduced-motion, or unsupported contexts', () => {
    expect(shouldUse2DMode({ width: 959, reducedMotion: false, webglAvailable: true })).toBe(true)
    expect(shouldUse2DMode({ width: 1200, reducedMotion: true, webglAvailable: true })).toBe(true)
    expect(shouldUse2DMode({ width: 1200, reducedMotion: false, webglAvailable: false })).toBe(true)
    expect(shouldUse2DMode({ width: 1200, reducedMotion: false, webglAvailable: true })).toBe(false)
  })

  it('restores the designed camera and orbit target', () => {
    const camera = { position: { set: (...values) => { camera.values = values } } }
    const controls = { target: { set: (...values) => { controls.values = values } }, update: () => { controls.updated = true } }
    applyHeroPose(camera, controls)
    expect(camera.values).toEqual(HERO_CAMERA.position)
    expect(controls.values).toEqual(HERO_CAMERA.target)
    expect(controls.updated).toBe(true)
  })

  it('keeps orbit and zoom inside a modest product-inspection range', () => {
    expect(ORBIT_LIMITS.maxAzimuth - ORBIT_LIMITS.minAzimuth).toBeLessThan(Math.PI)
    expect(ORBIT_LIMITS.minDistance).toBeGreaterThan(0)
    expect(ORBIT_LIMITS.maxDistance).toBeLessThan(1)
  })
})

