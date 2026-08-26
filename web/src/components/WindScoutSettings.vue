<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DialRoot, useDialKitController } from 'dialkit/vue'
import { MAX_THRESHOLD, MIN_THRESHOLD, useConfiguratorStore } from '../stores/configurator'
import { enhanceDialKitSlider } from '../configurator/dialKitAccessibility'

const store = useConfiguratorStore()
const dialkitFrame = ref(null)
const dial = useDialKitController('Display', {
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
    <div class="settings-intro">
      <p class="panel-kicker">On-screen forecast</p>
      <h2>Make it yours</h2>
      <p>Adjust what counts as a good wind day. The screen reacts as you change it.</p>
    </div>
    <div ref="dialkitFrame" class="dialkit-frame">
      <DialRoot mode="inline" theme="light" production-enabled />
    </div>
  </div>
</template>
