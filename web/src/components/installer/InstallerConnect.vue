<script setup>
defineProps({
  deviceLabel: { type: String, default: 'reTerminal E1001 or E1002' },
  unsupportedReason: { type: String, default: '' },
})
defineEmits(['buy', 'connect'])
</script>

<template>
  <div class="installer-step installer-step--connect">
    <div class="installer-step__copy">
      <template v-if="unsupportedReason">
        <h2 id="installer-title">Use Firefox, Chrome, or Edge</h2>
        <p role="status">{{ unsupportedReason }}</p>
      </template>
      <template v-else>
        <h2 id="installer-title">Connect your reTerminal</h2>
        <p>Connect your {{ deviceLabel }} with a USB data cable.</p>
      </template>
    </div>
    <div v-if="!unsupportedReason" class="installer-actions">
      <button
        class="installer-secondary"
        type="button"
        aria-haspopup="dialog"
        @click="$emit('buy')"
      >
        Buy a reTerminal
      </button>
      <button data-autofocus class="installer-primary" type="button" @click="$emit('connect')">
        Continue
      </button>
    </div>
  </div>
</template>
