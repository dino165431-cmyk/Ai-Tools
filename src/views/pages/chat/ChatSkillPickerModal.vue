<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="选择技能（/skill）"
    style="width: 800px; max-width: 95%;"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="left" label-width="90px">
      <n-form-item label="技能">
        <n-select
          :value="selectedIds"
          multiple
          :options="options"
          placeholder="选择技能（可选）"
          filterable
          clearable
          @update:value="emit('update:selected-ids', $event)"
        />
      </n-form-item>
    </n-form>

    <template #footer>
      <n-flex justify="flex-end" :size="12">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" @click="emit('apply')">应用</n-button>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup>
import { NButton, NFlex, NForm, NFormItem, NModal, NSelect } from 'naive-ui'

defineProps({
  show: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:show', 'update:selected-ids', 'apply'])
</script>
