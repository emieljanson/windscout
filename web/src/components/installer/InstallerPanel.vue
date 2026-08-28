<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { createInstallerSession } from '../../installer/createInstallerSession'
import { getSerialSupport } from '../../installer/serialPortAdapter'
import { publicAssetUrl } from '../../assets/publicAssetUrl'
import InstallerComplete from './InstallerComplete.vue'
import InstallerConnect from './InstallerConnect.vue'
import InstallerProgress from './InstallerProgress.vue'
import InstallerWifi from './InstallerWifi.vue'

const props = defineProps({
  configuration: { type: Object, required: true },
  sessionFactory: { type: Function, default: createInstallerSession },
})
const emit = defineEmits(['close'])
const root = ref(null)
const activeView = ref(null)
const state = ref({ phase: 'ready', progress: 0, safeToDisconnect: true, error: null })
const networks = ref([])
const wifiBusy = ref(false)
const scanBusy = ref(false)
let scanPromise = null
const support = getSerialSupport()
const installerDeviceUrl = publicAssetUrl('devices/e1002/installer-device.svg')
const unsupportedReason = computed(() => support.supported ? '' : 'Installation needs Chrome or Edge on a desktop computer.')
const session = props.sessionFactory({ configuration: props.configuration })
const unsubscribe = session.subscribe((next) => { state.value = { ...next } })

const critical = computed(() => !state.value.safeToDisconnect)
const progressCopy = computed(() => ({
  ready: ['Install WindScout', 'Ready to connect a reTerminal E1002.'],
  'choosing-device': ['Choose your device', 'Select the connected reTerminal E1002 in the browser window.'],
  'checking-device': ['Checking device', 'WindScout is identifying the device and the safest setup path.'],
  downloading: ['Preparing firmware', 'The verified WindScout release is being prepared before any write starts.'],
  'installing-firmware': ['Writing firmware', ''],
  reconnecting: ['Finding WindScout', 'Waiting for the device to restart over USB.'],
  configuring: ['Applying setup', 'Your spot and display options are being transferred.'],
  verifying: ['Checking the forecast', 'WindScout is confirming Wi-Fi, configuration and the first rendered forecast.'],
}[state.value.phase] ?? ['Working…', 'WindScout is continuing setup.']))

const review = computed(() => {
  const action = state.value.action?.action
  if (action === 'up-to-date') return { title: 'WindScout is up to date', body: 'Firmware and setup already match this configuration.', button: 'Done' }
  if (action === 'update-configuration') return { title: 'Update this setup', body: 'Only the selected spot and display options will change. Firmware will not be rewritten.', button: 'Update WindScout' }
  if (action === 'update-firmware') return { title: 'Update WindScout', body: 'Firmware will be updated while saved Wi-Fi and setup data stay in place.', button: 'Update WindScout' }
  if (action === 'reinstall') return { title: 'Repair WindScout', body: 'The firmware appears incomplete. A clean reinstall will replace its current setup.', button: 'Reinstall WindScout' }
  return { title: 'Install WindScout', body: 'A clean install will replace software and saved setup on this device.', button: 'Install WindScout' }
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
  if (phase === 'error' && state.value.error?.message) toast.error(state.value.error.message, { id: 'installer-error', duration: 5000 })
  else toast.dismiss('installer-error')
  await focusStep()
})

async function connect() {
  if (!support.supported) return
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
onBeforeUnmount(() => { toast.dismiss('installer-error'); unsubscribe(); document.removeEventListener('keydown', handleKeydown); void session.cancel() })
</script>

<template>
  <section id="installer-flow" ref="root" class="installer-layer" aria-labelledby="installer-title">
    <button class="installer-back" type="button" aria-label="Back to configurator" :disabled="critical" @click="close">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20"><path d="m12.5 5-5 5 5 5" /></svg>
    </button>
    <div class="installer-live-region" role="status" aria-live="polite">{{ progressCopy[0] }}</div>

    <div class="installer-stage">
      <Transition name="installer-step-slide" @before-leave="hideLeavingStep">
        <div :key="state.phase" ref="activeView" class="installer-stage__view">
          <InstallerConnect v-if="state.phase === 'ready'" :unsupported-reason="unsupportedReason" @connect="connect" />

          <div v-else-if="state.phase === 'confirm-device'" class="installer-step">
            <div class="installer-step__copy">
              <h2 id="installer-title">Is this a reTerminal E1002?</h2>
              <p>The browser found the right chip. Check the model label before continuing.</p>
            </div>
            <img class="installer-device" :src="installerDeviceUrl" alt="White reTerminal E1002 enclosure" />
            <div class="installer-actions">
              <button class="installer-secondary" type="button" @click="close">Choose another device</button>
              <button data-autofocus class="installer-primary" type="button" @click="session.confirmDevice()">Yes, continue</button>
            </div>
          </div>

          <div v-else-if="state.phase === 'review'" class="installer-step">
            <div class="installer-step__copy">
              <h2 id="installer-title">{{ review.title }}</h2>
              <p>{{ review.body }}</p>
            </div>
            <div class="installer-actions">
              <button v-if="state.action?.action !== 'up-to-date'" class="installer-secondary" type="button" @click="close">Cancel</button>
              <button data-autofocus class="installer-primary" type="button" @click="session.run()">{{ review.button }}</button>
            </div>
          </div>

          <div v-else-if="state.phase === 'reconnect'" class="installer-step">
            <div class="installer-step__copy">
              <h2 id="installer-title">Reconnect WindScout</h2>
              <p>The firmware is ready. Select the device once more to finish its setup.</p>
            </div>
            <div class="installer-actions">
              <p v-if="state.error" class="installer-message is-error">{{ state.error.message }}</p>
              <button data-autofocus class="installer-primary" type="button" @click="session.reconnect()">Reconnect device</button>
            </div>
          </div>

          <InstallerWifi v-else-if="state.phase === 'wifi'" :networks="networks" :error="state.error?.message" :busy="wifiBusy || scanBusy" :scanning="scanBusy" @submit="submitWifi" @rescan="scanNetworks" />
          <InstallerComplete v-else-if="state.phase === 'complete'" @done="close" />

          <div v-else-if="state.phase === 'error'" class="installer-step">
            <div class="installer-step__copy">
              <h2 id="installer-title">WindScout could not continue</h2>
              <p class="installer-message is-error" role="alert">{{ state.error?.message }}</p>
            </div>
            <div class="installer-actions">
              <p class="installer-connection-state" :class="{ 'is-unsafe': !state.safeToDisconnect }">{{ state.safeToDisconnect ? 'It is safe to disconnect the USB cable.' : 'Keep the cable connected while the writer stops.' }}</p>
              <button v-if="state.safeToDisconnect" data-autofocus class="installer-primary" type="button" @click="close">Close</button>
            </div>
          </div>

          <InstallerProgress v-else :title="progressCopy[0]" :message="progressCopy[1]" :progress="state.progress" :safe-to-disconnect="state.safeToDisconnect" />
        </div>
      </Transition>
    </div>
  </section>
</template>
