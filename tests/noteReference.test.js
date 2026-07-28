import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNoteReference,
  extractTrailingNoteReferenceTrigger,
  replaceNoteReferenceTrigger
} from '../src/utils/noteReference.js'

test('note reference trigger recognizes trailing double brackets', () => {
  assert.deepEqual(
    extractTrailingNoteReferenceTrigger('see [[project plan'),
    {
      query: 'project plan',
      start: 4,
      end: 18,
      token: '[[project plan'
    }
  )
  assert.equal(extractTrailingNoteReferenceTrigger('inside x[[project'), null)
  assert.equal(extractTrailingNoteReferenceTrigger('closed [[project]]'), null)
})

test('note reference builder creates safe note markdown links', () => {
  assert.deepEqual(
    buildNoteReference({
      path: 'docs/project plan.md',
      title: 'Project [Plan]'
    }),
    {
      label: 'Project \\[Plan\\]',
      href: 'note:/docs/project%20plan.md',
      markdown: '[Project \\[Plan\\]](note:/docs/project%20plan.md)',
      absoluteNotePath: 'note/docs/project plan.md'
    }
  )
})

test('note reference trigger can be replaced with the selected result', () => {
  const source = 'Related: [[project'
  const trigger = extractTrailingNoteReferenceTrigger(source)
  const replaced = replaceNoteReferenceTrigger(source, trigger, {
    path: 'project.md',
    title: 'Project'
  })
  assert.equal(replaced.content, 'Related: [Project](note:/project.md)')
})
