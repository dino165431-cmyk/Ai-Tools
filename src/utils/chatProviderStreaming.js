import {
  applyResponsesStreamEvent,
  buildResponsesRequestBodyFromChatBody,
  createResponsesStreamAccumulator,
  finalizeResponsesStreamAccumulator,
  shouldFallbackChatCompletionsToResponses,
  shouldFallbackResponsesToChatCompletions,
  shouldPreferResponsesApiForModel,
  shouldRetryResponsesWithoutStreaming
} from './openaiResponsesCompat'
import {
  allowsAutomaticApiFallback,
  normalizeProviderApiMode,
  resolveChatApiMode
} from './providerModelConfig'
import {
  shouldRetryWithoutChatCompletionStreamUsage,
  shouldRetryWithoutTemperature,
  withChatCompletionStreamUsage,
  withoutChatCompletionStreamUsage,
  withoutTemperature
} from './chatRequestCompat'
import { extractAssistantTextFromPayload, extractAssistantTextFromPayloads } from './chatAssistantResponse'
import { consumeJsonEventStream } from './streamJsonEvents'
import { createAbortError, isAbortError } from './abortableRequest'

export function normalizeChatProviderBaseUrl(url) {
  const raw = String(url || '').trim()
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

export function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error }
  }
}

export function stableStringify(value, spaces = 2) {
  try {
    return JSON.stringify(value, null, spaces)
  } catch {
    return String(value)
  }
}

async function streamResponsesCompletion({
  baseUrl,
  apiKey,
  body,
  signal,
  onDelta,
  abortState = null,
  stream = true
}) {
  const base = normalizeChatProviderBaseUrl(baseUrl)
  const candidates = [`${base}/responses`]
  if (!/\/v1$/.test(base)) candidates.push(`${base}/v1/responses`)
  const throwIfStreamingAborted = () => {
    if (abortState?.aborted || signal?.aborted) throw createAbortError()
  }

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
        body: JSON.stringify(buildResponsesRequestBodyFromChatBody(body, { stream })),
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

  if (!response) {
    throw lastNetworkError || new Error('Request failed: no response received')
  }

  if (!response.ok) {
    const responseText = await response.text()
    const parsedResponse = safeJsonParse(responseText)
    const errorJson = parsedResponse.ok ? parsedResponse.value : null
    const detail = errorJson?.error?.message || (parsedResponse.ok ? stableStringify(errorJson) : responseText)
    throw new Error(`Responses 请求失败（HTTP ${response.status}）：${detail || response.statusText}\nURL：${usedUrl}`)
  }

  if (!stream) {
    const responseText = await response.text()
    const parsedResponse = safeJsonParse(responseText)
    if (!parsedResponse.ok) {
      throw new Error(`Responses 请求失败：无法解析 JSON 响应\nURL：${usedUrl}`)
    }
    const state = createResponsesStreamAccumulator()
    applyResponsesStreamEvent(state, parsedResponse.value)
    const result = finalizeResponsesStreamAccumulator(state)
    result.endpoint = 'responses'
    result.payloads = [parsedResponse.value]
    if (!String(result.content || '').trim()) {
      result.content = extractAssistantTextFromPayload(parsedResponse.value)
    }
    return result
  }

  const state = createResponsesStreamAccumulator()
  await consumeJsonEventStream({
    response,
    signal,
    isAborted: () => {
      throwIfStreamingAborted()
      return !!abortState?.aborted
    },
    onJson: (json) => {
      throwIfStreamingAborted()
      const events = applyResponsesStreamEvent(state, json)
      events.forEach((event) => onDelta?.(event))
    }
  })

  const result = finalizeResponsesStreamAccumulator(state)
  result.endpoint = 'responses'
  if (!String(result.content || '').trim() && result.payloads.length) {
    result.content = extractAssistantTextFromPayloads(result.payloads)
  }
  return result
}

