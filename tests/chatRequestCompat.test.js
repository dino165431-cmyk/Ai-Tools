import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createToolResultApiMessage,
  formatToolResultContentForModel,
  hasAssistantReasoningContent,
  isDeepSeekReasonerModel,
  normalizeAssistantToolCalls,
  sanitizeRequestToolMessages,
  shouldIncludeReasoningContent,
  shouldRetryWithReasoningContent,
  shouldRetryWithoutChatCompletionStreamUsage,
  withChatCompletionStreamUsage,
  withoutChatCompletionStreamUsage
} from '../src/utils/chatRequestCompat.js'

test('tool history helpers preserve distinct Responses item id and call_id', () => {
  const [toolCall] = normalizeAssistantToolCalls([
    {
      id: 'fc_lookup',
      call_id: 'call_lookup',
      type: 'function',
      function: { name: 'notes_read', arguments: '{"path":"demo.md"}' }
    }
  ])
  const toolResult = createToolResultApiMessage(toolCall, 'note body')

  assert.equal(toolCall.id, 'fc_lookup')
  assert.equal(toolCall.call_id, 'call_lookup')
  assert.equal(toolResult.tool_call_id, 'fc_lookup')
  assert.equal(toolResult.call_id, 'call_lookup')
  assert.equal(toolResult.content, 'note body')
})

test('failed tool results carry an explicit host-controlled failure marker for the model', () => {
  const toolCall = {
    id: 'call_pack',
    type: 'function',
    function: { name: 'sandbox_run', arguments: '{"command":"npm run pack"}' }
  }
  const rawResult = JSON.stringify({
    ok: false,
    exitCode: 1,
    stdout: 'dependencies installed',
    changedFiles: [{ path: 'partial-output.exe' }]
  })
  const toolResult = createToolResultApiMessage(toolCall, rawResult, { ok: false })

  assert.ok(toolResult.content.startsWith('[TOOL_EXECUTION_STATUS: FAILED]'))
  assert.match(toolResult.content, /不得把下面的部分输出、日志或已生成文件解释为整体成功/)
  assert.match(toolResult.content, /"exitCode":1/)
  assert.match(toolResult.content, /partial-output\.exe/)
})

test('tool result failure formatting is status-aware and idempotent', () => {
  const stopped = formatToolResultContentForModel('重复调用已停止', { status: 'stopped' })

  assert.ok(stopped.startsWith('[TOOL_EXECUTION_STATUS: FAILED]'))
  assert.match(stopped, /状态：stopped/)
  assert.equal(
    formatToolResultContentForModel(stopped, { ok: false }),
    stopped
  )
})

test('normalizeAssistantToolCalls deduplicates repeated entries with the same call_id', () => {
  const toolCalls = normalizeAssistantToolCalls([
    {
      id: 'fc_lookup',
      call_id: 'call_lookup',
      type: 'function',
      function: { name: 'notes_read', arguments: '' }
    },
    {
      id: 'call_lookup',
      call_id: 'call_lookup',
      type: 'function',
      function: { name: 'notes_read', arguments: '{"path":"demo.md"}' }
    }
  ])

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].id, 'fc_lookup')
  assert.equal(toolCalls[0].call_id, 'call_lookup')
  assert.equal(toolCalls[0].function.arguments, '{"path":"demo.md"}')
})

test('isDeepSeekReasonerModel recognizes DeepSeek reasoner variants', () => {
  assert.equal(isDeepSeekReasonerModel('deepseek-reasoner'), true)
  assert.equal(isDeepSeekReasonerModel('deepseek-r1'), true)
  assert.equal(isDeepSeekReasonerModel('deepseek-chat'), false)
})

test('hasAssistantReasoningContent detects direct export behavior', () => {
  assert.equal(hasAssistantReasoningContent([{ role: 'assistant', reasoning: 'think' }]), true)
})

test('hasAssistantReasoningContent detects assistant reasoning payloads', () => {
  assert.equal(
    hasAssistantReasoningContent([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi', reasoning_content: 'step 1' }
    ]),
    true
  )
  assert.equal(
    hasAssistantReasoningContent([
      { role: 'assistant', content: 'hi', reasoning_content: '   ' }
    ]),
    false
  )
})

