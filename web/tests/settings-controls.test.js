import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import SettingRow from '../src/components/settings/SettingRow.vue'
import SettingSelect from '../src/components/settings/SettingSelect.vue'
import SettingCombobox from '../src/components/settings/SettingCombobox.vue'
import SettingSwitch from '../src/components/settings/SettingSwitch.vue'
import SettingNumberInput from '../src/components/settings/SettingNumberInput.vue'

const spots = [
  { value: 'edam', label: 'Edam' },
  { value: 'brouwersdam', label: 'Brouwersdam' },
]

describe('WindScout setting controls', () => {
  it('associates a visible row label and description with a Select', async () => {
    const wrapper = mount({
      components: { SettingRow, SettingSelect },
      template: `
        <SettingRow label="Model" description="Forecast source">
          <SettingSelect model-value="best_match" :options="options" />
        </SettingRow>
      `,
      data: () => ({ options: [{ value: 'best_match', label: 'Best Match' }] }),
    }, { attachTo: document.body })

    const trigger = wrapper.get('[role="combobox"]')
    const label = wrapper.get('label')
    const description = wrapper.get('.setting-row__description')

    expect(trigger.attributes('aria-labelledby')).toBe(label.attributes('id'))
    expect(trigger.attributes('aria-describedby')).toBe(description.attributes('id'))
    expect(wrapper.find('.setting-select__chevron').exists()).toBe(true)
    wrapper.unmount()
  })

  it('announces disabled Select and Switch states through their native semantics', () => {
    const wrapper = mount({
      components: { SettingRow, SettingSelect, SettingSwitch },
      template: `
        <div>
          <SettingRow label="Model"><SettingSelect model-value="best_match" :options="options" disabled /></SettingRow>
          <SettingRow label="Tide"><SettingSwitch :model-value="false" disabled /></SettingRow>
        </div>
      `,
      data: () => ({ options: [{ value: 'best_match', label: 'Best Match' }] }),
    })

    const labels = wrapper.findAll('label')
    const select = wrapper.get('[role="combobox"]')
    const toggle = wrapper.get('[role="switch"]')
    expect(select.attributes('disabled')).toBeDefined()
    expect(toggle.attributes('disabled')).toBeDefined()
    expect(select.attributes('aria-labelledby')).toBe(labels[0].attributes('id'))
    expect(toggle.attributes('aria-labelledby')).toBe(labels[1].attributes('id'))
  })

  it('opens Select from the keyboard and restores focus to its trigger after Escape', async () => {
    const wrapper = mount(SettingSelect, {
      props: {
        modelValue: 'best_match',
        options: [
          { value: 'best_match', label: 'Best Match' },
          { value: 'ecmwf', label: 'ECMWF' },
          { value: 'gfs', label: 'GFS' },
        ],
      },
      attachTo: document.body,
    })
    const trigger = wrapper.get('[role="combobox"]')
    trigger.element.focus()
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull()
    document.body.querySelector('[role="listbox"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('keeps combobox search controlled and restores the committed label on dismissal', async () => {
    const wrapper = mount(SettingCombobox, {
      props: {
        modelValue: 'brouwersdam',
        searchTerm: 'Brouwersdam',
        options: spots,
        emptyText: 'No existing spots found',
        'onUpdate:searchTerm': (value) => wrapper.setProps({
          searchTerm: value,
          options: spots.filter((spot) => spot.label.toLowerCase().includes(value.toLowerCase())),
        }),
      },
      attachTo: document.body,
    })
    const input = wrapper.get('input[role="combobox"]')

    await input.setValue('Nowhere')
    await input.trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('update:searchTerm').at(-1)).toEqual(['Brouwersdam'])
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.find('.setting-combobox__chevron').exists()).toBe(false)
    wrapper.unmount()
  })

  it('commits a supplied combobox result and keeps focus in the input', async () => {
    const wrapper = mount(SettingCombobox, {
      props: {
        modelValue: 'brouwersdam',
        searchTerm: '',
        options: spots,
        'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }),
        'onUpdate:searchTerm': (value) => wrapper.setProps({
          searchTerm: value,
          options: spots.filter((spot) => spot.label.toLowerCase().includes(value.toLowerCase())),
        }),
      },
      attachTo: document.body,
    })
    const input = wrapper.get('input[role="combobox"]')
    await input.trigger('focus')
    await input.setValue('E')
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((candidate) => candidate.textContent.includes('Edam'))
    option.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['edam'])
    expect(wrapper.emitted('update:searchTerm')?.at(-1)).toEqual(['Edam'])
    expect(document.activeElement).toBe(input.element)
    wrapper.unmount()
  })

  it('shows the empty result message without changing the committed combobox value', async () => {
    const wrapper = mount(SettingCombobox, {
      props: {
        modelValue: 'brouwersdam',
        searchTerm: 'Nowhere',
        options: [],
        emptyText: 'No existing spots found',
      },
      attachTo: document.body,
    })
    await wrapper.get('input').trigger('focus')

    expect(document.body.textContent).toContain('No existing spots found')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('offers a separated create action for an unmatched search without committing it', async () => {
    const wrapper = mount(SettingCombobox, {
      props: {
        modelValue: 'brouwersdam',
        searchTerm: 'Edam harbour',
        options: [],
        emptyText: 'No existing spots found',
        createActionLabel: 'Add “Edam harbour” as a spot',
      },
      attachTo: document.body,
    })
    await wrapper.get('input').trigger('focus')

    const action = [...document.body.querySelectorAll('[role="option"]')]
      .find((candidate) => candidate.textContent.includes('Add “Edam harbour” as a spot'))
    expect(action).toBeDefined()
    expect(action.previousElementSibling?.classList.contains('setting-popup__separator')).toBe(true)

    action.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('create')?.at(-1)).toEqual(['Edam harbour'])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits only valid number values and rolls invalid drafts back on Escape and blur', async () => {
    const onUpdate = vi.fn()
    const wrapper = mount({
      components: { SettingRow, SettingNumberInput },
      template: `
        <SettingRow label="Threshold">
          <SettingNumberInput :model-value="17" :min="5" :max="35" unit="kt" @update:model-value="onUpdate" />
        </SettingRow>
      `,
      methods: { onUpdate },
    })
    const input = wrapper.get('input[type="number"]')
    expect(input.attributes('aria-labelledby')).toBe(wrapper.get('label').attributes('id'))

    await input.trigger('focus')
    await input.setValue('23')
    expect(onUpdate).toHaveBeenLastCalledWith(23)

    await input.setValue('40')
    expect(onUpdate).not.toHaveBeenCalledWith(40)
    expect(input.attributes('aria-invalid')).toBe('true')
    const error = wrapper.get('[role="alert"]')
    expect(error.text()).toContain('Enter a value from 5 to 35 kt')
    expect(input.attributes('aria-describedby').split(' ')).toContain(error.attributes('id'))

    await input.trigger('keydown', { key: 'Escape' })
    expect(input.element.value).toBe('17')
    expect(input.attributes('aria-invalid')).toBeUndefined()

    await input.setValue('')
    await input.trigger('blur')
    expect(input.element.value).toBe('17')
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
