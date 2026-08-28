import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RENDERER_CONTRACT_VERSION,
  RENDERER_PALETTE_BYTES,
  RENDERER_RGBA_BYTES,
  SharedRendererError,
  loadSharedRenderer,
} from '../src/renderer/sharedRenderer'

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = dirname(webRoot)
const wasmPath = join(webRoot, 'public', 'renderer', 'wind-renderer.wasm')
const fixtureDirectory = join(repositoryRoot, 'shared', 'renderer-fixtures')

async function loadRealRenderer() {
  return loadSharedRenderer({ wasmBytes: await readFile(wasmPath) })
}

function fixtureInput(displayMode = 0, thresholdKt = 17, rowMask = 1, missingData = false) {
  const dayNames = ['TODAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
  const dates = ['26 AUG', '27 AUG', '28 AUG', '29 AUG', '30 AUG']
  const times = ['08', '11', '14', '17', '20']
  return {
    version: RENDERER_CONTRACT_VERSION,
    spotName: 'Brouwersdam',
    coordinates: '51.7506N 3.8577E',
    provider: 'KNMI SEAMLESS',
    updatedTime: '26 AUG 11AM',
    state: 0,
    refreshFailed: false,
    ageHours: 1,
    batteryPercent: 74,
    displayMode,
    thresholdKt,
    use24Hour: false,
    temperatureFahrenheit: false,
    showWeather: Boolean(rowMask & 1),
    showTemperature: Boolean(rowMask & 2),
    showTide: Boolean(rowMask & 4),
    tideAvailable: Boolean(rowMask & 4) && !missingData,
    tideSamples: (rowMask & 4) && !missingData
      ? Array.from({ length: 120 }, (_, index) => {
          const hour = index % 24
          const seaLevelMm = hour <= 6 ? hour * 100
            : hour <= 18 ? 600 - (hour - 6) * 100
              : -600 + (hour - 18) * 100
          return {
            dayIndex: Math.floor(index / 24),
            localHour: hour,
            seaLevelMm,
            available: true,
          }
        })
      : [],
    days: dayNames.map((day, dayIndex) => ({
      day,
      date: dates[dayIndex],
      samples: times.map((time, sampleIndex) => {
        const sustainedKt = 7 + dayIndex * 2 + sampleIndex * 3
        return {
          time,
          sustainedKt,
          gustKt: sustainedKt + 5,
          destinationDegrees: dayIndex * 55 + sampleIndex * 27,
          available: true,
          weather: missingData ? 0 : 1 + (dayIndex * 5 + sampleIndex) % 8,
          temperatureTenthsC: 120 + dayIndex * 5 + sampleIndex,
          temperatureAvailable: !missingData,
        }
      }),
    })),
  }
}

describe('shared WebAssembly renderer', () => {
  it('matches every full native palette fixture byte for byte', async () => {
    const renderer = await loadRealRenderer()
    const fixtureNames = (await readdir(fixtureDirectory)).filter((name) => name.endsWith('.bin'))
    const fixtures = [
      ['background-fade-17.bin', fixtureInput(0, 17)],
      ['threshold-05.bin', fixtureInput(1, 5)],
      ['threshold-17.bin', fixtureInput(1, 17)],
      ['threshold-35.bin', fixtureInput(1, 35)],
      ['solid-17.bin', fixtureInput(2, 17)],
      ...Array.from({ length: 8 }, (_, rowMask) => [
        `rows-${Boolean(rowMask & 1) ? 1 : 0}${Boolean(rowMask & 2) ? 1 : 0}${Boolean(rowMask & 4) ? 1 : 0}.bin`,
        fixtureInput(0, 17, rowMask),
      ]),
      ['rows-111-missing.bin', fixtureInput(0, 17, 7, true)],
    ]

    expect(fixtureNames.sort()).toEqual([
      'background-fade-17.bin',
      'rows-000.bin',
      'rows-001.bin',
      'rows-010.bin',
      'rows-011.bin',
      'rows-100.bin',
      'rows-101.bin',
      'rows-110.bin',
      'rows-111-missing.bin',
      'rows-111.bin',
      'solid-17.bin',
      'threshold-05.bin',
      'threshold-17.bin',
      'threshold-35.bin',
    ])
    expect(renderer.width).toBe(800)
    expect(renderer.height).toBe(480)
    expect(renderer.paletteBytes).toBe(RENDERER_PALETTE_BYTES)

    for (const [fixtureName, input] of fixtures) {
      const expected = new Uint8Array(await readFile(join(fixtureDirectory, fixtureName)))
      const actual = renderer.render(input)
      expect(actual).toHaveLength(RENDERER_PALETTE_BYTES)
      expect(actual, fixtureName).toEqual(expected)
    }
  }, 30_000)

  it('preserves red threshold pixels and output across repeated renders', async () => {
    const renderer = await loadRealRenderer()
    const first = renderer.render(fixtureInput(1, 35))
    renderer.renderPreview(fixtureInput(1, 35))
    const second = renderer.render(fixtureInput(1, 35))

    expect(first).toEqual(second)
    expect(first.filter((value) => value === 3).length).toBeGreaterThan(0)
  })

  it('returns a clean grayscale preview with red accents from the same renderer', async () => {
    const renderer = await loadRealRenderer()
    const background = renderer.renderPreview(fixtureInput(0, 17))
    const threshold = renderer.renderPreview(fixtureInput(1, 17))

    expect(background).toHaveLength(RENDERER_RGBA_BYTES)
    let hasContinuousGray = false
    let hasRed = false
    let allAlphaOpaque = true
    for (let offset = 0; offset < background.length; offset += 4) {
      allAlphaOpaque &&= background[offset + 3] === 255
      if (background[offset] === background[offset + 1] &&
          background[offset + 1] === background[offset + 2] &&
          background[offset] > 0 && background[offset] < 255) hasContinuousGray = true
      if (threshold[offset] === 255 && threshold[offset + 1] === 0 &&
          threshold[offset + 2] === 0 && threshold[offset + 3] === 255) hasRed = true
    }
    expect(allAlphaOpaque).toBe(true)
    expect(hasContinuousGray).toBe(true)
    expect(hasRed).toBe(true)
  })

  it('crosses the flat setter bridge without depending on native struct layout', async () => {
    const renderer = await loadRealRenderer()
    const expected = new Uint8Array(await readFile(join(fixtureDirectory, 'background-fade-17.bin')))

    const first = renderer.render(fixtureInput())
    const second = renderer.render(fixtureInput())

    expect(first).toEqual(expected)
    expect(second).toEqual(expected)
  })

  it('passes temperature and tide through the shared bridge', async () => {
    const renderer = await loadRealRenderer()
    const input = fixtureInput()
    input.showTemperature = true
    input.showTide = true
    input.tideAvailable = true
    input.tideSamples = Array.from({ length: 120 }, (_, index) => ({
      dayIndex: Math.floor(index / 24),
      localHour: index % 24,
      seaLevelMm: Math.round(Math.sin(index / 6) * 800),
      available: true,
    }))

    const first = renderer.renderPreview(input)
    const second = renderer.renderPreview(input)

    expect(first).toHaveLength(RENDERER_RGBA_BYTES)
    expect(second).toEqual(first)
  })

  it('renders clock and temperature-unit preferences through the shared bridge', async () => {
    const renderer = await loadRealRenderer()
    const metric = fixtureInput(0, 17, 7)
    const imperial = structuredClone(metric)
    imperial.use24Hour = true
    imperial.temperatureFahrenheit = true

    expect(renderer.renderPreview(imperial)).not.toEqual(renderer.renderPreview(metric))
  })

  it('rejects an incompatible contract before returning any bitmap', async () => {
    const renderer = await loadRealRenderer()

    expect(() => renderer.render({ version: RENDERER_CONTRACT_VERSION + 1 })).toThrowError(
      expect.objectContaining({ code: 'INCOMPATIBLE_CONTRACT' }),
    )
  })

  it('rejects values outside the bounded string bridge', async () => {
    const renderer = await loadRealRenderer()
    const input = fixtureInput()
    input.spotName = 'x'.repeat(96)

    expect(() => renderer.render(input)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
  })

  it('turns a missing module into a controlled renderer-load error', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 })
    const attempt = loadSharedRenderer({ wasmUrl: '/missing-renderer.wasm', fetchImpl })

    await expect(attempt).rejects.toBeInstanceOf(SharedRendererError)
    await expect(attempt).rejects.toMatchObject({ code: 'LOAD_FAILED' })
  })

  it('bounds a renderer request that never completes', async () => {
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })

    await expect(loadSharedRenderer({ fetchImpl, timeoutMs: 1 })).rejects.toMatchObject({
      code: 'LOAD_TIMEOUT',
    })
  })

  it('rejects an incompatible renderer module during loading', async () => {
    const bytes = await readFile(wasmPath)
    const compiled = await WebAssembly.instantiate(bytes, {})
    const incompatibleExports = {
      ...compiled.instance.exports,
      wind_wasm_contract_version: () => RENDERER_CONTRACT_VERSION + 1,
    }

    await expect(loadSharedRenderer({
      wasmBytes: bytes,
      instantiate: async () => ({ instance: { exports: incompatibleExports } }),
    })).rejects.toMatchObject({ code: 'INCOMPATIBLE_RENDERER' })
  })
})
