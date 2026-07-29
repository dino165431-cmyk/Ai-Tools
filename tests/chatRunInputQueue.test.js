import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_RUN_INPUT_MODE_QUEUE,
  CHAT_RUN_INPUT_MODE_STEER,
  createChatRunInputQueue
} from '../src/utils/chatRunInputQueue.js'

function createQueue() {
  let id = 0
  let now = 100
  return createChatRunInputQueue({
    createId: () => `entry-${++id}`,
    now: () => ++now
  })
}

test('keeps FIFO order within a session', () => {
  const queue = createQueue()
  queue.enqueue('session-a', { text: 'first' })
  queue.enqueue('session-a', { text: 'second' })

  assert.deepEqual(queue.list('session-a').map((entry) => entry.text), ['first', 'second'])
  assert.equal(queue.takeNext('session-a').text, 'first')
  assert.equal(queue.takeNext('session-a').text, 'second')
})

test('steering entries are consumed before normal queued entries', () => {
  const queue = createQueue()
  queue.enqueue('session-a', { text: 'queued first' }, CHAT_RUN_INPUT_MODE_QUEUE)
  queue.enqueue('session-a', { text: 'guide now' }, CHAT_RUN_INPUT_MODE_STEER)
  queue.enqueue('session-a', { text: 'queued second' }, CHAT_RUN_INPUT_MODE_QUEUE)

  assert.equal(queue.takeNext('session-a').text, 'guide now')
  assert.deepEqual(queue.list('session-a').map((entry) => entry.text), ['queued first', 'queued second'])
})

test('takes all steering entries in their original order and preserves attachments', () => {
  const queue = createQueue()
  const attachment = { id: 'file-1', name: 'notes.md' }
  queue.enqueue('session-a', { text: 'queued' })
  queue.enqueue('session-a', { text: 'guide one', attachments: [attachment] }, CHAT_RUN_INPUT_MODE_STEER)
  queue.enqueue('session-a', { text: 'guide two' }, CHAT_RUN_INPUT_MODE_STEER)

  const steering = queue.takeSteering('session-a')
  assert.deepEqual(steering.map((entry) => entry.text), ['guide one', 'guide two'])
  assert.equal(steering[0].attachments[0], attachment)
  assert.deepEqual(queue.list('session-a').map((entry) => entry.text), ['queued'])
})

test('restores claimed entries without duplicating them', () => {
  const queue = createQueue()
  queue.enqueue('session-a', { text: 'guide' }, CHAT_RUN_INPUT_MODE_STEER)
  const claimed = queue.takeSteering('session-a')

  queue.restore('session-a', claimed)
  queue.restore('session-a', claimed)

  assert.equal(queue.count('session-a'), 1)
  assert.equal(queue.takeNext('session-a').text, 'guide')
})

test('promotes an existing queued entry to steering without changing its identity or order', () => {
  const queue = createQueue()
  const first = queue.enqueue('session-a', { text: 'queued first' }, CHAT_RUN_INPUT_MODE_QUEUE)
  const second = queue.enqueue('session-a', { text: 'queued second' }, CHAT_RUN_INPUT_MODE_QUEUE)

  const promoted = queue.setMode('session-a', second.id, CHAT_RUN_INPUT_MODE_STEER)

  assert.equal(promoted, second)
  assert.equal(promoted.mode, CHAT_RUN_INPUT_MODE_STEER)
  assert.deepEqual(queue.list('session-a').map((entry) => entry.id), [first.id, second.id])
  assert.equal(queue.takeNext('session-a').id, second.id)
  assert.equal(queue.takeNext('session-a').id, first.id)
})
