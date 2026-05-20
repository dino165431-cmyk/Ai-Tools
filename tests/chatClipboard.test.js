import test from 'node:test'
import assert from 'node:assert/strict'

import { canWriteClipboardMime, normalizeClipboardMediaMime } from '../src/utils/chatClipboard.js'

test('normalizeClipboardMediaMime prefers valid media mime and falls back from octet-stream', () => {
  assert.equal(normalizeClipboardMediaMime('image/jpeg', 'image/png', 'image/'), 'image/jpeg')
  assert.equal(normalizeClipboardMediaMime('application/octet-stream', 'image/png', 'image/'), 'image/png')
  assert.equal(normalizeClipboardMediaMime('video/mp4', 'image/png', 'image/'), 'image/png')
})

test('canWriteClipboardMime respects ClipboardItem.supports when available', () => {
  const supportedItem = {
    supports(mime) {
      return mime === 'image/png'
    }
  }

  assert.equal(canWriteClipboardMime('image/png', supportedItem), true)
  assert.equal(canWriteClipboardMime('image/jpeg', supportedItem), false)
})

test('canWriteClipboardMime falls back to optimistic support when supports is missing', () => {
  assert.equal(canWriteClipboardMime('image/jpeg', {}), true)
  assert.equal(canWriteClipboardMime('', {}), false)
  assert.equal(canWriteClipboardMime('image/png', null), false)
})
