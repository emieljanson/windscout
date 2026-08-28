import { describe, expect, it, vi } from 'vitest'
import { createResourceLifetime } from '../src/configurator/sceneLifetime'

describe('3D scene resource lifetime', () => {
  it('disposes a model that finishes loading after the scene unmounts', async () => {
    const lifetime = createResourceLifetime()
    const dispose = vi.fn()
    const model = { name: 'late E1002' }
    const loading = Promise.resolve().then(() => lifetime.adopt(model, dispose))

    lifetime.cancel()

    await expect(loading).resolves.toBe(false)
    expect(dispose).toHaveBeenCalledWith(model)
    expect(lifetime.active).toBe(false)
  })
})
