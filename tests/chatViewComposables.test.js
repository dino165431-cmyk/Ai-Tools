import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import {
  normalizeChatMediaGenerationMode,
  useChatMediaControls
} from '../src/views/pages/chat/composables/useChatMediaControls.js'
import {
  makeLocalPromptOptionValue,
  makeMcpPromptOptionValue,
  useChatInlinePicker
} from '../src/views/pages/chat/composables/useChatInlinePicker.js'
import { useChatAttachments } from '../src/views/pages/chat/composables/useChatAttachments.js'
import {
  findLastChatAnchorTopAtOrBefore,
  getChatUserAnchorPreview,
  useChatUserAnchors
} from '../src/views/pages/chat/composables/useChatUserAnchors.js'
import { useChatAutoScroll } from '../src/views/pages/chat/composables/useChatAutoScroll.js'
import {
  buildContextWindowBudgetItem,
  contextWindowHistoryFocusOptions,
  contextWindowPreviewEntryNoteV2,
  contextWindowPreviewModeLabelV2,
  contextWindowPresetOptions,
  formatApproxChars,
  hasContextWindowHardBudgetReason,
  matchesContextWindowOmittedFilter
} from '../src/views/pages/chat/composables/useChatContextWindowPresentation.js'
import { buildChatLinkContextMenuOptions } from '../src/views/pages/chat/composables/useChatLinkActions.js'
import { ensureFilenameExt } from '../src/views/pages/chat/composables/useChatMediaActions.js'
import { useChatAssistantMediaPresentation } from '../src/views/pages/chat/composables/useChatAssistantMediaPresentation.js'
import { useChatToolPresentation } from '../src/views/pages/chat/composables/useChatToolPresentation.js'
import { useChatToolExecutionMessageFactory } from '../src/views/pages/chat/composables/useChatToolExecutionMessageFactory.js'
import { useChatToolExecutionMerge } from '../src/views/pages/chat/composables/useChatToolExecutionMerge.js'
import {
  mergeAgentRunLivePayload,
  useChatAgentRunTraceEvents
} from '../src/views/pages/chat/composables/useChatAgentRunTraceEvents.js'
import {
  buildAutoSessionTitle,
  buildDefaultSessionName,
  buildSessionTitleGenerationPrompt,
  extractAutoSessionTitle,
  normalizeGeneratedSessionTitle,
  sanitizeAutoSessionTitle,
  summarizeAttachmentNamesForSessionTitle
} from '../src/views/pages/chat/composables/useChatSessionTitles.js'
import {
  parseIsoTimeMs,
  resolvePersistedSessionCreatedAtMs
} from '../src/views/pages/chat/composables/useChatSessionTimestamps.js'
import { useChatStreamingTextBuffer } from '../src/views/pages/chat/composables/useChatStreamingTextBuffer.js'
import {
  getUserMessageFoldInfo,
  inferLoadedDisplayMessageRender,
  inferUserDisplayMessageRender,
  isLikelyMarkdownContent,
  isUserMessageCollapsed,
  shouldRenderUserMessageAsPlainText,
  userMessagePreview
} from '../src/views/pages/chat/composables/useChatMessageRendering.js'
import {
  buildMcpToolHint,
  buildProviderToolDefinition,
  buildProviderToolDescription,
  buildToolArgsHint,
  makeToolFunctionName,
  normalizeOneLine,
  sanitizeToolInputSchemaForProvider
} from '../src/views/pages/chat/composables/useChatToolDefinitions.js'
import {
  formatLocalUserPromptForComposer,
  formatMcpPromptResultForComposer,
  normalizeMcpPromptList,
  stringifyPromptContentBlock
} from '../src/views/pages/chat/composables/useChatPromptFormatting.js'
import { useChatMemorySessionMetadata } from '../src/views/pages/chat/composables/useChatMemorySessionMetadata.js'
import { useChatUserMessageIndexing } from '../src/views/pages/chat/composables/useChatUserMessageIndexing.js'
import {
  extractContextTokenMetrics,
  extractModelUsage,
  readUsageNumber
} from '../src/views/pages/chat/composables/useChatUsageTelemetry.js'
import {
  attachMediaRequestSnapshot,
  buildImageGenerationApiSummary,
  buildImageGenerationPendingText,
  buildImageGenerationResultText,
  buildMediaRequestSnapshot
} from '../src/views/pages/chat/composables/useChatMediaRequestPresentation.js'
import { useChatMediaGenerationDisplay } from '../src/views/pages/chat/composables/useChatMediaGenerationDisplay.js'
import {
  buildChatMessageIdSet,
  useChatMessageTracking
} from '../src/views/pages/chat/composables/useChatMessageTracking.js'
import { useChatRunSessionTargeting } from '../src/views/pages/chat/composables/useChatRunSessionTargeting.js'
import { useChatMemorySessionRegistry } from '../src/views/pages/chat/composables/useChatMemorySessionRegistry.js'
import { useChatMemorySessionLifecycle } from '../src/views/pages/chat/composables/useChatMemorySessionLifecycle.js'
import { useChatSessionManager } from '../src/views/pages/chat/composables/useChatSessionManager.js'

test('chat media controls normalize and cycle generation modes', () => {
  assert.equal(normalizeChatMediaGenerationMode(' ON '), 'on')
  assert.equal(normalizeChatMediaGenerationMode('unexpected'), 'auto')

  const controls = useChatMediaControls()
  assert.equal(controls.imageGenerationMode.value, 'auto')
  assert.equal(controls.showInputModeTags.value, false)

  controls.cycleImageGenerationMode()
  assert.equal(controls.imageGenerationMode.value, 'on')
  assert.equal(controls.imageGenerationModeLabel.value, '开启')
  assert.equal(controls.showInputModeTags.value, true)

  controls.setImageGenerationMode('invalid')
  assert.equal(controls.imageGenerationMode.value, 'auto')
})

