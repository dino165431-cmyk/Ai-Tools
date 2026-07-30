<template>
  <n-space vertical size="large" class="chat-shell">
    <n-layout embedded has-sider sider-placement="right" class="chat-shell__layout">
      <n-layout-content class="chat-layout__content" :content-style="layoutContentStyle">
        <n-flex
          vertical
          align="center"
          :class="['chat-page', theme, { 'is-compact': isCompactChatLayout, 'is-dense': isDenseChatLayout }]"
        >
    <ChatHeaderCard
      :theme="theme"
      :model-tooltip-text="modelTooltipText"
      :system-tooltip-text="systemTooltipText"
      :session-messages-length="session.messages.length"
      :running-memory-session-count="runningMemorySessionCount"
      :memory-session-dropdown-options="memorySessionDropdownOptions"
      :session-media-item-count="sessionMediaItemCount"
      :selected-provider="selectedProvider"
      :selected-model="selectedModel"
      :selected-agent="visibleSelectedAgent"
      :selected-agent-hover-text="selectedAgentHoverText"
      :active-prompt-label="activePromptLabel"
      :selected-skill-count="selectedSkillObjects.length"
      :selected-skills-hover-text="selectedSkillsHoverText"
      :active-mcp-server-count="activeMcpServers.length"
      :active-mcp-servers-hover-text="activeMcpServersHoverText"
      :mcp-tool-count-text="mcpToolCountText"
      :active-mcp-tools-hover-text="activeMcpToolsHoverText"
      :tool-mode-display-text="toolModeDisplayText"
      :context-window-summary-tag="contextWindowSummaryTag"
      :context-window-summary-tag-type="contextWindowSummaryTagType"
      :context-window-summary-tooltip-text="contextWindowSummaryTooltipText"
      :active-session-file-path="activeSessionFilePath"
      :active-session-display-title="activeSessionDisplayTitle"
      :effective-header-hint="effectiveHeaderHint"
      :chat-overview-items="chatOverviewItems"
      @open-model-modal="showModelModal = true"
      @open-system-prompt-modal="openSystemPromptModal"
      @open-save-session-modal="openSaveSessionModal"
      @select-memory-session="handleMemorySessionSelect"
      @open-media-library="showMediaLibraryModal = true"
      @close-active-session="closeActiveSession"
    />

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
            ref="scrollbarRef"
            class="chat-main-scrollbar"
            @scroll="handleChatScroll"
            @wheel.passive="handleChatWheel"
            @pointerdown="handleChatPointerDown"
            @touchstart.passive="handleChatPointerDown"
          >
            <div
              ref="chatListRef"
              class="chat-list"
              :class="{ 'is-virtualized': chatVirtualizedEnabled }"
              :style="chatVirtualListStyle"
              @click="handleChatPreviewLinkClick"
              @contextmenu="handleChatPreviewLinkContextMenu"
            >
            <div v-if="!session.messages.length" class="chat-empty-state">
              <div class="chat-empty-state__panel">
                <div class="chat-empty-state__hero">
                  <div class="chat-empty-state__icon">
                    <n-icon :component="ChatMultiple24Filled" size="26" />
                  </div>
                  <div class="chat-empty-state__title">开始一段新对话</div>
                  <div class="chat-empty-state__description">{{ chatEmptyStateDescription }}</div>
                </div>

                <div class="chat-empty-state__summary">
                  <div
                    v-for="item in chatSetupSummaryItems"
                    :key="item.key"
                    class="chat-empty-state__summary-item"
                  >
                    <span class="chat-empty-state__summary-label">{{ item.label }}</span>
                    <span class="chat-empty-state__summary-value" :title="item.value">{{ item.value }}</span>
                  </div>
                </div>

                <div class="chat-empty-state__actions">
                  <n-button size="small" secondary @click="showModelModal = true">模型设置</n-button>
                  <n-button size="small" secondary @click="openSystemPromptModal">系统提示词</n-button>
                  <n-button size="small" secondary @click="openAgentModal">选择智能体</n-button>
                  <n-button size="small" secondary @click="openFilePicker">添加附件</n-button>
                  <n-button size="small" tertiary :type="sessionSiderCollapsed ? 'default' : 'primary'" @click="toggleSessionSider">
                    {{ sessionSiderCollapsed ? '打开会话列表' : '收起会话列表' }}
                  </n-button>
                </div>

                <div class="chat-empty-state__hint">{{ composerShortcutHint }}</div>
              </div>
            </div>

            <div
              v-for="msg in renderedChatMessages"
              :key="msg.id"
              class="chat-item"
              :class="[msg.role, chatItemStateClasses(msg), { 'is-virtualized': chatVirtualizedEnabled }]"
              :style="getChatVirtualItemStyle(msg)"
              :id="msg.role === 'user' ? `q-${msg.id}` : undefined"
              :ref="(el) => setChatItemEl(msg.id, msg.role, el)"
            >
            <div class="chat-item__row">
              <div class="chat-item__avatar" :class="chatAvatarStateClasses(msg)">
                <n-icon :component="roleIcon(msg)" size="18" :class="['chat-item__avatar-icon', chatAvatarIconClasses(msg)]" />
              </div>

              <div class="chat-item__bubble">
                <div class="chat-item__content">
                  <template v-if="msg.role === 'assistant'">
                    <div v-if="msg.thinking" class="assistant-thinking">
                      <div class="assistant-thinking__toggle" @click="toggleThinking(msg)">
                        <n-icon :component="msg.thinkingExpanded ? ChevronUpOutline : ChevronDownOutline" size="14" />
                        <span class="assistant-thinking__label">{{ msg.streaming ? '思考中...' : '思考完成' }}</span>
                        <span class="assistant-thinking__hint">{{ msg.thinkingExpanded ? '点击收起' : '点击展开' }}</span>
                      </div>
                      <pre v-show="msg.thinkingExpanded" class="assistant-thinking__text">{{ msg.thinking }}</pre>
                    </div>

                    <ChatAssistantMedia
                      :msg="msg"
                      :theme="theme"
                      :helpers="assistantMediaHelpers"
                      :actions="assistantMediaActions"
                    />

                    <pre v-if="msg.render === 'text' && msg.content" class="chat-plain">{{ msg.content }}</pre>
                    <LazyMarkdownPreview
                      v-else-if="msg.content && shouldRenderHeavyChatMessage(msg)"
                      :editorId="`msg-${msg.id}`"
                      :modelValue="msg.content"
                      previewTheme="github"
                      :theme="theme"
                      :deferBlockLayout="shouldDeferHeavyChatBlockLayout(msg)"
                      :streaming="msg.streaming"
                      :stream-throttle-ms="CHAT_STREAM_RENDER_THROTTLE_MS"
                      :code-foldable="true"
                      :auto-fold-threshold="CHAT_CODE_AUTO_FOLD_THRESHOLD"
                    />
                    <pre v-else-if="msg.content" class="chat-plain chat-plain--deferred">{{ msg.content }}</pre>
                  </template>

                  <template v-else-if="msg.role === 'user'">
                    <n-tag v-if="msg.guidance" size="tiny" type="info" class="chat-user-guidance-tag">
                      引导
                    </n-tag>
                    <n-input
                      v-if="msg.editing"
                      v-model:value="msg.editDraft"
                      type="textarea"
                      :autosize="{ minRows: 3, maxRows: 12 }"
                      placeholder="编辑后重发（回车发送，Shift+回车换行，Esc 取消）"
                      :disabled="sending"
                      @keydown="(e) => handleUserEditKeydown(e, msg)"
                    />

                    <div
                      v-if="!msg.editing"
                      class="chat-user-message"
                      :class="{ 'is-collapsed': isUserMessageCollapsed(msg) }"
                    >
                      <pre
                        v-if="isUserMessageCollapsed(msg)"
                        class="chat-plain chat-user-message__preview"
                      >{{ userMessagePreview(msg) }}</pre>
                      <template v-else>
                        <pre v-if="shouldRenderUserMessageAsPlainText(msg)" class="chat-plain">{{ msg.content }}</pre>
                        <LazyMarkdownPreview
                          v-else-if="shouldRenderHeavyChatMessage(msg)"
                          :editorId="`msg-${msg.id}`"
                          :modelValue="msg.content"
                          previewTheme="github"
                          :theme="theme"
                          :deferBlockLayout="shouldDeferHeavyChatBlockLayout(msg)"
                          :streaming="msg.streaming"
                          :stream-throttle-ms="CHAT_STREAM_RENDER_THROTTLE_MS"
                          :code-foldable="true"
                          :auto-fold-threshold="CHAT_CODE_AUTO_FOLD_THRESHOLD"
                        />
                        <pre v-else class="chat-plain chat-plain--deferred">{{ msg.content }}</pre>
                      </template>
                      <button
                        v-if="isUserMessageFoldable(msg)"
                        type="button"
                        class="chat-user-message__toggle"
                        @click="toggleUserMessageExpanded(msg)"
                      >
                        <span>{{ msg.userMessageExpanded ? '收起内容' : '展开全部' }}</span>
                        <span class="chat-user-message__stats">{{ userMessageFoldSummary(msg) }}</span>
                        <n-icon
                          :component="msg.userMessageExpanded ? ChevronUpOutline : ChevronDownOutline"
                          size="13"
                        />
                      </button>
                    </div>

                    <ChatUserAttachments
                      :msg="msg"
                      :theme="theme"
                      :helpers="userAttachmentHelpers"
                      :actions="userAttachmentActions"
                    />
                  </template>

                  <template v-else-if="msg.role === 'tool_group'">
                    <ChatToolActivityGroup
                      :group="msg"
                      :theme="theme"
                      :helpers="toolActivityGroupHelpers"
                      :actions="toolActivityGroupActions"
                      :tool-message-helpers="toolMessageHelpers"
                      :tool-message-actions="toolMessageActions"
                    />
                  </template>

                  <template v-else-if="msg.role === 'tool_call' || msg.role === 'tool'">
                    <div
                      v-if="shouldRenderCompactToolMessage(msg)"
                      class="chat-tool-compact"
                      :class="`is-${getToolMessageStatus(msg)}`"
                      :title="formatTime(msg.time)"
                      @click="toggleToolExpanded(msg)"
                    >
                      <n-icon
                        :component="toolActivityIcon(msg)"
                        size="14"
                        :class="['chat-tool-compact__state-icon', { 'is-spinning': getToolMessageStatus(msg) === 'running' }]"
                      />
                      <span class="chat-tool-compact__label">{{ toolMessageLabel(msg) }}</span>
                      <span v-if="toolActivityMeta(msg)" class="chat-tool-compact__meta">{{ toolActivityMeta(msg) }}</span>
                      <span
                        v-if="shouldShowToolActivityStatus(msg)"
                        class="chat-tool-compact__status"
                        :class="`is-${getToolMessageStatus(msg)}`"
                      >
                        {{ toolMessageStatusLabel(msg) }}
                      </span>
                      <n-icon :component="ChevronDownOutline" size="13" class="chat-tool-compact__chevron" />
                    </div>
                    <ChatToolMessage
                      v-else
                      :msg="msg"
                      :theme="theme"
                      :helpers="toolMessageHelpers"
                      :actions="toolMessageActions"
                    />
                  </template>

                  <template v-else>
                    <pre v-if="msg.render === 'text'" class="chat-plain">{{ msg.content }}</pre>
                    <LazyMarkdownPreview
                      v-else-if="shouldRenderHeavyChatMessage(msg)"
                      :editorId="`msg-${msg.id}`"
                      :modelValue="msg.content"
                      previewTheme="github"
                      :theme="theme"
                      :deferBlockLayout="shouldDeferHeavyChatBlockLayout(msg)"
                      :streaming="msg.streaming"
                      :stream-throttle-ms="CHAT_STREAM_RENDER_THROTTLE_MS"
                      :code-foldable="true"
                      :auto-fold-threshold="CHAT_CODE_AUTO_FOLD_THRESHOLD"
                    />
                    <pre v-else class="chat-plain chat-plain--deferred">{{ msg.content }}</pre>
                  </template>
                </div>

                <div v-if="msg.role === 'assistant'" class="chat-item__actions">
                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-button size="tiny" tertiary circle @click="copyAssistantMessage(msg)" :disabled="!msg.content">
                        <template #icon>
                          <n-icon :component="CopyOutline" size="12" />
                        </template>
                      </n-button>
                    </template>
                    复制回复
                  </n-tooltip>

                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-button size="tiny" tertiary circle @click="regenerateAssistant(msg)" :disabled="sending || preparingSend">
                        <template #icon>
                          <n-icon :component="RefreshOutline" size="12" />
                        </template>
                      </n-button>
                    </template>
                    重新生成（放弃本次回答）
                  </n-tooltip>
                </div>

                <div v-else-if="msg.role === 'user'" class="chat-item__actions">
                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-button size="tiny" tertiary circle @click="copyUserMessage(msg)" :disabled="!msg.content">
                        <template #icon>
                          <n-icon :component="CopyOutline" size="12" />
                        </template>
                      </n-button>
                    </template>
                    复制提问
                  </n-tooltip>

                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-button size="tiny" tertiary circle @click="toggleOrSubmitUserEdit(msg)" :disabled="sending || preparingSend">
                        <template #icon>
                          <n-icon :component="msg.editing ? CheckmarkOutline : PencilOutline" size="12" />
                        </template>
                      </n-button>
                    </template>
                    {{ msg.editing ? '重发（Enter）/ 取消（Esc）' : '编辑并重发' }}
                  </n-tooltip>
                </div>
              </div>
            </div>

            <n-text v-if="!isChatActivityMessage(msg)" class="chat-item__time" depth="3">{{ formatTime(msg.time) }}</n-text>
          </div>

          </div>
          </n-scrollbar>

          <div
            v-if="stickyChatBubble"
            class="chat-sticky-bubble"
            :class="[`is-${stickyChatBubble.type}`, { 'is-dark': theme === 'dark' }]"
            @click="handleStickyChatBubbleAction"
          >
            <div class="chat-sticky-bubble__main">
              <n-icon :component="ChevronUpOutline" size="14" />
              <span class="chat-sticky-bubble__label">{{ stickyChatBubble.label }}</span>
              <code v-if="stickyChatBubble.toolName" class="chat-sticky-bubble__tool-name">
                {{ stickyChatBubble.toolName }}
              </code>
              <span v-if="stickyChatBubble.source" class="chat-sticky-bubble__source">
                {{ stickyChatBubble.source }}
              </span>
              <span
                v-if="stickyChatBubble.showStatus && stickyChatBubble.statusText"
                class="chat-sticky-bubble__status"
                :class="`is-${stickyChatBubble.status}`"
              >
                {{ stickyChatBubble.statusText }}
              </span>
              <span v-if="stickyChatBubble.meta" class="chat-sticky-bubble__meta">{{ stickyChatBubble.meta }}</span>
            </div>
            <n-button size="tiny" tertiary round @click.stop="handleStickyChatBubbleAction">
              {{ stickyChatBubble.actionText }}
            </n-button>
          </div>

          <n-tooltip v-if="showScrollToBottomButton" trigger="hover">
            <template #trigger>
              <n-button
                class="chat-scroll-to-bottom"
                size="small"
                tertiary
                circle
                @click="activateAutoScroll"
              >
                <template #icon>
                  <n-icon :component="ArrowDownOutline" size="18" />
                </template>
              </n-button>
            </template>
            回到底部
          </n-tooltip>
        </div>
      </n-card>

      <nav v-if="showAnchorRail" class="chat-anchor-rail" aria-label="消息问题导航">
        <n-tooltip v-for="a in userAnchors" :key="a.id" trigger="hover">
          <template #trigger>
            <button
              type="button"
              class="chat-anchor-marker"
              :class="{ active: a.id === activeAnchorId }"
              :aria-label="`跳转到第 ${a.index} 问：${a.preview}`"
              :aria-current="a.id === activeAnchorId ? 'location' : undefined"
              @click="scrollToUserAnchor(a.id)"
            >
              <span aria-hidden="true" />
            </button>
          </template>
          第{{ a.index }} 问：{{ a.preview }}
        </n-tooltip>
      </nav>
    </div>

    <transition name="tool-approval">
      <section
        v-if="activeToolApproval"
        class="tool-approval-card"
        role="alertdialog"
        aria-live="assertive"
        aria-label="工具调用审批"
      >
        <div class="tool-approval-card__header">
          <div class="tool-approval-card__title-wrap">
            <span class="tool-approval-card__icon">
              <n-icon :component="ShieldOutline" size="18" />
            </span>
            <div class="tool-approval-card__title-copy">
              <strong>{{ activeToolApproval.titleText }}</strong>
              <span>
                {{ activeToolApproval.serverName }} / {{ activeToolApproval.toolName }}
              </span>
            </div>
          </div>
          <n-flex align="center" :size="6">
            <n-tag size="small" type="warning" :bordered="false">等待确认</n-tag>
            <n-tag v-if="pendingToolApprovalCount > 1" size="small" :bordered="false">
              队列 {{ pendingToolApprovalCount }}
            </n-tag>
          </n-flex>
        </div>

        <div class="tool-approval-card__meta">
          <span v-if="activeToolApproval.sessionTitle">
            会话：{{ activeToolApproval.sessionTitle }}
          </span>
          <span v-for="line in activeToolApproval.extraLines" :key="line">{{ line }}</span>
        </div>

        <div v-if="activeToolApproval.approvalKind === 'shell'" class="tool-approval-card__command">
          <div class="tool-approval-card__command-label">
            <span>Bash 命令</span>
            <code>cwd: {{ activeToolApproval.cwdText }}</code>
          </div>
          <pre>{{ activeToolApproval.commandText || '（空命令）' }}</pre>
        </div>

        <details v-else class="tool-approval-card__details" open>
          <summary>{{ activeToolApproval.approvalKind === 'execution' ? '查看待执行脚本与参数' : '查看调用参数' }}</summary>
          <pre>{{ activeToolApproval.argsText }}</pre>
        </details>

        <details
          v-if="activeToolApproval.approvalKind === 'shell' || activeToolApproval.reasoningText"
          class="tool-approval-card__details"
        >
          <summary>{{ activeToolApproval.reasoningText ? '查看模型说明与完整参数' : '查看完整参数' }}</summary>
          <div v-if="activeToolApproval.reasoningText" class="tool-approval-card__reasoning">
            {{ activeToolApproval.reasoningText }}
          </div>
          <pre>{{ activeToolApproval.argsText }}</pre>
        </details>

        <div class="tool-approval-card__footer">
          <n-text depth="3" class="tool-approval-card__scope">
            {{ activeToolApproval.scopeHint }}
          </n-text>
          <n-flex justify="end" wrap :size="8">
            <n-button size="small" @click="resolveActiveToolApproval('deny')">拒绝</n-button>
            <n-button size="small" secondary type="primary" @click="resolveActiveToolApproval('once')">
              允许一次
            </n-button>
            <n-button
              v-if="activeToolApproval.canRemember"
              size="small"
              type="primary"
              @click="resolveActiveToolApproval('session')"
            >
              {{ activeToolApproval.rememberText }}
            </n-button>
          </n-flex>
        </div>
      </section>
    </transition>

    <ChatComposerPanel
      ref="composerPanelRef"
      :theme="theme"
      :attach-accept="ATTACH_ACCEPT"
      :sending="sending"
      :preparing-send="preparingSend"
      :composer-input-key="composerInputKey"
      :input-value="input"
      :show-inline-agent-picker="showInlineAgentPicker"
      :inline-agent-picker-header-text="inlineAgentPickerHeaderText"
      :inline-agent-suggestions="inlineAgentSuggestions"
      :inline-agent-active-index="inlineAgentActiveIndex"
      :selected-agent-id="selectedAgentId"
      :show-inline-command-picker="showInlineCommandPicker"
      :inline-command-picker-title="inlineCommandPickerTitle"
      :inline-command-picker-header-text="inlineCommandPickerHeaderText"
      :inline-command-suggestions="inlineCommandSuggestions"
      :inline-command-mode="inlineCommandMode"
      :inline-command-type="inlineCommandType"
      :inline-command-active-index="inlineCommandActiveIndex"
      :pending-attachments="pendingAttachments"
      :pending-image-attachments="pendingImageAttachments"
      :pending-file-attachments="pendingFileAttachments"
      :show-builtin-hint="!!(selectedProvider && isUtoolsBuiltinProvider(selectedProvider) && pendingImageAttachments.length)"
      :pending-attachment-helpers="pendingAttachmentHelpers"
      :pending-attachment-actions="pendingAttachmentActions"
      :show-input-mode-tags="showInputModeTags"
      :thinking-effort="thinkingEffort"
      :thinking-effort-label="thinkingEffortLabel"
      :image-generation-mode="imageGenerationMode"
      :image-generation-mode-label="imageGenerationModeLabel"
      :video-generation-mode="videoGenerationMode"
      :video-generation-mode-label="videoGenerationModeLabel"
      :image-generation-params-enabled="imageGenerationParamsEnabled"
      :image-generation-params="imageGenerationParams"
      :image-generation-params-summary="imageGenerationParamsSummary"
      :video-generation-params-enabled="videoGenerationParamsEnabled"
      :video-generation-params="videoGenerationParams"
      :video-generation-params-summary="videoGenerationParamsSummary"
      :session-messages-length="session.messages.length"
      :web-search-enabled="webSearchEnabled"
      :auto-approve-tools="autoApproveTools"
      :tool-approval-mode="toolApprovalMode"
      :tool-approval-mode-label="toolApprovalModeLabel"
      :tool-approval-mode-options="chatToolApprovalModeOptions"
      :auto-activate-agent-skills="autoActivateAgentSkills"
      :tool-mode-display-text="toolModeDisplayText"
      :context-window-preset-label="contextWindowPresetLabel"
      :context-window-history-focus-label="contextWindowHistoryFocusLabel"
      :refreshing-mcp-tools="refreshingMcpTools"
      :thinking-effort-button-type="thinkingEffortButtonType"
      :image-generation-button-type="imageGenerationButtonType"
      :video-generation-button-type="videoGenerationButtonType"
      :media-generation-preset-options="mediaGenerationPresetOptions"
      :can-send="canSend"
      :queued-inputs="activeQueuedInputs"
      :host-workspace-path="sandboxHostWorkspacePath"
      :footer-hint="footerHint"
      @update:input-value="input = $event"
      @file-change="handleFileInputChange"
      @input-keydown="handleInputKeydown"
      @composer-paste="handleComposerPaste"
      @composer-click="handleComposerCursorChange"
      @composer-keyup="handleComposerCursorChange"
      @composer-focus="handleComposerCursorChange"
      @composer-blur="handleComposerBlur"
      @apply-inline-agent-suggestion="applyInlineAgentSuggestion"
      @apply-inline-command-suggestion="applyInlineCommandSuggestion"
      @set-thinking-effort="thinkingEffort = $event"
      @set-image-generation-mode="setImageGenerationMode"
      @set-video-generation-mode="setVideoGenerationMode"
      @set-image-generation-params-enabled="setImageGenerationParamsEnabled"
      @update-image-generation-params="assignImageGenerationParams"
      @reset-image-generation-params="resetImageGenerationParams"
      @set-video-generation-params-enabled="setVideoGenerationParamsEnabled"
      @update-video-generation-params="assignVideoGenerationParams"
      @reset-video-generation-params="resetVideoGenerationParams"
      @clear-session="clearSession"
      @open-agent-modal="openAgentModal"
      @insert-inline-command-trigger="insertInlineCommandTrigger"
      @open-file-picker="openFilePicker"
      @choose-host-workspace="chooseSandboxHostWorkspace"
      @clear-host-workspace="clearSandboxHostWorkspace"
      @toggle-web-search="toggleWebSearch"
      @set-tool-approval-mode="setToolApprovalMode"
      @toggle-auto-activate-agent-skills="toggleAutoActivateAgentSkills"
      @cycle-tool-mode="cycleToolMode"
      @open-context-window-modal="openContextWindowModal"
      @refresh-active-mcp-tools="refreshActiveMcpTools"
      @cycle-image-generation-mode="cycleImageGenerationMode"
      @cycle-video-generation-mode="cycleVideoGenerationMode"
      @apply-media-preset="applyMediaGenerationPreset"
      @stop="stop"
      @steer="steerCurrentRun"
      @steer-queued-input="steerQueuedInput"
      @remove-queued-input="removeQueuedInput"
      @send="send"
    />

    <ChatMediaLibraryModal
      v-model:show="showMediaLibraryModal"
      v-model:filter="mediaLibraryFilter"
      :theme="theme"
      :items="filteredSessionMediaItems"
      :total-count="sessionMediaItemCount"
      @copy-prompt="copyMediaPrompt"
      @regenerate-media="regenerateMedia"
      @download-image="downloadChatImage"
      @download-video="downloadChatVideo"
    />

    <!-- 模型设置 -->
    <n-modal
      v-model:show="showModelModal"
      :mask-closable="false"
      preset="card"
      title="模型设置"
      style="width: 900px; max-width: 95%;"
    >
      <n-collapse accordion>
        <n-collapse-item
          v-for="p in providers"
          :key="p._id"
          :name="p._id"
          :title="p.name || p._id"
        >
          <n-flex vertical :size="8">
            <n-text depth="3" style="font-size: 12px; word-break: break-all;">
              {{ isUtoolsBuiltinProvider(p) ? 'uTools 内置 AI 服务商。模型在 uTools 设置中管理。' : (p.baseurl || '未配置基础地址') }}
            </n-text>
            <n-flex v-if="isUtoolsBuiltinProvider(p)" align="center" wrap :size="8">
              <n-button size="tiny" secondary :loading="utoolsAiModelsLoading" @click.stop="refreshBuiltinProviderModelsInChat(true)">
                刷新模型
              </n-button>
              <n-button size="tiny" @click.stop="openBuiltinProviderSettingsFromChat">
                打开 uTools AI 设置
              </n-button>
              <n-text v-if="utoolsAiModelsError" depth="3" style="font-size: 12px;">
                {{ utoolsAiModelsError }}
              </n-text>
            </n-flex>
            <n-flex align="center" wrap :size="8">
              <n-flex v-for="m in (p.selectModels || [])" :key="m" align="center" :size="4">
                <n-button
                  size="tiny"
                  :type="isCurrentModel(p._id, m) ? 'primary' : 'default'"
                  @click="selectProviderModel(p._id, m)"
                >
                  {{ m }}
                </n-button>

                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button size="tiny" tertiary circle @click.stop="toggleDefaultModel(p._id, m)">
                      <template #icon>
                        <n-icon :component="isDefaultModel(p._id, m) ? Star : StarOutline" size="12" />
                      </template>
                    </n-button>
                  </template>
                  {{ isDefaultModel(p._id, m) ? '默认模型（点击清除）' : '设为默认模型' }}
                </n-tooltip>
              </n-flex>
              <n-text v-if="!p.selectModels || p.selectModels.length === 0" depth="3" style="font-size: 12px;">
                {{ isUtoolsBuiltinProvider(p) ? '当前还没有启用任何 uTools AI 模型，请先打开 uTools AI 设置。' : '当前服务商还没有启用的模型，请到 设置 -> 服务商 中配置。' }}
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
          <n-button @click="showModelModal = false">关闭</n-button>
        </n-flex>
      </template>
    </n-modal>

    <!-- 临时系统提示词 -->
    <n-modal
      v-model:show="showSystemPromptModal"
      :mask-closable="false"
      preset="card"
      title="临时系统提示词"
      style="width: 900px; max-width: 95%;"
    >
      <n-flex
        vertical
        :size="12"
      >
        <n-text depth="3" style="font-size: 12px;">
          当前来源：{{ basePromptSourceText }}
        </n-text>

        <n-input
          v-model:value="systemPromptDraft"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 18 }"
          placeholder="输入仅对当前会话生效的临时系统提示词。"
        />
      </n-flex>

      <template #footer>
        <n-flex justify="space-between" align="center" :size="12">
          <n-flex :size="8">
            <n-button size="small" @click="resetSystemPromptToSelectedPrompt" :disabled="!hasSelectedSystemPrompt">
              重置为提示词
            </n-button>
            <n-button size="small" @click="clearCustomSystemPrompt">
              清空
            </n-button>
          </n-flex>
          <n-flex justify="flex-end" :size="12">
            <n-button @click="showSystemPromptModal = false">取消</n-button>
            <n-button type="primary" @click="applyCustomSystemPrompt">
              应用
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>

    <n-modal
      v-model:show="showContextWindowModal"
      :mask-closable="false"
      :class="['chat-context-window-modal', { 'is-dark': theme === 'dark' }]"
      preset="card"
      title="上下文窗口"
      style="width: 720px; max-width: 95%;"
    >
      <n-flex vertical :size="12" :class="['chat-context-window-panel', { 'is-dark': theme === 'dark' }]">
        <n-text depth="3" style="font-size: 12px;">
          这里只影响当前请求会向模型发送多少历史上下文，不会修改会话原始记录。
        </n-text>
        <n-form label-placement="left" label-width="110px">
          <n-form-item label="预设策略">
            <n-select
              v-model:value="contextWindowDraft.preset"
              :options="contextWindowPresetOptions"
              placeholder="选择上下文策略"
              @update:value="handleContextWindowPresetChange"
            />
          </n-form-item>

          <n-form-item label="历史侧重">
            <n-select
              v-model:value="contextWindowDraft.historyFocus"
              :options="contextWindowHistoryFocusOptions"
              placeholder="选择历史保留方式"
            />
          </n-form-item>
          <n-text depth="3" style="font-size: 12px; margin-top: -8px;">
            {{ contextWindowDraftHistoryFocusHint }}
          </n-text>

          <template v-if="contextWindowDraft.preset === 'custom'">
            <n-form-item label="最大轮次">
              <n-input-number v-model:value="contextWindowDraft.maxTurns" :min="2" :max="200" style="width: 180px;" />
            </n-form-item>
            <n-form-item label="完整保留轮次">
              <n-input-number v-model:value="contextWindowDraft.keepRecentTurnsFull" :min="1" :max="64" style="width: 180px;" />
            </n-form-item>
            <n-form-item label="最大消息数">
              <n-input-number v-model:value="contextWindowDraft.maxMessages" :min="8" :max="1000" style="width: 180px;" />
            </n-form-item>
            <n-form-item label="展开 Token">
              <n-input-number v-model:value="contextWindowDraft.maxTokensExpanded" :min="1000" :max="4000000" :step="1000" style="width: 180px;" />
            </n-form-item>
            <n-form-item label="精简 Token">
              <n-input-number v-model:value="contextWindowDraft.maxTokensCompact" :min="1000" :max="4000000" :step="1000" style="width: 180px;" />
            </n-form-item>
            <n-form-item label="展开模式字符">
              <n-input-number v-model:value="contextWindowDraft.maxCharsExpanded" :min="4000" :max="4200000" :step="10000" style="width: 180px;" />
            </n-form-item>
            <n-form-item label="精简模式字符">
              <n-input-number v-model:value="contextWindowDraft.maxCharsCompact" :min="6000" :max="4200000" :step="10000" style="width: 180px;" />
            </n-form-item>
            <n-form-item label="自动压缩阈值">
              <n-input-number v-model:value="contextWindowDraft.autoCompactTriggerPercent" :min="55" :max="95" :step="1" style="width: 180px;" />
            </n-form-item>
            <n-text depth="3" style="font-size: 12px;">
              有输入 Token 统计时使用 Token 预算；否则自动使用字符预算。
            </n-text>
          </template>
        </n-form>

        <n-text depth="3" style="font-size: 12px;">
          当前会话：{{ contextWindowSummaryText }}
        </n-text>
        <n-text depth="3" style="font-size: 12px;">
          {{ contextWindowProviderHint }}
        </n-text>
        <ChatContextWindowPreview
          v-if="showContextWindowModal"
          :theme="theme"
          :budget-status="contextWindowBudgetStatus"
          :budget-summary-text="contextWindowPreviewBudgetSummaryText"
          :budget-items="contextWindowPreviewBudgetItems"
          :summary-text="contextWindowCompressedSummaryText"
          :summary-meta-text="contextWindowCompressedSummaryMetaText"
          :summary-chain-text="contextWindowCompressedSummaryChainText"
          :summary-source-text="contextWindowCompressedSummarySourceText"
          :preview-summary-text="contextWindowPreviewSummaryText"
          :entries="contextWindowPreviewEntries"
          :omitted-entries="contextWindowPreviewOmittedEntries"
          :omitted-summary-text="contextWindowPreviewOmittedSummaryText"
          :omitted-filter-options="contextWindowPreviewOmittedFilterOptions"
          :resolved-omitted-filter="contextWindowPreviewResolvedOmittedFilter"
          :filtered-omitted-entries="contextWindowPreviewFilteredOmittedEntries"
          :omitted-filter="contextWindowPreviewOmittedFilter"
          :helpers="contextWindowPreviewHelpers"
          @update:omitted-filter="contextWindowPreviewOmittedFilter = $event"
        />
      </n-flex>

      <template #footer>
        <n-flex justify="space-between" align="center" :size="12">
          <n-button size="small" @click="resetContextWindowDraftToDefault">
            恢复默认
          </n-button>
          <n-flex justify="flex-end" :size="12">
            <n-button @click="showContextWindowModal = false">取消</n-button>
            <n-button type="primary" @click="applyContextWindowSettings">
              应用
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>

    <!-- 智能体选择器 -->
    <n-modal
      v-model:show="showAgentModal"
      :mask-closable="false"
      preset="card"
      title="选择智能体（@）"
      style="width: 600px; max-width: 95%;"
    >
      <n-form label-placement="left" label-width="90px">
        <n-form-item label="智能体">
          <n-select
            v-model:value="agentModalSelectedId"
            :options="agentOptions"
            placeholder="选择智能体"
            filterable
            clearable
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-flex justify="space-between" align="center" :size="12">
          <n-button size="small" @click="clearSelectedAgent" :disabled="!visibleSelectedAgent">
            恢复默认
          </n-button>
          <n-flex justify="flex-end" :size="12">
            <n-button @click="showAgentModal = false">取消</n-button>
            <n-button type="primary" @click="applyAgentModal" :disabled="!agentModalSelectedId">
              应用
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>
    <!-- 提示词选择器 -->
    <n-modal
      v-model:show="showPromptModal"
      :mask-closable="false"
      preset="card"
      title="选择提示词（/prompt）"
      style="width: 700px; max-width: 95%;"
    >
      <n-form label-placement="left" label-width="90px">
        <n-form-item label="提示词">
          <n-select
            v-model:value="promptModalSelectedId"
            :options="promptOptions"
            :loading="loadingMcpPrompts"
            placeholder="选择本地提示词，或当前 MCP 提供的提示词"
            filterable
            clearable
          />
        </n-form-item>
        <n-text depth="3" style="font-size: 12px; display: block; margin-left: 90px;">
          本地系统提示词会切换当前系统提示词；本地用户提示词与 MCP 提示词会插入到当前输入框。
        </n-text>

        <template v-if="selectedPromptModalKind === 'mcp'">
          <McpArgumentForm
            v-if="showPromptModal && selectedMcpPromptArgs.length"
            :params="selectedMcpPromptArgs"
            :form-data="promptMcpArgsForm"
            max-height="260px"
            padding="0"
            label-width="120px"
          />
          <n-text v-else depth="3" style="font-size: 12px; display: block; margin-left: 90px;">
            该 MCP 提示词无参数，将直接插入输入框。
          </n-text>
        </template>
        <template v-else-if="selectedLocalPromptForModal && selectedLocalPromptVariables.length">
          <McpArgumentForm
            v-if="showPromptModal"
            :params="selectedLocalPromptVariables"
            :form-data="promptUserArgsForm"
            max-height="260px"
            padding="0"
            label-width="120px"
          />
        </template>
        <n-text
          v-else-if="selectedLocalPromptForModal && isUserPrompt(selectedLocalPromptForModal)"
          depth="3"
          style="font-size: 12px; display: block; margin-left: 90px;"
        >
          该用户提示词无变量，将直接插入输入框。
        </n-text>
      </n-form>

      <template #footer>
        <n-flex justify="space-between" align="center" :size="12">
          <n-button size="small" @click="clearSelectedPrompt">清除提示词</n-button>
          <n-flex justify="flex-end" :size="12">
            <n-button @click="showPromptModal = false">取消</n-button>
            <n-button type="primary" @click="applyPromptModal">
              应用
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>

    <!-- 技能选择器 -->
    <n-modal
      v-model:show="showSkillModal"
      :mask-closable="false"
      preset="card"
      title="选择技能（/skill）"
      style="width: 800px; max-width: 95%;"
    >
      <n-form label-placement="left" label-width="90px">
        <n-form-item label="技能">
          <n-select
            v-model:value="skillModalSelectedIds"
            multiple
            :options="skillOptions"
            placeholder="选择技能（可选）"
            filterable
            clearable
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="showSkillModal = false">取消</n-button>
          <n-button type="primary" @click="applySkillModal">
            应用
          </n-button>
        </n-flex>
      </template>
    </n-modal>

    <!-- MCP 选择器 -->
    <n-modal
      v-model:show="showMcpModal"
      :mask-closable="false"
      preset="card"
      title="选择 MCP（/mcp）"
      style="width: 720px; max-width: 92%;"
    >
      <n-flex vertical :size="12">
        <n-form label-placement="left" label-width="90px">
          <n-form-item label="MCP 服务">
            <n-select
              v-model:value="mcpModalSelectedIds"
              multiple
              size="small"
              :options="mcpOptions"
              placeholder="选择 MCP 服务（可选）"
              filterable
              clearable
            />
          </n-form-item>
        </n-form>

        <n-text depth="3" style="font-size: 12px;">
          技能中配置的 MCP 会随技能选择自动加入（当前来自技能：{{ derivedMcpIds.length }}）
        </n-text>
      </n-flex>

      <template #footer>
        <n-flex justify="space-between" align="center" :size="12">
          <n-dropdown
            trigger="click"
            placement="top-start"
            :options="chatToolApprovalModeOptions"
            @select="setToolApprovalMode"
          >
            <n-button
              size="small"
              tertiary
              circle
              :type="toolApprovalModeButtonType"
              :title="`工具调用控制：${toolApprovalModeLabel}`"
            >
              <template #icon>
                <n-icon :component="toolApprovalMode === TOOL_APPROVAL_MODE_MANUAL ? ShieldOutline : ShieldCheckmarkOutline" size="16" />
              </template>
            </n-button>
          </n-dropdown>
          <n-flex justify="flex-end" :size="12">
            <n-button @click="showMcpModal = false">取消</n-button>
            <n-button type="primary" @click="applyMcpModal">
              应用
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>
        </n-flex>
      </n-layout-content>

      <n-layout-sider
        :class="['chat-session-sider', { 'is-dark': theme === 'dark' }]"
        collapse-mode="transform"
        :width="sessionSiderWidth"
        :collapsed-width="sessionSiderCollapsedWidth"
        :content-style="sessionSiderContentStyle"
        show-trigger="arrow-circle"
        bordered
        v-model:collapsed="sessionSiderCollapsed"
      >
        <SessionTree
          ref="sessionTreeRef"
          :theme="theme"
          @select="handleSessionHistorySelect"
          @saved="handleSessionSaved"
          @rename="handleSessionPathRenamed"
          @delete="handleSessionPathDeleted"
          @cleanup-auto-sessions="cleanupAutoChatSessions({ notify: true })"
        />
      </n-layout-sider>
    </n-layout>
    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :show="chatLinkContextMenu.show"
      :x="chatLinkContextMenu.x"
      :y="chatLinkContextMenu.y"
      :options="chatLinkContextMenuOptions"
      @clickoutside="closeChatLinkContextMenu"
      @select="handleChatLinkContextMenuSelect"
    />
  </n-space>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, reactive, watch, nextTick, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NFlex,
  NIcon,
  NSpace,
  NLayout,
  NLayoutSider,
  NLayoutContent,
  NSelect,
  NInput,
  NInputNumber,
  NButton,
  NText,
  NTag,
  NScrollbar,
  NModal,
  NForm,
  NFormItem,
  NCollapse,
  NCollapseItem,
  NDropdown,
  NTooltip,
  useDialog,
  useMessage
} from 'naive-ui'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'
import { ensureMarkdownPreviewRuntime } from '@/utils/mdEditorRuntime'
import {
  analyzeUserMessageFolding,
  buildChatDisplayMessages,
  buildUserMessagePreview,
  shouldShowChatAnchorRail
} from '@/utils/chatDisplayFolding.js'
import { ChatMultiple24Filled } from '@vicons/fluent'
import {
  ArrowDownOutline,
  ShieldCheckmarkOutline,
  ShieldOutline,
  ImageOutline,
  DocumentTextOutline,
  StarOutline,
  Star,
  ChevronDownOutline,
  ChevronUpOutline,
  PersonCircleOutline,
  SparklesOutline,
  ChatbubbleEllipsesOutline,
  HardwareChipOutline,
  CopyOutline,
  CloseOutline,
  PauseCircleOutline,
  RefreshOutline,
  PencilOutline,
  CheckmarkOutline
} from '@vicons/ionicons5'

import { useUtoolsEnterData } from '@/utils/utoolsListener.js'
import { getOrCreateMCPClient, getMcpPrompt, releaseMCPClient, closePooledMCPClient, closeAllPooledMCPClients } from '@/utils/mcpClient'
import { getTheme, getAgents, getProviders, getPrompts, getSkills, getMcpServers, getChatConfig, readSkillFile as readSkillRegistryFile, updateChatConfig } from '@/utils/configListener'
import { buildRequestOverridesFromAgentModelParams, getAgentReasoningEffortOverride, normalizeAgentModelParams } from '@/utils/agentModelParams'
import { parseAttachmentTextWithFallback, resetAttachmentTextParserWorker } from '@/utils/attachmentTextParser'
import { getSkillFileIndex, getSkillScriptCatalog, isDirectorySkill, isRunnableSkillScriptPath } from '@/utils/skillUtils'
import {
  buildUtoolsAiMessages,
  canUseUtoolsAi,
  getUtoolsAiModelsState,
  extractUtoolsAiReasoningText,
  isUtoolsBuiltinProvider,
  openUtoolsAiModelsSetting,
  refreshUtoolsAiModels,
  registerUtoolsAiToolFunctions
} from '@/utils/utoolsAiProvider'
import {
  buildBasePromptSelectionState,
  buildMergedChatState,
  buildCustomSystemPromptState,
  COMPACT_MCP_CATALOG_NOTE,
  COMPACT_MCP_TOOL_GUIDANCE_LINES,
  hasActiveBasePromptSelection,
  INTERNAL_TOOL_SPECS,
  normalizePromptText,
  resolveSystemPromptModalApplyState,
  shouldClearBasePromptSelectionImmediately,
} from '@/utils/chatPromptTooling'
import {
  buildSkillToolsBundle,
  buildSkillsPromptText as buildProgressiveSkillsPromptText,
  buildAutoSkillActivationPlan,
  collectDerivedMcpIds,
  createBuiltinSkillActionCatalog,
  listSelectedSkillsBrief as listSelectedSkillsBriefFromList,
  migrateLegacyDefaultAgentSkillState,
  resolveBuiltinSkillCall,
  resolveSelectedSkillTarget as resolveSelectedSkillTargetFromList,
  selectSkillsByIds
} from '@/utils/chatSkillTooling'
import {
  buildPromptVariableValues,
  extractPromptVariables,
  isSystemPrompt,
  isUserPrompt,
  renderPromptTemplate,
  resetPromptVariableFormData
} from '@/utils/promptConfig'
import {
  buildChatContextWindow,
  buildChatContextWindowRuntimeOptions,
  calculateContextSummaryTriggerChars,
  CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS,
  CHAT_CONTEXT_WINDOW_PRESETS,
  countChatContextAttachmentMessages,
  countChatContextAttachmentSummaryMessages,
  DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG,
  estimateMessageSize,
  estimateMessagesSize,
  hasChatContextWindowReduction,
  inspectChatContextWindow,
  normalizeChatContextWindowConfig,
  resolveChatContextWindowBudgetPlan,
  resolveChatContextWindowOptions,
  resolveContextSummaryLevel,
  resolveContextSummaryChain,
  resolveContextSummarySourceLabel,
  shouldSummarizeContextWindow
} from '@/utils/chatContextWindow'
import {
  calculateReservedRequestChars,
  createToolResultApiMessage,
  estimateToolDefinitionsChars,
  normalizeAssistantToolCalls,
  shouldIncludeReasoningContent,
  shouldRetryWithReasoningContent
} from '@/utils/chatRequestCompat'
import { resolveChatSessionCreatedTimeMs } from '@/utils/chatSessionCreatedTime.js'
import {
  buildMemoryInjection,
  enqueueMemoryCandidate,
  flushMemoryCandidates,
  normalizeMemoryCandidateQueue
} from '@/utils/chatMemory'
import { isChatMemoryEnabled } from '@/utils/chatMemoryConfig'
import { shouldRetryWithoutParallelToolCalls } from '@/utils/openaiResponsesCompat.js'
import {
  getProviderModelType,
  normalizeProviderApiMode
} from '@/utils/providerModelConfig.js'
import {
  collectImageGenerationRevisedPrompts,
  extractImageOutputEntries,
  extractVideoOutputEntries,
  extractImageGenerationPromptFromContent,
  extractImageGenerationTextResult,
  isLikelyImageGenerationModel,
  isLikelyVideoGenerationModel,
  reconcilePersistedSandboxToolImages
} from '@/utils/chatImageGeneration.js'
import {
  imageMetaLabel,
  normalizeMediaDimension,
  videoMetaLabel
} from '@/utils/chatMediaMetadata.js'
import {
  buildMediaGenerationPresetOptions,
  applyMediaGenerationPresetToInput
} from '@/utils/chatMediaPresets.js'
import {
  buildMediaGenerationManualRequestOptions,
  createDefaultImageGenerationParams,
  createDefaultVideoGenerationParams,
  normalizeImageGenerationParams,
  normalizeMediaGenerationParamsEnabled,
  normalizeVideoGenerationParams,
  summarizeImageGenerationParams,
  summarizeVideoGenerationParams
} from '@/utils/chatMediaGenerationParams.js'
import {
  collectSessionMediaItems,
  countSessionMediaItems,
  filterSessionMediaItems
} from '@/utils/chatMediaLibrary.js'
import { canWriteClipboardMime, normalizeClipboardMediaMime } from '@/utils/chatClipboard.js'
import {
  buildChatSessionAssetsDirectory,
  collectChatMediaAssetPathsFromPayload,
  deleteChatSessionAssetDirectory,
  deleteChatMediaAssetPaths,
  hydrateChatSessionMediaAssets,
  persistChatMediaListAssets,
  persistChatSessionMediaAssets,
  resolveChatMediaAssetPath,
  serializeChatMediaForSave
} from '@/utils/chatMediaAssets.js'
import { readSessionJsonFile } from '@/utils/sessionFileJson.js'
import {
  VIDEO_GENERATION_RESULT_TIMEOUT_MS,
  buildImageGenerationCompatibilityError,
  buildManualImageGenerationRequestInfo,
  buildManualVideoGenerationRequestInfo,
  buildVideoGenerationCompatibilityError,
  extractImageGenerationTaskState,
  extractVideoGenerationTaskState,
  requestImageGeneration,
  requestVideoGeneration,
  shouldFetchVideoGenerationContent,
  shouldFallbackMediaRequestToChat,
  waitForVideoGenerationResult
} from '@/utils/chatMediaGenerationRequest.js'
import {
  createAbortError,
  isAbortError,
  throwIfAborted,
  waitForAbortable,
  withTimeout
} from '@/utils/abortableRequest.js'
import {
  extractInlineAgentContext,
  extractInlineCommandContext,
  getInlinePickerMatchScore,
  INLINE_COMMAND_DEFINITIONS,
  INLINE_COMMAND_KIND_LABELS
} from '@/utils/chatInlinePicker'
import {
  createDirectory,
  deleteItem,
  exists,
  importFilesToSandbox,
  listDirectory,
  moveItem,
  resolvePath,
  stat,
  writeFile
} from '@/utils/fileOperations'
import { requestOpenNoteFile } from '@/utils/noteOpenBridge'
import { buildNoteHrefFromPath, resolveNoteAbsPathFromHref, safeDecodeURIComponent } from '@/utils/notePathUtils'
import { getSafeExternalUrl, safeOpenExternal } from '@/utils/safeOpenExternal'
import { runChatWorkspaceFileAction } from '@/utils/chatWorkspaceFileOperations.js'
import {
  contentHasUserAttachments,
  extractEditableUserTextFromContent,
  mergeUserTextWithExistingAttachments
} from '@/utils/chatUserMessageContent'
import {
  buildToolVisionUserMessage,
  messageContentHasImageUrl,
  shouldAutoAttachToolImagesForVision,
  shouldFallbackVisionInputToText
} from '@/utils/toolVisionContext'
import { inferStructuredToolResultStatus, isAgentRunToolResult } from '@/utils/chatToolDisplay'
import { getAgentRunMessageStatus, isAgentRunToolName, mergeAgentRunTraceEntries } from '@/utils/chatAgentRun'
import { CHAT_CODE_AUTO_FOLD_THRESHOLD } from '@/utils/chatMarkdownPreview'
import {
  collectSandboxFileCatalog,
  resolveSandboxFileLink
} from '@/utils/chatSandboxFileLink'
import {
  buildChatAttachmentReferenceBlock,
  buildChatSandboxWorkspaceId,
  resolveChatToolWorkspaceScope,
  withDefaultChatSandboxWorkspaceId
} from '@/utils/chatSandboxWorkspace'
import {
  getToolActivityLabel,
  getToolActivityMeta,
  getToolActivitySource,
  getToolActivityToolName
} from '@/utils/chatToolActivity'
import {
  isExpectedChatProgrammaticScroll,
  resolveChatBottomScrollTarget,
  resolveChatHeavyRenderTuning,
  resolveChatVirtualCanvasHeight,
  resolveChatViewportCompensation,
  resolveChatVirtualItemGap,
  resolveChatVirtualItemHeight,
  shouldDeferChatHeavyBlockLayout
} from '@/utils/chatPerformance.js'
import {
  ATTACH_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TEXT_CHARS,
  MAX_IMAGE_BYTES,
  buildDisplayImagesFromReferenceAttachments as buildDisplayImagesFromReferences,
  buildImageAttachmentSummary,
  buildImageGenerationRequestOptionsWithReferences,
  buildVideoGenerationRequestOptionsWithReferences,
  clearAttachmentFileReferences,
  fileToDataUrl,
  getFileExt,
  guessExtensionFromMime,
  isConvertibleAttachmentExtension,
  isDirectTextAttachmentExtension,
  isImageAttachmentLike,
  isSupportedAttachmentFile,
  isTextAttachmentMime,
  isWorkerParsedAttachmentExtension,
  normalizeAttachmentName,
  normalizeMediaReferenceImagesForRequest,
  resolveChatLongTextAttachmentPlan,
  truncateInlineText,
  truncateText
} from '@/utils/chatAttachmentUtils'
import {
  assistantImagePromptLabel,
  assistantImageTaskMetaLabel,
  assistantImageTaskNote,
  assistantImageTaskStatusLabel,
  assistantImageTaskTagType,
  assistantImageTaskTitle,
  assistantImageTitle,
  attachmentCardTitle,
  attachmentMetaSummary,
  attachmentStatusText,
  countFileAttachments,
  countImageAttachments,
  imageInsightLabel,
  isImageAttachment,
  listDisplayAttachments,
  mediaTaskProgressLabel
} from '@/utils/chatMediaPresentation'
import {
  buildContextSummaryPrelude,
  buildContextSummarySourceHash,
  buildContextSummaryTurnSegments
} from '@/utils/chatContextSummary'
import { buildChatRequestMessages } from '@/utils/chatRequestMessages'
import { createPreparedSkillToolExecutor } from '@/utils/chatPreparedSkillToolExecutor'
import { createPreparedMcpToolExecutor } from '@/utils/chatPreparedMcpToolExecutor'
import { createRepeatedToolCallGuard } from '@/utils/chatToolLoopGuard'
import { searchCapabilities } from '@/utils/contentSearch'
import {
  normalizeChatProviderBaseUrl as normalizeBaseUrl,
  safeJsonParse,
  stableStringify,
  streamChatCompletion
} from '@/utils/chatProviderStreaming'
import {
  buildUtoolsEnterEventKey,
  isComposerCompositionKeydownEvent,
  shouldSubmitComposerKeydownEvent
} from '@/utils/chatComposerInput'
import { buildMcpArgsFromForm, normalizeMcpPromptArgumentDefinitions, resetMcpArgFormData } from '@/utils/mcpArgumentForm'
import {
  buildSessionToolApprovalKey,
  evaluateToolApproval,
  getToolApprovalModeLabel,
  isDangerousShellApprovalCommand,
  normalizeSkillScriptApprovalArgs,
  normalizeToolApprovalMode,
  resolveMcpToolApprovalPolicy,
  TOOL_APPROVAL_MODE_FULL,
  TOOL_APPROVAL_MODE_MANUAL,
  TOOL_APPROVAL_MODE_SAFE,
  TOOL_APPROVAL_MODE_TRUSTED
} from '@/utils/toolApprovalPolicy'
import { createChatToolApprovalController } from '@/utils/chatToolApprovalController'
import {
  CHAT_RUN_INPUT_MODE_QUEUE,
  CHAT_RUN_INPUT_MODE_STEER,
  createChatRunInputQueue
} from '@/utils/chatRunInputQueue'
import ChatAssistantMedia from './ChatAssistantMedia.vue'
import ChatComposerPanel from './ChatComposerPanel.vue'
import ChatHeaderCard from './ChatHeaderCard.vue'
import ChatMediaLibraryModal from './ChatMediaLibraryModal.vue'
import ChatToolMessage from './ChatToolMessage.vue'
import ChatToolActivityGroup from './ChatToolActivityGroup.vue'
import ChatUserAttachments from './ChatUserAttachments.vue'
import SessionTree from './SessionTree.vue'

const ChatContextWindowPreview = defineAsyncComponent({
  loader: () => import('./ChatContextWindowPreview.vue'),
  suspensible: false
})

const McpArgumentForm = defineAsyncComponent({
  loader: () => import('@/components/McpArgumentForm.vue'),
  suspensible: false
})

const dialog = useDialog()
const message = useMessage()
const router = useRouter()
const {
  activeApproval: activeToolApproval,
  approvedKeys: sessionApprovedToolKeys,
  cancelPending: cancelPendingToolApprovals,
  clearSession: clearSessionApprovedTools,
  pendingApprovalCount: pendingToolApprovalCount,
  pendingApprovals: pendingToolApprovals,
  requestApproval: confirmToolCall,
  resolveActive: resolveActiveToolApproval
} = createChatToolApprovalController({
  createId: newId,
  throwIfAborted
})

const theme = getTheme()
const utoolsEnterData = useUtoolsEnterData()

const agents = getAgents()
const providers = getProviders()
const prompts = getPrompts()
const skills = getSkills()
const mcpServers = getMcpServers()
const chatConfig = getChatConfig()
const { loading: utoolsAiModelsLoading, loadError: utoolsAiModelsError } = getUtoolsAiModelsState()

function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

// 兼容：部分 OpenAI 兼容网关会把 /chat/completions 的 tool_calls 映射到 /responses 的 function_call，
// 从而要求 tool_calls[].id 以 "fc_" 开头，而标准 chat.completions 返回的是 "call_"。
const toolCallIdCompatByBaseUrl = new Map()
function getCompatKey(baseUrl) {
  return normalizeBaseUrl(baseUrl).toLowerCase()
}
function isFcToolCallIdCompatEnabled(baseUrl) {
  return toolCallIdCompatByBaseUrl.get(getCompatKey(baseUrl)) === 'fc'
}
function enableFcToolCallIdCompat(baseUrl) {
  toolCallIdCompatByBaseUrl.set(getCompatKey(baseUrl), 'fc')
}

const CHAT_SESSION_ROOT = 'session'
const AUTO_CHAT_SESSION_DIR_NAME = '历史会话'
const TIMED_TASK_SESSION_DIR_NAME = '定时任务'
const AUTO_CHAT_SESSION_ROOT = `${CHAT_SESSION_ROOT}/${AUTO_CHAT_SESSION_DIR_NAME}`
const TIMED_TASK_SESSION_ROOT = `${CHAT_SESSION_ROOT}/${TIMED_TASK_SESSION_DIR_NAME}`
const AUTO_CHAT_SESSION_RETENTION_DAYS = 3
const AUTO_CHAT_SESSION_RETENTION_MS = AUTO_CHAT_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000
const AUTO_CHAT_SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const AUTO_CHAT_SESSION_SOURCE_TYPE = 'auto_chat_session'
const DEFAULT_MEMORY_SESSION_TITLE = '新建会话'

const session = reactive({
  messages: [],
  apiMessages: []
})

const sessionTreeRef = ref(null)
const sessionSiderCollapsed = ref(true)
const activeSessionFilePath = ref('')
const activeSessionTitle = ref('')
const historySessionLoadState = reactive({
  visible: false,
  blocking: false,
  path: '',
  phase: '',
  detail: '',
  percent: 0,
  token: 0
})
const sessionContextWindowOverride = ref(null)
const isCompactChatLayout = ref(false)
const isDenseChatLayout = ref(false)

const selectedAgentId = ref(null)
const selectedProviderId = ref(null)
const selectedModel = ref('')

const basePromptMode = ref('custom') // prompt | custom
const selectedPromptId = ref(null)
const customSystemPrompt = ref('')
const customSystemPromptExplicit = ref(false)

const hasInitializedDefaultSystemPrompt = ref(false)
const lastLoadedDefaultSystemPrompt = ref('')

function getDefaultSystemPromptText() {
  return String(chatConfig.value?.defaultSystemPrompt || '')
}

function applyBasePromptSelection(promptId) {
  const prompt = findLocalPromptById(promptId)
  const nextPromptId = prompt && isSystemPrompt(prompt) ? prompt._id : null
  const nextState = buildBasePromptSelectionState(nextPromptId, getDefaultSystemPromptText())
  selectedPromptId.value = nextState.selectedPromptId
  basePromptMode.value = nextState.basePromptMode
  customSystemPrompt.value = nextState.customSystemPrompt
  customSystemPromptExplicit.value = false

  if (nextState.basePromptMode === 'custom') {
    lastLoadedDefaultSystemPrompt.value = normalizePromptText(nextState.customSystemPrompt)
    hasInitializedDefaultSystemPrompt.value = true
  }
}

watch(
  () => normalizePromptText(chatConfig.value?.defaultSystemPrompt || ''),
  (nextNormalized) => {
    const rawNext = String(chatConfig.value?.defaultSystemPrompt || '')

    if (!hasInitializedDefaultSystemPrompt.value) {
      basePromptMode.value = 'custom'
      customSystemPrompt.value = rawNext
      customSystemPromptExplicit.value = false
      lastLoadedDefaultSystemPrompt.value = nextNormalized
      hasInitializedDefaultSystemPrompt.value = true
      return
    }

    const currentNormalized = normalizePromptText(customSystemPrompt.value)
    if (
      basePromptMode.value === 'custom' &&
      !customSystemPromptExplicit.value &&
      currentNormalized === normalizePromptText(lastLoadedDefaultSystemPrompt.value)
    ) {
      customSystemPrompt.value = rawNext
      lastLoadedDefaultSystemPrompt.value = nextNormalized
    }
  },
  { immediate: true }
)

const selectedSkillIds = ref([])
const manualMcpIds = ref([])
const webSearchEnabled = ref(false)
const toolApprovalMode = ref(normalizeToolApprovalMode(chatConfig.value?.toolApprovalMode))
const autoApproveTools = computed({
  get: () => toolApprovalMode.value !== TOOL_APPROVAL_MODE_MANUAL,
  set: (value) => {
    toolApprovalMode.value = value === true
      ? TOOL_APPROVAL_MODE_SAFE
      : TOOL_APPROVAL_MODE_MANUAL
  }
})
const chatToolApprovalModeOptions = [
  {
    label: '每次确认',
    key: TOOL_APPROVAL_MODE_MANUAL
  },
  {
    label: '低风险自动（只读查询自动，写入与命令确认）',
    key: TOOL_APPROVAL_MODE_SAFE
  },
  {
    label: '高风险自动（普通命令与代码自动，危险操作确认）',
    key: TOOL_APPROVAL_MODE_FULL
  },
  {
    label: '完全信任（任何工具都直接批准）',
    key: TOOL_APPROVAL_MODE_TRUSTED
  }
]
const toolApprovalModeLabel = computed(() => getToolApprovalModeLabel(toolApprovalMode.value))
const toolApprovalModeButtonType = computed(() => (
  toolApprovalMode.value === TOOL_APPROVAL_MODE_FULL ||
  toolApprovalMode.value === TOOL_APPROVAL_MODE_TRUSTED
    ? 'error'
    : toolApprovalMode.value === TOOL_APPROVAL_MODE_SAFE
      ? 'primary'
      : 'default'
))
const autoActivateAgentSkills = ref(true)

// MCP 工具模式。内置 Skill 始终通过 skill_discover + skill_call 渐进披露，
// 不再受这里的展开模式影响。
// - auto：MCP 工具较少时展开，过多时自动回退到精简模式
// - expanded：始终展开外部 MCP
// - compact：外部 MCP 仅暴露 mcp_discover + mcp_call
const toolMode = ref('auto') // auto | expanded | compact
const effectiveToolMode = ref('expanded') // expanded | compact
const refreshingMcpTools = ref(false)
const mcpToolsRevision = ref(0)
const mcpToolsStatusByServerId = reactive({})
const lastBuiltRequestToolsStats = reactive({
  key: '',
  count: 0,
  chars: 0,
  updatedAt: 0,
  mode: 'expanded'
})
const mcpListToolsCache = new Map()
const mcpListToolsInFlight = new Map()
const MCP_LIST_TOOLS_TTL_MS = 30 * 60_000
const mcpListPromptsCache = new Map()
const mcpListPromptsInFlight = new Map()
const MCP_LIST_PROMPTS_TTL_MS = 30 * 60_000
const MAX_EXPANDED_TOOL_COUNT = 80
const mcpToolCatalogByServerId = new Map()
const mcpToolCatalogRevision = ref(0)
const MCP_CATALOG_MAX_TOOL_NAMES_PER_SERVER = 600
const MCP_CATALOG_MAX_TOOL_HINTS_PER_SERVER = 120
const MCP_CATALOG_MAX_OPTIONAL_KEYS_PER_TOOL = 12
// 将模型“查找用过”的工具固定到系统提示词，避免因 tool_names 截断导致反复 discover
const mcpPinnedToolHintsByServerId = new Map()
const mcpPinnedToolHintsRevision = ref(0)
const MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER = 20

// Agent 预设技能：元数据常驻，SKILL.md、引用文件和原生 Action Schema 均按需加载。
const agentSkillIds = ref([])
const activatedAgentSkillIds = ref([])
// Router activations live for one user turn. Explicit use_skill calls promote them to session scope.
const routerActivatedAgentSkillIds = new Set()
const routerAddedSelectedSkillIds = new Set()
const routerAddedAgentSkillIds = new Set()
const loadedSkillContentById = reactive({})
const loadedSkillFileCacheBySkillId = reactive({})

const showModelModal = ref(false)
const showSystemPromptModal = ref(false)
const showContextWindowModal = ref(false)
const showMediaLibraryModal = ref(false)
const mediaLibraryFilter = ref('all')
const resumingMediaTaskKeys = ref([])
const detachedMediaAbortStates = new Set()
const systemPromptDraft = ref('')
const contextWindowDraft = reactive({ ...DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG })
const contextWindowPreviewOmittedFilter = ref('all')

const showAgentModal = ref(false)
const agentModalSelectedId = ref(null)

const showPromptModal = ref(false)
const promptModalSelectedId = ref(null)
const promptMcpArgsForm = reactive({})
const promptUserArgsForm = reactive({})
const loadingMcpPrompts = ref(false)
const mcpPromptCatalog = ref([])
let mcpPromptCatalogLoadPromise = null

const showSkillModal = ref(false)
const skillModalSelectedIds = ref([])

const showMcpModal = ref(false)
const mcpModalSelectedIds = ref([])

const input = ref('')
const sandboxHostWorkspacePath = ref('')
const composerInputKey = ref(0)
const composerPanelRef = ref(null)
const inlineAgentQuery = ref('')
const inlineAgentMatchStart = ref(-1)
const inlineAgentMatchEnd = ref(-1)
const inlineAgentActiveIndex = ref(0)
const inlineCommandMode = ref('')
const inlineCommandType = ref('')
const inlineCommandQuery = ref('')
const inlineCommandMatchStart = ref(-1)
const inlineCommandMatchEnd = ref(-1)
const inlineCommandActiveIndex = ref(0)
const sending = ref(false)
const preparingSend = ref(false)
const preparingSendStage = ref('')
const abortController = ref(null)
const runRecordByAbortState = new WeakMap()
const pendingAttachments = ref([])

const memorySessions = ref([])
const activeMemorySessionId = ref('')
const autoPersistMemorySessionInFlight = new Map()
const sessionTitleRequestTokens = new Map()
let autoChatCleanupTimer = null
function createEmptyContextSummaryState() {
  return {
    summaryText: '',
    coveredMessageCount: 0,
    coveredTurnCount: 0,
    batchCount: 0,
    summaryLevel: 0,
    summaryChain: [],
    summarySourceLabel: '',
    sourceHash: '',
    updatedAt: 0
  }
}

const chatRunInputQueue = createChatRunInputQueue({ createId: newId })
const chatRunInputQueueRevision = ref(0)

function touchChatRunInputQueue() {
  chatRunInputQueueRevision.value += 1
}

function createEmptyContextTokenTelemetry() {
  return {
    inputTokens: 0,
    requestChars: 0,
    cachedTokens: 0,
    providerId: '',
    model: '',
    endpoint: '',
    updatedAt: 0
  }
}

function normalizeContextTokenTelemetry(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    inputTokens: Math.max(0, Math.floor(Number(source.inputTokens) || 0)),
    requestChars: Math.max(0, Math.floor(Number(source.requestChars) || 0)),
    cachedTokens: Math.max(0, Math.floor(Number(source.cachedTokens) || 0)),
    providerId: String(source.providerId || ''),
    model: String(source.model || ''),
    endpoint: String(source.endpoint || ''),
    updatedAt: Math.max(0, Math.floor(Number(source.updatedAt) || 0))
  }
}

function createMemorySessionRecord(options = {}) {
  const now = Date.now()
  const id = String(options.id || '').trim() || `mem-${newId()}`
  return {
    id,
    title: String(options.title || '').trim() || DEFAULT_MEMORY_SESSION_TITLE,
    titleSource: String(options.titleSource || '').trim(),
    titleRetryCount: Number(options.titleRetryCount || 0) || 0,
    titlePostReplyRetryDone: options.titlePostReplyRetryDone === true,
    createdAt: Number(options.createdAt || 0) || now,
    titleReadyAt: Number(options.titleReadyAt || 0) || 0,
    updatedAt: Number(options.updatedAt || 0) || now,
    messages: Array.isArray(options.messages) ? options.messages : [],
    apiMessages: Array.isArray(options.apiMessages) ? options.apiMessages : [],
    input: String(options.input || ''),
    pendingAttachments: Array.isArray(options.pendingAttachments) ? options.pendingAttachments : [],
    memoryCandidates: normalizeMemoryCandidateQueue(options.memoryCandidates),
    memoryCandidateUpdatedAt: Number(options.memoryCandidateUpdatedAt || 0) || 0,
    memoryCandidateFlushTimer: null,
    memoryCandidateFlushInFlight: false,
    contextSummary: options.contextSummary && typeof options.contextSummary === 'object'
      ? deepCopyJson(options.contextSummary, {})
      : createEmptyContextSummaryState(),
    contextTokenTelemetry: normalizeContextTokenTelemetry(options.contextTokenTelemetry),
    toolApprovalMode: normalizeToolApprovalMode(
      options.toolApprovalMode,
      options.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : TOOL_APPROVAL_MODE_SAFE
    ),
    autoApproveTools: normalizeToolApprovalMode(
      options.toolApprovalMode,
      options.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : TOOL_APPROVAL_MODE_SAFE
    ) !== TOOL_APPROVAL_MODE_MANUAL,
    activeSessionFilePath: String(options.activeSessionFilePath || '').trim(),
    activeSessionTitle: String(options.activeSessionTitle || '').trim(),
    state: options.state && typeof options.state === 'object' ? deepCopyJson(options.state, {}) : null,
    runningTaskCount: Number(options.runningTaskCount || 0) || 0,
    chatRunCount: Number(options.chatRunCount || 0) || 0,
    activeRequestAbortState: options.activeRequestAbortState || null,
    pendingApprovalRequests: [],
    approvalPromptActive: false,
    autoManaged: options.autoManaged === true
  }
}

function getActiveMemorySession() {
  const id = String(activeMemorySessionId.value || '').trim()
  let record = memorySessions.value.find((item) => String(item?.id || '') === id)
  if (!record) {
    record = createMemorySessionRecord({
      messages: session.messages,
      apiMessages: session.apiMessages,
      autoApproveTools: autoApproveTools.value,
      activeSessionFilePath: activeSessionFilePath.value,
      activeSessionTitle: activeSessionTitle.value
    })
    memorySessions.value = [...memorySessions.value, record]
    activeMemorySessionId.value = record.id
  }
  return record
}

function getMemorySessionById(id) {
  const target = String(id || '').trim()
  return memorySessions.value.find((item) => String(item?.id || '') === target) || null
}

function getMemorySessionRunningCount(record) {
  return Math.max(0, Number(record?.runningTaskCount || 0) || 0)
}

function getMemorySessionChatRunCount(record) {
  return Math.max(0, Number(record?.chatRunCount || 0) || 0)
}

function getMemorySessionPendingApprovalCount(record) {
  return Math.max(0, Array.isArray(record?.pendingApprovalRequests) ? record.pendingApprovalRequests.length : 0)
}

function isMemorySessionRunning(record) {
  return getMemorySessionRunningCount(record) > 0 || getMemorySessionChatRunCount(record) > 0
}

function isMemorySessionChatRunning(record) {
  return getMemorySessionChatRunCount(record) > 0
}

function isMemorySessionEmptyDraft(record) {
  if (!record) return false
  if (isMemorySessionRunning(record)) return false
  if (String(record.activeSessionFilePath || '').trim()) return false
  return !(record.messages?.length || record.apiMessages?.length)
}

function syncActiveRequestUiState(record = getMemorySessionById(activeMemorySessionId.value)) {
  const activeRecord = record && isMemorySessionActive(record) ? record : getMemorySessionById(activeMemorySessionId.value)
  if (isMemorySessionChatRunning(activeRecord)) {
    sending.value = true
    preparingSend.value = false
    preparingSendStage.value = ''
    abortController.value = activeRecord.activeRequestAbortState || null
    return
  }
  sending.value = false
  preparingSend.value = false
  preparingSendStage.value = ''
  abortController.value = null
}

function syncSessionTreeSelectionForRecord(record) {
  const recordId = String(record?.id || '').trim()
  const filePath = String(record?.activeSessionFilePath || '').trim()
  try {
    if (filePath) {
      const selection = sessionTreeRef.value?.selectPath?.(filePath)
      if (selection && typeof selection.then === 'function') {
        void selection.then(() => {
          if (!recordId || String(activeMemorySessionId.value || '') === recordId) return
          const activeRecord = getMemorySessionById(activeMemorySessionId.value)
          const activePath = String(activeRecord?.activeSessionFilePath || '').trim()
          try {
            if (activePath) void sessionTreeRef.value?.selectPath?.(activePath)
            else sessionTreeRef.value?.clearSelection?.()
          } catch {
            // ignore tree selection sync failures
          }
        }).catch(() => {})
      }
    } else {
      sessionTreeRef.value?.clearSelection?.()
    }
  } catch {
    // ignore tree selection sync failures
  }
}

function removeMemorySessionById(id) {
  const target = String(id || '').trim()
  if (!target) return false
  clearSessionApprovedTools(target)
  chatRunInputQueue.clear(target)
  touchChatRunInputQueue()
  const existing = getMemorySessionById(target)
  if (existing?.memoryCandidateFlushTimer) {
    try {
      window.clearTimeout(existing.memoryCandidateFlushTimer)
    } catch {
      // ignore
    }
    existing.memoryCandidateFlushTimer = null
  }
  const before = memorySessions.value.length
  memorySessions.value = memorySessions.value.filter((item) => String(item?.id || '') !== target)
  return memorySessions.value.length !== before
}

function getMemorySessionAutoPersistKey(record) {
  const id = String(record?.id || '').trim()
  if (id) return `id:${id}`
  const filePath = String(record?.activeSessionFilePath || '').trim()
  if (filePath) return `path:${filePath}`
  return ''
}

function hasResolvedMemorySessionTitle(record) {
  const title = String(record?.title || '').trim()
  return !!title && title !== DEFAULT_MEMORY_SESSION_TITLE
}

function isFinalizedMemorySessionTitle(record) {
  return hasResolvedMemorySessionTitle(record) && Number(record?.titleReadyAt || 0) > 0
}

function canGenerateMemorySessionTitle(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  const userMessages = record.messages.filter((msg) => msg?.role === 'user')
  if (userMessages.length !== 1) return false
  return String(record?.titleSource || '').trim() !== 'generated'
}

function canRetryMemorySessionTitle(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  const userMessages = record.messages.filter((msg) => msg?.role === 'user')
  if (userMessages.length !== 1) return false
  if (String(record?.titleSource || '').trim() === 'generated') return false
  if (record?.titlePostReplyRetryDone === true) return false
  return hasPersistableMemorySessionResponse(record)
}

function applyFallbackMemorySessionTitle(record, fallbackTitle, titleReadyAt = Date.now()) {
  if (!record) return 0
  const title = normalizeGeneratedSessionTitle(fallbackTitle, buildAutoSessionTitle(record))
  if (!title) return 0
  const readyAt = Number(titleReadyAt || 0) || Date.now()
  record.title = title
  record.activeSessionTitle = title
  record.titleSource = 'fallback'
  record.titleReadyAt = readyAt
  return readyAt
}

function shouldStampHistoryCreatedAtOnGeneratedTitle(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  if (!hasResolvedMemorySessionTitle(record)) return false
  if (String(record?.activeSessionFilePath || '').trim()) return false
  if (isMemorySessionRunning(record)) return false
  const userMessages = record.messages.filter((msg) => msg?.role === 'user')
  return userMessages.length === 1
}

function getPersistedMemorySessionTitle(record, filePath = '') {
  const currentTitle = String(record?.activeSessionTitle || record?.title || '').trim()
  if (hasResolvedMemorySessionTitle(record)) return currentTitle
  return ''
}

function isGeneratedSessionTitle(title) {
  const value = String(title || '').trim()
  if (!value) return false
  return value !== DEFAULT_MEMORY_SESSION_TITLE && value.length <= 32
}

function hasPersistableMemorySessionResponse(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  return record.messages.some((msg) => {
    if (!msg || msg.role !== 'assistant') return false
    if (String(msg.content || '').trim()) return true
    if (Array.isArray(msg.images) && msg.images.length) return true
    if (Array.isArray(msg.videos) && msg.videos.length) return true
    return false
  })
}

function canPersistMemorySessionToHistory(record) {
  return hasResolvedMemorySessionTitle(record) &&
    hasPersistableMemorySessionResponse(record) &&
    !isMemorySessionRunning(record)
}

function resolveMemorySessionTitle(record) {
  const currentTitle = String(record?.title || '').trim()
  if (hasResolvedMemorySessionTitle(record)) return currentTitle

  const pathTitle = getSessionTitleFromPath(record?.activeSessionFilePath || '')
  if (pathTitle) return pathTitle

  return DEFAULT_MEMORY_SESSION_TITLE
}

function markMemorySessionTitleReady(record, titleReadyAt = Date.now()) {
  if (!record) return 0
  const title = resolveMemorySessionTitle(record)
  if (!hasResolvedMemorySessionTitle({ title })) return 0
  const readyAt = Number(titleReadyAt || 0) || Date.now()
  record.title = title
  record.titleReadyAt = Number(record.titleReadyAt || 0) || readyAt
  return record.titleReadyAt
}

function pruneDormantMemorySessions(options = {}) {
  const keepId = String(options.keepId || activeMemorySessionId.value || '').trim()
  const kept = []
  memorySessions.value.forEach((record) => {
    const id = String(record?.id || '').trim()
    if (!id) {
      clearMemoryCandidateFlushTimer(record)
      return
    }
    if (id === keepId || isMemorySessionRunning(record)) {
      kept.push(record)
      return
    }
    if (isMemorySessionEmptyDraft(record) || (record.autoManaged && isAutoChatSessionPath(record.activeSessionFilePath))) {
      clearMemoryCandidateFlushTimer(record)
      return
    }
    kept.push(record)
  })
  memorySessions.value = kept
}

function getRunRecord(abortState = null) {
  if (!abortState || typeof abortState !== 'object') return null
  return runRecordByAbortState.get(abortState) || null
}

function getRunSessionTarget(abortState = null) {
  return getRunRecord(abortState) || session
}

function isRunRecordActive(abortState = null) {
  const record = getRunRecord(abortState)
  if (!record) return true
  return isMemorySessionActive(record)
}

async function maybeScrollToBottomForRun(abortState = null, options = {}) {
  if (isRunRecordActive(abortState)) await scrollToBottom(options)
}

function maybeScheduleScrollToBottomForRun(abortState = null) {
  if (isRunRecordActive(abortState)) maybeScheduleStreamingScroll()
}

function getMemorySessionForMessage(msg) {
  if (!msg || typeof msg !== 'object') return getActiveMemorySession()
  const id = String(msg.id || '').trim()
  return (
    memorySessions.value.find((item) =>
      (item?.messages || []).some((candidate) => candidate === msg || (id && String(candidate?.id || '').trim() === id))
    ) || getActiveMemorySession()
  )
}

function getMemorySessionForToolMessage(msg) {
  if (!msg || typeof msg !== 'object') return getActiveMemorySession()
  const toolSessionId = String(msg.toolSessionId || '').trim()
  if (toolSessionId) {
    const directHit = getMemorySessionById(toolSessionId)
    if (directHit) return directHit
  }
  return getMemorySessionForMessage(msg)
}

function saveActiveMemorySessionDraft() {
  const record = getActiveMemorySession()
  if (!record) return null
  record.messages = session.messages
  record.apiMessages = session.apiMessages
  record.toolApprovalMode = toolApprovalMode.value
  record.autoApproveTools = autoApproveTools.value === true
  record.input = String(input.value || '')
  record.pendingAttachments = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
  record.memoryCandidates = normalizeMemoryCandidateQueue(record.memoryCandidates)
  record.activeSessionFilePath = String(activeSessionFilePath.value || '').trim()
  record.activeSessionTitle = String(activeSessionTitle.value || '').trim()
  record.state = buildCurrentChatState()
  record.updatedAt = Date.now()
  return record
}

function restoreMemorySession(record, options = {}) {
  if (!record) return
  if (!options.skipSaveCurrent) saveActiveMemorySessionDraft()
  toolApprovalMode.value = normalizeToolApprovalMode(
    record.toolApprovalMode,
    record.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : TOOL_APPROVAL_MODE_SAFE
  )
  const fallbackAutoApprove =
    toolApprovalMode.value !== TOOL_APPROVAL_MODE_MANUAL
  const normalizedMessages = normalizeLoadedDisplayMessages(
    backfillLoadedToolAutoApproved(record.messages, fallbackAutoApprove)
  )
  record.messages = normalizedMessages
  primeHydratedHeavyChatMessages(normalizedMessages, {
    replace: true,
    fromStart: options.fromStart === true
  })
  activeMemorySessionId.value = record.id
  session.messages = normalizedMessages
  session.apiMessages = Array.isArray(record.apiMessages) ? record.apiMessages : []
  input.value = String(record.input || '')
  pendingAttachments.value = Array.isArray(record.pendingAttachments) ? record.pendingAttachments : []
  record.memoryCandidates = normalizeMemoryCandidateQueue(record.memoryCandidates)
  activeSessionFilePath.value = String(record.activeSessionFilePath || '').trim()
  activeSessionTitle.value = String(record.activeSessionTitle || '').trim()
  if (record.state) applyLoadedChatState(record.state)
  record.toolApprovalMode = toolApprovalMode.value
  record.autoApproveTools = toolApprovalMode.value !== TOOL_APPROVAL_MODE_MANUAL
  if (record.memoryCandidates?.length) scheduleMemoryCandidateFlush(record, { delayMs: 3000 })
  else clearMemoryCandidateFlushTimer(record)
  resetComposerInput()
  syncActiveRequestUiState(record)
  autoScrollSuspendedByUser.value = false
  if (options.syncTreeSelection !== false) syncSessionTreeSelectionForRecord(record)
  scheduleRefreshUserAnchorMeta()
  void flushMemorySessionApprovalQueue(record)
  scheduleQueuedInputDrain(record)
  if (!options.skipScroll) void nextTick(() => scrollToBottom({ force: true }))
}

function isAutoChatSessionPath(filePath) {
  const p = String(filePath || '').trim().replace(/\\/g, '/')
  return p === AUTO_CHAT_SESSION_ROOT || p.startsWith(`${AUTO_CHAT_SESSION_ROOT}/`)
}

function isTimedTaskSessionPath(filePath) {
  const p = String(filePath || '').trim().replace(/\\/g, '/')
  return p === TIMED_TASK_SESSION_ROOT || p.startsWith(`${TIMED_TASK_SESSION_ROOT}/`)
}

function isMemorySessionActive(record) {
  return !!record && String(record.id || '') === String(activeMemorySessionId.value || '')
}

function clearMemoryCandidateFlushTimer(record) {
  if (!record?.memoryCandidateFlushTimer) return
  try {
    window.clearTimeout(record.memoryCandidateFlushTimer)
  } catch {
    // ignore
  }
  record.memoryCandidateFlushTimer = null
}

function clearPendingMemoryCandidates(record) {
  if (!record) return false
  const hadCandidates = Array.isArray(record.memoryCandidates) && record.memoryCandidates.length > 0
  const hadTimer = !!record.memoryCandidateFlushTimer
  clearMemoryCandidateFlushTimer(record)
  record.memoryCandidates = []
  record.memoryCandidateUpdatedAt = 0
  return hadCandidates || hadTimer
}

function buildMemoryRecallQueryFromRecord(record, currentUserText = '', options = {}) {
  const parts = []
  const currentText = String(currentUserText || '').trim()
  if (currentText) parts.push(currentText)
  const excludeLatestUserTurn = options.excludeLatestUserTurn === true
  let messages = Array.isArray(record?.messages) ? record.messages : []
  if (excludeLatestUserTurn && messages.length) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user') messages = messages.slice(0, -1)
  }
  const recent = messages
    .filter((msg) => msg?.role === 'user' || msg?.role === 'assistant')
    .slice(-4)
    .map((msg) => {
      const prefix = msg?.role === 'assistant' ? '助手' : '用户'
      const content = String(msg?.content || '').trim()
      return content ? `${prefix}：${content}` : ''
    })
    .filter(Boolean)
  if (recent.length) parts.push(recent.join('\n'))
  const title = String(record?.title || activeSessionTitle.value || '').trim()
  if (title && title !== DEFAULT_MEMORY_SESSION_TITLE) parts.push(`当前会话：${title}`)
  return parts.filter(Boolean).join('\n\n').trim()
}

function buildMemoryRecallQueryFromAttachments(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : []
  const blocks = []
  list.forEach((attachment) => {
    if (!attachment || typeof attachment !== 'object') return
    const name = String(attachment.name || '').trim()
    const body = String(attachment?.sandboxPath ? '' : attachment.text || '').trim()
    if (!name && !body) return
    blocks.push(
      [
        name ? `附件：${name}` : '附件内容',
        attachment?.sandboxPath ? `沙盒文件：${attachment.sandboxPath}` : '',
        body ? truncateText(body, 1000, '（附件内容已截断）') : ''
      ].filter(Boolean).join('\n')
    )
  })
  return blocks.join('\n\n').trim()
}

function resolveMemoryVisionRequestConfig(chatRequestConfig = null) {
  const memoryCfg = chatConfig.value?.memory
  if (isChatMemoryEnabled(memoryCfg)) {
    const extraction = memoryCfg?.extraction && typeof memoryCfg.extraction === 'object' ? memoryCfg.extraction : {}
    const providerId = String(extraction.providerId || '').trim()
    const model = String(extraction.model || '').trim()
    const provider = providerId
      ? (providers.value || []).find((item) => String(item?._id || '') === providerId) || null
      : null
    if (provider && !isUtoolsBuiltinProvider(provider)) {
      const baseUrl = String(provider.baseurl || '').trim()
      const apiKey = String(provider.apikey || '').trim()
      if (baseUrl && apiKey && model) {
        return {
          providerKind: 'openai-compatible',
          providerId,
          baseUrl,
          apiKey,
          model,
          supportsVision: true,
          source: 'memory-extraction'
        }
      }
    }
  }

  if (chatRequestConfig?.providerKind === 'openai-compatible') {
    const baseUrl = String(chatRequestConfig?.baseUrl || '').trim()
    const apiKey = String(chatRequestConfig?.apiKey || '').trim()
    const model = String(chatRequestConfig?.model || '').trim()
    if (baseUrl && apiKey && model && chatRequestConfig?.supportsVision !== false) {
      return {
        providerKind: 'openai-compatible',
        providerId: String(chatRequestConfig?.providerId || selectedProviderId.value || '').trim(),
        baseUrl,
        apiKey,
        model,
        supportsVision: true,
        source: 'chat-provider'
      }
    }
  }

  return null
}

async function buildAttachmentVisionRecallSummary(att, cfg) {
  if (!att || typeof att !== 'object') return ''
  if (att.kind !== 'image' || !String(att.dataUrl || '').trim()) return ''
  const requestCfg = resolveMemoryVisionRequestConfig(cfg)
  if (!requestCfg || requestCfg?.supportsVision === false) return ''

  const baseUrl = String(requestCfg?.baseUrl || '').trim()
  const apiKey = String(requestCfg?.apiKey || '').trim()
  const model = String(requestCfg?.model || '').trim()
  if (!baseUrl || !apiKey || !model) return ''

  const prompt = [
    '请只提取这张图片里和后续问答/记忆召回最相关的信息。',
    '优先输出：人物姓名、称呼、问题、项目名、偏好、约束、可见文字、图表主题。',
    '控制在 80 字以内，不要解释，不要编造。'
  ].join('\n')

  try {
    const result = await streamChatCompletion({
      baseUrl,
      apiKey,
      body: {
        model,
        stream: true,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: String(att.dataUrl || '').trim() } }
            ]
          }
        ]
      },
      signal: undefined,
      onDelta: null,
      abortState: null
    })
    recordModelUsage(result?.usage, {
      providerId: requestCfg.providerId,
      model,
      endpoint: result?.endpoint || 'auto',
      purpose: 'memory-vision'
    })
    return truncateInlineText(String(result?.content || '').trim(), 120)
  } catch {
    return ''
  }
}

async function enrichImageAttachmentsForMemoryRecall(attachments = [], cfg = null) {
  const list = Array.isArray(attachments) ? attachments : []
  for (const att of list) {
    if (!att || typeof att !== 'object') continue
    if (att.kind !== 'image' || !String(att.dataUrl || '').trim()) continue
    const currentText = String(att.text || '').trim()
    const lacksSemanticText =
      !currentText ||
      /^(?:image|图片) metadata/i.test(currentText) ||
      /(?:图片元数据|Dimensions:|ViewBox:)/i.test(currentText)
    if (!lacksSemanticText) continue
    const summary = await buildAttachmentVisionRecallSummary(att, cfg)
    if (!summary) continue
    att.text = [currentText, `图片摘要：${summary}`].filter(Boolean).join('\n')
  }
}

async function flushMemoryCandidatesForRecord(record, options = {}) {
  if (!record) return { flushed: false, items: [], remaining: [] }
  if (record.memoryCandidateFlushInFlight) {
    return { flushed: false, items: [], remaining: normalizeMemoryCandidateQueue(record.memoryCandidates) }
  }
  record.memoryCandidateFlushInFlight = true
  clearMemoryCandidateFlushTimer(record)
  try {
    const queue = normalizeMemoryCandidateQueue(record.memoryCandidates)
    if (!queue.length) {
      record.memoryCandidates = []
      record.memoryCandidateUpdatedAt = 0
      return { flushed: false, items: [], remaining: [] }
    }
    const result = await flushMemoryCandidates({
      candidates: queue,
      systemPrompt: String(options.systemPrompt || '').trim() || buildCombinedSystemContent('', { sessionRecord: record }),
      force: options.force === true
    }).catch((err) => {
      console.warn('[chat memory] candidate flush failed:', err)
      return { flushed: false, items: [], remaining: queue }
    })

    record.memoryCandidates = normalizeMemoryCandidateQueue(result?.remaining || [])
    record.memoryCandidateUpdatedAt = record.memoryCandidates.length ? Date.now() : 0
    if (record.memoryCandidates.length) {
      scheduleMemoryCandidateFlush(record, { delayMs: options.retryDelayMs || 120000 })
    }
    return result
  } finally {
    record.memoryCandidateFlushInFlight = false
  }
}

function flushMemoryCandidatesInBackground(record, options = {}) {
  if (!record) return
  const queue = normalizeMemoryCandidateQueue(record.memoryCandidates)
  if (!queue.length) return
  const systemPrompt = String(options.systemPrompt || '').trim() || buildCombinedSystemContent('', { sessionRecord: record })
  const snapshot = {
    ...record,
    memoryCandidates: queue
  }
  window.setTimeout(() => {
    void flushMemoryCandidatesForRecord(snapshot, {
      ...options,
      systemPrompt
    })
  }, 0)
}

function scheduleMemoryCandidateFlush(record, options = {}) {
  if (!record) return
  clearMemoryCandidateFlushTimer(record)
  const queue = normalizeMemoryCandidateQueue(record.memoryCandidates)
  if (!queue.length) {
    record.memoryCandidates = []
    record.memoryCandidateUpdatedAt = 0
    return
  }
  const delayMs = Math.max(1000, Number(options.delayMs || 90000))
  record.memoryCandidateFlushTimer = window.setTimeout(() => {
    record.memoryCandidateFlushTimer = null
    void flushMemoryCandidatesForRecord(record, { force: false })
  }, delayMs)
}

function queueMemoryCandidateForRecord(record, payload = {}) {
  if (!record) return { queued: null, shouldFlush: false }
  const result = enqueueMemoryCandidate(record.memoryCandidates, payload)
  record.memoryCandidates = result.queue
  record.memoryCandidateUpdatedAt = record.memoryCandidates.length ? Date.now() : 0
  if (record.memoryCandidates.length) {
    if (result.shouldFlush) {
      void flushMemoryCandidatesForRecord(record, { force: true })
    } else {
      scheduleMemoryCandidateFlush(record)
    }
  } else {
    clearMemoryCandidateFlushTimer(record)
  }
  return result
}

function memorySessionOptionLabel(record) {
  const base = resolveMemorySessionTitle(record)
  const running = Math.max(getMemorySessionRunningCount(record), getMemorySessionChatRunCount(record))
  const pendingApprovalCount = getMemorySessionPendingApprovalCount(record)
  if (running > 0 && pendingApprovalCount > 0) return `${base}（${running} 个任务，待审批 ${pendingApprovalCount}）`
  if (running > 0) return `${base}（${running} 个任务）`
  if (pendingApprovalCount > 0) return `${base}（待审批 ${pendingApprovalCount}）`
  return base
}

const runningMemorySessions = computed(() => memorySessions.value.filter((record) => isMemorySessionRunning(record)))
const runningMemorySessionCount = computed(() => runningMemorySessions.value.length)

const memorySessionDropdownOptions = computed(() => {
  const runningOptions = runningMemorySessions.value.map((record) => ({
    label: `${String(record.id || '') === String(activeMemorySessionId.value || '') ? '✓ ' : ''}${memorySessionOptionLabel(record)}`,
    key: record.id
  }))
  return [
    { label: '新建会话', key: '__new__' },
    ...(runningOptions.length ? [{ type: 'divider', key: '__divider__' }, ...runningOptions] : [])
  ]
})

const initialMemorySession = createMemorySessionRecord({
  messages: session.messages,
  apiMessages: session.apiMessages
})
memorySessions.value = [initialMemorySession]
activeMemorySessionId.value = initialMemorySession.id

const thinkingEffort = ref('auto')
const imageGenerationMode = ref('auto') // auto | on | off
const videoGenerationMode = ref('auto') // auto | on | off
const imageGenerationParamsEnabled = ref(false)
const imageGenerationParams = reactive(createDefaultImageGenerationParams())
const videoGenerationParamsEnabled = ref(false)
const videoGenerationParams = reactive(createDefaultVideoGenerationParams())

const hasAppliedDefaultModel = ref(false)

const COMPACT_CHAT_BREAKPOINT = 980
const DENSE_CHAT_BREAKPOINT = 720
const CHAT_VIRTUALIZATION_MIN_MESSAGES = 24
const CHAT_VIRTUALIZATION_OVERSCAN_PX = 640
const CHAT_VIRTUALIZATION_FORCE_RENDER_MARGIN_PX = 240
const CHAT_LIST_GAP_PX = 14
const CHAT_ACTIVITY_LIST_GAP_PX = 5
const CHAT_DEFAULT_MESSAGE_HEIGHT = 180
const CHAT_DEFAULT_MIN_MESSAGE_HEIGHT = 96
const CHAT_RECENT_HEAVY_RENDER_COUNT = 12
const CHAT_HEAVY_RENDER_SEED_COUNT = 12
const CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA = 2
const CHAT_SCROLL_COMPENSATION_SUSPEND_MS = 640
const CHAT_SCROLL_COMPENSATION_MARK_MS = 96
const CHAT_USER_SCROLL_ACTIVE_MS = 480
const CHAT_TOOL_COMPACT_MIN_MESSAGES = 120
const CHAT_TOOL_COMPACT_MIN_TOOL_MESSAGES = 32
const CHAT_TOOL_COMPACT_ITEM_FIXED_HEIGHT = 26
const CHAT_TOOL_ACTIVITY_GROUP_FIXED_HEIGHT = 32
const CHAT_ASSISTANT_ACTIVITY_ITEM_HEIGHT = 28
const CHAT_STREAM_RENDER_THROTTLE_MS = 72

function syncChatResponsiveState() {
  if (typeof window === 'undefined') return
  const width = Number(window.innerWidth || 0)
  isCompactChatLayout.value = width > 0 && width <= COMPACT_CHAT_BREAKPOINT
  isDenseChatLayout.value = width > 0 && width <= DENSE_CHAT_BREAKPOINT
}

const layoutContentStyle = computed(() => {
  const padding = isCompactChatLayout.value ? '8px' : isDenseChatLayout.value ? '8px 20px 8px 8px' : '8px 32px 8px 8px'
  return `padding: ${padding}; height: calc(var(--app-viewport-height) - (var(--app-shell-padding) * 2)); box-sizing: border-box; overflow: hidden;`
})

const sessionSiderWidth = computed(() => (isCompactChatLayout.value ? 280 : 320))
const sessionSiderCollapsedWidth = computed(() => (isCompactChatLayout.value ? 0 : 15))
const sessionSiderContentStyle = computed(() => {
  return isCompactChatLayout.value
    ? 'padding: 16px 12px; height: 100%; box-sizing: border-box; overflow: hidden;'
    : 'padding: 24px; height: 100%; box-sizing: border-box; overflow: hidden;'
})

watch(
  () => chatConfig.value?.contextWindow,
  (next) => {
    if (showContextWindowModal.value) return
    if (!sessionContextWindowOverride.value) syncContextWindowDraft(next)
  },
  { immediate: true, deep: true }
)

watch(
  () => {
    const memoryCfg = chatConfig.value?.memory
    return `${isChatMemoryEnabled(memoryCfg)}|${memoryCfg?.autoExtract !== false}`
  },
  (next, prev) => {
    if (!prev || next === prev) return
    const [prevEnabled, prevAutoExtract] = String(prev).split('|')
    const [nextEnabled, nextAutoExtract] = String(next).split('|')
    const shouldClearQueuedCandidates =
      (prevEnabled === 'true' && nextEnabled !== 'true') ||
      (prevAutoExtract === 'true' && nextAutoExtract !== 'true')

    if (!shouldClearQueuedCandidates) return

    let changed = false
    for (const record of memorySessions.value) {
      if (clearPendingMemoryCandidates(record)) {
        record.updatedAt = Date.now()
        changed = true
      }
    }
    if (changed) scheduleSessionAutosave({ force: true })
  },
  { immediate: true }
)

watch(
  () => String(chatConfig.value?.imageGenerationMode || 'auto').trim().toLowerCase(),
  (next) => {
    imageGenerationMode.value = normalizeImageGenerationMode(next)
  },
  { immediate: true }
)

watch(
  () => String(chatConfig.value?.videoGenerationMode || 'auto').trim().toLowerCase(),
  (next) => {
    videoGenerationMode.value = normalizeImageGenerationMode(next)
  },
  { immediate: true }
)

watch(isCompactChatLayout, (next, prev) => {
  if (next && !prev) sessionSiderCollapsed.value = true
})

const INLINE_AGENT_SUGGESTION_LIMIT = 8
const INLINE_COMMAND_SUGGESTION_LIMIT = 8
const attachmentParseQueue = new Map()

async function collectAttachmentMediaReferenceImages(attachments = [], userDisplay = null) {
  const list = Array.isArray(attachments) ? attachments : []
  if (list.length) {
    await Promise.all(list.map((a) => ensureAttachmentParsed(a)))
  }

  const refs = []
  for (const a of list) {
    if (a?.status === 'ready' && a.kind === 'image' && a.dataUrl) {
      refs.push(a)
    }
  }

  const normalized = normalizeMediaReferenceImagesForRequest(refs)
  if (userDisplay && normalized.length && !(Array.isArray(userDisplay.images) && userDisplay.images.length)) {
    userDisplay.images = buildDisplayImagesFromReferences(normalized, newId)
  }
  return normalized
}

function openFilePicker() {
  try {
    composerPanelRef.value?.triggerFilePicker?.()
  } catch {
    // ignore
  }
}

function removeAttachment(id) {
  const list = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
  pendingAttachments.value = list.filter((a) => a?.id !== id)
}

function attachmentIcon(a) {
  const mime = String(a?.mime || '')
  const ext = String(a?.ext || '')
  if (isImageAttachmentLike({ mime, ext, kind: a?.kind })) return ImageOutline
  return DocumentTextOutline
}

async function parseAttachment(att) {
  const file = att?.file
  if (!file) throw new Error('附件文件为空')

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment too large (${Math.ceil(file.size / 1024 / 1024)}MB). Limit: ${Math.ceil(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB`)
  }

  const name = String(att.name || file.name || 'unnamed')
  const ext = String(att.ext || getFileExt(name) || guessExtensionFromMime(att.mime || file.type || '')).trim().toLowerCase()
  const mime = String(att.mime || file.type || '')

  if (isImageAttachmentLike({ mime, ext })) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (${Math.ceil(file.size / 1024 / 1024)}MB). Limit: ${Math.ceil(MAX_IMAGE_BYTES / 1024 / 1024)}MB`)
    }
    const dataUrl = await fileToDataUrl(file)
    const imageSummary = await buildImageAttachmentSummary({ file, name, ext, mime, dataUrl })
    return {
      kind: 'image',
      name,
      ext,
      mime,
      dataUrl,
      text: imageSummary.text,
      width: imageSummary.width,
      height: imageSummary.height,
      metaLine: imageSummary.metaLine,
      svgTextPreview: imageSummary.svgTextPreview
    }
  }

  if (isDirectTextAttachmentExtension(ext) || (!ext && isTextAttachmentMime(mime))) {
    const t = await file.text()
    return { kind: 'text', name, ext, mime, text: truncateText(t, MAX_ATTACHMENT_TEXT_CHARS) }
  }

  if (isWorkerParsedAttachmentExtension(ext)) {
    const text = await parseAttachmentTextWithFallback({ file, ext, fileName: name, maxChars: MAX_ATTACHMENT_TEXT_CHARS })
    return { kind: 'text', name, ext, mime, text }
  }

  if (isConvertibleAttachmentExtension(ext)) {
    throw new Error(`暂不支持解析 .${ext}，建议另存为 .${ext}x 后再上传`)
  }

  throw new Error(`不支持的附件类型：${ext || 'unknown'}`)
}

async function ensureAttachmentParsed(att) {
  if (!att?.id) return
  if (att.status === 'ready' || att.status === 'error') return

  if (attachmentParseQueue.has(att.id)) return attachmentParseQueue.get(att.id)

  const p = (async () => {
    att.status = 'processing'
    att.error = ''
    try {
      const parsed = await parseAttachment(att)
      att.kind = parsed.kind
      att.text = parsed.text || ''
      att.dataUrl = parsed.dataUrl || ''
      att.width = Number(parsed.width || 0)
      att.height = Number(parsed.height || 0)
      att.metaLine = parsed.metaLine || ''
      att.svgTextPreview = parsed.svgTextPreview || ''
      att.status = 'ready'
    } catch (err) {
      att.status = 'error'
      att.error = err?.message || String(err)
    } finally {
      attachmentParseQueue.delete(att.id)
    }
  })()

  attachmentParseQueue.set(att.id, p)
  return p
}

function createPendingAttachment(file, options = {}) {
  const normalizedName = normalizeAttachmentName(file, options)
  return reactive({
    id: newId(),
    name: normalizedName,
    ext: getFileExt(normalizedName) || guessExtensionFromMime(file?.type),
    mime: file?.type || '',
    size: file?.size || 0,
    file,
    kind: '',
    text: '',
    dataUrl: '',
    width: 0,
    height: 0,
    metaLine: '',
    svgTextPreview: '',
    status: 'pending', // pending | processing | ready | error
    error: '',
    autoWrappedLongText: options.autoWrappedLongText === true
  })
}

function createLongTextAttachmentFile(plan) {
  try {
    return new File([plan.attachmentText], plan.attachmentName, {
      type: plan.attachmentMime,
      lastModified: Date.now()
    })
  } catch {
    try {
      const file = new Blob([plan.attachmentText], { type: plan.attachmentMime })
      Object.defineProperty(file, 'name', {
        configurable: true,
        enumerable: true,
        value: plan.attachmentName
      })
      return file
    } catch {
      return null
    }
  }
}

function createPendingLongTextAttachment(plan) {
  const file = createLongTextAttachmentFile(plan)
  if (!file) return null
  const attachment = createPendingAttachment(file, {
    name: plan.attachmentName,
    autoWrappedLongText: true
  })
  void ensureAttachmentParsed(attachment)
  return attachment
}

function appendPendingFiles(files, options = {}) {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  if (!list.length) return 0

  const current = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
  const totalBytes = current.reduce((sum, a) => sum + Number(a?.size || 0), 0) + list.reduce((sum, f) => sum + Number(f?.size || 0), 0)
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    message.warning(`附件总大小超过上限（${Math.ceil(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB），请减少文件数量或大小`)
    return 0
  }

  const added = list.map((file) => createPendingAttachment(file, options))
  pendingAttachments.value = [...current, ...added]

  // 异步解析，避免阻塞 UI
  added.forEach((a) => ensureAttachmentParsed(a))
  return added.length
}

function getSupportedClipboardFiles(e) {
  const out = []
  const seen = new Set()
  const addFile = (file) => {
    if (!file || !isSupportedAttachmentFile(file)) return
    const key = [
      String(file.name || '').trim().toLowerCase(),
      Number(file.size || 0),
      String(file.type || '').trim().toLowerCase()
    ].join('|')
    if (seen.has(key)) return
    seen.add(key)
    out.push(file)
  }

  Array.from(e?.clipboardData?.items || []).forEach((item) => {
    const file = item?.kind === 'file' ? item.getAsFile?.() : null
    addFile(file)
  })
  Array.from(e?.clipboardData?.files || []).forEach(addFile)

  return out
}

function handleComposerPaste(e) {
  const files = getSupportedClipboardFiles(e)
  if (files.length) {
    e.preventDefault()
    const addedCount = appendPendingFiles(files)
    if (addedCount > 0) {
      message.success(`Added ${addedCount} attachments`)
    }
    return
  }

  const pastedText = String(e?.clipboardData?.getData?.('text/plain') || '')
  const current = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
  const plan = resolveChatLongTextAttachmentPlan(pastedText, current)
  if (!plan.wrapped) {
    if (plan.error) {
      e.preventDefault()
      message.warning(plan.error)
    }
    return
  }

  e.preventDefault()
  const attachment = createPendingLongTextAttachment(plan)
  if (!attachment) {
    message.warning('当前环境无法创建长文本附件，请改为手动上传 Markdown 文件。')
    return
  }
  pendingAttachments.value = [...current, attachment]
  message.success('粘贴内容较长，已自动添加为 Markdown 附件')
}

async function handleFileInputChange(e) {
  const files = Array.from(e?.target?.files || [])
  try {
    if (e?.target) e.target.value = ''
  } catch {
    // ignore
  }
  if (!files.length) return

  appendPendingFiles(files)
  return

  const current = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
  const totalBytes = current.reduce((sum, a) => sum + Number(a?.size || 0), 0) + files.reduce((sum, f) => sum + Number(f?.size || 0), 0)
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    message.warning(`Attachments exceed the total limit (${Math.ceil(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB). Reduce file count or size.`)
    return
  }

  const added = files.map((file) =>
    reactive({
      id: newId(),
      name: file?.name || 'unnamed',
      ext: getFileExt(file?.name),
      mime: file?.type || '',
      size: file?.size || 0,
      file,
      kind: '',
      text: '',
      dataUrl: '',
      width: 0,
      height: 0,
      metaLine: '',
      svgTextPreview: '',
      status: 'pending', // pending | processing | ready | error
      error: ''
    })
  )
  pendingAttachments.value = [...current, ...added]

  // 异步解析，避免阻塞 UI
  added.forEach((a) => ensureAttachmentParsed(a))
}

const scrollbarRef = ref(null)

const agentOptions = computed(() => {
  return (agents.value || [])
    .filter((agent) => agent?.builtin !== true)
    .map((agent) => ({ label: agent.name || agent._id, value: agent._id }))
})

const promptOptions = computed(() => {
  const localSystemOptions = (prompts.value || [])
    .filter((prompt) => prompt?.builtin !== true && isSystemPrompt(prompt))
    .map((p) => ({
      label: p.name || p._id,
      value: makeLocalPromptOptionValue(p._id)
    }))

  const localUserOptions = (prompts.value || [])
    .filter((prompt) => prompt?.builtin !== true && isUserPrompt(prompt))
    .map((p) => ({
      label: p.name || p._id,
      value: makeLocalPromptOptionValue(p._id)
    }))

  const mcpOptions = (mcpPromptCatalog.value || []).map((item) => ({
    label: item.label,
    value: makeMcpPromptOptionValue(item),
    disabled: !!item.disabled
  }))

  const groups = []
  if (localSystemOptions.length) groups.push({ type: 'group', label: '本地提示词（系统提示词）', key: 'local-system-prompts', children: localSystemOptions })
  if (localUserOptions.length) groups.push({ type: 'group', label: '本地提示词（插入输入框）', key: 'local-user-prompts', children: localUserOptions })
  if (mcpOptions.length) groups.push({ type: 'group', label: 'MCP 提示词（插入输入框）', key: 'mcp-prompts', children: mcpOptions })
  return groups.length ? groups : localSystemOptions
})

const selectedPromptModalParsedValue = computed(() => parsePromptOptionValue(promptModalSelectedId.value))
const selectedPromptModalKind = computed(() => selectedPromptModalParsedValue.value.type)
const selectedLocalPromptForModal = computed(() => {
  const parsed = selectedPromptModalParsedValue.value
  if (parsed.type !== 'local') return null
  return (prompts.value || []).find((item) => item && item._id === parsed.promptId) || null
})
const selectedMcpPromptForModal = computed(() => {
  const parsed = selectedPromptModalParsedValue.value
  if (parsed.type !== 'mcp') return null
  return findMcpPromptCatalogItem(parsed.serverId, parsed.promptName)
})
const selectedMcpPromptArgs = computed(() => {
  const args = selectedMcpPromptForModal.value?.arguments
  if (!Array.isArray(args)) return []
  return args
})
const selectedLocalPromptVariables = computed(() => {
  const prompt = selectedLocalPromptForModal.value
  if (!prompt || !isUserPrompt(prompt)) return []
  return extractPromptVariables(prompt.content)
})

watch(
  selectedMcpPromptArgs,
  (args) => {
    resetMcpArgFormData(args, promptMcpArgsForm)
  },
  { deep: true }
)

watch(
  selectedLocalPromptVariables,
  (args) => {
    resetPromptVariableFormData(args, promptUserArgsForm)
  },
  { deep: true }
)

watch(
  [prompts, basePromptMode, selectedPromptId],
  () => {
    if (basePromptMode.value !== 'prompt') return
    const prompt = findLocalPromptById(selectedPromptId.value)
    if (prompt && isSystemPrompt(prompt)) return
    applyBasePromptSelection(null)
  },
  { flush: 'post' }
)

const skillOptions = computed(() => {
  return (skills.value || []).map((s) => ({ label: s.name || s._id, value: s._id }))
})

const orderedMcpServers = computed(() => {
  return [...(mcpServers.value || [])].sort((a, b) => {
    const disabledDiff = Number(!!a?.disabled) - Number(!!b?.disabled)
    if (disabledDiff !== 0) return disabledDiff
    return String(a?.name || a?._id || '').localeCompare(String(b?.name || b?._id || ''), 'zh-Hans-CN')
  })
})

const mcpOptions = computed(() => {
  return orderedMcpServers.value.map((s) => ({
    label: s.name || s._id,
    value: s._id,
    disabled: !!s.disabled
  }))
})

const selectedAgent = computed(() => {
  if (!selectedAgentId.value) return null
  return (agents.value || []).find((a) => a._id === selectedAgentId.value) || null
})
const visibleSelectedAgent = computed(() => (
  selectedAgent.value?.builtin === true ? null : selectedAgent.value
))
const isDefaultGeneralAgent = computed(() => selectedAgent.value?.builtin === true)

const inlineAgentPickerHeaderText = computed(() => {
  const query = String(inlineAgentQuery.value || '').trim()
  return query ? `@${query}` : '@'
})

const inlineCommandPickerTitle = computed(() => {
  if (inlineCommandMode.value === 'kind') return '选择命令类型'
  return INLINE_COMMAND_KIND_LABELS[inlineCommandType.value] || '选择命令'
})

const inlineCommandPickerHeaderText = computed(() => {
  if (inlineCommandMode.value === 'kind') {
    const query = String(inlineCommandQuery.value || '').trim()
    return query ? `/${query}` : '/'
  }

  const kind = String(inlineCommandType.value || '').trim()
  if (!kind) return ''
  const query = String(inlineCommandQuery.value || '').trim()
  return query ? `/${kind} ${query}` : `/${kind}`
})

const inlineAgentSuggestions = computed(() => {
  const list = (Array.isArray(agents.value) ? agents.value : []).filter((agent) => agent?.builtin !== true)
  const query = String(inlineAgentQuery.value || '').trim()

  return list
    .map((agent) => {
      const id = String(agent?._id || '').trim()
      const name = String(agent?.name || '').trim()
      if (!id) return null

      const provider = (providers.value || []).find((p) => p?._id === agent?.provider)
      const selected = selectedAgentId.value === id
      const providerLabel = provider?.name || provider?._id || ''
      const model = String(agent?.model || '').trim()
      const score = query
        ? getInlinePickerMatchScore([name, id, providerLabel, model], query)
        : selected ? -1 : 10
      if (!Number.isFinite(score)) return null

      return {
        value: id,
        id,
        name,
        label: name || id,
        model,
        providerLabel,
        selected,
        score
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label))
    .slice(0, INLINE_AGENT_SUGGESTION_LIMIT)
})

const inlineCommandSuggestions = computed(() => {
  const mode = String(inlineCommandMode.value || '').trim()
  const kind = String(inlineCommandType.value || '').trim()
  const query = String(inlineCommandQuery.value || '').trim()
  if (mode === 'kind') {
    return INLINE_COMMAND_DEFINITIONS
      .map((item) => {
        const score = query
          ? getInlinePickerMatchScore([item.kind, item.label, item.token, ...item.aliases.map((alias) => `/${alias}`)], query)
          : 0
        if (query && !Number.isFinite(score)) return null
        return {
          value: item.kind,
          id: item.label,
          label: item.token,
          description: item.description,
          meta: item.aliases.length ? item.aliases.map((alias) => `/${alias}`).join(' ') : '',
          selected: false,
          selectedTag: '',
          score
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
      .slice(0, INLINE_COMMAND_SUGGESTION_LIMIT)
  }

  if (!kind) return []

  if (kind === 'prompt') {
    const localItems = (prompts.value || [])
      .filter((prompt) => prompt?.builtin !== true)
      .map((prompt) => {
        const id = String(prompt?._id || '').trim()
        if (!id) return null
        const label = String(prompt?.name || prompt?._id || '').trim()
        const description = truncateInlineText(prompt?.content, 72)
        const isSystem = isSystemPrompt(prompt)
        const selected = isSystem && hasActiveBasePromptSelection({
          basePromptMode: basePromptMode.value,
          selectedPromptId: selectedPromptId.value
        }) && selectedPromptId.value === id
        const score = query
          ? getInlinePickerMatchScore([label, id, description], query)
          : selected ? -1 : 10
        if (!Number.isFinite(score)) return null
        return {
          value: makeLocalPromptOptionValue(id),
          id,
          label: label || id,
          description,
          meta: isSystem ? '本地 · 系统' : '本地 · 用户',
          selected,
          selectedTag: isSystem ? '当前' : '',
          score
        }
      })
      .filter(Boolean)

    const mcpItems = (mcpPromptCatalog.value || [])
      .map((item) => {
        const serverId = String(item?.serverId || '').trim()
        const name = String(item?.name || '').trim()
        if (!serverId || !name) return null
        const label = String(item?.label || name).trim()
        const description = truncateInlineText(item?.description, 72)
        const meta = ['MCP', item?.serverName || serverId, item?.arguments?.length ? `参数 ${item.arguments.length}` : ''].filter(Boolean).join(' · ')
        const score = query
          ? getInlinePickerMatchScore([label, name, serverId, item?.serverName, description, meta], query)
          : 12
        if (!Number.isFinite(score)) return null
        return {
          value: makeMcpPromptOptionValue(item),
          id: name,
          label,
          description,
          meta,
          selected: false,
          selectedTag: '',
          score,
          disabled: !!item.disabled,
          title: [item?.serverName && item.serverName !== serverId ? serverId : '', description, item.disabled ? '该 MCP 已禁用' : ''].filter(Boolean).join('\n')
        }
      })
      .filter(Boolean)

    return [...localItems, ...mcpItems]
      .sort((a, b) => a.score - b.score || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label, 'zh-Hans-CN'))
      .slice(0, INLINE_COMMAND_SUGGESTION_LIMIT)
  }

  if (kind === 'skill') {
    const agentSet = agentSkillIdSet.value
    return (skills.value || [])
      .map((skill) => {
        const id = String(skill?._id || '').trim()
        if (!id) return null
        const label = String(skill?.name || skill?._id || '').trim()
        const description = truncateInlineText(skill?.description || skill?.content, 72)
        const selected = (selectedSkillIds.value || []).includes(id)
        const meta = agentSet.has(id) ? '智能体' : ''
        const score = query
          ? getInlinePickerMatchScore([label, id, description, meta], query)
          : selected ? -1 : 10
        if (!Number.isFinite(score)) return null
        return {
          value: id,
          id,
          label: label || id,
          description,
          meta,
          selected,
          selectedTag: '已选中',
          score
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label))
      .slice(0, INLINE_COMMAND_SUGGESTION_LIMIT)
  }

  if (kind === 'mcp') {
    const manualIdSet = new Set(Array.isArray(manualMcpIds.value) ? manualMcpIds.value : [])
    const derivedIdSet = new Set(Array.isArray(derivedMcpIds.value) ? derivedMcpIds.value : [])

    return orderedMcpServers.value
      .map((server) => {
        const id = String(server?._id || '').trim()
        if (!id) return null
        const label = String(server?.name || server?._id || '').trim()
        const disabled = !!server?.disabled
        const manualSelected = manualIdSet.has(id)
        const derivedSelected = derivedIdSet.has(id)
        const selected = manualSelected || derivedSelected
        const metaParts = []
        const transportType = String(server?.transportType || '').trim().toUpperCase()
        if (transportType) metaParts.push(transportType)
        if (derivedSelected && !manualSelected) metaParts.push('技能')
        if (disabled) metaParts.push('已禁用')
        const meta = metaParts.join(' · ')
        const description = truncateInlineText(server?.description || server?.url || server?.baseUrl || server?.command, 72)
        const score = query
          ? getInlinePickerMatchScore([label, id, description, meta], query)
          : manualSelected ? -2 : derivedSelected ? -1 : disabled ? 20 : 10
        if (!Number.isFinite(score)) return null
        return {
          value: id,
          id,
          label: label || id,
          description,
          meta,
          selected,
          selectedTag: manualSelected ? '已选中' : derivedSelected ? '技能' : '',
          disabled,
          title: [label && label !== id ? id : '', description, disabled ? '该 MCP 已禁用，请先到设置页启用' : '']
            .filter(Boolean)
            .join('\n'),
          score
        }
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.score - b.score ||
          Number(!!a.disabled) - Number(!!b.disabled) ||
          Number(b.selected) - Number(a.selected) ||
          a.label.localeCompare(b.label, 'zh-Hans-CN')
      )
  }

  return []
})

const showInlineAgentPicker = computed(() => {
  return inlineAgentMatchStart.value >= 0 && inlineAgentSuggestions.value.length > 0
})

const showInlineCommandPicker = computed(() => {
  return inlineCommandMatchStart.value >= 0 && inlineCommandSuggestions.value.length > 0
})

const selectedAgentModelParams = computed(() => normalizeAgentModelParams(selectedAgent.value?.modelParams))

const selectedProvider = computed(() => {
  if (!selectedProviderId.value) return null
  return (providers.value || []).find((p) => p._id === selectedProviderId.value) || null
})

const mediaGenerationPresetOptions = computed(() => buildMediaGenerationPresetOptions())

const sessionMediaItemCount = computed(() => countSessionMediaItems(session.messages))

const sessionMediaItems = computed(() => {
  if (!showMediaLibraryModal.value || !sessionMediaItemCount.value) return []
  return collectSessionMediaItems(session.messages, { imageMetaLabel, videoMetaLabel })
})

const filteredSessionMediaItems = computed(() => {
  if (!showMediaLibraryModal.value) return []
  return filterSessionMediaItems(sessionMediaItems.value, mediaLibraryFilter.value)
})

const pendingImageAttachments = computed(() => {
  const list = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
  return list.filter((item) => isImageAttachment(item))
})

const pendingFileAttachments = computed(() => {
  const list = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
  return list.filter((item) => !isImageAttachment(item))
})

const selectedSkillObjects = computed(() => {
  return selectSkillsByIds(selectedSkillIds.value, skills.value)
})

const runtimeSkillObjects = computed(() => selectedSkillObjects.value)

function formatDisplayNameWithId(entity) {
  const id = String(entity?._id || '').trim()
  const name = String(entity?.name || '').trim()
  if (!id && !name) return ''
  if (!name || name === id) return id || name
  return `${name}（${id}）`
}

function joinAsLines(items = [], emptyText = '无') {
  const list = (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  if (!list.length) return emptyText
  return list.map((item) => `- ${item}`).join('\n')
}

const runtimeAgentSkillIds = computed(() => normalizeStringList(agentSkillIds.value))

const agentSkillIdSet = computed(() => new Set(Array.isArray(agentSkillIds.value) ? agentSkillIds.value : []))
const runtimeAgentSkillIdSet = computed(() => new Set(runtimeAgentSkillIds.value))
const activatedAgentSkillIdSet = computed(() =>
  new Set(Array.isArray(activatedAgentSkillIds.value) ? activatedAgentSkillIds.value : [])
)

function getLoadedSkillContent(skillId) {
  return String(loadedSkillContentById[String(skillId || '').trim()] || '').trim()
}

function getLoadedSkillFilePathSet(skillId) {
  const id = String(skillId || '').trim()
  const list = Array.isArray(loadedSkillFileCacheBySkillId[id]) ? loadedSkillFileCacheBySkillId[id] : []
  return new Set(list)
}

function hasLoadedSkillMainContent(skillId, entryFile = 'SKILL.md') {
  const id = String(skillId || '').trim()
  if (!id) return false
  if (Object.prototype.hasOwnProperty.call(loadedSkillContentById, id)) return true
  const normalizedEntry = String(entryFile || 'SKILL.md').trim() || 'SKILL.md'
  return getLoadedSkillFilePathSet(id).has(normalizedEntry)
}

function isSkillPromptContentLoaded(skill) {
  const id = String(skill?._id || '').trim()
  if (!id) return false
  if (isDirectorySkill(skill)) {
    if (runtimeAgentSkillIdSet.value.has(id) && !activatedAgentSkillIdSet.value.has(id)) return false
    return hasLoadedSkillMainContent(id, skill?.entryFile || 'SKILL.md')
  }
  if (!runtimeAgentSkillIdSet.value.has(id)) return true
  return activatedAgentSkillIdSet.value.has(id)
}

const loadedSkillIdSet = computed(() => {
  const set = new Set()
  ;(Array.isArray(runtimeSkillObjects.value) ? runtimeSkillObjects.value : []).forEach((skill) => {
    const id = String(skill?._id || '').trim()
    if (id && isSkillPromptContentLoaded(skill)) set.add(id)
  })
  return set
})

async function loadSkillMainContent(skillId) {
  const id = String(skillId || '').trim()
  if (!id) return ''
  const skill = (skills.value || []).find((item) => item && item._id === id)
  if (!skill) throw new Error(`未找到技能：${id}`)
  const entryFile = String(skill?.entryFile || 'SKILL.md').trim() || 'SKILL.md'
  if (hasLoadedSkillMainContent(id, entryFile)) {
    return getLoadedSkillContent(id)
  }

  if (isDirectorySkill(skill)) {
    const result = await Promise.resolve(readSkillRegistryFile(id, entryFile))
    const content = String(result?.content || '').trim()
    loadedSkillContentById[id] = content
    const current = getLoadedSkillFilePathSet(id)
    current.add(String(result?.path || entryFile))
    loadedSkillFileCacheBySkillId[id] = Array.from(current)
    return content
  }

  const inlineContent = String(skill?.content || '').trim()
  loadedSkillContentById[id] = inlineContent
  loadedSkillFileCacheBySkillId[id] = ['SKILL.md']
  return inlineContent
}

watch(
  [selectedSkillObjects, activatedAgentSkillIds],
  () => {
    const activatedSet = activatedAgentSkillIdSet.value
    ;(Array.isArray(selectedSkillObjects.value) ? selectedSkillObjects.value : []).forEach((skill) => {
      const id = String(skill?._id || '').trim()
      if (!id || !isDirectorySkill(skill)) return
      if (!activatedSet.has(id)) return
      if (hasLoadedSkillMainContent(id, skill?.entryFile || 'SKILL.md')) return
      void loadSkillMainContent(id).catch((err) => {
        console.warn('Failed to load activated directory skill:', id, err)
      })
    })
  },
  { immediate: true, deep: true }
)

watch(
  input,
  () => {
    nextTick(() => refreshComposerInlinePickers())
  },
  { flush: 'post' }
)

watch(
  [agents, prompts, skills, mcpServers],
  () => {
    nextTick(() => refreshComposerInlinePickers())
  },
  { deep: true }
)

watch(inlineAgentSuggestions, (list) => {
  if (!list.length) {
    inlineAgentActiveIndex.value = 0
    return
  }
  if (inlineAgentActiveIndex.value >= list.length) {
    inlineAgentActiveIndex.value = 0
  }
})

watch(inlineCommandSuggestions, (list) => {
  if (!list.length) {
    inlineCommandActiveIndex.value = 0
    return
  }
  if (inlineCommandActiveIndex.value >= list.length || list[inlineCommandActiveIndex.value]?.disabled) {
    inlineCommandActiveIndex.value = getFirstEnabledInlineCommandIndex(list)
  }
})

function normalizeStringList(val) {
  if (!Array.isArray(val)) return []
  const out = []
  const seen = new Set()
  val.forEach((x) => {
    const s = String(x || '').trim()
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  })
  return out
}

function buildActiveRequestOverrides(options = {}) {
  const overrides = {
    ...buildRequestOverridesFromAgentModelParams(selectedAgentModelParams.value)
  }
  if (options.omitReasoningEffort) return overrides

  const reasoningEffort = String(thinkingEffort.value || '').trim().toLowerCase()
  if (reasoningEffort && reasoningEffort !== 'auto') {
    overrides.reasoning_effort = reasoningEffort
  }
  return overrides
}

async function autoActivateAgentSkillsFromText(textRaw) {
  if (
    routerActivatedAgentSkillIds.size ||
    routerAddedSelectedSkillIds.size ||
    routerAddedAgentSkillIds.size
  ) {
    activatedAgentSkillIds.value = normalizeStringList(activatedAgentSkillIds.value)
      .filter((id) => !routerActivatedAgentSkillIds.has(id))
    selectedSkillIds.value = normalizeStringList(selectedSkillIds.value)
      .filter((id) => !routerAddedSelectedSkillIds.has(id))
    agentSkillIds.value = normalizeStringList(agentSkillIds.value)
      .filter((id) => !routerAddedAgentSkillIds.has(id))
    routerActivatedAgentSkillIds.clear()
    routerAddedSelectedSkillIds.clear()
    routerAddedAgentSkillIds.clear()
  }
  if (!autoActivateAgentSkills.value) return []
  const raw = String(textRaw || '').trim()
  if (!raw) return []

  const capabilitySearchResult = await searchCapabilities({
    query: raw,
    limit: 12
  }).catch(() => null)
  const plan = buildAutoSkillActivationPlan({
    skills: skills.value,
    text: raw,
    selectedSkillIds: selectedSkillIds.value,
    agentSkillIds: agentSkillIds.value,
    activatedSkillIds: activatedAgentSkillIds.value,
    loadedSkillIds: loadedSkillIdSet.value,
    retrievalMatches: Array.isArray(capabilitySearchResult?.items)
      ? capabilitySearchResult.items
      : [],
    minimumScore: 2,
    limit: 2
  })
  const { candidates, picked } = plan
  if (!picked.length) return []

  plan.addedSelectedSkillIds.forEach((id) => routerAddedSelectedSkillIds.add(id))
  plan.addedAgentSkillIds.forEach((id) => routerAddedAgentSkillIds.add(id))
  picked.forEach((item) => routerActivatedAgentSkillIds.add(item.id))
  selectedSkillIds.value = plan.selectedSkillIds
  agentSkillIds.value = plan.agentSkillIds
  activatedAgentSkillIds.value = plan.activatedSkillIds
  await Promise.all(picked.map(async (x) => {
    const skill = candidates.find((item) => String(item?._id || '').trim() === x.id)
    if (!isDirectorySkill(skill)) return
    await loadSkillMainContent(x.id).catch((err) => {
      console.warn('Failed to auto-load directory skill:', x.id, err)
    })
  }))

  return picked
}

function markSkillActivationPersistent(skillIds = []) {
  normalizeStringList(skillIds).forEach((id) => {
    routerActivatedAgentSkillIds.delete(id)
    routerAddedSelectedSkillIds.delete(id)
    routerAddedAgentSkillIds.delete(id)
  })
}

const derivedMcpIds = computed(() => {
  return collectDerivedMcpIds(runtimeSkillObjects.value, {
    activeSkillIds: loadedSkillIdSet.value
  })
})

const activeMcpIds = computed(() => {
  const ids = new Set()
  ;(manualMcpIds.value || []).forEach((id) => ids.add(id))
  ;(derivedMcpIds.value || []).forEach((id) => ids.add(id))
  return Array.from(ids)
})

const activeMcpServers = computed(() => {
  const all = mcpServers.value || []
  return activeMcpIds.value.map((id) => all.find((s) => s._id === id)).filter(Boolean)
})

const runtimeMcpServers = computed(() => {
  if (!isDefaultGeneralAgent.value) return activeMcpServers.value
  return (mcpServers.value || []).filter((server) => server?._id && !server.disabled)
})

const activeMcpPromptCatalogKey = computed(() => {
  return (activeMcpServers.value || [])
    .filter((server) => server && server._id && !server.disabled)
    .map((server) => getMcpToolsCacheKey(server))
    .sort()
    .join('\n')
})

watch(
  activeMcpPromptCatalogKey,
  () => {
    const activeIds = new Set((activeMcpServers.value || []).map((server) => String(server?._id || '').trim()).filter(Boolean))
    mcpPromptCatalog.value = (mcpPromptCatalog.value || []).filter((item) => activeIds.has(String(item?.serverId || '').trim()))
    if (showPromptModal.value || (inlineCommandMode.value === 'item' && inlineCommandType.value === 'prompt')) {
      void ensureMcpPromptCatalogLoaded({ silent: true, forceRefresh: true })
    }
  },
  { flush: 'post' }
)

function makeLocalPromptOptionValue(promptId) {
  return `local:${String(promptId || '').trim()}`
}

function makeMcpPromptOptionValue(item = {}) {
  const serverId = encodeURIComponent(String(item.serverId || '').trim())
  const promptName = encodeURIComponent(String(item.name || '').trim())
  return `mcp:${serverId}:${promptName}`
}

function parsePromptOptionValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return { type: 'local', promptId: '' }
  if (raw.startsWith('local:')) return { type: 'local', promptId: raw.slice('local:'.length) }
  if (raw.startsWith('mcp:')) {
    const rest = raw.slice('mcp:'.length)
    const idx = rest.indexOf(':')
    if (idx >= 0) {
      return {
        type: 'mcp',
        serverId: decodeURIComponent(rest.slice(0, idx)),
        promptName: decodeURIComponent(rest.slice(idx + 1))
      }
    }
  }
  return { type: 'local', promptId: raw }
}

function findMcpPromptCatalogItem(serverId, promptName) {
  const sid = String(serverId || '').trim()
  const name = String(promptName || '').trim()
  if (!sid || !name) return null
  return (mcpPromptCatalog.value || []).find((item) => item?.serverId === sid && item?.name === name) || null
}

function findLocalPromptById(promptId) {
  const id = String(promptId || '').trim()
  if (!id) return null
  return (prompts.value || []).find((item) => item && item._id === id) || null
}

const selectedAgentHoverText = computed(() => {
  const agent = selectedAgent.value
  if (!agent || agent.builtin) return ''
  const provider = (providers.value || []).find((item) => item?._id === agent?.provider) || null
  const providerLabel = provider ? formatDisplayNameWithId(provider) : String(agent?.provider || '').trim() || '未配置'
  const modelLabel = String(agent?.model || '').trim() || '未配置'
  const skillNames = normalizeStringList(agent?.skills)
    .map((id) => (skills.value || []).find((s) => s?._id === id))
    .filter(Boolean)
    .map((skill) => formatDisplayNameWithId(skill))
  const mcpNames = normalizeStringList(agent?.mcp)
    .map((id) => (mcpServers.value || []).find((server) => server?._id === id))
    .filter(Boolean)
    .map((server) => formatDisplayNameWithId(server))

  return [
    `智能体：${formatDisplayNameWithId(agent)}`,
    `服务商：${providerLabel}`,
    `模型：${modelLabel}`,
    `技能（${skillNames.length}）：`,
    joinAsLines(skillNames),
    `MCP（${mcpNames.length}）：`,
    joinAsLines(mcpNames)
  ].join('\n')
})

const selectedSkillsHoverText = computed(() => {
  const list = Array.isArray(selectedSkillObjects.value) ? selectedSkillObjects.value : []
  const agentSet = agentSkillIdSet.value
  const activatedSet = activatedAgentSkillIdSet.value
  const lines = list.map((skill) => {
    const id = String(skill?._id || '').trim()
    const name = formatDisplayNameWithId(skill)
    if (!id) return name
    const flags = []
    if (routerActivatedAgentSkillIds.has(id)) {
      flags.push('按需启用')
    } else {
      if (agentSet.has(id)) flags.push('智能体技能')
      if (activatedSet.has(id)) flags.push('已启用')
    }
    if (isDirectorySkill(skill)) flags.push('目录')
    return flags.length ? `${name}（${flags.join(' / ')}）` : name
  })

  return [`已选技能：${list.length}`, joinAsLines(lines)].join('\n')
})

const activeMcpServersHoverText = computed(() => {
  const list = Array.isArray(activeMcpServers.value) ? activeMcpServers.value : []
  const manualSet = new Set(Array.isArray(manualMcpIds.value) ? manualMcpIds.value : [])
  const derivedSet = new Set(Array.isArray(derivedMcpIds.value) ? derivedMcpIds.value : [])
  const lines = list.map((server) => {
    const id = String(server?._id || '').trim()
    const name = formatDisplayNameWithId(server)
    const tags = []
    if (manualSet.has(id)) tags.push('手动')
    if (derivedSet.has(id)) tags.push('来自技能')
    if (server?.disabled) tags.push('已禁用')
    return tags.length ? `${name}（${tags.join(' / ')}）` : name
  })
  return [`已启用 MCP：${list.length}`, joinAsLines(lines)].join('\n')
})

const activeMcpToolsHoverText = computed(() => {
  const servers = (Array.isArray(activeMcpServers.value) ? activeMcpServers.value : []).filter((s) => s && s._id)
  if (!servers.length) return '当前没有已启用的 MCP 服务'

  const lines = servers.map((server) => {
    const label = formatDisplayNameWithId(server)
    if (server?.disabled) return `${label}：已禁用`

    const allow = Array.isArray(server?.allowTools)
      ? server.allowTools.map((x) => String(x || '').trim()).filter(Boolean)
      : []
    if (allow.length) {
      const preview = allow.slice(0, 6).join(', ')
      const suffix = allow.length > 6 ? ` ...（共 ${allow.length}）` : ''
      return `${label}：白名单 ${allow.length} 个（${preview}${suffix}）`
    }

    const status = mcpToolsStatusByServerId[String(server._id)] || null
    if (status?.loading) return `${label}：工具列表加载中`
    if (status?.lastError) return `${label}：读取失败（${status.lastError}）`
    if (typeof status?.toolCount === 'number' && status.updatedAt) return `${label}：${status.toolCount} 个工具`
    return `${label}：待加载`
  })

  return [`工具总数：${mcpToolCountText.value}`, joinAsLines(lines)].join('\n')
})

const activeKeepAliveMcpServerIds = computed(() => {
  return (activeMcpServers.value || [])
    .filter((s) => s && !s.disabled && s.keepAlive && s._id)
    .map((s) => s._id)
})

let lastKeepAliveMcpServerIds = new Set()
watch(
  activeKeepAliveMcpServerIds,
  (ids) => {
    const next = new Set(Array.isArray(ids) ? ids : [])
    for (const id of lastKeepAliveMcpServerIds) {
      if (!next.has(id)) closePooledMCPClient(id)
    }
    lastKeepAliveMcpServerIds = next
  },
  { immediate: true }
)

const activePromptLabel = computed(() => {
  if (basePromptMode.value === 'custom') return customSystemPrompt.value ? '临时' : ''
  if (!selectedPromptId.value) return ''
  const p = findLocalPromptById(selectedPromptId.value)
  if (!p || p.builtin || !isSystemPrompt(p)) return ''
  return p?.name || p?._id || 'Prompt'
})

const hasSelectedSystemPrompt = computed(() => hasActiveBasePromptSelection({
  basePromptMode: basePromptMode.value,
  selectedPromptId: selectedPromptId.value
}) && !!activePromptLabel.value)

const basePromptText = computed(() => {
  if (basePromptMode.value === 'custom') return String(customSystemPrompt.value || '').trim()
  if (!selectedPromptId.value) return ''
  const p = findLocalPromptById(selectedPromptId.value)
  if (!p || !isSystemPrompt(p)) return ''
  return String(p?.content || '').trim()
})

const agentPromptText = computed(() => {
  const promptId = String(selectedAgent.value?.prompt || '').trim()
  if (!promptId) return ''
  const prompt = findLocalPromptById(promptId)
  if (!prompt || !isSystemPrompt(prompt)) return ''
  const content = String(prompt.content || '').trim()
  if (!content || content === basePromptText.value) return ''
  return content
})

const skillsPromptText = computed(() => {
  return buildProgressiveSkillsPromptText({
    selectedSkills: runtimeSkillObjects.value,
    agentSkillIds: runtimeAgentSkillIds.value,
    loadedSkillIds: loadedSkillIdSet.value,
    mcpServers: mcpServers.value,
    getLoadedSkillContent
  })
})

const mcpToolCatalogPromptText = computed(() => {
  if (effectiveToolMode.value !== 'compact') return ''
  const servers = (Array.isArray(runtimeMcpServers.value) ? runtimeMcpServers.value : []).filter((s) => s && s._id && !s.disabled)
  if (!servers.length) return ''

  // 触发依赖，确保 catalog / pinned 更新后 system prompt 会刷新。
  void mcpToolCatalogRevision.value
  void mcpPinnedToolHintsRevision.value

  const allowInfo = (s) => {
    const allow = Array.isArray(s?.allowTools) ? s.allowTools.map((x) => String(x || '').trim()).filter(Boolean) : []
    return { allow_mode: allow.length ? 'whitelist' : 'all', allow_count: allow.length }
  }

  const payloadServers = servers
    .map((s) => {
      const id = String(s._id || '').trim()
      if (!id) return null
      const entry = mcpToolCatalogByServerId.get(id)
      const pinned = mcpPinnedToolHintsByServerId.get(id)
      const pinnedHints = Array.isArray(pinned)
        ? pinned
            .filter((x) => x && x.name)
            .slice(0, MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER)
        : []

      const identity = {
        server_id: id,
        server_name: s.name || id,
        description: String(s.description || '').trim() || undefined
      }
      const base = entry
        ? { ...identity, ...entry }
        : {
            ok: false,
            ...identity,
            keepAlive: !!s.keepAlive,
            ...allowInfo(s),
            error: 'not_loaded',
            updated_at: 0
          }
      if (!pinnedHints.length) return base
      return { ...base, pinned_tool_hints: pinnedHints }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.server_id || '').localeCompare(String(b.server_id || '')))

  const payload = {
    type: 'mcp_tool_catalog',
    mode: 'compact',
    servers: payloadServers,
    note: COMPACT_MCP_CATALOG_NOTE
  }

  const json = stableStringify(payload, 0)
  return ['## MCP 工具索引（会话缓存）', '```json', json, '```'].join('\n')
})

const toolModePromptText = computed(() => {
  if (effectiveToolMode.value !== 'compact') return ''
  if (!runtimeMcpServers.value?.length) return ''
  return COMPACT_MCP_TOOL_GUIDANCE_LINES.join('\n')
})

const webSearchPromptText = computed(() => {
  if (!webSearchEnabled.value) return ''
  return [
    '## 联网搜索',
    '- 当前会话已启用内置联网搜索工具：`web_search` 和 `web_read`。',
    '- 只在用户明确要求联网，或问题依赖最新/易变信息时使用：新闻、政策、价格、版本、赛事、人物任职、事实核验、公开资料查找等。',
    '- 稳定常识、当前对话/附件/代码/笔记即可回答的问题不要联网；不要为了确认常识而搜索。',
    '- `web_search` 用来找候选来源；搜索结果只是线索，不等同于原文证据。需要严肃核验、引用来源或细节较多时，继续用 `web_read` 阅读最相关、最权威的 1-3 个页面。',
    '- 对“今天是星期几 / 现在日期 / 简单汇率 / 天气”等单一实时事实，如果搜索结果已经给出明确答案，可以直接回答，不必再读原文。',
    '- 如果用户直接提供 URL 并要求分析、总结或核验网页内容，直接调用 `web_read`，不需要先搜索。',
    '- 工具结果来自本次运行的实时请求；对于“今天 / 当前 / 最新 / 现在 / 截至目前”等时效性问题，工具结果优先于模型内部知识。',
    '- 不要因为结果日期晚于模型知识截止时间，就怀疑、弱化、否定或回避工具结果。模型知识截止时间不是质疑本次联网结果真实性的理由。',
    '- 不要把用户的相对时间意图改写成具体历史年份。用户问“今天 / 当前 / 最新 / now / today / current / latest”时，必须保留该时间意图；除非用户明确指定年份，否则不要擅自添加 2025、2024 等年份。',
    '- 如果首轮搜索结果已经足以直接回答问题，就直接回答；不要仅因内部不确定性、知识截止时间或“想再次确认”而对同一问题反复搜索。',
    '- 只有在以下情况才允许补充搜索或改用 `web_read`：结果缺少明确答案、来源不清、多个结果明显冲突、时间戳缺失、用户明确要求核验原文。',
    '- 回答时优先使用本次联网结果中的明确时间、数值和来源；不要写“由于我的知识截至某年，所以该结果可能不准确”这类表述，除非来源本身确实可疑或相互冲突。',
    '- 使用联网资料时给出来源链接；如果搜索或读取失败，说明失败原因，并基于已有信息谨慎回答，不要无限重试。'
  ].join('\n')
})

const systemContent = computed(() => {
  const blocks = []
  if (basePromptText.value) blocks.push(basePromptText.value)
  if (agentPromptText.value) blocks.push(agentPromptText.value)
  if (skillsPromptText.value) blocks.push(skillsPromptText.value)
  if (webSearchPromptText.value) blocks.push(webSearchPromptText.value)
  if (toolModePromptText.value) blocks.push(toolModePromptText.value)
  if (mcpToolCatalogPromptText.value) blocks.push(mcpToolCatalogPromptText.value)
  return blocks.join('\n\n').trim()
})

function resolveSessionHostWorkspacePath(sessionRecord = null) {
  const fromState = normalizeSelectedHostWorkspacePath(
    sessionRecord?.state?.sandboxHostWorkspacePath
  )
  if (fromState) return fromState
  if (!sessionRecord || sessionRecord === session || isMemorySessionActive(sessionRecord)) {
    return normalizeSelectedHostWorkspacePath(sandboxHostWorkspacePath.value)
  }
  return ''
}

function buildHostWorkspacePrompt(sessionRecord = null) {
  const workspacePath = resolveSessionHostWorkspacePath(sessionRecord)
  if (!workspacePath) return ''
  return [
    '## 已连接的本机工作区',
    `- 用户已授权本机目录作为按需输入或交付目标：${workspacePath}`,
    '- 连接本机目录不会改变默认执行位置：聊天附件、临时脚本、中间产物和未指定目标的生成结果仍放在会话沙盒。',
    '- 只有用户明确要求读取或修改当前本机项目时，才对相应读写或命令使用 `workspace_scope: host`。',
    '- 用户明确要求把沙盒生成结果保存到当前本机工作区时，使用 `sandbox_export`；不要回读 Base64、切块或手工重写二进制文件。',
    '- 工具中的 `path`、`source_path`、`destination_path` 和 `cwd` 必须使用工作区内相对路径；不要填写或猜测绝对路径。',
    '- 本机写入会直接修改用户目录，执行前应保持改动范围与用户请求一致。'
  ].join('\n')
}

function buildCombinedSystemContent(memorySystemContent = '', options = {}) {
  const blocks = []
  if (systemContent.value) blocks.push(String(systemContent.value || '').trim())
  const summarySource =
    options.sessionRecord && typeof options.sessionRecord === 'object'
      ? options.sessionRecord
      : getActiveMemorySession()
  const workspacePrompt = buildHostWorkspacePrompt(summarySource)
  if (workspacePrompt) blocks.push(workspacePrompt)
  const summaryText = String(summarySource?.contextSummary?.summaryText || '').trim()
  if (summaryText) {
    blocks.push(buildContextSummaryPrelude(summaryText))
  }
  if (memorySystemContent) {
    blocks.push([
      '以下是从历史对话中提炼出的长期记忆，仅在与当前问题相关时参考：',
      '如果用户在询问自己的姓名、称呼、身份、偏好、语言、项目背景或回答习惯，而下面存在对应记忆，请优先直接依据记忆回答，不要忽略，也不要回答“不知道”。',
      String(memorySystemContent || '').trim(),
      '如果当前用户要求与你的长期记忆冲突，以用户当前明确要求为准。'
    ].join('\n'))
  }
  return blocks.filter(Boolean).join('\n\n').trim()
}

function shouldIncludeSystemPromptForMediaGeneration() {
  if (basePromptMode.value === 'prompt') return hasSelectedSystemPrompt.value
  return customSystemPromptExplicit.value && !!normalizePromptText(customSystemPrompt.value)
}

function getMediaGenerationSystemContent() {
  return shouldIncludeSystemPromptForMediaGeneration() ? String(systemContent.value || '').trim() : ''
}

 const modelButtonText = computed(() => {
  const providerName = selectedProvider.value?.name || selectedProvider.value?._id || ''
  if (providerName && selectedModel.value) return `${providerName} / ${selectedModel.value}`
  if (providerName) return providerName
  if (selectedModel.value) return selectedModel.value
  return '模型设置'
})

const modelTooltipText = computed(() => {
  const t = String(modelButtonText.value || '').trim()
  if (!t || t === '模型设置') return '模型设置'
  return `模型：${t}`
})

 const defaultModelText = computed(() => {
  const pid = String(chatConfig.value?.defaultProviderId || '').trim()
  const m = String(chatConfig.value?.defaultModel || '').trim()
  if (!pid || !m) return ''
  const providerName = (providers.value || []).find((p) => p._id === pid)?.name || pid
  return `${providerName} / ${m}`
})

function isDefaultModel(providerId, model) {
  const pid = String(providerId || '')
  const m = String(model || '')
  return pid === String(chatConfig.value?.defaultProviderId || '') && m === String(chatConfig.value?.defaultModel || '')
}

async function toggleDefaultModel(providerId, model) {
  const pid = String(providerId || '').trim()
  const m = String(model || '').trim()
  if (!pid || !m) return

  const same = isDefaultModel(pid, m)

  try {
    if (typeof updateChatConfig !== 'function') {
      message.warning('当前环境不支持保存默认模型')
      return
    }

    if (same) {
      await updateChatConfig({ defaultProviderId: '', defaultModel: '' })
      message.success('已清除默认模型')
    } else {
      await updateChatConfig({ defaultProviderId: pid, defaultModel: m })
      message.success('已设为默认模型')
    }
  } catch (err) {
    message.error('保存默认模型失败：' + (err?.message || String(err)))
  }
}

function openBuiltinProviderSettingsFromChat() {
  if (openUtoolsAiModelsSetting()) return
  message.warning('当前环境不支持打开 uTools AI 模型设置')
}

async function refreshBuiltinProviderModelsInChat(showSuccess = false) {
  try {
    const list = await refreshUtoolsAiModels({ force: true })
    if (showSuccess) {
      message.success(`已同步 ${Array.isArray(list) ? list.length : 0} 个 uTools AI 模型`)
    }
  } catch (err) {
    message.error('同步 uTools AI 模型失败：' + (err?.message || String(err)))
  }
}

const systemButtonText = computed(() => {
  if (basePromptMode.value === 'custom') {
    const current = normalizePromptText(customSystemPrompt.value)
    if (!current) return '系统：空'
    const globalDefault = normalizePromptText(chatConfig.value?.defaultSystemPrompt || '')
    if (globalDefault && current === globalDefault) return '系统：默认'
    return '系统：临时'
  }
  if (!selectedPromptId.value) return '系统：无'
  if (!activePromptLabel.value) return '系统：无'
  return `提示词：${activePromptLabel.value}`
})

const systemTooltipText = computed(() => {
  const raw = String(systemButtonText.value || '').trim()
  if (!raw) return '系统提示词'
  let label = raw
  if (label.startsWith('系统：')) label = label.slice('系统：'.length)
  if (label.startsWith('提示词：')) label = label.slice('提示词：'.length)
  return label ? `系统提示词：${label}` : '系统提示词'
})

const basePromptSourceText = computed(() => {
  if (basePromptMode.value === 'custom') {
    const current = normalizePromptText(customSystemPrompt.value)
    if (!current) return '自定义（空）'
    const globalDefault = normalizePromptText(chatConfig.value?.defaultSystemPrompt || '')
    if (globalDefault && current === globalDefault) return '默认值（全局设置）'
    return '临时自定义'
  }
  if (!selectedPromptId.value) return '无'
  const p = findLocalPromptById(selectedPromptId.value)
  if (!p || !isSystemPrompt(p)) return '无'
  return `提示词：${p?.name || p?._id || selectedPromptId.value}`
})

const headerHint = computed(() => {
  if (!providers.value?.length) return '还没有可用服务商，请先到 设置 -> 服务商 中添加。'
  if (!selectedProvider.value) return '请先在顶部模型设置中选择服务商和模型。'
  if (!selectedProvider.value.baseurl) return '当前服务商的基础地址为空。'
  if (!selectedProvider.value.apikey) return '当前服务商的 API Key 为空。'
  if (!selectedModel.value) return '当前模型为空，请先在顶部模型设置中选择。'
  return ''
})

const effectiveHeaderHint = computed(() => {
  if (!selectedProvider.value || !isUtoolsBuiltinProvider(selectedProvider.value)) {
    return headerHint.value
  }

  if (!selectedProvider.value.selectModels?.length) {
    return 'uTools AI 暂无可用模型，请先到 uTools AI 设置中启用。'
  }

  if (!selectedModel.value) {
    return '当前模型为空，请先在顶部模型设置中选择。'
  }

  if (pendingImageAttachments.value.length) {
    return 'uTools AI 聊天不会直接读取图片像素，上传图片只会作为元数据发送；图片/视频生成请切换到 OpenAI 兼容服务商。'
  }

  return ''
})

const toolModeDisplayText = computed(() => {
  const desired = String(toolMode.value || 'auto')
  const effective = String(effectiveToolMode.value || 'expanded')
  const effectiveLabel = effective === 'compact' ? '精简' : '展开'
  if (desired === 'compact') return '精简'
  if (desired === 'expanded') return '展开'
  return `自动/${effectiveLabel}`
})

const mcpToolCountText = computed(() => {
  const servers = (activeMcpServers.value || []).filter((s) => s && !s.disabled && s._id)
  if (!servers.length) return '0'

  let count = 0
  let unknown = false

  servers.forEach((s) => {
    const allow = Array.isArray(s.allowTools) ? s.allowTools.map((x) => String(x || '').trim()).filter(Boolean) : []
    if (allow.length) {
      count += allow.length
      return
    }

    const st = mcpToolsStatusByServerId[String(s._id)]
    const toolCount = typeof st?.toolCount === 'number' ? st.toolCount : 0
    if (toolCount > 0) count += toolCount
    else unknown = true
  })

  if (!unknown) return String(count)
  return count ? `${count}+?` : '?'
})

function countUserTurns(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((total, item) => {
    return item?.role === 'user' ? total + 1 : total
  }, 0)
}

const contextWindowPresetLabel = computed(() => {
  const preset = String(contextWindowConfig.value?.preset || 'balanced')
  if (preset === 'custom') return '自定义'
  return CHAT_CONTEXT_WINDOW_PRESETS[preset]?.label || '平衡'
})

const contextWindowHistoryFocusLabel = computed(() => {
  const historyFocus = String(contextWindowConfig.value?.historyFocus || 'balanced')
  return CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS[historyFocus]?.label || '平衡'
})

const contextWindowDraftHistoryFocusHint = computed(() => {
  const historyFocus = String(contextWindowDraft.historyFocus || 'balanced')
  if (historyFocus === 'recent') {
    return '优先保留最近连续轮次，不回补更早的附件。'
  }
  if (historyFocus === 'attachments') {
    return '优先保留附件历史。为了保住附件上下文，较早的纯文本轮次可能会被移除。'
  }
  return '平衡最近对话与更早的附件历史。'
})

const contextWindowHistoryFocusBehaviorText = computed(() => {
  const historyFocus = String(contextWindowConfig.value?.historyFocus || 'balanced')
  if (historyFocus === 'recent') return '当前偏好：优先最近轮次；不会回补更早的附件。'
  if (historyFocus === 'attachments') return '当前偏好：优先附件历史；较早的纯文本轮次可能让位。'
  return '当前偏好：平衡最近对话与更早的附件摘要。'
})

const globalContextWindowConfig = computed(() => normalizeChatContextWindowConfig(chatConfig.value?.contextWindow))
const effectiveContextWindowConfig = computed(() => {
  return sessionContextWindowOverride.value
    ? normalizeChatContextWindowConfig(sessionContextWindowOverride.value)
    : globalContextWindowConfig.value
})
const contextWindowConfig = computed(() => effectiveContextWindowConfig.value)
const contextWindowResolvedOptions = computed(() => resolveChatContextWindowOptions(effectiveContextWindowConfig.value))

function getContextTokenTelemetry(record = null) {
  const target = record && typeof record === 'object' ? record : getActiveMemorySession()
  const telemetry = normalizeContextTokenTelemetry(target?.contextTokenTelemetry)
  const useActiveSelection = isMemorySessionActive(target)
  const expectedProviderId = String(
    useActiveSelection ? selectedProviderId.value : target?.state?.selectedProviderId || ''
  ).trim()
  const expectedModel = String(
    useActiveSelection ? selectedModel.value : target?.state?.selectedModel || ''
  ).trim()
  if (
    (telemetry.providerId && expectedProviderId && telemetry.providerId !== expectedProviderId) ||
    (telemetry.model && expectedModel && telemetry.model !== expectedModel)
  ) {
    return createEmptyContextTokenTelemetry()
  }
  return telemetry
}

function extractDirectoryDialogPath(result) {
  const candidate = Array.isArray(result)
    ? result[0]
    : Array.isArray(result?.filePaths)
      ? result.filePaths[0]
      : result
  if (typeof candidate === 'string') return candidate.trim()
  return String(
    candidate?.path ||
    candidate?.filePath ||
    candidate?.fullPath ||
    candidate?.value ||
    ''
  ).trim()
}

function normalizeSelectedHostWorkspacePath(value) {
  const raw = String(value || '').trim()
  if (/^[a-zA-Z]:[\\/]$/.test(raw) || raw === '/' || raw === '\\') return raw
  return raw.replace(/[\\/]+$/, '')
}

async function chooseSandboxHostWorkspace() {
  if (sending.value || preparingSend.value) {
    message.warning('请等待当前回复结束后再更换工作区')
    return
  }
  const api = window?.utools || globalThis?.utools
  if (typeof api?.showOpenDialog !== 'function') {
    message.error('当前环境不支持目录选择')
    return
  }

  try {
    const selected = extractDirectoryDialogPath(await Promise.resolve(api.showOpenDialog({
      title: '连接本机工作区',
      buttonLabel: '连接此目录',
      properties: ['openDirectory']
    })))
    const nextPath = normalizeSelectedHostWorkspacePath(selected)
    if (!nextPath) return
    sandboxHostWorkspacePath.value = nextPath
    const record = saveActiveMemorySessionDraft()
    void autoPersistMemorySessionWhenIdle(record)
    message.success('已连接本机工作区；默认仍使用会话沙盒，明确读取或保存时才访问该目录')
  } catch (error) {
    message.error(`选择工作区失败：${error?.message || String(error)}`)
  }
}

function clearSandboxHostWorkspace() {
  if (sending.value || preparingSend.value) {
    message.warning('请等待当前回复结束后再更换工作区')
    return
  }
  if (!sandboxHostWorkspacePath.value) return
  sandboxHostWorkspacePath.value = ''
  const record = saveActiveMemorySessionDraft()
  void autoPersistMemorySessionWhenIdle(record)
  message.info('已断开本机工作区；继续使用默认会话沙盒')
}

function resolveContextEstimateSource(record, rawMessages) {
  const list = Array.isArray(rawMessages) ? rawMessages : []
  const summaryText = String(record?.contextSummary?.summaryText || '').trim()
  const coveredMessageCount = Math.max(0, Math.floor(Number(record?.contextSummary?.coveredMessageCount || 0)))
  if (!summaryText || coveredMessageCount < 1 || coveredMessageCount > list.length) {
    return {
      messages: list,
      summaryReservedChars: 0
    }
  }
  return {
    messages: list.slice(coveredMessageCount),
    summaryReservedChars: buildContextSummaryPrelude(summaryText).length
  }
}

const contextWindowBudgetPlan = computed(() => {
  const providerKind = isUtoolsBuiltinProvider(selectedProvider.value) ? 'utools-ai' : 'openai-compatible'
  const currentToolsKey = getCurrentToolsKey()
  const toolEstimateFresh =
    !!lastBuiltRequestToolsStats.updatedAt && String(lastBuiltRequestToolsStats.key || '') === currentToolsKey
  const toolSchemaChars = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.chars || 0) : 0
  const activeRecord = getActiveMemorySession()
  const rawMessages = Array.isArray(session.apiMessages) ? session.apiMessages : []
  const estimateSource = resolveContextEstimateSource(activeRecord, rawMessages)
  const systemChars = String(systemContent.value || '').length + estimateSource.summaryReservedChars
  const reservedChars = systemChars + toolSchemaChars
  const sourceChars = estimateMessagesSize(estimateSource.messages)
  const tokenTelemetry = getContextTokenTelemetry()
  const basePlan = resolveChatContextWindowBudgetPlan(effectiveContextWindowConfig.value, {
    reservedChars,
    sourceChars,
    reportedInputTokens: tokenTelemetry.inputTokens,
    reportedRequestChars: tokenTelemetry.requestChars
  })
  return {
    ...basePlan,
    providerKind,
    toolSchemaChars,
    toolEstimateFresh,
    systemChars,
    currentToolsKey,
    effectiveToolMode: basePlan.mode
  }
})

const contextWindowPreviewConfig = computed(() => {
  const raw = showContextWindowModal.value ? contextWindowDraft : effectiveContextWindowConfig.value
  return resolveChatContextWindowOptions(normalizeChatContextWindowConfig(raw))
})

function createEmptyContextWindowInspection() {
  return {
    messages: [],
    inspection: {
      entries: [],
      omittedEntries: [],
      messageCount: 0,
      turnCount: 0,
      preludeCount: 0
    }
  }
}

function buildContextWindowStats({ includeRequestDetails = false } = {}) {
  const rawMessages = Array.isArray(session.apiMessages) ? session.apiMessages : []
  const activeRecord = getActiveMemorySession()
  const estimateSource = resolveContextEstimateSource(activeRecord, rawMessages)
  const providerKind = isUtoolsBuiltinProvider(selectedProvider.value) ? 'utools-ai' : 'openai-compatible'
  const currentToolsKey = getCurrentToolsKey()
  const toolEstimateFresh =
    !!lastBuiltRequestToolsStats.updatedAt && String(lastBuiltRequestToolsStats.key || '') === currentToolsKey
  const toolCount = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.count || 0) : 0
  const toolSchemaChars = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.chars || 0) : 0
  const systemChars = String(systemContent.value || '').length + estimateSource.summaryReservedChars
  const reservedChars = systemChars + toolSchemaChars
  const sourceChars = estimateMessagesSize(estimateSource.messages)
  const tokenTelemetry = getContextTokenTelemetry()
  const budgetPlan = resolveChatContextWindowBudgetPlan(effectiveContextWindowConfig.value, {
    reservedChars,
    sourceChars,
    reportedInputTokens: tokenTelemetry.inputTokens,
    reportedRequestChars: tokenTelemetry.requestChars
  })
  const historyBudgetChars = budgetPlan.historyCharsBudget
  const rawAttachmentCount = countChatContextAttachmentMessages(rawMessages)
  const lightRawTurns = countUserTurns(rawMessages)

  if (!includeRequestDetails) {
    return {
      providerKind,
      rawCount: rawMessages.length,
      rawTurns: lightRawTurns,
      rawAttachmentCount,
      requestCount: estimateSource.messages.length,
      requestTurns: countUserTurns(estimateSource.messages),
      requestAttachmentCount: rawAttachmentCount,
      attachmentSummaryCount: 0,
      baseChars: budgetPlan.baseChars,
      baseTokens: budgetPlan.baseTokens,
      totalEstimatedTokens: budgetPlan.totalEstimatedTokens,
      totalEstimatedChars: budgetPlan.totalEstimatedChars,
      reportedInputTokens: budgetPlan.reportedInputTokens,
      telemetryAvailable: budgetPlan.telemetryAvailable,
      budgetUnit: budgetPlan.budgetUnit,
      expandedChars: budgetPlan.expandedChars,
      compactChars: budgetPlan.compactChars,
      autoCompactTriggerPercent: budgetPlan.autoCompactTriggerPercent,
      autoCompactActive: budgetPlan.autoCompactActive,
      effectiveContextMode: budgetPlan.mode,
      systemChars,
      toolCount,
      toolSchemaChars,
      reservedChars,
      historyBudgetChars,
      toolEstimateFresh
    }
  }

  const requestMessages = buildRequestApiMessages(providerKind, {
    reservedCharsOverride: reservedChars,
    sessionRecord: getActiveMemorySession()
  })
  const requestAttachmentCount = countChatContextAttachmentMessages(requestMessages)
  const attachmentSummaryCount = countChatContextAttachmentSummaryMessages(requestMessages)

  return {
    providerKind,
    rawCount: rawMessages.length,
    rawTurns: lightRawTurns,
    rawAttachmentCount,
    requestCount: requestMessages.length,
    requestTurns: countUserTurns(requestMessages),
    requestAttachmentCount,
    attachmentSummaryCount,
    baseChars: budgetPlan.baseChars,
    baseTokens: budgetPlan.baseTokens,
    totalEstimatedTokens: budgetPlan.totalEstimatedTokens,
    totalEstimatedChars: budgetPlan.totalEstimatedChars,
    reportedInputTokens: budgetPlan.reportedInputTokens,
    telemetryAvailable: budgetPlan.telemetryAvailable,
    budgetUnit: budgetPlan.budgetUnit,
    expandedChars: budgetPlan.expandedChars,
    compactChars: budgetPlan.compactChars,
    autoCompactTriggerPercent: budgetPlan.autoCompactTriggerPercent,
    autoCompactActive: budgetPlan.autoCompactActive,
    effectiveContextMode: budgetPlan.mode,
    systemChars,
    toolCount,
    toolSchemaChars,
    reservedChars,
    historyBudgetChars,
    toolEstimateFresh
  }
}

function buildContextWindowPreviewSourceSignature() {
  const messageSignature = (session.apiMessages || [])
    .map((msg) => [
      msg?.role || '',
      String(msg?.id || ''),
      String(msg?.content || '').length,
      Array.isArray(msg?.content) ? msg.content.length : 0
    ].join(':'))
    .join('|')
  return [
    messageSignature,
    String(selectedProviderId.value || ''),
    String(selectedModel.value || ''),
    String(systemContent.value || '').length,
    String(contextWindowBudgetPlan.value?.effectiveToolMode || effectiveToolMode.value || ''),
    String(contextWindowBudgetPlan.value?.reportedInputTokens || 0),
    String(contextWindowBudgetPlan.value?.reportedRequestChars || 0),
    JSON.stringify(contextWindowPreviewConfig.value || {}),
    getCurrentToolsKey()
  ].join('||')
}

const contextWindowStatsCache = ref(buildContextWindowStats({ includeRequestDetails: false }))
const contextWindowPreviewState = ref(createEmptyContextWindowInspection())

watch(
  () => (showContextWindowModal.value ? buildContextWindowPreviewSourceSignature() : 'hidden'),
  () => {
    if (!showContextWindowModal.value) return
    contextWindowStatsCache.value = buildContextWindowStats({ includeRequestDetails: true })

    const rawMessages = Array.isArray(session.apiMessages) ? session.apiMessages : []
    if (!rawMessages.length) {
      contextWindowPreviewState.value = createEmptyContextWindowInspection()
      return
    }

    const providerKind = isUtoolsBuiltinProvider(selectedProvider.value) ? 'utools-ai' : 'openai-compatible'
    const previewConfig = contextWindowPreviewConfig.value
    const toolEstimateFresh =
      !!lastBuiltRequestToolsStats.updatedAt && String(lastBuiltRequestToolsStats.key || '') === String(getCurrentToolsKey() || '')
    const toolSchemaChars = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.chars || 0) : 0
    const reservedChars = String(systemContent.value || '').length + toolSchemaChars
    const tokenTelemetry = getContextTokenTelemetry()
    const budgetPlan = resolveChatContextWindowBudgetPlan(previewConfig, {
      reservedChars,
      sourceChars: estimateMessagesSize(rawMessages),
      reportedInputTokens: tokenTelemetry.inputTokens,
      reportedRequestChars: tokenTelemetry.requestChars
    })

    contextWindowPreviewState.value = inspectChatContextWindow(
      rawMessages,
      buildChatContextWindowRuntimeOptions(previewConfig, {
        providerKind,
        maxChars: budgetPlan.historyCharsBudget
      })
    )
  },
  { immediate: true }
)

watch(
  () => showContextWindowModal.value,
  (visible) => {
    if (visible) return
    contextWindowPreviewState.value = createEmptyContextWindowInspection()
    contextWindowStatsCache.value = buildContextWindowStats({ includeRequestDetails: false })
  }
)

const contextWindowStats = computed(() =>
  showContextWindowModal.value
    ? contextWindowStatsCache.value
    : buildContextWindowStats({ includeRequestDetails: false })
)

const contextWindowSummaryTag = computed(() => {
  const stats = contextWindowStats.value
  if (stats.telemetryAvailable) {
    return `上下文 ${formatApproxChars(stats.totalEstimatedTokens)} / ${formatApproxChars(stats.baseTokens)} Token`
  }
  return `上下文 ${formatApproxChars(stats.totalEstimatedChars)} / ${formatApproxChars(stats.baseChars)} 字符`
})

const contextWindowSummaryText = computed(() => {
  const stats = contextWindowStats.value
  const modeText = effectiveToolMode.value === 'compact' ? '精简工具模式' : '展开工具模式'
  const budgetText = stats.telemetryAvailable
    ? `上下文预算以最近一次真实输入 ${formatApproxChars(stats.reportedInputTokens)} Token 校准；当前预计 ${formatApproxChars(stats.totalEstimatedTokens)}/${formatApproxChars(stats.baseTokens)} Token。`
    : `当前端点尚未返回可用的输入 Token，暂按 ${formatApproxChars(stats.totalEstimatedChars)}/${formatApproxChars(stats.baseChars)} 字符预算估算。`
  const toolBudgetText = stats.toolEstimateFresh
    ? `工具定义预留：约 ${formatApproxChars(stats.toolSchemaChars)}，共 ${stats.toolCount} 个工具。`
    : '工具定义预留会在首次构建请求工具后显示。'
  const attachmentText = stats.rawAttachmentCount
    ? `附件轮次保留：${stats.requestAttachmentCount}/${stats.rawAttachmentCount}，其中摘要 ${stats.attachmentSummaryCount} 条。`
    : '当前历史里没有附件轮次。'
  return `${contextWindowPresetLabel.value} / ${contextWindowHistoryFocusLabel.value}；本次预计发送 ${stats.requestTurns}/${stats.rawTurns || 0} 轮、${stats.requestCount}/${stats.rawCount || 0} 条消息（${modeText}）。${budgetText} 系统提示词约占 ${formatApproxChars(stats.systemChars)} 字符。${attachmentText}${toolBudgetText}`
})

const contextWindowProviderHint = computed(() => {
  const stats = contextWindowStats.value
  const toolEstimateHint = stats.toolEstimateFresh
    ? `最近一次工具定义大小约为 ${formatApproxChars(stats.toolSchemaChars)}。`
    : '工具定义大小会在首次请求构建工具后显示。'
  const attachmentHint = stats.rawAttachmentCount
    ? stats.attachmentSummaryCount
      ? `附件轮次保留 ${stats.requestAttachmentCount}/${stats.rawAttachmentCount}；其中 ${stats.attachmentSummaryCount} 条较早内容会压缩成摘要。`
      : `附件轮次保留 ${stats.requestAttachmentCount}/${stats.rawAttachmentCount}；当前仍全部按完整轮次保留。`
    : ''
  if (isUtoolsBuiltinProvider(selectedProvider.value)) {
    return `${contextWindowHistoryFocusBehaviorText.value}uTools AI 路径会自动去掉历史 tool/tool_calls，只保留纯文本的用户与助手记录。${attachmentHint}${toolEstimateHint}`
  }
  return `${contextWindowHistoryFocusBehaviorText.value}OpenAI 兼容路径会保留最近工具链，较老的工具轮次会自动压缩，避免无效上下文挤占窗口。${attachmentHint}${toolEstimateHint}`
})

const contextWindowPreviewInspection = computed(() =>
  showContextWindowModal.value ? contextWindowPreviewState.value : createEmptyContextWindowInspection()
)

const contextWindowPreviewEntries = computed(() => {
  return Array.isArray(contextWindowPreviewInspection.value?.inspection?.entries)
    ? contextWindowPreviewInspection.value.inspection.entries
    : []
})

const contextWindowPreviewOmittedEntries = computed(() => {
  return Array.isArray(contextWindowPreviewInspection.value?.inspection?.omittedEntries)
    ? contextWindowPreviewInspection.value.inspection.omittedEntries
    : []
})

const contextWindowPreviewBudgetStats = computed(() => {
  const inspection = contextWindowPreviewInspection.value?.inspection
  const entries = contextWindowPreviewEntries.value
  const previewConfig = contextWindowPreviewConfig.value
  const providerKind = isUtoolsBuiltinProvider(selectedProvider.value) ? 'utools-ai' : 'openai-compatible'
  const currentToolsKey = getCurrentToolsKey()
  const toolEstimateFresh =
    !!lastBuiltRequestToolsStats.updatedAt && String(lastBuiltRequestToolsStats.key || '') === currentToolsKey
  const toolSchemaChars = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.chars || 0) : 0
  const toolCount = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.count || 0) : 0
  const systemChars = String(systemContent.value || '').length
  const reservedChars = systemChars + toolSchemaChars
  const rawMessages = Array.isArray(session.apiMessages) ? session.apiMessages : []
  const tokenTelemetry = getContextTokenTelemetry()
  const budgetPlan = resolveChatContextWindowBudgetPlan(previewConfig, {
    reservedChars,
    sourceChars: estimateMessagesSize(rawMessages),
    reportedInputTokens: tokenTelemetry.inputTokens,
    reportedRequestChars: tokenTelemetry.requestChars
  })
  const historyCharsUsed = entries.reduce((total, entry) => total + Number(entry?.chars || 0), 0)
  const requestEstimatedTokens = budgetPlan.telemetryAvailable
    ? Math.max(0, Math.ceil((historyCharsUsed + reservedChars) * budgetPlan.tokensPerChar))
    : 0

  return {
    turnBudget: providerKind === 'utools-ai' ? Math.min(32, previewConfig.maxTurns + 2) : previewConfig.maxTurns,
    turnUsed: entries.filter((entry) => entry?.kind === 'turn').length,
    messageBudget: previewConfig.maxMessages,
    messageUsed: Number(inspection?.messageCount || 0),
    historyCharsBudget: budgetPlan.historyCharsBudget,
    historyCharsUsed,
    baseChars: budgetPlan.baseChars,
    baseTokens: budgetPlan.baseTokens,
    requestEstimatedTokens,
    telemetryAvailable: budgetPlan.telemetryAvailable,
    reservedChars,
    systemChars,
    toolSchemaChars,
    toolCount,
    toolEstimateFresh
  }
})

const contextWindowPreviewBudgetItems = computed(() => {
  const stats = contextWindowPreviewBudgetStats.value
  const primaryBudgetItem = stats.telemetryAvailable
    ? buildContextWindowBudgetItem({
        key: 'input_tokens',
        label: '上下文 Token',
        used: stats.requestEstimatedTokens,
        max: stats.baseTokens,
        formatter: formatApproxChars,
        hint: '依据最近一次接口返回的输入 Token 与请求体大小校准，展示本次预计输入。'
      })
    : buildContextWindowBudgetItem({
        key: 'history_chars',
        label: '历史字符',
        used: stats.historyCharsUsed,
        max: stats.historyCharsBudget,
        formatter: formatApproxChars,
        hint: '端点尚未返回输入 Token，当前使用字符预算兜底。'
      })
  return [
    buildContextWindowBudgetItem({
      key: 'turns',
      label: '轮次预算',
      used: stats.turnUsed,
      max: stats.turnBudget,
      hint: '这里只统计真实用户轮次；附件回补摘要不占用轮次预算。'
    }),
    buildContextWindowBudgetItem({
      key: 'messages',
      label: '消息预算',
      used: stats.messageUsed,
      max: stats.messageBudget,
      hint: '消息数直接受 maxMessages 限制，压缩后通常会下降。'
    }),
    primaryBudgetItem,
    buildContextWindowBudgetItem({
      key: 'reserved_chars',
      label: '预留开销',
      used: stats.reservedChars,
      max: stats.baseChars,
      formatter: formatApproxChars,
      hint: stats.toolEstimateFresh
        ? `系统提示词约占 ${formatApproxChars(stats.systemChars)}；工具定义约占 ${formatApproxChars(stats.toolSchemaChars)}。`
        : `系统提示词约占 ${formatApproxChars(stats.systemChars)}；工具定义大小会在构建后计入。`
    })
  ]
})

const contextWindowPreviewBudgetSummaryText = computed(() => {
  const stats = contextWindowPreviewBudgetStats.value
  if (stats.telemetryAvailable) {
    const usageText = `${formatApproxChars(stats.requestEstimatedTokens)} / ${formatApproxChars(stats.baseTokens)} Token`
    if (!stats.messageUsed) return `当前还没有可发送的历史；预计输入 ${usageText}。`
    return `本次预计输入 ${usageText}；预算已按最近一次真实 usage 校准。`
  }
  const historyUsageText = `${formatApproxChars(stats.historyCharsUsed)} / ${formatApproxChars(stats.historyCharsBudget)}`
  const reservedText = `${formatApproxChars(stats.reservedChars)} / ${formatApproxChars(stats.baseChars)}`
  if (!stats.messageUsed) {
    return `当前还没有可发送的历史；已预留预算 ${reservedText}。`
  }
  return `历史字符 ${historyUsageText}；已预留预算 ${reservedText}。`
})

const contextWindowBudgetStatus = computed(() => {
  const items = contextWindowPreviewBudgetItems.value
  const omittedEntries = contextWindowPreviewOmittedEntries.value
  const hardBudgetTrim = omittedEntries.some((entry) => hasContextWindowHardBudgetReason(entry?.reasons))
  const softBudgetTrim = omittedEntries.some((entry) => hasContextWindowSoftBudgetReason(entry?.reasons))
  const pressureItems = items.filter((item) => item.ratio >= 0.8)
  const strongestRatio = items.reduce((max, item) => Math.max(max, Number(item?.ratio || 0)), 0)
  const driverText = pressureItems
    .slice(0, 2)
    .map((item) => `${item.label} ${item.usedLabel}/${item.maxLabel}`)
    .join(', ')

  if (hardBudgetTrim || strongestRatio >= 0.98) {
    const lead = driverText ? `预算已满：${driverText}。` : '预算已满。'
    return {
      level: 'critical',
      tagType: 'error',
      tagSuffix: '预算已满',
      text: `${lead}继续增加内容会直接裁掉更早的历史。`,
      tooltip: hardBudgetTrim
        ? `${lead}由于轮次、消息数或字符预算限制，已有部分历史被裁掉。`
        : `${lead}当前上下文窗口几乎没有剩余空间。`
    }
  }

  if (softBudgetTrim || strongestRatio >= 0.8) {
    const lead = driverText ? `预算偏紧：${driverText}。` : '预算偏紧。'
    return {
      level: 'warning',
      tagType: 'warning',
      tagSuffix: '预算紧张',
      text: `${lead}继续增加内容可能会压缩或裁掉更早的历史。`,
      tooltip: softBudgetTrim
        ? `${lead}由于预算压力，部分较早的前导消息或历史已经被排除。`
        : `${lead}如果继续增加内容，最早的轮次会优先被压缩。`
    }
  }

  return {
    level: 'safe',
    tagType: 'default',
    tagSuffix: '',
    text: '',
    tooltip: '当前上下文窗口仍有可用预算。'
  }
})

const contextWindowSummaryTagType = computed(() => {
  const pressure = Number(contextWindowBudgetPlan.value?.effectivePressure || 0)
  if (pressure >= 0.98) return 'error'
  if (pressure >= 0.8) return 'warning'
  return undefined
})
const contextWindowSummaryTooltipText = computed(() => {
  const budgetTooltip = String(contextWindowBudgetStatus.value?.tooltip || '').trim()
  if (!budgetTooltip) return contextWindowSummaryText.value
  return `${contextWindowSummaryText.value} ${budgetTooltip}`.trim()
})

const activeMemorySessionContextSummary = computed(() => {
  const activeRecord = getMemorySessionById(activeMemorySessionId.value)
  return activeRecord && typeof activeRecord.contextSummary === 'object' ? activeRecord.contextSummary : null
})

const contextWindowCompressedSummaryText = computed(() => String(activeMemorySessionContextSummary.value?.summaryText || '').trim())
const contextWindowCompressedSummaryMetaText = computed(() => {
  const summary = activeMemorySessionContextSummary.value
  const turnCount = Math.max(0, Math.floor(Number(summary?.coveredTurnCount || 0)))
  const messageCount = Math.max(0, Math.floor(Number(summary?.coveredMessageCount || 0)))
  const summaryLevel = Math.max(0, Math.floor(Number(summary?.summaryLevel || 0)))
  const resolvedSummaryLevel = summaryLevel > 0 && Number.isFinite(summaryLevel)
    ? summaryLevel
    : (contextWindowCompressedSummaryText.value ? 1 : 0)
  if (!contextWindowCompressedSummaryText.value) return ''
  const parts = []
  if (resolvedSummaryLevel > 0) parts.push(`第 ${resolvedSummaryLevel} 代摘要`)
  if (turnCount > 0) parts.push(`${turnCount} 轮`)
  if (messageCount > 0) parts.push(`${messageCount} 条消息`)
  return parts.join(' · ')
})

const contextWindowCompressedSummaryChainText = computed(() => {
  const summary = activeMemorySessionContextSummary.value
  const summaryChain = Array.isArray(summary?.summaryChain) ? summary.summaryChain : []
  const chainLevels = summaryChain
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .filter((value) => value > 0)
  if (chainLevels.length <= 1) return ''
  return `摘要链：${chainLevels.map((level) => `第 ${level} 代`).join(' → ')}`
})

const contextWindowCompressedSummarySourceText = computed(() => {
  const summary = activeMemorySessionContextSummary.value
  const sourceLabel = String(summary?.summarySourceLabel || '').trim()
  if (!contextWindowCompressedSummaryText.value) return ''
  return sourceLabel ? `来源：${sourceLabel}` : ''
})

const contextWindowPreviewSummaryText = computed(() => {
  const inspection = contextWindowPreviewInspection.value?.inspection
  const entries = contextWindowPreviewEntries.value
  const omittedCount = Array.isArray(inspection?.omittedEntries) ? inspection.omittedEntries.length : 0
  if (!inspection?.messageCount) {
    return omittedCount ? `当前没有可发送的历史；已有 ${omittedCount} 段历史被省略。` : '当前没有可发送的历史。'
  }
  return omittedCount
    ? `当前展示 ${entries.length} 段已纳入上下文的片段，共 ${inspection.messageCount} 条消息；另有 ${omittedCount} 段被省略。`
    : `当前展示 ${entries.length} 段已纳入上下文的片段，共 ${inspection.messageCount} 条消息。`
})

const contextWindowPreviewOmittedSummaryText = computed(() => {
  const omittedEntries = contextWindowPreviewOmittedEntries.value
  if (!omittedEntries.length) return ''
  const filteredCount = contextWindowPreviewFilteredOmittedEntries.value.length
  if (filteredCount === omittedEntries.length) {
    return `当前展示 ${omittedEntries.length} 段被省略的历史及其主要原因。`
  }
  return `当前筛选下展示 ${filteredCount}/${omittedEntries.length} 段被省略的历史。`
})

const contextWindowPreviewOmittedFilterOptions = computed(() => {
  const entries = contextWindowPreviewOmittedEntries.value
  const options = [
    { value: 'all', label: '全部', count: entries.length },
    { value: 'budget', label: '预算', count: entries.filter((entry) => matchesContextWindowOmittedFilter(entry, 'budget')).length },
    { value: 'attachments', label: '附件', count: entries.filter((entry) => matchesContextWindowOmittedFilter(entry, 'attachments')).length },
    { value: 'prelude', label: '前导', count: entries.filter((entry) => matchesContextWindowOmittedFilter(entry, 'prelude')).length }
  ]
  return options.filter((option) => option.value === 'all' || option.count > 0)
})

const contextWindowPreviewResolvedOmittedFilter = computed(() => {
  const active = String(contextWindowPreviewOmittedFilter.value || 'all')
  return contextWindowPreviewOmittedFilterOptions.value.some((option) => option.value === active) ? active : 'all'
})

const contextWindowPreviewFilteredOmittedEntries = computed(() => {
  const active = contextWindowPreviewResolvedOmittedFilter.value
  return contextWindowPreviewOmittedEntries.value.filter((entry) => matchesContextWindowOmittedFilter(entry, active))
})

function buildContextWindowBudgetItem({ key, label, used, max, formatter = null, hint = '' } = {}) {
  const normalize = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? Math.max(0, num) : 0
  }
  const formatValue = typeof formatter === 'function' ? formatter : (value) => String(Math.round(normalize(value)))
  const safeUsed = normalize(used)
  const safeMax = normalize(max)
  const ratio = safeMax > 0 ? safeUsed / safeMax : 0
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)))
  let tone = 'safe'
  if (ratio >= 0.95) tone = 'critical'
  else if (ratio >= 0.8) tone = 'warning'

  return {
    key,
    label,
    used: safeUsed,
    max: safeMax,
    usedLabel: formatValue(safeUsed),
    maxLabel: formatValue(safeMax),
    ratio,
    percent,
    tone,
    hint
  }
}

function hasContextWindowHardBudgetReason(reasons) {
  const list = Array.isArray(reasons) ? reasons : []
  return list.some((reason) => reason === 'turn_limit' || reason === 'message_limit' || reason === 'char_limit')
}

function hasContextWindowSoftBudgetReason(reasons) {
  const list = Array.isArray(reasons) ? reasons : []
  return list.some((reason) => reason === 'prelude_budget_exhausted') || hasContextWindowHardBudgetReason(list)
}

function matchesContextWindowOmittedFilter(entry, filterKey = 'all') {
  const key = String(filterKey || 'all')
  const reasons = Array.isArray(entry?.reasons) ? entry.reasons : []
  if (key === 'budget') {
    return hasContextWindowSoftBudgetReason(reasons)
  }
  if (key === 'attachments') {
    return !!entry?.hasAttachment || reasons.some((reason) => reason === 'attachment_policy_disabled' || reason === 'attachment_displacement')
  }
  if (key === 'prelude') return entry?.kind === 'prelude'
  return true
}

function contextWindowPreviewModeLabel(entry) {
  const mode = String(entry?.mode || '')
  const variant = String(entry?.variant || mode || '')
  if (mode === 'prelude') return '前导'
  if (mode === 'full') return '完整'
  if (mode === 'compact') return '压缩'
  if (mode === 'attachment_summary') return '附件摘要'
  if (mode === 'pinned_attachment_summary') return '回补附件'
  return '保留'
}

function contextWindowPreviewModeType(entry) {
  const mode = String(entry?.mode || '')
  if (mode === 'full') return 'success'
  if (mode === 'compact') return 'warning'
  if (mode === 'attachment_summary') return 'warning'
  if (mode === 'pinned_attachment_summary') return 'info'
  return 'default'
}

function contextWindowPreviewEntryLabel(entry, index) {
  if (entry?.kind === 'prelude') return '系统前导消息'
  if (entry?.kind === 'pinned_attachment_summary') {
    const turnNumber = Number(entry?.index)
    return Number.isFinite(turnNumber) ? `附件回补 | 第 ${turnNumber + 1} 轮` : `附件回补 | 第 ${index + 1} 项`
  }
  const turnNumber = Number(entry?.index)
  return Number.isFinite(turnNumber) ? `第 ${turnNumber + 1} 轮` : `片段 ${index + 1}`
}

function contextWindowPreviewEntryNote(entry) {
  if (entry?.omitted) {
    const reasons = Array.isArray(entry?.reasons) ? entry.reasons : []
    if (entry?.kind === 'prelude') return '前导消息只保留预算内还能放下的最新部分。'
    if (reasons.includes('attachment_displacement')) {
      return entry?.hasAttachment ? '这条附件轮次被更高优先级的上下文挤出。' : '为了保留附件历史，这条普通轮次被挤出。'
    }
    if (reasons.includes('attachment_policy_disabled')) {
      return '这条历史里包含较早的附件，但当前策略不会回补它们。'
    }
    if (reasons.includes('turn_limit') || reasons.includes('message_limit') || reasons.includes('char_limit')) {
      return '当前上下文预算已满，这段历史不会发送给模型。'
    }
    return '这段历史未被纳入当前请求上下文。'
  }
  if (entry?.kind === 'prelude') return '它会插入到历史消息之前，只保留预算允许的最新部分。'
  if (entry?.kind === 'pinned_attachment_summary') return '这条附件来自更早历史，当前以摘要锚点的形式回补。'
  if (entry?.mode === 'attachment_summary') return '原始轮次已压缩为附件摘要。'
  if (entry?.mode === 'compact') return entry?.hasAttachment ? '该轮次已压缩，并优先保留了附件内容。' : '该轮次已压缩，较长文本或工具内容被裁剪。'
  if (entry?.mustKeep) return '这是最新轮次，默认按最高优先级保留。'
  if (entry?.hasAttachment) return '该轮次包含附件上下文，当前按完整轮次保留。'
  return ''
}

function contextWindowPreviewOmittedReasonLabel(reason) {
  const key = String(reason || '')
  if (key === 'turn_limit') return '超过轮次预算'
  if (key === 'message_limit') return '超过消息预算'
  if (key === 'char_limit') return '超过字符预算'
  if (key === 'attachment_policy_disabled') return '附件回补已关闭'
  if (key === 'prelude_budget_exhausted') return '前导预算不足'
  if (key === 'attachment_displacement') return '被附件优先级挤出'
  return '未纳入'
}

function contextWindowPreviewOmittedReasonType(reason) {
  const key = String(reason || '')
  if (key === 'attachment_policy_disabled') return 'info'
  if (key === 'prelude_budget_exhausted') return 'default'
  return 'warning'
}

function contextWindowPreviewModeLabelV2(entry) {
  const mode = String(entry?.mode || '')
  const variant = String(entry?.variant || mode || '')
  if (mode === 'compact') {
    if (variant === 'compact_text') return '强压缩'
    if (variant === 'compact_tight') return '极强压缩'
    if (variant === 'compact_adaptive') return '自适应压缩'
  }
  return contextWindowPreviewModeLabel(entry)
}

function contextWindowPreviewEntryNoteV2(entry) {
  if (entry?.mode === 'compact' && !entry?.omitted && !entry?.hasAttachment) {
    const variant = String(entry?.variant || 'compact')
    if (variant === 'compact_text') return '该轮次已进入强压缩，较长文本会截短，并尽量保留前后关键内容。'
    if (variant === 'compact_tight') return '该轮次已进入更强压缩，为了保住更多历史，只保留了更精简的上下文。'
    if (variant === 'compact_adaptive') return '该轮次已按剩余预算自适应压缩，尽量在不超预算的前提下保留更多历史。'
  }
  return contextWindowPreviewEntryNote(entry)
}

const activeQueuedInputs = computed(() => {
  void chatRunInputQueueRevision.value
  return chatRunInputQueue.list(activeMemorySessionId.value)
})

const activeQueuedGuidanceCount = computed(() => {
  return activeQueuedInputs.value.filter((entry) => entry?.mode === CHAT_RUN_INPUT_MODE_STEER).length
})

const footerHint = computed(() => {
  if (preparingSend.value) return preparingSendStage.value ? `准备中：${preparingSendStage.value}` : '准备发送中...'
  if (sending.value) {
    const count = activeQueuedInputs.value.length
    const queueText = count
      ? `待处理 ${count} 条${activeQueuedGuidanceCount.value ? `（引导 ${activeQueuedGuidanceCount.value}）` : ''}`
      : '暂无待处理消息'
    return `运行中 · ${queueText} · 回车排队，Ctrl/⌘+回车引导当前任务`
  }
  if (activeQueuedInputs.value.length) return `待处理 ${activeQueuedInputs.value.length} 条消息`
  if (effectiveHeaderHint.value) return effectiveHeaderHint.value
  if (!systemContent.value) return '系统提示词为空。你可以先选择提示词、启用技能，或在上方输入临时系统提示词。'
  const workspaceSegments = normalizeSelectedHostWorkspacePath(
    sandboxHostWorkspacePath.value
  ).split(/[\\/]/).filter(Boolean)
  const workspaceText = sandboxHostWorkspacePath.value
    ? `默认：会话沙盒 | 本机目录：${workspaceSegments[workspaceSegments.length - 1] || sandboxHostWorkspacePath.value}（按需）`
    : '默认：会话沙盒'
  return `联网：${webSearchEnabled.value ? '开' : '关'} | MCP 工具：${activeMcpServers.value.length} | 自动批准：${autoApproveTools.value ? '开' : '关'} | ${workspaceText}`
})

const composerShortcutHint =
  '按回车发送，Shift+回车换行，@ 选择智能体，/prompt、/skill、/mcp 快速插入配置。'

const chatEmptyStateDescription = computed(() => {
  if (effectiveHeaderHint.value) return effectiveHeaderHint.value

  const title = activeSessionTitle.value || getSessionTitleFromPath(activeSessionFilePath.value)
  if (title) {
    return `当前会话已绑定到“${title}”。发送第一条消息后，新内容会继续写入该会话。`
  }

  return '你可以直接开始输入，或先配置模型、提示词、智能体和附件。'
})

const chatSetupSummaryItems = computed(() => {
  const providerName = selectedProvider.value?.name || selectedProvider.value?._id || '未选择'
  const modelName = String(selectedModel.value || '').trim() || '未选择'
  const agentName = visibleSelectedAgent.value?.name || visibleSelectedAgent.value?._id || '默认通用'
  const promptName = activePromptLabel.value || basePromptSourceText.value || '未设置'
  const skillText = selectedSkillObjects.value.length ? `已启用 ${selectedSkillObjects.value.length} 个` : '未启用'
  const mcpText = activeMcpServers.value.length
    ? `${activeMcpServers.value.length} 个服务 / ${mcpToolCountText.value} 个工具`
    : '未启用'

  const items = [
    { key: 'provider', label: '服务商', value: providerName },
    { key: 'model', label: '模型', value: modelName },
    { key: 'agent', label: '智能体', value: agentName },
    { key: 'prompt', label: '提示词', value: promptName },
    { key: 'skill', label: '技能', value: skillText },
    { key: 'mcp', label: 'MCP', value: mcpText }
  ]

  const sessionTitle = activeSessionTitle.value || getSessionTitleFromPath(activeSessionFilePath.value)
  if (sessionTitle) items.push({ key: 'session', label: '会话', value: sessionTitle })

  return items
})

const chatOverviewItems = computed(() => {
  const messages = Array.isArray(session.messages) ? session.messages : []
  let userCount = 0
  let assistantCount = 0
  let toolCount = 0
  for (const msg of messages) {
    if (msg?.role === 'user') userCount += 1
    else if (msg?.role === 'assistant') assistantCount += 1
    else if (msg?.role === 'tool') toolCount += 1
  }

  const pendingCount = Array.isArray(pendingAttachments.value) ? pendingAttachments.value.length : 0
  const activeRecord = getMemorySessionById(activeMemorySessionId.value)
  const pendingApprovalCount = activeRecord ? getMemorySessionPendingApprovalCount(activeRecord) : 0
  const activeStatusText = activeRecord
    ? isMemorySessionRunning(activeRecord)
      ? `运行中 ${Math.max(getMemorySessionRunningCount(activeRecord), getMemorySessionChatRunCount(activeRecord))}`
      : pendingApprovalCount
        ? `待批准 ${pendingApprovalCount}`
        : messages.length
          ? '空闲'
          : '待开始'
    : messages.length
      ? '临时会话'
      : '新会话'

  const attachmentSummary = pendingCount
    ? `待发送 ${pendingCount}`
    : sessionMediaItemCount.value
      ? `媒体 ${sessionMediaItemCount.value}`
      : '无'

  return [
    { key: 'messages', label: '消息', value: `${messages.length} 条` },
    { key: 'roles', label: '用户 / 助手', value: `${userCount} / ${assistantCount}` },
    { key: 'tools', label: '工具消息', value: `${toolCount} 条` },
    { key: 'attachments', label: '附件 / 媒体', value: attachmentSummary },
    { key: 'status', label: '会话状态', value: activeStatusText },
    { key: 'switches', label: '联网 / 工具', value: `${webSearchEnabled.value ? '联网开' : '联网关'} · ${autoApproveTools.value ? '自动批准' : '手动确认'}` }
  ]
})
const activeSessionDisplayTitle = computed(() => {
  return activeSessionTitle.value || getSessionTitleFromPath(activeSessionFilePath.value)
})

const thinkingEffortLabel = computed(() => {
  const v = String(thinkingEffort.value || 'auto')
  if (v === 'none') return '关闭'
  if (v === 'minimal') return '极低'
  if (v === 'low') return '低'
  if (v === 'medium') return '中'
  if (v === 'high') return '高'
  if (v === 'xhigh') return '很高'
  if (v === 'max') return '最高'
  return '自动'
})

const imageGenerationModeLabel = computed(() => {
  const v = String(imageGenerationMode.value || 'auto')
  if (v === 'on') return '开启'
  if (v === 'off') return '关闭'
  return '自动'
})

const videoGenerationModeLabel = computed(() => {
  const v = String(videoGenerationMode.value || 'auto')
  if (v === 'on') return '开启'
  if (v === 'off') return '关闭'
  return '自动'
})

const imageGenerationParamsSummary = computed(() =>
  summarizeImageGenerationParams(imageGenerationParamsEnabled.value, imageGenerationParams)
)

const videoGenerationParamsSummary = computed(() =>
  summarizeVideoGenerationParams(videoGenerationParamsEnabled.value, videoGenerationParams)
)

const mediaGenerationParamsAutosaveKey = computed(() =>
  JSON.stringify({
    imageEnabled: imageGenerationParamsEnabled.value,
    image: normalizeImageGenerationParams(imageGenerationParams),
    videoEnabled: videoGenerationParamsEnabled.value,
    video: normalizeVideoGenerationParams(videoGenerationParams)
  })
)

const showInputModeTags = computed(() => {
  return (
    thinkingEffort.value !== 'auto' ||
    normalizeImageGenerationMode(imageGenerationMode.value) !== 'auto' ||
    normalizeImageGenerationMode(videoGenerationMode.value) !== 'auto' ||
    imageGenerationParamsEnabled.value ||
    videoGenerationParamsEnabled.value
  )
})

const thinkingEffortButtonType = computed(() => (thinkingEffort.value !== 'auto' ? 'primary' : 'default'))

const imageGenerationButtonType = computed(() => {
  const mode = normalizeImageGenerationMode(imageGenerationMode.value)
  if (mode === 'on') return 'primary'
  if (mode === 'off') return 'warning'
  return 'default'
})

const videoGenerationButtonType = computed(() => {
  const mode = normalizeImageGenerationMode(videoGenerationMode.value)
  if (mode === 'on') return 'primary'
  if (mode === 'off') return 'warning'
  return 'default'
})

const canSend = computed(() => {
  if (preparingSend.value) return false
  return !!String(input.value || '').trim() || (pendingAttachments.value || []).length > 0
})

function copyToClipboard(text) {
  const t = String(text || '')
  if (!t.trim()) return
  const api = navigator?.clipboard
  if (!api?.writeText) {
    message.warning('当前环境不支持剪贴板复制')
    return
  }
  api
    .writeText(t)
    .then(() => message.success('已复制到剪贴板'))
    .catch((err) => message.error('复制失败：' + (err?.message || String(err))))
}

function copyMediaPrompt(item) {
  copyToClipboard(item?.prompt || '')
}

function applyMediaGenerationPreset(key) {
  const result = applyMediaGenerationPresetToInput(input.value, key)
  if (!result) return

  input.value = result.text
  resetComposerInput()
  if (result.kind === 'video') {
    videoGenerationMode.value = 'on'
    if (result.paramsEnabled) {
      setVideoGenerationParamsEnabled(true)
      assignVideoGenerationParams(result.params)
    }
  } else {
    imageGenerationMode.value = 'on'
    if (result.paramsEnabled) {
      setImageGenerationParamsEnabled(true)
      assignImageGenerationParams(result.params)
    }
  }
  nextTick(() => composerPanelRef.value?.focusComposer?.())
}

function copyAssistantMessage(msg) {
  copyToClipboard(msg?.content || '')
}

function copyUserMessage(msg) {
  copyToClipboard(msg?.content || '')
}

const chatLinkContextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  href: '',
  text: '',
  file: null
})
const sandboxFileCatalog = computed(() => collectSandboxFileCatalog(session.messages))
const chatLinkContextMenuOptions = computed(() => {
  const href = String(chatLinkContextMenu.value.href || '').trim()
  const file = chatLinkContextMenu.value.file
  if (file) {
    return [
      { label: '保存到指定目录…', key: 'save-file-as' },
      { label: '打开文件', key: 'open-file' },
      { label: '在文件夹中显示', key: 'show-file' },
      { type: 'divider' },
      { label: '复制文件名', key: 'copy-file-name' },
      { label: '复制沙盒路径', key: 'copy-file-path' },
      { label: '复制下载链接', key: 'copy-file-link' }
    ]
  }
  const externalUrl = getSafeExternalUrl(href)
  return [
    {
      label: externalUrl ? '在浏览器中打开链接' : '打开引用的笔记',
      key: 'open'
    },
    { label: '复制链接', key: 'copy' }
  ]
})

function cleanupChatPreviewLinkHandlers() {
  closeChatLinkContextMenu()
}

async function resolveChatNoteAbsPathFromHref(hrefRaw) {
  return resolveNoteAbsPathFromHref({
    hrefRaw,
    currentDir: 'note',
    existsFn: exists
  })
}

async function openChatNoteFromHref(href) {
  const noteAbsPath = await resolveChatNoteAbsPathFromHref(href)
  if (!noteAbsPath) return false
  await router.push({ name: 'note' }).catch(() => {})
  requestOpenNoteFile(noteAbsPath)
  return true
}

async function handleChatPreviewLinkClick(e) {
  const link = e.target?.closest?.('a')
  if (!link || !chatListRef.value?.contains(link)) return

  const href = String(link.getAttribute('href') || '').trim()
  if (!href || href.startsWith('#')) return

  e.preventDefault()
  e.stopPropagation()

  const sandboxFile = resolveSandboxFileLink(href, sandboxFileCatalog.value)
  if (sandboxFile) {
    try {
      const result = await saveChatWorkspaceResultFile(sandboxFile, {
        suggestedName: sandboxFile.name || 'sandbox-output'
      })
      if (!result?.canceled) message.success('文件已保存')
    } catch (error) {
      message.error(`保存文件失败：${error?.message || String(error)}`)
    }
    return
  }

  if (getSafeExternalUrl(href)) {
    safeOpenExternal(href)
    return
  }

  if (await openChatNoteFromHref(href)) return
  copyToClipboard(href)
}

async function runChatWorkspaceResultFileAction(file, action, actionOptions = {}) {
  const outcome = await runChatWorkspaceFileAction(file, action, { actionOptions })
  if (outcome.recovered) {
    message.warning('原始结果文件已丢失，已根据历史写入内容恢复副本')
  }
  return outcome.result
}

function saveChatWorkspaceResultFile(file, options = {}) {
  return runChatWorkspaceResultFileAction(file, 'save', options)
}

function openChatWorkspaceResultFile(file) {
  return runChatWorkspaceResultFileAction(file, 'open')
}

function showChatWorkspaceResultFile(file) {
  return runChatWorkspaceResultFileAction(file, 'show')
}

function handleChatPreviewLinkContextMenu(e) {
  const link = e.target?.closest?.('a')
  if (!link || !chatListRef.value?.contains(link)) return

  const href = String(link.getAttribute('href') || '').trim()
  if (!href) return

  e.preventDefault()
  e.stopPropagation()
  chatLinkContextMenu.value = {
    show: false,
    x: e.clientX,
    y: e.clientY,
    href,
    text: String(link.textContent || '').trim(),
    file: resolveSandboxFileLink(href, sandboxFileCatalog.value)
  }
  window.setTimeout(() => {
    chatLinkContextMenu.value.show = true
  }, 0)
}

function closeChatLinkContextMenu() {
  chatLinkContextMenu.value.show = false
}

async function copyChatContextLink(href) {
  const externalUrl = getSafeExternalUrl(href)
  if (externalUrl?.protocol === 'mailto:') {
    copyToClipboard(safeDecodeURIComponent(externalUrl.pathname))
    return
  }
  if (externalUrl) {
    copyToClipboard(externalUrl.toString())
    return
  }

  try {
    const noteAbsPath = await resolveChatNoteAbsPathFromHref(href)
    const noteHref = noteAbsPath ? buildNoteHrefFromPath(noteAbsPath) : ''
    copyToClipboard(noteHref || href)
  } catch {
    copyToClipboard(href)
  }
}

async function handleChatLinkContextMenuSelect(key) {
  const href = String(chatLinkContextMenu.value.href || '').trim()
  const file = chatLinkContextMenu.value.file
  closeChatLinkContextMenu()
  if (!href) return

  if (file) {
    try {
      if (key === 'save-file-as') {
        const result = await saveChatWorkspaceResultFile(file, {
          suggestedName: file.name || 'sandbox-output'
        })
        if (!result?.canceled) message.success('文件已保存')
        return
      }
      if (key === 'open-file') {
        await openChatWorkspaceResultFile(file)
        return
      }
      if (key === 'show-file') {
        await showChatWorkspaceResultFile(file)
        return
      }
      if (key === 'copy-file-name') {
        copyToClipboard(file.name || file.path)
        return
      }
      if (key === 'copy-file-path') {
        copyToClipboard(file.path || file.dataPath)
        return
      }
      if (key === 'copy-file-link') {
        copyToClipboard(file.href || href)
        return
      }
    } catch (error) {
      message.error(`文件操作失败：${error?.message || String(error)}`)
    }
    return
  }

  if (key === 'copy') {
    await copyChatContextLink(href)
    return
  }
  if (key === 'open') {
    if (getSafeExternalUrl(href)) {
      safeOpenExternal(href)
      return
    }
    if (!(await openChatNoteFromHref(href))) {
      message.warning('无法打开该链接')
    }
  }
}

function ensureFilenameExt(nameRaw, mime) {
  const name = String(nameRaw || '').trim()
  const mt = String(mime || '').trim().toLowerCase()
  const hasExt = /\.[a-z0-9]+$/i.test(name)
  if (name && hasExt) return name

  let ext = 'png'
  if (mt.includes('jpeg') || mt.includes('jpg')) ext = 'jpg'
  else if (mt.includes('gif')) ext = 'gif'
  else if (mt.includes('webp')) ext = 'webp'
  else if (mt.includes('bmp')) ext = 'bmp'
  else if (mt.includes('mp4')) ext = 'mp4'
  else if (mt.includes('webm')) ext = 'webm'
  else if (mt.includes('quicktime') || mt.includes('mov')) ext = 'mov'
  else if (mt.includes('x-m4v') || mt.includes('m4v')) ext = 'm4v'

  if (!name) return `image_${Date.now()}.${ext}`
  return `${name}.${ext}`
}

function extractChatImagesFromToolResult(result) {
  return extractImageOutputEntries(result).map((img, index) => ({
    id: newId(),
    name: String(img?.name || `image_${index + 1}`).trim() || `image_${index + 1}`,
    src: String(img?.src || '').trim(),
    mime: String(img?.mime || '').trim(),
    size: Number(img?.size || 0),
    width: Number(img?.width || 0),
    height: Number(img?.height || 0),
    resolution: String(img?.resolution || '').trim(),
    requestSize: String(img?.requestSize || '').trim(),
    generationTimeMs: Number(img?.generationTimeMs || 0),
    createdAt: img?.createdAt || ''
  }))
}

function extractChatVideosFromToolResult(result) {
  return extractVideoOutputEntries(result).map((video, index) => ({
    id: newId(),
    name: String(video?.name || `video_${index + 1}`).trim() || `video_${index + 1}`,
    src: String(video?.src || '').trim(),
    mime: String(video?.mime || '').trim(),
    size: Number(video?.size || 0),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    resolution: String(video?.resolution || '').trim(),
    durationSeconds: Number(video?.durationSeconds || 0),
    generationTimeMs: Number(video?.generationTimeMs || 0),
    createdAt: video?.createdAt || ''
  }))
}

function createAssistantImageBubblePlaceholder(note = '图片生成中，结果就绪后会展示在这里。', metaLine = '') {
  return {
    id: `assistant-image-placeholder-${newId()}`,
    name: '图片生成中',
    src: '',
    mime: '',
    note: String(note || '').trim() || '图片生成中，结果就绪后会展示在这里。',
    metaLine: String(metaLine || '').trim()
  }
}

function createAssistantVideoBubblePlaceholder(note = '视频生成中，结果就绪后会展示在这里。', metaLine = '') {
  return {
    id: `assistant-video-placeholder-${newId()}`,
    name: '视频生成中',
    src: '',
    mime: '',
    note: String(note || '').trim() || '视频生成中，结果就绪后会展示在这里。',
    metaLine: String(metaLine || '').trim()
  }
}

function assistantVisibleImages(msg) {
  if (Array.isArray(msg?.images) && msg.images.length) return msg.images
  if (msg?.imageBubblePlaceholder) {
    return [msg.imageBubblePlaceholderImage || createAssistantImageBubblePlaceholder()]
  }
  return []
}

function assistantVisibleImageCount(msg) {
  return Array.isArray(msg?.images) ? msg.images.filter((img) => String(img?.src || '').trim()).length : 0
}

function assistantImageBlockEyebrow(msg) {
  return assistantVisibleImageCount(msg) ? '图片结果' : '图片占位'
}

function assistantImageDisplayTitle(msg) {
  if (assistantVisibleImageCount(msg)) return assistantImageTitle(msg)
  return assistantImageTaskTitle(msg) || '图片生成中'
}

function assistantImagePlaceholderText(msg, img) {
  const note = String(img?.note || '').trim()
  if (note) return note
  return assistantImageTaskNote(msg) || '图片生成中，结果就绪后会展示在这里。'
}

function assistantImageInsightLabel(msg, img) {
  return imageInsightLabel(img) || assistantImageTaskMetaLabel(msg) || ''
}

function assistantVisibleVideos(msg) {
  if (Array.isArray(msg?.videos) && msg.videos.length) return msg.videos
  if (msg?.videoBubblePlaceholder) {
    return [msg.videoBubblePlaceholderItem || createAssistantVideoBubblePlaceholder()]
  }
  return []
}

function assistantVisibleVideoCount(msg) {
  return Array.isArray(msg?.videos) ? msg.videos.filter((video) => String(video?.src || '').trim()).length : 0
}

function clearAssistantMediaBubblePlaceholders(msg) {
  if (!msg || typeof msg !== 'object') return
  msg.imageBubblePlaceholder = false
  msg.imageBubblePlaceholderImage = null
  msg.videoBubblePlaceholder = false
  msg.videoBubblePlaceholderItem = null
}

function applyAssistantRequestPlaceholderMode(msg, placeholderMode = 'text') {
  if (!msg || typeof msg !== 'object') return
  clearAssistantMediaBubblePlaceholders(msg)
  const mode = String(placeholderMode || 'text').trim().toLowerCase()
  if (mode === 'image') {
    msg.imageBubblePlaceholder = true
    msg.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder()
    return
  }
  if (mode === 'video') {
    msg.videoBubblePlaceholder = true
    msg.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder()
  }
}

function prepareAssistantDisplayForTextResponse(msg) {
  if (!msg || typeof msg !== 'object') return
  clearAssistantMediaBubblePlaceholders(msg)
  msg.transientRequestPlaceholder = false
}

function removeDisplayMessageById(messageId) {
  const id = String(messageId || '').trim()
  if (!id) return
  const index = session.messages.findIndex((msg) => msg?.id === id)
  if (index !== -1) session.messages.splice(index, 1)
}

function removeRunDisplayMessageById(abortState, messageId) {
  const id = String(messageId || '').trim()
  if (!id) return
  const targetSession = getRunSessionTarget(abortState)
  const index = targetSession.messages.findIndex((msg) => msg?.id === id)
  if (index !== -1) targetSession.messages.splice(index, 1)
}

function assistantVideoBlockEyebrow(msg) {
  return assistantVisibleVideoCount(msg) ? '视频结果' : '视频占位'
}

function assistantVideoDisplayTitle(msg) {
  if (assistantVisibleVideoCount(msg)) {
    const count = assistantVisibleVideoCount(msg)
    return count > 1 ? `已生成 ${count} 个视频` : '已生成 1 个视频'
  }
  return assistantVideoTaskTitle(msg) || '视频生成中'
}

function assistantVideoPlaceholderText(msg, video) {
  const note = String(video?.note || '').trim()
  if (note) return note
  return assistantVideoTaskNote(msg) || '视频生成中，结果就绪后会展示在这里。'
}

function assistantVideoInsightLabel(msg, video) {
  return videoInsightLabel(video) || assistantVideoTaskMetaLabel(msg) || ''
}

function assistantVideoPromptLabel(msg) {
  const prompt = truncateInlineText(msg?.videoPrompt || '', 220)
  if (!prompt) return ''
  return `提示词：${prompt}`
}

function assistantVideoTaskStatusLabel(messageLike) {
  const status = String(messageLike?.videoTask?.stage || messageLike?.videoTask?.status || '').trim().toLowerCase()
  if (status === 'submitting') return '提交中'
  if (['queued', 'submitted', 'pending', 'accepted'].includes(status)) return '排队中'
  if (['processing', 'running', 'in_progress', 'polling'].includes(status)) return '生成中'
  if (status === 'fetching_result') return '拉取结果中'
  if (['completed', 'succeeded', 'success'].includes(status)) return '已完成'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return '失败'
  return status ? status : '处理中'
}

function assistantVideoTaskTagType(messageLike) {
  const status = String(messageLike?.videoTask?.stage || messageLike?.videoTask?.status || '').trim().toLowerCase()
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return 'error'
  if (['completed', 'succeeded', 'success'].includes(status)) return 'success'
  if (['queued', 'submitted', 'pending', 'accepted'].includes(status)) return 'warning'
  return 'info'
}

function assistantVideoTaskTitle(messageLike) {
  return `视频任务${assistantVideoTaskStatusLabel(messageLike) === '处理中' ? '' : ` · ${assistantVideoTaskStatusLabel(messageLike)}`}`.trim()
}

function assistantVideoTaskMetaLabel(messageLike) {
  const task = messageLike?.videoTask
  if (!task) return ''
  const parts = []
  if (task.id) parts.push(`任务 ID：${task.id}`)
  if (task.endpointKind) parts.push(`接口：${task.endpointKind}`)
  const progress = mediaTaskProgressLabel(messageLike, 'video')
  if (progress) parts.push(progress)
  return parts.join(' · ')
}

function assistantVideoTaskNote(messageLike) {
  return String(messageLike?.videoTask?.note || '').trim()
}

function videoInsightLabel(video) {
  return String(video?.note || '').trim()
}

const BUILTIN_AGENTS_TRACE_EVENT = 'builtin-agents-trace'
const BUILTIN_AGENT_ID = 'builtin_agent_notes'
const LEGACY_DEFAULT_AGENT_SKILL_IDS = Object.freeze([
  'builtin_skill_notes',
  'builtin_skill_config',
  'builtin_skill_sessions',
  'builtin_skill_agent_orchestration',
  'builtin_skill_shell'
])
const BUILTIN_AGENT_ORCHESTRATION_SKILL_ID = 'builtin_skill_agent_orchestration'
const BUILTIN_SHELL_SKILL_ID = 'builtin_skill_shell'
const BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT = 'builtin-agents-tool-approval-request'
const BUILTIN_AGENTS_TOOL_APPROVAL_RESPONSE_EVENT = 'builtin-agents-tool-approval-response'
const BUILTIN_AGENTS_TOOL_APPROVAL_MODE_CHANGE_EVENT = 'builtin-agents-tool-approval-mode-change'

function copyChatImageLink(img) {
  const src = String(img?.src || '').trim()
  if (!src) return
  copyToClipboard(src)
}

function copyChatVideoLink(video) {
  const src = String(video?.src || '').trim()
  if (!src) return
  copyToClipboard(src)
}

async function loadChatImageBlob(img) {
  const src = String(img?.src || '').trim()
  if (!src) throw new Error('图片链接为空')

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`加载图片失败（HTTP ${response.status}）`)
  }

  const blob = await response.blob()
  if (!blob || !blob.size) {
    throw new Error('图片内容为空')
  }
  return blob
}

async function loadChatVideoBlob(video) {
  const src = String(video?.src || '').trim()
  if (!src) throw new Error('视频链接为空')

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`加载视频失败（HTTP ${response.status}）`)
  }

  const blob = await response.blob()
  if (!blob || !blob.size) {
    throw new Error('视频内容为空')
  }
  return blob
}

function withPreferredBlobMime(blob, mime) {
  const preferred = String(mime || '').trim()
  if (!preferred || String(blob?.type || '').trim().toLowerCase() === preferred.toLowerCase()) return blob
  try {
    return new Blob([blob], { type: preferred })
  } catch {
    return blob
  }
}

async function copyChatImage(img) {
  const src = String(img?.src || '').trim()
  if (!src) return

  try {
    if (await copyChatImageFile(img)) {
      message.success('图片已复制到剪贴板')
      return
    }
    if (!await copyChatImageBlob(img)) {
      throw new Error('clipboard image mime unsupported')
    }
    message.success('图片已复制到剪贴板')
  } catch (err) {
    copyChatImageLink(img)
    message.warning(`当前环境不支持直接复制图片，已改为复制图片链接：${err?.message || String(err)}`)
  }
}

function getActiveChatImageAssetPath(img) {
  const sessionFilePath = String(activeSessionFilePath.value || '').trim()
  return (
    resolveChatMediaAssetPath(img, { sessionFilePath }) ||
    String(img?.assetPath || img?.localPath || img?.fileRelPath || '').trim()
  )
}

async function ensureChatImageAssetPath(img) {
  let assetPath = getActiveChatImageAssetPath(img)
  if (assetPath) return assetPath

  const sessionFilePath = String(activeSessionFilePath.value || '').trim()
  const src = String(img?.src || '').trim()
  if (!sessionFilePath || !src) return ''

  const persisted = await persistChatMediaListAssets([img], {
    kind: 'image',
    messageId: img?.messageId || img?.id || 'image',
    sessionFilePath
  })
  const next = persisted?.[0]
  assetPath = getActiveChatImageAssetPath(next)
  if (assetPath && next && typeof img === 'object') {
    Object.assign(img, next)
    scheduleSessionAutosave()
  }
  return assetPath || ''
}

async function copyChatImageFile(img) {
  const copyFile = globalThis?.utools?.copyFile
  if (typeof copyFile !== 'function') return false

  const assetPath = await ensureChatImageAssetPath(img)
  if (!assetPath) return false

  const absPath = String(await resolvePath(assetPath) || '').trim()
  if (!absPath) return false
  return !!copyFile(absPath)
}

async function copyChatImageBlob(img) {
  const clipboardApi = navigator?.clipboard
  if (!clipboardApi?.write || typeof ClipboardItem === 'undefined') return false

  const blob = await loadChatImageBlob(img)
  const mime = normalizeClipboardMediaMime(blob.type || img?.mime, 'image/png', 'image/') || 'image/png'
  if (!canWriteClipboardMime(mime, ClipboardItem)) return false
  const clipboardBlob = withPreferredBlobMime(blob, mime)
  await clipboardApi.write([
    new ClipboardItem({
      [mime]: clipboardBlob
    })
  ])
  return true
}

function getActiveChatVideoAssetPath(video) {
  const sessionFilePath = String(activeSessionFilePath.value || '').trim()
  return (
    resolveChatMediaAssetPath(video, { sessionFilePath }) ||
    String(video?.assetPath || video?.localPath || video?.fileRelPath || '').trim()
  )
}

async function ensureChatVideoAssetPath(video) {
  let assetPath = getActiveChatVideoAssetPath(video)
  if (assetPath) return assetPath

  const sessionFilePath = String(activeSessionFilePath.value || '').trim()
  const src = String(video?.src || '').trim()
  if (!sessionFilePath || !src) return ''

  const persisted = await persistChatMediaListAssets([video], {
    kind: 'video',
    messageId: video?.messageId || video?.id || 'video',
    sessionFilePath
  })
  const next = persisted?.[0]
  assetPath = getActiveChatVideoAssetPath(next)
  if (assetPath && next && typeof video === 'object') {
    Object.assign(video, next)
    scheduleSessionAutosave()
  }
  return assetPath || ''
}

async function copyChatVideoFile(video) {
  const copyFile = globalThis?.utools?.copyFile
  if (typeof copyFile !== 'function') return false

  const assetPath = await ensureChatVideoAssetPath(video)
  if (!assetPath) return false

  const absPath = String(await resolvePath(assetPath) || '').trim()
  if (!absPath) return false
  return !!copyFile(absPath)
}

async function copyChatVideoBlob(video) {
  const clipboardApi = navigator?.clipboard
  if (!clipboardApi?.write || typeof ClipboardItem === 'undefined') return false

  const blob = await loadChatVideoBlob(video)
  const mime = normalizeClipboardMediaMime(blob.type || video?.mime, 'video/mp4', 'video/') || 'video/mp4'
  if (!canWriteClipboardMime(mime, ClipboardItem)) return false
  const clipboardBlob = withPreferredBlobMime(blob, mime)
  await clipboardApi.write([
    new ClipboardItem({
      [mime]: clipboardBlob
    })
  ])
  return true
}

async function copyChatVideo(video) {
  const src = String(video?.src || '').trim()
  if (!src) return

  try {
    if (await copyChatVideoFile(video)) {
      message.success('视频文件已复制到剪贴板')
      return
    }
  } catch {
    // 继续尝试浏览器剪贴板写入。
  }

  try {
    if (await copyChatVideoBlob(video)) {
      message.success('视频已复制到剪贴板')
      return
    }
  } catch {
    // 继续降级为复制链接。
  }

  copyChatVideoLink(video)
  message.warning('当前环境不支持直接复制视频文件，已改为复制视频链接')
}

function isToolMessage(msgOrRole) {
  const role = typeof msgOrRole === 'string' ? msgOrRole : String(msgOrRole?.role || '').trim()
  return role === 'tool' || role === 'tool_call'
}

const TOOL_MESSAGE_STATUS_LABELS = {
  running: '运行中',
  paused: '已暂停',
  stopped: '已停止',
  success: '已完成',
  error: '失败',
  rejected: '已拒绝'
}

function normalizeToolMessageStatus(raw) {
  const status = String(raw || '').trim()
  return Object.prototype.hasOwnProperty.call(TOOL_MESSAGE_STATUS_LABELS, status) ? status : ''
}

function isLiveToolMessageStatus(status) {
  return status === 'running' || status === 'paused'
}

function toolMessageStatusText(status) {
  const normalized = normalizeToolMessageStatus(status)
  return TOOL_MESSAGE_STATUS_LABELS[normalized] || '已完成'
}

function toolMessageStatusDetailText(status) {
  const normalized = normalizeToolMessageStatus(status)
  if (normalized === 'running') return '等待工具结果...'
  if (normalized === 'paused') return '执行已暂停，等待恢复...'
  if (normalized === 'stopped') return '执行已停止，不会继续运行。'
  return ''
}

function getToolMessageStatus(msg) {
  if (!isToolMessage(msg)) return ''
  const explicit = normalizeToolMessageStatus(msg?.toolStatus)
  if (isAgentRunToolResult(msg?.toolResultPayload)) {
    const payloadStatus = normalizeToolMessageStatus(getAgentRunMessageStatus(msg))
    if (payloadStatus && payloadStatus !== 'running') return payloadStatus
    if (explicit && explicit !== 'running') return explicit
    if (payloadStatus === 'running') return 'running'
  }
  const structuredStatus = normalizeToolMessageStatus(
    inferStructuredToolResultStatus(msg?.toolResultPayload)
  )
  if (structuredStatus) return structuredStatus
  if (explicit) return explicit
  const text = String(msg?.content || '').trim()
  if (/rejected|拒绝/i.test(text)) return 'rejected'
  if (/failed|error[:?]?|错误|失败/i.test(text)) return 'error'
  return String(msg?.role || '').trim() === 'tool_call' ? 'running' : 'success'
}

function toolMessageStatusLabel(msg) {
  return toolMessageStatusText(getToolMessageStatus(msg))
}

function toolMessageLabel(msg) {
  return getToolActivityLabel(msg, getToolMessageStatus(msg))
}

function toolActivityMeta(msg) {
  return getToolActivityMeta(msg)
}

function toolActivityToolName(msg) {
  return getToolActivityToolName(msg)
}

function toolActivitySource(msg) {
  return getToolActivitySource(msg)
}

function shouldShowToolActivityStatus(msg) {
  return ['paused', 'stopped', 'error', 'rejected'].includes(getToolMessageStatus(msg))
}

function toolActivityIcon(msg) {
  const status = getToolMessageStatus(msg)
  if (status === 'running') return RefreshOutline
  if (status === 'paused') return PauseCircleOutline
  if (status === 'error' || status === 'rejected' || status === 'stopped') return CloseOutline
  return CheckmarkOutline
}

function isToolActivityGroup(msg) {
  return String(msg?.role || '').trim() === 'tool_group' && Array.isArray(msg?.toolGroupMessages)
}

function toggleToolActivityGroup(group) {
  if (!isToolActivityGroup(group)) return
  const id = String(group.id || '').trim()
  if (!id) return
  const next = new Set(expandedToolActivityGroupIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedToolActivityGroupIds.value = next
  chatMessageHeightCache.delete(id)
  chatMessageEstimatedHeightCache.delete(id)
  bumpChatMessageMetricsVersion()
}

function isAssistantActivityMessage(msg) {
  if (String(msg?.role || '').trim() !== 'assistant' || !String(msg?.thinking || '').trim()) return false
  if (String(msg?.content || '').trim()) return false
  return !(
    (Array.isArray(msg?.images) && msg.images.length) ||
    (Array.isArray(msg?.videos) && msg.videos.length)
  )
}

function isChatActivityMessage(msg) {
  return isToolMessage(msg) || isToolActivityGroup(msg) || isAssistantActivityMessage(msg)
}

function chatItemStateClasses(msg) {
  const status = getToolMessageStatus(msg)
  return {
    'is-streaming': msg?.role === 'assistant' && !!msg?.streaming,
    'is-tool-running': status === 'running',
    'is-tool-paused': status === 'paused',
    'is-tool-stopped': status === 'stopped',
    'is-tool-success': status === 'success',
    'is-tool-error': status === 'error',
    'is-tool-rejected': status === 'rejected',
    'is-agent-run': isToolMessage(msg) && String(msg?.toolName || '').trim() === 'agent_run',
    'is-tool-group': isToolActivityGroup(msg),
    'is-activity': isChatActivityMessage(msg),
    'is-thinking-activity': isAssistantActivityMessage(msg)
  }
}

function chatAvatarStateClasses(msg) {
  const status = getToolMessageStatus(msg)
  return {
    'is-streaming': msg?.role === 'assistant' && !!msg?.streaming,
    'is-running': status === 'running',
    'is-paused': status === 'paused',
    'is-stopped': status === 'stopped',
    'is-success': status === 'success',
    'is-error': status === 'error',
    'is-rejected': status === 'rejected'
  }
}

function chatAvatarIconClasses(msg) {
  const status = getToolMessageStatus(msg)
  return {
    'is-streaming': msg?.role === 'assistant' && !!msg?.streaming,
    'is-spinning': status === 'running'
  }
}

function extractServerNameFromToolMeta(toolMeta = '') {
  const raw = String(toolMeta || '').trim()
  if (!raw) return ''
  const idx = raw.indexOf(' / ')
  return idx >= 0 ? raw.slice(0, idx).trim() : raw
}

function extractToolNameFromToolMeta(toolMeta = '') {
  const raw = String(toolMeta || '').trim()
  if (!raw) return ''
  const idx = raw.indexOf(' / ')
  return idx >= 0 ? raw.slice(idx + 3).trim() : ''
}

function extractFirstJsonFenceText(content = '') {
  const match = String(content || '').match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match ? String(match[1] || '').trim() : ''
}

function inferToolResultStatus(messageLike) {
  const explicit = normalizeToolMessageStatus(messageLike?.toolStatus)
  if (isAgentRunToolResult(messageLike?.toolResultPayload)) {
    const payloadStatus = normalizeToolMessageStatus(getAgentRunMessageStatus(messageLike))
    if (payloadStatus && payloadStatus !== 'running') return payloadStatus
    if (explicit && explicit !== 'running') return explicit
    if (payloadStatus === 'running') return 'running'
  }
  const structuredStatus = normalizeToolMessageStatus(
    inferStructuredToolResultStatus(messageLike?.toolResultPayload)
  )
  if (structuredStatus) return structuredStatus
  if (explicit) return explicit
  const role = String(messageLike?.role || '').trim()
  if (role === 'tool_call') return 'running'
  const text = String(messageLike?.content || '').trim()
  if (/rejected|拒绝/i.test(text)) return 'rejected'
  if (/failed|error[:?]?|错误|失败/i.test(text)) return 'error'
  return 'success'
}

function buildToolExecutionMessageContent(options = {}) {
  const serverName = String(options.serverName || '').trim() || '未知'
  const toolName = String(options.toolName || '').trim() || ''
  const argsText = String(options.argsText || '').trim() || '{}'
  const resultContent = String(options.resultContent || '').trim()
  const errorText = String(options.errorText || '').trim()
  const status = options.status || 'running'
  const statusText = toolMessageStatusText(status)
  const statusDetailText = toolMessageStatusDetailText(status)
  const autoApproved = options.autoApproved
  const traceItems = Array.isArray(options.traceItems) ? options.traceItems : []
  const lines = [
    '### 工具调用',
    `- 服务：**${serverName}**`,
    `- 工具：\`${toolName}\``,
    `- 状态：**${statusText}**`
  ]

  if (typeof autoApproved === 'boolean') lines.push(`- 自动批准：**${autoApproved ? '是' : '否'}**`)

  lines.push('', '#### 参数', '', '```json', argsText, '```')

  if (statusDetailText) lines.push('', `> ${statusDetailText}`)
  if (traceItems.length && isLiveToolMessageStatus(status)) {
    lines.push('', '#### 实时轨迹', '')
    traceItems.slice(-40).forEach((item) => {
      lines.push(formatAgentRunTraceEntry(item))
    })
  }
  if (resultContent) lines.push('', resultContent)
  else if (errorText && status !== 'running') lines.push('', '#### 错误', '', errorText)

  return lines.join('\n').trim()
}

function createPendingToolExecutionMessage({
  serverName = '',
  toolName = '',
  toolTitle = '',
  toolDescription = '',
  argsText = '{}',
  autoApproved = false,
  traceStreamId = '',
  argsObj = null,
  toolCallId = '',
  toolExecutionId = '',
  toolSessionId = ''
} = {}) {
  const targetAgentLabel = isAgentRunToolName(toolName)
    ? String(argsObj?.agent_name || argsObj?.agent_id || argsObj?.name || argsObj?.id || '').trim()
    : ''
  const expandByDefault = isAgentRunToolName(toolName)
  const normalizedToolExecutionId = String(toolExecutionId || '').trim()
  const normalizedTraceStreamId = String(traceStreamId || '').trim() || (expandByDefault ? normalizedToolExecutionId : '')
  return createDisplayMessage(
    'tool_call',
    buildToolExecutionMessageContent({
      serverName,
      toolName,
      argsText,
      autoApproved,
      status: 'running'
    }),
    {
      toolMeta: `${serverName || '未知'} / ${toolName || ''}`.trim(),
      toolExpanded: expandByDefault,
      toolStatus: 'running',
      toolServerName: String(serverName || '').trim(),
      toolName: String(toolName || '').trim(),
      toolTitle: String(toolTitle || '').trim(),
      toolDescription: String(toolDescription || '').trim(),
      toolArgsText: String(argsText || '').trim() || '{}',
      toolAutoApproved: !!autoApproved,
      toolCallId: String(toolCallId || '').trim(),
      toolExecutionId: normalizedToolExecutionId,
      toolSessionId: String(toolSessionId || '').trim(),
      toolSubMeta: targetAgentLabel ? `智能体：${targetAgentLabel}` : '',
      toolTraceStreamId: normalizedTraceStreamId,
      toolLiveTrace: [],
      toolAbortState: null
    }
  )
}

function createToolExecutionResultMessage(content = '', extra = {}, toolCallId = '', toolExecutionId = '') {
  const normalizedExtra = extra && typeof extra === 'object' ? { ...extra } : {}
  if (!String(normalizedExtra.toolCallId || '').trim() && toolCallId) {
    normalizedExtra.toolCallId = String(toolCallId || '').trim()
  }
  if (!String(normalizedExtra.toolExecutionId || '').trim() && toolExecutionId) {
    normalizedExtra.toolExecutionId = String(toolExecutionId || '').trim()
  }
  return createDisplayMessage('tool', content, normalizedExtra)
}

function buildToolExecutionResultSubMeta(result) {
  const resultKind = String(result?.kind || '').trim()
  if (resultKind.startsWith('sandbox_')) {
    if (result?.workspaceKind === 'multiple') {
      const kinds = new Set(
        (Array.isArray(result?.workspaces) ? result.workspaces : [])
          .map((workspace) => String(workspace?.workspaceKind || '').trim())
          .filter(Boolean)
      )
      if (kinds.has('sandbox') && kinds.has('host')) return '会话沙盒 + 本机工作区'
      if (kinds.has('host')) return '本机工作区（无系统沙盒）'
    }
    const isolationLabel = result?.sandboxEnforced === true
      ? '系统沙盒'
      : result?.isolationLevel === 'host-workspace'
        ? '本机工作区（无系统沙盒）'
        : '隔离工作区（路径守卫）'
    if (result?.workspaceKind === 'host') {
      const workspacePath = String(result?.workspacePath || '').trim()
      const relativeCwd = String(result?.cwd || '.').trim()
      return [
        workspacePath ? `${isolationLabel}：${workspacePath}` : isolationLabel,
        relativeCwd && relativeCwd !== '.' ? `cwd：${relativeCwd}` : ''
      ].filter(Boolean).join(' · ')
    }
    return `${isolationLabel}：${String(result?.workspaceId || 'default').trim() || 'default'}`
  }
  if (!isAgentRunToolResult(result)) return ''
  const agentName = String(result?.agent?.name || result?.agent?.id || '').trim()
  const traceCount = Array.isArray(result?.trace) ? result.trace.length : 0
  const rounds = Number(result?.metrics?.rounds)
  return [
    agentName ? `智能体：${agentName}` : '',
    traceCount > 0 ? `轨迹步骤：${traceCount}` : '',
    Number.isFinite(rounds) && rounds > 0 ? `轮次：${rounds}` : ''
  ].filter(Boolean).join(' · ')
}

function mergeToolExecutionDisplayMessage(toolDisplay, resultMessage, options = {}) {
  if (!toolDisplay || !isToolMessage(toolDisplay) || !resultMessage) return resultMessage
  const status = options.status || inferToolResultStatus(resultMessage)
  const serverName =
    String(options.toolServerName || resultMessage.toolServerName || toolDisplay.toolServerName || extractServerNameFromToolMeta(resultMessage.toolMeta) || '').trim() || '未知'
  const toolName = String(options.toolName || resultMessage.toolName || toolDisplay.toolName || '').trim()
  const autoApproved = typeof toolDisplay.toolAutoApproved === 'boolean' ? toolDisplay.toolAutoApproved : undefined
  const resultContent = String(resultMessage.content || '').trim()
  const nextPayload =
    options.toolResultPayload ??
    resultMessage.toolResultPayload ??
    toolDisplay.toolResultPayload ??
    null

  toolDisplay.role = 'tool'
  toolDisplay.toolStatus = status
  toolDisplay.toolMeta = String(resultMessage.toolMeta || toolDisplay.toolMeta || '').trim()
  toolDisplay.toolServerName = serverName
  if (toolName) toolDisplay.toolName = toolName
  toolDisplay.toolSubMeta = String(options.toolSubMeta ?? resultMessage.toolSubMeta ?? toolDisplay.toolSubMeta ?? '').trim()
  if (Array.isArray(resultMessage.images)) toolDisplay.images = resultMessage.images
  if (typeof options.toolExpanded === 'boolean') toolDisplay.toolExpanded = options.toolExpanded
  if (isAgentRunToolResult(nextPayload)) {
    const mergedTrace = mergeAgentRunTraceEntries(toolDisplay.toolLiveTrace, nextPayload.trace)
    toolDisplay.toolLiveTrace = mergedTrace
    toolDisplay.toolResultPayload = { ...nextPayload, trace: mergedTrace }
    const payloadAgentName = String(nextPayload?.agent?.name || nextPayload?.agent?.id || '').trim()
    if (payloadAgentName) toolDisplay.toolAgentName = payloadAgentName
    const payloadFinalContent = String(nextPayload?.final?.content || nextPayload?.summary || '').trim()
    const payloadFinalReasoning = String(nextPayload?.final?.reasoning || '').trim()
    if (payloadFinalContent) toolDisplay.toolLiveFinalContent = payloadFinalContent
    else toolDisplay.toolLiveFinalContent = String(toolDisplay.toolLiveFinalContent || '').trim()
    if (payloadFinalReasoning) toolDisplay.toolLiveFinalReasoning = payloadFinalReasoning
    else toolDisplay.toolLiveFinalReasoning = String(toolDisplay.toolLiveFinalReasoning || '').trim()
    toolDisplay.toolLiveRound = Number(nextPayload?.metrics?.rounds) || toolDisplay.toolLiveRound || 0
  } else {
    toolDisplay.toolResultPayload = nextPayload && typeof nextPayload === 'object' ? nextPayload : null
  }
  toolDisplay.content = buildToolExecutionMessageContent({
    serverName,
    toolName: toolDisplay.toolName,
    argsText: toolDisplay.toolArgsText || '{}',
    autoApproved,
    status,
    resultContent,
    traceItems: Array.isArray(toolDisplay.toolLiveTrace) ? toolDisplay.toolLiveTrace : [],
    errorText: options.errorText || ''
  })
  if (!isLiveToolMessageStatus(status) && toolDisplay.toolTraceStreamId) {
    activeAgentRunToolMessageByStreamId.delete(toolDisplay.toolTraceStreamId)
  }
  scheduleRefreshUserAnchorMeta()
  return toolDisplay
}

function maybeCoalesceLatestToolMessages() {
  const list = session?.messages
  if (!Array.isArray(list) || list.length < 2) return
  const latest = list[list.length - 1]
  if (!latest || String(latest.role || '').trim() !== 'tool') return

  for (let i = list.length - 2; i >= 0; i -= 1) {
    const candidate = list[i]
    if (!isToolMessage(candidate)) break
    if (!canCoalesceToolResultIntoPending(candidate, latest)) continue

    mergeToolExecutionDisplayMessage(candidate, latest)
    list.splice(list.length - 1, 1)
    return
  }
}

function canCoalesceToolResultIntoPending(pending, result) {
  if (!pending || !result) return false
  if (!isToolMessage(pending) || String(result.role || '').trim() !== 'tool') return false
  const pendingRole = String(pending.role || '').trim()
  const pendingStatus = getToolMessageStatus(pending)
  if (!isLiveToolMessageStatus(pendingStatus) && pendingRole !== 'tool_call') return false

  const pendingExecutionId = String(pending.toolExecutionId || '').trim()
  const resultExecutionId = String(result.toolExecutionId || '').trim()
  if (pendingExecutionId || resultExecutionId) return !!pendingExecutionId && pendingExecutionId === resultExecutionId

  const pendingTraceStreamId = String(pending.toolTraceStreamId || '').trim()
  const resultTraceStreamId = String(result.toolTraceStreamId || '').trim()
  if (pendingTraceStreamId || resultTraceStreamId) return !!pendingTraceStreamId && pendingTraceStreamId === resultTraceStreamId

  const pendingCallId = String(pending.toolCallId || '').trim()
  const resultCallId = String(result.toolCallId || '').trim()
  if (pendingCallId || resultCallId) return pendingCallId && resultCallId && pendingCallId === resultCallId

  return false
}

function coalesceToolExecutionDisplayMessages(messages = []) {
  const out = []
  for (const msg of Array.isArray(messages) ? messages : []) {
    if (String(msg?.role || '').trim() === 'tool') {
      let merged = false
      for (let i = out.length - 1; i >= 0; i -= 1) {
        const candidate = out[i]
        if (!isToolMessage(candidate)) break
        if (!canCoalesceToolResultIntoPending(candidate, msg)) continue

        mergeToolExecutionDisplayMessage(candidate, msg)
        merged = true
        break
      }
      if (merged) continue
    }
    out.push(msg)
  }
  return out
}

const activeAgentRunToolMessageByStreamId = new Map()
const pendingBuiltinAgentsEventsByStreamId = new Map()
const BUILTIN_AGENTS_EVENT_FLUSH_INTERVAL_MS = 80
const MAX_PENDING_BUILTIN_AGENTS_EVENT_RETRIES = 100
let pendingBuiltinAgentsEventsFlushTimer = null

function enqueueMemorySessionApprovalRequest(record, request) {
  if (!record || !request || typeof request !== 'object') return null
  if (!Array.isArray(record.pendingApprovalRequests)) record.pendingApprovalRequests = []
  const requestId = String(request.requestId || '').trim()
  if (!requestId) return null
  const existing = record.pendingApprovalRequests.find((item) => String(item?.requestId || '').trim() === requestId)
  if (existing) return existing
  const next = {
    requestId,
    serverName: String(request.serverName || '').trim(),
    serverId: String(request.serverId || '').trim(),
    toolName: String(request.toolName || '').trim(),
    argsText: String(request.argsText || '{}').trim() || '{}',
    reasoningText: String(request.reasoningText || '').trim(),
    approvalKind:
      request.approvalKind === 'shell'
        ? 'shell'
        : request.approvalKind === 'execution'
          ? 'execution'
          : 'tool',
    forceApproval: request.forceApproval === true,
    hardApproval: request.hardApproval === true,
    approvalKey: String(request.approvalKey || '').trim(),
    streamId: String(request.streamId || '').trim(),
    agentName: String(request.agentName || '').trim(),
    extraLines: Array.isArray(request.extraLines) ? request.extraLines.map((line) => String(line || '').trim()).filter(Boolean) : [],
    createdAt: Date.now()
  }
  record.pendingApprovalRequests = [...record.pendingApprovalRequests, next]
  record.updatedAt = Date.now()
  return next
}

function removeMemorySessionApprovalRequest(record, requestId) {
  if (!record || !Array.isArray(record.pendingApprovalRequests)) return null
  const id = String(requestId || '').trim()
  if (!id) return null
  const existing = record.pendingApprovalRequests.find((item) => String(item?.requestId || '').trim() === id) || null
  if (!existing) return null
  record.pendingApprovalRequests = record.pendingApprovalRequests.filter((item) => String(item?.requestId || '').trim() !== id)
  record.updatedAt = Date.now()
  return existing
}

async function flushMemorySessionApprovalQueue(record) {
  if (!record || !isMemorySessionActive(record) || record.approvalPromptActive === true) return false
  const queue = Array.isArray(record.pendingApprovalRequests) ? record.pendingApprovalRequests : []
  const nextRequest = queue[0]
  if (!nextRequest) return false

  const approvalDecision = evaluateToolApproval({
    mode: normalizeToolApprovalMode(
      record.toolApprovalMode,
      record.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : TOOL_APPROVAL_MODE_SAFE
    ),
    forceApproval: nextRequest.forceApproval === true,
    hardApproval: nextRequest.hardApproval === true,
    interactive: true
  })
  if (
    (nextRequest.approvalKey && sessionApprovedToolKeys.has(nextRequest.approvalKey)) ||
    approvalDecision.action === 'allow'
  ) {
    removeMemorySessionApprovalRequest(record, nextRequest.requestId)
    dispatchBuiltinAgentsToolApprovalResponse(nextRequest.requestId, true)
    window.setTimeout(() => {
      void flushMemorySessionApprovalQueue(record)
    }, 0)
    return true
  }

  record.approvalPromptActive = true
  try {
    const approved = await confirmToolCall({
      serverName: nextRequest.serverName,
      toolName: nextRequest.toolName,
      argsText: nextRequest.argsText,
      reasoningText: nextRequest.reasoningText,
      abortState: createAbortAwareDialogStateFromController(getMemorySessionById(record.id)?.activeRequestAbortState || abortController.value || null),
      titleText: '确认子 Agent 工具调用',
      extraLines: nextRequest.extraLines,
      sessionId: record.id,
      sessionTitle: resolveMemorySessionTitle(record),
      approvalKind: nextRequest.approvalKind,
      hardApproval: nextRequest.hardApproval === true,
      rememberText:
        nextRequest.approvalKind === 'shell'
          ? '本会话允许相同命令'
          : nextRequest.approvalKind === 'execution'
            ? '本会话允许相同脚本调用'
            : '本会话允许此工具',
      onRememberForSession:
        nextRequest.approvalKey
          ? () => sessionApprovedToolKeys.add(nextRequest.approvalKey)
          : null
    })
    removeMemorySessionApprovalRequest(record, nextRequest.requestId)
    dispatchBuiltinAgentsToolApprovalResponse(nextRequest.requestId, approved)
    if (approved === null) return true
  } finally {
    record.approvalPromptActive = false
  }

  if (getMemorySessionPendingApprovalCount(record) > 0) {
    window.setTimeout(() => {
      void flushMemorySessionApprovalQueue(record)
    }, 0)
  }
  return true
}

function resolveActiveAgentRunToolMessage(streamId) {
  const id = String(streamId || '').trim()
  if (!id) return null
  const direct = activeAgentRunToolMessageByStreamId.get(id)
  if (direct) return direct
  const activeHit = (session.messages || []).find((msg) => String(msg?.toolTraceStreamId || '').trim() === id)
  if (activeHit) return activeHit
  for (const record of Array.isArray(memorySessions.value) ? memorySessions.value : []) {
    const recordHit = (record?.messages || []).find((msg) => String(msg?.toolTraceStreamId || '').trim() === id)
    if (recordHit) return recordHit
  }
  return null
}

function updateAgentRunToolMessageTraceBatch(streamId, entries) {
  const id = String(streamId || '').trim()
  const nextEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === 'object')
  if (!id || !nextEntries.length) return

  const messageRef = resolveActiveAgentRunToolMessage(id)
  if (!messageRef || !isToolMessage(messageRef)) return

  const current = Array.isArray(messageRef.toolLiveTrace) ? messageRef.toolLiveTrace : []
  const mergedTrace = mergeAgentRunTraceEntries(current, nextEntries)
  if (mergedTrace.length === current.length) {
    const latest = nextEntries[nextEntries.length - 1]
    const latestAgentName = String(latest?.agent_name || '').trim()
    if (latestAgentName && !messageRef.toolAgentName) messageRef.toolAgentName = latestAgentName
    return
  }

  messageRef.toolLiveTrace = mergedTrace
  const latestEntry = nextEntries[nextEntries.length - 1]
  const agentName = String(latestEntry?.agent_name || messageRef.toolAgentName || '').trim()
  if (agentName) messageRef.toolAgentName = agentName
  const isAgentRun = String(messageRef.toolName || '').trim() === 'agent_run'
  const isExpanded = messageRef.toolExpanded === true
  const subMeta = [
    messageRef.toolAgentName ? `智能体：${messageRef.toolAgentName}` : '',
    (!isAgentRun || isExpanded) && mergedTrace.length ? `${mergedTrace.length} 个轨迹步骤` : ''
  ].filter(Boolean).join(' · ')
  messageRef.toolSubMeta = subMeta
  const traceItemsForDisplay = isAgentRun && !isExpanded ? [] : mergedTrace
  const currentStatus = normalizeToolMessageStatus(getToolMessageStatus(messageRef)) || 'running'
  messageRef.content = buildToolExecutionMessageContent({
    serverName: messageRef.toolServerName || extractServerNameFromToolMeta(messageRef.toolMeta),
    toolName: messageRef.toolName,
    argsText: messageRef.toolArgsText || '{}',
    autoApproved: messageRef.toolAutoApproved,
    status: currentStatus,
    traceItems: traceItemsForDisplay
  })
  if (isExpanded) scheduleRefreshUserAnchorMeta()
  maybeScheduleStreamingScroll()
}

function updateAgentRunToolMessageLiveUpdate(streamId, live) {
  const id = String(streamId || '').trim()
  if (!id || !live || typeof live !== 'object') return

  const messageRef = resolveActiveAgentRunToolMessage(id)
  if (!messageRef || !isToolMessage(messageRef)) return

  if (live.reset === true) {
    messageRef.toolLiveFinalContent = ''
    messageRef.toolLiveFinalReasoning = ''
  }

  if (Object.prototype.hasOwnProperty.call(live, 'content')) {
    messageRef.toolLiveFinalContent = String(live.content || '')
  }
  if (Object.prototype.hasOwnProperty.call(live, 'reasoning')) {
    messageRef.toolLiveFinalReasoning = String(live.reasoning || '')
  }
  if (Object.prototype.hasOwnProperty.call(live, 'round')) {
    messageRef.toolLiveRound = Number(live.round) || 0
  }

  const nextPayload =
    isAgentRunToolResult(messageRef.toolResultPayload)
      ? { ...messageRef.toolResultPayload }
      : { kind: 'agent_run_result', status: 'running', trace: [] }
  const liveStatus = normalizeToolMessageStatus(live.status)
  const payloadStatus = normalizeToolMessageStatus(nextPayload.status)
  const nextStatus = liveStatus || (live.reset === true ? 'running' : payloadStatus || 'running')
  nextPayload.status = nextStatus
  nextPayload.final = {
    content: String(messageRef.toolLiveFinalContent || ''),
    reasoning: String(messageRef.toolLiveFinalReasoning || '')
  }
  nextPayload.summary = nextPayload.final.content
  nextPayload.trace = Array.isArray(messageRef.toolLiveTrace) ? messageRef.toolLiveTrace : []
  messageRef.toolResultPayload = nextPayload
  messageRef.toolStatus = nextStatus

  if (messageRef.toolExpanded === true) scheduleRefreshUserAnchorMeta()
  maybeScheduleStreamingScroll()
}

function mergeAgentRunLivePayload(base, incoming) {
  const merged = base && typeof base === 'object' ? { ...base } : {}
  const next = incoming && typeof incoming === 'object' ? incoming : {}
  if (next.reset === true) {
    merged.reset = true
    merged.status = Object.prototype.hasOwnProperty.call(next, 'status') ? next.status : 'running'
  } else if (Object.prototype.hasOwnProperty.call(next, 'status')) {
    merged.status = next.status
  }
  if (Object.prototype.hasOwnProperty.call(next, 'content')) merged.content = next.content
  if (Object.prototype.hasOwnProperty.call(next, 'reasoning')) merged.reasoning = next.reasoning
  if (Object.prototype.hasOwnProperty.call(next, 'round')) merged.round = next.round
  return merged
}

function applyPendingBuiltinAgentsEventBucket(streamId, bucket) {
  const id = String(streamId || '').trim()
  if (!id || !bucket) return false

  const messageRef = resolveActiveAgentRunToolMessage(id)
  if (!messageRef || !isToolMessage(messageRef)) return false

  if (Array.isArray(bucket.entries) && bucket.entries.length) {
    updateAgentRunToolMessageTraceBatch(id, bucket.entries)
  }
  if (bucket.live && typeof bucket.live === 'object') {
    updateAgentRunToolMessageLiveUpdate(id, bucket.live)
  }
  if (bucket.done === true) activeAgentRunToolMessageByStreamId.delete(id)
  return true
}

function flushPendingBuiltinAgentsEvents() {
  pendingBuiltinAgentsEventsFlushTimer = null
  if (!pendingBuiltinAgentsEventsByStreamId.size) return

  const pending = Array.from(pendingBuiltinAgentsEventsByStreamId.entries())
  pendingBuiltinAgentsEventsByStreamId.clear()
  pending.forEach(([streamId, bucket]) => {
    if (!streamId || !bucket) return
    if (!applyPendingBuiltinAgentsEventBucket(streamId, bucket)) {
      const retries = Number(bucket?.retries) || 0
      if (retries < MAX_PENDING_BUILTIN_AGENTS_EVENT_RETRIES) {
        pendingBuiltinAgentsEventsByStreamId.set(streamId, {
          entries: Array.isArray(bucket.entries) ? bucket.entries.slice() : [],
          live: bucket.live && typeof bucket.live === 'object' ? { ...bucket.live } : null,
          done: bucket.done === true,
          retries: retries + 1
        })
      }
    }
  })
  if (pendingBuiltinAgentsEventsByStreamId.size) {
    schedulePendingBuiltinAgentsEventsFlush()
  }
}

function schedulePendingBuiltinAgentsEventsFlush() {
  if (pendingBuiltinAgentsEventsFlushTimer) return
  pendingBuiltinAgentsEventsFlushTimer = window.setTimeout(
    flushPendingBuiltinAgentsEvents,
    BUILTIN_AGENTS_EVENT_FLUSH_INTERVAL_MS
  )
}

function handleBuiltinAgentsTraceEvent(event) {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  const streamId = String(detail.streamId || '').trim()
  const entry = detail.entry && typeof detail.entry === 'object' ? detail.entry : null
  const live = detail.live && typeof detail.live === 'object' ? detail.live : null
  if (!streamId) return
  const prev = pendingBuiltinAgentsEventsByStreamId.get(streamId) || { entries: [], live: null, done: false, retries: 0 }
  const next = {
    entries: Array.isArray(prev.entries) ? prev.entries.slice() : [],
    live: prev.live && typeof prev.live === 'object' ? { ...prev.live } : null,
    done: prev.done === true,
    retries: Number(prev.retries) || 0
  }
  if (entry) next.entries.push(entry)
  if (live) next.live = mergeAgentRunLivePayload(next.live, live)
  if (detail.done === true) next.done = true
  pendingBuiltinAgentsEventsByStreamId.set(streamId, next)
  if (applyPendingBuiltinAgentsEventBucket(streamId, next)) {
    pendingBuiltinAgentsEventsByStreamId.delete(streamId)
    return
  }
  schedulePendingBuiltinAgentsEventsFlush()
}

function prepareBuiltinAgentToolCallArgs(skillId, toolName, argsObj, pendingMessage) {
  const nextArgs = argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? { ...argsObj } : {}
  delete nextArgs.__host_workspace_path

  const normalizedSkillId = String(skillId || '').trim()
  const normalizedToolName = String(toolName || '').trim()
  if (
    normalizedSkillId === BUILTIN_SHELL_SKILL_ID &&
    [
      'sandbox_status',
      'sandbox_run',
      'bash_run',
      'sandbox_read_file',
      'sandbox_write_file',
      'sandbox_import',
      'sandbox_export',
      'sandbox_list',
      'sandbox_reset'
    ].includes(normalizedToolName)
  ) {
    const targetRecord = getRunRecord(
      pendingMessage?.toolAbortState || abortController.value || null
    ) || getActiveMemorySession()
    const sessionId = targetRecord?.id || activeMemorySessionId.value || 'default'
    if (normalizedToolName === 'sandbox_import' || normalizedToolName === 'sandbox_reset') {
      return withDefaultChatSandboxWorkspaceId(nextArgs, sessionId)
    }
    const workspacePath = resolveSessionHostWorkspacePath(targetRecord)
    if (normalizedToolName === 'sandbox_export') {
      const routedArgs = withDefaultChatSandboxWorkspaceId(nextArgs, sessionId)
      if (workspacePath) routedArgs.__host_workspace_path = workspacePath
      return routedArgs
    }
    const workspaceScope = resolveChatToolWorkspaceScope(
      normalizedToolName,
      nextArgs,
      { hasHostWorkspace: !!workspacePath }
    )
    const routedArgs = withDefaultChatSandboxWorkspaceId(
      {
        ...nextArgs,
        workspace_scope: workspaceScope
      },
      sessionId
    )
    if (workspacePath && (workspaceScope === 'host' || workspaceScope === 'all')) {
      routedArgs.__host_workspace_path = workspacePath
    }
    return routedArgs
  }

  const isBuiltinAgentsSkill = normalizedSkillId === BUILTIN_AGENT_ORCHESTRATION_SKILL_ID
  if (!isBuiltinAgentsSkill || !isAgentRunToolName(toolName)) return nextArgs

  const streamId = String(pendingMessage?.toolTraceStreamId || pendingMessage?.id || '').trim()
  const approvalMode = resolveCurrentToolApprovalMode(
    pendingMessage?.toolAbortState || abortController.value || null
  )
  if (streamId) {
    // Keep legacy/internal key and a plain key to avoid middleware stripping prefixed fields.
    nextArgs.__trace_stream_id = streamId
    nextArgs.trace_stream_id = streamId
  }
  // Keep legacy/internal key and a plain key for better cross-provider compatibility.
  nextArgs.__tool_approval_mode = approvalMode
  nextArgs.tool_approval_mode = approvalMode

  if (pendingMessage) {
    pendingMessage.toolTraceStreamId = streamId
    pendingMessage.toolApprovalMode = approvalMode
    if (streamId) activeAgentRunToolMessageByStreamId.set(streamId, pendingMessage)
    if (streamId && pendingBuiltinAgentsEventsByStreamId.has(streamId)) {
      flushPendingBuiltinAgentsEvents()
    }
  }

  return nextArgs
}

function dispatchBuiltinAgentsToolApprovalResponse(requestId, approved) {
  const id = String(requestId || '').trim()
  if (!id || !window?.dispatchEvent || typeof window.CustomEvent !== 'function') return
  try {
    window.dispatchEvent(
      new window.CustomEvent(BUILTIN_AGENTS_TOOL_APPROVAL_RESPONSE_EVENT, {
        detail: {
          requestId: id,
          approved: approved === true ? true : approved === false ? false : null
        }
      })
    )
  } catch {
    // ignore
  }
}

function createAbortAwareDialogStateFromController(controller = null) {
  if (controller?.onAbort) {
    return {
      onAbort(listener) {
        if (typeof listener !== 'function') return null
        return controller.onAbort(listener)
      }
    }
  }
  const signal = controller?.signal
  if (!signal?.addEventListener) return null
  return {
    onAbort(listener) {
      if (typeof listener !== 'function') return null
      const handler = () => listener()
      signal.addEventListener('abort', handler, { once: true })
      return () => {
        try {
          signal.removeEventListener('abort', handler)
        } catch {
          // ignore
        }
      }
    }
  }
}

async function handleBuiltinAgentsToolApprovalRequest(event) {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  const requestId = String(detail.requestId || '').trim()
  if (!requestId) return

  const serverId = String(detail.serverId || '').trim()
  const serverName = String(detail.serverName || serverId || '').trim() || '未知'
  const toolName = String(detail.toolName || '').trim() || 'unknown'
  const argsText = String(detail.argsText || '{}').trim() || '{}'
  const reasoningText = String(detail.reasoningText || '').trim()
  const agentName = String(detail.agentName || '').trim()
  const extraLines = agentName ? ['智能体：' + agentName] : []

  const streamId = String(detail.streamId || detail.traceStreamId || detail.trace_stream_id || '').trim()
  const relatedToolMessage = streamId ? resolveActiveAgentRunToolMessage(streamId) : null
  const targetRecord = relatedToolMessage ? getMemorySessionForToolMessage(relatedToolMessage) : getActiveMemorySession()
  const approvalKind =
    detail.approvalKind === 'shell'
      ? 'shell'
      : detail.approvalKind === 'execution'
        ? 'execution'
        : 'tool'
  const forceApproval =
    detail.forceApproval === true ||
    approvalKind === 'shell'
  const hardApproval =
    detail.hardApproval === true ||
    approvalKind === 'shell' ||
    approvalKind === 'execution'
  const approvalKey = buildSessionToolApprovalKey({
    sessionId: String(targetRecord?.id || 'chat'),
    serverId,
    serverName,
    toolName,
    approvalKind,
    argsText
  })
  const inheritedMode = normalizeToolApprovalMode(
    targetRecord?.toolApprovalMode,
    targetRecord?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
  )
  const autoApproved =
    sessionApprovedToolKeys.has(approvalKey) ||
    evaluateToolApproval({
      mode: inheritedMode,
      forceApproval,
      hardApproval,
      interactive: true
    }).action === 'allow'

  let approved = null
  if (autoApproved) {
    approved = true
  } else {
    enqueueMemorySessionApprovalRequest(targetRecord, {
      requestId,
      serverId,
      serverName,
      toolName,
      argsText,
      reasoningText,
      approvalKind,
      forceApproval,
      hardApproval,
      approvalKey,
      streamId,
      agentName,
      extraLines
    })
    if (isMemorySessionActive(targetRecord)) {
      await flushMemorySessionApprovalQueue(targetRecord)
    }
    return
  }

  dispatchBuiltinAgentsToolApprovalResponse(requestId, approved)
}

function downloadChatImage(img) {
  const src = String(img?.src || '').trim()
  if (!src) return

  const triggerDownload = (href, filename) => {
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const filename = ensureFilenameExt(img?.name, img?.mime)

  if (src.startsWith('data:')) {
    try {
      triggerDownload(src, filename)
      return
    } catch (err) {
      message.error('下载失败：' + (err?.message || String(err)))
      return
    }
  }

  if (/^blob:/i.test(src)) {
    try {
      triggerDownload(src, filename)
      return
    } catch (err) {
      message.error('下载失败：' + (err?.message || String(err)))
      return
    }
  }

  if (/^https?:\/\//i.test(src)) {
    loadChatImageBlob(img)
      .then((blob) => {
        const mime = normalizeClipboardMediaMime(blob.type || img?.mime, 'image/png', 'image/') || 'image/png'
        const downloadableBlob = withPreferredBlobMime(blob, mime)
        const objectUrl = URL.createObjectURL(downloadableBlob)
        try {
          triggerDownload(objectUrl, ensureFilenameExt(img?.name, mime))
        } finally {
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200)
        }
      })
      .catch((err) => {
        copyChatImageLink(img)
        safeOpenExternal(src)
        message.info('已复制图片链接。如无法直接下载，请在浏览器中打开后再保存。' + ((err && err.message) ? `（${err.message}）` : ''))
      })
    return
  }

  message.warning('暂不支持下载该图片来源')
}

function downloadChatVideo(video) {
  const src = String(video?.src || '').trim()
  if (!src) return

  const triggerDownload = (href, filename) => {
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const fallbackName = String(video?.name || '').trim() || `video_${Date.now()}`
  const filename = ensureFilenameExt(fallbackName, video?.mime || 'video/mp4')

  if (src.startsWith('data:')) {
    try {
      triggerDownload(src, filename)
      return
    } catch (err) {
      message.error('下载失败：' + (err?.message || String(err)))
      return
    }
  }

  if (/^blob:/i.test(src)) {
    try {
      triggerDownload(src, filename)
      return
    } catch (err) {
      message.error('下载失败：' + (err?.message || String(err)))
      return
    }
  }

  if (/^https?:\/\//i.test(src)) {
    loadChatVideoBlob(video)
      .then((blob) => {
        const mime = normalizeClipboardMediaMime(blob.type || video?.mime, 'video/mp4', 'video/') || 'video/mp4'
        const downloadableBlob = withPreferredBlobMime(blob, mime)
        const objectUrl = URL.createObjectURL(downloadableBlob)
        try {
          triggerDownload(objectUrl, ensureFilenameExt(fallbackName, mime))
        } finally {
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200)
        }
      })
      .catch((err) => {
        copyChatVideoLink(video)
        safeOpenExternal(src)
        message.info('已复制视频链接。如无法直接下载，请在浏览器中打开后再保存。' + ((err && err.message) ? `（${err.message}）` : ''))
      })
    return
  }

  message.warning('暂不支持下载该视频来源')
}

function updateChatImageMetadata(img, event) {
  if (!img || typeof img !== 'object') return
  const el = event?.target
  if (!(el instanceof HTMLImageElement)) return
  const width = normalizeMediaDimension(el.naturalWidth || el.width)
  const height = normalizeMediaDimension(el.naturalHeight || el.height)
  let changed = false
  if (width > 0 && !normalizeMediaDimension(img.width)) {
    img.width = width
    changed = true
  }
  if (height > 0 && !normalizeMediaDimension(img.height)) {
    img.height = height
    changed = true
  }
  if (changed) {
    img.resolution = `${normalizeMediaDimension(img.width)}x${normalizeMediaDimension(img.height)}`
    img.metaLine = ''
    bumpChatMessageMetricsVersion()
    scheduleRefreshUserAnchorMeta()
  }
}

function updateChatVideoMetadata(video, event) {
  if (!video || typeof video !== 'object') return
  const el = event?.target
  if (!(el instanceof HTMLVideoElement)) return
  const width = normalizeMediaDimension(el.videoWidth)
  const height = normalizeMediaDimension(el.videoHeight)
  const duration = Number(el.duration)
  let changed = false
  if (width > 0 && !normalizeMediaDimension(video.width)) {
    video.width = width
    changed = true
  }
  if (height > 0 && !normalizeMediaDimension(video.height)) {
    video.height = height
    changed = true
  }
  if (Number.isFinite(duration) && duration > 0 && !(Number(video.durationSeconds) > 0)) {
    video.durationSeconds = duration
    changed = true
  }
  if (changed) {
    if (normalizeMediaDimension(video.width) && normalizeMediaDimension(video.height)) {
      video.resolution = `${normalizeMediaDimension(video.width)}x${normalizeMediaDimension(video.height)}`
    }
    video.metaLine = ''
    bumpChatMessageMetricsVersion()
    scheduleRefreshUserAnchorMeta()
  }
}

const assistantMediaHelpers = {
  assistantImageTaskTitle,
  assistantImageTaskTagType,
  assistantImageTaskStatusLabel,
  assistantImagePromptLabel,
  assistantImageTaskMetaLabel,
  assistantImageTaskNote,
  assistantVisibleImages,
  assistantVisibleImageCount,
  assistantImageBlockEyebrow,
  assistantImageDisplayTitle,
  assistantImagePlaceholderText,
  assistantImageInsightLabel,
  assistantVisibleVideos,
  assistantVisibleVideoCount,
  assistantVideoBlockEyebrow,
  assistantVideoDisplayTitle,
  assistantVideoTaskTitle,
  assistantVideoTaskTagType,
  assistantVideoTaskStatusLabel,
  assistantVideoTaskMetaLabel,
  assistantVideoTaskNote,
  assistantVideoPromptLabel,
  assistantVideoPlaceholderText,
  assistantVideoInsightLabel,
  canRegenerateMedia,
  canResumeMediaTask,
  isMediaTaskResuming,
  imageMetaLabel,
  videoMetaLabel
}

const assistantMediaActions = {
  copyChatImage,
  downloadChatImage,
  copyChatVideo,
  downloadChatVideo,
  regenerateMedia,
  resumeMediaTask,
  updateChatImageMetadata,
  updateChatVideoMetadata
}

const userAttachmentHelpers = {
  countImageAttachments,
  countFileAttachments,
  listDisplayAttachments,
  attachmentCardTitle,
  attachmentIcon,
  attachmentMetaSummary,
  imageMetaLabel,
  imageInsightLabel
}

const userAttachmentActions = {
  toggleAttachmentsExpanded,
  downloadChatImage,
  copyChatImage
}

const toolMessageHelpers = {
  toolMessageLabel,
  getToolMessageStatus,
  toolMessageStatusLabel,
  toolActivityIcon,
  toolActivityMeta,
  toolActivitySource,
  toolActivityToolName,
  shouldShowToolActivityStatus,
  imageMetaLabel,
  imageInsightLabel,
  shouldRenderHeavyChatMessage,
  truncateInlineText
}

const toolMessageActions = {
  toggleToolExpanded,
  downloadChatImage,
  copyChatImage,
  openChatWorkspaceResultFile,
  saveChatWorkspaceResultFile,
  scheduleScrollToBottom,
  showChatWorkspaceResultFile
}

const toolActivityGroupHelpers = {
  getToolMessageStatus,
  shouldRenderCompactToolMessage,
  shouldShowToolActivityStatus,
  toolActivityIcon,
  toolActivityMeta,
  toolMessageLabel,
  toolMessageStatusLabel
}

const toolActivityGroupActions = {
  toggleGroup: toggleToolActivityGroup,
  toggleToolExpanded
}

const pendingAttachmentHelpers = {
  attachmentStatusText,
  imageMetaLabel,
  imageInsightLabel,
  attachmentCardTitle,
  attachmentIcon,
  attachmentMetaSummary
}

const pendingAttachmentActions = {
  removeAttachment
}

const contextWindowPreviewHelpers = {
  modeType: contextWindowPreviewModeType,
  modeLabel: contextWindowPreviewModeLabelV2,
  entryLabel: contextWindowPreviewEntryLabel,
  entryNote: contextWindowPreviewEntryNoteV2,
  omittedReasonType: contextWindowPreviewOmittedReasonType,
  omittedReasonLabel: contextWindowPreviewOmittedReasonLabel,
  formatApproxChars
}

function roleIcon(messageOrRole) {
  const msg = messageOrRole && typeof messageOrRole === 'object' ? messageOrRole : null
  const role = String(msg?.role || messageOrRole || '').trim()
  if (role === 'user') return PersonCircleOutline
  if (role === 'assistant') return SparklesOutline
  if (role === 'thinking') return ChatbubbleEllipsesOutline
  if (role === 'tool_call' || role === 'tool') {
    const status = getToolMessageStatus(msg || { role })
    if (status === 'running') return RefreshOutline
    if (status === 'paused') return PauseCircleOutline
    if (status === 'error') return CloseOutline
    if (status === 'rejected') return ShieldOutline
    return HardwareChipOutline
  }
  return ChatbubbleEllipsesOutline
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleString()
  } catch {
    return ''
  }
}

function toggleThinking(msg) {
  if (!msg) return
  msg.thinkingExpanded = !msg.thinkingExpanded
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
}

function toggleToolExpanded(msg) {
  if (!msg || (msg.role !== 'tool' && msg.role !== 'tool_call')) return
  msg.toolExpanded = !msg.toolExpanded
  if (msg.toolExpanded) scheduleScrollToBottom()
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
}

function toggleAttachmentsExpanded(msg) {
  if (!msg || msg.role !== 'user') return
  msg.attachmentsExpanded = !msg.attachmentsExpanded
  if (msg.attachmentsExpanded) scheduleScrollToBottom()
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
}

const autoScrollEnabled = ref(true)
const autoScrollSuspendedByUser = ref(false)
const isAtBottom = ref(true)
const SCROLL_BOTTOM_THRESHOLD_PX = 12
const SCROLL_AUTO_DISABLE_DISTANCE_PX = 160

const chatScrollEl = ref(null)
const chatListRef = ref(null)
const chatScrollTop = ref(0)
const chatViewportHeight = ref(0)
const chatScrollDistanceFromBottom = ref(Number.POSITIVE_INFINITY)
const isChatScrollable = ref(false)
const expandedToolActivityGroupIds = ref(new Set())
const visibleHeavyChatMessageIds = ref(new Set())
const hydratedHeavyChatMessageIds = ref(new Set())
const chatSessionOpeningHeavyRender = ref(false)
const chatMessageMetricsVersion = ref(0)
const recentHeavyChatMessageIds = computed(() => {
  const ids = new Set()
  const tail = Array.isArray(session.messages) ? session.messages.slice(-CHAT_RECENT_HEAVY_RENDER_COUNT) : []
  tail.forEach((msg) => {
    const id = String(msg?.id || '').trim()
    if (id) ids.add(id)
  })
  return ids
})
const chatHeavyRenderTuning = computed(() => resolveChatHeavyRenderTuning(session.messages?.length || 0))

function resolveCurrentHeavyRenderViewportBuffer(extra = 0) {
  return Math.max(0, Number(chatHeavyRenderTuning.value.viewportBuffer || 0) + Math.max(0, Number(extra) || 0))
}

let chatLayoutResizeObserver = null
let chatMessageVisibilityObserver = null
let chatMessageResizeObserver = null
const chatMessageElMap = new Map()
const chatMessageHeightCache = new Map()
const chatMessageEstimatedHeightCache = new Map()
const chatMessageByIdMap = new Map()
const intersectingHeavyChatMessageIds = new Set()
const pendingChatItemHeightMeasureMap = new Map()
let pendingChatItemHeightMeasureRafId = 0
let pendingChatScrollCompensationPx = 0
let pendingChatScrollCompensationRafId = 0
let lastProcessedChatScrollTop = 0
let didProcessChatScroll = false
let programmaticChatScrollUntil = 0
let programmaticChatScrollTop = Number.NaN
let userChatScrollActiveUntil = 0
let sessionResetPromise = null

function estimateChatMessageHeight(msg) {
  const fixedHeight = getFixedCompactChatMessageHeight(msg)
  if (fixedHeight) return fixedHeight
  if (isAssistantActivityMessage(msg) && !msg?.thinkingExpanded) return CHAT_ASSISTANT_ACTIVITY_ITEM_HEIGHT
  const role = String(msg?.role || '')
  if (role === 'tool_group') {
    const children = Array.isArray(msg?.toolGroupMessages) ? msg.toolGroupMessages : []
    return 42 + children.reduce(
      (height, child) => height + (child?.toolExpanded ? estimateChatMessageHeight(child) : CHAT_TOOL_COMPACT_ITEM_FIXED_HEIGHT),
      0
    )
  }
  const attachmentCount = Array.isArray(msg?.attachments) ? msg.attachments.length : 0
  const thinkingLength = String(msg?.thinking || '').length
  const isToolRole = role === 'tool_call' || role === 'tool'
  const toolCollapsed = isToolRole && !msg?.toolExpanded
  if (toolCollapsed) return estimateCollapsedToolMessageHeight(msg)
  const content = isUserMessageCollapsed(msg) ? userMessagePreview(msg) : String(msg?.content || '')
  const base = isToolRole ? 168 : role === 'assistant' ? 156 : 140
  const contentExtra = estimateChatMessageContentHeight(content)
  const attachmentExtra = attachmentCount * 76
  const thinkingExtra = msg?.thinkingExpanded ? Math.min(320, Math.ceil(thinkingLength / 10)) : 0
  return Math.max(112, base + contentExtra + attachmentExtra + thinkingExtra)
}

function getChatMessageMinimumHeight(msg) {
  const fixedHeight = getFixedCompactChatMessageHeight(msg)
  if (fixedHeight) return fixedHeight
  if (isAssistantActivityMessage(msg) && !msg?.thinkingExpanded) return CHAT_ASSISTANT_ACTIVITY_ITEM_HEIGHT
  return CHAT_DEFAULT_MIN_MESSAGE_HEIGHT
}

function getChatMessageMeasuredHeight(msg, rawHeight) {
  return resolveChatVirtualItemHeight({
    measuredHeight: rawHeight,
    estimatedHeight: getEstimatedChatMessageHeight(msg),
    minimumHeight: getChatMessageMinimumHeight(msg),
    fallbackHeight: CHAT_DEFAULT_MESSAGE_HEIGHT
  })
}

function getChatMessageGapBefore(previousMsg, currentMsg, index) {
  return resolveChatVirtualItemGap({
    hasPrevious: index > 0,
    previousIsActivity: isChatActivityMessage(previousMsg),
    currentIsActivity: isChatActivityMessage(currentMsg),
    defaultGap: CHAT_LIST_GAP_PX,
    consecutiveActivityGap: CHAT_ACTIVITY_LIST_GAP_PX
  })
}

function getEstimatedChatMessageHeight(msg) {
  const id = String(msg?.id || '').trim()
  if (!id) return estimateChatMessageHeight(msg)
  const role = String(msg?.role || '')
  const contentLength = String(msg?.content || '').length
  const thinkingLength = msg?.thinkingExpanded ? String(msg?.thinking || '').length : 0
  const attachmentCount = Array.isArray(msg?.attachments) ? msg.attachments.length : 0
  const layoutMode = isCompactChatLayout.value ? 'compact' : isDenseChatLayout.value ? 'dense' : 'wide'
  const signature = [
    role,
    contentLength,
    thinkingLength,
    attachmentCount,
    msg?.thinkingExpanded ? 1 : 0,
    msg?.toolExpanded ? 1 : 0,
    msg?.attachmentsExpanded ? 1 : 0,
    msg?.userMessageExpanded ? 1 : 0,
    msg?.toolGroupExpanded ? 1 : 0,
    Array.isArray(msg?.toolGroupMessages)
      ? msg.toolGroupMessages.map((child) => child?.toolExpanded ? '1' : '0').join('')
      : '',
    getToolMessageStatus(msg),
    layoutMode
  ].join('|')
  const cached = chatMessageEstimatedHeightCache.get(id)
  if (cached?.signature === signature) return cached.height

  const height = estimateChatMessageHeight(msg)
  chatMessageEstimatedHeightCache.set(id, { signature, height })
  return height
}

function estimateChatMessageContentHeight(content) {
  const text = String(content || '').replace(/\r\n/g, '\n')
  if (!text) return 0

  const charsPerLine = isCompactChatLayout.value ? 24 : isDenseChatLayout.value ? 30 : 44
  const lines = text.split('\n')
  let estimatedLines = 0
  let blockBonus = 0
  let inCodeFence = false

  lines.forEach((rawLine) => {
    const line = String(rawLine || '')
    const trimmed = line.trim()

    if (!trimmed) {
      estimatedLines += 0.6
      return
    }

    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence
      estimatedLines += 1
      blockBonus += 10
      return
    }

    const effectiveCharsPerLine = inCodeFence ? Math.max(14, charsPerLine - 10) : charsPerLine
    const visualLength = line.length + (inCodeFence ? 6 : 0)
    estimatedLines += Math.max(1, Math.ceil(visualLength / effectiveCharsPerLine))
    if (/^(#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+|\|)/.test(trimmed)) blockBonus += 6
  })

  const lengthFloor = Math.ceil(text.length / 9)
  const lineBased = Math.ceil(estimatedLines * 18) + Math.min(360, blockBonus)
  // 长正文如果估得太矮，首次进入可视区时会触发很大的滚动补偿跳变。
  return Math.min(2400, Math.max(lengthFloor, lineBased))
}

function estimateCollapsedToolMessageHeight(msg) {
  const summary = [
    toolMessageLabel(msg),
    toolMessageStatusLabel(msg),
    String(msg?.toolSubMeta || '').trim(),
    String(msg?.toolMeta || '').trim()
  ].filter(Boolean).join(' · ')
  const charsPerLine = isCompactChatLayout.value ? 26 : isDenseChatLayout.value ? 34 : 48
  const lineCount = Math.max(1, Math.min(4, Math.ceil(summary.length / charsPerLine)))
  const runningExtra = isLiveToolMessageStatus(getToolMessageStatus(msg)) ? 4 : 0
  // 折叠态工具消息只展示一行摘要和时间，不应该按隐藏正文长度估高。
  return 38 + ((lineCount - 1) * 16) + runningExtra
}

function resolveChatMessageById(messageId) {
  const id = String(messageId || '').trim()
  if (!id) return null
  if (chatMessageByIdMap.has(id)) return chatMessageByIdMap.get(id)
  const fallback = (session.messages || []).find((msg) => String(msg?.id || '').trim() === id) || null
  if (fallback) {
    chatMessageByIdMap.set(id, fallback)
    return fallback
  }
  const displayMessage = chatDisplayMessages.value.find((msg) => String(msg?.id || '').trim() === id) || null
  if (displayMessage) chatMessageByIdMap.set(id, displayMessage)
  return displayMessage
}

function isMarkdownHeavyRenderCandidate(msg) {
  if (!msg || typeof msg !== 'object') return false
  if (String(msg?.role || '').trim() === 'user' && shouldRenderUserMessageAsPlainText(msg)) return false
  if (String(msg.render || '').trim() === 'text') return false
  return !!String(msg.content || '').trim()
}

function collectHeavyRenderSeedMessageIds(messages, options = {}) {
  const list = Array.isArray(messages) ? messages : []
  if (!list.length) return new Set()

  const requestedLimit = Number(options.limit)
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.round(requestedLimit))
    : CHAT_HEAVY_RENDER_SEED_COUNT
  if (limit <= 0) return new Set()

  const fromStart = options.fromStart === true
  const ids = new Set()
  if (fromStart) {
    for (let i = 0; i < list.length && ids.size < limit; i += 1) {
      const msg = list[i]
      const id = String(msg?.id || '').trim()
      if (!id || !isMarkdownHeavyRenderCandidate(msg)) continue
      ids.add(id)
    }
    return ids
  }

  for (let i = list.length - 1; i >= 0 && ids.size < limit; i -= 1) {
    const msg = list[i]
    const id = String(msg?.id || '').trim()
    if (!id || !isMarkdownHeavyRenderCandidate(msg)) continue
    ids.add(id)
  }
  return ids
}

function areStringSetsEqual(a, b) {
  if (a === b) return true
  const left = a instanceof Set ? a : new Set()
  const right = b instanceof Set ? b : new Set()
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

function replaceHydratedHeavyChatMessageIds(ids) {
  const next = ids instanceof Set ? ids : new Set()
  if (areStringSetsEqual(hydratedHeavyChatMessageIds.value, next)) return false
  hydratedHeavyChatMessageIds.value = next
  return true
}

function mergeHydratedHeavyChatMessageIds(ids) {
  const next = new Set(hydratedHeavyChatMessageIds.value)
  let changed = false
  const source = ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : [])
  source.forEach((value) => {
    const id = String(value || '').trim()
    if (!id || next.has(id)) return
    next.add(id)
    changed = true
  })
  if (!changed) return false
  hydratedHeavyChatMessageIds.value = next
  return true
}

function pruneHydratedHeavyChatMessageIds(options = {}) {
  const current = hydratedHeavyChatMessageIds.value
  if (!(current instanceof Set) || !current.size) return false

  const requestedLimit = Number(options.limit)
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.round(requestedLimit))
    : Math.max(0, Number(chatHeavyRenderTuning.value.maxHydrated) || 0)
  if (current.size <= limit) return false

  const keepIds = new Set()
  const renderedIds = renderedChatMessageIdSet.value
  renderedIds.forEach((id) => keepIds.add(id))
  visibleHeavyChatMessageIds.value.forEach((id) => keepIds.add(id))
  recentHeavyChatMessageIds.value.forEach((id) => keepIds.add(id))
  forcedRenderedChatMessageIdSet.value.forEach((id) => keepIds.add(id))

  const items = Array.isArray(chatVirtualLayout.value?.items) ? chatVirtualLayout.value.items : []
  const buffer = resolveCurrentHeavyRenderViewportBuffer()
  const start = Math.max(0, Number(renderedChatRange.value?.start || 0) - buffer)
  const end = Math.min(items.length - 1, Number(renderedChatRange.value?.end || -1) + buffer)
  for (let i = start; i <= end; i += 1) {
    const id = String(items[i]?.id || '').trim()
    if (id) keepIds.add(id)
  }

  for (let i = items.length - 1; i >= 0 && keepIds.size < limit; i -= 1) {
    const msg = items[i]?.msg
    const id = String(msg?.id || '').trim()
    if (!id || !current.has(id) || !isMarkdownHeavyRenderCandidate(msg)) continue
    keepIds.add(id)
  }

  if (keepIds.size >= current.size) return false

  const next = new Set()
  current.forEach((id) => {
    if (keepIds.has(id)) next.add(id)
  })
  if (areStringSetsEqual(current, next)) return false
  hydratedHeavyChatMessageIds.value = next
  return true
}

function rememberHydratedHeavyChatMessage(messageId) {
  const id = String(messageId || '').trim()
  if (!id) return false
  const changed = mergeHydratedHeavyChatMessageIds([id])
  pruneHydratedHeavyChatMessageIds()
  return changed
}

let chatSessionOpeningHeavyRenderToken = 0

function beginChatSessionOpeningHeavyRender() {
  chatSessionOpeningHeavyRenderToken += 1
  chatSessionOpeningHeavyRender.value = true
  return chatSessionOpeningHeavyRenderToken
}

function endChatSessionOpeningHeavyRender(token) {
  if (!token || token !== chatSessionOpeningHeavyRenderToken) return
  chatSessionOpeningHeavyRender.value = false
}

async function withChatSessionOpeningHeavyRender(task) {
  const token = beginChatSessionOpeningHeavyRender()
  try {
    return await task()
  } finally {
    endChatSessionOpeningHeavyRender(token)
  }
}

function primeHydratedHeavyChatMessages(messages, options = {}) {
  const seedIds = collectHeavyRenderSeedMessageIds(messages, options)
  if (options.replace !== false) return replaceHydratedHeavyChatMessageIds(seedIds)
  return mergeHydratedHeavyChatMessageIds(seedIds)
}

async function maybeWarmMarkdownPreviewRuntimeForMessages(messages, options = {}) {
  const seedIds = collectHeavyRenderSeedMessageIds(messages, options)
  if (!seedIds.size) return false
  await ensureMarkdownPreviewRuntime()
  return true
}

function primeHydratedRenderedChatMessages(options = {}) {
  const items = Array.isArray(chatVirtualLayout.value?.items) ? chatVirtualLayout.value.items : []
  if (!items.length) return false

  const range = renderedChatRange.value || { start: 0, end: -1 }
  const requestedBuffer = Number(options.buffer)
  const buffer = Number.isFinite(requestedBuffer)
    ? Math.max(0, Math.round(requestedBuffer))
    : resolveCurrentHeavyRenderViewportBuffer()
  const start = Math.max(0, Number(range.start || 0) - buffer)
  const end = Math.min(items.length - 1, Number(range.end || -1) + buffer)
  if (end < start) return false

  const ids = new Set()
  for (let i = start; i <= end; i += 1) {
    const msg = items[i]?.msg
    const id = String(msg?.id || '').trim()
    if (!id || !isMarkdownHeavyRenderCandidate(msg)) continue
    ids.add(id)
  }
  if (!ids.size) return false
  const changed = mergeHydratedHeavyChatMessageIds(ids)
  pruneHydratedHeavyChatMessageIds()
  return changed
}

function primeHydratedMountedHeavyChatMessages() {
  const ids = new Set()
  for (const [id, el] of chatMessageElMap.entries()) {
    if (!(el instanceof HTMLElement) || !el.isConnected) continue
    const msg = resolveChatMessageById(id)
    if (!isMarkdownHeavyRenderCandidate(msg)) continue
    ids.add(id)
  }
  if (!ids.size) return false
  const changed = mergeHydratedHeavyChatMessageIds(ids)
  pruneHydratedHeavyChatMessageIds()
  return changed
}

function findFirstItemBottomGte(items, targetBottom) {
  const list = Array.isArray(items) ? items : []
  let left = 0
  let right = list.length - 1
  let answer = list.length
  while (left <= right) {
    const mid = (left + right) >> 1
    if (Number(list[mid]?.bottom) >= targetBottom) {
      answer = mid
      right = mid - 1
    } else {
      left = mid + 1
    }
  }
  return answer
}

function findLastItemTopLte(items, targetTop, startIndex = 0) {
  const list = Array.isArray(items) ? items : []
  let left = Math.max(0, Number.isInteger(startIndex) ? startIndex : 0)
  let right = list.length - 1
  let answer = left - 1
  while (left <= right) {
    const mid = (left + right) >> 1
    if (Number(list[mid]?.top) <= targetTop) {
      answer = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  return answer
}

const chatDisplayMessages = computed(() =>
  buildChatDisplayMessages(session.messages, {
    resolveToolStatus: getToolMessageStatus,
    expandedToolGroupIds: expandedToolActivityGroupIds.value
  })
)

const chatVirtualizedEnabled = computed(() => chatDisplayMessages.value.length >= CHAT_VIRTUALIZATION_MIN_MESSAGES)

const forcedRenderedChatMessageIdSet = computed(() => {
  const ids = new Set(recentHeavyChatMessageIds.value)
  for (const msg of session.messages || []) {
    const id = String(msg?.id || '').trim()
    if (!id) continue
    const isLiveTool = isToolMessage(msg) && isLiveToolMessageStatus(getToolMessageStatus(msg))
    if (msg.streaming || msg.editing || msg.thinkingExpanded || msg.toolExpanded || msg.attachmentsExpanded || isLiveTool) ids.add(id)
  }
  return ids
})

const chatVirtualLayout = computed(() => {
  void chatMessageMetricsVersion.value
  const items = []
  const idToIndex = new Map()
  const topById = new Map()
  let offset = 0
  const displayMessages = chatDisplayMessages.value
  displayMessages.forEach((msg, index) => {
    const id = String(msg?.id || '').trim()
    const previousMsg = index > 0 ? displayMessages[index - 1] : null
    const gapBefore = getChatMessageGapBefore(previousMsg, msg, index)
    const height = resolveChatVirtualItemHeight({
      measuredHeight: chatMessageHeightCache.get(id),
      estimatedHeight: getEstimatedChatMessageHeight(msg),
      minimumHeight: getChatMessageMinimumHeight(msg),
      fallbackHeight: CHAT_DEFAULT_MESSAGE_HEIGHT
    })
    offset += gapBefore
    const top = offset
    const bottom = top + height
    items.push({
      id,
      index,
      top,
      bottom,
      height,
      gapBefore,
      msg
    })
    if (id) {
      idToIndex.set(id, index)
      topById.set(id, top)
    }
    offset = bottom
  })
  const totalHeight = items.length ? Math.max(0, offset) : 0
  return {
    items,
    idToIndex,
    topById,
    totalHeight
  }
})

function resolveChatRenderRange(layout, scrollTop, viewportHeight) {
  const items = Array.isArray(layout?.items) ? layout.items : []
  if (!items.length) return { start: 0, end: -1 }
  if (!chatVirtualizedEnabled.value) return { start: 0, end: items.length - 1 }

  const overscan = CHAT_VIRTUALIZATION_OVERSCAN_PX
  const viewportTop = Math.max(0, Number(scrollTop) - overscan)
  const viewportBottom = Math.max(0, Number(scrollTop) + Math.max(0, Number(viewportHeight) || 0) + overscan)

  let start = findFirstItemBottomGte(items, viewportTop)
  if (start >= items.length) start = Math.max(0, items.length - 1)
  let end = findLastItemTopLte(items, viewportBottom, start)
  if (end < start) end = start

  if (start >= items.length) end = items.length - 1

  const forcedIds = forcedRenderedChatMessageIdSet.value
  const forceMargin = Math.max(0, Number(CHAT_VIRTUALIZATION_FORCE_RENDER_MARGIN_PX) || 0)
  const forceViewportTop = Math.max(0, viewportTop - forceMargin)
  const forceViewportBottom = viewportBottom + forceMargin
  let forcedStart = start
  let forcedEnd = end
  forcedIds.forEach((id) => {
    const index = layout.idToIndex.get(id)
    if (!Number.isInteger(index)) return
    const item = items[index]
    if (!item) return
    // Keep nearby interactive items mounted without letting distant tail/history items
    // stretch the render window into one huge continuous block.
    if (item.bottom < forceViewportTop || item.top > forceViewportBottom) return
    forcedStart = Math.min(forcedStart, index)
    forcedEnd = Math.max(forcedEnd, index)
  })

  return {
    start: Math.max(0, forcedStart),
    end: Math.min(items.length - 1, Math.max(forcedEnd, forcedStart))
  }
}

const renderedChatRange = computed(() =>
  resolveChatRenderRange(chatVirtualLayout.value, chatScrollTop.value, chatViewportHeight.value)
)

const renderedChatMessageIdSet = computed(() => {
  const ids = new Set()
  const { items } = chatVirtualLayout.value
  const { start, end } = renderedChatRange.value
  if (!items.length || end < start) return ids
  for (let i = start; i <= end; i += 1) {
    const id = String(items[i]?.id || '').trim()
    if (id) ids.add(id)
  }
  return ids
})

const renderedChatMessages = computed(() => {
  const { items } = chatVirtualLayout.value
  const { start, end } = renderedChatRange.value
  if (!items.length || end < start) return []
  return items.slice(start, end + 1).map((item) => item.msg)
})

const chatVirtualListStyle = computed(() => {
  if (!chatVirtualizedEnabled.value) return undefined
  const paddingBlock = isDenseChatLayout.value ? 8 : 14
  return {
    height: `${resolveChatVirtualCanvasHeight({
      contentHeight: chatVirtualLayout.value.totalHeight,
      paddingBlock
    })}px`
  }
})

function getChatVirtualItemStyle(msg) {
  if (!chatVirtualizedEnabled.value) return undefined
  const id = String(msg?.id || '').trim()
  const index = chatVirtualLayout.value.idToIndex.get(id)
  const item = Number.isInteger(index) ? chatVirtualLayout.value.items[index] : null
  if (!item) return undefined
  return {
    '--chat-virtual-item-top': `${Math.max(0, Math.round(Number(item.top) || 0))}px`
  }
}

function getDistanceFromBottom(elMaybe) {
  const el = elMaybe || chatScrollEl.value || resolveScrollbarContainerEl()
  if (!el) return Number.POSITIVE_INFINITY
  return Math.max(0, el.scrollHeight - (el.scrollTop + el.clientHeight))
}

function shouldFollowStreamingScroll(options = {}) {
  const allowNearBottom = options.allowNearBottom !== false
  const el = chatScrollEl.value || resolveScrollbarContainerEl()
  if (!el) return false
  if (autoScrollSuspendedByUser.value || !autoScrollEnabled.value) return false
  const distanceFromBottom = getDistanceFromBottom(el)
  // Only keep following if the viewport is still close to the tail.
  // This avoids yanking the scrollbar back to the bottom when far-history
  // messages reflow or finish hydrating after the user has already moved away.
  const followThreshold = allowNearBottom ? SCROLL_AUTO_DISABLE_DISTANCE_PX : SCROLL_BOTTOM_THRESHOLD_PX
  return distanceFromBottom <= followThreshold
}

function markProgrammaticChatScroll(durationMs = CHAT_SCROLL_COMPENSATION_SUSPEND_MS, targetScrollTop = Number.NaN) {
  const duration = Math.max(120, Number(durationMs) || 0)
  programmaticChatScrollUntil = Date.now() + duration
  programmaticChatScrollTop = Number.isFinite(Number(targetScrollTop))
    ? Math.max(0, Number(targetScrollTop))
    : Number.NaN
}

function isExpectedProgrammaticChatScroll(scrollTop) {
  return isExpectedChatProgrammaticScroll({
    now: Date.now(),
    until: programmaticChatScrollUntil,
    scrollTop,
    targetScrollTop: programmaticChatScrollTop
  })
}

function clearProgrammaticChatScrollMark() {
  programmaticChatScrollUntil = 0
  programmaticChatScrollTop = Number.NaN
}

function maybeScheduleStreamingScroll(options = {}) {
  if (!shouldFollowStreamingScroll(options)) return false
  scheduleScrollToBottom()
  return true
}

function updateAtBottomState(elMaybe) {
  const el = elMaybe || chatScrollEl.value || resolveScrollbarContainerEl()
  if (!el) {
    chatScrollDistanceFromBottom.value = Number.POSITIVE_INFINITY
    isAtBottom.value = false
    isChatScrollable.value = false
    return { distanceFromBottom: Number.POSITIVE_INFINITY, atBottom: false }
  }
  const distanceFromBottom = getDistanceFromBottom(el)
  chatScrollTop.value = Number(el?.scrollTop || 0)
  chatViewportHeight.value = Number(el?.clientHeight || 0)
  chatScrollDistanceFromBottom.value = distanceFromBottom
  isChatScrollable.value = !!el && el.scrollHeight > el.clientHeight + 2
  isAtBottom.value = distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX
  return { distanceFromBottom, atBottom: isAtBottom.value }
}

const showScrollToBottomButton = computed(() => {
  if (!isChatScrollable.value) return false
  return chatScrollDistanceFromBottom.value > SCROLL_AUTO_DISABLE_DISTANCE_PX
})

const userAnchorMeta = ref([])
const activeAnchorId = ref(null)
const userAnchorElMap = new Map()

function getUserAnchorPreview(msg) {
  const text = String(msg?.content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)[0] || ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return '(empty)'
  return flat.length > 40 ? `${flat.slice(0, 40)}...` : flat
}

const userAnchors = computed(() => {
  const anchors = []
  for (const msg of session.messages || []) {
    if (!msg || msg.role !== 'user') continue
    const index = anchors.length + 1
    anchors.push({
      id: msg.id,
      domId: `q-${msg.id}`,
      index,
      preview: getUserAnchorPreview(msg)
    })
  }
  return anchors
})

const showAnchorRail = computed(() =>
  shouldShowChatAnchorRail(userAnchors.value.length, { dense: isDenseChatLayout.value })
)
const stickyChatBubble = ref(null)
let stickyChatBubbleSyncFrame = 0

function getStickyChatBubbleState(msg) {
  if (!msg || typeof msg !== 'object') return null
  const id = String(msg.id || '').trim()
  if (!id) return null

  if (msg.role === 'assistant' && msg.thinking && msg.thinkingExpanded) {
    return {
      id,
      type: 'thinking',
      label: msg.streaming ? '思考中...' : '思考完成',
      meta: '',
      toolName: '',
      source: '',
      status: '',
      statusText: '',
      showStatus: false,
      actionText: '收起思考'
    }
  }

  if (msg.role === 'user' && msg.attachmentsExpanded && ((msg.images && msg.images.length) || (msg.attachments && msg.attachments.length))) {
    return {
      id,
      type: 'attachments',
      label: '附件',
      meta: `${countImageAttachments(msg)} 图 / ${countFileAttachments(msg)} 文件`,
      toolName: '',
      source: '',
      status: '',
      statusText: '',
      showStatus: false,
      actionText: '收起附件'
    }
  }

  if (isToolMessage(msg) && msg.toolExpanded) {
    const status = getToolMessageStatus(msg)
    return {
      id,
      type: 'tool',
      label: toolMessageLabel(msg),
      meta: toolActivityMeta(msg),
      toolName: toolActivityToolName(msg),
      source: toolActivitySource(msg),
      status,
      statusText: toolMessageStatusLabel(msg),
      showStatus: shouldShowToolActivityStatus(msg),
      actionText: '收起'
    }
  }

  return null
}

function setStickyChatBubbleState(next) {
  const prev = stickyChatBubble.value
  if (
    prev?.id === next?.id &&
    prev?.type === next?.type &&
    prev?.label === next?.label &&
    prev?.meta === next?.meta &&
    prev?.toolName === next?.toolName &&
    prev?.source === next?.source &&
    prev?.status === next?.status &&
    prev?.statusText === next?.statusText &&
    prev?.showStatus === next?.showStatus &&
    prev?.actionText === next?.actionText
  ) {
    return
  }
  stickyChatBubble.value = next
}

function syncStickyChatBubble() {
  if (!chatScrollEl.value && !resolveScrollbarContainerEl()) {
    setStickyChatBubbleState(null)
    return
  }

  const layout = chatVirtualLayout.value
  const items = Array.isArray(layout?.items) ? layout.items : []
  if (!items.length) {
    setStickyChatBubbleState(null)
    return
  }

  const threshold = Math.max(0, Number(chatScrollTop.value) || 0) + 8
  const minVisibleBottom = threshold + 64
  let next = null
  const rightMostVisibleIndex = findLastItemTopLte(items, threshold, 0)

  for (let index = rightMostVisibleIndex; index >= 0; index -= 1) {
    const item = items[index]
    if (!item || item.bottom <= minVisibleBottom) break
    const state = getStickyChatBubbleState(item.msg)
    if (state) {
      next = state
      break
    }
  }

  if (!next && stickyChatBubble.value?.id) {
    const currentId = String(stickyChatBubble.value.id)
    const current = items.find((item) => String(item?.id || '') === currentId)
    const currentState = getStickyChatBubbleState(current?.msg)
    if (currentState && current.top <= threshold + 96 && current.bottom > threshold + 24) {
      next = currentState
    }
  }

  setStickyChatBubbleState(next)
}

function scheduleStickyChatBubbleSync() {
  if (stickyChatBubbleSyncFrame) return
  const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
  stickyChatBubbleSyncFrame = raf(() => {
    stickyChatBubbleSyncFrame = 0
    syncStickyChatBubble()
  })
}

function clearStickyChatBubbleSync() {
  if (!stickyChatBubbleSyncFrame) return
  if (typeof window?.cancelAnimationFrame === 'function') window.cancelAnimationFrame(stickyChatBubbleSyncFrame)
  else clearTimeout(stickyChatBubbleSyncFrame)
  stickyChatBubbleSyncFrame = 0
}

function handleStickyChatBubbleAction() {
  const id = stickyChatBubble.value?.id
  const msg = session.messages.find((item) => String(item?.id || '') === String(id || ''))
  if (!msg) {
    setStickyChatBubbleState(null)
    return
  }

  if (stickyChatBubble.value?.type === 'thinking') toggleThinking(msg)
  else if (stickyChatBubble.value?.type === 'attachments') toggleAttachmentsExpanded(msg)
  else if (stickyChatBubble.value?.type === 'tool') toggleToolExpanded(msg)

  setStickyChatBubbleState(null)
  scheduleStickyChatBubbleSync()
}

function syncVisibleHeavyChatMessageIds() {
  visibleHeavyChatMessageIds.value = new Set(intersectingHeavyChatMessageIds)
}

function bumpChatMessageMetricsVersion() {
  chatMessageMetricsVersion.value += 1
}

function queueChatItemHeightMeasure(messageId, el) {
  const id = String(messageId || '').trim()
  if (!id || !(el instanceof HTMLElement)) return
  pendingChatItemHeightMeasureMap.set(id, el)
  if (pendingChatItemHeightMeasureRafId) return
  const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
  pendingChatItemHeightMeasureRafId = raf(() => {
    pendingChatItemHeightMeasureRafId = 0
    const layoutBefore = chatVirtualLayout.value
    const viewportTop = Number(chatScrollTop.value || 0)
    let deltaAboveViewport = 0
    let changed = false
    const entries = Array.from(pendingChatItemHeightMeasureMap.entries())
    pendingChatItemHeightMeasureMap.clear()
    entries.forEach(([measureId, targetEl]) => {
      if (!(targetEl instanceof HTMLElement)) return
      const itemIndex = layoutBefore?.idToIndex?.get(measureId)
      const layoutItem = Number.isInteger(itemIndex) ? layoutBefore?.items?.[itemIndex] : null
      const previousHeight = Number(chatMessageHeightCache.get(measureId) || layoutItem?.height || 0)
      const msg = resolveChatMessageById(measureId)
      const nextHeight = getChatMessageMeasuredHeight(
        msg,
        targetEl.getBoundingClientRect().height || targetEl.offsetHeight || 0
      )
      if (!nextHeight || previousHeight === nextHeight) return
      chatMessageHeightCache.set(measureId, nextHeight)
      if (Number(layoutItem?.bottom) <= viewportTop + 1) {
        deltaAboveViewport += (nextHeight - previousHeight)
      }
      changed = true
    })
    if (changed) {
      bumpChatMessageMetricsVersion()
      scheduleRefreshUserAnchorMeta()
      if (deltaAboveViewport && shouldApplyChatScrollCompensation()) {
        queueChatScrollCompensation(deltaAboveViewport)
      }
    }
  })
}

function clearPendingChatItemHeightMeasure() {
  pendingChatItemHeightMeasureMap.clear()
  if (!pendingChatItemHeightMeasureRafId) return
  if (typeof window?.cancelAnimationFrame === 'function') window.cancelAnimationFrame(pendingChatItemHeightMeasureRafId)
  else clearTimeout(pendingChatItemHeightMeasureRafId)
  pendingChatItemHeightMeasureRafId = 0
}

function queueChatScrollCompensation(deltaPx) {
  const delta = Number(deltaPx) || 0
  if (!delta) return
  pendingChatScrollCompensationPx += delta
  if (pendingChatScrollCompensationRafId) return
  const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
  pendingChatScrollCompensationRafId = raf(() => {
    pendingChatScrollCompensationRafId = 0
    const totalDelta = pendingChatScrollCompensationPx
    pendingChatScrollCompensationPx = 0
    if (!totalDelta) return
    const el = chatScrollEl.value || resolveScrollbarContainerEl()
    if (!el) return
    // User input or tail-follow may have happened after this correction was
    // queued. A stale compensation must never fight the current scroll owner.
    if (!shouldApplyChatScrollCompensation()) return
    const compensation = resolveChatViewportCompensation({
      scrollTop: el.scrollTop,
      deltaPx: totalDelta,
      lastProcessedScrollTop,
      didProcessScroll: didProcessChatScroll
    })
    if (!compensation.appliedDelta) return
    if (didProcessChatScroll && Number.isFinite(compensation.nextLastProcessedScrollTop)) {
      lastProcessedChatScrollTop = compensation.nextLastProcessedScrollTop
    }
    markProgrammaticChatScroll(CHAT_SCROLL_COMPENSATION_MARK_MS, compensation.nextScrollTop)
    el.scrollTop = compensation.nextScrollTop
    updateAtBottomState(el)
  })
}

function clearQueuedChatScrollCompensation() {
  pendingChatScrollCompensationPx = 0
  if (!pendingChatScrollCompensationRafId) return
  if (typeof window?.cancelAnimationFrame === 'function') window.cancelAnimationFrame(pendingChatScrollCompensationRafId)
  else clearTimeout(pendingChatScrollCompensationRafId)
  pendingChatScrollCompensationRafId = 0
}

function shouldApplyChatScrollCompensation() {
  if (isAtBottom.value) return false
  if (autoScrollEnabled.value && !autoScrollSuspendedByUser.value) return false
  if (Date.now() <= userChatScrollActiveUntil) return false
  const el = chatScrollEl.value || resolveScrollbarContainerEl()
  return !!el
}

function disconnectChatMessageResizeObserver() {
  if (!chatMessageResizeObserver) return
  try {
    chatMessageResizeObserver.disconnect()
  } catch {
    // ignore
  }
  chatMessageResizeObserver = null
}

function ensureChatMessageResizeObserver() {
  if (chatMessageResizeObserver || typeof ResizeObserver === 'undefined') return
  chatMessageResizeObserver = new ResizeObserver((entries) => {
    const layoutBefore = chatVirtualLayout.value
    const viewportTop = Number(chatScrollTop.value || 0)
    let deltaAboveViewport = 0
    let changed = false
    entries.forEach((entry) => {
      const target = entry?.target
      if (!(target instanceof HTMLElement)) return
      const id = String(target.dataset.messageId || '').trim()
      if (!id) return
      const msg = resolveChatMessageById(id)
      const fixedHeight = getFixedCompactChatMessageHeight(msg)
      if (fixedHeight) {
        const cachedHeight = Number(chatMessageHeightCache.get(id) || 0)
        if (cachedHeight !== fixedHeight) {
          chatMessageHeightCache.set(id, fixedHeight)
          changed = true
        }
        return
      }
      const itemIndex = layoutBefore?.idToIndex?.get(id)
      const layoutItem = Number.isInteger(itemIndex) ? layoutBefore?.items?.[itemIndex] : null
      const prevHeight = Number(chatMessageHeightCache.get(id) || layoutItem?.height || estimateChatMessageHeight(msg) || 0)
      const nextHeight = getChatMessageMeasuredHeight(
        msg,
        entry.contentRect?.height || target.getBoundingClientRect().height || target.offsetHeight || 0
      )
      if (!nextHeight || prevHeight === nextHeight) return
      chatMessageHeightCache.set(id, nextHeight)
      if (Number(layoutItem?.bottom) <= viewportTop + 1) {
        deltaAboveViewport += (nextHeight - prevHeight)
      }
      changed = true
    })
    if (changed) {
      bumpChatMessageMetricsVersion()
      scheduleRefreshUserAnchorMeta()
      if (deltaAboveViewport && shouldApplyChatScrollCompensation()) queueChatScrollCompensation(deltaAboveViewport)
      maybeScheduleStreamingScroll()
    }
  })
}

function disconnectChatMessageVisibilityObserver(options = {}) {
  if (chatMessageVisibilityObserver) {
    try {
      chatMessageVisibilityObserver.disconnect()
    } catch {
      // ignore
    }
    chatMessageVisibilityObserver = null
  }

  intersectingHeavyChatMessageIds.clear()
  if (options.clearVisible !== false) syncVisibleHeavyChatMessageIds()
}

function setupChatMessageVisibilityObserver() {
  disconnectChatMessageVisibilityObserver()
  if (typeof IntersectionObserver === 'undefined') {
    syncVisibleHeavyChatMessageIds()
    return
  }

  const root = chatScrollEl.value || resolveScrollbarContainerEl()
  if (!root) {
    syncVisibleHeavyChatMessageIds()
    return
  }

  chatMessageVisibilityObserver = new IntersectionObserver(
    (entries) => {
      let changed = false
      entries.forEach((entry) => {
        const id = String(entry.target?.dataset?.messageId || '').trim()
        if (!id) return
        if (entry.isIntersecting) {
          if (!intersectingHeavyChatMessageIds.has(id)) {
            intersectingHeavyChatMessageIds.add(id)
            changed = true
          }
          rememberHydratedHeavyChatMessage(id)
        } else if (intersectingHeavyChatMessageIds.delete(id)) {
          changed = true
        }
      })
      if (changed) syncVisibleHeavyChatMessageIds()
    },
    {
      root,
      rootMargin: `${Math.max(0, Number(chatHeavyRenderTuning.value.rootMarginPx) || 0)}px 0px`
    }
  )

  for (const [id, el] of chatMessageElMap.entries()) {
    if (!el) continue
    el.dataset.messageId = id
    chatMessageVisibilityObserver.observe(el)
  }
}

function setChatItemEl(messageId, role, el) {
  const k = String(messageId || '')
  if (!k) return

  if (role === 'user') {
    if (el) userAnchorElMap.set(k, el)
    else userAnchorElMap.delete(k)
  }

  const prev = chatMessageElMap.get(k)
  if (prev && prev !== el) {
    try {
      chatMessageVisibilityObserver?.unobserve(prev)
    } catch {
      // ignore
    }
    try {
      chatMessageResizeObserver?.unobserve(prev)
    } catch {
      // ignore
    }
  }

  if (el) {
    ensureChatMessageResizeObserver()
    el.dataset.messageId = k
    chatMessageElMap.set(k, el)
    const msg = resolveChatMessageById(k)
    const fixedHeight = getFixedCompactChatMessageHeight(msg)
    if (fixedHeight) {
      if (chatMessageHeightCache.get(k) !== fixedHeight) {
        chatMessageHeightCache.set(k, fixedHeight)
        bumpChatMessageMetricsVersion()
      }
    } else if (!chatMessageHeightCache.has(k)) {
      queueChatItemHeightMeasure(k, el)
    }
    try {
      chatMessageVisibilityObserver?.observe(el)
    } catch {
      // ignore
    }
    if (!fixedHeight) {
      try {
        chatMessageResizeObserver?.observe(el)
      } catch {
        // ignore
      }
    }
  } else {
    chatMessageElMap.delete(k)
    if (intersectingHeavyChatMessageIds.delete(k)) syncVisibleHeavyChatMessageIds()
  }
}

function shouldRenderHeavyChatMessage(msg) {
  if (!msg || typeof msg !== 'object') return true
  const id = String(msg.id || '').trim()
  if (!id) return true
  if (msg.streaming || msg.editing || msg.thinkingExpanded || msg.toolExpanded || msg.attachmentsExpanded) return true
  if (renderedChatMessageIdSet.value.has(id)) return true
  if (chatSessionOpeningHeavyRender.value && String(msg.render || '').trim() !== 'text') return true
  if (hydratedHeavyChatMessageIds.value.has(id)) return true
  if (recentHeavyChatMessageIds.value.has(id)) return true
  return visibleHeavyChatMessageIds.value.has(id)
}

function shouldDeferHeavyChatBlockLayout(msg) {
  return shouldDeferChatHeavyBlockLayout(msg, {
    visibleMessageIds: visibleHeavyChatMessageIds.value
  })
}

function shouldRenderCompactToolMessage(msg) {
  if (!isToolMessage(msg)) return false
  if (msg.toolExpanded || msg.streaming || msg.editing || msg.attachmentsExpanded || msg.thinkingExpanded) return false
  return true
}

function isFixedCompactToolMessage(msg) {
  return shouldRenderCompactToolMessage(msg)
}

function getFixedCompactChatMessageHeight(msg) {
  if (isFixedCompactToolMessage(msg)) return CHAT_TOOL_COMPACT_ITEM_FIXED_HEIGHT
  if (isToolActivityGroup(msg) && !msg.toolGroupExpanded) return CHAT_TOOL_ACTIVITY_GROUP_FIXED_HEIGHT
  return 0
}

function refreshUserAnchorMeta() {
  const next = userAnchors.value
    .map((a) => {
      const top = chatVirtualLayout.value.topById.get(a.id)
      if (top == null) return null
      return { ...a, top }
    })
    .filter(Boolean)

  userAnchorMeta.value = next
}

function findLastAnchorTopLte(meta, targetTop) {
  const list = Array.isArray(meta) ? meta : []
  let left = 0
  let right = list.length - 1
  let answer = -1
  while (left <= right) {
    const mid = (left + right) >> 1
    const top = Number(list[mid]?.top)
    if (Number.isFinite(top) && top <= targetTop) {
      answer = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  return answer
}

function updateActiveAnchorFromScroll(container) {
  const el = container || chatScrollEl.value
  if (!el) return
  if (userAnchorMeta.value.length !== userAnchors.value.length) refreshUserAnchorMeta()

  const meta = userAnchorMeta.value
  if (!meta.length) {
    activeAnchorId.value = null
    return
  }

  const scrollTop = el.scrollTop
  const viewBottom = scrollTop + el.clientHeight
  const margin = 8

  let active = null
  const currentTop = scrollTop + margin
  const activeIndex = findLastAnchorTopLte(meta, currentTop)
  if (activeIndex >= 0) active = meta[activeIndex]?.id || null

  if (!active) {
    const lowerBound = scrollTop - margin
    const upperBound = viewBottom + margin
    let firstInViewIndex = findLastAnchorTopLte(meta, lowerBound)
    firstInViewIndex = Math.max(0, firstInViewIndex)
    if (Number(meta[firstInViewIndex]?.top) < lowerBound) firstInViewIndex += 1

    for (let i = firstInViewIndex; i < meta.length; i += 1) {
      const top = Number(meta[i]?.top)
      if (!Number.isFinite(top)) continue
      if (top > upperBound) break
      active = meta[i]?.id || null
      break
    }

    if (!active) active = meta[0]?.id || null
  }

  activeAnchorId.value = active
}

let anchorMetaRefreshScheduled = false
function scheduleRefreshUserAnchorMeta() {
  if (anchorMetaRefreshScheduled) return
  anchorMetaRefreshScheduled = true

  const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
  raf(async () => {
    anchorMetaRefreshScheduled = false
    await nextTick()
    if (!chatScrollEl.value) chatScrollEl.value = resolveScrollbarContainerEl()
    if (!chatLayoutResizeObserver) setupChatLayoutResizeObserver()
    refreshUserAnchorMeta()
    updateActiveAnchorFromScroll()
    updateAtBottomState(chatScrollEl.value)
    syncStickyChatBubble()
  })
}

async function scrollToUserAnchor(messageId) {
  const k = String(messageId || '')
  autoScrollEnabled.value = false
  autoScrollSuspendedByUser.value = true
  clearQueuedChatScrollCompensation()
  await nextTick()
  const container = chatScrollEl.value || resolveScrollbarContainerEl()
  const targetTop = chatVirtualLayout.value.topById.get(k)
  if (!container) return
  const mountedEl = userAnchorElMap.get(k)
  const mountedTop = mountedEl ? Number(mountedEl.offsetTop) : Number.NaN
  const resolvedTop = targetTop == null ? mountedTop : Number(targetTop)
  if (!Number.isFinite(resolvedTop)) return
  const nextTop = Math.max(0, resolvedTop - 8)
  markProgrammaticChatScroll(CHAT_SCROLL_COMPENSATION_SUSPEND_MS, nextTop)
  try {
    // Native smooth scrolling traverses several virtual render windows; their
    // measurements can otherwise compete with the animation.
    container.scrollTo({ top: nextTop, behavior: 'auto' })
  } catch {
    container.scrollTop = nextTop
  }
  queueProcessChatScroll(container)
}

function resolveScrollbarContainerEl() {
  const inst = scrollbarRef.value
  const root = inst?.$el
  if (root?.querySelector) return root.querySelector('.n-scrollbar-container')
  return null
}

function disconnectChatLayoutResizeObserver() {
  if (!chatLayoutResizeObserver) return
  try {
    chatLayoutResizeObserver.disconnect()
  } catch {
    // ignore
  }
  chatLayoutResizeObserver = null
}

function setupChatLayoutResizeObserver() {
  disconnectChatLayoutResizeObserver()
  if (typeof ResizeObserver === 'undefined') return
  const container = chatScrollEl.value || resolveScrollbarContainerEl()
  const list = chatListRef.value
  if (!container || !list) return

  chatScrollEl.value = container
  chatLayoutResizeObserver = new ResizeObserver(() => {
    scheduleRefreshUserAnchorMeta()
    maybeScheduleStreamingScroll()
  })
  chatLayoutResizeObserver.observe(container)
  chatLayoutResizeObserver.observe(list)
}

function waitForLayoutFrame() {
  return new Promise((resolve) => {
    const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
    raf(() => resolve())
  })
}

async function refreshChatViewportState(options = {}) {
  const reconnectObserver = !!options.reconnectObserver
  await nextTick()
  await waitForLayoutFrame()

  const container = resolveScrollbarContainerEl()
  const list = chatListRef.value
  chatScrollEl.value = container || null
  if (!container) return

  if (reconnectObserver) {
    setupChatLayoutResizeObserver()
    setupChatMessageVisibilityObserver()
  }
  refreshUserAnchorMeta()
  updateActiveAnchorFromScroll(container)
  updateAtBottomState(container)
  primeHydratedRenderedChatMessages()
  primeHydratedMountedHeavyChatMessages()
  syncStickyChatBubble()
}

async function settleChatViewportAfterSessionOpen(options = {}) {
  await refreshChatViewportState({ reconnectObserver: options.reconnectObserver === true })
  await nextTick()
  await waitForLayoutFrame()

  const container = chatScrollEl.value || resolveScrollbarContainerEl()
  if (!container) return

  updateAtBottomState(container)
  const requestedBuffer = Number(options.buffer)
  const buffer = Number.isFinite(requestedBuffer)
    ? Math.max(0, Math.round(requestedBuffer))
    : resolveCurrentHeavyRenderViewportBuffer(2)
  primeHydratedRenderedChatMessages({ buffer })
  primeHydratedMountedHeavyChatMessages()
}

watch(
  () => userAnchors.value.length,
  async () => {
    await nextTick()
    if (!chatScrollEl.value) chatScrollEl.value = resolveScrollbarContainerEl()
    refreshUserAnchorMeta()
    updateActiveAnchorFromScroll()
    updateAtBottomState(chatScrollEl.value)
  }
)

watch(
  () => activeMemorySessionId.value,
  () => {
    expandedToolActivityGroupIds.value = new Set()
  }
)

watch(
  () => chatMessageMetricsVersion.value,
  () => {
    scheduleRefreshUserAnchorMeta()
    scheduleStickyChatBubbleSync()
  }
)

watch(
  () => chatDisplayMessages.value.map((msg) => [
    String(msg?.id || ''),
    msg?.toolGroupExpanded ? 1 : 0,
    Array.isArray(msg?.toolGroupMessages)
      ? msg.toolGroupMessages.map((child) => child?.toolExpanded ? '1' : '0').join('')
      : ''
  ].join(':')).join('|'),
  () => {
    const validIds = new Set()
    chatMessageByIdMap.clear()
    chatDisplayMessages.value.forEach((msg) => {
      const id = String(msg?.id || '').trim()
      if (!id) return
      validIds.add(id)
      chatMessageByIdMap.set(id, msg)
    })
    Array.from(chatMessageHeightCache.keys()).forEach((id) => {
      if (!validIds.has(id)) chatMessageHeightCache.delete(id)
    })
    Array.from(chatMessageEstimatedHeightCache.keys()).forEach((id) => {
      if (!validIds.has(id)) chatMessageEstimatedHeightCache.delete(id)
    })
    if (hydratedHeavyChatMessageIds.value.size) {
      const nextHydratedIds = new Set()
      hydratedHeavyChatMessageIds.value.forEach((id) => {
        if (validIds.has(id)) nextHydratedIds.add(id)
      })
      if (nextHydratedIds.size !== hydratedHeavyChatMessageIds.value.size) {
        hydratedHeavyChatMessageIds.value = nextHydratedIds
      }
    }
    Array.from(chatMessageElMap.keys()).forEach((id) => {
      if (!validIds.has(id)) chatMessageElMap.delete(id)
    })
    Array.from(userAnchorElMap.keys()).forEach((id) => {
      if (!validIds.has(id)) userAnchorElMap.delete(id)
    })
    if (activeAnchorId.value && !validIds.has(activeAnchorId.value)) activeAnchorId.value = null
    bumpChatMessageMetricsVersion()
  }
)

watch(
  () => session.messages.length,
  () => {
    maybeCoalesceLatestToolMessages()
  }
)

watch(
  () => `${chatHeavyRenderTuning.value.viewportBuffer}|${chatHeavyRenderTuning.value.rootMarginPx}|${chatHeavyRenderTuning.value.maxHydrated}`,
  () => {
    pruneHydratedHeavyChatMessageIds()
    if (chatMessageVisibilityObserver) setupChatMessageVisibilityObserver()
  }
)

onMounted(async () => {
  syncChatResponsiveState()
  window?.addEventListener?.('resize', syncChatResponsiveState)
  window?.addEventListener?.(BUILTIN_AGENTS_TRACE_EVENT, handleBuiltinAgentsTraceEvent)
  window?.addEventListener?.(BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT, handleBuiltinAgentsToolApprovalRequest)
  void cleanupAutoChatSessions()
  void migrateLegacyAutoChatSessionCreatedAt()
  autoChatCleanupTimer = window.setInterval(() => {
    void cleanupAutoChatSessions()
  }, AUTO_CHAT_SESSION_CLEANUP_INTERVAL_MS)
  await refreshChatViewportState({ reconnectObserver: true })
})

onActivated(async () => {
  await refreshChatViewportState({ reconnectObserver: true })
  if (autoScrollEnabled.value) scheduleScrollToBottom()
})

onDeactivated(() => {
  disconnectChatLayoutResizeObserver()
  disconnectChatMessageVisibilityObserver()
  disconnectChatMessageResizeObserver()
  clearPendingChatItemHeightMeasure()
  clearQueuedChatScrollCompensation()
  clearQueuedChatScrollProcessing()
  clearStickyChatBubbleSync()
  setStickyChatBubbleState(null)
  cleanupChatPreviewLinkHandlers()
  chatScrollEl.value = null
})

function toggleSessionSider() {
  sessionSiderCollapsed.value = !sessionSiderCollapsed.value
}

function activateAutoScroll() {
  autoScrollSuspendedByUser.value = false
  autoScrollEnabled.value = true
  scrollToBottom({ force: true })
}

function handleChatScroll(e) {
  const targetEl = resolveScrollbarContainerEl() || e?.target
  const currentTop = Number(targetEl?.scrollTop || 0)
  const previousTop = didProcessChatScroll ? lastProcessedChatScrollTop : Number(chatScrollTop.value || 0)
  const isProgrammaticScroll = isExpectedProgrammaticChatScroll(currentTop)
  if (!isProgrammaticScroll && Math.abs(currentTop - previousTop) > 0.5) {
    userChatScrollActiveUntil = Date.now() + CHAT_USER_SCROLL_ACTIVE_MS
  }
  if (!isProgrammaticScroll && currentTop + 1 < previousTop) {
    autoScrollSuspendedByUser.value = true
    autoScrollEnabled.value = false
  }
  queueProcessChatScroll(targetEl)
}

function handleChatWheel(e) {
  const deltaY = Number(e?.deltaY || 0)
  if (!deltaY) return
  clearProgrammaticChatScrollMark()
  clearQueuedChatScrollCompensation()
  userChatScrollActiveUntil = Date.now() + CHAT_USER_SCROLL_ACTIVE_MS
  if (deltaY < 0) {
    autoScrollSuspendedByUser.value = true
    autoScrollEnabled.value = false
  }
}

function handleChatPointerDown() {
  clearProgrammaticChatScrollMark()
  clearQueuedChatScrollCompensation()
  userChatScrollActiveUntil = Date.now() + CHAT_USER_SCROLL_ACTIVE_MS
}

let pendingChatScrollEl = null
let chatScrollProcessScheduled = false
let chatScrollProcessRafId = 0

function processChatScroll(elMaybe) {
  const el = elMaybe || chatScrollEl.value || resolveScrollbarContainerEl()
  if (!el) return
  chatScrollEl.value = el
  if (!chatLayoutResizeObserver) setupChatLayoutResizeObserver()
  if (!chatMessageVisibilityObserver) setupChatMessageVisibilityObserver()

  const prevScrollTop = didProcessChatScroll ? lastProcessedChatScrollTop : Number(chatScrollTop.value || 0)
  const { distanceFromBottom, atBottom } = updateAtBottomState(el)
  primeHydratedRenderedChatMessages()
  const nextScrollTop = Number(chatScrollTop.value || 0)
  const isProgrammaticScroll = isExpectedProgrammaticChatScroll(nextScrollTop)
  const isUserScrollingUp = didProcessChatScroll && (nextScrollTop + 1 < prevScrollTop)
  const isUserScrollingDown = didProcessChatScroll && (nextScrollTop > prevScrollTop + 1)
  lastProcessedChatScrollTop = nextScrollTop
  didProcessChatScroll = true

  if (!isProgrammaticScroll && isUserScrollingUp) {
    autoScrollSuspendedByUser.value = true
    autoScrollEnabled.value = false
  } else if (atBottom) {
    autoScrollSuspendedByUser.value = false
    autoScrollEnabled.value = true
  } else if (!isProgrammaticScroll && autoScrollEnabled.value && distanceFromBottom > SCROLL_AUTO_DISABLE_DISTANCE_PX) {
    autoScrollEnabled.value = false
  }

  updateActiveAnchorFromScroll(el)
  scheduleStickyChatBubbleSync()
}

function queueProcessChatScroll(elMaybe) {
  if (elMaybe) pendingChatScrollEl = elMaybe
  if (chatScrollProcessScheduled) return
  chatScrollProcessScheduled = true
  const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
  chatScrollProcessRafId = raf(() => {
    chatScrollProcessRafId = 0
    chatScrollProcessScheduled = false
    const targetEl = pendingChatScrollEl
    pendingChatScrollEl = null
    processChatScroll(targetEl)
  })
}

function clearQueuedChatScrollProcessing() {
  if (chatScrollProcessRafId) {
    if (typeof window?.cancelAnimationFrame === 'function') window.cancelAnimationFrame(chatScrollProcessRafId)
    else clearTimeout(chatScrollProcessRafId)
  }
  chatScrollProcessRafId = 0
  chatScrollProcessScheduled = false
  pendingChatScrollEl = null
  lastProcessedChatScrollTop = 0
  didProcessChatScroll = false
  clearProgrammaticChatScrollMark()
  userChatScrollActiveUntil = 0
}

let scrollScheduled = false
let scrollToBottomPromise = null
let scrollScheduledForce = false
let scrollToBottomFollowUpRequested = false
let scrollToBottomFollowUpForce = false

async function scrollToBottom(options = {}) {
  const force = options.force === true
  if (scrollToBottomPromise) {
    scrollToBottomFollowUpRequested = true
    if (force) scrollToBottomFollowUpForce = true
    return scrollToBottomPromise
  }

  scrollToBottomPromise = (async () => {
    await nextTick()
    await waitForLayoutFrame()

    if (!force && (!autoScrollEnabled.value || autoScrollSuspendedByUser.value)) return

    const el = chatScrollEl.value || resolveScrollbarContainerEl()
    if (!el) return
    clearQueuedChatScrollCompensation()

    const target = resolveChatBottomScrollTarget({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop
    })
    if (target.shouldScroll) {
      markProgrammaticChatScroll(CHAT_SCROLL_COMPENSATION_SUSPEND_MS, target.targetScrollTop)
      try {
        el.scrollTo({ top: target.targetScrollTop, behavior: 'auto' })
      } catch {
        el.scrollTop = target.targetScrollTop
      }
    }

    updateAtBottomState(el)
    primeHydratedRenderedChatMessages()
  })().finally(() => {
    scrollToBottomPromise = null
    if (scrollToBottomFollowUpRequested) {
      const followUpForce = scrollToBottomFollowUpForce
      scrollToBottomFollowUpRequested = false
      scrollToBottomFollowUpForce = false
      scheduleScrollToBottom({ force: followUpForce })
    }
  })

  return scrollToBottomPromise
}

function scheduleScrollToBottom(options = {}) {
  if (options.force) scrollScheduledForce = true
  if (scrollScheduled) return
  scrollScheduled = true
  const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
  raf(() => {
    scrollScheduled = false
    const force = scrollScheduledForce
    scrollScheduledForce = false
    void scrollToBottom({ force })
  })
}

const TYPEWRITER_INTERVAL_MS = 16
const DEFERRED_TEXT_APPEND_INTERVAL_MS = 32
const typewriterStates = new Map()
const deferredMessageFieldStates = new Map()

function takeUnicodeChunk(text, count = 1) {
  if (!text) return { chunk: '', rest: '' }
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1
  let end = 0
  let taken = 0
  while (taken < safeCount && end < text.length) {
    const cp = text.codePointAt(end)
    end += cp && cp > 0xffff ? 2 : 1
    taken += 1
  }
  return { chunk: text.slice(0, end), rest: text.slice(end) }
}

function getTypewriterChunkSize(text) {
  const length = String(text || '').length
  if (length > 6000) return 96
  if (length > 2400) return 56
  if (length > 1200) return 32
  if (length > 480) return 16
  if (length > 180) return 8
  if (length > 80) return 4
  if (length > 24) return 2
  return 1
}

function ensureTypewriterState(messageId) {
  let state = typewriterStates.get(messageId)
  if (state) return state
  state = { buffer: '', running: false, timer: null, idleResolvers: [], message: null }
  typewriterStates.set(messageId, state)
  return state
}

function typewriterEnqueue(message, text) {
  const chunk = String(text || '')
  if (!chunk) return
  if (!isDisplayMessageInActiveSession(message)) {
    message.content += chunk
    return
  }
  const state = ensureTypewriterState(message.id)
  state.message = message
  state.buffer += chunk

  if (state.running) return
  state.running = true

  const tick = () => {
    if (!state.buffer) {
      state.running = false
      state.timer = null
      const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
      resolvers.forEach((r) => r())
      return
    }

    if (!isDisplayMessageInActiveSession(message)) {
      message.content += state.buffer
      state.buffer = ''
      state.running = false
      state.timer = null
      const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
      resolvers.forEach((r) => r())
      return
    }

    const { chunk: nextChunk, rest } = takeUnicodeChunk(state.buffer, getTypewriterChunkSize(state.buffer))
    state.buffer = rest
    message.content += nextChunk
    scheduleScrollToBottom()

    state.timer = window.setTimeout(tick, TYPEWRITER_INTERVAL_MS)
  }

  tick()
}

function typewriterWaitIdle(messageId) {
  const state = typewriterStates.get(messageId)
  if (!state) return Promise.resolve()
  if (!state.running && !state.buffer) return Promise.resolve()
  return new Promise((resolve) => state.idleResolvers.push(resolve))
}

function deferredMessageFieldKey(messageId, field) {
  return `${String(messageId || '').trim()}:${String(field || '').trim()}`
}

function ensureDeferredMessageFieldState(messageId, field) {
  const key = deferredMessageFieldKey(messageId, field)
  let state = deferredMessageFieldStates.get(key)
  if (state) return state
  state = { key, field, buffer: '', timer: null, idleResolvers: [], message: null }
  deferredMessageFieldStates.set(key, state)
  return state
}

function deferredAppendMessageField(message, field, text, options = {}) {
  const chunk = String(text || '')
  if (!chunk || !message || typeof message !== 'object') return
  const targetField = String(field || '').trim()
  if (!targetField) return
  const intervalMs = Math.max(16, Number(options.intervalMs) || DEFERRED_TEXT_APPEND_INTERVAL_MS)
  const scheduleScroll = options.scheduleScroll === true

  if (!isDisplayMessageInActiveSession(message)) {
    message[targetField] = String(message[targetField] || '') + chunk
    return
  }

  const state = ensureDeferredMessageFieldState(message.id, targetField)
  state.message = message
  state.buffer += chunk

  if (state.timer) return
  state.timer = window.setTimeout(() => {
    state.timer = null
    if (state.message && state.buffer) {
      state.message[targetField] = String(state.message[targetField] || '') + state.buffer
      state.buffer = ''
      if (scheduleScroll && isDisplayMessageInActiveSession(state.message)) {
        maybeScheduleScrollToBottomForRun()
      }
    }
    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((resolve) => resolve())
  }, intervalMs)
}

function deferredMessageFieldWaitIdle(messageId, field) {
  const state = deferredMessageFieldStates.get(deferredMessageFieldKey(messageId, field))
  if (!state) return Promise.resolve()
  if (!state.timer && !state.buffer) return Promise.resolve()
  return new Promise((resolve) => state.idleResolvers.push(resolve))
}

function flushDeferredMessageFieldsForMessage(messageId) {
  const targetId = String(messageId || '').trim()
  if (!targetId) return
  for (const [key, state] of deferredMessageFieldStates.entries()) {
    if (!key.startsWith(`${targetId}:`)) continue
    if (state.timer) window.clearTimeout(state.timer)
    state.timer = null
    if (state.message && state.buffer) {
      state.message[state.field] = String(state.message[state.field] || '') + state.buffer
      state.buffer = ''
    }
    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((resolve) => resolve())
    deferredMessageFieldStates.delete(key)
  }
}

function deferredMessageFieldFlushAll() {
  for (const [key, state] of deferredMessageFieldStates.entries()) {
    if (state.timer) window.clearTimeout(state.timer)
    state.timer = null

    if (state.message && state.buffer) {
      state.message[state.field] = String(state.message[state.field] || '') + state.buffer
      state.buffer = ''
    }

    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((resolve) => resolve())
    deferredMessageFieldStates.delete(key)
  }
}

function typewriterFlushAll() {
  for (const [id, state] of typewriterStates.entries()) {
    if (state.timer) window.clearTimeout(state.timer)
    state.timer = null
    state.running = false

    if (state.message && state.buffer) {
      state.message.content += state.buffer
      state.buffer = ''
    }

    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((r) => r())

    typewriterStates.delete(id)
  }
  deferredMessageFieldFlushAll()
}

function clearSessionData() {
  activeAgentRunToolMessageByStreamId.clear()
  session.messages.splice(0, session.messages.length)
  session.apiMessages.splice(0, session.apiMessages.length)
  lastDisplayMessageTime = 0
}

let lastDisplayMessageTime = 0

function nextDisplayMessageTime() {
  const now = Date.now()
  lastDisplayMessageTime = now > lastDisplayMessageTime ? now : lastDisplayMessageTime + 1
  return lastDisplayMessageTime
}

function deepCopyJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback ?? value
  }
}

function parseIsoTimeMs(value, fallback = 0) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) && ms > 0 ? ms : fallback
}

function resolvePersistedSessionCreatedAtMs({ record = null, payload = null, previousPayload = null } = {}) {
  const candidates = []
  const recordCreatedAtMs = Number(record?.createdAt || 0)
  if (Number.isFinite(recordCreatedAtMs) && recordCreatedAtMs > 0) candidates.push(recordCreatedAtMs)

  const payloadCreatedAtMs = parseIsoTimeMs(payload?.createdAt)
  if (payloadCreatedAtMs > 0) candidates.push(payloadCreatedAtMs)

  const previousCreatedAtMs = resolveChatSessionCreatedTimeMs(previousPayload)
  if (previousCreatedAtMs > 0) candidates.push(previousCreatedAtMs)

  const previousSavedAtMs = parseIsoTimeMs(previousPayload?.savedAt)
  if (previousSavedAtMs > 0) candidates.push(previousSavedAtMs)

  if (!candidates.length) return 0
  return Math.min(...candidates)
}

function buildDefaultSessionName(sessionLike = session) {
  const firstUser = (sessionLike?.messages || []).find((msg) => msg?.role === 'user')
  const prompt = extractEditableUserTextFromContent(firstUser?.content ?? '')
  return extractAutoSessionTitle(prompt) || '会话'
}

function sanitizeAutoSessionTitle(text, maxLength = 42) {
  const compact = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|#%{}~&]/g, ' ')
    .replace(/\.+/g, '.')
    .trim()
  if (!compact) return ''
  return compact.slice(0, maxLength).trim() || ''
}

function extractAutoSessionTitle(text, maxLength = 32) {
  const raw = String(text || '')
    .replace(/【附件内容】[\s\S]*$/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[`*_>#\[\]{}()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return ''

  const cleaned = raw
    .replace(/^(请|麻烦|帮我|请帮我|能不能|可以的话|我想要|我希望)\s*/u, '')
    .trim()
  const segments = cleaned
    .split(/[。！？!?；;\n\r]+/)
    .map((item) => sanitizeAutoSessionTitle(item, maxLength))
    .filter(Boolean)
  const picked = segments.find((item) => item.length >= 6) || segments[0] || sanitizeAutoSessionTitle(cleaned, maxLength)
  return sanitizeAutoSessionTitle(picked, maxLength)
}

function buildAutoSessionTitle(record) {
  const firstUser = (record?.messages || []).find((msg) => msg?.role === 'user')
  const prompt = extractEditableUserTextFromContent(firstUser?.content ?? '')
  const title = extractAutoSessionTitle(prompt)
  return title || AUTO_CHAT_SESSION_DIR_NAME
}

function normalizeGeneratedSessionTitle(text, fallback = '') {
  const raw = String(text || '')
    .replace(/^\s*(?:标题|会话标题|title)\s*[:：-]\s*/i, '')
    .replace(/^[`"'“”‘’《》〈〉「」『』【】（）()]+|[`"'“”‘’《》〈〉「」『』【】（）()]+$/g, '')
    .split(/\r?\n/)[0]
    .trim()
  const normalized = sanitizeAutoSessionTitle(raw, 32)
  if (normalized) return normalized
  return sanitizeAutoSessionTitle(fallback, 32)
}

function summarizeAttachmentNamesForSessionTitle(attachments = []) {
  const names = (Array.isArray(attachments) ? attachments : [])
    .map((item) => String(item?.name || item?.filename || item?.fileName || '').trim())
    .filter(Boolean)
    .slice(0, 4)
  if (!names.length) return ''
  return names.join('、')
}

function buildSessionTitleGenerationPrompt({ text = '', attachments = [] } = {}) {
  const cleanText = String(text || '').trim()
  const attachmentSummary = summarizeAttachmentNamesForSessionTitle(attachments)
  return [
    '请根据这条用户消息生成一个简短的会话标题。',
    '要求：',
    '1. 只输出标题本身，不要解释，不要引号，不要序号。',
    '2. 优先使用中文，控制在 4 到 18 个字以内。',
    '3. 避免使用“请帮我”“帮我”“如何”“能不能”等口语开头。',
    '4. 不要包含路径、扩展名、时间戳或多余符号。',
    cleanText ? `用户消息：${cleanText}` : '用户消息：用户发送了附件，请结合附件信息概括主题。',
    attachmentSummary ? `附件信息：${attachmentSummary}` : ''
  ].filter(Boolean).join('\n')
}

async function requestSessionTitleFromModel({
  providerKind = 'openai-compatible',
  providerId = '',
  baseUrl = '',
  apiKey = '',
  model = '',
  prompt = ''
} = {}) {
  const userPrompt = String(prompt || '').trim()
  if (!userPrompt) return ''

  const systemPrompt = '你是会话标题生成器，只输出一个忠实、简短的标题。'

  if (providerKind === 'utools-ai') {
    if (!canUseUtoolsAi()) return ''
    const result = await window.utools.ai({
      model,
      messages: buildUtoolsAiMessages({
        systemContent: systemPrompt,
        apiMessages: [{ role: 'user', content: userPrompt }]
      })
    })
    recordModelUsage(extractModelUsage(result), {
      providerId,
      model,
      endpoint: 'utools-ai',
      purpose: 'session-title'
    })
    return String(result?.content || '').trim()
  }

  if (!baseUrl || !apiKey || !model) return ''
  const result = await streamChatCompletion({
    baseUrl,
    apiKey,
    body: {
      model,
      stream: true,
      temperature: 0.2,
      max_tokens: 64,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    }
  })
  recordModelUsage(result?.usage, {
    providerId,
    model,
    endpoint: result?.endpoint || 'auto',
    purpose: 'session-title'
  })
  return String(result?.content || '').trim()
}

async function moveAutoChatSessionAssetsForRename(oldPath, newPath) {
  const from = buildChatSessionAssetsDirectory(oldPath)
  const to = buildChatSessionAssetsDirectory(newPath)
  if (!from || !to || from === to) return
  try {
    if (!(await exists(from))) return
    await moveItem(from, to, { overwrite: true })
  } catch (err) {
    console.warn('[chat session title] move assets failed:', err)
  }
}

async function ensureAutoChatSessionRoot() {
  const rootExists = await exists(CHAT_SESSION_ROOT)
  if (!rootExists) await createDirectory(CHAT_SESSION_ROOT)
  const autoExists = await exists(AUTO_CHAT_SESSION_ROOT)
  if (!autoExists) await createDirectory(AUTO_CHAT_SESSION_ROOT)
}

async function allocateAutoChatSessionPathByTitle(title, options = {}) {
  await ensureAutoChatSessionRoot()
  const sanitizedTitle = sanitizeAutoSessionTitle(title, 96) || AUTO_CHAT_SESSION_DIR_NAME
  const excludePath = String(options.excludePath || '').trim()
  let candidate = `${AUTO_CHAT_SESSION_ROOT}/${sanitizedTitle}.json`
  let index = 2
  while (await exists(candidate)) {
    if (candidate === excludePath) break
    candidate = `${AUTO_CHAT_SESSION_ROOT}/${sanitizedTitle}-${index}.json`
    index += 1
  }
  return {
    filePath: candidate,
    title: sanitizeAutoSessionTitle(title, 32) || AUTO_CHAT_SESSION_DIR_NAME
  }
}

async function allocateAutoChatSessionPath(record) {
  const title = getPersistedMemorySessionTitle(record) || DEFAULT_MEMORY_SESSION_TITLE
  return allocateAutoChatSessionPathByTitle(title)
}

async function applyGeneratedSessionTitle(record, nextTitle, options = {}) {
  if (!record) return ''

  const fallbackTitle = normalizeGeneratedSessionTitle(options.fallbackTitle, buildAutoSessionTitle(record))
  const generatedTitle = normalizeGeneratedSessionTitle(nextTitle, fallbackTitle)
  if (!generatedTitle) return ''

  const currentPath = String(record.activeSessionFilePath || '').trim()
  if (!currentPath || !isAutoChatSessionPath(currentPath)) return currentPath

  const currentVisibleTitle = String(record.activeSessionTitle || '').trim()
  if (
    currentVisibleTitle &&
    currentVisibleTitle !== fallbackTitle &&
    currentVisibleTitle !== generatedTitle
  ) {
    return currentPath
  }

  const allocated = await allocateAutoChatSessionPathByTitle(generatedTitle, { excludePath: currentPath })
  let nextPath = currentPath

  if (allocated.filePath !== currentPath) {
    await moveItem(currentPath, allocated.filePath)
    await moveAutoChatSessionAssetsForRename(currentPath, allocated.filePath)
    handleSessionPathRenamed(currentPath, allocated.filePath)
    nextPath = allocated.filePath
  }

  record.activeSessionFilePath = nextPath
  record.activeSessionTitle = generatedTitle
  record.title = generatedTitle
  record.titleSource = 'generated'
  record.titlePostReplyRetryDone = false
  record.titleReadyAt = Number(record.titleReadyAt || 0) || Date.now()
  record.updatedAt = Date.now()

  if (isMemorySessionActive(record)) {
    activeSessionFilePath.value = nextPath
    activeSessionTitle.value = generatedTitle
  }

  await autoPersistMemorySession(record, { notify: false, syncActiveUi: true })
  await sessionTreeRef.value?.refreshTree?.({ silent: true })
  await sessionTreeRef.value?.selectPath?.(nextPath)
  return nextPath
}

function requestSessionTitleAsync({
  record,
  cfg,
  text,
  attachments = [],
  initialPersistPromise = Promise.resolve(''),
  reason = 'initial'
} = {}) {
  const triggerReason = String(reason || 'initial').trim() || 'initial'
  const canRequest = triggerReason === 'post_reply'
    ? canRetryMemorySessionTitle(record)
    : canGenerateMemorySessionTitle(record)
  if (!canRequest) return

  const recordId = String(record.id || '').trim()
  if (!recordId) return
  if (sessionTitleRequestTokens.has(recordId)) return

  const fallbackTitle = buildAutoSessionTitle(record)
  const prompt = buildSessionTitleGenerationPrompt({ text, attachments })
  if (!prompt) return

  const titleToken = `${recordId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  sessionTitleRequestTokens.set(recordId, titleToken)
  if (triggerReason === 'post_reply') {
    record.titlePostReplyRetryDone = true
  }
  let retryAfterFailure = false

  void (async () => {
    try {
      const persistedPath = String(await Promise.resolve(initialPersistPromise).catch(() => '') || '').trim()
      const generated = await requestSessionTitleFromModel({
        providerKind: cfg?.providerKind || 'openai-compatible',
        providerId: String(cfg?.providerId || '').trim(),
        baseUrl: String(cfg?.baseUrl || '').trim(),
        apiKey: String(cfg?.apiKey || '').trim(),
        model: String(cfg?.model || '').trim(),
        prompt
      })

      if (sessionTitleRequestTokens.get(recordId) !== titleToken) return

      const latestRecord = getMemorySessionById(recordId)
      if (!latestRecord) return

      const normalizedTitle = normalizeGeneratedSessionTitle(generated, '')
      if (!isGeneratedSessionTitle(normalizedTitle)) return

      const titleReadyAt = Date.now()
      latestRecord.title = normalizedTitle
      latestRecord.activeSessionTitle = normalizedTitle
      latestRecord.titleSource = 'generated'
      latestRecord.titlePostReplyRetryDone = false
      latestRecord.titleReadyAt = titleReadyAt
      if (shouldStampHistoryCreatedAtOnGeneratedTitle(latestRecord)) {
        latestRecord.createdAt = titleReadyAt
      }
      if (isMemorySessionActive(latestRecord)) {
        activeSessionTitle.value = normalizedTitle
      }

      const currentPath = String(latestRecord.activeSessionFilePath || persistedPath || '').trim()
      if (!currentPath) {
        await autoPersistMemorySession(latestRecord, { notify: false, syncActiveUi: true })
      } else if (isAutoChatSessionPath(currentPath)) {
        await applyGeneratedSessionTitle(latestRecord, normalizedTitle, { fallbackTitle })
      }
    } catch (err) {
      console.warn('[chat session title] generation failed:', err)
      const latestRecord = getMemorySessionById(recordId)
      if (!latestRecord) return

      const titleReadyAt = applyFallbackMemorySessionTitle(latestRecord, fallbackTitle)
      if (!titleReadyAt) return

      if (isMemorySessionActive(latestRecord)) {
        activeSessionTitle.value = String(latestRecord.title || '').trim()
      }

      if (isMemorySessionRunning(latestRecord)) return

      const currentPath = String(latestRecord.activeSessionFilePath || '').trim()
      if (!currentPath) {
        await autoPersistMemorySession(latestRecord, { notify: false, syncActiveUi: true })
      } else if (isAutoChatSessionPath(currentPath)) {
        await applyGeneratedSessionTitle(latestRecord, latestRecord.title, { fallbackTitle: latestRecord.title })
      }

      if (hasPersistableMemorySessionResponse(latestRecord) && !latestRecord.titlePostReplyRetryDone) {
        retryAfterFailure = true
      }
    } finally {
      if (sessionTitleRequestTokens.get(recordId) === titleToken) {
        sessionTitleRequestTokens.delete(recordId)
      }
      if (retryAfterFailure) {
        retryAfterFailure = false
        void requestSessionTitleAsync({
          record: getMemorySessionById(recordId),
          cfg,
          text,
          attachments,
          reason: 'post_reply'
        })
      }
    }
  })()
}

async function autoPersistMemorySession(record, options = {}) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return ''
  const titleReadyAt = markMemorySessionTitleReady(record)
  if (!titleReadyAt) return ''
  const currentPath = String(record.activeSessionFilePath || '').trim()
  if (currentPath && !isAutoChatSessionPath(currentPath)) return currentPath
  const previousPath = currentPath

  const persistKey = getMemorySessionAutoPersistKey(record)
  const shouldSyncActiveUi = options.syncActiveUi !== false
  const existingPersist = persistKey ? autoPersistMemorySessionInFlight.get(persistKey) : null
  if (existingPersist) return existingPersist

  const persistTask = (async () => {
    try {
      const allocated = currentPath
        ? { filePath: currentPath, title: getPersistedMemorySessionTitle(record) || DEFAULT_MEMORY_SESSION_TITLE }
        : await allocateAutoChatSessionPath(record)
      await prepareSessionMediaAssetsForSave(record, { notify: options.notify, sessionFilePath: allocated.filePath })
      const payload = buildSessionSavePayload({
        sessionLike: record,
        state: record.state && typeof record.state === 'object' ? record.state : buildCurrentChatState()
      })
      let previousPayload = null
      if (currentPath) {
        try {
          const previousSnapshot = await readSessionJsonFile(currentPath)
          previousPayload = previousSnapshot.ok ? previousSnapshot.value : null
        } catch {
          previousPayload = null
        }
      }

      const resolvedCreatedAtMs = resolvePersistedSessionCreatedAtMs({
        record,
        payload,
        previousPayload
      })
      const createdAtIso = resolvedCreatedAtMs > 0 ? new Date(resolvedCreatedAtMs).toISOString() : new Date().toISOString()
      const previousSavedAt = String(previousPayload?.savedAt || previousPayload?.createdAt || '').trim()
      payload.title = allocated.title
      payload.createdAt = createdAtIso
      if (previousSavedAt) payload.savedAt = previousSavedAt
      payload.updatedAt = new Date().toISOString()
      payload.source = {
        type: AUTO_CHAT_SESSION_SOURCE_TYPE,
        retentionDays: AUTO_CHAT_SESSION_RETENTION_DAYS,
        managed: true,
        createdAt: payload.createdAt,
        titleReadyAt: new Date(titleReadyAt).toISOString(),
        titleSource: String(record.titleSource || '').trim() || 'generated',
        titleRetryCount: Number(record.titleRetryCount || 0) || 0
      }
      await writeFile(allocated.filePath, JSON.stringify(payload, null, 2))

      record.activeSessionFilePath = allocated.filePath
      record.activeSessionTitle = allocated.title
      record.autoManaged = true
      if (resolvedCreatedAtMs > 0) record.createdAt = resolvedCreatedAtMs
      record.updatedAt = Date.now()

      if (isMemorySessionActive(record) && shouldSyncActiveUi && previousPath !== allocated.filePath) {
        activeSessionFilePath.value = allocated.filePath
        activeSessionTitle.value = allocated.title
        void sessionTreeRef.value?.selectPath?.(allocated.filePath)
      }
      sessionTreeRef.value?.touchPath?.(allocated.filePath, {
        label: allocated.title,
        createdTimeMs: Number(record.createdAt || 0) || Date.now()
      })
      pruneDormantMemorySessions()
      return allocated.filePath
    } catch (err) {
      if (options.notify !== false) message.error('自动归档会话失败：' + (err?.message || String(err)))
      return ''
    }
  })()

  if (!persistKey) return persistTask
  autoPersistMemorySessionInFlight.set(persistKey, persistTask)
  try {
    return await persistTask
  } finally {
    if (autoPersistMemorySessionInFlight.get(persistKey) === persistTask) {
      autoPersistMemorySessionInFlight.delete(persistKey)
    }
  }
}

function autoPersistMemorySessionWhenIdle(record, options = {}) {
  if (isMemorySessionRunning(record)) return ''
  if (!canPersistMemorySessionToHistory(record)) return ''
  const currentPath = String(record?.activeSessionFilePath || '').trim()
  if (!hasResolvedMemorySessionTitle(record)) return ''
  if (currentPath && !isAutoChatSessionPath(currentPath)) {
    return persistMemorySessionToBoundPath(record, options)
  }
  return autoPersistMemorySession(record, options)
}

function getStatMtimeMs(statInfo) {
  const direct = Number(statInfo?.mtimeMs)
  if (Number.isFinite(direct) && direct > 0) return direct
  const mtime = statInfo?.mtime ? new Date(statInfo.mtime).getTime() : 0
  if (Number.isFinite(mtime) && mtime > 0) return mtime
  return 0
}

async function cleanupAutoChatSessions(options = {}) {
  const notify = options.notify === true
  const now = Date.now()
  const cutoff = now - AUTO_CHAT_SESSION_RETENTION_MS
  let removed = 0

  try {
    await ensureAutoChatSessionRoot()
    const entries = await listDirectory(AUTO_CHAT_SESSION_ROOT)
    for (const entry of entries) {
      const entryPath = String(entry || '').trim().replace(/\\/g, '/')
      if (!entryPath || !entryPath.toLowerCase().endsWith('.json')) continue

      const inMemory = memorySessions.value.some((record) => String(record?.activeSessionFilePath || '').trim() === entryPath)
      if (inMemory) continue

      let mtimeMs = 0
      try {
        mtimeMs = getStatMtimeMs(await stat(entryPath))
      } catch {
        mtimeMs = 0
      }
      if (!mtimeMs || mtimeMs >= cutoff) continue

      try {
        let payload = null
      try {
          const parsedPayload = await readSessionJsonFile(entryPath)
          payload = parsedPayload.ok ? parsedPayload.value : null
        } catch {
          payload = null
        }
        await deleteItem(entryPath)
        if (payload) await deleteChatMediaAssetPaths(collectChatMediaAssetPathsFromPayload(payload, { sessionFilePath: entryPath }))
        await deleteChatSessionAssetDirectory(entryPath)
        removed += 1
      } catch {
        // ignore individual cleanup failures
      }
    }
    if (removed) void sessionTreeRef.value?.refreshTree?.({ silent: true })
    if (notify) message.success(removed ? `已清理 ${removed} 个历史会话` : '没有需要清理的历史会话')
  } catch (err) {
    if (notify) message.error('清理历史会话失败：' + (err?.message || String(err)))
  }
}

async function migrateLegacyAutoChatSessionCreatedAt(options = {}) {
  const notify = options.notify === true
  let migrated = 0

  try {
    await ensureAutoChatSessionRoot()
    const entries = await listDirectory(AUTO_CHAT_SESSION_ROOT)
    for (const entry of entries) {
      const entryPath = String(entry || '').trim().replace(/\\/g, '/')
      if (!entryPath || !entryPath.toLowerCase().endsWith('.json')) continue

      let parsed = null
      try {
        parsed = await readSessionJsonFile(entryPath, { repairIfRecovered: true })
      } catch {
        parsed = null
      }
      if (!parsed?.ok || !parsed.value || typeof parsed.value !== 'object') continue

      const payload = parsed.value
      const currentCreatedAt = String(payload?.createdAt || '').trim()
      const sourceCreatedAt = String(payload?.source?.createdAt || '').trim()
      const sourceStartedAt = String(payload?.source?.startedAt || '').trim()
      const existingCreatedAtMs =
        parseIsoTimeMs(currentCreatedAt) ||
        parseIsoTimeMs(sourceCreatedAt) ||
        parseIsoTimeMs(sourceStartedAt)
      const inferredCreatedAtMs = resolveChatSessionCreatedTimeMs(payload)
      if (!Number.isFinite(inferredCreatedAtMs) || inferredCreatedAtMs <= 0) continue
      if (existingCreatedAtMs > 0 && inferredCreatedAtMs >= existingCreatedAtMs) continue

      const inferredCreatedAt = new Date(inferredCreatedAtMs).toISOString()
      payload.createdAt = inferredCreatedAt
      payload.source = payload.source && typeof payload.source === 'object'
        ? { ...payload.source, createdAt: inferredCreatedAt }
        : { createdAt: inferredCreatedAt }
      if (!String(payload.savedAt || '').trim()) payload.savedAt = inferredCreatedAt

      await writeFile(entryPath, JSON.stringify(payload, null, 2))
      migrated += 1
    }

    if (migrated) {
      void sessionTreeRef.value?.refreshTree?.({ silent: true })
      if (notify) message.success(`已补齐 ${migrated} 个历史会话的创建时间`)
    } else if (notify) {
      message.info('没有需要补齐创建时间的历史会话')
    }
  } catch (err) {
    if (notify) message.error('补齐历史会话创建时间失败：' + (err?.message || String(err)))
  }
}

async function persistActiveMemorySessionBeforeLeaving(options = {}) {
  const targetPath = String(options.targetPath || '').trim()
  const previous = saveActiveMemorySessionDraft()

  if (isMemorySessionRunning(previous)) return previous
  if (isMemorySessionEmptyDraft(previous)) {
    removeMemorySessionById(previous.id)
    return null
  }

  const previousPath = String(previous.activeSessionFilePath || '').trim()
  if (previousPath && previousPath === targetPath) return previous

  await flushMemoryCandidatesForRecord(previous, { force: false })

  if (previousPath && !isAutoChatSessionPath(previousPath)) {
    await runSessionAutosave()
  } else {
    await autoPersistMemorySession(previous, {
      notify: false,
      syncActiveUi: !targetPath
    })
  }
  return previous
}

async function detachRunningSessionToHistory({ nextRecord = null, notify = true, restoreTarget = true } = {}) {
  const activeRecord = getActiveMemorySession()
  if (!isMemorySessionRunning(activeRecord)) return false

  const previous = saveActiveMemorySessionDraft()
  const previousPath = String(previous.activeSessionFilePath || '').trim()
  const preserveBoundPath = !!previousPath
  previous.autoManaged = preserveBoundPath ? isAutoChatSessionPath(previousPath) : true
  previous.state = previous.state && typeof previous.state === 'object' ? previous.state : buildCurrentChatState()
  if (!preserveBoundPath) {
    previous.activeSessionFilePath = ''
    previous.activeSessionTitle = ''
  }

  activeSessionFilePath.value = ''
  activeSessionTitle.value = ''
  sending.value = false
  abortController.value = null

  if (!restoreTarget) {
    if (notify) message.info('当前生成已转入后台，完成后会自动保存')
    return true
  }

  let target = nextRecord
  if (!target) {
    target = createMemorySessionRecord({ title: DEFAULT_MEMORY_SESSION_TITLE, state: buildDefaultChatState() })
    memorySessions.value = [...memorySessions.value, target]
  }

  restoreMemorySession(target, { skipScroll: !nextRecord, skipSaveCurrent: true })
  if (!nextRecord) {
    try {
      sessionTreeRef.value?.clearSelection?.()
    } catch {
      // ignore
    }
  }
  pruneDormantMemorySessions({ keepId: target.id })
  if (notify) message.info('当前生成已转入后台，完成后会自动保存')
  return true
}

async function startNewMemorySession(options = {}) {
  const activeRecord = getActiveMemorySession()
  if (isMemorySessionEmptyDraft(activeRecord)) {
    restoreMemorySession(activeRecord, { skipScroll: true, skipSaveCurrent: true })
    activeRecord.title = DEFAULT_MEMORY_SESSION_TITLE
    activeRecord.state = applyDefaultChatState()
    activeRecord.updatedAt = Date.now()
    try {
      sessionTreeRef.value?.clearSelection?.()
    } catch {
      // ignore
    }
    return
  }

  if (isMemorySessionRunning(activeRecord)) {
    await detachRunningSessionToHistory({ notify: options.notify !== false })
    return
  }

  await persistActiveMemorySessionBeforeLeaving()
  const record = createMemorySessionRecord({ title: DEFAULT_MEMORY_SESSION_TITLE, state: buildDefaultChatState() })
  memorySessions.value = [...memorySessions.value.filter((item) => !isMemorySessionEmptyDraft(item)), record]
  restoreMemorySession(record, { skipScroll: true, skipSaveCurrent: true })
  try {
    sessionTreeRef.value?.clearSelection?.()
  } catch {
    // ignore
  }
  if (options.notify !== false) message.info('已新建会话')
}

async function switchMemorySession(id) {
  const record = getMemorySessionById(id)
  if (!record || String(record.id || '') === String(activeMemorySessionId.value || '')) return

  const activeRecord = getActiveMemorySession()
  if (isMemorySessionRunning(activeRecord)) {
    await detachRunningSessionToHistory({ nextRecord: record, notify: false })
    message.info('当前生成已转入后台，已切换会话')
    return
  }

  await persistActiveMemorySessionBeforeLeaving()
  await withChatSessionOpeningHeavyRender(async () => {
    void maybeWarmMarkdownPreviewRuntimeForMessages(record.messages).catch(() => {})
    restoreMemorySession(record, { skipSaveCurrent: true, skipScroll: true })
    await scrollToBottom({ force: true })
    await settleChatViewportAfterSessionOpen({
      reconnectObserver: true,
      buffer: resolveCurrentHeavyRenderViewportBuffer(CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA)
    })
  })
  pruneDormantMemorySessions({ keepId: record.id })
}

function handleMemorySessionSelect(key) {
  const id = String(key || '').trim()
  if (id === '__new__') {
    void startNewMemorySession()
    return
  }
  void switchMemorySession(id)
}

async function prepareSessionMediaAssetsForSave(sessionLike, options = {}) {
  try {
    const sessionFilePath = String(options.sessionFilePath || sessionLike?.activeSessionFilePath || '').trim()
    await persistChatSessionMediaAssets(sessionLike, { sessionFilePath })
  } catch (err) {
    if (options.notify !== false) {
      message.warning('媒体文件持久化失败，部分图片/视频可能只能在当前页面临时预览：' + (err?.message || String(err)))
    }
  }
}

function serializeDisplayMessageForSave(msg) {
  if (!msg || typeof msg !== 'object') return null
  const out = { ...msg }

  if (out.role === 'user') {
    out.editing = false
    out.editDraft = ''
    out.attachmentsExpanded = false
  }

  if (out.role === 'assistant') {
    out.streaming = false
    out.thinkingExpanded = false
  }

  if (out.role === 'tool' || out.role === 'tool_call') {
    out.toolExpanded = false
    out.agentRunExpandedStepIds = []
  }

  if (Array.isArray(out.attachments)) {
    out.attachments = out.attachments
      .map((a) => {
        if (!a || typeof a !== 'object') return null
        return {
          id: a.id,
          name: a.name,
          ext: a.ext,
          mime: a.mime,
          size: a.size,
          kind: a.kind,
          status: a.status,
          error: a.error,
          sandboxWorkspaceId: a.sandboxWorkspaceId,
          sandboxPath: a.sandboxPath,
          sandboxDataPath: a.sandboxDataPath
        }
      })
      .filter(Boolean)
  }

  if (Array.isArray(out.images)) {
    out.images = out.images.map((media) => serializeChatMediaForSave(media, 'image')).filter(Boolean)
  }

  if (Array.isArray(out.videos)) {
    out.videos = out.videos.map((media) => serializeChatMediaForSave(media, 'video')).filter(Boolean)
  }

  return out
}

function buildCurrentChatState() {
  const activeRecord = getActiveMemorySession()
  const normalizedBasePromptState = basePromptMode.value === 'prompt'
    ? {
        basePromptMode: 'prompt',
        selectedPromptId: selectedPromptId.value,
        customSystemPrompt: '',
        customSystemPromptExplicit: false
      }
    : buildCustomSystemPromptState(customSystemPrompt.value, customSystemPromptExplicit.value)
  return {
    selectedAgentId: selectedAgentId.value,
    selectedProviderId: selectedProviderId.value,
    selectedModel: selectedModel.value,
    basePromptMode: normalizedBasePromptState.basePromptMode,
    selectedPromptId: normalizedBasePromptState.selectedPromptId,
    customSystemPrompt: normalizedBasePromptState.customSystemPrompt,
    customSystemPromptExplicit: normalizedBasePromptState.customSystemPromptExplicit,
    selectedSkillIds: deepCopyJson(
      normalizeStringList(selectedSkillIds.value)
        .filter((id) => !routerAddedSelectedSkillIds.has(id)),
      []
    ),
    agentSkillIds: deepCopyJson(
      normalizeStringList(agentSkillIds.value)
        .filter((id) => !routerAddedAgentSkillIds.has(id)),
      []
    ),
    activatedAgentSkillIds: deepCopyJson(
      normalizeStringList(activatedAgentSkillIds.value)
        .filter((id) => !routerActivatedAgentSkillIds.has(id)),
      []
    ),
    manualMcpIds: deepCopyJson(manualMcpIds.value, []),
    sandboxHostWorkspacePath: normalizeSelectedHostWorkspacePath(sandboxHostWorkspacePath.value),
    webSearchEnabled: webSearchEnabled.value,
    toolApprovalMode: toolApprovalMode.value,
    autoApproveTools: autoApproveTools.value,
    autoActivateAgentSkills: autoActivateAgentSkills.value,
    toolMode: toolMode.value,
    effectiveToolMode: effectiveToolMode.value,
    thinkingEffort: thinkingEffort.value,
    imageGenerationMode: imageGenerationMode.value,
    videoGenerationMode: videoGenerationMode.value,
    imageGenerationParamsEnabled: imageGenerationParamsEnabled.value,
    imageGenerationParams: deepCopyJson(imageGenerationParams, createDefaultImageGenerationParams()),
    videoGenerationParamsEnabled: videoGenerationParamsEnabled.value,
    videoGenerationParams: deepCopyJson(videoGenerationParams, createDefaultVideoGenerationParams()),
    contextWindow: sessionContextWindowOverride.value
      ? deepCopyJson(normalizeChatContextWindowConfig(sessionContextWindowOverride.value), null)
      : null,
    contextSummary: deepCopyJson(activeRecord?.contextSummary || {}, {}),
    contextTokenTelemetry: normalizeContextTokenTelemetry(activeRecord?.contextTokenTelemetry)
  }
}

function buildDefaultChatState() {
  const rawDefaultSystemPrompt = String(chatConfig.value?.defaultSystemPrompt || '')
  const defaultModel = resolveDefaultModelSelectionFromConfig()
  const defaultPromptState = buildCustomSystemPromptState(rawDefaultSystemPrompt, false)
  const builtinAgent = (agents.value || []).find((agent) => String(agent?._id || '').trim() === BUILTIN_AGENT_ID)
  const builtinSkillIds = normalizeStringList(builtinAgent?.skills)
  return {
    selectedAgentId: builtinAgent?._id || null,
    selectedProviderId: defaultModel.providerId || null,
    selectedModel: defaultModel.model || '',
    basePromptMode: defaultPromptState.basePromptMode,
    selectedPromptId: defaultPromptState.selectedPromptId,
    customSystemPrompt: defaultPromptState.customSystemPrompt,
    customSystemPromptExplicit: defaultPromptState.customSystemPromptExplicit,
    selectedSkillIds: builtinSkillIds,
    agentSkillIds: builtinSkillIds,
    activatedAgentSkillIds: [],
    manualMcpIds: [],
    sandboxHostWorkspacePath: '',
    webSearchEnabled: false,
    toolApprovalMode: normalizeToolApprovalMode(chatConfig.value?.toolApprovalMode),
    autoApproveTools: normalizeToolApprovalMode(chatConfig.value?.toolApprovalMode) !== TOOL_APPROVAL_MODE_MANUAL,
    autoActivateAgentSkills: true,
    toolMode: 'auto',
    effectiveToolMode: 'expanded',
    thinkingEffort: 'auto',
    imageGenerationMode: normalizeImageGenerationMode(chatConfig.value?.imageGenerationMode),
    videoGenerationMode: normalizeImageGenerationMode(chatConfig.value?.videoGenerationMode),
    imageGenerationParamsEnabled: false,
    imageGenerationParams: createDefaultImageGenerationParams(),
    videoGenerationParamsEnabled: false,
    videoGenerationParams: createDefaultVideoGenerationParams(),
    contextWindow: null,
    contextTokenTelemetry: createEmptyContextTokenTelemetry()
  }
}

function buildHydratedChatState(state) {
  const merged = buildMergedChatState(buildDefaultChatState(), state)
  merged.toolApprovalMode = normalizeToolApprovalMode(
    state?.toolApprovalMode,
    state?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : TOOL_APPROVAL_MODE_SAFE
  )
  merged.autoApproveTools = merged.toolApprovalMode !== TOOL_APPROVAL_MODE_MANUAL
  return merged
}

function applyDefaultChatState() {
  const state = buildDefaultChatState()
  sessionContextWindowOverride.value = null
  applyLoadedChatState(state)

  const rawDefaultSystemPrompt = String(state.customSystemPrompt || '')
  lastLoadedDefaultSystemPrompt.value = normalizePromptText(rawDefaultSystemPrompt)
  customSystemPromptExplicit.value = false
  hasInitializedDefaultSystemPrompt.value = true
  systemPromptDraft.value = ''
  agentModalSelectedId.value = null
  promptModalSelectedId.value = null
  skillModalSelectedIds.value = []
  mcpModalSelectedIds.value = []
  hasAppliedDefaultModel.value = !!(state.selectedProviderId && state.selectedModel)

  try {
    mcpListToolsCache.clear()
    mcpListToolsInFlight.clear()
    mcpToolsRevision.value += 1
    clearMcpToolCatalog()
    clearPinnedMcpToolHints()
  } catch {
    // ignore
  }

  return state
}

function buildSessionSavePayload(options = {}) {
  const sessionLike = options.sessionLike || options.session || session
  const activeRecord = getActiveMemorySession()
  const memorySource =
    sessionLike && Object.prototype.hasOwnProperty.call(sessionLike, 'memoryCandidates') ? sessionLike : activeRecord
  const state = options.state && typeof options.state === 'object' ? options.state : buildCurrentChatState()
  return {
    version: 1,
    type: 'chat_session',
    savedAt: new Date().toISOString(),
    state,
    session: {
      messages: (sessionLike.messages || []).map(serializeDisplayMessageForSave).filter(Boolean),
      apiMessages: deepCopyJson(sessionLike.apiMessages || [], [])
    },
    memory: {
      candidates: normalizeMemoryCandidateQueue(memorySource?.memoryCandidates),
      candidateUpdatedAt: Number(memorySource?.memoryCandidateUpdatedAt || 0) || 0,
      contextSummary: deepCopyJson(memorySource?.contextSummary || {}, {}),
      contextTokenTelemetry: normalizeContextTokenTelemetry(memorySource?.contextTokenTelemetry)
    }
  }
}

function replacePathPrefix(targetPath, oldBase, newBase) {
  const t = String(targetPath || '')
  if (t === oldBase) return newBase
  if (t.startsWith(oldBase + '/')) return newBase + t.slice(oldBase.length)
  return t
}

function isPathEqualOrInside(targetPath, basePath) {
  const target = String(targetPath || '').trim()
  const base = String(basePath || '').trim()
  if (!target || !base) return false
  return target === base || target.startsWith(base + '/')
}

function getSessionTitleFromPath(filePath) {
  const p = String(filePath || '').trim()
  const name = p.split('/').filter(Boolean).pop() || ''
  if (!name) return ''
  return name.toLowerCase().endsWith('.json') ? name.slice(0, -5) : name
}

async function persistMemorySessionToBoundPath(record, options = {}) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return ''
  const filePath = String(record.activeSessionFilePath || '').trim()
  if (!filePath || isAutoChatSessionPath(filePath)) return ''

  try {
    const stateSnapshot =
      options.state && typeof options.state === 'object'
        ? deepCopyJson(options.state, {})
        : record.state && typeof record.state === 'object'
          ? deepCopyJson(record.state, {})
          : buildCurrentChatState()
    await prepareSessionMediaAssetsForSave(record, { notify: options.notify, sessionFilePath: filePath })
    const payload = buildSessionSavePayload({
      sessionLike: record,
      state: stateSnapshot
    })
    let previousPayload = null
    try {
      const previousSnapshot = await readSessionJsonFile(filePath)
      previousPayload = previousSnapshot.ok ? previousSnapshot.value : null
    } catch {
      previousPayload = null
    }

    const resolvedCreatedAtMs = resolvePersistedSessionCreatedAtMs({
      record,
      payload,
      previousPayload
    })
    const createdAtIso = resolvedCreatedAtMs > 0 ? new Date(resolvedCreatedAtMs).toISOString() : ''
    const previousSavedAt = String(previousPayload?.savedAt || previousPayload?.createdAt || '').trim()
    if (createdAtIso) payload.createdAt = createdAtIso
    if (previousSavedAt) payload.savedAt = previousSavedAt
    const title = getPersistedMemorySessionTitle(record, filePath)
    if (title) payload.title = title
    payload.updatedAt = new Date().toISOString()

    await writeFile(filePath, JSON.stringify(payload, null, 2))
    if (resolvedCreatedAtMs > 0) record.createdAt = resolvedCreatedAtMs
    record.updatedAt = Date.now()
    void sessionTreeRef.value?.touchPath?.(filePath, {
      label: title,
      createdTimeMs: Number(record.createdAt || 0) || Date.now()
    })
    return filePath
  } catch (err) {
    if (options.notify !== false) message.error('自动保存失败：' + (err?.message || String(err)))
    return ''
  }
}

let sessionAutosaveTimer = null
let lastSessionAutosaveAt = 0
let sessionAutosaveInFlight = false
let lastSessionAutosaveErrorAt = 0
let lastSessionAutosaveErrorMsg = ''

function unbindSessionAutosave(options = {}) {
  const silent = !!options.silent

  activeSessionFilePath.value = ''
  activeSessionTitle.value = ''

  if (sessionAutosaveTimer) {
    window.clearTimeout(sessionAutosaveTimer)
    sessionAutosaveTimer = null
  }

  if (!silent) message.info('已解除当前会话文件的自动保存绑定')
}

async function runSessionAutosave() {
  const filePath = String(activeSessionFilePath.value || '').trim()
  if (!filePath) return
  if (sessionAutosaveInFlight) return
  const activeRecord = getMemorySessionById(activeMemorySessionId.value)
  if (isMemorySessionChatRunning(activeRecord)) return
  if (isAutoChatSessionPath(filePath) && isMemorySessionRunning(activeRecord)) return

  sessionAutosaveInFlight = true
  try {
    await prepareSessionMediaAssetsForSave(session, { notify: false, sessionFilePath: filePath })
    const payload = buildSessionSavePayload()
    let previousPayload = null
    try {
      const previousSnapshot = await readSessionJsonFile(filePath)
      previousPayload = previousSnapshot.ok ? previousSnapshot.value : null
    } catch {
      previousPayload = null
    }
    const resolvedCreatedAtMs = resolvePersistedSessionCreatedAtMs({
      record: activeRecord,
      payload,
      previousPayload
    })
    const createdAtIso = resolvedCreatedAtMs > 0 ? new Date(resolvedCreatedAtMs).toISOString() : ''
    const previousSavedAt = String(previousPayload?.savedAt || previousPayload?.createdAt || '').trim()
    if (createdAtIso) payload.createdAt = createdAtIso
    if (previousSavedAt) payload.savedAt = previousSavedAt
    const title = getPersistedMemorySessionTitle(activeRecord, filePath)
    if (title) payload.title = title
    payload.updatedAt = new Date().toISOString()
    const json = JSON.stringify(payload, null, 2)
    await writeFile(filePath, json)
    if (activeRecord && resolvedCreatedAtMs > 0) activeRecord.createdAt = resolvedCreatedAtMs
    lastSessionAutosaveAt = Date.now()
  } catch (err) {
    const msg = err?.message || String(err)
    const now = Date.now()
    const shouldNotify = now - lastSessionAutosaveErrorAt > 5000 || msg !== lastSessionAutosaveErrorMsg
    if (shouldNotify) {
      message.error('自动保存失败：' + msg)
      lastSessionAutosaveErrorAt = now
      lastSessionAutosaveErrorMsg = msg
    }

    if (err?.code === 'ENOENT') {
      unbindSessionAutosave({ silent: true })
      message.warning('会话文件已不存在，已解除自动保存绑定')
    }
  } finally {
    sessionAutosaveInFlight = false
  }
}

function scheduleSessionAutosave(options = {}) {
  const filePath = String(activeSessionFilePath.value || '').trim()
  if (!filePath) return

  const force = !!options.force
  const activeRecord = getMemorySessionById(activeMemorySessionId.value)
  if (!force && isMemorySessionChatRunning(activeRecord)) return
  if (!force && isAutoChatSessionPath(filePath) && isMemorySessionRunning(activeRecord)) return
  const debounceMs = 900
  const maxWaitMs = 12000
  const now = Date.now()

  if (force) {
    if (sessionAutosaveTimer) {
      window.clearTimeout(sessionAutosaveTimer)
      sessionAutosaveTimer = null
    }
    void runSessionAutosave()
    return
  }

  if (sessionAutosaveTimer) window.clearTimeout(sessionAutosaveTimer)
  sessionAutosaveTimer = window.setTimeout(() => {
    sessionAutosaveTimer = null
    runSessionAutosave()
  }, debounceMs)

  if (!sessionAutosaveInFlight && now - lastSessionAutosaveAt >= maxWaitMs) {
    window.clearTimeout(sessionAutosaveTimer)
    sessionAutosaveTimer = null
    void runSessionAutosave()
  }
}

function resetChatRuntimeState() {
  typewriterFlushAll()
  clearAllUserEditingState()
  expandedToolActivityGroupIds.value = new Set()
  clearSessionData()
  userAnchorElMap.clear()
  userAnchorMeta.value = []
  activeAnchorId.value = null
  autoScrollEnabled.value = true
  autoScrollSuspendedByUser.value = false
  input.value = ''
  pendingAttachments.value = []
  abortController.value = null
  const record = getActiveMemorySession()
  clearSessionApprovedTools(record?.id)
  chatRunInputQueue.clear(record?.id)
  touchChatRunInputQueue()
  const now = Date.now()
  clearMemoryCandidateFlushTimer(record)
  record.messages = session.messages
  record.apiMessages = session.apiMessages
  record.input = ''
  record.pendingAttachments = []
  record.memoryCandidates = []
  record.memoryCandidateUpdatedAt = 0
  record.contextSummary = createEmptyContextSummaryState()
  record.contextTokenTelemetry = createEmptyContextTokenTelemetry()
  record.activeSessionFilePath = ''
  record.activeSessionTitle = ''
  record.title = DEFAULT_MEMORY_SESSION_TITLE
  record.titleSource = ''
  record.titleRetryCount = 0
  record.titlePostReplyRetryDone = false
  record.titleReadyAt = 0
  record.createdAt = now
  record.runningTaskCount = 0
  record.chatRunCount = 0
  record.activeRequestAbortState = null
  record.pendingApprovalRequests = []
  record.approvalPromptActive = false
  record.autoManaged = false
  record.state = applyDefaultChatState()
  record.updatedAt = now
  syncActiveRequestUiState(record)
}

async function waitForMemorySessionChatIdle(record, options = {}) {
  const target = record || getActiveMemorySession()
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || 1200)
  const startedAt = Date.now()
  while (target && isMemorySessionChatRunning(target)) {
    if ((Date.now() - startedAt) >= timeoutMs) return false
    await nextTick()
    await waitForLayoutFrame()
    await new Promise((resolve) => window.setTimeout(resolve, 24))
  }
  return !target || !isMemorySessionChatRunning(target)
}

async function runExclusiveSessionReset(task) {
  if (sessionResetPromise) return sessionResetPromise
  sessionResetPromise = Promise.resolve()
    .then(() => task())
    .finally(() => {
      sessionResetPromise = null
    })
  return sessionResetPromise
}

async function clearSessionImpl() {
  const record = getActiveMemorySession()
  const chatIdle = await waitForMemorySessionChatIdle(record)
  if (!chatIdle) {
    message.warning('刚结束生成，正在整理最后内容，请稍后再试')
    return
  }

  const hasContent = (session.messages && session.messages.length) || (session.apiMessages && session.apiMessages.length)
  saveActiveMemorySessionDraft()
  if (Number(record?.runningTaskCount || 0) > 0) {
    await detachRunningSessionToHistory({ notify: false })
    message.info('当前会话仍有后台任务，已转入后台并新建会话')
    return
  }

  const boundPath = String(activeSessionFilePath.value || '').trim()
  if (boundPath) {
    await closeActiveSessionImpl({ skipIdleCheck: true })
    return
  }

  if (!hasContent) {
    resetChatSetupUiState()
    message.success('已重置为初始状态')
    return
  }

  flushMemoryCandidatesInBackground(record, {
    force: true,
    systemPrompt: buildCombinedSystemContent('', { sessionRecord: record })
  })
  resetChatSetupUiState()
  resetChatRuntimeState()
  await nextTick()
  scheduleRefreshUserAnchorMeta()
  message.success('已清空当前会话')
}

async function clearSession() {
  return runExclusiveSessionReset(clearSessionImpl)
}

async function openSaveSessionModal() {
  if (!session.messages.length) {
    message.warning('当前会话为空')
    return
  }

  const payload = buildSessionSavePayload()
  const options = {
    defaultName: buildDefaultSessionName(),
    preparePayload: async (filePath) => {
      await prepareSessionMediaAssetsForSave(session, { sessionFilePath: filePath })
      return buildSessionSavePayload()
    }
  }

  if (sessionTreeRef.value?.openSaveSessionModal) {
    await sessionTreeRef.value.openSaveSessionModal(payload, options)
    return
  }

  // 兜底：如果侧边栏内容尚未挂载，先展开再尝试打开保存弹窗
  sessionSiderCollapsed.value = false
  await nextTick()
  if (!sessionTreeRef.value?.openSaveSessionModal) {
    message.warning('会话保存功能尚未就绪')
    return
  }
  await sessionTreeRef.value.openSaveSessionModal(payload, options)
}

function handleSessionSaved(filePath) {
  const rel = String(filePath || '').trim()
  if (!rel) return
  activeSessionFilePath.value = rel
  activeSessionTitle.value = getSessionTitleFromPath(rel)
  const record = getActiveMemorySession()
  record.activeSessionFilePath = rel
  record.activeSessionTitle = activeSessionTitle.value
  record.autoManaged = isAutoChatSessionPath(rel)
  void sessionTreeRef.value?.selectPath?.(rel)
}

function handleSessionPathRenamed(oldPath, newPath) {
  const cur = String(activeSessionFilePath.value || '').trim()
  const from = String(oldPath || '').trim()
  const to = String(newPath || '').trim()
  if (!from || !to) return

  const next = cur ? replacePathPrefix(cur, from, to) : cur
  const activeChanged = !!cur && next !== cur
  if (activeChanged) {
    activeSessionFilePath.value = next
    activeSessionTitle.value = getSessionTitleFromPath(next)
  }

  memorySessions.value.forEach((record) => {
    const recordPath = String(record?.activeSessionFilePath || '').trim()
    const recordNext = replacePathPrefix(recordPath, from, to)
    if (recordPath && recordNext !== recordPath) {
      record.activeSessionFilePath = recordNext
      record.activeSessionTitle = getSessionTitleFromPath(recordNext)
      record.autoManaged = isAutoChatSessionPath(recordNext)
      record.updatedAt = Date.now()
    }
  })
  if (activeChanged) void sessionTreeRef.value?.selectPath?.(next)
}

async function handleSessionPathDeleted(deletedPath, deletedSessionPayloads = []) {
  const cur = String(activeSessionFilePath.value || '').trim()
  const p = String(deletedPath || '').trim()
  if (!p) return

  if (Array.isArray(deletedSessionPayloads) && deletedSessionPayloads.length) {
    const mediaAssetPaths = new Set()
    deletedSessionPayloads.forEach((item) => {
      const payload = item?.payload && typeof item.payload === 'object' ? item.payload : item
      const sessionFilePath = String(item?.path || item?.filePath || '').trim()
      collectChatMediaAssetPathsFromPayload(payload, { sessionFilePath }).forEach((assetPath) => mediaAssetPaths.add(assetPath))
    })
    if (mediaAssetPaths.size) {
      await deleteChatMediaAssetPaths(Array.from(mediaAssetPaths))
    }
    await Promise.all(
      deletedSessionPayloads
        .map((item) => String(item?.path || item?.filePath || '').trim())
        .filter(Boolean)
        .map((filePath) => deleteChatSessionAssetDirectory(filePath))
    )
  }

  memorySessions.value.forEach((record) => {
    const recordPath = String(record?.activeSessionFilePath || '').trim()
    if (!isPathEqualOrInside(recordPath, p)) return
    record.activeSessionFilePath = ''
    record.activeSessionTitle = ''
    record.autoManaged = isMemorySessionRunning(record)
    record.updatedAt = Date.now()
  })

  if (isPathEqualOrInside(cur, p)) {
    unbindSessionAutosave({ silent: true })
    const record = getActiveMemorySession()
    record.activeSessionFilePath = ''
    record.activeSessionTitle = ''
    record.autoManaged = isMemorySessionRunning(record)
    try {
      sessionTreeRef.value?.clearSelection?.()
    } catch {
      // ignore
    }
    message.warning('当前会话文件已被删除，自动保存绑定已解除')
  }
}

async function closeActiveSessionImpl(options = {}) {
  const record = getActiveMemorySession()
  if (!options.skipIdleCheck) {
    const chatIdle = await waitForMemorySessionChatIdle(record)
    if (!chatIdle) {
      message.warning('刚结束生成，正在整理最后内容，请稍后再试')
      return
    }
  }
  if (Number(record?.runningTaskCount || 0) > 0) {
    await detachRunningSessionToHistory({ notify: false })
    message.info('当前会话仍有后台任务，已转入后台并新建会话')
    return
  }

  const boundPath = String(activeSessionFilePath.value || '').trim()
  if (!boundPath) return

  const snapshot = {
    ...record,
    messages: Array.isArray(record.messages) ? [...record.messages] : [],
    apiMessages: Array.isArray(record.apiMessages) ? deepCopyJson(record.apiMessages, []) : [],
    pendingAttachments: Array.isArray(record.pendingAttachments) ? [...record.pendingAttachments] : [],
    memoryCandidates: normalizeMemoryCandidateQueue(record.memoryCandidates),
    contextSummary: deepCopyJson(record.contextSummary || {}, {}),
    state: buildCurrentChatState()
  }

  unbindSessionAutosave({ silent: true })
  try {
    sessionTreeRef.value?.clearSelection?.()
  } catch {
    // ignore
  }

  resetChatRuntimeState()
  await nextTick()
  scheduleRefreshUserAnchorMeta()

  void (async () => {
    await flushMemoryCandidatesForRecord(snapshot, { force: true })
    try {
      await persistMemorySessionToBoundPath(snapshot, { notify: false, state: snapshot.state })
    } catch {
      // ignore
    }
  })()

  message.info('已关闭会话绑定并清空当前会话')
}

async function closeActiveSession(options = {}) {
  return runExclusiveSessionReset(() => closeActiveSessionImpl(options))
}

function isLikelyMarkdownContent(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim()
  if (!text) return false
  if (/^#{1,6}\s+\S/m.test(text)) return true
  if (/^>\s+\S/m.test(text)) return true
  if (/^```[\w-]*\s*$/m.test(text) || /^~~~[\w-]*\s*$/m.test(text)) return true
  if (/(^|\n)\s*(?:[-*+]\s+\S|\d+\.\s+\S)/.test(text)) return true
  if (/!\[[^\]]*]\([^)]+\)|\[[^\]]+\]\([^)]+\)/.test(text)) return true
  if (/`[^`\n]+`/.test(text)) return true
  if (/\*\*[^*]+\*\*|__[^_]+__/.test(text)) return true
  if (/^\|.+\|\s*$/m.test(text) && /^\|?[\s:-]+\|[\s|:-]*$/m.test(text)) return true
  return false
}

function hasHtmlLikeTagLine(content) {
  const text = String(content || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return false
  return text
    .split('\n')
    .some((line) => /^\s*<\/?[A-Za-z][\w:-]*(?:\s+[^<>]*)?\/?>\s*$/.test(String(line || '').trim()))
}

function inferUserDisplayMessageRender(content) {
  return hasHtmlLikeTagLine(content) ? 'text' : 'md'
}

function shouldRenderUserMessageAsPlainText(msg) {
  if (!msg || typeof msg !== 'object') return false
  if (String(msg.render || '').trim().toLowerCase() === 'text') return true
  return inferUserDisplayMessageRender(msg.content) === 'text'
}

const userMessageFoldInfoCache = new WeakMap()

function getUserMessageFoldInfo(msg) {
  if (!msg || typeof msg !== 'object') {
    return { charCount: 0, lineCount: 0, foldable: false, preview: '' }
  }
  const content = String(msg.content || '')
  const cached = userMessageFoldInfoCache.get(msg)
  if (cached?.content === content) return cached.value
  const analysis = analyzeUserMessageFolding(content)
  const value = {
    ...analysis,
    preview: analysis.foldable ? buildUserMessagePreview(content) : content
  }
  userMessageFoldInfoCache.set(msg, { content, value })
  return value
}

function isUserMessageFoldable(msg) {
  return String(msg?.role || '').trim() === 'user' && getUserMessageFoldInfo(msg).foldable
}

function isUserMessageCollapsed(msg) {
  if (msg?.editing) return false
  return isUserMessageFoldable(msg) && msg?.userMessageExpanded !== true
}

function userMessagePreview(msg) {
  return getUserMessageFoldInfo(msg).preview
}

function userMessageFoldSummary(msg) {
  const info = getUserMessageFoldInfo(msg)
  return `${info.charCount.toLocaleString()} 字${info.lineCount > 1 ? ` · ${info.lineCount.toLocaleString()} 行` : ''}`
}

function toggleUserMessageExpanded(msg) {
  if (!isUserMessageFoldable(msg)) return
  msg.userMessageExpanded = msg.userMessageExpanded !== true
  const id = String(msg?.id || '').trim()
  if (id) {
    chatMessageHeightCache.delete(id)
    chatMessageEstimatedHeightCache.delete(id)
    if (msg.userMessageExpanded) rememberHydratedHeavyChatMessage(id)
  }
  bumpChatMessageMetricsVersion()
}

function shouldKeepLoadedAssistantTextRender(raw, content) {
  const text = String(content || '').trim()
  if (!text) return false
  if (raw?.transientRequestPlaceholder === true) return true
  if (raw?.imageTask || raw?.videoTask) return true
  if (raw?.imageBubblePlaceholder || raw?.videoBubblePlaceholder) return true
  if (/^(图片|视频)生成(?:生成中|处理中|排队中|等待中|进行中|失败|已取消|已受理|已完成)/.test(text)) return true
  if (!isLikelyMarkdownContent(text) && text.includes('\n') && (/\t/.test(text) || / {2,}/.test(text))) return true
  return false
}

function inferLoadedDisplayMessageRender(raw, content) {
  const role = String(raw?.role || '').trim()
  if (role === 'assistant' || role === 'thinking') {
    return shouldKeepLoadedAssistantTextRender(raw, content) ? 'text' : 'md'
  }
  if (role === 'user') return inferUserDisplayMessageRender(content)
  return 'md'
}

function normalizeLoadedDisplayMessage(msg) {
  const raw = msg && typeof msg === 'object' ? { ...msg } : {}
  raw.id = String(raw.id || '').trim() || newId()
  raw.role = String(raw.role || 'assistant').trim() || 'assistant'
  raw.time = typeof raw.time === 'number' ? raw.time : Date.now()
  if (typeof raw.content !== 'string') raw.content = stableStringify(raw.content)
  const content = String(raw.content || '')

  if (typeof raw.render !== 'string' || !raw.render.trim()) {
    raw.render = inferLoadedDisplayMessageRender(raw, content)
  } else {
    const normalizedRender = raw.render.trim().toLowerCase()
    raw.render = normalizedRender === 'text' || normalizedRender === 'md'
      ? normalizedRender
      : inferLoadedDisplayMessageRender(raw, content)
    if (
      (raw.role === 'assistant' || raw.role === 'thinking') &&
      raw.render === 'text' &&
      !shouldKeepLoadedAssistantTextRender(raw, content) &&
      isLikelyMarkdownContent(content)
    ) {
      raw.render = 'md'
    }
  }

  if (raw.role === 'user' && inferUserDisplayMessageRender(content) === 'text') {
    raw.render = 'text'
  }

  if (raw.role === 'assistant') {
    raw.streaming = false
    raw.thinkingExpanded = false
    if (raw.thinking != null && typeof raw.thinking !== 'string') raw.thinking = stableStringify(raw.thinking)
  }

  if (raw.role === 'user') {
    raw.editing = false
    raw.editDraft = ''
    raw.userMessageExpanded = false
  }

  if (raw.role === 'tool' || raw.role === 'tool_call') {
    if (typeof raw.toolExpanded !== 'boolean') raw.toolExpanded = false
    if (!Array.isArray(raw.agentRunExpandedStepIds)) raw.agentRunExpandedStepIds = []
    if (typeof raw.toolMeta !== 'string') raw.toolMeta = String(raw.toolMeta || '')
    if (typeof raw.toolStatus !== 'string' || !raw.toolStatus.trim()) raw.toolStatus = raw.role === 'tool_call' ? 'running' : 'success'
    if (typeof raw.toolName !== 'string') raw.toolName = String(raw.toolName || '')
    if (typeof raw.toolServerName !== 'string') raw.toolServerName = String(raw.toolServerName || '')
    if (typeof raw.toolTitle !== 'string') raw.toolTitle = String(raw.toolTitle || '')
    if (typeof raw.toolDescription !== 'string') raw.toolDescription = String(raw.toolDescription || '')
    if (typeof raw.toolArgsText !== 'string') raw.toolArgsText = String(raw.toolArgsText || '')
    if (typeof raw.toolAutoApproved !== 'boolean') raw.toolAutoApproved = false
    if (typeof raw.toolSubMeta !== 'string') raw.toolSubMeta = String(raw.toolSubMeta || '')
    if (typeof raw.toolExecutionId !== 'string') raw.toolExecutionId = String(raw.toolExecutionId || '')
    if (typeof raw.toolSessionId !== 'string') raw.toolSessionId = String(raw.toolSessionId || '')
    if (typeof raw.toolTraceStreamId !== 'string') raw.toolTraceStreamId = String(raw.toolTraceStreamId || '')
    if (!Array.isArray(raw.toolLiveTrace)) raw.toolLiveTrace = []
    raw.toolAbortState = null
    if (typeof raw.toolAgentName !== 'string') raw.toolAgentName = String(raw.toolAgentName || '')
    if (typeof raw.toolLiveFinalContent !== 'string') raw.toolLiveFinalContent = String(raw.toolLiveFinalContent || '')
    if (typeof raw.toolLiveFinalReasoning !== 'string') raw.toolLiveFinalReasoning = String(raw.toolLiveFinalReasoning || '')
    raw.toolLiveRound = Number.isFinite(Number(raw.toolLiveRound)) ? Number(raw.toolLiveRound) : 0
    if (!raw.toolResultPayload || typeof raw.toolResultPayload !== 'object' || Array.isArray(raw.toolResultPayload)) raw.toolResultPayload = null
    if (raw.role === 'tool') {
      raw.images = reconcilePersistedSandboxToolImages(raw.images, raw.toolResultPayload)
    }

    if (!raw.toolServerName) raw.toolServerName = extractServerNameFromToolMeta(raw.toolMeta)
    if (!raw.toolName) raw.toolName = extractToolNameFromToolMeta(raw.toolMeta)
    if (raw.role === 'tool_call' && !raw.toolArgsText) raw.toolArgsText = extractFirstJsonFenceText(raw.content) || '{}'
  }

  return raw
}

function backfillLoadedToolAutoApproved(messages = [], fallbackAutoApprove = false) {
  const list = Array.isArray(messages) ? messages : []
  const fallback = fallbackAutoApprove === true
  for (const msg of list) {
    if (!msg || (msg.role !== 'tool' && msg.role !== 'tool_call')) continue
    if (typeof msg.toolAutoApproved === 'boolean') continue
    const toolApprovalMode = String(msg.toolApprovalMode || '').trim()
    if (toolApprovalMode === 'auto') {
      msg.toolAutoApproved = true
      continue
    }
    if (toolApprovalMode === 'manual') {
      msg.toolAutoApproved = false
      continue
    }
    if (msg.role === 'tool_call') msg.toolAutoApproved = fallback
  }
  return list
}

function normalizeLoadedDisplayMessages(messages) {
  const list = Array.isArray(messages) ? messages.map((msg, index) => ({ index, msg: normalizeLoadedDisplayMessage(msg) })) : []
  list.sort((a, b) => {
    const at = Number(a?.msg?.time)
    const bt = Number(b?.msg?.time)
    const aTime = Number.isFinite(at) ? at : 0
    const bTime = Number.isFinite(bt) ? bt : 0
    if (aTime !== bTime) return aTime - bTime
    return a.index - b.index
  })

  let cursor = 0
  const normalized = list.map(({ msg }) => {
    const rawTime = Number(msg?.time)
    cursor = Number.isFinite(rawTime) && rawTime > cursor ? rawTime : cursor + 1
    msg.time = cursor
    lastDisplayMessageTime = cursor
    return msg
  })

  return coalesceToolExecutionDisplayMessages(normalized)
}

function applyLoadedChatState(state) {
  if (!state || typeof state !== 'object') return
  const hydratedState = buildHydratedChatState(state)
  routerActivatedAgentSkillIds.clear()
  routerAddedSelectedSkillIds.clear()
  routerAddedAgentSkillIds.clear()

  sessionContextWindowOverride.value =
    hydratedState.contextWindow && typeof hydratedState.contextWindow === 'object'
      ? deepCopyJson(normalizeChatContextWindowConfig(hydratedState.contextWindow), null)
      : null

  const hydratedAgentId = String(hydratedState.selectedAgentId || '').trim()
  const hydratedAgent = hydratedAgentId
    ? (agents.value || []).find((agent) => agent?._id === hydratedAgentId)
    : null
  const builtinAgent = (agents.value || []).find((agent) => agent?.builtin === true)
  selectedAgentId.value = hydratedAgent?._id || builtinAgent?._id || null
  selectedProviderId.value = hydratedState.selectedProviderId || null
  selectedModel.value = String(hydratedState.selectedModel || '').trim()

  const promptModeCandidate = String(hydratedState.basePromptMode || '').trim()
  if (promptModeCandidate === 'prompt') {
    const prompt = findLocalPromptById(hydratedState.selectedPromptId || null)
    if (prompt && isSystemPrompt(prompt)) {
      const nextState = buildBasePromptSelectionState(prompt._id, getDefaultSystemPromptText())
      basePromptMode.value = nextState.basePromptMode
      selectedPromptId.value = nextState.selectedPromptId
      customSystemPrompt.value = nextState.customSystemPrompt
      customSystemPromptExplicit.value = false
    } else {
      applyBasePromptSelection(null)
    }
  } else {
    const nextState = buildCustomSystemPromptState(
      String(hydratedState.customSystemPrompt || ''),
      hydratedState.customSystemPromptExplicit === true
    )
    basePromptMode.value = nextState.basePromptMode
    selectedPromptId.value = nextState.selectedPromptId
    customSystemPrompt.value = nextState.customSystemPrompt
    customSystemPromptExplicit.value = nextState.customSystemPromptExplicit
  }

  const isHydratingDefaultAgent =
    !!builtinAgent?._id &&
    String(selectedAgentId.value || '').trim() === String(builtinAgent._id || '').trim()
  const hydratedSkillState = isHydratingDefaultAgent
    ? migrateLegacyDefaultAgentSkillState({
        selectedSkillIds: hydratedState.selectedSkillIds,
        agentSkillIds: hydratedState.agentSkillIds,
        activatedSkillIds: hydratedState.activatedAgentSkillIds
      }, LEGACY_DEFAULT_AGENT_SKILL_IDS)
    : {
        selectedSkillIds: normalizeStringList(hydratedState.selectedSkillIds),
        agentSkillIds: normalizeStringList(hydratedState.agentSkillIds),
        activatedSkillIds: normalizeStringList(hydratedState.activatedAgentSkillIds)
      }
  selectedSkillIds.value = hydratedSkillState.selectedSkillIds
  agentSkillIds.value = hydratedSkillState.agentSkillIds
  activatedAgentSkillIds.value = hydratedSkillState.activatedSkillIds
  if (Array.isArray(hydratedState.manualMcpIds)) manualMcpIds.value = normalizeStringList(hydratedState.manualMcpIds)
  if (!hydratedAgent) applyDefaultGeneralAgent()
  sandboxHostWorkspacePath.value = normalizeSelectedHostWorkspacePath(
    hydratedState.sandboxHostWorkspacePath
  )

  if (typeof hydratedState.webSearchEnabled === 'boolean') webSearchEnabled.value = hydratedState.webSearchEnabled
  toolApprovalMode.value = normalizeToolApprovalMode(
    hydratedState.toolApprovalMode,
    hydratedState.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : TOOL_APPROVAL_MODE_SAFE
  )
  if (typeof hydratedState.autoActivateAgentSkills === 'boolean') autoActivateAgentSkills.value = hydratedState.autoActivateAgentSkills

  const toolModeCandidate = String(hydratedState.toolMode || '').trim()
  if (toolModeCandidate === 'auto' || toolModeCandidate === 'expanded' || toolModeCandidate === 'compact') {
    toolMode.value = toolModeCandidate
  }

  const effectiveModeCandidate = String(hydratedState.effectiveToolMode || '').trim()
  if (effectiveModeCandidate === 'expanded' || effectiveModeCandidate === 'compact') {
    effectiveToolMode.value = effectiveModeCandidate
  }

  const effort = String(hydratedState.thinkingEffort || '').trim()
  if (['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    thinkingEffort.value = effort
  }

  imageGenerationMode.value = normalizeImageGenerationMode(hydratedState.imageGenerationMode)
  videoGenerationMode.value = normalizeImageGenerationMode(hydratedState.videoGenerationMode)
  setImageGenerationParamsEnabled(hydratedState.imageGenerationParamsEnabled === true)
  assignImageGenerationParams(hydratedState.imageGenerationParams || createDefaultImageGenerationParams())
  setVideoGenerationParamsEnabled(hydratedState.videoGenerationParamsEnabled === true)
  assignVideoGenerationParams(hydratedState.videoGenerationParams || createDefaultVideoGenerationParams())
  const activeRecord = getActiveMemorySession()
  if (activeRecord) {
    activeRecord.contextSummary = hydratedState.contextSummary && typeof hydratedState.contextSummary === 'object'
      ? deepCopyJson(hydratedState.contextSummary, {})
      : createEmptyContextSummaryState()
    activeRecord.contextTokenTelemetry = normalizeContextTokenTelemetry(hydratedState.contextTokenTelemetry)
  }
}

let historySessionLoadHideTimer = null
let historySessionLoadInFlight = false
let pendingHistorySessionLoadPath = ''

function beginHistorySessionLoad(filePath) {
  if (historySessionLoadHideTimer) {
    window.clearTimeout(historySessionLoadHideTimer)
    historySessionLoadHideTimer = null
  }
  const token = Number(historySessionLoadState.token || 0) + 1
  Object.assign(historySessionLoadState, {
    visible: true,
    blocking: true,
    path: String(filePath || '').trim(),
    phase: '正在准备历史会话',
    detail: '当前页面会保持可见，完成后自动切换',
    percent: 8,
    token
  })
  historySessionLoadInFlight = true
  return token
}

function updateHistorySessionLoad(token, patch = {}) {
  if (!token || Number(historySessionLoadState.token) !== Number(token)) return false
  Object.assign(historySessionLoadState, patch)
  return true
}

function scheduleHistorySessionLoadHide(token, delayMs = 680) {
  if (!token || Number(historySessionLoadState.token) !== Number(token)) return
  if (historySessionLoadHideTimer) window.clearTimeout(historySessionLoadHideTimer)
  historySessionLoadHideTimer = window.setTimeout(() => {
    historySessionLoadHideTimer = null
    if (Number(historySessionLoadState.token) !== Number(token)) return
    historySessionLoadState.visible = false
    historySessionLoadState.blocking = false
  }, Math.max(0, Number(delayMs) || 0))
}

function finishHistorySessionLoad(token, options = {}) {
  const updated = updateHistorySessionLoad(token, {
    visible: true,
    blocking: false,
    phase: String(options.phase || '历史会话已显示'),
    detail: String(options.detail || ''),
    percent: 100
  })
  if (!updated) return
  historySessionLoadInFlight = false
  scheduleHistorySessionLoadHide(token, options.delayMs)
}

function failHistorySessionLoad(token, err) {
  const updated = updateHistorySessionLoad(token, {
    visible: true,
    blocking: false,
    phase: '历史会话加载失败',
    detail: String(err?.message || err || '请稍后重试'),
    percent: 100
  })
  if (!updated) return
  historySessionLoadInFlight = false
  scheduleHistorySessionLoadHide(token, 1800)
}

async function yieldHistorySessionLoadFrame() {
  await nextTick()
  await waitForLayoutFrame()
}

function hydrateLoadedSessionMediaInBackground({ token, record, messages, sessionFilePath }) {
  const mediaCount = countSessionMediaItems(messages)
  if (!mediaCount) {
    finishHistorySessionLoad(token)
    return
  }

  updateHistorySessionLoad(token, {
    visible: true,
    blocking: false,
    phase: '历史会话已显示',
    detail: `正在后台恢复 ${mediaCount} 个媒体预览`,
    percent: 92
  })
  historySessionLoadInFlight = false

  void hydrateChatSessionMediaAssets(
    { messages },
    {
      sessionFilePath,
      concurrency: 4,
      onProgress(processed, total) {
        if (processed !== total && processed % 4 !== 0) return
        updateHistorySessionLoad(token, {
          detail: `正在后台恢复媒体预览 ${processed}/${total}`,
          percent: Math.min(99, 92 + Math.round((processed / Math.max(1, total)) * 7))
        })
      }
    }
  ).then(() => {
    record.messages = [...messages]
    if (String(activeMemorySessionId.value || '') === String(record.id || '')) {
      session.messages = record.messages
    }
    finishHistorySessionLoad(token, {
      phase: '历史会话已就绪',
      detail: `${mediaCount} 个媒体预览已恢复`
    })
  }).catch((err) => {
    console.warn('[chat session] background media hydration failed:', err)
    finishHistorySessionLoad(token, {
      phase: '历史会话已显示',
      detail: '部分媒体预览恢复失败'
    })
  })
}

async function loadSessionFromFile(filePath, options = {}) {
  const relPath = String(filePath || '').trim()
  if (!relPath) return false
  const loadToken = Number(options.loadToken || 0)

  let activeRecord = getActiveMemorySession()
  let detachedRunningRecord = null
  const runningTargetRecord = memorySessions.value.find((item) =>
    String(item?.activeSessionFilePath || '').trim() === relPath && isMemorySessionRunning(item)
  )

  if (runningTargetRecord) {
    updateHistorySessionLoad(loadToken, {
      phase: '正在恢复后台会话',
      detail: '生成任务仍在运行',
      percent: 42
    })
    const switchingRecord = String(activeRecord?.id || '') !== String(runningTargetRecord.id || '')
    if (switchingRecord) {
      if (isMemorySessionRunning(activeRecord)) {
        await detachRunningSessionToHistory({ notify: false, restoreTarget: false })
        message.info('当前生成已转入后台，完成后会自动保存')
      } else {
        await persistActiveMemorySessionBeforeLeaving({ targetPath: relPath })
      }
    }

    await withChatSessionOpeningHeavyRender(async () => {
      void maybeWarmMarkdownPreviewRuntimeForMessages(runningTargetRecord.messages).catch(() => {})
      restoreMemorySession(runningTargetRecord, { skipSaveCurrent: true, skipScroll: true })
      await nextTick()
      await sessionTreeRef.value?.selectPath?.(relPath)
      activeSessionFilePath.value = relPath
      activeSessionTitle.value =
        String(runningTargetRecord.activeSessionTitle || runningTargetRecord.title || '').trim() ||
        getSessionTitleFromPath(relPath)
      syncActiveRequestUiState(runningTargetRecord)
      pruneDormantMemorySessions({ keepId: runningTargetRecord.id })
      scheduleRefreshUserAnchorMeta()
      await scrollToBottom({ force: true })
      await settleChatViewportAfterSessionOpen({
        reconnectObserver: true,
        buffer: resolveCurrentHeavyRenderViewportBuffer(CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA)
      })
    })
    message.success('正在运行的会话已加载')
    finishHistorySessionLoad(loadToken, {
      phase: '后台会话已显示',
      detail: '生成任务继续在后台运行'
    })
    return true
  }

  activeRecord = getActiveMemorySession()
  if (
    String(activeRecord?.activeSessionFilePath || '').trim() === relPath &&
    String(activeRecord?.id || '') === String(activeMemorySessionId.value || '') &&
    !isMemorySessionRunning(activeRecord)
  ) {
    await sessionTreeRef.value?.selectPath?.(relPath)
    syncActiveRequestUiState(activeRecord)
    finishHistorySessionLoad(loadToken, {
      phase: '历史会话已显示',
      detail: '当前已是所选会话'
    })
    return true
  }

  updateHistorySessionLoad(loadToken, {
    phase: '正在保存当前会话',
    detail: '避免切换时丢失最新内容',
    percent: 18
  })
  if (isMemorySessionRunning(activeRecord)) {
    detachedRunningRecord = activeRecord
    await detachRunningSessionToHistory({ notify: false, restoreTarget: false })
    message.info('当前生成已转入后台，完成后会自动保存')
  } else {
    await persistActiveMemorySessionBeforeLeaving({ targetPath: relPath })
  }

  try {
    updateHistorySessionLoad(loadToken, {
      phase: '正在读取历史会话',
      detail: getSessionTitleFromPath(relPath),
      percent: 34
    })
    await yieldHistorySessionLoadFrame()
    const parsed = await readSessionJsonFile(relPath, { repairIfRecovered: true })
    if (!parsed.ok) {
      throw new Error('解析会话文件失败：' + (parsed.error?.message || '未知错误'))
    }

    const data = parsed.value
    const rawMessageCount = Array.isArray(data?.session?.messages)
      ? data.session.messages.length
      : Array.isArray(data?.messages)
        ? data.messages.length
        : 0
    updateHistorySessionLoad(loadToken, {
      phase: '正在整理会话内容',
      detail: `${rawMessageCount} 条消息`,
      percent: 56
    })
    await yieldHistorySessionLoadFrame()
    const persistedState = data?.state && typeof data.state === 'object' ? data.state : null
    const state = persistedState ? buildHydratedChatState(persistedState) : buildDefaultChatState()
    const sessionCreatedAtMs =
      parseIsoTimeMs(data?.createdAt) ||
      parseIsoTimeMs(data?.source?.createdAt) ||
      parseIsoTimeMs(data?.session?.createdAt) ||
      parseIsoTimeMs(data?.savedAt) ||
      Date.now()
    const titleReadyAtMs =
      parseIsoTimeMs(data?.source?.titleReadyAt) ||
      sessionCreatedAtMs
    const titleSource =
      String(data?.source?.titleSource || data?.titleSource || '').trim() ||
      (titleReadyAtMs > 0 ? 'generated' : '')
    const titleRetryCount =
      Number(data?.source?.titleRetryCount || data?.titleRetryCount || 0) || 0

    const displayMessages = Array.isArray(data?.session?.messages)
      ? data.session.messages
      : Array.isArray(data?.messages)
        ? data.messages
        : []

    const apiMessages = Array.isArray(data?.session?.apiMessages)
      ? data.session.apiMessages
      : Array.isArray(data?.apiMessages)
        ? data.apiMessages
        : []
    const memoryCandidates = normalizeMemoryCandidateQueue(data?.memory?.candidates)
    const memoryCandidateUpdatedAt = Number(data?.memory?.candidateUpdatedAt || 0) || 0
    const contextSummary =
      data?.memory?.contextSummary && typeof data.memory.contextSummary === 'object'
        ? deepCopyJson(data.memory.contextSummary, {})
        : state?.contextSummary && typeof state.contextSummary === 'object'
          ? deepCopyJson(state.contextSummary, {})
          : null
    const contextTokenTelemetry = normalizeContextTokenTelemetry(
      data?.memory?.contextTokenTelemetry || state?.contextTokenTelemetry
    )

    unbindSessionAutosave({ silent: true })

    const apiSafe = Array.isArray(apiMessages)
      ? apiMessages.filter((m) => m && typeof m === 'object' && typeof m.role === 'string')
      : []

    const fallbackAutoApprove =
      normalizeToolApprovalMode(
        state?.toolApprovalMode,
        state?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
      ) !== TOOL_APPROVAL_MODE_MANUAL
    const displaySafe = normalizeLoadedDisplayMessages(
      backfillLoadedToolAutoApproved(displayMessages, fallbackAutoApprove)
    )

    // 兼容：早期定时任务会话默认按 text 保存，加载到聊天页后需要切回 md 渲染
    const isTimedTaskSession =
      String(data?.source?.type || '').trim() === 'timed_task' || isTimedTaskSessionPath(relPath)
    if (isTimedTaskSession) {
      displaySafe.forEach((m) => {
        if (m?.role === 'assistant' && m.render === 'text') m.render = 'md'
      })
    }

    // 富文本运行时和媒体 Blob 不再阻塞首屏；先显示纯文本占位和可视区，
    // 再在后台渐进升级，避免大历史会话长时间白屏后集中重排。
    void maybeWarmMarkdownPreviewRuntimeForMessages(displaySafe).catch(() => {})

    const loadedTitle =
      typeof data?.title === 'string' && data.title.trim() ? data.title.trim() : getSessionTitleFromPath(relPath)
    let record = memorySessions.value.find((item) => String(item?.activeSessionFilePath || '').trim() === relPath)
    if (!record) {
      record = createMemorySessionRecord({
        title: loadedTitle,
        createdAt: sessionCreatedAtMs,
        titleReadyAt: titleReadyAtMs,
        messages: displaySafe,
        apiMessages: deepCopyJson(apiSafe, []),
        memoryCandidates,
        memoryCandidateUpdatedAt,
        contextSummary,
        contextTokenTelemetry,
        toolApprovalMode: state?.toolApprovalMode,
        autoApproveTools: state?.autoApproveTools,
        activeSessionFilePath: relPath,
        activeSessionTitle: loadedTitle,
        titleSource,
        titleRetryCount,
        titlePostReplyRetryDone: false,
        state,
        autoManaged: isAutoChatSessionPath(relPath)
      })
      memorySessions.value = [...memorySessions.value, record]
    } else {
      record.title = loadedTitle
      if (sessionCreatedAtMs > 0) {
        const existingCreatedAtMs = Number(record.createdAt || 0)
        record.createdAt = existingCreatedAtMs > 0 ? Math.min(existingCreatedAtMs, sessionCreatedAtMs) : sessionCreatedAtMs
      }
      record.titleReadyAt = Number(record.titleReadyAt || 0) || titleReadyAtMs
      record.messages = displaySafe
      record.apiMessages = deepCopyJson(apiSafe, [])
      record.input = ''
      record.pendingAttachments = []
      record.memoryCandidates = memoryCandidates
      record.memoryCandidateUpdatedAt = memoryCandidateUpdatedAt
      record.contextSummary = contextSummary || createEmptyContextSummaryState()
      record.contextTokenTelemetry = contextTokenTelemetry
      record.activeSessionFilePath = relPath
      record.activeSessionTitle = loadedTitle
      record.titleSource = titleSource
      record.titleRetryCount = titleRetryCount
      record.titlePostReplyRetryDone = false
      record.state = deepCopyJson(state, {})
      record.autoManaged = isAutoChatSessionPath(relPath)
      record.updatedAt = Date.now()
    }

    activeMemorySessionId.value = record.id
    primeHydratedHeavyChatMessages(displaySafe, { replace: true })
    session.messages = record.messages
    session.apiMessages = record.apiMessages
    input.value = ''
    pendingAttachments.value = []
    applyLoadedChatState(state)
    if (record.memoryCandidates?.length) {
      scheduleMemoryCandidateFlush(record, { delayMs: 3000 })
    } else {
      clearMemoryCandidateFlushTimer(record)
    }

    updateHistorySessionLoad(loadToken, {
      phase: '正在渲染最近消息',
      detail: '较早内容会在滚动到附近时再挂载',
      percent: 78
    })
    await withChatSessionOpeningHeavyRender(async () => {
      await nextTick()
      await sessionTreeRef.value?.selectPath?.(relPath)
      scheduleRefreshUserAnchorMeta()
      await scrollToBottom({ force: true })
      await settleChatViewportAfterSessionOpen({
        reconnectObserver: true,
        buffer: resolveCurrentHeavyRenderViewportBuffer(CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA)
      })
    })

    activeSessionFilePath.value = relPath
    activeSessionTitle.value = loadedTitle
    syncActiveRequestUiState(record)
    pruneDormantMemorySessions({ keepId: record.id })

    message.success('历史会话已加载')
    const resumableCount = countResumableMediaTasks()
    if (resumableCount) {
      message.info(`检测到 ${resumableCount} 个可继续轮询的视频任务，可在任务卡片中恢复。`)
    }
    hydrateLoadedSessionMediaInBackground({
      token: loadToken,
      record,
      messages: displaySafe,
      sessionFilePath: relPath
    })
    return true
  } catch (err) {
    if (detachedRunningRecord && isMemorySessionRunning(detachedRunningRecord)) {
      restoreMemorySession(detachedRunningRecord, { skipSaveCurrent: true })
    }
    message.error('加载会话失败：' + (err?.message || String(err)))
    failHistorySessionLoad(loadToken, err)
    return false
  }
}

async function handleSessionHistorySelect(filePath) {
  const requestedPath = String(filePath || '').trim()
  if (!requestedPath) return
  if (historySessionLoadInFlight) {
    pendingHistorySessionLoadPath = requestedPath
    updateHistorySessionLoad(historySessionLoadState.token, {
      detail: `当前完成后将切换到：${getSessionTitleFromPath(requestedPath)}`
    })
    return
  }

  let targetPath = requestedPath
  while (targetPath) {
    pendingHistorySessionLoadPath = ''
    const loadToken = beginHistorySessionLoad(targetPath)
    try {
      const loaded = await loadSessionFromFile(targetPath, { loadToken })
      if (loaded && isCompactChatLayout.value) sessionSiderCollapsed.value = true
      if (!loaded && historySessionLoadState.blocking) {
        failHistorySessionLoad(loadToken, '会话未能加载')
      }
    } catch (err) {
      message.error('加载会话失败：' + (err?.message || String(err)))
      failHistorySessionLoad(loadToken, err)
    }
    targetPath = pendingHistorySessionLoadPath
  }
}

watch(
  () => session.messages.length,
  () => scheduleSessionAutosave(),
  { flush: 'post' }
)

watch(
  () => session.apiMessages.length,
  () => scheduleSessionAutosave(),
  { flush: 'post' }
)

watch(
  sending,
  (next, prev) => {
    if (prev && !next) scheduleSessionAutosave({ force: true })
  },
  { flush: 'post' }
)

watch(
  [
    selectedAgentId,
    selectedProviderId,
    selectedModel,
    basePromptMode,
    selectedPromptId,
    customSystemPrompt,
    customSystemPromptExplicit,
    selectedSkillIds,
    manualMcpIds,
    toolMode,
    thinkingEffort,
    imageGenerationMode,
    videoGenerationMode,
    mediaGenerationParamsAutosaveKey
  ],
  () => scheduleSessionAutosave(),
  { flush: 'post' }
)

function applyAgent(agentId) {
  routerActivatedAgentSkillIds.clear()
  routerAddedSelectedSkillIds.clear()
  routerAddedAgentSkillIds.clear()
  selectedAgentId.value = agentId
  const agent = (agents.value || []).find((a) => a._id === agentId)
  if (!agent) return

  const providerOverride = String(agent.provider || '').trim()
  const modelOverride = String(agent.model || '').trim()
  const reasoningEffortOverride = getAgentReasoningEffortOverride(agent.modelParams)

  if (providerOverride) {
    selectedProviderId.value = providerOverride
    const provider = (providers.value || []).find((p) => p._id === providerOverride)
    const firstModel = Array.isArray(provider?.selectModels) ? provider.selectModels[0] : ''
    selectedModel.value = (modelOverride || firstModel || '').trim()
  } else {
    if (modelOverride) selectedModel.value = modelOverride
    if (!selectedProviderId.value && !selectedModel.value) {
      tryApplyDefaultModelFromConfig({ force: true })
    }
  }

  applyBasePromptSelection(agent.prompt || null)

  const nextAgentSkills = Array.isArray(agent.skills) ? [...agent.skills] : []
  agentSkillIds.value = nextAgentSkills
  activatedAgentSkillIds.value = []
  selectedSkillIds.value = nextAgentSkills
  manualMcpIds.value = Array.isArray(agent.mcp) ? [...agent.mcp] : []
  if (reasoningEffortOverride) thinkingEffort.value = reasoningEffortOverride
}

function applyDefaultGeneralAgent() {
  const builtinAgent = (agents.value || []).find((agent) => agent?.builtin === true)
  if (!builtinAgent?._id) {
    selectedAgentId.value = null
    agentSkillIds.value = []
    activatedAgentSkillIds.value = []
    return false
  }

  const builtinSkillIds = normalizeStringList(builtinAgent.skills)
  selectedAgentId.value = builtinAgent._id
  agentSkillIds.value = builtinSkillIds
  activatedAgentSkillIds.value = []
  selectedSkillIds.value = normalizeStringList([
    ...(selectedSkillIds.value || []),
    ...builtinSkillIds
  ])
  return true
}

function resolveDefaultModelSelectionFromConfig() {
  const cfg = chatConfig.value
  const configuredProviderId = String(cfg?.defaultProviderId || '').trim()
  const modelId = String(cfg?.defaultModel || '').trim()

  // 没有配置默认模型时，不标记已应用，等待后续配置变更时再尝试
  // 当未配置默认 Provider / Model 时，后续会回退到内置 Provider 或首个可用 Provider
  // 仅配置了模型但没配置服务商时，无法自动应用
  // 继续在下方按 Provider 列表做兜底选择

  const list = Array.isArray(providers.value) ? providers.value : []
  const provider =
    (configuredProviderId ? list.find((p) => p?._id === configuredProviderId) : null) ||
    list.find((p) => isUtoolsBuiltinProvider(p)) ||
    list[0]
  if (!provider) return { providerId: '', model: '' }

  const models = Array.isArray(provider?.selectModels) ? provider.selectModels : []
  if (!models.length) return { providerId: '', model: '' }

  const finalModel = modelId && models.includes(modelId) ? modelId : models[0]
  return {
    providerId: String(provider._id || '').trim(),
    model: String(finalModel || '').trim()
  }
}

function tryApplyDefaultModelFromConfig(options = {}) {
  const force = !!options.force
  if (!force && hasAppliedDefaultModel.value) return false

  if (!force && (selectedAgentId.value || selectedProviderId.value || selectedModel.value)) {
    hasAppliedDefaultModel.value = true
    return false
  }

  const next = resolveDefaultModelSelectionFromConfig()
  if (!next.providerId || !next.model) return false

  selectedProviderId.value = next.providerId
  selectedModel.value = next.model
  hasAppliedDefaultModel.value = true
  return true
}

// 默认不自动选择智能体；由用户手动选择
watch([providers, chatConfig], () => tryApplyDefaultModelFromConfig(), { immediate: true })

watch(
  selectedProvider,
  (provider) => {
    if (!provider) return
    const models = provider.selectModels || []
    if (!Array.isArray(models) || models.length === 0) return
    if (!selectedModel.value) selectedModel.value = models[0]
    if (selectedModel.value && !models.includes(selectedModel.value)) selectedModel.value = models[0]
  },
  { immediate: true }
)

function stop() {
  abortController.value?.abort()
  typewriterFlushAll()
}

onBeforeUnmount(() => {
  if (historySessionLoadHideTimer) {
    window.clearTimeout(historySessionLoadHideTimer)
    historySessionLoadHideTimer = null
  }
  historySessionLoadInFlight = false
  pendingHistorySessionLoadPath = ''
  chatMessageEstimatedHeightCache.clear()
  cancelPendingToolApprovals()
  sessionApprovedToolKeys.clear()
  chatRunInputQueue.clearAll()
  touchChatRunInputQueue()
  queuedInputDrainTimers.forEach((timer) => window.clearTimeout(timer))
  queuedInputDrainTimers.clear()
  queuedInputDrainInFlight.clear()
  try {
    if (pendingBuiltinAgentsEventsFlushTimer) {
      window.clearTimeout(pendingBuiltinAgentsEventsFlushTimer)
      pendingBuiltinAgentsEventsFlushTimer = null
    }
  } catch {
    // ignore
  }
  pendingBuiltinAgentsEventsByStreamId.clear()
  try {
    window?.removeEventListener?.(BUILTIN_AGENTS_TRACE_EVENT, handleBuiltinAgentsTraceEvent)
  } catch {
    // ignore
  }
  try {
    window?.removeEventListener?.(BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT, handleBuiltinAgentsToolApprovalRequest)
  } catch {
    // ignore
  }
  try {
    window?.removeEventListener?.('resize', syncChatResponsiveState)
  } catch {
    // ignore
  }
  try {
    if (autoChatCleanupTimer) {
      window.clearInterval(autoChatCleanupTimer)
      autoChatCleanupTimer = null
    }
  } catch {
    // ignore
  }
  disconnectChatLayoutResizeObserver()
  disconnectChatMessageVisibilityObserver()
  disconnectChatMessageResizeObserver()
  clearStickyChatBubbleSync()
  setStickyChatBubbleState(null)
  cleanupChatPreviewLinkHandlers()
  try {
    abortController.value?.abort()
  } catch {
    // ignore
  }
  detachedMediaAbortStates.forEach((state) => {
    try {
      state?.abort?.()
    } catch {
      // ignore
    }
  })
  detachedMediaAbortStates.clear()
  try {
    typewriterFlushAll()
  } catch {
    // ignore
  }
  try {
    closeAllPooledMCPClients()
  } catch {
    // ignore
  }
  try {
    resetAttachmentTextParserWorker()
  } catch {
    // ignore
  }
})

function handleUserEditKeydown(e, msg) {
  if (!msg || !msg.editing) return
  if (sending.value) return
  if (isComposerCompositionKeydownEvent(e)) return

  if (e.key === 'Escape') {
    e.preventDefault()
    msg.editing = false
    msg.editDraft = ''
    return
  }

  if (shouldSubmitComposerKeydownEvent(e)) {
    e.preventDefault()
    toggleOrSubmitUserEdit(msg)
  }
}

function clearAllUserEditingState() {
  ;(session.messages || []).forEach((m) => {
    if (m?.role !== 'user') return
    if (m.editing) {
      m.editing = false
      m.editDraft = ''
    }
  })
  scheduleRefreshUserAnchorMeta()
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function resolveUserApiIndexForDisplayMessage(msg) {
  if (isFiniteNumber(msg?.apiIndex)) return msg.apiIndex
  for (let i = (session.apiMessages || []).length - 1; i >= 0; i--) {
    if (session.apiMessages[i]?.role === 'user') return i
  }
  return -1
}

function getUserApiMessageContentByIndex(apiIndex) {
  if (!isFiniteNumber(apiIndex) || apiIndex < 0) return null
  const apiMessage = session.apiMessages?.[apiIndex]
  if (!apiMessage || apiMessage.role !== 'user') return null
  return apiMessage.content
}

function messageHasDisplayAttachments(msg, apiIndex = resolveUserApiIndexForDisplayMessage(msg)) {
  if (Array.isArray(msg?.attachments) && msg.attachments.length) return true
  if (Array.isArray(msg?.images) && msg.images.length) return true
  return contentHasUserAttachments(getUserApiMessageContentByIndex(apiIndex))
}

function findNearestUserApiIndexBefore(apiIndex) {
  if (!isFiniteNumber(apiIndex)) return -1
  for (let i = apiIndex - 1; i >= 0; i--) {
    if (session.apiMessages?.[i]?.role === 'user' && session.apiMessages?.[i]?.synthetic_tool_vision !== true) return i
  }
  return -1
}

function findDisplayIndexByApiIndex(role, apiIndex) {
  return (session.messages || []).findIndex((m) => m?.role === role && m?.apiIndex === apiIndex)
}

function truncateConversationAfterUser(userApiIndex, userDisplayIndex) {
  if (isFiniteNumber(userDisplayIndex) && userDisplayIndex >= 0) {
    session.messages.splice(userDisplayIndex + 1, session.messages.length)
  }
  if (isFiniteNumber(userApiIndex) && userApiIndex >= 0) {
    session.apiMessages.splice(userApiIndex + 1, session.apiMessages.length)
  }
}

function resetComposerInput() {
  composerInputKey.value += 1
}

function getRequestConfigOrHint() {
  const provider = selectedProvider.value
  if (!provider) {
    message.warning('请先选择服务商 / 模型')
    showModelModal.value = true
    return null
  }

  if (isUtoolsBuiltinProvider(provider)) {
    if (!canUseUtoolsAi()) {
      message.warning('当前环境不支持内置 uTools AI 服务商，请在 uTools 插件环境中使用。')
      return null
    }

    const model = String(selectedModel.value || '').trim()
    if (!model) {
      message.warning('请先选择模型')
      showModelModal.value = true
      return null
    }

    const imageMode = normalizeImageGenerationMode(imageGenerationMode.value)
    const videoMode = normalizeImageGenerationMode(videoGenerationMode.value)
    if (
      imageMode === 'on' ||
      (imageMode === 'auto' && isLikelyImageGenerationModel(model)) ||
      videoMode === 'on' ||
      (videoMode === 'auto' && isLikelyVideoGenerationModel(model))
    ) {
      message.warning('当前页面会将 uTools 内置 AI 按文本聊天处理，不支持直接图片/视频生成，请改用兼容 OpenAI 的服务商。')
      return null
    }

    return {
      providerKind: 'utools-ai',
      providerId: String(provider._id || '').trim(),
      model,
      requestMode: 'chat',
      imageGenerationPlaceholderMode: 'text',
      supportsVision: false
    }
  }

  const baseUrl = provider.baseurl
  const apiKey = provider.apikey
  if (!baseUrl || !apiKey) {
    message.warning('请先配置服务商接口地址 / API 密钥')
    return null
  }

  const model = String(selectedModel.value || '').trim()
  if (!model) {
    message.warning('请先选择模型')
    showModelModal.value = true
    return null
  }

  const imageMode = normalizeImageGenerationMode(imageGenerationMode.value)
  const videoMode = normalizeImageGenerationMode(videoGenerationMode.value)
  const apiMode = normalizeProviderApiMode(provider.apiMode)
  const modelType = getProviderModelType(provider, model)
  if (modelType === 'embedding') {
    message.warning('当前模型被标记为向量模型，不能用于聊天。请切换模型或在服务商设置中调整模型用途。')
    showModelModal.value = true
    return null
  }
  const useManualImageGeneration = imageMode === 'on'
  const useAutoImageGeneration =
    imageMode === 'auto' &&
    (modelType === 'image-generation' || (modelType === 'auto' && isLikelyImageGenerationModel(model)))
  const useManualVideoGeneration = videoMode === 'on'
  const useAutoVideoGeneration =
    videoMode === 'auto' &&
    (modelType === 'video-generation' || (modelType === 'auto' && isLikelyVideoGenerationModel(model)))
  const requestMode =
    useManualVideoGeneration
      ? 'video-generation'
      : useManualImageGeneration
      ? 'image-generation'
      : videoMode === 'off' && imageMode === 'off'
        ? 'chat'
        : useAutoVideoGeneration
          ? 'video-generation'
        : useAutoImageGeneration
          ? 'image-generation'
          : 'chat'
  const imageGenerationRequestOptions = (useManualImageGeneration || useAutoImageGeneration)
    ? getCurrentImageGenerationRequestOptions()
    : {}
  const videoGenerationRequestOptions = (useManualVideoGeneration || useAutoVideoGeneration)
    ? getCurrentVideoGenerationRequestOptions()
    : {}

  return {
    providerKind: 'openai-compatible',
    providerId: String(provider._id || '').trim(),
    baseUrl,
    apiKey,
    apiMode,
    model,
    modelType,
    requestMode,
    imageGenerationPlaceholderMode: useManualImageGeneration ? 'image' : 'text',
    videoGenerationPlaceholderMode: useManualVideoGeneration ? 'video' : 'text',
    imageGenerationRequestOptionsOverride: imageGenerationRequestOptions,
    videoGenerationRequestOptionsOverride: videoGenerationRequestOptions,
    supportsVision: requestMode === 'chat'
  }
}

function getCurrentToolsKey() {
  const mcpKey = (activeMcpIds.value || [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .sort()
    .join(',')

  const skillKey = (selectedSkillObjects.value || [])
    .map((skill) => {
      const id = String(skill?._id || '').trim()
      const actionCount = Array.isArray(skill?.nativeActions) ? skill.nativeActions.length : 0
      return `${id}:${String(skill?.sourceType || '')}:${actionCount}`
    })
    .filter(Boolean)
    .sort()
    .join(',')

  const mcpConfigKey = (activeMcpServers.value || [])
    .map((s) => {
      if (!s || !s._id) return ''
      const id = String(s._id || '').trim()
      const disabled = s.disabled ? 1 : 0
      const allow = Array.isArray(s.allowTools)
        ? s.allowTools.map((x) => String(x || '').trim()).filter(Boolean).sort().join('|')
        : ''
      const transport = String(s.transportType || '')
      const url = String(s.url || '')
      const command = String(s.command || '')
      return `${id}:${disabled}:${transport}:${url}:${command}:${allow}`
    })
    .filter(Boolean)
    .sort()
    .join(';')

  return `${toolMode.value}|${mcpToolsRevision.value}|${skillKey}|${mcpConfigKey}|${mcpKey}`
}

function syncLastBuiltRequestToolsStats(tools) {
  const list = Array.isArray(tools) ? tools : []
  lastBuiltRequestToolsStats.key = getCurrentToolsKey()
  lastBuiltRequestToolsStats.count = list.length
  lastBuiltRequestToolsStats.chars = estimateToolDefinitionsChars(list)
  lastBuiltRequestToolsStats.updatedAt = Date.now()
  lastBuiltRequestToolsStats.mode = String(effectiveToolMode.value || 'expanded')
}

function formatApproxChars(value) {
  const num = Math.max(0, Math.floor(Number(value) || 0))
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`
  return String(num)
}

function extractModelUsage(payload) {
  if (!payload || typeof payload !== 'object') return null
  const direct =
    payload.usage ||
    payload.response?.usage ||
    payload.usageMetadata ||
    payload.usage_metadata ||
    payload.response?.usageMetadata ||
    payload.response?.usage_metadata
  if (direct && typeof direct === 'object') return direct

  const payloads = Array.isArray(payload.payloads)
    ? payload.payloads
    : Array.isArray(payload)
      ? payload
      : []
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    const nested =
      payloads[index]?.usage ||
      payloads[index]?.response?.usage ||
      payloads[index]?.usageMetadata ||
      payloads[index]?.usage_metadata
    if (nested && typeof nested === 'object') return nested
  }
  return null
}

function readUsageNumber(usage, paths = []) {
  for (const path of paths) {
    let current = usage
    for (const key of path) {
      current = current && typeof current === 'object' ? current[key] : undefined
    }
    const value = Number(current)
    if (Number.isFinite(value) && value >= 0) return Math.floor(value)
  }
  return 0
}

function extractContextTokenMetrics(usage) {
  if (!usage || typeof usage !== 'object') return { inputTokens: 0, cachedTokens: 0 }

  let inputTokens = readUsageNumber(usage, [
    ['prompt_tokens'],
    ['promptTokens'],
    ['promptTokenCount'],
    ['inputTokenCount'],
    ['input_tokens'],
    ['inputTokens']
  ])
  const cacheReadTokens = readUsageNumber(usage, [
    ['prompt_tokens_details', 'cached_tokens'],
    ['input_tokens_details', 'cached_tokens'],
    ['cached_tokens'],
    ['cachedTokens'],
    ['prompt_cache_hit_tokens'],
    ['cache_read_input_tokens'],
    ['cacheReadInputTokens']
  ])
  const cacheWriteTokens = readUsageNumber(usage, [
    ['prompt_tokens_details', 'cache_write_tokens'],
    ['input_tokens_details', 'cache_write_tokens'],
    ['cache_creation_input_tokens'],
    ['cacheCreationInputTokens']
  ])

  // Anthropic 的 input_tokens 不包含缓存读取/写入部分；OpenAI/DeepSeek 的
  // prompt_tokens 已经是完整输入，因此只在 Anthropic 字段出现时补加。
  const hasAnthropicCacheFields =
    Object.prototype.hasOwnProperty.call(usage, 'cache_read_input_tokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'cache_creation_input_tokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'cacheReadInputTokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'cacheCreationInputTokens')
  const hasPromptTotal =
    Object.prototype.hasOwnProperty.call(usage, 'prompt_tokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'promptTokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'promptTokenCount')
  if (hasAnthropicCacheFields && !hasPromptTotal) {
    inputTokens += cacheReadTokens + cacheWriteTokens
  }

  return {
    inputTokens,
    cachedTokens: cacheReadTokens
  }
}

function dispatchBuiltinAgentsToolApprovalModeChange(record, mode) {
  const sessionId = String(record?.id || '').trim()
  if (!sessionId) return false
  const streamIds = []
  for (const [streamId, toolMessage] of activeAgentRunToolMessageByStreamId) {
    const owner = getMemorySessionForToolMessage(toolMessage)
    if (String(owner?.id || '').trim() !== sessionId) continue
    const normalizedStreamId = String(streamId || '').trim()
    if (normalizedStreamId) streamIds.push(normalizedStreamId)
    if (toolMessage && typeof toolMessage === 'object') {
      toolMessage.toolApprovalMode = mode
    }
  }
  if (!streamIds.length) return false
  try {
    window.dispatchEvent(
      new window.CustomEvent(BUILTIN_AGENTS_TOOL_APPROVAL_MODE_CHANGE_EVENT, {
        detail: {
          sessionId,
          streamIds,
          toolApprovalMode: mode
        }
      })
    )
    return true
  } catch {
    return false
  }
}

function updateContextTokenTelemetry(record, usage, {
  requestChars = 0,
  providerId = '',
  model = '',
  endpoint = ''
} = {}) {
  if (!record || typeof record !== 'object') return
  const metrics = extractContextTokenMetrics(usage)
  const normalizedRequestChars = Math.max(0, Math.floor(Number(requestChars) || 0))
  if (!metrics.inputTokens || !normalizedRequestChars) return

  record.contextTokenTelemetry = {
    inputTokens: metrics.inputTokens,
    requestChars: normalizedRequestChars,
    cachedTokens: metrics.cachedTokens,
    providerId: String(providerId || ''),
    model: String(model || ''),
    endpoint: String(endpoint || ''),
    updatedAt: Date.now()
  }
}

function recordModelUsage(usage, {
  providerId = selectedProviderId.value,
  model = '',
  endpoint = '',
  purpose = 'chat'
} = {}) {
  if (!usage || typeof usage !== 'object') return
  const recorder = window?.aiToolsApi?.usage?.recordUsage
  if (typeof recorder !== 'function') return
  void recorder({
    usage,
    providerId: String(providerId || ''),
    model: String(model || ''),
    endpoint: String(endpoint || ''),
    purpose: String(purpose || '')
  }).catch((error) => {
    console.warn('记录模型用量失败：', error)
  })
}

function recordModelUsageFromPayload(payload, options = {}) {
  recordModelUsage(extractModelUsage(payload), options)
}

async function injectPendingGuidanceMessages(abortState, { preferVision = false } = {}) {
  const runRecord = runRecordByAbortState.get(abortState)
  if (!runRecord) return false

  const entries = chatRunInputQueue.takeSteering(runRecord.id)
  if (!entries.length) return false
  touchChatRunInputQueue()

  let completedCount = 0
  try {
    for (const entry of entries) {
      throwIfAborted(abortState)
      const text = String(entry?.text || '').trim()
      const attachments = Array.isArray(entry?.attachments) ? entry.attachments : []
      const userDisplay = createDisplayMessage('user', text || (attachments.length ? '(sent attachments)' : ''), {
        guidance: true
      })
      if (attachments.length) {
        userDisplay.attachmentsExpanded = false
        userDisplay.attachments = attachments
      }
      runRecord.messages.push(userDisplay)
      try {
        await prepareUserApiMessage({
          text,
          attachments,
          userDisplay,
          preferVision,
          providerKind: 'openai-compatible',
          sessionTarget: runRecord
        })
      } catch (error) {
        const displayIndex = runRecord.messages.findIndex((item) => item?.id === userDisplay.id)
        if (displayIndex >= 0) runRecord.messages.splice(displayIndex, 1)
        throw error
      }
      completedCount += 1
    }
  } catch (error) {
    chatRunInputQueue.restore(runRecord.id, entries.slice(completedCount))
    touchChatRunInputQueue()
    throw error
  }

  runRecord.updatedAt = Date.now()
  await maybeScrollToBottomForRun(abortState)
  return true
}

async function runChatRounds({
  providerId = '',
  baseUrl,
  apiKey,
  apiMode = 'auto',
  model,
  signal,
  setCurrentAssistantDisplay,
  abortState = null,
  assistantPlaceholderMode = 'text',
  supportsVision = false,
  memorySystemContent = ''
}) {
  const targetSession = getRunSessionTarget(abortState)
  let tools = []
  let toolMap = new Map()
  let lastToolsKey = ''

  const refreshToolsBundleIfNeeded = async () => {
    if (lastToolsKey) return
    const key = getCurrentToolsKey()
    const bundle = await buildToolsBundle({ abortState })
    tools = Array.isArray(bundle?.tools) ? bundle.tools : []
    toolMap = bundle?.map instanceof Map ? bundle.map : new Map()
    lastToolsKey = key
  }

  throwIfAborted(abortState)
  await refreshToolsBundleIfNeeded()
  // Keep runaway tool loops bounded. A normal tool workflow usually completes
  // within a handful of rounds; 32 still leaves room for complex agent runs.
  const maxRounds = 32
  let omitReasoningEffort = false
  let forceReasoningContent = false
  let imagesFallbackToText = false
  let compatFcToolCallId = isFcToolCallIdCompatEnabled(baseUrl)
  let plainTextToolFallback = false
  let parallelToolCallsMode = 'enabled'
  const repeatedToolCallGuard = createRepeatedToolCallGuard({ maxConsecutive: 3 })

  for (let round = 0; round < maxRounds; round++) {
    throwIfAborted(abortState)
    await refreshToolsBundleIfNeeded()
    if (round > 0) await injectPendingGuidanceMessages(abortState, { preferVision: supportsVision })
    const assistantDisplay = createDisplayMessage('assistant', '', {
      thinking: '',
      thinkingExpanded: false,
      streaming: true,
      render: 'md',
      transientRequestPlaceholder: String(assistantPlaceholderMode || 'text').trim().toLowerCase() !== 'text'
    })
    applyAssistantRequestPlaceholderMode(assistantDisplay, assistantPlaceholderMode)
    targetSession.messages.push(assistantDisplay)
    setCurrentAssistantDisplay(assistantDisplay)

    let lastReasoningText = ''

    const onDelta = (evt) => {
      if (abortState?.aborted || signal?.aborted) return
      if (evt?.type === 'content' && evt.delta) {
        prepareAssistantDisplayForTextResponse(assistantDisplay)
        typewriterEnqueue(assistantDisplay, String(evt.delta))
      }

      if (evt?.type === 'reasoning' && evt.delta) {
        deferredAppendMessageField(assistantDisplay, 'thinking', String(evt.delta), { scheduleScroll: true })
        lastReasoningText = String(evt.reasoning || '')
      }
    }

    let result = null
    let successfulRequestChars = 0
    for (let attempt = 0; attempt < 3; attempt++) {
        const activeTools = plainTextToolFallback ? [] : tools
        const attemptBody = {
          model,
          stream: true,
          messages: buildRequestMessages({
            baseUrl,
            model,
            memorySystemContent,
            sessionRecord: targetSession,
            forceReasoningContent,
            compatToolCallIdAsFc: compatFcToolCallId,
            fallbackAllVisionMessages: imagesFallbackToText,
            tools: activeTools,
            apiMessages: buildRequestApiMessages('openai-compatible', {
              tools: activeTools,
              apiMessages: targetSession.apiMessages,
              contextSummary: targetSession?.contextSummary || null,
              sessionRecord: targetSession
            }),
            plainTextToolFallback
          }),
          ...(activeTools.length
            ? {
                tools: activeTools,
                tool_choice: 'auto',
                ...(parallelToolCallsMode === 'enabled' ? { parallel_tool_calls: true } : {})
              }
            : {}),
          ...buildActiveRequestOverrides({ omitReasoningEffort })
        }
        const attemptRequestChars =
          estimateMessagesSize(attemptBody.messages) +
          estimateToolDefinitionsChars(attemptBody.tools)

      try {
        result = await streamChatCompletion({
          baseUrl,
          apiKey,
          apiMode,
          body: attemptBody,
          signal,
          onDelta,
          abortState
        })
        throwIfAborted(abortState)
        successfulRequestChars = attemptRequestChars
        break
      } catch (err) {
        const errText = String(err?.message || err || '')
        if (isAbortError(err) || abortState?.aborted || signal?.aborted) throw createAbortError()

        if (!compatFcToolCallId && errText.includes("Expected an ID that begins with 'fc'") && errText.includes('input[') && errText.includes('.id')) {
          compatFcToolCallId = true
          enableFcToolCallIdCompat(baseUrl)
          message.warning("检测到当前端点要求工具调用 ID 以 fc_ 开头，已启用兼容模式（tool_calls.id: call_ -> fc_）。")
          continue
        }

        const hasVision = (targetSession.apiMessages || []).some((msg) => messageContentHasImageUrl(msg?.content))
        if (!imagesFallbackToText && hasVision && shouldFallbackVisionInputToText(errText)) {
          imagesFallbackToText = true
          message.warning('当前端点不支持 image_url 输入。本次请求已自动改为纯文本发送，模型将无法直接理解图片。')
          continue
        }

        if (!omitReasoningEffort && thinkingEffort.value !== 'auto' && errText.includes('reasoning_effort')) {
          // 部分接口不支持 reasoning_effort，自动回退为不传该字段
          omitReasoningEffort = true
          continue
        }

        if (parallelToolCallsMode === 'enabled' && shouldRetryWithoutParallelToolCalls(errText)) {
          parallelToolCallsMode = 'disabled'
          continue
        }

        if (!plainTextToolFallback && hasToolStateMessages(targetSession.apiMessages) && shouldRetryToolContinuationAsPlainText(errText)) {
          plainTextToolFallback = true
          message.warning('当前端点的工具续跑接口临时不可用，已改为用纯文本工具结果继续回答。')
          continue
        }

        if (!forceReasoningContent) {
          if (shouldRetryWithReasoningContent(errText)) {
            // DeepSeek thinking_mode 下，后续请求里的 assistant 消息需要带上 reasoning_content
            forceReasoningContent = true
            continue
          }
        }

        throw err
      }
    }

    if (!result) {
      throw new Error('请求失败：已达到重试次数上限')
    }
    throwIfAborted(abortState)
    recordModelUsage(result?.usage, {
      providerId,
      model,
      endpoint: result?.endpoint || apiMode || 'auto',
      purpose: round > 0 ? 'chat-tool-round' : 'chat'
    })
    updateContextTokenTelemetry(targetSession, result?.usage, {
      requestChars: successfulRequestChars,
      providerId,
      model,
      endpoint: result?.endpoint || apiMode || 'auto'
    })

    if (result?.content && !assistantDisplay.content && !typewriterStates.has(assistantDisplay.id)) {
      prepareAssistantDisplayForTextResponse(assistantDisplay)
      typewriterEnqueue(assistantDisplay, String(result.content || ''))
    }

    await Promise.all([
      typewriterWaitIdle(assistantDisplay.id),
      deferredMessageFieldWaitIdle(assistantDisplay.id, 'thinking')
    ])
    assistantDisplay.streaming = false
    assistantDisplay.render = 'md'
    typewriterStates.delete(assistantDisplay.id)
    const assistantImages = await persistChatMediaListAssets(
      extractChatImagesFromToolResult(result?.payloads?.length ? result.payloads : result),
      { kind: 'image', messageId: assistantDisplay.id }
    )
    const assistantVideos = await persistChatMediaListAssets(
      extractChatVideosFromToolResult(result?.payloads?.length ? result.payloads : result),
      { kind: 'video', messageId: assistantDisplay.id }
    )
    if (assistantImages.length) {
      assistantDisplay.images = assistantImages
      assistantDisplay.transientRequestPlaceholder = false
      clearAssistantMediaBubblePlaceholders(assistantDisplay)
    }
    if (assistantVideos.length) {
      assistantDisplay.videos = assistantVideos
      assistantDisplay.transientRequestPlaceholder = false
      clearAssistantMediaBubblePlaceholders(assistantDisplay)
    }
    maybeScheduleScrollToBottomForRun(abortState)

    const normalizedToolCalls = normalizeAssistantToolCalls(result?.toolCalls, {
      createFallbackId: () => `call_${newId()}`
    })

    targetSession.apiMessages.push({
      role: 'assistant',
      content: String(result.content || ''),
      ...(normalizedToolCalls.length ? { tool_calls: normalizedToolCalls } : {}),
      reasoning_content: String(result.reasoning ?? '')
    })
    assistantDisplay.apiIndex = targetSession.apiMessages.length - 1

    if (!assistantDisplay.content.trim() && normalizedToolCalls.length && !String(assistantDisplay.thinking || '').trim()) {
      const idx = targetSession.messages.findIndex((m) => m.id === assistantDisplay.id)
      if (idx !== -1) targetSession.messages.splice(idx, 1)
    }
    if (
      !assistantDisplay.content.trim() &&
      !normalizedToolCalls.length &&
      !(Array.isArray(assistantDisplay.images) && assistantDisplay.images.length) &&
      !(Array.isArray(assistantDisplay.videos) && assistantDisplay.videos.length)
    ) {
      assistantDisplay.content = buildEmptyAssistantResponseText(targetSession.apiMessages)
    }

    setCurrentAssistantDisplay(null)
    await maybeScrollToBottomForRun(abortState)

    if (!normalizedToolCalls.length) {
      const guidanceInjected =
        round < maxRounds - 1
          ? await injectPendingGuidanceMessages(abortState, { preferVision: supportsVision })
          : false
      if (guidanceInjected) continue
      break
    }

    if (round === maxRounds - 1) {
      targetSession.messages.push(createDisplayMessage('assistant', '工具调用轮次已达到上限。'))
      break
    }

    const repeatedToolCallState = repeatedToolCallGuard.observe(normalizedToolCalls)
    if (repeatedToolCallState.blocked) {
      const stopText = '检测到相同工具和参数连续调用 3 次，已停止重复执行。请调整操作方式，或直接说明当前阻塞原因。'
      normalizedToolCalls.forEach((toolCall) => {
        targetSession.apiMessages.push(createToolResultApiMessage(toolCall, stopText))
      })
      targetSession.apiMessages.push({ role: 'assistant', content: stopText })
      targetSession.messages.push(createDisplayMessage('assistant', stopText))
      await maybeScrollToBottomForRun(abortState)
      break
    }

    const toolExecResults = await executeToolCallsParallel(
      normalizedToolCalls,
      toolMap,
      lastReasoningText || String(result.reasoning || ''),
      abortState
    )

    for (let index = 0; index < normalizedToolCalls.length; index += 1) {
      const toolCall = normalizedToolCalls[index]
      const exec = toolExecResults[index]
      throwIfAborted(abortState)
      targetSession.apiMessages.push(createToolResultApiMessage(toolCall, exec?.content))
      const latestUserPrompt = getLatestRealUserPromptText(targetSession.apiMessages)
      const shouldAttachToolImages =
        String(exec?.toolName || '').trim() === 'notes_read' ||
        shouldAutoAttachToolImagesForVision(latestUserPrompt)
      if (supportsVision && shouldAttachToolImages && Array.isArray(exec?.images) && exec.images.length) {
        const syntheticVisionMessage = buildToolVisionUserMessage({
          images: exec.images,
          serverName: exec.serverName || toolCall?.function?.name || '',
          toolName: exec.toolName || toolCall?.function?.name || '',
          userPrompt: latestUserPrompt
        })
        if (syntheticVisionMessage) {
          targetSession.apiMessages.push(syntheticVisionMessage)
        }
      }
    }
  }
}

function mergeUtoolsAiStreamText(previous, incoming) {
  const next = String(incoming || '')
  if (!next) {
    return {
      delta: '',
      total: String(previous || '')
    }
  }

  const current = String(previous || '')
  if (current && next.startsWith(current)) {
    return {
      delta: next.slice(current.length),
      total: next
    }
  }

  return {
    delta: next,
    total: current + next
  }
}

async function runUtoolsAiChatRound({
  providerId = '',
  model,
  setCurrentAssistantDisplay,
  setAbortHandle,
  isAborted,
  abortState = null
}) {
  if (!canUseUtoolsAi()) {
    throw new Error('当前环境不支持 uTools 官方 AI')
  }

  const targetSession = getRunSessionTarget(abortState)
  throwIfAborted(abortState)
  const bundle = await buildToolsBundle({ abortState })
  const tools = Array.isArray(bundle?.tools) ? bundle.tools : []
  const toolMap = bundle?.map instanceof Map ? bundle.map : new Map()
  const assistantSegments = []
  let assistantDisplay = null

  const createStreamingAssistantDisplay = () => {
    const msg = createDisplayMessage('assistant', '', {
      thinking: '',
      thinkingExpanded: false,
      streaming: true,
      render: 'md'
    })
    assistantSegments.push(msg)
    assistantDisplay = msg
    targetSession.messages.push(msg)
    setCurrentAssistantDisplay(msg)
    return msg
  }

  const hasVisibleAssistantContent = (msg) => {
    return !!String(msg?.content || '').trim() || !!String(msg?.thinking || '').trim()
  }

  const finalizeStreamingAssistantDisplay = async (options = {}) => {
    const removeIfEmpty = !!options.removeIfEmpty
    const current = assistantDisplay
    if (!current) return null

    await Promise.all([
      typewriterWaitIdle(current.id),
      deferredMessageFieldWaitIdle(current.id, 'thinking')
    ])
    current.streaming = false
    current.render = 'md'
    typewriterStates.delete(current.id)

    if (removeIfEmpty && !hasVisibleAssistantContent(current)) {
      const idx = targetSession.messages.findIndex((m) => m.id === current.id)
      if (idx !== -1) targetSession.messages.splice(idx, 1)
    }

    assistantDisplay = null
    setCurrentAssistantDisplay(null)
    maybeScheduleScrollToBottomForRun(abortState)
    return current
  }

  const ensureStreamingAssistantDisplay = () => assistantDisplay || createStreamingAssistantDisplay()

  createStreamingAssistantDisplay()

  let streamedContent = ''
  let streamedReasoning = ''
  let toolInvokeCount = 0
  const utoolsToolFallbackRecords = []

  const buildUtoolsToolFallbackPrompt = () => {
    const records = utoolsToolFallbackRecords
      .map((record, index) => {
        const serverName = String(record.serverName || '').trim()
        const toolName = String(record.toolName || record.name || '').trim()
        const args = truncateText(record.argsText || '{}', 1200, '（工具参数已截断）')
        const content = truncateText(record.content || '', 24000, '（工具结果已截断）')
        return [
          `### 工具结果 ${index + 1}`,
          serverName || toolName ? `工具：${[serverName, toolName].filter(Boolean).join(' / ')}` : '',
          `参数：${args}`,
          '结果：',
          content || '（空结果）'
        ].filter(Boolean).join('\n')
      })
      .filter(Boolean)
      .join('\n\n')

    return [
      '系统补充：刚才已经完成了工具调用，但当前 uTools AI 工具续跑接口临时不可用。',
      '请直接基于下面的工具结果回答用户刚才的问题；如果资料不足，请说明不足之处。',
      records
    ].filter(Boolean).join('\n\n')
  }

  const memorySystemContent = String(abortState?.memorySystemContent || '').trim()
  let lastUtoolsRequestChars = 0
  const requestUtoolsAi = (requestApiMessages, requestTools = tools) => {
    const requestMessages = buildUtoolsAiMessages({
      systemContent: buildCombinedSystemContent(memorySystemContent, { sessionRecord: targetSession }),
      apiMessages: requestApiMessages
    })
    lastUtoolsRequestChars =
      estimateMessagesSize(requestMessages) +
      estimateToolDefinitionsChars(requestTools)
    return window.utools.ai(
      {
        model,
        messages: requestMessages,
        ...(requestTools.length ? { tools: requestTools } : {})
      },
      (chunk) => {
        if (abortState?.aborted || isAborted?.()) return
        const contentState = mergeUtoolsAiStreamText(streamedContent, chunk?.content)
        streamedContent = contentState.total
        if (contentState.delta) {
          ensureStreamingAssistantDisplay()
          typewriterEnqueue(assistantDisplay, contentState.delta)
        }

        const reasoningState = mergeUtoolsAiStreamText(streamedReasoning, extractUtoolsAiReasoningText(chunk))
        streamedReasoning = reasoningState.total
        if (reasoningState.delta) {
          ensureStreamingAssistantDisplay()
          deferredAppendMessageField(assistantDisplay, 'thinking', reasoningState.delta, { scheduleScroll: true })
        }
      }
    )
  }

  const unregisterToolFns = registerUtoolsAiToolFunctions({
    tools,
    invokeTool: async (name, argsObj) => {
      throwIfAborted(abortState)
      toolInvokeCount += 1
      await finalizeStreamingAssistantDisplay({ removeIfEmpty: true })

      const argsText = stableStringify(argsObj || {})
      const exec = await executeToolCall(
        {
          id: `utools_call_${newId()}`,
          type: 'function',
          function: {
            name,
            arguments: argsText || '{}'
          }
        },
        toolMap,
        streamedReasoning,
        abortState
      )

      const raw = String(exec?.content || '')
      utoolsToolFallbackRecords.push({
        name,
        argsText,
        content: raw,
        serverName: exec?.serverName || '',
        toolName: exec?.toolName || name
      })
      const parsed = safeJsonParse(raw)
      if (exec?.serverName === '内置联网' || exec?.toolName === 'web_search' || exec?.toolName === 'web_read') {
        return raw
      }
      return parsed.ok ? parsed.value : raw
    }
  })

  try {
    const requestApiMessages = buildRequestApiMessages('utools-ai', {
      tools,
      apiMessages: targetSession.apiMessages,
      contextSummary: targetSession?.contextSummary || null,
      sessionRecord: targetSession
    })
    let request = requestUtoolsAi(requestApiMessages, tools)
    setAbortHandle(request)
    let result = null
    try {
      result = await request
    } catch (err) {
      const errText = err?.message || String(err)
      if (!toolInvokeCount || !shouldRetryToolContinuationAsPlainText(errText) || abortState?.aborted || isAborted?.()) throw err
      await finalizeStreamingAssistantDisplay({ removeIfEmpty: true })
      message.warning('当前 uTools AI 工具续跑接口临时不可用，已改为用纯文本工具结果继续回答。')
      request = requestUtoolsAi(
        [
          ...requestApiMessages,
          {
            role: 'user',
            content: buildUtoolsToolFallbackPrompt()
          }
        ],
        []
      )
      setAbortHandle(request)
      result = await request
    }

    if (isAborted?.() || abortState?.aborted) throw createAbortError()
    recordModelUsage(extractModelUsage(result), {
      providerId,
      model,
      endpoint: 'utools-ai',
      purpose: 'chat'
    })
    updateContextTokenTelemetry(targetSession, extractModelUsage(result), {
      requestChars: lastUtoolsRequestChars,
      providerId,
      model,
      endpoint: 'utools-ai'
    })

    const finalContentState = mergeUtoolsAiStreamText(streamedContent, result?.content)
    streamedContent = finalContentState.total
    if (finalContentState.delta) {
      ensureStreamingAssistantDisplay()
      typewriterEnqueue(assistantDisplay, finalContentState.delta)
    }

    const finalReasoningState = mergeUtoolsAiStreamText(streamedReasoning, extractUtoolsAiReasoningText(result))
    streamedReasoning = finalReasoningState.total
    if (finalReasoningState.delta) {
      ensureStreamingAssistantDisplay()
      deferredAppendMessageField(assistantDisplay, 'thinking', finalReasoningState.delta, { scheduleScroll: true })
    }

    await finalizeStreamingAssistantDisplay({ removeIfEmpty: true })

    targetSession.apiMessages.push({
      role: 'assistant',
      content: String(streamedContent || ''),
      reasoning_content: String(streamedReasoning || '')
    })
    const assistantApiIndex = targetSession.apiMessages.length - 1
    const visibleSegments = assistantSegments.filter((segment) => targetSession.messages.some((m) => m.id === segment.id))
    visibleSegments.forEach((segment) => {
      segment.apiIndex = assistantApiIndex
    })

    if (!visibleSegments.some((segment) => hasVisibleAssistantContent(segment)) && toolInvokeCount === 0) {
      const emptyMsg = createDisplayMessage('assistant', buildEmptyAssistantResponseText(targetSession.apiMessages))
      emptyMsg.apiIndex = assistantApiIndex
      targetSession.messages.push(emptyMsg)
    }

    setCurrentAssistantDisplay(null)
    await maybeScrollToBottomForRun(abortState)
  } finally {
    unregisterToolFns()
    setAbortHandle(null)
  }
}

function buildImageGenerationResultText({ imageCount, revisedPrompts }) {
  const count = Math.max(0, Number(imageCount) || 0)
  if (!revisedPrompts.length) return ''
  const title = count > 1 ? `已生成 ${count} 张图片` : '已生成 1 张图片'
  return `### ${title}\n\n#### 修订提示词\n\n${revisedPrompts.join('\n\n')}`
}

function buildImageGenerationApiSummary({ imageCount, revisedPrompts }) {
  const count = Math.max(0, Number(imageCount) || 0)
  const lines = [`（已生成 ${count || 1} 张图片）`]
  const firstRevisedPrompt = truncateInlineText(revisedPrompts?.[0] || '', 260)
  if (firstRevisedPrompt) lines.push(`修订提示词：${firstRevisedPrompt}`)
  return lines.join('\n')
}

function buildImageGenerationPendingText(imageTask = null) {
  const statusLabel = imageTask ? assistantImageTaskStatusLabel({ imageTask }) : '生成中'
  const taskId = String(imageTask?.id || '').trim()
  return `图片生成${statusLabel}${taskId ? `（任务 ID：${taskId}）` : '……'}`
}

function buildMediaRequestSnapshot(kind, {
  baseUrl = '',
  model = '',
  prompt = '',
  requestOptions = null,
  requestMeta = null,
  placeholderMode = 'text',
  startedAt = Date.now()
} = {}) {
  return {
    kind,
    baseUrl: String(baseUrl || '').trim(),
    model: String(model || '').trim(),
    prompt: String(prompt || '').trim(),
    requestOptions: requestOptions && typeof requestOptions === 'object' ? deepCopyJson(requestOptions, {}) : {},
    requestMeta: requestMeta && typeof requestMeta === 'object' ? deepCopyJson(requestMeta, {}) : null,
    placeholderMode: String(placeholderMode || 'text').trim() || 'text',
    startedAt: Number(startedAt) || Date.now()
  }
}

function attachMediaRequestSnapshot(assistantDisplay, kind, patch = {}) {
  if (!assistantDisplay || typeof assistantDisplay !== 'object') return
  const previous = assistantDisplay.mediaRequest && typeof assistantDisplay.mediaRequest === 'object'
    ? assistantDisplay.mediaRequest
    : {}
  assistantDisplay.mediaRequest = {
    ...previous,
    ...patch,
    kind
  }
}

function createImageGenerationPlaceholderDisplay(userPrompt, placeholderMode = 'text', options = {}) {
  const requestInfo = String(options?.requestInfo || '').trim()
  const assistantDisplay = createDisplayMessage('assistant', placeholderMode === 'image' ? '' : buildImageGenerationPendingText(), {
    streaming: false,
    render: 'text',
    imagePrompt: userPrompt,
    imageRequestInfo: requestInfo,
    transientRequestPlaceholder: true
  })

  if (placeholderMode === 'image') {
    assistantDisplay.imageBubblePlaceholder = true
    assistantDisplay.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder(
      '图片生成中，结果就绪后会展示在这里。',
      requestInfo
    )
  }

  return assistantDisplay
}

function applyImageGenerationTaskToDisplay(assistantDisplay, imageTask, placeholderMode = 'text') {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'text'
  assistantDisplay.transientRequestPlaceholder = false

  if (placeholderMode === 'image') {
    const requestInfo = String(assistantDisplay.imageRequestInfo || '').trim()
    assistantDisplay.content = ''
    assistantDisplay.imageTask = imageTask
    assistantDisplay.imageBubblePlaceholder = true
    assistantDisplay.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder(
      imageTask?.note || '图片生成中，结果就绪后会展示在这里。',
      requestInfo
    )
    return
  }

  assistantDisplay.imageTask = null
  assistantDisplay.imageBubblePlaceholder = false
  assistantDisplay.imageBubblePlaceholderImage = null
  assistantDisplay.content = buildImageGenerationPendingText(imageTask)
}

function applyImageGenerationTextToDisplay(assistantDisplay, textResult) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'md'
  assistantDisplay.content = String(textResult || '').trim()
  assistantDisplay.imageTask = null
  assistantDisplay.images = []
  assistantDisplay.imageBubblePlaceholder = false
  assistantDisplay.imageBubblePlaceholderImage = null
  assistantDisplay.transientRequestPlaceholder = false
}

function applyImageGenerationImagesToDisplay(assistantDisplay, { images, userPrompt, revisedPrompts }) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = revisedPrompts.length ? 'md' : 'text'
  assistantDisplay.content = ''
  assistantDisplay.imageTask = null
  assistantDisplay.images = images
  assistantDisplay.imagePrompt = userPrompt
  assistantDisplay.imageBubblePlaceholder = false
  assistantDisplay.imageBubblePlaceholderImage = null
  assistantDisplay.transientRequestPlaceholder = false
  assistantDisplay.content = buildImageGenerationResultText({
    imageCount: images.length,
    revisedPrompts
  })
}

async function runImageGenerationRound({
  providerId = '',
  baseUrl,
  apiKey,
  model,
  signal,
  setCurrentAssistantDisplay,
  abortState = null,
  placeholderMode = 'text',
  requestOptionsOverride = null
}) {
  const targetSession = getRunSessionTarget(abortState)
  throwIfAborted(abortState)
  const lastUserApiMsg = (() => {
    for (let i = (targetSession.apiMessages || []).length - 1; i >= 0; i--) {
      if (targetSession.apiMessages[i]?.role === 'user') return targetSession.apiMessages[i]
    }
    return null
  })()

  const userPrompt = extractEditableUserTextFromContent(
    extractImageGenerationPromptFromContent(lastUserApiMsg?.content)
  ).trim()
  if (!userPrompt) {
    throw new Error('图片生成提示词为空')
  }

  const requestOptions =
    requestOptionsOverride && typeof requestOptionsOverride === 'object'
      ? buildImageGenerationRequestOptionsWithReferences(requestOptionsOverride)
      : {}
  const requestInfo = placeholderMode === 'image' ? buildManualImageGenerationRequestInfo(requestOptions) : ''
  const startedAt = Date.now()
  const assistantDisplay = createImageGenerationPlaceholderDisplay(userPrompt, placeholderMode, { requestInfo })
  attachMediaRequestSnapshot(assistantDisplay, 'image', buildMediaRequestSnapshot('image', {
    baseUrl,
    model,
    prompt: userPrompt,
    requestOptions,
    placeholderMode,
    startedAt
  }))
  targetSession.messages.push(assistantDisplay)
  setCurrentAssistantDisplay(assistantDisplay)
  await maybeScrollToBottomForRun(abortState)

  const prompt = buildImageGenerationPromptFromHistory(userPrompt, { apiMessages: targetSession.apiMessages })
  const { payload, requestMeta } = await requestImageGeneration({
    baseUrl,
    apiKey,
    model,
    prompt,
    requestOptions,
    signal
  })
  attachMediaRequestSnapshot(assistantDisplay, 'image', { requestMeta })
  recordModelUsageFromPayload(payload, {
    providerId,
    model,
    endpoint: requestMeta?.kind || 'image-generation',
    purpose: 'image-generation'
  })
  throwIfAborted(abortState)

  const imageTask = extractImageGenerationTaskState(payload, requestMeta)
  if (imageTask) {
    applyImageGenerationTaskToDisplay(assistantDisplay, { ...imageTask, startedAt }, placeholderMode)
    targetSession.apiMessages.push({
      role: 'assistant',
      content:
        placeholderMode === 'image'
          ? `图片任务已受理：${assistantImageTaskStatusLabel(assistantDisplay)}${imageTask.id ? `（任务 ID：${imageTask.id}）` : ''}`
          : buildImageGenerationPendingText(imageTask)
    })
    assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
    await maybeScrollToBottomForRun(abortState)
    return
  }

  const generationTimeMs = Math.max(0, Date.now() - startedAt)
  const images = await persistChatMediaListAssets(
    extractChatImagesFromToolResult(payload).map((image) => ({
      ...image,
      requestSize: image.requestSize || requestOptions.size || '',
      generationTimeMs: Number(image.generationTimeMs || 0) || generationTimeMs
    })),
    { kind: 'image', messageId: assistantDisplay.id }
  )
  const textResult = extractImageGenerationTextResult(payload)
  if (!images.length) {
    if (textResult) {
      applyImageGenerationTextToDisplay(assistantDisplay, textResult)
      targetSession.apiMessages.push({
        role: 'assistant',
        content: textResult
      })
      assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
      setCurrentAssistantDisplay(null)
      await maybeScrollToBottomForRun(abortState)
      return
    }
    throw new Error(buildImageGenerationCompatibilityError(payload, requestMeta))
  }

  const revisedPrompts = collectImageGenerationRevisedPrompts(payload)
  applyImageGenerationImagesToDisplay(assistantDisplay, { images, userPrompt, revisedPrompts })

  targetSession.apiMessages.push({
    role: 'assistant',
    content: buildImageGenerationApiSummary({
      imageCount: images.length,
      revisedPrompts
    })
  })
  assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
  setCurrentAssistantDisplay(null)
  await maybeScrollToBottomForRun(abortState)
}

function buildVideoGenerationPendingText(videoTask = null) {
  const statusLabel = videoTask ? assistantVideoTaskStatusLabel({ videoTask }) : '生成中'
  const taskId = String(videoTask?.id || '').trim()
  return `视频生成${statusLabel}${taskId ? `（任务 ID：${taskId}）` : '……'}`
}

function createVideoGenerationPlaceholderDisplay(userPrompt, placeholderMode = 'text', options = {}) {
  const requestInfo = String(options?.requestInfo || '').trim()
  const assistantDisplay = createDisplayMessage('assistant', placeholderMode === 'video' ? '' : buildVideoGenerationPendingText(), {
    streaming: false,
    render: 'text',
    videoPrompt: userPrompt,
    videoRequestInfo: requestInfo,
    transientRequestPlaceholder: true
  })

  if (placeholderMode === 'video') {
    assistantDisplay.videoBubblePlaceholder = true
    assistantDisplay.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder(
      '视频生成中，结果就绪后会展示在这里。',
      requestInfo
    )
  }

  return assistantDisplay
}

function applyVideoGenerationTaskToDisplay(assistantDisplay, videoTask, placeholderMode = 'text') {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'text'
  assistantDisplay.transientRequestPlaceholder = false

  if (placeholderMode === 'video') {
    const requestInfo = String(assistantDisplay.videoRequestInfo || '').trim()
    assistantDisplay.content = ''
    assistantDisplay.videoTask = videoTask
    assistantDisplay.videoBubblePlaceholder = true
    assistantDisplay.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder(
      videoTask?.note || '视频生成中，结果就绪后会展示在这里。',
      requestInfo
    )
    return
  }

  assistantDisplay.videoTask = videoTask
  assistantDisplay.videoBubblePlaceholder = false
  assistantDisplay.videoBubblePlaceholderItem = null
  assistantDisplay.content = ''
}

function applyVideoGenerationTextToDisplay(assistantDisplay, textResult) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'md'
  assistantDisplay.content = String(textResult || '').trim()
  assistantDisplay.videoTask = null
  assistantDisplay.videos = []
  assistantDisplay.videoBubblePlaceholder = false
  assistantDisplay.videoBubblePlaceholderItem = null
  assistantDisplay.transientRequestPlaceholder = false
}

function buildVideoGenerationResultText({ videoCount }) {
  const count = Math.max(0, Number(videoCount) || 0)
  if (!count) return ''
  return count > 1 ? `已生成 ${count} 个视频` : '已生成 1 个视频'
}

function applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt }) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'text'
  assistantDisplay.content = ''
  assistantDisplay.videoTask = null
  assistantDisplay.videos = videos
  assistantDisplay.videoPrompt = userPrompt
  assistantDisplay.videoBubblePlaceholder = false
  assistantDisplay.videoBubblePlaceholderItem = null
  assistantDisplay.transientRequestPlaceholder = false
  assistantDisplay.content = buildVideoGenerationResultText({ videoCount: videos.length })
}

function buildVideoGenerationApiSummary({ videoCount }) {
  const count = Math.max(0, Number(videoCount) || 0)
  return `（已生成 ${count || 1} 个视频）`
}

function buildMessageIdSet(messages = []) {
  const ids = new Set()
  ;(Array.isArray(messages) ? messages : []).forEach((msg) => {
    const id = String(msg?.id || '').trim()
    if (id) ids.add(id)
  })
  return ids
}

const activeSessionMessageIdSet = computed(() => buildMessageIdSet(session.messages))
const trackedMessageIdSet = computed(() => {
  const ids = new Set(activeSessionMessageIdSet.value)
  ;(Array.isArray(memorySessions.value) ? memorySessions.value : []).forEach((record) => {
    ;(Array.isArray(record?.messages) ? record.messages : []).forEach((msg) => {
      const id = String(msg?.id || '').trim()
      if (id) ids.add(id)
    })
  })
  return ids
})
const sessionToolMessageCount = computed(() =>
  (Array.isArray(session.messages) ? session.messages : []).reduce(
    (count, msg) => count + (isToolMessage(msg) ? 1 : 0),
    0
  )
)
const compactToolMessageMode = computed(
  () =>
    (session.messages?.length || 0) >= CHAT_TOOL_COMPACT_MIN_MESSAGES &&
    sessionToolMessageCount.value >= CHAT_TOOL_COMPACT_MIN_TOOL_MESSAGES
)

function isDisplayMessageInActiveSession(msg) {
  if (!msg || typeof msg !== 'object') return false
  const id = String(msg.id || '').trim()
  return !!id && activeSessionMessageIdSet.value.has(id)
}

function isDisplayMessageTracked(msg) {
  if (!msg || typeof msg !== 'object') return false
  const id = String(msg.id || '').trim()
  return !!id && trackedMessageIdSet.value.has(id)
}

function startDetachedVideoTaskPolling({
  assistantDisplay,
  initialPayload,
  requestMeta,
  apiKey,
  startedAt,
  placeholderMode,
  userPrompt,
  initialTask,
  sessionRecord = null,
  stateSnapshot = null
}) {
  if (!assistantDisplay || !requestMeta || !apiKey) return
  const taskId = String(initialTask?.id || initialPayload?.id || initialPayload?.task_id || '').trim()
  if (!taskId) return

  const record = sessionRecord || getMemorySessionForMessage(assistantDisplay)
  const requestHandle = new AbortController()
  const abortState = createRequestAbortStateForMediaResume(requestHandle)
  detachedMediaAbortStates.add(abortState)
  setMediaTaskResuming(assistantDisplay, 'video', true)
  record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0)) + 1
  if (stateSnapshot && typeof stateSnapshot === 'object') record.state = deepCopyJson(stateSnapshot, {})

  void (async () => {
    try {
      const resolvedPayload = await waitForVideoGenerationResult({
        initialPayload,
        requestMeta,
        apiKey,
        signal: requestHandle.signal,
        abortState,
        timeoutMs: VIDEO_GENERATION_RESULT_TIMEOUT_MS,
        onStatus: (_payload, taskState) => {
          if (!isDisplayMessageTracked(assistantDisplay)) {
            abortState.abort()
            return
          }
          if (!taskState) return
          const nextTask = {
            ...(assistantDisplay.videoTask || {}),
            ...taskState,
            id: taskState.id || assistantDisplay.videoTask?.id || taskId,
            startedAt,
            lastPolledAt: Date.now()
          }
          applyVideoGenerationTaskToDisplay(assistantDisplay, nextTask, placeholderMode)
        }
      })

      if (!isDisplayMessageTracked(assistantDisplay)) return

      if (!resolvedPayload) {
        assistantDisplay.videoTask = {
          ...(assistantDisplay.videoTask || {}),
          id: taskId,
          status: 'processing',
          stage: 'polling',
          startedAt,
          note: '视频任务仍在生成中，稍后可继续轮询。'
        }
        applyVideoGenerationTaskToDisplay(assistantDisplay, assistantDisplay.videoTask, placeholderMode)
        setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationPendingText(assistantDisplay.videoTask))
        return
      }

      const generationTimeMs = Math.max(0, Date.now() - startedAt)
      const videos = await persistChatMediaListAssets(
        extractChatVideosFromToolResult(resolvedPayload).map((video) => ({
          ...video,
          generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
        })),
        { kind: 'video', messageId: assistantDisplay.id }
      )
      if (!videos.length) {
        const textResult = extractImageGenerationTextResult(resolvedPayload)
        if (textResult) {
          applyVideoGenerationTextToDisplay(assistantDisplay, textResult)
          setAssistantApiContentForDisplay(assistantDisplay, textResult)
          return
        }
        throw new Error(buildVideoGenerationCompatibilityError(resolvedPayload, requestMeta))
      }

      applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt })
      setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationApiSummary({ videoCount: videos.length }))
      message.success('视频生成完成')
    } catch (err) {
      if (!isDisplayMessageTracked(assistantDisplay)) return
      if (abortState.aborted || isAbortError(err)) {
        assistantDisplay.videoTask = {
          ...(assistantDisplay.videoTask || {}),
          id: taskId,
          status: 'processing',
          stage: 'polling',
          startedAt,
          note: '已停止自动轮询，稍后可继续轮询。'
        }
        applyVideoGenerationTaskToDisplay(assistantDisplay, assistantDisplay.videoTask, placeholderMode)
        setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationPendingText(assistantDisplay.videoTask))
      } else {
        const errorText = err?.message || String(err)
        applyMediaGenerationFailureToDisplay(assistantDisplay, errorText)
        message.error(assistantDisplay.mediaFailure?.summary || mediaFailureSummary(errorText, 'video') || '视频轮询失败')
      }
    } finally {
      detachedMediaAbortStates.delete(abortState)
      record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0) - 1)
      if (isDisplayMessageTracked(assistantDisplay)) {
        setMediaTaskResuming(assistantDisplay, 'video', false)
        void autoPersistMemorySessionWhenIdle(record)
        if (isDisplayMessageInActiveSession(assistantDisplay)) await scrollToBottom()
      }
    }
  })()
}

async function resolveVideoGenerationContentIfReady({
  payload,
  requestMeta,
  apiKey,
  signal,
  abortState = null,
  assistantDisplay = null,
  startedAt = Date.now(),
  placeholderMode = 'text'
}) {
  if (!shouldFetchVideoGenerationContent(payload, requestMeta)) return payload

  const resolvedPayload = await waitForVideoGenerationResult({
    initialPayload: payload,
    requestMeta,
    apiKey,
    signal,
    abortState,
    timeoutMs: VIDEO_GENERATION_RESULT_TIMEOUT_MS,
    initialPollDelayMs: 0,
    onStatus: (_payload, taskState) => {
      if (!taskState || !assistantDisplay) return
      const nextTask = {
        ...(assistantDisplay.videoTask || {}),
        ...taskState,
        startedAt,
        lastPolledAt: Date.now(),
        note: taskState.stage === 'fetching_result'
          ? '视频已生成，正在获取视频文件。'
          : taskState.note || '视频正在生成中，结果就绪后会展示在这里。'
      }
      applyVideoGenerationTaskToDisplay(assistantDisplay, nextTask, placeholderMode)
    }
  })

  return resolvedPayload || payload
}

async function runVideoGenerationRound({
  providerId = '',
  baseUrl,
  apiKey,
  model,
  signal,
  setCurrentAssistantDisplay,
  abortState = null,
  placeholderMode = 'text',
  requestOptionsOverride = null
}) {
  const targetSession = getRunSessionTarget(abortState)
  throwIfAborted(abortState)
  const lastUserApiMsg = (() => {
    for (let i = (targetSession.apiMessages || []).length - 1; i >= 0; i--) {
      if (targetSession.apiMessages[i]?.role === 'user') return targetSession.apiMessages[i]
    }
    return null
  })()

  const userPrompt = extractImageGenerationPromptFromContent(lastUserApiMsg?.content).trim()
  if (!userPrompt) {
    throw new Error('视频生成提示词为空')
  }

  const requestOptions =
    requestOptionsOverride && typeof requestOptionsOverride === 'object'
      ? buildVideoGenerationRequestOptionsWithReferences(requestOptionsOverride)
      : {}
  const requestInfo = placeholderMode === 'video' ? buildManualVideoGenerationRequestInfo(requestOptions) : ''
  const startedAt = Date.now()
  const assistantDisplay = createVideoGenerationPlaceholderDisplay(userPrompt, placeholderMode, { requestInfo })
  attachMediaRequestSnapshot(assistantDisplay, 'video', buildMediaRequestSnapshot('video', {
    baseUrl,
    model,
    prompt: userPrompt,
    requestOptions,
    placeholderMode,
    startedAt
  }))
  targetSession.messages.push(assistantDisplay)
  setCurrentAssistantDisplay(assistantDisplay)
  await maybeScrollToBottomForRun(abortState)

  const prompt = buildVideoGenerationPromptFromHistory(userPrompt, { apiMessages: targetSession.apiMessages })
  const { payload, requestMeta } = await requestVideoGeneration({
    baseUrl,
    apiKey,
    model,
    prompt,
    requestOptions,
    signal
  })
  attachMediaRequestSnapshot(assistantDisplay, 'video', { requestMeta })
  recordModelUsageFromPayload(payload, {
    providerId,
    model,
    endpoint: requestMeta?.kind || 'video-generation',
    purpose: 'video-generation'
  })
  throwIfAborted(abortState)

  let finalPayload = payload
  const videoTask = extractVideoGenerationTaskState(payload, requestMeta)
  if (videoTask) {
    applyVideoGenerationTaskToDisplay(assistantDisplay, { ...videoTask, startedAt }, placeholderMode)
    targetSession.apiMessages.push({
      role: 'assistant',
      content:
        placeholderMode === 'video'
          ? `视频任务已受理：${assistantVideoTaskStatusLabel(assistantDisplay)}${videoTask.id ? `（任务 ID：${videoTask.id}）` : ''}`
          : buildVideoGenerationPendingText(videoTask)
    })
    assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
    setCurrentAssistantDisplay(null)
    await maybeScrollToBottomForRun(abortState)
    startDetachedVideoTaskPolling({
      assistantDisplay,
      initialPayload: payload,
      requestMeta,
      apiKey,
      startedAt,
      placeholderMode,
      userPrompt,
      initialTask: videoTask,
      sessionRecord: targetSession,
      stateSnapshot: targetSession?.state || null
    })
    return
  }

  finalPayload = await resolveVideoGenerationContentIfReady({
    payload: finalPayload,
    requestMeta,
    apiKey,
    signal,
    abortState,
    assistantDisplay,
    startedAt,
    placeholderMode
  })
  throwIfAborted(abortState)

  const generationTimeMs = Math.max(0, Date.now() - startedAt)
  const videos = await persistChatMediaListAssets(
    extractChatVideosFromToolResult(finalPayload).map((video) => ({
      ...video,
      generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
    })),
    { kind: 'video', messageId: assistantDisplay.id }
  )
  const textResult = extractImageGenerationTextResult(finalPayload)
  if (!videos.length) {
    if (textResult) {
      applyVideoGenerationTextToDisplay(assistantDisplay, textResult)
      targetSession.apiMessages.push({
        role: 'assistant',
        content: textResult
      })
      assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
      setCurrentAssistantDisplay(null)
      await maybeScrollToBottomForRun(abortState)
      return
    }
    throw new Error(buildVideoGenerationCompatibilityError(finalPayload, requestMeta))
  }

  applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt })
  targetSession.apiMessages.push({
    role: 'assistant',
    content: buildVideoGenerationApiSummary({
      videoCount: videos.length
    })
  })
  assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
  setCurrentAssistantDisplay(null)
  await maybeScrollToBottomForRun(abortState)
}

async function runDetachedVideoGenerationRequest({
  record,
  assistantDisplay,
  baseUrl,
  apiKey,
  model,
  userPrompt,
  requestOptions,
  placeholderMode,
  startedAt,
  stateSnapshot
}) {
  if (!record || !assistantDisplay) return
  const requestHandle = new AbortController()
  const abortState = createRequestAbortStateForMediaResume(requestHandle)
  detachedMediaAbortStates.add(abortState)
  record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0)) + 1
  record.state = stateSnapshot && typeof stateSnapshot === 'object' ? deepCopyJson(stateSnapshot, {}) : record.state

  try {
    const { payload, requestMeta } = await requestVideoGeneration({
      baseUrl,
      apiKey,
      model,
      prompt: userPrompt,
      requestOptions,
      signal: requestHandle.signal
    })
    attachMediaRequestSnapshot(assistantDisplay, 'video', { requestMeta })
    if (abortState.aborted) throw createAbortError()

    const videoTask = extractVideoGenerationTaskState(payload, requestMeta)
    if (videoTask) {
      applyVideoGenerationTaskToDisplay(assistantDisplay, { ...videoTask, startedAt }, placeholderMode)
      setAssistantApiContentForDisplay(
        assistantDisplay,
        placeholderMode === 'video'
          ? `视频任务已受理：${assistantVideoTaskStatusLabel(assistantDisplay)}${videoTask.id ? `（任务 ID：${videoTask.id}）` : ''}`
          : buildVideoGenerationPendingText(videoTask),
        record
      )
      startDetachedVideoTaskPolling({
        assistantDisplay,
        initialPayload: payload,
        requestMeta,
        apiKey,
        startedAt,
        placeholderMode,
        userPrompt,
        initialTask: videoTask,
        sessionRecord: record,
        stateSnapshot
      })
      return
    }

    const finalPayload = await resolveVideoGenerationContentIfReady({
      payload,
      requestMeta,
      apiKey,
      signal: requestHandle.signal,
      abortState,
      assistantDisplay,
      startedAt,
      placeholderMode
    })
    if (abortState.aborted) throw createAbortError()

    const generationTimeMs = Math.max(0, Date.now() - startedAt)
    const videos = await persistChatMediaListAssets(
      extractChatVideosFromToolResult(finalPayload).map((video) => ({
        ...video,
        generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
      })),
      { kind: 'video', messageId: assistantDisplay.id }
    )
    if (!videos.length) {
      const textResult = extractImageGenerationTextResult(finalPayload)
      if (textResult) {
        applyVideoGenerationTextToDisplay(assistantDisplay, textResult)
        setAssistantApiContentForDisplay(assistantDisplay, textResult, record)
        return
      }
      throw new Error(buildVideoGenerationCompatibilityError(finalPayload, assistantDisplay?.mediaRequest?.requestMeta))
    }

    applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt })
    setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationApiSummary({ videoCount: videos.length }), record)
    message.success('视频生成完成')
  } catch (err) {
    if (abortState.aborted || isAbortError(err)) {
      assistantDisplay.videoTask = {
        ...(assistantDisplay.videoTask || {}),
        status: 'processing',
        stage: 'polling',
        startedAt,
        note: '已停止自动轮询，稍后可继续轮询。'
      }
      applyVideoGenerationTaskToDisplay(assistantDisplay, assistantDisplay.videoTask, placeholderMode)
      setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationPendingText(assistantDisplay.videoTask), record)
    } else {
      const errorText = err?.message || String(err)
      applyMediaGenerationFailureToDisplay(assistantDisplay, errorText)
      message.error(assistantDisplay.mediaFailure?.summary || mediaFailureSummary(errorText, 'video') || '视频生成失败')
    }
  } finally {
    detachedMediaAbortStates.delete(abortState)
    record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0) - 1)
    record.updatedAt = Date.now()
    void autoPersistMemorySessionWhenIdle(record)
    if (isDisplayMessageInActiveSession(assistantDisplay)) await scrollToBottom()
  }
}

async function startDetachedVideoGeneration({ cfg, text, attachments = [], userDisplay, sourceMessage = null }) {
  const record = getActiveMemorySession()
  const stateSnapshot = buildCurrentChatState()
  record.state = deepCopyJson(stateSnapshot, {})
  const referenceImages = await collectAttachmentMediaReferenceImages(attachments, userDisplay)
  clearAttachmentFileReferences(attachments)

  const promptText = String(text || '').trim()
  const userPrompt = extractImageGenerationPromptFromContent(promptText).trim()
  if (!userPrompt) {
    message.warning('视频生成提示词为空')
    return false
  }

  const apiContent = promptText || userPrompt
  record.apiMessages.push({ role: 'user', content: apiContent })
  userDisplay.apiIndex = record.apiMessages.length - 1

  const placeholderMode = String(cfg.videoGenerationPlaceholderMode || getMediaRequestPlaceholderMode(sourceMessage, 'video') || 'video')
  const rawVideoRequestOptions = mergeReferenceImagesIntoRequestOptions(
    cfg.videoGenerationRequestOptionsOverride && typeof cfg.videoGenerationRequestOptionsOverride === 'object'
      ? cfg.videoGenerationRequestOptionsOverride
      : {},
    referenceImages,
    'video'
  )
  const requestOptions = buildVideoGenerationRequestOptionsWithReferences(rawVideoRequestOptions)
  const requestInfo = placeholderMode === 'video' ? buildManualVideoGenerationRequestInfo(requestOptions) : ''
  const startedAt = Date.now()
  const assistantDisplay = createVideoGenerationPlaceholderDisplay(userPrompt, placeholderMode, { requestInfo })
  attachMediaRequestSnapshot(assistantDisplay, 'video', buildMediaRequestSnapshot('video', {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    prompt: userPrompt,
    requestOptions,
    placeholderMode,
    startedAt
  }))
  record.messages.push(assistantDisplay)
  record.updatedAt = Date.now()
  if (!isFinalizedMemorySessionTitle(record)) record.title = resolveMemorySessionTitle(record)
  scheduleRefreshUserAnchorMeta()
  if (isMemorySessionActive(record)) await scrollToBottom({ force: true })
  void runDetachedVideoGenerationRequest({
    record,
    assistantDisplay,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    userPrompt,
    requestOptions,
    placeholderMode,
    startedAt,
    stateSnapshot
  })
  return true
}

function getMediaRequestPrompt(msg, kind = 'image') {
  const direct = kind === 'video' ? msg?.videoPrompt : msg?.imagePrompt
  return String(direct || msg?.mediaRequest?.prompt || '').trim()
}

function getMediaRequestPlaceholderMode(msg, kind = 'image') {
  const mode = String(msg?.mediaRequest?.placeholderMode || '').trim()
  if (mode) return mode
  return kind === 'video' ? 'video' : 'image'
}

function getImageRequestOptionsFromMessage(msg) {
  if (msg?.mediaRequest?.requestOptions && typeof msg.mediaRequest.requestOptions === 'object') {
    return buildImageGenerationRequestOptionsWithReferences(deepCopyJson(msg.mediaRequest.requestOptions, {}))
  }
  const firstImage = Array.isArray(msg?.images) ? msg.images.find((img) => img && typeof img === 'object') : null
  const requestSize = String(firstImage?.requestSize || '').trim()
  return requestSize ? { size: requestSize } : {}
}

function getVideoRequestOptionsFromMessage(msg) {
  if (msg?.mediaRequest?.requestOptions && typeof msg.mediaRequest.requestOptions === 'object') {
    return buildVideoGenerationRequestOptionsWithReferences(deepCopyJson(msg.mediaRequest.requestOptions, {}))
  }
  const firstVideo = Array.isArray(msg?.videos) ? msg.videos.find((video) => video && typeof video === 'object') : null
  const requestSize = String(firstVideo?.requestSize || firstVideo?.resolution || '').trim()
  return requestSize ? { size: requestSize } : {}
}

function canRegenerateMedia(msg, kind = 'image') {
  if (sending.value || preparingSend.value) return false
  return !!getMediaRequestPrompt(msg, kind)
}

function mediaTaskResumeKey(msg, kind = 'video') {
  const task = kind === 'video' ? msg?.videoTask : msg?.imageTask
  return `${kind}:${String(msg?.id || '').trim()}:${String(task?.id || '').trim()}`
}

function isMediaTaskResuming(msg, kind = 'video') {
  const key = mediaTaskResumeKey(msg, kind)
  return !!key && resumingMediaTaskKeys.value.includes(key)
}

function setMediaTaskResuming(msg, kind = 'video', next = false) {
  const key = mediaTaskResumeKey(msg, kind)
  if (!key) return
  const current = new Set(resumingMediaTaskKeys.value)
  if (next) current.add(key)
  else current.delete(key)
  resumingMediaTaskKeys.value = Array.from(current)
}

function getVideoResumeRequestMeta(msg) {
  const meta = msg?.mediaRequest?.requestMeta
  if (meta && typeof meta === 'object' && String(meta.baseEndpoint || '').trim()) return meta
  return null
}

function canResumeMediaTask(msg, kind = 'video') {
  if (kind !== 'video' || preparingSend.value || isMediaTaskResuming(msg, kind)) return false
  if (assistantVisibleVideoCount(msg)) return false
  const task = msg?.videoTask
  const taskId = String(task?.id || '').trim()
  if (!taskId) return false
  const status = String(task?.status || task?.stage || '').trim().toLowerCase()
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return false
  return !!getVideoResumeRequestMeta(msg)
}

function countResumableMediaTasks() {
  return (session.messages || []).filter((msg) => canResumeMediaTask(msg, 'video')).length
}

function findOpenaiCompatibleProviderByBaseUrl(baseUrl) {
  const target = getCompatKey(baseUrl)
  if (!target) return null
  return (providers.value || []).find((provider) => {
    if (!provider || isUtoolsBuiltinProvider(provider)) return false
    return getCompatKey(provider.baseurl) === target
  }) || null
}

function getOpenaiCompatibleMediaConfigOrHint(kind = 'image', sourceMessage = null, options = {}) {
  const savedBaseUrl = String(sourceMessage?.mediaRequest?.baseUrl || '').trim()
  const savedProvider = savedBaseUrl ? findOpenaiCompatibleProviderByBaseUrl(savedBaseUrl) : null
  if (savedBaseUrl && !savedProvider && options.requireSavedProvider) {
    message.warning('当前配置中找不到该任务的原服务商，请切回或重新配置相同接口地址后再继续轮询。')
    return null
  }
  if (savedBaseUrl && !savedProvider && !options.silentFallback) {
    message.warning('未找到原服务商配置，已改用当前服务商再次生成。')
  }

  const provider = savedProvider || selectedProvider.value
  if (!provider) {
    message.warning('请先选择服务商 / 模型')
    showModelModal.value = true
    return null
  }

  if (isUtoolsBuiltinProvider(provider)) {
    message.warning('当前页面不支持用 uTools 内置 AI 直接恢复或再次生成媒体，请改用兼容 OpenAI 的服务商。')
    return null
  }

  const baseUrl = String(provider.baseurl || '').trim()
  const apiKey = String(provider.apikey || '').trim()
  const providerDefaultModel = Array.isArray(provider.selectModels) ? String(provider.selectModels[0] || '').trim() : ''
  const selectedModelForProvider = String(provider._id || '').trim() === String(selectedProviderId.value || '').trim()
    ? String(selectedModel.value || '').trim()
    : ''
  const model = String(
    savedProvider
      ? sourceMessage?.mediaRequest?.model || selectedModelForProvider || providerDefaultModel
      : selectedModel.value
  ).trim()
  if (!baseUrl || !apiKey) {
    message.warning('请先配置服务商接口地址 / API 密钥')
    return null
  }
  if (!model) {
    message.warning('请先选择模型')
    showModelModal.value = true
    return null
  }

  return {
    providerKind: 'openai-compatible',
    providerId: String(provider._id || '').trim(),
    baseUrl,
    apiKey,
    model,
    requestMode: kind === 'video' ? 'video-generation' : 'image-generation',
    imageGenerationPlaceholderMode: kind === 'image' ? 'image' : 'text',
    videoGenerationPlaceholderMode: kind === 'video' ? 'video' : 'text',
    supportsVision: false
  }
}

async function submitMediaGenerationPrompt(kind, prompt, sourceMessage = null) {
  if (sending.value || preparingSend.value) return
  const text = String(prompt || '').trim()
  if (!text) {
    message.warning(kind === 'video' ? '视频生成提示词为空' : '图片生成提示词为空')
    return
  }

  const cfg = getOpenaiCompatibleMediaConfigOrHint(kind, sourceMessage)
  if (!cfg) return

  clearAllUserEditingState()
  const placeholderMode = getMediaRequestPlaceholderMode(sourceMessage, kind)
  if (kind === 'video') {
    cfg.videoGenerationPlaceholderMode = placeholderMode
    cfg.videoGenerationRequestOptionsOverride = getVideoRequestOptionsFromMessage(sourceMessage)
  } else {
    cfg.imageGenerationPlaceholderMode = placeholderMode
    cfg.imageGenerationRequestOptionsOverride = getImageRequestOptionsFromMessage(sourceMessage)
  }

  const userDisplay = createDisplayMessage('user', text)
  session.messages.push(userDisplay)
  const requestRecord = getActiveMemorySession()
  autoScrollEnabled.value = true
  scheduleRefreshUserAnchorMeta()
  await scrollToBottom({ force: true })
  if (kind === 'video') {
    await startDetachedVideoGeneration({ cfg, text, attachments: [], userDisplay, sourceMessage })
    return
  }
  await runChatSession({
    ...cfg,
    sessionRecord: requestRecord,
    prepare: async () => {
      if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
      await prepareUserApiMessage({
        text,
        attachments: [],
        userDisplay,
        preferVision: false,
        providerKind: 'openai-compatible',
        sessionTarget: requestRecord
      })
    }
  })
}

function regenerateMedia(msg, kind = 'image') {
  const prompt = getMediaRequestPrompt(msg, kind)
  if (!prompt) {
    message.warning(kind === 'video' ? '没有可复用的视频提示词' : '没有可复用的图片提示词')
    return
  }
  showMediaLibraryModal.value = false
  void submitMediaGenerationPrompt(kind, prompt, msg)
}

function setAssistantApiContentForDisplay(msg, content, sessionLike = null) {
  if (!msg) return
  const targetSession = sessionLike || getMemorySessionForMessage(msg) || session
  const text = String(content || '').trim()
  const apiIndex = Number(msg.apiIndex)
  if (Number.isFinite(apiIndex) && apiIndex >= 0 && targetSession.apiMessages?.[apiIndex]?.role === 'assistant') {
    targetSession.apiMessages[apiIndex].content = text
    return
  }
  targetSession.apiMessages.push({ role: 'assistant', content: text })
  msg.apiIndex = targetSession.apiMessages.length - 1
}

function extractMediaFailureReasonLine(errorText) {
  const raw = String(errorText || '').trim()
  if (!raw) return ''
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const reasonLine = lines.find((line) => /^原因[：:]/.test(line))
  if (reasonLine) return reasonLine

  const messageLine = lines.find((line) => /^(错误信息|错误消息|Error message|Message)[：:]/i.test(line))
  const codeLine = lines.find((line) => /^(错误码|错误代码|Error code|Code)[：:]/i.test(line))
  if (messageLine && codeLine) return `${codeLine}，${messageLine}`
  if (messageLine) return messageLine
  if (codeLine) return codeLine

  const diagnosticLine = lines.find((line) =>
    /moderation_blocked|moderation system|content safety|blocked by|rate limit|insufficient_quota|quota|unauthorized|forbidden|invalid|unsupported|not found|timeout|审核|拦截|限流|额度|余额|权限|不支持|不存在|超时/i.test(line)
  )
  return diagnosticLine || lines[0] || raw
}

function mediaFailureSummary(errorText, kind = 'image') {
  const reason = extractMediaFailureReasonLine(errorText) || '未知错误'
  const label = kind === 'video' ? '视频生成失败' : '图片生成失败'
  return `${label}：${truncateInlineText(reason, 260)}`
}

function mediaFailureSuggestion(errorText, kind = 'image') {
  const raw = String(errorText || '').trim()
  const lower = raw.toLowerCase()
  if (lower.includes('moderation_blocked') || lower.includes('moderation system') || lower.includes('content safety') || raw.includes('内容安全审核') || raw.includes('审核系统') || raw.includes('拦截')) {
    return kind === 'video'
      ? '请求被内容安全审核拦截，服务端不会返回可展示的视频文件。可以调整提示词或参考图后重试。'
      : '请求被内容安全审核拦截，服务端不会返回可展示的图片文件。可以调整提示词或参考图后重试。'
  }
  if (lower.includes('timeout') || raw.includes('超时')) return '请求已超时，没有自动回退。可以稍后重试，或检查服务商任务是否仍在后台生成。'
  if (lower.includes('429') || lower.includes('rate limit') || raw.includes('限流') || raw.includes('请求过多')) return '请求被服务商限流。可以稍后重试，或降低并发生成数量。'
  if (lower.includes('insufficient_quota') || lower.includes('quota') || raw.includes('额度') || raw.includes('余额')) return '请检查当前服务商账户额度、计费状态和模型权限。'
  if (lower.includes('401') || lower.includes('403') || raw.includes('密钥')) return '请检查当前服务商 API Key、模型权限和账户额度。'
  if (kind === 'image' && lower.includes('tool choice') && lower.includes('image_generation') && lower.includes('tools')) {
    return '当前服务商不兼容 Responses API 的图片生成工具调用，通常是中转站没有透传 tools 或不支持内置 image_generation 工具。建议切换到官方接口，或确认该服务商支持 /v1/images 与 /v1/responses 图片生成。'
  }
  if (lower.includes('404') || lower.includes('405') || raw.includes('接口不存在')) return kind === 'video'
    ? '当前服务商的视频接口可能不兼容，可以切换模型/服务商或改用普通聊天。'
    : '当前服务商的图片接口可能不兼容，可以切换模型/服务商或改用普通聊天。'
  return '可以直接重试；如果连续失败，建议切换模型/服务商或复制错误信息排查。'
}

function applyMediaGenerationFailureToDisplay(assistantDisplay, errorText) {
  if (!assistantDisplay || typeof assistantDisplay !== 'object') return false
  const kind = String(assistantDisplay.mediaRequest?.kind || (assistantDisplay.videoPrompt ? 'video' : assistantDisplay.imagePrompt ? 'image' : '')).trim()
  if (kind !== 'image' && kind !== 'video') return false

  const summary = mediaFailureSummary(errorText, kind)
  const suggestion = mediaFailureSuggestion(errorText, kind)
  const note = `${summary}\n${suggestion}`
  assistantDisplay.streaming = false
  assistantDisplay.render = 'text'
  assistantDisplay.transientRequestPlaceholder = false
  assistantDisplay.mediaFailure = {
    kind,
    summary,
    errorText: String(errorText || '').trim(),
    suggestion
  }

  const startedAt = Number(assistantDisplay.mediaRequest?.startedAt || 0) || Date.now()
  if (kind === 'video') {
    assistantDisplay.videoTask = {
      ...(assistantDisplay.videoTask || {}),
      status: 'failed',
      stage: 'failed',
      note,
      startedAt
    }
    if (getMediaRequestPlaceholderMode(assistantDisplay, kind) === 'video') {
      assistantDisplay.content = ''
      assistantDisplay.videoBubblePlaceholder = true
      assistantDisplay.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder(note, assistantDisplay.videoRequestInfo || '')
    } else {
      assistantDisplay.videoBubblePlaceholder = false
      assistantDisplay.videoBubblePlaceholderItem = null
      assistantDisplay.content = ''
    }
  } else {
    assistantDisplay.imageTask = {
      ...(assistantDisplay.imageTask || {}),
      status: 'failed',
      stage: 'failed',
      note,
      startedAt
    }
    if (getMediaRequestPlaceholderMode(assistantDisplay, kind) === 'image') {
      assistantDisplay.content = ''
      assistantDisplay.imageBubblePlaceholder = true
      assistantDisplay.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder(note, assistantDisplay.imageRequestInfo || '')
    } else {
      assistantDisplay.imageBubblePlaceholder = false
      assistantDisplay.imageBubblePlaceholderImage = null
      assistantDisplay.content = ''
    }
  }

  setAssistantApiContentForDisplay(assistantDisplay, note)
  return true
}

function createRequestAbortStateForMediaResume(requestHandle) {
  const abortListeners = new Set()
  const abortState = {
    aborted: false,
    onAbort(listener) {
      if (typeof listener !== 'function') return () => {}
      if (abortState.aborted) {
        try {
          listener()
        } catch {
          // ignore
        }
        return () => {}
      }
      abortListeners.add(listener)
      return () => abortListeners.delete(listener)
    },
    abort() {
      if (abortState.aborted) return
      abortState.aborted = true
      abortListeners.forEach((listener) => {
        try {
          listener()
        } catch {
          // ignore
        }
      })
      abortListeners.clear()
      try {
        requestHandle?.abort?.()
      } catch {
        // ignore
      }
    }
  }
  return abortState
}

async function resumeMediaTask(msg, kind = 'video') {
  if (kind !== 'video') return
  if (preparingSend.value) return
  if (!canResumeMediaTask(msg, kind)) {
    message.warning('当前视频任务缺少可恢复的轮询信息')
    return
  }

  const cfg = getOpenaiCompatibleMediaConfigOrHint(kind, msg, { requireSavedProvider: true })
  if (!cfg) return

  const requestMeta = getVideoResumeRequestMeta(msg)
  const task = msg.videoTask || {}
  const taskId = String(task.id || '').trim()
  const requestHandle = new AbortController()
  const abortState = createRequestAbortStateForMediaResume(requestHandle)
  const startedAt = Number(task.startedAt || msg.mediaRequest?.startedAt || 0) || Date.now()
  const placeholderMode = getMediaRequestPlaceholderMode(msg, kind)
  const record = getMemorySessionForMessage(msg)

  setMediaTaskResuming(msg, kind, true)
  detachedMediaAbortStates.add(abortState)
  record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0)) + 1

  try {
    msg.videoTask = {
      ...task,
      id: taskId,
      status: String(task.status || 'processing').trim() || 'processing',
      stage: 'polling',
      startedAt,
      note: task.note || '正在继续查询视频任务，结果就绪后会展示在这里。'
    }
    applyVideoGenerationTaskToDisplay(msg, msg.videoTask, placeholderMode)
    if (isDisplayMessageInActiveSession(msg)) await scrollToBottom()

    const resolvedPayload = await waitForVideoGenerationResult({
      initialPayload: { id: taskId, status: msg.videoTask.status || 'processing' },
      requestMeta,
      apiKey: cfg.apiKey,
      signal: requestHandle.signal,
      abortState,
      timeoutMs: VIDEO_GENERATION_RESULT_TIMEOUT_MS,
      initialPollDelayMs: 0,
      onStatus: (_payload, taskState) => {
        if (!taskState) return
        msg.videoTask = {
          ...(msg.videoTask || {}),
          ...taskState,
          id: taskState.id || taskId,
          startedAt,
          lastPolledAt: Date.now()
        }
        applyVideoGenerationTaskToDisplay(msg, msg.videoTask, placeholderMode)
      }
    })

    if (!resolvedPayload) {
      msg.videoTask = {
        ...(msg.videoTask || {}),
        id: taskId,
        status: 'processing',
        stage: 'polling',
        startedAt,
        note: '视频任务仍在生成中，稍后可继续轮询。'
      }
      applyVideoGenerationTaskToDisplay(msg, msg.videoTask, placeholderMode)
      setAssistantApiContentForDisplay(msg, buildVideoGenerationPendingText(msg.videoTask))
      message.info('视频任务仍在生成中，稍后可继续轮询。')
      return
    }

    const generationTimeMs = Math.max(0, Date.now() - startedAt)
    const videos = await persistChatMediaListAssets(
      extractChatVideosFromToolResult(resolvedPayload).map((video) => ({
        ...video,
        generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
      })),
      { kind: 'video', messageId: msg.id }
    )
    if (!videos.length) {
      const textResult = extractImageGenerationTextResult(resolvedPayload)
      if (textResult) {
        applyVideoGenerationTextToDisplay(msg, textResult)
        setAssistantApiContentForDisplay(msg, textResult)
        return
      }
      throw new Error(buildVideoGenerationCompatibilityError(resolvedPayload, requestMeta))
    }

    applyVideoGenerationVideosToDisplay(msg, {
      videos,
      userPrompt: getMediaRequestPrompt(msg, 'video')
    })
    setAssistantApiContentForDisplay(msg, buildVideoGenerationApiSummary({ videoCount: videos.length }))
    message.success('视频结果已恢复')
  } catch (err) {
    if (abortState.aborted || isAbortError(err)) {
      message.info('已停止继续轮询视频任务')
    } else {
      const errorText = err?.message || String(err)
      applyMediaGenerationFailureToDisplay(msg, errorText)
      message.error(msg.mediaFailure?.summary || mediaFailureSummary(errorText, 'video') || '继续轮询失败')
    }
  } finally {
    detachedMediaAbortStates.delete(abortState)
    record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0) - 1)
    setMediaTaskResuming(msg, kind, false)
    void autoPersistMemorySessionWhenIdle(record)
    if (isDisplayMessageInActiveSession(msg)) await scrollToBottom()
  }
}

const CHAT_REQUEST_TIMEOUT_MS = 36000000

async function runChatSession({
  providerId = '',
  providerKind = 'openai-compatible',
  apiMode = 'auto',
  requestMode = 'chat',
  imageGenerationPlaceholderMode = 'text',
  videoGenerationPlaceholderMode = 'text',
  supportsVision = false,
  baseUrl,
  apiKey,
  model,
  imageGenerationRequestOptionsOverride = null,
  videoGenerationRequestOptionsOverride = null,
  sessionRecord = null,
  memorySystemContent = '',
  memorySourceUserText = '',
  prepare
}) {
  if (sending.value) return false

  sending.value = true
  const runRecord = sessionRecord || getActiveMemorySession()
  runRecord.runningTaskCount = Math.max(0, Number(runRecord.runningTaskCount || 0)) + 1
  runRecord.chatRunCount = Math.max(0, Number(runRecord.chatRunCount || 0)) + 1
  runRecord.state = buildCurrentChatState()
  if (!isFinalizedMemorySessionTitle(runRecord)) runRecord.title = resolveMemorySessionTitle(runRecord)
  let requestHandle = null
  const abortListeners = new Set()
  const requestAbortState = {
    aborted: false,
    memorySystemContent,
    toolApprovalMode: normalizeToolApprovalMode(
      runRecord?.toolApprovalMode,
      runRecord?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
    ),
    autoApproveTools: normalizeToolApprovalMode(
      runRecord?.toolApprovalMode,
      runRecord?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
    ) !== TOOL_APPROVAL_MODE_MANUAL,
    onAbort(listener) {
      if (typeof listener !== 'function') return () => {}
      if (requestAbortState.aborted) {
        try {
          listener()
        } catch {
          // ignore
        }
        return () => {}
      }
      abortListeners.add(listener)
      return () => {
        abortListeners.delete(listener)
      }
    },
    abort() {
      if (requestAbortState.aborted) return
      requestAbortState.aborted = true
      abortListeners.forEach((listener) => {
        try {
          listener()
        } catch {
          // ignore
        }
      })
      abortListeners.clear()
      try {
        requestHandle?.abort?.()
      } catch {
        // ignore
      }
    }
  }
  runRecordByAbortState.set(requestAbortState, runRecord)
  runRecord.activeRequestAbortState = requestAbortState
  abortController.value = requestAbortState
  let timedOut = false
  const requestTimeoutTimer = window.setTimeout(() => {
    timedOut = true
    requestAbortState.abort()
  }, CHAT_REQUEST_TIMEOUT_MS)

  let currentAssistantDisplay = null
  let succeeded = false

  try {
    if (typeof prepare === 'function') await prepare()

    if (providerKind === 'utools-ai') {
      await runUtoolsAiChatRound({
        providerId,
        model,
        setCurrentAssistantDisplay: (m) => {
          currentAssistantDisplay = m
        },
        setAbortHandle: (handle) => {
          requestHandle = handle
        },
        isAborted: () => requestAbortState.aborted,
        abortState: requestAbortState
      })
    } else {
      requestHandle = new AbortController()
      if (requestAbortState.aborted) requestHandle.abort()
      if (requestMode === 'image-generation') {
        try {
          await runImageGenerationRound({
            providerId,
            baseUrl,
            apiKey,
            model,
            signal: requestHandle.signal,
            placeholderMode: imageGenerationPlaceholderMode,
            requestOptionsOverride: imageGenerationRequestOptionsOverride,
            setCurrentAssistantDisplay: (m) => {
              currentAssistantDisplay = m
            },
            abortState: requestAbortState
          })
        } catch (err) {
          const allowTextFallback = imageGenerationPlaceholderMode !== 'image'
          if (!allowTextFallback || !shouldFallbackMediaRequestToChat(err, 'image')) throw err
          removeRunDisplayMessageById(requestAbortState, currentAssistantDisplay?.id)
          currentAssistantDisplay = null
          requestHandle = new AbortController()
          if (requestAbortState.aborted) requestHandle.abort()
          message.warning('图片生成接口不兼容当前返回，已自动回退为文本聊天。')
          await runChatRounds({
            providerId,
            baseUrl,
            apiKey,
            apiMode,
            model,
            signal: requestHandle.signal,
            assistantPlaceholderMode: imageGenerationPlaceholderMode,
            supportsVision,
            memorySystemContent,
            setCurrentAssistantDisplay: (m) => {
              currentAssistantDisplay = m
            },
            abortState: requestAbortState
          })
        }
      } else if (requestMode === 'video-generation') {
        try {
          await runVideoGenerationRound({
            providerId,
            baseUrl,
            apiKey,
            model,
            signal: requestHandle.signal,
            placeholderMode: videoGenerationPlaceholderMode,
            requestOptionsOverride: videoGenerationRequestOptionsOverride,
            setCurrentAssistantDisplay: (m) => {
              currentAssistantDisplay = m
            },
            abortState: requestAbortState
          })
        } catch (err) {
          const allowTextFallback = videoGenerationPlaceholderMode !== 'video'
          if (!allowTextFallback || !shouldFallbackMediaRequestToChat(err, 'video')) throw err
          removeRunDisplayMessageById(requestAbortState, currentAssistantDisplay?.id)
          currentAssistantDisplay = null
          requestHandle = new AbortController()
          if (requestAbortState.aborted) requestHandle.abort()
          message.warning('视频生成接口不兼容当前返回，已自动回退为文本聊天。')
          await runChatRounds({
            providerId,
            baseUrl,
            apiKey,
            apiMode,
            model,
            signal: requestHandle.signal,
            assistantPlaceholderMode: videoGenerationPlaceholderMode,
            supportsVision,
            memorySystemContent,
            setCurrentAssistantDisplay: (m) => {
              currentAssistantDisplay = m
            },
            abortState: requestAbortState
          })
        }
      } else {
        await runChatRounds({
          providerId,
          baseUrl,
          apiKey,
          apiMode,
          model,
          signal: requestHandle.signal,
          supportsVision,
          memorySystemContent,
          setCurrentAssistantDisplay: (m) => {
            currentAssistantDisplay = m
          },
          abortState: requestAbortState
        })
      }
    }
    succeeded = true
  } catch (err) {
    if (requestAbortState.aborted || isAbortError(err)) {
      const stopText = timedOut ? `（请求在 ${CHAT_REQUEST_TIMEOUT_MS}ms 后超时并已停止）` : '（已停止）'
      if (currentAssistantDisplay) {
        flushDeferredMessageFieldsForMessage(currentAssistantDisplay.id)
        currentAssistantDisplay.streaming = false
        currentAssistantDisplay.content = currentAssistantDisplay.content || stopText
      } else {
          getRunSessionTarget(requestAbortState).messages.push(createDisplayMessage('assistant', stopText))
      }
    } else {
      const errorText = err?.message || String(err)
      const mediaFailureApplied = applyMediaGenerationFailureToDisplay(currentAssistantDisplay, errorText)
      if (mediaFailureApplied) {
        // 媒体生成错误保留在任务卡片中，便于重试和查看建议。
      } else if (currentAssistantDisplay) {
        flushDeferredMessageFieldsForMessage(currentAssistantDisplay.id)
        currentAssistantDisplay.streaming = false
        const shouldRemovePlaceholder =
          currentAssistantDisplay.transientRequestPlaceholder ||
          (!String(currentAssistantDisplay.content || '').trim() &&
            !String(currentAssistantDisplay.thinking || '').trim() &&
            !(Array.isArray(currentAssistantDisplay.images) && currentAssistantDisplay.images.length) &&
            !(Array.isArray(currentAssistantDisplay.videos) && currentAssistantDisplay.videos.length) &&
            !currentAssistantDisplay.imageTask &&
            !currentAssistantDisplay.videoTask)
        if (shouldRemovePlaceholder) {
          const targetSession = getRunSessionTarget(requestAbortState)
          const idx = targetSession.messages.findIndex((m) => m.id === currentAssistantDisplay.id)
          if (idx !== -1) targetSession.messages.splice(idx, 1)
        }
      }
      message.error(mediaFailureApplied ? (currentAssistantDisplay?.mediaFailure?.summary || '媒体生成失败') : (errorText || '请求失败'))
      await maybeScrollToBottomForRun(requestAbortState)
    }
  } finally {
    window.clearTimeout(requestTimeoutTimer)
    runRecord.runningTaskCount = Math.max(0, Number(runRecord.runningTaskCount || 0) - 1)
    runRecord.chatRunCount = Math.max(0, Number(runRecord.chatRunCount || 0) - 1)
    if (runRecord.activeRequestAbortState === requestAbortState) {
      runRecord.activeRequestAbortState = null
    }
    currentAssistantDisplay = null
    if (isMemorySessionActive(runRecord)) {
      syncActiveRequestUiState(runRecord)
    } else if (abortController.value === requestAbortState) {
      sending.value = false
      abortController.value = null
    }
    if (isMemorySessionActive(runRecord)) {
      const record = saveActiveMemorySessionDraft()
      void autoPersistMemorySessionWhenIdle(record)
    } else {
      runRecord.updatedAt = Date.now()
      if (!isFinalizedMemorySessionTitle(runRecord)) runRecord.title = resolveMemorySessionTitle(runRecord)
      void autoPersistMemorySessionWhenIdle(runRecord)
    }
    const memoryConfig = chatConfig.value?.memory
    const memoryEnabled = isChatMemoryEnabled(memoryConfig)
    if (memoryEnabled && memoryConfig?.autoExtract !== false && !requestAbortState.aborted && requestMode === 'chat') {
      const assistantApiMessages = Array.isArray(runRecord.apiMessages) ? runRecord.apiMessages : []
      const latestAssistant = [...assistantApiMessages].reverse().find((msg) => msg?.role === 'assistant' && String(msg?.content || '').trim())
      const userText = String(memorySourceUserText || '').trim()
      const assistantText = String(latestAssistant?.content || '').trim()
      if (userText && assistantText) {
        queueMemoryCandidateForRecord(runRecord, {
          userText,
          assistantText,
          systemPrompt: buildCombinedSystemContent('', { sessionRecord: runRecord }),
          summary: userText.slice(0, 140)
        })
      }
    }
    await maybeScrollToBottomForRun(requestAbortState)
    runRecordByAbortState.delete(requestAbortState)
    scheduleQueuedInputDrain(runRecord)
  }

  return succeeded
}

async function stageChatAttachmentsInSandbox(attachments, sessionTarget = null) {
  const list = Array.isArray(attachments) ? attachments : []
  const sandboxWorkspaceId = buildChatSandboxWorkspaceId(
    sessionTarget?.id || activeMemorySessionId.value || 'default'
  )
  const unstagedAttachments = list.filter((attachment) =>
    attachment?.file &&
    typeof attachment.file.arrayBuffer === 'function' &&
    !String(attachment?.sandboxPath || '').trim()
  )
  if (!unstagedAttachments.length) return sandboxWorkspaceId

  let imported
  try {
    imported = await importFilesToSandbox(
      sandboxWorkspaceId,
      await Promise.all(unstagedAttachments.map(async (attachment) => ({
        name: attachment.name || attachment.file?.name || 'attachment',
        data: new Uint8Array(await attachment.file.arrayBuffer())
      })))
    )
  } catch (error) {
    throw new Error(`附件写入聊天沙盒失败：${error?.message || String(error)}`)
  }

  const entries = Array.isArray(imported?.imported) ? imported.imported : []
  if (entries.length !== unstagedAttachments.length || entries.some((entry) => !String(entry?.path || '').trim())) {
    throw new Error('附件写入聊天沙盒不完整，请重试')
  }

  unstagedAttachments.forEach((attachment, index) => {
    const entry = entries[index]
    attachment.sandboxWorkspaceId = imported.workspaceId || sandboxWorkspaceId
    attachment.sandboxPath = entry.path
    attachment.sandboxDataPath = entry.dataPath || ''
  })
  // File objects are not serializable. Release them only after every import is verified.
  unstagedAttachments.forEach((attachment) => {
    attachment.file = null
  })
  return imported.workspaceId || sandboxWorkspaceId
}

async function ensureAttachmentSandboxSkillAvailable(attachments = []) {
  if (!(Array.isArray(attachments) && attachments.some((item) => String(item?.sandboxPath || '').trim()))) return false
  const skill = (skills.value || []).find((item) => String(item?._id || '').trim() === BUILTIN_SHELL_SKILL_ID)
  if (!skill) return false

  if (!normalizeStringList(selectedSkillIds.value).includes(BUILTIN_SHELL_SKILL_ID)) {
    selectedSkillIds.value = normalizeStringList([...selectedSkillIds.value, BUILTIN_SHELL_SKILL_ID])
    routerAddedSelectedSkillIds.add(BUILTIN_SHELL_SKILL_ID)
  }
  if (!normalizeStringList(agentSkillIds.value).includes(BUILTIN_SHELL_SKILL_ID)) {
    agentSkillIds.value = normalizeStringList([...agentSkillIds.value, BUILTIN_SHELL_SKILL_ID])
    routerAddedAgentSkillIds.add(BUILTIN_SHELL_SKILL_ID)
  }
  if (!normalizeStringList(activatedAgentSkillIds.value).includes(BUILTIN_SHELL_SKILL_ID)) {
    activatedAgentSkillIds.value = normalizeStringList([...activatedAgentSkillIds.value, BUILTIN_SHELL_SKILL_ID])
    routerActivatedAgentSkillIds.add(BUILTIN_SHELL_SKILL_ID)
  }
  if (isDirectorySkill(skill)) await loadSkillMainContent(BUILTIN_SHELL_SKILL_ID)
  return true
}

async function prepareUserApiMessage({
  text,
  attachments,
  userDisplay,
  preferVision = true,
  providerKind = 'openai-compatible',
  sessionTarget = null,
  imageAttachmentMode = 'chat'
}) {
  const targetSession = sessionTarget || session
  const list = Array.isArray(attachments) ? attachments : []
  const imageAttachmentsAsMediaReferences = imageAttachmentMode === 'media-reference'
  if (list.length) {
    await Promise.all(list.map((a) => ensureAttachmentParsed(a)))
  }

  await stageChatAttachmentsInSandbox(list, targetSession)
  await ensureAttachmentSandboxSkillAvailable(list)

  const attachmentContextBlocksForVision = []
  const attachmentContextBlocksTextOnly = []
  const imageAttachments = []

  for (const a of list) {
    const referenceBlock = buildChatAttachmentReferenceBlock(a, {
      sessionId: targetSession?.id || activeMemorySessionId.value || 'default'
    })
    if (a.status === 'ready' && a.kind === 'image' && a.dataUrl) {
      imageAttachments.push(a)
      if (!imageAttachmentsAsMediaReferences) {
        attachmentContextBlocksForVision.push(`${referenceBlock}\nThe image is also attached to this request for visual input.`)
        attachmentContextBlocksTextOnly.push(`${referenceBlock}\nThe current provider receives only this file reference, not image pixels.`)
      }
      continue
    }
    if (a.status === 'ready') {
      const fallbackPreview = a?.sandboxPath
        ? ''
        : truncateText(String(a.text || '').trim(), 8000, '（附件预览已截断）')
      const block = [referenceBlock, fallbackPreview].filter(Boolean).join('\n')
      attachmentContextBlocksForVision.push(block)
      attachmentContextBlocksTextOnly.push(block)
      continue
    }
    if (a.status === 'error') {
      const block = `${referenceBlock}\nLocal preview parsing failed: ${a.error || 'unknown error'}. Read the sandbox file directly.`
      attachmentContextBlocksForVision.push(block)
      attachmentContextBlocksTextOnly.push(block)
    }
  }

  try {
    userDisplay.images = imageAttachments.map((a) => ({
      id: newId(),
      src: a.dataUrl,
      name: a.name || 'image',
      mime: a.mime || '',
      size: Number(a.size || 0),
      width: Number(a.width || 0),
      height: Number(a.height || 0),
      metaLine: a.metaLine || '',
      svgTextPreview: a.svgTextPreview || ''
    }))
  } catch {
    // ignore
  }

  const attachmentBlockForVision = attachmentContextBlocksForVision.length
    ? `【附件内容】\n${attachmentContextBlocksForVision.join('\n\n')}`
    : ''
  const attachmentBlockTextOnly = attachmentContextBlocksTextOnly.length
    ? `【附件内容】\n${attachmentContextBlocksTextOnly.join('\n\n')}`
    : ''

  const combinedTextForVision = [String(text || '').trim(), attachmentBlockForVision].filter(Boolean).join('\n\n')
  const combinedTextTextOnly = [String(text || '').trim(), attachmentBlockTextOnly].filter(Boolean).join('\n\n')

  const userApiMessage = { role: 'user', content: combinedTextTextOnly }
  if (preferVision && imageAttachments.length) {
    userApiMessage.content = [
      {
        type: 'text',
        text: combinedTextForVision || '请结合下面的图片进行回答。'
      },
      ...imageAttachments.map((a) => ({
        type: 'image_url',
        image_url: { url: a.dataUrl }
      }))
    ]
    userApiMessage.vision_fallback_text = combinedTextTextOnly
  }

  targetSession.apiMessages.push(userApiMessage)
  userDisplay.apiIndex = targetSession.apiMessages.length - 1
  if (targetSession === session) await scrollToBottom({ force: true })
}

function getLatestRealUserPromptText(apiMessages = session.apiMessages) {
  for (let i = (Array.isArray(apiMessages) ? apiMessages : []).length - 1; i >= 0; i -= 1) {
    const msg = apiMessages[i]
    if (msg?.role !== 'user' || msg?.synthetic_tool_vision === true) continue
    return extractEditableUserTextFromContent(msg.content)
  }
  return ''
}

async function regenerateAssistant(msg) {
  if (sending.value || preparingSend.value) return
  const cfg = getRequestConfigOrHint()
  if (!cfg) return

  typewriterFlushAll()
  clearAllUserEditingState()

  const assistantApiIndex = isFiniteNumber(msg?.apiIndex)
    ? msg.apiIndex
    : (() => {
        for (let i = (session.apiMessages || []).length - 1; i >= 0; i--) {
          if (session.apiMessages[i]?.role === 'assistant') return i
        }
        return -1
      })()

  if (!isFiniteNumber(assistantApiIndex) || assistantApiIndex < 0) {
    message.warning('没有找到可重新生成的回答')
    return
  }

  const userApiIndex = findNearestUserApiIndexBefore(assistantApiIndex)
  if (!isFiniteNumber(userApiIndex) || userApiIndex < 0) {
    message.error('未找到对应的用户提问，无法继续重新生成')
    return
  }

  const userDisplayIndex =
    findDisplayIndexByApiIndex('user', userApiIndex) >= 0
      ? findDisplayIndexByApiIndex('user', userApiIndex)
      : (() => {
          const assistantDisplayIndex = (session.messages || []).findIndex((m) => m?.id === msg?.id)
          if (assistantDisplayIndex <= 0) return -1
          for (let i = assistantDisplayIndex - 1; i >= 0; i--) {
            if (session.messages[i]?.role === 'user') return i
          }
          return -1
        })()

  if (userDisplayIndex < 0) {
    message.error('未找到对应的用户气泡，无法继续重新生成')
    return
  }

  const hasFollowing = session.messages.length > userDisplayIndex + 1 || session.apiMessages.length > userApiIndex + 1
  const ok = await new Promise((resolve) => {
    dialog.warning({
      title: '确认重新生成',
      content: hasFollowing ? '重新生成会删除本次回答及其后的对话内容，确定继续吗？' : '确定重新生成这条回答吗？',
      positiveText: '重新生成',
      negativeText: '取消',
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false)
    })
  })
  if (!ok) return

  await startPreparingSend(async ({ release }) => {
    truncateConversationAfterUser(userApiIndex, userDisplayIndex)
    const requestRecord = getActiveMemorySession()
    const userDisplay = session.messages[userDisplayIndex]
    const attachments = Array.isArray(userDisplay?.attachments) ? userDisplay.attachments : []
    const userText = extractEditableUserTextFromContent(getUserApiMessageContentByIndex(userApiIndex) ?? userDisplay?.content)
    const { memorySystemContent, attachmentRecallText } = await prepareChatRequestContext({
      cfg,
      text: userText,
      attachments,
      requestRecord,
      excludeLatestUserTurnFromMemoryRecall: true
    })
    const runPromise = runChatSession({
      ...cfg,
      sessionRecord: requestRecord,
      memorySystemContent,
      memorySourceUserText: [userText, attachmentRecallText].filter(Boolean).join('\n\n'),
      prepare: async () => {
        if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
      }
    })
    release()
    await runPromise
  })
}

function toggleOrSubmitUserEdit(msg) {
  if (!msg || msg.role !== 'user') return
  if (sending.value || preparingSend.value) return

  if (!msg.editing) {
    clearAllUserEditingState()
    const userApiIndex = resolveUserApiIndexForDisplayMessage(msg)
    const apiContent = getUserApiMessageContentByIndex(userApiIndex)
    msg.editing = true
    msg.editDraft = extractEditableUserTextFromContent(apiContent ?? msg.content)
    scheduleScrollToBottom()
    scheduleRefreshUserAnchorMeta()
    return
  }

  submitUserEdit(msg)
}

async function submitUserEdit(msg) {
  if (!msg || msg.role !== 'user') return
  if (sending.value || preparingSend.value) return

  const draft = String(msg.editDraft ?? '').trim()
  const userApiIndex = resolveUserApiIndexForDisplayMessage(msg)
  const hasAttachments = messageHasDisplayAttachments(msg, userApiIndex)
  if (!draft && !hasAttachments) {
    message.warning('内容不能为空')
    return
  }

  const cfg = getRequestConfigOrHint()
  if (!cfg) return

  typewriterFlushAll()

  if (!isFiniteNumber(userApiIndex) || userApiIndex < 0) {
    message.error('未找到对应的请求记录，无法继续编辑并重发')
    return
  }

  const userDisplayIndex = (session.messages || []).findIndex((m) => m?.id === msg?.id)
  if (userDisplayIndex < 0) {
    message.error('未找到对应的用户气泡，无法继续编辑并重发')
    return
  }

  const hasFollowing = session.messages.length > userDisplayIndex + 1 || session.apiMessages.length > userApiIndex + 1
  const ok = await new Promise((resolve) => {
    dialog.warning({
      title: '确认重发',
      content: hasFollowing ? '重发会删除这条消息之后的所有对话内容，确定继续吗？' : '确定重发这条消息吗？' ,
      positiveText: '重发',
      negativeText: '取消',
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false)
    })
  })
  if (!ok) return

  await startPreparingSend(async ({ release }) => {
    msg.content = draft || (hasAttachments ? '(sent attachments)' : '')
    msg.render = inferUserDisplayMessageRender(msg.content)
    msg.editing = false
    msg.editDraft = ''

    if (session.apiMessages?.[userApiIndex]?.role === 'user') {
      session.apiMessages[userApiIndex].content = mergeUserTextWithExistingAttachments(
        session.apiMessages[userApiIndex].content,
        draft
      )
    }

    truncateConversationAfterUser(userApiIndex, userDisplayIndex)
    const requestRecord = getActiveMemorySession()
    const attachments = Array.isArray(msg?.attachments) ? msg.attachments : []
    const { memorySystemContent, attachmentRecallText } = await prepareChatRequestContext({
      cfg,
      text: draft,
      attachments,
      requestRecord,
      excludeLatestUserTurnFromMemoryRecall: true
    })
    const runPromise = runChatSession({
      ...cfg,
      sessionRecord: requestRecord,
      memorySystemContent,
      memorySourceUserText: [draft, attachmentRecallText].filter(Boolean).join('\n\n'),
      prepare: async () => {
        if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
      }
    })
    release()
    await runPromise
  })
}

function commitToolApprovalMode(value) {
  const nextMode = normalizeToolApprovalMode(value)
  toolApprovalMode.value = nextMode
  try {
    void Promise.resolve(updateChatConfig({ toolApprovalMode: nextMode })).catch((error) => {
      console.warn('保存工具调用控制选项失败:', error)
    })
  } catch (error) {
    console.warn('保存工具调用控制选项失败:', error)
  }
  const record = getActiveMemorySession()
  if (record) {
    record.toolApprovalMode = nextMode
    record.autoApproveTools = nextMode !== TOOL_APPROVAL_MODE_MANUAL
    if (record.activeRequestAbortState && typeof record.activeRequestAbortState === 'object') {
      record.activeRequestAbortState.toolApprovalMode = nextMode
      record.activeRequestAbortState.autoApproveTools = nextMode !== TOOL_APPROVAL_MODE_MANUAL
    }
    dispatchBuiltinAgentsToolApprovalModeChange(record, nextMode)
    if (nextMode === TOOL_APPROVAL_MODE_FULL || nextMode === TOOL_APPROVAL_MODE_TRUSTED) {
      pendingToolApprovals.value
        .filter((request) => (
          (nextMode === TOOL_APPROVAL_MODE_TRUSTED || request?.hardApproval !== true) &&
          (!request?.sessionId || String(request.sessionId) === String(record.id))
        ))
        .forEach((request) => request?.settle?.('once'))
      window.setTimeout(() => {
        void flushMemorySessionApprovalQueue(record)
      }, 0)
    }
  }
}

function setToolApprovalMode(value) {
  const nextMode = normalizeToolApprovalMode(value)
  if (nextMode === toolApprovalMode.value) return
  if (nextMode === TOOL_APPROVAL_MODE_TRUSTED) {
    dialog.error({
      title: '启用完全信任？',
      content: '此模式会记住为后续新会话的默认选项，并直接批准所有工具调用，包括命令、代码执行、删除及其他破坏性操作；子 Agent 也会继承。请仅在当前智能体、技能和 MCP 服务全部可信时启用。',
      positiveText: '完全信任并记住',
      negativeText: '取消',
      onPositiveClick: () => commitToolApprovalMode(nextMode)
    })
    return
  }
  if (nextMode === TOOL_APPROVAL_MODE_FULL) {
    dialog.warning({
      title: '启用高风险自动调用？',
      content: '此模式会记住为后续新会话的默认选项，并直接执行普通写入、常规命令和一般代码；明显破坏性的命令，以及删除、付款、发布等危险操作仍需确认。子 Agent 也会继承。',
      positiveText: '启用高风险自动',
      negativeText: '取消',
      onPositiveClick: () => commitToolApprovalMode(nextMode)
    })
    return
  }
  commitToolApprovalMode(nextMode)
}

function toggleWebSearch() {
  webSearchEnabled.value = !webSearchEnabled.value
}

function toggleAutoActivateAgentSkills() {
  autoActivateAgentSkills.value = !autoActivateAgentSkills.value
}

function cycleToolMode() {
  const order = ['auto', 'expanded', 'compact']
  const current = String(toolMode.value || 'auto')
  const idx = order.indexOf(current)
  const next = order[(idx + 1 + order.length) % order.length]
  toolMode.value = next
  if (next === 'expanded') effectiveToolMode.value = 'expanded'
  if (next === 'compact') effectiveToolMode.value = 'compact'
}

async function refreshActiveMcpTools() {
  if (refreshingMcpTools.value) return
  const servers = (activeMcpServers.value || []).filter((s) => s && !s.disabled && s._id)
  if (!servers.length) {
    message.info('当前没有启用的 MCP 服务')
    return
  }

  refreshingMcpTools.value = true
  try {
    mcpListToolsCache.clear()
    mcpListToolsInFlight.clear()
    mcpToolsRevision.value += 1
    clearMcpToolCatalog()
    clearPinnedMcpToolHints()
    await warmMcpToolCatalogForServers(servers, { forceRefresh: true })
    message.success('已刷新 MCP 工具列表')
  } catch (err) {
    message.error('刷新 MCP 工具列表失败：' + (err?.message || String(err)))
  } finally {
    refreshingMcpTools.value = false
  }
}

function normalizeImageGenerationMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'on' || mode === 'off') return mode
  return 'auto'
}

function setImageGenerationMode(nextMode) {
  const next = normalizeImageGenerationMode(nextMode)
  imageGenerationMode.value = next
}

function setVideoGenerationMode(nextMode) {
  const next = normalizeImageGenerationMode(nextMode)
  videoGenerationMode.value = next
}

function assignImageGenerationParams(nextParams = {}) {
  Object.assign(imageGenerationParams, normalizeImageGenerationParams(nextParams))
}

function assignVideoGenerationParams(nextParams = {}) {
  Object.assign(videoGenerationParams, normalizeVideoGenerationParams(nextParams))
}

function setImageGenerationParamsEnabled(enabled) {
  imageGenerationParamsEnabled.value = normalizeMediaGenerationParamsEnabled(enabled)
}

function setVideoGenerationParamsEnabled(enabled) {
  videoGenerationParamsEnabled.value = normalizeMediaGenerationParamsEnabled(enabled)
}

function resetImageGenerationParams() {
  assignImageGenerationParams(createDefaultImageGenerationParams())
}

function resetVideoGenerationParams() {
  assignVideoGenerationParams(createDefaultVideoGenerationParams())
}

function getCurrentImageGenerationRequestOptions() {
  return buildMediaGenerationManualRequestOptions(
    'image',
    imageGenerationParamsEnabled.value,
    imageGenerationParams
  )
}

function getCurrentVideoGenerationRequestOptions() {
  return buildMediaGenerationManualRequestOptions(
    'video',
    videoGenerationParamsEnabled.value,
    videoGenerationParams
  )
}

function cycleImageGenerationMode() {
  const order = ['auto', 'on', 'off']
  const current = normalizeImageGenerationMode(imageGenerationMode.value)
  const idx = order.indexOf(current)
  setImageGenerationMode(order[(idx + 1 + order.length) % order.length])
}

function cycleVideoGenerationMode() {
  const order = ['auto', 'on', 'off']
  const current = normalizeImageGenerationMode(videoGenerationMode.value)
  const idx = order.indexOf(current)
  setVideoGenerationMode(order[(idx + 1 + order.length) % order.length])
}

function clearInlineAgentPicker() {
  inlineAgentQuery.value = ''
  inlineAgentMatchStart.value = -1
  inlineAgentMatchEnd.value = -1
  inlineAgentActiveIndex.value = 0
}

function clearInlineCommandPicker() {
  inlineCommandMode.value = ''
  inlineCommandType.value = ''
  inlineCommandQuery.value = ''
  inlineCommandMatchStart.value = -1
  inlineCommandMatchEnd.value = -1
  inlineCommandActiveIndex.value = 0
}

function clearInlinePickers() {
  clearInlineAgentPicker()
  clearInlineCommandPicker()
}

function getComposerTextareaEl() {
  return composerPanelRef.value?.getTextareaEl?.() || null
}

function refreshComposerInlinePickers(options = {}) {
  const text = typeof options.text === 'string' ? options.text : String(input.value || '')
  const caret =
    typeof options.caret === 'number'
      ? options.caret
      : (getComposerTextareaEl()?.selectionStart ?? text.length)

  const commandContext = extractInlineCommandContext(text, caret)
  if (commandContext) {
    clearInlineAgentPicker()
    inlineCommandMode.value = commandContext.mode
    inlineCommandType.value = commandContext.type
    inlineCommandQuery.value = commandContext.query
    inlineCommandMatchStart.value = commandContext.start
    inlineCommandMatchEnd.value = commandContext.end
    if (commandContext.mode === 'item' && commandContext.type === 'prompt') {
      void ensureMcpPromptCatalogLoaded({ silent: true })
    }
    return
  }

  const agentContext = extractInlineAgentContext(text, caret)
  if (agentContext) {
    clearInlineCommandPicker()
    inlineAgentQuery.value = agentContext.query
    inlineAgentMatchStart.value = agentContext.start
    inlineAgentMatchEnd.value = agentContext.end
    return
  }

  clearInlinePickers()
}

function handleComposerCursorChange() {
  refreshComposerInlinePickers()
}

function handleComposerBlur() {
  clearInlinePickers()
}

function focusComposerAt(position) {
  nextTick(() => {
    composerPanelRef.value?.focusComposer?.()
    const el = getComposerTextareaEl()
    if (el && Number.isFinite(position)) {
      el.setSelectionRange(position, position)
    }
    refreshComposerInlinePickers({ caret: position })
  })
}

function insertInlineCommandTrigger(kind) {
  const normalizedKind = String(kind || '').trim().toLowerCase()
  if (!INLINE_COMMAND_KIND_LABELS[normalizedKind]) return

  clearInlinePickers()

  const token = `/${normalizedKind} `
  const raw = String(input.value || '')
  const el = getComposerTextareaEl()
  const start = el?.selectionStart ?? raw.length
  const end = el?.selectionEnd ?? start
  const before = raw.slice(0, start)
  const after = raw.slice(end)
  const prefix = before && !/[\s\n]$/.test(before) ? ' ' : ''
  const suffix = after && !/^[\s\n]/.test(after) ? ' ' : ''

  input.value = `${before}${prefix}${token}${suffix}${after}`
  focusComposerAt(before.length + prefix.length + token.length)
}

function moveInlineAgentActive(step) {
  const list = inlineAgentSuggestions.value
  if (!list.length) return
  const size = list.length
  inlineAgentActiveIndex.value = (inlineAgentActiveIndex.value + step + size) % size
}

function applyInlineAgentSuggestion(agentId) {
  const id = String(agentId || '').trim()
  if (!id) return

  const raw = String(input.value || '')
  const start = inlineAgentMatchStart.value
  const end = inlineAgentMatchEnd.value >= start ? inlineAgentMatchEnd.value : start
  let nextCaret = Math.max(0, start)

  if (start >= 0 && end >= start) {
    const before = raw.slice(0, start)
    let after = raw.slice(end)
    if (/\s$/.test(before) && /^\s/.test(after)) {
      after = after.replace(/^\s+/, ' ')
    }
    input.value = `${before}${after}`
    nextCaret = before.length
  }

  applyAgent(id)
  clearInlineAgentPicker()
  focusComposerAt(nextCaret)
}

function moveInlineCommandActive(step) {
  const list = inlineCommandSuggestions.value
  if (!list.length) return
  const size = list.length
  let nextIndex = inlineCommandActiveIndex.value
  let attempts = 0
  do {
    nextIndex = (nextIndex + step + size) % size
    attempts += 1
  } while (attempts < size && list[nextIndex]?.disabled)
  inlineCommandActiveIndex.value = nextIndex
}

function getFirstEnabledInlineCommandIndex(list = inlineCommandSuggestions.value) {
  const index = (Array.isArray(list) ? list : []).findIndex((item) => !item?.disabled)
  return index >= 0 ? index : 0
}

function replaceInlineCommandToken(kind) {
  const normalizedKind = String(kind || '').trim().toLowerCase()
  if (!INLINE_COMMAND_KIND_LABELS[normalizedKind]) return

  const raw = String(input.value || '')
  const start = inlineCommandMatchStart.value
  const end = inlineCommandMatchEnd.value >= start ? inlineCommandMatchEnd.value : start
  const before = start >= 0 ? raw.slice(0, start) : raw
  let after = end >= start ? raw.slice(end) : ''
  const token = `/${normalizedKind} `

  if (/^[ \t]+/.test(after)) {
    after = after.replace(/^[ \t]+/, '')
  } else if (after && !/^[\s\n]/.test(after)) {
    after = ` ${after}`
  }

  input.value = `${before}${token}${after}`
  focusComposerAt(before.length + token.length)
}

function removeInlineCommandToken() {
  const raw = String(input.value || '')
  const start = inlineCommandMatchStart.value
  const end = inlineCommandMatchEnd.value >= start ? inlineCommandMatchEnd.value : start
  let nextCaret = Math.max(0, start)

  if (start >= 0 && end >= start) {
    const before = raw.slice(0, start)
    let after = raw.slice(end)
    if (/\s$/.test(before) && /^\s/.test(after)) {
      after = after.replace(/^\s+/, ' ')
    }
    input.value = `${before}${after}`
    nextCaret = before.length
  }

  clearInlineCommandPicker()
  focusComposerAt(nextCaret)
}

async function applyInlineCommandSuggestion(item) {
  const value = String(item?.value || '').trim()
  if (!value) return
  if (item?.disabled) {
    message.warning('该 MCP 已禁用，请先到设置页启用')
    return
  }

  if (inlineCommandMode.value === 'kind') {
    replaceInlineCommandToken(value)
    return
  }

  if (inlineCommandType.value === 'prompt') {
    const parsed = parsePromptOptionValue(value)
    if (parsed.type === 'mcp') {
      const promptItem = findMcpPromptCatalogItem(parsed.serverId, parsed.promptName)
      if (!promptItem) {
        message.warning('未找到该 MCP 提示词，请刷新后重试')
        return
      }

      removeInlineCommandToken()
      if (Array.isArray(promptItem.arguments) && promptItem.arguments.length) {
        promptModalSelectedId.value = makeMcpPromptOptionValue(promptItem)
        showPromptModal.value = true
        return
      }

      await applyMcpPromptToComposer(promptItem)
      return
    }

    const localPrompt = findLocalPromptById(parsed.promptId || null)
    if (!localPrompt) {
      message.warning('未找到该本地提示词，请刷新后重试')
      removeInlineCommandToken()
      return
    }

    if (isUserPrompt(localPrompt)) {
      removeInlineCommandToken()
      const variables = extractPromptVariables(localPrompt.content)
      if (!variables.length) {
        applyLocalPromptToComposer(localPrompt, {})
        return
      }
      promptModalSelectedId.value = makeLocalPromptOptionValue(localPrompt._id)
      resetPromptVariableFormData(variables, promptUserArgsForm)
      showPromptModal.value = true
      return
    }

    applyBasePromptSelection(localPrompt._id)
    removeInlineCommandToken()
    return
  }

  if (inlineCommandType.value === 'skill') {
    const set = new Set(Array.isArray(selectedSkillIds.value) ? selectedSkillIds.value : [])
    if (set.has(value)) set.delete(value)
    else set.add(value)
    selectedSkillIds.value = Array.from(set)
    removeInlineCommandToken()
    return
  }

  if (inlineCommandType.value === 'mcp') {
    const set = new Set(Array.isArray(manualMcpIds.value) ? manualMcpIds.value : [])
    if (set.has(value)) set.delete(value)
    else set.add(value)
    manualMcpIds.value = Array.from(set)
    void ensureMcpPromptCatalogLoaded({ silent: true, forceRefresh: true })
    removeInlineCommandToken()
  }
}

function handleInputKeydown(e) {
  if (isComposerCompositionKeydownEvent(e)) return

  if (
    sending.value &&
    e.key === 'Enter' &&
    !e.shiftKey &&
    (e.ctrlKey || e.metaKey)
  ) {
    e.preventDefault()
    steerCurrentRun()
    return
  }

  if (!e.ctrlKey && !e.metaKey && !e.altKey && showInlineCommandPicker.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveInlineCommandActive(1)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveInlineCommandActive(-1)
      return
    }

    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      const list = inlineCommandSuggestions.value
      const active =
        list[inlineCommandActiveIndex.value] ||
        list[getFirstEnabledInlineCommandIndex(list)] ||
        list[0]
      if (active) {
        e.preventDefault()
        applyInlineCommandSuggestion(active)
        return
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      clearInlineCommandPicker()
      return
    }
  }

  if (!e.ctrlKey && !e.metaKey && !e.altKey && showInlineAgentPicker.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveInlineAgentActive(1)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveInlineAgentActive(-1)
      return
    }

    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      const active = inlineAgentSuggestions.value[inlineAgentActiveIndex.value] || inlineAgentSuggestions.value[0]
      if (active) {
        e.preventDefault()
        applyInlineAgentSuggestion(active.value)
        return
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      clearInlineAgentPicker()
      return
    }
  }

  if (!shouldSubmitComposerKeydownEvent(e)) return
  e.preventDefault()
  send()
}

function openSystemPromptModal() {
  systemPromptDraft.value = basePromptText.value
  showSystemPromptModal.value = true
}

function applyCustomSystemPrompt() {
  const selectedPrompt = findLocalPromptById(selectedPromptId.value)
  const nextState = resolveSystemPromptModalApplyState(
    {
      basePromptMode: basePromptMode.value,
      selectedPromptId: selectedPromptId.value,
      customSystemPrompt: customSystemPrompt.value,
      customSystemPromptExplicit: customSystemPromptExplicit.value
    },
    {
      draftText: systemPromptDraft.value,
      selectedPromptId: selectedPromptId.value,
      selectedPromptContent: isSystemPrompt(selectedPrompt) ? String(selectedPrompt?.content || '') : ''
    }
  )
  basePromptMode.value = nextState.basePromptMode
  selectedPromptId.value = nextState.selectedPromptId
  customSystemPrompt.value = nextState.customSystemPrompt
  customSystemPromptExplicit.value = nextState.customSystemPromptExplicit
  showSystemPromptModal.value = false
}

function clearCustomSystemPrompt() {
  systemPromptDraft.value = ''
}

function resetSystemPromptToSelectedPrompt() {
  const p = findLocalPromptById(selectedPromptId.value)
  systemPromptDraft.value = isSystemPrompt(p) ? String(p?.content || '') : ''
}

function syncContextWindowDraft(raw = effectiveContextWindowConfig.value) {
  Object.assign(contextWindowDraft, resolveChatContextWindowOptions(raw))
}

function openContextWindowModal() {
  syncContextWindowDraft()
  contextWindowPreviewOmittedFilter.value = 'all'
  showContextWindowModal.value = true
}

function handleContextWindowPresetChange(value) {
  const preset = String(value || '').trim()
  if (!preset || preset === 'custom') return
  Object.assign(contextWindowDraft, resolveChatContextWindowOptions({ ...contextWindowDraft, preset }))
}

function resetContextWindowDraftToDefault() {
  Object.assign(contextWindowDraft, resolveChatContextWindowOptions(globalContextWindowConfig.value))
}

async function applyContextWindowSettings() {
  try {
    const normalized = resolveChatContextWindowOptions(normalizeChatContextWindowConfig(contextWindowDraft))
    const globalNormalized = normalizeChatContextWindowConfig(chatConfig.value?.contextWindow)
    sessionContextWindowOverride.value = JSON.stringify(normalized) === JSON.stringify(globalNormalized)
      ? null
      : deepCopyJson(normalized, null)
    const activeRecord = getMemorySessionById(activeMemorySessionId.value)
    if (activeRecord) {
      activeRecord.state = buildCurrentChatState()
      activeRecord.updatedAt = Date.now()
    }
    syncContextWindowDraft(normalized)
    showContextWindowModal.value = false
    message.success('当前会话上下文策略已应用')
  } catch (err) {
    message.error('保存上下文窗口设置失败：' + (err?.message || String(err)))
  }
}

function isCurrentModel(providerId, model) {
  return providerId === selectedProviderId.value && model === selectedModel.value
}

function selectProviderModel(providerId, model) {
  selectedProviderId.value = providerId
  selectedModel.value = model
  showModelModal.value = false
}

function openAgentModal() {
  clearInlinePickers()
  agentModalSelectedId.value = visibleSelectedAgent.value?._id || null
  showAgentModal.value = true
}

function resetChatSetupUiState() {
  clearInlinePickers()

  // 关闭弹窗
  showModelModal.value = false
  showSystemPromptModal.value = false
  showContextWindowModal.value = false
  showAgentModal.value = false
  showPromptModal.value = false
  showSkillModal.value = false
  showMcpModal.value = false

  applyDefaultChatState()
}

function clearSelectedAgent() {
  clearInlinePickers()
  const skillIdsToRemove = new Set([
    ...normalizeStringList(agentSkillIds.value),
    ...normalizeStringList(selectedAgent.value?.skills)
  ])
  const mcpIdsToRemove = new Set(normalizeStringList(selectedAgent.value?.mcp))

  if (skillIdsToRemove.size) {
    selectedSkillIds.value = normalizeStringList((selectedSkillIds.value || []).filter((id) => !skillIdsToRemove.has(id)))
  }
  if (mcpIdsToRemove.size) {
    manualMcpIds.value = normalizeStringList((manualMcpIds.value || []).filter((id) => !mcpIdsToRemove.has(id)))
  }

  applyDefaultGeneralAgent()
  agentModalSelectedId.value = null
  showAgentModal.value = false
}

function applyAgentModal() {
  if (!agentModalSelectedId.value) return
  applyAgent(agentModalSelectedId.value)
  clearInlinePickers()
  showAgentModal.value = false
}

function clearSelectedPrompt() {
  const parsedBeforeClear = selectedPromptModalParsedValue.value
  promptModalSelectedId.value = null
  resetPromptVariableFormData([], promptUserArgsForm)
  if (shouldClearBasePromptSelectionImmediately({
    basePromptMode: basePromptMode.value,
    selectedPromptId: selectedPromptId.value
  }, parsedBeforeClear)) {
    applyBasePromptSelection(null)
  }
  showPromptModal.value = false
}

async function applyPromptModal() {
  const parsed = selectedPromptModalParsedValue.value
  if (parsed.type === 'mcp') {
    const promptItem = findMcpPromptCatalogItem(parsed.serverId, parsed.promptName)
    if (!promptItem) {
      message.warning('未找到该 MCP 提示词，请刷新后重试')
      return
    }

    let args = {}
    try {
      args = buildMcpPromptArgsFromModal()
    } catch (err) {
      message.warning('MCP 提示词参数无效：' + (err?.message || String(err)))
      return
    }

    const ok = await applyMcpPromptToComposer(promptItem, args)
    if (!ok) return
    showPromptModal.value = false
    return
  }

  const localPrompt = findLocalPromptById(parsed.promptId || null)
  if (!localPrompt) {
    if (shouldClearBasePromptSelectionImmediately({
      basePromptMode: basePromptMode.value,
      selectedPromptId: selectedPromptId.value
    }, parsed)) {
      applyBasePromptSelection(null)
    }
    showPromptModal.value = false
    return
  }

  if (isUserPrompt(localPrompt)) {
    let values = {}
    try {
      values = buildLocalPromptArgsFromModal()
    } catch (err) {
      message.warning(err?.message || String(err))
      return
    }

    const ok = applyLocalPromptToComposer(localPrompt, values)
    if (!ok) return
    showPromptModal.value = false
    return
  }

  applyBasePromptSelection(localPrompt._id)
  showPromptModal.value = false
}

function applySkillModal() {
  selectedSkillIds.value = Array.isArray(skillModalSelectedIds.value) ? [...skillModalSelectedIds.value] : []
  showSkillModal.value = false
}

function applyMcpModal() {
  manualMcpIds.value = Array.isArray(mcpModalSelectedIds.value) ? [...mcpModalSelectedIds.value] : []
  showMcpModal.value = false
  void ensureMcpPromptCatalogLoaded({ silent: true, forceRefresh: true })
}

const contextWindowPresetOptions = [
  {
    label: '紧凑',
    value: 'aggressive',
    description: CHAT_CONTEXT_WINDOW_PRESETS.aggressive.description
  },
  {
    label: '平衡',
    value: 'balanced',
    description: CHAT_CONTEXT_WINDOW_PRESETS.balanced.description
  },
  {
    label: '宽松',
    value: 'wide',
    description: CHAT_CONTEXT_WINDOW_PRESETS.wide.description
  },
  {
    label: '自定义',
    value: 'custom',
    description: '手动控制轮次、消息数量和字符预算。'
  }
]

const contextWindowHistoryFocusOptions = [
  {
    label: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.recent.label,
    value: 'recent',
    description: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.recent.description
  },
  {
    label: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.balanced.label,
    value: 'balanced',
    description: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.balanced.description
  },
  {
    label: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.attachments.label,
    value: 'attachments',
    description: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.attachments.description
  }
]

function resolveHistoryContextBudgetState(options = {}) {
  const { tools = [], reservedCharsOverride = null, apiMessages = null, sessionRecord = null } = options || {}
  const reservedChars = Number.isFinite(Number(reservedCharsOverride))
    ? Math.max(0, Math.floor(Number(reservedCharsOverride)))
    : calculateReservedRequestChars({
        systemContent: systemContent.value,
        tools
      })
  const sourceMessages = Array.isArray(apiMessages) ? apiMessages : session.apiMessages
  const sourceChars = estimateMessagesSize(sourceMessages)
  const tokenTelemetry = getContextTokenTelemetry(sessionRecord)
  const budgetPlan = resolveChatContextWindowBudgetPlan(effectiveContextWindowConfig.value, {
    reservedChars,
    sourceChars,
    reportedInputTokens: tokenTelemetry.inputTokens,
    reportedRequestChars: tokenTelemetry.requestChars
  })
  const historyBudget = budgetPlan.historyCharsBudget
  return {
    reservedChars,
    sourceChars,
    budgetPlan,
    historyBudget
  }
}

function getHistoryContextCharBudget(options = {}) {
  return resolveHistoryContextBudgetState(options).historyBudget
}

function buildRequestApiMessages(providerKind = 'openai-compatible', options = {}) {
  const {
    tools = [],
    reservedCharsOverride = null,
    apiMessages = null,
    contextSummary = null,
    sessionRecord = null
  } = options || {}
  const sourceMessages = Array.isArray(apiMessages) ? apiMessages : session.apiMessages
  const summary =
    contextSummary && typeof contextSummary === 'object'
      ? contextSummary
      : null
  const summaryText = String(summary?.summaryText || '').trim()
  const coveredMessageCount = Math.max(0, Math.floor(Number(summary?.coveredMessageCount || 0)))
  const effectiveMessages =
    summaryText && coveredMessageCount > 0 && coveredMessageCount <= sourceMessages.length
      ? sourceMessages.slice(coveredMessageCount)
      : sourceMessages
  const budgetState = resolveHistoryContextBudgetState({
    tools,
    reservedCharsOverride,
    apiMessages: effectiveMessages,
    sessionRecord
  })

  return buildChatContextWindow(
    effectiveMessages,
    buildChatContextWindowRuntimeOptions(contextWindowResolvedOptions.value, {
      providerKind,
      maxChars: budgetState.historyBudget,
      preserveToolResultTurns: budgetState.budgetPlan.mode !== 'compact'
    })
  )
}

async function requestContextWindowSummary({
  providerKind = 'openai-compatible',
  providerId = '',
  baseUrl = '',
  apiKey = '',
  model = '',
  systemPrompt = '',
  conversationPairs = []
} = {}) {
  const pairs = Array.isArray(conversationPairs) ? conversationPairs.filter((item) => item && (item.userText || item.assistantText)) : []
  if (!pairs.length) return ''

  const prompt = [
    '请把下面这段较早的多轮对话压缩成后续继续聊天可用的历史摘要。',
    '保留：用户身份、长期偏好、约束、项目背景、关键已决策事项、未完成事项、重要事实。',
    '删除：寒暄、重复表述、低信息量回复、工具噪声。',
    '输出要求：使用简洁中文，分点总结，控制在 800 字以内，不要编造。'
  ]

  pairs.forEach((item, index) => {
    prompt.push(
      [
        `片段 ${index + 1}`,
        item.userText ? `用户：\n${item.userText}` : '',
        item.assistantText ? `助手：\n${item.assistantText}` : ''
      ].filter(Boolean).join('\n\n')
    )
  })

  if (providerKind === 'utools-ai') {
    if (!canUseUtoolsAi()) return ''
    const result = await window.utools.ai({
      model,
      messages: buildUtoolsAiMessages({
        systemContent: systemPrompt,
        apiMessages: [{ role: 'user', content: prompt.join('\n\n') }]
      })
    })
    recordModelUsage(extractModelUsage(result), {
      providerId,
      model,
      endpoint: 'utools-ai',
      purpose: 'context-summary'
    })
    return truncateText(String(result?.content || '').trim(), 1200, '（摘要已截断）')
  }

  if (!baseUrl || !apiKey || !model) return ''
  const result = await streamChatCompletion({
    baseUrl,
    apiKey,
    body: {
      model,
      stream: true,
      temperature: 0.2,
      messages: buildRequestMessages({
        baseUrl,
        model,
        apiMessages: [{ role: 'user', content: prompt.join('\n\n') }],
        memorySystemContent: '',
        tools: []
      }).map((message, index) => {
        if (index === 0 && message.role === 'system' && systemPrompt) {
          return { ...message, content: systemPrompt }
        }
        return message
      })
    },
    signal: undefined,
    onDelta: null,
    abortState: null
  })
  recordModelUsage(result?.usage, {
    providerId,
    model,
    endpoint: result?.endpoint || 'auto',
    purpose: 'context-summary'
  })
  return truncateText(String(result?.content || '').trim(), 1200, '（摘要已截断）')
}

function resolveContextSummaryCoverage({
  sourceMessages = [],
  cfg = null,
  tools = [],
  reservedCharsOverride = null,
  targetSourceChars = null,
  sessionRecord = null
} = {}) {
  const list = Array.isArray(sourceMessages) ? sourceMessages : []
  if (!cfg || cfg.requestMode !== 'chat' || list.length < 1) {
    return {
      coveredCount: 0,
      sourceSlice: [],
      sourceHash: ''
    }
  }

  const requestMessages = buildRequestApiMessages(cfg.providerKind || 'openai-compatible', {
    tools,
    reservedCharsOverride,
    apiMessages: list,
    sessionRecord
  })
  let coveredCount = Math.max(0, list.length - requestMessages.length)
  if (coveredCount < 1 && list.length > 1 && Number.isFinite(Number(targetSourceChars))) {
    const targetChars = Math.max(4000, Math.floor(Number(targetSourceChars)))
    const keepRecentTurnsFull = Math.max(1, Number(contextWindowResolvedOptions.value?.keepRecentTurnsFull || 6))
    const minKeptMessages = Math.max(1, Math.min(list.length - 1, Math.max(2, keepRecentTurnsFull * 2)))
    let keepStart = Math.max(0, list.length - minKeptMessages)
    let keptChars = estimateMessagesSize(list.slice(keepStart))

    while (keepStart > 0) {
      const nextMessageChars = estimateMessageSize(list[keepStart - 1])
      if (keptChars + nextMessageChars > targetChars) break
      keepStart -= 1
      keptChars += nextMessageChars
    }

    if (keepStart > 0) coveredCount = keepStart
  }

  if (coveredCount < 1) {
    return {
      coveredCount: 0,
      sourceSlice: [],
      sourceHash: ''
    }
  }

  const sourceSlice = list.slice(0, coveredCount)
  return {
    coveredCount,
    sourceSlice,
    sourceHash: buildContextSummarySourceHash(sourceSlice)
  }
}

async function ensureContextWindowSummary({
  cfg,
  requestRecord,
  tools = [],
  reservedCharsOverride = null,
  targetSourceChars = null,
  force = false
} = {}) {
  if (!cfg || cfg.requestMode !== 'chat' || !requestRecord) return ''
  const sourceMessages = Array.isArray(requestRecord.apiMessages) ? requestRecord.apiMessages : []
  const { coveredCount, sourceSlice, sourceHash } = resolveContextSummaryCoverage({
    sourceMessages,
    cfg,
    tools,
    reservedCharsOverride,
    targetSourceChars,
    sessionRecord: requestRecord
  })
  if (coveredCount < 1) return ''

  const cached = requestRecord.contextSummary && typeof requestRecord.contextSummary === 'object'
    ? requestRecord.contextSummary
    : null
  if (!force && cached?.summaryText && cached.sourceHash === sourceHash && Number(cached.coveredMessageCount || 0) === coveredCount) {
    return String(cached.summaryText || '').trim()
  }

  const cachedSummaryText = String(cached?.summaryText || '').trim()
  const cachedCoveredCount = Math.max(0, Math.floor(Number(cached?.coveredMessageCount || 0)))
  const hasForwardProgress = cachedSummaryText && cachedCoveredCount > 0 && cachedCoveredCount < coveredCount
  const layeredSourceMessages = hasForwardProgress
    ? [
        {
          role: 'system',
          content: `previous compressed summary:\n${cachedSummaryText}`
        },
        ...sourceMessages.slice(cachedCoveredCount, coveredCount)
      ]
    : sourceMessages.slice(0, coveredCount)
  const conversationTurns = buildContextSummaryTurnSegments(layeredSourceMessages, {
    endExclusive: layeredSourceMessages.length
  })
  const conversationText = conversationTurns
    .map((item, index) => {
      const turnText = String(item?.turnText || item?.userText || '').trim()
      if (!turnText) return ''
      return [`turn ${index + 1}`, turnText].filter(Boolean).join('\n\n')
    })
    .filter(Boolean)
    .join('\n\n---\n\n')
  const conversationPairs = conversationText
    ? [{
        userText: `all history before compression:\n\n${conversationText}`,
        assistantText: '',
        summary: hasForwardProgress
          ? `compressed history from previous summary plus ${conversationTurns.length} turns`
          : `all prior history, ${conversationTurns.length} turns`
      }]
    : []
  if (!conversationPairs.length) return ''
  const summaryLevel = resolveContextSummaryLevel(cached, hasForwardProgress)
  const summaryChain = resolveContextSummaryChain(cached, summaryLevel, hasForwardProgress)
  const summarySourceLabel = resolveContextSummarySourceLabel(hasForwardProgress)

  const summaryText = await requestContextWindowSummary({
    providerKind: cfg.providerKind,
    providerId: cfg.providerId,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    systemPrompt: '你是一个对话历史压缩器，只输出供后续对话继续使用的忠实摘要。',
    conversationPairs
  }).catch((err) => {
    console.warn('[chat context summary] generation failed:', err)
    return ''
  })

  requestRecord.contextSummary = {
    summaryText: String(summaryText || '').trim(),
    coveredMessageCount: coveredCount,
    coveredTurnCount: conversationTurns.length,
    batchCount: 1,
    summaryLevel,
    summaryChain,
    summarySourceLabel,
    sourceHash,
    updatedAt: Date.now()
  }
  return String(requestRecord.contextSummary.summaryText || '').trim()
}

function syncContextSummaryCacheForRecord(requestRecord, coverage = null) {
  if (!requestRecord || typeof requestRecord !== 'object') return null
  const cached = requestRecord.contextSummary && typeof requestRecord.contextSummary === 'object'
    ? requestRecord.contextSummary
    : null
  if (!cached) return null

  const coveredCount = Math.max(0, Math.floor(Number(coverage?.coveredCount || 0)))
  const sourceHash = String(coverage?.sourceHash || '')
  if (
    !String(cached.summaryText || '').trim() ||
    coveredCount < 1 ||
    !sourceHash ||
    coveredCount > (Array.isArray(requestRecord.apiMessages) ? requestRecord.apiMessages.length : 0)
  ) {
    requestRecord.contextSummary = createEmptyContextSummaryState()
    return requestRecord.contextSummary
  }

  return cached
}

async function prepareChatRequestContext({
  cfg,
  text = '',
  attachments = [],
  requestRecord = null,
  includeMemoryRecall = true,
  excludeLatestUserTurnFromMemoryRecall = false
} = {}) {
  const safeText = String(text || '').trim()
  const safeAttachments = Array.isArray(attachments) ? attachments : []
  const targetRecord = requestRecord || getActiveMemorySession()

  const triggerText = safeText || safeAttachments.map((a) => String(a?.name || '')).filter(Boolean).join(' ')
  try {
    await autoActivateAgentSkillsFromText(triggerText)
  } catch {
    // ignore
  }

  if (safeAttachments.length) {
    try {
      preparingSendStage.value = '正在解析附件'
      await Promise.all(safeAttachments.map((a) => ensureAttachmentParsed(a)))
      await enrichImageAttachmentsForMemoryRecall(safeAttachments, cfg)
    } catch {
      // ignore attachment parsing failure for recall
    }
    preparingSendStage.value = '正在写入聊天沙盒'
    await stageChatAttachmentsInSandbox(safeAttachments, targetRecord)
    if (cfg?.requestMode === 'chat') {
      await ensureAttachmentSandboxSkillAvailable(safeAttachments)
    }
  }

  let memorySystemContent = ''
  let attachmentRecallText = ''
  if (includeMemoryRecall && cfg?.requestMode === 'chat' && isChatMemoryEnabled(chatConfig.value?.memory)) {
    try {
      preparingSendStage.value = '正在召回记忆'
      attachmentRecallText = buildMemoryRecallQueryFromAttachments(safeAttachments)
      const memoryQueryText = [
        buildMemoryRecallQueryFromRecord(targetRecord, safeText, {
          excludeLatestUserTurn: excludeLatestUserTurnFromMemoryRecall
        }),
        attachmentRecallText
      ].filter(Boolean).join('\n\n')
      const recall = await buildMemoryInjection({
        queryText: memoryQueryText,
        userText: [safeText, attachmentRecallText].filter(Boolean).join('\n\n'),
        systemPrompt: systemContent.value
      })
      memorySystemContent = String(recall?.text || '').trim()
    } catch (err) {
      console.warn('[chat memory] recall failed:', err)
    }
  }

  try {
    preparingSendStage.value = '正在压缩历史'
    if (cfg?.requestMode !== 'chat') {
      return {
        requestRecord: targetRecord,
        memorySystemContent,
        attachmentRecallText
      }
    }
    const contextCfg = effectiveContextWindowConfig.value
    const resolvedContext = resolveChatContextWindowOptions(contextCfg)
    const requestTools = []
    const combinedSystemContent = buildCombinedSystemContent(memorySystemContent, { sessionRecord: targetRecord })
    const reservedChars = calculateReservedRequestChars({ systemContent: combinedSystemContent, tools: requestTools })
    const sourceMessages = Array.isArray(targetRecord.apiMessages) ? targetRecord.apiMessages : []
    const budgetState = resolveHistoryContextBudgetState({
      tools: requestTools,
      reservedCharsOverride: reservedChars,
      apiMessages: sourceMessages,
      sessionRecord: targetRecord
    })
    const historyBudget = budgetState.historyBudget
    const summaryTriggerChars = calculateContextSummaryTriggerChars({
      historyCharsBudget: historyBudget
    })
    const sourceChars = estimateMessagesSize(sourceMessages)
    const coverage = resolveContextSummaryCoverage({
      sourceMessages,
      cfg,
      tools: requestTools,
      reservedCharsOverride: reservedChars,
      targetSourceChars: summaryTriggerChars,
      sessionRecord: targetRecord
    })
    const cachedSummary = syncContextSummaryCacheForRecord(targetRecord, coverage)
    const sourceBudgetMessages = buildRequestApiMessages(cfg.providerKind || 'openai-compatible', {
      tools: requestTools,
      reservedCharsOverride: reservedChars,
      apiMessages: sourceMessages,
      contextSummary: targetRecord?.contextSummary || null,
      sessionRecord: targetRecord
    })
    const contextInspection = inspectChatContextWindow(
      sourceMessages,
      buildChatContextWindowRuntimeOptions(resolvedContext, {
        providerKind: cfg.providerKind || 'openai-compatible',
        maxChars: historyBudget,
        preserveToolResultTurns: budgetState.budgetPlan.mode !== 'compact'
      })
    )
    const contextWouldTrim =
      sourceBudgetMessages.length < sourceMessages.length || hasChatContextWindowReduction(contextInspection)
    const summaryMissing = !String(cachedSummary?.summaryText || '').trim()
    const summaryStale =
      coverage.coveredCount >= 1 &&
      (
        coverage.sourceHash !== String(cachedSummary?.sourceHash || '') ||
        coverage.coveredCount !== Math.max(0, Math.floor(Number(cachedSummary?.coveredMessageCount || 0)))
      )
    const shouldSummarize = shouldSummarizeContextWindow({
      sourceMessages,
      sourceChars,
      summaryTriggerChars,
      coveredCount: coverage.coveredCount,
      contextWouldTrim,
      summaryMissing,
      summaryStale,
      minMessages: 2
    })
    if (shouldSummarize) {
      await ensureContextWindowSummary({
        cfg,
        requestRecord: targetRecord,
        tools: requestTools,
        reservedCharsOverride: reservedChars,
        targetSourceChars: summaryTriggerChars,
        force: summaryStale
      })
    }
  } catch (err) {
    console.warn('[chat context summary] prepare failed:', err)
  } finally {
    preparingSendStage.value = '正在发送'
  }

  return {
    requestRecord: targetRecord,
    memorySystemContent,
    attachmentRecallText
  }
}

async function startPreparingSend(task) {
  if (sending.value || preparingSend.value) return false
  preparingSend.value = true
  preparingSendStage.value = '正在准备上下文'
  let released = false
  const release = () => {
    if (released) return
    released = true
    preparingSend.value = false
    preparingSendStage.value = ''
  }
  try {
    await task?.({ release })
    release()
    return true
  } catch (err) {
    release()
    throw err
  }
}

function isLikelyImageGenerationPrompt(text) {
  const normalized = String(text || '').trim().toLowerCase()
  if (!normalized) return false

  return /(^|\b)(draw|generate|create|make|render|illustrate|design)(\b|$)|生成图片|生成一张图|生成一幅图|画一张图|画一幅图|做一张图|出图|产图|画图|绘图|海报|封面图|插画|头像|壁纸|logo/i.test(
    normalized
  )
}

function isLikelyVideoGenerationPrompt(text) {
  const normalized = String(text || '').trim().toLowerCase()
  if (!normalized) return false

  return /(^|\b)(animate|generate|create|make|render)(\b|$)|生成视频|做个视频|出视频|产视频|视频生成|动画短片|短视频|motion video|text to video|text-to-video|img2video|image-to-video/i.test(
    normalized
  )
}

function buildEmptyAssistantResponseText(apiMessages = session.apiMessages) {
  const imageMode = normalizeImageGenerationMode(imageGenerationMode.value)
  const videoMode = normalizeImageGenerationMode(videoGenerationMode.value)
  const model = String(selectedModel.value || '').trim()
  const latestUserPrompt = (() => {
    const list = Array.isArray(apiMessages) ? apiMessages : []
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const msg = list[i]
      if (msg?.role === 'user') return extractRequestMessageTextContent(msg.content)
    }
    return ''
  })()

  if (videoMode === 'on') {
    return '（模型返回为空：当前已开启视频生成模式，但服务商/模型没有返回可用结果，请检查视频生成接口兼容性）'
  }

  if (imageMode === 'on') {
    return '（模型返回为空：当前已开启图片生成模式，但服务商/模型没有返回可用结果，请检查图片生成接口兼容性）'
  }

  if (videoMode === 'auto' && isLikelyVideoGenerationPrompt(latestUserPrompt) && !isLikelyVideoGenerationModel(model)) {
    return '（模型返回为空：如果这实际是视频生成请求，请将视频生成模式切换为开启后重试）'
  }

  if (imageMode === 'auto' && isLikelyImageGenerationPrompt(latestUserPrompt) && !isLikelyImageGenerationModel(model)) {
    return '（模型返回为空：如果这实际是图片生成请求，请将图片生成模式切换为开启后重试）'
  }

  return '（模型返回为空：请检查服务商配置或接口兼容性）'
}

function buildMediaGenerationPromptFromHistory(userPrompt, options = {}) {
  const currentPrompt = String(userPrompt || '').trim()
  if (!currentPrompt) return ''

  const mediaLabel = String(options.mediaLabel || '图片').trim() || '图片'
  const promptLead = `当前${mediaLabel}生成需求：\n${currentPrompt}`
  const mediaSystemContent = getMediaGenerationSystemContent()
  const reservedChars = mediaSystemContent.length + promptLead.length + 2000
  const requestMessages = buildRequestApiMessages('openai-compatible', {
    reservedCharsOverride: reservedChars,
    apiMessages: Array.isArray(options.apiMessages) ? options.apiMessages : null
  })

  let latestUserIndex = -1
  for (let i = requestMessages.length - 1; i >= 0; i -= 1) {
    if (requestMessages[i]?.role === 'user') {
      latestUserIndex = i
      break
    }
  }

  const historyLines = (latestUserIndex > 0 ? requestMessages.slice(0, latestUserIndex) : [])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => {
      const text = truncateInlineText(extractEditableUserTextFromContent(extractRequestMessageTextContent(message.content)), 800)
      if (!text) return ''
      const roleLabel = message.role === 'assistant' ? '助手' : '用户'
      return `${roleLabel}: ${text}`
    })
    .filter(Boolean)

  const contextText = historyLines.length
    ? truncateText(historyLines.join('\n\n'), 6000, '（较早的对话上下文已截断）')
    : ''

  return [mediaSystemContent, contextText ? `参考最近对话上下文：\n${contextText}` : '', promptLead]
    .filter(Boolean)
    .join('\n\n')
}

function buildImageGenerationPromptFromHistory(userPrompt, options = {}) {
  return buildMediaGenerationPromptFromHistory(userPrompt, { ...options, mediaLabel: '图片' })
}

function buildVideoGenerationPromptFromHistory(userPrompt, options = {}) {
  return buildMediaGenerationPromptFromHistory(userPrompt, { ...options, mediaLabel: '视频' })
}

function hasToolStateMessages(messages) {
  return (Array.isArray(messages) ? messages : []).some((message) => {
    if (!message || typeof message !== 'object') return false
    return message.role === 'tool' || (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0)
  })
}

function shouldRetryToolContinuationAsPlainText(errorText) {
  const lower = String(errorText || '').toLowerCase()
  if (!lower) return false
  if (lower.includes('reasoning_content') && lower.includes('thinking mode')) return true
  if (lower.includes('reasoning_content') && lower.includes('passed back to the api')) return true
  if (lower.includes('request targeted an endpoint') && lower.includes('temporarily unavailable')) return true
  if (lower.includes('endpoint') && lower.includes('closed') && lower.includes('temporarily unavailable')) return true
  if (lower.includes('unsupported') && lower.includes('tool')) return true
  if (lower.includes('does not support') && lower.includes('tool')) return true
  return false
}

function buildRequestMessages(options = {}) {
  const {
    baseUrl = '',
    model = '',
    memorySystemContent = '',
    sessionRecord = null,
    forceReasoningContent = false,
    compatToolCallIdAsFc = false,
    visionFallbackText = '',
    fallbackAllVisionMessages = false,
    plainTextToolFallback = false,
    apiMessages = null,
    tools = []
  } = options || {}
  const sourceMessages = Array.isArray(apiMessages)
    ? apiMessages
    : buildRequestApiMessages('openai-compatible', {
        tools,
        contextSummary: sessionRecord?.contextSummary || null,
        sessionRecord
      })
  return buildChatRequestMessages({
    systemContent: buildCombinedSystemContent(memorySystemContent, { sessionRecord }),
    sourceMessages,
    needsReasoningContent: shouldIncludeReasoningContent({
      baseUrl,
      model,
      forceReasoningContent,
      apiMessages: sourceMessages
    }),
    compatToolCallIdAsFc,
    visionFallbackText,
    fallbackAllVisionMessages,
    plainTextToolFallback
  })
}

function resolveCurrentToolApprovalMode(abortState = abortController.value) {
  if (abortState && typeof abortState.toolApprovalMode === 'string') {
    return normalizeToolApprovalMode(abortState.toolApprovalMode)
  }
  const runRecord = getRunRecord(abortState)
  if (runRecord) {
    return normalizeToolApprovalMode(
      runRecord.toolApprovalMode,
      runRecord.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
    )
  }
  return normalizeToolApprovalMode(toolApprovalMode.value)
}

function closeMcpClientSafely(server, client, pooled = false) {
  try {
    if (pooled && server?._id) closePooledMCPClient(server._id)
    else client?.close?.()
  } catch {
    // ignore
  }
}

function registerAbortableMcpClient(abortState, server, client, pooled = false) {
  if (!abortState?.onAbort || !client) return null
  return abortState.onAbort(() => {
    closeMcpClientSafely(server, client, pooled)
  }) || null
}

function ensureMcpToolsStatus(serverId) {
  const id = String(serverId || '').trim()
  if (!id) return null
  if (!mcpToolsStatusByServerId[id]) {
    mcpToolsStatusByServerId[id] = {
      loading: false,
      toolCount: 0,
      updatedAt: 0,
      lastError: '',
      lastErrorAt: 0
    }
  }
  return mcpToolsStatusByServerId[id]
}

function getMcpToolsCacheKey(server) {
  const id = String(server?._id || '').trim()
  const fingerprint = stableStringify({
    transportType: server?.transportType,
    command: server?.command,
    args: server?.args,
    url: server?.url,
    method: server?.method,
    headers: server?.headers,
    env: server?.env,
    cwd: server?.cwd
  })
  return `${id}|${fingerprint}`
}

function normalizeMcpPromptList(server, list) {
  const serverId = String(server?._id || '').trim()
  const serverName = String(server?.name || serverId).trim()
  return (Array.isArray(list) ? list : [])
    .map((prompt) => {
      const name = String(prompt?.name || '').trim()
      if (!name) return null
      const description = String(prompt?.description || '').trim()
      return {
        serverId,
        serverName,
        name,
        label: `${serverName} / ${name}`,
        description,
        arguments: normalizeMcpPromptArgumentDefinitions(prompt),
        disabled: !!server?.disabled
      }
    })
    .filter(Boolean)
}

function filterAllowedMcpTools(server, list) {
  const allow = Array.isArray(server?.allowTools) ? server.allowTools.map((x) => String(x || '').trim()).filter(Boolean) : []
  if (!allow.length) return Array.isArray(list) ? list : []
  const enabledNames = new Set(allow)
  return (Array.isArray(list) ? list : []).filter((t) => enabledNames.has(String(t?.name || '').trim()))
}

async function listMcpToolsForServer(server, options = {}) {
  const forceRefresh = !!options.forceRefresh
  const silent = !!options.silent
  const abortState = options.abortState || null

  throwIfAborted(abortState)

  const serverId = String(server?._id || '').trim()
  if (!serverId) return { ok: false, tools: [], error: new Error('missing server id') }

  const status = ensureMcpToolsStatus(serverId)
  const cacheKey = getMcpToolsCacheKey(server)
  const now = Date.now()

  const cached = mcpListToolsCache.get(cacheKey)
  if (!forceRefresh && cached && now - cached.at < MCP_LIST_TOOLS_TTL_MS) {
    if (status) {
      status.loading = false
      status.toolCount = Array.isArray(cached.tools) ? cached.tools.length : 0
      status.updatedAt = cached.at
      status.lastError = ''
      status.lastErrorAt = 0
    }
    return { ok: true, tools: cached.tools, cached: true, updatedAt: cached.at }
  }

  const inflight = mcpListToolsInFlight.get(cacheKey)
  if (inflight) return abortState ? waitForAbortable(inflight, abortState) : inflight

  const promise = (async () => {
    if (status) status.loading = true

    let client = null
    let pooled = false
    let unregisterAbort = null
    try {
      ;({ client, pooled } = getOrCreateMCPClient(server))
      if (!client?.listTools) {
        throw new Error('MCP 客户端不可用（未注入 createMCPClient）')
      }

      const listTimeoutMs = Number(server?.timeout) || 10000
      unregisterAbort = registerAbortableMcpClient(abortState, server, client, pooled)
      const list = await waitForAbortable(
        withTimeout(client.listTools(), listTimeoutMs, `获取 MCP 工具列表：${server.name || server._id}`),
        abortState
      )
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      unregisterAbort = null
      throwIfAborted(abortState)
      releaseMCPClient(server, client)
      client = null

      const tools = Array.isArray(list) ? list : Array.isArray(list?.tools) ? list.tools : []
      const at = Date.now()
      mcpListToolsCache.set(cacheKey, { at, tools })

      if (status) {
        status.loading = false
        status.toolCount = tools.length
        status.updatedAt = at
        status.lastError = ''
        status.lastErrorAt = 0
      }

      return { ok: true, tools, cached: false, updatedAt: at }
    } catch (err) {
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      unregisterAbort = null

      if (isAbortError(err) || abortState?.aborted) {
        if (status) status.loading = false
        throw createAbortError()
      }

      closeMcpClientSafely(server, client, pooled)

      const errorText = err?.message || String(err)
      if (status) {
        status.loading = false
        status.lastError = errorText
        status.lastErrorAt = Date.now()
      }

      if (!silent) console.warn('listMcpToolsForServer failed', serverId, err)
      return { ok: false, tools: [], error: err }
    } finally {
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
    }
  })()

  mcpListToolsInFlight.set(cacheKey, promise)
  promise.finally(() => mcpListToolsInFlight.delete(cacheKey))
  return promise
}

async function listMcpPromptsForServer(server, options = {}) {
  const forceRefresh = !!options.forceRefresh
  const abortState = options.abortState || null
  throwIfAborted(abortState)

  const serverId = String(server?._id || '').trim()
  if (!serverId) return { ok: false, prompts: [], error: new Error('missing server id') }
  if (server?.disabled) return { ok: true, prompts: [], disabled: true }

  const cacheKey = getMcpToolsCacheKey(server)
  const now = Date.now()
  const cached = mcpListPromptsCache.get(cacheKey)
  if (!forceRefresh && cached && now - cached.at < MCP_LIST_PROMPTS_TTL_MS) {
    return { ok: true, prompts: cached.prompts, cached: true, updatedAt: cached.at }
  }

  const inflight = mcpListPromptsInFlight.get(cacheKey)
  if (inflight) return abortState ? waitForAbortable(inflight, abortState) : inflight

  const promise = (async () => {
    let client = null
    let pooled = false
    let unregisterAbort = null
    try {
      ;({ client, pooled } = getOrCreateMCPClient(server))
      if (!client?.listPrompts) {
        throw new Error('MCP 客户端不支持 prompts/list')
      }

      const listTimeoutMs = Number(server?.timeout) || 10000
      unregisterAbort = registerAbortableMcpClient(abortState, server, client, pooled)
      const list = await waitForAbortable(
        withTimeout(client.listPrompts(), listTimeoutMs, `获取 MCP 提示词列表：${server.name || server._id}`),
        abortState
      )
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      unregisterAbort = null
      throwIfAborted(abortState)
      releaseMCPClient(server, client)
      client = null

      const promptsList = Array.isArray(list) ? list : Array.isArray(list?.prompts) ? list.prompts : []
      const prompts = normalizeMcpPromptList(server, promptsList)
      const at = Date.now()
      mcpListPromptsCache.set(cacheKey, { at, prompts })
      return { ok: true, prompts, cached: false, updatedAt: at }
    } catch (err) {
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      closeMcpClientSafely(server, client, pooled)
      return { ok: false, prompts: [], error: err }
    } finally {
      mcpListPromptsInFlight.delete(cacheKey)
    }
  })()

  mcpListPromptsInFlight.set(cacheKey, promise)
  return promise
}

async function ensureMcpPromptCatalogLoaded(options = {}) {
  const forceRefresh = !!options.forceRefresh
  const silent = !!options.silent
  if (mcpPromptCatalogLoadPromise && !forceRefresh) return mcpPromptCatalogLoadPromise

  mcpPromptCatalogLoadPromise = (async () => {
    const servers = (Array.isArray(activeMcpServers.value) ? activeMcpServers.value : []).filter((server) => server && server._id && !server.disabled)
    if (!servers.length) {
      mcpPromptCatalog.value = []
      return []
    }

    loadingMcpPrompts.value = true
    try {
      const results = await Promise.all(servers.map((server) => listMcpPromptsForServer(server, { forceRefresh })))
      const promptsList = []
      results.forEach((result, index) => {
        if (result?.ok) {
          promptsList.push(...(Array.isArray(result.prompts) ? result.prompts : []))
          return
        }
        if (!silent) {
          const server = servers[index]
          message.warning(`MCP 提示词加载失败：${server?.name || server?._id || ''} ${result?.error?.message || result?.error || ''}`.trim())
        }
      })
      promptsList.sort((a, b) => String(a.serverName || '').localeCompare(String(b.serverName || ''), 'zh-Hans-CN') || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'))
      mcpPromptCatalog.value = promptsList
      return promptsList
    } finally {
      loadingMcpPrompts.value = false
      mcpPromptCatalogLoadPromise = null
    }
  })()

  return mcpPromptCatalogLoadPromise
}

function buildMcpPromptArgsFromModal() {
  const args = selectedMcpPromptArgs.value
  if (Array.isArray(args) && args.length) {
    return buildMcpArgsFromForm(args, promptMcpArgsForm)
  }

  return undefined
}

function buildLocalPromptArgsFromModal() {
  return buildPromptVariableValues(selectedLocalPromptVariables.value, promptUserArgsForm)
}

function stringifyPromptContentBlock(content) {
  if (content === undefined || content === null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(stringifyPromptContentBlock).filter(Boolean).join('\n\n')
  if (typeof content !== 'object') return String(content)

  const type = String(content.type || '').trim()
  if (type === 'text') return String(content.text || '').trim()
  if (type === 'image') return `[图片${content.mimeType ? `：${content.mimeType}` : ''}]`
  if (type === 'audio') return `[音频${content.mimeType ? `：${content.mimeType}` : ''}]`
  if (type === 'resource') {
    const resource = content.resource && typeof content.resource === 'object' ? content.resource : {}
    if (typeof resource.text === 'string') return resource.text
    if (resource.uri) return `[资源：${resource.uri}]`
  }
  if (content.uri) return `[资源：${content.uri}]`
  return stableStringify(content)
}

function formatMcpPromptResultForComposer(result, item) {
  const messages = Array.isArray(result?.messages) ? result.messages : []
  const serverName = String(item?.serverName || item?.serverId || '').trim()
  const promptName = String(item?.name || '').trim()
  const header = `MCP Prompt: ${[serverName, promptName].filter(Boolean).join(' / ')}`

  if (!messages.length) {
    const fallback = stringifyPromptContentBlock(result?.content ?? result?.text ?? result)
    return fallback ? `${header}\n\n${fallback}` : header
  }

  const blocks = messages
    .map((messageItem) => {
      const role = String(messageItem?.role || 'user').trim()
      const content = stringifyPromptContentBlock(messageItem?.content).trim()
      if (!content) return ''
      const roleLabel = role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : role === 'system' ? 'System' : role
      return `${roleLabel}:\n${content}`
    })
    .filter(Boolean)

  return [header, ...blocks].filter(Boolean).join('\n\n').trim()
}

function insertTextIntoComposer(text) {
  const insertion = String(text || '').trim()
  if (!insertion) return

  const raw = String(input.value || '')
  const el = getComposerTextareaEl()
  const start = el?.selectionStart ?? raw.length
  const end = el?.selectionEnd ?? start
  const before = raw.slice(0, start)
  const after = raw.slice(end)
  const prefix = before && !/[\s\n]$/.test(before) ? '\n\n' : ''
  const suffix = after && !/^[\s\n]/.test(after) ? '\n\n' : ''
  input.value = `${before}${prefix}${insertion}${suffix}${after}`
  focusComposerAt(before.length + prefix.length + insertion.length)
}

function formatLocalUserPromptForComposer(prompt, values) {
  const content = renderPromptTemplate(prompt?.content, values).trim()
  return content
}

async function applyMcpPromptToComposer(item, args) {
  const serverId = String(item?.serverId || '').trim()
  const promptName = String(item?.name || '').trim()
  if (!serverId || !promptName) return false

  const server = (mcpServers.value || []).find((candidate) => candidate?._id === serverId) || null
  if (!server || server.disabled) {
    message.warning('该 MCP 不可用，请先到设置页启用')
    return false
  }

  let client = null
  let pooled = false
  try {
    ;({ client, pooled } = getOrCreateMCPClient(server))
    if (!client?.getPrompt && !client?.sendRequest) throw new Error('MCP 客户端不支持 prompts/get')

    const timeoutMs = Number(server?.timeout) || 30000
    const result = await withTimeout(getMcpPrompt(client, promptName, args), timeoutMs, `获取 MCP 提示词：${server.name || server._id} / ${promptName}`)
    releaseMCPClient(server, client)
    client = null

    insertTextIntoComposer(formatMcpPromptResultForComposer(result, item))
    message.success('MCP 提示词已插入输入框，可编辑后发送')
    return true
  } catch (err) {
    closeMcpClientSafely(server, client, pooled)
    message.error('获取 MCP 提示词失败：' + (err?.message || String(err)))
    return false
  }
}

function applyLocalPromptToComposer(prompt, values) {
  const rendered = formatLocalUserPromptForComposer(prompt, values)
  if (!rendered) {
    message.warning('该用户提示词内容为空')
    return false
  }
  insertTextIntoComposer(rendered)
  message.success('用户提示词已插入输入框，可继续编辑后发送')
  return true
}

function normalizeOneLine(text, maxLen = 120) {
  const s = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return ''
  if (!maxLen || s.length <= maxLen) return s
  return s.slice(0, Math.max(0, maxLen - 3)) + '...'
}

function buildToolArgsHint(tool) {
  const schema = tool?.inputSchema
  if (!schema || typeof schema !== 'object') return null

  if (!isObjectLikeToolInputSchema(schema)) {
    const rawType = Array.isArray(schema?.type) ? schema.type.filter(Boolean).join('|') : String(schema?.type || '').trim()
    return rawType ? { input_type: rawType } : { input_type: 'any' }
  }

  const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {}
  const propKeys = Object.keys(props || {}).map((k) => String(k || '').trim()).filter(Boolean)

  const requiredRaw = Array.isArray(schema?.required) ? schema.required : []
  const required = requiredRaw.map((k) => String(k || '').trim()).filter(Boolean)
  const requiredSet = new Set(required)

  const optionalAll = propKeys.filter((k) => !requiredSet.has(k))
  const optional = optionalAll.slice(0, MCP_CATALOG_MAX_OPTIONAL_KEYS_PER_TOOL)
  const optionalTruncated = Math.max(0, optionalAll.length - optional.length)

  const out = {}
  if (required.length) out.required = required
  if (optional.length) out.optional = optional
  if (optionalTruncated > 0) out.optional_truncated = optionalTruncated

  return Object.keys(out).length ? out : null
}

function buildMcpToolHint(tool) {
  const name = String(tool?.name || '').trim()
  if (!name) return null
  const hint = { name }
  const d = normalizeOneLine(tool?.description || '', 90)
  if (d) hint.description = d
  const argsHint = buildToolArgsHint(tool)
  if (argsHint) Object.assign(hint, argsHint)
  return hint
}

function upsertPinnedMcpToolHint(serverId, tool) {
  const id = String(serverId || '').trim()
  if (!id) return
  const hint = buildMcpToolHint(tool)
  if (!hint?.name) return

  const prev = mcpPinnedToolHintsByServerId.get(id)
  const list = Array.isArray(prev) ? prev : []
  const next = [hint, ...list.filter((x) => String(x?.name || '') !== hint.name)]
  if (next.length > MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER) next.length = MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER
  mcpPinnedToolHintsByServerId.set(id, next)
  mcpPinnedToolHintsRevision.value += 1
}

function clearPinnedMcpToolHints() {
  try {
    mcpPinnedToolHintsByServerId.clear()
  } catch {
    // ignore
  }
  mcpPinnedToolHintsRevision.value += 1
}

function buildMcpToolCatalogEntry(server, tools) {
  const serverId = String(server?._id || '').trim()
  const serverName = String(server?.name || serverId).trim() || serverId

  const allow = Array.isArray(server?.allowTools) ? server.allowTools.map((x) => String(x || '').trim()).filter(Boolean) : []
  const allowMode = allow.length ? 'whitelist' : 'all'

  const allowed = filterAllowedMcpTools(server, tools)
  const allNames = allowed.map((t) => String(t?.name || '').trim()).filter(Boolean)
  const toolNames = allNames.slice(0, MCP_CATALOG_MAX_TOOL_NAMES_PER_SERVER)
  const toolNamesTruncated = allNames.length > toolNames.length

  const hints = []
  for (const t of allowed) {
    if (hints.length >= MCP_CATALOG_MAX_TOOL_HINTS_PER_SERVER) break
    const hint = buildMcpToolHint(t)
    // 只保留对参数有帮助的提示，避免无意义膨胀
    if (hint && (hint.description || hint.required || hint.optional || hint.input_type)) hints.push(hint)
  }

  return {
    ok: true,
    server_id: serverId,
    server_name: serverName,
    keepAlive: !!server?.keepAlive,
    allow_mode: allowMode,
    allow_count: allow.length,
    tool_count: allNames.length,
    tool_names: toolNames,
    tool_names_truncated: toolNamesTruncated,
    tool_hints: hints,
    updated_at: Date.now()
  }
}

function setMcpToolCatalogEntry(serverId, entry) {
  const id = String(serverId || '').trim()
  if (!id) return
  mcpToolCatalogByServerId.set(id, entry)
  mcpToolCatalogRevision.value += 1
}

function clearMcpToolCatalog() {
  try {
    mcpToolCatalogByServerId.clear()
  } catch {
    // ignore
  }
  mcpToolCatalogRevision.value += 1
}

async function warmMcpToolCatalogForServers(servers, options = {}) {
  const forceRefresh = !!options.forceRefresh
  const abortState = options.abortState || null
  const list = (Array.isArray(servers) ? servers : []).filter((s) => s && s._id && !s.disabled)
  if (!list.length) return

  throwIfAborted(abortState)
  const results = await Promise.allSettled(list.map((s) => listMcpToolsForServer(s, { forceRefresh, silent: true, abortState })))
  throwIfAborted(abortState)
  list.forEach((server, idx) => {
    const r = results[idx]
    if (!r || r.status !== 'fulfilled' || !r.value?.ok) {
      const err = r?.status === 'fulfilled' ? r.value?.error : r?.reason
      setMcpToolCatalogEntry(String(server._id), {
        ok: false,
        server_id: String(server._id),
        server_name: server.name || server._id,
        keepAlive: !!server.keepAlive,
        error: err?.message || String(err || 'listTools failed'),
        updated_at: Date.now()
      })
      return
    }

    const entry = buildMcpToolCatalogEntry(server, r.value.tools)
    setMcpToolCatalogEntry(String(server._id), entry)
  })
}

function makeToolFunctionName(serverId, toolName) {
  const raw = `mcp__${serverId}__${toolName}`
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (safe.length <= 64) return safe
  let hash = 0
  for (let i = 0; i < safe.length; i++) hash = (hash * 31 + safe.charCodeAt(i)) >>> 0
  return `${safe.slice(0, 55)}_${hash.toString(16).slice(0, 8)}`
}

function sanitizeToolInputSchemaForProvider(schemaRaw) {
  const schema = deepCopyJson(schemaRaw, null)
  const out = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : {}

  // OpenAI/兼容接口限制：顶层 schema 必须是 object，且不允许 anyOf/oneOf/allOf/enum/not 等关键字
  out.type = 'object'
  if (!out.properties || typeof out.properties !== 'object' || Array.isArray(out.properties)) out.properties = {}
  if (!('additionalProperties' in out)) out.additionalProperties = false
  if (!Array.isArray(out.required)) delete out.required

  delete out.oneOf
  delete out.anyOf
  delete out.allOf
  delete out.enum
  delete out.not

  return out
}

function isObjectLikeToolInputSchema(schemaRaw) {
  if (!schemaRaw || typeof schemaRaw !== 'object' || Array.isArray(schemaRaw)) return false
  const type = schemaRaw.type
  if (typeof type === 'string') return type === 'object'
  if (Array.isArray(type)) return type.includes('object')
  return !!(schemaRaw.properties && typeof schemaRaw.properties === 'object' && !Array.isArray(schemaRaw.properties))
}

function buildProviderToolDefinition(inputSchemaRaw) {
  const fallback = { type: 'object', properties: {}, additionalProperties: false }
  if (!inputSchemaRaw || typeof inputSchemaRaw !== 'object' || Array.isArray(inputSchemaRaw)) {
    return {
      parameters: fallback,
      wrapped: false,
      unwrapArgs(argsObj) {
        return argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? argsObj : {}
      }
    }
  }

  if (isObjectLikeToolInputSchema(inputSchemaRaw)) {
    return {
      parameters: sanitizeToolInputSchemaForProvider(inputSchemaRaw) || fallback,
      wrapped: false,
      unwrapArgs(argsObj) {
        return argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? argsObj : {}
      }
    }
  }

  const nested = deepCopyJson(inputSchemaRaw, null)
  return {
    parameters: {
      type: 'object',
      properties: {
        input: nested
      },
      required: ['input'],
      additionalProperties: false
    },
    wrapped: true,
    unwrapArgs(argsObj) {
      if (!argsObj || typeof argsObj !== 'object' || Array.isArray(argsObj)) return undefined
      return argsObj.input
    }
  }
}

function buildProviderToolDescription(server, tool, definition) {
  const base = tool?.description ? `[${server.name || server._id}] ${tool.description}` : `[${server.name || server._id}] ${tool?.name || ''}`
  if (!definition?.wrapped) return base
  return `${base} (the original inputSchema top level is not an object; call it with {"input": ...})`
}

async function buildToolsBundle(options = {}) {
  const abortState = options.abortState || null
  const targetSession = options.sessionTarget || getRunSessionTarget(abortState)
  const functionMap = new Map()
  const tools = []
  const finalizeBundle = () => {
    syncLastBuiltRequestToolsStats(tools)
    return { tools, map: functionMap }
  }

  throwIfAborted(abortState)

  if (webSearchEnabled.value) {
    functionMap.set('web_search', { type: 'internal', internal: 'web_search', serverName: '内置联网', toolName: 'web_search' })
    functionMap.set('web_read', { type: 'internal', internal: 'web_read', serverName: '内置联网', toolName: 'web_read' })
    tools.push(
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: INTERNAL_TOOL_SPECS.webSearch.description,
          parameters: INTERNAL_TOOL_SPECS.webSearch.parameters
        }
      },
      {
        type: 'function',
        function: {
          name: 'web_read',
          description: INTERNAL_TOOL_SPECS.webRead.description,
          parameters: INTERNAL_TOOL_SPECS.webRead.parameters
        }
      }
    )
  }

  const skillBundle = buildSkillToolsBundle({
    selectedSkills: runtimeSkillObjects.value,
    agentSkillIds: runtimeAgentSkillIds.value,
    internalToolSpecs: INTERNAL_TOOL_SPECS
  })
  skillBundle.tools.forEach((tool) => tools.push(tool))
  skillBundle.map.forEach((mapping, name) => functionMap.set(name, mapping))

  const servers = runtimeMcpServers.value.filter((s) => s && !s.disabled && s._id)

  const desiredMode = String(toolMode.value || 'auto')
  let mode = desiredMode
  if (mode !== 'expanded' && mode !== 'compact') mode = 'auto'

  const addCompactMcpTools = () => {
    functionMap.set('mcp_discover', { type: 'internal', internal: 'mcp_discover', serverName: 'MCP', toolName: 'mcp_discover' })
    functionMap.set('mcp_call', { type: 'internal', internal: 'mcp_call', serverName: 'MCP', toolName: 'mcp_call' })

    tools.push(
      {
        type: 'function',
        function: {
          name: 'mcp_discover',
          description: INTERNAL_TOOL_SPECS.mcpDiscover.description,
          parameters: INTERNAL_TOOL_SPECS.mcpDiscover.parameters
        }
      },
      {
        type: 'function',
        function: {
          name: 'mcp_call',
          description: INTERNAL_TOOL_SPECS.mcpCall.description,
          parameters: INTERNAL_TOOL_SPECS.mcpCall.parameters
        }
      }
    )
  }

  if (isDefaultGeneralAgent.value && servers.length) {
    effectiveToolMode.value = 'compact'
    addCompactMcpTools()
    return finalizeBundle()
  }

  if (mode === 'compact') {
    effectiveToolMode.value = 'compact'

    // 保持 keepAlive 行为：在精简模式下也尽量预连接需要长连接的 MCP
    servers
      .filter((s) => s && s.keepAlive)
      .forEach((s) => {
        try {
          getOrCreateMCPClient(s)
        } catch {
          // ignore
        }
      })

    addCompactMcpTools()
    await warmMcpToolCatalogForServers(servers, { forceRefresh: false, abortState })
    throwIfAborted(abortState)
    return finalizeBundle()
  }

  const shouldUseCompactByAuto = async () => {
    if (mode !== 'auto') return false
    let total = 0
    for (const server of servers) {
      throwIfAborted(abortState)
      const listResult = await listMcpToolsForServer(server, { silent: true, abortState })
      if (!listResult.ok) continue
      const allowed = filterAllowedMcpTools(server, listResult.tools)
      total += allowed.length
      if (total > MAX_EXPANDED_TOOL_COUNT) return true
    }
    return false
  }

  if (await shouldUseCompactByAuto()) {
    effectiveToolMode.value = 'compact'
    servers
      .filter((s) => s && s.keepAlive)
      .forEach((s) => {
        try {
          getOrCreateMCPClient(s)
        } catch {
          // ignore
        }
      })
    addCompactMcpTools()
    await warmMcpToolCatalogForServers(servers, { forceRefresh: false, abortState })
    throwIfAborted(abortState)
    return finalizeBundle()
  }

  effectiveToolMode.value = 'expanded'

  for (const server of servers) {
    throwIfAborted(abortState)
    const listResult = await listMcpToolsForServer(server, { silent: true, abortState })
    if (!listResult.ok) {
      const err = listResult.error || new Error('listTools failed')
      throwIfAborted(abortState)
      targetSession.messages.push(
        createDisplayMessage(
          'tool',
          `### MCP 工具加载失败\n- 服务：**${server.name || server._id}**\n- 错误：${err.message || String(err)}`,
          { toolMeta: `${server.name || server._id} / MCP` }
        )
      )
      continue
    }

    const allowedTools = filterAllowedMcpTools(server, listResult.tools)
    throwIfAborted(abortState)
    for (const t of allowedTools) {
      if (!t?.name) continue
      const fnName = makeToolFunctionName(server._id, t.name)
      const toolDef = buildProviderToolDefinition(t.inputSchema)
      const approvalPolicy = resolveMcpToolApprovalPolicy(t)
      functionMap.set(fnName, {
        type: 'mcp',
        serverId: server._id,
        toolName: t.name,
        serverName: server.name || server._id,
        toolTitle: String(t.annotations?.title || '').trim(),
        toolDescription: String(t.description || '').trim(),
        transportType: server.transportType,
        forceApproval: approvalPolicy.forceApproval,
        hardApproval: approvalPolicy.hardApproval,
        approvalKind: approvalPolicy.approvalKind,
        approvalReason: approvalPolicy.approvalReason,
        annotations: t.annotations || null,
        unwrapArgs: toolDef.unwrapArgs
      })

      tools.push({
        type: 'function',
        function: {
          name: fnName,
          description: buildProviderToolDescription(server, t, toolDef),
          parameters: toolDef.parameters
        }
      })
    }
  }

  throwIfAborted(abortState)
  return finalizeBundle()
}

function createDisplayMessage(role, content = '', extra = {}) {
  const defaultRender = role === 'assistant' || role === 'thinking'
    ? 'text'
    : role === 'user'
      ? inferUserDisplayMessageRender(content)
      : 'md'
  const base = { id: newId(), role, content, time: nextDisplayMessageTime(), render: defaultRender }
  if (role === 'tool' || role === 'tool_call') {
    base.toolExpanded = false
    base.toolMeta = ''
    base.toolStatus = role === 'tool_call' ? 'running' : ''
    base.toolName = ''
    base.toolServerName = ''
    base.toolTitle = ''
    base.toolDescription = ''
    base.toolCallId = ''
    base.toolArgsText = ''
    base.toolAutoApproved = false
    base.toolSubMeta = ''
    base.toolTraceStreamId = ''
    base.toolLiveTrace = []
    base.toolAgentName = ''
    base.toolLiveFinalContent = ''
    base.toolLiveFinalReasoning = ''
    base.toolLiveRound = 0
    base.toolResultPayload = null
  }
  return reactive({ ...base, ...extra })
}

function resolveSelectedSkillTarget({ idCandidate = '', nameCandidate = '' } = {}) {
  return resolveSelectedSkillTargetFromList(runtimeSkillObjects.value, {
    idCandidate,
    nameCandidate
  })
}

function listSelectedSkillsBrief(limit = 30) {
  return listSelectedSkillsBriefFromList(runtimeSkillObjects.value, limit)
}

function normalizeSkillScriptPathCandidate(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function buildSkillScriptChoiceList(skill, limit = 20) {
  return getSkillScriptCatalog(skill)
    .slice(0, limit)
    .map((entry) => ({
      path: entry.path,
      name: entry.name || undefined,
      entry: !!entry.isLikelyEntrypoint || undefined,
      runtime: entry.runtime || undefined,
      description: entry.description || undefined,
      when_to_use: entry.whenToUse || undefined,
      output_type: entry.outputType || undefined
    }))
}

function resolveSkillScriptTarget(skill, pathCandidate = '') {
  const catalog = getSkillScriptCatalog(skill)
  if (!catalog.length) {
    return {
      ok: false,
      error: '当前技能没有可执行脚本',
      catalog: []
    }
  }

  const raw = normalizeSkillScriptPathCandidate(pathCandidate)
  if (!raw) {
    if (catalog.length === 1) {
      return {
        ok: true,
        path: catalog[0].path,
        entry: catalog[0],
        inferred: true
      }
    }
    return {
      ok: false,
      error: `path 不能为空；可用脚本：${stableStringify(buildSkillScriptChoiceList(skill))}`,
      catalog
    }
  }

  const norm = raw.toLowerCase()
  const prefixed = norm.startsWith('scripts/') ? norm : `scripts/${norm}`
  const basename = norm.split('/').pop() || norm
  const basenameNoExt = basename.replace(/\.[^.]+$/, '')
  const pushUnique = (target, entry) => {
    if (!entry?.path) return
    if (target.some((item) => item.path === entry.path)) return
    target.push(entry)
  }

  const matches = []

  catalog.forEach((entry) => {
    const entryPath = String(entry?.path || '').trim().toLowerCase()
    if (entryPath === norm || entryPath === prefixed) pushUnique(matches, entry)
  })

  if (!matches.length) {
    catalog.forEach((entry) => {
      const entryName = String(entry?.name || '').trim().toLowerCase()
      if (entryName && entryName === norm) pushUnique(matches, entry)
    })
  }

  if (!matches.length) {
    catalog.forEach((entry) => {
      const entryBase = String(entry?.path || '').trim().toLowerCase().split('/').pop() || ''
      const entryBaseNoExt = entryBase.replace(/\.[^.]+$/, '')
      if (entryBase === basename || entryBaseNoExt === basenameNoExt) pushUnique(matches, entry)
    })
  }

  if (matches.length === 1) {
    return {
      ok: true,
      path: matches[0].path,
      entry: matches[0],
      inferred: normalizeSkillScriptPathCandidate(pathCandidate) !== matches[0].path
    }
  }

  if (matches.length > 1) {
    return {
      ok: false,
      error: `脚本路径不唯一，请改用完整 path。候选：${stableStringify(buildSkillScriptChoiceList({ cache: { scriptCatalog: matches } }))}`,
      catalog
    }
  }

  const normalizedFileIndex = getSkillFileIndex(skill)
  const directPath = [raw, prefixed]
    .map((item) => normalizeSkillScriptPathCandidate(item))
    .find((candidate) => candidate && normalizedFileIndex.scripts.includes(candidate) && isRunnableSkillScriptPath(candidate))

  if (directPath) {
    return {
      ok: true,
      path: directPath,
      entry: {
        path: directPath,
        name: directPath.split('/').pop()?.replace(/\.[^.]+$/, '') || directPath,
        description: '',
        whenToUse: '',
        outputType: 'text'
      },
      inferred: normalizeSkillScriptPathCandidate(pathCandidate) !== directPath
    }
  }

  return {
    ok: false,
    error: `未找到脚本：${raw}。可用脚本：${stableStringify(buildSkillScriptChoiceList(skill))}`,
    catalog
  }
}

function resolveActiveMcpServer({ idCandidate = '', nameCandidate = '' } = {}) {
  const list = Array.isArray(runtimeMcpServers.value) ? runtimeMcpServers.value : []

  const id = String(idCandidate || '').trim()
  if (id) {
    const hit = list.find((s) => String(s?._id || '').trim() === id)
    if (hit) return hit
  }

  const name = String(nameCandidate || '').trim()
  if (name) {
    const norm = name.toLowerCase()
    return (
      list.find((s) => String(s?.name || '').trim().toLowerCase() === norm) ||
      list.find((s) => String(s?._id || '').trim().toLowerCase() === norm) ||
      list.find((s) => String(s?.name || '').trim().toLowerCase().includes(norm)) ||
      null
    )
  }

  return null
}

function listActiveMcpServersBrief(limit = 30) {
  const list = Array.isArray(runtimeMcpServers.value) ? runtimeMcpServers.value : []
  return list
    .filter((s) => s && s._id && !s.disabled)
    .map((s) => ({
      id: s._id,
      name: s.name || s._id,
      keepAlive: !!s.keepAlive,
      allowTools: Array.isArray(s.allowTools) && s.allowTools.length ? s.allowTools.length : 'all'
    }))
    .slice(0, limit)
}

function getSkillMcpStatus(skill) {
  const mcpIds = Array.isArray(skill?.mcp) ? skill.mcp.map((x) => String(x || '').trim()).filter(Boolean) : []
  const mcpList = Array.isArray(mcpServers.value) ? mcpServers.value : []
  const mcpById = new Map(mcpList.filter((s) => s && s._id).map((s) => [String(s._id), s]))
  const mountedMcpIds = mcpIds.filter((id) => mcpById.has(String(id)))
  const missingMcpIds = mcpIds.filter((id) => !mcpById.has(String(id)))
  const mountedNames = mountedMcpIds.map((id) => mcpById.get(String(id))?.name || id)
  return { mcpIds, mountedMcpIds, missingMcpIds, mountedNames }
}

function getWebOperationsApi() {
  return globalThis?.aiToolsApi?.web || null
}

function getBuiltinSkillsApi() {
  return globalThis?.aiToolsApi?.dangerous?.skills || null
}

const builtinSkillActionCatalog = createBuiltinSkillActionCatalog((skillId) => {
  const api = getBuiltinSkillsApi()
  if (typeof api?.listActions !== 'function') {
    throw new Error('preload 未注入内置 Skill 动作 API')
  }
  return api.listActions(skillId)
})

function getWebToolMissingText() {
  return '内置联网服务不可用：preload 未注入 aiToolsApi.web。请在 uTools 插件环境中运行，或重新构建插件。'
}

const WEB_TOOL_RESULT_GUIDANCE = '这些结果来自本次运行的联网工具。请优先基于工具结果回答，不要因为模型知识截止时间更早而反复搜索同一问题；资料不足时说明不足。'

function buildWebToolModelContent(result) {
  const payload = result && typeof result === 'object' ? deepCopyJson(result, {}) : {}
  return stableStringify({
    guidance: WEB_TOOL_RESULT_GUIDANCE,
    ...payload
  })
}

function formatWebSearchDisplay(result) {
  const query = String(result?.query || '').trim()
  const items = Array.isArray(result?.results) ? result.results : []
  const lines = [`### 联网搜索结果${query ? `：${query}` : ''}`]
  if (!items.length) {
    lines.push('', '未找到可用结果。')
    if (result?.error) lines.push(`错误：${result.error}`)
    return lines.join('\n')
  }
  items.forEach((item, index) => {
    const title = String(item?.title || item?.url || `结果 ${index + 1}`).trim()
    const url = String(item?.url || '').trim()
    const snippet = truncateInlineText(item?.snippet || '', 360)
    lines.push('', `${index + 1}. ${url ? `[${title}](${url})` : title}`)
    if (snippet) lines.push(`   ${snippet}`)
  })
  return lines.join('\n')
}

function formatWebReadDisplay(result) {
  const title = String(result?.title || result?.finalUrl || result?.url || '网页').trim()
  const url = String(result?.finalUrl || result?.url || '').trim()
  const description = truncateInlineText(result?.description || '', 280)
  const totalChars = Number(result?.totalChars)
  const text = truncateInlineText(result?.text || '', 1200)
  const lines = [`### 网页读取结果：${title}`]
  if (url) lines.push(`- 来源：${url}`)
  if (description) lines.push(`- 描述：${description}`)
  if (Number.isFinite(totalChars) && totalChars > 0) {
    lines.push(`- 正文：${totalChars} 字${result?.truncated ? '（已截断）' : ''}`)
  }
  if (text) lines.push('', '#### 摘录', text)
  return lines.join('\n')
}

function buildWebToolSubMeta(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const kind = String(payload.kind || '').trim()
  if (kind === 'web_search_result') {
    const count = Array.isArray(payload.results) ? payload.results.length : 0
    const engine = String(payload.engine || '').trim()
    return [`结果 ${count} 条`, engine].filter(Boolean).join(' · ')
  }
  if (kind === 'web_read_result') {
    const title = truncateInlineText(payload.title || payload.finalUrl || payload.url || '', 42)
    const totalChars = Number(payload.totalChars)
    return [title, Number.isFinite(totalChars) && totalChars > 0 ? `${totalChars} 字` : ''].filter(Boolean).join(' · ')
  }
  return ''
}

async function executeBuiltinWebTool({ mapping, argsObj, serverName, toolName, abortState = null }) {
  const api = getWebOperationsApi()
  if (!api) {
    return { ok: false, content: getWebToolMissingText(), display: `### 联网工具结果\n- 错误：${getWebToolMissingText()}` }
  }

  const internal = String(mapping?.internal || '').trim()
  if (internal === 'web_search') {
    const query = String(argsObj?.query ?? argsObj?.q ?? '').trim()
    const limit = Math.min(Math.max(1, Math.floor(Number(argsObj?.limit) || 5)), 10)
    if (!query) {
      const errorText = 'query 不能为空'
      return { ok: false, content: errorText, display: `### 联网搜索结果\n- 错误：${errorText}` }
    }
    throwIfAborted(abortState)
    const result = await waitForAbortable(Promise.resolve(api.webSearch({ query, limit })), abortState)
    throwIfAborted(abortState)
    return {
      ok: result?.ok !== false,
      content: buildWebToolModelContent(result),
      display: formatWebSearchDisplay(result),
      payload: {
        kind: 'web_search_result',
        ...(result && typeof result === 'object' ? deepCopyJson(result, {}) : {})
      },
      serverName,
      toolName
    }
  }

  if (internal === 'web_read') {
    const url = String(argsObj?.url || '').trim()
    const maxChars = Math.min(Math.max(1000, Math.floor(Number(argsObj?.maxChars) || 12000)), 40000)
    if (!url) {
      const errorText = 'url 不能为空'
      return { ok: false, content: errorText, display: `### 网页读取结果\n- 错误：${errorText}` }
    }
    throwIfAborted(abortState)
    const result = await waitForAbortable(Promise.resolve(api.webRead({ url, maxChars })), abortState)
    throwIfAborted(abortState)
    return {
      ok: true,
      content: buildWebToolModelContent(result),
      display: formatWebReadDisplay(result),
      payload: {
        kind: 'web_read_result',
        ...(result && typeof result === 'object' ? deepCopyJson(result, {}) : {})
      },
      serverName,
      toolName
    }
  }

  return { ok: false, content: `未知联网工具：${internal}`, display: `### 联网工具结果\n- 错误：未知联网工具：${internal}` }
}

function normalizeToolCallExecutionContext(toolCall, toolMap) {
  const fn = toolCall?.function?.name
  const argsRaw = toolCall?.function?.arguments || ''
  const toolCallId = String(toolCall?.id || '').trim()
  const toolExecutionId = `tool_exec_${newId()}`
  const mapping = toolMap.get(fn)
  const serverName = mapping?.serverName || '未知'
  const toolName = mapping?.toolName || fn
  const toolTitle = String(mapping?.toolTitle || '').trim()
  const toolDescription = String(mapping?.toolDescription || '').trim()
  const parsedArgs = safeJsonParse(argsRaw)
  const argsObj = parsedArgs.ok && parsedArgs.value && typeof parsedArgs.value === 'object' ? parsedArgs.value : {}
  const argsText = parsedArgs.ok ? stableStringify(parsedArgs.value) : argsRaw

  return {
    toolCall,
    toolCallId,
    toolExecutionId,
    fn,
    mapping,
    serverName,
    toolName,
    toolTitle,
    toolDescription,
    argsRaw,
    argsObj,
    argsText: argsText || '{}'
  }
}

async function hydrateSkillGatewayExecutionContext(context, abortState = null) {
  if (context?.mapping?.type !== 'internal' || context.mapping.internal !== 'skill_call') {
    return context
  }

  let resolved = null
  try {
    throwIfAborted(abortState)
    resolved = await waitForAbortable(
      resolveBuiltinSkillCall({
        selectedSkills: selectedSkillObjects.value,
        catalog: builtinSkillActionCatalog,
        args: context.argsObj,
        isSkillLoaded: isSkillPromptContentLoaded
      }),
      abortState
    )
    throwIfAborted(abortState)
  } catch (err) {
    if (isAbortError(err) || abortState?.aborted) throw createAbortError()
    resolved = { ok: false, error: err?.message || String(err) }
  }

  if (!resolved?.ok) {
    return {
      ...context,
      mapping: {
        ...context.mapping,
        gatewayError: resolved?.error || 'Skill Action 解析失败',
        gatewayDetails: resolved || null
      }
    }
  }

  return {
    ...context,
    mapping: resolved.mapping,
    serverName: resolved.mapping.serverName,
    toolName: resolved.mapping.toolName,
    toolTitle: String(resolved.mapping.toolTitle || '').trim(),
    toolDescription: String(resolved.mapping.toolDescription || '').trim(),
    argsObj: resolved.args,
    argsText: stableStringify(resolved.args)
  }
}

function resolveToolApprovalTarget(context = {}) {
  const mapping = context.mapping || {}
  let serverId = String(mapping.serverId || '').trim()
  let serverName = String(mapping.serverName || context.serverName || '').trim() || '未知'
  let toolName = String(mapping.toolName || context.toolName || '').trim() || 'unknown'
  let argsObj = context.argsObj && typeof context.argsObj === 'object' ? context.argsObj : {}
  let argsText = String(context.argsText || '{}').trim() || '{}'
  let server = serverId ? runtimeMcpServers.value.find((item) => String(item?._id || '') === serverId) : null

  if (mapping?.type === 'internal' && mapping.internal === 'mcp_call') {
    const wrapperArgs = argsObj
    const serverIdCandidate = String(wrapperArgs?.server_id ?? wrapperArgs?.serverId ?? wrapperArgs?.id ?? '').trim()
    const serverNameCandidate = String(wrapperArgs?.server_name ?? wrapperArgs?.serverName ?? wrapperArgs?.server ?? '').trim()
    server = resolveActiveMcpServer({ idCandidate: serverIdCandidate, nameCandidate: serverNameCandidate })
    serverId = String(server?._id || serverIdCandidate).trim()
    serverName = String(server?.name || server?._id || serverNameCandidate || serverName).trim() || '未知'
    toolName = String(wrapperArgs?.tool || toolName).trim() || 'unknown'
    if (Object.prototype.hasOwnProperty.call(wrapperArgs, 'args')) {
      argsObj = wrapperArgs.args
    } else if (Object.prototype.hasOwnProperty.call(wrapperArgs, 'arguments')) {
      argsObj = wrapperArgs.arguments
    } else {
      argsObj = {}
    }
    argsText = stableStringify(argsObj)
  } else if (typeof mapping?.unwrapArgs === 'function') {
    try {
      argsObj = mapping.unwrapArgs(argsObj)
      argsText = stableStringify(argsObj)
    } catch {
      // Keep the original model arguments for approval display if unwrapping fails.
    }
  }

  if (mapping?.type === 'internal' && mapping.internal === 'run_skill_script') {
    argsObj = normalizeSkillScriptApprovalArgs(argsObj, {
      resolveSkill: resolveSelectedSkillTarget,
      resolveScript: resolveSkillScriptTarget
    })
    argsText = stableStringify(argsObj)
  }

  let resolvedTool = null
  if (server && toolName) {
    const cachedTools = mcpListToolsCache.get(getMcpToolsCacheKey(server))?.tools
    if (Array.isArray(cachedTools)) {
      resolvedTool = cachedTools.find((tool) => String(tool?.name || '').trim() === toolName) || null
    }
  }
  const isMcpTool =
    mapping?.type === 'mcp' ||
    (mapping?.type === 'internal' && mapping?.internal === 'mcp_call')
  const resolvedPolicy = isMcpTool
    ? resolveMcpToolApprovalPolicy(resolvedTool || {
        name: toolName,
        annotations: mapping.annotations || null
      })
    : {
        forceApproval: false,
        hardApproval: false,
        approvalKind: 'tool',
        approvalReason: ''
      }
  const configuredApprovalKind = String(mapping.approvalKind || resolvedPolicy.approvalKind || '').trim()
  const isShell = configuredApprovalKind === 'shell'
  const approvalKind =
    isShell
      ? 'shell'
      : configuredApprovalKind === 'execution'
        ? 'execution'
        : 'tool'
  const forceApproval =
    isShell ||
    configuredApprovalKind === 'execution' ||
    mapping.forceApproval === true ||
    resolvedPolicy.forceApproval === true
  const hardApproval =
    mapping.hardApproval === true ||
    resolvedPolicy.hardApproval === true ||
    (isShell && isDangerousShellApprovalCommand(argsObj, argsText))
  const approvalReason =
    isShell && hardApproval
      ? '命令包含删除、系统修改或其他明显破坏性操作'
      : isShell
        ? '低风险模式下，命令执行需要确认具体命令和工作目录'
        : configuredApprovalKind === 'execution'
          ? '低风险模式下，技能脚本或代码执行需要确认具体脚本和参数'
          : String(mapping.approvalReason || resolvedPolicy.approvalReason || (
              mapping.forceApproval === true ? '技能将写入数据或改变外部状态' : ''
            )).trim()

  return {
    server,
    serverId,
    serverName,
    toolName,
    toolTitle: String(resolvedTool?.annotations?.title || mapping.toolTitle || context.toolTitle || '').trim(),
    toolDescription: String(resolvedTool?.description || mapping.toolDescription || context.toolDescription || '').trim(),
    argsObj,
    argsText: String(argsText || '{}').trim() || '{}',
    approvalKind,
    forceApproval,
    hardApproval,
    approvalReason
  }
}

async function prepareToolCallExecution(toolCall, toolMap, lastReasoningText, abortState = null) {
  const targetSession = getRunSessionTarget(abortState)
  const targetRecord = getRunRecord(abortState) || getActiveMemorySession()
  throwIfAborted(abortState)
  const normalizedContext = normalizeToolCallExecutionContext(toolCall, toolMap)
  const context = await hydrateSkillGatewayExecutionContext(normalizedContext, abortState)
  const approvalTarget = resolveToolApprovalTarget(context)
  const usesCommandWorkspace =
    approvalTarget.approvalKind === 'shell' ||
    String(approvalTarget.serverId || '').trim() === BUILTIN_SHELL_SKILL_ID
  const availableHostWorkspacePath = usesCommandWorkspace
    ? resolveSessionHostWorkspacePath(targetRecord)
    : ''
  const commandWorkspaceScope = usesCommandWorkspace
    ? resolveChatToolWorkspaceScope(
        approvalTarget.toolName,
        approvalTarget.argsObj,
        { hasHostWorkspace: !!availableHostWorkspacePath }
      )
    : ''
  const approvedHostWorkspacePath =
    availableHostWorkspacePath &&
    (commandWorkspaceScope === 'host' || commandWorkspaceScope === 'all')
      ? availableHostWorkspacePath
      : ''
  const approvalKeyArgs = usesCommandWorkspace
    ? {
        ...approvalTarget.argsObj,
        workspace_scope: commandWorkspaceScope,
        ...(approvedHostWorkspacePath
          ? { __host_workspace_path: approvedHostWorkspacePath }
          : {})
      }
    : approvalTarget.argsObj
  const approvalKey = buildSessionToolApprovalKey({
    sessionId: String(targetRecord?.id || 'chat'),
    serverId: approvalTarget.serverId,
    serverName: approvalTarget.serverName,
    toolName: approvalTarget.toolName,
    approvalKind: approvalTarget.approvalKind,
    args: approvalKeyArgs,
    argsText: approvalTarget.argsText
  })
  const currentApprovalMode = resolveCurrentToolApprovalMode(abortState)
  const autoApproved =
    sessionApprovedToolKeys.has(approvalKey) ||
    evaluateToolApproval({
      mode: currentApprovalMode,
      forceApproval: approvalTarget.forceApproval === true,
      hardApproval: approvalTarget.hardApproval === true,
      interactive: true
    }).action === 'allow'

  const pendingToolMessage = createPendingToolExecutionMessage({
    serverName: approvalTarget.serverName,
    toolName: approvalTarget.toolName,
    toolTitle: approvalTarget.toolTitle,
    toolDescription: approvalTarget.toolDescription,
    argsText: approvalTarget.argsText,
    autoApproved: autoApproved,
    argsObj: approvalTarget.argsObj,
    toolCallId: context.toolCallId,
    toolExecutionId: context.toolExecutionId,
    toolSessionId: String(targetRecord?.id || '').trim()
  })
  pendingToolMessage.toolAbortState = abortState || null
  pendingToolMessage.toolApprovalMode = currentApprovalMode
  if (usesCommandWorkspace) {
    const chatWorkspaceId = buildChatSandboxWorkspaceId(
      targetRecord?.id || activeMemorySessionId.value || 'default'
    )
    pendingToolMessage.toolSubMeta =
      commandWorkspaceScope === 'all'
        ? approvedHostWorkspacePath
          ? `检索：会话沙盒 ${chatWorkspaceId} + 本机工作区 ${approvedHostWorkspacePath}`
          : `会话沙盒：${chatWorkspaceId}`
        : commandWorkspaceScope === 'host'
          ? `本机工作区：${approvedHostWorkspacePath || '未选择'}`
          : `会话沙盒：${chatWorkspaceId}`
  }
  targetSession.messages.push(pendingToolMessage)
  await maybeScrollToBottomForRun(abortState)

  if (!context.mapping) {
      targetSession.messages.push(
        createToolExecutionResultMessage(`### 工具结果\n- 错误：未在工具注册表中找到：${context.fn}`, {
          toolMeta: `${context.serverName} / ${context.toolName}`
        }, context.toolCallId, context.toolExecutionId)
      )
    return {
      ...context,
      pendingToolMessage,
      skipped: true,
      execResult: { ok: false, content: `未在工具注册表中找到：${context.fn}` }
    }
  }

  if (!autoApproved) {
    const ok = await confirmToolCall({
      serverName: approvalTarget.serverName,
      toolName: approvalTarget.toolName,
      argsText: approvalTarget.argsText,
      reasoningText: lastReasoningText,
      abortState,
      sessionId: String(targetRecord?.id || 'chat'),
      sessionTitle: resolveMemorySessionTitle(targetRecord),
      approvalKind: approvalTarget.approvalKind,
      hardApproval: approvalTarget.hardApproval === true,
      extraLines: [
        ...(approvalTarget.approvalReason
          ? [`需要确认：${approvalTarget.approvalReason}`]
          : []),
        ...(approvedHostWorkspacePath
          ? [`本机工作区：${approvedHostWorkspacePath}`]
          : usesCommandWorkspace && commandWorkspaceScope === 'sandbox'
            ? ['执行位置：会话沙盒']
            : [])
      ],
      rememberText:
        approvalTarget.approvalKind === 'shell'
          ? '本会话允许相同命令'
          : approvalTarget.approvalKind === 'execution'
            ? '本会话允许相同脚本调用'
            : '本会话允许此工具',
      onRememberForSession: () => sessionApprovedToolKeys.add(approvalKey)
    })
    if (ok === null) throw createAbortError()
    throwIfAborted(abortState)
    if (!ok) {
      targetSession.messages.push(
        createToolExecutionResultMessage(`### 工具结果\n- 工具：\`${context.toolName}\`\n- 状态：**已拒绝**`, {
          toolMeta: `${context.serverName} / ${context.toolName}`
        }, context.toolCallId, context.toolExecutionId)
      )
      return {
        ...context,
        pendingToolMessage,
        skipped: true,
        execResult: {
          ok: false,
          content: [
            'TOOL_REJECTED',
            `tool_name: ${context.toolName}`,
            `server_name: ${context.serverName}`,
            'status: rejected',
            'reason: user_denied',
            'message: The user explicitly rejected this tool call.',
            'guidance: Do not claim the tool failed. Treat this as a user decision and continue by either explaining what can be done without the tool, asking for permission to use an alternative approach, or waiting for new user instructions.'
          ].join('\n')
        }
      }
    }
  }

  return {
    ...context,
    autoApproved,
    pendingToolMessage,
    skipped: false
  }
}

function getToolCallParallelExecutionKey(prepared = {}) {
  const mapping = prepared?.mapping
  if (mapping?.type === 'internal' && mapping.internal === 'mcp_call') {
    const argsObj = prepared?.argsObj && typeof prepared.argsObj === 'object' ? prepared.argsObj : {}
    const serverIdCandidate = String(argsObj?.server_id ?? argsObj?.serverId ?? argsObj?.id ?? '').trim()
    const serverNameCandidate = String(argsObj?.server_name ?? argsObj?.serverName ?? argsObj?.server ?? '').trim()
    const server = resolveActiveMcpServer({ idCandidate: serverIdCandidate, nameCandidate: serverNameCandidate })
    if (server?.keepAlive && server?._id) return `mcp-call:${server._id}`
    return `parallel:${newId()}`
  }

  if (mapping?.type === 'mcp') {
    const server = runtimeMcpServers.value.find((s) => s._id === mapping.serverId)
    if (server?.keepAlive && server?._id) return `mcp:${server._id}`
    return `parallel:${newId()}`
  }

  if (mapping?.type === 'skill' && mapping?.skillId) {
    return `skill:${mapping.skillId}`
  }

  return `parallel:${newId()}`
}

const executePreparedSkillTool = createPreparedSkillToolExecutor({
  activatedAgentSkillIds,
  agentSkillIdSet: runtimeAgentSkillIdSet,
  buildToolExecutionResultSubMeta,
  buildWebToolSubMeta,
  builtinSkillActionCatalog,
  deepCopyJson,
  executeBuiltinWebTool,
  extractChatImagesFromToolResult,
  getBuiltinSkillsApi,
  getLoadedSkillFilePathSet,
  getSkillMcpStatus,
  hasLoadedSkillMainContent,
  listSelectedSkillsBrief,
  loadSkillMainContent,
  loadedSkillContentById,
  loadedSkillFileCacheBySkillId,
  markSkillActivationPersistent,
  maybeScrollToBottomForRun,
  mcpServers,
  prepareBuiltinAgentToolCallArgs,
  resolveSelectedSkillTarget,
  resolveSkillScriptTarget,
  searchCapabilities,
  selectedSkillObjects: runtimeSkillObjects
})

const executePreparedMcpTool = createPreparedMcpToolExecutor({
  activeMcpServers: runtimeMcpServers,
  buildMcpToolCatalogEntry,
  buildToolExecutionResultSubMeta,
  closeMcpClientSafely,
  deepCopyJson,
  extractChatImagesFromToolResult,
  filterAllowedMcpTools,
  listActiveMcpServersBrief,
  listMcpToolsForServer,
  maybeScrollToBottomForRun,
  registerAbortableMcpClient,
  resolveActiveMcpServer,
  setMcpToolCatalogEntry,
  upsertPinnedMcpToolHint
})

async function executePreparedToolCall(prepared, abortState = null) {
  const targetSession = getRunSessionTarget(abortState)
  throwIfAborted(abortState)
  const {
    toolCallId,
    toolExecutionId
  } = prepared || {}
  const createCurrentToolResultMessage = (content = '', extra = {}) =>
    createToolExecutionResultMessage(content, extra, toolCallId, toolExecutionId)

  const skillExecution = await executePreparedSkillTool(
    prepared,
    { targetSession, createCurrentToolResultMessage },
    abortState
  )
  if (skillExecution.handled) return skillExecution.result

  return executePreparedMcpTool(
    prepared,
    { targetSession, createCurrentToolResultMessage },
    abortState
  )
}

async function executeToolCallsParallel(toolCalls, toolMap, lastReasoningText, abortState = null) {
  const preparedCalls = []
  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    throwIfAborted(abortState)
    preparedCalls.push(await prepareToolCallExecution(toolCall, toolMap, lastReasoningText, abortState))
  }

  const results = new Array(preparedCalls.length)
  const chainsByKey = new Map()

  preparedCalls.forEach((prepared, index) => {
    if (prepared?.skipped) {
      results[index] = prepared.execResult
      return
    }

    const key = getToolCallParallelExecutionKey(prepared)
    const previous = chainsByKey.get(key) || Promise.resolve()
    const current = previous.then(async () => {
      throwIfAborted(abortState)
      return executePreparedToolCall(prepared, abortState)
    })
    chainsByKey.set(key, current.catch(() => {}))
    results[index] = current
  })

  const resolved = await Promise.all(results.map(async (entry) => {
    if (entry && typeof entry?.then === 'function') return entry
    return entry
  }))
  throwIfAborted(abortState)
  return resolved
}

async function executeToolCall(toolCall, toolMap, lastReasoningText, abortState = null) {
  const [result] = await executeToolCallsParallel([toolCall], toolMap, lastReasoningText, abortState)
  return result
}

const queuedInputDrainTimers = new Map()
const queuedInputDrainInFlight = new Set()

function getComposerDraft() {
  const text = String(input.value || '').trim()
  const attachments = Array.isArray(pendingAttachments.value) ? pendingAttachments.value.slice() : []
  const plan = resolveChatLongTextAttachmentPlan(text, attachments)
  if (!plan.wrapped) {
    return {
      text,
      attachments,
      validationError: String(plan.error || '')
    }
  }

  const longTextAttachment = createPendingLongTextAttachment(plan)
  if (!longTextAttachment) {
    return {
      text,
      attachments,
      validationError: '当前环境无法创建长文本附件，请改为手动上传 Markdown 文件。'
    }
  }
  return {
    text: plan.text,
    attachments: [...attachments, longTextAttachment],
    autoWrappedLongText: true,
    validationError: ''
  }
}

function clearComposerDraft() {
  input.value = ''
  resetComposerInput()
  pendingAttachments.value = []
}

function enqueueComposerDraft(mode = CHAT_RUN_INPUT_MODE_QUEUE) {
  if (preparingSend.value) return null
  const draft = getComposerDraft()
  if (draft.validationError) {
    message.warning(draft.validationError)
    return null
  }
  if (!draft.text && !draft.attachments.length) return null

  clearAllUserEditingState()
  const record = getActiveMemorySession()
  const entry = chatRunInputQueue.enqueue(record.id, draft, mode)
  if (!entry) return null

  clearComposerDraft()
  record.input = ''
  record.pendingAttachments = []
  record.updatedAt = Date.now()
  touchChatRunInputQueue()
  if (mode === CHAT_RUN_INPUT_MODE_STEER) {
    message.info('已加入引导，将在当前任务的下一个安全边界生效')
  } else {
    message.info('消息已加入队列')
  }
  return entry
}

function steerCurrentRun() {
  if (!sending.value) {
    void send()
    return
  }
  enqueueComposerDraft(CHAT_RUN_INPUT_MODE_STEER)
}

function removeQueuedInput(entryId) {
  const removed = chatRunInputQueue.remove(activeMemorySessionId.value, entryId)
  if (!removed) return
  touchChatRunInputQueue()
  message.info(removed.mode === CHAT_RUN_INPUT_MODE_STEER ? '已移除引导' : '已移除排队消息')
}

function steerQueuedInput(entryId) {
  const updated = chatRunInputQueue.setMode(
    activeMemorySessionId.value,
    entryId,
    CHAT_RUN_INPUT_MODE_STEER
  )
  if (!updated) return
  touchChatRunInputQueue()
  message.info('已改为引导，将在当前任务的下一个安全边界生效')
}

function scheduleQueuedInputDrain(record = getMemorySessionById(activeMemorySessionId.value)) {
  const sessionId = String(record?.id || '').trim()
  if (!sessionId || queuedInputDrainTimers.has(sessionId)) return
  const timer = window.setTimeout(() => {
    queuedInputDrainTimers.delete(sessionId)
    void drainQueuedInputs(record)
  }, 0)
  queuedInputDrainTimers.set(sessionId, timer)
}

async function drainQueuedInputs(record) {
  const sessionId = String(record?.id || '').trim()
  if (!sessionId || queuedInputDrainInFlight.has(sessionId)) return
  if (!isMemorySessionActive(record)) return
  if (preparingSend.value || sending.value || isMemorySessionChatRunning(record)) return

  const entry = chatRunInputQueue.takeNext(sessionId)
  if (!entry) return
  touchChatRunInputQueue()
  queuedInputDrainInFlight.add(sessionId)
  try {
    const accepted = await dispatchChatDraft(entry)
    if (!accepted) {
      chatRunInputQueue.restore(sessionId, [entry])
      touchChatRunInputQueue()
      return
    }
  } finally {
    queuedInputDrainInFlight.delete(sessionId)
  }

  if (chatRunInputQueue.count(sessionId) > 0) scheduleQueuedInputDrain(record)
}

async function dispatchChatDraft({ text: rawText, attachments: rawAttachments } = {}) {
  if (sending.value || preparingSend.value) return false
  const cfg = getRequestConfigOrHint()
  if (!cfg) return false

  const text = String(rawText || '').trim()
  const attachments = Array.isArray(rawAttachments) ? rawAttachments.slice() : []
  if (!text && !attachments.length) return false

  let prepared = false
  const accepted = await startPreparingSend(async ({ release }) => {
    const userDisplay = createDisplayMessage('user', text || (attachments.length ? '(sent attachments)' : ''))
    if (attachments.length) {
      userDisplay.attachmentsExpanded = false
      userDisplay.attachments = attachments
    }
    session.messages.push(userDisplay)
    autoScrollEnabled.value = true
    autoScrollSuspendedByUser.value = false
    scheduleRefreshUserAnchorMeta()
    await scrollToBottom({ force: true })
    const requestRecord = getActiveMemorySession()
    let memorySystemContent = ''
    let attachmentRecallText = ''
    try {
      const prepared = await prepareChatRequestContext({
        cfg,
        text,
        attachments,
        requestRecord,
        excludeLatestUserTurnFromMemoryRecall: true
      })
      memorySystemContent = prepared.memorySystemContent
      attachmentRecallText = prepared.attachmentRecallText
      if (cfg.requestMode === 'image-generation') {
        const referenceImages = await collectAttachmentMediaReferenceImages(attachments, userDisplay)
        cfg.imageGenerationRequestOptionsOverride = mergeReferenceImagesIntoRequestOptions(
          cfg.imageGenerationRequestOptionsOverride && typeof cfg.imageGenerationRequestOptionsOverride === 'object'
            ? cfg.imageGenerationRequestOptionsOverride
            : {},
          referenceImages,
          'image'
        )
      }
    } catch (err) {
      removeDisplayMessageById(userDisplay.id)
      autoScrollEnabled.value = true
      autoScrollSuspendedByUser.value = false
      scheduleRefreshUserAnchorMeta()
      await scrollToBottom({ force: true })
      message.error('发送准备失败：' + (err?.message || String(err)))
      return
    }
    prepared = true
    if (canGenerateMemorySessionTitle(requestRecord)) {
      requestRecord.titlePostReplyRetryDone = false
      requestSessionTitleAsync({
        record: requestRecord,
        cfg,
        text,
        attachments,
        reason: 'initial'
      })
    }

    if (cfg.requestMode === 'video-generation') {
      release()
      const generated = await startDetachedVideoGeneration({ cfg, text, attachments, userDisplay })
      if (generated && canRetryMemorySessionTitle(requestRecord)) {
        requestSessionTitleAsync({
          record: requestRecord,
          cfg,
          text,
          attachments,
          reason: 'post_reply'
        })
      }
      return
    }

    const runPromise = runChatSession({
      ...cfg,
      sessionRecord: requestRecord,
      memorySystemContent,
      memorySourceUserText: [text, attachmentRecallText].filter(Boolean).join('\n\n'),
      prepare: async () => {
        if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
        await prepareUserApiMessage({
          text,
          attachments,
          userDisplay,
          preferVision: cfg.supportsVision !== false,
          providerKind: cfg.providerKind || 'openai-compatible',
          sessionTarget: requestRecord,
          imageAttachmentMode: cfg.requestMode === 'image-generation' ? 'media-reference' : 'chat'
        })
      }
    })
    release()
    const succeeded = await runPromise

    if (succeeded && canRetryMemorySessionTitle(requestRecord)) {
      requestSessionTitleAsync({
        record: requestRecord,
        cfg,
        text,
        attachments,
        reason: 'post_reply'
      })
    }

  })
  return accepted && prepared
}

async function send() {
  if (preparingSend.value) return
  if (sending.value) {
    enqueueComposerDraft(CHAT_RUN_INPUT_MODE_QUEUE)
    return
  }

  const draft = getComposerDraft()
  if (draft.validationError) {
    message.warning(draft.validationError)
    return
  }
  if (!draft.text && !draft.attachments.length) return
  clearAllUserEditingState()
  clearComposerDraft()
  const accepted = await dispatchChatDraft(draft)
  if (!accepted) {
    input.value = draft.text
    pendingAttachments.value = draft.attachments
    resetComposerInput()
    return
  }
  scheduleQueuedInputDrain(getMemorySessionById(activeMemorySessionId.value))
}

const lastEnterKey = ref('')
watch(
  utoolsEnterData,
  (val) => {
    const key = buildUtoolsEnterEventKey(val)
    if (!key) {
      lastEnterKey.value = ''
      return
    }
    if (key === lastEnterKey.value) return
    lastEnterKey.value = key

    input.value = typeof val.payload === 'string' ? val.payload : ''
    send()
  },
  { immediate: true }
)
</script>

<style scoped src="./Chat.css"></style>
