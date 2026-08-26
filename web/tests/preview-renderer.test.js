import { describe, expect, it } from 'vitest'
import { brouwersdamForecast } from '../src/fixtures/brouwersdam'
import { createPreviewFrame, renderForecastPreview } from '../src/renderer/previewRenderer'

function recordingContext() {
  const operations = []
  const context = {}
  for (const method of ['save', 'restore', 'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillText', 'translate', 'rotate', 'closePath', 'fill']) {
    context[method] = (...args) => operations.push([method, ...args])
  }
  context.createLinearGradient = (...args) => {
    operations.push(['createLinearGradient', ...args])
    return { addColorStop: (...stop) => operations.push(['addColorStop', ...stop]) }
  }
  for (const property of ['fillStyle', 'strokeStyle', 'font', 'textBaseline', 'textAlign', 'lineWidth', 'globalAlpha']) {
    Object.defineProperty(context, property, {
      set(value) { operations.push([property, value]) },
    })
  }
  return { context, operations }
}

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

  it('draws the distinct treatment pixels, not only distinct metadata', () => {
    const results = ['background-fade', 'threshold-line', 'solid'].map((treatment) => {
      const recording = recordingContext()
      renderForecastPreview(recording.context, brouwersdamForecast, { treatment, threshold: 17 })
      return recording.operations
    })

    expect(results[0]).toContainEqual(['createLinearGradient', 0, 249, 0, 375])
    expect(results[1]).toContainEqual(['strokeStyle', '#d44531'])
    expect(results[1]).toContainEqual(['fillText', '17 KTS', 700, 286])
    expect(results[2]).toContainEqual(['globalAlpha', 0.28])
  })
})
