import assert from 'node:assert/strict'
import test from 'node:test'

import providerChatRuntime from '../public/preload/utils/provider-chat-runtime.js'

const compat = providerChatRuntime._test

test('preload Chat Completions requests usage in streaming mode with a compatible fallback', () => {
  const body = {
    model: 'gpt-test',
    stream: true,
    stream_options: { include_obfuscation: false }
  }
  const withUsage = compat.withChatCompletionStreamUsage(body)

  assert.deepEqual(withUsage.stream_options, {
    include_obfuscation: false,
    include_usage: true
  })
  assert.equal(body.stream_options.include_usage, undefined)
  assert.deepEqual(
    compat.withoutChatCompletionStreamUsage(withUsage).stream_options,
    { include_obfuscation: false }
  )
  assert.equal(
    compat.shouldRetryWithoutChatCompletionStreamUsage('Unsupported parameter: stream_options.include_usage'),
    true
  )
  assert.equal(compat.shouldRetryWithoutChatCompletionStreamUsage('invalid api key'), false)
})

test('preload temperature compatibility helpers preserve the original request body', () => {
  const body = { model: 'gpt-test', temperature: 0.2, top_p: 0.9 }

  assert.deepEqual(compat.withoutTemperature(body), { model: 'gpt-test', top_p: 0.9 })
  assert.equal(body.temperature, 0.2)
  assert.equal(
    compat.shouldRetryWithoutTemperature("Unsupported parameter: 'temperature' is not supported with this model."),
    true
  )
  assert.equal(compat.shouldRetryWithoutTemperature('invalid api key'), false)
})

test('preload Responses conversion keeps item id and call id separate', () => {
  const body = compat.buildResponsesRequestBodyFromChatBody({
    model: 'gpt-test',
    messages: [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'fc_item_123',
          call_id: 'call_actual_456',
          type: 'function',
          function: { name: 'lookup', arguments: '{"q":"x"}' }
        }]
      },
      {
        role: 'tool',
        tool_call_id: 'fc_item_123',
        call_id: 'call_actual_456',
        content: 'done'
      }
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'lookup',
        description: 'Lookup',
        parameters: { type: 'object', properties: {} }
      }
    }]
  })

  assert.equal(body.input[0].id, 'fc_item_123')
  assert.equal(body.input[0].call_id, 'call_actual_456')
  assert.equal(body.input[1].type, 'function_call_output')
  assert.equal(body.input[1].call_id, 'call_actual_456')
  assert.equal(body.tools[0].name, 'lookup')
})

test('preload Responses stream keeps call_id from function call events', () => {
  const state = compat.createResponsesStreamAccumulator()
  compat.applyResponsesStreamEvent(state, {
    type: 'response.output_item.added',
    item: {
      type: 'function_call',
      id: 'fc_item_1',
      call_id: 'call_real_1',
      name: 'search',
      arguments: ''
    }
  })
  compat.applyResponsesStreamEvent(state, {
    type: 'response.function_call_arguments.delta',
    item_id: 'fc_item_1',
    delta: '{"query":'
  })
  compat.applyResponsesStreamEvent(state, {
    type: 'response.function_call_arguments.done',
    item_id: 'fc_item_1',
    call_id: 'call_real_1',
    name: 'search',
    arguments: '{"query":"notes"}'
  })

  const result = compat.finalizeResponsesStreamAccumulator(state)
  assert.equal(result.toolCalls[0].id, 'fc_item_1')
  assert.equal(result.toolCalls[0].call_id, 'call_real_1')
  assert.equal(result.toolCalls[0].function.arguments, '{"query":"notes"}')
})

