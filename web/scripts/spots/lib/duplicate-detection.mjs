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
