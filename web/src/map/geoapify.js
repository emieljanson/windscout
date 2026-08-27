export const GEOAPIFY_AUTOCOMPLETE_ENDPOINT = 'https://api.geoapify.com/v1/geocode/autocomplete'
export const GEOAPIFY_REVERSE_ENDPOINT = 'https://api.geoapify.com/v1/geocode/reverse'
export const GEOAPIFY_RESULT_LIMIT = 5

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
  }
}

async function request(url, { fetchImpl, signal }) {
  const response = await fetchImpl(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response?.ok) throw new Error('Location search is temporarily unavailable.')
  return response.json()
}

export async function searchGeoapifyPlaces(query, {
  apiKey = geoapifyApiKey(),
  fetchImpl = globalThis.fetch,
  signal,
  language = 'en',
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
    apiKey,
  })
  const payload = await request(`${GEOAPIFY_AUTOCOMPLETE_ENDPOINT}?${parameters}`, { fetchImpl, signal })
  return (payload.results ?? []).map(normalizeResult).filter(Boolean)
}

export async function reverseGeoapifyLocation({ latitude, longitude }, {
  apiKey = geoapifyApiKey(),
  fetchImpl = globalThis.fetch,
  signal,
  language = 'en',
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
  const payload = await request(`${GEOAPIFY_REVERSE_ENDPOINT}?${parameters}`, { fetchImpl, signal })
  return normalizeResult(payload.results?.[0] ?? { lat: latitude, lon: longitude })
}