test('chat inline picker derives agent and command suggestions from page sources', () => {
  const picker = useChatInlinePicker({
    agents: ref([
      { _id: 'builtin', name: '通用助手', builtin: true },
      { _id: 'writer', name: '写作助手', provider: 'provider-a', model: 'chat-model' }
    ]),
    providers: ref([{ _id: 'provider-a', name: '测试服务商' }]),
    selectedAgentId: ref(null),
    prompts: ref([]),
    mcpPromptCatalog: ref([]),
    basePromptMode: ref('custom'),
    selectedPromptId: ref(null),
    skills: ref([]),
    agentSkillIdSet: ref(new Set()),
    selectedSkillIds: ref([]),
    manualMcpIds: ref([]),
    derivedMcpIds: ref([]),
    orderedMcpServers: ref([])
  })

  picker.inlineAgentQuery.value = '写作'
  picker.inlineAgentMatchStart.value = 0
  assert.deepEqual(picker.inlineAgentSuggestions.value.map((item) => item.value), ['writer'])
  assert.equal(picker.showInlineAgentPicker.value, true)

  picker.inlineCommandMode.value = 'kind'
  picker.inlineCommandQuery.value = 'skill'
  picker.inlineCommandMatchStart.value = 0
  assert.equal(picker.inlineCommandSuggestions.value[0]?.value, 'skill')
  assert.equal(picker.showInlineCommandPicker.value, true)

  picker.clearInlinePickers()
  assert.equal(picker.showInlineAgentPicker.value, false)
  assert.equal(picker.showInlineCommandPicker.value, false)
})

test('chat prompt option values remain stable across the extracted picker module', () => {
  assert.equal(makeLocalPromptOptionValue(' prompt-a '), 'local:prompt-a')
  assert.equal(
    makeMcpPromptOptionValue({ serverId: 'server/a', name: 'prompt name' }),
    'mcp:server%2Fa:prompt%20name'
  )
})

test('chat attachments own pending file parsing and removal state', async () => {
  const notices = []
  let nextId = 0
  const attachments = useChatAttachments({
    createId: () => `attachment-${++nextId}`,
    message: {
      success: (text) => notices.push(['success', text]),
      warning: (text) => notices.push(['warning', text])
    }
  })
  const file = new Blob(['hello'], { type: 'text/plain' })
  Object.defineProperty(file, 'name', { value: 'hello.txt' })

  assert.equal(attachments.appendPendingFiles([file]), 1)
  const attachment = attachments.pendingAttachments.value[0]
  await attachments.ensureAttachmentParsed(attachment)

  assert.equal(attachment.id, 'attachment-1')
  assert.equal(attachment.status, 'ready')
  assert.equal(attachment.kind, 'file')
  assert.equal(attachment.sandboxOnly, true)
  assert.equal(attachments.pendingFileAttachments.value.length, 1)
  assert.equal(attachments.pendingImageAttachments.value.length, 0)

  attachments.removeAttachment(attachment.id)
  assert.equal(attachments.pendingAttachments.value.length, 0)
  assert.deepEqual(notices, [])
})

test('chat attachments reject oversized files before adding pending state', () => {
  const warnings = []
  const attachments = useChatAttachments({
    createId: () => 'unused',
    message: {
      success() {},
      warning: (text) => warnings.push(text)
    }
  })

  const oversized = {
    name: 'oversized.bin',
    size: 1024 * 1024 * 1024,
    type: 'application/octet-stream'
  }
  assert.equal(attachments.appendPendingFiles([oversized]), 0)
  assert.equal(attachments.pendingAttachments.value.length, 0)
  assert.match(warnings[0], /超过单文件上限/)
})

test('chat user anchors derive previews and track the active visible question', () => {
  const messages = ref([
    { id: 'user-1', role: 'user', content: '\n  第一条问题  \n第二行' },
    { id: 'assistant-1', role: 'assistant', content: '回答' },
    { id: 'user-2', role: 'user', content: '第二条问题' }
  ])
  const dense = ref(false)
  const tops = new Map([['user-1', 0], ['user-2', 200]])
  const container = { scrollTop: 210, clientHeight: 120 }
  const anchors = useChatUserAnchors({
    messages,
    isDenseLayout: dense,
    getMessageTop: (id) => tops.get(id),
    getScrollContainer: () => container
  })

  assert.deepEqual(anchors.userAnchors.value.map((item) => item.preview), ['第一条问题', '第二条问题'])
  assert.equal(anchors.showAnchorRail.value, true)
  anchors.refreshUserAnchorMeta()
  anchors.updateActiveAnchorFromScroll(container)
  assert.equal(anchors.activeAnchorId.value, 'user-2')

  dense.value = true
  assert.equal(anchors.showAnchorRail.value, false)
})

test('chat user anchor helpers keep preview and binary lookup behavior stable', () => {
  assert.equal(getChatUserAnchorPreview({ content: '' }), '(empty)')
  assert.equal(
    getChatUserAnchorPreview({ content: '123456789012345678901234567890123456789012345' }),
    '1234567890123456789012345678901234567890...'
  )
  assert.equal(findLastChatAnchorTopAtOrBefore([{ top: 10 }, { top: 30 }, { top: 70 }], 30), 1)
  assert.equal(findLastChatAnchorTopAtOrBefore([{ top: 10 }, { top: 30 }], 5), -1)
})

test('chat auto scroll tracks bottom distance and user suspension state', () => {
  const container = { scrollHeight: 1000, scrollTop: 600, clientHeight: 100 }
  const scroll = useChatAutoScroll({ getScrollContainer: () => container })

  assert.deepEqual(scroll.updateAtBottomState(container), { distanceFromBottom: 300, atBottom: false })
  assert.equal(scroll.showScrollToBottomButton.value, true)
  assert.equal(scroll.shouldFollowStreamingScroll(), false)

  container.scrollTop = 890
  assert.deepEqual(scroll.updateAtBottomState(container), { distanceFromBottom: 10, atBottom: true })
  assert.equal(scroll.showScrollToBottomButton.value, false)
  assert.equal(scroll.shouldFollowStreamingScroll(), true)

  scroll.autoScrollSuspendedByUser.value = true
  assert.equal(scroll.shouldFollowStreamingScroll(), false)
})

test('chat auto scroll distinguishes and clears programmatic scroll markers', () => {
  const scroll = useChatAutoScroll()
  scroll.markProgrammaticChatScroll(500, 120)
  assert.equal(scroll.isExpectedProgrammaticChatScroll(120), true)
  scroll.clearProgrammaticChatScrollMark()
  assert.equal(scroll.isExpectedProgrammaticChatScroll(120), false)
})

