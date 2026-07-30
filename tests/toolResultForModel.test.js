import assert from 'node:assert/strict'
import test from 'node:test'

import { sanitizeToolResultForModel, stringifyToolResultForModel } from '../src/utils/toolResultForModel.js'

const LONG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8'

test('sanitizeToolResultForModel omits base64 image payloads but keeps metadata', () => {
  const result = {
    content: 'note body',
    images: [
      {
        ref: '![img](a.png)',
        path: 'note/demo.md.assets/a.png',
        ok: true,
        size: 1234,
        mime: 'image/png',
        base64: LONG_BASE64
      }
    ]
  }

  const sanitized = sanitizeToolResultForModel(result)
  assert.equal(sanitized.images[0].path, 'note/demo.md.assets/a.png')
  assert.equal(sanitized.images[0].mime, 'image/png')
  assert.equal(sanitized.images[0].base64, '(omitted: base64/dataUrl too long)')
})

test('sanitizeToolResultForModel is exported for direct use', () => {
  assert.equal(typeof sanitizeToolResultForModel, 'function')
})

test('sanitizeToolResultForModel preserves deep tree structures', () => {
  const result = {
    tree: {
      type: 'dir',
      name: 'root',
      children: [
        {
          type: 'dir',
          name: 'level1',
          children: [
            {
              type: 'dir',
              name: 'level2',
              children: [
                {
                  type: 'dir',
                  name: 'level3',
                  children: [
                    {
                      type: 'dir',
                      name: 'level4',
                      children: [
                        {
                          type: 'dir',
                          name: 'level5',
                          children: [
                            { type: 'note', name: 'deep-note', path: 'a/b/c/d/e/deep-note.md' }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }

  const sanitized = sanitizeToolResultForModel(result)
  assert.equal(sanitized.tree.children[0].children[0].children[0].children[0].children[0].children[0].name, 'deep-note')
})

test('sanitizeToolResultForModel still truncates noisy trace arrays', () => {
  const result = {
    trace: Array.from({ length: 60 }, (_, index) => ({ step: index + 1, title: `step-${index + 1}` }))
  }

  const sanitized = sanitizeToolResultForModel(result)
  assert.equal(sanitized.trace.length, 41)
  assert.match(String(sanitized.trace[40]), /数组过长/)
})

test('sanitizeToolResultForModel bounds ordinary result arrays', () => {
  const sanitized = sanitizeToolResultForModel({
    accounts: Array.from({ length: 80 }, (_, index) => ({ id: index + 1 }))
  })

  assert.equal(sanitized.accounts.length, 51)
  assert.deepEqual(sanitized.accounts[49], { id: 50 })
  assert.match(String(sanitized.accounts[50]), /数组过长/)
})

test('stringifyToolResultForModel returns sanitized json text', () => {
  const text = stringifyToolResultForModel({
    images: [{ base64: LONG_BASE64 }]
  })

  assert.match(text, /omitted: base64\/dataUrl too long/)
  assert.doesNotMatch(text, /iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/)
})

test('process streams keep useful head and tail while bounding model context', () => {
  const text = `${'a'.repeat(9000)}TAIL`
  const sanitized = sanitizeToolResultForModel({ stdout: text })
  assert.ok(sanitized.stdout.length < text.length)
  assert.match(sanitized.stdout, /truncated process output/)
  assert.ok(sanitized.stdout.endsWith('TAIL'))
})

test('stringifyToolResultForModel bounds plain text while preserving useful head and tail', () => {
  const text = `HEAD${'x'.repeat(50000)}TAIL`
  const result = stringifyToolResultForModel(text)

  assert.ok(result.length <= 32000)
  assert.ok(result.startsWith('HEAD'))
  assert.ok(result.endsWith('TAIL'))
  assert.match(result, /truncated tool result/)
})

test('stringifyToolResultForModel sanitizes top-level JSON strings before returning them', () => {
  const text = JSON.stringify({
    stdout: `${'a'.repeat(9000)}TAIL`,
    rows: Array.from({ length: 75 }, (_, index) => ({ index }))
  })
  const result = JSON.parse(stringifyToolResultForModel(text))

  assert.match(result.stdout, /truncated process output/)
  assert.ok(result.stdout.endsWith('TAIL'))
  assert.equal(result.rows.length, 51)
})

test('stringifyToolResultForModel applies a total bound to structured results', () => {
  const result = stringifyToolResultForModel({
    first: 'a'.repeat(20000),
    second: 'b'.repeat(20000),
    third: 'c'.repeat(20000)
  })

  assert.ok(result.length <= 32000)
  assert.match(result, /truncated tool result/)
})
