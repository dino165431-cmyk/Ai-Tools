import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveChatHeavyRenderTuning,
  shouldDeferChatHeavyBlockLayout
} from '../src/utils/chatPerformance.js'

test('resolveChatHeavyRenderTuning keeps the default window for short chats', () => {
  assert.deepEqual(resolveChatHeavyRenderTuning(0), {
    viewportBuffer: 6,
    rootMarginPx: 720,
    maxHydrated: 96
  })
  assert.deepEqual(resolveChatHeavyRenderTuning(119), {
    viewportBuffer: 6,
    rootMarginPx: 720,
    maxHydrated: 96
  })
})

test('resolveChatHeavyRenderTuning tightens hydration as chats grow', () => {
  assert.deepEqual(resolveChatHeavyRenderTuning(120), {
    viewportBuffer: 5,
    rootMarginPx: 560,
    maxHydrated: 72
  })
  assert.deepEqual(resolveChatHeavyRenderTuning(240), {
    viewportBuffer: 4,
    rootMarginPx: 420,
    maxHydrated: 56
  })
  assert.deepEqual(resolveChatHeavyRenderTuning(480), {
    viewportBuffer: 3,
    rootMarginPx: 320,
    maxHydrated: 40
  })
})

test('shouldDeferChatHeavyBlockLayout keeps active chat items eager', () => {
  const visibleMessageIds = new Set(['visible'])

  assert.equal(
    shouldDeferChatHeavyBlockLayout({ id: 'visible', content: 'hello' }, { visibleMessageIds }),
    false
  )
  assert.equal(
    shouldDeferChatHeavyBlockLayout({ id: 'streaming', streaming: true }, { visibleMessageIds }),
    false
  )
  assert.equal(
    shouldDeferChatHeavyBlockLayout({ id: 'editing', editing: true }, { visibleMessageIds }),
    false
  )
})

test('shouldDeferChatHeavyBlockLayout defers offscreen heavy items', () => {
  const visibleMessageIds = new Set(['visible'])

  assert.equal(
    shouldDeferChatHeavyBlockLayout({ id: 'history', content: 'old markdown' }, { visibleMessageIds }),
    true
  )
  assert.equal(
    shouldDeferChatHeavyBlockLayout({ id: '', content: 'no id' }, { visibleMessageIds }),
    true
  )
})
