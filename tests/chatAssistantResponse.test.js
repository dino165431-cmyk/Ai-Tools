import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractAssistantTextFromPayload,
  extractAssistantTextFromPayloads
} from '../src/utils/chatAssistantResponse.js'
import {
  applyResponsesStreamEvent,
  buildResponsesRequestBodyFromChatBody,
  createResponsesStreamAccumulator,
  finalizeResponsesStreamAccumulator,
  shouldFallbackChatCompletionsToResponses,
  shouldRetryWithoutParallelToolCalls,
  shouldFallbackResponsesToChatCompletions,
  shouldPreferResponsesApiForModel,
  shouldRetryResponsesWithoutStreaming
} from '../src/utils/openaiResponsesCompat.js'

test('extractAssistantTextFromPayload reads responses-style output_text blocks', () => {
  const payload = {
    object: 'response',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '已经读完笔记，下面是总结。' }]
      }
    ]
  }

  assert.equal(extractAssistantTextFromPayload(payload), '已经读完笔记，下面是总结。')
})

test('extractAssistantTextFromPayloads joins streamed output_text delta events', () => {
  const payloads = [
    { type: 'response.output_text.delta', delta: '已经读完' },
    { type: 'response.output_text.delta', delta: '笔记。' },
    { type: 'response.completed' }
  ]

  assert.equal(extractAssistantTextFromPayloads(payloads), '已经读完笔记。')
})

test('extractAssistantTextFromPayload ignores binary-looking image fields', () => {
  const payload = {
    output: [
      {
        type: 'message',
        content: [{ type: 'image', b64_json: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8' }]
      }
    ]
  }

  assert.equal(extractAssistantTextFromPayload(payload), '')
})

test('buildResponsesRequestBodyFromChatBody converts messages, tools, and tool results', () => {
  const body = buildResponsesRequestBodyFromChatBody({
    model: 'capability-test-model',
    stream: true,
    parallel_tool_calls: true,
    reasoning_effort: 'high',
    max_tokens: 1200,
    messages: [
      { role: 'system', content: 'You are concise.' },
      { role: 'user', content: [{ type: 'text', text: 'Read this' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }] },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_lookup',
            type: 'function',
            function: { name: 'notes_read', arguments: '{"path":"a.md"}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call_lookup', content: 'note body' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'notes_read',
          description: 'Read a note',
          parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
        }
      }
    ],
    tool_choice: 'auto'
  })

  assert.equal(body.model, 'capability-test-model')
  assert.equal(body.instructions, 'You are concise.')
  assert.equal(body.parallel_tool_calls, true)
  assert.equal(body.reasoning.effort, 'high')
  assert.equal(body.max_output_tokens, 1200)
  assert.equal(body.tools[0].name, 'notes_read')
  assert.equal(body.input[0].role, 'user')
  assert.equal(body.input[0].content[0].type, 'input_text')
  assert.equal(body.input[0].content[1].type, 'input_image')
  assert.equal(body.input[1].type, 'function_call')
  assert.equal(body.input[1].id, 'fc_lookup')
  assert.equal(body.input[1].call_id, 'call_lookup')
  assert.equal(body.input[2].type, 'function_call_output')
  assert.equal(body.input[2].call_id, 'call_lookup')
})

test('applyResponsesStreamEvent converts text deltas and function calls', () => {
  const state = createResponsesStreamAccumulator()
  const events = []

  events.push(...applyResponsesStreamEvent(state, { type: 'response.output_text.delta', delta: 'Hello' }))
  events.push(...applyResponsesStreamEvent(state, { type: 'response.output_text.delta', delta: ' world' }))
  events.push(...applyResponsesStreamEvent(state, {
    type: 'response.output_item.done',
    item: {
      type: 'function_call',
      id: 'fc_lookup',
      call_id: 'call_lookup',
      name: 'notes_read',
      arguments: '{"path":"a.md"}'
    }
  }))

  const result = finalizeResponsesStreamAccumulator(state)
  assert.equal(result.content, 'Hello world')
  assert.equal(events.filter((evt) => evt.type === 'content').length, 2)
  assert.equal(result.toolCalls.length, 1)
  assert.equal(result.toolCalls[0].id, 'fc_lookup')
  assert.equal(result.toolCalls[0].call_id, 'call_lookup')
  assert.equal(result.toolCalls[0].function.name, 'notes_read')
})

test('shouldFallbackChatCompletionsToResponses recognizes Responses-only errors', () => {
  assert.equal(shouldFallbackChatCompletionsToResponses('This model is supported only in the Responses API.'), true)
  assert.equal(shouldFallbackChatCompletionsToResponses('Use /v1/responses instead.'), true)
  assert.equal(shouldFallbackChatCompletionsToResponses('rate limit exceeded'), false)
})

test('shouldPreferResponsesApiForModel uses OpenAI model capability segments', () => {
  assert.equal(shouldPreferResponsesApiForModel('family-pro'), true)
  assert.equal(shouldPreferResponsesApiForModel('vendor/family.pro.snapshot'), true)
  assert.equal(shouldPreferResponsesApiForModel('family-deep-research'), true)
  assert.equal(shouldPreferResponsesApiForModel('professional-assistant'), false)
  assert.equal(shouldPreferResponsesApiForModel('approach-model'), false)
})

test('Responses fallback helpers distinguish endpoint and streaming compatibility', () => {
  assert.equal(shouldFallbackResponsesToChatCompletions('Responses 请求失败（HTTP 404）：Not Found\nURL：https://api.example.com/responses'), true)
  assert.equal(shouldFallbackResponsesToChatCompletions('Responses 请求失败（HTTP 400）：invalid model'), false)
  assert.equal(shouldRetryResponsesWithoutStreaming('This model does not support streaming responses.'), true)
  assert.equal(shouldRetryResponsesWithoutStreaming('invalid api key'), false)
  assert.equal(shouldRetryWithoutParallelToolCalls("Unsupported parameter: 'parallel_tool_calls'."), true)
  assert.equal(shouldRetryWithoutParallelToolCalls('invalid api key'), false)
})
