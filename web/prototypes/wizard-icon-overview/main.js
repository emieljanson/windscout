import {
  activeInstallerIconCells,
  installerIconForPhase,
} from '../../src/installer/installerStateIcons.js'

const GRID_SIZE = 9
const DEFAULT_FRAME_DURATION = 140

const states = [
  { phase: 'ready', title: 'Connect device', aliases: ['ready'] },
  { phase: 'choosing-device', title: 'Select device', aliases: ['choosing-device', 'checking-device'] },
  { phase: 'confirm-device', title: 'Confirm device', aliases: ['confirm-device', 'review'] },
  { phase: 'installing-firmware', title: 'Write firmware', aliases: ['downloading', 'installing-firmware'] },
  { phase: 'reconnect', title: 'Reconnect', aliases: ['reconnecting', 'reconnect'] },
  { phase: 'wifi', title: 'Select Wi-Fi', aliases: ['wifi'] },
  { phase: 'configuring', title: 'Apply setup', aliases: ['configuring'] },
  { phase: 'verifying', title: 'Verify forecast', aliases: ['verifying'] },
  { phase: 'complete', title: 'Complete', aliases: ['complete'] },
  { phase: 'error', title: 'Error', aliases: ['error'] },
]

const overview = document.getElementById('icon-overview')
const motionToggle = document.getElementById('motion-toggle')
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
let motionPaused = motionPreference.matches
let elapsedFrame = 0
let timer

function gridMarkup(frame, label, size = 'small') {
  const activeCells = activeInstallerIconCells(frame)
  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => (
    `<span class="grid-cell${activeCells.has(index) ? ' is-active' : ''}" aria-hidden="true"></span>`
  )).join('')

  return `
    <div class="grid-sample grid-sample--${size}">
      <div class="grid-icon" role="img" aria-label="${label}">${cells}</div>
    </div>
  `
}

function renderOverview() {
  overview.innerHTML = states.map((state) => {
    const icon = installerIconForPhase(state.phase)
    const isAnimated = icon.frames.length > 1
    return `
      <section class="icon-row" data-phase="${state.phase}">
        <header class="state-name">
          <h2>${state.title}</h2>
          <p>${state.aliases.join(' · ')}</p>
          <span>${isAnimated ? `${icon.frames.length} frames · ${icon.frameDuration ?? DEFAULT_FRAME_DURATION} ms` : 'Static'}</span>
        </header>
        <div class="live-preview" data-live-preview></div>
        <div class="frame-strip">
          ${icon.frames.map((frame, index) => `
            <figure>
              ${gridMarkup(frame, `${state.title}, frame ${index + 1}`)}
              <figcaption>f${index + 1}</figcaption>
            </figure>
          `).join('')}
        </div>
      </section>
    `
  }).join('')

  paintLivePreviews()
}

function paintLivePreviews() {
  states.forEach((state) => {
    const icon = installerIconForPhase(state.phase)
    const frameIndex = elapsedFrame % icon.frames.length
    const preview = overview.querySelector(`[data-phase="${state.phase}"] [data-live-preview]`)
    preview.dataset.frame = String(frameIndex)
    preview.innerHTML = `
      ${gridMarkup(icon.frames[frameIndex], `${state.title}, live preview, frame ${frameIndex + 1}`, 'large')}
      <span class="live-frame">f${frameIndex + 1}</span>
    `
  })
}

function restartMotion() {
  window.clearInterval(timer)
  if (motionPaused) return
  timer = window.setInterval(() => {
    elapsedFrame += 1
    paintLivePreviews()
  }, DEFAULT_FRAME_DURATION)
}

motionToggle.addEventListener('click', () => {
  motionPaused = !motionPaused
  motionToggle.textContent = motionPaused ? 'Play motion' : 'Pause motion'
  paintLivePreviews()
  restartMotion()
})

motionPreference.addEventListener('change', ({ matches }) => {
  motionPaused = matches
  motionToggle.textContent = matches ? 'Play motion' : 'Pause motion'
  elapsedFrame = 0
  paintLivePreviews()
  restartMotion()
})

if (motionPaused) motionToggle.textContent = 'Play motion'
renderOverview()
restartMotion()
