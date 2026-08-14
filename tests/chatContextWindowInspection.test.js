import test from 'node:test'
import assert from 'node:assert/strict'

import { buildChatContextWindow, inspectChatContextWindow } from '../src/utils/chatContextWindow.js'

const attachmentHeader = '\u3010\u9644\u4ef6\u5185\u5bb9\u3011'
const attachmentPrefix = '\u9644\u4ef6\uff1a'

test('inspectChatContextWindow exposes ordered entries for preview rendering', () => {
  const messages = [
    { role: 'system', content: 'system prelude' },
    { role: 'user', content: `${attachmentHeader}\n${attachmentPrefix}spec-a.pdf\n` + 'A'.repeat(800) },
    { role: 'assistant', content: 'spec a reply' },
    { role: 'user', content: 'plain turn 1' },
    { role: 'assistant', content: 'plain answer 1' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const options = {
    maxChars: 1800,
    maxMessages: 4,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    maxPreludeMessages: 1,
    maxPinnedAttachmentTurns: 4,
    toolPolicy: 'full'
  }

  const result = inspectChatContextWindow(messages, options)
  const direct = buildChatContextWindow(messages, options)

  assert.ok(Array.isArray(result.messages))
  assert.ok(Array.isArray(result.inspection.entries))
  assert.deepEqual(result.messages, direct)
  assert.ok(result.inspection.entries.length >= 1)
  assert.equal(result.inspection.entries.at(-1).mustKeep, true)
  assert.ok(result.inspection.entries.some((entry) => entry.mode === 'full'))
})

test('inspectChatContextWindow exposes omitted entries and reasons for preview diagnostics', () => {
  const messages = [
    { role: 'system', content: 'system prelude a' },
    { role: 'system', content: 'system prelude b' },
    { role: 'user', content: `${attachmentHeader}\n${attachmentPrefix}spec-a.pdf\n` + 'A'.repeat(400) },
    { role: 'assistant', content: 'spec a reply' },
    { role: 'user', content: 'plain turn 1' },
    { role: 'assistant', content: 'plain answer 1' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = inspectChatContextWindow(messages, {
    maxChars: 4000,
    maxMessages: 4,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    maxPreludeMessages: 1,
    maxPinnedAttachmentTurns: 0,
    toolPolicy: 'full'
  })

  // prelude keeps at most maxPreludeMessages; the latest turn is always kept;
  // older turns beyond maxMessages/maxTurns are dropped (Codex style).
  assert.deepEqual(
    result.messages.map((item) => item.content),
    ['system prelude a', 'latest user', 'latest answer']
  )
  assert.ok(Array.isArray(result.inspection.omittedEntries))

  const omittedSpecATurn = result.inspection.omittedEntries.find((entry) => entry.kind === 'turn' && entry.index === 0)
  assert.ok(omittedSpecATurn)
  assert.ok(
    omittedSpecATurn.reasons.includes('turn_limit') ||
      omittedSpecATurn.reasons.includes('message_limit') ||
      omittedSpecATurn.reasons.includes('char_limit')
  )

  const omittedPlainTurn = result.inspection.omittedEntries.find((entry) => entry.kind === 'turn' && entry.index === 1)
  assert.ok(omittedPlainTurn)
  assert.ok(
    omittedPlainTurn.reasons.includes('message_limit') ||
      omittedPlainTurn.reasons.includes('turn_limit') ||
      omittedPlainTurn.reasons.includes('char_limit')
  )
})

test('inspectChatContextWindow groups synthetic tool-vision messages into the tool turn and counts base64 payloads at full length', () => {
  const largeDataUrl = `data:image/png;base64,${'a'.repeat(200000)}`
  const result = inspectChatContextWindow([
    { role: 'user', content: 'view note image' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'notes_read', arguments: '{"path":"demo.md"}' }
        }
      ]
    },
    { role: 'tool', tool_call_id: 'call_1', content: '{"path":"demo.md","content":"demo"}' },
    {
      role: 'user',
      synthetic_tool_vision: true,
      content: [
        { type: 'text', text: 'system note: image from tool result' },
        { type: 'image_url', image_url: { url: largeDataUrl } }
      ]
    },
    { role: 'assistant', content: 'the image is a sample picture' }
  ], {
    maxChars: 2000,
    maxMessages: 20,
    maxTurns: 4,
    keepRecentTurnsFull: 4,
    maxPreludeMessages: 2,
    maxPinnedAttachmentTurns: 0,
    toolPolicy: 'full'
  })

  assert.equal(result.inspection.turnCount, 1)
  assert.equal(result.inspection.entries.length, 1)
  // base64 图片按真实长度计入预算（不再固定折算 256 字符）。
  assert.ok(result.inspection.entries[0].chars > 200000)
  assert.deepEqual(
    result.messages.map((message) => message.role),
    ['user', 'assistant', 'tool', 'user', 'assistant']
  )
  assert.equal(result.messages[3].synthetic_tool_vision, true)
})
