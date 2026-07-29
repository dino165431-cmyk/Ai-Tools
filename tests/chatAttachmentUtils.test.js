import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_LONG_TEXT_ATTACHMENT_DISPLAY_TEXT,
  buildDisplayImagesFromReferenceAttachments,
  buildChatLongTextAttachmentName,
  getFileExt,
  guessExtensionFromMime,
  isSupportedAttachmentFile,
  mergeReferenceImagesIntoRequestOptions,
  normalizeAttachmentName,
  normalizeMediaReferenceImagesForRequest,
  resolveChatLongTextAttachmentPlan,
  shouldWrapChatLongTextAsAttachment,
  truncateAttachmentContextForRequest
} from '../src/utils/chatAttachmentUtils.js'

test('attachment detection handles extension, MIME fallback, and generated names', () => {
  assert.equal(getFileExt('report.FINAL.MD'), 'md')
  assert.equal(guessExtensionFromMime('APPLICATION/PDF'), 'pdf')
  assert.equal(normalizeAttachmentName({ name: '', type: 'image/png' }), 'pasted-file.png')
  assert.equal(isSupportedAttachmentFile({ name: 'notes.unknown', type: 'application/octet-stream' }), false)
  assert.equal(isSupportedAttachmentFile({ name: 'notes.md', type: '' }), true)
})

test('reference normalization deduplicates images and keeps provider aliases', () => {
  const references = normalizeMediaReferenceImagesForRequest([
    { url: 'data:image/png;base64,abc', name: 'first.png' },
    { dataUrl: 'data:image/png;base64,abc', name: 'duplicate.png' },
    { src: 'https://example.com/second.png' }
  ])
  assert.equal(references.length, 2)
  assert.equal(references[0].name, 'first.png')

  const options = mergeReferenceImagesIntoRequestOptions({}, references, 'video')
  assert.equal(options.referenceImages.length, 2)
  assert.deepEqual(options.input_reference, options.referenceImages)

  let nextId = 0
  const display = buildDisplayImagesFromReferenceAttachments(references, () => `id-${++nextId}`)
  assert.deepEqual(display.map((item) => item.id), ['id-1', 'id-2'])
})

test('attachment context truncation preserves the user lead text', () => {
  const result = truncateAttachmentContextForRequest('question', 'x'.repeat(500), 100)
  assert.ok(result.startsWith('question\n\n'))
  assert.ok(result.includes('attachment content truncated'))
  assert.ok(result.length <= 100)
})

test('attachment context truncation preserves sandbox references from the tail', () => {
  const attachment = [
    'Attachment: large.json',
    'x'.repeat(1200),
    'sandbox_workspace_id: chat-session-1',
    'sandbox_path: inbox/large.json'
  ].join('\n')
  const result = truncateAttachmentContextForRequest('inspect it', attachment, 420)

  assert.ok(result.includes('sandbox_workspace_id: chat-session-1'))
  assert.ok(result.includes('sandbox_path: inbox/large.json'))
  assert.ok(result.length <= 420)
})

test('long chat text is wrapped for large markdown and line-heavy content', () => {
  assert.equal(shouldWrapChatLongTextAsAttachment('x'.repeat(11_999)), false)
  assert.equal(shouldWrapChatLongTextAsAttachment('x'.repeat(12_000)), true)
  assert.equal(
    shouldWrapChatLongTextAsAttachment(`\`\`\`js\n${'const value = 1\\n'.repeat(400)}\`\`\``),
    true
  )
  assert.equal(
    shouldWrapChatLongTextAsAttachment(Array.from({ length: 160 }, () => 'line content that adds weight').join('\n')),
    false
  )
  assert.equal(
    shouldWrapChatLongTextAsAttachment(Array.from({ length: 240 }, () => 'line content that adds enough weight').join('\n')),
    true
  )
})

test('long chat text attachment plan preserves existing attachments and enforces the byte budget', () => {
  const existing = [{ id: 'existing', size: 128 }]
  const plan = resolveChatLongTextAttachmentPlan('界'.repeat(12_000), existing, {
    now: new Date(2026, 6, 29, 9, 8, 7),
    maxBytes: 50_000
  })

  assert.equal(plan.wrapped, true)
  assert.equal(plan.text, CHAT_LONG_TEXT_ATTACHMENT_DISPLAY_TEXT)
  assert.equal(plan.attachmentName, 'long-message-20260729-090807.md')
  assert.equal(plan.attachmentMime, 'text/markdown')
  assert.equal(plan.attachments, existing)
  assert.equal(plan.attachmentBytes, 36_000)

  const rejected = resolveChatLongTextAttachmentPlan('界'.repeat(12_000), existing, {
    maxBytes: 36_000
  })
  assert.equal(rejected.wrapped, false)
  assert.match(rejected.error, /超过/)
})
