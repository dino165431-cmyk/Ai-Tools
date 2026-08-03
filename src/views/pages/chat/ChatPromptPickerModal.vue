<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="选择提示词（/prompt）"
    style="width: 700px; max-width: 95%;"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="left" label-width="90px">
      <n-form-item label="提示词">
        <n-select
          :value="selectedId"
          :options="options"
          :loading="loading"
          placeholder="选择本地提示词，或当前 MCP 提供的提示词"
          filterable
          clearable
          @update:value="emit('update:selected-id', $event)"
        />
      </n-form-item>
      <n-text depth="3" style="font-size: 12px; display: block; margin-left: 90px;">
        本地系统提示词会切换当前系统提示词；本地用户提示词与 MCP 提示词会插入到当前输入框。
      </n-text>

      <template v-if="selectedKind === 'mcp'">
        <McpArgumentForm
          v-if="show && mcpPromptArgs.length"
          :params="mcpPromptArgs"
          :form-data="mcpArgsForm"
          max-height="260px"
          padding="0"
          label-width="120px"
        />
        <n-text v-else depth="3" style="font-size: 12px; display: block; margin-left: 90px;">
          该 MCP 提示词无参数，将直接插入输入框。
        </n-text>
      </template>
      <template v-else-if="selectedLocalPrompt && localPromptVariables.length">
        <McpArgumentForm
          v-if="show"
          :params="localPromptVariables"
          :form-data="userArgsForm"
          max-height="260px"
          padding="0"
          label-width="120px"
        />
      </template>
      <n-text
        v-else-if="selectedLocalPrompt && isUserPrompt(selectedLocalPrompt)"
        depth="3"
        style="font-size: 12px; display: block; margin-left: 90px;"
      >
        该用户提示词无变量，将直接插入输入框。
      </n-text>
    </n-form>

    <template #footer>
      <n-flex justify="space-between" align="center" :size="12">
        <n-button size="small" @click="emit('clear')">清除提示词</n-button>
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
import { NButton, NFlex, NForm, NFormItem, NModal, NSelect, NText } from 'naive-ui'

const McpArgumentForm = defineAsyncComponent({
  loader: () => import('@/components/McpArgumentForm.vue'),
  suspensible: false
})

defineProps({
  show: { type: Boolean, default: false },
  selectedId: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectedKind: { type: String, default: '' },
  selectedLocalPrompt: { type: Object, default: null },
  mcpPromptArgs: { type: Array, default: () => [] },
  localPromptVariables: { type: Array, default: () => [] },
  mcpArgsForm: { type: Object, required: true },
  userArgsForm: { type: Object, required: true },
  isUserPrompt: { type: Function, required: true }
})

const emit = defineEmits(['update:show', 'update:selected-id', 'clear', 'apply'])
</script>
