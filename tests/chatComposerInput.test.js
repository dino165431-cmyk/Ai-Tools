import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUtoolsEnterEventKey,
  shouldSubmitComposerKeydownEvent
} from '../src/utils/chatComposerInput.js'

test('shouldSubmitComposerKeydownEvent ignores IME composition Enter', () => {
  assert.equal(shouldSubmitComposerKeydownEvent({ key: 'Enter', isComposing: true }), false)
  assert.equal(shouldSubmitComposerKeydownEvent({ key: 'Enter', keyCode: 229 }), false)
  assert.equal(shouldSubmitComposerKeydownEvent({ key: 'Enter' }), true)
  assert.equal(shouldSubmitComposerKeydownEvent({ key: 'Enter', shiftKey: true }), false)
})

test('buildUtoolsEnterEventKey only keys matching Ai over payloads', () => {
  assert.equal(buildUtoolsEnterEventKey({ code: 'Ai', type: 'over', payload: 'hello' }), 'Ai|over|hello')
  assert.equal(buildUtoolsEnterEventKey({ code: 'Ai', type: 'over', payload: '' }), '')
  assert.equal(buildUtoolsEnterEventKey({ code: 'Ai', type: 'in', payload: 'hello' }), '')
  assert.equal(buildUtoolsEnterEventKey(null), '')
})
