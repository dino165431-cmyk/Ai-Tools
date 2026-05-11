const globalConfig = require('../utils/global-config')
const contentIndex = require('../utils/content-index')
const { consumeJsonEventStream } = require('../utils/stream-json-events')

const BUILTIN_AGENTS_MCP_SERVER_ID = 'builtin_agents_mcp'
const UTOOLS_AI_PROVIDER_ID = 'builtin_provider_utools_ai'
const UTOOLS_AI_PROVIDER_TYPE = 'utools-ai'
const BUILTIN_AGENTS_TRACE_EVENT = 'builtin-agents-trace'

const AGENT_REASONING_EFFORT_OPTIONS = ['auto', 'low', 'medium', 'high']
const TOOL_APPROVAL_MODES = ['auto', 'manual', 'readonly', 'deny']
const MAX_TRACE_ITEMS = 120
const MAX_EXCERPT_CHARS = 1200
const MAX_TOOL_RESULT_CHARS = 4000
const MAX_MODEL_ROUNDS = 24
const BUILTIN_AGENTS_LIVE_EVENT_THROTTLE_MS = 33
const BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT = 'builtin-agents-tool-approval-request'
const BUILTIN_AGENTS_TOOL_APPROVAL_RESPONSE_EVENT = 'builtin-agents-tool-approval-response'

const pooledClientsByServerId = new Map()
const pendingToolApprovalRequests = new Map()
const pendingBuiltinAgentsLiveByStreamId = new Map()
let builtinAgentsToolApprovalListenerReady = false
let pendingBuiltinAgentsLiveFlushTimer = null

function cleanString(val) {
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim()
  return ''
}

function isPlainObject(val) {
  return !!val && typeof val === 'object' && !Array.isArray(val)
}

function stableStringify(val, spaces = 2) {
  if (val === undefined) return 'undefined'
  try {
    return JSON.stringify(val, null, spaces)
  } catch {
    return String(val)
  }
}

function toText(val) {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return val.map((item) => toText(item)).join('')
  if (typeof val === 'object') {
    if (typeof val.text === 'string') return val.text
    if (typeof val.content === 'string') return val.content
    return stableStringify(val)
  }
  return String(val)
}

function truncateText(val, max = MAX_EXCERPT_CHARS) {
  const text = String(val || '')
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n...(truncated, total ${text.length} chars)`
}

function stringifyToolResultContent(result) {
  if (typeof result === 'string') return result
  const text = stableStringify(result)
  if (typeof text === 'string') return text
  return String(text ?? '')
}

function normalizeOptionalNumber(value, options = {}) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null

  const { min = -Infinity, max = Infinity, integer = false } = options
  if (num < min || num > max) return null
  if (integer && !Number.isInteger(num)) return null
  return num
}

function normalizeReasoningEffort(value) {
  if (value === '' || value === null || value === undefined) return null
  const normalized = cleanString(value).toLowerCase()
  return AGENT_REASONING_EFFORT_OPTIONS.includes(normalized) ? normalized : null
}

function normalizeToolApprovalMode(value) {
  const normalized = cleanString(value).toLowerCase()
  return TOOL_APPROVAL_MODES.includes(normalized) ? normalized : 'auto'
}

function normalizePromptType(value) {
  return cleanString(value).toLowerCase() === 'user' ? 'user' : 'system'
}

function isSystemPromptItem(prompt) {
  return normalizePromptType(prompt?.type) === 'system'
}

function getSystemPromptById(promptsMap, promptId) {
  const id = cleanString(promptId)
  if (!id || !isPlainObject(promptsMap)) return null
  const prompt = promptsMap[id]
  return prompt && isSystemPromptItem(prompt) ? prompt : null
}

function resolveTraceStreamIdFromAgentRunParams(params) {
  if (!isPlainObject(params)) return ''
  return cleanString(params.__trace_stream_id || params.trace_stream_id)
}

function injectTraceStreamIdIntoAgentRunParams(params, traceStreamId) {
  const id = cleanString(traceStreamId)
  if (!id || !isPlainObject(params)) return params

  const existingId = cleanString(params.__trace_stream_id || params.trace_stream_id)
  if (existingId) return params

  return {
    ...params,
    __trace_stream_id: id,
    trace_stream_id: id
  }
}

function resolveToolApprovalModeFromAgentRunParams(params) {
  if (!isPlainObject(params)) return 'auto'
  return normalizeToolApprovalMode(params.__tool_approval_mode || params.tool_approval_mode)
}

function normalizeAgentModelParams(raw) {
  const src = isPlainObject(raw) ? raw : {}
  return {
    temperature: normalizeOptionalNumber(src.temperature, { min: 0, max: 2 }),
    topP: normalizeOptionalNumber(src.topP ?? src.top_p, { min: 0, max: 1 }),
    maxTokens: normalizeOptionalNumber(src.maxTokens ?? src.max_tokens, { min: 1, integer: true }),
    presencePenalty: normalizeOptionalNumber(src.presencePenalty ?? src.presence_penalty, { min: -2, max: 2 }),
    frequencyPenalty: normalizeOptionalNumber(src.frequencyPenalty ?? src.frequency_penalty, { min: -2, max: 2 }),
    seed: normalizeOptionalNumber(src.seed, { integer: true }),
    reasoningEffort: normalizeReasoningEffort(src.reasoningEffort ?? src.reasoning_effort)
  }
}

function buildRequestOverridesFromAgentModelParams(raw, options = {}) {
  const normalized = normalizeAgentModelParams(raw)
  const includeReasoningEffort = options.includeReasoningEffort === true
  const out = {}
  if (normalized.temperature !== null) out.temperature = normalized.temperature
  if (normalized.topP !== null) out.top_p = normalized.topP
  if (normalized.maxTokens !== null) out.max_tokens = normalized.maxTokens
  if (normalized.presencePenalty !== null) out.presence_penalty = normalized.presencePenalty
  if (normalized.frequencyPenalty !== null) out.frequency_penalty = normalized.frequencyPenalty
  if (normalized.seed !== null) out.seed = normalized.seed
  if (includeReasoningEffort && normalized.reasoningEffort) out.reasoning_effort = normalized.reasoningEffort
  return out
}

function normalizeStringList(val) {
  const out = []
  const seen = new Set()
  ;(Array.isArray(val) ? val : []).forEach((item) => {
    const text = cleanString(item)
    if (!text || seen.has(text)) return
    seen.add(text)
    out.push(text)
  })
  return out
}

function unionStrings(...inputs) {
  return normalizeStringList(inputs.flat())
}

function newId(prefix = 'run') {
  return `${prefix}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`
}

function withTimeout(promise, timeoutMs, label) {
  const ms = Number(timeoutMs)
  if (!ms || ms <= 0) return promise

  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label || 'Operation'} timeout (${ms}ms)`)), ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function makeAbortError(message = 'Aborted') {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

function isAbortError(err) {
  return err?.name === 'AbortError'
}

function throwIfAborted(runState, message = 'Aborted') {
  if (runState?.aborted) throw makeAbortError(message)
}

function appendTrace(trace, phase, payload = {}) {
  if (!Array.isArray(trace)) return
  if (trace.length >= MAX_TRACE_ITEMS) {
    const last = trace[trace.length - 1]
    if (!last || last.phase !== 'trace.truncated') {
      const entry = {
        idx: trace.length + 1,
        at: new Date().toISOString(),
        phase: 'trace.truncated',
        title: 'Trace limit reached'
      }
      trace.push(entry)
      if (trace.__stream_id) {
        dispatchBuiltinAgentsTraceEvent({
          streamId: trace.__stream_id,
          entry
        })
      }
    }
    return
  }

  const entry = {
    idx: trace.length + 1,
    at: new Date().toISOString(),
    phase,
    ...payload
  }
  trace.push(entry)
  if (trace.__stream_id) {
    dispatchBuiltinAgentsTraceEvent({
      streamId: trace.__stream_id,
      entry
    })
  }
}

function normalizeBaseUrl(url) {
  const raw = cleanString(url)
  if (!raw) return ''

  const noQuery = raw.split('#')[0].split('?')[0]
  let base = noQuery.replace(/\/+$/, '')

  base = base
    .replace(/\/v1\/chat\/completions$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/completions$/i, '/v1')
    .replace(/\/completions$/i, '')
    .replace(/\/v1\/models$/i, '/v1')
    .replace(/\/models$/i, '')

  return base.replace(/\/+$/, '')
}

async function requestChatCompletionsResponse({ baseUrl, apiKey, body, signal }) {
  const base = normalizeBaseUrl(baseUrl)
  const candidates = [`${base}/chat/completions`]
  if (!/\/v1$/i.test(base)) candidates.push(`${base}/v1/chat/completions`)

  let response = null
  let usedUrl = candidates[0]
  let lastNetworkError = null

  for (const url of candidates) {
    usedUrl = url
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal
      })
      if (response.status === 404 && url !== candidates[candidates.length - 1]) continue
      break
    } catch (err) {
      lastNetworkError = err
      if (url !== candidates[candidates.length - 1]) continue
      throw err
    }
  }

  if (!response) throw lastNetworkError || new Error('Request failed: no response')

  if (!response.ok) {
    const rawText = await response.text()
    const parsed = safeJsonParse(rawText)
    const detail = parsed.ok
      ? parsed.value?.error?.message || stableStringify(parsed.value)
      : rawText
    throw new Error(`Request failed (HTTP ${response.status}): ${detail || response.statusText}\nURL: ${usedUrl}`)
  }

  return { response, usedUrl }
}

