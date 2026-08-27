import { createHash } from 'node:crypto'

const REVERSE_ENDPOINT = 'https://api.geoapify.com/v1/geocode/reverse'
const PLACES_ENDPOINT = 'https://api.geoapify.com/v2/places'

export function cacheKeyForCandidate(candidate) {
  return createHash('sha256')
    .update(`${Number(candidate.latitude).toFixed(6)},${Number(candidate.longitude).toFixed(6)}`)
    .digest('hex')
    .slice(0, 20)
}

export function requiredGeoapifyCredits(candidates, cache) {
  return candidates.reduce((credits, candidate) => {
    const entry = cache[cacheKeyForCandidate(candidate)] ?? {}
    return credits + (entry.reverse ? 0 : 1) + (entry.water ? 0 : 1)
  }, 0)
}

async function requestJson(url, { fetchImpl, sleep, beforeRequest }) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await beforeRequest()
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' } })
      if (response?.ok) return await response.json()
      if (response?.status !== 429) throw new Error(`Geoapify request failed (${response?.status ?? 'network'})`)
      const retryAfter = Math.max(0, Number(response.headers?.get?.('retry-after') ?? 1) * 1000)
      await sleep(retryAfter)
      lastError = new Error('Geoapify rate limit reached')
    } catch (error) {
      lastError = error
      if (attempt < 2) await sleep(250 * (attempt + 1))
    }
  }
  throw lastError
}

function reverseUrl(candidate, apiKey) {
  const parameters = new URLSearchParams({
    lat: String(candidate.latitude), lon: String(candidate.longitude), format: 'json', limit: '1', apiKey,
  })
  return `${REVERSE_ENDPOINT}?${parameters}`
}

function placesUrl(candidate, apiKey) {
  const parameters = new URLSearchParams({
    categories: 'natural.water,natural.coastal',
    filter: `circle:${candidate.longitude},${candidate.latitude},2000`,
    bias: `proximity:${candidate.longitude},${candidate.latitude}`,
    limit: '1',
    apiKey,
  })
  return `${PLACES_ENDPOINT}?${parameters}`
}

function compactReverse(payload) {
  const result = payload?.results?.[0] ?? {}
  return {
    countryCode: String(result.country_code ?? '').toLowerCase(),
    timezone: String(result.timezone?.name ?? ''),
  }
}

function compactWater(payload) {
  const properties = payload?.features?.[0]?.properties
  if (!properties) return { nearby: false }
  return {
    nearby: true,
    distanceMeters: Number.isFinite(Number(properties.distance)) ? Math.round(Number(properties.distance)) : null,
    category: String(properties.categories?.find((category) => category.startsWith('natural.')) ?? ''),
  }
}

export async function collectGeoapifyEvidence(candidates, {
  cache,
  apiKey,
  fetchImpl = globalThis.fetch,
  creditBudget = 3000,
  delayMs = 220,
  concurrency = 3,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  persist = async () => {},
} = {}) {
  if (!apiKey) throw new Error('Set VITE_GEOAPIFY_API_KEY before validating spot candidates.')
  const required = requiredGeoapifyCredits(candidates, cache)
  if (required > creditBudget) throw new Error(`Validation requires ${required} Geoapify credits; budget is ${creditBudget}.`)
  let requests = 0
  let nextCandidate = 0
  let nextRequestAt = 0
  let requestGate = Promise.resolve()
  const beforeRequest = () => {
    const scheduled = requestGate.then(async () => {
      const waitMs = Math.max(0, nextRequestAt - Date.now())
      if (waitMs) await sleep(waitMs)
      nextRequestAt = Date.now() + delayMs
    })
    requestGate = scheduled.catch(() => {})
    return scheduled
  }
  async function processCandidate(candidate) {
    const key = cacheKeyForCandidate(candidate)
    const entry = cache[key] ??= {}
    if (!entry.reverse) {
      entry.reverse = compactReverse(await requestJson(reverseUrl(candidate, apiKey), { fetchImpl, sleep, beforeRequest }))
      requests += 1
      await persist(cache)
    }
    if (!entry.water) {
      entry.water = compactWater(await requestJson(placesUrl(candidate, apiKey), { fetchImpl, sleep, beforeRequest }))
      requests += 1
      await persist(cache)
    }
  }
  async function worker() {
    while (nextCandidate < candidates.length) {
      const candidate = candidates[nextCandidate]
      nextCandidate += 1
      await processCandidate(candidate)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, candidates.length)) }, worker))
  return { requests, cacheHits: candidates.length * 2 - requests }
}