test('chat context window presentation keeps budget and omission labels stable', () => {
  assert.deepEqual(contextWindowPresetOptions.map((item) => item.value), ['aggressive', 'balanced', 'wide', 'custom'])
  assert.deepEqual(contextWindowHistoryFocusOptions.map((item) => item.value), ['recent', 'balanced', 'attachments'])
  assert.equal(formatApproxChars(1250), '1.3k')
  assert.equal(formatApproxChars(12_500), '13k')

  const budget = buildContextWindowBudgetItem({
    key: 'history',
    label: '历史字符',
    used: 950,
    max: 1000,
    formatter: formatApproxChars
  })
  assert.equal(budget.percent, 95)
  assert.equal(budget.tone, 'critical')
  assert.equal(budget.usedLabel, '950')

  assert.equal(hasContextWindowHardBudgetReason(['message_limit']), true)
  assert.equal(matchesContextWindowOmittedFilter({ reasons: ['prelude_budget_exhausted'] }, 'budget'), true)
  assert.equal(matchesContextWindowOmittedFilter({ hasAttachment: true }, 'attachments'), true)
  assert.equal(contextWindowPreviewModeLabelV2({ mode: 'compact', variant: 'compact_tight' }), '极强压缩')
  assert.match(
    contextWindowPreviewEntryNoteV2({ mode: 'compact', variant: 'compact_adaptive' }),
    /自适应压缩/
  )
})

test('chat link actions expose stable menus for web, note, and sandbox links', () => {
  assert.deepEqual(
    buildChatLinkContextMenuOptions('https://example.com').map((item) => item.key),
    ['open', 'copy']
  )
  assert.equal(buildChatLinkContextMenuOptions('https://example.com')[0].label, '在浏览器中打开链接')
  assert.equal(buildChatLinkContextMenuOptions('note://demo')[0].label, '打开引用的笔记')

  const fileMenu = buildChatLinkContextMenuOptions('sandbox://result.txt', { name: 'result.txt' })
  assert.deepEqual(
    fileMenu.filter((item) => item.key).map((item) => item.key),
    ['save-file-as', 'open-file', 'show-file', 'copy-file-name', 'copy-file-path', 'copy-file-link']
  )
})

test('chat media actions preserve generated download filename extensions', () => {
  assert.equal(ensureFilenameExt('preview', 'image/jpeg'), 'preview.jpg')
  assert.equal(ensureFilenameExt('clip', 'video/webm'), 'clip.webm')
  assert.equal(ensureFilenameExt('already.png', 'video/mp4'), 'already.png')
  assert.match(ensureFilenameExt('', 'video/mp4'), /^image_\d+\.mp4$/)
})

test('chat assistant media presentation preserves placeholders and video task labels', () => {
  let nextId = 0
  const presentation = useChatAssistantMediaPresentation({
    createId: () => `media-${++nextId}`,
    canRegenerateMedia: () => true,
    canResumeMediaTask: () => false,
    isMediaTaskResuming: () => false
  })
  const message = { transientRequestPlaceholder: true }

  presentation.applyAssistantRequestPlaceholderMode(message, 'image')
  assert.equal(message.imageBubblePlaceholder, true)
  assert.equal(message.imageBubblePlaceholderImage.id, 'assistant-image-placeholder-media-1')
  assert.equal(presentation.assistantMediaHelpers.assistantVisibleImages(message).length, 1)
  assert.equal(presentation.assistantMediaHelpers.assistantImageBlockEyebrow(message), '图片占位')

  assert.equal(
    presentation.assistantMediaHelpers.assistantVideoTaskStatusLabel({
      videoTask: { status: 'fetching_result' }
    }),
    '拉取结果中'
  )
  assert.equal(
    presentation.assistantMediaHelpers.assistantVideoDisplayTitle({
      videos: [{ src: 'video-1' }, { src: 'video-2' }]
    }),
    '已生成 2 个视频'
  )

  presentation.prepareAssistantDisplayForTextResponse(message)
  assert.equal(message.imageBubblePlaceholder, false)
  assert.equal(message.imageBubblePlaceholderImage, null)
  assert.equal(message.transientRequestPlaceholder, false)
})

test('chat tool presentation preserves status precedence and compact display state', () => {
  const presentation = useChatToolPresentation()
  const pending = { role: 'tool_call', toolName: 'search' }
  const paused = { role: 'tool', toolStatus: 'paused', toolName: 'search' }

  assert.equal(presentation.getToolMessageStatus(pending), 'running')
  assert.equal(presentation.toolMessageStatusLabel(pending), '运行中')
  assert.equal(presentation.getToolMessageStatus(paused), 'paused')
  assert.equal(presentation.shouldShowToolActivityStatus(paused), true)
  assert.equal(presentation.shouldRenderCompactToolMessage(paused), true)
  assert.equal(
    presentation.shouldRenderCompactToolMessage({ ...paused, toolExpanded: true }),
    false
  )
  assert.deepEqual(presentation.chatAvatarIconClasses(pending), {
    'is-streaming': false,
    'is-spinning': true
  })
  assert.equal(
    presentation.isChatActivityMessage({ role: 'assistant', thinking: '分析中' }),
    true
  )
})

