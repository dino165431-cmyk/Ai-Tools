import test from 'node:test'
import assert from 'node:assert/strict'

import { parseSessionJsonText } from '../src/utils/sessionFileJson.js'

test('session JSON recovery preserves a root property appended after a premature closing brace', () => {
  const parsed = parseSessionJsonText(`{
    "title": "Adjust analysis",
    "messages": []
  }  "source": {
    "type": "auto",
    "recordId": "chat-1"
  }`)

  assert.equal(parsed.ok, true)
  assert.equal(parsed.recovered, true)
  assert.equal(parsed.value.title, 'Adjust analysis')
  assert.equal(parsed.value.source.type, 'auto')
  assert.equal(parsed.value.source.recordId, 'chat-1')
  assert.doesNotThrow(() => JSON.parse(parsed.normalizedText))
})

test('session JSON recovery still ignores unrelated trailing JSON values', () => {
  const parsed = parseSessionJsonText('{"title":"first"}\\n{"title":"second"}')

  assert.equal(parsed.ok, true)
  assert.equal(parsed.recovered, true)
  assert.equal(parsed.value.title, 'first')
})
