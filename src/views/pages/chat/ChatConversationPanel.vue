<template>
  <div class="chat-messages-shell">
    <n-card class="chat-messages" :bordered="false" content-style="padding: 0; height: 100%;">
      <div class="chat-scroll-wrapper">
        <div
          v-if="historySessionLoadState.visible"
          class="chat-session-loading"
          :class="{ 'is-blocking': historySessionLoadState.blocking }"
          role="status"
          aria-live="polite"
        >
          <span class="chat-session-loading__spinner" aria-hidden="true" />
          <div class="chat-session-loading__content">
            <strong>{{ historySessionLoadState.phase }}</strong>
            <span v-if="historySessionLoadState.detail">{{ historySessionLoadState.detail }}</span>
            <div class="chat-session-loading__progress" aria-hidden="true">
              <span :style="{ width: `${historySessionLoadState.percent}%` }" />
            </div>
          </div>
        </div>

        <n-scrollbar
          :ref="setScrollbarRef"
          class="chat-main-scrollbar"
          @scroll="actions.handleChatScroll"
          @wheel.passive="actions.handleChatWheel"
          @pointerdown="actions.handleChatPointerDown"
          @touchstart.passive="actions.handleChatPointerDown"
        >
          <div
            :ref="setChatListRef"
            class="chat-list"
            :class="{ 'is-virtualized': chatVirtualizedEnabled }"
            :style="chatVirtualListStyle"
            @click="actions.handleChatPreviewLinkClick"
            @contextmenu="actions.handleChatPreviewLinkContextMenu"
          >
            <div v-if="!sessionMessagesLength" class="chat-empty-state">
              <div class="chat-empty-state__panel">
                <div class="chat-empty-state__hero">
                  <div class="chat-empty-state__icon">
                    <n-icon :component="ChatMultiple24Filled" size="26" />
                  </div>
                  <div class="chat-empty-state__title">开始一段新对话</div>
                  <div class="chat-empty-state__description">{{ emptyStateDescription }}</div>
                </div>

                <div class="chat-empty-state__summary">
                  <div v-for="item in setupSummaryItems" :key="item.key" class="chat-empty-state__summary-item">
                    <span class="chat-empty-state__summary-label">{{ item.label }}</span>
                    <span class="chat-empty-state__summary-value" :title="item.value">{{ item.value }}</span>
                  </div>
                </div>

                <div class="chat-empty-state__actions">
                  <n-button size="small" secondary @click="emit('open-model-modal')">模型设置</n-button>
                  <n-button size="small" secondary @click="emit('open-system-prompt-modal')">系统提示词</n-button>
                  <n-button size="small" secondary @click="emit('open-agent-modal')">选择智能体</n-button>
                  <n-button size="small" secondary @click="emit('open-file-picker')">添加附件</n-button>
                  <n-button size="small" tertiary :type="sessionSiderCollapsed ? 'default' : 'primary'" @click="emit('toggle-session-sider')">
                    {{ sessionSiderCollapsed ? '打开会话列表' : '收起会话列表' }}
                  </n-button>
                </div>

                <div class="chat-empty-state__hint">{{ composerShortcutHint }}</div>
              </div>
            </div>

            <div
              v-for="msg in renderedMessages"
              :key="msg.id"
              class="chat-item"
              :class="[msg.role, helpers.chatItemStateClasses(msg), { 'is-virtualized': chatVirtualizedEnabled }]"
              :style="helpers.getChatVirtualItemStyle(msg)"
              :data-index="helpers.getChatVirtualItemIndex(msg)"
              :id="msg.role === 'user' ? `q-${msg.id}` : undefined"
              :ref="helpers.getChatVirtualItemRef(msg)"
            >
              <div class="chat-item__row">
                <div class="chat-item__avatar" :class="helpers.chatAvatarStateClasses(msg)">
                  <n-icon :component="helpers.roleIcon(msg)" size="18" :class="['chat-item__avatar-icon', helpers.chatAvatarIconClasses(msg)]" />
                </div>

                <div class="chat-item__bubble">
                  <div class="chat-item__content">
                    <template v-if="msg.role === 'assistant'">
                      <div v-if="msg.thinking" class="assistant-thinking">
                        <div class="assistant-thinking__toggle" @click="actions.toggleThinking(msg)">
                          <n-icon :component="msg.thinkingExpanded ? ChevronUpOutline : ChevronDownOutline" size="14" />
                          <span class="assistant-thinking__label">{{ msg.streaming ? '思考中...' : '思考完成' }}</span>
                          <span class="assistant-thinking__hint">{{ msg.thinkingExpanded ? '点击收起' : '点击展开' }}</span>
                        </div>
                        <pre v-show="msg.thinkingExpanded" class="assistant-thinking__text">{{ msg.thinking }}</pre>
                      </div>

                      <ChatAssistantMedia :msg="msg" :theme="theme" :helpers="assistantMediaHelpers" :actions="assistantMediaActions" />

                      <pre v-if="msg.render === 'text' && msg.content" class="chat-plain">{{ msg.content }}</pre>
                      <LazyMarkdownPreview
                        v-else-if="msg.content && helpers.shouldRenderHeavyChatMessage(msg)"
                        :editorId="`msg-${msg.id}`"
                        :modelValue="msg.content"
                        previewTheme="github"
                        :theme="theme"
                        :deferBlockLayout="helpers.shouldDeferHeavyChatBlockLayout(msg)"
                        :streaming="msg.streaming"
                        :stream-throttle-ms="streamRenderThrottleMs"
                        :code-foldable="true"
                        :auto-fold-threshold="codeAutoFoldThreshold"
                      />
                      <pre v-else-if="msg.content" class="chat-plain chat-plain--deferred">{{ msg.content }}</pre>
                    </template>

                    <template v-else-if="msg.role === 'user'">
                      <n-tag v-if="msg.guidance" size="tiny" type="info" class="chat-user-guidance-tag">引导</n-tag>
                      <n-input
                        v-if="msg.editing"
                        v-model:value="msg.editDraft"
                        type="textarea"
                        :autosize="{ minRows: 3, maxRows: 12 }"
                        placeholder="编辑后重发（回车发送，Shift+回车换行，Esc 取消）"
                        :disabled="sending"
                        @keydown="(event) => actions.handleUserEditKeydown(event, msg)"
                      />

                      <div v-if="!msg.editing" class="chat-user-message" :class="{ 'is-collapsed': helpers.isUserMessageCollapsed(msg) }">
                        <pre v-if="helpers.isUserMessageCollapsed(msg)" class="chat-plain chat-user-message__preview">{{ helpers.userMessagePreview(msg) }}</pre>
                        <template v-else>
                          <pre v-if="helpers.shouldRenderUserMessageAsPlainText(msg)" class="chat-plain">{{ msg.content }}</pre>
                          <LazyMarkdownPreview
                            v-else-if="helpers.shouldRenderHeavyChatMessage(msg)"
                            :editorId="`msg-${msg.id}`"
                            :modelValue="msg.content"
                            previewTheme="github"
                            :theme="theme"
                            :deferBlockLayout="helpers.shouldDeferHeavyChatBlockLayout(msg)"
                            :streaming="msg.streaming"
                            :stream-throttle-ms="streamRenderThrottleMs"
                            :code-foldable="true"
                            :auto-fold-threshold="codeAutoFoldThreshold"
                          />
                          <pre v-else class="chat-plain chat-plain--deferred">{{ msg.content }}</pre>
                        </template>
                        <button
                          v-if="helpers.isUserMessageFoldable(msg)"
                          type="button"
                          class="chat-user-message__toggle"
                          @click="actions.toggleUserMessageExpanded(msg)"
                        >
                          <span>{{ msg.userMessageExpanded ? '收起内容' : '展开全部' }}</span>
                          <span class="chat-user-message__stats">{{ helpers.userMessageFoldSummary(msg) }}</span>
                          <n-icon :component="msg.userMessageExpanded ? ChevronUpOutline : ChevronDownOutline" size="13" />
                        </button>
                      </div>

                      <ChatUserAttachments :msg="msg" :theme="theme" :helpers="userAttachmentHelpers" :actions="userAttachmentActions" />
                    </template>

                    <ChatToolActivityGroup
                      v-else-if="msg.role === 'tool_group'"
                      :group="msg"
                      :theme="theme"
                      :helpers="toolActivityGroupHelpers"
                      :actions="toolActivityGroupActions"
                      :tool-message-helpers="toolMessageHelpers"
                      :tool-message-actions="toolMessageActions"
                    />

                    <template v-else-if="msg.role === 'tool_call' || msg.role === 'tool'">
                      <div
                        v-if="helpers.shouldRenderCompactToolMessage(msg)"
                        class="chat-tool-compact"
                        :class="`is-${helpers.getToolMessageStatus(msg)}`"
                        :title="helpers.formatTime(msg.time)"
                        @click="actions.toggleToolExpanded(msg)"
                      >
                        <n-icon
                          :component="helpers.toolActivityIcon(msg)"
                          size="14"
                          :class="['chat-tool-compact__state-icon', { 'is-spinning': helpers.getToolMessageStatus(msg) === 'running' }]"
                        />
                        <span class="chat-tool-compact__label">{{ helpers.toolMessageLabel(msg) }}</span>
                        <span v-if="helpers.toolActivityMeta(msg)" class="chat-tool-compact__meta">{{ helpers.toolActivityMeta(msg) }}</span>
                        <span
                          v-if="helpers.shouldShowToolActivityStatus(msg)"
                          class="chat-tool-compact__status"
                          :class="`is-${helpers.getToolMessageStatus(msg)}`"
                        >
                          {{ helpers.toolMessageStatusLabel(msg) }}
                        </span>
                        <n-icon :component="ChevronDownOutline" size="13" class="chat-tool-compact__chevron" />
                      </div>
                      <ChatToolMessage v-else :msg="msg" :theme="theme" :helpers="toolMessageHelpers" :actions="toolMessageActions" />
                    </template>

                    <template v-else>
                      <pre v-if="msg.render === 'text'" class="chat-plain">{{ msg.content }}</pre>
                      <LazyMarkdownPreview
                        v-else-if="helpers.shouldRenderHeavyChatMessage(msg)"
                        :editorId="`msg-${msg.id}`"
                        :modelValue="msg.content"
                        previewTheme="github"
                        :theme="theme"
                        :deferBlockLayout="helpers.shouldDeferHeavyChatBlockLayout(msg)"
                        :streaming="msg.streaming"
                        :stream-throttle-ms="streamRenderThrottleMs"
                        :code-foldable="true"
                        :auto-fold-threshold="codeAutoFoldThreshold"
                      />
                      <pre v-else class="chat-plain chat-plain--deferred">{{ msg.content }}</pre>
                    </template>
                  </div>

                  <div v-if="msg.role === 'assistant'" class="chat-item__actions">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <n-button size="tiny" tertiary circle :disabled="!msg.content" @click="actions.copyAssistantMessage(msg)">
                          <template #icon><n-icon :component="CopyOutline" size="12" /></template>
                        </n-button>
                      </template>
                      复制回复
                    </n-tooltip>
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <n-button size="tiny" tertiary circle :disabled="sending || preparingSend" @click="actions.regenerateAssistant(msg)">
                          <template #icon><n-icon :component="RefreshOutline" size="12" /></template>
                        </n-button>
                      </template>
                      重新生成（放弃本次回答）
                    </n-tooltip>
                  </div>

                  <div v-else-if="msg.role === 'user'" class="chat-item__actions">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <n-button size="tiny" tertiary circle :disabled="!msg.content" @click="actions.copyUserMessage(msg)">
                          <template #icon><n-icon :component="CopyOutline" size="12" /></template>
                        </n-button>
                      </template>
                      复制提问
                    </n-tooltip>
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <n-button size="tiny" tertiary circle :disabled="sending || preparingSend" @click="actions.toggleOrSubmitUserEdit(msg)">
                          <template #icon><n-icon :component="msg.editing ? CheckmarkOutline : PencilOutline" size="12" /></template>
                        </n-button>
                      </template>
                      {{ msg.editing ? '重发（Enter）/ 取消（Esc）' : '编辑并重发' }}
                    </n-tooltip>
                  </div>
                </div>
              </div>

              <n-text v-if="!helpers.isChatActivityMessage(msg)" class="chat-item__time" depth="3">{{ helpers.formatTime(msg.time) }}</n-text>
            </div>
          </div>
        </n-scrollbar>

        <div
          v-if="stickyChatBubble"
          class="chat-sticky-bubble"
          :class="[`is-${stickyChatBubble.type}`, { 'is-dark': theme === 'dark' }]"
          @click="actions.handleStickyChatBubbleAction"
        >
          <div class="chat-sticky-bubble__main">
            <n-icon :component="ChevronUpOutline" size="14" />
            <span class="chat-sticky-bubble__label">{{ stickyChatBubble.label }}</span>
            <code v-if="stickyChatBubble.toolName" class="chat-sticky-bubble__tool-name">{{ stickyChatBubble.toolName }}</code>
            <span v-if="stickyChatBubble.source" class="chat-sticky-bubble__source">{{ stickyChatBubble.source }}</span>
            <span v-if="stickyChatBubble.showStatus && stickyChatBubble.statusText" class="chat-sticky-bubble__status" :class="`is-${stickyChatBubble.status}`">
              {{ stickyChatBubble.statusText }}
            </span>
            <span v-if="stickyChatBubble.meta" class="chat-sticky-bubble__meta">{{ stickyChatBubble.meta }}</span>
          </div>
          <n-button size="tiny" tertiary round @click.stop="actions.handleStickyChatBubbleAction">{{ stickyChatBubble.actionText }}</n-button>
        </div>

        <n-tooltip v-if="showScrollToBottomButton" trigger="hover">
          <template #trigger>
            <n-button class="chat-scroll-to-bottom" size="small" tertiary circle @click="actions.activateAutoScroll">
              <template #icon><n-icon :component="ArrowDownOutline" size="18" /></template>
            </n-button>
          </template>
          回到底部
        </n-tooltip>
      </div>
    </n-card>

    <nav v-if="showAnchorRail" class="chat-anchor-rail" aria-label="消息问题导航">
      <n-tooltip v-for="anchor in userAnchors" :key="anchor.id" trigger="hover">
        <template #trigger>
          <button
            type="button"
            class="chat-anchor-marker"
            :class="{ active: anchor.id === activeAnchorId }"
            :aria-label="`跳转到第 ${anchor.index} 问：${anchor.preview}`"
            :aria-current="anchor.id === activeAnchorId ? 'location' : undefined"
            @click="actions.scrollToUserAnchor(anchor.id)"
          >
            <span aria-hidden="true" />
          </button>
        </template>
        第{{ anchor.index }} 问：{{ anchor.preview }}
      </n-tooltip>
    </nav>
  </div>
