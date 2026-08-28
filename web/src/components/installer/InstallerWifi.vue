<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ networks: { type: Array, default: () => [] }, error: { type: String, default: '' }, busy: Boolean, scanning: Boolean })
const emit = defineEmits(['submit', 'rescan'])
const ssid = ref('')
const password = ref('')
const describedBy = computed(() => props.error ? 'installer-wifi-help installer-wifi-error' : 'installer-wifi-help')

function submit() {
  emit('submit', { ssid: ssid.value.trim(), password: password.value })
  password.value = ''
}
</script>

<template>
  <form class="installer-step installer-wifi" @submit.prevent="submit">
    <div class="installer-step__copy">
      <h2 id="installer-title">Select a network for WindScout</h2>
      <p id="installer-wifi-help">The device uses this connection to update its forecast.</p>
    </div>
    <div class="installer-fields">
      <label class="installer-field">
        <span>Wi-Fi network</span>
        <select v-if="networks.length" v-model="ssid" name="ssid" :aria-describedby="describedBy" required data-autofocus>
          <option value="" disabled>Select</option>
          <option v-for="network in networks" :key="network.ssid" :value="network.ssid">{{ network.ssid }}</option>
        </select>
        <input v-else v-model="ssid" name="ssid" type="text" autocomplete="off" spellcheck="false" :aria-describedby="describedBy" placeholder="Network name" required data-autofocus />
      </label>
      <label class="installer-field">
        <span>Password</span>
        <input v-model="password" name="wifi-password" type="password" autocomplete="off" :aria-invalid="Boolean(error)" :aria-describedby="describedBy" required />
      </label>
      <p v-if="error" id="installer-wifi-error" class="installer-message is-error">{{ error }}</p>
    </div>
    <div class="installer-actions">
      <button class="installer-secondary" type="button" :disabled="busy || scanning" @click="$emit('rescan')">{{ scanning ? 'Scanning…' : 'Scan again' }}</button>
      <button class="installer-primary" type="submit" :disabled="busy">{{ busy ? 'Connecting…' : 'Continue' }}</button>
    </div>
  </form>
</template>
