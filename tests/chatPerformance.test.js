import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveChatViewportCompensation,
  resolveChatHeavyRenderTuning,
  resolveChatVirtualItemGap,
  resolveChatVirtualItemHeight,
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

test('resolveChatViewportCompensation keeps the virtual-list anchor in sync', () => {
  assert.deepEqual(
    resolveChatViewportCompensation({
      scrollTop: 640,
      deltaPx: 120,
      lastProcessedScrollTop: 640,
      didProcessScroll: true
    }),
    {
      nextScrollTop: 760,
      appliedDelta: 120,
      nextLastProcessedScrollTop: 760
    }
  )
})

test('resolveChatViewportCompensation reports the clamped applied delta', () => {
  assert.deepEqual(
    resolveChatViewportCompensation({
      scrollTop: 20,
      deltaPx: -50,
      lastProcessedScrollTop: 20,
      didProcessScroll: true
    }),
    {
      nextScrollTop: 0,
      appliedDelta: -20,
      nextLastProcessedScrollTop: 0
    }
  )
})

test('resolveChatVirtualItemHeight keeps compact activity rows below the regular message minimum', () => {
  assert.equal(
    resolveChatVirtualItemHeight({
      estimatedHeight: 26,
      minimumHeight: 26,
      fallbackHeight: 180
    }),
    26
  )
  assert.equal(
    resolveChatVirtualItemHeight({
      measuredHeight: 44,
      estimatedHeight: 26,
      minimumHeight: 26,
      fallbackHeight: 180
    }),
    44
  )
  assert.equal(
    resolveChatVirtualItemHeight({
      estimatedHeight: 40,
      minimumHeight: 96,
      fallbackHeight: 180
    }),
    96
  )
})

test('resolveChatVirtualItemGap mirrors the tighter CSS gap between activity rows', () => {
  assert.equal(
    resolveChatVirtualItemGap({
      hasPrevious: false,
      defaultGap: 14,
      consecutiveActivityGap: 5
    }),
    0
  )
  assert.equal(
    resolveChatVirtualItemGap({
      hasPrevious: true,
      previousIsActivity: true,
      currentIsActivity: true,
      defaultGap: 14,
      consecutiveActivityGap: 5
    }),
    5
  )
  assert.equal(
    resolveChatVirtualItemGap({
      hasPrevious: true,
      previousIsActivity: true,
      currentIsActivity: false,
      defaultGap: 14,
      consecutiveActivityGap: 5
    }),
    14
  )
})
