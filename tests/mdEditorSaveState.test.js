import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldPersistMarkdownDraftOnPathChange } from '../src/utils/mdEditorSaveState.js'

test('shouldPersistMarkdownDraftOnPathChange keeps empty drafts from being dropped', () => {
  assert.equal(
    shouldPersistMarkdownDraftOnPathChange({
      oldPath: 'note/demo.md',
      currentContent: '',
      lastSavedFilePath: 'note/demo.md',
      lastSavedContent: 'hello'
    }),
    true
  )
})

test('shouldPersistMarkdownDraftOnPathChange ignores unchanged content', () => {
  assert.equal(
    shouldPersistMarkdownDraftOnPathChange({
      oldPath: 'note/demo.md',
      currentContent: '',
      lastSavedFilePath: 'note/demo.md',
      lastSavedContent: ''
    }),
    false
  )
})

