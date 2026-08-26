<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import ConfiguratorHeader from '../components/ConfiguratorHeader.vue'
import InstallContinuation from '../components/InstallContinuation.vue'
import WindScoutPreview from '../components/WindScoutPreview.vue'
import WindScoutSettings from '../components/WindScoutSettings.vue'
import { shouldUse2DMode } from '../configurator/sceneController'

const WindScoutScene = defineAsyncComponent(() => import('../components/WindScoutScene.vue'))

const scene = ref(null)
const flatViewRequested = ref(false)
const sceneFailed = ref(false)
const viewportWidth = ref(0)
const reducedMotion = ref(false)
let motionQuery

const narrowViewport = computed(() => viewportWidth.value < 960)
const useFlatPreview = computed(() => (
  flatViewRequested.value || sceneFailed.value || shouldUse2DMode({
    width: viewportWidth.value,
    reducedMotion: reducedMotion.value,
    webglAvailable: true,
  })
))

function updateCapabilities() {
  viewportWidth.value = window.innerWidth
  reducedMotion.value = motionQuery?.matches ?? false
}

function handleSceneFallback() {
  sceneFailed.value = true
}

function toggleView() {
  flatViewRequested.value = !flatViewRequested.value
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  updateCapabilities()
  window.addEventListener('resize', updateCapabilities)
  motionQuery.addEventListener?.('change', updateCapabilities)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateCapabilities)
  motionQuery?.removeEventListener?.('change', updateCapabilities)
})
</script>

<template>
  <div class="configurator-page">
    <ConfiguratorHeader />

    <main id="main-content" class="configurator-layout">
      <section class="product-stage" aria-labelledby="configurator-title">
        <div class="stage-copy">
          <p class="panel-kicker">Five days. One glance.</p>
          <h1 id="configurator-title">See your next session.</h1>
        </div>

        <div class="day-grid" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
        </div>

        <WindScoutScene
          v-if="!useFlatPreview"
          ref="scene"
          class="device-scene"
          @fallback="handleSceneFallback"
        />

        <div v-else class="flat-preview-wrap" data-testid="flat-preview">
          <div class="flat-device">
            <WindScoutPreview />
          </div>
        </div>

        <div class="stage-toolbar" aria-label="Product view controls">
          <span class="live-label"><i aria-hidden="true"></i> Live screen</span>
          <div class="view-actions">
            <button
              v-if="!narrowViewport && !reducedMotion && !sceneFailed"
              type="button"
              @click="toggleView"
            >
              {{ useFlatPreview ? 'View in 3D' : 'View flat' }}
            </button>
            <button v-if="!useFlatPreview" type="button" @click="scene?.resetView()">Reset view</button>
            <button v-if="!useFlatPreview" type="button" @click="scene?.showFront()">Front</button>
          </div>
        </div>
      </section>

      <aside class="settings-panel" aria-label="WindScout settings">
        <WindScoutSettings />
        <InstallContinuation />
      </aside>
    </main>
  </div>
</template>

<style src="../styles/configurator.css"></style>
