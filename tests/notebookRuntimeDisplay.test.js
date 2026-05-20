import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRuntimeDisplayOutputs, isScrollPositionNearBottom, mergeNotebookStreamOutputs, mergeRuntimeInputEchoOutputs } from '../src/utils/notebookRuntimeDisplay.js'

test('mergeRuntimeInputEchoOutputs keeps user replies interleaved with later runtime output', () => {
  const outputs = [
    { output_type: 'stream', name: 'stdout', text: 'prompt 1\n' },
    { output_type: 'stream', name: 'stdout', text: 'program 1\n' },
    { output_type: 'stream', name: 'stdout', text: 'prompt 2\n' },
    { output_type: 'stream', name: 'stdout', text: 'program 2\n' }
  ]
  const echoEntries = [
    { afterOutputCount: 1, output: { output_type: 'stream', name: 'stdout', text: 'reply 1\n' } },
    { afterOutputCount: 3, output: { output_type: 'stream', name: 'stdout', text: 'reply 2\n' } }
  ]

  assert.deepEqual(
    mergeRuntimeInputEchoOutputs(outputs, echoEntries).map((item) => item.text),
    ['prompt 1\n', 'reply 1\n', 'program 1\n', 'prompt 2\n', 'reply 2\n', 'program 2\n']
  )
})

test('buildRuntimeDisplayOutputs keeps runtime prelude ahead of interleaved output history', () => {
  const result = buildRuntimeDisplayOutputs(
    ['> %runtime info', 'Python: python'],
    [
      { output_type: 'stream', name: 'stdout', text: 'enter number: ' },
      { output_type: 'stream', name: 'stdout', text: 'too small\n' }
    ],
    [
      { afterOutputCount: 1, output: { output_type: 'stream', name: 'stdout', text: '3\n' } }
    ]
  )

  assert.deepEqual(
    result.map((item) => item.text),
    ['> %runtime info\nPython: python\n', 'enter number: ', '3\n', 'too small\n']
  )
})

test('mergeNotebookStreamOutputs merges consecutive same-name stream chunks', () => {
  const result = mergeNotebookStreamOutputs([
    { output_type: 'stream', name: 'stdout', text: 'hello ' },
    { output_type: 'stream', name: 'stdout', text: 'world\n' },
    { output_type: 'stream', name: 'stderr', text: 'warn\n' },
    { output_type: 'stream', name: 'stderr', text: 'again\n' }
  ])

  assert.deepEqual(result, [
    { output_type: 'stream', name: 'stdout', text: 'hello world\n' },
    { output_type: 'stream', name: 'stderr', text: 'warn\nagain\n' }
  ])
})

test('isScrollPositionNearBottom treats small gaps as still following the tail', () => {
  assert.equal(
    isScrollPositionNearBottom({ scrollTop: 360, clientHeight: 120, scrollHeight: 500 }, 24),
    true
  )

  assert.equal(
    isScrollPositionNearBottom({ scrollTop: 300, clientHeight: 120, scrollHeight: 500 }, 24),
    false
  )
})
