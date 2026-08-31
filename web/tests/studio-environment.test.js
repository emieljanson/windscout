import { describe, expect, it } from 'vitest'
import { createProductStudioScene } from '../src/configurator/studioEnvironment'

describe('product studio environment', () => {
  it('uses bright reflection cards and a dark flag to describe white materials', () => {
    const studio = createProductStudioScene()

    expect(studio.getObjectByName('STUDIO_KEY_SOFTBOX')).toBeDefined()
    expect(studio.getObjectByName('STUDIO_TOP_SOFTBOX')).toBeDefined()
    expect(studio.getObjectByName('STUDIO_RIM_STRIP')).toBeDefined()
    expect(studio.getObjectByName('STUDIO_DARK_FLAG')).toBeDefined()

    const darkFlag = studio.getObjectByName('STUDIO_DARK_FLAG')
    const key = studio.getObjectByName('STUDIO_KEY_SOFTBOX')
    expect(darkFlag.material.color.getHex()).toBeLessThan(key.material.color.getHex())
  })
})
