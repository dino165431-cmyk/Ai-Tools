<template>
  <div class="tool-activity-group">
    <button
      type="button"
      class="tool-activity-group__header"
      :class="{ 'has-errors': failedCount > 0 }"
      :aria-expanded="group.toolGroupExpanded ? 'true' : 'false'"
      @click="actions.toggleGroup(group)"
    >
      <n-icon :component="failedCount > 0 ? AlertCircleOutline : CheckmarkCircleOutline" size="15" />
      <span class="tool-activity-group__label">已执行 {{ totalCount }} 个工具步骤</span>
      <span class="tool-activity-group__summary">{{ summaryText }}</span>
      <span class="tool-activity-group__hint">{{ group.toolGroupExpanded ? '收起' : '展开' }}</span>
      <n-icon
        :component="group.toolGroupExpanded ? ChevronUpOutline : ChevronDownOutline"
        size="14"
        class="tool-activity-group__chevron"
      />
    </button>

    <div v-if="group.toolGroupExpanded" class="tool-activity-group__items">
      <div
        v-for="message in group.toolGroupMessages"
        :key="message.id"
        class="tool-activity-group__item"
      >
        <div
          v-if="helpers.shouldRenderCompactToolMessage(message)"
          class="chat-tool-compact"
          :class="`is-${helpers.getToolMessageStatus(message)}`"
          @click="actions.toggleToolExpanded(message)"
        >
          <n-icon
            :component="helpers.toolActivityIcon(message)"
            size="14"
            class="chat-tool-compact__state-icon"
          />
          <span class="chat-tool-compact__label">{{ helpers.toolMessageLabel(message) }}</span>
          <span v-if="helpers.toolActivityMeta(message)" class="chat-tool-compact__meta">
            {{ helpers.toolActivityMeta(message) }}
          </span>
          <span
            v-if="helpers.shouldShowToolActivityStatus(message)"
            class="chat-tool-compact__status"
            :class="`is-${helpers.getToolMessageStatus(message)}`"
          >
            {{ helpers.toolMessageStatusLabel(message) }}
          </span>
          <n-icon :component="ChevronDownOutline" size="13" class="chat-tool-compact__chevron" />
        </div>
        <ChatToolMessage
          v-else
          :msg="message"
          :theme="theme"
          :helpers="toolMessageHelpers"
          :actions="toolMessageActions"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import {
  AlertCircleOutline,
  CheckmarkCircleOutline,
  ChevronDownOutline,
  ChevronUpOutline
} from '@vicons/ionicons5'

import ChatToolMessage from './ChatToolMessage.vue'

const props = defineProps({
  group: {
    type: Object,
    required: true
  },
  theme: {
    type: String,
    default: 'light'
  },
  helpers: {
    type: Object,
    required: true
  },
  actions: {
    type: Object,
    required: true
  },
  toolMessageHelpers: {
    type: Object,
    required: true
  },
  toolMessageActions: {
    type: Object,
    required: true
  }
})

const totalCount = computed(() => (
  Array.isArray(props.group?.toolGroupMessages) ? props.group.toolGroupMessages.length : 0
))

const failedCount = computed(() => {
  const counts = props.group?.toolGroupCounts || {}
  return Number(counts.error || 0) + Number(counts.rejected || 0) + Number(counts.stopped || 0)
})

const summaryText = computed(() => {
  const counts = props.group?.toolGroupCounts || {}
  const parts = []
  if (counts.success) parts.push(`${counts.success} 成功`)
  if (counts.error) parts.push(`${counts.error} 失败`)
  if (counts.rejected) parts.push(`${counts.rejected} 已拒绝`)
  if (counts.stopped) parts.push(`${counts.stopped} 已停止`)
  return parts.join(' · ') || '已完成'
})
</script>

<style scoped>
.tool-activity-group {
  width: min(100%, 780px);
  min-width: 0;
}

.tool-activity-group__header {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid rgba(14, 165, 233, 0.16);
  border-radius: 9px;
  color: inherit;
  background: rgba(14, 165, 233, 0.06);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.tool-activity-group__header:hover {
  background: rgba(14, 165, 233, 0.10);
}

.tool-activity-group__header.has-errors {
  border-color: rgba(208, 48, 80, 0.16);
  background: rgba(208, 48, 80, 0.05);
}

.tool-activity-group__label {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 650;
}

.tool-activity-group__summary {
  min-width: 0;
  flex: 1;
  color: rgba(71, 85, 105, 0.82);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-activity-group__hint {
  flex: 0 0 auto;
  font-size: 11px;
  opacity: 0.56;
}

.tool-activity-group__chevron {
  flex: 0 0 auto;
  opacity: 0.62;
}

.tool-activity-group__items {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 5px 0 2px 7px;
  padding: 3px 0 3px 10px;
  border-left: 1px solid rgba(100, 116, 139, 0.20);
}

.tool-activity-group__item {
  min-width: 0;
}

:global(.chat-page.dark) .tool-activity-group__header {
  border-color: rgba(56, 189, 248, 0.18);
  background: rgba(56, 189, 248, 0.08);
}

:global(.chat-page.dark) .tool-activity-group__header:hover {
  background: rgba(56, 189, 248, 0.13);
}

:global(.chat-page.dark) .tool-activity-group__header.has-errors {
  border-color: rgba(251, 113, 133, 0.20);
  background: rgba(251, 113, 133, 0.08);
}

:global(.chat-page.dark) .tool-activity-group__summary {
  color: rgba(203, 213, 225, 0.76);
}

:global(.chat-page.dark) .tool-activity-group__items {
  border-left-color: rgba(148, 163, 184, 0.24);
}
</style>
