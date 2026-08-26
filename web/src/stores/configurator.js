import { defineStore } from 'pinia'
import { brouwersdamForecast } from '../fixtures/brouwersdam'
import { readCachedForecast, writeCachedForecasts } from '../forecast/forecastCache'
import {
  DEFAULT_FORECAST_MODEL_ID,
  getForecastModel,
} from '../forecast/models'
import { fetchOpenMeteoForecasts } from '../forecast/openMeteo'
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
    selectedModelId: DEFAULT_FORECAST_MODEL_ID,
    forecastsByModel: { [DEFAULT_FORECAST_MODEL_ID]: brouwersdamForecast },
    forecast: brouwersdamForecast,
    publishedForecast: brouwersdamForecast,
    forecastRevision: 0,
    pendingForecastRevision: null,
    pendingForecastSpotId: null,
    pendingForecastModelId: null,
    pendingForecastSource: null,
    forecastStatus: 'idle',
    forecastSource: 'demo',
    forecastMessage: 'Demo forecast. Loading current Brouwersdam weather…',
    forecastLabel: 'Demo',
    forecastInitialized: false,
    forecastRequestId: 0,
    forecastRequestInFlight: false,
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
      fetcher = fetchOpenMeteoForecasts,
      storage,
      ...fetchOptions
    } = {}) {
      const spot = getSpot(this.selectedSpotId)
      if (!spot) return false
      const requestId = ++this.forecastRequestId
      this.forecastRequestInFlight = true
      this.pendingForecastRevision = null
      this.pendingForecastSpotId = null
      this.pendingForecastModelId = null
      this.pendingForecastSource = null
      this.forecastsByModel = {}
      const cached = readCachedForecast(spot.id, this.selectedModelId, storage)
      if (cached) {
        this.forecastsByModel = { [cached.modelId]: cached }
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
        const forecasts = await fetcher(spot, fetchOptions)
        if (requestId !== this.forecastRequestId || this.selectedSpotId !== spot.id) return false
        const nextForecast = forecasts?.[this.selectedModelId]
        if (!nextForecast || nextForecast.spotId !== spot.id) {
          throw new Error('The selected forecast model is unavailable.')
        }
        writeCachedForecasts(forecasts, storage)
        this.forecastsByModel = forecasts
        this.forecast = nextForecast
        this.forecastRevision += 1
        this.pendingForecastRevision = this.forecastRevision
        this.pendingForecastSpotId = spot.id
        this.pendingForecastModelId = this.selectedModelId
        this.pendingForecastSource = 'current'
        this.forecastSource = 'current'
        this.forecastStatus = 'rendering'
        this.forecastMessage = `Updating the ${spot.name} preview…`
        return true
      } catch {
        if (requestId !== this.forecastRequestId || this.selectedSpotId !== spot.id) return false
        if (this.pendingForecastSource !== 'cache') {
          this.pendingForecastRevision = null
          this.pendingForecastSpotId = null
          this.pendingForecastModelId = null
          this.pendingForecastSource = null
        }
        this.forecastStatus = 'warning'
        if (this.forecastSource === 'demo') {
          this.forecastLabel = 'Demo'
          this.forecastMessage = 'Live forecast unavailable. Showing demo data.'
        } else if (this.forecastSource === 'previous') {
          const previousSpot = this.forecast.spotName ?? this.forecast.spot ?? 'the previous spot'
          this.forecastMessage = `Could not load ${spot.name}. Still showing ${previousSpot}.`
        } else if (this.forecast.spotId === spot.id && this.forecast.modelId !== this.selectedModelId) {
          const requestedModel = getForecastModel(this.selectedModelId)
          this.forecastSource = 'previous'
          this.forecastLabel = 'Previous model'
          this.forecastMessage = `Could not load ${requestedModel?.label ?? 'that model'}. Still showing ${this.forecast.model}.`
        } else if (this.forecastSource === 'cache') {
          this.forecastLabel = 'Cached'
          this.forecastMessage = 'Could not refresh. Showing the cached forecast.'
        } else {
          this.forecastLabel = 'Update delayed'
          this.forecastMessage = 'Could not refresh. Showing the last forecast.'
        }
        return false
      } finally {
        if (requestId === this.forecastRequestId) this.forecastRequestInFlight = false
      }
    },
    async selectSpot(spotId, options = {}) {
      if (!getSpot(spotId)) return false
      if (spotId === this.selectedSpotId) return true
      this.selectedSpotId = spotId
      return this.refreshForecast(options)
    },
    async selectModel(modelId, { storage, ...refreshOptions } = {}) {
      const model = getForecastModel(modelId)
      if (!model) return false
      if (modelId === this.selectedModelId) return true
      const requestInFlight = this.forecastRequestInFlight
      this.selectedModelId = modelId
      this.pendingForecastRevision = null
      this.pendingForecastSpotId = null
      this.pendingForecastModelId = null
      this.pendingForecastSource = null

      const current = this.forecastsByModel[modelId]
      const cached = current ? null : readCachedForecast(this.selectedSpotId, modelId, storage)
      const available = current ?? cached
      if (!available && requestInFlight) {
        const spot = getSpot(this.selectedSpotId)
        this.forecastMessage = `Loading ${model.label} forecast for ${spot?.name ?? 'this spot'}…`
        return true
      }
      if (!available || available.spotId !== this.selectedSpotId) {
        return this.refreshForecast({ storage, ...refreshOptions })
      }

      this.forecastsByModel[modelId] = available
      this.forecast = available
      this.forecastRevision += 1
      this.pendingForecastRevision = this.forecastRevision
      this.pendingForecastSpotId = this.selectedSpotId
      this.pendingForecastModelId = modelId
      this.pendingForecastSource = cached ? 'cache' : 'current'
      this.forecastSource = this.pendingForecastSource
      this.forecastLabel = cached ? 'Cached' : this.forecastLabel
      this.forecastStatus = 'rendering'
      this.forecastMessage = `Updating the ${cached ? 'cached ' : ''}${model.label} preview…`
      return true
    },
    publishForecast(revision) {
      if (revision !== this.pendingForecastRevision || revision !== this.forecastRevision ||
          this.pendingForecastSpotId !== this.selectedSpotId ||
          this.pendingForecastModelId !== this.selectedModelId ||
          this.forecast.spotId !== this.selectedSpotId ||
          this.forecast.modelId !== this.selectedModelId) return false
      const spot = getSpot(this.selectedSpotId)
      const model = getForecastModel(this.selectedModelId)
      const publicationSource = this.pendingForecastSource
      this.pendingForecastRevision = null
      this.pendingForecastSpotId = null
      this.pendingForecastModelId = null
      this.pendingForecastSource = null
      this.publishedForecast = this.forecast
      if (publicationSource === 'cache') {
        this.forecastSource = 'cache'
        this.forecastLabel = 'Cached'
        if (this.forecastStatus !== 'warning') {
          this.forecastStatus = this.forecastRequestInFlight ? 'loading' : 'ready'
          this.forecastMessage = this.forecastRequestInFlight
            ? `Cached ${model?.label ?? 'model'} forecast for ${spot?.name ?? 'this spot'}. Refreshing current data…`
            : `Cached ${model?.label ?? 'model'} forecast for ${spot?.name ?? 'this spot'}.`
        }
        return true
      }
      this.forecastSource = 'live'
      this.forecastLabel = ''
      this.forecastStatus = 'ready'
      this.forecastMessage = `Live ${model?.label ?? 'model'} forecast for ${spot?.name ?? 'this spot'}.`
      return true
    },
    rejectForecastPublication(revision) {
      if (revision !== this.pendingForecastRevision || revision !== this.forecastRevision) return false
      const failedSpot = getSpot(this.pendingForecastSpotId)
      const failedModel = getForecastModel(this.pendingForecastModelId)
      this.pendingForecastRevision = null
      this.pendingForecastSpotId = null
      this.pendingForecastModelId = null
      this.pendingForecastSource = null
      this.forecast = this.publishedForecast
      this.forecastRevision += 1
      this.forecastStatus = 'warning'
      if (this.forecast.spotId !== this.selectedSpotId) {
        this.forecastSource = 'previous'
        this.forecastLabel = 'Previous spot'
        this.forecastMessage = `Could not show ${failedSpot?.name ?? 'that spot'}. Still showing ${this.forecast.spotName}.`
      } else if (this.forecast.modelId !== this.selectedModelId) {
        this.forecastSource = 'previous'
        this.forecastLabel = 'Previous model'
        this.forecastMessage = `Could not show ${failedModel?.label ?? 'that model'}. Still showing ${this.forecast.model}.`
      } else {
        this.forecastSource = 'current'
        this.forecastLabel = 'Update delayed'
        this.forecastMessage = 'Could not update the preview. Showing the last forecast.'
      }
      return true
    },
  },
})
