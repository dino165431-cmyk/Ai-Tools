import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import {
  CHAT_SCROLL_AUTO_DISABLE_DISTANCE_PX as SCROLL_AUTO_DISABLE_DISTANCE_PX,
  CHAT_SCROLL_BOTTOM_THRESHOLD_PX as SCROLL_BOTTOM_THRESHOLD_PX,
  useChatAutoScroll
} from './useChatAutoScroll.js'
import { useChatUserAnchors } from './useChatUserAnchors.js'

export function useChatPageRuntime({
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
  cleanupExpiredSessionTrash,
  countFileAttachments,
  countImageAttachments,
  ensureMarkdownPreviewRuntime,
  estimateChatMarkdownContentHeight,
  getToolMessageStatus,
  handleBuiltinAgentsToolApprovalRequest,
  handleBuiltinAgentsTraceEvent,
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
  migrateLegacyAutoChatSessionCreatedAt,
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
}) {
  let sessionTrashCleanupTimer = null

const chatListRef = ref(null)
const {
  autoScrollEnabled,
  autoScrollSuspendedByUser,
  isAtBottom,
  chatScrollEl,
  chatScrollTop,
  chatViewportHeight,
  showScrollToBottomButton,
  shouldFollowStreamingScroll,
  markProgrammaticChatScroll,
  isExpectedProgrammaticChatScroll,
  clearProgrammaticChatScrollMark,
  updateAtBottomState
} = useChatAutoScroll({
  getScrollContainer: resolveScrollbarContainerEl,
  defaultProgrammaticDurationMs: CHAT_SCROLL_COMPENSATION_SUSPEND_MS
})
const expandedToolActivityGroupIds = ref(new Set())
const visibleHeavyChatMessageIds = ref(new Set())
const hydratedHeavyChatMessageIds = ref(new Set())
const laidOutHeavyChatMessageIds = ref(new Set())
const chatSessionOpeningHeavyRender = ref(false)
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
const chatMessageElMap = new Map()
const chatMessageEstimatedHeightCache = new Map()
const chatMessageByIdMap = new Map()
const intersectingHeavyChatMessageIds = new Set()
let lastProcessedChatScrollTop = 0
let didProcessChatScroll = false
let userChatScrollIntentUntil = 0

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
  const base = isToolRole
    ? 168
    : role === 'assistant'
      ? CHAT_ASSISTANT_MESSAGE_BASE_HEIGHT
      : CHAT_USER_MESSAGE_BASE_HEIGHT
  const contentExtra = estimateChatMessageContentHeight(content)
  const attachmentExtra = attachmentCount * 76
  const thinkingExtra = msg?.thinkingExpanded ? Math.min(320, Math.ceil(thinkingLength / 10)) : 0
  const guidanceExtra = msg?.guidance ? 22 : 0
  const minHeight = isToolRole ? 112 : CHAT_TEXT_MESSAGE_MIN_HEIGHT
  return Math.max(minHeight, base + contentExtra + attachmentExtra + thinkingExtra + guidanceExtra)
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
  const charsPerLine = isCompactChatLayout.value ? 24 : isDenseChatLayout.value ? 30 : 44
  return estimateChatMarkdownContentHeight(content, {
    charsPerLine,
    autoFoldThreshold: CHAT_CODE_AUTO_FOLD_THRESHOLD
  })
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
  if (isToolMessage(msg) || isToolActivityGroup(msg)) return false
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

function replaceLaidOutHeavyChatMessageIds(ids) {
  const next = ids instanceof Set ? new Set(ids) : new Set()
  if (areStringSetsEqual(laidOutHeavyChatMessageIds.value, next)) return false
  laidOutHeavyChatMessageIds.value = next
  return true
}

function mergeLaidOutHeavyChatMessageIds(ids) {
  const next = new Set(laidOutHeavyChatMessageIds.value)
  let changed = false
  const source = ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : [])
  source.forEach((value) => {
    const id = String(value || '').trim()
    if (!id || next.has(id)) return
    next.add(id)
    changed = true
  })
  if (!changed) return false
  laidOutHeavyChatMessageIds.value = next
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

  const items = chatDisplayMessages.value
  const buffer = resolveCurrentHeavyRenderViewportBuffer()
  const start = Math.max(0, Number(renderedChatRange.value?.start || 0) - buffer)
  const end = Math.min(items.length - 1, Number(renderedChatRange.value?.end || -1) + buffer)
  for (let i = start; i <= end; i += 1) {
    const id = String(items[i]?.id || '').trim()
    if (id) keepIds.add(id)
  }

  for (let i = items.length - 1; i >= 0 && keepIds.size < limit; i -= 1) {
    const msg = items[i]
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
  const hydratedChanged = mergeHydratedHeavyChatMessageIds([id])
  const layoutChanged = mergeLaidOutHeavyChatMessageIds([id])
  pruneHydratedHeavyChatMessageIds()
  return hydratedChanged || layoutChanged
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
  if (options.replace !== false) {
    const hydratedChanged = replaceHydratedHeavyChatMessageIds(seedIds)
    const layoutChanged = replaceLaidOutHeavyChatMessageIds(seedIds)
    return hydratedChanged || layoutChanged
  }
  const hydratedChanged = mergeHydratedHeavyChatMessageIds(seedIds)
  const layoutChanged = mergeLaidOutHeavyChatMessageIds(seedIds)
  return hydratedChanged || layoutChanged
}

async function maybeWarmMarkdownPreviewRuntimeForMessages(messages, options = {}) {
  const seedIds = collectHeavyRenderSeedMessageIds(messages, options)
  if (!seedIds.size) return false
  await ensureMarkdownPreviewRuntime()
  return true
}

function primeHydratedRenderedChatMessages(options = {}) {
  const items = chatDisplayMessages.value
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
    const msg = items[i]
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

const chatEstimatedContentHeight = computed(() => {
  const displayMessages = chatDisplayMessages.value
  return displayMessages.reduce((total, msg, index) => {
    const previousMsg = index > 0 ? displayMessages[index - 1] : null
    return total + getChatMessageGapBefore(previousMsg, msg, index) + getEstimatedChatMessageHeight(msg)
  }, 0)
})

const chatVirtualizedSessionKeys = ref(new Set())
const currentChatVirtualizationSessionKey = computed(() => {
  return String(activeMemorySessionId.value || activeSessionFilePath.value || '__current_chat__').trim()
})

const chatVirtualizationRequested = computed(() => {
  const sessionKey = currentChatVirtualizationSessionKey.value
  if (chatVirtualizedSessionKeys.value.has(sessionKey)) {
    const hasActiveLayoutChanges =
      sending.value ||
      preparingSend.value ||
      chatDisplayMessages.value.some((msg) => (
        msg?.streaming ||
        (isToolMessage(msg) && isLiveToolMessageStatus(getToolMessageStatus(msg)))
      ))
    return shouldRetainChatVirtualization({
      active: hasActiveLayoutChanges,
      itemCount: chatDisplayMessages.value.length,
      estimatedHeight: chatEstimatedContentHeight.value,
      viewportHeight: chatViewportHeight.value,
      countThreshold: CHAT_VIRTUALIZATION_RETAIN_MIN_MESSAGES,
      minItemsForHeight: CHAT_VIRTUALIZATION_RETAIN_MIN_ITEMS_FOR_HEIGHT,
      minEstimatedHeight: CHAT_VIRTUALIZATION_RETAIN_MIN_ESTIMATED_HEIGHT_PX,
      viewportMultiplier: CHAT_VIRTUALIZATION_RETAIN_MIN_VIEWPORTS
    })
  }
  return shouldEnableChatVirtualization({
    itemCount: chatDisplayMessages.value.length,
    estimatedHeight: chatEstimatedContentHeight.value,
    viewportHeight: chatViewportHeight.value,
    countThreshold: CHAT_VIRTUALIZATION_MIN_MESSAGES,
    minItemsForHeight: CHAT_VIRTUALIZATION_MIN_ITEMS_FOR_HEIGHT,
    minEstimatedHeight: CHAT_VIRTUALIZATION_MIN_ESTIMATED_HEIGHT_PX,
    viewportMultiplier: CHAT_VIRTUALIZATION_MIN_VIEWPORTS
  })
})

watch(
  [
    currentChatVirtualizationSessionKey,
    chatVirtualizationRequested,
    () => chatDisplayMessages.value.length
  ],
  ([sessionKey, requested, itemCount]) => {
    const key = String(sessionKey || '').trim()
    if (!key) return
    const next = new Set(chatVirtualizedSessionKeys.value)
    if (!itemCount || !requested) {
      if (!next.delete(key)) return
    } else if (requested) {
      if (next.has(key)) return
      next.add(key)
    } else {
      return
    }
    chatVirtualizedSessionKeys.value = next
  },
  { immediate: true }
)

const chatVirtualizedEnabled = computed(() => {
  if (!chatDisplayMessages.value.length) return false
  return chatVirtualizationRequested.value
})

// Decide from message-derived height rather than the current DOM scrollHeight:
// deferred blocks contain placeholder sizes, so feeding that measured value
// back into the policy would make the mode oscillate as blocks are laid out.
const chatDeferredLayoutPolicy = computed(() => resolveChatDeferredLayoutPolicy({
  virtualized: chatVirtualizedEnabled.value,
  itemCount: chatDisplayMessages.value.length,
  estimatedHeight: chatEstimatedContentHeight.value,
  viewportHeight: chatViewportHeight.value,
  minItems: CHAT_VIRTUALIZATION_MIN_ITEMS_FOR_HEIGHT,
  minEstimatedHeight: CHAT_DEFERRED_LAYOUT_MIN_ESTIMATED_HEIGHT_PX,
  heightViewportMultiplier: CHAT_DEFERRED_LAYOUT_MIN_VIEWPORTS,
  preloadViewportMultiplier: CHAT_DEFERRED_LAYOUT_PRELOAD_VIEWPORTS,
  minPreloadMarginPx: CHAT_DEFERRED_LAYOUT_PRELOAD_MIN_PX,
  maxPreloadMarginPx: CHAT_DEFERRED_LAYOUT_PRELOAD_MAX_PX
}))

const chatHeavyRenderRootMarginPx = computed(() => Math.max(
  0,
  Number(chatHeavyRenderTuning.value.rootMarginPx) || 0,
  Number(chatDeferredLayoutPolicy.value.preloadMarginPx) || 0
))

watch(
  () => chatDeferredLayoutPolicy.value.enabled,
  (enabled, wasEnabled) => {
    if (!enabled || wasEnabled) return
    const ids = []
    for (const [id, el] of chatMessageElMap.entries()) {
      if (!(el instanceof HTMLElement) || !el.isConnected) continue
      const msg = resolveChatMessageById(id)
      if (isMarkdownHeavyRenderCandidate(msg)) ids.push(id)
    }
    mergeLaidOutHeavyChatMessageIds(ids)
  },
  { flush: 'pre' }
)

const chatDisplayMessageIndexById = computed(() => {
  const indexById = new Map()
  chatDisplayMessages.value.forEach((msg, index) => {
    const id = String(msg?.id || '').trim()
    if (id) indexById.set(id, index)
  })
  return indexById
})

function getChatVirtualItemKey(index) {
  const msg = chatDisplayMessages.value[index]
  return String(msg?.id || `chat-message-${index}`)
}

function estimateChatVirtualItemSize(index) {
  const messages = chatDisplayMessages.value
  const msg = messages[index]
  if (!msg) return CHAT_DEFAULT_MESSAGE_HEIGHT
  const previousMsg = index > 0 ? messages[index - 1] : null
  return getChatMessageGapBefore(previousMsg, msg, index) + getEstimatedChatMessageHeight(msg)
}

function extractAdaptiveChatVirtualRange(range) {
  return resolveChatAdaptiveVirtualRange(range, {
    viewportHeight: chatViewportHeight.value,
    minBufferPx: CHAT_VIRTUALIZATION_MIN_BUFFER_PX,
    maxBufferPx: CHAT_VIRTUALIZATION_MAX_BUFFER_PX,
    maxExtraItems: CHAT_VIRTUALIZATION_MAX_BUFFER_ITEMS,
    estimateSize: estimateChatVirtualItemSize
  })
}

const chatVirtualizer = useVirtualizer(computed(() => ({
  count: chatDisplayMessages.value.length,
  getScrollElement: () => chatScrollEl.value || resolveScrollbarContainerEl(),
  estimateSize: estimateChatVirtualItemSize,
  getItemKey: getChatVirtualItemKey,
  overscan: 0,
  rangeExtractor: extractAdaptiveChatVirtualRange,
  paddingStart: isDenseChatLayout.value ? 8 : 14,
  paddingEnd: isDenseChatLayout.value ? 8 : 14,
  enabled: chatVirtualizedEnabled.value,
  anchorTo: 'end',
  followOnAppend: true,
  scrollEndThreshold: SCROLL_BOTTOM_THRESHOLD_PX,
  useAnimationFrameWithResizeObserver: true
})))

let chatVirtualMeasureFrame = 0
let chatVirtualMeasureSettleFrame = 0
let chatVirtualMeasureFollowTail = false
let chatVirtualMeasureGeneration = 0
const pendingChatVirtualMeasureIds = new Set()

function resolveChatVirtualMeasurementOwnerId(messageOrId) {
  const id = typeof messageOrId === 'string'
    ? String(messageOrId || '').trim()
    : String(messageOrId?.id || '').trim()
  if (!id) return ''
  if (chatDisplayMessageIndexById.value.has(id)) return id

  const owner = chatDisplayMessages.value.find((message) => (
    isToolActivityGroup(message) &&
    message.toolGroupMessages.some((child) => String(child?.id || '').trim() === id)
  ))
  return String(owner?.id || '').trim()
}

function measurePendingChatVirtualItems(ids) {
  if (!chatVirtualizedEnabled.value) return false
  let measured = false
  ids.forEach((id) => {
    const el = chatMessageElMap.get(id)
    if (!(el instanceof HTMLElement)) return
    const index = chatDisplayMessageIndexById.value.get(id)
    if (Number.isInteger(index)) el.dataset.index = String(index)
    chatVirtualizer.value.measureElement(el)
    measured = true
  })
  return measured
}

function scheduleChatVirtualItemRemeasure(messageOrId, options = {}) {
  if (!chatVirtualizedEnabled.value) return
  const ownerId = resolveChatVirtualMeasurementOwnerId(messageOrId)
  if (ownerId) {
    pendingChatVirtualMeasureIds.add(ownerId)
    chatMessageEstimatedHeightCache.delete(ownerId)
  }
  if (options.followTail === true) chatVirtualMeasureFollowTail = true
  if (chatVirtualMeasureFrame) return

  chatVirtualMeasureFrame = -1
  const generation = chatVirtualMeasureGeneration
  void nextTick().then(() => {
    if (generation !== chatVirtualMeasureGeneration) return
    const raf = window?.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16))
    chatVirtualMeasureFrame = raf(() => {
      if (generation !== chatVirtualMeasureGeneration) return
      chatVirtualMeasureFrame = 0
      const ids = Array.from(pendingChatVirtualMeasureIds)
      pendingChatVirtualMeasureIds.clear()
      const followTail = chatVirtualMeasureFollowTail
      chatVirtualMeasureFollowTail = false
      measurePendingChatVirtualItems(ids)
      scheduleRefreshUserAnchorMeta()
      scheduleStickyChatBubbleSync()

      if (chatVirtualMeasureSettleFrame) {
        if (typeof window?.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(chatVirtualMeasureSettleFrame)
        } else {
          clearTimeout(chatVirtualMeasureSettleFrame)
        }
      }
      chatVirtualMeasureSettleFrame = raf(() => {
        chatVirtualMeasureSettleFrame = 0
        measurePendingChatVirtualItems(ids)
        if (followTail) scheduleScrollToBottom({ force: true })
      })
    })
  })
}

