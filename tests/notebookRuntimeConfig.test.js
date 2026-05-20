import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getNotebookRuntimeBoundEnvName,
  normalizeNotebookRuntimeBindingKey,
  normalizeNotebookRuntimeConfig,
  removeNotebookRuntimeBoundEnvNamesByPredicate,
  rewriteNotebookRuntimeBoundEnvNamesByPrefix,
  rewriteNotebookRuntimeBoundEnvName,
  setNotebookRuntimeBoundEnvName
} from '../src/utils/notebookRuntimeConfig.js'

test('normalizeNotebookRuntimeConfig preserves per-note env bindings locally', () => {
  const normalized = normalizeNotebookRuntimeConfig({
    noteEnvBindings: {
      'E:\\Project\\Notes\\Demo.ipynb': 'ml-env',
      '': 'ignored',
      'E:\\Project\\Notes\\Empty.ipynb': '   '
    }
  })

  assert.deepEqual(normalized.noteEnvBindings, {
    'e:/Project/Notes/Demo.ipynb': 'ml-env'
  })
})

test('setNotebookRuntimeBoundEnvName stores and clears per-note env bindings', () => {
  const initial = normalizeNotebookRuntimeConfig({})
  const withBinding = setNotebookRuntimeBoundEnvName(initial, 'E:\\Project\\Notes\\Demo.ipynb', 'science')

  assert.equal(getNotebookRuntimeBoundEnvName(withBinding, 'E:\\Project\\Notes\\Demo.ipynb'), 'science')

  const cleared = setNotebookRuntimeBoundEnvName(withBinding, 'E:\\Project\\Notes\\Demo.ipynb', '')
  assert.equal(getNotebookRuntimeBoundEnvName(cleared, 'E:\\Project\\Notes\\Demo.ipynb'), '')
  assert.deepEqual(cleared.noteEnvBindings, {})
})

test('rewriteNotebookRuntimeBoundEnvName moves bindings when notebook path changes', () => {
  const runtime = normalizeNotebookRuntimeConfig({
    noteEnvBindings: {
      'e:/Project/Notes/old.ipynb': 'torch'
    }
  })

  const rewritten = rewriteNotebookRuntimeBoundEnvName(runtime, 'E:\\Project\\Notes\\old.ipynb', 'E:\\Project\\Notes\\new.ipynb')

  assert.equal(normalizeNotebookRuntimeBindingKey('E:\\Project\\Notes\\new.ipynb'), 'e:/Project/Notes/new.ipynb')
  assert.equal(getNotebookRuntimeBoundEnvName(rewritten, 'E:\\Project\\Notes\\new.ipynb'), 'torch')
  assert.equal(getNotebookRuntimeBoundEnvName(rewritten, 'E:\\Project\\Notes\\old.ipynb'), '')
})

test('rewriteNotebookRuntimeBoundEnvNamesByPrefix moves bindings for renamed folders', () => {
  const runtime = normalizeNotebookRuntimeConfig({
    noteEnvBindings: {
      'note/Area/demo.ipynb': 'area-env',
      'note/Area/nested/train.ipynb': 'train-env',
      'note/Other/keep.ipynb': 'keep-env'
    }
  })

  const rewritten = rewriteNotebookRuntimeBoundEnvNamesByPrefix(runtime, 'note/Area', 'note/Renamed')

  assert.deepEqual(rewritten.noteEnvBindings, {
    'note/Renamed/demo.ipynb': 'area-env',
    'note/Renamed/nested/train.ipynb': 'train-env',
    'note/Other/keep.ipynb': 'keep-env'
  })
})

test('removeNotebookRuntimeBoundEnvNamesByPredicate clears deleted notebook and folder bindings', () => {
  const runtime = normalizeNotebookRuntimeConfig({
    noteEnvBindings: {
      'note/HuggingFace/demo.ipynb': 'hf-env',
      'note/HuggingFace/nested/train.ipynb': 'train-env',
      'note/Other/keep.ipynb': 'keep-env'
    }
  })

  const removed = removeNotebookRuntimeBoundEnvNamesByPredicate(runtime, (filePath) => {
    return filePath === 'note/HuggingFace' || filePath.startsWith('note/HuggingFace/')
  })

  assert.deepEqual(removed.noteEnvBindings, {
    'note/Other/keep.ipynb': 'keep-env'
  })
})
