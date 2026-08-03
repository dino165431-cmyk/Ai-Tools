import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  attachmentCardTitle,
  attachmentMetaSummary,
  attachmentStatusText
} from '../src/utils/chatMediaPresentation.js'

const chatSource = fs.readFileSync(path.resolve('src/views/pages/chat/Chat.vue'), 'utf8')
const attachmentSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatAttachments.js'),
  'utf8'
)

test('non-image attachments go straight to the chat sandbox without renderer parsing', () => {
  assert.match(
    attachmentSource,
    /return \{ kind: 'file', name, ext, mime, text: '', sandboxOnly: true \}/
  )
  assert.doesNotMatch(attachmentSource, /parseAttachmentTextWithFallback/)
  assert.match(chatSource, /useChatAttachments\(\{ createId: newId, message \}\)/)
})

test('preview failures are non-blocking sandbox attachment states', () => {
  const attachment = {
    name: 'archive.zip',
    ext: 'zip',
    size: 1024,
    status: 'ready',
    sandboxOnly: true,
    previewError: 'preview unavailable'
  }

  assert.equal(attachmentStatusText(attachment), '本地预览不可用，将作为沙盒文件发送')
  assert.match(attachmentMetaSummary(attachment), /沙盒文件/)
  assert.match(attachmentCardTitle(attachment), /preview unavailable/)
})