function clearChatVirtualItemRemeasure() {
  chatVirtualMeasureGeneration += 1
  if (chatVirtualMeasureFrame > 0) {
    if (typeof window?.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(chatVirtualMeasureFrame)
    } else {
      clearTimeout(chatVirtualMeasureFrame)
    }
  }
  if (chatVirtualMeasureSettleFrame > 0) {
    if (typeof window?.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(chatVirtualMeasureSettleFrame)
    } else {
      clearTimeout(chatVirtualMeasureSettleFrame)
    }
  }
  chatVirtualMeasureFrame = 0
  chatVirtualMeasureSettleFrame = 0
  chatVirtualMeasureFollowTail = false
  pendingChatVirtualMeasureIds.clear()
}

const chatToolGroupLayoutRevision = computed(() => (
  chatDisplayMessages.value
    .filter((message) => isToolActivityGroup(message))
    .map((group) => [
      group.id,
      group.toolGroupExpanded ? 1 : 0,
      group.toolGroupMessages.length,
      group.toolGroupMessages.map((child) => child?.toolExpanded ? 1 : 0).join('')
    ].join(':'))
    .join('|')
))

const chatDynamicLayoutRevision = computed(() => (
  chatDisplayMessages.value
    .map((message) => [
      message?.id,
      String(message?.content || '').length,
      message?.thinkingExpanded ? String(message?.thinking || '').length : 0,
      Array.isArray(message?.attachments) ? message.attachments.length : 0,
      Array.isArray(message?.images) ? message.images.length : 0,
      Array.isArray(message?.videos) ? message.videos.length : 0,
      message?.streaming ? 1 : 0,
      message?.editing ? 1 : 0,
      message?.userMessageExpanded ? 1 : 0
    ].join(':'))
    .join('|')
))

