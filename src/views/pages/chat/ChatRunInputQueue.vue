<template>
  <div v-if="entries.length" class="chat-run-input-queue">
    <div class="chat-run-input-queue__header">
      <span>待处理消息</span>
      <span>{{ entries.length }} 条 · 引导优先，同类按加入顺序执行</span>
    </div>
    <div class="chat-run-input-queue__list">
      <div v-for="(entry, index) in entries" :key="entry.id" class="chat-run-input-queue__item">
        <n-tag size="tiny" :type="entry.mode === 'steer' ? 'info' : 'default'">
          {{ entry.mode === 'steer' ? '引导' : `排队 ${queuePosition(entry, index)}` }}
        </n-tag>
        <span class="chat-run-input-queue__text" :title="entry.text || attachmentSummary(entry)">
          {{ entry.text || attachmentSummary(entry) }}
        </span>
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

const emit = defineEmits(['remove'])

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
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.07);
}

.chat-run-input-queue__header,
.chat-run-input-queue__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-run-input-queue__header {
  justify-content: space-between;
  color: var(--n-text-color-3);
  font-size: 11px;
}

.chat-run-input-queue__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-run-input-queue__item {
  min-width: 0;
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
</style>
