export function verifyReleaseSources({ manifest, candidates }) {
  const contributingAdapters = new Set(candidates
    .filter((candidate) => candidate.releaseEligible)
    .map((candidate) => candidate.source))
  for (const adapter of contributingAdapters) {
    const source = manifest.sources?.find((candidate) => candidate.adapter === adapter)
    if (!source || source.releaseEligible !== true || source.rights?.redistribution !== true) {
      throw new Error(`Source adapter ${adapter} is not release-eligible.`)
    }
    const required = [source.rights.license, source.rights.attribution]
    if (required.some((value) => typeof value !== 'string' || !value.trim())) {
      throw new Error(`Source adapter ${adapter} has incomplete rights metadata.`)
    }
  }
  return true
}

export function verifyReleaseSample(sample, validationResults) {
  const accepted = validationResults.filter((result) => result.outcome === 'accepted' && result.trustedLocation !== true)
  const required = Math.ceil(accepted.length * 0.1)
  if (sample?.automaticAccepts !== accepted.length || sample?.reviewed < required) {
    throw new Error(`Release sample must review at least ${required} of ${accepted.length} automatic accepts.`)
  }
  const acceptedIds = new Set(accepted.map((result) => result.candidateId))
  const reviewedIds = new Set()
  for (const item of sample.sample ?? []) {
    if (!acceptedIds.has(item.candidateId) || reviewedIds.has(item.candidateId) || item.verdict !== 'pass') {
      throw new Error('Release sample contains an invalid, duplicate, or unresolved review entry.')
    }
    reviewedIds.add(item.candidateId)
  }
  if (reviewedIds.size < required || (sample.systematicIssues?.length ?? 0) > 0) {
    throw new Error('Release sample has unresolved systematic issues.')
  }
  return true
}