async function postChatCompletions({ baseUrl, apiKey, body, signal }) {
  const { response } = await requestChatCompletionsResponse({ baseUrl, apiKey, body, signal })
  return response.json()
}

async function streamChatCompletions({ baseUrl, apiKey, body, signal, runState, onDelta }) {
  const { response: resp, usedUrl } = await requestChatCompletionsResponse({ baseUrl, apiKey, body, signal })

  let content = ''
  let reasoning = ''
  let finishReason = null
  const toolCallsByIndex = new Map()

  const throwIfStreamingAborted = () => {
    throwIfAborted(runState)
    if (signal?.aborted) throw makeAbortError()
  }

  const finalize = () => ({
    content,
    reasoning,
    toolCalls: Array.from(toolCallsByIndex.values()),
    finishReason: finishReason || 'stop'
  })

  const applyJson = (json) => {
    throwIfStreamingAborted()
    if (!json || typeof json !== 'object') return

    if (json?.error) {
      const errText = json?.error?.message || stableStringify(json.error)
      throw new Error(`Request failed: ${errText}\nURL: ${usedUrl}`)
    }

    const choice = json?.choices?.[0] || {}
    const delta = choice.delta || {}
    const msg = choice.message || {}

    if (choice.finish_reason) finishReason = choice.finish_reason

    const deltaContent = delta.content ?? delta.text
    if (deltaContent != null) {
      const deltaText = toText(deltaContent)
      if (deltaText) {
        content += deltaText
        onDelta?.({ type: 'content', delta: deltaText, content })
      }
    } else if (msg?.content != null) {
      const next = toText(msg.content)
      const deltaText = content && next.startsWith(content) ? next.slice(content.length) : next
      content = next
      if (deltaText) onDelta?.({ type: 'content', delta: deltaText, content })
    } else if (choice?.text != null) {
      const deltaText = toText(choice.text)
      if (deltaText) {
        content += deltaText
        onDelta?.({ type: 'content', delta: deltaText, content })
      }
    } else if (json?.content != null || json?.text != null) {
      const deltaText = toText(json.content ?? json.text)
      if (deltaText) {
        content += deltaText
        onDelta?.({ type: 'content', delta: deltaText, content })
      }
    }

    const deltaReasoning = delta.reasoning ?? delta.reasoning_content ?? delta.thinking ?? delta.thought
    const msgReasoning = msg.reasoning ?? msg.reasoning_content ?? msg.thinking ?? msg.thought
    if (deltaReasoning != null) {
      const deltaText = toText(deltaReasoning)
      if (deltaText) {
        reasoning += deltaText
        onDelta?.({ type: 'reasoning', delta: deltaText, reasoning })
      }
    } else if (msgReasoning != null) {
      const next = toText(msgReasoning)
      const deltaText = reasoning && next.startsWith(reasoning) ? next.slice(reasoning.length) : next
      reasoning = next
      if (deltaText) onDelta?.({ type: 'reasoning', delta: deltaText, reasoning })
    }

    const deltaToolCalls = delta.tool_calls
    if (Array.isArray(deltaToolCalls)) {
      deltaToolCalls.forEach((tc) => {
        const index = tc.index ?? 0
        const prev = toolCallsByIndex.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } }
        if (tc.id) prev.id = tc.id
        if (tc.type) prev.type = tc.type
        if (tc.function?.name) prev.function.name = tc.function.name
        if (tc.function?.arguments) prev.function.arguments += tc.function.arguments
        toolCallsByIndex.set(index, prev)
      })
      onDelta?.({ type: 'tool_calls', toolCalls: Array.from(toolCallsByIndex.values()) })
    } else if (Array.isArray(msg?.tool_calls)) {
      msg.tool_calls.forEach((tc, index) => {
        toolCallsByIndex.set(tc.index ?? index, {
          id: tc.id || '',
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || ''
          }
        })
      })
      if (toolCallsByIndex.size) onDelta?.({ type: 'tool_calls', toolCalls: Array.from(toolCallsByIndex.values()) })
    }
  }

  await consumeJsonEventStream({
    response: resp,
    signal,
    isAborted: () => !!runState?.aborted,
    onJson: applyJson
  })
  return finalize()
}

function mergeStreamingText(previous, incoming) {
  const next = toText(incoming)
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

function buildRequestMessages({ systemPrompt, apiMessages, compatToolCallIdAsFc = false }) {
  const messages = []
  const systemText = cleanString(systemPrompt)
  if (systemText) messages.push({ role: 'system', content: systemText })

  ;(Array.isArray(apiMessages) ? apiMessages : []).forEach((msg) => {
    if (!msg || typeof msg !== 'object') return
    const role = cleanString(msg.role)
    if (!role) return

    const cloned = JSON.parse(JSON.stringify(msg))
    if (compatToolCallIdAsFc && cloned.role === 'assistant' && Array.isArray(cloned.tool_calls)) {
      cloned.tool_calls = cloned.tool_calls.map((toolCall) => {
        const id = cleanString(toolCall?.id)
        if (!id.startsWith('call_')) return toolCall
        const callId = cleanString(toolCall?.call_id) || id
        return { ...toolCall, id: `fc_${id.slice('call_'.length)}`, call_id: callId }
      })
    }
    messages.push(cloned)
  })

  return messages
}

function normalizeToolCalls(msg) {
  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
  if (!toolCalls.length) return []

  return toolCalls
    .map((toolCall) => {
      const fnName = cleanString(toolCall?.function?.name)
      const fnArgs =
        typeof toolCall?.function?.arguments === 'string'
          ? toolCall.function.arguments
          : stableStringify(toolCall?.function?.arguments || {})
      if (!fnName) return null
      return {
        id: cleanString(toolCall?.id) || `call_${newId('tool')}`,
        type: toolCall?.type || 'function',
        function: {
          name: fnName,
          arguments: fnArgs || '{}'
        }
      }
    })
    .filter(Boolean)
}

function getHostGlobal() {
  if (typeof window !== 'undefined') return window
  if (typeof globalThis !== 'undefined') return globalThis
  return null
}

function dispatchBuiltinAgentsTraceEvent(detail = {}) {
  const host = getHostGlobal()
  if (!host?.dispatchEvent || typeof host.CustomEvent !== 'function') return
  try {
    host.dispatchEvent(new host.CustomEvent(BUILTIN_AGENTS_TRACE_EVENT, { detail }))
  } catch {
    // ignore
  }
}

function flushPendingBuiltinAgentsLiveUpdates(streamId = '') {
  const targetStreamId = cleanString(streamId)
  const flushIds = targetStreamId ? [targetStreamId] : Array.from(pendingBuiltinAgentsLiveByStreamId.keys())
  flushIds.forEach((id) => {
    const live = pendingBuiltinAgentsLiveByStreamId.get(id)
    if (!live) return
    pendingBuiltinAgentsLiveByStreamId.delete(id)
    dispatchBuiltinAgentsTraceEvent({ streamId: id, live })
  })
}

function schedulePendingBuiltinAgentsLiveFlush() {
  if (pendingBuiltinAgentsLiveFlushTimer) return
  pendingBuiltinAgentsLiveFlushTimer = setTimeout(() => {
    pendingBuiltinAgentsLiveFlushTimer = null
    flushPendingBuiltinAgentsLiveUpdates()
  }, BUILTIN_AGENTS_LIVE_EVENT_THROTTLE_MS)
}

function dispatchBuiltinAgentsLiveUpdate(streamId, payload = {}) {
  const id = cleanString(streamId)
  if (!id) return
  const prev = pendingBuiltinAgentsLiveByStreamId.get(id) || {}
  const live = { ...prev }
  if (Object.prototype.hasOwnProperty.call(payload, 'content')) live.content = toText(payload.content)
  if (Object.prototype.hasOwnProperty.call(payload, 'reasoning')) live.reasoning = toText(payload.reasoning)
  if (Object.prototype.hasOwnProperty.call(payload, 'round')) live.round = Number(payload.round) || 0
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) live.status = cleanString(payload.status)
  if (payload.reset === true) live.reset = true
  pendingBuiltinAgentsLiveByStreamId.set(id, live)
  schedulePendingBuiltinAgentsLiveFlush()
}

