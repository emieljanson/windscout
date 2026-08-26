<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfiguratorStore } from '../stores/configurator'
import { FORECAST_MODELS } from '../forecast/models'
import { MAX_THRESHOLD, MIN_THRESHOLD } from '../renderer/contract'
import { getSpot, SPOTS } from '../spots'
import SettingCombobox from './settings/SettingCombobox.vue'
import SettingNumberInput from './settings/SettingNumberInput.vue'
import SettingRow from './settings/SettingRow.vue'
import SettingSection from './settings/SettingSection.vue'
import SettingSelect from './settings/SettingSelect.vue'
import SettingSwitch from './settings/SettingSwitch.vue'

const store = useConfiguratorStore()
const {
  effectiveShowTide,
  forecastLabel,
  forecastMessage,
  forecastStatus,
  selectedModelId,
  selectedSpotId,
  showThreshold,
  showWeather,
  temperatureChoice,
  threshold,
  tideAvailable,
  tideMessage,
  tideStatus,
} = storeToRefs(store)

const spotSearchTerm = ref(getSpot(selectedSpotId.value)?.name ?? '')
const filteredSpots = computed(() => {
  const query = spotSearchTerm.value.trim().toLocaleLowerCase()
  if (!query) return SPOTS
  return SPOTS.filter((spot) => spot.name.toLocaleLowerCase().includes(query))
})

const modelOptions = FORECAST_MODELS.map((model) => ({
  value: model.id,
  label: model.label,
}))
const temperatureOptions = [
  { value: 'hide', label: 'Hide' },
  { value: 'celsius', label: 'Celsius' },
  { value: 'fahrenheit', label: 'Fahrenheit' },
]

watch(selectedSpotId, (spotId) => {
  spotSearchTerm.value = getSpot(spotId)?.name ?? ''
})

function selectSpot(spotId) {
  const spot = getSpot(spotId)
  if (!spot) return
  spotSearchTerm.value = spot.name
  if (spotId !== selectedSpotId.value) void store.selectSpot(spotId)
}

function selectModel(modelId) {
  if (modelId !== selectedModelId.value) void store.selectModel(modelId)
}
</script>

<template>
  <div class="settings-surface">
    <div
      class="forecast-status"
      :class="[`is-${forecastStatus}`, { 'is-visually-hidden': forecastStatus !== 'warning' }]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        v-if="forecastLabel"
        class="forecast-status__label"
        data-testid="forecast-label"
      >
        {{ forecastLabel }}
      </span>
      <span class="forecast-status__message">{{ forecastMessage }}</span>
    </div>

    <div class="settings-controls">
      <SettingSection title="Forecast">
        <SettingRow label="Spot">
          <SettingCombobox
            :model-value="selectedSpotId"
            v-model:search-term="spotSearchTerm"
            :options="filteredSpots"
            :get-option-value="(spot) => spot.id"
            :get-option-label="(spot) => spot.name"
            :display-value="(spotId) => getSpot(spotId)?.name ?? ''"
            placeholder="Search spots"
            empty-text="No existing spots found"
            name="spot"
            @update:model-value="selectSpot"
          />
        </SettingRow>

        <SettingRow label="Model">
          <SettingSelect
            :model-value="selectedModelId"
            :options="modelOptions"
            name="model"
            @update:model-value="selectModel"
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Display">
        <SettingRow label="Show threshold">
          <SettingSwitch
            :model-value="showThreshold"
            name="show-threshold"
            @update:model-value="store.setShowThreshold"
          />
        </SettingRow>

        <SettingRow v-if="showThreshold" label="Threshold">
          <SettingNumberInput
            :model-value="threshold"
            :min="MIN_THRESHOLD"
            :max="MAX_THRESHOLD"
            :step="1"
            unit="kt"
            name="threshold"
            @update:model-value="store.setThreshold"
          />
        </SettingRow>

        <SettingRow label="Weather">
          <SettingSwitch
            :model-value="showWeather"
            name="show-weather"
            @update:model-value="store.setShowWeather"
          />
        </SettingRow>

        <SettingRow label="Temperature">
          <SettingSelect
            :model-value="temperatureChoice"
            :options="temperatureOptions"
            name="temperature"
            @update:model-value="store.setTemperatureChoice"
          />
        </SettingRow>

        <SettingRow label="Tide" :disabled="!tideAvailable">
          <SettingSwitch
            :model-value="effectiveShowTide"
            :disabled="!tideAvailable"
            :aria-describedby="tideAvailable ? undefined : 'tide-capability-message'"
            name="show-tide"
            @update:model-value="store.setShowTide"
          />
        </SettingRow>
      </SettingSection>

      <p
        v-if="!['available', 'cached'].includes(tideStatus)"
        id="tide-capability-message"
        class="tide-capability-message"
        :data-state="tideStatus"
        role="status"
        aria-live="polite"
      >
        {{ tideMessage }}
      </p>
    </div>
  </div>
</template>
