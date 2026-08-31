import { describe, expect, it } from 'vitest'
import { PRODUCT_LIGHTING } from '../src/configurator/productLighting'
import { createProductStudioScene } from '../src/configurator/studioEnvironment'

describe('product lighting', () => {
  it('pairs a broad daylight key with a narrow moving reflection strip', () => {
    expect(PRODUCT_LIGHTING.softbox.width).toBeGreaterThan(PRODUCT_LIGHTING.accent.width * 3)
    expect(PRODUCT_LIGHTING.softbox.position[0]).toBeGreaterThan(0)
    // A fixed, off-axis key keeps the shadow grounded on one side instead of
    // making the entire studio rig chase the viewer.
    expect(PRODUCT_LIGHTING.key.position[0]).toBeLessThan(0)
    expect(Math.abs(PRODUCT_LIGHTING.key.position[0])).toBeGreaterThan(0.06)
    expect(PRODUCT_LIGHTING.environment.rimWidth).toBeLessThan(0.25)

    const studio = createProductStudioScene(PRODUCT_LIGHTING.environment)
    expect(studio.getObjectByName('STUDIO_RIM_STRIP').geometry.parameters.width).toBeCloseTo(0.18)
  })

  it('uses a soft, fixed spotlight for the physical floor shadow', () => {
    expect(PRODUCT_LIGHTING.key.kind).toBe('spot')
    expect(PRODUCT_LIGHTING.key.penumbra).toBeGreaterThan(0.8)
    expect(PRODUCT_LIGHTING.key.angle).toBeLessThan(0.9)
  })
})
