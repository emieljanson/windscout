import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, nextTick } from 'vue'

const dialValues = ref({
  spot: 'brouwersdam', model: 'best_match', treatment: 'background-fade', windThreshold: 17,
})
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
    dialValues.value = {
      spot: 'brouwersdam', model: 'best_match', treatment: 'background-fade', windThreshold: 17,
    }
    controllerCalls.length = 0
  })

  it('translates DialKit display values into the canonical store', async () => {
    mount(WindScoutSettings)
    const store = useConfiguratorStore()
    dialValues.value = {
      spot: 'brouwersdam', model: 'best_match', treatment: 'threshold-line', windThreshold: 23,
    }
    await nextTick()
    expect(store.treatment).toBe('threshold-line')
    expect(store.threshold).toBe(23)
  })

  it('leaves persistence disabled so Pinia remains the only configuration owner', () => {
    mount(WindScoutSettings)
    expect(controllerCalls[0][2]).toEqual({ id: 'windscout-display' })
  })

  it('offers all firmware spots and refreshes when the selected spot changes', async () => {
    const store = useConfiguratorStore()
    const selectSpot = vi.spyOn(store, 'selectSpot').mockResolvedValue(true)
    mount(WindScoutSettings)
    expect(controllerCalls[0][1].spot.options).toEqual([
      { value: 'edam', label: 'Edam' },
      { value: 'brouwersdam', label: 'Brouwersdam' },
      { value: 'castricum-aan-zee', label: 'Castricum aan Zee' },
    ])
    dialValues.value = {
      spot: 'edam', model: 'best_match', treatment: 'background-fade', windThreshold: 17,
    }
    await nextTick()
    expect(selectSpot).toHaveBeenCalledWith('edam')
  })

  it('offers the curated forecast models and switches the preview model', async () => {
    const store = useConfiguratorStore()
    const selectModel = vi.spyOn(store, 'selectModel').mockResolvedValue(true)
    mount(WindScoutSettings)

    expect(controllerCalls[0][1].model.options).toEqual([
      { value: 'best_match', label: 'Best fit' },
      { value: 'knmi_seamless', label: 'KNMI' },
      { value: 'ecmwf_ifs025', label: 'ECMWF' },
      { value: 'icon_seamless', label: 'ICON' },
      { value: 'gfs_seamless', label: 'GFS' },
    ])

    dialValues.value = {
      spot: 'brouwersdam', model: 'gfs_seamless', treatment: 'background-fade', windThreshold: 17,
    }
    await nextTick()
    expect(selectModel).toHaveBeenCalledWith('gfs_seamless')
  })

  it('announces forecast progress and keeps the demo badge outside the screen', () => {
    const wrapper = mount(WindScoutSettings)
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.get('[data-testid="forecast-label"]').text()).toBe('Demo')
    expect(wrapper.text()).toContain('Loading current Brouwersdam weather')
  })
})
