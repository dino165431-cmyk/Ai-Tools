<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="选择智能体（@）"
    style="width: 600px; max-width: 95%;"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="left" label-width="90px">
      <n-form-item label="智能体">
        <n-select
          :value="selectedId"
          :options="options"
          placeholder="选择智能体"
          filterable
          clearable
          @update:value="emit('update:selected-id', $event)"
        />
      </n-form-item>
    </n-form>

    <template #footer>
      <n-flex justify="space-between" align="center" :size="12">
        <n-button size="small" :disabled="!hasSelectedAgent" @click="emit('clear')">恢复默认</n-button>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" :disabled="!selectedId" @click="emit('apply')">应用</n-button>
        </n-flex>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup>
import { NButton, NFlex, NForm, NFormItem, NModal, NSelect } from 'naive-ui'

defineProps({
  show: { type: Boolean, default: false },
  selectedId: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  hasSelectedAgent: { type: Boolean, default: false }
})

const emit = defineEmits(['update:show', 'update:selected-id', 'clear', 'apply'])
</script>
