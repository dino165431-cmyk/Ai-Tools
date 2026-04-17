<template>
  <n-tooltip trigger="hover">
    <template #trigger>
      <span class="help-tip" aria-hidden="true">
        <n-icon :component="AlertCircleOutline" :size="size" />
      </span>
    </template>
    <div class="help-tip__content">{{ text }}</div>
  </n-tooltip>
</template>

<script setup>
import { NIcon, NTooltip } from 'naive-ui'
import { AlertCircleOutline } from '@vicons/ionicons5'

defineProps({
  text: {
    type: String,
    default: ''
  },
  size: {
    type: Number,
    default: 14
  }
})
</script>

<style scoped>
.help-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(237, 108, 2, 0.9);
  cursor: help;
  line-height: 1;
}

.help-tip__content {
  max-width: 280px;
  white-space: normal;
  line-height: 1.5;
}
</style>
