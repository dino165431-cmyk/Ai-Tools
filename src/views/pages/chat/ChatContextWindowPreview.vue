<template>
  <div
    v-if="budgetStatus?.level && budgetStatus.level !== 'safe'"
    :class="['chat-context-budget-callout', `is-${budgetStatus.level}`, { 'is-dark': theme === 'dark' }]"
  >
    {{ budgetStatus.text }}
  </div>

  <div :class="['chat-context-budget', { 'is-dark': theme === 'dark' }]">
    <div class="chat-context-budget__header">
      <div class="chat-context-budget__title">预算占用</div>
      <div class="chat-context-budget__meta">{{ budgetSummaryText }}</div>
    </div>
    <div class="chat-context-budget__list">
      <div
        v-for="item in budgetItems"
        :key="item.key"
        class="chat-context-budget__item"
      >
        <div class="chat-context-budget__row">
          <div class="chat-context-budget__label">{{ item.label }}</div>
          <div class="chat-context-budget__value">{{ item.usedLabel }} / {{ item.maxLabel }}</div>
        </div>
        <div class="chat-context-budget__track">
          <div
            class="chat-context-budget__fill"
            :class="`is-${item.tone}`"
            :style="{ width: `${item.percent}%` }"
          />
        </div>
        <div v-if="item.hint" class="chat-context-budget__hint">{{ item.hint }}</div>
      </div>
    </div>
  </div>

  <div :class="['chat-context-preview', { 'is-dark': theme === 'dark' }]">
    <div class="chat-context-preview__header">
      <div class="chat-context-preview__title">已纳入消息</div>
      <div class="chat-context-preview__meta">{{ previewSummaryText }}</div>
    </div>
    <div v-if="entries.length" class="chat-context-preview__list">
      <div
        v-for="(entry, index) in entries"
        :key="entryKey(entry, index)"
        class="chat-context-preview__item"
      >
        <div class="chat-context-preview__item-header">
          <n-tag size="small" :bordered="false" :type="helpers.modeType(entry)">
            {{ helpers.modeLabel(entry) }}
          </n-tag>
          <div class="chat-context-preview__item-title">{{ helpers.entryLabel(entry, index) }}</div>
          <div class="chat-context-preview__item-meta">
            {{ entry.messageCount }} 条 · {{ helpers.formatApproxChars(entry.chars) }}
          </div>
        </div>
        <div v-if="helpers.entryNote(entry)" class="chat-context-preview__item-note">
          {{ helpers.entryNote(entry) }}
        </div>
        <div class="chat-context-preview__item-text">
          {{ entry.previewText || '（无预览文本）' }}
        </div>
      </div>
    </div>
    <div v-else class="chat-context-preview__empty">
      当前没有可发送的历史消息。
    </div>
  </div>

  <div
    v-if="omittedEntries.length"
    :class="['chat-context-preview', 'chat-context-preview--omitted', { 'is-dark': theme === 'dark' }]"
  >
    <div class="chat-context-preview__header">
      <div class="chat-context-preview__title">未纳入消息</div>
      <div class="chat-context-preview__meta">{{ omittedSummaryText }}</div>
    </div>
    <div class="chat-context-preview__filters">
      <n-button
        v-for="option in omittedFilterOptions"
        :key="option.value"
        size="tiny"
        secondary
        :type="resolvedOmittedFilter === option.value ? 'primary' : 'default'"
        @click="emit('update:omittedFilter', option.value)"
      >
        {{ option.label }} · {{ option.count }}
      </n-button>
    </div>
    <div v-if="filteredOmittedEntries.length" class="chat-context-preview__list">
      <div
        v-for="(entry, index) in filteredOmittedEntries"
        :key="entryKey(entry, index, 'omitted')"
        class="chat-context-preview__item chat-context-preview__item--omitted"
      >
        <div class="chat-context-preview__item-header">
          <n-tag size="small" :bordered="false" :type="helpers.modeType(entry)">
            {{ helpers.modeLabel(entry) }}
          </n-tag>
          <div class="chat-context-preview__item-title">{{ helpers.entryLabel(entry, index) }}</div>
          <div class="chat-context-preview__item-meta">
            {{ entry.messageCount }} 条 · {{ helpers.formatApproxChars(entry.chars) }}
          </div>
        </div>
        <div v-if="entry.reasons && entry.reasons.length" class="chat-context-preview__item-reasons">
          <n-tag
            v-for="reason in entry.reasons"
            :key="`${entry.kind}-${entry.index ?? 'prelude'}-${reason}`"
            size="small"
            :bordered="false"
            :type="helpers.omittedReasonType(reason)"
          >
            {{ helpers.omittedReasonLabel(reason) }}
          </n-tag>
        </div>
        <div v-if="helpers.entryNote(entry)" class="chat-context-preview__item-note">
          {{ helpers.entryNote(entry) }}
        </div>
        <div class="chat-context-preview__item-text">
          {{ entry.previewText || '（无预览文本）' }}
        </div>
      </div>
    </div>
    <div v-else class="chat-context-preview__empty">
      当前筛选下没有未纳入项。
    </div>
  </div>
