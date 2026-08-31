<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { createInstallerSession } from '../../installer/createInstallerSession'
import { isInstallerDiagnosticReference } from '../../installer/sentryReporter'
import { getSerialSupport } from '../../installer/serialPortAdapter'
import InstallerComplete from './InstallerComplete.vue'
import InstallerConnect from './InstallerConnect.vue'
import InstallerDiagnosticStatus from './InstallerDiagnosticStatus.vue'
import InstallerProgress from './InstallerProgress.vue'
import InstallerStateIcon from './InstallerStateIcon.vue'
import InstallerWifi from './InstallerWifi.vue'

const props = defineProps({
  configuration: { type: Object, required: true },
  sessionFactory: { type: Function, default: createInstallerSession },
})
const emit = defineEmits(['close', 'installer-phase-change', 'usb-step-change'])
const root = ref(null)
const activeView = ref(null)
const state = ref({ phase: 'ready', progress: 0, safeToDisconnect: true, error: null })
const networks = ref([])
const wifiBusy = ref(false)
const scanBusy = ref(false)
let scanPromise = null
const support = getSerialSupport()
const session = props.sessionFactory({ configuration: props.configuration })
const isDemo = session.isDemo === true
const unsupportedReason = computed(() => (support.supported || isDemo) ? '' : 'Update to a current desktop version of Firefox, Chrome, or Edge to install Windscout over USB.')
const displayPhase = computed(() => unsupportedReason.value && state.value.phase === 'ready' ? 'error' : state.value.phase)
const unsubscribe = session.subscribe((next) => { state.value = { ...next } })

watch(
  () => state.value.phase,
  (phase) => {
    emit('usb-step-change', phase === 'ready')
    emit('installer-phase-change', phase)
  },
  { immediate: true },
)

const critical = computed(() => !state.value.safeToDisconnect)
const progressCopy = computed(() => ({
  ready: ['Install Windscout', 'Ready to connect a reTerminal E1001 or E1002.'],
  'checking-device': ['Checking device', 'Windscout is identifying the device and the safest setup path.'],
  downloading: ['Preparing firmware', 'The verified Windscout release is being prepared before any write starts.'],
  'installing-firmware': ['Writing firmware', 'Keep the USB cable connected until writing is complete.'],
  reconnecting: ['Finding Windscout', 'Waiting for the device to restart over USB.'],
  configuring: ['Applying setup', 'Your spot and display options are being transferred.'],
  verifying: ['Checking the forecast', 'Windscout is confirming Wi-Fi, configuration and the first rendered forecast.'],
}[state.value.phase] ?? ['Working…', 'Windscout is continuing setup.']))

const review = computed(() => {
  const action = state.value.action?.action
  if (action === 'up-to-date') return { title: 'Windscout is up to date', body: 'Firmware and setup already match this configuration.', button: 'Done' }
  if (action === 'update-configuration') return { title: 'Update this setup', body: 'Only the selected spot and display options will change. Firmware will not be rewritten.', button: 'Update Windscout' }
  if (action === 'update-firmware') return { title: 'Update Windscout', body: 'Firmware will be updated while saved Wi-Fi and setup data stay in place.', button: 'Update Windscout' }
  if (action === 'reinstall') return { title: 'Repair Windscout', body: 'The firmware appears incomplete. A clean reinstall will replace its current setup.', button: 'Reinstall Windscout' }
  return { title: 'Install Windscout', body: 'A clean install will replace software and saved setup on this device.', button: 'Install Windscout' }
})

async function focusStep() {
  await nextTick()
  const target = activeView.value?.querySelector('[data-autofocus]') ??
    activeView.value?.querySelector('button, input, select')
  if (!target) return
  target.classList.add('is-initial-focus')
  target.addEventListener('blur', () => target.classList.remove('is-initial-focus'), { once: true })
  target.focus()
}

function hideLeavingStep(element) {
  element.inert = true
  element.setAttribute('aria-hidden', 'true')
}

watch(() => state.value.phase, async (phase, previous) => {
  if (phase === 'wifi' && previous !== 'wifi') await scanNetworks()
  await focusStep()
})

watch(
  () => [state.value.phase, state.value.error?.message],
  ([phase, message]) => {
    if (['error', 'reconnect', 'wifi'].includes(phase) && message) {
      toast.error(message, { id: 'installer-error', duration: 5000 })
    } else toast.dismiss('installer-error')
  },
  { immediate: true },
)

watch(
  () => [state.value.diagnosticStatus, state.value.diagnosticReference],
  ([status, reference]) => {
    const options = { id: 'installer-diagnostics' }
    if (status === 'sending') toast.loading('Sending technical details…', options)
    else if (status === 'sent' && isInstallerDiagnosticReference(reference)) {
      toast.success('Technical details sent', { ...options, description: `Diagnostic reference: ${reference}`, duration: 8000 })
    } else if (status === 'failed') {
      toast.error('Technical details could not be sent.', { ...options, duration: 5000 })
    } else toast.dismiss('installer-diagnostics')
  },
  { immediate: true },
)

async function connect() {
  if (!support.supported && !isDemo) return
  await session.connect()
}

async function scanNetworks() {
  if (scanPromise) return scanPromise
  scanBusy.value = true
  scanPromise = session.scanNetworks()
    .then((results) => { networks.value = results })
    .catch(() => { networks.value = [] })
    .finally(() => { scanBusy.value = false; scanPromise = null })
  return scanPromise
}

