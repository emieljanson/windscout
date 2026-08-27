import { createHash } from 'node:crypto'

const COUNTRY_ALIASES = new Map([
  ['the netherlands', 'nl'],
  ['czech republic', 'cz'],
  ['united states of america', 'us'],
  ['usa', 'us'],
  ['uk', 'gb'],
])

let countryNames

function countryCode(value) {
  const clean = String(value ?? '').trim().toLocaleLowerCase('en')
  if (!clean) return ''
  if (/^[a-z]{2}$/.test(clean)) return clean
  if (COUNTRY_ALIASES.has(clean)) return COUNTRY_ALIASES.get(clean)
  if (!countryNames) {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    countryNames = new Map()
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second)
        const name = displayNames.of(code)
        if (name && name !== code) countryNames.set(name.toLocaleLowerCase('en'), code.toLowerCase())
      }
    }
  }
  return countryNames.get(clean) ?? ''
}

function validTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format()
    return typeof timezone === 'string' && Boolean(timezone)
  } catch {
    return false
  }
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)
}

export function classifyCandidate(candidate, evidence, { duplicateReasons = [] } = {}) {
  const reasons = []
  if (candidate.releaseEligible !== true) reasons.push('source-rights')
  const sourceCountry = countryCode(candidate.country)
  const observedCountry = countryCode(evidence?.reverse?.countryCode)
  if (!observedCountry) reasons.push('country-missing')
  else if (candidate.country && !sourceCountry) reasons.push('country-unmapped')
  else if (sourceCountry && sourceCountry !== observedCountry) reasons.push('country-conflict')
  if (!validTimezone(evidence?.reverse?.timezone)) reasons.push('timezone-invalid')
  if (evidence?.water?.nearby !== true) reasons.push('water-not-found')
  reasons.push(...(candidate.flags ?? []), ...duplicateReasons)
  const uniqueReasons = [...new Set(reasons)].sort()
  const outcome = uniqueReasons.includes('source-rights')
    ? 'rejected'
    : uniqueReasons.length ? 'needs-review' : 'accepted'
  return {
    candidateId: candidate.id,
    outcome,
    reasons: uniqueReasons,
    timezone: validTimezone(evidence?.reverse?.timezone) ? evidence.reverse.timezone : '',
    countryCode: observedCountry,
    evidenceFingerprint: fingerprint({
      candidate: {
        source: candidate.source,
        sourceId: candidate.sourceId,
        name: candidate.name,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        activities: candidate.activities,
        featureType: candidate.featureType,
        releaseEligible: candidate.releaseEligible,
      },
      evidence,
      duplicateReasons: [...duplicateReasons].sort(),
    }),
  }
}

