import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const chatSource = fs.readFileSync(path.resolve('src/views/pages/chat/Chat.vue'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))

test('chat delegates dynamic-height virtualization and end anchoring to TanStack Virtual', () => {
  assert.equal(typeof packageJson.dependencies?.['@tanstack/vue-virtual'], 'string')
  assert.match(chatSource, /import\s+\{\s*useVirtualizer\s*\}\s+from\s+'@tanstack\/vue-virtual'/)
  assert.match(chatSource, /anchorTo:\s*'end'/)
  assert.match(chatSource, /followOnAppend:\s*true/)
  assert.match(chatSource, /chatVirtualizer\.value\.measureElement\(el\)/)
  assert.match(chatSource, /rangeExtractor:\s*extractAdaptiveChatVirtualRange/)
})

test('chat no longer runs a second manual height-compensation engine', () => {
  assert.doesNotMatch(chatSource, /chatMessageResizeObserver/)
  assert.doesNotMatch(chatSource, /queueChatScrollCompensation/)
  assert.doesNotMatch(chatSource, /resolveChatViewportCompensation/)
})

test('virtual chat item refs stay stable while the parent reacts to scrolling', () => {
  assert.match(chatSource, /:ref="getChatVirtualItemRef\(msg\)"/)
  assert.match(chatSource, /const chatItemRefCallbackMap = new Map\(\)/)
  assert.match(chatSource, /const changed = setChatItemEl\(id, role, el\)\s+if \(!changed\) return/)
  assert.doesNotMatch(chatSource, /:ref="\s*\(el\)\s*=>\s*setChatVirtualItemEl/)
})
