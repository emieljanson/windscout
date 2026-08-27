#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifyReleaseSample, verifyReleaseSources } from './lib/release-gates.mjs'

await import('./build-catalog.mjs')

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [manifest, candidateData, validationData, releaseSample] = await Promise.all([
  readFile(path.join(webRoot, 'data/spots/source-manifest.json'), 'utf8').then(JSON.parse),
  readFile(path.join(webRoot, 'data/spots/candidates.json'), 'utf8').then(JSON.parse),
  readFile(path.join(webRoot, 'data/spots/validation-results.json'), 'utf8').then(JSON.parse),
  readFile(path.join(webRoot, 'data/spots/release-sample.json'), 'utf8').then(JSON.parse),
])
verifyReleaseSources({ manifest, candidates: candidateData.candidates ?? [] })
verifyReleaseSample(releaseSample, validationData.results ?? [])
console.log('Catalog source rights and release sample are complete.')
