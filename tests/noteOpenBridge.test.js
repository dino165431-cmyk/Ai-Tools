import test from 'node:test'
import assert from 'node:assert/strict'

import {
  consumePendingNoteFile,
  onOpenNoteFile,
  requestOpenNoteFile
} from '../src/utils/noteOpenBridge.js'

test('requestOpenNoteFile normalizes Windows-style note paths', () => {
  const seen = []
  const dispose = onOpenNoteFile((filePath) => {
    seen.push(filePath)
  })

  try {
    requestOpenNoteFile('note\\demo\\entry.md')

    assert.equal(consumePendingNoteFile(), 'note/demo/entry.md')
    assert.deepEqual(seen, ['note/demo/entry.md'])
  } finally {
    dispose()
    consumePendingNoteFile()
  }
})
