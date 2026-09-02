import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InstallContinuation from '../src/components/InstallContinuation.vue'
import { BOARD_IDS } from '../src/config/configuration'

let wrapper
const originalSerialDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serial')

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  if (originalSerialDescriptor) Object.defineProperty(navigator, 'serial', originalSerialDescriptor)
  else delete navigator.serial
})

describe('install continuation', () => {
  it('keeps the install action and opens the installer in an unsupported browser', async () => {
    wrapper = mount(InstallContinuation, {
      props: { configuration: { digest: 'wanted' } },
      global: { stubs: { InstallerPanel: true } },
    })

    expect(wrapper.get('button').text()).toBe('Install')
    expect(wrapper.findComponent({ name: 'InstallerPanel' }).exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.findComponent({ name: 'InstallerPanel' }).exists()).toBe(true)
  })

  it('keeps the install action when Web Serial is available', async () => {
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { requestPort: () => {} },
    })
    wrapper = mount(InstallContinuation, {
      props: { configuration: { digest: 'wanted' } },
      global: { stubs: { InstallerPanel: true } },
    })

    expect(wrapper.get('button').text()).toBe('Install')
    await wrapper.get('button').trigger('click')
    expect(wrapper.findComponent({ name: 'InstallerPanel' }).exists()).toBe(true)
  })

  it('keeps E1001 available for preview without offering an incompatible installer', () => {
    wrapper = mount(InstallContinuation, {
      props: { configuration: { boardId: BOARD_IDS.E1001, digest: 'wanted' } },
      global: { stubs: { InstallerPanel: true } },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').text()).toBe('Preview only')
  })
})
