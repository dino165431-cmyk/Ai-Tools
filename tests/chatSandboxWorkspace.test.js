import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChatAttachmentReferenceBlock,
  buildChatSandboxWorkspaceId,
  extractChatSandboxDescriptors,
  resolveChatToolWorkspaceScope,
  withDefaultChatSandboxWorkspaceId
} from '../src/utils/chatSandboxWorkspace.js'

test('chat sandbox workspace ids are stable, safe, and bounded', () => {
  assert.equal(buildChatSandboxWorkspaceId('session id/with spaces'), 'chat-session-id-with-spaces')
  assert.ok(buildChatSandboxWorkspaceId('x'.repeat(200)).length <= 80)
})

test('attachment references point to the sandbox without embedding parsed content', () => {
  const block = buildChatAttachmentReferenceBlock({
    name: 'large.json',
    size: 293609,
    mime: 'application/json',
    sandboxWorkspaceId: 'chat-session-1',
    sandboxPath: 'inbox/large.json',
    text: 'FULL_CONTENT_MUST_NOT_APPEAR'
  })

  assert.match(block, /sandbox_workspace_id: chat-session-1/)
  assert.match(block, /sandbox_path: inbox\/large\.json/)
  assert.doesNotMatch(block, /FULL_CONTENT_MUST_NOT_APPEAR/)
})

test('sandbox descriptors survive normalization and workspace id defaults are injected safely', () => {
  const descriptor = extractChatSandboxDescriptors([
    '沙盒工作区：chat-old',
    '沙盒文件：inbox/old.json'
  ].join('\n'))
  assert.equal(descriptor, 'sandbox_workspace_id: chat-old\nsandbox_path: inbox/old.json')

  assert.deepEqual(
    withDefaultChatSandboxWorkspaceId({ path: 'inbox/a.txt' }, 'session-a'),
    { path: 'inbox/a.txt', workspace_id: 'chat-session-a' }
  )
  assert.deepEqual(
    withDefaultChatSandboxWorkspaceId({ workspace_id: 'explicit' }, 'session-a'),
    { workspace_id: 'explicit' }
  )
  assert.deepEqual(
    withDefaultChatSandboxWorkspaceId({ path: 'a.txt' }, 'session-a'),
    { path: 'a.txt', workspace_id: 'chat-session-a' }
  )
})

test('chat shell actions default to sandbox while file listing can search both roots', () => {
  assert.equal(
    resolveChatToolWorkspaceScope('sandbox_run', {}, { hasHostWorkspace: true }),
    'sandbox'
  )
  assert.equal(
    resolveChatToolWorkspaceScope('sandbox_write_file', {}, { hasHostWorkspace: true }),
    'sandbox'
  )
  assert.equal(
    resolveChatToolWorkspaceScope('sandbox_list', {}, { hasHostWorkspace: true }),
    'all'
  )
  assert.equal(
    resolveChatToolWorkspaceScope('sandbox_list', { workspace_scope: 'host' }, { hasHostWorkspace: true }),
    'host'
  )
  assert.equal(
    resolveChatToolWorkspaceScope('sandbox_run', { workspace_scope: 'all' }, { hasHostWorkspace: true }),
    'all'
  )
})
