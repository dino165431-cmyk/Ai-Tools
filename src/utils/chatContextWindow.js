import { extractChatSandboxDescriptors } from './chatSandboxWorkspace.js'
import { buildContextSummaryPrelude } from './chatContextSummary.js'

// =====================================================================
// 上下文窗口：Codex 式单一预算窗口
// ---------------------------------------------------------------------
// 设计原则：
//   1. 单一 Token 预算：压缩只由真实预算（模型窗口 - 输出保留 - 预留）驱动，
//      不再有「展开/精简双档」与「提前压缩百分比」。
//   2. 宁丢不压：从最新轮次向旧轮次放入历史，放不下就丢弃更早的轮次，
//      不再对中间内容做多级文本截断压缩。
//   3. 附件摘要回补：附件轮次放不下时可用摘要锚点替代；预算有余时给更早的
//      附件轮次回补摘要，保留插件对附件上下文的特色支持。
//   4. 轮次/消息数只是兜底护栏（默认极大），不会在预算未满时触发裁剪。
// =====================================================================

export const CHAT_CONTEXT_WINDOW_PRESETS = Object.freeze({
  aggressive: Object.freeze({
    label: '紧凑',
    description: '优先稳定和速度，适合超长对话或工具很多的场景。',
    maxTokens: 131072,
    maxTurns: 500,
    keepRecentTurnsFull: 128,
    maxMessages: 4000
  }),
  balanced: Object.freeze({
    label: '平衡',
    description: '兼顾上下文完整度和响应稳定性，适合大多数聊天场景。',
    maxTokens: 262144,
    maxTurns: 1000,
    keepRecentTurnsFull: 256,
    maxMessages: 8000
  }),
  wide: Object.freeze({
    label: '宽松',
    description: '尽量保留更多历史，适合连续推演或长链路任务。',
    maxTokens: 524288,
    maxTurns: 2000,
    keepRecentTurnsFull: 512,
    maxMessages: 16000
  }),
  max: Object.freeze({
    label: '最大',
    description: '最大化利用 1M 超长窗口模型，适合长链路连续任务。',
    maxTokens: 1048576,
    maxTurns: 4000,
    keepRecentTurnsFull: 1024,
    maxMessages: 32000
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
  maxTokens: CHAT_CONTEXT_WINDOW_PRESETS[DEFAULT_CHAT_CONTEXT_WINDOW_PRESET].maxTokens
})

export const DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS = Object.freeze({
  maxChars: Number.MAX_SAFE_INTEGER,
  maxMessages: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxMessages,
  maxTurns: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTurns,
  keepRecentTurnsFull: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.keepRecentTurnsFull,
  historyFocus: DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.historyFocus,
  maxPreludeMessages: 2,
  maxPinnedAttachmentTurns: 4,
  toolPolicy: 'full',
  attachmentSummaryEnabled: true
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

// 摘要/内联压缩的保护线：上下文压力达到该比例后才允许提前压缩历史。
export const CONTEXT_WINDOW_TRIGGER_RATIO = 0.85
// 主动摘要（旧历史总结）的触发字符比例。
export const CONTEXT_SUMMARY_RATIO = 0.92

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
  if (value === null || value === undefined || value === '') return fallback
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
  const maxTurns = clampInteger(config?.maxTurns, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTurns, 2, 10000)

  if (historyFocus === 'recent') {
    return {
      historyFocus,
      maxPinnedAttachmentTurns: 0
    }
  }

  if (historyFocus === 'attachments') {
    return {
      historyFocus,
      maxPinnedAttachmentTurns: Math.min(12, Math.max(4, Math.floor(maxTurns / 16)))
    }
  }

  return {
    historyFocus,
    maxPinnedAttachmentTurns: Math.min(4, Math.max(1, Math.floor(maxTurns / 64)))
  }
}

function resolveLegacyMaxTokens(src, presetConfig) {
  // 兼容旧配置：旧版使用 maxTokensExpanded / maxTokensCompact / maxCharsExpanded。
  const candidates = [
    src?.maxTokens,
    src?.maxTokensExpanded,
    src?.maxTokensCompact,
    Number.isFinite(Number(src?.maxCharsExpanded))
      ? Math.floor(Number(src.maxCharsExpanded) * 0.5)
      : null
  ]
  for (const candidate of candidates) {
    const num = Number(candidate)
    if (Number.isFinite(num) && num > 0) {
      return clampInteger(num, presetConfig.maxTokens, 1000, 4000000)
    }
  }
  return presetConfig.maxTokens
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
      maxTokens: presetConfig.maxTokens
    }
  }

  const next = {
    preset,
    historyFocus,
    maxTurns: normalizeOptionalLimit(src.maxTurns, presetConfig.maxTurns, 2, 10000),
    keepRecentTurnsFull: normalizeOptionalLimit(src.keepRecentTurnsFull, presetConfig.keepRecentTurnsFull, 1, 2000),
    maxMessages: normalizeOptionalLimit(src.maxMessages, presetConfig.maxMessages, 8, 32000),
    maxTokens: resolveLegacyMaxTokens(src, presetConfig)
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

// 单一预算窗口（Codex 风格）：mode 恒为 expanded，不再自动切换双档。
export function resolveChatContextWindowBudgetPlan(raw, runtime = {}) {
  const resolved = resolveChatContextWindowOptions(raw)
  const modelContextTokens = isFinitePositiveNumber(runtime?.modelContextTokens)
    ? Math.floor(runtime.modelContextTokens)
    : null
  const outputReserveTokens = modelContextTokens
    ? Math.min(32768, Math.max(8192, Math.floor(modelContextTokens * 0.08)))
    : 0
  const rawMaxTokens = isFinitePositiveNumber(resolved.maxTokens)
    ? Math.floor(resolved.maxTokens)
    : Number.MAX_SAFE_INTEGER
  const expandedTokens = modelContextTokens
    ? Math.max(1000, Math.min(rawMaxTokens, modelContextTokens - outputReserveTokens))
    : rawMaxTokens
  const compactTokens = expandedTokens
  const expandedChars = Number.MAX_SAFE_INTEGER
  const compactChars = expandedChars
  const reservedChars = Math.max(0, Math.floor(Number(runtime?.reservedChars) || 0))
  const sourceChars = Math.max(0, Math.floor(Number(runtime?.sourceChars) || 0))
  const reportedInputTokens = Math.max(0, Math.floor(Number(runtime?.reportedInputTokens) || 0))
  const reportedRequestChars = Math.max(0, Math.floor(Number(runtime?.reportedRequestChars) || 0))
  const telemetryAvailable = reportedInputTokens > 0 && reportedRequestChars > 0
  // 无遥测时使用保守的字符/token 换算（约 4 字符 ≈ 1 token），
  // 保证预算口径与有遥测时一致：否则 token 数会被当作字符数使用，
  // 导致预算被压缩到实际窗口的 1/4，历史被过度提前裁剪。
  const FALLBACK_TOKENS_PER_CHAR = 0.25
  const tokensPerChar = telemetryAvailable
    ? Math.min(8, Math.max(0.05, reportedInputTokens / reportedRequestChars))
    : FALLBACK_TOKENS_PER_CHAR
  const totalEstimatedChars = reservedChars + sourceChars
  const reservedTokens = Math.max(0, Math.ceil(reservedChars * tokensPerChar))
  const sourceEstimatedTokens = Math.max(0, Math.ceil(sourceChars * tokensPerChar))
  const totalEstimatedTokens = reservedTokens + sourceEstimatedTokens
  const expandedPressure = expandedTokens > 0 ? totalEstimatedTokens / expandedTokens : 0
  const mode = 'expanded'
  const reason = 'default'
  const baseChars = expandedChars
  const baseTokens = expandedTokens
  const historyTokensBudget = Math.max(0, baseTokens - reservedTokens)
  const historyCharsBudget = Math.max(1, Math.floor(historyTokensBudget / tokensPerChar))
  const triggerRatio = CONTEXT_WINDOW_TRIGGER_RATIO
  const triggerTokens = telemetryAvailable
    ? Math.max(0, Math.floor(expandedTokens * triggerRatio))
    : 0
  const effectivePressure = telemetryAvailable
    ? (baseTokens > 0 ? totalEstimatedTokens / baseTokens : 0)
    : 0

  return {
    mode,
    reason,
    autoCompactActive: false,
    autoCompactTriggerPercent: Math.round(triggerRatio * 100),
    triggerRatio,
    budgetUnit: telemetryAvailable ? 'token' : 'char',
    telemetryAvailable,
    modelContextTokens,
    expandedTokens,
    compactTokens,
    baseTokens,
    reportedInputTokens,
    reportedRequestChars,
    tokensPerChar,
    reservedTokens,
    sourceEstimatedTokens,
    totalEstimatedTokens,
    historyTokensBudget,
    expandedChars,
    compactChars,
    baseChars: telemetryAvailable ? expandedChars : Math.max(1, historyCharsBudget),
    compactChars: telemetryAvailable ? compactChars : Math.max(1, historyCharsBudget),
    reservedChars,
    sourceChars,
    totalEstimatedChars,
    expandedPressure,
    triggerTokens,
    effectivePressure,
    historyCharsBudget
  }
}

export function calculateContextSummaryTriggerChars({ historyCharsBudget = 0, minChars = 12000, ratio = CONTEXT_SUMMARY_RATIO } = {}) {
  const budget = Math.max(0, Math.floor(Number(historyCharsBudget) || 0))
  if (!budget) return 0

  const normalizedRatio = Number.isFinite(Number(ratio)) ? Math.min(0.98, Math.max(0.5, Number(ratio))) : CONTEXT_SUMMARY_RATIO
  const minimum = Math.max(4000, Math.floor(Number(minChars) || 12000))
  return Math.min(budget, Math.max(minimum, Math.floor(budget * normalizedRatio)))
}

export function shouldSummarizeContextWindow({
  sourceMessages = [],
  sourceChars = 0,
  summaryTriggerChars = 0,
  minMessages = 2
} = {}) {
  const messageCount = Array.isArray(sourceMessages) ? sourceMessages.length : 0
  const safeMinMessages = Math.max(1, Math.floor(Number(minMessages) || 0))
  if (messageCount < safeMinMessages) return false

  const triggerChars = Math.max(0, Math.floor(Number(summaryTriggerChars) || 0))
  const safeSourceChars = Math.max(0, Math.floor(Number(sourceChars) || 0))
  return triggerChars > 0 && safeSourceChars >= triggerChars
}

export function resolveContextSummaryLevel(cachedSummary = null, hasForwardProgress = false) {
  const cachedLevel = Math.max(0, Math.floor(Number(cachedSummary?.summaryLevel || 0)))
  const baseLevel = Math.max(1, cachedLevel || 0)
  return hasForwardProgress ? baseLevel + 1 : 1
}

export function resolveContextSummaryChain(cachedSummary = null, summaryLevel = 1, hasForwardProgress = false) {
  const targetLevel = Math.max(1, Math.floor(Number(summaryLevel) || 0))
  if (!hasForwardProgress) return [targetLevel]

  const cachedChain = Array.isArray(cachedSummary?.summaryChain) ? cachedSummary.summaryChain : []
  const normalizedCachedChain = cachedChain
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .filter((value) => value > 0)

  if (normalizedCachedChain.length) {
    const dedupedChain = []
    for (const level of normalizedCachedChain) {
      if (dedupedChain[dedupedChain.length - 1] !== level) dedupedChain.push(level)
    }
    if (targetLevel > dedupedChain[dedupedChain.length - 1]) {
      dedupedChain.push(targetLevel)
    }
    return dedupedChain
  }

  const cachedLevel = Math.max(0, Math.floor(Number(cachedSummary?.summaryLevel || 0)))
  if (cachedLevel > 0) {
    const rebuiltChain = Array.from({ length: cachedLevel }, (_, index) => index + 1)
    if (targetLevel > rebuiltChain[rebuiltChain.length - 1]) {
      rebuiltChain.push(targetLevel)
    }
    return rebuiltChain
  }

  return [targetLevel]
}

export function resolveContextSummarySourceLabel(hasForwardProgress = false) {
  return hasForwardProgress ? '旧摘要 + 新增历史' : '全量前史'
}

export function buildChatContextWindowRuntimeOptions(raw, runtime = {}) {
  const resolved = resolveChatContextWindowOptions(raw)
  const providerKind = typeof runtime?.providerKind === 'string' ? runtime.providerKind : 'openai-compatible'
  const isUtools = providerKind === 'utools-ai'
  const maxChars = isFinitePositiveNumber(runtime?.maxChars)
    ? Math.floor(runtime.maxChars)
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
    maxTurns: isFinitePositiveNumber(resolved.maxTurns) ? resolved.maxTurns : Number.MAX_SAFE_INTEGER,
    keepRecentTurnsFull: isFinitePositiveNumber(resolved.keepRecentTurnsFull)
      ? resolved.keepRecentTurnsFull
      : Number.MAX_SAFE_INTEGER,
    maxPinnedAttachmentTurns: resolved.maxPinnedAttachmentTurns,
    toolPolicy
  }
}

// ---------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------

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
      // base64 鍥剧墖浼氶殢璇锋眰浣撳彂閫侊紝蹇呴』鎸夌湡瀹為暱搴﹁鍏ラ绠楋紝鍚﹀垯甯﹀浘鍘嗗彶浼氫弗閲嶄綆浼扮獥鍙ｅ崰鐢紱
      // 澶栭摼 URL 鏃犳硶棰勭煡鍥剧墖澶у皬锛岀户缁娇鐢ㄥ浐瀹氫及绠楀€笺€?      return Math.max(ESTIMATED_IMAGE_URL_CHARS, url.length)
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

function normalizeTextValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
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
    const key = String(reason || '')
    if (key && !unique.includes(key)) unique.push(key)
  })
  return unique
}

