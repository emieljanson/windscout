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
      <span id="install-title">Install on device</span>
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path v-if="open" d="M4 8h8" />
        <path v-else d="M3.5 8h9m-3.5-3.5L12.5 8 9 11.5" />
      </svg>
    </button>
    <p v-if="open" id="install-explanation" class="install-explanation">
      USB installation is the next build step. Soon this button will guide you through connecting, installing, and setting up Wi-Fi — it does not access your device yet.
    </p>
  </section>
</template>
