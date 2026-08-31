export const GEOAPIFY_AUTOCOMPLETE_ENDPOINT = 'https://api.geoapify.com/v1/geocode/autocomplete'
export const GEOAPIFY_REVERSE_ENDPOINT = 'https://api.geoapify.com/v1/geocode/reverse'
export const GEOAPIFY_RESULT_LIMIT = 5
export const GEOAPIFY_TIMEOUT_MS = 10_000

export function geoapifyApiKey() {
  return String(import.meta.env.VITE_GEOAPIFY_API_KEY ?? '').trim()
}

function assertConfigured(apiKey) {
  if (!apiKey) throw new Error('Geoapify is not configured for this site.')
}

function resultName(result) {
  return result.name || result.city || result.address_line1 || result.formatted || 'Unnamed place'
}

function resultDescription(result, name) {
  const parts = [result.city, result.state, result.country]
    .filter(Boolean)
    .filter((part, index, values) => part !== name && values.indexOf(part) === index)
  return parts.join(', ') || result.formatted || ''
}

function normalizeResult(result) {
  const latitude = Number(result.lat)
  const longitude = Number(result.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const name = resultName(result)
  return {
    id: String(result.place_id || `${latitude},${longitude}`),
    name,
    description: resultDescription(result, name),
    latitude,
    longitude,
    timezone: result.timezone?.name || '',
    countryCode: String(result.country_code ?? '').toLowerCase(),
  }
}

function uniqueVisibleResults(results) {
  const seen = new Set()
  return results.filter((result) => {
    const key = `${result.name}\n${result.description}`.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function request(url, { fetchImpl, signal, timeoutMs }) {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response?.ok) throw new Error('Location search is temporarily unavailable.')
    return await response.json()
  } catch (error) {
    if (error?.name === 'AbortError' && !timedOut) throw error
    throw new Error('Location search is temporarily unavailable.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function searchGeoapifyPlaces(query, {
  apiKey = geoapifyApiKey(),
  bias,
  fetchImpl = globalThis.fetch,
  signal,
  language = 'en',
  timeoutMs = GEOAPIFY_TIMEOUT_MS,
} = {}) {
  const text = String(query ?? '').trim()
  if (text.length < 2) return []
  assertConfigured(apiKey)
  if (typeof fetchImpl !== 'function') throw new Error('Location search is unavailable in this browser.')
  const parameters = new URLSearchParams({
    text,
    format: 'json',
    limit: String(GEOAPIFY_RESULT_LIMIT),
    lang: String(language || 'en').slice(0, 2).toLowerCase(),
    type: 'locality',
    apiKey,
  })
  const biasLatitude = Number(bias?.latitude)
  const biasLongitude = Number(bias?.longitude)
  if (Number.isFinite(biasLatitude) && Number.isFinite(biasLongitude)) {
    parameters.set('bias', `proximity:${biasLongitude},${biasLatitude}`)
  }
  const payload = await request(`${GEOAPIFY_AUTOCOMPLETE_ENDPOINT}?${parameters}`, {
    fetchImpl, signal, timeoutMs,
  })
  return uniqueVisibleResults((payload.results ?? []).map(normalizeResult).filter(Boolean))
}

export async function reverseGeoapifyLocation({ latitude, longitude }, {
  apiKey = geoapifyApiKey(),
  fetchImpl = globalThis.fetch,
  signal,
  language = 'en',
  timeoutMs = GEOAPIFY_TIMEOUT_MS,
} = {}) {
  assertConfigured(apiKey)
  if (typeof fetchImpl !== 'function') throw new Error('Location search is unavailable in this browser.')
  const parameters = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
    limit: '1',
    lang: String(language || 'en').slice(0, 2).toLowerCase(),
    apiKey,
  })
  const payload = await request(`${GEOAPIFY_REVERSE_ENDPOINT}?${parameters}`, {
    fetchImpl, signal, timeoutMs,
  })
  return normalizeResult(payload.results?.[0] ?? { lat: latitude, lon: longitude })
}
