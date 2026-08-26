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
    expect(camera.values[0]).toBeLessThan(0)
    expect(Math.abs(camera.values[0])).toBeLessThan(0.2)
    expect(camera.values[1]).toBeLessThan(0.1)
    expect(controls.values).toEqual(HERO_CAMERA.target)
    expect(controls.updated).toBe(true)
  })

  it('fits the same 3D product into a narrow stage', () => {
    const camera = { position: { set: (...values) => { camera.values = values } } }
    const controls = { target: { set: vi.fn() }, update: vi.fn() }
    applyHeroPose(camera, controls, 0.7)
    expect(camera.values).toEqual(NARROW_CAMERA.position)
    expect(camera.values[0]).toBeLessThan(0)
    expect(camera.values[1]).toBeLessThan(0.05)
  })

  it('reveals the sides and top without letting the camera move behind the display', () => {
    expect(ORBIT_LIMITS.maxAzimuth).toBeGreaterThan((Math.PI * 50) / 180)
    expect(ORBIT_LIMITS.maxAzimuth).toBeLessThan((Math.PI * 60) / 180)
    expect(ORBIT_LIMITS.minPolar).toBeLessThan((Math.PI * 45) / 180)
    expect(ORBIT_LIMITS.minPolar).toBeGreaterThan((Math.PI * 35) / 180)
    expect(ORBIT_LIMITS.maxAzimuth - ORBIT_LIMITS.minAzimuth).toBeLessThan(Math.PI)
    expect(ORBIT_LIMITS.maxPolar).toBeLessThan(Math.PI / 2)
    expect(ORBIT_LIMITS.minDistance).toBeGreaterThan(0)
    expect(ORBIT_LIMITS.maxDistance).toBeLessThan(1)
  })
})