test('chat tool execution message factory preserves content, trace, and correlation metadata', () => {
  const presentation = useChatToolPresentation()
  const factory = useChatToolExecutionMessageFactory({
    createDisplayMessage: (role, content, extra) => ({ role, content, ...extra }),
    isToolMessage: presentation.isToolMessage,
    normalizeToolMessageStatus: presentation.normalizeToolMessageStatus,
    getToolMessageStatus: presentation.getToolMessageStatus,
    toolMessageStatusText: presentation.toolMessageStatusText,
    toolMessageStatusDetailText: presentation.toolMessageStatusDetailText,
    isLiveToolMessageStatus: presentation.isLiveToolMessageStatus
  })

  assert.equal(factory.extractServerNameFromToolMeta('MCP / search'), 'MCP')
  assert.equal(factory.extractToolNameFromToolMeta('MCP / search'), 'search')
  assert.equal(factory.extractFirstJsonFenceText('```json\n{"q":"demo"}\n```'), '{"q":"demo"}')
  assert.equal(factory.inferToolResultStatus({ role: 'tool_call' }), 'running')

  const content = factory.buildToolExecutionMessageContent({
    serverName: 'MCP',
    toolName: 'search',
    argsText: '{"q":"demo"}',
    status: 'running',
    traceItems: [{ title: '准备', tool_name: 'search' }]
  })
  assert.match(content, /状态：\*\*运行中\*\*/)
  assert.match(content, /#### 实时轨迹/)
  assert.match(content, /准备 \| 工具=search/)

  const pending = factory.createPendingToolExecutionMessage({
    serverName: '内置智能体',
    toolName: 'agent_run',
    argsObj: { agent_name: '研究助手' },
    toolExecutionId: 'execution-1'
  })
  assert.equal(pending.role, 'tool_call')
  assert.equal(pending.toolExpanded, true)
  assert.equal(pending.toolSubMeta, '智能体：研究助手')
  assert.equal(pending.toolTraceStreamId, 'execution-1')

  assert.equal(
    factory.canCoalesceToolResultIntoPending(
      { role: 'tool_call', toolExecutionId: 'execution-1' },
      { role: 'tool', toolExecutionId: 'execution-1' }
    ),
    true
  )
  assert.equal(
    factory.buildToolExecutionResultSubMeta({
      kind: 'sandbox_run',
      workspaceKind: 'host',
      isolationLevel: 'host-workspace',
      workspacePath: 'E:/workspace',
      cwd: 'src'
    }),
    '本机工作区（无系统沙盒）：E:/workspace · cwd：src'
  )
})

test('chat tool execution merge preserves identity and removes coalesced result rows', () => {
  const presentation = useChatToolPresentation()
  const factory = useChatToolExecutionMessageFactory({
    createDisplayMessage: (role, content, extra) => ({ role, content, ...extra }),
    isToolMessage: presentation.isToolMessage,
    normalizeToolMessageStatus: presentation.normalizeToolMessageStatus,
    getToolMessageStatus: presentation.getToolMessageStatus,
    toolMessageStatusText: presentation.toolMessageStatusText,
    toolMessageStatusDetailText: presentation.toolMessageStatusDetailText,
    isLiveToolMessageStatus: presentation.isLiveToolMessageStatus
  })
  const messages = [
    {
      role: 'tool_call',
      toolStatus: 'running',
      toolName: 'search',
      toolServerName: 'MCP',
      toolArgsText: '{"q":"demo"}',
      toolExecutionId: 'execution-1',
      toolTraceStreamId: 'stream-1',
      toolLiveTrace: []
    },
    {
      role: 'tool',
      toolStatus: 'success',
      toolName: 'search',
      toolExecutionId: 'execution-1',
      content: '### 工具结果\n完成'
    }
  ]
  const deletedStreams = []
  let refreshCount = 0
  const merge = useChatToolExecutionMerge({
    getSessionMessages: () => messages,
    isToolMessage: presentation.isToolMessage,
    inferToolResultStatus: factory.inferToolResultStatus,
    extractServerNameFromToolMeta: factory.extractServerNameFromToolMeta,
    buildToolExecutionMessageContent: factory.buildToolExecutionMessageContent,
    isLiveToolMessageStatus: presentation.isLiveToolMessageStatus,
    canCoalesceToolResultIntoPending: factory.canCoalesceToolResultIntoPending,
    deleteActiveAgentRunToolMessage: (streamId) => deletedStreams.push(streamId),
    scheduleRefreshUserAnchorMeta: () => { refreshCount += 1 }
  })

  merge.maybeCoalesceLatestToolMessages()

  assert.equal(messages.length, 1)
  assert.equal(messages[0].role, 'tool')
  assert.equal(messages[0].toolStatus, 'success')
  assert.equal(messages[0].toolExecutionId, 'execution-1')
  assert.match(messages[0].content, /工具结果/)
  assert.deepEqual(deletedStreams, ['stream-1'])
  assert.equal(refreshCount, 1)
})

test('chat agent run trace events merge live updates and finish active streams', () => {
  assert.deepEqual(
    mergeAgentRunLivePayload(
      { content: 'old', reasoning: 'old reasoning', round: 1 },
      { reset: true, content: 'new' }
    ),
    {
      content: 'new',
      reasoning: 'old reasoning',
      round: 1,
      reset: true,
      status: 'running'
    }
  )

  const presentation = useChatToolPresentation()
  const factory = useChatToolExecutionMessageFactory({
    createDisplayMessage: (role, content, extra) => ({ role, content, ...extra }),
    isToolMessage: presentation.isToolMessage,
    normalizeToolMessageStatus: presentation.normalizeToolMessageStatus,
    getToolMessageStatus: presentation.getToolMessageStatus,
    toolMessageStatusText: presentation.toolMessageStatusText,
    toolMessageStatusDetailText: presentation.toolMessageStatusDetailText,
    isLiveToolMessageStatus: presentation.isLiveToolMessageStatus
  })
  const message = {
    role: 'tool_call',
    toolStatus: 'running',
    toolName: 'agent_run',
    toolServerName: 'built-in agents',
    toolArgsText: '{}',
    toolTraceStreamId: 'stream-1',
    toolLiveTrace: [],
    toolExpanded: true,
    toolLiveFinalContent: '',
    toolLiveFinalReasoning: ''
  }
  let refreshCount = 0
  let scrollCount = 0
  const traceEvents = useChatAgentRunTraceEvents({
    getActiveMessages: () => [message],
    getMemorySessions: () => [],
    isToolMessage: presentation.isToolMessage,
    normalizeToolMessageStatus: presentation.normalizeToolMessageStatus,
    getToolMessageStatus: presentation.getToolMessageStatus,
    buildToolExecutionMessageContent: factory.buildToolExecutionMessageContent,
    extractServerNameFromToolMeta: factory.extractServerNameFromToolMeta,
    scheduleRefreshUserAnchorMeta: () => { refreshCount += 1 },
    maybeScheduleStreamingScroll: () => { scrollCount += 1 }
  })
  traceEvents.activeAgentRunToolMessageByStreamId.set('stream-1', message)

  traceEvents.handleBuiltinAgentsTraceEvent({
    detail: {
      streamId: 'stream-1',
      entry: {
        idx: 1,
        phase: 'run.started',
        title: 'started',
        agent_name: 'research agent'
      },
      live: {
        content: 'stage output',
        reasoning: 'reasoning',
        round: 1,
        status: 'running'
      }
    }
  })

  assert.equal(message.toolLiveTrace.length, 1)
  assert.equal(message.toolAgentName, 'research agent')
  assert.equal(message.toolLiveFinalContent, 'stage output')
  assert.equal(message.toolLiveFinalReasoning, 'reasoning')
  assert.equal(message.toolLiveRound, 1)
  assert.equal(message.toolResultPayload.status, 'running')
  assert.equal(message.toolResultPayload.final.content, 'stage output')
  assert.match(message.content, /####/)
  assert.ok(refreshCount > 0)
  assert.ok(scrollCount > 0)

  traceEvents.handleBuiltinAgentsTraceEvent({
    detail: { streamId: 'stream-1', done: true }
  })
  assert.equal(traceEvents.activeAgentRunToolMessageByStreamId.has('stream-1'), false)
  traceEvents.cleanupPendingBuiltinAgentsEvents()
})

test('chat session title helpers preserve sanitizing, fallback, and prompt inputs', () => {
  assert.equal(sanitizeAutoSessionTitle('  demo / title **  ', 20), 'demo   title')
  assert.equal(extractAutoSessionTitle('https://example.com demo title'), 'demo title')
  assert.equal(
    buildDefaultSessionName({ messages: [{ role: 'user', content: 'first topic' }] }),
    'first topic'
  )
  assert.equal(buildAutoSessionTitle({ messages: [] }, 'fallback title'), 'fallback title')
  assert.equal(normalizeGeneratedSessionTitle('Title: "clean title"'), 'clean title')
  assert.equal(
    summarizeAttachmentNamesForSessionTitle([
      { name: 'one.txt' },
      { filename: 'two.pdf' },
      { fileName: 'three.png' }
    ]).includes('two.pdf'),
    true
  )
  const prompt = buildSessionTitleGenerationPrompt({
    text: 'summarize the report',
    attachments: [{ name: 'report.pdf' }]
  })
  assert.match(prompt, /summarize the report/)
  assert.match(prompt, /report\.pdf/)
})

test('chat session timestamps preserve valid fallbacks and earliest creation time', () => {
  const first = Date.parse('2024-01-01T00:00:00.000Z')
  const second = Date.parse('2024-02-01T00:00:00.000Z')
  assert.equal(parseIsoTimeMs('invalid', 123), 123)
  assert.equal(parseIsoTimeMs('2024-01-01T00:00:00.000Z'), first)
  assert.equal(
    resolvePersistedSessionCreatedAtMs({
      record: { createdAt: second },
      payload: { createdAt: '2024-03-01T00:00:00.000Z' },
      previousPayload: { createdAt: '2024-01-01T00:00:00.000Z' }
    }),
    first
  )
  assert.equal(resolvePersistedSessionCreatedAtMs(), 0)
})

test('chat streaming text buffer preserves unicode chunks and deferred fields', async () => {
  const previousWindow = globalThis.window
  globalThis.window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  }
  try {
    const activeIds = new Set(['message-1'])
    let scrollCount = 0
    const buffer = useChatStreamingTextBuffer({
      isDisplayMessageInActiveSession: (message) => activeIds.has(message?.id),
      scheduleScrollToBottom: () => { scrollCount += 1 },
      maybeScheduleScrollToBottomForRun: () => { scrollCount += 1 }
    })
    const message = { id: 'message-1', content: '', thinking: '' }

    buffer.typewriterEnqueue(message, 'A😀B')
    await buffer.typewriterWaitIdle(message.id)
    assert.equal(message.content, 'A😀B')
    assert.ok(scrollCount > 0)

    buffer.deferredAppendMessageField(message, 'thinking', 'reasoning', {
      intervalMs: 16,
      scheduleScroll: true
    })
    await buffer.deferredMessageFieldWaitIdle(message.id, 'thinking')
    assert.equal(message.thinking, 'reasoning')

    activeIds.delete(message.id)
    buffer.typewriterEnqueue(message, ' detached')
    assert.equal(message.content, 'A😀B detached')
    buffer.typewriterFlushAll()
    assert.equal(buffer.typewriterStates.size, 0)
  } finally {
    globalThis.window = previousWindow
  }
})

test('chat message rendering keeps markdown, html, and user folding decisions stable', () => {
  assert.equal(isLikelyMarkdownContent('# heading'), true)
  assert.equal(isLikelyMarkdownContent('plain text'), false)
  assert.equal(inferUserDisplayMessageRender('<section>'), 'text')
  assert.equal(inferUserDisplayMessageRender('**bold**'), 'md')
  assert.equal(shouldRenderUserMessageAsPlainText({ render: 'text', content: '**bold**' }), true)

  const message = { role: 'user', content: 'x'.repeat(1800) }
  const info = getUserMessageFoldInfo(message)
  assert.equal(info.charCount, 1800)
  assert.equal(info.foldable, true)
  assert.equal(userMessagePreview(message).length, 1200)
  assert.equal(isUserMessageCollapsed(message), true)
  message.editing = true
  assert.equal(isUserMessageCollapsed(message), false)

  assert.equal(inferLoadedDisplayMessageRender({ role: 'assistant' }, '# heading'), 'md')
  assert.equal(inferLoadedDisplayMessageRender({ role: 'user' }, '<div>'), 'text')
})

test('chat tool definitions preserve schema compatibility and compact hints', () => {
  assert.equal(normalizeOneLine(' first\n second ', 20), 'first second')
  assert.equal(normalizeOneLine('123456789', 8), '12345...')

  const properties = Object.fromEntries(
    Array.from({ length: 14 }, (_, index) => [`field_${index}`, { type: 'string' }])
  )
  const argsHint = buildToolArgsHint({
    inputSchema: {
      type: 'object',
      properties,
      required: ['field_0']
    }
  })
  assert.deepEqual(argsHint.required, ['field_0'])
  assert.equal(argsHint.optional.length, 12)
  assert.equal(argsHint.optional_truncated, 1)
  assert.equal(buildToolArgsHint({ inputSchema: { type: 'string' } }).input_type, 'string')
  assert.equal(buildMcpToolHint({ name: 'search', description: ' web\n search ' }).name, 'search')

  const functionName = makeToolFunctionName('server id', 'tool/name'.repeat(12))
  assert.ok(functionName.startsWith('mcp__server_id__'))
  assert.ok(functionName.length <= 64)

  const sanitized = sanitizeToolInputSchemaForProvider({
    type: 'object',
    properties: { query: { type: 'string' } },
    anyOf: [{ type: 'string' }]
  })
  assert.equal(sanitized.type, 'object')
  assert.equal(sanitized.additionalProperties, false)
  assert.equal('anyOf' in sanitized, false)

  const wrapped = buildProviderToolDefinition({ type: 'string' })
  assert.equal(wrapped.wrapped, true)
  assert.equal(wrapped.parameters.required[0], 'input')
  assert.equal(wrapped.unwrapArgs({ input: 'value' }), 'value')
  assert.match(
    buildProviderToolDescription({ name: 'server' }, { name: 'tool' }, wrapped),
    /original inputSchema/
  )
})

test('chat prompt formatting preserves MCP metadata, blocks, and local variables', () => {
  const prompts = normalizeMcpPromptList(
    { _id: 'server-1', name: 'Demo MCP' },
    [
      { name: 'research', description: 'Research a topic', arguments: [{ name: 'topic' }] },
      { name: '   ' }
    ]
  )
  assert.equal(prompts.length, 1)
  assert.equal(prompts[0].label, 'Demo MCP / research')
  assert.equal(prompts[0].arguments[0].name, 'topic')

  assert.equal(
    stringifyPromptContentBlock([{ type: 'text', text: 'one' }, { resource: { text: 'two' }, type: 'resource' }]),
    'one\n\ntwo'
  )
  const formatted = formatMcpPromptResultForComposer(
    {
      messages: [
        { role: 'system', content: 'instructions' },
        { role: 'user', content: [{ type: 'text', text: 'question' }] }
      ]
    },
    { serverName: 'Demo MCP', name: 'research' }
  )
  assert.match(formatted, /MCP Prompt: Demo MCP \/ research/)
  assert.match(formatted, /System:\ninstructions/)
  assert.match(formatted, /User:\nquestion/)
  assert.equal(
    formatLocalUserPromptForComposer({ content: 'Hello {{name}}' }, { name: 'Codex' }),
    'Hello Codex'
  )
})

test('chat memory session metadata preserves title and persistence eligibility decisions', () => {
  const metadata = useChatMemorySessionMetadata({
    defaultMemorySessionTitle: 'new chat',
    autoChatSessionDirName: 'history',
    getSessionTitleFromPath: (filePath) => filePath ? 'path title' : ''
  })
  const record = {
    id: 'record-1',
    title: 'new chat',
    messages: [
      { role: 'user', content: 'research this topic' },
      { role: 'assistant', content: 'result' }
    ],
    apiMessages: [],
    runningTaskCount: 0,
    chatRunCount: 0
  }

  assert.equal(metadata.getMemorySessionRunningCount({ runningTaskCount: -1 }), 0)
  assert.equal(metadata.getMemorySessionPendingApprovalCount({ pendingApprovalRequests: [1, 2] }), 2)
  assert.equal(metadata.isMemorySessionRunning(record), false)
  assert.equal(metadata.hasResolvedMemorySessionTitle(record), false)
  assert.equal(metadata.hasPersistableMemorySessionResponse(record), true)
  assert.equal(metadata.canGenerateMemorySessionTitle(record), true)
  assert.equal(metadata.canRetryMemorySessionTitle(record), true)

  const readyAt = metadata.applyFallbackMemorySessionTitle(record, 'Generated title', 123)
  assert.equal(readyAt, 123)
  assert.equal(record.title, 'Generated title')
  assert.equal(metadata.isFinalizedMemorySessionTitle(record), true)
  assert.equal(metadata.canPersistMemorySessionToHistory(record), true)
  assert.equal(metadata.shouldStampHistoryCreatedAtOnGeneratedTitle(record), true)
  assert.equal(metadata.getMemorySessionAutoPersistKey(record), 'id:record-1')
  assert.equal(metadata.isGeneratedSessionTitle('Generated title'), true)

  const pathRecord = { title: 'new chat', activeSessionFilePath: 'history/topic.json' }
  assert.equal(metadata.resolveMemorySessionTitle(pathRecord), 'path title')
  assert.equal(metadata.markMemorySessionTitleReady(pathRecord, 456), 456)
})

test('chat user message indexing keeps display and API conversation mappings stable', () => {
  const session = {
    messages: [
      { role: 'user', apiIndex: 0 },
      { role: 'assistant', apiIndex: 1 },
      { role: 'user', apiIndex: 2 }
    ],
    apiMessages: [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'second' }
    ]
  }
  const indexing = useChatUserMessageIndexing({
    getSession: () => session,
    contentHasUserAttachments: (content) => content === 'has attachment'
  })

  assert.equal(indexing.resolveUserApiIndexForDisplayMessage({ apiIndex: 0 }), 0)
  assert.equal(indexing.resolveUserApiIndexForDisplayMessage({}), 2)
  assert.equal(indexing.getUserApiMessageContentByIndex(2), 'second')
  assert.equal(indexing.getUserApiMessageContentByIndex(1), null)
  assert.equal(indexing.findNearestUserApiIndexBefore(2), 0)
  assert.equal(indexing.findDisplayIndexByApiIndex('user', 2), 2)
  assert.equal(indexing.messageHasDisplayAttachments({ attachments: [{}] }), true)
  session.apiMessages[2].content = 'has attachment'
  assert.equal(indexing.messageHasDisplayAttachments({ apiIndex: 2 }), true)

  indexing.truncateConversationAfterUser(0, 0)
  assert.equal(session.messages.length, 1)
  assert.equal(session.apiMessages.length, 1)
})