</template>

<script setup>
import { NButton, NCard, NIcon, NInput, NScrollbar, NTag, NText, NTooltip } from 'naive-ui'
import { ChatMultiple24Filled } from '@vicons/fluent'
import {
  ArrowDownOutline,
  CheckmarkOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  CopyOutline,
  PencilOutline,
  RefreshOutline
} from '@vicons/ionicons5'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'
import ChatAssistantMedia from './ChatAssistantMedia.vue'
import ChatToolActivityGroup from './ChatToolActivityGroup.vue'
import ChatToolMessage from './ChatToolMessage.vue'
import ChatUserAttachments from './ChatUserAttachments.vue'

defineProps({
  theme: { type: String, default: 'light' },
  historySessionLoadState: { type: Object, required: true },
  sessionMessagesLength: { type: Number, default: 0 },
  emptyStateDescription: { type: String, default: '' },
  setupSummaryItems: { type: Array, default: () => [] },
  sessionSiderCollapsed: { type: Boolean, default: true },
  composerShortcutHint: { type: String, default: '' },
  renderedMessages: { type: Array, default: () => [] },
  chatVirtualizedEnabled: { type: Boolean, default: false },
  chatVirtualListStyle: { type: Object, default: () => ({}) },
  sending: { type: Boolean, default: false },
  preparingSend: { type: Boolean, default: false },
  streamRenderThrottleMs: { type: Number, required: true },
  codeAutoFoldThreshold: { type: Number, required: true },
  stickyChatBubble: { type: Object, default: null },
  showScrollToBottomButton: { type: Boolean, default: false },
  showAnchorRail: { type: Boolean, default: false },
  userAnchors: { type: Array, default: () => [] },
  activeAnchorId: { type: String, default: '' },
  helpers: { type: Object, required: true },
  actions: { type: Object, required: true },
  assistantMediaHelpers: { type: Object, required: true },
  assistantMediaActions: { type: Object, required: true },
  userAttachmentHelpers: { type: Object, required: true },
  userAttachmentActions: { type: Object, required: true },
  toolActivityGroupHelpers: { type: Object, required: true },
  toolActivityGroupActions: { type: Object, required: true },
  toolMessageHelpers: { type: Object, required: true },
  toolMessageActions: { type: Object, required: true }
})

const emit = defineEmits([
  'scrollbar-ref',
  'chat-list-ref',
  'open-model-modal',
  'open-system-prompt-modal',
  'open-agent-modal',
  'open-file-picker',
  'toggle-session-sider'
])

function setScrollbarRef(value) {
  emit('scrollbar-ref', value)
}

function setChatListRef(value) {
  emit('chat-list-ref', value)
}
</script>
