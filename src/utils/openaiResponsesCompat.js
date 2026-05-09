function stableStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeString(value) {
  return String(value ?? '').trim()
}

function sanitizeFunctionCallId(value, fallback = '') {
  const text = normalizeString(value || fallback)
  const suffix = text.replace(/^(call|fc)_/i, '').replace(/[^a-z0-9_-]/gi, '_') || Math.random().toString(16).slice(2)
  return `fc_${suffix}`
}

function tokenizeModelName(model) {
  return normalizeString(model)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
}

export function shouldPreferResponsesApiForModel(model) {
  const tokens = tokenizeModelName(model)
  if (!tokens.length) return false

  if (tokens.includes('pro')) return true
  return tokens.includes('deep') && tokens.includes('research')
}

export function shouldFallbackChatCompletionsToResponses(errorText) {
  const lower = normalizeString(errorText).toLowerCase()
  if (!lower) return false
  return (
    (lower.includes('responses api') && (lower.includes('use') || lower.includes('supported') || lower.includes('required'))) ||
    lower.includes('use /v1/responses') ||
    lower.includes('use the responses endpoint') ||
    lower.includes('not supported in chat completions') ||
    lower.includes('not supported with chat completions') ||
    lower.includes('unsupported parameter') && lower.includes('messages') ||
    lower.includes('unsupported value') && lower.includes('chat.completions')
  )
}

export function shouldFallbackResponsesToChatCompletions(errorText) {
  const lower = normalizeString(errorText).toLowerCase()
  if (!lower) return false
  return (
    lower.includes('http 404') ||
    lower.includes('cannot post') && lower.includes('/responses') ||
    lower.includes('no such route') && lower.includes('/responses') ||
    lower.includes('unknown endpoint') && lower.includes('/responses') ||
    lower.includes('unsupported endpoint') && lower.includes('/responses')
  )
}

export function shouldRetryResponsesWithoutStreaming(errorText) {
  const lower = normalizeString(errorText).toLowerCase()
  if (!lower || !lower.includes('stream')) return false
  return (
    lower.includes('not supported') ||
    lower.includes('unsupported') ||
    lower.includes('does not support') ||
    lower.includes("doesn't support")
  )
}

export function shouldRetryWithoutParallelToolCalls(errorText) {
  const lower = normalizeString(errorText).toLowerCase()
  if (!lower || !lower.includes('parallel_tool_calls')) return false
  return (
    lower.includes('unsupported') ||
    lower.includes('not supported') ||
    lower.includes('unknown parameter') ||
    lower.includes('extra inputs are not permitted') ||
    lower.includes('invalid request')
  )
}

function extractTextFromChatContentPart(part) {
  if (!part || typeof part !== 'object') return ''
  if (typeof part.text === 'string') return part.text
  if (typeof part.content === 'string') return part.content
  return ''
}

function convertChatContentPartToResponses(part) {
  if (!part || typeof part !== 'object') return null
  const type = normalizeString(part.type).toLowerCase()

  if (type === 'text' || type === 'input_text' || type === 'output_text') {
    const text = extractTextFromChatContentPart(part)
    return text ? { type: 'input_text', text } : null
  }

  if (type === 'image_url' || type === 'input_image') {
    const imageUrl = typeof part.image_url === 'string'
      ? part.image_url
      : part.image_url && typeof part.image_url === 'object'
        ? part.image_url.url
        : part.image_url || part.imageUrl || part.url
    const url = normalizeString(imageUrl)
    if (!url) return null
    return {
      type: 'input_image',
      image_url: url,
      ...(part.detail ? { detail: part.detail } : {})
    }
  }

  const text = extractTextFromChatContentPart(part)
  return text ? { type: 'input_text', text } : null
}

function convertChatContentToResponsesContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts = content.map(convertChatContentPartToResponses).filter(Boolean)
    return parts.length ? parts : ''
  }
  if (typeof content === 'object') {
    const text = extractTextFromChatContentPart(content)
    return text || stableStringify(content)
  }
  return String(content)
}

function convertChatToolToResponsesTool(tool) {
  if (!tool || typeof tool !== 'object') return null
  if (tool.type !== 'function' || !tool.function || typeof tool.function !== 'object') return tool

  const fn = tool.function
  const name = normalizeString(fn.name)
  if (!name) return null
  return {
    type: 'function',
    name,
    ...(fn.description ? { description: String(fn.description) } : {}),
    parameters: fn.parameters && typeof fn.parameters === 'object'
      ? fn.parameters
      : { type: 'object', properties: {}, additionalProperties: false },
    ...(fn.strict !== undefined ? { strict: !!fn.strict } : {})
  }
}

