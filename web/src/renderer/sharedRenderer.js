export const RENDERER_CONTRACT_VERSION = 1
export const RENDERER_WIDTH = 800
export const RENDERER_HEIGHT = 480
export const RENDERER_PALETTE_BYTES = RENDERER_WIDTH * RENDERER_HEIGHT

const EXPECTED_EXPORTS = [
  'memory',
  'wind_wasm_contract_version',
  'wind_wasm_width',
  'wind_wasm_height',
  'wind_wasm_palette_bytes',
  'wind_wasm_fixture_count',
  'wind_wasm_scratch_ptr',
  'wind_wasm_scratch_capacity',
  'wind_wasm_output_ptr',
  'wind_wasm_reset',
  'wind_wasm_set_metadata_field',
  'wind_wasm_set_status',
  'wind_wasm_set_day_field',
  'wind_wasm_set_sample_label',
  'wind_wasm_set_sample_values',
  'wind_wasm_render',
  'wind_wasm_render_fixture',
]

export class SharedRendererError extends Error {
  constructor(code, message, options) {
    super(message, options)
    this.name = 'SharedRendererError'
    this.code = code
  }
}

function fail(code, message, cause) {
  throw new SharedRendererError(code, message, cause ? { cause } : undefined)
}

function requireInteger(value, name) {
  if (!Number.isInteger(value)) fail('INVALID_INPUT', `${name} must be an integer`)
  return value
}

function requireString(value, name) {
  if (typeof value !== 'string') fail('INVALID_INPUT', `${name} must be a string`)
  if (value.includes('\0')) fail('INVALID_INPUT', `${name} contains an invalid character`)
  return value
}

function requireFlag(value, name) {
  if (typeof value !== 'boolean' && value !== 0 && value !== 1) {
    fail('INVALID_INPUT', `${name} must be true or false`)
  }
}

function validateInput(input) {
  if (!input || typeof input !== 'object') fail('INVALID_INPUT', 'Renderer input is required')
  if (input.version !== RENDERER_CONTRACT_VERSION) {
    fail('INCOMPATIBLE_CONTRACT', `Renderer input contract ${input.version ?? 'missing'} is not supported`)
  }
  for (const name of ['spotName', 'coordinates', 'provider', 'updatedTime']) requireString(input[name], name)
  for (const name of ['state', 'ageHours', 'batteryPercent', 'displayMode', 'thresholdKt']) {
    requireInteger(input[name], name)
  }
  requireFlag(input.refreshFailed, 'refreshFailed')
  if (!Array.isArray(input.days) || input.days.length !== 5) {
    fail('INVALID_INPUT', 'Renderer input must contain exactly five days')
  }
  input.days.forEach((day, dayIndex) => {
    requireString(day?.day, `days[${dayIndex}].day`)
    requireString(day?.date, `days[${dayIndex}].date`)
    if (!Array.isArray(day.samples) || day.samples.length !== 5) {
      fail('INVALID_INPUT', `days[${dayIndex}] must contain exactly five samples`)
    }
    day.samples.forEach((sample, sampleIndex) => {
      requireString(sample?.time, `days[${dayIndex}].samples[${sampleIndex}].time`)
      for (const name of ['sustainedKt', 'gustKt', 'destinationDegrees', 'weather']) {
        requireInteger(sample[name], `days[${dayIndex}].samples[${sampleIndex}].${name}`)
      }
      requireFlag(sample.available, `days[${dayIndex}].samples[${sampleIndex}].available`)
    })
  })
}

class SharedRenderer {
  #exports
  #encoder = new TextEncoder()

  constructor(exports) {
    this.#exports = exports
    this.width = exports.wind_wasm_width()
    this.height = exports.wind_wasm_height()
    this.paletteBytes = exports.wind_wasm_palette_bytes()
    this.fixtureCount = exports.wind_wasm_fixture_count()
  }

  #assertActive() {
    if (!this.#exports) fail('DISPOSED', 'The shared renderer has been disposed')
  }