test('chat usage telemetry normalizes provider payload and cache token aliases', () => {
  const nestedUsage = { prompt_tokens: 120, prompt_tokens_details: { cached_tokens: 30 } }
  assert.equal(extractModelUsage({ payloads: [{ usage: { prompt_tokens: 10 } }, { response: { usage: nestedUsage } }] }), nestedUsage)
  assert.equal(readUsageNumber({ input: { tokens: '9.8' } }, [['input', 'tokens']]), 9)
  assert.deepEqual(
    extractContextTokenMetrics({
      input_tokens: 20,
      cache_read_input_tokens: 4,
      cache_creation_input_tokens: 6
    }),
    { inputTokens: 30, cachedTokens: 4 }
  )
  assert.deepEqual(
    extractContextTokenMetrics({
      prompt_tokens: 20,
      prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 6 }
    }),
    { inputTokens: 20, cachedTokens: 4 }
  )
})

test('chat media request presentation preserves snapshots and generated-image summaries', () => {
  assert.equal(buildImageGenerationResultText({ imageCount: 1, revisedPrompts: [] }), '')
  assert.match(
    buildImageGenerationResultText({ imageCount: 2, revisedPrompts: ['refined prompt'] }),
    /refined prompt/
  )
  assert.match(
    buildImageGenerationApiSummary({ imageCount: 1, revisedPrompts: ['refined prompt'] }),
    /refined prompt/
  )
  assert.equal(typeof buildImageGenerationPendingText(), 'string')

  const requestOptions = { size: '1024x1024' }
  const snapshot = buildMediaRequestSnapshot('image', {
    baseUrl: ' https://example.com ',
    model: ' image-model ',
    prompt: ' a demo ',
    requestOptions,
    placeholderMode: 'image',
    startedAt: 123
  })
  requestOptions.size = 'changed'
  assert.deepEqual(snapshot, {
    kind: 'image',
    baseUrl: 'https://example.com',
    model: 'image-model',
    prompt: 'a demo',
    requestOptions: { size: '1024x1024' },
    requestMeta: null,
    placeholderMode: 'image',
    startedAt: 123
  })
  const message = { mediaRequest: { model: 'old' } }
  attachMediaRequestSnapshot(message, 'video', { prompt: 'new' })
  assert.deepEqual(message.mediaRequest, { model: 'old', prompt: 'new', kind: 'video' })
})

