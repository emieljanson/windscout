<script setup>
import { computed, inject, nextTick, ref, watchEffect } from 'vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'

const props = defineProps({
  modelValue: { type: [String, Number, Object], default: undefined },
  searchTerm: { type: String, required: true },
  options: { type: Array, required: true },
  getOptionValue: { type: Function, default: (option) => option?.value ?? option },
  getOptionLabel: { type: Function, default: (option) => option?.label ?? String(option ?? '') },
  displayValue: { type: Function, default: undefined },
  by: { type: [String, Function], default: undefined },
  placeholder: { type: String, default: 'Search' },
  emptyText: { type: String, default: 'No results found' },
  loadingText: { type: String, default: 'Searching…' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  name: { type: String, default: undefined },
  ariaLabel: { type: String, default: undefined },
  ariaLabelledby: { type: String, default: undefined },
  ariaDescribedby: { type: String, default: undefined },
})

const emit = defineEmits(['update:modelValue', 'update:searchTerm', 'update:open'])
const row = inject('windscout-setting-row', null)
const isDisabled = computed(() => props.disabled || row?.disabled?.value || false)
const open = ref(false)
const input = ref(null)
const cachedValue = ref(undefined)
const cachedLabel = ref('')

function valuesMatch(left, right) {
  if (Object.is(left, right)) return true
  if (left == null || right == null) return false
  if (typeof props.by === 'function') return props.by(left, right)
  if (typeof props.by === 'string') return Object.is(left?.[props.by], right?.[props.by])
  return String(left) === String(right)
}

function committedLabel(value = props.modelValue) {
  if (props.displayValue) return props.displayValue(value)
  const option = props.options.find((candidate) => valuesMatch(props.getOptionValue(candidate), value))
  if (option) return props.getOptionLabel(option)
  if (value && typeof value === 'object') return props.getOptionLabel(value)
  if (valuesMatch(value, cachedValue.value) && cachedLabel.value) return cachedLabel.value
  return value == null ? '' : String(value)
}

watchEffect(() => {
  const value = props.modelValue
  if (!valuesMatch(value, cachedValue.value)) {
    cachedValue.value = value
    cachedLabel.value = ''
  }
  const option = props.options.find((candidate) => valuesMatch(props.getOptionValue(candidate), value))
  if (props.displayValue) cachedLabel.value = props.displayValue(value)
  else if (option) cachedLabel.value = props.getOptionLabel(option)
  else if (value && typeof value === 'object') cachedLabel.value = props.getOptionLabel(value)
})

function restoreCommittedLabel() {
  const restored = committedLabel()
  if (props.searchTerm !== restored) emit('update:searchTerm', restored)
}

function setOpen(value) {
  open.value = value
  emit('update:open', value)
  if (!value) restoreCommittedLabel()
}

async function selectValue(value) {
  emit('update:modelValue', value)
  const label = committedLabel(value)
  emit('update:searchTerm', label)
  setOpen(false)
  await nextTick()
  input.value?.$el?.focus()
}

function dismiss() {
  setOpen(false)
  restoreCommittedLabel()
}
</script>

<template>
  <ComboboxRoot
    :model-value="props.modelValue"
    :open="open"
    :disabled="isDisabled"
    :name="props.name"
    :by="props.by"
    :ignore-filter="true"
    :open-on-focus="true"
    :open-on-click="true"
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    @update:model-value="selectValue"
    @update:open="setOpen"
  >
    <ComboboxAnchor class="setting-combobox__anchor">
      <ComboboxInput
        :id="row?.controlId"
        ref="input"
        class="setting-control setting-combobox__input"
        :model-value="props.searchTerm"
        :display-value="committedLabel"
        :disabled="isDisabled"
        :placeholder="props.placeholder"
        :aria-label="props.ariaLabel"
        :aria-labelledby="props.ariaLabelledby || row?.labelId"
        :aria-describedby="props.ariaDescribedby || row?.describedBy?.value"
        :aria-busy="props.loading ? 'true' : undefined"
        @update:model-value="emit('update:searchTerm', $event)"
        @keydown.esc="dismiss"
      />
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        class="setting-popup setting-combobox__content"
        position="popper"
        align="start"
        :side-offset="6"
        :collision-padding="12"
      >
        <ComboboxViewport class="setting-popup__viewport">
          <p v-if="props.loading" class="setting-popup__message" role="status">
            {{ props.loadingText }}
          </p>
          <template v-else-if="props.options.length">
            <ComboboxItem
              v-for="option in props.options"
              :key="String(props.getOptionValue(option))"
              class="setting-option"
              :value="props.getOptionValue(option)"
              :disabled="option.disabled"
            >
              <span>{{ props.getOptionLabel(option) }}</span>
              <ComboboxItemIndicator class="setting-option__indicator" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" focusable="false">
                  <path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </ComboboxItemIndicator>
            </ComboboxItem>
          </template>
          <p v-else class="setting-popup__message" role="status">
            {{ props.emptyText }}
          </p>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
