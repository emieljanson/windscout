<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import SettingCombobox from './settings/SettingCombobox.vue'
import {
  geoapifyApiKey,
  reverseGeoapifyLocation,
  searchGeoapifyPlaces,
} from '../map/geoapify'
import { createGeoapifyMap } from '../map/geoapifyMap'

const props = defineProps({
  open: { type: Boolean, required: true },
  initialQuery: { type: String, default: '' },
  apiKey: { type: String, default: geoapifyApiKey },
  searchPlaces: { type: Function, default: searchGeoapifyPlaces },
  reverseLocation: { type: Function, default: reverseGeoapifyLocation },
  createMap: { type: Function, default: createGeoapifyMap },
})

const emit = defineEmits(['update:open', 'confirm'])
const searchTerm = ref('')
const results = ref([])
const selectedPlace = ref(null)
const searching = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const mapContainer = ref(null)
const searchCombobox = ref(null)
const center = ref(null)
let debounceTimer
let searchController
let mapController

function language() {
  return String(globalThis.navigator?.language ?? 'en').slice(0, 2)
}

function clearSearch() {
  clearTimeout(debounceTimer)
  debounceTimer = undefined
  searchController?.abort()
  searchController = undefined
}

function destroyMap() {
  mapController?.destroy()
  mapController = undefined
}

function reset() {
  clearSearch()
  destroyMap()
  results.value = []
  selectedPlace.value = null
  searching.value = false
  saving.value = false
  errorMessage.value = ''
  center.value = null
}

async function runSearch(query) {
  clearSearch()
  if (!props.open || query.trim().length < 2) {
    results.value = []
    return
  }
  searchController = new AbortController()
  searching.value = true
  errorMessage.value = ''
  try {
    results.value = await props.searchPlaces(query, {
      apiKey: props.apiKey,
      signal: searchController.signal,
      language: language(),
    })
  } catch (error) {
    if (error?.name !== 'AbortError') {
      results.value = []
      errorMessage.value = error?.message || 'Location search is temporarily unavailable.'
    }
  } finally {
    searching.value = false
  }
}

function scheduleSearch(query) {
  clearSearch()
  debounceTimer = setTimeout(() => void runSearch(query), 300)
}

async function choosePlace(place) {
  if (!place) return
  selectedPlace.value = place
  searchTerm.value = place.label
  center.value = { latitude: place.latitude, longitude: place.longitude }
  errorMessage.value = ''
  clearSearch()
  await nextTick()
  destroyMap()
  try {
    mapController = await props.createMap(mapContainer.value, {
      apiKey: props.apiKey,
      center: center.value,
      onCenterChange: (nextCenter) => { center.value = nextCenter },
    })
  } catch (error) {
    errorMessage.value = error?.message || 'The map could not be loaded.'
  }
}

async function confirmSpot() {
  if (!selectedPlace.value || !center.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const finalLocation = await props.reverseLocation(center.value, {
      apiKey: props.apiKey,
      language: language(),
    })
    const timezone = finalLocation?.timezone || selectedPlace.value.timezone
    if (!timezone) throw new Error('We could not determine the timezone for this pin.')
    emit('confirm', {
      name: selectedPlace.value.name,
      latitude: Number(center.value.latitude.toFixed(6)),
      longitude: Number(center.value.longitude.toFixed(6)),
      timezone,
      providerRef: `geoapify:${selectedPlace.value.id}`,
    })
    emit('update:open', false)
  } catch (error) {
    errorMessage.value = error?.message || 'This spot could not be added.'
  } finally {
    saving.value = false
  }
}

function setOpen(value) {
  emit('update:open', value)
}

function focusSearch(event) {
  event.preventDefault()
  nextTick(() => searchCombobox.value?.focus())
}

watch(() => props.open, (open) => {
  reset()
  if (!open) return
  searchTerm.value = props.initialQuery.trim()
  scheduleSearch(searchTerm.value)
}, { immediate: true })

watch(searchTerm, (query) => {
  if (!props.open) return
  if (selectedPlace.value && query === selectedPlace.value.label) return
  if (selectedPlace.value) {
    selectedPlace.value = null
    center.value = null
    destroyMap()
  }
  scheduleSearch(query)
})

onBeforeUnmount(reset)
</script>

<template>
  <DialogRoot :open="props.open" @update:open="setOpen">
    <DialogPortal>
      <DialogOverlay class="spot-dialog__overlay" />
      <DialogContent class="spot-dialog" @open-auto-focus="focusSearch">
        <header class="spot-dialog__header">
          <div>
            <DialogTitle class="spot-dialog__title">Add a spot</DialogTitle>
            <DialogDescription class="spot-dialog__description">
              <template v-if="selectedPlace">Move the map until the pin is on your spot by the water.</template>
              <template v-else>Choose the place nearest to your spot.</template>
            </DialogDescription>
          </div>
          <button class="spot-dialog__close" type="button" aria-label="Close spot dialog" @click="setOpen(false)">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="spot-dialog__search">
          <SettingCombobox
            ref="searchCombobox"
            :model-value="selectedPlace"
            v-model:search-term="searchTerm"
            :options="results"
            :loading="searching"
            :get-option-value="(place) => place"
            :get-option-label="(place) => place.label"
            :get-option-description="(place) => place.description"
            :display-value="(place) => place?.label ?? searchTerm"
            by="id"
            placeholder="Search for a place"
            empty-text="No places found"
            loading-text="Searching places…"
            aria-label="Search for a place"
            @update:model-value="choosePlace"
          />
        </div>

        <div v-if="selectedPlace" class="spot-dialog__map-wrap">
          <div ref="mapContainer" class="spot-dialog__map" aria-label="Map for positioning the spot" />
          <div class="spot-dialog__pin" aria-hidden="true">
            <svg viewBox="0 0 32 40" fill="none">
              <path d="M16 38S29 26.2 29 14.8C29 7.7 23.2 2 16 2S3 7.7 3 14.8C3 26.2 16 38 16 38Z" fill="currentColor" />
              <circle cx="16" cy="15" r="5" fill="white" />
            </svg>
          </div>
        </div>

        <p v-if="errorMessage" class="spot-dialog__error" role="alert">{{ errorMessage }}</p>

        <footer class="spot-dialog__footer">
          <a class="spot-dialog__attribution" href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
            Powered by Geoapify
          </a>
          <button
            v-if="selectedPlace"
            class="spot-dialog__confirm"
            type="button"
            :disabled="saving || !center"
            @click="confirmSpot"
          >
            {{ saving ? 'Adding…' : 'Add spot' }}
          </button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