watch(
  chatToolGroupLayoutRevision,
  () => {
    if (!chatVirtualizedEnabled.value) return
    chatDisplayMessages.value
      .filter((message) => isToolActivityGroup(message))
      .forEach((group) => scheduleChatVirtualItemRemeasure(group, { followTail: isAtBottom.value }))
  },
  { flush: 'post' }
)

watch(
  chatDynamicLayoutRevision,
  () => {
    if (!chatVirtualizedEnabled.value) return
    const shouldFollowTail = isAtBottom.value
    chatVirtualItems.value.forEach((item) => {
      const message = chatDisplayMessages.value[item.index]
      if (message) scheduleChatVirtualItemRemeasure(message, { followTail: shouldFollowTail })
    })
  },
  { flush: 'post' }
)

watch(
  () => `${isCompactChatLayout.value ? 1 : 0}|${isDenseChatLayout.value ? 1 : 0}`,
  async (next, previous) => {
    if (!previous || next === previous || !chatVirtualizedEnabled.value) return
    const shouldStayAtEnd = isAtBottom.value
    await nextTick()
    chatVirtualizer.value.measure()
    scheduleRefreshUserAnchorMeta()
    if (shouldStayAtEnd) scheduleScrollToBottom({ force: true })
  }
)

watch(chatVirtualizedEnabled, async (enabled, wasEnabled) => {
  if (!enabled || wasEnabled) return
  const shouldStayAtEnd = isAtBottom.value || (autoScrollEnabled.value && !autoScrollSuspendedByUser.value)
  await nextTick()
  await waitForLayoutFrame()
  scheduleRefreshUserAnchorMeta()
  if (shouldStayAtEnd) scheduleScrollToBottom({ force: true })
})

