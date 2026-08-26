import { defineStore } from 'pinia'
import { brouwersdamForecast } from '../fixtures/brouwersdam'
import { readCachedForecast, writeCachedForecast } from '../forecast/forecastCache'
import { fetchOpenMeteoForecast } from '../forecast/openMeteo'
import {
  DEFAULT_THRESHOLD,
  DISPLAY_TREATMENTS,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
} from '../renderer/contract'
import { DEFAULT_SPOT_ID, getSpot } from '../spots'

export { DEFAULT_THRESHOLD, DISPLAY_TREATMENTS, MAX_THRESHOLD, MIN_THRESHOLD } from '../renderer/contract'

export const useConfiguratorStore = defineStore('configurator', {
  state: () => ({
    treatment: 'background-fade',
    threshold: DEFAULT_THRESHOLD,
    selectedSpotId: DEFAULT_SPOT_ID,
    forecast: brouwersdamForecast,
    publishedForecast: brouwersdamForecast,
    forecastRevision: 0,
    pendingForecastRevision: null,
    pendingForecastSpotId: null,
    forecastStatus: 'idle',
    forecastSource: 'demo',
    forecastMessage: 'Demo forecast. Loading current Brouwersdam weather…',
    forecastLabel: 'Demo',
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
      this.pendingForecastRevision = null
      this.pendingForecastSpotId = null
      const cached = readCachedForecast(spot.id, storage)
      if (cached) {
        this.forecast = cached
        this.publishedForecast = cached
        this.forecastSource = 'cache'
        this.forecastLabel = 'Cached'
        this.forecastRevision += 1
      } else if (this.forecast.spotId && this.forecast.spotId !== spot.id) {
        this.forecastSource = 'previous'
        this.forecastLabel = 'Previous spot'
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
        this.pendingForecastSpotId = spot.id
        this.forecastSource = 'current'
        this.forecastStatus = 'rendering'
        this.forecastMessage = `Updating the ${spot.name} preview…`
        return true
      } catch {
        if (requestId !== this.forecastRequestId || this.selectedSpotId !== spot.id) return false
        this.pendingForecastRevision = null
        this.pendingForecastSpotId = null
        this.forecastStatus = 'warning'
        if (this.forecastSource === 'demo') {
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
      if (revision !== this.pendingForecastRevision || revision !== this.forecastRevision ||
          this.pendingForecastSpotId !== this.selectedSpotId || this.forecast.spotId !== this.selectedSpotId) return false
      const spot = getSpot(this.selectedSpotId)
      this.pendingForecastRevision = null
      this.pendingForecastSpotId = null
      this.publishedForecast = this.forecast
      this.forecastSource = 'live'
      this.forecastLabel = ''
      this.forecastStatus = 'ready'
      this.forecastMessage = `Live forecast for ${spot?.name ?? 'this spot'}.`
      return true
    },
    rejectForecastPublication(revision) {
      if (revision !== this.pendingForecastRevision || revision !== this.forecastRevision) return false
      const failedSpot = getSpot(this.pendingForecastSpotId)
      this.pendingForecastRevision = null
      this.pendingForecastSpotId = null
      this.forecast = this.publishedForecast
      this.forecastRevision += 1
      this.forecastStatus = 'warning'
      if (this.forecast.spotId !== this.selectedSpotId) {
        this.forecastSource = 'previous'
        this.forecastLabel = 'Previous spot'
        this.forecastMessage = `Could not show ${failedSpot?.name ?? 'that spot'}. Still showing ${this.forecast.spotName}.`
      } else {
        this.forecastSource = 'current'
        this.forecastLabel = 'Update delayed'
        this.forecastMessage = 'Could not update the preview. Showing the last forecast.'
      }
      return true
    },
  },
})
