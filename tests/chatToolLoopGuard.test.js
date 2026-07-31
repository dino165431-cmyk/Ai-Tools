import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  buildToolCallBatchSignature,
  createRepeatedToolCallGuard
} from '../src/utils/chatToolLoopGuard.js'

const chatSource = fs.readFileSync(path.resolve('src/views/pages/chat/Chat.vue'), 'utf8')

function toolCall(argumentsText) {
  return {
    id: Math.random().toString(36),
    type: 'function',
    function: {
      name: 'skill_discover',
      arguments: argumentsText
    }
  }
}

test('tool loop guard ignores call ids and JSON key order', () => {
  assert.equal(
    buildToolCallBatchSignature([toolCall('{"b":2,"a":1}')]),
    buildToolCallBatchSignature([toolCall('{"a":1,"b":2}')])
  )
})

test('tool loop guard blocks the third identical consecutive batch and resets on change', () => {
  const guard = createRepeatedToolCallGuard({ maxConsecutive: 3 })
  assert.equal(guard.observe([toolCall('{"query":"attachments"}')]).blocked, false)
  assert.equal(guard.observe([toolCall('{"query":"attachments"}')]).blocked, false)
  assert.equal(guard.observe([toolCall('{"query":"attachments"}')]).blocked, true)
  assert.equal(guard.observe([toolCall('{"query":"different"}')]).blocked, false)
})

test('tool loop guard allows distinct calls beyond the former 32-round cap', () => {
  const guard = createRepeatedToolCallGuard({ maxConsecutive: 3 })
  for (let round = 0; round < 64; round += 1) {
    assert.equal(guard.observe([toolCall(JSON.stringify({ round }))]).blocked, false)
  }
})

test('chat recovers from a repeated tool loop with one tool-free model round', () => {
  assert.match(chatSource, /let repeatedToolCallRecoveryPending = false/)
  assert.match(
    chatSource,
    /const activeTools = plainTextToolFallback \|\| isRepeatedToolCallRecoveryRound \? \[\] : tools/
  )
  assert.match(chatSource, /repeatedToolCallRecoveryPending = true\s+repeatedToolCallGuard\.reset\(\)/)
  assert.match(
    chatSource,
    /if \(isRepeatedToolCallRecoveryRound\) \{[\s\S]*delete recoveryApiMessage\.tool_calls[\s\S]*break\s+\}/
  )
  assert.doesNotMatch(
    chatSource,
    /targetSession\.messages\.push\(createDisplayMessage\('assistant', stopText\)\)/
  )
})

test('chat has no fixed tool round limit while retaining the repeated-call guard', () => {
  assert.match(chatSource, /for \(let round = 0; ; round \+= 1\)/)
  assert.doesNotMatch(chatSource, /const maxRounds = \d+/)
  assert.doesNotMatch(chatSource, /工具调用轮次已达到上限/)
  assert.match(chatSource, /const repeatedToolCallState = repeatedToolCallGuard\.observe\(normalizedToolCalls\)/)
})
