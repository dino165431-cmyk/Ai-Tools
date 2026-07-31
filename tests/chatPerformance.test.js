import test from 'node:test'
import assert from 'node:assert/strict'

import {
  estimateChatMarkdownContentHeight,
  isExpectedChatProgrammaticScroll,
  resolveChatAdaptiveVirtualRange,
  resolveChatBottomScrollTarget,
  resolveChatHeavyRenderTuning,
  resolveChatVirtualItemGap,
  shouldDeferChatHeavyBlockLayout,
  shouldEnableChatVirtualization
} from '../src/utils/chatPerformance.js'

test('programmatic scroll recognition rejects a user drag during the guard window', () => {
  assert.equal(isExpectedChatProgrammaticScroll({
    now: 100,
    until: 700,
    scrollTop: 500,
    targetScrollTop: 500
  }), true)
  assert.equal(isExpectedChatProgrammaticScroll({
    now: 100,
    until: 700,
    scrollTop: 320,
    targetScrollTop: 500
  }), false)
  assert.equal(isExpectedChatProgrammaticScroll({
    now: 701,
    until: 700,
    scrollTop: 500,
    targetScrollTop: 500
  }), false)
})

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

test('virtualization starts early for several long messages but not one giant message', () => {
  assert.equal(shouldEnableChatVirtualization({
    itemCount: 5,
    estimatedHeight: 5200,
    viewportHeight: 800,
    minItemsForHeight: 4,
    minEstimatedHeight: 4800,
    viewportMultiplier: 6
  }), true)
  assert.equal(shouldEnableChatVirtualization({
    itemCount: 3,
    estimatedHeight: 20_000,
    viewportHeight: 800,
    minItemsForHeight: 4,
    minEstimatedHeight: 4800,
    viewportMultiplier: 6
  }), false)
  assert.equal(shouldEnableChatVirtualization({
    itemCount: 24,
    estimatedHeight: 1200,
    viewportHeight: 800
  }), true)
})

test('markdown height estimation accounts for wide text and folded code blocks', () => {
  const ascii = estimateChatMarkdownContentHeight('a'.repeat(88), { charsPerLine: 44 })
  const cjk = estimateChatMarkdownContentHeight('中'.repeat(88), { charsPerLine: 44 })
  assert.ok(cjk > ascii)

  const shortCode = `\`\`\`js\n${Array.from({ length: 20 }, (_, index) => `line${index}`).join('\n')}\n\`\`\``
  const longCode = `\`\`\`js\n${Array.from({ length: 60 }, (_, index) => `line${index}`).join('\n')}\n\`\`\``
  const forcedOpenCode = longCode.replace('```js', '```js ::open')
  assert.ok(
    estimateChatMarkdownContentHeight(longCode, { autoFoldThreshold: 30 }) <
    estimateChatMarkdownContentHeight(shortCode, { autoFoldThreshold: 30 })
  )
  assert.ok(
    estimateChatMarkdownContentHeight(forcedOpenCode, { autoFoldThreshold: 30 }) >
    estimateChatMarkdownContentHeight(longCode, { autoFoldThreshold: 30 })
  )
})

test('adaptive virtual range buffers many compact cards but only one very tall message', () => {
  assert.deepEqual(
    resolveChatAdaptiveVirtualRange(
      { count: 100, startIndex: 20, endIndex: 29 },
      {
        viewportHeight: 800,
        minBufferPx: 320,
        maxBufferPx: 720,
        maxExtraItems: 12,
        estimateSize: () => 26
      }
    ),
    Array.from({ length: 34 }, (_, index) => index + 8)
  )

  assert.deepEqual(
    resolveChatAdaptiveVirtualRange(
      { count: 100, startIndex: 20, endIndex: 29 },
      {
        viewportHeight: 800,
        minBufferPx: 320,
        maxBufferPx: 720,
        maxExtraItems: 12,
        estimateSize: () => 900
      }
    ),
    Array.from({ length: 12 }, (_, index) => index + 19)
  )
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

test('shouldDeferChatHeavyBlockLayout avoids double virtualization', () => {
  assert.equal(
    shouldDeferChatHeavyBlockLayout(
      { id: 'virtual-item', content: 'long markdown' },
      { virtualized: true, visibleMessageIds: new Set() }
    ),
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

test('resolveChatBottomScrollTarget skips no-op tail commits', () => {
  assert.deepEqual(
    resolveChatBottomScrollTarget({
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 799.5,
      tolerance: 1
    }),
    {
      targetScrollTop: 800,
      distancePx: 0.5,
      shouldScroll: false
    }
  )
  assert.deepEqual(
    resolveChatBottomScrollTarget({
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 620
    }),
    {
      targetScrollTop: 800,
      distancePx: 180,
      shouldScroll: true
    }
  )
})
