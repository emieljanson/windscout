import { describe, expect, it, vi } from 'vitest'
import { E1002_MODEL } from '../src/assets/e1002'
import { findMissingModelRoles, hideE1002Stand, loadE1002Model } from '../src/configurator/modelLoader'

function modelWithRoles(roles) {
  return {
    getObjectByName(name) {
      return roles.includes(name) ? { name } : undefined
    },
  }
}

describe('E1002 model loader contract', () => {
  it('accepts a scene with all independently addressable roles', () => {
    expect(findMissingModelRoles(modelWithRoles(E1002_MODEL.requiredRoles))).toEqual([])
  })

  it('reports every missing role before the scene becomes interactive', () => {
    expect(findMissingModelRoles(modelWithRoles(['BODY', 'SCREEN']))).toEqual(['CONTROLS', 'PORTS', 'STAND'])
  })

  it('hides the printed stand while retaining it for model cleanup', () => {
    const stand = { visible: true }
    const model = { getObjectByName: vi.fn(() => stand) }

    expect(hideE1002Stand(model)).toBe(true)
    expect(stand.visible).toBe(false)
  })

  it('aborts a model request that never settles', async () => {
    vi.useFakeTimers()
    const request = loadE1002Model({
      loaderFactory: () => ({ loadAsync: () => new Promise(() => {}) }),
      timeoutMs: 25,
    })
    const expectation = expect(request).rejects.toThrow('took too long')
    await vi.advanceTimersByTimeAsync(25)
    await expectation
    vi.useRealTimers()
  })
})
