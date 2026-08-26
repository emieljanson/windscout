<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { DialRoot, useDialKitController } from 'dialkit/vue'
import { useConfiguratorStore } from '../stores/configurator'
import { enhanceDialKitSlider } from '../configurator/dialKitAccessibility'
import { FORECAST_MODELS } from '../forecast/models'
import { MAX_THRESHOLD, MIN_THRESHOLD } from '../renderer/contract'
import { SPOTS } from '../spots'

const store = useConfiguratorStore()
const {
  forecastLabel,
  forecastMessage,
  forecastStatus,
  showTide,
  tideAvailable,
  tideMessage,
  tideStatus,
} = storeToRefs(store)
const dialkitFrame = ref(null)
const dial = useDialKitController('Display', {
  spot: {
    type: 'select',
    options: SPOTS.map((spot) => ({ value: spot.id, label: spot.name })),
    default: store.selectedSpotId,
  },
  model: {
    type: 'select',
    options: FORECAST_MODELS.map((model) => ({ value: model.id, label: model.label })),
    default: store.selectedModelId,
  },
  treatment: {
    type: 'select',
    options: [
      { value: 'background-fade', label: 'Background fade' },
      { value: 'threshold-line', label: 'Threshold line' },
      { value: 'solid', label: 'Solid bars' },
    ],
    default: store.treatment,
  },
  windThreshold: [store.threshold, MIN_THRESHOLD, MAX_THRESHOLD, 1],
  weather: store.showWeather,
  airTemperature: store.showTemperature,
  tide: store.showTide,
}, {
  id: 'windscout-display',
})

let sliderEnhancement
let controlsObserver

function attachSliderAccessibility() {
  const slider = dialkitFrame.value?.querySelector('.dialkit-slider')
  if (!slider || sliderEnhancement) return
  sliderEnhancement = enhanceDialKitSlider(slider, {
    label: 'Wind threshold',
    min: MIN_THRESHOLD,
    max: MAX_THRESHOLD,
    step: 1,
    getValue: () => dial.values.value.windThreshold,
    setValue: (value) => dial.setValue('windThreshold', value),
  })
}

function syncTideAccessibility() {
  const toggle = [...(dialkitFrame.value?.querySelectorAll('.dialkit-toggle') ?? [])]
    .find((element) => element.textContent?.toLowerCase().includes('tide'))
  if (!toggle) return
  toggle.toggleAttribute('disabled', !tideAvailable.value)
  toggle.setAttribute('aria-disabled', String(!tideAvailable.value))
  toggle.setAttribute('aria-describedby', 'tide-capability-message')
}

watch(
  () => [
    dial.values.value.treatment,
    dial.values.value.windThreshold,
    dial.values.value.weather,
    dial.values.value.airTemperature,
    dial.values.value.tide,
  ],
  ([treatment, threshold, weather, airTemperature, tide]) => {
    store.setTreatment(treatment)
    store.setThreshold(threshold)
    store.setShowWeather(weather)
    store.setShowTemperature(airTemperature)
    store.setShowTide(tide)
  },
  { immediate: true },
)

watch(
  () => dial.values.value.spot,
  (spotId) => {
    if (spotId && spotId !== store.selectedSpotId) void store.selectSpot(spotId)
  },
)

watch(
  () => dial.values.value.model,
  (modelId) => {
    if (modelId && modelId !== store.selectedModelId) void store.selectModel(modelId)
  },
)

watch(() => dial.values.value.windThreshold, () => sliderEnhancement?.sync())
watch([tideAvailable, tideStatus], () => nextTick(syncTideAccessibility))

onMounted(async () => {
  await nextTick()
  attachSliderAccessibility()
  syncTideAccessibility()
  if (dialkitFrame.value) {
    controlsObserver = new MutationObserver(() => {
      attachSliderAccessibility()
      syncTideAccessibility()
    })
    controlsObserver.observe(dialkitFrame.value, { childList: true, subtree: true })
  }
})

onBeforeUnmount(() => {
  controlsObserver?.disconnect()
  sliderEnhancement?.dispose()
})
</script>

<template>
  <div class="settings-surface">
    <div
      class="forecast-status"
      :class="[`is-${forecastStatus}`, { 'is-visually-hidden': forecastStatus !== 'warning' }]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        v-if="forecastLabel"
        class="forecast-status__label"
        data-testid="forecast-label"
      >
        {{ forecastLabel }}
      </span>
      <span class="forecast-status__message">{{ forecastMessage }}</span>
    </div>
    <div ref="dialkitFrame" class="dialkit-frame">
      <DialRoot mode="inline" theme="light" production-enabled />
    </div>
    <p
      v-if="tideStatus !== 'available' || showTide"
      id="tide-capability-message"
      class="tide-capability-message"
      :data-state="tideStatus"
      role="status"
      aria-live="polite"
    >
      {{ tideMessage }}
    </p>
  </div>
</template>

<style scoped>
.tide-capability-message {
  margin: 0;
  padding: 10px 12px 2px;
  color: color-mix(in srgb, currentColor 66%, transparent);
  font-size: 12px;
  line-height: 1.4;
}

.tide-capability-message[data-state='failed'],
.tide-capability-message[data-state='unsupported'] {
  color: color-mix(in srgb, currentColor 78%, transparent);
}
</style>
