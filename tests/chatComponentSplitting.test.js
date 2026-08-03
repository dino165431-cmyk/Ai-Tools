import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const chatSource = fs.readFileSync(path.resolve('src/views/pages/chat/Chat.vue'), 'utf8')
const chatMediaActionsSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMediaActions.js'),
  'utf8'
)
const chatAssistantMediaPresentationSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatAssistantMediaPresentation.js'),
  'utf8'
)
const chatToolPresentationSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatToolPresentation.js'),
  'utf8'
)
const chatToolExecutionMessageFactorySource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatToolExecutionMessageFactory.js'),
  'utf8'
)
const chatToolExecutionMergeSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatToolExecutionMerge.js'),
  'utf8'
)
const chatAgentRunTraceEventsSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatAgentRunTraceEvents.js'),
  'utf8'
)
const chatSessionTitlesSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatSessionTitles.js'),
  'utf8'
)
const chatSessionTimestampsSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatSessionTimestamps.js'),
  'utf8'
)
const chatStreamingTextBufferSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatStreamingTextBuffer.js'),
  'utf8'
)
const chatMessageRenderingSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMessageRendering.js'),
  'utf8'
)
const chatToolDefinitionsSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatToolDefinitions.js'),
  'utf8'
)
const chatPromptFormattingSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatPromptFormatting.js'),
  'utf8'
)
const chatMemorySessionMetadataSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMemorySessionMetadata.js'),
  'utf8'
)
const chatUserMessageIndexingSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatUserMessageIndexing.js'),
  'utf8'
)
const chatUsageTelemetrySource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatUsageTelemetry.js'),
  'utf8'
)
const chatMediaRequestPresentationSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMediaRequestPresentation.js'),
  'utf8'
)
const chatMediaGenerationDisplaySource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMediaGenerationDisplay.js'),
  'utf8'
)
const chatMessageTrackingSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMessageTracking.js'),
  'utf8'
)
const chatRunSessionTargetingSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatRunSessionTargeting.js'),
  'utf8'
)
const chatMemorySessionRegistrySource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMemorySessionRegistry.js'),
  'utf8'
)
const chatMemorySessionLifecycleSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMemorySessionLifecycle.js'),
  'utf8'
)
const chatSessionManagerSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatSessionManager.js'),
  'utf8'
)
const chatRequestRunnerSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatRequestRunner.js'),
  'utf8'
)
const chatMediaGenerationSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatMediaGeneration.js'),
  'utf8'
)
const chatPageRuntimeSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatPageRuntime.js'),
  'utf8'
)

test('chat keeps always-visible panels eager and lazy-loads secondary modals', () => {
  assert.match(chatSource, /import ChatComposerPanel from '\.\/ChatComposerPanel\.vue'/)
  assert.match(chatSource, /import ChatConversationPanel from '\.\/ChatConversationPanel\.vue'/)

  for (const component of [
    'ChatAgentPickerModal',
    'ChatContextWindowModal',
    'ChatMcpPickerModal',
    'ChatMediaLibraryModal',
    'ChatModelSettingsModal',
    'ChatPromptPickerModal',
    'ChatSkillPickerModal',
    'ChatSystemPromptModal'
  ]) {
    assert.match(
      chatSource,
      new RegExp(`const ${component} = defineAsyncComponent\\(\\(\\) => import\\('\\./${component}\\.vue'\\)\\)`)
    )
    assert.doesNotMatch(chatSource, new RegExp(`import ${component} from`))
  }
})