const chatVirtualItems = computed(() => {
  if (!chatVirtualizedEnabled.value) return []
  return chatVirtualizer.value.getVirtualItems()
})

const chatVirtualItemByKey = computed(() => {
  const itemByKey = new Map()
  chatVirtualItems.value.forEach((item) => {
    itemByKey.set(String(item.key), item)
  })
  return itemByKey
})

const renderedChatRange = computed(() => {
  if (!chatDisplayMessages.value.length) return { start: 0, end: -1 }
  if (!chatVirtualizedEnabled.value) {
    return { start: 0, end: chatDisplayMessages.value.length - 1 }
  }
  const items = chatVirtualItems.value
  if (!items.length) return { start: 0, end: -1 }
  return {
    start: Math.max(0, Number(items[0]?.index) || 0),
    end: Math.max(0, Number(items[items.length - 1]?.index) || 0)
  }
})

const renderedChatMessageIdSet = computed(() => {
  const ids = new Set()
  const { start, end } = renderedChatRange.value
  if (end < start) return ids
  for (let i = start; i <= end; i += 1) {
    const id = String(chatDisplayMessages.value[i]?.id || '').trim()
    if (id) ids.add(id)
  }
  return ids
})

const renderedChatMessages = computed(() => {
  if (!chatVirtualizedEnabled.value) return chatDisplayMessages.value
  return chatVirtualItems.value
    .map((item) => chatDisplayMessages.value[item.index])
    .filter(Boolean)
})

