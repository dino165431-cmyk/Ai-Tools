function normalizeLowercaseText(value) {
  return String(value || '').trim().toLowerCase()
}

function hasStandaloneR1Token(value) {
  return /(?:^|[^a-z0-9])r1(?:[^a-z0-9]|$)/i.test(String(value || ''))
}

function hasReasoningPayload(message) {
  if (!message || typeof message !== 'object') return false
  const reasoning = message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought
  if (reasoning == null) return false
  if (typeof reasoning === 'string') return reasoning.trim().length > 0
  try {
    return JSON.stringify(reasoning).length > 2
  } catch {
    return String(reasoning).trim().length > 0
  }
}

export function isDeepSeekReasonerModel(model) {
  const modelId = normalizeLowercaseText(model)
  if (!modelId) return false
  if (modelId.includes('deepseek-reasoner')) return true
  if (!modelId.includes('deepseek')) return false
  return modelId.includes('reasoner') || hasStandaloneR1Token(modelId)
}

export function hasAssistantReasoningContent(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((message) => {
    return message?.role === 'assistant' && hasReasoningPayload(message)
  })
}

export function shouldIncludeReasoningContent({
  baseUrl = '',
  model = '',
  forceReasoningContent = false,
  apiMessages = []
} = {}) {
  if (forceReasoningContent) return true

  const base = normalizeLowercaseText(baseUrl)
  const modelId = normalizeLowercaseText(model)
  if (isDeepSeekReasonerModel(modelId)) return true

  if (!base.includes('deepseek')) return false
  if (modelId.includes('reasoner') || hasStandaloneR1Token(modelId)) return true
  return hasAssistantReasoningContent(apiMessages)
}

export function shouldRetryWithReasoningContent(errorText = '') {
  const lower = normalizeLowercaseText(errorText)
  if (!lower || !lower.includes('reasoning_content')) return false
  if (lower.includes('missing')) return true
  if (lower.includes('required')) return true
  if (lower.includes('thinking mode')) return true
  if (lower.includes('passed back to the api')) return true
  return lower.includes('pass') && lower.includes('back') && lower.includes('api')
}

function stringifyLength(value) {
  if (value == null) return 0
  if (typeof value === 'string') return value.length
  try {
    return JSON.stringify(value).length
  } catch {
    return String(value).length
  }
}

export function estimateToolDefinitionsChars(tools) {
  if (!Array.isArray(tools) || !tools.length) return 0
  return stringifyLength(tools)
}

export function calculateReservedRequestChars({ systemContent = '', tools = [] } = {}) {
  return String(systemContent || '').length + estimateToolDefinitionsChars(tools)
}

export function calculateHistoryContextCharBudget({ baseChars = 0, reservedChars = 0 } = {}) {
  const base = Number(baseChars)
  if (!Number.isFinite(base) || base <= 0) return 0

  const floorChars = Math.max(4000, Math.floor(base * 0.35))
  const reserved = Math.max(0, Math.floor(Number(reservedChars) || 0))
  return Math.max(floorChars, base - reserved)
}

function normalizeMessageRole(role) {
  return String(role || '').trim().toLowerCase()
}

function normalizeToolCallIdForRequest(id, compatToolCallIdAsFc = false) {
  const text = String(id || '').trim()
  if (!text) return ''
  if (compatToolCallIdAsFc && text.startsWith('call_')) return `fc_${text.slice('call_'.length)}`
  return text
}

function hasVisibleAssistantPayload(message) {
  if (!message || typeof message !== 'object') return false
  const content = message.content
  if (typeof content === 'string') {
    if (content.trim()) return true
  } else if (Array.isArray(content)) {
    if (content.length) return true
  } else if (content && typeof content === 'object') {
    if (Object.keys(content).length) return true
  }

  const reasoning = message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought
  if (typeof reasoning === 'string') return reasoning.trim().length > 0
  return reasoning != null
}

export function sanitizeRequestToolMessages(messages = [], options = {}) {
  const compatToolCallIdAsFc = options?.compatToolCallIdAsFc === true
  const out = []
  let pendingAssistant = null

  const flushPendingAssistant = () => {
    if (!pendingAssistant) return
    const isComplete =
      pendingAssistant.expectedIds.size > 0 &&
      pendingAssistant.receivedIds.size >= pendingAssistant.expectedIds.size

    if (isComplete) {
      out.push(pendingAssistant.message, ...pendingAssistant.toolMessages)
      pendingAssistant = null
      return
    }

    const stripped = { ...pendingAssistant.message }
    delete stripped.tool_calls
    if (hasVisibleAssistantPayload(stripped)) out.push(stripped)
    pendingAssistant = null
  }

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== 'object') {
      flushPendingAssistant()
      continue
    }

    const role = normalizeMessageRole(message.role)

    if (role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      flushPendingAssistant()

      const aliasToExpected = new Map()
      const expectedIds = new Set()
      const normalizedToolCalls = message.tool_calls
        .map((toolCall) => {
          if (!toolCall || typeof toolCall !== 'object') return null
          const originalId = String(toolCall.id || '').trim()
          if (!originalId) return null

          const expectedId = normalizeToolCallIdForRequest(originalId, compatToolCallIdAsFc)
          const callId = String(toolCall.call_id || '').trim() || (compatToolCallIdAsFc && originalId.startsWith('call_') ? originalId : '')
          const clonedToolCall = { ...toolCall, id: expectedId }
          if (callId) clonedToolCall.call_id = callId

          expectedIds.add(expectedId)
          aliasToExpected.set(originalId, expectedId)
          aliasToExpected.set(expectedId, expectedId)
          if (callId) aliasToExpected.set(callId, expectedId)
          return clonedToolCall
        })
        .filter(Boolean)

      if (!normalizedToolCalls.length) {
        const cloned = { ...message }
        delete cloned.tool_calls
        if (hasVisibleAssistantPayload(cloned)) out.push(cloned)
        continue
      }

      pendingAssistant = {
        message: {
          ...message,
          tool_calls: normalizedToolCalls
        },
        aliasToExpected,
        expectedIds,
        receivedIds: new Set(),
        toolMessages: []
      }
      continue
    }

    if (role === 'tool') {
      if (!pendingAssistant) continue

      const rawToolCallId = String(message.tool_call_id || message.call_id || '').trim()
      if (!rawToolCallId) continue

      const expectedId =
        pendingAssistant.aliasToExpected.get(rawToolCallId) ||
        pendingAssistant.aliasToExpected.get(normalizeToolCallIdForRequest(rawToolCallId, compatToolCallIdAsFc))
      if (!expectedId) continue

      const cloned = { ...message, tool_call_id: expectedId }
      const callId = String(message.call_id || '').trim() || (compatToolCallIdAsFc && rawToolCallId.startsWith('call_') ? rawToolCallId : '')
      if (callId) cloned.call_id = callId

      pendingAssistant.toolMessages.push(cloned)
      pendingAssistant.receivedIds.add(expectedId)
      continue
    }

    flushPendingAssistant()
    out.push(message)
  }

  flushPendingAssistant()
  return out
}