function normalizeResponsesRole(role) {
  const text = normalizeString(role).toLowerCase()
  if (text === 'assistant' || text === 'user' || text === 'developer') return text
  return 'user'
}

function convertChatToolCallToResponsesItem(toolCall, index = 0) {
  const fn = toolCall?.function && typeof toolCall.function === 'object' ? toolCall.function : {}
  const name = normalizeString(fn.name)
  if (!name) return null

  const rawId = normalizeString(toolCall.id)
  const callId = normalizeString(toolCall.call_id || toolCall.callId || rawId || `call_${index + 1}`)
  return {
    type: 'function_call',
    id: rawId.startsWith('fc_') ? rawId : sanitizeFunctionCallId(rawId, callId),
    call_id: callId,
    name,
    arguments: typeof fn.arguments === 'string' ? fn.arguments : stableStringify(fn.arguments || {})
  }
}

function convertChatMessageToResponsesItems(message, options = {}) {
  if (!message || typeof message !== 'object') return []
  const role = normalizeString(message.role).toLowerCase()

  if (role === 'system') {
    const content = convertChatContentToResponsesContent(message.content)
    const text = typeof content === 'string' ? content : stableStringify(content)
    return text ? [{ type: 'instructions', text }] : []
  }

  if (role === 'tool') {
    const callId = normalizeString(message.call_id || message.tool_call_id)
    if (!callId) return []
    return [{
      type: 'function_call_output',
      call_id: callId,
      output: typeof message.content === 'string' ? message.content : stableStringify(message.content ?? '')
    }]
  }

  const out = []
  const content = convertChatContentToResponsesContent(message.content)
  const hasContent = Array.isArray(content) ? content.length > 0 : !!normalizeString(content)
  if (hasContent) {
    out.push({
      role: normalizeResponsesRole(role),
      content
    })
  }

  if (role === 'assistant' && Array.isArray(message.tool_calls) && !options.plainTextToolFallback) {
    message.tool_calls.forEach((toolCall, index) => {
      const item = convertChatToolCallToResponsesItem(toolCall, index)
      if (item) out.push(item)
    })
  }

  return out
}

export function buildResponsesRequestBodyFromChatBody(chatBody = {}, options = {}) {
  const body = chatBody && typeof chatBody === 'object' ? chatBody : {}
  const instructions = []
  const input = []

  ;(Array.isArray(body.messages) ? body.messages : []).forEach((message) => {
    convertChatMessageToResponsesItems(message).forEach((item) => {
      if (item?.type === 'instructions') instructions.push(item.text)
      else input.push(item)
    })
  })

  const responsesBody = {
    model: body.model,
    input,
    stream: options.stream !== undefined ? !!options.stream : body.stream !== false
  }

  if (instructions.length) responsesBody.instructions = instructions.join('\n\n')

  const tools = (Array.isArray(body.tools) ? body.tools : []).map(convertChatToolToResponsesTool).filter(Boolean)
  if (tools.length) responsesBody.tools = tools
  if (body.tool_choice !== undefined) responsesBody.tool_choice = body.tool_choice
  if (body.parallel_tool_calls !== undefined) responsesBody.parallel_tool_calls = !!body.parallel_tool_calls

  if (body.reasoning_effort) {
    responsesBody.reasoning = {
      ...(responsesBody.reasoning || {}),
      effort: body.reasoning_effort
    }
  }

  ;[
    ['temperature', 'temperature'],
    ['top_p', 'top_p'],
    ['max_tokens', 'max_output_tokens'],
    ['max_completion_tokens', 'max_output_tokens'],
    ['max_output_tokens', 'max_output_tokens'],
    ['presence_penalty', 'presence_penalty'],
    ['frequency_penalty', 'frequency_penalty'],
    ['seed', 'seed']
  ].forEach(([from, to]) => {
    if (body[from] !== undefined && responsesBody[to] === undefined) responsesBody[to] = body[from]
  })

  return responsesBody
}

