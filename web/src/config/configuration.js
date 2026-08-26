import { resolveTimeFormat } from './localeTimeFormat'
import { DEFAULT_THRESHOLD } from '../renderer/contract'

export const CONFIGURATION_VERSION = 2

export const TIME_FORMATS = Object.freeze(['24-hour', '12-hour'])
export const TEMPERATURE_UNITS = Object.freeze(['celsius', 'fahrenheit'])
export const TEMPERATURE_CHOICES = Object.freeze(['hide', ...TEMPERATURE_UNITS])

export const DEFAULT_DISPLAY_CONFIGURATION = Object.freeze({
  showThreshold: false,
  threshold: DEFAULT_THRESHOLD,
  showWeather: true,
  showTemperature: false,
  showTide: false,
  timeFormat: '24-hour',
  temperatureUnit: 'celsius',
})

export function createDefaultDisplayConfiguration(locale) {
  return {
    ...DEFAULT_DISPLAY_CONFIGURATION,
    timeFormat: resolveTimeFormat(locale),
  }
}

export function displayConfigurationFromStore(store) {
  return {
    version: CONFIGURATION_VERSION,
    treatment: store.showThreshold ? 'threshold-line' : 'solid',
    threshold: store.threshold,
    showWeather: store.showWeather,
    showTemperature: store.showTemperature,
    showTide: store.showTide,
    timeFormat: store.timeFormat,
    temperatureUnit: store.temperatureUnit,
  }
}
