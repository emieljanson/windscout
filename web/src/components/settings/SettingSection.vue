<script setup>
import { useId } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
})

const sectionId = `setting-section-${useId()}`
const descriptionId = `${sectionId}-description`
</script>

<template>
  <section
    class="setting-section"
    :aria-labelledby="sectionId"
    :aria-describedby="props.description ? descriptionId : undefined"
  >
    <header class="setting-section__header">
      <h2 :id="sectionId" class="setting-section__title">{{ props.title }}</h2>
      <p v-if="props.description" :id="descriptionId" class="setting-section__description">
        {{ props.description }}
      </p>
    </header>
    <div class="setting-section__rows">
      <slot />
    </div>
  </section>
</template>
