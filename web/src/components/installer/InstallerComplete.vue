<script setup>
defineEmits(['done'])
</script>

<template>
  <div class="installer-step installer-step--complete">
    <div class="installer-step__copy">
      <h2 id="installer-title">Done, enjoy</h2>
      <p>The selected spot and display options are live on your device.</p>
    </div>
    <div class="installer-actions">
      <button data-autofocus class="installer-primary" type="button" @click="$emit('done')">Done</button>
    </div>
  </div>
</template>
