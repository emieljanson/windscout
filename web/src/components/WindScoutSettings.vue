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
const { forecastLabel, forecastMessage, forecastStatus } = storeToRefs(store)
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
}, {
  id: 'windscout-display',
})

let sliderEnhancement
let sliderObserver

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
  sliderObserver?.disconnect()
}

watch(
  () => [dial.values.value.treatment, dial.values.value.windThreshold],
  ([treatment, threshold]) => {
    store.setTreatment(treatment)
    store.setThreshold(threshold)
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

onMounted(async () => {
  await nextTick()
  attachSliderAccessibility()
  if (!sliderEnhancement && dialkitFrame.value) {
    sliderObserver = new MutationObserver(attachSliderAccessibility)
    sliderObserver.observe(dialkitFrame.value, { childList: true, subtree: true })
  }
})

onBeforeUnmount(() => {
  sliderObserver?.disconnect()
  sliderEnhancement?.dispose()
})
</script>

<template>
  <div class="settings-surface">
    <div
      class="forecast-status"
      :class="`is-${forecastStatus}`"
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
  </div>
</template>
