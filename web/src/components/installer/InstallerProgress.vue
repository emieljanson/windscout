<script setup>
defineProps({ title: String, message: String, progress: Number })
</script>

<template>
  <div class="installer-step installer-step--progress" :aria-busy="progress < 1">
    <div class="installer-progress-group">
      <div class="installer-step__copy">
        <h2 id="installer-title">{{ title }}</h2>
        <p v-if="message">{{ message }}</p>
      </div>
      <div class="installer-progress" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100" role="progressbar">
        <span :style="{ transform: `scaleX(${progress})` }" />
      </div>
    </div>
  </div>
</template>
