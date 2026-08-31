import { describe, expect, it, vi } from 'vitest'
import { AMBIENT_OCCLUSION, configureAmbientOcclusion } from '../src/configurator/ambientOcclusion'

describe('ambient occlusion treatment', () => {
  it('keeps the effect local and restrained', () => {
    const pass = {
      updateGtaoMaterial: vi.fn(),
      updatePdMaterial: vi.fn(),
      blendIntensity: 1,
    }

    configureAmbientOcclusion(pass)

    expect(AMBIENT_OCCLUSION.radius).toBeLessThan(0.04)
    expect(pass.blendIntensity).toBeLessThan(0.7)
    expect(pass.updateGtaoMaterial).toHaveBeenCalledWith(expect.objectContaining({ radius: AMBIENT_OCCLUSION.radius }))
    expect(pass.updatePdMaterial).toHaveBeenCalled()
  })
})
