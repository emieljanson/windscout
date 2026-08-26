<script setup>
import { computed, inject } from 'vue'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

const props = defineProps({
  modelValue: { type: [String, Number], default: undefined },
  options: { type: Array, required: true },
  placeholder: { type: String, default: 'Select an option' },
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
  <SelectRoot
    :model-value="props.modelValue"
    :disabled="isDisabled"
    :name="props.name"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SelectTrigger
      :id="row?.controlId"
      class="setting-control setting-select__trigger"
      :aria-label="props.ariaLabel"
      :aria-labelledby="props.ariaLabelledby || row?.labelId"
      :aria-describedby="props.ariaDescribedby || row?.describedBy?.value"
    >
      <SelectValue :placeholder="props.placeholder" />
      <SelectIcon class="setting-select__chevron" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" focusable="false">
          <path d="m4.5 6.25 3.5 3.5 3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        class="setting-popup setting-select__content"
        position="popper"
        align="start"
        :side-offset="6"
        :collision-padding="12"
      >
        <SelectViewport class="setting-popup__viewport">
          <SelectItem
            v-for="option in props.options"
            :key="String(option.value)"
            class="setting-option"
            :value="option.value"
            :disabled="option.disabled"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="setting-option__indicator" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" focusable="false">
                <path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
