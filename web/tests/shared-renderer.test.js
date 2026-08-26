import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RENDERER_CONTRACT_VERSION,
  RENDERER_PALETTE_BYTES,
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

function backgroundFixtureInput() {
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
    displayMode: 0,
    thresholdKt: 17,
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
          weather: 1 + (dayIndex * 5 + sampleIndex) % 8,
        }
      }),
    })),
  }
}

describe('shared WebAssembly renderer', () => {
  it('matches every full native palette fixture byte for byte', async () => {
    const renderer = await loadRealRenderer()
    const fixtureNames = (await readdir(fixtureDirectory)).filter((name) => name.endsWith('.bin'))
    const fixturesByIndex = [
      'background-fade-17.bin',
      'threshold-05.bin',
      'threshold-17.bin',
      'threshold-35.bin',
      'solid-17.bin',
    ]

    expect(fixtureNames.sort()).toEqual([
      'background-fade-17.bin',
      'solid-17.bin',
      'threshold-05.bin',
      'threshold-17.bin',
      'threshold-35.bin',
    ])
    expect(renderer.width).toBe(800)
    expect(renderer.height).toBe(480)
    expect(renderer.paletteBytes).toBe(RENDERER_PALETTE_BYTES)

    for (const [fixtureIndex, fixtureName] of fixturesByIndex.entries()) {
      const expected = new Uint8Array(await readFile(join(fixtureDirectory, fixtureName)))
      const actual = renderer.renderFixture(fixtureIndex)
      expect(actual).toHaveLength(RENDERER_PALETTE_BYTES)
      expect(actual).toEqual(expected)
    }
  })

  it('preserves red threshold pixels and output across repeated renders', async () => {
    const renderer = await loadRealRenderer()
    const first = renderer.renderFixture(3)
    const second = renderer.renderFixture(3)

    expect(first).toEqual(second)
    expect(first.filter((value) => value === 3).length).toBeGreaterThan(0)
  })

  it('crosses the flat setter bridge without depending on native struct layout', async () => {
    const renderer = await loadRealRenderer()
    const expected = new Uint8Array(await readFile(join(fixtureDirectory, 'background-fade-17.bin')))

    const first = renderer.render(backgroundFixtureInput())
    const second = renderer.render(backgroundFixtureInput())

    expect(first).toEqual(expected)
    expect(second).toEqual(expected)
  })

  it('rejects an incompatible contract before returning any bitmap', async () => {
    const renderer = await loadRealRenderer()

    expect(() => renderer.render({ version: RENDERER_CONTRACT_VERSION + 1 })).toThrowError(
      expect.objectContaining({ code: 'INCOMPATIBLE_CONTRACT' }),
    )
  })

  it('rejects values outside the bounded string bridge', async () => {
    const renderer = await loadRealRenderer()
    const input = backgroundFixtureInput()
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
