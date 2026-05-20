import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNotebookMarkdownText,
  hasPotentialNoteAttachmentReferences
} from '../src/utils/noteAttachmentCleanup.js'

test('hasPotentialNoteAttachmentReferences detects note asset links', () => {
  assert.equal(hasPotentialNoteAttachmentReferences('![img](./demo.assets/image.png)'), true)
  assert.equal(hasPotentialNoteAttachmentReferences('![img](.\\demo.assets\\image.png)'), true)
})

test('hasPotentialNoteAttachmentReferences skips plain markdown', () => {
  assert.equal(hasPotentialNoteAttachmentReferences('# Title\n\nPlain text only.'), false)
})

test('buildNotebookMarkdownText joins markdown cell sources', () => {
  assert.equal(
    buildNotebookMarkdownText({
      cells: [
        { cell_type: 'markdown', source: '# First' },
        { cell_type: 'code', source: 'console.log(1)' },
        { cell_type: 'markdown', source: 'Second paragraph' }
      ]
    }),
    '# First\n\nSecond paragraph'
  )
})
