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

    <ChatConversationPanel
      :theme="theme"
      :history-session-load-state="historySessionLoadState"
      :session-messages-length="session.messages.length"
      :empty-state-description="chatEmptyStateDescription"
      :setup-summary-items="chatSetupSummaryItems"
      :session-sider-collapsed="sessionSiderCollapsed"
      :composer-shortcut-hint="composerShortcutHint"
      :rendered-messages="renderedChatMessages"
      :chat-virtualized-enabled="chatVirtualizedEnabled"
      :chat-virtual-list-style="chatVirtualListStyle"
      :sending="sending"
      :preparing-send="preparingSend"
      :stream-render-throttle-ms="CHAT_STREAM_RENDER_THROTTLE_MS"
      :code-auto-fold-threshold="CHAT_CODE_AUTO_FOLD_THRESHOLD"
      :sticky-chat-bubble="stickyChatBubble"
      :show-scroll-to-bottom-button="showScrollToBottomButton"
      :show-anchor-rail="showAnchorRail"
      :user-anchors="userAnchors"
      :active-anchor-id="activeAnchorId"
      :helpers="conversationPanelHelpers"
      :actions="conversationPanelActions"
      :assistant-media-helpers="assistantMediaHelpers"
      :assistant-media-actions="assistantMediaActions"
      :user-attachment-helpers="userAttachmentHelpers"
      :user-attachment-actions="userAttachmentActions"
      :tool-activity-group-helpers="toolActivityGroupHelpers"
      :tool-activity-group-actions="toolActivityGroupActions"
      :tool-message-helpers="toolMessageHelpers"
      :tool-message-actions="toolMessageActions"
      @scrollbar-ref="scrollbarRef = $event"
      @chat-list-ref="chatListRef = $event"
      @open-model-modal="showModelModal = true"
      @open-system-prompt-modal="openSystemPromptModal"
      @open-agent-modal="openAgentModal"
      @open-file-picker="openFilePicker"
      @toggle-session-sider="toggleSessionSider"
    />

    <ChatToolApprovalCard
      :approval="activeToolApproval"
      :pending-count="pendingToolApprovalCount"
      @resolve="resolveActiveToolApproval"
    />

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
      :refreshing-mcp-tools="refreshingMcpTools"
      :thinking-effort-button-type="thinkingEffortButtonType"
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

    <ChatModelSettingsModal
      v-model:show="showModelModal"
      :providers="providers"
      :default-model-text="defaultModelText"
      :utools-ai-models-loading="utoolsAiModelsLoading"
      :utools-ai-models-error="utoolsAiModelsError"
      :is-builtin-provider="isUtoolsBuiltinProvider"
      :is-current-model="isCurrentModel"
      :is-default-model="isDefaultModel"
      @refresh-builtin-models="refreshBuiltinProviderModelsInChat(true)"
      @open-builtin-settings="openBuiltinProviderSettingsFromChat"
      @select-model="selectProviderModel"
      @toggle-default-model="toggleDefaultModel"
    />

    <ChatSystemPromptModal
      v-model:show="showSystemPromptModal"
      v-model:draft="systemPromptDraft"
      :base-prompt-source-text="basePromptSourceText"
      :has-selected-system-prompt="hasSelectedSystemPrompt"
      @reset-to-selected-prompt="resetSystemPromptToSelectedPrompt"
      @clear="clearCustomSystemPrompt"
      @apply="applyCustomSystemPrompt"
    />

    <ChatContextWindowModal
      v-model:show="showContextWindowModal"
      :theme="theme"
      :draft="contextWindowDraft"
      :preset-options="contextWindowPresetOptions"
      :history-focus-options="contextWindowHistoryFocusOptions"
      :draft-history-focus-hint="contextWindowDraftHistoryFocusHint"
      :summary-text="contextWindowSummaryText"
      :provider-hint="contextWindowProviderHint"
      :budget-status="contextWindowBudgetStatus"
      :preview-budget-summary-text="contextWindowPreviewBudgetSummaryText"
      :preview-budget-items="contextWindowPreviewBudgetItems"
      :compressed-summary-text="contextWindowCompressedSummaryText"
      :compressed-summary-meta-text="contextWindowCompressedSummaryMetaText"
      :compressed-summary-chain-text="contextWindowCompressedSummaryChainText"
      :compressed-summary-source-text="contextWindowCompressedSummarySourceText"
      :preview-summary-text="contextWindowPreviewSummaryText"
      :preview-entries="contextWindowPreviewEntries"
      :preview-omitted-entries="contextWindowPreviewOmittedEntries"
      :preview-omitted-summary-text="contextWindowPreviewOmittedSummaryText"
      :preview-omitted-filter-options="contextWindowPreviewOmittedFilterOptions"
      :preview-resolved-omitted-filter="contextWindowPreviewResolvedOmittedFilter"
      :preview-filtered-omitted-entries="contextWindowPreviewFilteredOmittedEntries"
      :omitted-filter="contextWindowPreviewOmittedFilter"
      :preview-helpers="contextWindowPreviewHelpers"
      @update:omitted-filter="contextWindowPreviewOmittedFilter = $event"
      @preset-change="handleContextWindowPresetChange"
      @reset="resetContextWindowDraftToDefault"
      @apply="applyContextWindowSettings"
    />

    <ChatAgentPickerModal
      v-model:show="showAgentModal"
      v-model:selected-id="agentModalSelectedId"
      :options="agentOptions"
      :has-selected-agent="!!visibleSelectedAgent"
      @clear="clearSelectedAgent"
      @apply="applyAgentModal"
    />

    <ChatPromptPickerModal
      v-model:show="showPromptModal"
      v-model:selected-id="promptModalSelectedId"
      :options="promptOptions"
      :loading="loadingMcpPrompts"
      :selected-kind="selectedPromptModalKind"
      :selected-local-prompt="selectedLocalPromptForModal"
      :mcp-prompt-args="selectedMcpPromptArgs"
      :local-prompt-variables="selectedLocalPromptVariables"
      :mcp-args-form="promptMcpArgsForm"
      :user-args-form="promptUserArgsForm"
      :is-user-prompt="isUserPrompt"
      @clear="clearSelectedPrompt"
      @apply="applyPromptModal"
    />

    <ChatSkillPickerModal
      v-model:show="showSkillModal"
      v-model:selected-ids="skillModalSelectedIds"
      :options="skillOptions"
      @apply="applySkillModal"
    />

    <ChatMcpPickerModal
      v-model:show="showMcpModal"
      v-model:selected-ids="mcpModalSelectedIds"
      :options="mcpOptions"
      :derived-mcp-count="derivedMcpIds.length"
      :tool-approval-mode="toolApprovalMode"
      :manual-approval-mode="TOOL_APPROVAL_MODE_MANUAL"
      :tool-approval-mode-label="toolApprovalModeLabel"
      :tool-approval-mode-button-type="toolApprovalModeButtonType"
      :tool-approval-mode-options="chatToolApprovalModeOptions"
      @set-tool-approval-mode="setToolApprovalMode"
      @apply="applyMcpModal"
    />
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
          :active-session-path="activeSessionFilePath"
          :locked-session-paths="lockedSessionPaths"
          @select="handleSessionHistorySelect"
          @saved="handleSessionSaved"
          @rename="handleSessionPathRenamed"
          @delete="handleSessionPathDeleted"
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
import { computed, defineAsyncComponent, ref, reactive, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  NFlex,
  NSpace,
  NLayout,
  NLayoutSider,
  NLayoutContent,
  NDropdown,
  useDialog,
  useMessage
} from 'naive-ui'
import { ensureMarkdownPreviewRuntime } from '@/utils/mdEditorRuntime'
import {
  buildChatDisplayMessages,
  ensureUniqueChatMessageIds
} from '@/utils/chatDisplayFolding.js'
import { useUtoolsEnterData } from '@/utils/utoolsListener.js'
import { getOrCreateMCPClient, getMcpPrompt, releaseMCPClient, closePooledMCPClient, closeAllPooledMCPClients } from '@/utils/mcpClient'
import { getTheme, getAgents, getProviders, getPrompts, getSkills, getMcpServers, getChatConfig, readSkillFile as readSkillRegistryFile, updateChatConfig } from '@/utils/configListener'
import { buildRequestOverridesFromAgentModelParams, getAgentReasoningEffortOverride, normalizeAgentModelParams } from '@/utils/agentModelParams'
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
  DEFAULT_SKILL_ROUTING_MIN_CONFIDENCE,
  DEFAULT_SKILL_ROUTING_MIN_MARGIN,
  listSelectedSkillsBrief as listSelectedSkillsBriefFromList,
  migrateLegacyDefaultAgentSkillState,
  resolveBuiltinSkillCall,
  resolveSelectedSkillTarget as resolveSelectedSkillTargetFromList,
  SKILL_ROUTING_EMBEDDING_TIMEOUT_MS,
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
  formatToolResultContentForModel,
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
  videoMetaLabel
} from '@/utils/chatMediaMetadata.js'
import {
  buildMediaGenerationPresetOptions,
  applyMediaGenerationPresetToInput
} from '@/utils/chatMediaPresets.js'
import {
  createDefaultImageGenerationParams,
  createDefaultVideoGenerationParams
} from '@/utils/chatMediaGenerationParams.js'
import {
  collectSessionMediaItems,
  countSessionMediaItems,
  filterSessionMediaItems
} from '@/utils/chatMediaLibrary.js'
import {
  buildChatSessionAssetsDirectory,
  collectChatMediaAssetPathsFromPayload,
  deleteChatSessionAssetDirectory,
  deleteChatMediaAssetPaths,
  hydrateChatSessionMediaAssets,
  persistChatMediaListAssets,
  persistChatSessionMediaAssets,
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
  INLINE_COMMAND_KIND_LABELS
} from '@/utils/chatInlinePicker'
import {
  createDirectory,
  exists,
  importFilesToSandbox,
  listDirectory,
  moveItem,
  purgeSandboxTrashEntries,
  resolvePath,
  writeFile
} from '@/utils/fileOperations'
import {
  collectChatSessionOwnedSandboxWorkspaceIds,
  purgeExpiredChatSessionTrash
} from '@/utils/chatSessionTrash.js'
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
import { isAgentRunToolName } from '@/utils/chatAgentRun'
import { CHAT_CODE_AUTO_FOLD_THRESHOLD } from '@/utils/chatMarkdownPreview'
import {
  buildChatAttachmentReferenceBlock,
  buildChatSandboxWorkspaceId,
  isChatSandboxWorkspaceId,
  resolveChatToolWorkspaceScope,
  withDefaultChatSandboxWorkspaceId
} from '@/utils/chatSandboxWorkspace'
import {
  estimateChatMarkdownContentHeight,
  resolveChatBottomScrollTarget,
  resolveChatAdaptiveVirtualRange,
  resolveChatDeferredLayoutPolicy,
  resolveChatHeavyRenderTuning,
  resolveChatVirtualItemGap,
  shouldDeferChatHeavyBlockLayout,
  shouldEnableChatVirtualization,
  shouldRetainChatVirtualization
} from '@/utils/chatPerformance.js'
import {
  ATTACH_ACCEPT,
  buildImageGenerationRequestOptionsWithReferences,
  buildVideoGenerationRequestOptionsWithReferences,
  clearAttachmentFileReferences,
  mergeReferenceImagesIntoRequestOptions,
  resolveChatLongTextAttachmentPlan,
  truncateInlineText,
  truncateText
} from '@/utils/chatAttachmentUtils'
import {
  assistantImageTaskStatusLabel,
  attachmentCardTitle,
  attachmentMetaSummary,
  attachmentStatusText,
  countFileAttachments,
  countImageAttachments,
  imageInsightLabel,
  listDisplayAttachments
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
import ChatComposerPanel from './ChatComposerPanel.vue'
import ChatConversationPanel from './ChatConversationPanel.vue'
import ChatHeaderCard from './ChatHeaderCard.vue'
import ChatToolApprovalCard from './ChatToolApprovalCard.vue'
import SessionTree from './SessionTree.vue'
import {
  normalizeChatMediaGenerationMode as normalizeImageGenerationMode,
  useChatMediaControls
} from './composables/useChatMediaControls.js'
import {
  makeLocalPromptOptionValue,
  makeMcpPromptOptionValue,
  useChatInlinePicker
} from './composables/useChatInlinePicker.js'
import { useChatAttachments } from './composables/useChatAttachments.js'
import { useChatResponsiveLayout } from './composables/useChatResponsiveLayout.js'
import {
  contextWindowHistoryFocusOptions,
  contextWindowPresetOptions,
  useChatContextWindowPresentation
} from './composables/useChatContextWindowPresentation.js'
import { useChatLinkActions } from './composables/useChatLinkActions.js'
import { useChatMediaActions } from './composables/useChatMediaActions.js'
import { useChatAssistantMediaPresentation } from './composables/useChatAssistantMediaPresentation.js'
import { useChatToolPresentation } from './composables/useChatToolPresentation.js'
import { useChatToolExecutionMessageFactory } from './composables/useChatToolExecutionMessageFactory.js'
import { useChatToolExecutionMerge } from './composables/useChatToolExecutionMerge.js'
import { useChatAgentRunTraceEvents } from './composables/useChatAgentRunTraceEvents.js'
import {
  buildAutoSessionTitle,
  buildDefaultSessionName,
  buildSessionTitleGenerationPrompt,
  getSessionTitleFromPath,
  normalizeGeneratedSessionTitle,
  sanitizeAutoSessionTitle
} from './composables/useChatSessionTitles.js'
import {
  parseIsoTimeMs,
  resolvePersistedSessionCreatedAtMs
} from './composables/useChatSessionTimestamps.js'
import { useChatStreamingTextBuffer } from './composables/useChatStreamingTextBuffer.js'
import {
  getUserMessageFoldInfo,
  inferLoadedDisplayMessageRender,
  inferUserDisplayMessageRender,
  isLikelyMarkdownContent,
  isUserMessageCollapsed,
  isUserMessageFoldable,
  shouldKeepLoadedAssistantTextRender,
  shouldRenderUserMessageAsPlainText,
  userMessageFoldSummary,
  userMessagePreview
} from './composables/useChatMessageRendering.js'
import {
  buildMcpToolHint,
  buildProviderToolDefinition,
  buildProviderToolDescription,
  makeToolFunctionName
} from './composables/useChatToolDefinitions.js'
import {
  formatLocalUserPromptForComposer,
  formatMcpPromptResultForComposer,
  normalizeMcpPromptList
} from './composables/useChatPromptFormatting.js'
import { useChatMemorySessionMetadata } from './composables/useChatMemorySessionMetadata.js'
import { useChatUserMessageIndexing } from './composables/useChatUserMessageIndexing.js'
import {
  extractContextTokenMetrics,
  extractModelUsage
} from './composables/useChatUsageTelemetry.js'
import {
  attachMediaRequestSnapshot,
  buildImageGenerationApiSummary,
  buildImageGenerationPendingText,
  buildImageGenerationResultText,
  buildMediaRequestSnapshot
} from './composables/useChatMediaRequestPresentation.js'
import { useChatMediaGenerationDisplay } from './composables/useChatMediaGenerationDisplay.js'
import { useChatMessageTracking } from './composables/useChatMessageTracking.js'
import { useChatRunSessionTargeting } from './composables/useChatRunSessionTargeting.js'
import { useChatMemorySessionRegistry } from './composables/useChatMemorySessionRegistry.js'
import { useChatMemorySessionLifecycle } from './composables/useChatMemorySessionLifecycle.js'
import { useChatSessionManager } from './composables/useChatSessionManager.js'
import { useChatRequestRunner } from './composables/useChatRequestRunner.js'
import { useChatPageRuntime } from './composables/useChatPageRuntime.js'

const ChatAgentPickerModal = defineAsyncComponent(() => import('./ChatAgentPickerModal.vue'))
const ChatContextWindowModal = defineAsyncComponent(() => import('./ChatContextWindowModal.vue'))
const ChatMcpPickerModal = defineAsyncComponent(() => import('./ChatMcpPickerModal.vue'))
const ChatMediaLibraryModal = defineAsyncComponent(() => import('./ChatMediaLibraryModal.vue'))
const ChatModelSettingsModal = defineAsyncComponent(() => import('./ChatModelSettingsModal.vue'))
const ChatPromptPickerModal = defineAsyncComponent(() => import('./ChatPromptPickerModal.vue'))
const ChatSkillPickerModal = defineAsyncComponent(() => import('./ChatSkillPickerModal.vue'))
const ChatSystemPromptModal = defineAsyncComponent(() => import('./ChatSystemPromptModal.vue'))

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

// These composables have a few intentional cross-layer callbacks. Keep stable
// delegates available from the start of setup, then forward to the real APIs
// after each owning composable has initialized.
let chatPageRuntimeApi = null
let chatSessionManagerApi = null
let chatRequestRunnerApi = null

async function scrollToBottom(...args) {
  return chatPageRuntimeApi?.scrollToBottom?.(...args)
}

function maybeScheduleStreamingScroll(...args) {
  return chatPageRuntimeApi?.maybeScheduleStreamingScroll?.(...args)
}

function scheduleSessionAutosave(...args) {
  return chatSessionManagerApi?.scheduleSessionAutosave?.(...args)
}

function getCurrentToolsKey(...args) {
  return chatRequestRunnerApi?.getCurrentToolsKey?.(...args) || ''
}

function buildRequestApiMessages(...args) {
  return chatRequestRunnerApi?.buildRequestApiMessages?.(...args) || []
}

function isDisplayMessageInActiveSession(...args) {
  return chatRequestRunnerApi?.isDisplayMessageInActiveSession?.(...args) === true
}

function recordModelUsage(...args) {
  return chatRequestRunnerApi?.recordModelUsage?.(...args)
}

function clearMcpToolCatalog(...args) {
  return chatRequestRunnerApi?.clearMcpToolCatalog?.(...args)
}

function clearPinnedMcpToolHints(...args) {
  return chatRequestRunnerApi?.clearPinnedMcpToolHints?.(...args)
}

function clearAllUserEditingState(...args) {
  return chatRequestRunnerApi?.clearAllUserEditingState?.(...args)
}

function resetChatSetupUiState(...args) {
  return chatRequestRunnerApi?.resetChatSetupUiState?.(...args)
}

function syncContextWindowDraft(...args) {
  return chatRequestRunnerApi?.syncContextWindowDraft?.(...args)
}

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
const SESSION_TRASH_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const AUTO_CHAT_SESSION_SOURCE_TYPE = 'auto_chat_session'
const DEFAULT_MEMORY_SESSION_TITLE = '新建会话'

const session = reactive({
  messages: [],
  apiMessages: []
})

const sessionTreeRef = ref(null)
const sessionSiderCollapsed = ref(true)
const {
  isCompactChatLayout,
  isDenseChatLayout,
  layoutContentStyle,
  sessionSiderWidth,
  sessionSiderCollapsedWidth,
  sessionSiderContentStyle,
  syncChatResponsiveState
} = useChatResponsiveLayout(sessionSiderCollapsed)
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

const showSkillModal = ref(false)
const skillModalSelectedIds = ref([])

const showMcpModal = ref(false)
const mcpModalSelectedIds = ref([])

const input = ref('')
const sandboxHostWorkspacePath = ref('')
const composerInputKey = ref(0)
const composerPanelRef = ref(null)
const {
  pendingAttachments,
  pendingImageAttachments,
  pendingFileAttachments,
  collectAttachmentMediaReferenceImages,
  removeAttachment,
  attachmentIcon,
  ensureAttachmentParsed,
  createPendingLongTextAttachment,
  appendPendingFiles,
  handleComposerPaste,
  handleFileInputChange
} = useChatAttachments({ createId: newId, message })
const sending = ref(false)
const preparingSend = ref(false)
const preparingSendStage = ref('')
const abortController = ref(null)
const runRecordByAbortState = new WeakMap()
const memorySessions = ref([])
const activeMemorySessionId = ref('')
const autoPersistMemorySessionInFlight = new Map()
const sessionTitleRequestTokens = new Map()
const lockedSessionPaths = computed(() => {
  const paths = new Set()
  const activePath = String(activeSessionFilePath.value || '').trim()
  if (activePath) paths.add(activePath)
  memorySessions.value.forEach((record) => {
    if (!isMemorySessionRunning(record)) return
    const filePath = String(record?.activeSessionFilePath || '').trim()
    if (filePath) paths.add(filePath)
  })
  return [...paths]
})
const chatRunInputQueue = createChatRunInputQueue({ createId: newId })
const chatRunInputQueueRevision = ref(0)

function touchChatRunInputQueue() {
  chatRunInputQueueRevision.value += 1
}

const {
  createEmptyContextSummaryState,
  createEmptyContextTokenTelemetry,
  normalizeContextTokenTelemetry,
  createMemorySessionRecord,
  resolveMemorySessionSandboxWorkspaceId,
  getActiveMemorySession,
  getMemorySessionById
} = useChatMemorySessionRegistry({
  createId: newId,
  defaultMemorySessionTitle: DEFAULT_MEMORY_SESSION_TITLE,
  isChatSandboxWorkspaceId,
  buildChatSandboxWorkspaceId,
  normalizeMemoryCandidateQueue,
  deepCopyJson,
  normalizeToolApprovalMode,
  toolApprovalModeManual: TOOL_APPROVAL_MODE_MANUAL,
  toolApprovalModeSafe: TOOL_APPROVAL_MODE_SAFE,
  memorySessions,
  activeMemorySessionId,
  session,
  autoApproveTools,
  activeSessionFilePath,
  activeSessionTitle
})


const {
  getMemorySessionRunningCount,
  getMemorySessionChatRunCount,
  getMemorySessionPendingApprovalCount,
  isMemorySessionRunning,
  isMemorySessionChatRunning,
  getMemorySessionAutoPersistKey,
  hasResolvedMemorySessionTitle,
  isFinalizedMemorySessionTitle,
  canGenerateMemorySessionTitle,
  canRetryMemorySessionTitle,
  applyFallbackMemorySessionTitle,
  shouldStampHistoryCreatedAtOnGeneratedTitle,
  getPersistedMemorySessionTitle,
  isGeneratedSessionTitle,
  hasPersistableMemorySessionResponse,
  canPersistMemorySessionToHistory,
  resolveMemorySessionTitle,
  markMemorySessionTitleReady
} = useChatMemorySessionMetadata({
  defaultMemorySessionTitle: DEFAULT_MEMORY_SESSION_TITLE,
  autoChatSessionDirName: AUTO_CHAT_SESSION_DIR_NAME,
  getSessionTitleFromPath
})

const {
  isAutoChatSessionPath,
  isTimedTaskSessionPath,
  isMemorySessionActive,
  isMemorySessionEmptyDraft,
  clearMemoryCandidateFlushTimer,
  clearPendingMemoryCandidates,
  removeMemorySessionById,
  pruneDormantMemorySessions
} = useChatMemorySessionLifecycle({
  autoChatSessionRoot: AUTO_CHAT_SESSION_ROOT,
  timedTaskSessionRoot: TIMED_TASK_SESSION_ROOT,
  memorySessions,
  activeMemorySessionId,
  isMemorySessionRunning,
  clearSessionApprovedTools,
  clearChatRunQueue: (id) => chatRunInputQueue.clear(id),
  touchChatRunInputQueue
})

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

const {
  getRunRecord,
  getRunSessionTarget,
  isRunRecordActive,
  maybeScrollToBottomForRun,
  maybeScheduleScrollToBottomForRun,
  getMemorySessionForMessage,
  getMemorySessionForToolMessage
} = useChatRunSessionTargeting({
  runRecordByAbortState,
  getFallbackSession: () => session,
  isRecordActive: isMemorySessionActive,
  scrollToBottom,
  maybeScheduleStreamingScroll,
  getActiveMemorySession,
  getMemorySessionById,
  getMemorySessions: () => memorySessions.value
})

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
          apiMode: normalizeProviderApiMode(provider.apiMode),
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
        apiMode: normalizeProviderApiMode(chatRequestConfig?.apiMode),
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
  const apiMode = normalizeProviderApiMode(requestCfg?.apiMode)
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
      apiMode,
      body: {
        model,
        stream: true,
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

const {
  thinkingEffort,
  thinkingEffortLabel,
  thinkingEffortButtonType,
  imageGenerationMode,
  imageGenerationModeLabel,
  imageGenerationParamsEnabled,
  imageGenerationParams,
  imageGenerationParamsSummary,
  videoGenerationMode,
  videoGenerationModeLabel,
  videoGenerationParamsEnabled,
  videoGenerationParams,
  videoGenerationParamsSummary,
  mediaGenerationParamsAutosaveKey,
  showInputModeTags,
  setImageGenerationMode,
  setVideoGenerationMode,
  assignImageGenerationParams,
  assignVideoGenerationParams,
  setImageGenerationParamsEnabled,
  setVideoGenerationParamsEnabled,
  resetImageGenerationParams,
  resetVideoGenerationParams,
  getCurrentImageGenerationRequestOptions,
  getCurrentVideoGenerationRequestOptions,
  cycleImageGenerationMode,
  cycleVideoGenerationMode
} = useChatMediaControls()

const hasAppliedDefaultModel = ref(false)

const CHAT_VIRTUALIZATION_MIN_MESSAGES = 72
const CHAT_VIRTUALIZATION_MIN_ITEMS_FOR_HEIGHT = 16
const CHAT_VIRTUALIZATION_MIN_ESTIMATED_HEIGHT_PX = 12_000
const CHAT_VIRTUALIZATION_MIN_VIEWPORTS = 12
const CHAT_VIRTUALIZATION_RETAIN_MIN_MESSAGES = 48
const CHAT_VIRTUALIZATION_RETAIN_MIN_ITEMS_FOR_HEIGHT = 12
const CHAT_VIRTUALIZATION_RETAIN_MIN_ESTIMATED_HEIGHT_PX = 8_000
const CHAT_VIRTUALIZATION_RETAIN_MIN_VIEWPORTS = 8
const CHAT_DEFERRED_LAYOUT_MIN_ESTIMATED_HEIGHT_PX = 4_800
const CHAT_DEFERRED_LAYOUT_MIN_VIEWPORTS = 6
const CHAT_DEFERRED_LAYOUT_PRELOAD_VIEWPORTS = 2.5
const CHAT_DEFERRED_LAYOUT_PRELOAD_MIN_PX = 1_200
const CHAT_DEFERRED_LAYOUT_PRELOAD_MAX_PX = 2_400
const CHAT_VIRTUALIZATION_MIN_BUFFER_PX = 320
const CHAT_VIRTUALIZATION_MAX_BUFFER_PX = 720
const CHAT_VIRTUALIZATION_MAX_BUFFER_ITEMS = 12
const CHAT_LIST_GAP_PX = 14
const CHAT_ACTIVITY_LIST_GAP_PX = 5
const CHAT_DEFAULT_MESSAGE_HEIGHT = 180
const CHAT_USER_MESSAGE_BASE_HEIGHT = 78
const CHAT_ASSISTANT_MESSAGE_BASE_HEIGHT = 82
const CHAT_TEXT_MESSAGE_MIN_HEIGHT = 92
const CHAT_RECENT_HEAVY_RENDER_COUNT = 12
const CHAT_HEAVY_RENDER_SEED_COUNT = 12
const CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA = 2
const CHAT_SCROLL_COMPENSATION_SUSPEND_MS = 640
const CHAT_USER_SCROLL_INTENT_MS = 480
const CHAT_TOOL_COMPACT_MIN_MESSAGES = 120
const CHAT_TOOL_COMPACT_MIN_TOOL_MESSAGES = 32
const CHAT_TOOL_COMPACT_ITEM_FIXED_HEIGHT = 26
const CHAT_TOOL_ACTIVITY_GROUP_FIXED_HEIGHT = 32
const CHAT_ASSISTANT_ACTIVITY_ITEM_HEIGHT = 28
const CHAT_STREAM_RENDER_THROTTLE_MS = 72

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

function openFilePicker() {
  try {
    composerPanelRef.value?.triggerFilePicker?.()
  } catch {
    // ignore
  }
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

  const routingInput = {
    skills: skills.value,
    text: raw,
    selectedSkillIds: selectedSkillIds.value,
    agentSkillIds: agentSkillIds.value,
    activatedSkillIds: activatedAgentSkillIds.value,
    loadedSkillIds: loadedSkillIdSet.value,
    minimumConfidence: DEFAULT_SKILL_ROUTING_MIN_CONFIDENCE,
    minimumMargin: DEFAULT_SKILL_ROUTING_MIN_MARGIN,
    limit: 1
  }
  let plan = buildAutoSkillActivationPlan(routingInput)
  if (!plan.picked.length) {
    const capabilitySearchResult = await searchCapabilities({
      query: raw,
      limit: 12,
      capabilityType: 'skill',
      embeddingTimeoutMs: SKILL_ROUTING_EMBEDDING_TIMEOUT_MS
    }).catch(() => null)
    plan = buildAutoSkillActivationPlan({
      ...routingInput,
      retrievalMatches: Array.isArray(capabilitySearchResult?.items)
        ? capabilitySearchResult.items
        : []
    })
  }
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

const {
  inlineAgentQuery,
  inlineAgentMatchStart,
  inlineAgentMatchEnd,
  inlineAgentActiveIndex,
  inlineCommandMode,
  inlineCommandType,
  inlineCommandQuery,
  inlineCommandMatchStart,
  inlineCommandMatchEnd,
  inlineCommandActiveIndex,
  inlineAgentPickerHeaderText,
  inlineCommandPickerTitle,
  inlineCommandPickerHeaderText,
  inlineAgentSuggestions,
  inlineCommandSuggestions,
  showInlineAgentPicker,
  showInlineCommandPicker,
  clearInlineAgentPicker,
  clearInlineCommandPicker,
  clearInlinePickers,
  moveInlineAgentActive,
  moveInlineCommandActive,
  getFirstEnabledInlineCommandIndex
} = useChatInlinePicker({
  agents,
  providers,
  selectedAgentId,
  prompts,
  mcpPromptCatalog,
  basePromptMode,
  selectedPromptId,
  skills,
  agentSkillIdSet,
  selectedSkillIds,
  manualMcpIds,
  derivedMcpIds,
  orderedMcpServers
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
    availableSkills: skills.value,
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

const {
  contextWindowSummaryTag,
  contextWindowSummaryText,
  contextWindowProviderHint,
  contextWindowPreviewEntries,
  contextWindowPreviewOmittedEntries,
  contextWindowPreviewBudgetItems,
  contextWindowPreviewBudgetSummaryText,
  contextWindowBudgetStatus,
  contextWindowSummaryTagType,
  contextWindowSummaryTooltipText,
  contextWindowCompressedSummaryText,
  contextWindowCompressedSummaryMetaText,
  contextWindowCompressedSummaryChainText,
  contextWindowCompressedSummarySourceText,
  contextWindowPreviewSummaryText,
  contextWindowPreviewOmittedSummaryText,
  contextWindowPreviewOmittedFilterOptions,
  contextWindowPreviewResolvedOmittedFilter,
  contextWindowPreviewFilteredOmittedEntries,
  contextWindowPreviewHelpers
} = useChatContextWindowPresentation({
  contextWindowStats,
  contextWindowBudgetPlan,
  contextWindowPreviewState,
  showContextWindowModal,
  contextWindowPreviewConfig,
  contextWindowPresetLabel,
  contextWindowHistoryFocusLabel,
  contextWindowHistoryFocusBehaviorText,
  effectiveToolMode,
  selectedProvider,
  lastBuiltRequestToolsStats,
  systemContent,
  session,
  getCurrentToolsKey,
  getContextTokenTelemetry,
  getMemorySessionById,
  activeMemorySessionId,
  contextWindowPreviewOmittedFilter
})

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

const {
  chatLinkContextMenu,
  chatLinkContextMenuOptions,
  cleanupChatPreviewLinkHandlers,
  handleChatPreviewLinkClick,
  handleChatPreviewLinkContextMenu,
  closeChatLinkContextMenu,
  handleChatLinkContextMenuSelect,
  saveChatWorkspaceResultFile,
  openChatWorkspaceResultFile,
  showChatWorkspaceResultFile
} = useChatLinkActions({
  session,
  getChatListElement: () => chatListRef.value,
  router,
  message,
  copyToClipboard
})

const {
  copyChatImage,
  copyChatVideo,
  downloadChatImage,
  downloadChatVideo,
  updateChatImageMetadata,
  updateChatVideoMetadata
} = useChatMediaActions({
  activeSessionFilePath,
  message,
  copyToClipboard,
  scheduleSessionAutosave: () => scheduleSessionAutosave(),
  scheduleRefreshUserAnchorMeta: () => scheduleRefreshUserAnchorMeta()
})

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

const {
  assistantMediaHelpers,
  createAssistantImageBubblePlaceholder,
  createAssistantVideoBubblePlaceholder,
  clearAssistantMediaBubblePlaceholders,
  applyAssistantRequestPlaceholderMode,
  prepareAssistantDisplayForTextResponse
} = useChatAssistantMediaPresentation({
  createId: newId,
  canRegenerateMedia: (...args) => canRegenerateMedia(...args),
  canResumeMediaTask: (...args) => canResumeMediaTask(...args),
  isMediaTaskResuming: (...args) => isMediaTaskResuming(...args)
})

const {
  createImageGenerationPlaceholderDisplay,
  applyImageGenerationTaskToDisplay,
  applyImageGenerationTextToDisplay,
  applyImageGenerationImagesToDisplay,
  buildVideoGenerationPendingText,
  createVideoGenerationPlaceholderDisplay,
  applyVideoGenerationTaskToDisplay,
  applyVideoGenerationTextToDisplay,
  applyVideoGenerationVideosToDisplay,
  buildVideoGenerationApiSummary
} = useChatMediaGenerationDisplay({
  createDisplayMessage: (...args) => createDisplayMessage(...args),
  createAssistantImageBubblePlaceholder,
  createAssistantVideoBubblePlaceholder,
  assistantVideoTaskStatusLabel: assistantMediaHelpers.assistantVideoTaskStatusLabel
})

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



const {
  isToolMessage,
  normalizeToolMessageStatus,
  isLiveToolMessageStatus,
  toolMessageStatusText,
  toolMessageStatusDetailText,
  getToolMessageStatus,
  toolMessageStatusLabel,
  toolActivityPhaseLabel,
  toolMessageLabel,
  toolActivityMeta,
  toolActivityToolName,
  toolActivitySource,
  shouldShowToolActivityStatus,
  toolActivityIcon,
  toolActivityActionIcon,
  isToolActivityGroup,
  isAssistantActivityMessage,
  isChatActivityMessage,
  chatItemStateClasses,
  chatAvatarStateClasses,
  chatAvatarIconClasses,
  roleIcon,
  formatTime,
  shouldRenderCompactToolMessage
} = useChatToolPresentation()

function toggleToolActivityGroup(group) {
  if (!isToolActivityGroup(group)) return
  const id = String(group.id || '').trim()
  if (!id) return
  const next = new Set(expandedToolActivityGroupIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedToolActivityGroupIds.value = next
  chatMessageEstimatedHeightCache.delete(id)
  scheduleChatVirtualItemRemeasure(id, { followTail: isAtBottom.value })
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
}

const {
  extractServerNameFromToolMeta,
  extractToolNameFromToolMeta,
  extractFirstJsonFenceText,
  inferToolResultStatus,
  buildToolExecutionMessageContent,
  createPendingToolExecutionMessage,
  createToolExecutionResultMessage,
  buildToolExecutionResultSubMeta,
  canCoalesceToolResultIntoPending
} = useChatToolExecutionMessageFactory({
  createDisplayMessage: (...args) => createDisplayMessage(...args),
  isToolMessage,
  normalizeToolMessageStatus,
  getToolMessageStatus,
  toolMessageStatusText,
  toolMessageStatusDetailText,
  isLiveToolMessageStatus
})

const {
  mergeToolExecutionDisplayMessage,
  maybeCoalesceLatestToolMessages,
  coalesceToolExecutionDisplayMessages
} = useChatToolExecutionMerge({
  getSessionMessages: () => session?.messages,
  isToolMessage,
  inferToolResultStatus,
  extractServerNameFromToolMeta,
  buildToolExecutionMessageContent,
  isLiveToolMessageStatus,
  canCoalesceToolResultIntoPending,
  deleteActiveAgentRunToolMessage: (streamId) => activeAgentRunToolMessageByStreamId.delete(streamId),
  scheduleRefreshUserAnchorMeta: () => scheduleRefreshUserAnchorMeta()
})

const {
  chatListRef,
  autoScrollEnabled,
  autoScrollSuspendedByUser,
  isAtBottom,
  showScrollToBottomButton,
  expandedToolActivityGroupIds,
  resolveCurrentHeavyRenderViewportBuffer,
  chatMessageEstimatedHeightCache,
  rememberHydratedHeavyChatMessage,
  withChatSessionOpeningHeavyRender,
  primeHydratedHeavyChatMessages,
  maybeWarmMarkdownPreviewRuntimeForMessages,
  chatVirtualizedEnabled,
  scheduleChatVirtualItemRemeasure,
  clearChatVirtualItemRemeasure,
  renderedChatMessages,
  chatVirtualListStyle,
  getChatVirtualItemIndex,
  getChatVirtualItemStyle,
  activeAnchorId,
  userAnchors,
  showAnchorRail,
  scheduleRefreshUserAnchorMeta,
  resetUserAnchors,
  stickyChatBubble,
  setStickyChatBubbleState,
  scheduleStickyChatBubbleSync,
  clearStickyChatBubbleSync,
  handleStickyChatBubbleAction,
  disconnectChatMessageVisibilityObserver,
  getChatVirtualItemRef,
  shouldRenderHeavyChatMessage,
  shouldDeferHeavyChatBlockLayout,
  scrollToUserAnchor,
  disconnectChatLayoutResizeObserver,
  waitForLayoutFrame,
  settleChatViewportAfterSessionOpen,
  toggleSessionSider,
  activateAutoScroll,
  handleChatScroll,
  handleChatWheel,
  handleChatPointerDown,
  scheduleScrollToBottom,
  bindDefaultModelConfigListeners,
  bindUtoolsEnterDataListener,
  createChatInputKeydownHandler
} = (chatPageRuntimeApi = useChatPageRuntime({
  BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT,
  BUILTIN_AGENTS_TRACE_EVENT,
  CHAT_ACTIVITY_LIST_GAP_PX,
  CHAT_ASSISTANT_ACTIVITY_ITEM_HEIGHT,
  CHAT_ASSISTANT_MESSAGE_BASE_HEIGHT,
  CHAT_CODE_AUTO_FOLD_THRESHOLD,
  CHAT_DEFAULT_MESSAGE_HEIGHT,
  CHAT_DEFERRED_LAYOUT_MIN_ESTIMATED_HEIGHT_PX,
  CHAT_DEFERRED_LAYOUT_MIN_VIEWPORTS,
  CHAT_DEFERRED_LAYOUT_PRELOAD_MAX_PX,
  CHAT_DEFERRED_LAYOUT_PRELOAD_MIN_PX,
  CHAT_DEFERRED_LAYOUT_PRELOAD_VIEWPORTS,
  CHAT_HEAVY_RENDER_SEED_COUNT,
  CHAT_LIST_GAP_PX,
  CHAT_RECENT_HEAVY_RENDER_COUNT,
  CHAT_SCROLL_COMPENSATION_SUSPEND_MS,
  CHAT_TEXT_MESSAGE_MIN_HEIGHT,
  CHAT_TOOL_ACTIVITY_GROUP_FIXED_HEIGHT,
  CHAT_TOOL_COMPACT_ITEM_FIXED_HEIGHT,
  CHAT_USER_MESSAGE_BASE_HEIGHT,
  CHAT_USER_SCROLL_INTENT_MS,
  CHAT_VIRTUALIZATION_MAX_BUFFER_ITEMS,
  CHAT_VIRTUALIZATION_MAX_BUFFER_PX,
  CHAT_VIRTUALIZATION_MIN_BUFFER_PX,
  CHAT_VIRTUALIZATION_MIN_ESTIMATED_HEIGHT_PX,
  CHAT_VIRTUALIZATION_MIN_ITEMS_FOR_HEIGHT,
  CHAT_VIRTUALIZATION_MIN_MESSAGES,
  CHAT_VIRTUALIZATION_MIN_VIEWPORTS,
  CHAT_VIRTUALIZATION_RETAIN_MIN_ESTIMATED_HEIGHT_PX,
  CHAT_VIRTUALIZATION_RETAIN_MIN_ITEMS_FOR_HEIGHT,
  CHAT_VIRTUALIZATION_RETAIN_MIN_MESSAGES,
  CHAT_VIRTUALIZATION_RETAIN_MIN_VIEWPORTS,
  SESSION_TRASH_CLEANUP_INTERVAL_MS,
  activeMemorySessionId,
  activeSessionFilePath,
  buildChatDisplayMessages,
  cleanupChatPreviewLinkHandlers,
  cleanupExpiredSessionTrash: (...args) => cleanupExpiredSessionTrash(...args),
  countFileAttachments,
  countImageAttachments,
  ensureMarkdownPreviewRuntime,
  estimateChatMarkdownContentHeight,
  getToolMessageStatus,
  handleBuiltinAgentsToolApprovalRequest: (...args) => handleBuiltinAgentsToolApprovalRequest(...args),
  handleBuiltinAgentsTraceEvent: (...args) => handleBuiltinAgentsTraceEvent(...args),
  isAssistantActivityMessage,
  isChatActivityMessage,
  isCompactChatLayout,
  isDenseChatLayout,
  isLiveToolMessageStatus,
  isToolActivityGroup,
  isToolMessage,
  isUserMessageCollapsed,
  userMessagePreview,
  maybeCoalesceLatestToolMessages,
  migrateLegacyAutoChatSessionCreatedAt: (...args) => migrateLegacyAutoChatSessionCreatedAt(...args),
  preparingSend,
  resolveChatAdaptiveVirtualRange,
  resolveChatBottomScrollTarget,
  resolveChatDeferredLayoutPolicy,
  resolveChatHeavyRenderTuning,
  resolveChatVirtualItemGap,
  scrollbarRef,
  sending,
  session,
  sessionSiderCollapsed,
  shouldDeferChatHeavyBlockLayout,
  shouldEnableChatVirtualization,
  shouldRenderCompactToolMessage,
  shouldRenderUserMessageAsPlainText,
  shouldRetainChatVirtualization,
  shouldShowToolActivityStatus,
  syncChatResponsiveState,
  toggleAttachmentsExpanded,
  toggleThinking,
  toggleToolExpanded,
  toolActivityMeta,
  toolActivitySource,
  toolActivityToolName,
  toolMessageLabel,
  toolMessageStatusLabel
}))

const {
  activeAgentRunToolMessageByStreamId,
  resolveActiveAgentRunToolMessage,
  flushPendingBuiltinAgentsEvents,
  handleBuiltinAgentsTraceEvent,
  hasPendingBuiltinAgentsEvents,
  cleanupPendingBuiltinAgentsEvents
} = useChatAgentRunTraceEvents({
  getActiveMessages: () => session.messages,
  getMemorySessions: () => memorySessions.value,
  isToolMessage,
  normalizeToolMessageStatus,
  getToolMessageStatus,
  buildToolExecutionMessageContent,
  extractServerNameFromToolMeta,
  scheduleRefreshUserAnchorMeta: () => scheduleRefreshUserAnchorMeta(),
  maybeScheduleStreamingScroll: () => maybeScheduleStreamingScroll()
})

const assistantMediaActions = {
  copyChatImage,
  downloadChatImage,
  copyChatVideo,
  downloadChatVideo,
  regenerateMedia: (...args) => regenerateMedia(...args),
  resumeMediaTask: (...args) => resumeMediaTask(...args),
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
  toolActivityPhaseLabel,
  toolActivityIcon,
  toolActivityActionIcon,
  toolActivityMeta,
  toolActivitySource,
  toolActivityToolName,
  shouldShowToolActivityStatus,
  imageMetaLabel,
  imageInsightLabel,
  shouldRenderHeavyChatMessage: (...args) => shouldRenderHeavyChatMessage(...args),
  truncateInlineText
}

const toolMessageActions = {
  toggleToolExpanded,
  downloadChatImage,
  copyChatImage,
  openChatWorkspaceResultFile,
  saveChatWorkspaceResultFile,
  scheduleScrollToBottom: (...args) => scheduleScrollToBottom(...args),
  showChatWorkspaceResultFile
}

const toolActivityGroupHelpers = {
  getToolMessageStatus,
  shouldRenderCompactToolMessage,
  shouldShowToolActivityStatus,
  toolActivityIcon,
  toolActivityActionIcon,
  toolActivityMeta,
  toolMessageLabel,
  toolMessageStatusLabel
}

const toolActivityGroupActions = {
  toggleGroup: toggleToolActivityGroup,
  toggleToolExpanded
}

const conversationPanelHelpers = {
  chatItemStateClasses,
  getChatVirtualItemStyle: (...args) => getChatVirtualItemStyle(...args),
  getChatVirtualItemIndex: (...args) => getChatVirtualItemIndex(...args),
  getChatVirtualItemRef: (...args) => getChatVirtualItemRef(...args),
  chatAvatarStateClasses,
  roleIcon,
  chatAvatarIconClasses,
  shouldRenderHeavyChatMessage: (...args) => shouldRenderHeavyChatMessage(...args),
  shouldDeferHeavyChatBlockLayout: (...args) => shouldDeferHeavyChatBlockLayout(...args),
  isUserMessageCollapsed,
  userMessagePreview,
  shouldRenderUserMessageAsPlainText,
  isUserMessageFoldable,
  userMessageFoldSummary,
  shouldRenderCompactToolMessage,
  getToolMessageStatus,
  formatTime,
  toolActivityIcon,
  toolActivityActionIcon,
  toolMessageLabel,
  toolActivityMeta,
  shouldShowToolActivityStatus,
  toolMessageStatusLabel,
  isChatActivityMessage
}

const conversationPanelActions = {
  handleChatScroll: (...args) => handleChatScroll(...args),
  handleChatWheel: (...args) => handleChatWheel(...args),
  handleChatPointerDown: (...args) => handleChatPointerDown(...args),
  handleChatPreviewLinkClick,
  handleChatPreviewLinkContextMenu,
  toggleThinking,
  handleUserEditKeydown: (...args) => handleUserEditKeydown(...args),
  toggleUserMessageExpanded,
  toggleToolExpanded,
  copyAssistantMessage,
  regenerateAssistant: (...args) => regenerateAssistant(...args),
  copyUserMessage,
  toggleOrSubmitUserEdit: (...args) => toggleOrSubmitUserEdit(...args),
  handleStickyChatBubbleAction: (...args) => handleStickyChatBubbleAction(...args),
  activateAutoScroll: (...args) => activateAutoScroll(...args),
  scrollToUserAnchor: (...args) => scrollToUserAnchor(...args)
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

function toggleThinking(msg) {
  if (!msg) return
  msg.thinkingExpanded = !msg.thinkingExpanded
  scheduleChatVirtualItemRemeasure(msg, { followTail: isAtBottom.value })
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
}

function toggleToolExpanded(msg) {
  if (!msg || (msg.role !== 'tool' && msg.role !== 'tool_call')) return
  const messageId = String(msg.id || '').trim()
  const owner = getMemorySessionForToolMessage(msg)
  const sourceMessage = messageId && Array.isArray(owner?.messages)
    ? owner.messages.find((candidate) => String(candidate?.id || '').trim() === messageId) || msg
    : msg
  sourceMessage.toolExpanded = !sourceMessage.toolExpanded
  scheduleChatVirtualItemRemeasure(sourceMessage, {
    followTail: sourceMessage.toolExpanded && isAtBottom.value
  })
  if (sourceMessage.toolExpanded && !chatVirtualizedEnabled.value) scheduleScrollToBottom()
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
}

function toggleAttachmentsExpanded(msg) {
  if (!msg || msg.role !== 'user') return
  msg.attachmentsExpanded = !msg.attachmentsExpanded
  scheduleChatVirtualItemRemeasure(msg, { followTail: msg.attachmentsExpanded && isAtBottom.value })
  if (msg.attachmentsExpanded && !chatVirtualizedEnabled.value) scheduleScrollToBottom()
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
}


const {
  typewriterStates,
  typewriterEnqueue,
  typewriterWaitIdle,
  deferredAppendMessageField,
  deferredMessageFieldWaitIdle,
  flushDeferredMessageFieldsForMessage,
  typewriterFlushAll
} = useChatStreamingTextBuffer({
  isDisplayMessageInActiveSession,
  scheduleScrollToBottom,
  maybeScheduleScrollToBottomForRun
})

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

const {
  requestSessionTitleAsync,
  autoPersistMemorySessionWhenIdle,
  cleanupExpiredSessionTrash,
  migrateLegacyAutoChatSessionCreatedAt,
  persistActiveMemorySessionBeforeLeaving,
  detachRunningSessionToHistory,
  handleMemorySessionSelect,
  buildCurrentChatState,
  buildDefaultChatState,
  buildHydratedChatState,
  applyDefaultChatState,
  unbindSessionAutosave,
  runExclusiveSessionReset,
  clearSession,
  openSaveSessionModal,
  handleSessionSaved,
  handleSessionPathRenamed,
  handleSessionPathDeleted,
  closeActiveSession
} = (chatSessionManagerApi = useChatSessionManager({
  canUseUtoolsAi,
  buildUtoolsAiMessages,
  recordModelUsage,
  extractModelUsage,
  streamChatCompletion,
  buildChatSessionAssetsDirectory,
  exists,
  moveItem,
  CHAT_SESSION_ROOT,
  createDirectory,
  AUTO_CHAT_SESSION_ROOT,
  sanitizeAutoSessionTitle,
  AUTO_CHAT_SESSION_DIR_NAME,
  getPersistedMemorySessionTitle,
  DEFAULT_MEMORY_SESSION_TITLE,
  normalizeGeneratedSessionTitle,
  buildAutoSessionTitle,
  isAutoChatSessionPath,
  isMemorySessionActive,
  activeSessionFilePath,
  activeSessionTitle,
  sessionTreeRef,
  canRetryMemorySessionTitle,
  canGenerateMemorySessionTitle,
  sessionTitleRequestTokens,
  buildSessionTitleGenerationPrompt,
  normalizeProviderApiMode,
  getMemorySessionById,
  activeMemorySessionId,
  getMemorySessionAutoPersistKey,
  hasResolvedMemorySessionTitle,
  markMemorySessionTitleReady,
  isGeneratedSessionTitle,
  shouldStampHistoryCreatedAtOnGeneratedTitle,
  applyFallbackMemorySessionTitle,
  isMemorySessionRunning,
  hasPersistableMemorySessionResponse,
  autoPersistMemorySessionInFlight,
  readSessionJsonFile,
  resolvePersistedSessionCreatedAtMs,
  AUTO_CHAT_SESSION_SOURCE_TYPE,
  resolveMemorySessionSandboxWorkspaceId,
  writeFile,
  pruneDormantMemorySessions,
  message,
  canPersistMemorySessionToHistory,
  purgeExpiredChatSessionTrash,
  purgeSandboxTrashEntries,
  listDirectory,
  parseIsoTimeMs,
  resolveChatSessionCreatedTimeMs,
  saveActiveMemorySessionDraft,
  isMemorySessionEmptyDraft,
  removeMemorySessionById,
  flushMemoryCandidatesForRecord,
  getActiveMemorySession,
  sending,
  abortController,
  createMemorySessionRecord,
  memorySessions,
  restoreMemorySession,
  withChatSessionOpeningHeavyRender,
  maybeWarmMarkdownPreviewRuntimeForMessages,
  scrollToBottom,
  settleChatViewportAfterSessionOpen,
  resolveCurrentHeavyRenderViewportBuffer,
  CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA,
  persistChatSessionMediaAssets,
  serializeChatMediaForSave,
  session,
  basePromptMode,
  selectedPromptId,
  buildCustomSystemPromptState,
  customSystemPrompt,
  customSystemPromptExplicit,
  selectedAgentId,
  selectedProviderId,
  selectedModel,
  deepCopyJson,
  normalizeStringList,
  selectedSkillIds,
  routerAddedSelectedSkillIds,
  agentSkillIds,
  routerAddedAgentSkillIds,
  activatedAgentSkillIds,
  routerActivatedAgentSkillIds,
  manualMcpIds,
  sandboxHostWorkspacePath,
  normalizeSelectedHostWorkspacePath,
  webSearchEnabled,
  toolApprovalMode,
  autoApproveTools,
  autoActivateAgentSkills,
  toolMode,
  effectiveToolMode,
  thinkingEffort,
  imageGenerationMode,
  videoGenerationMode,
  imageGenerationParamsEnabled,
  imageGenerationParams,
  createDefaultImageGenerationParams,
  videoGenerationParamsEnabled,
  videoGenerationParams,
  createDefaultVideoGenerationParams,
  sessionContextWindowOverride,
  normalizeChatContextWindowConfig,
  normalizeContextTokenTelemetry,
  chatConfig,
  resolveDefaultModelSelectionFromConfig,
  agents,
  BUILTIN_AGENT_ID,
  normalizeToolApprovalMode,
  TOOL_APPROVAL_MODE_MANUAL,
  TOOL_APPROVAL_MODE_SAFE,
  normalizeImageGenerationMode,
  createEmptyContextTokenTelemetry,
  buildMergedChatState,
  applyLoadedChatState,
  lastLoadedDefaultSystemPrompt,
  normalizePromptText,
  hasInitializedDefaultSystemPrompt,
  systemPromptDraft,
  agentModalSelectedId,
  promptModalSelectedId,
  skillModalSelectedIds,
  mcpModalSelectedIds,
  hasAppliedDefaultModel,
  mcpListToolsCache,
  mcpListToolsInFlight,
  mcpToolsRevision,
  clearMcpToolCatalog,
  clearPinnedMcpToolHints,
  normalizeMemoryCandidateQueue,
  clearSessionData,
  typewriterFlushAll,
  clearAllUserEditingState,
  expandedToolActivityGroupIds,
  resetUserAnchors,
  autoScrollEnabled,
  autoScrollSuspendedByUser,
  input,
  pendingAttachments,
  clearSessionApprovedTools,
  chatRunInputQueue,
  touchChatRunInputQueue,
  clearMemoryCandidateFlushTimer,
  createEmptyContextSummaryState,
  syncActiveRequestUiState,
  isMemorySessionChatRunning,
  nextTick,
  waitForLayoutFrame,
  resetChatSetupUiState,
  flushMemoryCandidatesInBackground,
  buildCombinedSystemContent,
  scheduleRefreshUserAnchorMeta,
  buildDefaultSessionName,
  sessionSiderCollapsed,
  collectChatMediaAssetPathsFromPayload,
  deleteChatMediaAssetPaths,
  deleteChatSessionAssetDirectory
}))

function toggleUserMessageExpanded(msg) {
  if (!isUserMessageFoldable(msg)) return
  msg.userMessageExpanded = msg.userMessageExpanded !== true
  const id = String(msg?.id || '').trim()
  if (id) {
    chatMessageEstimatedHeightCache.delete(id)
    if (msg.userMessageExpanded) rememberHydratedHeavyChatMessage(id)
  }
  scheduleChatVirtualItemRemeasure(msg, { followTail: isAtBottom.value })
  scheduleRefreshUserAnchorMeta()
  scheduleStickyChatBubbleSync()
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

  return ensureUniqueChatMessageIds(
    coalesceToolExecutionDisplayMessages(normalized),
    newId
  )
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

onBeforeUnmount(() => {
  if (historySessionLoadHideTimer) {
    window.clearTimeout(historySessionLoadHideTimer)
    historySessionLoadHideTimer = null
  }
  historySessionLoadInFlight = false
  pendingHistorySessionLoadPath = ''
})

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
    const persistedSessionId =
      String(data?.session?.id || data?.source?.sessionId || data?.sessionId || '').trim()
    const persistedOwnedWorkspaceIds = collectChatSessionOwnedSandboxWorkspaceIds([data])
    const persistedSandboxWorkspaceIdCandidate =
      String(
        data?.session?.sandboxWorkspaceId ||
        data?.sandbox?.workspaceId ||
        data?.source?.sandboxWorkspaceId ||
        persistedOwnedWorkspaceIds[0] ||
        ''
      ).trim()
    const persistedSandboxWorkspaceId = isChatSandboxWorkspaceId(persistedSandboxWorkspaceIdCandidate)
      ? persistedSandboxWorkspaceIdCandidate
      : ''
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
        id: persistedSessionId || undefined,
        sandboxWorkspaceId: persistedSandboxWorkspaceId || undefined,
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
      if (persistedSandboxWorkspaceId) {
        record.sandboxWorkspaceId = persistedSandboxWorkspaceId
      } else {
        resolveMemorySessionSandboxWorkspaceId(record)
      }
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
bindDefaultModelConfigListeners({
  providers,
  chatConfig,
  tryApplyDefaultModelFromConfig,
  selectedProvider,
  selectedModel
})

const {
  enqueueMemorySessionApprovalRequest,
  removeMemorySessionApprovalRequest,
  flushMemorySessionApprovalQueue,
  prepareBuiltinAgentToolCallArgs,
  dispatchBuiltinAgentsToolApprovalResponse,
  createAbortAwareDialogStateFromController,
  handleBuiltinAgentsToolApprovalRequest,
  stop,
  handleUserEditKeydown,
  isFiniteNumber,
  resolveUserApiIndexForDisplayMessage,
  getUserApiMessageContentByIndex,
  messageHasDisplayAttachments,
  findNearestUserApiIndexBefore,
  findDisplayIndexByApiIndex,
  truncateConversationAfterUser,
  resetComposerInput,
  getRequestConfigOrHint,
  syncLastBuiltRequestToolsStats,
  dispatchBuiltinAgentsToolApprovalModeChange,
  updateContextTokenTelemetry,
  recordModelUsageFromPayload,
  injectPendingGuidanceMessages,
  runChatRounds,
  mergeUtoolsAiStreamText,
  runUtoolsAiChatRound,
  runImageGenerationRound,
  activeSessionMessageIdSet,
  trackedMessageIdSet,
  isDisplayMessageTracked,
  sessionToolMessageCount,
  compactToolMessageMode,
  startDetachedVideoTaskPolling,
  resolveVideoGenerationContentIfReady,
  runVideoGenerationRound,
  runDetachedVideoGenerationRequest,
  startDetachedVideoGeneration,
  getMediaRequestPrompt,
  getMediaRequestPlaceholderMode,
  getImageRequestOptionsFromMessage,
  getVideoRequestOptionsFromMessage,
  canRegenerateMedia,
  mediaTaskResumeKey,
  isMediaTaskResuming,
  setMediaTaskResuming,
  getVideoResumeRequestMeta,
  canResumeMediaTask,
  countResumableMediaTasks,
  findOpenaiCompatibleProviderByBaseUrl,
  getOpenaiCompatibleMediaConfigOrHint,
  submitMediaGenerationPrompt,
  regenerateMedia,
  setAssistantApiContentForDisplay,
  extractMediaFailureReasonLine,
  mediaFailureSummary,
  mediaFailureSuggestion,
  applyMediaGenerationFailureToDisplay,
  createRequestAbortStateForMediaResume,
  resumeMediaTask,
  CHAT_REQUEST_TIMEOUT_MS,
  runChatSession,
  stageChatAttachmentsInSandbox,
  ensureAttachmentSandboxSkillAvailable,
  prepareUserApiMessage,
  getLatestRealUserPromptText,
  regenerateAssistant,
  toggleOrSubmitUserEdit,
  submitUserEdit,
  commitToolApprovalMode,
  setToolApprovalMode,
  toggleWebSearch,
  toggleAutoActivateAgentSkills,
  cycleToolMode,
  refreshActiveMcpTools,
  getComposerTextareaEl,
  refreshComposerInlinePickers,
  handleComposerCursorChange,
  handleComposerBlur,
  focusComposerAt,
  insertInlineCommandTrigger,
  applyInlineAgentSuggestion,
  replaceInlineCommandToken,
  removeInlineCommandToken,
  applyInlineCommandSuggestion,
  openSystemPromptModal,
  applyCustomSystemPrompt,
  clearCustomSystemPrompt,
  resetSystemPromptToSelectedPrompt,
  openContextWindowModal,
  handleContextWindowPresetChange,
  resetContextWindowDraftToDefault,
  applyContextWindowSettings,
  isCurrentModel,
  selectProviderModel,
  openAgentModal,
  clearSelectedAgent,
  applyAgentModal,
  clearSelectedPrompt,
  applyPromptModal,
  applySkillModal,
  applyMcpModal,
  resolveHistoryContextBudgetState,
  getHistoryContextCharBudget,
  requestContextWindowSummary,
  resolveContextSummaryCoverage,
  ensureContextWindowSummary,
  syncContextSummaryCacheForRecord,
  prepareChatRequestContext,
  startPreparingSend,
  isLikelyImageGenerationPrompt,
  isLikelyVideoGenerationPrompt,
  buildEmptyAssistantResponseText,
  buildMediaGenerationPromptFromHistory,
  buildImageGenerationPromptFromHistory,
  buildVideoGenerationPromptFromHistory,
  hasToolStateMessages,
  shouldRetryToolContinuationAsPlainText,
  buildRequestMessages,
  resolveCurrentToolApprovalMode,
  closeMcpClientSafely,
  registerAbortableMcpClient,
  ensureMcpToolsStatus,
  getMcpToolsCacheKey,
  filterAllowedMcpTools,
  listMcpToolsForServer,
  listMcpPromptsForServer,
  ensureMcpPromptCatalogLoaded,
  buildMcpPromptArgsFromModal,
  buildLocalPromptArgsFromModal,
  insertTextIntoComposer,
  applyMcpPromptToComposer,
  applyLocalPromptToComposer,
  upsertPinnedMcpToolHint,
  buildMcpToolCatalogEntry,
  setMcpToolCatalogEntry,
  warmMcpToolCatalogForServers,
  buildToolsBundle,
  createDisplayMessage,
  resolveSelectedSkillTarget,
  resolveInstalledSkillTarget,
  listSelectedSkillsBrief,
  listInstalledSkillsBrief,
  selectSkillForSession,
  normalizeSkillScriptPathCandidate,
  buildSkillScriptChoiceList,
  resolveSkillScriptTarget,
  resolveActiveMcpServer,
  listActiveMcpServersBrief,
  getSkillMcpStatus,
  getWebOperationsApi,
  getBuiltinSkillsApi,
  builtinSkillActionCatalog,
  getWebToolMissingText,
  WEB_TOOL_RESULT_GUIDANCE,
  buildWebToolModelContent,
  formatWebSearchDisplay,
  formatWebReadDisplay,
  buildWebToolSubMeta,
  executeBuiltinWebTool,
  normalizeToolCallExecutionContext,
  hydrateSkillGatewayExecutionContext,
  resolveToolApprovalTarget,
  prepareToolCallExecution,
  getToolCallParallelExecutionKey,
  executePreparedSkillTool,
  executePreparedMcpTool,
  executePreparedToolCall,
  executeToolCallsParallel,
  executeToolCall,
  queuedInputDrainTimers,
  queuedInputDrainInFlight,
  getComposerDraft,
  clearComposerDraft,
  enqueueComposerDraft,
  steerCurrentRun,
  removeQueuedInput,
  steerQueuedInput,
  scheduleQueuedInputDrain,
  drainQueuedInputs,
  dispatchChatDraft,
  send
} = (chatRequestRunnerApi = useChatRequestRunner({
  BUILTIN_AGENTS_TOOL_APPROVAL_MODE_CHANGE_EVENT,
  BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT,
  BUILTIN_AGENTS_TOOL_APPROVAL_RESPONSE_EVENT,
  BUILTIN_AGENTS_TRACE_EVENT,
  BUILTIN_AGENT_ORCHESTRATION_SKILL_ID,
  BUILTIN_SHELL_SKILL_ID,
  CHAT_RUN_INPUT_MODE_QUEUE,
  CHAT_RUN_INPUT_MODE_STEER,
  CHAT_TOOL_COMPACT_MIN_MESSAGES,
  CHAT_TOOL_COMPACT_MIN_TOOL_MESSAGES,
  INLINE_COMMAND_KIND_LABELS,
  INTERNAL_TOOL_SPECS,
  MAX_EXPANDED_TOOL_COUNT,
  MCP_CATALOG_MAX_TOOL_HINTS_PER_SERVER,
  MCP_CATALOG_MAX_TOOL_NAMES_PER_SERVER,
  MCP_LIST_PROMPTS_TTL_MS,
  MCP_LIST_TOOLS_TTL_MS,
  MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER,
  TOOL_APPROVAL_MODE_FULL,
  TOOL_APPROVAL_MODE_MANUAL,
  TOOL_APPROVAL_MODE_SAFE,
  TOOL_APPROVAL_MODE_TRUSTED,
  VIDEO_GENERATION_RESULT_TIMEOUT_MS,
  abortController,
  activatedAgentSkillIds,
  activeAgentRunToolMessageByStreamId,
  activeMcpIds,
  activeMcpServers,
  activeMemorySessionId,
  agentModalSelectedId,
  agentSkillIds,
  applyAgent,
  applyAssistantRequestPlaceholderMode,
  applyBasePromptSelection,
  applyDefaultChatState,
  applyDefaultGeneralAgent,
  applyImageGenerationImagesToDisplay,
  applyImageGenerationTaskToDisplay,
  applyImageGenerationTextToDisplay,
  applyVideoGenerationTaskToDisplay,
  applyVideoGenerationTextToDisplay,
  applyVideoGenerationVideosToDisplay,
  assistantImageTaskStatusLabel,
  assistantVideoTaskStatusLabel: assistantMediaHelpers.assistantVideoTaskStatusLabel,
  assistantVisibleVideoCount: assistantMediaHelpers.assistantVisibleVideoCount,
  attachMediaRequestSnapshot,
  autoActivateAgentSkills,
  autoActivateAgentSkillsFromText,
  autoPersistMemorySessionWhenIdle,
  autoScrollEnabled,
  autoScrollSuspendedByUser,
  basePromptMode,
  basePromptText,
  buildActiveRequestOverrides,
  buildChatAttachmentReferenceBlock,
  buildChatContextWindow,
  buildChatContextWindowRuntimeOptions,
  buildChatRequestMessages,
  buildCombinedSystemContent,
  buildContextSummarySourceHash,
  buildContextSummaryTurnSegments,
  buildCurrentChatState,
  buildImageGenerationApiSummary,
  buildImageGenerationCompatibilityError,
  buildImageGenerationPendingText,
  buildImageGenerationRequestOptionsWithReferences,
  buildManualImageGenerationRequestInfo,
  buildManualVideoGenerationRequestInfo,
  buildMcpArgsFromForm,
  buildMcpToolHint,
  buildMediaRequestSnapshot,
  buildMemoryInjection,
  buildMemoryRecallQueryFromAttachments,
  buildMemoryRecallQueryFromRecord,
  buildPromptVariableValues,
  buildProviderToolDefinition,
  buildProviderToolDescription,
  buildSessionToolApprovalKey,
  buildSkillToolsBundle,
  buildToolExecutionResultSubMeta,
  buildToolVisionUserMessage,
  buildUtoolsAiMessages,
  buildVideoGenerationApiSummary,
  buildVideoGenerationCompatibilityError,
  buildVideoGenerationPendingText,
  buildVideoGenerationRequestOptionsWithReferences,
  calculateContextSummaryTriggerChars,
  calculateReservedRequestChars,
  canGenerateMemorySessionTitle,
  canRetryMemorySessionTitle,
  canUseUtoolsAi,
  cancelPendingToolApprovals,
  chatConfig,
  chatMessageEstimatedHeightCache,
  chatRunInputQueue,
  cleanupChatPreviewLinkHandlers,
  cleanupPendingBuiltinAgentsEvents,
  clearAssistantMediaBubblePlaceholders,
  clearAttachmentFileReferences,
  clearChatVirtualItemRemeasure,
  clearInlineAgentPicker,
  clearInlineCommandPicker,
  clearInlinePickers,
  clearStickyChatBubbleSync,
  closeAllPooledMCPClients,
  closePooledMCPClient,
  collectAttachmentMediaReferenceImages,
  collectImageGenerationRevisedPrompts,
  composerInputKey,
  composerPanelRef,
  computed,
  confirmToolCall,
  contentHasUserAttachments,
  contextWindowDraft,
  contextWindowPreviewOmittedFilter,
  contextWindowResolvedOptions,
  createAbortError,
  createAssistantImageBubblePlaceholder,
  createAssistantVideoBubblePlaceholder,
  createBuiltinSkillActionCatalog,
  createEmptyContextSummaryState,
  createImageGenerationPlaceholderDisplay,
  createPendingLongTextAttachment,
  createPendingToolExecutionMessage,
  createPreparedMcpToolExecutor,
  createPreparedSkillToolExecutor,
  createRepeatedToolCallGuard,
  createToolExecutionResultMessage,
  createToolResultApiMessage,
  createVideoGenerationPlaceholderDisplay,
  customSystemPrompt,
  customSystemPromptExplicit,
  deepCopyJson,
  deferredAppendMessageField,
  deferredMessageFieldWaitIdle,
  detachedMediaAbortStates,
  dialog,
  disconnectChatLayoutResizeObserver,
  disconnectChatMessageVisibilityObserver,
  effectiveContextWindowConfig,
  effectiveToolMode,
  enableFcToolCallIdCompat,
  enrichImageAttachmentsForMemoryRecall,
  ensureAttachmentParsed,
  estimateMessageSize,
  estimateMessagesSize,
  estimateToolDefinitionsChars,
  evaluateToolApproval,
  extractChatImagesFromToolResult,
  extractChatVideosFromToolResult,
  extractContextTokenMetrics,
  extractEditableUserTextFromContent,
  extractImageGenerationPromptFromContent,
  extractImageGenerationTaskState,
  extractImageGenerationTextResult,
  extractInlineAgentContext,
  extractInlineCommandContext,
  extractModelUsage,
  extractPromptVariables,
  extractUtoolsAiReasoningText,
  extractVideoGenerationTaskState,
  findLocalPromptById,
  findMcpPromptCatalogItem,
  flushDeferredMessageFieldsForMessage,
  flushPendingBuiltinAgentsEvents,
  formatLocalUserPromptForComposer,
  formatMcpPromptResultForComposer,
  formatToolResultContentForModel,
  getActiveMemorySession,
  getCompatKey,
  getContextTokenTelemetry,
  getCurrentImageGenerationRequestOptions,
  getCurrentVideoGenerationRequestOptions,
  getFirstEnabledInlineCommandIndex,
  getLoadedSkillFilePathSet,
  getMcpPrompt,
  getMediaGenerationSystemContent,
  getMemorySessionById,
  getMemorySessionForMessage,
  getMemorySessionForToolMessage,
  getMemorySessionPendingApprovalCount,
  getOrCreateMCPClient,
  getProviderModelType,
  getRunRecord,
  getRunSessionTarget,
  getSkillFileIndex,
  getSkillScriptCatalog,
  globalContextWindowConfig,
  handleBuiltinAgentsTraceEvent,
  hasChatContextWindowReduction,
  hasLoadedSkillMainContent,
  hasPendingBuiltinAgentsEvents,
  imageGenerationMode,
  importFilesToSandbox,
  inferUserDisplayMessageRender,
  inlineAgentActiveIndex,
  inlineAgentMatchEnd,
  inlineAgentMatchStart,
  inlineAgentQuery,
  inlineAgentSuggestions,
  inlineCommandActiveIndex,
  inlineCommandMatchEnd,
  inlineCommandMatchStart,
  inlineCommandMode,
  inlineCommandQuery,
  inlineCommandSuggestions,
  inlineCommandType,
  input,
  inspectChatContextWindow,
  isAbortError,
  isAgentRunToolName,
  isChatMemoryEnabled,
  isComposerCompositionKeydownEvent,
  isDangerousShellApprovalCommand,
  isDefaultGeneralAgent,
  isDirectorySkill,
  isFcToolCallIdCompatEnabled,
  isFinalizedMemorySessionTitle,
  isLikelyImageGenerationModel,
  isLikelyVideoGenerationModel,
  isMemorySessionActive,
  isMemorySessionChatRunning,
  isRunnableSkillScriptPath,
  isSkillPromptContentLoaded,
  isSystemPrompt,
  isToolMessage,
  isUserPrompt,
  isUtoolsBuiltinProvider,
  lastBuiltRequestToolsStats,
  listSelectedSkillsBriefFromList,
  loadSkillMainContent,
  loadedSkillContentById,
  loadedSkillFileCacheBySkillId,
  loadingMcpPrompts,
  makeLocalPromptOptionValue,
  makeMcpPromptOptionValue,
  makeToolFunctionName,
  manualMcpIds,
  markSkillActivationPersistent,
  maybeScheduleScrollToBottomForRun,
  maybeScrollToBottomForRun,
  mcpListPromptsCache,
  mcpListPromptsInFlight,
  mcpListToolsCache,
  mcpListToolsInFlight,
  mcpModalSelectedIds,
  mcpPinnedToolHintsByServerId,
  mcpPinnedToolHintsRevision,
  mcpPromptCatalog,
  mcpServers,
  mcpToolCatalogByServerId,
  mcpToolCatalogRevision,
  mcpToolsRevision,
  mcpToolsStatusByServerId,
  memorySessions,
  mergeReferenceImagesIntoRequestOptions,
  mergeUserTextWithExistingAttachments,
  message,
  messageContentHasImageUrl,
  moveInlineAgentActive,
  moveInlineCommandActive,
  newId,
  nextDisplayMessageTime,
  nextTick,
  normalizeAssistantToolCalls,
  normalizeChatContextWindowConfig,
  normalizeImageGenerationMode,
  normalizeMcpPromptList,
  normalizeProviderApiMode,
  normalizeSkillScriptApprovalArgs,
  normalizeStringList,
  normalizeToolApprovalMode,
  onBeforeUnmount,
  parsePromptOptionValue,
  pendingAttachments,
  pendingToolApprovals,
  persistChatMediaListAssets,
  prepareAssistantDisplayForTextResponse,
  preparingSend,
  preparingSendStage,
  promptMcpArgsForm,
  promptModalSelectedId,
  promptUserArgsForm,
  providers,
  queueMemoryCandidateForRecord,
  reactive,
  refreshingMcpTools,
  registerUtoolsAiToolFunctions,
  releaseMCPClient,
  removeDisplayMessageById,
  removeRunDisplayMessageById,
  requestImageGeneration,
  requestSessionTitleAsync,
  requestVideoGeneration,
  resetPromptVariableFormData,
  resolveActiveAgentRunToolMessage,
  resolveBuiltinSkillCall,
  resolveChatContextWindowBudgetPlan,
  resolveChatContextWindowOptions,
  resolveChatLongTextAttachmentPlan,
  resolveChatToolWorkspaceScope,
  resolveContextSummaryChain,
  resolveContextSummaryLevel,
  resolveContextSummarySourceLabel,
  resolveMcpToolApprovalPolicy,
  resolveMemorySessionSandboxWorkspaceId,
  resolveMemorySessionTitle,
  resolveSelectedSkillTargetFromList,
  resolveSessionHostWorkspacePath,
  resolveSystemPromptModalApplyState,
  resumingMediaTaskKeys,
  routerActivatedAgentSkillIds,
  routerAddedAgentSkillIds,
  routerAddedSelectedSkillIds,
  runRecordByAbortState,
  runtimeAgentSkillIdSet,
  runtimeAgentSkillIds,
  runtimeMcpServers,
  runtimeSkillObjects,
  safeJsonParse,
  saveActiveMemorySessionDraft,
  scheduleRefreshUserAnchorMeta,
  scheduleScrollToBottom,
  scrollToBottom,
  searchCapabilities,
  selectedAgent,
  selectedLocalPromptVariables,
  selectedMcpPromptArgs,
  selectedModel,
  selectedPromptId,
  selectedPromptModalParsedValue,
  selectedProvider,
  selectedProviderId,
  selectedSkillIds,
  selectedSkillObjects,
  sending,
  session,
  sessionApprovedToolKeys,
  sessionContextWindowOverride,
  setStickyChatBubbleState,
  shouldAutoAttachToolImagesForVision,
  shouldClearBasePromptSelectionImmediately,
  shouldFallbackMediaRequestToChat,
  shouldFallbackVisionInputToText,
  shouldFetchVideoGenerationContent,
  shouldIncludeReasoningContent,
  shouldRetryWithReasoningContent,
  shouldRetryWithoutParallelToolCalls,
  shouldSubmitComposerKeydownEvent,
  shouldSummarizeContextWindow,
  showAgentModal,
  showContextWindowModal,
  showInlineAgentPicker,
  showInlineCommandPicker,
  showMcpModal,
  showMediaLibraryModal,
  showModelModal,
  showPromptModal,
  showSkillModal,
  showSystemPromptModal,
  skillModalSelectedIds,
  skills,
  stableStringify,
  streamChatCompletion,
  syncActiveRequestUiState,
  syncChatResponsiveState,
  systemContent,
  systemPromptDraft,
  thinkingEffort,
  throwIfAborted,
  toolApprovalMode,
  toolMode,
  touchChatRunInputQueue,
  truncateInlineText,
  truncateText,
  typewriterEnqueue,
  typewriterFlushAll,
  typewriterStates,
  typewriterWaitIdle,
  updateChatConfig,
  useChatMessageTracking,
  useChatUserMessageIndexing,
  videoGenerationMode,
  visibleSelectedAgent,
  waitForAbortable,
  waitForVideoGenerationResult,
  webSearchEnabled,
  withDefaultChatSandboxWorkspaceId,
  withTimeout

}))

// The immediate config watcher runs before the request runner exists. Reapply
// its initial synchronization now that the real callbacks are available.
if (!showContextWindowModal.value && !sessionContextWindowOverride.value) {
  syncContextWindowDraft(chatConfig.value?.contextWindow)
}
contextWindowStatsCache.value = buildContextWindowStats({
  includeRequestDetails: showContextWindowModal.value
})

const handleInputKeydown = createChatInputKeydownHandler({
  isComposerCompositionKeydownEvent,
  sending,
  steerCurrentRun,
  showInlineCommandPicker,
  moveInlineCommandActive,
  inlineCommandSuggestions,
  inlineCommandActiveIndex,
  getFirstEnabledInlineCommandIndex,
  applyInlineCommandSuggestion,
  clearInlineCommandPicker,
  showInlineAgentPicker,
  moveInlineAgentActive,
  inlineAgentSuggestions,
  inlineAgentActiveIndex,
  applyInlineAgentSuggestion,
  clearInlineAgentPicker,
  shouldSubmitComposerKeydownEvent,
  send
})

bindUtoolsEnterDataListener({
  utoolsEnterData,
  buildUtoolsEnterEventKey,
  input,
  send
})
</script>

<style src="./Chat.css"></style>
