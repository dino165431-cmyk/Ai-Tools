import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContextSummaryPrelude,
  buildContextSummarySourceHash,
  buildContextSummaryTurnSegments
} from '../src/utils/chatContextSummary.js'

test('context summary segments keep user, assistant, and tool turns together', () => {
  const messages = [
    { role: 'user', content: '分析项目' },
    {
      role: 'assistant',
      content: '开始检查',
      tool_calls: [{ function: { name: 'read_file', arguments: '{"path":"a.js"}' } }]
    },
    { role: 'tool', tool_call_id: 'call-1', content: 'const answer = 42' },
    { role: 'assistant', content: '发现一个问题' }
  ]

  const segments = buildContextSummaryTurnSegments(messages)
  assert.equal(segments.length, 1)
  assert.equal(segments[0].messageCount, 4)
  assert.match(segments[0].turnText, /read_file/)
  assert.match(segments[0].turnText, /const answer = 42/)
})

test('context summary source hash is bounded and prelude ignores empty input', () => {
  const hash = buildContextSummarySourceHash([
    { role: 'user', content: 'x'.repeat(25000) }
  ])
  assert.ok(hash.length <= 20000)
  assert.equal(buildContextSummaryPrelude(''), '')
  assert.match(buildContextSummaryPrelude('摘要内容'), /摘要内容/)
})
