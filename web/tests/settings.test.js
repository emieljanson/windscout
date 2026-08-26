import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, nextTick } from 'vue'

const dialValues = ref({ treatment: 'background-fade', windThreshold: 17 })
const controllerCalls = []

vi.mock('dialkit/vue', () => ({
  DialRoot: { template: '<div></div>' },
  useDialKitController: (...args) => {
    controllerCalls.push(args)
    return { values: dialValues, setValue: vi.fn() }
  },
}))

import WindScoutSettings from '../src/components/WindScoutSettings.vue'
import { useConfiguratorStore } from '../src/stores/configurator'

describe('WindScout settings adapter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    dialValues.value = { treatment: 'background-fade', windThreshold: 17 }
    controllerCalls.length = 0
  })

  it('translates DialKit display values into the canonical store', async () => {
    mount(WindScoutSettings)
    const store = useConfiguratorStore()
    dialValues.value = { treatment: 'threshold-line', windThreshold: 23 }
    await nextTick()
    expect(store.treatment).toBe('threshold-line')
    expect(store.threshold).toBe(23)
  })

  it('leaves persistence disabled so Pinia remains the only configuration owner', () => {
    mount(WindScoutSettings)
    expect(controllerCalls[0][2]).toEqual({ id: 'windscout-display' })
  })
})
