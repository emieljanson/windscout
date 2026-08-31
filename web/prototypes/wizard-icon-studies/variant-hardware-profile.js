import { startAnimations, studyMarkup } from './icon-system.js'

const usbPort = ['00000000', '00111100', '01000010', '10000001', '10111101', '10000001', '01000010', '00111100']
const landscapeDevice = ['00000000', '01111110', '11000011', '11011011', '11011011', '11000011', '11111111', '00111100']
const orbitFrames = [
  ['11000011', '10000001', '00000000', '00011000', '00011000', '00000000', '10000001', '11000011'],
  ['01100110', '01000010', '10000001', '00011000', '00011000', '10000001', '01000010', '01100110'],
  ['00111100', '00100100', '10000001', '10011001', '10011001', '10000001', '00100100', '00111100'],
  ['01100110', '01000010', '10000001', '00011000', '00011000', '10000001', '01000010', '01100110'],
]
const arrowToLine = ['00011000', '00011000', '00111100', '01111110', '00011000', '00000000', '01111110', '00000000']
const arrowFrames = [
  ['00011000', '00111100', '01111110', '00011000', '00000000', '00000000', '01111110', '00000000'],
  ['00000000', '00011000', '00111100', '01111110', '00011000', '00000000', '01111110', '00000000'],
  ['00000000', '00000000', '00011000', '00111100', '01111110', '00011000', '01111110', '00000000'],
]
const verifyDevice = ['00000000', '01111110', '10000001', '10000001', '10001001', '10011001', '11110001', '01111110']

const config = {
  name: 'Hardware Profile',
  className: 'hardware',
  familyClass: 'ghost',
  flavor: 'grid',
  frameDuration: 130,
  headline: 'Recognisable hardware first.',
  description: 'Literal USB-C and landscape reTerminal silhouettes. The device stays fixed while selection brackets orbit around it; technical actions move through the hardware instead of replacing it.',
  stepOverrides: {
    connect: { pattern: usbPort, motion: 'assemble' },
    choose: { pattern: orbitFrames[0], frames: orbitFrames, motion: 'orbit', loop: true },
    check: { pattern: landscapeDevice, motion: 'scan', loop: true },
    confirm: { pattern: landscapeDevice, motion: 'assemble' },
    review: { pattern: arrowToLine, motion: 'drop' },
    prepare: {
      pattern: ['00000000', '00100010', '00001000', '01000001', '00010100', '10000010', '00101000', '00000000'],
      motion: 'scatter', loop: true,
    },
    write: { pattern: arrowToLine, frames: arrowFrames, motion: 'write down', loop: true },
    verify: { pattern: verifyDevice, motion: 'draw check', loop: false },
  },
}

export const hardwareProfile = {
  render: () => studyMarkup(config),
  start: (root) => startAnimations(root, config),
}
