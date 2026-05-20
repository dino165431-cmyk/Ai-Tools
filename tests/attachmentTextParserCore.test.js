import test from 'node:test'
import assert from 'node:assert/strict'

import { truncateAttachmentText } from '../src/utils/attachmentTextParserCore.js'

test('truncateAttachmentText keeps full text when input is within limit', () => {
  const raw = 'A'.repeat(70000)
  assert.equal(truncateAttachmentText(raw, 4_200_000), raw)
})

test('truncateAttachmentText still truncates when maxChars is positive', () => {
  const raw = 'B'.repeat(100)
  const truncated = truncateAttachmentText(raw, 20)
  assert.match(truncated, /^B{20}/)
  assert.match(truncated, /attachment content truncated/)
})
