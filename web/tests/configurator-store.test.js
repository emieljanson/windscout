import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfiguratorStore } from '../src/stores/configurator'

describe('configurator store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts with the current display defaults', () => {
    const store = useConfiguratorStore()
    expect(store.treatment).toBe('background-fade')
    expect(store.threshold).toBe(17)
  })

  it('accepts every supported treatment and valid threshold boundary', () => {
    const store = useConfiguratorStore()
    expect(store.setTreatment('threshold-line')).toBe(true)
    expect(store.setTreatment('solid')).toBe(true)
    expect(store.setThreshold(5)).toBe(true)
    expect(store.setThreshold(35)).toBe(true)
    expect(store.threshold).toBe(35)
  })

  it('preserves the last valid configuration after invalid input', () => {
    const store = useConfiguratorStore()
    store.setTreatment('solid')
    store.setThreshold(17)
    expect(store.setTreatment('rainbow')).toBe(false)
    expect(store.setThreshold(36)).toBe(false)
    expect(store.setThreshold('unknown')).toBe(false)
    expect(store.treatment).toBe('solid')
    expect(store.threshold).toBe(17)
  })
})

