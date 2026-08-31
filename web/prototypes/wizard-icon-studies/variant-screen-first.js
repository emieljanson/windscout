import { startAnimations, studyMarkup } from './icon-system.js'

const usbPort = ['00000000', '00111100', '01000010', '10000001', '10111101', '10000001', '01000010', '00111100']
const openScreen = ['00000000', '11111111', '10000001', '10011001', '10011001', '10000001', '11111111', '00111100']
const selectedScreenFrames = [
  ['11000011', '10000001', '00111100', '00100100', '00100100', '00111100', '10000001', '11000011'],
  ['01100110', '01000010', '10111101', '00100100', '00100100', '10111101', '01000010', '01100110'],
  ['00111100', '00100100', '11111111', '10100101', '10100101', '11111111', '00100100', '00111100'],
  ['01100110', '01000010', '10111101', '00100100', '00100100', '10111101', '01000010', '01100110'],
]
const thinDownload = ['00011000', '00011000', '00011000', '00111100', '01111110', '00000000', '00111100', '00000000']
const windOnScreen = ['11111111', '10000001', '10100001', '10011101', '11100001', '10000101', '11111111', '00111100']

const config = {
  name: 'Screen First',
  className: 'screen-first',
  familyClass: 'ghost',
  flavor: 'grid',
  frameDuration: 140,
  headline: 'A landscape screen with air.',
  description: 'A more open reTerminal glyph: wide screen, strong lower rail and fewer filled cells. The display remains the anchor across checking, confirming and forecast verification.',
  stepOverrides: {
    connect: { pattern: usbPort, motion: 'assemble' },
    choose: { pattern: selectedScreenFrames[0], frames: selectedScreenFrames, motion: 'orbit', loop: true },
    check: { pattern: openScreen, motion: 'scan', loop: true },
    confirm: { pattern: openScreen, motion: 'assemble' },
    review: { pattern: thinDownload, motion: 'drop' },
    prepare: {
      pattern: ['00000000', '00010000', '01000010', '00001000', '00100001', '10000100', '00010010', '00000000'],
      motion: 'flicker', loop: true,
    },
    write: { pattern: thinDownload, motion: 'fall', loop: true },
    verify: { pattern: windOnScreen, motion: 'screen sweep', loop: true },
  },
}

export const screenFirst = {
  render: () => studyMarkup(config),
  start: (root) => startAnimations(root, config),
}
