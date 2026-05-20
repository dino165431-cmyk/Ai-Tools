import test from 'node:test'
import assert from 'node:assert/strict'

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

test('stringifyToolResultForModel returns sanitized json text', () => {
  const text = stringifyToolResultForModel({
    images: [{ base64: LONG_BASE64 }]
  })

  assert.match(text, /omitted: base64\/dataUrl too long/)
  assert.doesNotMatch(text, /iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/)
})
