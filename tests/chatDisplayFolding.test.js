import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeUserMessageFolding,
  buildChatDisplayMessages,
  buildUserMessagePreview,
  ensureUniqueChatMessageIds,
  shouldShowChatAnchorRail
} from '../src/utils/chatDisplayFolding.js'

function tool(id, status = 'success', extra = {}) {
  return {
    id,
    role: 'tool',
    time: id,
    toolStatus: status,
    toolName: 'sandbox_run',
    ...extra
  }
}

test('long user messages become foldable by character or line count', () => {
  assert.equal(analyzeUserMessageFolding('a'.repeat(1601)).foldable, true)
  assert.equal(analyzeUserMessageFolding(Array.from({ length: 19 }, () => 'line').join('\n')).foldable, true)
  assert.equal(analyzeUserMessageFolding('short\nmessage').foldable, false)
})

test('user message preview is bounded by both lines and characters', () => {
  const content = Array.from({ length: 20 }, (_, index) => `line-${index}-${'x'.repeat(120)}`).join('\n')
  const preview = buildUserMessagePreview(content, { maxChars: 500, maxLines: 5 })

  assert.ok(preview.length <= 500)
  assert.ok(preview.startsWith('line-0-'))
  assert.doesNotMatch(preview, /line-5-/)
})

test('consecutive completed tool activities collapse into one stable display group', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'go' },
    tool('t1'),
    tool('t2'),
    tool('t3', 'error'),
    tool('t4')
  ]
  const display = buildChatDisplayMessages(messages, {
    resolveToolStatus: (message) => message.toolStatus
  })

  assert.equal(display.length, 2)
  assert.equal(display[1].role, 'tool_group')
  assert.equal(display[1].id, 'tool-activity-group-t1')
  assert.equal(display[1].toolGroupMessages.length, 4)
  assert.deepEqual(display[1].toolGroupCounts, {
    success: 3,
    error: 1,
    rejected: 0,
    stopped: 0
  })
})

test('two adjacent completed tool activities group early to avoid dense row churn', () => {
  const display = buildChatDisplayMessages([tool('t1'), tool('t2')], {
    resolveToolStatus: (message) => message.toolStatus
  })

  assert.equal(display.length, 1)
  assert.equal(display[0].role, 'tool_group')
  assert.equal(display[0].toolGroupMessages.length, 2)
})

test('tool activity groups stay stable while more completed tools append', () => {
  const options = { resolveToolStatus: (message) => message.toolStatus }
  const first = buildChatDisplayMessages([tool('t1'), tool('t2'), tool('t3'), tool('t4')], options)
  const second = buildChatDisplayMessages([tool('t1'), tool('t2'), tool('t3'), tool('t4'), tool('t5')], options)

  assert.equal(first[0].id, second[0].id)
})

test('live, media, and agent-run tools remain outside completed activity groups', () => {
  const messages = [
    tool('t1'),
    tool('t2'),
    tool('t3'),
    tool('t4'),
    tool('live', 'running'),
    tool('image', 'success', { images: [{ src: 'data:image/png;base64,x' }] }),
    tool('agent', 'success', { toolName: 'agent_run' })
  ]
  const display = buildChatDisplayMessages(messages, {
    resolveToolStatus: (message) => message.toolStatus
  })

  assert.equal(display[0].role, 'tool_group')
  assert.deepEqual(display.slice(1).map((message) => message.id), ['live', 'image', 'agent'])
})

test('expanded activity group state is supplied without mutating persisted messages', () => {
  const messages = [tool('t1'), tool('t2'), tool('t3'), tool('t4')]
  const display = buildChatDisplayMessages(messages, {
    resolveToolStatus: (message) => message.toolStatus,
    expandedToolGroupIds: new Set(['tool-activity-group-t1'])
  })

  assert.equal(display[0].toolGroupExpanded, true)
  assert.equal(Object.hasOwn(messages[0], 'toolGroupExpanded'), false)
})

test('message anchor rail remains available in compact layouts but hides in dense layouts', () => {
  assert.equal(shouldShowChatAnchorRail(4, { dense: false }), true)
  assert.equal(shouldShowChatAnchorRail(1, { dense: false }), false)
  assert.equal(shouldShowChatAnchorRail(4, { dense: true }), false)
})

test('loaded chat messages receive stable unique ids before virtualization', () => {
  let sequence = 0
  const messages = ensureUniqueChatMessageIds([
    { id: 'same', role: 'user', content: 'one' },
    { id: 'same', role: 'assistant', content: 'two' },
    { id: '', role: 'user', content: 'three' }
  ], () => `generated-${++sequence}`)

  assert.deepEqual(messages.map((message) => message.id), [
    'same',
    'generated-1',
    'generated-2'
  ])
  assert.equal(new Set(messages.map((message) => message.id)).size, messages.length)
})