function ensureAccumulator(state) {
  if (!state || typeof state !== 'object') return createResponsesStreamAccumulator()
  if (!(state.toolCallsByKey instanceof Map)) state.toolCallsByKey = new Map()
  if (!Array.isArray(state.payloads)) state.payloads = []
  if (typeof state.content !== 'string') state.content = ''
  if (typeof state.reasoning !== 'string') state.reasoning = ''
  return state
}

export function createResponsesStreamAccumulator() {
  return {
    content: '',
    reasoning: '',
    finishReason: null,
    toolCallsByKey: new Map(),
    payloads: []
  }
}

function upsertResponsesFunctionCall(state, item = {}) {
  const name = normalizeString(item.name)
  const callId = normalizeString(item.call_id || item.callId || item.id)
  const key = normalizeString(item.id || callId || item.output_index || item.item_id || item.itemId)
  if (!key && !name) return null

  const prev = state.toolCallsByKey.get(key || callId || name) || {
    id: normalizeString(item.id) || sanitizeFunctionCallId(callId || key || name),
    type: 'function',
    call_id: callId,
    function: {
      name,
      arguments: ''
    }
  }

  if (item.id) prev.id = normalizeString(item.id)
  if (callId) prev.call_id = callId
  if (name) prev.function.name = name
  if (typeof item.arguments === 'string') prev.function.arguments = item.arguments
  if (typeof item.delta === 'string') prev.function.arguments += item.delta

  state.toolCallsByKey.set(key || prev.call_id || prev.id || prev.function.name, prev)
  return prev
}

function collectResponsesOutputItems(json) {
  const response = json?.response && typeof json.response === 'object' ? json.response : json
  const output = Array.isArray(response?.output) ? response.output : []
  const item = json?.item && typeof json.item === 'object' ? json.item : null
  return item ? [...output, item] : output
}

export function applyResponsesStreamEvent(state, json) {
  const acc = ensureAccumulator(state)
  const events = []
  if (!json || typeof json !== 'object') return events
  acc.payloads.push(json)

  const type = normalizeString(json.type || json.event).toLowerCase()

  if (json.error) {
    const err = new Error(json.error.message || stableStringify(json.error))
    err.name = 'ResponsesApiError'
    throw err
  }

  if ((type.endsWith('output_text.delta') || type.endsWith('text.delta')) && typeof json.delta === 'string') {
    acc.content += json.delta
    events.push({ type: 'content', delta: json.delta, content: acc.content })
  }

  if (type.includes('reasoning') && (type.endsWith('.delta') || type.endsWith('_text.delta')) && typeof json.delta === 'string') {
    acc.reasoning += json.delta
    events.push({ type: 'reasoning', delta: json.delta, reasoning: acc.reasoning })
  }

  if (type.endsWith('function_call_arguments.delta')) {
    const toolCall = upsertResponsesFunctionCall(acc, {
      id: json.item_id || json.itemId,
      output_index: json.output_index,
      delta: json.delta
    })
    if (toolCall) events.push({ type: 'tool_calls', toolCalls: Array.from(acc.toolCallsByKey.values()) })
  }

  if (type.endsWith('function_call_arguments.done')) {
    const toolCall = upsertResponsesFunctionCall(acc, {
      id: json.item_id || json.itemId,
      output_index: json.output_index,
      arguments: typeof json.arguments === 'string' ? json.arguments : stableStringify(json.arguments || {})
    })
    if (toolCall) events.push({ type: 'tool_calls', toolCalls: Array.from(acc.toolCallsByKey.values()) })
  }

  collectResponsesOutputItems(json).forEach((item) => {
    if (normalizeString(item?.type).toLowerCase() !== 'function_call') return
    const toolCall = upsertResponsesFunctionCall(acc, item)
    if (toolCall) events.push({ type: 'tool_calls', toolCalls: Array.from(acc.toolCallsByKey.values()) })
  })

  const status = normalizeString(json?.response?.status || json?.status).toLowerCase()
  if (type.endsWith('.completed') || status === 'completed') acc.finishReason = 'stop'
  if (type.endsWith('.failed') || status === 'failed') acc.finishReason = 'error'

  return events
}

export function finalizeResponsesStreamAccumulator(state) {
  const acc = ensureAccumulator(state)
  return {
    content: acc.content,
    reasoning: acc.reasoning,
    toolCalls: Array.from(acc.toolCallsByKey.values()),
    finishReason: acc.finishReason || 'stop',
    payloads: acc.payloads.slice()
  }
}
