<script setup>
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <section class="install-continuation" aria-labelledby="install-title">
    <button
      data-testid="install-continuation"
      class="install-button"
      type="button"
      :aria-expanded="open"
      aria-controls="install-explanation"
      @click="open = !open"
    >
      <span id="install-title">Install on my WindScout</span>
      <span aria-hidden="true">{{ open ? '−' : '↗' }}</span>
    </button>
    <p v-if="open" id="install-explanation" class="install-explanation">
      USB installation is the next build step. Soon this button will guide you through connecting, installing, and setting up Wi-Fi — it does not access your device yet.
    </p>
  </section>
</template>

