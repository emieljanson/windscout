import { createHash } from 'node:crypto'

import {
  compareCandidates,
  normalizeCandidate,
  parseGoogleCoordinates,
} from './candidate-normalization.mjs'

function compactHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

function sourceId(record) {
  const windguruId = String(record?.windguruUrl ?? '').match(/windguru\.(?:cz|com)\/(?:int\/index\.php\?sc=)?(\d+)/i)?.[1]
  return windguruId ? `windguru-${windguruId}` : `record-${compactHash(`${record?.name}\n${record?.country}\n${record?.locationUrl}`)}`
}

async function resolveCoordinates(locationUrl, { fetchImpl, resolutions }) {
  const direct = parseGoogleCoordinates(locationUrl)
  if (direct) return direct
  if (resolutions[locationUrl]) return resolutions[locationUrl]
  if (typeof fetchImpl !== 'function') return null
  const response = await fetchImpl(locationUrl, { redirect: 'follow', headers: { 'User-Agent': 'Windscout spot importer' } })
  if (!response?.ok || !response.url) return null
  const resolved = parseGoogleCoordinates(response.url)
  if (resolved) resolutions[locationUrl] = resolved
  return resolved
}

export async function importVarunRecords(records, {
  fetchImpl = globalThis.fetch,
  resolutions = {},
  releaseEligible = false,
} = {}) {
  const candidates = []
  const failures = []
  for (const [index, record] of (Array.isArray(records) ? records : []).entries()) {
    const id = sourceId(record)
    if (!String(record?.name ?? '').trim()) {
      failures.push({ sourceId: id, index, reason: 'missing-name' })
      continue
    }
    let coordinates
    try {
      coordinates = await resolveCoordinates(String(record.locationUrl ?? ''), { fetchImpl, resolutions })
    } catch {
      failures.push({ sourceId: id, index, reason: 'location-resolution-failed' })
      continue
    }
    if (!coordinates) {
      failures.push({ sourceId: id, index, reason: 'unresolved-location' })
      continue
    }
    try {
      candidates.push(normalizeCandidate({
        source: 'varun',
        sourceId: id,
        name: record.name,
        country: record.country,
        ...coordinates,
        activities: ['kitesurfing'],
        featureType: 'spot-collection',
        sourceRef: record.windguruUrl || record.locationUrl,
        releaseEligible,
      }))
    } catch (error) {
      failures.push({ sourceId: id, index, reason: error.message })
    }
  }
  return {
    candidates: candidates.sort(compareCandidates),
    failures: failures.sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    resolutions,
  }
}

