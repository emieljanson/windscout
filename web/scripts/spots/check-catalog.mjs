#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifyReleaseSample, verifyReleaseSources } from './lib/release-gates.mjs'

await import('./build-catalog.mjs')

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [manifest, candidateData, validationData, releaseSample, attributionHtml] = await Promise.all([
  readFile(path.join(webRoot, 'data/spots/source-manifest.json'), 'utf8').then(JSON.parse),
  readFile(path.join(webRoot, 'data/spots/candidates.json'), 'utf8').then(JSON.parse),
  readFile(path.join(webRoot, 'data/spots/validation-results.json'), 'utf8').then(JSON.parse),
  readFile(path.join(webRoot, 'data/spots/release-sample.json'), 'utf8').then(JSON.parse),
  readFile(path.join(webRoot, 'public/data-sources.html'), 'utf8'),
])
verifyReleaseSources({ manifest, candidates: candidateData.candidates ?? [], attributionHtml })
verifyReleaseSample(releaseSample, validationData.results ?? [])
console.log('Catalog source rights, public attribution, and release sample are complete.')
