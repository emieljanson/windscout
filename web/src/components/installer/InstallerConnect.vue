<script setup>
defineProps({
  deviceLabel: { type: String, default: 'reTerminal E1001 or E1002' },
  purchaseUrl: {
    type: String,
    default: 'https://www.seeedstudio.com/reTerminal-E1002-p-6533.html?sensecap_affiliate=UF4PmgK&referring_service=link',
  },
  unsupportedReason: { type: String, default: '' },
})
defineEmits(['connect'])
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
      <a
        class="installer-secondary"
        :href="purchaseUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        Buy a reTerminal
      </a>
      <button data-autofocus class="installer-primary" type="button" @click="$emit('connect')">
        Continue
      </button>
    </div>
  </div>
</template>
