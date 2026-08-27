#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { detectDuplicates } from './lib/duplicate-detection.mjs'
import { cacheKeyForCandidate, collectGeoapifyEvidence, requiredGeoapifyCredits } from './lib/geoapify-validation.mjs'
import { classifyCandidate } from './lib/spot-validation.mjs'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dataRoot = path.join(webRoot, 'data/spots')
const candidatesPath = path.join(dataRoot, 'candidates.json')
const manifestPath = path.join(dataRoot, 'source-manifest.json')
const cachePath = path.join(dataRoot, 'validation-cache.json')
const resultsPath = path.join(dataRoot, 'validation-results.json')
const checkOnly = process.argv.includes('--check')

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback
    throw error
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, stableJson(value))
  await rename(temporaryPath, filePath)
}

async function localApiKey() {
  if (process.env.VITE_GEOAPIFY_API_KEY) return process.env.VITE_GEOAPIFY_API_KEY.trim()
  try {
    const env = await readFile(path.join(webRoot, '.env.local'), 'utf8')
    return env.match(/^VITE_GEOAPIFY_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? ''
  } catch {
    return ''
  }
}

const [input, manifest] = await Promise.all([readJson(candidatesPath), readJson(manifestPath)])
const candidates = input.candidates ?? []
const releaseCandidates = candidates.filter((candidate) => candidate.releaseEligible)
const trustedSources = new Set((manifest.sources ?? [])
  .filter((source) => source.releaseEligible === true && source.validation?.mode === 'trusted-location')
  .map((source) => source.adapter))
const trustedCandidates = releaseCandidates.filter((candidate) => trustedSources.has(candidate.source))
const verifiedCandidates = releaseCandidates.filter((candidate) => !trustedSources.has(candidate.source))
const cache = await readJson(cachePath, {})
const verifiedCredits = requiredGeoapifyCredits(verifiedCandidates, cache)
const trustedCredits = requiredGeoapifyCredits(trustedCandidates, cache, { includeWater: false })
const creditsRequired = verifiedCredits + trustedCredits
const creditBudget = Number(process.env.SPOT_VALIDATION_CREDIT_BUDGET ?? 3000)

let requestStats = { requests: 0, cacheHits: verifiedCandidates.length * 2 + trustedCandidates.length }
if (checkOnly) {
  if (creditsRequired) throw new Error(`Validation cache is incomplete: ${creditsRequired} Geoapify credits still required.`)
} else {
  if (creditsRequired > creditBudget) {
    throw new Error(`Validation requires ${creditsRequired} Geoapify credits; budget is ${creditBudget}.`)
  }
  let persistChain = Promise.resolve()
  const apiKey = await localApiKey()
  const options = {
    cache, apiKey, delayMs: Number(process.env.SPOT_VALIDATION_DELAY_MS ?? 210),
    concurrency: Number(process.env.SPOT_VALIDATION_CONCURRENCY ?? 3),
    persist: (nextCache) => {
      persistChain = persistChain.then(() => atomicWrite(cachePath, nextCache))
      return persistChain
    },
  }
  const verifiedStats = verifiedCredits
    ? await collectGeoapifyEvidence(verifiedCandidates, { ...options, creditBudget })
    : { requests: 0, cacheHits: verifiedCandidates.length * 2 }
  const trustedStats = trustedCredits
    ? await collectGeoapifyEvidence(trustedCandidates, {
        ...options, creditBudget: creditBudget - verifiedStats.requests, includeWater: false,
      })
    : { requests: 0, cacheHits: trustedCandidates.length }
  requestStats = {
    requests: verifiedStats.requests + trustedStats.requests,
    cacheHits: verifiedStats.cacheHits + trustedStats.cacheHits,
  }
}

const duplicateGroups = detectDuplicates(candidates)
const duplicateReasons = new Map()
for (const group of duplicateGroups) {
  for (const id of [group.leftId, group.rightId]) {
    const reasons = duplicateReasons.get(id) ?? []
    reasons.push(...group.reasons.map((reason) => `duplicate:${reason}`))
    duplicateReasons.set(id, reasons)
  }
}

const results = candidates.map((candidate) => classifyCandidate(
  candidate,
  cache[cacheKeyForCandidate(candidate)] ?? {},
  {
    duplicateReasons: duplicateReasons.get(candidate.id) ?? [],
    trustedLocation: trustedSources.has(candidate.source),
  },
)).sort((left, right) => left.candidateId.localeCompare(right.candidateId))

const totals = results.reduce((counts, result) => {
  counts[result.outcome] = (counts[result.outcome] ?? 0) + 1
  return counts
}, {})
const output = { version: 1, totals, duplicateGroups, results }

if (checkOnly) {
  if (await readFile(resultsPath, 'utf8') !== stableJson(output)) throw new Error('data/spots/validation-results.json is stale.')
} else {
  await atomicWrite(resultsPath, output)
}

console.log(JSON.stringify({
  candidates: candidates.length,
  creditsRequired,
  ...requestStats,
  outcomes: totals,
  duplicateGroups: duplicateGroups.length,
  trustedLocations: trustedCandidates.length,
}, null, 2))
