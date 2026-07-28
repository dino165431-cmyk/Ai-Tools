import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeProgressiveTreeChildren,
  splitIntoBatches
} from '../src/utils/progressiveTree.js'

test('splitIntoBatches limits each directory scan burst', () => {
  assert.deepEqual(splitIntoBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(splitIntoBatches([], 2), [])
  assert.deepEqual(splitIntoBatches([1, 2], 0), [[1], [2]])
})

test('mergeProgressiveTreeChildren keeps unprocessed nodes during partial updates', () => {
  const existing = [
    { key: 'note/a', label: 'old-a' },
    { key: 'note/b', label: 'b' }
  ]
  const replacement = { key: 'note/a', label: 'new-a' }

  const result = mergeProgressiveTreeChildren(existing, [replacement])

  assert.deepEqual(result.map((item) => item.key), ['note/a', 'note/b'])
  assert.equal(result[0], replacement)
  assert.equal(result[1], existing[1])
})

test('mergeProgressiveTreeChildren drops stale nodes only after the scan completes', () => {
  const result = mergeProgressiveTreeChildren(
    [{ key: 'note/stale' }, { key: 'note/keep' }],
    [{ key: 'note/keep' }],
    { complete: true }
  )

  assert.deepEqual(result.map((item) => item.key), ['note/keep'])
})
