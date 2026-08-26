import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

vi.mock('dialkit/vue', () => ({
  DialRoot: { template: '<div data-testid="dial-root">Display controls</div>' },
  useDialKitController: () => ({ values: { value: { treatment: 'background-fade', windThreshold: 17 } }, setValue: vi.fn() }),
}))

import ConfiguratorView from '../src/views/ConfiguratorView.vue'

describe('configurator experience', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('keeps the same controls and native preview in the reduced-motion fallback', () => {
    const wrapper = mount(ConfiguratorView, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('[data-testid="flat-preview"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dial-root"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Brouwersdam')
  })

  it('reveals a truthful next-slice explanation without starting installation', async () => {
    const wrapper = mount(ConfiguratorView, { global: { plugins: [createPinia()] } })
    expect(wrapper.text()).not.toContain('USB installation is the next build step')
    await wrapper.get('[data-testid="install-continuation"]').trigger('click')
    expect(wrapper.text()).toContain('USB installation is the next build step')
  })
})