function attachTraceStreamId(trace, streamId) {
  const id = cleanString(streamId)
  if (!Array.isArray(trace) || !id) return ''
  try {
    Object.defineProperty(trace, '__stream_id', {
      value: id,
      configurable: true,
      enumerable: false,
      writable: true
    })
  } catch {
    trace.__stream_id = id
  }
  return id
}

function dispatchBuiltinAgentsTraceDone(streamId) {
  const id = cleanString(streamId)
  if (!id) return
  flushPendingBuiltinAgentsLiveUpdates(id)
  dispatchBuiltinAgentsTraceEvent({ streamId: id, done: true })
}

function handleBuiltinAgentsToolApprovalResponse(event) {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  const requestId = cleanString(detail.requestId)
  if (!requestId) return
  const finish = pendingToolApprovalRequests.get(requestId)
  if (!finish) return
  pendingToolApprovalRequests.delete(requestId)
  if (detail.approved === true) {
    finish(true)
    return
  }
  if (detail.approved === false) {
    finish(false)
    return
  }
  finish(null)
}

function ensureBuiltinAgentsToolApprovalListener() {
  if (builtinAgentsToolApprovalListenerReady) return true
  const host = getHostGlobal()
  if (!host?.addEventListener) return false
  try {
    host.addEventListener(BUILTIN_AGENTS_TOOL_APPROVAL_RESPONSE_EVENT, handleBuiltinAgentsToolApprovalResponse)
    builtinAgentsToolApprovalListenerReady = true
    return true
  } catch {
    return false
  }
}

function dispatchBuiltinAgentsToolApprovalRequest(detail = {}) {
  const host = getHostGlobal()
  if (!host?.dispatchEvent || typeof host.CustomEvent !== 'function') return false
  try {
    host.dispatchEvent(new host.CustomEvent(BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT, { detail }))
    return true
  } catch {
    return false
  }
}

function getUtoolsApi() {
  const host = getHostGlobal()
  if (host?.utools) return host.utools
  if (typeof globalThis !== 'undefined' && globalThis?.utools) return globalThis.utools
  return null
}

function canUseUtoolsAi() {
  return typeof getUtoolsApi()?.ai === 'function'
}

function isUtoolsBuiltinProvider(providerOrId) {
  if (!providerOrId) return false
  if (typeof providerOrId === 'string') return cleanString(providerOrId) === UTOOLS_AI_PROVIDER_ID

  return (
    cleanString(providerOrId?._id) === UTOOLS_AI_PROVIDER_ID ||
    cleanString(providerOrId?.providerType) === UTOOLS_AI_PROVIDER_TYPE
  )
}

async function listUtoolsAiModelIds() {
  const api = getUtoolsApi()
  if (typeof api?.allAiModels !== 'function') return []
  const list = await api.allAiModels()
  return normalizeStringList((Array.isArray(list) ? list : []).map((item) => item?.id))
}

function coercePlainTextContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textParts = []
    let imageCount = 0

    content.forEach((part) => {
      if (!part || typeof part !== 'object') return
      if (part.type === 'text') {
        const text = cleanString(part.text)
        if (text) textParts.push(text)
        return
      }
      if (part.type === 'image_url') imageCount += 1
    })

    if (imageCount > 0) textParts.push(`(contains ${imageCount} images; uTools AI path uses plain-text history only)`)
    return textParts.join('\n\n').trim()
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text
    if (typeof content.content === 'string') return content.content
    return stableStringify(content)
  }
  return String(content)
}

function extractReasoningText(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const reasoning = payload.reasoning_content ?? payload.reasoning ?? payload.thinking ?? payload.thought
  if (reasoning == null) return ''
  if (typeof reasoning === 'string') return reasoning
  if (typeof reasoning === 'number' || typeof reasoning === 'boolean') return String(reasoning).trim()
  if (Array.isArray(reasoning) || typeof reasoning === 'object') return stableStringify(reasoning)
  return String(reasoning).trim()
}

function buildUtoolsAiMessages({ systemContent, apiMessages }) {
  const messages = []
  const systemText = cleanString(systemContent)
  if (systemText) messages.push({ role: 'system', content: systemText })

  ;(Array.isArray(apiMessages) ? apiMessages : []).forEach((message) => {
    if (!message || typeof message !== 'object') return
    const role = cleanString(message.role)
    if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool' && role !== 'tool_call') return
    const content = coercePlainTextContent(message.content)
    const next = { role, content }
    if (role === 'assistant') {
      const hasReasoningField = ['reasoning_content', 'reasoning', 'thinking', 'thought'].some((key) =>
        Object.prototype.hasOwnProperty.call(message, key)
      )
      if (hasReasoningField) {
        next.reasoning_content = cleanString(
          message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought
        )
      }
      if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
        next.tool_calls = message.tool_calls
          .map((toolCall, index) => {
            if (!toolCall || typeof toolCall !== 'object') return null
            const fn = toolCall.function && typeof toolCall.function === 'object' ? toolCall.function : {}
            const name = cleanString(fn.name)
            if (!name) return null
            return {
              id: cleanString(toolCall.id) || `call_${index}`,
              type: cleanString(toolCall.type) || 'function',
              function: {
                name,
                arguments: typeof fn.arguments === 'string' ? fn.arguments : stableStringify(fn.arguments || {})
              }
            }
          })
          .filter(Boolean)
      }
    }
    if (role === 'tool' || role === 'tool_call') {
      const callId = cleanString(message.tool_call_id || message.call_id || '')
      if (callId) next.tool_call_id = callId
      const toolName = cleanString(message.name || message.toolName || '')
      if (toolName) next.name = toolName
    }
    messages.push(next)
  })

  return messages
}

function shouldRetryUtoolsToolContinuationAsPlainText(errorText = '') {
  const lower = cleanString(errorText).toLowerCase()
  if (!lower) return false
  if (lower.includes('reasoning_content') && lower.includes('thinking mode')) return true
  if (lower.includes('reasoning_content') && lower.includes('passed back to the api')) return true
  return false
}

function buildUtoolsToolFallbackPrompt(records = []) {
  const blocks = (Array.isArray(records) ? records : [])
    .map((record, index) => {
      const serverName = cleanString(record?.serverName)
      const toolName = cleanString(record?.toolName || record?.name)
      const argsText = truncateText(cleanString(record?.argsText || '{}'), 1200)
      const content = truncateText(cleanString(record?.content || ''), MAX_TOOL_RESULT_CHARS)
      return [
        `### Tool Result ${index + 1}`,
        [serverName, toolName].filter(Boolean).length ? `Tool: ${[serverName, toolName].filter(Boolean).join(' / ')}` : '',
        `Args: ${argsText || '{}'}`,
        'Result:',
        content || '(empty result)'
      ].filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')

  return [
    'System note: tool calls were just completed, but the current uTools AI tool continuation endpoint is temporarily unavailable.',
    'Please answer the user\'s original question directly using the tool results below. If the information is insufficient, say what is missing.',
    blocks
  ].filter(Boolean).join('\n\n')
}

function registerUtoolsAiToolFunctions({ tools, invokeTool }) {
  const target = getHostGlobal()
  if (!target || typeof invokeTool !== 'function') return () => {}

  const restorers = []
  ;(Array.isArray(tools) ? tools : []).forEach((tool) => {
    const name = cleanString(tool?.function?.name)
    if (!name) return
    const hadOwn = Object.prototype.hasOwnProperty.call(target, name)
    const previous = target[name]
    target[name] = async (args = {}) => invokeTool(name, args)
    restorers.push(() => {
      if (!hadOwn) {
        try {
          delete target[name]
        } catch {
          target[name] = undefined
        }
        return
      }
      target[name] = previous
    })
  })

  return () => {
    restorers.reverse().forEach((restore) => {
      try {
        restore()
      } catch {
        // ignore
      }
    })
  }
}

function makeToolFunctionName(serverId, toolName) {
  const raw = `mcp__${serverId}__${toolName}`
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (safe.length <= 64) return safe
  let hash = 0
  for (let i = 0; i < safe.length; i += 1) hash = (hash * 31 + safe.charCodeAt(i)) >>> 0
  return `${safe.slice(0, 55)}_${hash.toString(16).slice(0, 8)}`
}

function cloneJson(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
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
        return isPlainObject(argsObj) ? argsObj : {}
      }
    }
  }

  if (isObjectLikeToolInputSchema(inputSchemaRaw)) {
    return {
      parameters: cloneJson(inputSchemaRaw, fallback) || fallback,
      wrapped: false,
      unwrapArgs(argsObj) {
        return isPlainObject(argsObj) ? argsObj : {}
      }
    }
  }

  return {
    parameters: {
      type: 'object',
      properties: {
        input: cloneJson(inputSchemaRaw, null)
      },
      required: ['input'],
      additionalProperties: false
    },
    wrapped: true,
    unwrapArgs(argsObj) {
      if (!isPlainObject(argsObj)) return undefined
      return argsObj.input
    }
  }
}

