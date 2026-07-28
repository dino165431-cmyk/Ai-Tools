import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChatRequestMessages,
  coerceToolStateMessageToPlainText
} from '../src/utils/chatRequestMessages.js'

test('tool state can fall back to bounded assistant text', () => {
  const result = coerceToolStateMessageToPlainText({
    role: 'tool',
    tool_call_id: 'call_1',
    content: 'done'
  })

  assert.deepEqual(result, {
    role: 'assistant',
    content: '工具结果（call_1）：\ndone'
  })
})

test('request messages normalize call ids and reasoning fields without mutating source', () => {
  const sourceMessages = [
    {
      role: 'assistant',
      content: '',
      reasoning: { step: 1 },
      tool_calls: [
        {
          id: 'call_abc',
          type: 'function',
          function: { name: 'read_file', arguments: '{}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call_abc', content: 'ok' }
  ]

  const result = buildChatRequestMessages({
    systemContent: 'system',
    sourceMessages,
    needsReasoningContent: true,
    compatToolCallIdAsFc: true
  })

  assert.equal(result[0].role, 'system')
  assert.equal(result[1].tool_calls[0].id, 'fc_abc')
  assert.equal(result[1].tool_calls[0].call_id, 'call_abc')
  assert.deepEqual(JSON.parse(result[1].reasoning_content), { step: 1 })
  assert.equal(result[2].tool_call_id, 'fc_abc')
  assert.equal(result[2].call_id, 'call_abc')
  assert.equal(sourceMessages[0].tool_calls[0].id, 'call_abc')
  assert.equal(sourceMessages[0].reasoning_content, undefined)
})

test('request messages replace unsupported vision content and remove internal metadata', () => {
  const result = buildChatRequestMessages({
    sourceMessages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: '看看图片' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }
        ],
        vision_fallback_text: '图片替代说明',
        synthetic_tool_vision: true
      }
    ],
    fallbackAllVisionMessages: true
  })

  assert.equal(result[0].content, '图片替代说明')
  assert.equal('vision_fallback_text' in result[0], false)
  assert.equal('synthetic_tool_vision' in result[0], false)
})
