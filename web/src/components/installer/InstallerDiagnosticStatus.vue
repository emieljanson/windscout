<script setup>
import { computed } from 'vue'
import { isInstallerDiagnosticReference } from '../../installer/sentryReporter'

const props = defineProps({
  status: { type: String, default: 'idle' },
  reference: { type: String, default: '' },
})

const confirmedReference = computed(() => (
  props.status === 'sent' && isInstallerDiagnosticReference(props.reference)
    ? props.reference
    : ''
))
</script>

<template>
  <p v-if="confirmedReference" class="installer-diagnostic-status">
    Diagnostic reference: <code>{{ confirmedReference }}</code>
  </p>
</template>
