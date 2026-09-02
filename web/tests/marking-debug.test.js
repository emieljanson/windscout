import { describe, expect, it } from 'vitest'
import { markingGroupForSourceMesh } from '../src/configurator/markingDebug'

describe('marking debug controls', () => {
  it('splits a previously loaded SIDE_PORTS model into independently movable controls', () => {
    expect(markingGroupForSourceMesh(246, 'SIDE_PORTS')).toBe('MICRO_SD')
    expect(markingGroupForSourceMesh(252, 'SIDE_PORTS')).toBe('POWER_SWITCH')
    expect(markingGroupForSourceMesh(259, 'SIDE_PORTS')).toBe('USB_C')
    expect(markingGroupForSourceMesh(264, 'SIDE_PORTS')).toBe('STATUS_CIRCLE')
    expect(markingGroupForSourceMesh(265, 'SIDE_PORTS')).toBe('LIGHTNING_BOLT')
  })

  it('keeps current model groups and unknown markings intact', () => {
    expect(markingGroupForSourceMesh(244, 'TOP_CONTROLS')).toBe('TOP_CONTROLS')
    expect(markingGroupForSourceMesh(999, 'CUSTOM')).toBe('CUSTOM')
  })
})