watch(
  () => {
    const range = renderedChatRange.value
    return `${chatVirtualizedEnabled.value ? 1 : 0}|${range.start}|${range.end}`
  },
  () => {
    primeHydratedRenderedChatMessages()
  },
  { flush: 'post' }
)

const chatVirtualListStyle = computed(() => {
  if (!chatVirtualizedEnabled.value) return undefined
  return {
    height: `${Math.ceil(chatVirtualizer.value.getTotalSize())}px`
  }
})

function getChatVirtualItemIndex(msg) {
  if (!chatVirtualizedEnabled.value) return undefined
  const index = chatDisplayMessageIndexById.value.get(String(msg?.id || '').trim())
  return Number.isInteger(index) ? index : undefined
}

function getChatVirtualItemStyle(msg) {
  if (!chatVirtualizedEnabled.value) return undefined
  const id = String(msg?.id || '').trim()
  const item = chatVirtualItemByKey.value.get(id)
  if (!item) return undefined
  const messages = chatDisplayMessages.value
  const previousMsg = item.index > 0 ? messages[item.index - 1] : null
  const gapBefore = getChatMessageGapBefore(previousMsg, msg, item.index)
  return {
    '--chat-virtual-item-top': `${Math.max(0, Number(item.start) || 0)}px`,
    '--chat-virtual-item-gap': `${Math.max(0, gapBefore)}px`
  }
}

