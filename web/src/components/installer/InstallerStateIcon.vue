<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { activeInstallerIconCells, installerIconForPhase } from '../../installer/installerStateIcons'

const props = defineProps({ phase: { type: String, required: true } })
const frameIndex = ref(0)
const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
let frameTimer

const icon = computed(() => installerIconForPhase(props.phase))
const frame = computed(() => icon.value.frames[frameIndex.value] ?? icon.value.frames.at(-1))
const cellCount = computed(() => frame.value.reduce((count, row) => count + row.length, 0))
const activeCells = computed(() => activeInstallerIconCells(frame.value))

function stopAnimation() {
  if (frameTimer !== undefined) window.clearInterval(frameTimer)
  frameTimer = undefined
}

function startAnimation() {
  stopAnimation()
  const reduceMotion = motionQuery?.matches
  frameIndex.value = reduceMotion ? icon.value.frames.length - 1 : 0
  if (reduceMotion || icon.value.frames.length < 2) return

  frameTimer = window.setInterval(() => {
    frameIndex.value = (frameIndex.value + 1) % icon.value.frames.length
  }, icon.value.frameDuration ?? 140)
}

watch(() => props.phase, startAnimation, { immediate: true })
motionQuery?.addEventListener?.('change', startAnimation)
onBeforeUnmount(() => {
  motionQuery?.removeEventListener?.('change', startAnimation)
  stopAnimation()
})
</script>

<template>
  <div
    class="installer-state-icon"
    data-testid="installer-state-icon"
    :data-phase="phase"
    :data-frame="frameIndex"
    aria-hidden="true"
  >
    <div class="installer-state-icon__grid">
      <span
        v-for="cell in cellCount"
        :key="cell"
        class="installer-state-icon__cell"
        :class="{ 'is-active': activeCells.has(cell - 1) }"
      />
    </div>
  </div>
</template>
