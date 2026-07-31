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

test('dense short chat messages use calibrated estimates instead of tall generic cards', () => {
  assert.match(chatSource, /const CHAT_USER_MESSAGE_BASE_HEIGHT = 78/)
  assert.match(chatSource, /const CHAT_ASSISTANT_MESSAGE_BASE_HEIGHT = 82/)
  assert.match(chatSource, /const CHAT_TEXT_MESSAGE_MIN_HEIGHT = 92/)
  assert.doesNotMatch(chatSource, /role === 'assistant' \? 156 : 140/)
})

test('ordinary multi-turn chats stay in normal document flow and dynamic virtual cards remeasure', () => {
  assert.match(chatSource, /const CHAT_VIRTUALIZATION_MIN_MESSAGES = 72/)
  assert.match(chatSource, /const CHAT_VIRTUALIZATION_MIN_ITEMS_FOR_HEIGHT = 16/)
  assert.match(chatSource, /const chatDynamicLayoutRevision = computed/)
  assert.match(chatSource, /watch\(\s*chatDynamicLayoutRevision[\s\S]*scheduleChatVirtualItemRemeasure/)
})