test('preload Responses stream merges item_id and call_id aliases for one function call', () => {
  const state = compat.createResponsesStreamAccumulator()
  compat.applyResponsesStreamEvent(state, {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'function_call',
      id: 'fc_item_1',
      name: 'search',
      arguments: ''
    }
  })
  compat.applyResponsesStreamEvent(state, {
    type: 'response.function_call_arguments.done',
    output_index: 0,
    call_id: 'call_real_1',
    name: 'search',
    arguments: '{"query":"notes"}'
  })
  compat.applyResponsesStreamEvent(state, {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'function_call',
      id: 'fc_item_1',
      call_id: 'call_real_1',
      name: 'search',
      arguments: '{"query":"notes"}'
    }
  })

  const result = compat.finalizeResponsesStreamAccumulator(state)
  assert.equal(result.toolCalls.length, 1)
  assert.equal(result.toolCalls[0].id, 'fc_item_1')
  assert.equal(result.toolCalls[0].call_id, 'call_real_1')
  assert.equal(result.toolCalls[0].function.arguments, '{"query":"notes"}')
})

test('preload Responses stream ignores echoed input and reasoning text deltas', () => {
  const state = compat.createResponsesStreamAccumulator()
  const events = []

  events.push(...compat.applyResponsesStreamEvent(state, {
    type: 'response.input_text.delta',
    delta: '已调用工具：skill_call({...})'
  }))
  events.push(...compat.applyResponsesStreamEvent(state, {
    type: 'response.reasoning_summary_text.delta',
    delta: '内部推理'
  }))
  events.push(...compat.applyResponsesStreamEvent(state, {
    type: 'response.output_text.delta',
    delta: '最终回答'
  }))

  const result = compat.finalizeResponsesStreamAccumulator(state)
  assert.equal(result.content, '最终回答')
  assert.equal(result.reasoning, '内部推理')
  assert.deepEqual(events.filter((event) => event.type === 'content').map((event) => event.delta), ['最终回答'])
})

test('provider chat runtime honors explicit API mode and only auto mode crosses endpoints', async () => {
  const originalFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    if (String(url).endsWith('/responses')) {
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'responses-ok' }]
        }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'chat-ok' }, finish_reason: 'stop' }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const responsesResult = await providerChatRuntime.streamProviderChatCompletion({
      baseUrl: 'https://example.test/v1',
      apiKey: 'test',
      apiMode: 'responses',
      body: { model: 'gpt-test', stream: true, messages: [{ role: 'user', content: 'hi' }] }
    })
    assert.equal(responsesResult.endpoint, 'responses')
    assert.equal(responsesResult.content, 'responses-ok')
    assert.deepEqual(urls, ['https://example.test/v1/responses'])

    urls.length = 0
    const chatResult = await providerChatRuntime.streamProviderChatCompletion({
      baseUrl: 'https://example.test/v1',
      apiKey: 'test',
      apiMode: 'chat-completions',
      body: { model: 'gpt-test', stream: true, messages: [{ role: 'user', content: 'hi' }] }
    })
    assert.equal(chatResult.endpoint, 'chat-completions')
    assert.equal(chatResult.content, 'chat-ok')
    assert.deepEqual(urls, ['https://example.test/v1/chat/completions'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('provider chat runtime retries rejected temperature overrides across both API modes', async () => {
  const originalFetch = globalThis.fetch

  try {
    for (const apiMode of ['chat-completions', 'responses']) {
      const requestBodies = []
      globalThis.fetch = async (_url, options) => {
        requestBodies.push(JSON.parse(options.body))
        if (requestBodies.length === 1) {
          return new Response(JSON.stringify({
            error: { message: "Unsupported parameter: 'temperature' is not supported with this model." }
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        const responseText = apiMode === 'responses'
          ? 'data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed"}\n\n'
          : 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
        return new Response(responseText, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      }

      const result = await providerChatRuntime.streamProviderChatCompletion({
        baseUrl: 'https://example.test/v1',
        apiKey: 'test',
        apiMode,
        body: {
          model: 'gpt-test',
          stream: true,
          temperature: 0.2,
          messages: [{ role: 'user', content: 'hi' }]
        }
      })

      assert.equal(result.content, 'ok')
      assert.equal(requestBodies.length, 2)
      assert.equal(requestBodies[0].temperature, 0.2)
      assert.equal(Object.hasOwn(requestBodies[1], 'temperature'), false)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})
