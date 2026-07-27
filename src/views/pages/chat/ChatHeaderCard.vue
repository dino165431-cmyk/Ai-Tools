<template>
  <n-card hoverable :class="['chat-header-card', { 'is-dark': theme === 'dark' }]">
    <n-flex justify="space-between" align="center" wrap :size="12">
      <n-flex align="center" :size="8">
        <n-icon :component="ChatMultiple24Filled" size="20" :depth="1" />
        <span class="chat-header-card__title">聊天</span>
      </n-flex>

      <n-flex align="center" wrap :size="8">
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button size="small" tertiary circle @click="emit('open-model-modal')">
              <template #icon>
                <n-icon :component="FlowModelerReference" size="16" />
              </template>
            </n-button>
          </template>
          {{ modelTooltipText }}
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button size="small" tertiary circle @click="emit('open-system-prompt-modal')">
              <template #icon>
                <n-icon :component="PromptIcon" size="16" />
              </template>
            </n-button>
          </template>
          {{ systemTooltipText }}
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button size="small" tertiary circle :disabled="!sessionMessagesLength" @click="emit('open-save-session-modal')">
              <template #icon>
                <n-icon :component="SaveOutline" size="16" />
              </template>
            </n-button>
          </template>
          保存会话
        </n-tooltip>

        <n-dropdown trigger="click" :options="memorySessionDropdownOptions" @select="(key) => emit('select-memory-session', key)">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary title="新建会话">
                <template #icon>
                  <n-icon :component="ChatMultiple24Filled" size="16" />
                </template>
                {{ runningMemorySessionCount || '新建' }}
              </n-button>
            </template>
            新建会话；运行中的会话会显示在这里
          </n-tooltip>
        </n-dropdown>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button size="small" tertiary circle :disabled="!sessionMediaItemCount" @click="emit('open-media-library')">
              <template #icon>
                <n-icon :component="ImageOutline" size="16" />
              </template>
            </n-button>
          </template>
          媒体库（{{ sessionMediaItemCount }}）
        </n-tooltip>
      </n-flex>
    </n-flex>

    <n-flex align="center" wrap :size="6" class="chat-header-card__tags">
      <n-tag v-if="selectedProvider" size="small" type="info" bordered>
        服务商：{{ selectedProvider.name || selectedProvider._id }}
      </n-tag>
      <n-tag v-if="selectedModel" size="small" bordered>
        模型：{{ selectedModel }}
      </n-tag>
      <n-tooltip v-if="selectedAgent" trigger="hover">
        <template #trigger>
          <n-tag size="small" type="success" bordered>
            智能体：{{ selectedAgent.name || selectedAgent._id }}
          </n-tag>
        </template>
        {{ selectedAgentHoverText }}
      </n-tooltip>
      <n-tag v-if="activePromptLabel" size="small" type="success" bordered>
        提示词：{{ activePromptLabel }}
      </n-tag>
      <n-tooltip v-if="selectedSkillCount" trigger="hover">
        <template #trigger>
          <n-tag size="small" type="warning" bordered>
            技能：{{ selectedSkillCount }}
          </n-tag>
        </template>
        {{ selectedSkillsHoverText }}
      </n-tooltip>
      <n-tooltip v-if="activeMcpServerCount" trigger="hover">
        <template #trigger>
          <n-tag size="small" type="warning" bordered>
            MCP：{{ activeMcpServerCount }}
          </n-tag>
        </template>
        {{ activeMcpServersHoverText }}
      </n-tooltip>
      <n-tooltip v-if="activeMcpServerCount" trigger="hover">
        <template #trigger>
          <n-tag size="small" bordered>
            工具：{{ mcpToolCountText }}
          </n-tag>
        </template>
        {{ activeMcpToolsHoverText }}
      </n-tooltip>
      <n-tag v-if="activeMcpServerCount" size="small" bordered>
        工具模式：{{ toolModeDisplayText }}
      </n-tag>
      <n-tooltip v-if="contextWindowSummaryTag" trigger="hover">
        <template #trigger>
          <n-tag size="small" bordered :type="contextWindowSummaryTagType">
            {{ contextWindowSummaryTag }}
          </n-tag>
        </template>
        {{ contextWindowSummaryTooltipText }}
      </n-tooltip>
      <n-tag
        v-if="activeSessionFilePath"
        size="small"
        type="primary"
        bordered
        closable
        :title="activeSessionFilePath"
        @close="emit('close-active-session')"
      >
        会话：{{ activeSessionDisplayTitle }}
      </n-tag>
      <n-text v-if="effectiveHeaderHint" depth="3" class="chat-header-card__hint">{{ effectiveHeaderHint }}</n-text>
    </n-flex>

    <div class="chat-header-overview">
      <div
        v-for="item in chatOverviewItems"
        :key="item.key"
        class="chat-header-overview__item"
      >
        <span class="chat-header-overview__label">{{ item.label }}</span>
        <strong class="chat-header-overview__value">{{ item.value }}</strong>
      </div>
    </div>
  </n-card>
