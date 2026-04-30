<template>
  <n-popover
    trigger="click"
    placement="top-start"
    :disabled="sending"
    :width="340"
    style="max-width: calc(100vw - 32px);"
  >
    <template #trigger>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button
            size="small"
            tertiary
            circle
            :disabled="sending"
            :type="buttonType"
            :title="buttonTooltip"
          >
            <template #icon>
              <n-icon :component="OptionsOutline" size="12" />
            </template>
          </n-button>
        </template>
        {{ buttonTooltip }}
      </n-tooltip>
    </template>

    <div :class="['media-generation-params', { 'is-dark': theme === 'dark' }]">
      <div class="media-generation-params__section">
        <div class="media-generation-params__header">
          <div>
            <div class="media-generation-params__title">图片参数</div>
            <div class="media-generation-params__summary">{{ imageGenerationParamsSummary }}</div>
          </div>
          <n-switch
            size="small"
            :value="imageGenerationParamsEnabled"
            @update:value="emit('set-image-generation-params-enabled', $event)"
          />
        </div>

        <div class="media-generation-params__grid">
          <label class="media-generation-params__field">
            <span>尺寸</span>
            <n-select
              size="small"
              filterable
              tag
              :disabled="!imageGenerationParamsEnabled"
              :value="imageGenerationParams.size"
              :options="IMAGE_GENERATION_SIZE_OPTIONS"
              @update:value="updateImageParam('size', $event)"
            />
          </label>

          <label class="media-generation-params__field">
            <span>质量</span>
            <n-select
              size="small"
              :disabled="!imageGenerationParamsEnabled"
              :value="imageGenerationParams.quality"
              :options="IMAGE_GENERATION_QUALITY_OPTIONS"
              @update:value="updateImageParam('quality', $event)"
            />
          </label>
        </div>

        <n-button
          size="tiny"
          tertiary
          :disabled="!imageGenerationParamsEnabled"
          @click="emit('reset-image-generation-params')"
        >
          恢复图片默认
        </n-button>
      </div>

      <n-divider style="margin: 10px 0;" />

      <div class="media-generation-params__section">
        <div class="media-generation-params__header">
          <div>
            <div class="media-generation-params__title">视频参数</div>
            <div class="media-generation-params__summary">{{ videoGenerationParamsSummary }}</div>
          </div>
          <n-switch
            size="small"
            :value="videoGenerationParamsEnabled"
            @update:value="emit('set-video-generation-params-enabled', $event)"
          />
        </div>

        <div class="media-generation-params__grid">
          <label class="media-generation-params__field">
            <span>分辨率</span>
            <n-select
              size="small"
              filterable
              tag
              :disabled="!videoGenerationParamsEnabled"
              :value="videoGenerationParams.size"
              :options="VIDEO_GENERATION_SIZE_OPTIONS"
              @update:value="updateVideoParam('size', $event)"
            />
          </label>

          <label class="media-generation-params__field">
            <span>时长</span>
            <n-select
              size="small"
              :disabled="!videoGenerationParamsEnabled"
              :value="videoGenerationParams.duration"
              :options="VIDEO_GENERATION_DURATION_OPTIONS"
              clearable
              @update:value="updateVideoParam('duration', $event)"
            />
          </label>
        </div>

        <n-button
          size="tiny"
          tertiary
          :disabled="!videoGenerationParamsEnabled"
          @click="emit('reset-video-generation-params')"
        >
          恢复视频默认
        </n-button>
      </div>
    </div>
  </n-popover>
</template>

<script setup>
import { computed } from 'vue'
import { NButton, NDivider, NIcon, NPopover, NSelect, NSwitch, NTooltip } from 'naive-ui'
import { OptionsOutline } from '@vicons/ionicons5'
import {
  IMAGE_GENERATION_QUALITY_OPTIONS,
  IMAGE_GENERATION_SIZE_OPTIONS,
  VIDEO_GENERATION_DURATION_OPTIONS,
  VIDEO_GENERATION_SIZE_OPTIONS
} from '@/utils/chatMediaGenerationParams.js'

const props = defineProps({
  theme: {
    type: String,
    default: 'light'
  },
  sending: {
    type: Boolean,
    default: false
  },
  imageGenerationParamsEnabled: {
    type: Boolean,
    default: false
  },
  imageGenerationParams: {
    type: Object,
    required: true
  },
  imageGenerationParamsSummary: {
    type: String,
    default: ''
  },
  videoGenerationParamsEnabled: {
    type: Boolean,
    default: false
  },
  videoGenerationParams: {
    type: Object,
    required: true
  },
  videoGenerationParamsSummary: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'set-image-generation-params-enabled',
  'update-image-generation-params',
  'reset-image-generation-params',
  'set-video-generation-params-enabled',
  'update-video-generation-params',
  'reset-video-generation-params'
])

const buttonType = computed(() =>
  props.imageGenerationParamsEnabled || props.videoGenerationParamsEnabled ? 'primary' : 'default'
)

const buttonTooltip = computed(() => {
  const imageSummary = props.imageGenerationParamsEnabled
    ? props.imageGenerationParamsSummary || '已启用'
    : '未启用'
  const videoSummary = props.videoGenerationParamsEnabled
    ? props.videoGenerationParamsSummary || '已启用'
    : '未启用'
  return `生成参数：图片 ${imageSummary}；视频 ${videoSummary}`
})

function updateImageParam(key, value) {
  emit('update-image-generation-params', {
    ...(props.imageGenerationParams || {}),
    [key]: value
  })
}

function updateVideoParam(key, value) {
  emit('update-video-generation-params', {
    ...(props.videoGenerationParams || {}),
    [key]: value
  })
}
</script>

<style scoped>
.media-generation-params {
  color: rgba(15, 23, 42, 0.96);
}

.media-generation-params.is-dark {
  color: rgba(226, 232, 240, 0.96);
}

.media-generation-params__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.media-generation-params__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.media-generation-params__title {
  font-size: 13px;
  font-weight: 650;
}

.media-generation-params__summary {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
  color: rgba(100, 116, 139, 0.92);
}

.media-generation-params.is-dark .media-generation-params__summary {
  color: rgba(148, 163, 184, 0.95);
}

.media-generation-params__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.media-generation-params__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  color: rgba(71, 85, 105, 0.96);
}

.media-generation-params.is-dark .media-generation-params__field {
  color: rgba(203, 213, 225, 0.94);
}

.media-generation-params__field :deep(.n-base-selection),
.media-generation-params__field :deep(.n-input-number) {
  width: 100%;
}
</style>
