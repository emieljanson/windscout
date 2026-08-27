import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import WindScoutSettings from '../src/components/WindScoutSettings.vue'
import SpotCreationDialog from '../src/components/SpotCreationDialog.vue'
import SettingCombobox from '../src/components/settings/SettingCombobox.vue'
import SettingSelect from '../src/components/settings/SettingSelect.vue'
import { useConfiguratorStore } from '../src/stores/configurator'

let wrapper

function mountSettings() {
  wrapper = mount(WindScoutSettings, { attachTo: document.body })
  return wrapper
}

function rowControl(label) {
  const row = wrapper.findAll('.setting-row')
    .find((candidate) => candidate.get('.setting-row__label').text() === label)
  if (!row) throw new Error(`Missing settings row: ${label}`)
  return row
}

function bodyOption(label) {
  return [...document.body.querySelectorAll('[role="option"]')]
    .find((candidate) => candidate.textContent.includes(label))
}

describe('WindScout settings panel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
  })

  it('uses the approved left-label settings model without Treatment or Time controls', () => {
    mountSettings()

    expect(wrapper.findAll('.setting-section__title').map((title) => title.text())).toEqual([
      'Forecast',
      'Display',
    ])
    expect(wrapper.findAll('.setting-row__label').map((label) => label.text())).toEqual([
      'Spot',
      'Model',
      'Show threshold',
      'Weather',
      'Temperature',
      'Tide',
    ])
    expect(wrapper.text()).not.toContain('Treatment')
    expect(wrapper.text()).not.toContain('Time format')
    expect(rowControl('Spot').find('.setting-select__chevron').exists()).toBe(false)
    expect(rowControl('Model').find('.setting-select__chevron').exists()).toBe(true)
  })

  it('filters local spots, commits only a supplied result, and announces no results', async () => {
    const store = useConfiguratorStore()
    store.selectedSpotId = 'edam'
    const selectSpot = vi.spyOn(store, 'selectSpot').mockResolvedValue(true)
    mountSettings()
    const input = rowControl('Spot').get('input[role="combobox"]')

    await input.trigger('focus')
    await input.setValue('bro')
    await nextTick()
    expect(bodyOption('Brouwersdam')).toBeDefined()
    expect(bodyOption('Edam')).toBeUndefined()

    bodyOption('Brouwersdam').click()
    await nextTick()
    expect(selectSpot).toHaveBeenCalledWith('brouwersdam')

    await input.setValue('nowhere')
    await nextTick()
    expect(document.body.textContent).toContain('No existing spots found')
    expect(selectSpot).toHaveBeenCalledTimes(1)
  })

  it('opens custom spot creation from the typed add action and selects the saved spot', async () => {
    const store = useConfiguratorStore()
    const personalSpot = {
      id: 'personal-edam-harbour',
      name: 'Edam harbour',
      displayName: 'EDAM HARBOUR',
      latitude: 52.50673,
      longitude: 5.07729,
      timezone: 'Europe/Amsterdam',
      personal: true,
    }
    const addPersonalSpot = vi.spyOn(store, 'addPersonalSpot').mockReturnValue(personalSpot)
    const selectSpot = vi.spyOn(store, 'selectSpot').mockResolvedValue(true)
    mountSettings()
    const spotCombobox = wrapper.findComponent(SettingCombobox)

    spotCombobox.vm.$emit('update:searchTerm', 'Edam harbour')
    await nextTick()
    expect(spotCombobox.props('createActionLabel')).toBe('Add “Edam harbour” as a spot')
    spotCombobox.vm.$emit('create', 'Edam harbour')
    await nextTick()

    const dialog = wrapper.findComponent(SpotCreationDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('initialQuery')).toBe('Edam harbour')
    await dialog.props('saveSpot')(personalSpot)
    await nextTick()

    expect(addPersonalSpot).toHaveBeenCalledWith(personalSpot)
    expect(selectSpot).toHaveBeenCalledWith(personalSpot.id)
  })

  it('offers the curated model list and selects a model through the store', async () => {
    const store = useConfiguratorStore()
    const selectModel = vi.spyOn(store, 'selectModel').mockResolvedValue(true)
    mountSettings()
    const modelSelect = wrapper.findAllComponents(SettingSelect)[0]

    expect(modelSelect.props('options').map((option) => option.label)).toEqual([
      'Best Match', 'KNMI', 'ECMWF', 'ICON', 'GFS',
    ])
    modelSelect.vm.$emit('update:modelValue', 'gfs_seamless')
    await nextTick()

    expect(selectModel).toHaveBeenCalledWith('gfs_seamless')
  })

  it('reveals an exact threshold input and restores its last valid value', async () => {
    const store = useConfiguratorStore()
    mountSettings()
    const thresholdSwitch = rowControl('Show threshold').get('[role="switch"]')

    expect(wrapper.find('input[type="number"]').exists()).toBe(false)
    await thresholdSwitch.trigger('click')
    expect(store.showThreshold).toBe(true)

    const thresholdInput = rowControl('Threshold').get('input[type="number"]')
    await thresholdInput.setValue('24')
    expect(store.threshold).toBe(24)

    await thresholdSwitch.trigger('click')
    expect(store.showThreshold).toBe(false)
    expect(wrapper.find('input[type="number"]').exists()).toBe(false)
    await thresholdSwitch.trigger('click')
    expect(rowControl('Threshold').get('input').element.value).toBe('24')
  })

  it('maps Temperature to Hide, Celsius, or Fahrenheit as one setting', async () => {
    const store = useConfiguratorStore()
    mountSettings()
    const temperatureSelect = wrapper.findAllComponents(SettingSelect)[1]

    expect(store.temperatureChoice).toBe('hide')
    expect(temperatureSelect.props('options').map((option) => option.label)).toEqual([
      'Hide', 'Celsius', 'Fahrenheit',
    ])
    temperatureSelect.vm.$emit('update:modelValue', 'fahrenheit')
    await nextTick()
    expect(store.temperatureChoice).toBe('fahrenheit')

    temperatureSelect.vm.$emit('update:modelValue', 'hide')
    await nextTick()
    expect(store.temperatureChoice).toBe('hide')
  })

  it('shows Tide effectively off while unavailable without losing its preference', async () => {
    const store = useConfiguratorStore()
    store.tide = { capability: 'available' }
    store.tideStatus = 'available'
    store.showTide = true
    mountSettings()

    const tideSwitch = rowControl('Tide').get('[role="switch"]')
    expect(tideSwitch.attributes('data-state')).toBe('checked')
    expect(tideSwitch.attributes('disabled')).toBeUndefined()

    store.tide = null
    store.tideStatus = 'failed'
    store.tideMessage = 'Could not check tide availability. Try again later.'
    await nextTick()

    expect(store.showTide).toBe(true)
    expect(store.effectiveShowTide).toBe(false)
    expect(tideSwitch.attributes('data-state')).toBe('unchecked')
    expect(tideSwitch.attributes('disabled')).toBeDefined()
    expect(tideSwitch.attributes('aria-describedby')).toBe('tide-capability-message')
    expect(wrapper.get('#tide-capability-message').text()).toContain('Could not check')

    store.tide = { capability: 'available' }
    store.tideStatus = 'available'
    await nextTick()
    expect(tideSwitch.attributes('data-state')).toBe('checked')
  })

  it('announces forecast progress and keeps the demo badge outside the screen', () => {
    mountSettings()
    expect(wrapper.get('.forecast-status').attributes('aria-live')).toBe('polite')
    expect(wrapper.get('[data-testid="forecast-label"]').text()).toBe('Demo')
    expect(wrapper.text()).toContain('Loading current Brouwersdam weather')
  })
})
