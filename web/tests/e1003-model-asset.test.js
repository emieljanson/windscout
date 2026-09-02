import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { E1003_MODEL } from '../src/assets/e1003'

let generatedScene

beforeAll(async () => {
  const source = await readFile(resolve(process.cwd(), 'public/devices/e1003/e1003.glb'))
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
  const generatedModel = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject))
  generatedScene = generatedModel.scene
})

function meshesIn(scene) {
  return scene.getObjectsByProperty('isMesh', true)
}

describe('E1003 physical model contract', () => {
  it('records the documented enclosure and native 4:3 screen', () => {
    expect(E1003_MODEL.enclosureMm).toEqual({ width: 224, height: 187, depth: 18.6, standDepth: 54.5 })
    expect(E1003_MODEL.screenMm).toEqual({ width: 209.664, height: 157.248 })
    expect(E1003_MODEL.screenAspect).toBe(4 / 3)
  })

  it('contains the visible controls, ports, front stack, stand, and fasteners from the official STEP assembly', async () => {
    const meshes = meshesIn(generatedScene)
    const sourceMeshes = new Set(meshes.map((mesh) => mesh.userData.sourceMesh))

    expect([...sourceMeshes]).toEqual(expect.arrayContaining([
      0, 25,       // enclosure
      32, 33,      // rear cover and three-button top assembly
      14, 17, 83,  // power switch, expansion header, microSD
      106, 107,    // USB-C shell and socket
      35, 36, 37, 38,
      39, 41, 42,  // touch glass, front trim, lower cover
    ]))
    expect(sourceMeshes.has(34)).toBe(false)
  })

  it('gives each outward-facing material its own physical finish', async () => {
    const materials = new Map(meshesIn(generatedScene).map((mesh) => [mesh.material.name, mesh.material]))

    expect(materials.get('enclosure-white-powder-coat')?.metalness).toBe(0)
    expect(materials.get('front-touch-glass')?.transmission).toBeGreaterThan(0)
    expect(materials.get('front-satin-trim')?.roughness).toBeLessThan(0.1)
    expect(materials.get('front-satin-trim')?.clearcoat).toBeGreaterThan(0.9)
    expect(materials.get('wake-button-green')?.color.getHex()).not.toBe(0xffffff)
    expect(materials.get('navigation-button-white')).toBeDefined()
    expect(materials.get('usb-c-brushed-steel')?.metalness).toBeGreaterThanOrEqual(0.9)
    expect(materials.get('rear-fastener-brushed-steel')?.metalness).toBeGreaterThanOrEqual(0.9)
    expect(materials.get('power-switch-dark')).toBeDefined()
    expect(materials.get('rear-service-cover')).toBeDefined()
    expect(materials.get('control-surround-white')).toBeDefined()
    expect(materials.get('keyhole-recess-white')?.color.getHex()).toBeGreaterThan(0xc0c0c0)
    expect(materials.get('keyhole-recess-shadow')).toBeDefined()
    expect(materials.get('mounting-thread-gunmetal')?.metalness).toBeGreaterThan(0.8)
  })

  it('keeps the live preview plane behind the physical front trim', async () => {
    const screen = generatedScene.getObjectByName('SCREEN')
    const frontTrims = meshesIn(generatedScene).filter((mesh) => mesh.userData.materialRole === 'FRONT_TRIM')
    const frontTrim = frontTrims[0]

    expect(screen).toBeDefined()
    expect(frontTrim).toBeDefined()
    expect(frontTrims).toHaveLength(1)
    expect(screen.position.z).toBeLessThan(frontTrim.geometry.boundingBox.max.z)
    const screenSize = new Box3().setFromObject(screen).getSize(new Vector3())
    expect(screenSize.x / screenSize.y).toBeCloseTo(E1003_MODEL.screenAspect, 5)
  })

  it('floats rear markings just above the enclosure to prevent white z-fighting', async () => {
    const markings = meshesIn(generatedScene).filter((mesh) => mesh.userData.role === 'MARKINGS')

    expect(markings.length).toBeGreaterThan(20)
    expect(markings.every((mesh) => mesh.position.z < 0)).toBe(true)
  })

  it('uses the broad, flush E1002-style button caps without exposed dark bases', () => {
    const wakeButton = generatedScene.getObjectByName('WAKE_BUTTON_CAP')
    const navigationButtons = [
      generatedScene.getObjectByName('NAVIGATION_BUTTON_CAP_1'),
      generatedScene.getObjectByName('NAVIGATION_BUTTON_CAP_2'),
    ]

    const wakeSize = new Box3().setFromObject(wakeButton).getSize(new Vector3())
    expect(wakeSize.x).toBeCloseTo(0.01, 4)
    expect(navigationButtons.every(Boolean)).toBe(true)
    expect(generatedScene.getObjectByName('WAKE_BUTTON_BASE')).toBeUndefined()
  })

  it('separates the white keyhole recess from the four threaded mounting holes', () => {
    expect(generatedScene.getObjectByName('REAR_KEYHOLE_RECESS')).toBeDefined()
    expect(generatedScene.getObjectByName('REAR_KEYHOLE_SHADOW')).toBeDefined()
    expect(meshesIn(generatedScene).filter((mesh) => mesh.userData.materialRole === 'THREADED_INSERT')).toHaveLength(4)
    expect(meshesIn(generatedScene).filter((mesh) => mesh.userData.materialRole === 'THREAD_HIGHLIGHT')).toHaveLength(12)
  })

  it('centres every threaded insert in the visible mounting opening', () => {
    const inserts = meshesIn(generatedScene)
      .filter((mesh) => mesh.userData.materialRole === 'THREADED_INSERT')
    const centres = inserts.map((mesh) => {
      const centre = new Box3().setFromObject(mesh).getCenter(new Vector3())
      return [Number(centre.x.toFixed(4)), Number(centre.y.toFixed(4))]
    })

    expect(centres).toEqual([
      [0.0375, -0.0368],
      [-0.0375, 0.0382],
      [0.0375, 0.0382],
      [-0.0375, -0.0368],
    ])
    expect(inserts.map((mesh) => mesh.userData.sourceMesh)).toEqual([27, 28, 29, 30])
    expect(inserts.every((mesh) => mesh.userData.centerSource === 'STEP bounding-box centre')).toBe(true)
  })

  it('gives the microphone perforations dark internal depth', () => {
    const microphoneDepth = generatedScene.getObjectByName('TOP_MICROPHONE_DEPTH')

    expect(microphoneDepth).toBeDefined()
    expect(microphoneDepth.material.name).toBe('enclosure-cavity-depth')
  })
})
