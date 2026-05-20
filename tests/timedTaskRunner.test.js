import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTimedTaskRunPatch, executeTimedTaskRun } from '../src/utils/timedTaskRunner.js'

test('buildTimedTaskRunPatch records the execution start time on success', () => {
  const startedAt = new Date('2026-05-11T10:00:00.000Z')
  const patch = buildTimedTaskRunPatch({ trigger: { type: 'interval' } }, startedAt)

  assert.deepEqual(patch, {
    lastRunAt: '2026-05-11T10:00:00.000Z'
  })
})

test('buildTimedTaskRunPatch records the execution start time and error metadata on failure', () => {
  const startedAt = new Date('2026-05-11T10:00:00.000Z')
  const patch = buildTimedTaskRunPatch(
    { trigger: { type: 'once' } },
    startedAt,
    new Error('boom')
  )

  assert.equal(patch.enabled, false)
  assert.equal(patch.lastRunAt, '2026-05-11T10:00:00.000Z')
  assert.equal(patch.lastError, 'boom')
  assert.match(patch.lastErrorAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('executeTimedTaskRun keeps execution success separate from update failures', async () => {
  const startedAt = new Date('2026-05-11T10:00:00.000Z')
  const updateCalls = []
  const updateError = new Error('write failed')

  const result = await executeTimedTaskRun(
    'task-1',
    { trigger: { type: 'once' } },
    startedAt,
    {
      runOnce: async () => {},
      updateTask: async (taskId, patch) => {
        updateCalls.push({ taskId, patch })
        throw updateError
      }
    }
  )

  assert.equal(result.runError, null)
  assert.equal(result.updateError, updateError)
  assert.deepEqual(updateCalls, [
    {
      taskId: 'task-1',
      patch: {
        lastRunAt: '2026-05-11T10:00:00.000Z',
        enabled: false
      }
    }
  ])
})

test('executeTimedTaskRun records error metadata only when execution fails', async () => {
  const startedAt = new Date('2026-05-11T10:00:00.000Z')
  const updateCalls = []

  const result = await executeTimedTaskRun(
    'task-2',
    { trigger: { type: 'once' } },
    startedAt,
    {
      runOnce: async () => {
        throw new Error('boom')
      },
      updateTask: async (taskId, patch) => {
        updateCalls.push({ taskId, patch })
      }
    }
  )

  assert.equal(result.updateError, null)
  assert.match(result.runError.message, /boom/)
  assert.deepEqual(updateCalls, [
    {
      taskId: 'task-2',
      patch: {
        lastRunAt: '2026-05-11T10:00:00.000Z',
        enabled: false,
        lastError: 'boom',
        lastErrorAt: result.patch.lastErrorAt
      }
    }
  ])
})
