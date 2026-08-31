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
