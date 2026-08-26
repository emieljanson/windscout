import { defineStore } from 'pinia'
import { brouwersdamForecast } from '../fixtures/brouwersdam'
import { readCachedForecast, writeCachedForecast } from '../forecast/forecastCache'
import { fetchOpenMeteoForecast } from '../forecast/openMeteo'
import { DEFAULT_SPOT_ID, getSpot } from '../spots'

export const DISPLAY_TREATMENTS = Object.freeze([
  'background-fade',
  'threshold-line',
  'solid',
])

export const MIN_THRESHOLD = 5
export const MAX_THRESHOLD = 35
export const DEFAULT_THRESHOLD = 17

export const useConfiguratorStore = defineStore('configurator', {
  state: () => ({
    treatment: 'background-fade',
    threshold: DEFAULT_THRESHOLD,
    selectedSpotId: DEFAULT_SPOT_ID,
    forecast: brouwersdamForecast,
    forecastRevision: 0,
    pendingForecastRevision: null,
    forecastStatus: 'idle',
    forecastSource: 'demo',
    forecastMessage: 'Demo forecast. Loading current Brouwersdam weather…',
    forecastLabel: 'Demo',
    showDemoLabel: true,
    forecastInitialized: false,
    forecastRequestId: 0,
  }),
  actions: {
    setTreatment(treatment) {
      if (!DISPLAY_TREATMENTS.includes(treatment)) return false
      this.treatment = treatment
      return true
    },
    setThreshold(value) {
      const threshold = Number(value)
      if (!Number.isFinite(threshold) || threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD) {
        return false
      }
      this.threshold = Math.round(threshold)
      return true
    },
    async initializeForecast(options = {}) {
      if (this.forecastInitialized) return false
      this.forecastInitialized = true
      return this.refreshForecast(options)
    },
    async refreshForecast({
      fetcher = fetchOpenMeteoForecast,
      storage,
      ...fetchOptions
    } = {}) {
      const spot = getSpot(this.selectedSpotId)
      if (!spot) return false
      const requestId = ++this.forecastRequestId
      const cached = readCachedForecast(spot.id, storage)
      if (cached) {
        this.forecast = cached
        this.forecastSource = 'cache'
        this.forecastLabel = 'Cached'
        this.showDemoLabel = false
        this.forecastRevision += 1
      } else if (this.forecast.spotId && this.forecast.spotId !== spot.id) {
        this.forecastSource = 'previous'
        this.forecastLabel = 'Previous spot'
        this.showDemoLabel = false
      }
      this.forecastStatus = 'loading'
      this.forecastMessage = `Loading current forecast for ${spot.name}…`

      try {
        const nextForecast = await fetcher(spot, fetchOptions)
        if (requestId !== this.forecastRequestId || this.selectedSpotId !== spot.id) return false
        writeCachedForecast(nextForecast, storage)
        this.forecast = nextForecast
        this.forecastRevision += 1
        this.pendingForecastRevision = this.forecastRevision
        this.forecastSource = 'current'
        this.forecastLabel = ''
        this.forecastStatus = 'rendering'
        this.forecastMessage = `Updating the ${spot.name} preview…`
        return true
      } catch {
        if (requestId !== this.forecastRequestId || this.selectedSpotId !== spot.id) return false
        this.pendingForecastRevision = null
        this.forecastStatus = 'warning'
        if (this.forecastSource === 'demo') {
          this.showDemoLabel = true
          this.forecastLabel = 'Demo'
          this.forecastMessage = 'Live forecast unavailable. Showing demo data.'
        } else if (this.forecastSource === 'previous') {
          const previousSpot = this.forecast.spotName ?? this.forecast.spot ?? 'the previous spot'
          this.forecastMessage = `Could not load ${spot.name}. Still showing ${previousSpot}.`
        } else if (this.forecastSource === 'cache') {
          this.forecastLabel = 'Cached'
          this.forecastMessage = 'Could not refresh. Showing the cached forecast.'
        } else {
          this.forecastLabel = 'Update delayed'
          this.forecastMessage = 'Could not refresh. Showing the last forecast.'
        }
        return false
      }
    },
    async selectSpot(spotId, options = {}) {
      if (!getSpot(spotId)) return false
      if (spotId === this.selectedSpotId) return true
      this.selectedSpotId = spotId
      return this.refreshForecast(options)
    },
    publishForecast(revision) {
      if (revision !== this.pendingForecastRevision || revision !== this.forecastRevision) return false
      const spot = getSpot(this.selectedSpotId)
      this.pendingForecastRevision = null
      this.forecastSource = 'live'
      this.forecastLabel = ''
      this.forecastStatus = 'ready'
      this.forecastMessage = `Live forecast for ${spot?.name ?? 'this spot'}.`
      this.showDemoLabel = false
      return true
    },
  },
})
