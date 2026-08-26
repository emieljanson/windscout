import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIGURATION_VERSION,
  createDefaultDisplayConfiguration,
  displayConfigurationFromStore,
} from '../src/config/configuration'
import { resolveTimeFormat } from '../src/config/localeTimeFormat'

describe('display configuration', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps version 2 output while deriving its treatment from threshold visibility', () => {
    const settings = {
      showThreshold: false,
      threshold: 23,
      showWeather: true,
      showTemperature: false,
      showTide: false,
      timeFormat: '24-hour',
      temperatureUnit: 'celsius',
    }

    expect(displayConfigurationFromStore(settings)).toEqual({
      version: CONFIGURATION_VERSION,
      treatment: 'solid',
      threshold: 23,
      showWeather: true,
      showTemperature: false,
      showTide: false,
      timeFormat: '24-hour',
      temperatureUnit: 'celsius',
    })
    expect(displayConfigurationFromStore({ ...settings, showThreshold: true }).treatment)
      .toBe('threshold-line')
  })

  it.each([
    [true, '12-hour'],
    [false, '24-hour'],
  ])('resolves hour12=%s to %s', (hour12, expected) => {
    const resolvedOptions = vi.fn(() => ({ hour12 }))
    const DateTimeFormat = vi.spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(function MockDateTimeFormat() {
        return { resolvedOptions }
      })

    expect(resolveTimeFormat('nl-NL')).toBe(expected)
    expect(DateTimeFormat).toHaveBeenCalledWith('nl-NL', { hour: 'numeric' })
    expect(resolvedOptions).toHaveBeenCalledOnce()
  })

  it('creates active defaults with solid bars, a retained threshold, and the locale convention', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function MockDateTimeFormat() {
      return { resolvedOptions: () => ({ hour12: true }) }
    })

    expect(createDefaultDisplayConfiguration('en-US')).toMatchObject({
      showThreshold: false,
      threshold: 17,
      timeFormat: '12-hour',
    })
  })
})
