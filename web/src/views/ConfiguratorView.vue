<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { createInstalledConfiguration, displayConfigurationFromStore } from '../config/configuration'
import { getSerialSupport } from '../installer/serialPortAdapter'
import InstallContinuation from '../components/InstallContinuation.vue'
import WindScoutSettings from '../components/WindScoutSettings.vue'
import { useCompactViewport } from '../composables/useCompactViewport'
import { useConfiguratorStore } from '../stores/configurator'

const WindScoutScene = defineAsyncComponent(() => import('../components/WindScoutScene.vue'))

const store = useConfiguratorStore()
const { isCompact } = useCompactViewport()
const sceneFailed = ref(false)
const sceneError = ref('')
const showInstaller = computed(() => getSerialSupport().reason !== 'desktop-required')
const installationConfiguration = computed(() => createInstalledConfiguration({
  spot: store.spotById(store.selectedSpotId),
  modelId: store.selectedModelId,
  display: displayConfigurationFromStore(store),
}))
let visualViewportFrame

function updateVisualViewportInset() {
  visualViewportFrame = undefined
  const viewport = window.visualViewport
  const bottomInset = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0
  document.documentElement.style.setProperty('--visual-viewport-bottom', `${bottomInset}px`)
}

function scheduleVisualViewportUpdate() {
  if (visualViewportFrame !== undefined) return
  visualViewportFrame = requestAnimationFrame(updateVisualViewportInset)
}

function handleSceneError(reason) {
  sceneFailed.value = true
  sceneError.value = reason || 'The 3D model could not be loaded.'
}

onMounted(() => {
  scheduleVisualViewportUpdate()
  window.addEventListener('resize', scheduleVisualViewportUpdate)
  window.visualViewport?.addEventListener('resize', scheduleVisualViewportUpdate)
  window.visualViewport?.addEventListener('scroll', scheduleVisualViewportUpdate)
  void store.initializeForecast()
  void store.initializeTide()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleVisualViewportUpdate)
  window.visualViewport?.removeEventListener('resize', scheduleVisualViewportUpdate)
  window.visualViewport?.removeEventListener('scroll', scheduleVisualViewportUpdate)
  if (visualViewportFrame !== undefined) cancelAnimationFrame(visualViewportFrame)
  document.documentElement.style.removeProperty('--visual-viewport-bottom')
})
</script>

<template>
  <div class="configurator-page">
    <main id="main-content" class="configurator-layout">
      <section class="product-stage" aria-label="WindScout 3D preview">
        <WindScoutScene
          v-if="!sceneFailed"
          class="device-scene"
          @error="handleSceneError"
        />

        <div v-else class="scene-error" data-testid="scene-error" role="alert">
          <h2>The virtual WindScout could not start.</h2>
          <p>{{ sceneError }} Refresh the page to try again.</p>
        </div>
      </section>

      <aside
        class="settings-panel"
        :class="{ 'settings-panel--compact': isCompact }"
        aria-label="WindScout settings"
      >
        <WindScoutSettings :compact="isCompact" />
        <InstallContinuation v-if="showInstaller" :configuration="installationConfiguration" />
      </aside>
    </main>
  </div>
</template>

<style src="../styles/configurator.css"></style>
