import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { resolveLocalBundle, selectLocalFirmwareBuild } from './local-installer-build.mjs'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryDir = path.resolve(webDir, '..')
const partitionsPath = path.join(repositoryDir, 'firmware', 'partitions.csv')
const outputDir = path.join(webDir, 'public', 'firmware')
const generatorPath = path.join(repositoryDir, 'firmware', 'scripts', 'generate_installer_manifest.py')

let selected
try {
  selected = selectLocalFirmwareBuild(repositoryDir)
} catch (error) {
  const message = `[installer] ${error.message}`
  if (/^No complete local/.test(error.message)) {
    console.warn(`${message} Real-device installation is unavailable until the E1002 firmware has been built.`)
    process.exit(0)
  }
  console.error(message)
  process.exit(1)
}

const { buildDir } = selected
let localBundle
try {
  localBundle = resolveLocalBundle(selected, outputDir)
} catch (error) {
  console.error(`[installer] ${error.message}`)
  process.exit(1)
}
const { version } = localBundle
if (localBundle.reuseExisting) {
  const pointer = {
    version,
    manifest: `${version}/installer-manifest.json`,
    sha256: createHash('sha256').update(localBundle.manifestBytes).digest('hex'),
  }
  writeFileSync(path.join(outputDir, 'latest.json'), `${JSON.stringify(pointer, null, 2)}\n`)
  console.log(`[installer] Verified local E1002 firmware ${version} is already ready.`)
  process.exit(0)
}
const python = process.env.PYTHON || 'python3'
const result = spawnSync(python, [
  generatorPath,
  '--build-dir', buildDir,
  '--partitions', partitionsPath,
  '--output', outputDir,
  '--version', version,
], { stdio: 'inherit' })

if (result.error) {
  console.error(`[installer] Could not prepare the local firmware bundle: ${result.error.message}`)
  process.exit(1)
}

if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`[installer] Local E1002 firmware ${version} is ready.`)
