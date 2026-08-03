<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="临时系统提示词"
    style="width: 900px; max-width: 95%;"
    @update:show="emit('update:show', $event)"
  >
    <n-flex vertical :size="12">
      <n-text depth="3" style="font-size: 12px;">
        当前来源：{{ basePromptSourceText }}
      </n-text>

      <n-input
        :value="draft"
        type="textarea"
        :autosize="{ minRows: 6, maxRows: 18 }"
        placeholder="输入仅对当前会话生效的临时系统提示词。"
        @update:value="emit('update:draft', $event)"
      />
    </n-flex>

    <template #footer>
      <n-flex justify="space-between" align="center" :size="12">
        <n-flex :size="8">
          <n-button size="small" :disabled="!hasSelectedSystemPrompt" @click="emit('reset-to-selected-prompt')">
            重置为提示词
          </n-button>
          <n-button size="small" @click="emit('clear')">清空</n-button>
        </n-flex>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" @click="emit('apply')">应用</n-button>
        </n-flex>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup>
import { NButton, NFlex, NInput, NModal, NText } from 'naive-ui'

defineProps({
  show: { type: Boolean, default: false },
  draft: { type: String, default: '' },
  basePromptSourceText: { type: String, default: '' },
  hasSelectedSystemPrompt: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:show',
  'update:draft',
  'reset-to-selected-prompt',
  'clear',
  'apply'
])
</script>
