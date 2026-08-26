import { defineStore } from 'pinia'

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
  },
})

