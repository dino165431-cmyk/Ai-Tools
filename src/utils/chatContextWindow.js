export const CHAT_CONTEXT_WINDOW_PRESETS = Object.freeze({
  aggressive: Object.freeze({
    label: '紧凑',
    description: '优先稳定和速度，适合超长对话或工具很多的场景。',
    maxTurns: 18,
    keepRecentTurnsFull: 6,
    maxMessages: 120,
    maxCharsExpanded: 500000,
    maxCharsCompact: 1000000
  }),
  balanced: Object.freeze({
    label: '平衡',
    description: '兼顾上下文完整度和响应稳定性，适合大多数聊天场景。',
    maxTurns: 48,
    keepRecentTurnsFull: 16,
    maxMessages: 320,
    maxCharsExpanded: 2000000,
    maxCharsCompact: 4000000
  }),
  wide: Object.freeze({
    label: '宽松',
    description: '尽量保留更多历史，适合连续推演或长链路任务。',
    maxTurns: 96,
    keepRecentTurnsFull: 32,
    maxMessages: 800,
    maxCharsExpanded: 3200000,
    maxCharsCompact: 4200000
  })
})

export const CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS = Object.freeze({
  recent: Object.freeze({
    label: '优先最近',
    description: '优先保留最近连续对话，不额外回补更早的附件历史。'
  }),
  balanced: Object.freeze({
    label: '平衡',
    description: '连续对话和附件历史都兼顾，适合大多数场景。'
  }),
  attachments: Object.freeze({
    label: '优先附件',
    description: '尽量保住更早的附件上下文，必要时让普通旧轮次给附件让位。'
  })
})

export const DEFAULT_CHAT_CONTEXT_WINDOW_PRESET = 'balanced'
export const DEFAULT_CHAT_CONTEXT_WINDOW_HISTORY_FOCUS = 'balanced'

export const DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG = Object.freeze({
  preset: DEFAULT_CHAT_CONTEXT_WINDOW_PRESET,
  historyFocus: DEFAULT_CHAT_CONTEXT_WINDOW_HISTORY_FOCUS,
  maxTurns: CHAT_CONTEXT_WINDOW_PRESETS[DEFAULT_CHAT_CONTEXT_WINDOW_PRESET].maxTurns,
  keepRecentTurnsFull: CHAT_CONTEXT_WINDOW_PRESETS[DEFAULT_CHAT_CONTEXT_WINDOW_PRESET].keepRecentTurnsFull,
  maxMessages: CHAT_CONTEXT_WINDOW_PRESETS[DEFAULT_CHAT_CONTEXT_WINDOW_PRESET].maxMessages,
  maxCharsExpanded: CHAT_CONTEXT_WINDOW_PRESETS[DEFAULT_CHAT_CONTEXT_WINDOW_PRESET].maxCharsExpanded,
  maxCharsCompact: CHAT_CONTEXT_WINDOW_PRESETS[DEFAULT_CHAT_CONTEXT_WINDOW_PRESET].maxCharsCompact
})

export const DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS = Object.freeze({
  maxChars: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxCharsExpanded,
  maxMessages: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxMessages,
  maxTurns: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTurns,
  keepRecentTurnsFull: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.keepRecentTurnsFull,
  historyFocus: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.historyFocus,
  maxPreludeMessages: 2,
  maxPinnedAttachmentTurns: 4,
  toolPolicy: 'full',
  preserveToolResultTurns: true,
  allowSelectedAttachmentShrink: true,
  allowAttachmentTurnDisplacement: false
})

const ATTACHMENT_TEXT_MARKERS = Object.freeze([
  '附件：',
  '【附件内容】',
  '（发送了附件）',
  '（图片已随消息发送）',
  '（当前提供商不会直接接收图片二进制',
  '（历史图片'
])

const ATTACHMENT_SUMMARY_MARKERS = Object.freeze([
  '（历史附件内容已截断）',
  '（历史图片已省略，仅保留文字摘要）',
  '（历史图片 '
])

const COMPACT_ATTACHMENT_TEXT_LIMIT = 1800
const ESTIMATED_IMAGE_URL_CHARS = 256

function isFinitePositiveNumber(value) {
  return Number.isFinite(value) && value > 0
}

function normalizeInteger(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.floor(num))
}

function clampInteger(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.floor(num)
  return Math.min(max, Math.max(min, rounded))
}

function normalizeOptionalLimit(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return null
  return clampInteger(value, fallback, min, max)
}

function pickPresetConfig(preset) {
  return CHAT_CONTEXT_WINDOW_PRESETS[preset] || CHAT_CONTEXT_WINDOW_PRESETS[DEFAULT_CHAT_CONTEXT_WINDOW_PRESET]
}

function normalizeHistoryFocus(value) {
  return Object.prototype.hasOwnProperty.call(CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS, value)
    ? value
    : DEFAULT_CHAT_CONTEXT_WINDOW_HISTORY_FOCUS
}

