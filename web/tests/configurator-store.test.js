import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfiguratorStore } from '../src/stores/configurator'
import { getSpot } from '../src/spots'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function liveForecast(spotId = 'brouwersdam', retrievedAt = 1_777_000_000_000) {
  const spot = getSpot(spotId)
  return {
    schemaVersion: 1,
    spotId,
    spotName: spot.displayName,
    coordinates: '52°00\'00"N 4°00\'00"E',
    timezone: spot.timezone,
    provider: 'OPEN-METEO',
    model: 'KNMI SEAMLESS',
    updatedTime: '26 AUG 2PM',
    retrievedAt,
    days: Array.from({ length: 5 }, (_, day) => ({
      localDate: `2026-08-${26 + day}`,
      day: day === 0 ? 'TODAY' : 'THURSDAY',
      date: `${26 + day} AUG`,
      samples: [8, 11, 14, 17, 20].map((hour) => ({
        time: String(hour).padStart(2, '0'), sustainedKt: 12, gustKt: 18,
        destinationDegrees: 270, available: true, weather: 1,
      })),
    })),
  }
}

describe('configurator store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts with the current display defaults', () => {
    const store = useConfiguratorStore()
    expect(store.treatment).toBe('background-fade')
    expect(store.threshold).toBe(17)
    expect(store.selectedSpotId).toBe('brouwersdam')
    expect(store.forecastSource).toBe('demo')
    expect(store.forecastLabel).toBe('Demo')
  })

  it('accepts every supported treatment and valid threshold boundary', () => {
    const store = useConfiguratorStore()
    expect(store.setTreatment('threshold-line')).toBe(true)
    expect(store.setTreatment('solid')).toBe(true)
    expect(store.setThreshold(5)).toBe(true)
    expect(store.setThreshold(35)).toBe(true)
    expect(store.threshold).toBe(35)
  })

  it('preserves the last valid configuration after invalid input', () => {
    const store = useConfiguratorStore()
    store.setTreatment('solid')
    store.setThreshold(17)
    expect(store.setTreatment('rainbow')).toBe(false)
    expect(store.setThreshold(36)).toBe(false)
    expect(store.setThreshold('unknown')).toBe(false)
    expect(store.treatment).toBe('solid')
    expect(store.threshold).toBe(17)
  })

  it('keeps the demo label until the current forecast bitmap is published', async () => {
    const store = useConfiguratorStore()
    const forecast = liveForecast()
    await expect(store.initializeForecast({
      fetcher: vi.fn().mockResolvedValue(forecast),
      storage: memoryStorage(),
    })).resolves.toBe(true)
    expect(store.forecast).toEqual(forecast)
    expect(store.forecastStatus).toBe('rendering')
    expect(store.forecastLabel).toBe('Demo')
    expect(store.pendingForecastRevision).toBe(store.forecastRevision)

    expect(store.publishForecast(store.forecastRevision)).toBe(true)
    expect(store.forecastStatus).toBe('ready')
    expect(store.forecastLabel).toBe('')
  })

  it('shows an explicit demo fallback when the first request fails', async () => {
    const store = useConfiguratorStore()
    await expect(store.initializeForecast({
      fetcher: vi.fn().mockRejectedValue(new Error('offline')),
      storage: memoryStorage(),
    })).resolves.toBe(false)
    expect(store.forecastSource).toBe('demo')
    expect(store.forecastStatus).toBe('warning')
    expect(store.forecastLabel).toBe('Demo')
    expect(store.forecastMessage).toContain('demo')
  })

  it('keeps the last successful forecast when a later refresh fails', async () => {
    const store = useConfiguratorStore()
    const first = liveForecast()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('offline'))
    await store.initializeForecast({ fetcher, storage: memoryStorage() })
    store.publishForecast(store.forecastRevision)
    await expect(store.refreshForecast({ fetcher, storage: memoryStorage() })).resolves.toBe(false)
    expect(store.forecast).toEqual(first)
    expect(store.forecastStatus).toBe('warning')
    expect(store.forecastLabel).toBe('Update delayed')
    expect(store.forecastMessage).toContain('last forecast')
  })

  it('uses cached data without mislabeling it as demo data', async () => {
    const storage = memoryStorage()
    const firstStore = useConfiguratorStore()
    const current = liveForecast()
    await firstStore.initializeForecast({ fetcher: vi.fn().mockResolvedValue(current), storage })
    firstStore.$dispose()

    setActivePinia(createPinia())
    const store = useConfiguratorStore()
    await store.initializeForecast({ fetcher: vi.fn().mockRejectedValue(new Error('offline')), storage })
    expect(store.forecast).toEqual(current)
    expect(store.forecastSource).toBe('cache')
    expect(store.forecastLabel).toBe('Cached')
  })

  it('labels the old spot honestly if a newly selected spot cannot load', async () => {
    const store = useConfiguratorStore()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(liveForecast('brouwersdam'))
      .mockRejectedValueOnce(new Error('offline'))
    await store.initializeForecast({ fetcher, storage: memoryStorage() })
    store.publishForecast(store.forecastRevision)

    await store.selectSpot('edam', { fetcher, storage: memoryStorage() })
    expect(store.selectedSpotId).toBe('edam')
    expect(store.forecast.spotId).toBe('brouwersdam')
    expect(store.forecastSource).toBe('previous')
    expect(store.forecastLabel).toBe('Previous spot')
    expect(store.forecastMessage).toContain('Still showing BROUWERSDAM')
  })

  it('loads another supported spot but display-only settings never fetch', async () => {
    const store = useConfiguratorStore()
    const fetcher = vi.fn(async (spot) => liveForecast(spot.id))
    const storage = memoryStorage()
    await store.initializeForecast({ fetcher, storage })
    store.publishForecast(store.forecastRevision)
    expect(await store.selectSpot('edam', { fetcher, storage })).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1][0]).toMatchObject({ id: 'edam', latitude: 52.5126, longitude: 5.0486 })
    expect(store.forecast.spotId).toBe('edam')

    store.setTreatment('threshold-line')
    store.setThreshold(24)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await expect(store.selectSpot('nowhere', { fetcher, storage })).resolves.toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not publish an old pending forecast under a newly selected spot', async () => {
    const store = useConfiguratorStore()
    await store.initializeForecast({ fetcher: vi.fn().mockResolvedValue(liveForecast()), storage: memoryStorage() })
    const oldRevision = store.forecastRevision
    const edam = deferred()

    const selectingEdam = store.selectSpot('edam', { fetcher: () => edam.promise, storage: memoryStorage() })

    expect(store.publishForecast(oldRevision)).toBe(false)
    edam.resolve(liveForecast('edam'))
    await selectingEdam
    expect(store.publishForecast(store.forecastRevision)).toBe(true)
    expect(store.forecastMessage).toBe('Live forecast for Edam.')
  })

  it('ignores an older spot request that resolves after the newest one', async () => {
    const store = useConfiguratorStore()
    await store.initializeForecast({ fetcher: vi.fn().mockResolvedValue(liveForecast()), storage: memoryStorage() })
    store.publishForecast(store.forecastRevision)
    const edam = deferred()
    const castricum = deferred()

    const firstSelection = store.selectSpot('edam', { fetcher: () => edam.promise, storage: memoryStorage() })
    const secondSelection = store.selectSpot('castricum-aan-zee', {
      fetcher: () => castricum.promise,
      storage: memoryStorage(),
    })
    castricum.resolve(liveForecast('castricum-aan-zee'))
    await secondSelection
    store.publishForecast(store.forecastRevision)
    edam.resolve(liveForecast('edam'))

    await expect(firstSelection).resolves.toBe(false)
    expect(store.forecast.spotId).toBe('castricum-aan-zee')
    expect(store.forecastMessage).toBe('Live forecast for Castricum aan Zee.')
  })

  it('restores the last published forecast when a new bitmap is rejected', async () => {
    const store = useConfiguratorStore()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(liveForecast())
      .mockResolvedValueOnce(liveForecast('edam'))
    await store.initializeForecast({ fetcher, storage: memoryStorage() })
    store.publishForecast(store.forecastRevision)
    await store.selectSpot('edam', { fetcher, storage: memoryStorage() })

    expect(store.rejectForecastPublication(store.forecastRevision)).toBe(true)
    expect(store.forecast.spotId).toBe('brouwersdam')
    expect(store.pendingForecastRevision).toBeNull()
    expect(store.forecastStatus).toBe('warning')
    expect(store.forecastLabel).toBe('Previous spot')
  })
})
