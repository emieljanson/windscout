import { describe, expect, it, vi } from 'vitest'
import {
  PALETTE_BLACK,
  PALETTE_RED,
  PALETTE_WHITE,
  createScreenTexture,
  paletteToRgba,
} from '../src/configurator/screenTexture'
import { brouwersdamForecast } from '../src/fixtures/brouwersdam'
import { RENDERER_PALETTE_BYTES } from '../src/renderer/sharedRenderer'

function completeFrame(value = PALETTE_WHITE) {
  return new Uint8Array(RENDERER_PALETTE_BYTES).fill(value)
}

function fakeRenderer(frames) {
  return {
    render: vi.fn(() => frames.shift()),
    dispose: vi.fn(),
  }
}

describe('canonical screen texture', () => {
  it('maps the native black, white, and red palette to one complete RGBA frame', () => {
    const palette = completeFrame()
    palette.set([PALETTE_BLACK, PALETTE_WHITE, PALETTE_RED])

    const rgba = paletteToRgba(palette)

    expect(rgba).toHaveLength(RENDERER_PALETTE_BYTES * 4)
    expect([...rgba.slice(0, 12)]).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 0, 0, 255,
    ])
  })

  it('builds the initial texture only from the shared renderer output', async () => {
    const renderer = fakeRenderer([completeFrame(PALETTE_RED)])
    const rendererLoader = vi.fn(async () => renderer)

    const source = await createScreenTexture({
      forecast: brouwersdamForecast,
      config: { treatment: 'background-fade', threshold: 17 },
      rendererLoader,
    })

    expect(rendererLoader).toHaveBeenCalledOnce()
    expect(renderer.render).toHaveBeenCalledOnce()
    expect(renderer.render.mock.calls[0][0]).toMatchObject({
      version: 1,
      spotName: 'Brouwersdam',
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
      completeFrame(PALETTE_WHITE),
      completeFrame(PALETTE_BLACK),
      completeFrame(PALETTE_RED),
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
    expect(renderer.render).toHaveBeenCalledTimes(3)
    expect(renderer.render.mock.calls.map(([input]) => [input.displayMode, input.thresholdKt])).toEqual([
      [0, 17],
      [1, 25],
      [2, 30],
    ])
    expect([...source.texture.image.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
    expect(secondFrame).not.toBe(firstFrame)
    expect(source.texture.image.data).toBe(firstFrame)
  })

  it('does not publish an incomplete frame during rapid updates', async () => {
    const initial = completeFrame(PALETTE_BLACK)
    const renderer = fakeRenderer([initial, new Uint8Array(24), completeFrame(PALETTE_RED)])
    const source = await createScreenTexture({
      forecast: brouwersdamForecast,
      config: { treatment: 'background-fade', threshold: 17 },
      rendererLoader: async () => renderer,
    })

    expect(() => source.update({ config: { treatment: 'threshold-line', threshold: 18 } })).toThrow(
      /complete 800 × 480 palette frame/,
    )
    expect([...source.texture.image.data.slice(0, 4)]).toEqual([0, 0, 0, 255])

    source.update({ config: { treatment: 'threshold-line', threshold: 19 } })
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
