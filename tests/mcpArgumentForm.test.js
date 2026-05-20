import test from 'node:test'
import assert from 'node:assert/strict'

import { parseMcpPromptJsonArgs } from '../src/utils/mcpArgumentForm.js'

test('parseMcpPromptJsonArgs treats empty object and empty array as no arguments', () => {
  assert.equal(parseMcpPromptJsonArgs(''), undefined)
  assert.equal(parseMcpPromptJsonArgs('{}'), undefined)
  assert.equal(parseMcpPromptJsonArgs('[]'), undefined)
})

test('parseMcpPromptJsonArgs accepts only JSON objects for prompt arguments', () => {
  assert.deepEqual(parseMcpPromptJsonArgs('{"level":"info"}'), { level: 'info' })
  assert.throws(() => parseMcpPromptJsonArgs('[{"level":"info"}]'), /JSON object/)
  assert.throws(() => parseMcpPromptJsonArgs('"text"'), /JSON object/)
})
