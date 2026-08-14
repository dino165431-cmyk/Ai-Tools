import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChatContextWindow,
  inspectChatContextWindow,
  resolveChatContextWindowOptions,
  shouldSummarizeContextWindow
} from '../src/utils/chatContextWindow.js'

const attachmentHeader = '\u3010\u9644\u4ef6\u5185\u5bb9\u3011'
const attachmentPrefix = '\u9644\u4ef6\uff1a'

test('buildChatContextWindow preserves full tool results for selected turns', () => {
  const messages = [
    { role: 'user', content: 'old user' },
    {
      role: 'assistant',
      content: 'old preamble',
      tool_calls: [{ id: 'call_old', type: 'function', function: { name: 'search', arguments: '{"q":"demo"}' } }]
    },
    { role: 'tool', tool_call_id: 'call_old', content: 'very large tool result' },
    { role: 'assistant', content: 'old final answer' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 10000,
    maxMessages: 20,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    toolPolicy: 'full'
  })

  assert.deepEqual(
    result.map((item) => ({ role: item.role, content: item.content, tool_calls: item.tool_calls })),
    [
      { role: 'user', content: 'old user', tool_calls: undefined },
      {
        role: 'assistant',
        content: 'old preamble',
        tool_calls: [{ id: 'call_old', type: 'function', function: { name: 'search', arguments: '{"q":"demo"}' } }]
      },
      { role: 'tool', content: 'very large tool result', tool_calls: undefined },
      { role: 'assistant', content: 'old final answer', tool_calls: undefined },
      { role: 'user', content: 'latest user', tool_calls: undefined },
      { role: 'assistant', content: 'latest answer', tool_calls: undefined }
    ]
  )
  assert.equal(result[1].tool_calls?.[0]?.id, 'call_old')
  assert.ok(result.some((item) => item.role === 'tool'))
})

test('buildChatContextWindow always keeps the latest turn even when it exceeds the nominal budget', () => {
  const messages = [
    { role: 'user', content: 'old user' },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'x'.repeat(400) }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 40,
    maxMessages: 1,
    maxTurns: 1,
    keepRecentTurnsFull: 1,
    toolPolicy: 'full'
  })

  assert.deepEqual(result.map((item) => item.content), ['latest user', 'x'.repeat(400)])
})

test('buildChatContextWindow keeps the latest attachment turn complete even when it exceeds the budget', () => {
  const messages = [
    { role: 'user', content: 'old user' },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: `${attachmentHeader}\n${attachmentPrefix}big.pdf\n${'A'.repeat(8000)}` },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = inspectChatContextWindow(messages, {
    maxChars: 500,
    maxMessages: 4,
    maxTurns: 1,
    keepRecentTurnsFull: 1,
    toolPolicy: 'full'
  })

  assert.equal(result.messages.length, 2)
  assert.equal(result.inspection.entries.at(-1)?.mustKeep, true)
  assert.equal(result.inspection.entries.at(-1)?.variant, 'full')
  assert.ok(result.inspection.entries.at(-1)?.chars > 500)
  assert.ok(String(result.messages[0]?.content || '').includes('big.pdf'))
})

test('buildChatContextWindow strips tool state for plain-text providers', () => {
  const messages = [
    { role: 'user', content: 'first user' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{}' } }]
    },
    { role: 'tool', tool_call_id: 'call_1', content: 'tool result' },
    { role: 'assistant', content: 'first final' },
    { role: 'user', content: 'second user' },
    {
      role: 'assistant',
      content: 'second answer',
      tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'noop', arguments: '{}' } }]
    }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 10000,
    maxMessages: 20,
    maxTurns: 3,
    keepRecentTurnsFull: 3,
    toolPolicy: 'strip'
  })

  assert.ok(!result.some((item) => item.role === 'tool'))
  assert.ok(!result.some((item) => Array.isArray(item.tool_calls)))
  assert.deepEqual(
    result.map((item) => ({ role: item.role, content: item.content })),
    [
      { role: 'user', content: 'first user' },
      { role: 'assistant', content: 'first final' },
      { role: 'user', content: 'second user' },
      { role: 'assistant', content: 'second answer' }
    ]
  )
})

test('buildChatContextWindow drops tool-heavy turns instead of compacting them when budget is tight', () => {
  const hugeToolResult = 'tool payload\n' + 'A'.repeat(6000)
  const messages = [
    { role: 'user', content: 'old user' },
    {
      role: 'assistant',
      content: 'old preamble',
      tool_calls: [{ id: 'call_old', type: 'function', function: { name: 'search', arguments: '{"q":"demo"}' } }]
    },
    { role: 'tool', tool_call_id: 'call_old', content: hugeToolResult },
    { role: 'assistant', content: 'old final answer' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 2600,
    maxMessages: 20,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    toolPolicy: 'full',
  })

  assert.deepEqual(result.map((item) => item.content), ['latest user', 'latest answer'])
  assert.ok(!result.some((item) => item.role === 'tool'))
})