async function submitWifi(credentials) {
  wifiBusy.value = true
  await session.submitWifi(credentials)
  wifiBusy.value = false
}

function close() {
  if (critical.value) return
  void session.cancel()
  emit('close')
}

function handleKeydown(event) {
  root.value?.querySelector('.is-initial-focus')?.classList.remove('is-initial-focus')
  if (event.key === 'Escape' && !critical.value) close()
}

onMounted(() => { document.addEventListener('keydown', handleKeydown); void focusStep() })
onBeforeUnmount(() => { toast.dismiss('installer-error'); toast.dismiss('installer-diagnostics'); unsubscribe(); document.removeEventListener('keydown', handleKeydown); void session.cancel() })
</script>

<template>
  <section
    id="installer-flow"
    ref="root"
    class="installer-layer"
    :data-phase="displayPhase"
    :data-has-error="Boolean(state.error)"
    :data-has-diagnostic-reference="state.diagnosticStatus === 'sent' && isInstallerDiagnosticReference(state.diagnosticReference)"
    aria-labelledby="installer-title"
  >
    <button class="installer-back" type="button" aria-label="Back to configurator" :disabled="critical" @click="close">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20"><path d="m12.5 5-5 5 5 5" /></svg>
    </button>
    <div class="installer-live-region" role="status" aria-live="polite">{{ progressCopy[0] }}</div>

    <InstallerStateIcon :phase="displayPhase" />

    <div class="installer-stage">
      <Transition name="installer-step-slide" @before-leave="hideLeavingStep">
        <div :key="state.phase" ref="activeView" class="installer-stage__view">
          <InstallerConnect v-if="state.phase === 'ready'" :unsupported-reason="unsupportedReason" @connect="connect" />

          <div v-else-if="state.phase === 'choosing-device'" class="installer-step installer-step--choose-device" aria-busy="true">
            <div class="installer-step__copy">
              <h2 id="installer-title">Select your reTerminal</h2>
              <p>In the browser window, select the connected device. It may appear as USB Serial or a similar USB name.</p>
            </div>
          </div>

          <div v-else-if="state.phase === 'checking-device'" class="installer-step" aria-busy="true">
            <div class="installer-step__copy">
              <h2 id="installer-title">{{ progressCopy[0] }}</h2>
              <p>{{ progressCopy[1] }}</p>
            </div>
          </div>

          <div v-else-if="state.phase === 'confirm-device'" class="installer-step">
            <div class="installer-step__copy">
              <h2 id="installer-title">Confirm your reTerminal</h2>
              <p>Make sure this is a reTerminal E1001 or E1002. Installing will replace its software and saved setup.</p>
            </div>
            <div class="installer-actions">
              <button data-autofocus class="installer-primary" type="button" @click="session.confirmDevice()">Install Windscout</button>
            </div>
          </div>

          <div v-else-if="state.phase === 'review'" class="installer-step">
            <div class="installer-step__copy">
              <h2 id="installer-title">{{ review.title }}</h2>
              <p>{{ review.body }}</p>
            </div>
            <div class="installer-actions">
              <button data-autofocus class="installer-primary" type="button" @click="session.run()">{{ review.button }}</button>
            </div>
          </div>

          <div v-else-if="state.phase === 'reconnect'" class="installer-step">
            <div class="installer-step__copy">
              <h2 id="installer-title">Select your reTerminal again</h2>
              <p>Keep the USB cable connected. Select your reTerminal again in the browser window to finish setup.</p>
            </div>
            <div class="installer-actions">
              <p v-if="state.error" class="installer-message is-error">{{ state.error.message }}</p>
              <InstallerDiagnosticStatus :status="state.diagnosticStatus" :reference="state.diagnosticReference" />
              <button data-autofocus class="installer-primary" type="button" @click="session.reconnect()">Choose USB device</button>
            </div>
          </div>

          <InstallerWifi v-else-if="state.phase === 'wifi'" :networks="networks" :error="state.error?.message" :busy="wifiBusy || scanBusy" :scanning="scanBusy" :diagnostic-status="state.diagnosticStatus" :diagnostic-reference="state.diagnosticReference" @submit="submitWifi" @rescan="scanNetworks" />
          <InstallerComplete v-else-if="state.phase === 'complete'" @done="close" />

          <div v-else-if="state.phase === 'error'" class="installer-step installer-step--error">
            <div class="installer-step__copy">
              <h2 id="installer-title">Windscout could not continue</h2>
              <p role="alert">{{ state.error?.message }}</p>
              <InstallerDiagnosticStatus :status="state.diagnosticStatus" :reference="state.diagnosticReference" />
              <p class="installer-connection-state">{{ state.safeToDisconnect ? 'It is safe to disconnect the USB cable.' : 'Keep the cable connected while the writer stops.' }}</p>
            </div>
            <div v-if="state.safeToDisconnect" class="installer-actions">
              <button data-autofocus class="installer-primary" type="button" @click="close">Close</button>
            </div>
          </div>

          <InstallerProgress v-else :title="progressCopy[0]" :message="progressCopy[1]" :progress="state.progress" />
        </div>
      </Transition>
    </div>
  </section>
</template>
