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
  ComboboxSeparator,
  ComboboxViewport,
} from 'reka-ui'

const CREATE_VALUE = '__windscout-create-option__'

const props = defineProps({
  modelValue: { type: [String, Number, Object], default: undefined },
  searchTerm: { type: String, required: true },
  options: { type: Array, required: true },
  getOptionValue: { type: Function, default: (option) => option?.value ?? option },
  getOptionLabel: { type: Function, default: (option) => option?.label ?? String(option ?? '') },
  getOptionDescription: { type: Function, default: () => '' },
  displayValue: { type: Function, default: undefined },
  by: { type: [String, Function], default: undefined },
  placeholder: { type: String, default: 'Search' },
  emptyText: { type: String, default: 'No results found' },
  emptyRole: { type: String, default: 'status' },
  loadingText: { type: String, default: 'Searching…' },
  loading: { type: Boolean, default: false },
  createActionLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  name: { type: String, default: undefined },
  ariaLabel: { type: String, default: undefined },
  ariaLabelledby: { type: String, default: undefined },
  ariaDescribedby: { type: String, default: undefined },
})

const emit = defineEmits(['update:modelValue', 'update:searchTerm', 'update:open', 'create'])
const row = inject('windscout-setting-row', null)
const isDisabled = computed(() => props.disabled || row?.disabled?.value || false)
const open = ref(false)
const input = ref(null)
const selectionPending = ref(false)
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

function optionKey(option) {
  const value = props.getOptionValue(option)
  return String(value && typeof value === 'object' ? value.id ?? props.getOptionLabel(option) : value)
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
  if (!value && !selectionPending.value) restoreCommittedLabel()
}

async function selectValue(value) {
  selectionPending.value = true
  if (value === CREATE_VALUE) {
    emit('create', props.searchTerm.trim())
    setOpen(false)
    await nextTick()
    selectionPending.value = false
    input.value?.$el?.focus()
    return
  }
  emit('update:modelValue', value)
  const label = committedLabel(value)
  emit('update:searchTerm', label)
  setOpen(false)
  await nextTick()
  selectionPending.value = false
  input.value?.$el?.focus()
}

function dismiss() {
  setOpen(false)
}

defineExpose({
  focus: () => input.value?.$el?.focus(),
})
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
              :key="optionKey(option)"
              class="setting-option"
              :value="props.getOptionValue(option)"
              :disabled="option.disabled"
            >
              <span class="setting-option__copy">
                <span>{{ props.getOptionLabel(option) }}</span>
                <span v-if="props.getOptionDescription(option)" class="setting-option__description">
                  {{ props.getOptionDescription(option) }}
                </span>
              </span>
              <ComboboxItemIndicator class="setting-option__indicator" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" focusable="false">
                  <path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </ComboboxItemIndicator>
            </ComboboxItem>
          </template>
          <p v-else class="setting-popup__message" :role="props.emptyRole">
            {{ props.emptyText }}
          </p>
          <template v-if="!props.loading && props.createActionLabel">
            <ComboboxSeparator class="setting-popup__separator" />
            <ComboboxItem
              class="setting-option setting-option--create"
              :value="CREATE_VALUE"
            >
              <svg class="setting-option__leading-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <span>{{ props.createActionLabel }}</span>
            </ComboboxItem>
          </template>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