test('chat media display presentation preserves image and video placeholder transitions', () => {
  const display = useChatMediaGenerationDisplay({
    createDisplayMessage: (role, content, extra) => ({ role, content, ...extra }),
    createAssistantImageBubblePlaceholder: (note, requestInfo) => ({ note, requestInfo, type: 'image' }),
    createAssistantVideoBubblePlaceholder: (note, requestInfo) => ({ note, requestInfo, type: 'video' }),
    assistantVideoTaskStatusLabel: () => 'running'
  })
  const image = display.createImageGenerationPlaceholderDisplay('draw a cat', 'image', {
    requestInfo: '1024px'
  })
  assert.equal(image.imageBubblePlaceholder, true)
  assert.equal(image.imageBubblePlaceholderImage.requestInfo, '1024px')

  display.applyImageGenerationTaskToDisplay(image, { id: 'image-task' }, 'text')
  assert.equal(image.imageTask, null)
  assert.equal(typeof image.content, 'string')
  display.applyImageGenerationImagesToDisplay(image, {
    images: [{ src: 'image.png' }],
    userPrompt: 'draw a cat',
    revisedPrompts: []
  })
  assert.deepEqual(image.images, [{ src: 'image.png' }])
  assert.equal(image.imagePrompt, 'draw a cat')

  const video = display.createVideoGenerationPlaceholderDisplay('make a clip', 'video', {
    requestInfo: '720p'
  })
  assert.equal(video.videoBubblePlaceholderItem.type, 'video')
  display.applyVideoGenerationTaskToDisplay(video, { id: 'video-task' }, 'text')
  assert.equal(video.videoTask.id, 'video-task')
  display.applyVideoGenerationVideosToDisplay(video, {
    videos: [{ src: 'video.mp4' }],
    userPrompt: 'make a clip'
  })
  assert.equal(video.videos.length, 1)
  assert.equal(video.videoTask, null)
  assert.equal(typeof display.buildVideoGenerationApiSummary({ videoCount: 1 }), 'string')
})