function resolveHistoryFocusOptions(config) {
  const historyFocus = normalizeHistoryFocus(config?.historyFocus)
  const maxTurns = clampInteger(config?.maxTurns, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTurns, 2, 200)

  if (historyFocus === 'recent') {
    return {
      historyFocus,
      maxPinnedAttachmentTurns: 0,
      allowSelectedAttachmentShrink: false,
      allowAttachmentTurnDisplacement: false
    }
  }

  if (historyFocus === 'attachments') {
    return {
      historyFocus,
      maxPinnedAttachmentTurns: Math.min(12, Math.max(4, maxTurns)),
      allowSelectedAttachmentShrink: true,
      allowAttachmentTurnDisplacement: true
    }
  }

  return {
    historyFocus,
    maxPinnedAttachmentTurns: Math.min(4, Math.max(1, maxTurns)),
    allowSelectedAttachmentShrink: true,
    allowAttachmentTurnDisplacement: false
  }
}

export function normalizeChatContextWindowConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const rawPreset = typeof src.preset === 'string' ? src.preset : ''
  const historyFocus = normalizeHistoryFocus(typeof src.historyFocus === 'string' ? src.historyFocus : '')
  const preset =
    rawPreset === 'custom' || Object.prototype.hasOwnProperty.call(CHAT_CONTEXT_WINDOW_PRESETS, rawPreset)
      ? rawPreset
      : DEFAULT_CHAT_CONTEXT_WINDOW_PRESET
  const presetConfig = pickPresetConfig(preset)

  if (preset !== 'custom') {
    return {
      preset,
      historyFocus,
      maxTurns: presetConfig.maxTurns,
      keepRecentTurnsFull: presetConfig.keepRecentTurnsFull,
      maxMessages: presetConfig.maxMessages,
      maxCharsExpanded: presetConfig.maxCharsExpanded,
      maxCharsCompact: presetConfig.maxCharsCompact
    }
  }

  const next = {
    preset,
    historyFocus,
    maxTurns: normalizeOptionalLimit(src.maxTurns, presetConfig.maxTurns, 2, 200),
    keepRecentTurnsFull: normalizeOptionalLimit(src.keepRecentTurnsFull, presetConfig.keepRecentTurnsFull, 1, 64),
    maxMessages: normalizeOptionalLimit(src.maxMessages, presetConfig.maxMessages, 8, 1000),
    maxCharsExpanded: normalizeOptionalLimit(src.maxCharsExpanded, presetConfig.maxCharsExpanded, 4000, 4200000),
    maxCharsCompact: normalizeOptionalLimit(src.maxCharsCompact, presetConfig.maxCharsCompact, 6000, 4200000)
  }

  if (Number.isFinite(next.maxTurns) && Number.isFinite(next.keepRecentTurnsFull)) {
    next.keepRecentTurnsFull = Math.min(next.keepRecentTurnsFull, next.maxTurns)
  }
  return next
}

export function resolveChatContextWindowOptions(raw) {
  const normalized = normalizeChatContextWindowConfig(raw)
  return {
    ...normalized,
    ...resolveHistoryFocusOptions(normalized)
  }
}

export function buildChatContextWindowRuntimeOptions(raw, runtime = {}) {
  const resolved = resolveChatContextWindowOptions(raw)
  const providerKind = typeof runtime?.providerKind === 'string' ? runtime.providerKind : 'openai-compatible'
  const isUtools = providerKind === 'utools-ai'
  const maxChars = isFinitePositiveNumber(runtime?.maxChars)
    ? Math.floor(runtime.maxChars)
    : isFinitePositiveNumber(resolved.maxCharsExpanded)
      ? resolved.maxCharsExpanded
      : Number.MAX_SAFE_INTEGER
  const toolPolicy =
    typeof runtime?.toolPolicy === 'string' && runtime.toolPolicy
      ? runtime.toolPolicy
      : isUtools
        ? 'strip'
        : 'full'

  return {
    maxChars,
    maxMessages: isFinitePositiveNumber(resolved.maxMessages) ? resolved.maxMessages : Number.MAX_SAFE_INTEGER,
    maxTurns: isFinitePositiveNumber(resolved.maxTurns)
      ? (isUtools ? Math.min(64, resolved.maxTurns + 2) : resolved.maxTurns)
      : Number.MAX_SAFE_INTEGER,
    keepRecentTurnsFull: isFinitePositiveNumber(resolved.keepRecentTurnsFull)
      ? (isUtools ? Math.min(32, resolved.keepRecentTurnsFull + 1) : resolved.keepRecentTurnsFull)
      : Number.MAX_SAFE_INTEGER,
    maxPinnedAttachmentTurns: resolved.maxPinnedAttachmentTurns,
    allowSelectedAttachmentShrink: resolved.allowSelectedAttachmentShrink,
    allowAttachmentTurnDisplacement: resolved.allowAttachmentTurnDisplacement,
    toolPolicy
  }
}

function isMessageLike(message) {
  return !!message && typeof message === 'object' && typeof message.role === 'string'
}

function stringifySize(value) {
  if (value == null) return 0
  if (typeof value === 'string') return value.length
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).length

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + stringifySize(item), 0)
  }

  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.length
    if (typeof value.content === 'string') return value.content.length
    if (value.type === 'image_url' && value.image_url && typeof value.image_url === 'object') {
      const url = String(value.image_url.url || '').trim()
      if (!url) return ESTIMATED_IMAGE_URL_CHARS
      return /^data:image\/[a-z0-9.+-]+;base64,/i.test(url)
        ? ESTIMATED_IMAGE_URL_CHARS
        : Math.max(ESTIMATED_IMAGE_URL_CHARS, url.length)
    }

    try {
      return JSON.stringify(value).length
    } catch {
      return String(value).length
    }
  }

  return String(value).length
}

function extractMessageTextContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        if (part.type === 'text' && typeof part.text === 'string') return part.text
        if (typeof part.text === 'string') return part.text
        if (typeof part.content === 'string') return part.content
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text
    if (typeof content.content === 'string') return content.content
  }

  return ''
}

function countMessageImageParts(content) {
  if (!Array.isArray(content)) return 0
  return content.reduce((total, part) => total + (part?.type === 'image_url' ? 1 : 0), 0)
}

function assistantHasVisiblePayload(message) {
  if (!message || message.role !== 'assistant') return false
  const contentSize = stringifySize(message.content)
  const reasoningSize = stringifySize(
    message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought
  )
  return contentSize > 0 || reasoningSize > 0
}

function cloneMessage(message) {
  return { ...message }
}

function messageHasAttachmentPayload(message) {
  if (!isMessageLike(message) || message.role !== 'user') return false
  if (countMessageImageParts(message.content) > 0) return true

  const text = extractMessageTextContent(message.content)
  if (!text) return false
  return ATTACHMENT_TEXT_MARKERS.some((marker) => text.includes(marker))
}

function messageHasAttachmentSummaryPayload(message) {
  if (!isMessageLike(message) || message.role !== 'user') return false
  const text = extractMessageTextContent(message.content)
  if (!text) return false
  return ATTACHMENT_SUMMARY_MARKERS.some((marker) => text.includes(marker))
}

function turnHasAttachmentPayload(turn) {
  return (Array.isArray(turn) ? turn : []).some((message) => messageHasAttachmentPayload(message))
}

function turnHasToolPayload(turn) {
  return (Array.isArray(turn) ? turn : []).some((message) => {
    if (!isMessageLike(message)) return false
    if (message.role === 'tool') return true
    return message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0
  })
}