test('shouldIncludeReasoningContent keeps reasoning for DeepSeek chats with prior reasoning history', () => {
  assert.equal(
    shouldIncludeReasoningContent({
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiMessages: [
        { role: 'assistant', content: 'answer', reasoning_content: 'thinking trace' }
      ]
    }),
    true
  )
  assert.equal(
    shouldIncludeReasoningContent({
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiMessages: [{ role: 'assistant', content: 'answer' }]
    }),
    false
  )
})

test('shouldIncludeReasoningContent does not force reasoning for non-DeepSeek endpoints with prior reasoning history', () => {
  assert.equal(
    shouldIncludeReasoningContent({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      apiMessages: [
        { role: 'assistant', content: 'answer', reasoning_content: 'thinking trace' }
      ]
    }),
    false
  )
})

test('shouldRetryWithReasoningContent recognizes DeepSeek thinking-mode validation errors', () => {
  assert.equal(
    shouldRetryWithReasoningContent('The `reasoning_content` in the thinking mode must be passed back to the API.'),
    true
  )
  assert.equal(
    shouldRetryWithReasoningContent('assistant reasoning_content is missing from the previous turn'),
    true
  )
  assert.equal(
    shouldRetryWithReasoningContent('invalid api key'),
    false
  )
})

test('stream usage helpers request final usage and support compatibility fallback', () => {
  const body = {
    model: 'test',
    stream: true,
    stream_options: { include_obfuscation: false }
  }
  const withUsage = withChatCompletionStreamUsage(body)
  assert.deepEqual(withUsage.stream_options, {
    include_obfuscation: false,
    include_usage: true
  })
  assert.equal(body.stream_options.include_usage, undefined)
  assert.equal(withoutChatCompletionStreamUsage(withUsage).stream_options, undefined)
  assert.equal(
    shouldRetryWithoutChatCompletionStreamUsage('Unsupported parameter: stream_options.include_usage'),
    true
  )
  assert.equal(shouldRetryWithoutChatCompletionStreamUsage('invalid api key'), false)
})

test('sanitizeRequestToolMessages keeps tool call ids aligned in fc compatibility mode', () => {
  const result = sanitizeRequestToolMessages(
    [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_lookup',
            type: 'function',
            function: { name: 'notes_read', arguments: '{"path":"demo.md"}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call_lookup', content: 'note body' },
      { role: 'assistant', content: 'done' }
    ],
    { compatToolCallIdAsFc: true }
  )

  assert.equal(result[0].tool_calls?.[0]?.id, 'fc_lookup')
  assert.equal(result[0].tool_calls?.[0]?.call_id, 'call_lookup')
  assert.equal(result[1].tool_call_id, 'fc_lookup')
  assert.equal(result[1].call_id, 'call_lookup')
})

test('sanitizeRequestToolMessages drops orphan tool messages', () => {
  const result = sanitizeRequestToolMessages([
    { role: 'system', content: 'You are concise.' },
    { role: 'tool', tool_call_id: 'call_missing', content: 'orphan tool result' },
    { role: 'user', content: 'hello' }
  ])

  assert.deepEqual(result, [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'hello' }
  ])
})

test('sanitizeRequestToolMessages strips incomplete tool call state before later user turns', () => {
  const result = sanitizeRequestToolMessages([
    {
      role: 'assistant',
      content: 'Checking tools',
      tool_calls: [
        {
          id: 'call_lookup',
          type: 'function',
          function: { name: 'notes_read', arguments: '{}' }
        }
      ]
    },
    { role: 'user', content: 'continue' }
  ])

  assert.deepEqual(result, [
    { role: 'assistant', content: 'Checking tools' },
    { role: 'user', content: 'continue' }
  ])
})

test('sanitizeRequestToolMessages preserves complete tool call blocks', () => {
  const result = sanitizeRequestToolMessages([
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_lookup',
          type: 'function',
          function: { name: 'notes_read', arguments: '{}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call_lookup', content: 'tool result' },
    { role: 'user', content: 'continue' }
  ])

  assert.deepEqual(result, [
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_lookup',
          type: 'function',
          function: { name: 'notes_read', arguments: '{}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call_lookup', content: 'tool result' },
    { role: 'user', content: 'continue' }
  ])
})
