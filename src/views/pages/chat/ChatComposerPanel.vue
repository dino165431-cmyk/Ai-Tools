<template>
  <n-card :class="['chat-composer-card', { 'is-dark': theme === 'dark' }]">
    <n-flex vertical :size="10">
      <input
        ref="fileInputRef"
        class="chat-file-input"
        type="file"
        multiple
        :accept="attachAccept"
        @change="emit('file-change', $event)"
      />

      <div class="chat-composer">
        <div v-if="showInlineAgentPicker" class="chat-inline-agent-picker">
          <div class="chat-inline-agent-picker__header">
            <span>智能体</span>
            <span class="chat-inline-agent-picker__query">{{ inlineAgentPickerHeaderText }}</span>
          </div>

          <div ref="inlineAgentListRef" class="chat-inline-agent-list">
            <button
              v-for="(agent, index) in inlineAgentSuggestions"
              :key="agent.value"
              type="button"
              class="chat-inline-agent-item"
              :data-inline-picker-index="index"
              :class="{
                'is-active': index === inlineAgentActiveIndex,
                'is-selected': agent.value === selectedAgentId,
                'is-disabled': busy
              }"
              :disabled="busy"
              :title="[agent.label, agent.name && agent.name !== agent.id ? `@${agent.id}` : '', agent.providerLabel, agent.model].filter(Boolean).join('\n')"
              @mousedown.prevent="emit('apply-inline-agent-suggestion', agent.value)"
            >
              <div class="chat-inline-agent-item__main">
                <span class="chat-inline-agent-item__name">{{ agent.label }}</span>
                <span v-if="agent.name && agent.name !== agent.id" class="chat-inline-agent-item__id">@{{ agent.id }}</span>
              </div>
              <div class="chat-inline-agent-item__meta">
                <span v-if="agent.providerLabel">{{ agent.providerLabel }}</span>
                <span v-if="agent.model">{{ agent.model }}</span>
                <span v-if="agent.value === selectedAgentId" class="chat-inline-agent-item__tag">已选中</span>
              </div>
            </button>
          </div>
        </div>

        <div v-if="showInlineCommandPicker" class="chat-inline-agent-picker">
          <div class="chat-inline-agent-picker__header">
            <span>{{ inlineCommandPickerTitle }}</span>
            <span class="chat-inline-agent-picker__query">{{ inlineCommandPickerHeaderText }}</span>
          </div>

          <div ref="inlineCommandListRef" class="chat-inline-agent-list">
            <button
              v-for="(item, index) in inlineCommandSuggestions"
              :key="`${inlineCommandMode}-${inlineCommandType}-${item.value}`"
              type="button"
              class="chat-inline-agent-item"
              :data-inline-picker-index="index"
              :class="{
                'is-active': index === inlineCommandActiveIndex,
                'is-selected': item.selected,
                'is-disabled': busy || item.disabled
              }"
              :disabled="busy || item.disabled"
              :title="item.title || ''"
              @mousedown.prevent="emit('apply-inline-command-suggestion', item)"
            >
              <div class="chat-inline-command-item__body">
                <div class="chat-inline-agent-item__main">
                  <span class="chat-inline-agent-item__name">{{ item.label }}</span>
                  <span v-if="item.id && item.id !== item.label" class="chat-inline-agent-item__id">{{ item.id }}</span>
                </div>
                <div v-if="item.description" class="chat-inline-command-item__description">{{ item.description }}</div>
              </div>

              <div class="chat-inline-agent-item__meta">
                <span v-if="item.meta">{{ item.meta }}</span>
                <span v-if="item.selected && item.selectedTag" class="chat-inline-agent-item__tag">{{ item.selectedTag }}</span>
              </div>
            </button>
          </div>
        </div>

        <n-input
          ref="composerInputRef"
          :key="composerInputKey"
          :value="inputValue"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 12 }"
          :placeholder="composerPlaceholder"
          :disabled="busy"
          @update:value="handleInputValueUpdate"
          @keydown="emit('input-keydown', $event)"
          @paste="emit('composer-paste', $event)"
          @click="emit('composer-click', $event)"
          @keyup="emit('composer-keyup', $event)"
          @focus="emit('composer-focus', $event)"
          @blur="emit('composer-blur', $event)"
        />
      </div>

      <ChatPendingAttachments
        :pending-attachments="pendingAttachments"
        :pending-image-attachments="pendingImageAttachments"
        :pending-file-attachments="pendingFileAttachments"
        :show-builtin-hint="showBuiltinHint"
        :theme="theme"
        :helpers="pendingAttachmentHelpers"
        :actions="pendingAttachmentActions"
      />

      <n-flex v-if="showInputModeTags" wrap :size="6" class="chat-attachments">
        <n-tag
          v-if="thinkingEffort !== 'auto'"
          size="small"
          closable
          @close="emit('set-thinking-effort', 'auto')"
        >
          <n-icon :component="SpeedometerOutline" size="14" style="margin-right: 4px;" />
          思考：{{ thinkingEffortLabel }}
        </n-tag>

        <n-tag
          v-if="imageGenerationMode !== 'auto'"
          size="small"
          closable
          @close="emit('set-image-generation-mode', 'auto')"
        >
          <n-icon :component="ImageOutline" size="14" style="margin-right: 4px;" />
          产图：{{ imageGenerationModeLabel }}
        </n-tag>

        <n-tag
          v-if="videoGenerationMode !== 'auto'"
          size="small"
          closable
          @close="emit('set-video-generation-mode', 'auto')"
        >
          <n-icon :component="VideocamOutline" size="14" style="margin-right: 4px;" />
          产视频：{{ videoGenerationModeLabel }}
        </n-tag>

        <n-tag
          v-if="imageGenerationParamsEnabled"
          size="small"
          closable
          @close="emit('set-image-generation-params-enabled', false)"
        >
          <n-icon :component="OptionsOutline" size="14" style="margin-right: 4px;" />
          图片参数：{{ imageGenerationParamsSummary }}
        </n-tag>

        <n-tag
          v-if="videoGenerationParamsEnabled"
          size="small"
          closable
          @close="emit('set-video-generation-params-enabled', false)"
        >
          <n-icon :component="OptionsOutline" size="14" style="margin-right: 4px;" />
          视频参数：{{ videoGenerationParamsSummary }}
        </n-tag>
      </n-flex>

      <n-flex justify="space-between" align="center" wrap :size="12">
        <n-flex align="center" wrap :size="6">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :disabled="busy || sessionMessagesLength === 0"
                @click="emit('clear-session')"
              >
                <template #icon>
                  <n-icon :component="Trash" size="12" />
                </template>
              </n-button>
            </template>
            清空会话（并关闭会话绑定）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('reset-chat-setup')">
                <template #icon>
                  <n-icon :component="RefreshOutline" size="12" />
                </template>
              </n-button>
            </template>
            重置配置（并关闭会话绑定）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('open-agent-modal')">
                <template #icon>
                  <n-icon :component="Magento" size="12" />
                </template>
              </n-button>
            </template>
            选择智能体（@）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('insert-inline-command-trigger', 'prompt')">
                <template #icon>
                  <n-icon :component="PromptIcon" size="12" />
                </template>
              </n-button>
            </template>
            选择提示词（/prompt）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('insert-inline-command-trigger', 'skill')">
                <template #icon>
                  <n-icon :component="SkillLevelIntermediate" size="12" />
                </template>
              </n-button>
            </template>
            选择技能（/skill）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('insert-inline-command-trigger', 'mcp')">
                <template #icon>
                  <n-icon :component="BareMetalServer02" size="12" />
                </template>
              </n-button>
            </template>
            选择 MCP（/mcp）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('open-file-picker')">
                <template #icon>
                  <n-icon :component="AttachOutline" size="12" />
                </template>
              </n-button>
            </template>
            添加附件（图片 / 文件）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :type="webSearchEnabled ? 'primary' : 'default'"
                :disabled="busy"
                @click="emit('toggle-web-search')"
              >
                <template #icon>
                  <n-icon :component="EarthOutline" size="12" />
                </template>
              </n-button>
            </template>
            联网搜索：{{ webSearchEnabled ? '开' : '关' }}
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :type="autoApproveTools ? 'primary' : 'default'"
                :disabled="busy"
                @click="emit('toggle-auto-approve-tools')"
              >
                <template #icon>
                  <n-icon :component="autoApproveTools ? ShieldCheckmarkOutline : ShieldOutline" size="12" />
                </template>
              </n-button>
            </template>
            自动批准工具调用：{{ autoApproveTools ? '开' : '关' }}
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :type="autoActivateAgentSkills ? 'primary' : 'default'"
                :disabled="busy"
                @click="emit('toggle-auto-activate-agent-skills')"
              >
                <template #icon>
                  <n-icon :component="SparklesOutline" size="12" />
                </template>
              </n-button>
            </template>
            自动启用智能体技能：{{ autoActivateAgentSkills ? '开' : '关' }}
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('cycle-tool-mode')">
                <template #icon>
                  <n-icon :component="HardwareChipOutline" size="12" />
                </template>
              </n-button>
            </template>
            工具模式：{{ toolModeDisplayText }}（点击切换）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="busy" @click="emit('open-context-window-modal')">
                <template #icon>
                  <n-icon :component="ChatbubbleEllipsesOutline" size="12" />
                </template>
              </n-button>
            </template>
            上下文窗口：{{ contextWindowPresetLabel }} / {{ contextWindowHistoryFocusLabel }}（点击设置）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :disabled="busy || refreshingMcpTools"
                @click="emit('refresh-active-mcp-tools')"
              >
                <template #icon>
                  <n-icon :component="RefreshOutline" size="12" />
                </template>
              </n-button>
            </template>
            刷新 MCP 工具列表
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :type="thinkingEffortButtonType"
                :disabled="busy"
                @click="emit('cycle-thinking-effort')"
              >
                <template #icon>
                  <n-icon :component="SpeedometerOutline" size="12" />
                </template>
              </n-button>
            </template>
            思考等级：{{ thinkingEffortLabel }}（点击切换）
          </n-tooltip>

          <n-popover
            v-if="mediaGenerationPresetGroups.length"
            v-model:show="mediaPresetPopoverVisible"
            trigger="click"
            placement="top-start"
            :disabled="busy"
          >
            <template #trigger>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="small" tertiary circle :disabled="busy" title="生成参数预设">
                    <template #icon>
                      <n-icon :component="SparklesOutline" size="12" />
                    </template>
                  </n-button>
                </template>
                生成参数预设
              </n-tooltip>
            </template>

            <div :class="['media-preset-popover', { 'is-dark': theme === 'dark' }]">
              <section
                v-for="group in mediaGenerationPresetGroups"
                :key="group.key"
                class="media-preset-group"
              >
                <div class="media-preset-group__header">
                  <span>{{ group.label }}</span>
                  <span>{{ group.children.length }} 个</span>
                </div>

                <div class="media-preset-grid">
                  <button
                    v-for="item in group.children"
                    :key="item.key"
                    type="button"
                    class="media-preset-item"
                    :title="item.label"
                    @click="handleMediaPresetSelect(item.key)"
                  >
                    <n-icon
                      :component="group.kind === 'video' ? VideocamOutline : ImageOutline"
                      size="13"
                    />
                    <span>{{ item.label }}</span>
                  </button>
                </div>
              </section>
            </div>
          </n-popover>

          <ChatMediaGenerationParamsPopover
            :theme="theme"
            :sending="busy"
            :image-generation-params-enabled="imageGenerationParamsEnabled"
            :image-generation-params="imageGenerationParams"
            :image-generation-params-summary="imageGenerationParamsSummary"
            :video-generation-params-enabled="videoGenerationParamsEnabled"
            :video-generation-params="videoGenerationParams"
            :video-generation-params-summary="videoGenerationParamsSummary"
            @set-image-generation-params-enabled="emit('set-image-generation-params-enabled', $event)"
            @update-image-generation-params="emit('update-image-generation-params', $event)"
            @reset-image-generation-params="emit('reset-image-generation-params')"
            @set-video-generation-params-enabled="emit('set-video-generation-params-enabled', $event)"
            @update-video-generation-params="emit('update-video-generation-params', $event)"
            @reset-video-generation-params="emit('reset-video-generation-params')"
          />

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :type="imageGenerationButtonType"
                :disabled="busy"
                @click="emit('cycle-image-generation-mode')"
              >
                <template #icon>
                  <n-icon :component="ImageOutline" size="12" />
                </template>
              </n-button>
            </template>
            产图模式：{{ imageGenerationModeLabel }}（点击切换）
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                tertiary
                circle
                :type="videoGenerationButtonType"
                :disabled="busy"
                @click="emit('cycle-video-generation-mode')"
              >
                <template #icon>
                  <n-icon :component="VideocamOutline" size="12" />
                </template>
              </n-button>
            </template>
            产视频模式：{{ videoGenerationModeLabel }}（点击切换）
          </n-tooltip>
        </n-flex>

        <n-flex :size="6">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle :disabled="!sending" @click="emit('stop')">
                <template #icon>
                  <n-icon :component="StopCircleOutline" size="12" />
                </template>
              </n-button>
            </template>
            停止
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                type="primary"
                circle
                :loading="busy"
                :disabled="!canSend"
                @click="emit('send')"
              >
                <template #icon>
                  <n-icon :component="SendOutline" size="12" />
                </template>
              </n-button>
            </template>
            发送
          </n-tooltip>
        </n-flex>
      </n-flex>

      <n-text depth="3" style="font-size: 12px;">{{ footerHint }}</n-text>
    </n-flex>
  </n-card>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { NButton, NCard, NFlex, NIcon, NInput, NPopover, NTag, NText, NTooltip } from 'naive-ui'
