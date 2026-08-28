import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InstallerPanel from '../../src/components/installer/InstallerPanel.vue'

let wrapper
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

function fakeSession(initial = { phase: 'ready', progress: 0, safeToDisconnect: true, error: null }) {
  let listener
  const session = {
    subscribe: vi.fn((next) => { listener = next; next(initial); return () => {} }),
    connect: vi.fn(), confirmDevice: vi.fn(), run: vi.fn(), reconnect: vi.fn(),
    scanNetworks: vi.fn().mockResolvedValue([]), submitWifi: vi.fn(), cancel: vi.fn(),
    emit(next) { listener(next) },
  }
  return session
}

function mountPanel(session) {
  wrapper = mount(InstallerPanel, {
    props: { configuration: { digest: 'wanted' }, sessionFactory: () => session },
    attachTo: document.body,
  })
  return wrapper
}

describe('installer inspector panel', () => {
  it('shows an honest supported-browser route before requesting permission', () => {
    const session = fakeSession()
    mountPanel(session)
    expect(wrapper.get('h2').text()).toBe('Connect your reTerminal')
    expect(wrapper.text()).toContain('Chrome or Edge on a desktop computer')
    expect(session.connect).not.toHaveBeenCalled()
  })

  it('requires explicit enclosure confirmation for an unverified ESP32-S3', async () => {
    const session = fakeSession({ phase: 'confirm-device', progress: 0, safeToDisconnect: true, error: null })
    mountPanel(session)
    expect(wrapper.text()).toContain('Is this a reTerminal E1002?')
    await wrapper.get('.installer-primary').trigger('click')
    expect(session.confirmDevice).toHaveBeenCalledOnce()
  })

  it('locks close and names the unsafe state while firmware is writing', () => {
    const session = fakeSession({ phase: 'installing-firmware', progress: 0.5, safeToDisconnect: false, error: null })
    mountPanel(session)
    expect(wrapper.get('.installer-back').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Keep the USB cable connected')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')
  })

  it('clears the password input immediately after Wi-Fi submission', async () => {
    const session = fakeSession({ phase: 'wifi', progress: 0.8, safeToDisconnect: true, error: null })
    mountPanel(session)
    await wrapper.get('input[name="ssid"]').setValue('Home')
    await wrapper.get('input[name="wifi-password"]').setValue('super-secret')
    await wrapper.get('form').trigger('submit')
    expect(session.submitWifi).toHaveBeenCalledWith({ ssid: 'Home', password: 'super-secret' })
    expect(wrapper.get('input[name="wifi-password"]').element.value).toBe('')
    expect(JSON.stringify(wrapper.html())).not.toContain('super-secret')
  })

  it('closes with Escape only when disconnecting is safe', async () => {
    const safe = fakeSession()
    mountPanel(safe)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()

    const unsafe = fakeSession({ phase: 'installing-firmware', progress: 0.3, safeToDisconnect: false, error: null })
    mountPanel(unsafe)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