function buildProviderToolDescription(server, tool, definition) {
  const base = tool?.description
    ? `[${server.name || server._id}] ${tool.description}`
    : `[${server.name || server._id}] ${tool?.name || ''}`
  if (!definition?.wrapped) return base
  return `${base} (original inputSchema is not an object; call with {"input": ...})`
}

function getSkillDescription(skill) {
  return cleanString(skill?.description || skill?.cache?.summary || skill?.summary || '')
}

function isDirectorySkill(skill) {
  return cleanString(skill?.sourceType) === 'directory' && !!cleanString(skill?.sourcePath)
}

function getServerConfigFingerprint(serverConfig) {
  return stableStringify({
    transportType: serverConfig?.transportType,
    command: serverConfig?.command,
    args: Array.isArray(serverConfig?.args) ? serverConfig.args : [],
    env: isPlainObject(serverConfig?.env) ? serverConfig.env : {},
    cwd: serverConfig?.cwd,
    url: serverConfig?.url,
    headers: isPlainObject(serverConfig?.headers) ? serverConfig.headers : {},
    method: serverConfig?.method,
    stream: serverConfig?.stream,
    pingOnConnect: serverConfig?.pingOnConnect,
    maxTotalTimeout: serverConfig?.maxTotalTimeout,
    timeout: serverConfig?.timeout
  })
}

function createNestedMcpClient(serverConfig) {
  const createMCPClient = require('../utils/mcp-client')
  return createMCPClient(serverConfig)
}

function getOrCreateNestedMcpClient(serverConfig) {
  const keepAlive = !!serverConfig?.keepAlive
  const serverId = cleanString(serverConfig?._id)
  const fingerprint = getServerConfigFingerprint(serverConfig)

  if (keepAlive && serverId) {
    const existing = pooledClientsByServerId.get(serverId)
    if (existing?.client && existing.fingerprint === fingerprint) return { client: existing.client, pooled: true }
    if (existing?.client) {
      try {
        existing.client.close?.()
      } catch {
        // ignore
      }
      pooledClientsByServerId.delete(serverId)
    }

    const client = createNestedMcpClient(serverConfig)
    if (client) pooledClientsByServerId.set(serverId, { client, fingerprint })
    return { client, pooled: !!client }
  }

  return { client: createNestedMcpClient(serverConfig), pooled: false }
}

function releaseNestedMcpClient(serverConfig, client) {
  if (!client) return
  if (serverConfig?.keepAlive && cleanString(serverConfig?._id)) return
  try {
    client.close?.()
  } catch {
    // ignore
  }
}

function closePooledNestedMcpClient(serverId) {
  const id = cleanString(serverId)
  if (!id) return
  const existing = pooledClientsByServerId.get(id)
  if (!existing?.client) return
  try {
    existing.client.close?.()
  } catch {
    // ignore
  } finally {
    pooledClientsByServerId.delete(id)
  }
}

function closeAllPooledNestedMcpClients() {
  for (const serverId of Array.from(pooledClientsByServerId.keys())) {
    closePooledNestedMcpClient(serverId)
  }
}

function closeNestedClientSafely(server, client, pooled = false) {
  try {
    if (pooled && server?._id) closePooledNestedMcpClient(server._id)
    else client?.close?.()
  } catch {
    // ignore
  }
}

function buildAgentBrief(agent, config) {
  const provider = agent?.provider ? config?.providers?.[agent.provider] : null
  const prompt = getSystemPromptById(config?.prompts, agent?.prompt)
  const skillObjects = normalizeStringList(agent?.skills).map((id) => config?.skills?.[id]).filter(Boolean)
  const skillNames = skillObjects.map((item) => cleanString(item?.name || item?._id) || cleanString(item?._id))
  const effectiveMcpIds = normalizeStringList([
    ...normalizeStringList(agent?.mcp),
    ...skillObjects.flatMap((item) => normalizeStringList(item?.mcp))
  ])
  const mcpNames = effectiveMcpIds.map((id) => config?.mcpServers?.[id]?.name || id)
  return {
    id: cleanString(agent?._id),
    name: cleanString(agent?.name) || cleanString(agent?._id),
    provider: cleanString(provider?.name || agent?.provider),
    model: cleanString(agent?.model),
    prompt: cleanString(prompt?.name || prompt?._id),
    skills: skillNames,
    mcp: mcpNames,
    builtin: !!agent?.builtin
  }
}

function buildAgentListItemFromSearchEntry(config, entry) {
  const agentId = cleanString(entry?.agentId || entry?.path)
  const agent = agentId ? config?.agents?.[agentId] : null
  const base = buildAgentBrief(agent, config)
  return {
    ...base,
    title: cleanString(entry?.title || base.name || base.id),
    preview: cleanString(entry?.preview || ''),
    provider_id: cleanString(entry?.providerId || agent?.provider),
    prompt_id: cleanString(entry?.promptId || agent?.prompt),
    skill_ids: normalizeStringList(entry?.skillIds || agent?.skills),
    mcp_ids: normalizeStringList(entry?.mcpIds || agent?.mcp)
  }
}

async function resolveAgentTarget(config, params) {
  const agentId = cleanString(params?.agent_id ?? params?.id ?? params?.agentId)
  const agentName = cleanString(params?.agent_name ?? params?.name ?? params?.agentName)
  const list = Object.values(isPlainObject(config?.agents) ? config.agents : {}).filter(Boolean)

  if (agentId) {
    const byId = list.find((item) => cleanString(item?._id) === agentId)
    if (byId) return byId
  }

  if (!agentName) return null
  const exact = list.find((item) => cleanString(item?.name) === agentName)
  if (exact) return exact

  const lower = agentName.toLowerCase()
  const exactCaseFold = list.find((item) => cleanString(item?.name).toLowerCase() === lower)
  if (exactCaseFold) return exactCaseFold

  const includeMatch = list.find((item) => cleanString(item?.name).toLowerCase().includes(lower))
  if (includeMatch) return includeMatch

  try {
    await contentIndex.ensureIndex('agent')
    const result = await contentIndex.searchIndex('agent', {
      query: agentName,
      limit: 5
    })
    const targetId = cleanString(result?.items?.[0]?.agentId || result?.items?.[0]?.path)
    return targetId ? list.find((item) => cleanString(item?._id) === targetId) || null : null
  } catch {
    return null
  }
}

async function listAgentItems(config, query = '') {
  const normalizedQuery = cleanString(query)
  const list = Object.values(isPlainObject(config?.agents) ? config.agents : {})
    .filter(Boolean)
    .map((agent) => buildAgentBrief(agent, config))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (!normalizedQuery) {
    return {
      query: '',
      searchMode: 'keyword',
      semanticUsed: false,
      returned: list.length,
      total: list.length,
      hasMore: false,
      items: list
    }
  }

  await contentIndex.ensureIndex('agent')
  const result = await contentIndex.searchIndex('agent', {
    query: normalizedQuery,
    limit: 200
  })
  return {
    ...result,
    items: (Array.isArray(result?.items) ? result.items : []).map((entry) => buildAgentListItemFromSearchEntry(config, entry))
  }
}

