export function stableSpotId(sourceIdentity) {
  let hash = 2166136261
  for (const character of String(sourceIdentity)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `spot-${(hash >>> 0).toString(36)}`
}

