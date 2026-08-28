export const RENDERER_CONTRACT_VERSION = 3
export const RENDERER_WIDTH = 800
export const RENDERER_HEIGHT = 480
export const RENDERER_PALETTE_BYTES = RENDERER_WIDTH * RENDERER_HEIGHT
export const RENDERER_RGBA_BYTES = RENDERER_PALETTE_BYTES * 4

export const DISPLAY_MODES = Object.freeze({
  'background-fade': 0,
  'threshold-line': 1,
  solid: 2,
})

export const MIN_THRESHOLD = 5
export const DEFAULT_THRESHOLD = 17
export const MAX_THRESHOLD = 35

export const RENDERER_TEXT_CAPACITIES = Object.freeze({
  spotName: 96,
  coordinates: 64,
  provider: 32,
  updatedTime: 32,
  day: 16,
  date: 16,
  time: 8,
})

const encoder = new TextEncoder()

export function textFitsRenderer(value, capacity) {
  return typeof value === 'string' && !value.includes('\0') && encoder.encode(value).byteLength < capacity
}