test('buildChatContextWindow keeps recent turns and drops older turns beyond the limits', () => {
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'attach context\n\n' + attachmentHeader + '\n' + attachmentPrefix + 'design.png\nlayout title\nactions\nsave,publish'
        },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,' + 'a'.repeat(4000)
          }
        }
      ]
    },
    { role: 'assistant', content: 'old attachment answer' },
    { role: 'user', content: 'plain turn should be evicted' },
    { role: 'assistant', content: 'plain answer' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 10000,
    maxMessages: 4,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    maxPinnedAttachmentTurns: 2,
    toolPolicy: 'full'
  })

  assert.equal(result.length, 4)
  assert.deepEqual(result.map((item) => item.content), [
    'plain turn should be evicted',
    'plain answer',
    'latest user',
    'latest answer'
  ])
  assert.ok(!result.some((item) => Array.isArray(item.content)))
})

test('buildChatContextWindow drops the attachment turn when budget is tight', () => {
  const messages = [
    {
      role: 'user',
      content: `${attachmentHeader}\n${attachmentPrefix}spec-a.pdf\n${'A'.repeat(4000)}`
    },
    { role: 'assistant', content: 'reply' },
    { role: 'user', content: 'plain turn 1' },
    { role: 'assistant', content: 'plain answer 1' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 1000,
    maxMessages: 5,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    maxPinnedAttachmentTurns: 1,
    toolPolicy: 'full'
  })

  assert.equal(result.length, 4)
  assert.deepEqual(result.map((item) => item.content), [
    'plain turn 1',
    'plain answer 1',
    'latest user',
    'latest answer'
  ])
  assert.ok(!result.some((item) => String(item.content || '').includes('spec-a.pdf')))
})

test('buildChatContextWindow keeps only the latest turn when char budget is very small', () => {
  const messages = [
    {
      role: 'user',
      content: `${'L'.repeat(100)}\n${attachmentHeader}\n${attachmentPrefix}spec-b.pdf\n${'A'.repeat(600)}`
    },
    { role: 'assistant', content: 'reply' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 430,
    maxMessages: 6,
    maxTurns: 1,
    keepRecentTurnsFull: 1,
    maxPinnedAttachmentTurns: 1,
    toolPolicy: 'full'
  })

  assert.deepEqual(result.map((item) => item.content), ['latest user', 'latest answer'])
})

test('buildChatContextWindow keeps the latest attachment turn complete when maxTurns is 1', () => {
  const messages = [
    { role: 'user', content: 'older turn' },
    { role: 'assistant', content: 'older answer' },
    {
      role: 'user',
      content: `${'L'.repeat(100)}\n${attachmentHeader}\n${attachmentPrefix}spec-c.pdf\n${'A'.repeat(600)}`
    }
  ]

  const result = inspectChatContextWindow(messages, {
    maxChars: 430,
    maxMessages: 6,
    maxTurns: 1,
    keepRecentTurnsFull: 1,
    toolPolicy: 'full'
  })

  assert.equal(result.messages.length, 1)
  assert.equal(result.inspection.entries.at(-1)?.mustKeep, true)
  assert.equal(result.inspection.entries.at(-1)?.variant, 'full')
  assert.ok(String(result.messages[0]?.content || '').includes('spec-c.pdf'))
  assert.ok(result.inspection.entries.at(-1)?.chars > 430)
})

test('buildChatContextWindow drops the old attachment turn instead of truncating its text', () => {
  const longAttachmentText = 'continue with attachment\n\n' + attachmentHeader + '\n' + attachmentPrefix + 'manual.pdf\n' + 'A'.repeat(5000)
    + '\nsandbox_workspace_id: chat-history-1\nsandbox_path: inbox/manual.pdf'
  const messages = [
    { role: 'user', content: longAttachmentText },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 2600,
    maxMessages: 6,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    toolPolicy: 'full'
  })

  assert.deepEqual(result.map((item) => item.content), ['latest user', 'latest answer'])
  assert.ok(!result.some((item) => String(item.content || '').includes('manual.pdf')))
})

