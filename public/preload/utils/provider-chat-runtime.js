const { consumeJsonEventStream } = require('./stream-json-events')

function cleanString(value) {
  return String(value ?? '').trim()
}

function stableStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error }
  }
}

function toText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(toText).join('')
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (typeof value.content === 'string') return value.content
    return stableStringify(value)
  }
  return String(value)
}

function createAbortError(message = 'Aborted') {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal, isAborted) {
  if (signal?.aborted || isAborted?.()) throw createAbortError()
}

function normalizeProviderApiMode(value) {
  const normalized = cleanString(value).toLowerCase().replace(/[_\s]+/g, '-')
  if (normalized === 'response' || normalized === 'responses-api') return 'responses'
  if (
    normalized === 'chat' ||
    normalized === 'chat-completion' ||
    normalized === 'chat-completions-api' ||
    normalized === 'chatcompletion' ||
    normalized === 'chatcompletions'
  ) {
    return 'chat-completions'
  }
  return normalized === 'responses' || normalized === 'chat-completions' ? normalized : 'auto'
}

function shouldPreferResponsesApiForModel(model) {
  const tokens = cleanString(model)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
  if (tokens.includes('pro')) return true
  return tokens.includes('deep') && tokens.includes('research')
}

function shouldFallbackChatCompletionsToResponses(errorText) {
  const lower = cleanString(errorText).toLowerCase()
  if (!lower) return false
  return (
    (lower.includes('responses api') && (lower.includes('use') || lower.includes('supported') || lower.includes('required'))) ||
    lower.includes('use /v1/responses') ||
    lower.includes('use the responses endpoint') ||
    lower.includes('not supported in chat completions') ||
    lower.includes('not supported with chat completions') ||
    (lower.includes('function calling') && lower.includes('responses')) ||
    (lower.includes('tool calling') && lower.includes('responses')) ||
    (lower.includes('tools') && lower.includes('only') && lower.includes('/responses')) ||
    (lower.includes('tool_choice') && lower.includes('responses')) ||
    (lower.includes('unsupported parameter') && lower.includes('messages')) ||
    (lower.includes('unsupported value') && lower.includes('chat.completions'))
  )
}

function shouldFallbackResponsesToChatCompletions(errorText) {
  const lower = cleanString(errorText).toLowerCase()
  if (!lower) return false
  return (
    lower.includes('http 404') ||
    lower.includes('http 405') ||
    lower.includes('http 501') ||
    (lower.includes('cannot post') && lower.includes('/responses')) ||
    (lower.includes('no such route') && lower.includes('/responses')) ||
    (lower.includes('unknown endpoint') && lower.includes('/responses')) ||
    (lower.includes('unsupported endpoint') && lower.includes('/responses'))
  )
}

function shouldRetryResponsesWithoutStreaming(errorText) {
  const lower = cleanString(errorText).toLowerCase()
  if (!lower || !lower.includes('stream')) return false
  return (
    lower.includes('not supported') ||
    lower.includes('unsupported') ||
    lower.includes('does not support') ||
    lower.includes("doesn't support")
  )
}

function normalizeBaseUrl(url) {
  const raw = cleanString(url)
  if (!raw) return ''
  const noQuery = raw.split('#')[0].split('?')[0]
  return noQuery
    .replace(/\/+$/, '')
    .replace(/\/v1\/chat\/completions$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/responses$/i, '/v1')
    .replace(/\/responses$/i, '')
    .replace(/\/v1\/completions$/i, '/v1')
    .replace(/\/completions$/i, '')
    .replace(/\/v1\/models$/i, '/v1')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '')
}

function sanitizeFunctionCallId(value, fallback = '') {
  const text = cleanString(value || fallback)
  const suffix = text.replace(/^(call|fc)_/i, '').replace(/[^a-z0-9_-]/gi, '_') || Math.random().toString(16).slice(2)
  return `fc_${suffix}`
}

function extractTextFromContentPart(part) {
  if (!part || typeof part !== 'object') return ''
  if (typeof part.text === 'string') return part.text
  if (part.text && typeof part.text === 'object' && typeof part.text.value === 'string') return part.text.value
  if (typeof part.content === 'string') return part.content
  return ''
}

