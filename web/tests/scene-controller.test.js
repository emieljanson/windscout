import { describe, expect, it, vi } from 'vitest'
import {
  HERO_CAMERA,
  NARROW_CAMERA,
  ORBIT_LIMITS,
  applyHeroPose,
  calculateSceneComposition,
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

  it('centres the product in the free space above the floating settings panel', () => {
    const composition = calculateSceneComposition({
      width: 390,
      height: 844,
      settingsTop: 412,
    })

    expect(composition.availableHeight).toBe(400)
    expect(composition.viewOffsetX).toBe(0)
    expect(composition.viewOffsetY).toBe(222)
    expect(844 / 2 - composition.viewOffsetY).toBe(200)
    expect(composition.zoom).toBeCloseTo(0.72, 2)
  })

  it('zooms out only when the remaining mobile preview becomes too short', () => {
    const composition = calculateSceneComposition({
      width: 390,
      height: 667,
      settingsTop: 250,
    })

    expect(composition.availableHeight).toBe(238)
    expect(composition.zoom).toBeLessThanOrEqual(0.73)
    expect(composition.zoom).toBeGreaterThanOrEqual(0.55)
  })

  it('keeps the desktop composition offset toward the free space beside the panel', () => {
    expect(calculateSceneComposition({ width: 1280, height: 800, settingsTop: 16 }))
      .toEqual({
        availableHeight: 800,
        viewOffsetX: 166,
        viewOffsetY: 0,
        zoom: 1,
      })
  })

  it('uses the available width instead of unnecessarily shrinking a compact tablet', () => {
    const composition = calculateSceneComposition({
      width: 768,
      height: 900,
      settingsTop: 462,
    })

    expect(composition.zoom).toBe(1)
    expect(composition.viewOffsetY).toBeGreaterThan(0)
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
