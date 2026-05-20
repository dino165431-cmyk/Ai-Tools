import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveChatSessionCreatedTimeMs } from '../src/utils/chatSessionCreatedTime.js'

test('resolveChatSessionCreatedTimeMs only uses created-time fields', () => {
  const createdAt = '2026-05-01T08:00:00.000Z'
  const savedAt = '2026-05-14T08:00:00.000Z'
  const updatedAt = '2026-05-15T08:00:00.000Z'

  assert.equal(
    resolveChatSessionCreatedTimeMs({
      createdAt,
      savedAt,
      updatedAt
    }),
    Date.parse(createdAt)
  )
})

test('resolveChatSessionCreatedTimeMs ignores savedAt when createdAt is missing', () => {
  assert.equal(
    resolveChatSessionCreatedTimeMs({
      savedAt: '2026-05-14T08:00:00.000Z',
      updatedAt: '2026-05-15T08:00:00.000Z'
    }),
    0
  )
})

test('resolveChatSessionCreatedTimeMs falls back to title-ready time for generated history sessions', () => {
  const titleReadyAt = '2026-05-19T10:20:30.000Z'

  assert.equal(
    resolveChatSessionCreatedTimeMs({
      source: {
        titleReadyAt
      }
    }),
    Date.parse(titleReadyAt)
  )
})
