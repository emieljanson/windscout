export const CONFIGURATION_VERSION = 2

export const TIME_FORMATS = Object.freeze(['24-hour', '12-hour'])
export const TEMPERATURE_UNITS = Object.freeze(['celsius', 'fahrenheit'])

export const DEFAULT_DISPLAY_CONFIGURATION = Object.freeze({
  version: CONFIGURATION_VERSION,
  treatment: 'background-fade',
  threshold: 17,
  showWeather: true,
  showTemperature: false,
  showTide: false,
  timeFormat: '24-hour',
  temperatureUnit: 'celsius',
})

export function displayConfigurationFromStore(store) {
  return {
    version: CONFIGURATION_VERSION,
    treatment: store.treatment,
    threshold: store.threshold,
    showWeather: store.showWeather,
    showTemperature: store.showTemperature,
    showTide: store.showTide,
    timeFormat: store.timeFormat,
    temperatureUnit: store.temperatureUnit,
  }
}