</template>

<script setup>
import { NButton, NTag } from 'naive-ui'

defineProps({
  budgetStatus: {
    type: Object,
    default: () => ({ level: 'safe', text: '' })
  },
  budgetSummaryText: {
    type: String,
    default: ''
  },
  budgetItems: {
    type: Array,
    default: () => []
  },
  previewSummaryText: {
    type: String,
    default: ''
  },
  entries: {
    type: Array,
    default: () => []
  },
  omittedEntries: {
    type: Array,
    default: () => []
  },
  omittedSummaryText: {
    type: String,
    default: ''
  },
  omittedFilterOptions: {
    type: Array,
    default: () => []
  },
  resolvedOmittedFilter: {
    type: String,
    default: 'all'
  },
  filteredOmittedEntries: {
    type: Array,
    default: () => []
  },
  omittedFilter: {
    type: String,
    default: 'all'
  },
  theme: {
    type: String,
    default: 'light'
  },
  helpers: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:omittedFilter'])

function entryKey(entry, index, prefix = '') {
  const parts = [
    prefix,
    entry?.kind || 'entry',
    entry?.index ?? 'prelude',
    entry?.mode || 'full',
    index
  ]
  return parts.filter(Boolean).join('-')
}
</script>

<style scoped>
.chat-context-budget {
  margin-top: 4px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.035));
}

:deep(.chat-page.dark) .chat-context-budget {
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.055));
}

:deep(.chat-context-window-modal.is-dark) .chat-context-budget {
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.055));
}

:deep(.chat-context-window-panel.is-dark) .chat-context-budget {
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.055));
}

.chat-context-budget.is-dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.055));
}

.chat-context-budget__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-context-budget__title {
  font-size: 12px;
  font-weight: 600;
}

.chat-context-budget__meta {
  font-size: 11px;
  opacity: 0.72;
}

.chat-context-budget__list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-context-budget__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-context-budget__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-context-budget__label,
.chat-context-budget__value {
  font-size: 12px;
}

.chat-context-budget__label {
  font-weight: 500;
}

.chat-context-budget__value {
  opacity: 0.78;
}