import { SkillLevelIntermediate, BareMetalServer02 } from '@vicons/carbon'
import { Trash, Magento } from '@vicons/fa'
import { Prompt as PromptIcon } from '@vicons/tabler'
import {
  SendOutline,
  StopCircleOutline,
  ShieldCheckmarkOutline,
  ShieldOutline,
  AttachOutline,
  ImageOutline,
  VideocamOutline,
  SpeedometerOutline,
  SparklesOutline,
  OptionsOutline,
  ChatbubbleEllipsesOutline,
  HardwareChipOutline,
  EarthOutline,
  RefreshOutline
} from '@vicons/ionicons5'

import ChatPendingAttachments from './ChatPendingAttachments.vue'
import ChatMediaGenerationParamsPopover from './ChatMediaGenerationParamsPopover.vue'

const props = defineProps({
  attachAccept: {
    type: String,
    required: true
  },
  theme: {
    type: String,
    default: 'light'
  },
  sending: {
    type: Boolean,
    default: false
  },
  preparingSend: {
    type: Boolean,
    default: false
  },
  composerInputKey: {
    type: Number,
    required: true
  },
  inputValue: {
    type: String,
    required: true
  },
  showInlineAgentPicker: {
    type: Boolean,
    default: false
  },
  inlineAgentPickerHeaderText: {
    type: String,
    default: ''
  },
  inlineAgentSuggestions: {
    type: Array,
    required: true
  },
  inlineAgentActiveIndex: {
    type: Number,
    default: 0
  },
  selectedAgentId: {
    type: String,
    default: ''
  },
  showInlineCommandPicker: {
    type: Boolean,
    default: false
  },
  inlineCommandPickerTitle: {
    type: String,
    default: ''
  },
  inlineCommandPickerHeaderText: {
    type: String,
    default: ''
  },
  inlineCommandSuggestions: {
    type: Array,
    required: true
  },
  inlineCommandMode: {
    type: String,
    default: ''
  },
  inlineCommandType: {
    type: String,
    default: ''
  },
  inlineCommandActiveIndex: {
    type: Number,
    default: 0
  },
  pendingAttachments: {
    type: Array,
    required: true
  },
  pendingImageAttachments: {
    type: Array,
    required: true
  },
  pendingFileAttachments: {
    type: Array,
    required: true
  },
  showBuiltinHint: {
    type: Boolean,
    default: false
  },
  pendingAttachmentHelpers: {
    type: Object,
    required: true
  },
  pendingAttachmentActions: {
    type: Object,
    required: true
  },
  showInputModeTags: {
    type: Boolean,
    default: false
  },
  thinkingEffort: {
    type: String,
    default: 'auto'
  },
  thinkingEffortLabel: {
    type: String,
    default: ''
  },
  imageGenerationMode: {
    type: String,
    default: 'auto'
  },
  imageGenerationModeLabel: {
    type: String,
    default: ''
  },
  videoGenerationMode: {
    type: String,
    default: 'auto'
  },
  videoGenerationModeLabel: {
    type: String,
    default: ''
  },
  imageGenerationParamsEnabled: {
    type: Boolean,
    default: false
  },
  imageGenerationParams: {
    type: Object,
    default: () => ({})
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
    default: () => ({})
  },
  videoGenerationParamsSummary: {
    type: String,
    default: ''
  },
  sessionMessagesLength: {
    type: Number,
    default: 0
  },
  autoApproveTools: {
    type: Boolean,
    default: false
  },
  webSearchEnabled: {
    type: Boolean,
    default: true
  },
  autoActivateAgentSkills: {
    type: Boolean,
    default: false
  },
  toolModeDisplayText: {
    type: String,
    default: ''
  },
  contextWindowPresetLabel: {
    type: String,
    default: ''
  },
  contextWindowHistoryFocusLabel: {
    type: String,
    default: ''
  },
  refreshingMcpTools: {
    type: Boolean,
    default: false
  },
  thinkingEffortButtonType: {
    type: String,
    default: 'default'
  },
  imageGenerationButtonType: {
    type: String,
    default: 'default'
  },
  videoGenerationButtonType: {
    type: String,
    default: 'default'
  },
  mediaGenerationPresetOptions: {
    type: Array,
    default: () => []
  },
  canSend: {
    type: Boolean,
    default: false
  },
  footerHint: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'update:inputValue',
  'update:input-value',
  'file-change',
  'input-keydown',
  'composer-paste',
  'composer-click',
  'composer-keyup',
  'composer-focus',
  'composer-blur',
  'apply-inline-agent-suggestion',
  'apply-inline-command-suggestion',
  'set-thinking-effort',
  'set-image-generation-mode',
  'set-video-generation-mode',
  'set-image-generation-params-enabled',
  'update-image-generation-params',
  'reset-image-generation-params',
  'set-video-generation-params-enabled',
  'update-video-generation-params',
  'reset-video-generation-params',
  'clear-session',
  'reset-chat-setup',
  'open-agent-modal',
  'insert-inline-command-trigger',
  'open-file-picker',
  'toggle-web-search',
  'toggle-auto-approve-tools',
  'toggle-auto-activate-agent-skills',
  'cycle-tool-mode',
  'open-context-window-modal',
  'refresh-active-mcp-tools',
  'cycle-thinking-effort',
  'cycle-image-generation-mode',
  'cycle-video-generation-mode',
  'apply-media-preset',
  'stop',
  'send'
])

