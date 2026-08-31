import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InstallerStateIcon from '../../src/components/installer/InstallerStateIcon.vue'
import { installerIconForPhase } from '../../src/installer/installerStateIcons'

const originalMatchMedia = window.matchMedia

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
})

function mockMotionPreference(initialMatches = false) {
  let matches = initialMatches
  const listeners = new Set()
  const query = {
    get matches() { return matches },
    addEventListener: vi.fn((event, listener) => event === 'change' && listeners.add(listener)),
    removeEventListener: vi.fn((event, listener) => event === 'change' && listeners.delete(listener)),
    setMatches(value) {
      matches = value
      listeners.forEach((listener) => listener({ matches: value }))
    },
  }
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => query) })
  return query
}

const phases = [
  'ready',
  'choosing-device',
  'checking-device',
  'confirm-device',
  'review',
  'downloading',
  'installing-firmware',
  'reconnecting',
  'reconnect',
  'wifi',
  'configuring',
  'verifying',
  'complete',
  'error',
]

describe('installer state icons', () => {
  it('uses one consistent 9 by 9 pixel grid for every wizard state', () => {
    for (const phase of phases) {
      const icon = installerIconForPhase(phase)
      expect(icon.frames.length, phase).toBeGreaterThan(0)
      for (const frame of icon.frames) {
        expect(frame, phase).toHaveLength(9)
        expect(frame.every((row) => row.length === 9), phase).toBe(true)
      }
    }
  })

  it('keeps the requested motion only on states that communicate ongoing work', () => {
    expect(installerIconForPhase('ready').frames.length).toBeGreaterThan(1)
    expect(installerIconForPhase('choosing-device').frames.length).toBeGreaterThan(1)
    expect(installerIconForPhase('confirm-device').frames).toHaveLength(1)
    expect(installerIconForPhase('installing-firmware').frames.length).toBeGreaterThan(1)
    expect(installerIconForPhase('wifi').frames).toHaveLength(1)
    expect(installerIconForPhase('complete').frames.length).toBeGreaterThan(1)
    expect(installerIconForPhase('error').frames).toHaveLength(1)
  })

  it('preserves each requested icon concept', () => {
    for (const frame of installerIconForPhase('ready').frames) {
      expect([3, 4, 5].every((row) => [0, 1, 7, 8].every((column) => frame[row][column] === '1'))).toBe(true)
      expect(frame.join('').match(/1/g)).toHaveLength(14)
    }

    const selectFrames = installerIconForPhase('choosing-device').frames
    expect(selectFrames).toHaveLength(8)
    expect(new Set(selectFrames.map((frame) => frame.join(''))).size).toBe(8)
    expect(selectFrames.map((frame) => frame.slice(3, 6).map((row) => row.slice(3, 6)))).toEqual(
      Array.from({ length: 8 }, () => ['111', '101', '111']),
    )
    expect(selectFrames[0][0]).toBe('110001100')
    expect(selectFrames[2][8]).toBe('110001100')
    expect(selectFrames[4][8]).toBe('001100011')
    expect(selectFrames[6][0]).toBe('001100011')

    const confirmed = installerIconForPhase('confirm-device').frames[0]
    expect(confirmed[4].slice(3, 6)).toBe('101')
    expect(installerIconForPhase('wifi').frames[0]).toEqual([
      '000000000', '000111000', '001000100', '010000010', '000111000',
      '001000100', '000000000', '000010000', '000000000',
    ])

    const flagFrames = installerIconForPhase('complete').frames
    expect(flagFrames.every((frame) => [1, 2, 3, 4, 5, 6, 7].every((row) => frame[row][2] === '1'))).toBe(true)
    expect(flagFrames.some((frame) => frame[1][7] === '1')).toBe(true)
    expect(flagFrames.some((frame) => frame[3][7] === '1')).toBe(true)
  })

  it('reuses the opposing packet pulse when the device reconnects', () => {
    expect(installerIconForPhase('reconnect').frames).toEqual(installerIconForPhase('ready').frames)
    expect(installerIconForPhase('reconnecting').frames).toEqual(installerIconForPhase('ready').frames)
  })

  it('keeps a receiving line beneath every firmware rain frame', () => {
    const frames = installerIconForPhase('installing-firmware').frames
    for (const frame of frames) {
      expect(frame[8]).toBe('011111110')
      expect(frame.slice(0, 8).join('').match(/1/g)?.length ?? 0).toBeGreaterThanOrEqual(12)
      expect(frame.slice(0, 8).every((row) => row[0] === '0' && row[8] === '0')).toBe(true)
      const rain = frame.slice(0, 8)
      for (let row = 0; row < 8; row += 1) {
        for (let column = 0; column < 9; column += 1) {
          if (rain[row][column] !== '1') continue
          expect(rain[row]?.[column - 1] ?? '0').not.toBe('1')
          expect(rain[row]?.[column + 1] ?? '0').not.toBe('1')
          expect(rain[row - 1]?.[column] ?? '0').not.toBe('1')
          expect(rain[row + 1]?.[column] ?? '0').not.toBe('1')
        }
      }
    }

    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
      const current = frames[frameIndex]
      const next = frames[(frameIndex + 1) % frames.length]
      for (let column = 0; column < 9; column += 1) {
        const currentRows = current.slice(0, 8)
          .flatMap((row, rowIndex) => row[column] === '1' ? [rowIndex] : [])
        const nextRows = next.slice(0, 8)
          .flatMap((row, rowIndex) => row[column] === '1' ? [rowIndex] : [])
        expect(nextRows, `frame ${frameIndex}, column ${column}`).toEqual(
          currentRows.map((row) => (row + 1) % 8).sort((a, b) => a - b),
        )
      }
    }
  })

  it('reuses the firmware rain while applying the setup', () => {
    expect(installerIconForPhase('configuring').frames).toEqual(
      installerIconForPhase('installing-firmware').frames,
    )
  })

  it('advances in discrete frames and reacts when reduced motion changes', async () => {
    vi.useFakeTimers()
    const motion = mockMotionPreference(false)
    const wrapper = mount(InstallerStateIcon, { props: { phase: 'ready' } })

    expect(wrapper.attributes('data-frame')).toBe('0')
    vi.advanceTimersByTime(140)
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('data-frame')).toBe('1')

    motion.setMatches(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('data-frame')).toBe('7')
    vi.advanceTimersByTime(560)
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('data-frame')).toBe('7')

    motion.setMatches(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('data-frame')).toBe('0')
    wrapper.unmount()
    expect(motion.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
