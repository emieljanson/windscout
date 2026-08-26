import { execFileSync } from 'node:child_process'
import { chmod, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const EMSCRIPTEN_IMAGE = 'emscripten/emsdk:4.0.10'
const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = dirname(webRoot)
const outputDirectory = join(webRoot, 'public', 'renderer')
const temporaryOutput = join(outputDirectory, 'wind-renderer.tmp.wasm')
const finalOutput = join(outputDirectory, 'wind-renderer.wasm')

const sources = [
  'web/wasm/wind_renderer_bridge.c',
  'shared/renderer-fixtures/wind_renderer_fixture.c',
  'firmware/main/wind_renderer.c',
  'firmware/main/wind_font.c',
  'firmware/main/fonts/berkeley_mono_12.c',
  'firmware/main/fonts/berkeley_mono_14.c',
  'firmware/main/fonts/berkeley_mono_32.c',
  'firmware/main/fonts/berkeley_mono_bold_15.c',
  'firmware/main/fonts/berkeley_mono_bold_condensed_15.c',
  'firmware/main/fonts/inter_bold_15.c',
  'firmware/main/fonts/inter_16.c',
  'firmware/main/fonts/inter_28.c',
]

const exportedFunctions = [
  '_wind_wasm_contract_version',
  '_wind_wasm_width',
  '_wind_wasm_height',
  '_wind_wasm_palette_bytes',
  '_wind_wasm_fixture_count',
  '_wind_wasm_scratch_ptr',
  '_wind_wasm_scratch_capacity',
  '_wind_wasm_output_ptr',
  '_wind_wasm_reset',
  '_wind_wasm_set_metadata_field',
  '_wind_wasm_set_status',
  '_wind_wasm_set_day_field',
  '_wind_wasm_set_sample_label',
  '_wind_wasm_set_sample_values',
  '_wind_wasm_render',
  '_wind_wasm_render_fixture',
]

async function main() {
  await mkdir(outputDirectory, { recursive: true })
  await rm(temporaryOutput, { force: true })

  const outputInContainer = relative(repositoryRoot, temporaryOutput)
  const args = [
    'run', '--rm', '--platform', 'linux/amd64',
    '--volume', `${repositoryRoot}:/src`,
    '--workdir', '/src',
    EMSCRIPTEN_IMAGE,
    'emcc',
    ...sources,
    '-Ifirmware/main',
    '-Ishared/renderer-fixtures',
    '-std=c11',
    '-Wall',
    '-Wextra',
    '-Werror',
    // O2 is deliberate: emsdk 4.0.10's O3 compiler pass crashes under the
    // amd64 emulation used on Apple Silicon, while O2 remains deterministic.
    '-O2',
    '--no-entry',
    '-sSTANDALONE_WASM=1',
    '-sALLOW_MEMORY_GROWTH=0',
    '-sINITIAL_MEMORY=8388608',
    '-sSTACK_SIZE=262144',
    `-sEXPORTED_FUNCTIONS=${JSON.stringify(exportedFunctions)}`,
    '-Wl,--strip-all',
    '-o', outputInContainer,
  ]

  try {
    execFileSync('docker', args, { cwd: repositoryRoot, stdio: 'inherit' })
    const result = await stat(temporaryOutput)
    if (result.size === 0) throw new Error('Emscripten produced an empty module')
    await rename(temporaryOutput, finalOutput)
    await chmod(finalOutput, 0o644)
    console.log(`Built ${relative(repositoryRoot, finalOutput)} with ${EMSCRIPTEN_IMAGE} (${result.size} bytes)`)
  } catch (error) {
    await rm(temporaryOutput, { force: true })
    throw error
  }
}

await main()