const fileInputRef = ref(null)
const composerInputRef = ref(null)
const inlineAgentListRef = ref(null)
const inlineCommandListRef = ref(null)
const mediaPresetPopoverVisible = ref(false)

const busy = computed(() => props.sending || props.preparingSend)

const composerPlaceholder = computed(() => {
  if (props.preparingSend) return '正在准备发送，请稍候…'
  if (props.sending) return '正在发送，请稍候…'
  return '输入消息……（回车发送，Shift+回车换行，@ 选择智能体，/prompt 提示词，/skill 技能，/mcp MCP）'
})

function handleInputValueUpdate(value) {
  emit('update:inputValue', value)
  emit('update:input-value', value)
}

const mediaGenerationPresetGroups = computed(() => {
  return (Array.isArray(props.mediaGenerationPresetOptions) ? props.mediaGenerationPresetOptions : [])
    .map((group) => {
      const children = Array.isArray(group?.children)
        ? group.children.filter((item) => item?.key && item?.label)
        : []
      if (!children.length) return null
      const key = String(group?.key || '').trim()
      const label = String(group?.label || '').trim()
      const kind = key.includes('video') || label.includes('视频') ? 'video' : 'image'
      return {
        key: key || `${kind}-presets`,
        kind,
        label: label || (kind === 'video' ? '视频' : '图片'),
        children
      }
    })
    .filter(Boolean)
})

