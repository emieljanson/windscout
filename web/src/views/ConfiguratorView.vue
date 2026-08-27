<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'
import InstallContinuation from '../components/InstallContinuation.vue'
import WindScoutSettings from '../components/WindScoutSettings.vue'
import { useConfiguratorStore } from '../stores/configurator'

const WindScoutScene = defineAsyncComponent(() => import('../components/WindScoutScene.vue'))

const store = useConfiguratorStore()
const sceneFailed = ref(false)
const sceneError = ref('')

function handleSceneError(reason) {
  sceneFailed.value = true
  sceneError.value = reason || 'The 3D model could not be loaded.'
}

onMounted(() => {
  void store.initializeForecast()
  void store.initializeTide()
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

      <aside class="settings-panel" aria-label="WindScout settings">
        <WindScoutSettings />
        <InstallContinuation />
        <a class="configurator-data-sources" href="/data-sources.html">Data sources</a>
      </aside>
    </main>
  </div>
</template>

<style src="../styles/configurator.css"></style>

<style scoped>
.configurator-data-sources {
  display: block;
  width: fit-content;
  margin: -0.15rem auto 0;
  color: #868b88;
  font-size: 0.625rem;
  line-height: 1.4;
  text-underline-offset: 2px;
}

.configurator-data-sources:hover {
  color: #303331;
}

.configurator-data-sources:focus-visible {
  outline: 0;
  color: #303331;
  box-shadow: 0 2px 0 var(--settings-focus, #000);
}
</style>
