export const PRODUCT_LIGHTING = Object.freeze({
  background: 0xf5f7f3,
  hemisphere: Object.freeze({ sky: 0xf8fbff, ground: 0x69716d, intensity: 0.32 }),
  key: Object.freeze({ color: 0xfff8ee, intensity: 1.38, position: [0.24, 0.92, 0.34] }),
  softbox: Object.freeze({
    color: 0xfffcf4,
    intensity: 3.15,
    width: 0.46,
    height: 0.28,
    position: [0.3, 0.12, 0.43],
  }),
  accent: Object.freeze({
    color: 0xd9edf0,
    intensity: 0.75,
    width: 0.12,
    height: 0.42,
    position: [0.34, 0.08, 0.28],
  }),
  rim: Object.freeze({ color: 0xc9dcde, intensity: 0.28, position: [0.34, 0.08, -0.2] }),
  environment: Object.freeze({
    background: 0xbac0bd,
    key: 0xfffcf5,
    top: 0xf4f8f7,
    rim: 0xd9eeee,
    rimWidth: 0.18,
    backdrop: 0xd7dcd9,
  }),
})
