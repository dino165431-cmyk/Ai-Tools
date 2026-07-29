import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildToolCallBatchSignature,
  createRepeatedToolCallGuard
} from '../src/utils/chatToolLoopGuard.js'

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
