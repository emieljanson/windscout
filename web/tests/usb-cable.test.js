import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  USB_CABLE_COLOR,
  USB_CABLE_DURATION_MS,
  USB_CABLE_FADE_IN_MS,
  cableCurveForPoints,
  cablePoseAt,
  createUsbCable,
  createUsbCableAnimation,
  easeUsbCableProgress,
} from '../src/configurator/usbCable'

describe('USB-C cable', () => {
  it('uses the same green as the physical wake button', () => {
    expect(USB_CABLE_COLOR).toBe(0x86c942)
  })

  it('approaches from off-screen right and enters the real side USB-C socket', () => {
    const start = cablePoseAt(0)
    const finish = cablePoseAt(1)

    expect(start.connector.x).toBeGreaterThan(0.23)
    expect(Math.abs(start.connector.y - finish.connector.y)).toBeLessThan(0.005)
    expect(finish.connector.x).toBeCloseTo(0.05603, 4)
    expect(finish.connector.y).toBeCloseTo(-0.0071, 4)
    expect(finish.connector.z).toBeCloseTo(-0.00535, 4)
    expect(finish.connector.x - 0.01233).toBeCloseTo(0.0437, 4)
    expect(finish.tangent.x).toBeLessThan(-0.99)
    expect(Math.abs(finish.tangent.z)).toBeLessThan(0.015)
    expect(finish.cablePoints.at(-1).distanceTo(finish.connector)).toBeCloseTo(0.00616, 4)
  })

  it('keeps the loose cable on the floor to the right of the connector', () => {
    const halfway = cablePoseAt(0.6)

    expect(halfway.cablePoints[0].x).toBeGreaterThan(halfway.cablePoints[1].x)
    expect(halfway.cablePoints[1].x).toBeGreaterThan(halfway.connector.x)
    expect(halfway.cablePoints[0].y).toBeCloseTo(-0.0578)
    expect(halfway.cablePoints[1].y).toBeCloseTo(-0.0578)
    expect(halfway.cablePoints[2].y).toBeCloseTo(-0.0578)
    expect(halfway.cablePoints[3].y).toBeCloseTo(-0.0578)
    const floorDepths = halfway.cablePoints.slice(0, 4).map((point) => point.z)
    expect(Math.max(...floorDepths) - Math.min(...floorDepths)).toBeCloseTo(0)
  })

  it('keeps the long floor section calm while only the connector-side bend reshapes', () => {
    const early = cablePoseAt(0.35)
    const late = cablePoseAt(0.65)
    const finish = cablePoseAt(1)

    for (const pointIndex of [0, 1, 2]) {
      expect(early.cablePoints[pointIndex]).toEqual(late.cablePoints[pointIndex])
      expect(late.cablePoints[pointIndex]).toEqual(finish.cablePoints[pointIndex])
    }
    expect(early.cablePoints[3].x).not.toBe(late.cablePoints[3].x)
    expect(finish.cablePoints[3].x - finish.connector.x).toBeGreaterThan(0.1)
    expect(finish.cablePoints[4].distanceTo(finish.connector)).toBeCloseTo(0.036, 3)
    expect(finish.cablePoints[5].distanceTo(finish.connector)).toBeCloseTo(0.00616, 4)
    expect(finish.cablePoints[4].z).toBeCloseTo(early.cablePoints[0].z, 3)
  })

  it('starts bending immediately while leaving the connector tangent-flat', () => {
    const finish = cablePoseAt(1)
    const bend = cableCurveForPoints(finish.cablePoints).curves.at(-1)
    const nearConnector = bend.getPoint(0.95)
    const cableJoin = bend.getPoint(1)

    expect(bend).not.toBeInstanceOf(THREE.LineCurve3)
    expect(nearConnector.y).toBeLessThan(cableJoin.y)
    expect(bend.getTangent(1).angleTo(finish.tangent)).toBeLessThan(0.01)
  })

  it('starts moving immediately with a strong ease-out and fixed endpoints', () => {
    expect(USB_CABLE_DURATION_MS).toBe(1550)
    expect(USB_CABLE_FADE_IN_MS).toBe(1000)
    expect(easeUsbCableProgress(0)).toBe(0)
    expect(easeUsbCableProgress(0.05)).toBeGreaterThan(0.05)
    expect(easeUsbCableProgress(0.25)).toBeGreaterThan(0.5)
    expect(easeUsbCableProgress(0.5)).toBeGreaterThan(0.8)
    expect(easeUsbCableProgress(1)).toBe(1)
  })

  it('keeps the connector on the socket depth while approaching from the right', () => {
    const start = cablePoseAt(0)
    const approach = cablePoseAt(0.3)
    const finish = cablePoseAt(1)

    expect(approach.connector.z).toBeCloseTo(start.connector.z)
    expect(finish.connector.z).toBeCloseTo(start.connector.z)
    expect(start.connector.x).toBeGreaterThan(approach.connector.x)
    expect(approach.connector.x).toBeGreaterThan(finish.connector.x)
  })

  it('keeps every bend continuously rounded throughout the motion', () => {
    for (const progress of [0.5, 0.75, 1]) {
      const curve = cableCurveForPoints(cablePoseAt(progress).cablePoints)
      let previousTangent = curve.getTangentAt(0)
      let maximumDirectionChange = 0
      let maximumDirectionChangeAt = 0
      // The final millimetres terminate invisibly inside the strain relief;
      // review the entire visible curve while excluding that hidden cap.
      for (let step = 1; step < 336; step += 1) {
        const tangent = curve.getTangentAt(step / 336)
        const directionChange = previousTangent.angleTo(tangent)
        if (directionChange > maximumDirectionChange) {
          maximumDirectionChange = directionChange
          maximumDirectionChangeAt = step / 336
        }
        previousTangent = tangent
      }
      expect(
        maximumDirectionChange * 180 / Math.PI,
        `progress ${progress}, curve position ${maximumDirectionChangeAt}`,
      ).toBeLessThan(20)
    }
  })

  it('creates a disposable cable with a textured sheath and separate connector materials', () => {
    const cable = createUsbCable()
    const meshes = []
    cable.object.traverse((child) => { if (child.isMesh) meshes.push(child) })
    const sheath = cable.object.getObjectByName('USB_CABLE_SHEATH')
    const contactShadow = cable.object.getObjectByName('USB_CABLE_CONTACT_SHADOW')
    const floorReflection = cable.object.getObjectByName('USB_CABLE_FLOOR_REFLECTION')
    const housing = cable.object.getObjectByName('USB_C_CONNECTOR_HOUSING')
    const tip = cable.object.getObjectByName('USB_C_CONNECTOR_TIP')
    const initialGeometry = sheath.geometry
    const initialGeometryDispose = vi.spyOn(initialGeometry, 'dispose')
    const braidMaterial = meshes.find((mesh) => mesh.material.name === 'usb-cable-braid').material

    expect(cable.object.name).toBe('USB_CABLE')
    expect(sheath).toBeTruthy()
    expect(cable.object.getObjectByName('USB_CABLE_TAIL_EXTENSION')).toBeUndefined()
    expect(floorReflection).toBeUndefined()
    sheath.geometry.computeBoundingBox()
    expect(sheath.geometry.boundingBox.max.x).toBeGreaterThan(1.19)
    expect(contactShadow.material.opacity).toBeCloseTo(0.085)
    expect(contactShadow.material.alphaMap).toBeTruthy()
    expect(braidMaterial.map.image.data[1]).toBeGreaterThan(130)
    expect(braidMaterial.map.image.data[1]).toBeGreaterThan(braidMaterial.map.image.data[0])
    expect(braidMaterial.normalMap).toBeTruthy()
    expect(braidMaterial.roughnessMap).toBeTruthy()
    expect(braidMaterial.roughnessMap.format).toBe(THREE.RGBAFormat)
    expect(braidMaterial.roughnessMap.image.data[1]).toBeGreaterThan(230)
    expect(braidMaterial.transparent).toBe(true)
    expect(braidMaterial.alphaMap).toBeTruthy()
    expect(braidMaterial.alphaMap.image.data[1]).toBe(0)
    expect(braidMaterial.alphaMap.image.data.at(-3)).toBe(255)
    expect(braidMaterial.alphaMap.wrapS).toBe(THREE.ClampToEdgeWrapping)
    expect(braidMaterial.map.repeat.y).toBe(1)
    expect(braidMaterial.normalScale.x).toBeLessThan(0.5)
    expect(braidMaterial.roughness).toBeGreaterThan(0.9)
    expect(braidMaterial.clearcoat).toBe(0)
    expect(braidMaterial.anisotropy).toBe(0)
    cable.setOpacity(0.5)
    expect(braidMaterial.opacity).toBeCloseTo(0.5)
    expect(housing.material.opacity).toBeCloseTo(0.5)
    expect(contactShadow.material.opacity).toBeCloseTo(0.0425)
    cable.setOpacity(1)
    expect(meshes.filter((mesh) => mesh.castShadow).map((mesh) => mesh.name)).toEqual([])
    expect(meshes.some((mesh) => mesh.material.name === 'usb-cable-metal')).toBe(true)
    expect(sheath.geometry.parameters.radius).toBeCloseTo(0.00144, 4)

    housing.geometry.computeBoundingBox()
    const housingBounds = housing.geometry.boundingBox
    expect(housingBounds.max.x - housingBounds.min.x).toBeCloseTo(0.0091, 4)
    expect(housingBounds.max.y - housingBounds.min.y).toBeCloseTo(0.0043, 4)
    expect(housingBounds.max.z - housingBounds.min.z).toBeCloseTo(0.0129, 4)

    tip.geometry.computeBoundingBox()
    const { min, max } = tip.geometry.boundingBox
    expect(max.x - min.x).toBeCloseTo(0.0082, 4)
    expect(max.y - min.y).toBeCloseTo(0.0024, 4)
    expect(max.z - min.z).toBeCloseTo(0.0066, 4)

    cable.setProgress(0.997)
    const penultimateGeometry = sheath.geometry
    cable.setProgress(0.999)
    expect(sheath.geometry).not.toBe(penultimateGeometry)

    cable.setProgress(1)
    expect(sheath.geometry).not.toBe(initialGeometry)
    expect(initialGeometryDispose).toHaveBeenCalledOnce()
    expect(cable.object.getObjectByName('USB_C_CONNECTOR').position.toArray())
      .toEqual(cablePoseAt(1).connector.toArray())

    const geometries = new Set()
    const materials = new Set()
    cable.object.traverse((child) => {
      if (child.geometry) geometries.add(child.geometry)
      if (child.material) materials.add(child.material)
    })
    const textures = new Set([...materials].flatMap((material) => [
      material.map,
      material.alphaMap,
      material.normalMap,
      material.roughnessMap,
    ]).filter(Boolean))
    const disposeSpies = [...geometries, ...materials, ...textures]
      .map((resource) => vi.spyOn(resource, 'dispose'))
    cable.dispose()
    disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce())
  })

  it('coordinates insertion, retraction, interruption, and reduced motion', () => {
    const cable = { object: { visible: false }, setOpacity: vi.fn(), setProgress: vi.fn() }
    const requestRender = vi.fn()
    let prefersReducedMotion = false
    const animation = createUsbCableAnimation({
      cable,
      requestRender,
      reducedMotion: () => prefersReducedMotion,
    })

    animation.setVisible(true, 100)
    expect(cable.object.visible).toBe(true)
    expect(cable.setOpacity).toHaveBeenLastCalledWith(0)
    expect(cable.setProgress).toHaveBeenLastCalledWith(0)
    const insertionCalls = cable.setProgress.mock.calls.length
    animation.setVisible(true, 150)
    expect(cable.setProgress).toHaveBeenCalledTimes(insertionCalls)
    expect(requestRender).toHaveBeenCalledOnce()
    expect(animation.update(180)).toBe(true)
    expect(cable.setOpacity.mock.lastCall[0]).toBeGreaterThan(0)
    expect(cable.setOpacity.mock.lastCall[0]).toBeLessThan(1)
    expect(animation.update(1100)).toBe(true)
    expect(cable.setOpacity).toHaveBeenLastCalledWith(1)
    expect(animation.update(100 + USB_CABLE_DURATION_MS)).toBe(false)
    expect(cable.setProgress).toHaveBeenLastCalledWith(1)

    animation.setVisible(false, 100 + USB_CABLE_DURATION_MS)
    expect(cable.object.visible).toBe(true)
    expect(animation.update(200 + USB_CABLE_DURATION_MS)).toBe(true)
    const retractingProgress = cable.setProgress.mock.lastCall[0]
    expect(retractingProgress).toBeGreaterThan(0)
    expect(retractingProgress).toBeLessThan(1)

    animation.setVisible(true, 200 + USB_CABLE_DURATION_MS)
    expect(cable.setProgress).toHaveBeenLastCalledWith(retractingProgress)
    expect(animation.update(300 + USB_CABLE_DURATION_MS)).toBe(true)
    const reinsertingProgress = cable.setProgress.mock.lastCall[0]
    expect(reinsertingProgress).toBeGreaterThan(retractingProgress)

    animation.setVisible(false, 300 + USB_CABLE_DURATION_MS)
    const remainingRetraction = Math.max(
      reinsertingProgress * USB_CABLE_DURATION_MS,
      cable.setOpacity.mock.lastCall[0] * USB_CABLE_FADE_IN_MS,
    )
    expect(animation.update(300 + USB_CABLE_DURATION_MS + remainingRetraction - 1)).toBe(true)
    const hiddenAt = 300 + USB_CABLE_DURATION_MS + remainingRetraction
    expect(animation.update(hiddenAt)).toBe(false)
    expect(cable.setOpacity).toHaveBeenLastCalledWith(0)
    expect(cable.setProgress).toHaveBeenLastCalledWith(0)
    expect(cable.object.visible).toBe(false)
    const hiddenCalls = cable.setProgress.mock.calls.length
    animation.setVisible(false, hiddenAt + 50)
    expect(cable.setProgress).toHaveBeenCalledTimes(hiddenCalls)

    animation.setVisible(true, hiddenAt + 100)
    prefersReducedMotion = true
    requestRender.mockClear()
    animation.finishForReducedMotion()
    expect(cable.setOpacity).toHaveBeenLastCalledWith(1)
    expect(cable.setProgress).toHaveBeenLastCalledWith(1)
    expect(requestRender).toHaveBeenCalledOnce()
    expect(animation.update(hiddenAt + 150)).toBe(false)

    requestRender.mockClear()
    animation.setVisible(false, hiddenAt + 200)
    expect(cable.object.visible).toBe(false)
    expect(cable.setOpacity).toHaveBeenLastCalledWith(0)
    expect(cable.setProgress).toHaveBeenLastCalledWith(0)
    expect(requestRender).toHaveBeenCalledOnce()
  })
})
