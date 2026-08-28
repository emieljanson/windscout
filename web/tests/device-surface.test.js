import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  addSurfaceProjectionUvs,
  createFrontPanelReflection,
  createEpaperBacking,
  createEpaperMaterial,
  createPowderCoatNormalMap,
  createPowderCoatRoughnessMap,
  createMatteScreenFinish,
  createScreenRecessShadow,
  enhanceE1002Surface,
  fitScreenUnderBezel,
  SCREEN_BEZEL_OVERSCAN,
} from '../src/configurator/deviceSurface'

describe('E1002 product surfaces', () => {
  it('builds a tileable, linear-space powder-coat normal map', () => {
    const texture = createPowderCoatNormalMap(16)

    expect(texture.image.width).toBe(16)
    expect(texture.image.height).toBe(16)
    expect(texture.image.data).toHaveLength(16 * 16 * 4)
    expect(texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    expect(texture.colorSpace).toBe(THREE.NoColorSpace)
    texture.dispose()
  })

  it('adds fine matte variation to the powder-coat highlights', () => {
    const texture = createPowderCoatRoughnessMap(16)

    expect(texture.name).toBe('powder-coat-micro-roughness')
    expect(texture.image.data).toHaveLength(16 * 16 * 4)
    expect(texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    texture.dispose()
  })

  it('adds surface-scale UVs to CAD geometry without replacing existing UVs', () => {
    const geometry = new THREE.BoxGeometry(0.176, 0.12, 0.017)
    geometry.deleteAttribute('uv')
    addSurfaceProjectionUvs(geometry)
    const firstUv = geometry.attributes.uv

    expect(firstUv).toBeDefined()
    expect(firstUv.count).toBe(geometry.attributes.position.count)

    addSurfaceProjectionUvs(geometry)
    expect(geometry.attributes.uv).toBe(firstUv)
    geometry.dispose()
  })

  it('applies micro-relief only to the powder-coated enclosure', () => {
    const model = new THREE.Group()
    const enclosureMaterial = new THREE.MeshPhysicalMaterial({ name: 'enclosure-white-powder-coat' })
    const panelMaterial = new THREE.MeshPhysicalMaterial({ name: 'front-satin-plastic' })
    const enclosure = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), enclosureMaterial)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), panelMaterial)
    model.add(enclosure, panel)

    const dispose = enhanceE1002Surface(model, { capabilities: { getMaxAnisotropy: () => 8 } })

    expect(enclosureMaterial.normalMap?.name).toBe('powder-coat-micro-normal')
    expect(enclosureMaterial.normalScale.x).toBeCloseTo(0.62)
    expect(enclosureMaterial.roughnessMap?.name).toBe('powder-coat-micro-roughness')
    expect(enclosureMaterial.roughness).toBeCloseTo(0.62)
    expect(panelMaterial.normalMap).toBeNull()
    expect(panelMaterial.roughness).toBeCloseTo(0.025)
    expect(panelMaterial.ior).toBeCloseTo(1.55)
    expect(panelMaterial.specularIntensity).toBeCloseTo(1)
    expect(panelMaterial.clearcoat).toBeCloseTo(1)
    expect(panelMaterial.clearcoatRoughness).toBeCloseTo(0.012)
    expect(panelMaterial.envMapIntensity).toBeCloseTo(2.25)
    expect(panelMaterial.color.getHex()).toBe(0xe0e2de)
    expect(panel.getObjectByName('FRONT_PANEL_REFLECTION')).toBeDefined()

    dispose()
    enclosure.geometry.dispose()
    panel.geometry.dispose()
    enclosureMaterial.dispose()
    panelMaterial.dispose()
  })

  it('renders the live forecast as reflective e-paper instead of an emissive screen', () => {
    const texture = new THREE.Texture()
    const material = createEpaperMaterial(texture)

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(material.map).toBe(texture)
    expect(material.color.getHex()).toBe(0xc2c6bf)
    expect(material.emissive.getHex()).toBe(0x000000)
    expect(material.roughness).toBeGreaterThan(0.8)
    expect(material.toneMapped).toBe(true)

    material.dispose()
    texture.dispose()
  })

  it('gives the matte screen a view-dependent softbox reflection', () => {
    const root = new THREE.Group()
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.159, 0.0954), new THREE.MeshBasicMaterial())
    root.add(screen)

    const finish = createMatteScreenFinish(screen)

    expect(finish.material.uniforms.softboxDirection.value).toBeInstanceOf(THREE.Vector3)
    expect(finish.material.uniforms.softboxStrength.value).toBeGreaterThanOrEqual(0.2)
    expect(finish.material.uniforms.softboxHalfWidth.value).toBeLessThan(0.12)
    expect(finish.material.uniforms.softboxHalfHeight.value)
      .toBeGreaterThan(finish.material.uniforms.softboxHalfWidth.value * 2)
    expect(finish.material.uniforms.softboxHalfWidth.value).toBeCloseTo(0.055)
    expect(finish.material.uniforms.softboxHalfHeight.value).toBeCloseTo(0.15)
    expect(finish.material.uniforms.softboxDirection.value.y).toBeLessThan(0)
    expect(finish.material.uniforms.softboxDirection.value.x).toBeGreaterThan(0)
    expect(finish.material.uniforms.secondarySoftboxDirection.value.x).toBeLessThan(0)
    expect(finish.material.uniforms.secondarySoftboxDirection.value.y).toBeLessThan(0)
    expect(finish.material.uniforms.secondarySoftboxStrength.value).toBeGreaterThan(0.1)
    expect(finish.material.fragmentShader).toContain('uniform vec3 softboxDirection;')
    expect(finish.material.fragmentShader).toContain('uniform vec3 secondarySoftboxDirection;')
    expect(finish.material.fragmentShader).toContain('uniform float softboxStrength;')
    root.traverse((child) => {
      child.geometry?.dispose?.()
      child.material?.dispose?.()
    })
  })

  it('fits the complete e-paper stack underneath the rounded bezel', () => {
    const root = new THREE.Group()
    const texture = new THREE.Texture()
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.159, 0.0954),
      new THREE.MeshBasicMaterial({ map: texture }),
    )
    screen.position.set(0, 0.066, 0.00278)
    root.add(screen)

    fitScreenUnderBezel(screen)
    const backing = createEpaperBacking(screen)
    const size = backing.geometry.parameters

    expect(screen.scale.x).toBeCloseTo(SCREEN_BEZEL_OVERSCAN)
    expect(screen.scale.y).toBeCloseTo(SCREEN_BEZEL_OVERSCAN)
    expect(size.width * backing.scale.x).toBeCloseTo(0.159 * SCREEN_BEZEL_OVERSCAN)
    expect(size.height * backing.scale.y).toBeCloseTo(0.0954 * SCREEN_BEZEL_OVERSCAN)
    expect(backing.position.y).toBeCloseTo(screen.position.y)
    expect(backing.position.z).toBeLessThan(screen.position.z)
    expect(backing.scale.equals(screen.scale)).toBe(true)
    expect(backing.material.map).toBe(texture)

    root.traverse((child) => {
      child.geometry?.dispose?.()
      child.material?.dispose?.()
    })
    texture.dispose()
  })

  it('clips the leading UI equally beneath every visible bezel edge', () => {
    const horizontalClip = (0.159 * SCREEN_BEZEL_OVERSCAN - 0.1602) / 2
    const verticalClip = (0.0954 * SCREEN_BEZEL_OVERSCAN - 0.0949) / 2

    expect(horizontalClip).toBeGreaterThan(0)
    expect(horizontalClip).toBeCloseTo(verticalClip, 7)
    expect(horizontalClip).toBeCloseTo(0.001525, 6)
  })

  it('adds a hard, view-dependent white softbox to the glossy front panel', () => {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.1),
      new THREE.MeshPhysicalMaterial({ name: 'front-satin-plastic' }),
    )
    const reflection = createFrontPanelReflection(panel)

    expect(reflection.name).toBe('FRONT_PANEL_REFLECTION')
    expect(reflection.material.transparent).toBe(true)
    expect(reflection.material.toneMapped).toBe(false)
    expect(reflection.material.uniforms.softboxStrength.value).toBeGreaterThan(0.45)
    expect(reflection.material.uniforms.softboxDirection.value.x).toBeGreaterThan(0)
    expect(reflection.material.uniforms.secondarySoftboxDirection.value.x).toBeLessThan(0)
    expect(reflection.material.uniforms.secondarySoftboxDirection.value.y).toBeLessThan(0)
    expect(reflection.material.uniforms.secondarySoftboxStrength.value).toBeGreaterThan(0.25)
    expect(reflection.material.fragmentShader).toContain('softbox * softboxStrength')
    expect(reflection.material.fragmentShader)
      .toContain('secondarySoftbox * secondarySoftboxStrength')
    reflection.material.dispose()
    panel.geometry.dispose()
    panel.material.dispose()
  })

  it('keeps both softbox reflections aligned across the screen and front panel', () => {
    const root = new THREE.Group()
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.159, 0.0954),
      new THREE.MeshBasicMaterial(),
    )
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.1),
      new THREE.MeshPhysicalMaterial({ name: 'front-satin-plastic' }),
    )
    root.add(screen, panel)

    const finish = createMatteScreenFinish(screen)
    const reflection = createFrontPanelReflection(panel)
    const screenUniforms = finish.material.uniforms
    const panelUniforms = reflection.material.uniforms

    expect(panelUniforms.softboxDirection.value)
      .toEqual(screenUniforms.softboxDirection.value)
    expect(panelUniforms.softboxHalfWidth.value)
      .toBe(screenUniforms.softboxHalfWidth.value)
    expect(panelUniforms.softboxHalfHeight.value)
      .toBe(screenUniforms.softboxHalfHeight.value)
    expect(panelUniforms.softboxFeather.value)
      .toBeLessThan(screenUniforms.softboxFeather.value)
    expect(panelUniforms.secondarySoftboxDirection.value)
      .toEqual(screenUniforms.secondarySoftboxDirection.value)
    expect(panelUniforms.secondarySoftboxHalfWidth.value)
      .toBe(screenUniforms.secondarySoftboxHalfWidth.value)
    expect(panelUniforms.secondarySoftboxHalfHeight.value)
      .toBe(screenUniforms.secondarySoftboxHalfHeight.value)
    expect(panelUniforms.secondarySoftboxFeather.value)
      .toBeLessThan(screenUniforms.secondarySoftboxFeather.value)

    root.traverse((child) => {
      child.geometry?.dispose?.()
      child.material?.dispose?.()
    })
  })

  it('adds a soft recess shadow without adding a physical grey rim', () => {
    const root = new THREE.Group()
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.159, 0.0954), new THREE.MeshBasicMaterial())
    root.add(screen)

    const shadow = createScreenRecessShadow(screen)

    expect(shadow.name).toBe('SCREEN_RECESS_SHADOW')
    expect(shadow.material.name).toBe('screen-recess-shadow')
    expect(root.getObjectByName('SCREEN_GASKET')).toBeUndefined()
    root.traverse((child) => {
      child.geometry?.dispose?.()
      child.material?.dispose?.()
    })
  })
})
