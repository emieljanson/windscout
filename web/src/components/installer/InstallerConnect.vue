<script setup>
defineProps({ unsupportedReason: { type: String, default: '' } })
defineEmits(['connect'])
</script>

<template>
  <div class="installer-step">
    <div class="installer-step__copy">
      <h2 id="installer-title">Connect your reTerminal</h2>
      <p>Connect a reTerminal E1002 with a USB data cable. WindScout checks the device before changing anything.</p>
    </div>
    <div class="installer-actions">
      <p v-if="unsupportedReason" class="installer-message" role="status">{{ unsupportedReason }}</p>
      <button data-autofocus class="installer-primary" type="button" @click="$emit('connect')">
        Continue
      </button>
    </div>
  </div>
</template>
