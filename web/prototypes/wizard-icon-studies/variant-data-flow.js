import { startAnimations, studyMarkup } from './icon-system.js'

const usbPort = ['00000000', '00111100', '01000010', '10000001', '10111101', '10000001', '01000010', '00111100']
const compactDevice = ['00000000', '00111100', '01000010', '01011010', '01011010', '01000010', '01111110', '00011000']
const orbitFrames = [
  ['10000001', '00000000', '00111100', '00100100', '00100100', '00111100', '00000000', '10000001'],
  ['00010000', '10000000', '00111100', '00100100', '00100100', '00111100', '00000001', '00001000'],
  ['00000000', '01000000', '00111100', '10100101', '10100101', '00111100', '00000010', '00000000'],
  ['00001000', '00000001', '00111100', '00100100', '00100100', '00111100', '10000000', '00010000'],
]
const packetFrames = [
  ['00000000', '11000000', '11000000', '00000100', '00100000', '00000001', '00001000', '00000000'],
  ['00000000', '00000011', '00100011', '00000000', '10001000', '00000000', '01000000', '00000100'],
  ['00000000', '00011000', '00011000', '10000000', '00000010', '00100000', '00000100', '00000000'],
  ['00000000', '00000001', '01000000', '00011000', '00011010', '00000000', '10000000', '00000100'],
  ['00000000', '00100000', '00000100', '00000000', '01000001', '00000000', '00011000', '00011000'],
]
const writeFrames = [
  ['00011000', '00011000', '00111100', '01111110', '00011000', '00000000', '01111110', '00000000'],
  ['00000000', '00011000', '00011000', '00111100', '01111110', '00011000', '01111110', '00000000'],
  ['00000000', '00000000', '00011000', '00011000', '00111100', '01111110', '01111110', '00000000'],
]
const forecastFrames = [
  ['00000000', '01100000', '00011000', '11100110', '00011000', '01100000', '00000000', '00000000'],
  ['00000000', '00110000', '00001100', '01110011', '00001100', '00110000', '00000000', '00000000'],
  ['00000000', '00011000', '00000110', '00111001', '00000110', '00011000', '00000000', '00000000'],
  ['00000001', '00000011', '00000110', '01001100', '01111000', '00110000', '00000000', '00000000'],
]

const config = {
  name: 'Data Flow',
  className: 'data-flow',
  familyClass: 'ghost',
  flavor: 'grid',
  frameDuration: 115,
  headline: 'One packet travels through setup.',
  description: 'Hardware remains literal, while technical progress is told through a recurring 2×2 packet. Preparation is intentionally irregular; writing becomes directional; verification resolves into a clear wind-to-check sequence.',
  stepOverrides: {
    connect: { pattern: usbPort, motion: 'assemble' },
    choose: { pattern: orbitFrames[0], frames: orbitFrames, motion: 'orbit', loop: true },
    check: { pattern: compactDevice, motion: 'scan', loop: true },
    confirm: { pattern: compactDevice, motion: 'assemble' },
    review: { pattern: writeFrames[0], motion: 'drop' },
    prepare: { pattern: packetFrames.at(-1), frames: packetFrames, motion: 'packet noise', loop: true },
    write: { pattern: writeFrames.at(-1), frames: writeFrames, motion: 'packet down', loop: true },
    verify: { pattern: forecastFrames.at(-1), frames: forecastFrames, motion: 'wind → check', loop: true },
  },
}

export const dataFlow = {
  render: () => studyMarkup(config),
  start: (root) => startAnimations(root, config),
}
