import { describe, expect, it, vi } from 'vitest'
import {
  HERO_CAMERA,
  NARROW_CAMERA,
  ORBIT_LIMITS,
  applyHeroPose,
} from '../src/configurator/sceneController'

describe('scene controller', () => {
  it('restores the designed camera and orbit target', () => {
    const camera = { position: { set: (...values) => { camera.values = values } } }
    const controls = { target: { set: (...values) => { controls.values = values } }, update: () => { controls.updated = true } }
    applyHeroPose(camera, controls)
    expect(camera.values).toEqual(HERO_CAMERA.position)
    expect(controls.values).toEqual(HERO_CAMERA.target)
    expect(controls.updated).toBe(true)
  })

  it('fits the same 3D product into a narrow stage', () => {
    const camera = { position: { set: (...values) => { camera.values = values } } }
    const controls = { target: { set: vi.fn() }, update: vi.fn() }
    applyHeroPose(camera, controls, 0.7)
    expect(camera.values).toEqual(NARROW_CAMERA.position)
  })

  it('keeps orbit and zoom inside a modest product-inspection range', () => {
    expect(ORBIT_LIMITS.maxAzimuth - ORBIT_LIMITS.minAzimuth).toBeLessThan(Math.PI)
    expect(ORBIT_LIMITS.minDistance).toBeGreaterThan(0)
    expect(ORBIT_LIMITS.maxDistance).toBeLessThan(1)
  })
})
