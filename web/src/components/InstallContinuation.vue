<script setup>
import { nextTick, ref } from 'vue'
import InstallerPanel from './installer/InstallerPanel.vue'

const open = ref(false)
const trigger = ref(null)
const props = defineProps({ configuration: { type: Object, required: true } })
const testSessionFactory = import.meta.env.DEV
  ? globalThis.__WINDSCOUT_INSTALLER_SESSION_FACTORY__
  : undefined

function start() {
  open.value = true
}

async function close() {
  open.value = false
  await nextTick()
  trigger.value?.focus()
}
</script>

<template>
  <section class="install-continuation" aria-labelledby="install-entry-title">
    <button
      ref="trigger"
      data-testid="install-continuation"
      class="install-button"
      type="button"
      :aria-expanded="open"
      aria-controls="installer-flow"
      @click="start"
    >
      <span id="install-entry-title">Install</span>
    </button>
    <InstallerPanel
      v-if="open"
      :configuration="props.configuration"
      :session-factory="testSessionFactory"
      @close="close"
    />
  </section>
</template>
