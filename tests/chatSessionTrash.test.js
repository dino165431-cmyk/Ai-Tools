import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_SESSION_TRASH_RETENTION_DAYS,
  collectChatSessionOwnedSandboxWorkspaceIds,
  collectChatSessionSandboxWorkspaceIds,
  getChatSessionTrashRemainingDays
} from '../src/utils/chatSessionTrash.js'

test('chat session trash collects stable and legacy sandbox workspace references', () => {
  const workspaceIds = collectChatSessionSandboxWorkspaceIds([
    {
      payload: {
        session: {
          id: 'mem-1',
          sandboxWorkspaceId: 'chat-primary'
        },
        messages: [
          {
            role: 'user',
            attachments: [
              {
                sandboxWorkspaceId: 'chat-attachment',
                sandboxPath: 'inbox/input.pdf'
              }
            ]
          },
          {
            role: 'tool',
            content: 'sandbox_workspace_id: chat-tool\nsandbox_path: output/report.docx'
          }
        ]
      }
    }
  ])

  assert.deepEqual(
    [...workspaceIds].sort(),
    ['chat-attachment', 'chat-primary', 'chat-tool']
  )
})

test('chat session trash only treats the persisted session workspace as owned', () => {
  const ownedWorkspaceIds = collectChatSessionOwnedSandboxWorkspaceIds([
    {
      payload: {
        session: {
          sandboxWorkspaceId: 'chat-primary'
        },
        source: {
          sandboxWorkspaceId: 'chat-primary'
        },
        messages: [
          {
            attachments: [{ sandboxWorkspaceId: 'chat-shared-reference' }]
          }
        ]
      }
    }
  ])

  assert.deepEqual(ownedWorkspaceIds, ['chat-primary'])
})

test('chat session trash ignores malformed workspace ids and reports retention days', () => {
  assert.deepEqual(
    collectChatSessionSandboxWorkspaceIds({
      session: {
        sandboxWorkspaceId: '../escape'
      }
    }),
    []
  )

  const now = Date.UTC(2026, 6, 30, 0, 0, 0)
  assert.equal(
    getChatSessionTrashRemainingDays({
      purgeAt: new Date(now + CHAT_SESSION_TRASH_RETENTION_DAYS * 86400000).toISOString()
    }, now),
    CHAT_SESSION_TRASH_RETENTION_DAYS
  )
})
