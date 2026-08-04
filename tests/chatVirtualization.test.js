import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const chatSource = fs.readFileSync(path.resolve('src/views/pages/chat/Chat.vue'), 'utf8')
const pageRuntimeSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatPageRuntime.js'),
  'utf8'
)
const conversationSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/ChatConversationPanel.vue'),
  'utf8'
)
const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))

test('chat delegates dynamic-height virtualization and end anchoring to TanStack Virtual', () => {
  assert.equal(typeof packageJson.dependencies?.['@tanstack/vue-virtual'], 'string')
  assert.match(chatSource, /useChatPageRuntime/)
  assert.match(pageRuntimeSource, /import\s+\{\s*useVirtualizer\s*\}\s+from\s+'@tanstack\/vue-virtual'/)
  assert.match(pageRuntimeSource, /anchorTo:\s*'end'/)
  assert.match(pageRuntimeSource, /followOnAppend:\s*true/)
  assert.match(pageRuntimeSource, /chatVirtualizer\.value\.measureElement\(el\)/)
  assert.match(pageRuntimeSource, /rangeExtractor:\s*extractAdaptiveChatVirtualRange/)
})

test('chat no longer runs a second manual height-compensation engine', () => {
  assert.doesNotMatch(pageRuntimeSource, /chatMessageResizeObserver/)
  assert.doesNotMatch(pageRuntimeSource, /queueChatScrollCompensation/)
  assert.doesNotMatch(pageRuntimeSource, /resolveChatViewportCompensation/)
})

test('virtual chat item refs stay stable while the parent reacts to scrolling', () => {
  assert.match(chatSource, /import ChatConversationPanel from '\.\/ChatConversationPanel\.vue'/)
  assert.match(chatSource, /:helpers="conversationPanelHelpers"/)
  assert.match(conversationSource, /:ref="helpers\.getChatVirtualItemRef\(msg\)"/)
  assert.match(pageRuntimeSource, /const chatItemRefCallbackMap = new Map\(\)/)
  assert.match(pageRuntimeSource, /const changed = setChatItemEl\(id, role, el\)\s+if \(!changed\) return/)
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
  assert.match(chatSource, /const CHAT_DEFERRED_LAYOUT_MIN_ESTIMATED_HEIGHT_PX = 4_800/)
  assert.match(chatSource, /const CHAT_DEFERRED_LAYOUT_MIN_VIEWPORTS = 6/)
  assert.match(pageRuntimeSource, /const chatDeferredLayoutPolicy = computed/)
  assert.match(pageRuntimeSource, /estimatedHeight:\s*chatEstimatedContentHeight\.value/)
  assert.match(pageRuntimeSource, /layoutReadyMessageIds:\s*laidOutHeavyChatMessageIds\.value/)
  assert.match(pageRuntimeSource, /mergeLaidOutHeavyChatMessageIds\(layoutReadyIds\)/)
  assert.match(pageRuntimeSource, /rootMargin:\s*`\$\{chatHeavyRenderRootMarginPx\.value\}px 0px`/)
  assert.match(pageRuntimeSource, /const chatDynamicLayoutRevision = computed/)
  assert.match(pageRuntimeSource, /watch\(\s*chatDynamicLayoutRevision[\s\S]*scheduleChatVirtualItemRemeasure/)
})