  #call(name, ...args) {
    this.#assertActive()
    const result = this.#exports[name](...args)
    if (result !== 0) fail('INVALID_INPUT', `The canonical renderer rejected ${name}`)
  }

  #writeString(value, name) {
    const encoded = this.#encoder.encode(requireString(value, name))
    const pointer = this.#exports.wind_wasm_scratch_ptr()
    const capacity = this.#exports.wind_wasm_scratch_capacity()
    if (encoded.byteLength >= capacity) {
      fail('INVALID_INPUT', `${name} is longer than the shared render contract allows`)
    }
    const target = new Uint8Array(this.#exports.memory.buffer, pointer, capacity)
    target.fill(0)
    target.set(encoded)
  }

  #copyOutput() {
    const pointer = this.#exports.wind_wasm_output_ptr()
    if (!pointer || pointer + this.paletteBytes > this.#exports.memory.buffer.byteLength) {
      fail('RENDER_FAILED', 'The canonical renderer did not publish a complete bitmap')
    }
    return new Uint8Array(
      new Uint8Array(this.#exports.memory.buffer, pointer, this.paletteBytes),
    )
  }

  render(input) {
    this.#assertActive()
    validateInput(input)
    this.#call('wind_wasm_reset', input.version)

    ;['spotName', 'coordinates', 'provider', 'updatedTime'].forEach((name, field) => {
      this.#writeString(input[name], name)
      this.#call('wind_wasm_set_metadata_field', field)
    })
    this.#call(
      'wind_wasm_set_status',
      input.state,
      input.refreshFailed ? 1 : 0,
      input.ageHours,
      input.batteryPercent,
      input.displayMode,
      input.thresholdKt,
    )

    input.days.forEach((day, dayIndex) => {
      for (const [field, name] of ['day', 'date'].entries()) {
        this.#writeString(day[name], `days[${dayIndex}].${name}`)
        this.#call('wind_wasm_set_day_field', dayIndex, field)
      }
      day.samples.forEach((sample, sampleIndex) => {
        this.#writeString(sample.time, `days[${dayIndex}].samples[${sampleIndex}].time`)
        this.#call('wind_wasm_set_sample_label', dayIndex, sampleIndex)
        this.#call(
          'wind_wasm_set_sample_values',
          dayIndex,
          sampleIndex,
          sample.sustainedKt,
          sample.gustKt,
          sample.destinationDegrees,
          sample.available ? 1 : 0,
          sample.weather,
        )
      })
    })

    this.#call('wind_wasm_render')
    return this.#copyOutput()
  }

  renderFixture(fixtureIndex) {
    this.#assertActive()
    if (!Number.isInteger(fixtureIndex) || fixtureIndex < 0 || fixtureIndex >= this.fixtureCount) {
      fail('INVALID_INPUT', `Unknown renderer fixture ${fixtureIndex}`)
    }
    this.#call('wind_wasm_render_fixture', fixtureIndex)
    return this.#copyOutput()
  }

  dispose() {
    this.#exports = null
  }
}

async function getWasmBytes({ wasmBytes, wasmUrl, fetchImpl }) {
  if (wasmBytes) return wasmBytes
  const response = await fetchImpl(wasmUrl)
  if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`)
  return response.arrayBuffer()
}

export async function loadSharedRenderer({
  wasmBytes,
  wasmUrl = '/renderer/wind-renderer.wasm',
  fetchImpl = globalThis.fetch,
  instantiate = WebAssembly.instantiate,
} = {}) {
  try {
    if (!wasmBytes && typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable')
    const bytes = await getWasmBytes({ wasmBytes, wasmUrl, fetchImpl })
    const result = await instantiate(bytes, {})
    const instance = result instanceof WebAssembly.Instance ? result : result.instance
    const exports = instance?.exports
    if (!exports) throw new Error('WebAssembly instance has no exports')
    const missingExport = EXPECTED_EXPORTS.find((name) => !(name in exports))
    if (missingExport) throw new Error(`WebAssembly export ${missingExport} is missing`)
    exports._initialize?.()

    const version = exports.wind_wasm_contract_version()
    const width = exports.wind_wasm_width()
    const height = exports.wind_wasm_height()
    const paletteBytes = exports.wind_wasm_palette_bytes()
    if (version !== RENDERER_CONTRACT_VERSION) {
      fail('INCOMPATIBLE_RENDERER', `Renderer contract ${version} is not supported`)
    }
    if (width !== RENDERER_WIDTH || height !== RENDERER_HEIGHT || paletteBytes !== RENDERER_PALETTE_BYTES) {
      fail('INCOMPATIBLE_RENDERER', 'Renderer dimensions do not match the WindScout display')
    }
    return new SharedRenderer(exports)
  } catch (error) {
    if (error instanceof SharedRendererError) throw error
    fail('LOAD_FAILED', 'The WindScout screen renderer could not be loaded', error)
  }
}