function handleMediaPresetSelect(key) {
  mediaPresetPopoverVisible.value = false
  emit('apply-media-preset', key)
}

function scrollActiveInlinePickerItemIntoView(listEl, index) {
  if (!listEl || index < 0) return
  const item = listEl.querySelector(`[data-inline-picker-index="${index}"]`)
  if (!item) return
  item.scrollIntoView({ block: 'nearest' })
}

watch(
  () => [props.showInlineAgentPicker, props.inlineAgentActiveIndex, props.inlineAgentSuggestions.length],
  () => {
    if (!props.showInlineAgentPicker) return
    nextTick(() => scrollActiveInlinePickerItemIntoView(inlineAgentListRef.value, props.inlineAgentActiveIndex))
  },
  { flush: 'post' }
)

watch(
  () => [props.showInlineCommandPicker, props.inlineCommandActiveIndex, props.inlineCommandSuggestions.length],
  () => {
    if (!props.showInlineCommandPicker) return
    nextTick(() => scrollActiveInlinePickerItemIntoView(inlineCommandListRef.value, props.inlineCommandActiveIndex))
  },
  { flush: 'post' }
)

function triggerFilePicker() {
  fileInputRef.value?.click?.()
}

function focusComposer() {
  composerInputRef.value?.focus?.()
}