function buildSkillsPromptText(skillObjects, config, trace) {
  const blocks = []
  const mcpMap = isPlainObject(config?.mcpServers) ? config.mcpServers : {}

  ;(Array.isArray(skillObjects) ? skillObjects : []).forEach((skill) => {
    if (!skill || !skill._id) return
    const parts = [`## Skill: ${skill.name || skill._id} (id: \`${skill._id}\`)`]
    const desc = getSkillDescription(skill)
    if (desc) parts.push(`Description: ${desc}`)

    const skillMcpIds = normalizeStringList(skill?.mcp)
    if (skillMcpIds.length) {
      const mcpNames = skillMcpIds.map((id) => cleanString(mcpMap[id]?.name) || id)
      parts.push(`MCP: ${mcpNames.map((item) => `\`${item}\``).join(', ')}`)
    }

    let content = ''
    if (isDirectorySkill(skill)) {
      try {
        const result = globalConfig.readSkillFile(skill._id, skill.entryFile || 'SKILL.md')
        content = cleanString(result?.content)
      } catch (err) {
        appendTrace(trace, 'skill.load_failed', {
          title: `Failed to load skill content: ${skill.name || skill._id}`,
          skill_id: skill._id,
          error: err?.message || String(err)
        })
      }
    } else {
      content = cleanString(skill?.content)
    }

    if (content) parts.push(content)
    blocks.push(parts.join('\n'))
  })

  return blocks.join('\n\n').trim()
}

async function resolveExecutionProfile({ config, agent, trace }) {
  const providers = isPlainObject(config?.providers) ? config.providers : {}
  const prompts = isPlainObject(config?.prompts) ? config.prompts : {}
  const skills = isPlainObject(config?.skills) ? config.skills : {}
  const mcpServers = isPlainObject(config?.mcpServers) ? config.mcpServers : {}
  const chatConfig = isPlainObject(config?.chatConfig) ? config.chatConfig : {}

  const providerId = cleanString(
    agent?.provider ||
    chatConfig.defaultProviderId ||
    Object.values(providers).find((item) => isUtoolsBuiltinProvider(item))?._id ||
    Object.values(providers)[0]?._id ||
    ''
  )
  if (!providerId) throw new Error('Agent has no provider configured')

  const provider = providers[providerId]
  if (!provider) throw new Error(`Provider not found: ${providerId}`)

  let providerModels = normalizeStringList(provider?.selectModels)
  if (isUtoolsBuiltinProvider(provider) && !providerModels.length) {
    try {
      providerModels = await listUtoolsAiModelIds()
    } catch (err) {
      appendTrace(trace, 'provider.models_failed', {
        title: 'Failed to query uTools AI models',
        provider_id: providerId,
        error: err?.message || String(err)
      })
    }
  }

  const model = cleanString(agent?.model || chatConfig.defaultModel || providerModels[0] || '')
  if (!model) throw new Error('Model is not configured on Agent or defaults')

  const prompt = getSystemPromptById(prompts, agent?.prompt)
  const basePromptText = prompt ? cleanString(prompt.content) : cleanString(chatConfig.defaultSystemPrompt)
  const skillIds = unionStrings(agent?.skills)
  const skillObjects = skillIds.map((id) => skills[id]).filter(Boolean)
  const manualMcpIds = unionStrings(agent?.mcp)
  const derivedMcpIds = unionStrings(...skillObjects.map((item) => item?.mcp))
  const activeMcpIds = unionStrings(manualMcpIds, derivedMcpIds).filter((id) => id !== BUILTIN_AGENTS_MCP_SERVER_ID)
  const activeMcpServers = activeMcpIds
    .map((id) => mcpServers[id])
    .filter((server) => server && server._id && !server.disabled && cleanString(server.transportType) !== 'builtinAgents')

  if (activeMcpIds.length !== activeMcpServers.length) {
    appendTrace(trace, 'mcp.filtered', {
      title: 'Some MCP servers were skipped',
      requested_ids: activeMcpIds,
      active_ids: activeMcpServers.map((item) => item._id)
    })
  }

  const skillPrompt = buildSkillsPromptText(skillObjects, config, trace)
  const systemPrompt = [basePromptText, skillPrompt].filter(Boolean).join('\n\n').trim()
  const modelParams = normalizeAgentModelParams(agent?.modelParams)

  return {
    agent,
    provider,
    providerId,
    model,
    prompt,
    systemPrompt,
    skillIds,
    skillObjects,
    activeMcpIds,
    activeMcpServers,
    modelParams
  }
}

async function listMcpToolsForServer(server, trace, runState) {
  throwIfAborted(runState)
  let client = null
  let pooled = false
  let unregister = null
  try {
    ;({ client, pooled } = getOrCreateNestedMcpClient(server))
    if (!client?.listTools) throw new Error('MCP client not available')
    unregister = runState.registerClient(server, client, pooled)
    const timeoutMs = Number(server?.timeout) || 15000
    const list = await withTimeout(
      client.listTools(),
      timeoutMs,
      `List MCP tools: ${server?.name || server?._id || 'unknown'}`
    )
    unregister()
    unregister = null
    releaseNestedMcpClient(server, client)
    client = null
    return Array.isArray(list) ? list : []
  } catch (err) {
    try {
      unregister?.()
    } catch {
      // ignore
    }
    closeNestedClientSafely(server, client, pooled)
    appendTrace(trace, 'mcp.list_failed', {
      title: `Failed to list MCP tools: ${server?.name || server?._id}`,
      server_id: server?._id,
      error: err?.message || String(err)
    })
    return []
  }
}

function filterAllowedMcpTools(server, list) {
  const allow = normalizeStringList(server?.allowTools)
  if (!allow.length) return Array.isArray(list) ? list : []
  const enabledNames = new Set(allow)
  return (Array.isArray(list) ? list : []).filter((tool) => enabledNames.has(cleanString(tool?.name)))
}

function isReadOnlyToolName(toolName) {
  const name = cleanString(toolName).toLowerCase()
  if (!name) return false
  return /^(get|list|read|search|find|query|inspect|describe|discover|fetch|lookup|preview|stat|status)/.test(name)
}

function shouldAllowToolCallByApprovalMode(runState, mapping) {
  const mode = normalizeToolApprovalMode(runState?.toolApprovalMode)
  if (mode === 'auto') return { allowed: true, mode }
  if (mode === 'manual') return { allowed: true, mode, requiresPrompt: true }
  if (mode === 'deny') {
    return {
      allowed: false,
      mode,
      reason: 'Sub-agent tool use is disabled because the parent chat did not enable automatic tool approval.'
    }
  }
  if (isReadOnlyToolName(mapping?.toolName)) return { allowed: true, mode }
  return {
    allowed: false,
    mode,
    reason: 'Sub-agent write/high-risk tools are blocked while the parent chat has automatic tool approval turned off.'
  }
}

function findLatestReasoningExcerpt(trace) {
  const list = Array.isArray(trace) ? trace : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i]
    const reasoning = cleanString(item?.reasoning_text || item?.reasoning_excerpt || '')
    if (reasoning) return reasoning
  }
  return ''
}

async function requestBuiltinAgentsToolApproval({ mapping, argsText, trace, runState }) {
  const requestId = newId('tool_approval')
  const serverName = cleanString(mapping?.serverName || mapping?.serverId || 'unknown')
  const toolName = cleanString(mapping?.toolName || 'unknown')
  const reasoningText = findLatestReasoningExcerpt(trace)

  appendTrace(trace, 'tool.approval_required', {
    title: `Awaiting approval: ${serverName} / ${toolName}`,
    server_id: mapping?.serverId,
    server_name: serverName,
    tool_name: toolName,
    agent_name: cleanString(runState?.agentName),
    args_excerpt: truncateText(argsText, MAX_TOOL_RESULT_CHARS),
    args_text: truncateText(argsText, MAX_TOOL_RESULT_CHARS),
    reasoning_excerpt: reasoningText ? truncateText(reasoningText, MAX_EXCERPT_CHARS) : '',
    reasoning_text: reasoningText ? truncateText(reasoningText, MAX_TOOL_RESULT_CHARS) : ''
  })

  if (!ensureBuiltinAgentsToolApprovalListener()) return false

  return await new Promise((resolve) => {
    let settled = false
    let unregisterAbort = null
    const finish = (value) => {
      if (settled) return
      settled = true
      pendingToolApprovalRequests.delete(requestId)
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      resolve(value)
    }

    pendingToolApprovalRequests.set(requestId, finish)
    unregisterAbort = runState?.onAbort?.(() => finish(null)) || null

    const ok = dispatchBuiltinAgentsToolApprovalRequest({
      requestId,
      streamId: cleanString(runState?.traceStreamId),
      agentName: cleanString(runState?.agentName),
      serverId: cleanString(mapping?.serverId),
      serverName,
      toolName,
      argsText,
      reasoningText
    })

    if (!ok) finish(false)
  })
}

async function buildMcpToolsBundle(servers, trace, runState) {
  const tools = []
  const map = new Map()

  for (const server of Array.isArray(servers) ? servers : []) {
    throwIfAborted(runState)
    const listed = await listMcpToolsForServer(server, trace, runState)
    const allowed = filterAllowedMcpTools(server, listed)
    appendTrace(trace, 'mcp.tools_ready', {
      title: `MCP tools ready: ${server?.name || server?._id}`,
      server_id: server?._id,
      tool_count: allowed.length
    })

    for (const tool of allowed) {
      const toolName = cleanString(tool?.name)
      if (!toolName) continue
      const definition = buildProviderToolDefinition(tool?.inputSchema)
      const functionName = makeToolFunctionName(server._id, toolName)
      map.set(functionName, {
        server,
        serverId: server._id,
        serverName: server.name || server._id,
        toolName,
        requiresWrappedInput: !!definition.wrapped,
        unwrapArgs: definition.unwrapArgs
      })
      tools.push({
        type: 'function',
        function: {
          name: functionName,
          description: buildProviderToolDescription(server, tool, definition),
          parameters: definition.parameters
        }
      })
    }
  }

  return { tools, map }
}

async function executeMcpToolCall({ mapping, argsObj, trace, runState }) {
  throwIfAborted(runState)
  const server = mapping?.server
  if (!server || server.disabled) {
    const errorText = `MCP server unavailable: ${mapping?.serverName || mapping?.serverId || 'unknown'}`
    appendTrace(trace, 'tool.failed', {
      title: `Tool failed: ${mapping?.toolName || 'unknown'}`,
      server_id: mapping?.serverId,
      server_name: mapping?.serverName,
      tool_name: mapping?.toolName,
      error: errorText
    })
    return { ok: false, content: `Error: ${errorText}` }
  }

  const argsText = stableStringify(argsObj || {})
  const approvalCheck = shouldAllowToolCallByApprovalMode(runState, mapping)
  if (approvalCheck.requiresPrompt) {
    const approved = await requestBuiltinAgentsToolApproval({ mapping, argsText, trace, runState })
    throwIfAborted(runState, 'Aborted while waiting for sub-agent tool approval')

    appendTrace(trace, 'tool.approval_resolved', {
      title:
        approved === true
          ? `Tool approved: ${mapping?.serverName || mapping?.serverId} / ${mapping?.toolName || 'unknown'}`
          : approved === false
            ? `Tool rejected: ${mapping?.serverName || mapping?.serverId} / ${mapping?.toolName || 'unknown'}`
            : `Tool approval aborted: ${mapping?.serverName || mapping?.serverId} / ${mapping?.toolName || 'unknown'}`,
      server_id: mapping?.serverId,
      server_name: mapping?.serverName,
      tool_name: mapping?.toolName,
      approval_status: approved === true ? 'approved' : approved === false ? 'rejected' : 'aborted'
    })

    if (approved !== true) {
      const errorText =
        approved === false ? 'Sub-agent tool call was rejected by the user.' : 'Sub-agent tool approval was aborted.'
      if (approved === null) {
        appendTrace(trace, 'tool.aborted', {
          title: `Tool aborted: ${mapping?.serverName || mapping?.serverId} / ${mapping?.toolName || 'unknown'}`,
          server_id: mapping?.serverId,
          server_name: mapping?.serverName,
          tool_name: mapping?.toolName,
          error: errorText
        })
        throw makeAbortError(errorText)
      }

      appendTrace(trace, 'tool.blocked', {
        title: `Tool blocked: ${mapping?.serverName || mapping?.serverId} / ${mapping?.toolName || 'unknown'}`,
        server_id: mapping?.serverId,
        server_name: mapping?.serverName,
        tool_name: mapping?.toolName,
        approval_mode: approvalCheck.mode,
        error: errorText
      })
      return { ok: false, content: `Error: ${errorText}` }
    }
  }

  if (!approvalCheck.allowed) {
    appendTrace(trace, 'tool.blocked', {
      title: `Tool blocked: ${mapping?.serverName || mapping?.serverId} / ${mapping?.toolName || 'unknown'}`,
      server_id: mapping?.serverId,
      server_name: mapping?.serverName,
      tool_name: mapping?.toolName,
      approval_mode: approvalCheck.mode,
      error: approvalCheck.reason
    })
    return { ok: false, content: `Error: ${approvalCheck.reason}` }
  }

  let client = null
  let pooled = false
  let unregister = null
  appendTrace(trace, 'tool.started', {
    title: `Tool call: ${mapping.serverName} / ${mapping.toolName}`,
    server_id: mapping.serverId,
    server_name: mapping.serverName,
    tool_name: mapping.toolName,
    args_excerpt: truncateText(argsText, MAX_TOOL_RESULT_CHARS),
    args_text: truncateText(argsText, MAX_TOOL_RESULT_CHARS)
  })

  try {
    ;({ client, pooled } = getOrCreateNestedMcpClient(server))
    if (!client?.callTool) throw new Error('MCP client not available')
    unregister = runState.registerClient(server, client, pooled)
    const callTimeoutMs = Number(server?.timeout) || 60000
    const runtimeArgsObj =
      cleanString(mapping?.toolName) === 'agent_run'
        ? injectTraceStreamIdIntoAgentRunParams(argsObj, runState?.traceStreamId)
        : argsObj
    const callArgs = typeof mapping?.unwrapArgs === 'function' ? mapping.unwrapArgs(runtimeArgsObj) : runtimeArgsObj
    if (mapping?.requiresWrappedInput && callArgs === undefined) {
      const errorText = `Tool input missing. This tool requires {"input": ...}.`
      appendTrace(trace, 'tool.failed', {
        title: `Tool failed: ${mapping.serverName} / ${mapping.toolName}`,
        server_id: mapping.serverId,
        server_name: mapping.serverName,
        tool_name: mapping.toolName,
        error: errorText
      })
      return { ok: false, content: `Error: ${errorText}` }
    }
    const result = await withTimeout(
      client.callTool(mapping.toolName, callArgs),
      callTimeoutMs,
      `Call MCP tool: ${mapping.serverName} / ${mapping.toolName}`
    )
    unregister()
    unregister = null
    releaseNestedMcpClient(server, client)
    client = null

    const resultText = stringifyToolResultContent(result)
    appendTrace(trace, 'tool.finished', {
      title: `Tool finished: ${mapping.serverName} / ${mapping.toolName}`,
      server_id: mapping.serverId,
      server_name: mapping.serverName,
      tool_name: mapping.toolName,
      result_excerpt: truncateText(resultText, MAX_TOOL_RESULT_CHARS),
      result_text: truncateText(resultText, MAX_TOOL_RESULT_CHARS)
    })
    return { ok: true, content: resultText }
  } catch (err) {
    try {
      unregister?.()
    } catch {
      // ignore
    }
    closeNestedClientSafely(server, client, pooled)
    const errorText = err?.message || String(err)
    appendTrace(trace, 'tool.failed', {
      title: `Tool failed: ${mapping.serverName} / ${mapping.toolName}`,
      server_id: mapping.serverId,
      server_name: mapping.serverName,
      tool_name: mapping.toolName,
      error: errorText
    })
    return { ok: false, content: `Error: ${errorText}` }
  }
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error }
  }
}

async function invokeUtoolsAiTool({ name, argsObj, map, trace, runState }) {
  const mapping = map.get(name)
  if (!mapping) {
    appendTrace(trace, 'tool.failed', {
      title: `Tool mapping missing: ${name}`,
      error: `Tool mapping missing: ${name}`
    })
    return `Error: Tool mapping missing: ${name}`
  }

  const exec = await executeMcpToolCall({ mapping, argsObj, trace, runState })
  const resultText = String(exec?.content || '')
  const parsed = safeJsonParse(resultText)
  return parsed.ok ? parsed.value : resultText
}

async function runAgentWithUtoolsAi({ profile, task, trace, runState, maxRounds = 12 }) {
  if (!canUseUtoolsAi()) throw new Error('Current environment does not support uTools AI')
  const api = getUtoolsApi()
  const { tools, map } = await buildMcpToolsBundle(profile.activeMcpServers, trace, runState)
  const unregisterToolFns = registerUtoolsAiToolFunctions({
    tools,
    invokeTool: (name, argsObj) => invokeUtoolsAiTool({
      name,
      argsObj: isPlainObject(argsObj) ? argsObj : {},
      map,
      trace,
      runState
    })
  })
  const apiMessages = [{ role: 'user', content: String(task || '') }]
  const utoolsToolFallbackRecords = []
  let totalToolCalls = 0
  let finalContent = ''
  let finalReasoning = ''
  let timedOut = false
  let currentRequest = null
  const requestTimeoutMs = 10 * 60_000
  const timeoutTimer = setTimeout(() => {
    timedOut = true
    try {
      currentRequest?.abort?.()
    } catch {
      // ignore
    }
  }, requestTimeoutMs)

  try {
    for (let round = 0; round < maxRounds; round += 1) {
      throwIfAborted(runState)
      let streamedContent = ''
      let streamedReasoning = ''
      const requestUtoolsAi = (requestApiMessages, requestTools = tools) => api.ai({
        model: profile.model,
        messages: buildUtoolsAiMessages({
          systemContent: profile.systemPrompt,
          apiMessages: requestApiMessages
        }),
        ...(requestTools.length ? { tools: requestTools } : {})
      }, (chunk) => {
        if (runState?.aborted) return
        const contentState = mergeStreamingText(streamedContent, chunk?.content)
        streamedContent = contentState.total
        const reasoningState = mergeStreamingText(streamedReasoning, extractReasoningText(chunk))
        streamedReasoning = reasoningState.total
        if (contentState.delta || reasoningState.delta) {
          dispatchBuiltinAgentsLiveUpdate(runState?.traceStreamId, {
            content: streamedContent,
            reasoning: streamedReasoning,
            round: round + 1
          })
        }
      })

      appendTrace(trace, 'model.request', {
        title: `Model request: ${profile.provider?.name || profile.providerId} / ${profile.model}`,
        provider_id: profile.providerId,
        model: profile.model,
        round: round + 1,
        tool_count: tools.length
      })
      dispatchBuiltinAgentsLiveUpdate(runState?.traceStreamId, { content: '', reasoning: '', round: round + 1, reset: true })

      const request = requestUtoolsAi(apiMessages, tools)
      currentRequest = request
      runState.setRequest(request)
      let result = null
      try {
        result = await request
      } catch (err) {
        const errText = err?.message || String(err)
        if (!totalToolCalls || !shouldRetryUtoolsToolContinuationAsPlainText(errText)) throw err

        dispatchBuiltinAgentsLiveUpdate(runState?.traceStreamId, { content: '', reasoning: '', round: round + 1, reset: true })
        const fallbackRequest = requestUtoolsAi([
          ...apiMessages,
          {
            role: 'user',
            content: buildUtoolsToolFallbackPrompt(utoolsToolFallbackRecords)
          }
        ], [])
        currentRequest = fallbackRequest
        runState.setRequest(fallbackRequest)
        result = await fallbackRequest
      } finally {
        runState.setRequest(null)
        currentRequest = null
      }

      throwIfAborted(runState)
      const assistantContent = toText(result?.content)
      const reasoningContent = extractReasoningText(result)
      const toolCalls = Array.isArray(result?.toolCalls) ? result.toolCalls : []

      appendTrace(trace, 'model.response', {
        title: `Model response: round ${round + 1}`,
        provider_id: profile.providerId,
        model: profile.model,
        round: round + 1,
        tool_call_count: toolCalls.length,
        content_excerpt: truncateText(assistantContent, MAX_EXCERPT_CHARS),
        content_text: truncateText(assistantContent, MAX_TOOL_RESULT_CHARS),
        reasoning_excerpt: reasoningContent ? truncateText(reasoningContent, 1200) : '',
        reasoning_text: reasoningContent ? truncateText(reasoningContent, MAX_TOOL_RESULT_CHARS) : ''
      })

      apiMessages.push({
        role: 'assistant',
        content: String(assistantContent || ''),
        reasoning_content: String(reasoningContent || ''),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {})
      })

      if (!toolCalls.length) {
        finalContent = assistantContent
        finalReasoning = reasoningContent
        finalRounds = round + 1
        return {
          content: assistantContent,
          reasoning: reasoningContent,
          rounds: round + 1,
          toolCalls: totalToolCalls
        }
      }

      if (round === maxRounds - 1) {
        return {
          content: assistantContent || finalContent,
          reasoning: reasoningContent || finalReasoning,
          rounds: round + 1,
          toolCalls: totalToolCalls
        }
      }

      for (const toolCall of toolCalls) {
        throwIfAborted(runState)
        totalToolCalls += 1
        const mapping = map.get(toolCall?.function?.name)
        const argsParsed = safeJsonParse(toolCall?.function?.arguments || '')
        const argsObj = argsParsed.ok && isPlainObject(argsParsed.value) ? argsParsed.value : {}
        const exec = await executeMcpToolCall({ mapping, argsObj, trace, runState })
        utoolsToolFallbackRecords.push({
          name: toolCall?.function?.name || '',
          serverName: exec?.serverName || mapping?.serverName || '',
          toolName: exec?.toolName || mapping?.toolName || toolCall?.function?.name || '',
          argsText: stableStringify(argsObj || {}),
          content: String(exec?.content || '')
        })
        apiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: String(exec?.content || '')
        })
      }
    }

    throw new Error('Agent run stopped: tool round limit reached')
  } catch (err) {
    if (timedOut) throw new Error(`Request timeout (${requestTimeoutMs}ms)`)
    throw err
  } finally {
    clearTimeout(timeoutTimer)
    runState.setRequest(null)
    try {
      unregisterToolFns()
    } catch {
      // ignore
    }
  }
}

async function runAgentWithOpenAICompatible({ profile, task, trace, runState, maxRounds }) {
  const baseUrl = cleanString(profile.provider?.baseurl)
  const apiKey = cleanString(profile.provider?.apikey)
  if (!baseUrl || !apiKey) throw new Error('Provider baseurl/apikey is not configured')

  const { tools, map } = await buildMcpToolsBundle(profile.activeMcpServers, trace, runState)
  const apiMessages = [{ role: 'user', content: String(task || '') }]
  const requestOverrides = buildRequestOverridesFromAgentModelParams(profile.modelParams, { includeReasoningEffort: true })

  let compatFcToolCallId = false
  let totalToolCalls = 0
  let finalContent = ''
  let finalReasoning = ''

  for (let round = 0; round < maxRounds; round += 1) {
    throwIfAborted(runState)
    appendTrace(trace, 'model.request', {
      title: `Model request: ${profile.provider?.name || profile.providerId} / ${profile.model}`,
      provider_id: profile.providerId,
      model: profile.model,
      round: round + 1,
      tool_count: tools.length
    })
    dispatchBuiltinAgentsLiveUpdate(runState?.traceStreamId, { content: '', reasoning: '', round: round + 1, reset: true })

    const controller = new AbortController()
    runState.setRequest({ abort() { controller.abort() } })
    const body = {
      model: profile.model,
      stream: true,
      messages: buildRequestMessages({
        systemPrompt: profile.systemPrompt,
        apiMessages,
        compatToolCallIdAsFc: compatFcToolCallId
      }),
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      ...requestOverrides
    }

    let json = null
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          json = await streamChatCompletions({
            baseUrl,
            apiKey,
            body,
            signal: controller.signal,
            runState,
            onDelta(evt) {
              if (evt?.type !== 'content' && evt?.type !== 'reasoning') return
              dispatchBuiltinAgentsLiveUpdate(runState?.traceStreamId, {
                content: evt?.type === 'content' ? evt.content : undefined,
                reasoning: evt?.type === 'reasoning' ? evt.reasoning : undefined,
                round: round + 1
              })
            }
          })
          break
        } catch (err) {
          const errText = String(err?.message || err || '')
          if (!compatFcToolCallId && errText.includes("Expected an ID that begins with 'fc'") && errText.includes('.id')) {
            compatFcToolCallId = true
            continue
          }
          throw err
        }
      }
      if (!json) throw new Error('Request failed: max retries reached')
    } finally {
      runState.setRequest(null)
    }

    throwIfAborted(runState)
    const assistantContent = toText(json?.content)
    const reasoningContent = extractReasoningText(json)
    const toolCalls = Array.isArray(json?.toolCalls) ? json.toolCalls : []

    appendTrace(trace, 'model.response', {
      title: `Model response: round ${round + 1}`,
      provider_id: profile.providerId,
      model: profile.model,
      round: round + 1,
      tool_call_count: toolCalls.length,
      content_excerpt: truncateText(assistantContent, MAX_EXCERPT_CHARS),
      content_text: truncateText(assistantContent, MAX_TOOL_RESULT_CHARS),
      reasoning_excerpt: reasoningContent ? truncateText(reasoningContent, 1200) : '',
      reasoning_text: reasoningContent ? truncateText(reasoningContent, MAX_TOOL_RESULT_CHARS) : ''
    })

    apiMessages.push({
      role: 'assistant',
      content: String(assistantContent || ''),
      reasoning_content: String(reasoningContent || ''),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {})
    })

    if (!toolCalls.length) {
      finalContent = assistantContent
      finalReasoning = reasoningContent
      return {
        content: assistantContent,
        reasoning: reasoningContent,
        rounds: round + 1,
        toolCalls: totalToolCalls
      }
    }

    if (round === maxRounds - 1) {
      return {
        content: assistantContent || finalContent,
        reasoning: reasoningContent || finalReasoning,
        rounds: round + 1,
        toolCalls: totalToolCalls
      }
    }

    for (const toolCall of toolCalls) {
      throwIfAborted(runState)
      totalToolCalls += 1
      const mapping = map.get(toolCall?.function?.name)
      const argsParsed = safeJsonParse(toolCall?.function?.arguments || '')
      const argsObj = argsParsed.ok && isPlainObject(argsParsed.value) ? argsParsed.value : {}
      const exec = await executeMcpToolCall({ mapping, argsObj, trace, runState })
      throwIfAborted(runState)
      apiMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: String(exec?.content || '')
      })
    }
  }

  throw new Error('Agent run stopped: tool round limit reached')
}

function createRunState(owner, options = {}) {
  const activeClients = new Set()
  const abortListeners = new Set()
  const runState = {
    aborted: false,
    currentRequest: null,
    toolApprovalMode: normalizeToolApprovalMode(options.toolApprovalMode),
    traceStreamId: cleanString(options.traceStreamId),
    agentName: cleanString(options.agentName),
    registerClient(server, client, pooled) {
      const entry = { server, client, pooled: !!pooled }
      activeClients.add(entry)
      return () => {
        activeClients.delete(entry)
      }
    },
    setRequest(requestLike) {
      this.currentRequest = requestLike || null
    },
    onAbort(listener) {
      if (typeof listener !== 'function') return () => {}
      if (this.aborted) {
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
    dispose() {
      this.aborted = true
      for (const listener of Array.from(abortListeners)) {
        try {
          listener()
        } catch {
          // ignore
        }
        abortListeners.delete(listener)
      }
      try {
        this.currentRequest?.abort?.()
      } catch {
        // ignore
      }
      for (const entry of Array.from(activeClients)) {
        closeNestedClientSafely(entry.server, entry.client, entry.pooled)
        activeClients.delete(entry)
      }
    }
  }

  owner?._activeRuns?.add?.(runState)
  return runState
}

function buildAgentRunResponse({ ok, status, agent, profile, content, reasoning, errorText, trace, durationMs, rounds, toolCalls, includeTrace, config }) {
  return {
    ok,
    kind: 'agent_run_result',
    status,
    agent: agent ? buildAgentBrief(agent, config) : null,
    runtime: profile
      ? {
          provider_id: profile.providerId,
          provider_name: cleanString(profile.provider?.name || profile.providerId),
          model: profile.model,
          prompt_id: cleanString(profile.prompt?._id),
          prompt_name: cleanString(profile.prompt?.name || profile.prompt?._id),
          skill_ids: profile.skillIds,
          mcp_ids: profile.activeMcpIds
        }
      : null,
    summary: String(content || ''),
    final: {
      content: String(content || ''),
      reasoning: String(reasoning || '')
    },
    error: errorText ? String(errorText) : '',
    metrics: {
      duration_ms: Number(durationMs) || 0,
      rounds: Number(rounds) || 0,
      tool_calls: Number(toolCalls) || 0
    },
    ...(includeTrace ? { trace } : {})
  }
}

function clampInteger(value, options = {}) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return options.defaultValue
  const int = Math.floor(raw)
  const min = Number.isFinite(options.min) ? options.min : -Infinity
  const max = Number.isFinite(options.max) ? options.max : Infinity
  return Math.max(min, Math.min(max, int))
}

const TOOLS = [
  {
    name: 'agents_list',
    description: 'List available Agents configured in the app. With query, it searches Agent id/name/provider/model/prompt/skills/MCP; default is keyword search and it automatically becomes hybrid semantic search when the global Agent/Notes/Sessions search config enables embeddings. The result includes searchMode and semanticUsed.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional Agent query. Supports id/name/provider/model/prompt/skill/MCP keywords; when embeddings are configured it can also match semantically.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'agent_run',
    description: 'Run one configured Agent as a sub-agent. It uses that Agent\'s provider/model/prompt/skills/MCP config and returns a trace of the internal execution process.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Preferred. Agent id from agents_list.' },
        agent_name: { type: 'string', description: 'Fallback when id is unknown. Supports exact name, keyword match, and the same semantic search path as agents_list.' },
        task: { type: 'string', description: 'The task/instruction for the sub-agent.' },
        include_trace: { type: 'boolean', description: 'Whether to include execution trace in the result. Default true.' },
        max_rounds: { type: 'integer', description: `Maximum model/tool rounds for OpenAI-compatible providers. Default 12, max ${MAX_MODEL_ROUNDS}.` },
        tool_approval_mode: {
          type: 'string',
          enum: TOOL_APPROVAL_MODES,
          description: 'Internal use only. Parent chat tool-approval mode.'
        },
        trace_stream_id: {
          type: 'string',
          description: 'Internal use only. Stream id for live trace delivery.'
        }
      },
      required: ['task'],
      additionalProperties: false
    }
  }
]

class BuiltinAgentsMcpClient {
  constructor(serverConfig) {
    this.config = serverConfig || {}
    this._activeRuns = new Set()
  }

  async listTools() {
    return TOOLS
  }

  async callTool(toolName, args) {
    const name = cleanString(toolName)
    const params = isPlainObject(args) ? args : {}
    const config = globalConfig.getConfig()

    if (name === 'agents_list') {
      const result = await listAgentItems(config, params.query)
      return {
        ok: true,
        kind: 'agents_list',
        ...result
      }
    }

    if (name === 'agent_run') {
      const traceStreamId = resolveTraceStreamIdFromAgentRunParams(params)
      const toolApprovalMode = resolveToolApprovalModeFromAgentRunParams(params)
      const task = cleanString(params.task)
      if (!task) {
        dispatchBuiltinAgentsTraceDone(traceStreamId)
        return {
          ok: false,
          kind: 'agent_run_result',
          status: 'error',
          error: 'task is required'
        }
      }

      const includeTrace = params.include_trace !== false
      const trace = []
      attachTraceStreamId(trace, traceStreamId)
      const startedAt = Date.now()
      let agent = null
      let profile = null
      const runState = createRunState(this, { toolApprovalMode, traceStreamId })

      try {
        agent = await resolveAgentTarget(config, params)
        if (!agent) {
          const errorText = 'Agent not found. Call agents_list first to inspect available Agents.'
          appendTrace(trace, 'run.failed', {
            title: 'Sub-agent start failed',
            error: errorText
          })
          return {
            ok: false,
            kind: 'agent_run_result',
            status: 'error',
            error: errorText,
            ...(includeTrace ? { trace } : {})
          }
        }

        appendTrace(trace, 'run.started', {
          title: `Sub-agent started: ${agent.name || agent._id}`,
          agent_id: agent._id,
          agent_name: agent.name || agent._id,
          task_excerpt: truncateText(task, 800),
          task_text: truncateText(task, MAX_TOOL_RESULT_CHARS)
        })
        runState.agentName = cleanString(agent.name || agent._id)

        profile = await resolveExecutionProfile({ config, agent, trace })
        appendTrace(trace, 'profile.ready', {
          title: 'Agent runtime resolved',
          agent_id: agent._id,
          provider_id: profile.providerId,
          provider_name: cleanString(profile.provider?.name || profile.providerId),
          model: profile.model,
          skill_count: profile.skillIds.length,
          mcp_count: profile.activeMcpIds.length
        })

        const maxRounds = clampInteger(params.max_rounds, { min: 1, max: MAX_MODEL_ROUNDS, defaultValue: 12 })
        const result = isUtoolsBuiltinProvider(profile.provider)
          ? await runAgentWithUtoolsAi({ profile, task, trace, runState, maxRounds })
          : await runAgentWithOpenAICompatible({ profile, task, trace, runState, maxRounds })

        const durationMs = Date.now() - startedAt
        appendTrace(trace, 'run.finished', {
          title: 'Sub-agent finished',
          agent_id: agent._id,
          duration_ms: durationMs,
          content_excerpt: truncateText(result?.content || '', 1000),
          content_text: truncateText(result?.content || '', MAX_TOOL_RESULT_CHARS)
        })

        return buildAgentRunResponse({
          ok: true,
          status: 'completed',
          agent,
          profile,
          content: result?.content || '',
          reasoning: result?.reasoning || '',
          trace,
          durationMs,
          rounds: result?.rounds || 1,
          toolCalls: result?.toolCalls || 0,
          includeTrace,
          config
        })
      } catch (err) {
        const durationMs = Date.now() - startedAt
        const aborted = runState.aborted || isAbortError(err)
        const errorText = err?.message || String(err)
        appendTrace(trace, aborted ? 'run.aborted' : 'run.failed', {
          title: aborted ? 'Sub-agent aborted' : 'Sub-agent failed',
          agent_id: agent?._id || '',
          duration_ms: durationMs,
          error: errorText
        })
        return buildAgentRunResponse({
          ok: false,
          status: aborted ? 'aborted' : 'error',
          agent,
          profile,
          content: '',
          reasoning: '',
          errorText,
          trace,
          durationMs,
          rounds: 0,
          toolCalls: 0,
          includeTrace,
          config
        })
      } finally {
        this._activeRuns.delete(runState)
        dispatchBuiltinAgentsTraceDone(traceStreamId || runState.traceStreamId)
        runState.dispose()
      }
    }

    throw new Error(`Unknown tool: ${name}`)
  }

  async listPrompts() {
    return []
  }

  async listResources() {
    return []
  }

  close() {
    try {
      if (pendingBuiltinAgentsLiveFlushTimer) {
        clearTimeout(pendingBuiltinAgentsLiveFlushTimer)
        pendingBuiltinAgentsLiveFlushTimer = null
      }
    } catch {
      // ignore
    }
    pendingBuiltinAgentsLiveByStreamId.clear()
    for (const runState of Array.from(this._activeRuns)) {
      try {
        runState.dispose()
      } catch {
        // ignore
      } finally {
        this._activeRuns.delete(runState)
      }
    }
    closeAllPooledNestedMcpClients()
  }
}

module.exports = function createBuiltinAgentsMcpClient(serverConfig) {
  return new BuiltinAgentsMcpClient(serverConfig)
}
