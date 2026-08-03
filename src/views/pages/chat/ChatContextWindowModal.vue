<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    :class="['chat-context-window-modal', { 'is-dark': theme === 'dark' }]"
    preset="card"
    title="上下文窗口"
    style="width: 720px; max-width: 95%;"
    @update:show="emit('update:show', $event)"
  >
    <n-flex vertical :size="12" :class="['chat-context-window-panel', { 'is-dark': theme === 'dark' }]">
      <n-text depth="3" style="font-size: 12px;">
        这里只影响当前请求会向模型发送多少历史上下文，不会修改会话原始记录。
      </n-text>
      <n-form label-placement="left" label-width="110px">
        <n-form-item label="预设策略">
          <n-select
            v-model:value="draft.preset"
            :options="presetOptions"
            placeholder="选择上下文策略"
            @update:value="emit('preset-change', $event)"
          />
        </n-form-item>

        <n-form-item label="历史侧重">
          <n-select
            v-model:value="draft.historyFocus"
            :options="historyFocusOptions"
            placeholder="选择历史保留方式"
          />
        </n-form-item>
        <n-text depth="3" style="font-size: 12px; margin-top: -8px;">
          {{ draftHistoryFocusHint }}
        </n-text>

        <template v-if="draft.preset === 'custom'">
          <n-form-item label="最大轮次">
            <n-input-number v-model:value="draft.maxTurns" :min="2" :max="200" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="完整保留轮次">
            <n-input-number v-model:value="draft.keepRecentTurnsFull" :min="1" :max="64" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="最大消息数">
            <n-input-number v-model:value="draft.maxMessages" :min="8" :max="1000" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="展开 Token">
            <n-input-number v-model:value="draft.maxTokensExpanded" :min="1000" :max="4000000" :step="1000" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="精简 Token">
            <n-input-number v-model:value="draft.maxTokensCompact" :min="1000" :max="4000000" :step="1000" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="展开模式字符">
            <n-input-number v-model:value="draft.maxCharsExpanded" :min="4000" :max="4200000" :step="10000" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="精简模式字符">
            <n-input-number v-model:value="draft.maxCharsCompact" :min="6000" :max="4200000" :step="10000" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="自动压缩阈值">
            <n-input-number v-model:value="draft.autoCompactTriggerPercent" :min="55" :max="95" :step="1" style="width: 180px;" />
          </n-form-item>
          <n-text depth="3" style="font-size: 12px;">
            有输入 Token 统计时使用 Token 预算；否则自动使用字符预算。
          </n-text>
        </template>
      </n-form>

      <n-text depth="3" style="font-size: 12px;">
        当前会话：{{ summaryText }}
      </n-text>
      <n-text depth="3" style="font-size: 12px;">
        {{ providerHint }}
      </n-text>
      <ChatContextWindowPreview
        v-if="show"
        :theme="theme"
        :budget-status="budgetStatus"
        :budget-summary-text="previewBudgetSummaryText"
        :budget-items="previewBudgetItems"
        :summary-text="compressedSummaryText"
        :summary-meta-text="compressedSummaryMetaText"
        :summary-chain-text="compressedSummaryChainText"
        :summary-source-text="compressedSummarySourceText"
        :preview-summary-text="previewSummaryText"
        :entries="previewEntries"
        :omitted-entries="previewOmittedEntries"
        :omitted-summary-text="previewOmittedSummaryText"
        :omitted-filter-options="previewOmittedFilterOptions"
        :resolved-omitted-filter="previewResolvedOmittedFilter"
        :filtered-omitted-entries="previewFilteredOmittedEntries"
        :omitted-filter="omittedFilter"
        :helpers="previewHelpers"
        @update:omitted-filter="emit('update:omitted-filter', $event)"
      />
    </n-flex>

    <template #footer>
      <n-flex justify="space-between" align="center" :size="12">
        <n-button size="small" @click="emit('reset')">恢复默认</n-button>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" @click="emit('apply')">应用</n-button>
        </n-flex>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'
import {
  NButton,
  NFlex,
  NForm,
  NFormItem,
  NInputNumber,
  NModal,
  NSelect,
  NText
} from 'naive-ui'

const ChatContextWindowPreview = defineAsyncComponent({
  loader: () => import('./ChatContextWindowPreview.vue'),
  suspensible: false
})

defineProps({
  show: { type: Boolean, default: false },
  theme: { type: String, default: 'light' },
  draft: { type: Object, required: true },
  presetOptions: { type: Array, default: () => [] },
  historyFocusOptions: { type: Array, default: () => [] },
  draftHistoryFocusHint: { type: String, default: '' },
  summaryText: { type: String, default: '' },
  providerHint: { type: String, default: '' },
  budgetStatus: { type: Object, default: () => ({}) },
  previewBudgetSummaryText: { type: String, default: '' },
  previewBudgetItems: { type: Array, default: () => [] },
  compressedSummaryText: { type: String, default: '' },
  compressedSummaryMetaText: { type: String, default: '' },
  compressedSummaryChainText: { type: String, default: '' },
  compressedSummarySourceText: { type: String, default: '' },
  previewSummaryText: { type: String, default: '' },
  previewEntries: { type: Array, default: () => [] },
  previewOmittedEntries: { type: Array, default: () => [] },
  previewOmittedSummaryText: { type: String, default: '' },
  previewOmittedFilterOptions: { type: Array, default: () => [] },
  previewResolvedOmittedFilter: { type: String, default: '' },
  previewFilteredOmittedEntries: { type: Array, default: () => [] },
  omittedFilter: { type: String, default: '' },
  previewHelpers: { type: Object, required: true }
})

const emit = defineEmits([
  'update:show',
  'update:omitted-filter',
  'preset-change',
  'reset',
  'apply'
])
</script>