function truncatePreviewText(text, limit = 180) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (!Number.isFinite(limit) || limit <= 0 || normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(24, limit - 1)).trimEnd()}…`
}

function summarizePreviewMessages(messages) {
  const parts = []

  ;(Array.isArray(messages) ? messages : []).forEach((message) => {
    if (!isMessageLike(message)) return

    if (message.role === 'user' || message.role === 'assistant' || message.role === 'system') {
      const text = extractMessageTextContent(message.content)
      if (text) parts.push(text)
    }

    if (message.role === 'assistant' && !parts.length) {
      const reasoning = message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought
      if (reasoning) parts.push(String(reasoning))
    }
  })

  return truncatePreviewText(parts.join(' / '))
}

function normalizeInspectionReasons(reasons) {
  const unique = []
  ;(Array.isArray(reasons) ? reasons : []).forEach((reason) => {
    const normalized = typeof reason === 'string' ? reason.trim() : ''
    if (normalized && !unique.includes(normalized)) unique.push(normalized)
  })
  return unique
}

function buildInspectionEntry({
  kind = 'turn',
  index = null,
  mode = 'full',
  hasAttachment = false,
  mustKeep = false,
  messages = [],
  stats = null,
  omitted = false,
  reasons = []
} = {}) {
  const normalizedMessages = Array.isArray(messages) ? messages.map(cloneMessage) : []
  const normalizedStats = stats && typeof stats === 'object'
    ? {
        count: Number(stats.count || 0),
        chars: Number(stats.chars || 0)
      }
    : {
        count: normalizedMessages.length,
        chars: estimateMessagesSize(normalizedMessages)
      }

  return {
    kind,
    index,
    mode,
    hasAttachment,
    mustKeep,
    omitted,
    reasons: normalizeInspectionReasons(reasons),
    messageCount: normalizedStats.count,
    chars: normalizedStats.chars,
    previewText: summarizePreviewMessages(normalizedMessages)
  }
}

function collectExceededBudgetReasons({
  selectedTurnCount = 0,
  selectedMessageCount = 0,
  selectedChars = 0,
  extraTurns = 0,
  extraMessages = 0,
  extraChars = 0,
  maxTurns = 0,
  maxMessages = 0,
  maxChars = 0
} = {}) {
  const reasons = []
  if (selectedTurnCount + extraTurns > maxTurns) reasons.push('turn_limit')
  if (selectedMessageCount + extraMessages > maxMessages) reasons.push('message_limit')
  if (selectedChars + extraChars > maxChars) reasons.push('char_limit')
  return reasons
}

function buildInspectionPayload({
  messages = [],
  acceptedPrelude = [],
  preludeChars = 0,
  pinnedAttachmentEntries = [],
  selectedTurns = [],
  omittedEntries = []
} = {}) {
  const entries = []

  if (acceptedPrelude.length) {
    entries.push(
      buildInspectionEntry({
        kind: 'prelude',
        index: null,
        mode: 'prelude',
        hasAttachment: false,
        mustKeep: false,
        messages: acceptedPrelude,
        stats: {
          count: acceptedPrelude.length,
          chars: preludeChars
        }
      })
    )
  }

  pinnedAttachmentEntries.forEach((item) => {
    entries.push(
      buildInspectionEntry({
        kind: 'pinned_attachment_summary',
        index: item.index,
        mode: item.selectionMode,
        hasAttachment: true,
        mustKeep: false,
        messages: item.messages,
        stats: item.stats
      })
    )
  })

  selectedTurns.forEach((item) => {
    entries.push(
      buildInspectionEntry({
        kind: 'turn',
        index: item.index,
        mode: item.selectionMode,
        hasAttachment: item.hasAttachment,
        mustKeep: item.mustKeep,
        messages: item.messages,
        stats: item.stats
      })
    )
  })

  const normalizedOmittedEntries = (Array.isArray(omittedEntries) ? omittedEntries : [])
    .slice()
    .sort((left, right) => {
      const leftRank = left?.kind === 'prelude' ? -1 : Number(left?.index)
      const rightRank = right?.kind === 'prelude' ? -1 : Number(right?.index)
      return leftRank - rightRank
    })

  return {
    entries,
    omittedEntries: normalizedOmittedEntries,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    turnCount: selectedTurns.length + pinnedAttachmentEntries.length,
    preludeCount: acceptedPrelude.length
  }
}

export function countChatContextAttachmentMessages(messages) {
  return (Array.isArray(messages) ? messages : []).reduce(
    (total, message) => total + (messageHasAttachmentPayload(message) ? 1 : 0),
    0
  )
}

export function countChatContextAttachmentSummaryMessages(messages) {
  return (Array.isArray(messages) ? messages : []).reduce(
    (total, message) => total + (messageHasAttachmentSummaryPayload(message) ? 1 : 0),
    0
  )
}

function truncateAttachmentText(text, limit = COMPACT_ATTACHMENT_TEXT_LIMIT) {
  const normalized = String(text || '').trim()
  if (!normalized) return ''
  if (!Number.isFinite(limit) || limit <= 0 || normalized.length <= limit) return normalized

  const marker = '【附件内容】'
  const suffix = '（历史附件内容已截断）'
  const markerIndex = normalized.indexOf(marker)

  if (markerIndex === -1) {
    const head = Math.max(200, limit - suffix.length - 1)
    return `${normalized.slice(0, head).trimEnd()}\n${suffix}`
  }

  const lead = normalized.slice(0, markerIndex).trim()
  const attachmentBlock = normalized.slice(markerIndex).trim()
  const reservedLead = lead ? Math.min(400, lead.length) : 0
  const remaining = Math.max(240, limit - reservedLead - suffix.length - 4)
  const compactLead = reservedLead ? lead.slice(0, reservedLead).trimEnd() : ''
  const compactAttachment = attachmentBlock.slice(0, remaining).trimEnd()

  return [compactLead, compactAttachment, suffix].filter(Boolean).join('\n\n')
}

function compactAttachmentUserMessage(message) {
  const cloned = cloneMessage(message)
  const imageCount = countMessageImageParts(message.content)
  let summary = truncateAttachmentText(extractMessageTextContent(message.content))

  if (imageCount > 0 && !summary.includes('历史图片')) {
    const imageHint = `（历史图片 ${imageCount} 张，原图已省略，仅保留文字摘要）`
    summary = summary ? `${summary}\n\n${imageHint}` : imageHint
  }

  cloned.content = summary || (imageCount > 0 ? '（历史图片已省略，仅保留文字摘要）' : '（历史附件摘要为空）')
  return cloned
}

function stripToolState(message) {
  if (!isMessageLike(message)) return null
  if (message.role === 'tool') return null

  const cloned = cloneMessage(message)
  if (cloned.role === 'assistant') {
    delete cloned.tool_calls
  }
  return cloned
}

function normalizePreludeMessages(messages, toolPolicy, maxPreludeMessages) {
  const list = []

  ;(Array.isArray(messages) ? messages : []).forEach((message) => {
    const next = toolPolicy === 'strip' ? stripToolState(message) : cloneMessage(message)
    if (!next) return
    if (next.role === 'assistant' && toolPolicy === 'strip' && !assistantHasVisiblePayload(next)) return
    list.push(next)
  })

  if (!maxPreludeMessages || list.length <= maxPreludeMessages) return list
  return list.slice(-maxPreludeMessages)
}

function cloneTurnMessages(turn, toolPolicy = 'full') {
  const out = []
  ;(Array.isArray(turn) ? turn : []).forEach((message) => {
    const next = toolPolicy === 'strip' ? stripToolState(message) : cloneMessage(message)
    if (!next) return
    if (next.role === 'assistant' && toolPolicy === 'strip' && !assistantHasVisiblePayload(next)) return
    out.push(next)
  })
  return out
}

function compactTurnMessages(turn, options = {}) {
  if (!Array.isArray(turn) || !turn.length) return []
  const toolPolicy = options?.toolPolicy === 'strip' ? 'strip' : 'full'
  const preserveToolResultTurns = options?.preserveToolResultTurns !== false

  if (toolPolicy !== 'strip' && preserveToolResultTurns && turnHasToolPayload(turn)) {
    return cloneTurnMessages(turn, toolPolicy)
  }

  const out = []
  const first = turn[0]
  if (isMessageLike(first)) {
    out.push(messageHasAttachmentPayload(first) ? compactAttachmentUserMessage(first) : cloneMessage(first))
  }

  for (let i = 1; i < turn.length; i += 1) {
    const message = turn[i]
    if (!isMessageLike(message)) continue

    if (message.role === 'tool') continue

    if (message.role === 'assistant') {
      const cloned = cloneMessage(message)
      delete cloned.tool_calls
      if (!assistantHasVisiblePayload(cloned)) continue
      out.push(cloned)
      continue
    }

    out.push(messageHasAttachmentPayload(message) ? compactAttachmentUserMessage(message) : cloneMessage(message))
  }

  return out
}

function buildPinnedAttachmentMessages(turn) {
  if (!turnHasAttachmentPayload(turn)) return []
  const compactMessages = compactTurnMessages(turn)
  const firstUser = compactMessages.find((message) => message?.role === 'user')
  return firstUser ? [firstUser] : []
}

function selectTurnMessages(turn, { toolPolicy, compact }) {
  if (!Array.isArray(turn) || !turn.length) return []

  if (compact) return compactTurnMessages(turn, { toolPolicy, preserveToolResultTurns: true })

  return cloneTurnMessages(turn, toolPolicy)
}

function estimateMessageSize(message) {
  if (!isMessageLike(message)) return 0
  return (
    String(message.role || '').length +
    stringifySize(message.content) +
    stringifySize(message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought) +
    stringifySize(message.tool_calls)
  )
}

function estimateMessagesSize(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((total, message) => total + estimateMessageSize(message), 0)
}

function splitConversationTurns(messages) {
  const prelude = []
  const turns = []
  let currentTurn = []

  ;(Array.isArray(messages) ? messages : []).forEach((message) => {
    if (!isMessageLike(message)) return

    if (message.role === 'user') {
      if (message.synthetic_tool_vision === true && currentTurn.length) {
        currentTurn.push(message)
        return
      }

      if (currentTurn.length) turns.push(currentTurn)
      currentTurn = [message]
      return
    }

    if (currentTurn.length) {
      currentTurn.push(message)
      return
    }

    prelude.push(message)
  })

  if (currentTurn.length) turns.push(currentTurn)
  return { prelude, turns }
}

function inspectChatContextWindowInternal(apiMessages, options = {}) {
  const opts = {
    ...DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS,
    ...(options && typeof options === 'object' ? options : {})
  }

  const maxChars = normalizeInteger(opts.maxChars, DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxChars)
  const maxMessages = normalizeInteger(opts.maxMessages, DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxMessages)
  const maxTurns = normalizeInteger(opts.maxTurns, DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxTurns)
  const keepRecentTurnsFull = normalizeInteger(
    opts.keepRecentTurnsFull,
    DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.keepRecentTurnsFull
  )
  const maxPreludeMessages = normalizeInteger(
    opts.maxPreludeMessages,
    DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxPreludeMessages
  )
  const maxPinnedAttachmentTurns = clampInteger(
    opts.maxPinnedAttachmentTurns,
    Math.min(DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxPinnedAttachmentTurns, Math.max(1, maxTurns || 1)),
    0,
    12
  )
  const toolPolicy = opts.toolPolicy === 'strip' ? 'strip' : 'full'
  const preserveToolResultTurns = opts.preserveToolResultTurns !== false
  const allowSelectedAttachmentShrink = opts.allowSelectedAttachmentShrink !== false
  const allowAttachmentTurnDisplacement = opts.allowAttachmentTurnDisplacement === true

  const normalizedMessages = Array.isArray(apiMessages) ? apiMessages.filter(isMessageLike) : []
  if (!normalizedMessages.length) {
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

  const { prelude, turns } = splitConversationTurns(normalizedMessages)
  const oversizeTurnChars = isFinitePositiveNumber(opts.oversizeTurnChars)
    ? Number(opts.oversizeTurnChars)
    : Math.max(4000, Math.floor(maxChars * 0.4))
  const oversizeTurnMessages = isFinitePositiveNumber(opts.oversizeTurnMessages)
    ? Number(opts.oversizeTurnMessages)
    : Math.max(8, Math.floor(maxMessages * 0.35))

  const turnCandidates = turns.map((turn, turnIndex) => {
    const reverseIndex = turns.length - 1 - turnIndex
    const mustKeep = reverseIndex === 0
    const preferFull = reverseIndex < keepRecentTurnsFull
    const hasAttachment = turnHasAttachmentPayload(turn)
    const hasToolPayload = turnHasToolPayload(turn)
    const attachmentSummaryMessages = hasAttachment ? buildPinnedAttachmentMessages(turn) : []
    const fullTurn = selectTurnMessages(turn, { toolPolicy, compact: false })
    const compactTurn = selectTurnMessages(turn, {
      toolPolicy,
      compact: true,
      preserveToolResultTurns
    })

    const fullTurnMessages = fullTurn.length ? fullTurn : compactTurn
    const compactTurnMessagesSafe = compactTurn.length ? compactTurn : fullTurnMessages

    const fullTurnStats = {
      count: fullTurnMessages.length,
      chars: estimateMessagesSize(fullTurnMessages)
    }
    const compactTurnStats = {
      count: compactTurnMessagesSafe.length,
      chars: estimateMessagesSize(compactTurnMessagesSafe)
    }
    const attachmentSummaryStats = {
      count: attachmentSummaryMessages.length,
      chars: estimateMessagesSize(attachmentSummaryMessages)
    }

    const fullTurnOversized =
      fullTurnStats.count > oversizeTurnMessages || fullTurnStats.chars > oversizeTurnChars

    let messages = compactTurnMessagesSafe
    let stats = compactTurnStats
    let selectionMode = 'compact'

    if (toolPolicy !== 'strip' && preserveToolResultTurns && hasToolPayload) {
      messages = fullTurnMessages
      stats = fullTurnStats
      selectionMode = 'full'
    }

    if (preferFull && (mustKeep || !fullTurnOversized)) {
      messages = fullTurnMessages
      stats = fullTurnStats
      selectionMode = 'full'
    }

    return {
      index: turnIndex,
      mustKeep,
      hasAttachment,
      hasToolPayload,
      attachmentSummaryMessages,
      attachmentSummaryStats,
      fullTurnMessages,
      compactTurnMessagesSafe,
      fullTurnStats,
      compactTurnStats,
      messages,
      stats,
      selectionMode
    }
  })

  const selectedTurns = []
  let selectedTurnCount = 0
  let selectedMessageCount = 0
  let selectedChars = 0
  let selectionStopIndex = -1
  let selectionStopReasons = []
  const omittedEntryMap = new Map()

  const removeSelectedTurnAtIndex = (index) => {
    if (index < 0 || index >= selectedTurns.length) return null
    const [removed] = selectedTurns.splice(index, 1)
    if (!removed) return null
    selectedTurnCount = Math.max(0, selectedTurnCount - 1)
    selectedMessageCount = Math.max(0, selectedMessageCount - Number(removed?.stats?.count || 0))
    selectedChars = Math.max(0, selectedChars - Number(removed?.stats?.chars || 0))
    return removed
  }

  const collectBudgetReasons = ({ extraTurns = 0, extraMessages = 0, extraChars = 0 } = {}) =>
    collectExceededBudgetReasons({
      selectedTurnCount,
      selectedMessageCount,
      selectedChars,
      extraTurns,
      extraMessages,
      extraChars,
      maxTurns,
      maxMessages,
      maxChars
    })

  const canFitAdditionalPayload = ({ extraTurns = 0, extraMessages = 0, extraChars = 0 } = {}) =>
    collectBudgetReasons({ extraTurns, extraMessages, extraChars }).length === 0

  const recordOmittedEntry = ({
    kind = 'turn',
    index = null,
    mode = 'compact',
    hasAttachment = false,
    messages = [],
    stats = null,
    reasons = []
  } = {}) => {
    const key = `${kind}:${index == null ? 'prelude' : index}`
    const normalizedReasons = normalizeInspectionReasons(reasons)
    const existing = omittedEntryMap.get(key)
    if (existing) {
      existing.reasons = normalizeInspectionReasons([...(existing.reasons || []), ...normalizedReasons])
      return existing
    }

    const entry = buildInspectionEntry({
      kind,
      index,
      mode,
      hasAttachment,
      mustKeep: false,
      messages,
      stats,
      omitted: true,
      reasons: normalizedReasons
    })
    omittedEntryMap.set(key, entry)
    return entry
  }

  const recordOmittedTurnCandidate = (turnIndex, reasons = [], overrides = {}) => {
    const candidate = turnCandidates[turnIndex]
    if (!candidate) return null
    return recordOmittedEntry({
      kind: 'turn',
      index: turnIndex,
      mode: overrides.mode ?? candidate.selectionMode,
      hasAttachment: overrides.hasAttachment ?? candidate.hasAttachment,
      messages: overrides.messages ?? candidate.messages,
      stats: overrides.stats ?? candidate.stats,
      reasons
    })
  }

  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const candidate = turnCandidates[turnIndex]
    const mustKeep = candidate.mustKeep
    const hasAttachment = candidate.hasAttachment
    const hasToolPayload = candidate.hasToolPayload
    const attachmentSummaryMessages = candidate.attachmentSummaryMessages
    const attachmentSummaryStats = candidate.attachmentSummaryStats
    let chosenMessages = candidate.messages
    let chosenStats = candidate.stats
    let chosenMode = candidate.selectionMode

    const fullFits =
      selectedTurnCount < maxTurns &&
      selectedMessageCount + candidate.fullTurnStats.count <= maxMessages &&
      selectedChars + candidate.fullTurnStats.chars <= maxChars

    const compactFits =
      canFitAdditionalPayload({
        extraTurns: 1,
        extraMessages: candidate.compactTurnStats.count,
        extraChars: candidate.compactTurnStats.chars
      })

    if (!mustKeep) {
      if (
        chosenMessages === candidate.fullTurnMessages &&
        !fullFits &&
        (compactFits ||
          (hasAttachment &&
            allowAttachmentTurnDisplacement &&
            (
              candidate.compactTurnStats.count < candidate.fullTurnStats.count ||
              candidate.compactTurnStats.chars < candidate.fullTurnStats.chars
            )))
      ) {
        chosenMessages = candidate.compactTurnMessagesSafe
        chosenStats = candidate.compactTurnStats
        chosenMode = 'compact'
      }

      let chosenFitReasons = collectBudgetReasons({
        extraTurns: 1,
        extraMessages: chosenStats.count,
        extraChars: chosenStats.chars
      })
      let chosenFits = chosenFitReasons.length === 0

      if (!chosenFits && hasAttachment && allowAttachmentTurnDisplacement) {
        while (true) {
          const overflowReasons = collectBudgetReasons({
            extraTurns: 1,
            extraMessages: chosenStats.count,
            extraChars: chosenStats.chars
          })
          if (!overflowReasons.length) break

          const removableIndex = findRemovableSelectedTurnIndex()
          if (removableIndex !== -1) {
            const removed = removeSelectedTurnAtIndex(removableIndex)
            if (removed) {
              recordOmittedEntry({
                kind: 'turn',
                index: removed.index,
                mode: removed.selectionMode,
                hasAttachment: removed.hasAttachment,
                messages: removed.messages,
                stats: removed.stats,
                reasons: [...overflowReasons, 'attachment_displacement']
              })
            }
            continue
          }

          if (!allowSelectedAttachmentShrink) break
          const shrinkableIndex = findShrinkableAttachmentTurnIndex()
          if (shrinkableIndex === -1 || !shrinkSelectedTurnToAttachmentSummary(shrinkableIndex)) break
        }

        chosenFitReasons = collectBudgetReasons({
          extraTurns: 1,
          extraMessages: chosenStats.count,
          extraChars: chosenStats.chars
        })
        chosenFits = chosenFitReasons.length === 0
      }

      if (!chosenFits) {
        selectionStopIndex = turnIndex
        selectionStopReasons = chosenFitReasons.length ? chosenFitReasons : ['char_limit']
        recordOmittedTurnCandidate(turnIndex, selectionStopReasons)
        break
      }
    }

    selectedTurns.unshift({
      index: turnIndex,
      mustKeep,
      hasAttachment,
      hasToolPayload,
      attachmentSummaryMessages,
      attachmentSummaryStats,
      selectionMode: chosenMode,
      messages: chosenMessages,
      stats: chosenStats
    })
    selectedTurnCount += 1
    selectedMessageCount += chosenStats.count
    selectedChars += chosenStats.chars
  }

  function findRemovableSelectedTurnIndex() {
    for (let i = 0; i < selectedTurns.length; i += 1) {
      const item = selectedTurns[i]
      if (!item?.mustKeep && !item?.hasAttachment && !item?.hasToolPayload) return i
    }
    return -1
  }

  function findShrinkableAttachmentTurnIndex() {
    for (let i = 0; i < selectedTurns.length; i += 1) {
      const item = selectedTurns[i]
      if (!item?.hasAttachment || item?.mustKeep) continue
      if (!Array.isArray(item?.attachmentSummaryMessages) || !item.attachmentSummaryMessages.length) continue
      const nextCount = Number(item?.attachmentSummaryStats?.count || 0)
      const nextChars = Number(item?.attachmentSummaryStats?.chars || 0)
      const currentCount = Number(item?.stats?.count || 0)
      const currentChars = Number(item?.stats?.chars || 0)
      if (nextCount < currentCount || nextChars < currentChars) return i
    }
    return -1
  }

  function shrinkSelectedTurnToAttachmentSummary(index) {
    const item = selectedTurns[index]
    if (!item) return false
    if (!Array.isArray(item.attachmentSummaryMessages) || !item.attachmentSummaryMessages.length) return false

    const nextStats = item.attachmentSummaryStats || {
      count: item.attachmentSummaryMessages.length,
      chars: estimateMessagesSize(item.attachmentSummaryMessages)
    }
    const currentCount = Number(item?.stats?.count || 0)
    const currentChars = Number(item?.stats?.chars || 0)
    const nextCount = Number(nextStats.count || 0)
    const nextChars = Number(nextStats.chars || 0)
    if (nextCount >= currentCount && nextChars >= currentChars) return false

    item.messages = item.attachmentSummaryMessages.map(cloneMessage)
    item.stats = { count: nextCount, chars: nextChars }
    item.selectionMode = 'attachment_summary'
    selectedMessageCount = Math.max(0, selectedMessageCount - currentCount + nextCount)
    selectedChars = Math.max(0, selectedChars - currentChars + nextChars)
    return true
  }

  const pinnedAttachmentMessages = []
  const pinnedAttachmentEntries = []
  const firstSelectedTurnIndex = selectedTurns.length ? selectedTurns[0].index : turns.length
  if (maxPinnedAttachmentTurns > 0 && firstSelectedTurnIndex > 0) {
    const candidates = []

    for (let i = 0; i < firstSelectedTurnIndex; i += 1) {
      const messages = turnCandidates[i]?.attachmentSummaryMessages || []
      if (!messages.length) continue
      candidates.push({
        index: i,
        messages,
        stats: turnCandidates[i]?.attachmentSummaryStats || {
          count: messages.length,
          chars: estimateMessagesSize(messages)
        }
      })
    }

    const skippedCandidates = maxPinnedAttachmentTurns > 0 ? candidates.slice(0, Math.max(0, candidates.length - maxPinnedAttachmentTurns)) : candidates
    skippedCandidates.forEach((candidate) => {
      recordOmittedTurnCandidate(candidate.index, ['attachment_policy_disabled'], {
        mode: 'pinned_attachment_summary',
        hasAttachment: true,
        messages: candidate.messages,
        stats: candidate.stats
      })
    })

    const recentCandidates = maxPinnedAttachmentTurns > 0 ? candidates.slice(-maxPinnedAttachmentTurns) : []
    for (let i = recentCandidates.length - 1; i >= 0; i -= 1) {
      const candidate = recentCandidates[i]

      while (true) {
        const overflowReasons = collectBudgetReasons({
          extraTurns: 0,
          extraMessages: candidate.stats.count,
          extraChars: candidate.stats.chars
        })
        if (!overflowReasons.length) break

        const removableIndex = findRemovableSelectedTurnIndex()
        if (removableIndex !== -1) {
          const removed = removeSelectedTurnAtIndex(removableIndex)
          if (removed) {
            recordOmittedEntry({
              kind: 'turn',
              index: removed.index,
              mode: removed.selectionMode,
              hasAttachment: removed.hasAttachment,
              messages: removed.messages,
              stats: removed.stats,
              reasons: [...overflowReasons, 'attachment_displacement']
            })
          }
          continue
        }

        if (!allowSelectedAttachmentShrink) break
        const shrinkableIndex = findShrinkableAttachmentTurnIndex()
        if (shrinkableIndex === -1 || !shrinkSelectedTurnToAttachmentSummary(shrinkableIndex)) break
      }

      const candidateFitReasons = collectBudgetReasons({
        extraTurns: 0,
        extraMessages: candidate.stats.count,
        extraChars: candidate.stats.chars
      })
      if (candidateFitReasons.length) {
        recordOmittedTurnCandidate(candidate.index, candidateFitReasons, {
          mode: 'pinned_attachment_summary',
          hasAttachment: true,
          messages: candidate.messages,
          stats: candidate.stats
        })
        continue
      }

      pinnedAttachmentMessages.unshift(...candidate.messages)
      pinnedAttachmentEntries.unshift({
        index: candidate.index,
        messages: candidate.messages.map(cloneMessage),
        stats: { ...candidate.stats },
        selectionMode: 'pinned_attachment_summary',
        hasAttachment: true,
        mustKeep: false
      })
      selectedMessageCount += candidate.stats.count
      selectedChars += candidate.stats.chars
    }
  }

  const selectedMessages = selectedTurns.flatMap((item) => item.messages)
  const normalizedPreludeMessages = normalizePreludeMessages(prelude, toolPolicy, 0)
  const preludeMessages =
    maxPreludeMessages && normalizedPreludeMessages.length > maxPreludeMessages
      ? normalizedPreludeMessages.slice(-maxPreludeMessages)
      : normalizedPreludeMessages

  const remainingMessageBudget = Math.max(0, maxMessages - selectedMessageCount)
  const remainingCharBudget = Math.max(0, maxChars - selectedChars)

  const acceptedPrelude = []
  let preludeChars = 0

  if (remainingMessageBudget > 0 && remainingCharBudget > 0) {
    for (let i = preludeMessages.length - 1; i >= 0; i -= 1) {
      const message = preludeMessages[i]
      const messageChars = estimateMessageSize(message)
      if (acceptedPrelude.length >= remainingMessageBudget) break
      if (preludeChars + messageChars > remainingCharBudget) break
      acceptedPrelude.unshift(message)
      preludeChars += messageChars
    }
  }

  const omittedPreludeMessages =
    normalizedPreludeMessages.length > acceptedPrelude.length
      ? normalizedPreludeMessages.slice(0, normalizedPreludeMessages.length - acceptedPrelude.length)
      : []
  if (omittedPreludeMessages.length) {
    recordOmittedEntry({
      kind: 'prelude',
      index: null,
      mode: 'prelude',
      hasAttachment: false,
      messages: omittedPreludeMessages,
      stats: {
        count: omittedPreludeMessages.length,
        chars: estimateMessagesSize(omittedPreludeMessages)
      },
      reasons: ['prelude_budget_exhausted']
    })
  }

  const selectedTurnIndexSet = new Set(selectedTurns.map((item) => item.index))
  const pinnedAttachmentIndexSet = new Set(pinnedAttachmentEntries.map((item) => item.index))
  for (let i = 0; i < turns.length; i += 1) {
    if (selectedTurnIndexSet.has(i) || pinnedAttachmentIndexSet.has(i)) continue

    const reasons = []
    if (selectionStopIndex !== -1 && i <= selectionStopIndex) {
      reasons.push(...selectionStopReasons)
    }
    if (i < firstSelectedTurnIndex && turnCandidates[i]?.hasAttachment && maxPinnedAttachmentTurns <= 0) {
      reasons.push('attachment_policy_disabled')
    }
    if (!reasons.length) {
      reasons.push(
        ...collectBudgetReasons({
          extraTurns: 1,
          extraMessages: Number(turnCandidates[i]?.stats?.count || 0),
          extraChars: Number(turnCandidates[i]?.stats?.chars || 0)
        })
      )
    }
    recordOmittedTurnCandidate(i, reasons.length ? reasons : ['turn_limit'])
  }

  const messages = [...acceptedPrelude, ...pinnedAttachmentMessages, ...selectedMessages]

  return {
    messages,
    inspection: buildInspectionPayload({
      messages,
      acceptedPrelude,
      preludeChars,
      pinnedAttachmentEntries,
      selectedTurns,
      omittedEntries: Array.from(omittedEntryMap.values())
    })
  }
}

export function inspectChatContextWindow(apiMessages, options = {}) {
  return inspectChatContextWindowInternal(apiMessages, options)
}

export function buildChatContextWindow(apiMessages, options = {}) {
  return inspectChatContextWindowInternal(apiMessages, options).messages
}