test('chat message tracking distinguishes active and retained session messages', () => {
  assert.deepEqual([...buildChatMessageIdSet([{ id: 'one' }, { id: 'one' }, { id: ' two ' }])], ['one', 'two'])
  const tracking = useChatMessageTracking({
    session: { messages: [{ id: 'active-1' }] },
    memorySessions: ref([{ messages: [{ id: 'history-1' }] }])
  })
  assert.equal(tracking.isDisplayMessageInActiveSession({ id: 'active-1' }), true)
  assert.equal(tracking.isDisplayMessageInActiveSession({ id: 'history-1' }), false)
  assert.equal(tracking.isDisplayMessageTracked({ id: 'history-1' }), true)
  assert.equal(tracking.isDisplayMessageTracked({ id: 'missing' }), false)
})

test('chat run session targeting keeps abort-state ownership and inactive scroll guards stable', async () => {
  const abortState = {}
  const record = { id: 'record-1', messages: [{ id: 'message-1' }] }
  const otherRecord = { id: 'record-2', messages: [{ id: 'message-2' }] }
  const runRecordByAbortState = new Map([[abortState, record]])
  const scrollOptions = []
  let scheduledCount = 0
  const targeting = useChatRunSessionTargeting({
    runRecordByAbortState,
    getFallbackSession: () => ({ id: 'fallback' }),
    isRecordActive: (candidate) => candidate?.id === 'record-1',
    scrollToBottom: async (options) => { scrollOptions.push(options) },
    maybeScheduleStreamingScroll: () => { scheduledCount += 1 },
    getActiveMemorySession: () => record,
    getMemorySessionById: (id) => id === 'record-2' ? otherRecord : null,
    getMemorySessions: () => [record, otherRecord]
  })

  assert.equal(targeting.getRunRecord(abortState), record)
  assert.equal(targeting.getRunSessionTarget({}).id, 'fallback')
  assert.equal(targeting.isRunRecordActive(abortState), true)
  await targeting.maybeScrollToBottomForRun(abortState, { force: true })
  targeting.maybeScheduleScrollToBottomForRun(abortState)
  assert.deepEqual(scrollOptions, [{ force: true }])
  assert.equal(scheduledCount, 1)
  assert.equal(targeting.getMemorySessionForMessage({ id: 'message-2' }), otherRecord)
  assert.equal(targeting.getMemorySessionForToolMessage({ toolSessionId: 'record-2' }), otherRecord)

  const inactiveState = {}
  runRecordByAbortState.set(inactiveState, otherRecord)
  await targeting.maybeScrollToBottomForRun(inactiveState)
  targeting.maybeScheduleScrollToBottomForRun(inactiveState)
  assert.equal(scrollOptions.length, 1)
  assert.equal(scheduledCount, 1)
})