test('buildChatContextWindow drops the oversized plain turn instead of tightening it', () => {
  const messages = [
    { role: 'user', content: 'oldest user' },
    { role: 'assistant', content: 'oldest answer' },
    { role: 'user', content: 'older user' },
    { role: 'assistant', content: 'older answer' },
    { role: 'user', content: 'U'.repeat(2200) },
    { role: 'assistant', content: 'A'.repeat(1800) },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = inspectChatContextWindow(messages, {
    maxChars: 3300,
    maxMessages: 8,
    maxTurns: 4,
    keepRecentTurnsFull: 1,
    toolPolicy: 'full'
  })

  assert.deepEqual(
    result.messages.map((item) => item.content),
    ['oldest user', 'oldest answer', 'older user', 'older answer', 'latest user', 'latest answer']
  )
  assert.ok(result.inspection.entries.every((entry) => entry.variant === 'full'))
  assert.ok(result.inspection.omittedEntries.some((entry) => entry.index === 2))
})

test('buildChatContextWindow keeps the recent attachment turn and drops older plain turns when budget is tight', () => {
  const messages = [
    {
      role: 'user',
      content: `${attachmentHeader}\n${attachmentPrefix}spec-a.pdf\n` + 'A'.repeat(800)
    },
    { role: 'assistant', content: 'spec a reply' },
    { role: 'user', content: 'plain turn 1' },
    { role: 'assistant', content: 'plain answer 1' },
    {
      role: 'user',
      content: `${attachmentHeader}\n${attachmentPrefix}spec-b.pdf\n` + 'B'.repeat(800)
    },
    { role: 'assistant', content: 'spec b reply' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const result = buildChatContextWindow(messages, {
    maxChars: 1800,
    maxMessages: 4,
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    maxPinnedAttachmentTurns: 2,
    toolPolicy: 'full'
  })

  assert.equal(result.length, 4)
  assert.deepEqual(result.map((item) => item.role), ['user', 'assistant', 'user', 'assistant'])
  assert.ok(String(result[0].content || '').includes('spec-b.pdf'))
  assert.ok(!result.some((item) => item.content === 'plain turn 1'))
  assert.ok(!result.some((item) => String(item.content || '').includes('spec-a.pdf')))
  assert.deepEqual(result.slice(-2).map((item) => item.content), ['latest user', 'latest answer'])
})

test('recent history focus prefers recent contiguous turns over older attachment recovery', () => {
  const messages = [
    {
      role: 'user',
      content: `${attachmentHeader}\n${attachmentPrefix}spec-a.pdf\n` + 'A'.repeat(800)
    },
    { role: 'assistant', content: 'spec a reply' },
    { role: 'user', content: 'plain turn 1' },
    { role: 'assistant', content: 'plain answer 1' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const options = resolveChatContextWindowOptions({
    preset: 'custom',
    historyFocus: 'recent',
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    maxMessages: 4,
    maxCharsExpanded: 1800,
    maxCharsCompact: 1800
  })

  const result = buildChatContextWindow(messages, {
    ...options,
    maxChars: 1800,
    toolPolicy: 'full'
  })

  assert.ok(!result.some((item) => String(item.content || '').includes('spec-a.pdf')))
  assert.deepEqual(result.map((item) => item.content), ['plain turn 1', 'plain answer 1', 'latest user', 'latest answer'])
})

test('attachment history focus can displace plain turns to keep an older attachment turn', () => {
  const messages = [
    {
      role: 'user',
      content: `${attachmentHeader}\n${attachmentPrefix}spec-a.pdf\n` + 'A'.repeat(800)
    },
    { role: 'assistant', content: 'spec a reply' },
    { role: 'user', content: 'plain turn 1' },
    { role: 'assistant', content: 'plain answer 1' },
    { role: 'user', content: 'latest user' },
    { role: 'assistant', content: 'latest answer' }
  ]

  const options = resolveChatContextWindowOptions({
    preset: 'custom',
    historyFocus: 'attachments',
    maxTurns: 2,
    keepRecentTurnsFull: 1,
    maxMessages: 4,
    maxCharsExpanded: 1800,
    maxCharsCompact: 1800
  })

  const result = buildChatContextWindow(messages, {
    ...options,
    maxChars: 1800,
    toolPolicy: 'full'
  })

  assert.ok(result.some((item) => String(item.content || '').includes('spec-a.pdf')))
  assert.ok(result.some((item) => item.content === 'spec a reply'))
  assert.ok(!result.some((item) => item.content === 'plain turn 1'))
  assert.deepEqual(result.slice(-2).map((item) => item.content), ['latest user', 'latest answer'])
})

test('resolveChatContextWindowOptions maps history focus to attachment preservation behavior', () => {
  const recent = resolveChatContextWindowOptions({ preset: 'balanced', historyFocus: 'recent' })
  assert.equal(recent.historyFocus, 'recent')
  assert.equal(recent.maxPinnedAttachmentTurns, 0)

  const balanced = resolveChatContextWindowOptions({ preset: 'balanced', historyFocus: 'balanced' })
  assert.equal(balanced.historyFocus, 'balanced')
  assert.ok(balanced.maxPinnedAttachmentTurns >= 1)

  const attachments = resolveChatContextWindowOptions({ preset: 'balanced', historyFocus: 'attachments' })
  assert.equal(attachments.historyFocus, 'attachments')
  assert.ok(attachments.maxPinnedAttachmentTurns >= 4)
})

test('shouldSummarizeContextWindow requires message count and char threshold', () => {
  assert.equal(
    shouldSummarizeContextWindow({
      sourceMessages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' }
      ],
      sourceChars: 5000,
      summaryTriggerChars: 2000
    }),
    true
  )

  assert.equal(
    shouldSummarizeContextWindow({
      sourceMessages: [
        { role: 'user', content: 'hi' }
      ],
      sourceChars: 5000,
      summaryTriggerChars: 2000
    }),
    false
  )
})
