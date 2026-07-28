import assert from 'node:assert/strict'
import test from 'node:test'

import { createChatToolApprovalController } from '../src/utils/chatToolApprovalController.js'

test('chat approval controller remembers and clears exact session grants', async () => {
  let id = 0
  const controller = createChatToolApprovalController({
    createId: () => String(++id),
    throwIfAborted() {}
  })
  const approvalKey = JSON.stringify(['session-1', 'server', 'tool', 'tool', ['tool']])
  const pending = controller.requestApproval({
    serverName: 'Server',
    toolName: 'write',
    argsText: '{"value":1}',
    sessionId: 'session-1',
    onRememberForSession: () => controller.remember(approvalKey)
  })

  assert.equal(controller.pendingApprovalCount.value, 1)
  controller.resolveActive('session')
  assert.equal(await pending, true)
  assert.equal(controller.isApproved(approvalKey), true)
  assert.equal(controller.pendingApprovalCount.value, 0)

  controller.clearSession('session-1')
  assert.equal(controller.isApproved(approvalKey), false)
})

test('chat approval controller cancels every queued request', async () => {
  let id = 0
  const controller = createChatToolApprovalController({
    createId: () => String(++id),
    throwIfAborted() {}
  })

  const first = controller.requestApproval({
    serverName: 'Server',
    toolName: 'first',
    argsText: '{}'
  })
  const second = controller.requestApproval({
    serverName: 'Server',
    toolName: 'second',
    argsText: '{}'
  })

  assert.equal(controller.pendingApprovalCount.value, 2)
  controller.cancelPending()
  assert.deepEqual(await Promise.all([first, second]), [null, null])
  assert.equal(controller.pendingApprovalCount.value, 0)
})