test('chat delegates media copy, download, and metadata actions to a composable', () => {
  assert.match(chatSource, /import \{ useChatMediaActions \} from '\.\/composables\/useChatMediaActions\.js'/)
  assert.match(chatSource, /} = useChatMediaActions\(\{/)

  for (const action of [
    'copyChatImage',
    'copyChatVideo',
    'downloadChatImage',
    'downloadChatVideo',
    'updateChatImageMetadata',
    'updateChatVideoMetadata'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${action}\\(`))
    assert.match(chatMediaActionsSource, new RegExp(`function ${action}\\(`))
  }
})

test('chat delegates assistant media placeholders and display helpers to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatAssistantMediaPresentation \} from '\.\/composables\/useChatAssistantMediaPresentation\.js'/
  )
  assert.match(chatSource, /} = useChatAssistantMediaPresentation\(\{/)

  for (const helper of [
    'createAssistantImageBubblePlaceholder',
    'createAssistantVideoBubblePlaceholder',
    'assistantVideoTaskStatusLabel',
    'assistantVideoDisplayTitle',
    'applyAssistantRequestPlaceholderMode'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatAssistantMediaPresentationSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates tool status, activity, and icon presentation to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatToolPresentation \} from '\.\/composables\/useChatToolPresentation\.js'/
  )
  assert.match(chatSource, /} = useChatToolPresentation\(\)/)

  for (const helper of [
    'getToolMessageStatus',
    'toolMessageStatusLabel',
    'toolActivityIcon',
    'isChatActivityMessage',
    'chatItemStateClasses',
    'roleIcon',
    'shouldRenderCompactToolMessage'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatToolPresentationSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates tool execution message construction to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatToolExecutionMessageFactory \} from '\.\/composables\/useChatToolExecutionMessageFactory\.js'/
  )
  assert.match(chatSource, /} = useChatToolExecutionMessageFactory\(\{/)

  for (const helper of [
    'inferToolResultStatus',
    'buildToolExecutionMessageContent',
    'createPendingToolExecutionMessage',
    'createToolExecutionResultMessage',
    'buildToolExecutionResultSubMeta',
    'canCoalesceToolResultIntoPending'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatToolExecutionMessageFactorySource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates tool result merging and coalescing to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatToolExecutionMerge \} from '\.\/composables\/useChatToolExecutionMerge\.js'/
  )
  assert.match(chatSource, /} = useChatToolExecutionMerge\(\{/)

  for (const helper of [
    'mergeToolExecutionDisplayMessage',
    'maybeCoalesceLatestToolMessages',
    'coalesceToolExecutionDisplayMessages'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatToolExecutionMergeSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates agent run trace batching and live updates to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatAgentRunTraceEvents \} from '\.\/composables\/useChatAgentRunTraceEvents\.js'/
  )
  assert.match(chatSource, /} = useChatAgentRunTraceEvents\(\{/)

  for (const helper of [
    'resolveActiveAgentRunToolMessage',
    'updateAgentRunToolMessageTraceBatch',
    'updateAgentRunToolMessageLiveUpdate',
    'flushPendingBuiltinAgentsEvents',
    'handleBuiltinAgentsTraceEvent'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatAgentRunTraceEventsSource, new RegExp(`function ${helper}\\(`))
  }
  assert.doesNotMatch(chatSource, /pendingBuiltinAgentsEventsByStreamId/)
  assert.doesNotMatch(chatSource, /pendingBuiltinAgentsEventsFlushTimer/)
})

test('chat delegates session title normalization and prompt construction to a composable', () => {
  assert.match(
    chatSource,
    /from '\.\/composables\/useChatSessionTitles\.js'/
  )

  for (const helper of [
    'buildDefaultSessionName',
    'sanitizeAutoSessionTitle',
    'extractAutoSessionTitle',
    'buildAutoSessionTitle',
    'getSessionTitleFromPath',
    'normalizeGeneratedSessionTitle',
    'summarizeAttachmentNamesForSessionTitle',
    'buildSessionTitleGenerationPrompt'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatSessionTitlesSource, new RegExp(`function ${helper}\\(`))
  }

  const sessionTitleImport = chatSource.match(
    /import \{([\s\S]*?)\} from '\.\/composables\/useChatSessionTitles\.js'/
  )
  assert.ok(sessionTitleImport)
  assert.match(sessionTitleImport[1], /\bgetSessionTitleFromPath\b/)
  assert.doesNotMatch(
    chatSource,
    /const \{[^}]*\bgetSessionTitleFromPath\b[^}]*\} = useChatSessionManager\(\{/s
  )
})

test('chat delegates persisted session timestamp resolution to a composable', () => {
  assert.match(chatSource, /from '\.\/composables\/useChatSessionTimestamps\.js'/)

  for (const helper of ['parseIsoTimeMs', 'resolvePersistedSessionCreatedAtMs']) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatSessionTimestampsSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates typewriter and deferred streaming buffers to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatStreamingTextBuffer \} from '\.\/composables\/useChatStreamingTextBuffer\.js'/
  )
  assert.match(chatSource, /} = useChatStreamingTextBuffer\(\{/)

  for (const helper of [
    'takeUnicodeChunk',
    'getTypewriterChunkSize',
    'typewriterEnqueue',
    'typewriterWaitIdle',
    'deferredAppendMessageField',
    'deferredMessageFieldWaitIdle',
    'flushDeferredMessageFieldsForMessage',
    'deferredMessageFieldFlushAll',
    'typewriterFlushAll'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatStreamingTextBufferSource, new RegExp(`function ${helper}\\(`))
  }
  assert.doesNotMatch(chatSource, /const typewriterStates = new Map\(\)/)
  assert.doesNotMatch(chatSource, /const deferredMessageFieldStates = new Map\(\)/)
})

test('chat delegates message rendering and user folding decisions to a composable', () => {
  assert.match(chatSource, /from '\.\/composables\/useChatMessageRendering\.js'/)

  for (const helper of [
    'isLikelyMarkdownContent',
    'hasHtmlLikeTagLine',
    'inferUserDisplayMessageRender',
    'shouldRenderUserMessageAsPlainText',
    'getUserMessageFoldInfo',
    'isUserMessageFoldable',
    'isUserMessageCollapsed',
    'userMessagePreview',
    'userMessageFoldSummary',
    'shouldKeepLoadedAssistantTextRender',
    'inferLoadedDisplayMessageRender'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatMessageRenderingSource, new RegExp(`function ${helper}\\(`))
  }
  assert.doesNotMatch(chatSource, /const userMessageFoldInfoCache = new WeakMap\(\)/)
})

test('chat delegates provider tool schema and catalog hint construction to a composable', () => {
  assert.match(chatSource, /from '\.\/composables\/useChatToolDefinitions\.js'/)

  for (const helper of [
    'normalizeOneLine',
    'buildToolArgsHint',
    'buildMcpToolHint',
    'makeToolFunctionName',
    'sanitizeToolInputSchemaForProvider',
    'isObjectLikeToolInputSchema',
    'buildProviderToolDefinition',
    'buildProviderToolDescription'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatToolDefinitionsSource, new RegExp(`function ${helper}\\(`))
  }
  assert.doesNotMatch(chatSource, /MCP_CATALOG_MAX_OPTIONAL_KEYS_PER_TOOL/)
})

test('chat delegates MCP and local prompt formatting to a composable', () => {
  assert.match(chatSource, /from '\.\/composables\/useChatPromptFormatting\.js'/)

  for (const helper of [
    'normalizeMcpPromptList',
    'stringifyPromptContentBlock',
    'formatMcpPromptResultForComposer',
    'formatLocalUserPromptForComposer'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatPromptFormattingSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates memory session title and persistence eligibility to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatMemorySessionMetadata \} from '\.\/composables\/useChatMemorySessionMetadata\.js'/
  )
  assert.match(chatSource, /} = useChatMemorySessionMetadata\(\{/)

  for (const helper of [
    'getMemorySessionRunningCount',
    'isMemorySessionRunning',
    'hasResolvedMemorySessionTitle',
    'canGenerateMemorySessionTitle',
    'canRetryMemorySessionTitle',
    'hasPersistableMemorySessionResponse',
    'canPersistMemorySessionToHistory',
    'resolveMemorySessionTitle',
    'markMemorySessionTitleReady'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatMemorySessionMetadataSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates user display and API message indexing to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatUserMessageIndexing \} from '\.\/composables\/useChatUserMessageIndexing\.js'/
  )
  assert.match(chatRequestRunnerSource, /} = useChatUserMessageIndexing\(\{/) 

  for (const helper of [
    'isFiniteNumber',
    'resolveUserApiIndexForDisplayMessage',
    'getUserApiMessageContentByIndex',
    'messageHasDisplayAttachments',
    'findNearestUserApiIndexBefore',
    'findDisplayIndexByApiIndex',
    'truncateConversationAfterUser'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatUserMessageIndexingSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates model usage and context token normalization to a composable', () => {
  assert.match(chatSource, /from '\.\/composables\/useChatUsageTelemetry\.js'/)

  for (const helper of ['extractModelUsage', 'readUsageNumber', 'extractContextTokenMetrics']) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatUsageTelemetrySource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates media request snapshots and generated-image text to a composable', () => {
  assert.match(chatSource, /from '\.\/composables\/useChatMediaRequestPresentation\.js'/)

  for (const helper of [
    'buildImageGenerationResultText',
    'buildImageGenerationApiSummary',
    'buildImageGenerationPendingText',
    'buildMediaRequestSnapshot',
    'attachMediaRequestSnapshot'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatMediaRequestPresentationSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates image and video display transitions to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatMediaGenerationDisplay \} from '\.\/composables\/useChatMediaGenerationDisplay\.js'/
  )
  assert.match(chatSource, /} = useChatMediaGenerationDisplay\(\{/)

  for (const helper of [
    'createImageGenerationPlaceholderDisplay',
    'applyImageGenerationTaskToDisplay',
    'applyImageGenerationTextToDisplay',
    'applyImageGenerationImagesToDisplay',
    'buildVideoGenerationPendingText',
    'createVideoGenerationPlaceholderDisplay',
    'applyVideoGenerationTaskToDisplay',
    'applyVideoGenerationTextToDisplay',
    'applyVideoGenerationVideosToDisplay',
    'buildVideoGenerationApiSummary'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatMediaGenerationDisplaySource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates active and retained message tracking to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatMessageTracking \} from '\.\/composables\/useChatMessageTracking\.js'/
  )
  assert.match(chatRequestRunnerSource, /} = useChatMessageTracking\(\{/) 

  for (const helper of ['buildChatMessageIdSet', 'isDisplayMessageInActiveSession', 'isDisplayMessageTracked']) {
    if (helper !== 'isDisplayMessageInActiveSession') {
      assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    }
    assert.match(chatMessageTrackingSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates run-to-session ownership and scroll guards to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatRunSessionTargeting \} from '\.\/composables\/useChatRunSessionTargeting\.js'/
  )
  assert.match(chatSource, /} = useChatRunSessionTargeting\(\{/)

  for (const helper of [
    'getRunRecord',
    'getRunSessionTarget',
    'isRunRecordActive',
    'maybeScrollToBottomForRun',
    'maybeScheduleScrollToBottomForRun',
    'getMemorySessionForMessage',
    'getMemorySessionForToolMessage'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatRunSessionTargetingSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates memory session record creation and lookup to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatMemorySessionRegistry \} from '\.\/composables\/useChatMemorySessionRegistry\.js'/
  )
  assert.match(chatSource, /} = useChatMemorySessionRegistry\(\{/)

  for (const helper of [
    'createEmptyContextSummaryState',
    'createEmptyContextTokenTelemetry',
    'normalizeContextTokenTelemetry',
    'createMemorySessionRecord',
    'resolveMemorySessionSandboxWorkspaceId',
    'getActiveMemorySession',
    'getMemorySessionById'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatMemorySessionRegistrySource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates memory session lifecycle cleanup to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatMemorySessionLifecycle \} from '\.\/composables\/useChatMemorySessionLifecycle\.js'/
  )
  assert.match(chatSource, /} = useChatMemorySessionLifecycle\(\{/)

  for (const helper of [
    'isAutoChatSessionPath',
    'isTimedTaskSessionPath',
    'isMemorySessionActive',
    'isMemorySessionEmptyDraft',
    'clearMemoryCandidateFlushTimer',
    'clearPendingMemoryCandidates',
    'removeMemorySessionById',
    'pruneDormantMemorySessions'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatMemorySessionLifecycleSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates the session management domain to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatSessionManager \} from '\.\/composables\/useChatSessionManager\.js'/
  )
  assert.match(chatSource, /} = \(chatSessionManagerApi = useChatSessionManager\(\{/)

  for (const helper of [
    'requestSessionTitleAsync',
    'autoPersistMemorySession',
    'persistActiveMemorySessionBeforeLeaving',
    'detachRunningSessionToHistory',
    'buildCurrentChatState',
    'buildSessionSavePayload',
    'scheduleSessionAutosave',
    'openSaveSessionModal',
    'handleSessionPathDeleted',
    'closeActiveSession'
  ]) {
    if (helper !== 'scheduleSessionAutosave') {
      assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    }
    assert.match(chatSessionManagerSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat keeps runtime-only dependencies wired after composable extraction', () => {
  assert.match(chatSource, /let historySessionLoadHideTimer = null/)
  assert.doesNotMatch(chatRequestRunnerSource, /\bhistorySessionLoadInFlight\b/)
  assert.doesNotMatch(chatRequestRunnerSource, /\bpendingHistorySessionLoadPath\b/)

  assert.match(chatPageRuntimeSource, /\bisUserMessageCollapsed,\s+userMessagePreview,/)
  assert.match(chatSource, /\bisUserMessageCollapsed,\s+userMessagePreview,\s+maybeCoalesceLatestToolMessages,/)

  for (const dependency of [
    'assistantVideoTaskStatusLabel',
    'assistantVisibleVideoCount',
    'buildImageGenerationPromptFromHistory',
    'buildVideoGenerationPromptFromHistory',
    'isDisplayMessageTracked',
    'mergeReferenceImagesIntoRequestOptions',
    'recordModelUsageFromPayload'
  ]) {
    assert.match(chatMediaGenerationSource, new RegExp(`^\\s{4}${dependency},$`, 'm'))
  }

  assert.match(
    chatRequestRunnerSource,
    /function extractRequestMessageTextContent\(content\) \{\s+return extractImageGenerationPromptFromContent\(content\)\s+\}/
  )
  assert.match(chatRequestRunnerSource, /^\s{4}mergeReferenceImagesIntoRequestOptions,$/m)
  assert.match(chatSource, /\bmergeReferenceImagesIntoRequestOptions,\s+mergeUserTextWithExistingAttachments,/)
})

test('chat delegates request execution, streaming, cancellation, and approvals to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatRequestRunner \} from '\.\/composables\/useChatRequestRunner\.js'/
  )
  assert.match(chatSource, /} = \(chatRequestRunnerApi = useChatRequestRunner\(\{/) 

  for (const helper of [
    'enqueueMemorySessionApprovalRequest',
    'flushMemorySessionApprovalQueue',
    'stop',
    'runChatRounds',
    'runChatSession',
    'prepareChatRequestContext',
    'buildToolsBundle',
    'executeToolCall',
    'dispatchChatDraft',
    'send'
  ]) {
    assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatRequestRunnerSource, new RegExp(`function ${helper}\\(`))
  }
})

test('request runner delegates image and video generation lifecycle to a composable', () => {
  assert.match(
    chatRequestRunnerSource,
    /import \{ useChatMediaGeneration \} from '\.\/useChatMediaGeneration\.js'/
  )
  assert.match(chatRequestRunnerSource, /} = useChatMediaGeneration\(\{/)

  for (const helper of [
    'runImageGenerationRound',
    'runVideoGenerationRound',
    'startDetachedVideoTaskPolling',
    'resumeMediaTask',
    'regenerateMedia',
    'applyMediaGenerationFailureToDisplay'
  ]) {
    assert.doesNotMatch(chatRequestRunnerSource, new RegExp(`function ${helper}\\(`))
    assert.match(chatMediaGenerationSource, new RegExp(`function ${helper}\\(`))
  }
})

test('chat delegates lifecycle, viewport runtime, shortcuts, and app listeners to a composable', () => {
  assert.match(
    chatSource,
    /import \{ useChatPageRuntime \} from '\.\/composables\/useChatPageRuntime\.js'/
  )
  assert.match(chatSource, /} = \(chatPageRuntimeApi = useChatPageRuntime\(\{/) 

  for (const helper of [
    'scrollToBottom',
    'scheduleScrollToBottom',
    'handleChatScroll',
    'setupChatMessageVisibilityObserver',
    'refreshChatViewportState',
    'createChatInputKeydownHandler',
    'bindDefaultModelConfigListeners',
    'bindUtoolsEnterDataListener'
  ]) {
    if (helper !== 'scrollToBottom') {
      assert.doesNotMatch(chatSource, new RegExp(`function ${helper}\\(`))
    }
    assert.match(chatPageRuntimeSource, new RegExp(`function ${helper}\\(`))
  }

  assert.doesNotMatch(chatRequestRunnerSource, /function handleInputKeydown\(/)
})

test('chat late-bound cross-layer callbacks remain thin composable delegates', () => {
  const delegates = [
    ['scrollToBottom', 'chatPageRuntimeApi'],
    ['maybeScheduleStreamingScroll', 'chatPageRuntimeApi'],
    ['scheduleSessionAutosave', 'chatSessionManagerApi'],
    ['getCurrentToolsKey', 'chatRequestRunnerApi'],
    ['buildRequestApiMessages', 'chatRequestRunnerApi'],
    ['isDisplayMessageInActiveSession', 'chatRequestRunnerApi'],
    ['recordModelUsage', 'chatRequestRunnerApi'],
    ['clearMcpToolCatalog', 'chatRequestRunnerApi'],
    ['clearPinnedMcpToolHints', 'chatRequestRunnerApi'],
    ['clearAllUserEditingState', 'chatRequestRunnerApi'],
    ['resetChatSetupUiState', 'chatRequestRunnerApi'],
    ['syncContextWindowDraft', 'chatRequestRunnerApi']
  ]

  for (const [helper, api] of delegates) {
    assert.match(
      chatSource,
      new RegExp(
        `(?:async\\s+)?function ${helper}\\(\\.\\.\\.args\\) \\{[^}]*return ${api}\\?\\.${helper}\\?\\.\\(\\.\\.\\.args\\)[^}]*\\}`
      )
    )
  }
})
