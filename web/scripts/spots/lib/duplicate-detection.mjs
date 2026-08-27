import { candidateFitsRenderer } from './spot-validation.mjs'

function foldName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

const FEATURE_PRIORITY = new Map([
  ['spot-collection', 0],
  ['watersport-location', 1],
  ['beach', 2],
  ['launch', 3],
  ['marina', 4],
  ['club', 5],
  ['sports-centre', 6],
])

function compareDuplicateCandidates(left, right) {
  return Number(candidateFitsRenderer(right)) - Number(candidateFitsRenderer(left)) ||
    Number(right.releaseEligible === true) - Number(left.releaseEligible === true) ||
    Number(right.source === 'varun') - Number(left.source === 'varun') ||
    (FEATURE_PRIORITY.get(left.featureType) ?? 99) - (FEATURE_PRIORITY.get(right.featureType) ?? 99) ||
    left.id.localeCompare(right.id)
}

export function distanceMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180
  const lat1 = radians(left.latitude)
  const lat2 = radians(right.latitude)
  const deltaLat = radians(right.latitude - left.latitude)
  const deltaLon = radians(right.longitude - left.longitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function detectDuplicates(candidates) {
  const groups = []
  const foldedNames = candidates.map((candidate) => foldName(candidate.name))
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex]
      const distance = distanceMeters(left, right)
      if (distance > 5000) continue
      const reasons = []
      if (distance <= 75) reasons.push('within-75m')
      if (foldedNames[leftIndex] && foldedNames[leftIndex] === foldedNames[rightIndex]) reasons.push('equivalent-name-within-5km')
      if (reasons.length) groups.push({
        leftId: left.id,
        rightId: right.id,
        distanceMeters: Math.round(distance),
        reasons,
      })
    }
  }
  return groups.sort((left, right) => `${left.leftId}:${left.rightId}`.localeCompare(`${right.leftId}:${right.rightId}`))
}

export function selectDuplicateSuppressions(candidates, groups) {
  const parent = new Map(candidates.map((candidate) => [candidate.id, candidate.id]))
  const root = (id) => {
    let current = id
    while (parent.get(current) !== current) current = parent.get(current)
    while (parent.get(id) !== current) {
      const next = parent.get(id)
      parent.set(id, current)
      id = next
    }
    return current
  }
  for (const group of groups) {
    if (!parent.has(group.leftId) || !parent.has(group.rightId)) continue
    const leftRoot = root(group.leftId)
    const rightRoot = root(group.rightId)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }
  const components = new Map()
  for (const candidate of candidates) {
    const componentId = root(candidate.id)
    const component = components.get(componentId) ?? []
    component.push(candidate)
    components.set(componentId, component)
  }
  const suppressed = new Set()
  for (const component of components.values()) {
    if (component.length < 2) continue
    const [, ...duplicates] = component.sort(compareDuplicateCandidates)
    for (const duplicate of duplicates) suppressed.add(duplicate.id)
  }
  return suppressed
}
