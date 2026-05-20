import test from 'node:test'
import assert from 'node:assert/strict'

import { buildUtoolsAiMessages, extractUtoolsAiReasoningText } from '../src/utils/utoolsAiProvider.js'

test('extractUtoolsAiReasoningText accepts common reasoning aliases', () => {
  assert.equal(extractUtoolsAiReasoningText({ reasoning: 'a' }), 'a')
  assert.equal(extractUtoolsAiReasoningText({ thinking: ' b ' }), 'b')
  assert.equal(extractUtoolsAiReasoningText({ thought: 'c' }), 'c')
  assert.equal(extractUtoolsAiReasoningText({ reasoning_content: '' }), '')
})

test('buildUtoolsAiMessages preserves assistant reasoning_content even when empty', () => {
  const messages = buildUtoolsAiMessages({
    systemContent: 'You are concise.',
    apiMessages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi', reasoning_content: '' }
    ]
  })

  assert.deepEqual(messages, [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi', reasoning_content: '' }
  ])
})

test('buildUtoolsAiMessages carries assistant reasoning aliases into reasoning_content', () => {
  const messages = buildUtoolsAiMessages({
    apiMessages: [{ role: 'assistant', content: 'answer', thinking: 'step by step' }]
  })

  assert.deepEqual(messages, [
    { role: 'assistant', content: 'answer', reasoning_content: 'step by step' }
  ])
})
