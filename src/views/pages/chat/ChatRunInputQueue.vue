<template>
  <div v-if="entries.length" class="chat-run-input-queue">
    <div class="chat-run-input-queue__header">
      <span>{{ entries.some((entry) => entry.mode === 'steer') ? '将发送到当前任务' : '后续消息' }}</span>
      <span>{{ entries.length }} 条</span>
    </div>
    <div class="chat-run-input-queue__list">
      <div v-for="(entry, index) in entries" :key="entry.id" class="chat-run-input-queue__item">
        <n-tag size="tiny" :type="entry.mode === 'steer' ? 'info' : 'default'">
          {{ entry.mode === 'steer' ? '引导' : `排队 ${queuePosition(entry, index)}` }}
        </n-tag>
        <span class="chat-run-input-queue__text" :title="entry.text || attachmentSummary(entry)">
          {{ entry.text || attachmentSummary(entry) }}
        </span>
        <div class="chat-run-input-queue__actions">
          <n-button
            v-if="entry.mode !== 'steer'"
            size="tiny"
            tertiary
            type="info"
            title="改为引导当前任务"
            @click="emit('steer', entry.id)"
          >
            引导
          </n-button>
          <n-button
            size="tiny"
            tertiary
            circle
            title="移除"
            @click="emit('remove', entry.id)"
          >
            <template #icon>
              <n-icon :component="CloseOutline" size="12" />
            </template>
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NButton, NIcon, NTag } from 'naive-ui'
import { CloseOutline } from '@vicons/ionicons5'

const props = defineProps({
  entries: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['remove', 'steer'])

function queuePosition(entry, index) {
  if (entry?.mode === 'steer') return ''
  return props.entries.slice(0, index + 1).filter((item) => item?.mode !== 'steer').length
}

function attachmentSummary(entry) {
  const count = Array.isArray(entry?.attachments) ? entry.attachments.length : 0
  return count ? `${count} 个附件` : '空消息'
}
</script>

<style scoped>
.chat-run-input-queue {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 7px;
  border-radius: 9px;
  background: rgba(59, 130, 246, 0.07);
}

.chat-run-input-queue__header,
.chat-run-input-queue__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-run-input-queue__header {
  flex: 0 0 auto;
  color: var(--n-text-color-3);
  font-size: 11px;
}

.chat-run-input-queue__list {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  gap: 4px;
}

.chat-run-input-queue__item {
  flex: 1 0 min(320px, 100%);
  min-width: 180px;
}

.chat-run-input-queue__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--n-text-color-2);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-run-input-queue__actions {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  flex: 0 0 auto;
}
</style>
