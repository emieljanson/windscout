<script setup>
import WindScoutPreview from './components/WindScoutPreview.vue'
</script>

<template>
  <main id="main-content" class="foundation-shell">
    <header class="foundation-header">
      <span class="wordmark">WindScout</span>
      <span class="prototype-label">Configurator prototype</span>
    </header>

    <section class="foundation-stage" aria-labelledby="preview-title">
      <div>
        <p class="eyebrow">Brouwersdam · next 5 days</p>
        <h1 id="preview-title">Your wind, always in sight.</h1>
      </div>
      <WindScoutPreview />
    </section>
  </main>
</template>