function convertChatContentPartToResponses(part) {
  if (!part || typeof part !== 'object') return null
  const type = cleanString(part.type).toLowerCase()
  if (type === 'text' || type === 'input_text' || type === 'output_text') {
    const text = extractTextFromContentPart(part)
    return text ? { type: 'input_text', text } : null
  }
  if (type === 'image_url' || type === 'input_image') {
    const imageUrl = typeof part.image_url === 'string'
      ? part.image_url
      : part.image_url && typeof part.image_url === 'object'
        ? part.image_url.url
        : part.image_url || part.imageUrl || part.url
    const url = cleanString(imageUrl)
    return url
      ? { type: 'input_image', image_url: url, ...(part.detail ? { detail: part.detail } : {}) }
      : null
  }
  const text = extractTextFromContentPart(part)
  return text ? { type: 'input_text', text } : null
}

function convertChatContentToResponsesContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts = content.map(convertChatContentPartToResponses).filter(Boolean)
    return parts.length ? parts : ''
  }
  if (typeof content === 'object') return extractTextFromContentPart(content) || stableStringify(content)
  return String(content)
}

function convertChatToolToResponsesTool(tool) {
  if (!tool || typeof tool !== 'object') return null
  if (tool.type !== 'function' || !tool.function || typeof tool.function !== 'object') return tool
  const fn = tool.function
  const name = cleanString(fn.name)
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

function convertChatToolCallToResponsesItem(toolCall, index = 0) {
  const fn = toolCall?.function && typeof toolCall.function === 'object' ? toolCall.function : {}
  const name = cleanString(fn.name)
  if (!name) return null
  const rawId = cleanString(toolCall.id)
  const callId = cleanString(toolCall.call_id || toolCall.callId || rawId || `call_${index + 1}`)
  return {
    type: 'function_call',
    id: rawId.startsWith('fc_') ? rawId : sanitizeFunctionCallId(rawId, callId),
    call_id: callId,
    name,
    arguments: typeof fn.arguments === 'string' ? fn.arguments : stableStringify(fn.arguments || {})
  }
}

function convertChatMessageToResponsesItems(message) {
  if (!message || typeof message !== 'object') return []
  const role = cleanString(message.role).toLowerCase()
  if (role === 'system') {
    const content = convertChatContentToResponsesContent(message.content)
    const text = typeof content === 'string' ? content : stableStringify(content)
    return text ? [{ type: 'instructions', text }] : []
  }
  if (role === 'tool') {
    const callId = cleanString(message.call_id || message.tool_call_id)
    if (!callId) return []
    return [{
      type: 'function_call_output',
      call_id: callId,
      output: typeof message.content === 'string' ? message.content : stableStringify(message.content ?? '')
    }]
  }

  const items = []
  const content = convertChatContentToResponsesContent(message.content)
  const hasContent = Array.isArray(content) ? content.length > 0 : !!cleanString(content)
  if (hasContent) {
    const responseRole = role === 'assistant' || role === 'developer' || role === 'user' ? role : 'user'
    items.push({ role: responseRole, content })
  }
  if (role === 'assistant' && Array.isArray(message.tool_calls)) {
    message.tool_calls.forEach((toolCall, index) => {
      const item = convertChatToolCallToResponsesItem(toolCall, index)
      if (item) items.push(item)
    })
  }
  return items
}

function buildResponsesRequestBodyFromChatBody(chatBody = {}, options = {}) {
  const body = chatBody && typeof chatBody === 'object' ? chatBody : {}
  const instructions = []
  const input = []
  ;(Array.isArray(body.messages) ? body.messages : []).forEach((message) => {
    convertChatMessageToResponsesItems(message).forEach((item) => {
      if (item.type === 'instructions') instructions.push(item.text)
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
  if (body.reasoning_effort) responsesBody.reasoning = { effort: body.reasoning_effort }
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

function createResponsesStreamAccumulator() {
  return {
    content: '',
    reasoning: '',
    finishReason: null,
    toolCallsByKey: new Map(),
    payloads: [],
    usage: null
  }
}

function upsertResponsesFunctionCall(state, item = {}) {
  const name = cleanString(item.name)
  const itemId = cleanString(item.id || item.item_id || item.itemId)
  const explicitCallId = cleanString(item.call_id || item.callId)
  // Responses 的 item.id（fc_...）与 call_id（call_...）必须分别保留。
  const callId = explicitCallId || (itemId && !itemId.startsWith('fc_') ? itemId : '')
  const key = cleanString(itemId || callId || item.output_index)
  if (!key && !name) return null

  const previous = state.toolCallsByKey.get(key || callId || name) || {
    id: itemId || sanitizeFunctionCallId(callId || key || name),
    type: 'function',
    ...(callId ? { call_id: callId } : {}),
    function: { name, arguments: '' }
  }
  if (itemId) previous.id = itemId
  if (callId) previous.call_id = callId
  if (name) previous.function.name = name
  if (typeof item.arguments === 'string') previous.function.arguments = item.arguments
  if (typeof item.delta === 'string') previous.function.arguments += item.delta
  state.toolCallsByKey.set(key || previous.call_id || previous.id || previous.function.name, previous)
  return previous
}

function collectResponsesOutputItems(json) {
  const response = json?.response && typeof json.response === 'object' ? json.response : json
  const output = Array.isArray(response?.output) ? response.output : []
  const item = json?.item && typeof json.item === 'object' ? json.item : null
  return item ? [...output, item] : output
}

function applyResponsesStreamEvent(state, json) {
  const events = []
  if (!json || typeof json !== 'object') return events
  state.payloads.push(json)
  const usage = json?.response?.usage || json?.usage
  if (usage && typeof usage === 'object') state.usage = usage
  const type = cleanString(json.type || json.event).toLowerCase()

  if (json.error) {
    const error = new Error(json.error.message || stableStringify(json.error))
    error.name = 'ResponsesApiError'
    throw error
  }
  if ((type.endsWith('output_text.delta') || type.endsWith('text.delta')) && typeof json.delta === 'string') {
    state.content += json.delta
    events.push({ type: 'content', delta: json.delta, content: state.content })
  }
  if (type.includes('reasoning') && type.endsWith('.delta') && typeof json.delta === 'string') {
    state.reasoning += json.delta
    events.push({ type: 'reasoning', delta: json.delta, reasoning: state.reasoning })
  }
  if (type.endsWith('function_call_arguments.delta') || type.endsWith('function_call_arguments.done')) {
    const toolCall = upsertResponsesFunctionCall(state, {
      id: json.item_id || json.itemId,
      call_id: json.call_id || json.callId,
      name: json.name,
      output_index: json.output_index,
      ...(type.endsWith('.delta')
        ? { delta: json.delta }
        : { arguments: typeof json.arguments === 'string' ? json.arguments : stableStringify(json.arguments || {}) })
    })
    if (toolCall) events.push({ type: 'tool_calls', toolCalls: Array.from(state.toolCallsByKey.values()) })
  }
  collectResponsesOutputItems(json).forEach((item) => {
    if (cleanString(item?.type).toLowerCase() !== 'function_call') return
    const toolCall = upsertResponsesFunctionCall(state, item)
    if (toolCall) events.push({ type: 'tool_calls', toolCalls: Array.from(state.toolCallsByKey.values()) })
  })
  const status = cleanString(json?.response?.status || json?.status).toLowerCase()
  if (type.endsWith('.completed') || status === 'completed') state.finishReason = 'stop'
  if (type.endsWith('.failed') || status === 'failed') state.finishReason = 'error'
  return events
}

function extractResponsesText(payload) {
  const response = payload?.response && typeof payload.response === 'object' ? payload.response : payload
  if (!response || typeof response !== 'object') return ''
  if (typeof response.output_text === 'string') return response.output_text.trim()
  const fragments = []
  ;(Array.isArray(response.output) ? response.output : []).forEach((item) => {
    if (cleanString(item?.type).toLowerCase() !== 'message') return
    ;(Array.isArray(item.content) ? item.content : []).forEach((part) => {
      const type = cleanString(part?.type).toLowerCase()
      if (type === 'output_text' || type === 'text') {
        const text = extractTextFromContentPart(part)
        if (text) fragments.push(text)
      }
    })
  })
  return fragments.join('\n\n').trim()
}

function finalizeResponsesStreamAccumulator(state) {
  let content = state.content
  if (!content.trim()) {
    for (let index = state.payloads.length - 1; index >= 0; index -= 1) {
      content = extractResponsesText(state.payloads[index])
      if (content) break
    }
  }
  return {
    content,
    reasoning: state.reasoning,
    toolCalls: Array.from(state.toolCallsByKey.values()),
    finishReason: state.finishReason || 'stop',
    usage: state.usage,
    endpoint: 'responses',
    payloads: state.payloads.slice()
  }
}

async function requestEndpointResponse({ baseUrl, apiKey, pathName, body, signal, label }) {
  const base = normalizeBaseUrl(baseUrl)
  const candidates = [`${base}/${pathName}`]
  if (!/\/v1$/i.test(base)) candidates.push(`${base}/v1/${pathName}`)
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
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal
      })
      if (response.status === 404 && url !== candidates[candidates.length - 1]) continue
      break
    } catch (error) {
      lastNetworkError = error
      if (url !== candidates[candidates.length - 1]) continue
      throw error
    }
  }
  if (!response) throw lastNetworkError || new Error(`${label} request failed: no response`)
  if (!response.ok) {
    const rawText = await response.text()
    const parsed = safeJsonParse(rawText)
    const detail = parsed.ok ? parsed.value?.error?.message || stableStringify(parsed.value) : rawText
    throw new Error(`${label} request failed (HTTP ${response.status}): ${detail || response.statusText}\nURL: ${usedUrl}`)
  }
  return { response, usedUrl }
}

async function streamResponsesCompletion({ baseUrl, apiKey, body, signal, isAborted, onDelta, stream = true }) {
  throwIfAborted(signal, isAborted)
  const { response } = await requestEndpointResponse({
    baseUrl,
    apiKey,
    pathName: 'responses',
    body: buildResponsesRequestBodyFromChatBody(body, { stream }),
    signal,
    label: 'Responses'
  })
  const state = createResponsesStreamAccumulator()
  if (!stream) {
    const rawText = await response.text()
    const parsed = safeJsonParse(rawText)
    if (!parsed.ok) throw new Error('Responses request failed: invalid JSON response')
    applyResponsesStreamEvent(state, parsed.value)
    return finalizeResponsesStreamAccumulator(state)
  }
  await consumeJsonEventStream({
    response,
    signal,
    isAborted,
    onJson(json) {
      throwIfAborted(signal, isAborted)
      applyResponsesStreamEvent(state, json).forEach((event) => onDelta?.(event))
    }
  })
  return finalizeResponsesStreamAccumulator(state)
}

async function streamResponsesCompletionWithFallback(args) {
  try {
    return await streamResponsesCompletion({ ...args, stream: true })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (!shouldRetryResponsesWithoutStreaming(error?.message || error)) throw error
    return streamResponsesCompletion({ ...args, stream: false })
  }
}

async function streamChatCompletions({ baseUrl, apiKey, body, signal, isAborted, onDelta }) {
  throwIfAborted(signal, isAborted)
  const { response, usedUrl } = await requestEndpointResponse({
    baseUrl,
    apiKey,
    pathName: 'chat/completions',
    body,
    signal,
    label: 'Chat Completions'
  })
  let content = ''
  let reasoning = ''
  let finishReason = null
  let usage = null
  const toolCallsByIndex = new Map()
  const payloads = []

  const applyJson = (json) => {
    throwIfAborted(signal, isAborted)
    if (!json || typeof json !== 'object') return
    payloads.push(json)
    if (json?.usage && typeof json.usage === 'object') usage = json.usage
    if (json.error) throw new Error(`Chat Completions request failed: ${json.error.message || stableStringify(json.error)}\nURL: ${usedUrl}`)

    const choice = json?.choices?.[0] || {}
    const delta = choice.delta || {}
    const message = choice.message || {}
    if (choice.finish_reason) finishReason = choice.finish_reason

    const deltaContent = delta.content ?? delta.text
    if (deltaContent != null) {
      const text = toText(deltaContent)
      if (text) {
        content += text
        onDelta?.({ type: 'content', delta: text, content })
      }
    } else if (message.content != null) {
      const next = toText(message.content)
      const text = content && next.startsWith(content) ? next.slice(content.length) : next
      content = next
      if (text) onDelta?.({ type: 'content', delta: text, content })
    } else if (choice.text != null) {
      const text = toText(choice.text)
      content += text
      if (text) onDelta?.({ type: 'content', delta: text, content })
    }

    const deltaReasoning = delta.reasoning ?? delta.reasoning_content ?? delta.thinking ?? delta.thought
    const messageReasoning = message.reasoning ?? message.reasoning_content ?? message.thinking ?? message.thought
    if (deltaReasoning != null) {
      const text = toText(deltaReasoning)
      reasoning += text
      if (text) onDelta?.({ type: 'reasoning', delta: text, reasoning })
    } else if (messageReasoning != null) {
      const next = toText(messageReasoning)
      const text = reasoning && next.startsWith(reasoning) ? next.slice(reasoning.length) : next
      reasoning = next
      if (text) onDelta?.({ type: 'reasoning', delta: text, reasoning })
    }

    const toolCalls = delta.tool_calls || message.tool_calls
    if (Array.isArray(toolCalls)) {
      toolCalls.forEach((toolCall, fallbackIndex) => {
        const index = toolCall.index ?? fallbackIndex
        const previous = toolCallsByIndex.get(index) || {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' }
        }
        if (toolCall.id) previous.id = toolCall.id
        if (toolCall.call_id || toolCall.callId) previous.call_id = toolCall.call_id || toolCall.callId
        if (toolCall.type) previous.type = toolCall.type
        if (toolCall.function?.name) previous.function.name = toolCall.function.name
        if (toolCall.function?.arguments) {
          if (message.tool_calls === toolCalls) previous.function.arguments = toolCall.function.arguments
          else previous.function.arguments += toolCall.function.arguments
        }
        toolCallsByIndex.set(index, previous)
      })
      onDelta?.({ type: 'tool_calls', toolCalls: Array.from(toolCallsByIndex.values()) })
    }
  }

  await consumeJsonEventStream({ response, signal, isAborted, onJson: applyJson })
  return {
    content,
    reasoning,
    toolCalls: Array.from(toolCallsByIndex.values()),
    finishReason: finishReason || 'stop',
    usage,
    endpoint: 'chat-completions',
    payloads
  }
}

async function streamProviderChatCompletion(args = {}) {
  const configuredMode = normalizeProviderApiMode(args.apiMode)
  const automaticFallback = configuredMode === 'auto'
  const initialMode = configuredMode === 'auto'
    ? shouldPreferResponsesApiForModel(args.body?.model) ? 'responses' : 'chat-completions'
    : configuredMode

  if (initialMode === 'responses') {
    try {
      return await streamResponsesCompletionWithFallback(args)
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      if (!automaticFallback || !shouldFallbackResponsesToChatCompletions(error?.message || error)) throw error
    }
  }

  try {
    return await streamChatCompletions(args)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (!automaticFallback || !shouldFallbackChatCompletionsToResponses(error?.message || error)) throw error
    return streamResponsesCompletionWithFallback(args)
  }
}

module.exports = {
  streamProviderChatCompletion,
  _test: {
    normalizeProviderApiMode,
    shouldPreferResponsesApiForModel,
    shouldFallbackChatCompletionsToResponses,
    shouldFallbackResponsesToChatCompletions,
    shouldRetryResponsesWithoutStreaming,
    normalizeBaseUrl,
    buildResponsesRequestBodyFromChatBody,
    createResponsesStreamAccumulator,
    applyResponsesStreamEvent,
    finalizeResponsesStreamAccumulator
  }
}
