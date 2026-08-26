import { describe, expect, it } from 'vitest'
import { PRODUCT_LIGHTING } from '../src/configurator/productLighting'
import { createProductStudioScene } from '../src/configurator/studioEnvironment'

describe('product lighting', () => {
  it('pairs a broad daylight key with a narrow moving reflection strip', () => {
    expect(PRODUCT_LIGHTING.softbox.width).toBeGreaterThan(PRODUCT_LIGHTING.accent.width * 3)
    expect(PRODUCT_LIGHTING.softbox.position[0]).toBeGreaterThan(0)
    // A key on the right casts the enclosure shadow to the left.
    expect(PRODUCT_LIGHTING.key.position[0]).toBeGreaterThan(0)
    expect(PRODUCT_LIGHTING.environment.rimWidth).toBeLessThan(0.25)

    const studio = createProductStudioScene(PRODUCT_LIGHTING.environment)
    expect(studio.getObjectByName('STUDIO_RIM_STRIP').geometry.parameters.width).toBeCloseTo(0.18)
  })
})
