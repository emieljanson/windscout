export const CONFIGURATION_VERSION = 1

export const DEFAULT_DISPLAY_CONFIGURATION = Object.freeze({
  version: CONFIGURATION_VERSION,
  treatment: 'background-fade',
  threshold: 17,
  showWeather: true,
  showTemperature: false,
  showTide: false,
})

export function displayConfigurationFromStore(store) {
  return {
    version: CONFIGURATION_VERSION,
    treatment: store.treatment,
    threshold: store.threshold,
    showWeather: store.showWeather,
    showTemperature: store.showTemperature,
    showTide: store.showTide,
  }
}
