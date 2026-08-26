import { describe, expect, it } from 'vitest'
import { brouwersdamForecast } from '../src/fixtures/brouwersdam'
import { createPreviewFrame } from '../src/renderer/previewRenderer'

describe('forecast preview frame', () => {
  it('describes one deterministic native-resolution five-day frame', () => {
    const frame = createPreviewFrame(brouwersdamForecast, {
      treatment: 'background-fade',
      threshold: 17,
    })
    expect(frame).toMatchObject({
      width: 800,
      height: 480,
      spot: 'Brouwersdam',
      days: 5,
      sampleCount: 25,
      threshold: 17,
    })
  })

  it('gives each treatment a distinct frame signature', () => {
    const signatures = ['background-fade', 'threshold-line', 'solid'].map((treatment) =>
      createPreviewFrame(brouwersdamForecast, { treatment, threshold: 17 }).signature,
    )
    expect(new Set(signatures).size).toBe(3)
  })

  it('moves the boundary upward as the threshold increases', () => {
    const y5 = createPreviewFrame(brouwersdamForecast, { treatment: 'threshold-line', threshold: 5 }).thresholdY
    const y17 = createPreviewFrame(brouwersdamForecast, { treatment: 'threshold-line', threshold: 17 }).thresholdY
    const y35 = createPreviewFrame(brouwersdamForecast, { treatment: 'threshold-line', threshold: 35 }).thresholdY
    expect(y5).toBeGreaterThan(y17)
    expect(y17).toBeGreaterThan(y35)
  })
})
