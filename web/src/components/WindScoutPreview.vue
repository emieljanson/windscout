<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfiguratorStore } from '../stores/configurator'
import { brouwersdamForecast } from '../fixtures/brouwersdam'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, renderForecastPreview } from '../renderer/previewRenderer'

const canvas = ref(null)
const store = useConfiguratorStore()
const { treatment, threshold } = storeToRefs(store)

function draw() {
  const context = canvas.value?.getContext('2d')
  if (!context) return
  renderForecastPreview(context, brouwersdamForecast, {
    treatment: treatment.value,
    threshold: threshold.value,
  })
}

onMounted(draw)
watch([treatment, threshold], () => nextTick(draw))
</script>

<template>
  <canvas
    ref="canvas"
    class="forecast-canvas"
    :width="PREVIEW_WIDTH"
    :height="PREVIEW_HEIGHT"
    role="img"
    :aria-label="`${brouwersdamForecast.spot} five-day forecast, ${threshold} knot threshold`"
  />
</template>

<style scoped>
.forecast-canvas {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(21, 24, 23, 0.28);
  background: #ebece4;
  box-shadow: 0 24px 70px rgba(26, 35, 32, 0.16);
  image-rendering: crisp-edges;
}
</style>

