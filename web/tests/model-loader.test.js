import { describe, expect, it } from 'vitest'
import { E1002_MODEL } from '../src/assets/e1002'
import { findMissingModelRoles } from '../src/configurator/modelLoader'

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
})