async function streamResponsesCompletionWithFallback(args) {
  let requestBody = args?.body
  let useStreaming = true
  let retriedWithoutTemperature = false

  while (true) {
    try {
      return await streamResponsesCompletion({ ...args, body: requestBody, stream: useStreaming })
    } catch (error) {
      if (isAbortError(error) || args?.abortState?.aborted || args?.signal?.aborted) throw createAbortError()
      const errorText = error?.message || error
      if (useStreaming && shouldRetryResponsesWithoutStreaming(errorText)) {
        useStreaming = false
        continue
      }
      if (
        !retriedWithoutTemperature &&
        Object.prototype.hasOwnProperty.call(requestBody || {}, 'temperature') &&
        shouldRetryWithoutTemperature(errorText)
      ) {
        retriedWithoutTemperature = true
        requestBody = withoutTemperature(requestBody)
        continue
      }
      throw error
    }
  }
}

export async function streamChatCompletion({
  baseUrl,
  apiKey,
  apiMode = 'auto',
  body,
  signal,
  onDelta,
  abortState = null
}) {
  const base = normalizeChatProviderBaseUrl(baseUrl)
  const candidates = [`${base}/chat/completions`]
  if (!/\/v1$/.test(base)) candidates.push(`${base}/v1/chat/completions`)
  const throwIfStreamingAborted = () => {
    if (abortState?.aborted || signal?.aborted) throw createAbortError()
  }

  const configuredApiMode = normalizeProviderApiMode(apiMode)
  const automaticApiFallback = allowsAutomaticApiFallback(configuredApiMode)
  const initialApiMode = resolveChatApiMode({
    configuredMode: configuredApiMode,
    preferResponses: shouldPreferResponsesApiForModel(body?.model)
  })

  if (initialApiMode === 'responses') {
    try {
      return await streamResponsesCompletionWithFallback({ baseUrl, apiKey, body, signal, onDelta, abortState })
    } catch (error) {
      if (isAbortError(error) || abortState?.aborted || signal?.aborted) throw createAbortError()
      if (!automaticApiFallback || !shouldFallbackResponsesToChatCompletions(error?.message || error)) throw error
    }
  }

  let response = null
  let usedUrl = candidates[0]
  let lastNetworkError = null
  let requestBody = withChatCompletionStreamUsage(body)
  let retriedWithoutStreamUsage = false
  let retriedWithoutTemperature = false

  while (true) {
    response = null
    lastNetworkError = null
    for (const url of candidates) {
      usedUrl = url
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody),
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

    if (!response) {
      throw lastNetworkError || new Error('Request failed: no response received')
    }
    if (response.ok) break

    const responseText = await response.text()
    const parsedResponse = safeJsonParse(responseText)
    const errorJson = parsedResponse.ok ? parsedResponse.value : null
    const detail = errorJson?.error?.message || (parsedResponse.ok ? stableStringify(errorJson) : responseText)
    const errorText = `请求失败（HTTP ${response.status}）：${detail || response.statusText}\nURL：${usedUrl}`
    if (!retriedWithoutStreamUsage && shouldRetryWithoutChatCompletionStreamUsage(errorText)) {
      retriedWithoutStreamUsage = true
      requestBody = withoutChatCompletionStreamUsage(requestBody)
      continue
    }
    if (
      !retriedWithoutTemperature &&
      Object.prototype.hasOwnProperty.call(requestBody || {}, 'temperature') &&
      shouldRetryWithoutTemperature(errorText)
    ) {
      retriedWithoutTemperature = true
      requestBody = withoutTemperature(requestBody)
      continue
    }
    if (automaticApiFallback && shouldFallbackChatCompletionsToResponses(errorText)) {
      return await streamResponsesCompletionWithFallback({ baseUrl, apiKey, body, signal, onDelta, abortState })
    }
    throw new Error(errorText)
  }

  const toText = (value) => {
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

  let content = ''
  let reasoning = ''
  let finishReason = null
  let usage = null
  const toolCallsByIndex = new Map()
  const payloadSnapshots = []

  const finalize = () => ({
    content,
    reasoning,
    toolCalls: Array.from(toolCallsByIndex.values()),
    finishReason: finishReason || 'stop',
    usage,
    endpoint: 'chat-completions',
    payloads: payloadSnapshots.slice()
  })

  const applyJson = (json) => {
    throwIfStreamingAborted()
    if (!json || typeof json !== 'object') return
    payloadSnapshots.push(json)
    const responseUsage = json?.usage || json?.response?.usage
    if (responseUsage && typeof responseUsage === 'object') usage = responseUsage

    if (json?.error) {
      const errorText = json?.error?.message || stableStringify(json.error)
      throw new Error(`请求失败：${errorText}\nURL：${usedUrl}`)
    }

    const choice = json?.choices?.[0] || {}
    const delta = choice.delta || {}
    const message = choice.message || {}

    if (choice.finish_reason) finishReason = choice.finish_reason

    const deltaContent = delta.content ?? delta.text
    if (deltaContent != null) {
      const deltaText = toText(deltaContent)
      if (deltaText) {
        content += deltaText
        onDelta?.({ type: 'content', delta: deltaText, content })
      }
    } else if (message?.content != null) {
      const next = toText(message.content)
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
    const messageReasoning = message.reasoning ?? message.reasoning_content ?? message.thinking ?? message.thought
    if (deltaReasoning != null) {
      const deltaText = toText(deltaReasoning)
      if (deltaText) {
        reasoning += deltaText
        onDelta?.({ type: 'reasoning', delta: deltaText, reasoning })
      }
    } else if (messageReasoning != null) {
      const next = toText(messageReasoning)
      const deltaText = reasoning && next.startsWith(reasoning) ? next.slice(reasoning.length) : next
      reasoning = next
      if (deltaText) onDelta?.({ type: 'reasoning', delta: deltaText, reasoning })
    }

    const legacyFunctionCall = delta.function_call || message.function_call
    const deltaToolCalls = delta.tool_calls
    if (Array.isArray(deltaToolCalls)) {
      deltaToolCalls.forEach((toolCall) => {
        const index = toolCall.index ?? 0
        const previous = toolCallsByIndex.get(index) || {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' }
        }
        if (toolCall.id) previous.id = toolCall.id
        if (toolCall.call_id || toolCall.callId) previous.call_id = toolCall.call_id || toolCall.callId
        if (toolCall.type) previous.type = toolCall.type
        if (toolCall.function?.name) previous.function.name = toolCall.function.name
        if (toolCall.function?.arguments) previous.function.arguments += toolCall.function.arguments
        toolCallsByIndex.set(index, previous)
      })
      onDelta?.({ type: 'tool_calls', toolCalls: Array.from(toolCallsByIndex.values()) })
    } else if (Array.isArray(message?.tool_calls)) {
      message.tool_calls.forEach((toolCall, indexValue) => {
        const index = toolCall.index ?? indexValue
        toolCallsByIndex.set(index, {
          id: toolCall.id || '',
          type: toolCall.type || 'function',
          ...((toolCall.call_id || toolCall.callId) ? { call_id: toolCall.call_id || toolCall.callId } : {}),
          function: {
            name: toolCall.function?.name || '',
            arguments: toolCall.function?.arguments || ''
          }
        })
      })
      if (toolCallsByIndex.size) {
        onDelta?.({ type: 'tool_calls', toolCalls: Array.from(toolCallsByIndex.values()) })
      }
    } else if (legacyFunctionCall && typeof legacyFunctionCall === 'object') {
      const previous = toolCallsByIndex.get(0) || {
        id: `call_legacy_${Date.now().toString(16)}`,
        type: 'function',
        function: { name: '', arguments: '' }
      }
      if (legacyFunctionCall.name) previous.function.name = legacyFunctionCall.name
      if (legacyFunctionCall.arguments) {
        if (message.function_call === legacyFunctionCall) {
          previous.function.arguments = legacyFunctionCall.arguments
        } else {
          previous.function.arguments += legacyFunctionCall.arguments
        }
      }
      toolCallsByIndex.set(0, previous)
      onDelta?.({ type: 'tool_calls', toolCalls: Array.from(toolCallsByIndex.values()) })
    }
  }

  await consumeJsonEventStream({
    response,
    signal,
    isAborted: () => !!abortState?.aborted,
    onJson: applyJson
  })

  if (!String(content || '').trim() && payloadSnapshots.length) {
    content = extractAssistantTextFromPayloads(payloadSnapshots)
  }

  return finalize()
}
