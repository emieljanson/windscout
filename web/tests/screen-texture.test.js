import { describe, expect, it, vi } from 'vitest'
import { createScreenTexture } from '../src/configurator/screenTexture'
import { brouwersdamForecast } from '../src/fixtures/brouwersdam'
import { RENDERER_RGBA_BYTES } from '../src/renderer/sharedRenderer'

function completeFrame(red = 255, green = 255, blue = 255) {
  const frame = new Uint8Array(RENDERER_RGBA_BYTES)
  for (let offset = 0; offset < frame.length; offset += 4) {
    frame[offset] = red
    frame[offset + 1] = green
    frame[offset + 2] = blue
    frame[offset + 3] = 255
  }
  return frame
}

function fakeRenderer(frames) {
  return {
    renderPreview: vi.fn(() => frames.shift()),
    dispose: vi.fn(),
  }
}

describe('canonical screen texture', () => {
  it('builds the initial texture only from the shared renderer output', async () => {
    const renderer = fakeRenderer([completeFrame(255, 0, 0)])
    const rendererLoader = vi.fn(async () => renderer)

    const source = await createScreenTexture({
      forecast: brouwersdamForecast,
      config: { treatment: 'background-fade', threshold: 17 },
      rendererLoader,
    })

    expect(rendererLoader).toHaveBeenCalledOnce()
    expect(renderer.renderPreview).toHaveBeenCalledOnce()
    expect(renderer.renderPreview.mock.calls[0][0]).toMatchObject({
      version: 1,
      spotName: 'Brouwersdam',
      provider: 'KNMI SEAMLESS',
      displayMode: 0,
      thresholdKt: 17,
      days: expect.arrayContaining([
        expect.objectContaining({
          samples: expect.arrayContaining([
            expect.objectContaining({ sustainedKt: 8, gustKt: 13 }),
          ]),
        }),
      ]),
    })
    expect([...source.texture.image.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
  })

  it('rerenders cached forecast input for settings updates without loading again', async () => {
    const renderer = fakeRenderer([
      completeFrame(),
      completeFrame(0, 0, 0),
      completeFrame(255, 0, 0),
    ])
    const rendererLoader = vi.fn(async () => renderer)
    const source = await createScreenTexture({
      forecast: brouwersdamForecast,
      config: { treatment: 'background-fade', threshold: 17 },
      rendererLoader,
    })
    const firstFrame = source.texture.image.data

    source.update({ config: { treatment: 'threshold-line', threshold: 25 } })
    const secondFrame = source.texture.image.data
    source.update({ config: { treatment: 'solid', threshold: 30 } })

    expect(rendererLoader).toHaveBeenCalledOnce()
    expect(renderer.renderPreview).toHaveBeenCalledTimes(3)
    expect(renderer.renderPreview.mock.calls.map(([input]) => [input.displayMode, input.thresholdKt])).toEqual([
      [0, 17],
      [1, 25],
      [2, 30],
    ])
    expect([...source.texture.image.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
    expect(secondFrame).not.toBe(firstFrame)
    expect(source.texture.image.data).not.toBe(secondFrame)
  })

  it('does not publish an incomplete frame during rapid updates', async () => {
    const initial = completeFrame(0, 0, 0)
    const renderer = fakeRenderer([initial, new Uint8Array(24), completeFrame(255, 0, 0)])
    const source = await createScreenTexture({
      forecast: brouwersdamForecast,
      config: { treatment: 'background-fade', threshold: 17 },
      rendererLoader: async () => renderer,
    })

    expect(() => source.update({ config: { treatment: 'threshold-line', threshold: 18 } })).toThrow(
      /complete 800 × 480 RGBA preview/,
    )
    expect([...source.texture.image.data.slice(0, 4)]).toEqual([0, 0, 0, 255])

    source.update({ config: { treatment: 'threshold-line', threshold: 19 } })
    expect([...source.texture.image.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
  })

  it('renders a changed spot forecast before publishing its new frame', async () => {
    const renderer = fakeRenderer([
      completeFrame(0, 0, 0),
      completeFrame(255, 0, 0),
    ])
    const source = await createScreenTexture({
      forecast: brouwersdamForecast,
      config: { treatment: 'background-fade', threshold: 17 },
      rendererLoader: async () => renderer,
    })
    const edam = structuredClone(brouwersdamForecast)
    edam.spotId = 'edam'
    edam.spotName = 'EDAM'
    edam.days[0].samples[0].sustainedKt = 24

    source.update({ forecast: edam })

    const renderedInput = renderer.renderPreview.mock.calls[1][0]
    expect(renderedInput.spotName).toBe('EDAM')
    expect(renderedInput.days[0].samples[0].sustainedKt).toBe(24)
    expect([...source.texture.image.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
  })

  it('releases the shared renderer and Three.js texture together', async () => {
    const renderer = fakeRenderer([completeFrame()])
    const source = await createScreenTexture({
      forecast: brouwersdamForecast,
      config: { treatment: 'solid', threshold: 17 },
      rendererLoader: async () => renderer,
    })
    const disposed = vi.fn()
    source.texture.addEventListener('dispose', disposed)

    source.dispose()
    source.dispose()

    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(disposed).toHaveBeenCalledOnce()
  })
})