test('chat memory session registry initializes safe defaults and active records', () => {
  let id = 0
  const memorySessions = ref([])
  const activeMemorySessionId = ref('')
  const session = { messages: [{ id: 'display-1' }], apiMessages: [{ role: 'user', content: 'hello' }] }
  const registry = useChatMemorySessionRegistry({
    createId: () => `id-${++id}`,
    defaultMemorySessionTitle: 'new chat',
    isChatSandboxWorkspaceId: (value) => String(value || '').startsWith('workspace-'),
    buildChatSandboxWorkspaceId: (value) => `workspace-${value}`,
    normalizeMemoryCandidateQueue: (value) => Array.isArray(value) ? value : [],
    deepCopyJson: (value, fallback) => {
      try { return JSON.parse(JSON.stringify(value)) } catch { return fallback }
    },
    normalizeToolApprovalMode: (value, fallback) => value || fallback,
    toolApprovalModeManual: 'manual',
    toolApprovalModeSafe: 'safe',
    memorySessions,
    activeMemorySessionId,
    session,
    autoApproveTools: ref(true),
    activeSessionFilePath: ref('history/demo.json'),
    activeSessionTitle: ref('demo')
  })

  const created = registry.createMemorySessionRecord({
    id: 'record-1',
    autoApproveTools: false,
    createdAt: 123,
    state: { model: 'demo' }
  })
  assert.equal(created.title, 'new chat')
  assert.equal(created.sandboxWorkspaceId, 'workspace-record-1')
  assert.equal(created.toolApprovalMode, 'manual')
  assert.equal(created.autoApproveTools, false)
  assert.deepEqual(created.contextTokenTelemetry, {
    inputTokens: 0,
    requestChars: 0,
    cachedTokens: 0,
    providerId: '',
    model: '',
    endpoint: '',
    updatedAt: 0
  })

  const active = registry.getActiveMemorySession()
  assert.equal(activeMemorySessionId.value, active.id)
  assert.equal(active.messages, session.messages)
  assert.equal(registry.getMemorySessionById(active.id)?.id, active.id)
  active.sandboxWorkspaceId = 'invalid'
  assert.equal(registry.resolveMemorySessionSandboxWorkspaceId(active), `workspace-${active.id}`)
})

test('chat memory session lifecycle clears transient candidates and prunes dormant records', () => {
  const clearedTimers = []
  const clearedApprovals = []
  const clearedQueues = []
  let queueRevision = 0
  const memorySessions = ref([
    { id: '', memoryCandidateFlushTimer: 'invalid-id' },
    { id: 'keep', memoryCandidates: [{ text: 'keep' }], memoryCandidateFlushTimer: 'keep-id' },
    { id: 'running', running: true },
    { id: 'draft', empty: true, memoryCandidateFlushTimer: 'draft-id' },
    { id: 'auto', autoManaged: true, activeSessionFilePath: 'chat-auto/session.json', memoryCandidateFlushTimer: 'auto-id' },
    { id: 'saved', activeSessionFilePath: 'history/saved.json' }
  ])
  const activeMemorySessionId = ref('keep')
  const lifecycle = useChatMemorySessionLifecycle({
    autoChatSessionRoot: 'chat-auto',
    timedTaskSessionRoot: 'timed-task',
    memorySessions,
    activeMemorySessionId,
    isMemorySessionRunning: (record) => record?.running === true,
    isMemorySessionEmptyDraft: (record) => record?.empty === true,
    clearSessionApprovedTools: (id) => clearedApprovals.push(id),
    clearChatRunQueue: (id) => clearedQueues.push(id),
    touchChatRunInputQueue: () => { queueRevision += 1 },
    clearTimer: (timer) => clearedTimers.push(timer)
  })

  assert.equal(lifecycle.isAutoChatSessionPath('chat-auto\\session.json'), true)
  assert.equal(lifecycle.isTimedTaskSessionPath('timed-task/task.json'), true)
  assert.equal(lifecycle.isMemorySessionActive(memorySessions.value[1]), true)
  assert.equal(lifecycle.clearPendingMemoryCandidates(memorySessions.value[1]), true)
  assert.deepEqual(memorySessions.value[1].memoryCandidates, [])
  assert.equal(memorySessions.value[1].memoryCandidateFlushTimer, null)

  lifecycle.pruneDormantMemorySessions()
  assert.deepEqual(memorySessions.value.map((record) => record.id), ['keep', 'running', 'saved'])
  assert.deepEqual(clearedTimers.sort(), ['auto-id', 'draft-id', 'invalid-id', 'keep-id'].sort())

  assert.equal(lifecycle.removeMemorySessionById('saved'), true)
  assert.equal(lifecycle.removeMemorySessionById('missing'), false)
  assert.deepEqual(clearedApprovals, ['saved', 'missing'])
  assert.deepEqual(clearedQueues, ['saved', 'missing'])
  assert.equal(queueRevision, 2)
})

test('chat session manager retains session path title behavior without page state', () => {
  const manager = useChatSessionManager({})

  assert.equal(manager.getSessionTitleFromPath('chat-auto/design-discussion.json'), 'design-discussion')
  assert.equal(manager.getSessionTitleFromPath('nested/session'), 'session')
  assert.equal(manager.getSessionTitleFromPath(''), '')
})