function getTextareaEl() {
  return composerInputRef.value?.textareaElRef || composerInputRef.value?.inputElRef || null
}

defineExpose({
  triggerFilePicker,
  focusComposer,
  getTextareaEl
})
</script>

<style scoped>
.chat-composer-card {
  width: 100%;
  border-radius: 22px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.84));
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.06);
  margin-top: 8px;
}

.chat-composer-card.is-dark {
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none;
}

.chat-file-input {
  display: none;
}

.chat-composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-composer :deep(.n-input) {
  border-radius: 16px;
}

.chat-composer :deep(.n-input-wrapper) {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
  transition: background-color 120ms ease, box-shadow 120ms ease;
}

.chat-composer :deep(.n-input-wrapper:hover) {
  background: rgba(255, 255, 255, 0.92);
}

.chat-composer :deep(.n-input__textarea-el),
.chat-composer :deep(.n-input__input-el) {
  color: inherit;
}

.chat-composer :deep(.n-input__textarea-el::placeholder),
.chat-composer :deep(.n-input__input-el::placeholder) {
  color: rgba(100, 116, 139, 0.9);
}

.chat-composer-card.is-dark .chat-composer :deep(.n-input-wrapper) {
  background: transparent !important;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.14);
}

.chat-composer-card.is-dark .chat-composer :deep(.n-input-wrapper:hover) {
  background: transparent !important;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.2);
}