function maybeScheduleStreamingScroll(options = {}) {
  if (!shouldFollowStreamingScroll(options)) return false
  scheduleScrollToBottom()
  return true
}

const {
  activeAnchorId,
  userAnchorElMap,
  userAnchors,
  showAnchorRail,
  refreshUserAnchorMeta,
  updateActiveAnchorFromScroll,
  scheduleRefreshUserAnchorMeta,
  pruneUserAnchors,
  resetUserAnchors
} = useChatUserAnchors({
  messages: computed(() => session.messages),
  isDenseLayout: isDenseChatLayout,
  getMessageTop: getChatMessageTopById,
  getScrollContainer: () => {
    const container = chatScrollEl.value || resolveScrollbarContainerEl()
    if (container && !chatScrollEl.value) chatScrollEl.value = container
    return container
  },
  ensureLayoutObserver: () => {
    if (!chatLayoutResizeObserver) setupChatLayoutResizeObserver()
  },
  onAfterRefresh: (container) => {
    updateAtBottomState(container)
    syncStickyChatBubble()
  }
})
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

function getChatMeasuredLayoutItems() {
  const messages = chatDisplayMessages.value
  if (chatVirtualizedEnabled.value) {
    return chatVirtualizer.value.getVirtualItems().map((measurement) => {
      const index = Number(measurement?.index)
      const msg = Number.isInteger(index) ? messages[index] : null
      if (!msg) return null
      return {
        id: String(msg?.id || ''),
        index,
        top: Number(measurement.start || 0),
        bottom: Number(measurement.end || 0),
        msg
      }
    }).filter(Boolean)
  }

  return messages.map((msg, index) => {
    const id = String(msg?.id || '')
    const el = chatMessageElMap.get(id)
    if (!(el instanceof HTMLElement)) return null
    const top = Number(el.offsetTop || 0)
    return {
      id,
      index,
      top,
      bottom: top + Number(el.offsetHeight || 0),
      msg
    }
  }).filter(Boolean)
}

function syncStickyChatBubble() {
  if (!chatScrollEl.value && !resolveScrollbarContainerEl()) {
    setStickyChatBubbleState(null)
    return
  }

  const items = getChatMeasuredLayoutItems()
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
      const layoutReadyIds = []
      entries.forEach((entry) => {
        const id = String(entry.target?.dataset?.messageId || '').trim()
        if (!id) return
        if (entry.isIntersecting) {
          if (!intersectingHeavyChatMessageIds.has(id)) {
            intersectingHeavyChatMessageIds.add(id)
            changed = true
          }
          layoutReadyIds.push(id)
        } else if (intersectingHeavyChatMessageIds.delete(id)) {
          changed = true
        }
      })
      if (layoutReadyIds.length) {
        mergeHydratedHeavyChatMessageIds(layoutReadyIds)
        pruneHydratedHeavyChatMessageIds()
        if (chatDeferredLayoutPolicy.value.enabled) {
          mergeLaidOutHeavyChatMessageIds(layoutReadyIds)
        }
      }
      if (changed) syncVisibleHeavyChatMessageIds()
    },
    {
      root,
      rootMargin: `${chatHeavyRenderRootMarginPx.value}px 0px`
    }
  )

  for (const [id, el] of chatMessageElMap.entries()) {
    if (!el) continue
    const msg = resolveChatMessageById(id)
    if (isToolMessage(msg) || isToolActivityGroup(msg)) continue
    el.dataset.messageId = id
    chatMessageVisibilityObserver.observe(el)
  }
}

function setChatItemEl(messageId, role, el) {
  const k = String(messageId || '')
  if (!k) return false

  const prev = chatMessageElMap.get(k)
  if (prev === el) return false

  if (role === 'user') {
    if (el) userAnchorElMap.set(k, el)
    else userAnchorElMap.delete(k)
  }

  if (prev && prev !== el) {
    try {
      chatMessageVisibilityObserver?.unobserve(prev)
    } catch {
      // ignore
    }
  }

  if (el) {
    el.dataset.messageId = k
    chatMessageElMap.set(k, el)
    const msg = resolveChatMessageById(k)
    if (!isToolMessage(msg) && !isToolActivityGroup(msg)) {
      try {
        chatMessageVisibilityObserver?.observe(el)
      } catch {
        // ignore
      }
    }
  } else {
    chatMessageElMap.delete(k)
    if (intersectingHeavyChatMessageIds.delete(k)) syncVisibleHeavyChatMessageIds()
  }
  return true
}

