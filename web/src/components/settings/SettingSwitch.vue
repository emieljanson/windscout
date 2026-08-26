<script setup>
import { computed, inject } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  disabled: { type: Boolean, default: false },
  name: { type: String, default: undefined },
  ariaLabel: { type: String, default: undefined },
  ariaLabelledby: { type: String, default: undefined },
  ariaDescribedby: { type: String, default: undefined },
})

const emit = defineEmits(['update:modelValue'])
const row = inject('windscout-setting-row', null)
const isDisabled = computed(() => props.disabled || row?.disabled?.value || false)
</script>

<template>
  <SwitchRoot
    :id="row?.controlId"
    class="setting-switch"
    :model-value="props.modelValue"
    :disabled="isDisabled"
    :name="props.name"
    :aria-label="props.ariaLabel"
    :aria-labelledby="props.ariaLabelledby || row?.labelId"
    :aria-describedby="props.ariaDescribedby || row?.describedBy?.value"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SwitchThumb class="setting-switch__thumb" />
  </SwitchRoot>
</template>
