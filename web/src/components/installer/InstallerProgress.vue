<script setup>
defineProps({ title: String, message: String, progress: Number, safeToDisconnect: Boolean })
</script>

<template>
  <div class="installer-step installer-step--progress" :aria-busy="progress < 1">
    <div class="installer-progress-group">
      <div class="installer-step__copy">
        <h2 id="installer-title">{{ title }}</h2>
        <p v-if="message">{{ message }}</p>
      </div>
      <div class="installer-progress" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100" role="progressbar">
        <span :style="{ inlineSize: `${Math.round(progress * 100)}%` }" />
      </div>
    </div>
    <div class="installer-actions">
      <p class="installer-connection-state" :class="{ 'is-unsafe': !safeToDisconnect }">
        {{ safeToDisconnect ? 'Safe to disconnect' : 'Keep the USB cable connected' }}
      </p>
    </div>
  </div>
</template>