const chatItemRefCallbackMap = new Map()

function getChatVirtualItemRef(msg) {
  const id = String(msg?.id || '').trim()
  if (!id) return undefined
  const role = String(msg?.role || '').trim()
  const cached = chatItemRefCallbackMap.get(id)
  if (cached?.role === role) return cached.callback

  const callback = (el) => {
    setChatVirtualItemEl(id, role, el)
    if (!el && chatItemRefCallbackMap.get(id)?.callback === callback) {
      chatItemRefCallbackMap.delete(id)
    }
  }
  chatItemRefCallbackMap.set(id, { role, callback })
  return callback
}

function setChatVirtualItemEl(id, role, el) {
  const changed = setChatItemEl(id, role, el)
  if (!changed) return
  if (!chatVirtualizedEnabled.value || !(el instanceof HTMLElement)) return
  const index = chatDisplayMessageIndexById.value.get(id)
  if (!Number.isInteger(index)) return
  el.dataset.index = String(index)
  chatVirtualizer.value.measureElement(el)
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
    virtualized: chatVirtualizedEnabled.value,
    deferredLayoutEnabled: chatDeferredLayoutPolicy.value.enabled,
    layoutReadyMessageIds: laidOutHeavyChatMessageIds.value,
    visibleMessageIds: visibleHeavyChatMessageIds.value
  })
}

function isFixedCompactToolMessage(msg) {
  return shouldRenderCompactToolMessage(msg)
}

function getFixedCompactChatMessageHeight(msg) {
  if (isFixedCompactToolMessage(msg)) return CHAT_TOOL_COMPACT_ITEM_FIXED_HEIGHT
  if (isToolActivityGroup(msg) && !msg.toolGroupExpanded) return CHAT_TOOL_ACTIVITY_GROUP_FIXED_HEIGHT
  return 0
}

function getChatMessageTopById(messageId) {
  const id = String(messageId || '').trim()
  if (!id) return Number.NaN
  if (chatVirtualizedEnabled.value) {
    const index = chatDisplayMessageIndexById.value.get(id)
    const measurement = Number.isInteger(index)
      ? chatVirtualizer.value.measurementsCache[index]
      : null
    if (measurement && Number.isFinite(Number(measurement.start))) {
      return Number(measurement.start)
    }
  }
  const el = chatMessageElMap.get(id)
  return el instanceof HTMLElement ? Number(el.offsetTop) : Number.NaN
}

async function scrollToUserAnchor(messageId) {
  const k = String(messageId || '')
  autoScrollEnabled.value = false
  autoScrollSuspendedByUser.value = true
  await nextTick()
  const container = chatScrollEl.value || resolveScrollbarContainerEl()
  if (!container) return

  if (chatVirtualizedEnabled.value) {
    const index = chatDisplayMessageIndexById.value.get(k)
    if (!Number.isInteger(index)) return
    const measurement = chatVirtualizer.value.measurementsCache[index]
    const targetTop = Number(measurement?.start)
    markProgrammaticChatScroll(
      CHAT_SCROLL_COMPENSATION_SUSPEND_MS,
      Number.isFinite(targetTop) ? Math.max(0, targetTop) : Number.NaN
    )
    chatVirtualizer.value.scrollToIndex(index, { align: 'start', behavior: 'auto' })
    await waitForLayoutFrame()
    queueProcessChatScroll(container)
    return
  }

  const mountedEl = userAnchorElMap.get(k)
  const mountedTop = mountedEl ? Number(mountedEl.offsetTop) : Number.NaN
  if (!Number.isFinite(mountedTop)) return
  const nextTop = Math.max(0, mountedTop - 8)
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
    updateAtBottomState(container)
    scheduleRefreshUserAnchorMeta()
    if (!chatVirtualizedEnabled.value) maybeScheduleStreamingScroll()
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
    if (laidOutHeavyChatMessageIds.value.size) {
      const nextLaidOutIds = new Set()
      laidOutHeavyChatMessageIds.value.forEach((id) => {
        if (validIds.has(id)) nextLaidOutIds.add(id)
      })
      if (nextLaidOutIds.size !== laidOutHeavyChatMessageIds.value.size) {
        laidOutHeavyChatMessageIds.value = nextLaidOutIds
      }
    }
    Array.from(chatMessageElMap.keys()).forEach((id) => {
      if (!validIds.has(id)) chatMessageElMap.delete(id)
    })
    pruneUserAnchors(validIds)
    scheduleStickyChatBubbleSync()
  }
)

