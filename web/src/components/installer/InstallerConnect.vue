<script setup>
defineProps({ unsupportedReason: { type: String, default: '' } })
defineEmits(['connect'])
</script>

<template>
  <div class="installer-step installer-step--connect">
    <div class="installer-step__copy">
      <template v-if="unsupportedReason">
        <h2 id="installer-title">Install with Chrome or Edge</h2>
        <p role="status">Open this page in Chrome or Edge on a desktop computer to install Windscout over USB.</p>
      </template>
      <template v-else>
        <h2 id="installer-title">Connect your reTerminal</h2>
        <p>Connect your reTerminal E1002 with a USB data cable.</p>
      </template>
    </div>
    <div v-if="!unsupportedReason" class="installer-actions">
      <a
        class="installer-secondary"
        href="https://www.seeedstudio.com/reTerminal-E1002-p-6533.html?sensecap_affiliate=UF4PmgK&amp;referring_service=link"
        target="_blank"
        rel="noopener noreferrer"
      >
        Buy one
      </a>
      <button data-autofocus class="installer-primary" type="button" @click="$emit('connect')">
        Continue
      </button>
    </div>
  </div>
</template>
