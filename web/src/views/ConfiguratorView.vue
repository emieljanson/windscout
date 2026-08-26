<script setup>
import { defineAsyncComponent, ref } from 'vue'
import ConfiguratorHeader from '../components/ConfiguratorHeader.vue'
import InstallContinuation from '../components/InstallContinuation.vue'
import WindScoutSettings from '../components/WindScoutSettings.vue'

const WindScoutScene = defineAsyncComponent(() => import('../components/WindScoutScene.vue'))

const scene = ref(null)
const sceneFailed = ref(false)
const sceneError = ref('')

function handleSceneError(reason) {
  sceneFailed.value = true
  sceneError.value = reason || 'The 3D model could not be loaded.'
}
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
          v-if="!sceneFailed"
          ref="scene"
          class="device-scene"
          @error="handleSceneError"
        />

        <div v-else class="scene-error" data-testid="scene-error" role="alert">
          <p class="panel-kicker">3D unavailable</p>
          <h2>The virtual WindScout could not start.</h2>
          <p>{{ sceneError }} Refresh the page to try again.</p>
        </div>

        <div class="stage-toolbar" aria-label="Product view controls">
          <span class="live-label"><i aria-hidden="true"></i> Live screen</span>
          <div class="view-actions">
            <button v-if="!sceneFailed" type="button" @click="scene?.resetView()">Reset view</button>
            <button v-if="!sceneFailed" type="button" @click="scene?.showFront()">Front</button>
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