</template>

<script setup>
import { computed } from 'vue'
import {
  NButton,
  NCard,
  NDropdown,
  NFlex,
  NIcon,
  NTag,
  NText,
  NTooltip
} from 'naive-ui'
import { ChatMultiple24Filled } from '@vicons/fluent'
import { FlowModelerReference } from '@vicons/carbon'
import { Prompt as PromptIcon } from '@vicons/tabler'
import { SaveOutline, ImageOutline } from '@vicons/ionicons5'

const props = defineProps({
  theme: { type: String, default: 'light' },
  modelTooltipText: { type: String, default: '' },
  systemTooltipText: { type: String, default: '' },
  sessionMessagesLength: { type: Number, default: 0 },
  runningMemorySessionCount: { type: Number, default: 0 },
  memorySessionDropdownOptions: { type: Array, default: () => [] },
  sessionMediaItemCount: { type: Number, default: 0 },
  selectedProvider: { type: Object, default: null },
  selectedModel: { type: String, default: '' },
  selectedAgent: { type: Object, default: null },
  selectedAgentHoverText: { type: String, default: '' },
  activePromptLabel: { type: String, default: '' },
  selectedSkillCount: { type: Number, default: 0 },
  selectedSkillsHoverText: { type: String, default: '' },
  activeMcpServerCount: { type: Number, default: 0 },
  activeMcpServersHoverText: { type: String, default: '' },
  mcpToolCountText: { type: String, default: '' },
  activeMcpToolsHoverText: { type: String, default: '' },
  toolModeDisplayText: { type: String, default: '' },
  contextWindowSummaryTag: { type: String, default: '' },
  contextWindowSummaryTagType: { type: String, default: undefined },
  contextWindowSummaryTooltipText: { type: String, default: '' },
  activeSessionFilePath: { type: String, default: '' },
  activeSessionDisplayTitle: { type: String, default: '' },
  effectiveHeaderHint: { type: String, default: '' },
  chatOverviewItems: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'open-model-modal',
  'open-system-prompt-modal',
  'open-save-session-modal',
  'select-memory-session',
  'open-media-library',
  'close-active-session'
])

const contextWindowSummaryTagType = computed(() => props.contextWindowSummaryTagType)
</script>

<style scoped>
.chat-header-card {
  width: 100%;
  border-radius: 22px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.84));
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.06);
}

.chat-header-card.is-dark {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.72));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.28);
}

.chat-header-card__title {
  font-weight: 500;
}

.chat-header-card__tags {
  margin-top: 10px;
}

.chat-header-card__hint {
  font-size: 12px;
}

.chat-header-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.chat-header-overview__item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 11px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.03);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.chat-header-card.is-dark .chat-header-overview__item {
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.chat-header-overview__label {
  font-size: 11px;
  line-height: 1.45;
  opacity: 0.72;
}

.chat-header-overview__value {
  min-width: 0;
  font-size: 13px;
  line-height: 1.45;
  font-weight: 600;
  word-break: break-word;
}

@media (max-width: 720px) {
  .chat-header-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
