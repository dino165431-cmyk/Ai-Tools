import test from 'node:test'
import assert from 'node:assert/strict'

import {
  contentHasUserAttachments,
  extractEditableUserTextFromContent,
  mergeUserTextWithExistingAttachments,
  splitUserTextAndAttachmentBlock
} from '../src/utils/chatUserMessageContent.js'

const header = '\u3010\u9644\u4ef6\u5185\u5bb9\u3011'
const prefix = '\u9644\u4ef6\uff1a'

test('splitUserTextAndAttachmentBlock separates plain user text from attachment block', () => {
  const result = splitUserTextAndAttachmentBlock(`\u8bf7\u603b\u7ed3\u8fd9\u4efd\u6587\u6863\n\n${header}\n${prefix}spec.pdf\n\u6b63\u6587`)
  assert.equal(result.leadText, '\u8bf7\u603b\u7ed3\u8fd9\u4efd\u6587\u6863')
  assert.equal(result.attachmentBlock, `${header}\n${prefix}spec.pdf\n\u6b63\u6587`)
  assert.equal(result.hasAttachmentBlock, true)
})

test('extractEditableUserTextFromContent hides attachment block for string content', () => {
  const text = extractEditableUserTextFromContent(`\u7ee7\u7eed\u5206\u6790\n\n${header}\n${prefix}manual.pdf\n\u5185\u5bb9`)
  assert.equal(text, '\u7ee7\u7eed\u5206\u6790')
})

test('mergeUserTextWithExistingAttachments preserves string attachment block', () => {
  const next = mergeUserTextWithExistingAttachments(`\u65e7\u95ee\u9898\n\n${header}\n${prefix}manual.pdf\n\u5185\u5bb9`, '\u65b0\u95ee\u9898')
  assert.equal(next, `\u65b0\u95ee\u9898\n\n${header}\n${prefix}manual.pdf\n\u5185\u5bb9`)
})

test('mergeUserTextWithExistingAttachments preserves multimodal image parts', () => {
  const original = [
    {
      type: 'text',
      text: `\u770b\u4e00\u4e0b\u8fd9\u5f20\u56fe\n\n${header}\n${prefix}design.png\n\u5e03\u5c40\u8bf4\u660e`
    },
    {
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc' }
    }
  ]

  const next = mergeUserTextWithExistingAttachments(original, '\u91cd\u70b9\u770b\u5bfc\u822a\u533a')
  assert.ok(Array.isArray(next))
  assert.equal(next[0].text, `\u91cd\u70b9\u770b\u5bfc\u822a\u533a\n\n${header}\n${prefix}design.png\n\u5e03\u5c40\u8bf4\u660e`)
  assert.equal(next[1].type, 'image_url')
  assert.equal(next[1].image_url.url, 'data:image/png;base64,abc')
})

test('contentHasUserAttachments detects attachment block or multimodal image payload', () => {
  assert.equal(contentHasUserAttachments(`${header}\n${prefix}a.txt\nbody`), true)
  assert.equal(
    contentHasUserAttachments([
      { type: 'text', text: '\u53ea\u770b\u56fe' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }
    ]),
    true
  )
  assert.equal(contentHasUserAttachments('\u666e\u901a\u6587\u672c'), false)
})
