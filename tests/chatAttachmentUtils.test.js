import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDisplayImagesFromReferenceAttachments,
  getFileExt,
  guessExtensionFromMime,
  isSupportedAttachmentFile,
  mergeReferenceImagesIntoRequestOptions,
  normalizeAttachmentName,
  normalizeMediaReferenceImagesForRequest,
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
