import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

vi.mock('dialkit/vue', () => ({
  DialRoot: { template: '<div data-testid="dial-root">Display controls</div>' },
  useDialKitController: () => ({ values: { value: { treatment: 'background-fade', windThreshold: 17 } }, setValue: vi.fn() }),
}))

import ConfiguratorView from '../src/views/ConfiguratorView.vue'

describe('configurator experience', () => {
  it('keeps the 3D product and controls as the only configurator view', () => {
    const wrapper = mount(ConfiguratorView, {
      global: {
        plugins: [createPinia()],
        stubs: { WindScoutScene: { template: '<div data-testid="3d-scene"></div>' } },
      },
    })
    expect(wrapper.find('[data-testid="3d-scene"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flat-preview"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="dial-root"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('View flat')
  })

  it('shows an honest error instead of replacing a failed 3D scene', async () => {
    const wrapper = mount(ConfiguratorView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          WindScoutScene: {
            emits: ['error'],
            mounted() { this.$emit('error', 'The model is unavailable.') },
            template: '<div></div>',
          },
        },
      },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="scene-error"]').text()).toContain('The model is unavailable.')
    expect(wrapper.find('[data-testid="flat-preview"]').exists()).toBe(false)
  })

  it('reveals a truthful next-slice explanation without starting installation', async () => {
    const wrapper = mount(ConfiguratorView, { global: { plugins: [createPinia()] } })
    expect(wrapper.text()).not.toContain('USB installation is the next build step')
    await wrapper.get('[data-testid="install-continuation"]').trigger('click')
    expect(wrapper.text()).toContain('USB installation is the next build step')
  })
})
