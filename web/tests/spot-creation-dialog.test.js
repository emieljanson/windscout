import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import SpotCreationDialog from '../src/components/SpotCreationDialog.vue'

const edam = {
  id: 'edam-id',
  name: 'Edam',
  description: 'North Holland, Netherlands',
  latitude: 52.5126,
  longitude: 5.0486,
  timezone: 'Europe/Amsterdam',
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('Spot creation dialog', () => {
  it('waits until the dialog opens before searching and debounces its initial query', async () => {
    vi.useFakeTimers()
    const searchPlaces = vi.fn().mockResolvedValue([edam])
    const wrapper = mount(SpotCreationDialog, {
      props: {
        open: false,
        initialQuery: 'Edam',
        apiKey: 'test-key',
        searchPlaces,
      },
      attachTo: document.body,
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(searchPlaces).not.toHaveBeenCalled()

    await wrapper.setProps({ open: true })
    await vi.advanceTimersByTimeAsync(299)
    expect(searchPlaces).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(searchPlaces).toHaveBeenCalledOnce()
    expect(searchPlaces).toHaveBeenCalledWith('Edam', expect.objectContaining({
      apiKey: 'test-key',
      signal: expect.any(AbortSignal),
    }))
    const input = document.body.querySelector('input[role="combobox"]')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('North Holland, Netherlands')
    wrapper.unmount()
  })

  it('turns a chosen place into a movable-map confirmation and emits the final pin', async () => {
    vi.useFakeTimers()
    const searchPlaces = vi.fn().mockResolvedValue([edam])
    const reverseLocation = vi.fn().mockResolvedValue({ timezone: 'Europe/Amsterdam' })
    const destroy = vi.fn()
    const createMap = vi.fn(async (_element, options) => {
      options.onCenterChange({ latitude: 52.50673, longitude: 5.07729 })
      return { destroy }
    })
    const wrapper = mount(SpotCreationDialog, {
      props: {
        open: true,
        initialQuery: 'Edam',
        apiKey: 'test-key',
        searchPlaces,
        reverseLocation,
        createMap,
      },
      attachTo: document.body,
    })
    await vi.advanceTimersByTimeAsync(300)
    const input = document.body.querySelector('input[role="combobox"]')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((candidate) => candidate.textContent.includes('Edam'))
    option.click()
    await wrapper.vm.$nextTick()
    await vi.runAllTimersAsync()

    expect(createMap).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      center: { latitude: 52.5126, longitude: 5.0486 },
      apiKey: 'test-key',
    }))
    expect(document.body.textContent).toContain('Move the map until the pin is on your spot')

    const confirm = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Add spot'))
    confirm.click()
    await wrapper.vm.$nextTick()
    await vi.runAllTimersAsync()

    expect(reverseLocation).toHaveBeenCalledWith({
      latitude: 52.50673,
      longitude: 5.07729,
    }, expect.objectContaining({ apiKey: 'test-key' }))
    expect(wrapper.emitted('confirm')?.at(-1)).toEqual([{
      name: 'Edam',
      latitude: 52.50673,
      longitude: 5.07729,
      timezone: 'Europe/Amsterdam',
      providerRef: 'geoapify:edam-id',
    }])
    wrapper.unmount()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('keeps provider errors inside the dialog and offers a retry path', async () => {
    vi.useFakeTimers()
    const searchPlaces = vi.fn().mockRejectedValue(new Error('Location search is temporarily unavailable.'))
    const wrapper = mount(SpotCreationDialog, {
      props: {
        open: true,
        initialQuery: 'Edam',
        apiKey: 'test-key',
        searchPlaces,
      },
      attachTo: document.body,
    })
    await vi.advanceTimersByTimeAsync(300)
    const input = document.body.querySelector('input[role="combobox"]')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toContain('Location search is temporarily unavailable')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps a newer search active when an older request finishes late', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const second = deferred()
    const searchPlaces = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const wrapper = mount(SpotCreationDialog, {
      props: {
        open: true,
        initialQuery: 'Ed',
        apiKey: 'test-key',
        searchPlaces,
      },
      attachTo: document.body,
    })
    await vi.advanceTimersByTimeAsync(300)
    const input = document.body.querySelector('input[role="combobox"]')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    input.value = 'Edam'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(300)

    first.resolve([{ ...edam, id: 'stale', name: 'Stale result' }])
    await flushPromises()
    expect(document.body.textContent).toContain('Searching places…')
    expect(document.body.textContent).not.toContain('Stale result')

    second.resolve([edam])
    await flushPromises()
    expect(document.body.textContent).toContain('North Holland, Netherlands')
    wrapper.unmount()
  })

  it('destroys a map that finishes loading after the dialog closes', async () => {
    vi.useFakeTimers()
    const pendingMap = deferred()
    const destroy = vi.fn()
    const wrapper = mount(SpotCreationDialog, {
      props: {
        open: true,
        initialQuery: 'Edam',
        apiKey: 'test-key',
        searchPlaces: vi.fn().mockResolvedValue([edam]),
        createMap: vi.fn().mockReturnValue(pendingMap.promise),
      },
      attachTo: document.body,
    })
    await vi.advanceTimersByTimeAsync(300)
    const input = document.body.querySelector('input[role="combobox"]')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((candidate) => candidate.textContent.includes('Edam'))
    option.click()
    await wrapper.vm.$nextTick()
    document.body.querySelector('.spot-dialog__close').click()

    pendingMap.resolve({ destroy })
    await flushPromises()
    expect(destroy).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('cancels final location lookup when the dialog closes', async () => {
    vi.useFakeTimers()
    const pendingReverse = deferred()
    const reverseLocation = vi.fn().mockReturnValue(pendingReverse.promise)
    const wrapper = mount(SpotCreationDialog, {
      props: {
        open: true,
        initialQuery: 'Edam',
        apiKey: 'test-key',
        searchPlaces: vi.fn().mockResolvedValue([edam]),
        reverseLocation,
        createMap: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
      },
      attachTo: document.body,
    })
    await vi.advanceTimersByTimeAsync(300)
    const input = document.body.querySelector('input[role="combobox"]')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((candidate) => candidate.textContent.includes('Edam'))
    option.click()
    await flushPromises()
    const confirm = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Add spot'))
    confirm.click()
    await wrapper.vm.$nextTick()
    const signal = reverseLocation.mock.calls[0][1].signal
    document.body.querySelector('.spot-dialog__close').click()
    expect(signal.aborted).toBe(true)

    pendingReverse.resolve({ timezone: 'Europe/Amsterdam' })
    await flushPromises()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })
})