.chat-context-budget__track {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

:deep(.chat-page.dark) .chat-context-budget__track {
  background: rgba(255, 255, 255, 0.08);
}

:deep(.chat-context-window-modal.is-dark) .chat-context-budget__track {
  background: rgba(255, 255, 255, 0.08);
}

:deep(.chat-context-window-panel.is-dark) .chat-context-budget__track {
  background: rgba(255, 255, 255, 0.08);
}

.chat-context-budget.is-dark .chat-context-budget__track {
  background: rgba(255, 255, 255, 0.08);
}

.chat-context-budget__fill {
  height: 100%;
  border-radius: inherit;
  background: rgba(59, 130, 246, 0.6);
}

.chat-context-budget__fill.is-warning {
  background: rgba(245, 158, 11, 0.72);
}

.chat-context-budget__fill.is-critical {
  background: rgba(239, 68, 68, 0.78);
}

.chat-context-budget__hint {
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.72;
}

.chat-context-budget-callout {
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.5;
}

.chat-context-budget-callout.is-warning {
  color: #92400e;
  background: rgba(251, 191, 36, 0.14);
  border: 1px solid rgba(245, 158, 11, 0.22);
}

.chat-context-budget-callout.is-critical {
  color: #991b1b;
  background: rgba(248, 113, 113, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.24);
}

:deep(.chat-page.dark) .chat-context-budget-callout.is-warning {
  color: #fbbf24;
}

:deep(.chat-context-window-modal.is-dark) .chat-context-budget-callout.is-warning {
  color: #fbbf24;
}

:deep(.chat-context-window-panel.is-dark) .chat-context-budget-callout.is-warning {
  color: #fbbf24;
}

.chat-context-budget-callout.is-dark.is-warning {
  color: #fbbf24;
}

:deep(.chat-page.dark) .chat-context-budget-callout.is-critical {
  color: #fca5a5;
}

:deep(.chat-context-window-modal.is-dark) .chat-context-budget-callout.is-critical {
  color: #fca5a5;
}

:deep(.chat-context-window-panel.is-dark) .chat-context-budget-callout.is-critical {
  color: #fca5a5;
}

.chat-context-budget-callout.is-dark.is-critical {
  color: #fca5a5;
}

.chat-context-preview {
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.018);
}

:deep(.chat-page.dark) .chat-context-preview {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

:deep(.chat-context-window-modal.is-dark) .chat-context-preview {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

:deep(.chat-context-window-panel.is-dark) .chat-context-preview {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.chat-context-preview.is-dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.chat-context-preview--omitted {
  background: rgba(239, 68, 68, 0.03);
}

:deep(.chat-page.dark) .chat-context-preview--omitted {
  background: rgba(248, 113, 113, 0.035);
}

:deep(.chat-context-window-modal.is-dark) .chat-context-preview--omitted {
  background: rgba(248, 113, 113, 0.035);
}

:deep(.chat-context-window-panel.is-dark) .chat-context-preview--omitted {
  background: rgba(248, 113, 113, 0.035);
}

.chat-context-preview--omitted.is-dark {
  background: rgba(248, 113, 113, 0.035);
}

.chat-context-preview__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-context-preview__title {
  font-size: 12px;
  font-weight: 600;
}

.chat-context-preview__meta {
  font-size: 11px;
  opacity: 0.72;
}

.chat-context-preview__filters {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-context-preview__list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-context-preview__item {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

:deep(.chat-page.dark) .chat-context-preview__item {
  background: rgba(15, 23, 42, 0.45);
  border-color: rgba(255, 255, 255, 0.08);
}

:deep(.chat-context-window-modal.is-dark) .chat-context-preview__item {
  background: rgba(15, 23, 42, 0.45);
  border-color: rgba(255, 255, 255, 0.08);
}

:deep(.chat-context-window-panel.is-dark) .chat-context-preview__item {
  background: rgba(15, 23, 42, 0.45);
  border-color: rgba(255, 255, 255, 0.08);
}

.chat-context-preview.is-dark .chat-context-preview__item {
  background: rgba(15, 23, 42, 0.45);
  border-color: rgba(255, 255, 255, 0.08);
}

.chat-context-preview__item--omitted {
  opacity: 0.9;
}

.chat-context-preview__item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-context-preview__item-title {
  font-size: 12px;
  font-weight: 600;
}

.chat-context-preview__item-meta {
  font-size: 11px;
  opacity: 0.72;
  margin-left: auto;
}

.chat-context-preview__item-reasons {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chat-context-preview__item-note {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.8;
}

.chat-context-preview__item-text {
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
}

.chat-context-preview__empty {
  margin-top: 10px;
  font-size: 12px;
  opacity: 0.72;
}
</style>
