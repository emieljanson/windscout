import { describe, expect, it, vi } from 'vitest'
import { enhanceDialKitSlider } from '../src/configurator/dialKitAccessibility'

describe('DialKit slider accessibility bridge', () => {
  it('adds the slider semantics DialKit omits and supports arrow keys', () => {
    const element = document.createElement('div')
    let value = 17
    const setValue = vi.fn((next) => { value = next })
    const enhancement = enhanceDialKitSlider(element, {
      label: 'Wind threshold', min: 5, max: 35, step: 1,
      getValue: () => value,
      setValue,
    })

    expect(element.getAttribute('role')).toBe('slider')
    expect(element.getAttribute('aria-valuenow')).toBe('17')
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(setValue).toHaveBeenCalledWith(18)
    expect(element.getAttribute('aria-valuetext')).toBe('18 knots')
    enhancement.dispose()
  })

  it('clamps keyboard changes to the configured range', () => {
    const element = document.createElement('div')
    let value = 35
    const setValue = (next) => { value = next }
    enhanceDialKitSlider(element, {
      label: 'Wind threshold', min: 5, max: 35, step: 1,
      getValue: () => value,
      setValue,
    })
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }))
    expect(value).toBe(35)
  })
})
