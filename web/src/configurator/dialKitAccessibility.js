function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function enhanceDialKitSlider(element, options) {
  if (!element) return null
  const { label, min, max, step, getValue, setValue } = options
  element.tabIndex = 0
  element.setAttribute('role', 'slider')
  element.setAttribute('aria-label', label)
  element.setAttribute('aria-valuemin', String(min))
  element.setAttribute('aria-valuemax', String(max))

  function sync() {
    element.setAttribute('aria-valuenow', String(getValue()))
    element.setAttribute('aria-valuetext', `${getValue()} knots`)
  }

  function handleKeydown(event) {
    const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    let next = getValue()
    if (event.key === 'Home') next = min
    else if (event.key === 'End') next = max
    else if (event.key === 'PageDown') next -= step * 5
    else if (event.key === 'PageUp') next += step * 5
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= step
    else next += step
    setValue(clamp(next, min, max))
    sync()
  }

  element.addEventListener('keydown', handleKeydown)
  sync()
  return {
    sync,
    dispose() {
      element.removeEventListener('keydown', handleKeydown)
    },
  }
}