.chat-composer-card.is-dark .chat-composer :deep(.n-input) {
  --n-color: transparent;
  --n-color-focus: transparent;
  --n-color-focus-warning: transparent;
  --n-color-focus-error: transparent;
  --n-color-disabled: transparent;
  --n-border: 1px solid rgba(148, 163, 184, 0.14);
  --n-border-hover: 1px solid rgba(148, 163, 184, 0.2);
  --n-border-focus: 1px solid rgba(148, 163, 184, 0.24);
  --n-box-shadow-focus: 0 0 0 2px rgba(148, 163, 184, 0.12);
  --n-text-color: rgba(226, 232, 240, 0.96);
  --n-placeholder-color: rgba(148, 163, 184, 0.82);
  --n-caret-color: rgba(226, 232, 240, 0.96);
}

.chat-composer-card.is-dark .chat-composer :deep(.n-input__textarea-el),
.chat-composer-card.is-dark .chat-composer :deep(.n-input__input-el) {
  color: rgba(226, 232, 240, 0.96);
}

.chat-composer-card.is-dark .chat-composer :deep(.n-input__textarea-el::placeholder),
.chat-composer-card.is-dark .chat-composer :deep(.n-input__input-el::placeholder) {
  color: rgba(148, 163, 184, 0.9);
}

.chat-inline-agent-picker {
  padding: 6px 8px;
  border-radius: 9px;
  border: 1px solid rgba(32, 128, 240, 0.16);
  background: rgba(32, 128, 240, 0.06);
}

.chat-composer-card.is-dark .chat-inline-agent-picker {
  border-color: rgba(64, 169, 255, 0.26);
  background: rgba(64, 169, 255, 0.12);
}

.chat-inline-agent-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 600;
}

