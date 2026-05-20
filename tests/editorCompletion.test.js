import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveCompletionRange, resolveSymbolRangeAt } from '../src/utils/editorCompletion.js'

test('resolveCompletionRange expands empty replacement to current identifier prefix', () => {
  assert.deepEqual(
    resolveCompletionRange('adb', 3, 3, 'adbutils'),
    { from: 0, to: 3 }
  )
})

test('resolveCompletionRange preserves explicit non-empty ranges', () => {
  assert.deepEqual(
    resolveCompletionRange('adb', 0, 3, 'adbutils'),
    { from: 0, to: 3 }
  )
})

test('resolveCompletionRange leaves unrelated insertions at cursor', () => {
  assert.deepEqual(
    resolveCompletionRange('print()', 7, 7, 'os'),
    { from: 7, to: 7 }
  )
})

test('resolveCompletionRange can replace a dotted token prefix', () => {
  assert.deepEqual(
    resolveCompletionRange('adb.ut', 6, 6, 'adb.utils'),
    { from: 0, to: 6 }
  )
})

test('resolveCompletionRange replaces only the member segment for attribute completions', () => {
  assert.deepEqual(
    resolveCompletionRange('adb.de', 6, 6, 'device()'),
    { from: 4, to: 6 }
  )
})

test('resolveCompletionRange handles generic module-name completions', () => {
  assert.deepEqual(
    resolveCompletionRange('req', 3, 3, 'requests'),
    { from: 0, to: 3 }
  )
})

test('resolveCompletionRange handles generic member completions with call syntax', () => {
  assert.deepEqual(
    resolveCompletionRange('client.con', 10, 10, 'connect()'),
    { from: 7, to: 10 }
  )
})

test('resolveSymbolRangeAt prefers the current member segment', () => {
  assert.deepEqual(
    resolveSymbolRangeAt('adb.device', 10),
    { from: 4, to: 10 }
  )
})
