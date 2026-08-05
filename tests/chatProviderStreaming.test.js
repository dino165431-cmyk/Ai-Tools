import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeChatProviderBaseUrl,
  safeJsonParse,
  stableStringify,
  streamChatCompletion
} from '../src/utils/chatProviderStreaming.js'

test('normalizeChatProviderBaseUrl accepts base and full endpoint URLs', () => {
  assert.equal(normalizeChatProviderBaseUrl('https://example.com/v1/chat/completions?x=1'), 'https://example.com/v1')
  assert.equal(normalizeChatProviderBaseUrl('https://example.com/chat/completions/'), 'https://example.com')
  assert.equal(normalizeChatProviderBaseUrl('https://example.com/v1/models'), 'https://example.com/v1')
})

test('JSON helpers expose parse errors and tolerate circular values', () => {
  assert.deepEqual(safeJsonParse('{"ok":true}'), { ok: true, value: { ok: true } })
  assert.equal(safeJsonParse('{').ok, false)

  const circular = {}
  circular.self = circular
  assert.equal(stableStringify(circular), '[object Object]')
})

test('streamChatCompletion retries the v1 endpoint after a 404', async (t) => {
  const originalFetch = globalThis.fetch
  const requestedUrls = []
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    if (requestedUrls.length === 1) return new Response('not found', { status: 404 })
    return new Response(
      'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    )
  }

  const deltas = []
  const result = await streamChatCompletion({
    baseUrl: 'https://example.com',
    apiKey: 'secret',
    apiMode: 'chat-completions',
    body: { model: 'test-model', messages: [], stream: true },
    onDelta: (event) => deltas.push(event)
  })

  assert.deepEqual(requestedUrls, [
    'https://example.com/chat/completions',
    'https://example.com/v1/chat/completions'
  ])
  assert.equal(result.content, 'hello')
  assert.equal(result.endpoint, 'chat-completions')
  assert.equal(deltas[0]?.delta, 'hello')
})

test('explicit Responses mode never falls back to Chat Completions', async (t) => {
  const originalFetch = globalThis.fetch
  const requestedUrls = []
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    return new Response('not found', { status: 404 })
  }

  await assert.rejects(
    streamChatCompletion({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      apiMode: 'responses',
      body: { model: 'test-model', messages: [], stream: true }
    }),
    /Responses 请求失败/
  )

  assert.deepEqual(requestedUrls, ['https://example.com/v1/responses'])
})

test('Chat Completions retries once without temperature when the model rejects it', async (t) => {
  const originalFetch = globalThis.fetch
  const requestBodies = []
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body))
    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported."
        }
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
    return new Response(
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    )
  }

  const result = await streamChatCompletion({
    baseUrl: 'https://example.com/v1',
    apiKey: 'secret',
    apiMode: 'chat-completions',
    body: { model: 'gpt-test', messages: [], stream: true, temperature: 0.2 }
  })

  assert.equal(result.content, 'ok')
  assert.equal(requestBodies.length, 2)
  assert.equal(requestBodies[0].temperature, 0.2)
  assert.equal(Object.hasOwn(requestBodies[1], 'temperature'), false)
})

test('Responses retries once without temperature when the model rejects it', async (t) => {
  const originalFetch = globalThis.fetch
  const requestBodies = []
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body))
    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        error: { message: "Unsupported parameter: 'temperature' is not supported with this model." }
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
    return new Response(
      'data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed"}\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    )
  }

  const result = await streamChatCompletion({
    baseUrl: 'https://example.com/v1',
    apiKey: 'secret',
    apiMode: 'responses',
    body: { model: 'gpt-test', messages: [], stream: true, temperature: 0.2 }
  })

  assert.equal(result.content, 'ok')
  assert.equal(requestBodies.length, 2)
  assert.equal(requestBodies[0].temperature, 0.2)
  assert.equal(Object.hasOwn(requestBodies[1], 'temperature'), false)
})