function buildInspectionEntry({
  kind = 'turn',
  index = null,
  mode = 'full',
  variant = 'full',
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
    variant,
    hasAttachment,
    mustKeep,
    omitted,
    reasons: normalizeInspectionReasons(reasons),
    messageCount: normalizedStats.count,
    chars: normalizedStats.chars,
    previewText: summarizePreviewMessages(normalizedMessages),
    messages: normalizedMessages
  }
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
        variant: 'prelude',
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
        variant: item.selectionVariant || item.selectionMode,
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
        variant: item.selectionVariant || item.selectionMode,
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

  const collectedMessages = []
  entries.forEach((entry) => {
    if (Array.isArray(entry.messages)) collectedMessages.push(...entry.messages)
  })

  return {
    entries,
    omittedEntries: normalizedOmittedEntries,
    messages: collectedMessages,
    messageCount: collectedMessages.length,
    turnCount: selectedTurns.length + pinnedAttachmentEntries.length,
    preludeCount: acceptedPrelude.length
  }
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

export function estimateMessageSize(message) {
  if (!isMessageLike(message)) return 0
  return (
    String(message.role || '').length +
    stringifySize(message.content) +
    stringifySize(message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought) +
    stringifySize(message.tool_calls)
  )
}

export function estimateMessagesSize(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((total, message) => total + estimateMessageSize(message), 0)
}

function splitConversationTurns(messages) {
  const prelude = []
  const turns = []
  let currentTurn = []

  ;(Array.isArray(messages) ? messages : []).forEach((message) => {
    if (!isMessageLike(message)) return

    if (message.role === 'user') {
      if (message.synthetic_tool_vision === true) {
        // 工具视觉消息只并入已有轮次；若异常出现在最前，归入前导而非自开新轮。
        if (currentTurn.length) {
          currentTurn.push(message)
        } else {
          prelude.push(message)
        }
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

// ---------------------------------------------------------------------
// 核心：Codex 式历史选择（单一预算 · 宁丢不压 · 云端摘要）
// ---------------------------------------------------------------------
// 流程：
//   1. 前导消息最多保留 maxPreludeMessages 条（预算内）。
//   2. 从最新轮向旧轮放入完整轮次；预算放不下时：
//      - 最新轮：完整保留（保证最新输入完整）；
//      - 附件轮（historyFocus=attachments 时）：尝试替换已选中最旧的无附件轮；
//      - 其余：宁丢不压，直接丢弃并记录原因。
//   3. 不做任何本地文本截断/摘要；历史压缩统一由云端模型摘要（contextSummary）完成。
// ---------------------------------------------------------------------

function buildEmptyInspection() {
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

function inspectChatContextWindowInternal(apiMessages, options = {}) {
  const opts = {
    ...DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS,
    ...(options && typeof options === 'object' ? options : {})
  }

  const maxChars = normalizeInteger(opts.maxChars, DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxChars)
  const maxMessages = normalizeInteger(opts.maxMessages, DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxMessages)
  const maxTurns = normalizeInteger(opts.maxTurns, DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxTurns)
  const maxPreludeMessages = normalizeInteger(
    opts.maxPreludeMessages,
    DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.maxPreludeMessages
  )
  const keepRecentTurnsFull = normalizeInteger(
    opts.keepRecentTurnsFull,
    DEFAULT_CHAT_CONTEXT_WINDOW_OPTIONS.keepRecentTurnsFull
  )
  const toolPolicy = opts.toolPolicy === 'strip' ? 'strip' : 'full'
  const attachmentPriority = opts.historyFocus === 'attachments'

  const normalizedMessages = Array.isArray(apiMessages) ? apiMessages.filter(isMessageLike) : []
  if (!normalizedMessages.length) return buildEmptyInspection()

  const { prelude, turns } = splitConversationTurns(normalizedMessages)

  // --- 1. 前导消息 ---
  const preludeCandidates = normalizePreludeMessages(prelude, toolPolicy, Number.MAX_SAFE_INTEGER)
  const acceptedPrelude = []
  let preludeChars = 0
  let selectedChars = 0
  let selectedMessageCount = 0
  let selectedTurnCount = 0

  for (const message of preludeCandidates) {
    if (acceptedPrelude.length >= maxPreludeMessages) break
    const size = estimateMessageSize(message)
    if (selectedChars + size > maxChars) break
    acceptedPrelude.push(message)
    preludeChars += size
    selectedChars += size
    selectedMessageCount += 1
  }

  // --- 2. 轮次：从最新到最旧，完整放入；放不下 → 丢 ---
  const selectedTurns = []
  const omittedEntries = []

  const fitsLimits = (extraTurns, extraMessages, extraChars) =>
    selectedTurnCount + extraTurns <= maxTurns &&
    selectedMessageCount + extraMessages <= maxMessages &&
    selectedChars + extraChars <= maxChars

  // selectedTurns 按「最新优先」的顺序存放，最旧的可替换轮在数组末尾。
  const findOldestDisplaceableTurnIndex = () => {
    for (let i = selectedTurns.length - 1; i >= 0; i -= 1) {
      const item = selectedTurns[i]
      if (!item || item.mustKeep) continue
      if (attachmentPriority && item.hasAttachment) continue
      return i
    }
    return -1
  }

  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex]
    const reverseIndex = turns.length - 1 - turnIndex
    // Codex 对齐：仅最新轮宁超不丢（保证当前输入完整），
    // keepRecentTurnsFull 只作为“最近 N 轮优先”的语义标记，不再豁免预算。
    const mustKeep = reverseIndex === 0
    const hasAttachment = turnHasAttachmentPayload(turn)
    const fullMessages = cloneTurnMessages(turn, toolPolicy)
    const fullStats = {
      count: fullMessages.length,
      chars: estimateMessagesSize(fullMessages)
    }

    // 最新轮：完整保留（宁超不丢），保证最新输入与当前回复完整。
    if (mustKeep) {
      selectedTurns.push({
        index: turnIndex,
        messages: fullMessages,
        stats: fullStats,
        selectionMode: 'full',
        selectionVariant: 'full',
        hasAttachment,
        mustKeep
      })
      selectedTurnCount += 1
      selectedMessageCount += fullStats.count
      selectedChars += fullStats.chars
      continue
    }

    if (fitsLimits(1, fullStats.count, fullStats.chars)) {
      selectedTurns.push({
        index: turnIndex,
        messages: fullMessages,
        stats: fullStats,
        selectionMode: 'full',
        selectionVariant: 'full',
        hasAttachment,
        mustKeep
      })
      selectedTurnCount += 1
      selectedMessageCount += fullStats.count
      selectedChars += fullStats.chars
      continue
    }

    // 附件优先：用当前附件轮替换已选中最旧的无附件轮。
    if (hasAttachment && attachmentPriority) {
      const displaceIndex = findOldestDisplaceableTurnIndex()
      if (displaceIndex !== -1) {
        const displaced = selectedTurns[displaceIndex]
        if (
          displaced &&
          displaced.index !== undefined &&
          selectedChars - displaced.stats.chars + fullStats.chars <= maxChars
        ) {
          selectedTurns.splice(displaceIndex, 1)
          selectedMessageCount = Math.max(0, selectedMessageCount - displaced.stats.count + fullStats.count)
          selectedChars = Math.max(0, selectedChars - displaced.stats.chars + fullStats.chars)
          omittedEntries.push({
            kind: 'turn',
            index: displaced.index,
            hasAttachment: displaced.hasAttachment,
            mustKeep: false,
            selectionMode: 'omitted',
            selectionVariant: 'omitted',
            reasons: ['attachment_displacement']
          })
          selectedTurns.push({
            index: turnIndex,
            messages: fullMessages,
            stats: fullStats,
            selectionMode: 'full',
            selectionVariant: 'full',
            hasAttachment,
            mustKeep
          })
          continue
        }
      }
    }

    // 宁丢不压。
    const reasons = []
    if (selectedTurnCount + 1 > maxTurns) reasons.push('turn_limit')
    else if (selectedMessageCount + fullStats.count > maxMessages) reasons.push('message_limit')
    else reasons.push('char_limit')
    omittedEntries.push({
      kind: 'turn',
      index: turnIndex,
      hasAttachment,
      mustKeep,
      selectionMode: 'omitted',
      selectionVariant: 'omitted',
      reasons
    })
  }

  // 按原始顺序输出。
  selectedTurns.sort((left, right) => left.index - right.index)

  return buildInspectionPayload({
    messages: normalizedMessages,
    acceptedPrelude,
    preludeChars,
    pinnedAttachmentEntries: [],
    selectedTurns,
    omittedEntries
  })
}

export function inspectChatContextWindow(apiMessages, options = {}) {
  const payload = inspectChatContextWindowInternal(apiMessages, options)
  return {
    messages: payload.messages,
    inspection: {
      entries: payload.entries,
      omittedEntries: payload.omittedEntries,
      messageCount: payload.messageCount,
      turnCount: payload.turnCount,
      preludeCount: payload.preludeCount
    }
  }
}

export function buildChatContextWindow(apiMessages, options = {}) {
  return inspectChatContextWindowInternal(apiMessages, options).messages
}

export function hasChatContextWindowReduction(result) {
  const inspection = result?.inspection
  if (!inspection || typeof inspection !== 'object') return false
  const omittedEntries = Array.isArray(inspection.omittedEntries) ? inspection.omittedEntries : []
  return omittedEntries.some((entry) => entry?.kind === 'turn')
}

// ---------------------------------------------------------------------
// 统一请求上下文估算（Codex 风格单一口径）
// ---------------------------------------------------------------------
// runner 的压缩触发、压缩后 telemetry 回写、UI 统计与预览全部走这里，
// 保证「实际会发送的内容」是同一份，避免触发阈值与界面显示互相打架。
// 口径：summary prelude（如有） + 经窗口裁剪后的 tail。
export function buildChatContextRequestEstimate({
  apiMessages = [],
  contextSummary = null,
  reservedChars = 0,
  config = null,
  providerKind = 'openai-compatible',
  modelContextTokens = null,
  reportedInputTokens = 0,
  reportedRequestChars = 0
} = {}) {
  const list = Array.isArray(apiMessages) ? apiMessages : []
  const summaryText = String(contextSummary?.summaryText || '').trim()
  const coveredMessageCount = Math.max(0, Math.floor(Number(contextSummary?.coveredMessageCount || 0)))
  const hasSummary = !!summaryText && coveredMessageCount > 0 && coveredMessageCount <= list.length
  const summaryPrelude = hasSummary ? buildContextSummaryPrelude(summaryText) : ''
  const summaryReservedChars = summaryPrelude.length
  const tailMessages = hasSummary ? list.slice(coveredMessageCount) : list
  const baseReservedChars = Math.max(0, Math.floor(Number(reservedChars) || 0))
  const totalReservedChars = baseReservedChars + summaryReservedChars
  const budgetPlan = resolveChatContextWindowBudgetPlan(config, {
    reservedChars: totalReservedChars,
    sourceChars: estimateMessagesSize(tailMessages),
    reportedInputTokens,
    reportedRequestChars,
    modelContextTokens
  })
  const effectiveMessages = buildChatContextWindow(
    tailMessages,
    buildChatContextWindowRuntimeOptions(config, {
      providerKind,
      maxChars: Math.max(1, Math.floor(Number(budgetPlan.historyCharsBudget) || Number.MAX_SAFE_INTEGER))
    })
  )
  const requestChars = estimateMessagesSize(effectiveMessages) + totalReservedChars
  const estimatedTokens = budgetPlan.telemetryAvailable
    ? Math.max(0, Math.ceil(requestChars * budgetPlan.tokensPerChar))
    : 0
  const pressure = budgetPlan.telemetryAvailable && budgetPlan.baseTokens > 0
    ? estimatedTokens / budgetPlan.baseTokens
    : 0
  const triggerTokens = budgetPlan.triggerTokens || Math.floor(budgetPlan.expandedTokens * budgetPlan.triggerRatio)
  const triggered = budgetPlan.telemetryAvailable && triggerTokens > 0 && estimatedTokens >= triggerTokens

  return {
    budgetPlan,
    effectiveMessages,
    tailMessages,
    summaryPrelude,
    summaryReservedChars,
    hasSummary,
    coveredMessageCount,
    requestChars,
    estimatedTokens,
    pressure,
    triggered,
    triggerTokens
  }
}