.chat-inline-agent-picker__query {
  opacity: 0.68;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-inline-agent-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 2px;
}

.chat-inline-agent-item {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
  transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
}

.chat-inline-agent-item:hover,
.chat-inline-agent-item.is-active {
  border-color: rgba(32, 128, 240, 0.45);
  background: rgba(255, 255, 255, 0.96);
  transform: translateY(-1px);
}

.chat-inline-agent-item.is-selected {
  border-color: rgba(24, 160, 88, 0.35);
}

.chat-inline-agent-item.is-disabled,
.chat-inline-agent-item:disabled {
  opacity: 0.56;
  cursor: not-allowed;
  transform: none;
}

.chat-inline-agent-item.is-disabled:hover,
.chat-inline-agent-item:disabled:hover {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.72);
  transform: none;
}

.chat-composer-card.is-dark .chat-inline-agent-item {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(24, 24, 28, 0.72);
  color: inherit;
}

.chat-composer-card.is-dark .chat-inline-agent-item:hover,
.chat-composer-card.is-dark .chat-inline-agent-item.is-active {
  border-color: rgba(64, 169, 255, 0.52);
  background: rgba(32, 32, 36, 0.96);
}

.chat-composer-card.is-dark .chat-inline-agent-item.is-disabled,
.chat-composer-card.is-dark .chat-inline-agent-item:disabled {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(24, 24, 28, 0.72);
}

.chat-composer-card.is-dark .chat-inline-agent-item.is-disabled:hover,
.chat-composer-card.is-dark .chat-inline-agent-item:disabled:hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(24, 24, 28, 0.72);
}

.chat-inline-agent-item__main,
.chat-inline-agent-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: nowrap;
}

.chat-inline-agent-item__main {
  flex: 1;
  overflow: hidden;
}

.chat-inline-command-item__body {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.chat-inline-agent-item__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.chat-inline-agent-item__id,
.chat-inline-agent-item__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  opacity: 0.72;
}

.chat-inline-command-item__description {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  opacity: 0.68;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-inline-agent-item__tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.14);
  color: #208050;
  opacity: 1;
  font-size: 10px;
  flex: 0 0 auto;
}

.chat-composer-card.is-dark .chat-inline-agent-item__tag {
  background: rgba(24, 160, 88, 0.22);
  color: #8ee6b0;
}

.chat-attachments {
  padding: 0 2px;
}

.media-preset-popover {
  width: min(420px, calc(100vw - 28px));
  max-height: min(520px, calc(100vh - 160px));
  overflow-y: auto;
  padding: 2px;
}

.media-preset-group + .media-preset-group {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.media-preset-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  padding: 0 2px;
  color: rgba(15, 23, 42, 0.72);
  font-size: 11px;
  font-weight: 700;
}

.media-preset-group__header span:last-child {
  color: rgba(100, 116, 139, 0.72);
  font-size: 10px;
  font-weight: 500;
}

.media-preset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.media-preset-item {
  min-width: 0;
  min-height: 30px;
  padding: 5px 7px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.88);
  color: rgba(15, 23, 42, 0.9);
  appearance: none;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
}

.media-preset-item:hover {
  border-color: rgba(32, 128, 240, 0.42);
  background: rgba(239, 246, 255, 0.96);
  transform: translateY(-1px);
}

.media-preset-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.media-preset-item :deep(.n-icon) {
  flex: 0 0 auto;
  color: rgba(32, 128, 240, 0.78);
}

.media-preset-popover.is-dark .media-preset-group + .media-preset-group {
  border-top-color: rgba(148, 163, 184, 0.2);
}

.media-preset-popover.is-dark .media-preset-group__header {
  color: rgba(226, 232, 240, 0.78);
}

.media-preset-popover.is-dark .media-preset-group__header span:last-child {
  color: rgba(148, 163, 184, 0.82);
}

.media-preset-popover.is-dark .media-preset-item {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(30, 41, 59, 0.58);
  color: rgba(226, 232, 240, 0.94);
}

.media-preset-popover.is-dark .media-preset-item:hover {
  border-color: rgba(64, 169, 255, 0.48);
  background: rgba(30, 64, 115, 0.46);
}

@media (max-width: 520px) {
  .media-preset-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