watch(
  () => session.messages.length,
  () => {
    maybeCoalesceLatestToolMessages()
  }
)

watch(
  () => `${chatHeavyRenderTuning.value.viewportBuffer}|${chatHeavyRenderRootMarginPx.value}|${chatHeavyRenderTuning.value.maxHydrated}`,
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
  void cleanupExpiredSessionTrash()
  void migrateLegacyAutoChatSessionCreatedAt()
  sessionTrashCleanupTimer = window.setInterval(() => {
    void cleanupExpiredSessionTrash()
  }, SESSION_TRASH_CLEANUP_INTERVAL_MS)
  await refreshChatViewportState({ reconnectObserver: true })
})

onActivated(async () => {
  await refreshChatViewportState({ reconnectObserver: true })
  if (autoScrollEnabled.value) scheduleScrollToBottom()
})

onDeactivated(() => {
  disconnectChatLayoutResizeObserver()
  disconnectChatMessageVisibilityObserver()
  clearQueuedChatScrollProcessing()
  clearChatVirtualItemRemeasure()
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
  const hasUserScrollIntent = Date.now() <= userChatScrollIntentUntil
  if (!isProgrammaticScroll && currentTop + 1 < previousTop && (!chatVirtualizedEnabled.value || hasUserScrollIntent)) {
    autoScrollSuspendedByUser.value = true
    autoScrollEnabled.value = false
  }
  queueProcessChatScroll(targetEl)
}

function handleChatWheel(e) {
  const deltaY = Number(e?.deltaY || 0)
  if (!deltaY) return
  clearProgrammaticChatScrollMark()
  userChatScrollIntentUntil = Date.now() + CHAT_USER_SCROLL_INTENT_MS
  if (deltaY < 0) {
    autoScrollSuspendedByUser.value = true
    autoScrollEnabled.value = false
  }
}

function handleChatPointerDown() {
  clearProgrammaticChatScrollMark()
  userChatScrollIntentUntil = Date.now() + CHAT_USER_SCROLL_INTENT_MS
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
  const nextScrollTop = Number(chatScrollTop.value || 0)
  const isProgrammaticScroll = isExpectedProgrammaticChatScroll(nextScrollTop)
  const hasUserScrollIntent = Date.now() <= userChatScrollIntentUntil
  const isUserScrollingUp =
    didProcessChatScroll &&
    (nextScrollTop + 1 < prevScrollTop) &&
    (!chatVirtualizedEnabled.value || hasUserScrollIntent)
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
  userChatScrollIntentUntil = 0
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

    if (chatVirtualizedEnabled.value) {
      const targetScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
      markProgrammaticChatScroll(CHAT_SCROLL_COMPENSATION_SUSPEND_MS, targetScrollTop)
      chatVirtualizer.value.scrollToEnd({ behavior: 'auto' })
      await waitForLayoutFrame()
      updateAtBottomState(el)
      primeHydratedRenderedChatMessages()
      return
    }

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



  function createChatInputKeydownHandler({
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
  }) {
    return (e) => {
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
  }


  function bindDefaultModelConfigListeners({
    providers,
    chatConfig,
    tryApplyDefaultModelFromConfig,
    selectedProvider,
    selectedModel
  }) {
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
  }


  function bindUtoolsEnterDataListener({
    utoolsEnterData,
    buildUtoolsEnterEventKey,
    input,
    send
  }) {
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
  }


  onBeforeUnmount(() => {
    try {
      window?.removeEventListener?.('resize', syncChatResponsiveState)
    } catch {
      // ignore
    }
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
    if (sessionTrashCleanupTimer) {
      window.clearInterval(sessionTrashCleanupTimer)
      sessionTrashCleanupTimer = null
    }
  })

  return {
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
    maybeScheduleStreamingScroll,
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
    scrollToBottom,
    scheduleScrollToBottom,
    bindDefaultModelConfigListeners,
    bindUtoolsEnterDataListener,
    createChatInputKeydownHandler
  }
}
