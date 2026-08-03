<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="选择 MCP（/mcp）"
    style="width: 720px; max-width: 92%;"
    @update:show="emit('update:show', $event)"
  >
    <n-flex vertical :size="12">
      <n-form label-placement="left" label-width="90px">
        <n-form-item label="MCP 服务">
          <n-select
            :value="selectedIds"
            multiple
            size="small"
            :options="options"
            placeholder="选择 MCP 服务（可选）"
            filterable
            clearable
            @update:value="emit('update:selected-ids', $event)"
          />
        </n-form-item>
      </n-form>

      <n-text depth="3" style="font-size: 12px;">
        技能中配置的 MCP 会随技能选择自动加入（当前来自技能：{{ derivedMcpCount }}）
      </n-text>
    </n-flex>

    <template #footer>
      <n-flex justify="space-between" align="center" :size="12">
        <n-dropdown trigger="click" placement="top-start" :options="toolApprovalModeOptions" @select="emit('set-tool-approval-mode', $event)">
          <n-button
            size="small"
            tertiary
            circle
            :type="toolApprovalModeButtonType"
            :title="`工具调用控制：${toolApprovalModeLabel}`"
          >
            <template #icon>
              <n-icon :component="toolApprovalMode === manualApprovalMode ? ShieldOutline : ShieldCheckmarkOutline" size="16" />
            </template>
          </n-button>
        </n-dropdown>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" @click="emit('apply')">应用</n-button>
        </n-flex>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup>
import { NButton, NDropdown, NFlex, NForm, NFormItem, NIcon, NModal, NSelect, NText } from 'naive-ui'
import { ShieldCheckmarkOutline, ShieldOutline } from '@vicons/ionicons5'

defineProps({
  show: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  derivedMcpCount: { type: Number, default: 0 },
  toolApprovalMode: { type: String, default: '' },
  manualApprovalMode: { type: String, required: true },
  toolApprovalModeLabel: { type: String, default: '' },
  toolApprovalModeButtonType: { type: String, default: 'default' },
  toolApprovalModeOptions: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'update:show',
  'update:selected-ids',
  'set-tool-approval-mode',
  'apply'
])
</script>
