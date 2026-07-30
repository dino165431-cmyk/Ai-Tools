import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_CODE_AUTO_FOLD_THRESHOLD,
  MARKDOWN_CODE_AUTO_FOLD_THRESHOLD
} from '../src/utils/chatMarkdownPreview.js'

test('chat and note previews auto-fold genuinely long code blocks', () => {
  assert.equal(CHAT_CODE_AUTO_FOLD_THRESHOLD, MARKDOWN_CODE_AUTO_FOLD_THRESHOLD)
  assert.ok(MARKDOWN_CODE_AUTO_FOLD_THRESHOLD >= 20)
  assert.ok(MARKDOWN_CODE_AUTO_FOLD_THRESHOLD <= 100)
})
