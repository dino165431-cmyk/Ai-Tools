<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="模型设置"
    style="width: 900px; max-width: 95%;"
    @update:show="emit('update:show', $event)"
  >
    <n-collapse accordion>
      <n-collapse-item
        v-for="provider in providers"
        :key="provider._id"
        :name="provider._id"
        :title="provider.name || provider._id"
      >
        <n-flex vertical :size="8">
          <n-text depth="3" style="font-size: 12px; word-break: break-all;">
            {{ isBuiltinProvider(provider) ? 'uTools 内置 AI 服务商。模型在 uTools 设置中管理。' : (provider.baseurl || '未配置基础地址') }}
          </n-text>
          <n-flex v-if="isBuiltinProvider(provider)" align="center" wrap :size="8">
            <n-button size="tiny" secondary :loading="utoolsAiModelsLoading" @click.stop="emit('refresh-builtin-models')">
              刷新模型
            </n-button>
            <n-button size="tiny" @click.stop="emit('open-builtin-settings')">
              打开 uTools AI 设置
            </n-button>
            <n-text v-if="utoolsAiModelsError" depth="3" style="font-size: 12px;">
              {{ utoolsAiModelsError }}
            </n-text>
          </n-flex>
          <n-flex align="center" wrap :size="8">
            <n-flex v-for="model in (provider.selectModels || [])" :key="model" align="center" :size="4">
              <n-button
                size="tiny"
                :type="isCurrentModel(provider._id, model) ? 'primary' : 'default'"
                @click="emit('select-model', provider._id, model)"
              >
                {{ model }}
              </n-button>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="tiny" tertiary circle @click.stop="emit('toggle-default-model', provider._id, model)">
                    <template #icon>
                      <n-icon :component="isDefaultModel(provider._id, model) ? Star : StarOutline" size="12" />
                    </template>
                  </n-button>
                </template>
                {{ isDefaultModel(provider._id, model) ? '默认模型（点击清除）' : '设为默认模型' }}
              </n-tooltip>
            </n-flex>
            <n-text v-if="!provider.selectModels || provider.selectModels.length === 0" depth="3" style="font-size: 12px;">
              {{ isBuiltinProvider(provider) ? '当前还没有启用任何 uTools AI 模型，请先打开 uTools AI 设置。' : '当前服务商还没有启用的模型，请到 设置 -> 服务商 中配置。' }}
            </n-text>
          </n-flex>
        </n-flex>
      </n-collapse-item>
    </n-collapse>

    <template #footer>
      <n-flex justify="space-between" align="center" :size="12">
        <n-text depth="3" style="font-size: 12px;">
          默认模型：{{ defaultModelText || '无' }}
        </n-text>
        <n-button @click="emit('update:show', false)">关闭</n-button>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup>
import {
  NButton,
  NCollapse,
  NCollapseItem,
  NFlex,
  NIcon,
  NModal,
  NText,
  NTooltip
} from 'naive-ui'
import { Star, StarOutline } from '@vicons/ionicons5'

defineProps({
  show: { type: Boolean, default: false },
  providers: { type: Array, default: () => [] },
  defaultModelText: { type: String, default: '' },
  utoolsAiModelsLoading: { type: Boolean, default: false },
  utoolsAiModelsError: { type: String, default: '' },
  isBuiltinProvider: { type: Function, required: true },
  isCurrentModel: { type: Function, required: true },
  isDefaultModel: { type: Function, required: true }
})

const emit = defineEmits([
  'update:show',
  'refresh-builtin-models',
  'open-builtin-settings',
  'select-model',
  'toggle-default-model'
])
</script>
