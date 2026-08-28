import { compareCandidates, normalizeActivities, normalizeCandidate } from './candidate-normalization.mjs'

const BLOCKED_KEYS = ['shop', 'office']
const PHYSICAL_FEATURES = [
  ['club', 'club'],
  ['school', 'school'],
  ['leisure', 'sports-centre'],
  ['natural', 'beach'],
  ['waterway', 'launch'],
  ['man_made', 'launch'],
  ['amenity', 'launch'],
]

function featureType(tags) {
  if (BLOCKED_KEYS.some((key) => tags[key])) return ''
  if (tags.tourism === 'travel_agency') return ''
  if (tags.leisure === 'marina') return 'marina'
  for (const [key, type] of PHYSICAL_FEATURES) {
    if (!tags[key]) continue
    if (key === 'leisure' && !['sports_centre', 'marina', 'slipway'].includes(tags[key])) continue
    if (key === 'amenity' && !['boat_rental', 'club', 'slipway'].includes(tags[key])) continue
    return type
  }
  if (tags.sport) return 'watersport-location'
  return ''
}

function coordinates(element) {
  const latitude = Number(element?.lat ?? element?.center?.lat)
  const longitude = Number(element?.lon ?? element?.center?.lon)
  return { latitude, longitude }
}

function haversineKm(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180
  const lat1 = radians(left.latitude)
  const lat2 = radians(right.latitude)
  const deltaLat = radians(right.latitude - left.latitude)
  const deltaLon = radians(right.longitude - left.longitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function geometryFlags(bounds) {
  if (!bounds) return []
  const diagonal = haversineKm(
    { latitude: Number(bounds.minlat), longitude: Number(bounds.minlon) },
    { latitude: Number(bounds.maxlat), longitude: Number(bounds.maxlon) },
  )
  return Number.isFinite(diagonal) && diagonal > 10 ? ['large-geometry'] : []
}

export function importOsmElements(elements, { releaseEligible = true } = {}) {
  const candidates = []
  const exclusions = []
  const failures = []
  for (const element of Array.isArray(elements) ? elements : []) {
    const sourceId = `${element?.type ?? 'unknown'}/${element?.id ?? 'unknown'}`
    const tags = element?.tags ?? {}
    const activities = normalizeActivities(tags.sport || tags.activity || tags['sport:secondary'])
    if (!activities.length) {
      exclusions.push({ sourceId, reason: 'unsupported-activity' })
      continue
    }
    const type = featureType(tags)
    if (!type) {
      exclusions.push({ sourceId, reason: 'non-physical-facility' })
      continue
    }
    try {
      candidates.push(normalizeCandidate({
        source: 'osm',
        sourceId,
        name: tags.name,
        country: tags['addr:country'] || tags['is_in:country_code'] || '',
        ...coordinates(element),
        activities,
        featureType: type,
        sourceRef: `https://www.openstreetmap.org/${sourceId}`,
        releaseEligible,
        flags: geometryFlags(element.bounds),
      }))
    } catch (error) {
      failures.push({ sourceId, reason: error.message })
    }
  }
  const bySourceId = (left, right) => left.sourceId.localeCompare(right.sourceId)
  return {
    candidates: candidates.sort(compareCandidates),
    exclusions: exclusions.sort(bySourceId),
    failures: failures.sort(bySourceId),
  }
}
