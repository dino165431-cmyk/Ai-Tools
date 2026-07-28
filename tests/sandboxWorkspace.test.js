import test from 'node:test'
import assert from 'node:assert/strict'

import sandboxWorkspace from '../public/preload/utils/sandbox-workspace.js'

test('sandbox workspace validates ids and relative paths', () => {
  assert.equal(sandboxWorkspace.normalizeWorkspaceId('chat-123'), 'chat-123')
  assert.equal(sandboxWorkspace.normalizeSandboxRelativePath('output\\report.docx'), 'output/report.docx')
  assert.throws(() => sandboxWorkspace.normalizeWorkspaceId('../escape'), /workspace_id/)
  assert.throws(() => sandboxWorkspace.normalizeSandboxRelativePath('../secret.txt'), /不能离开/)
  assert.throws(() => sandboxWorkspace.normalizeSandboxRelativePath('C:\\secret.txt'), /相对路径/)
})

test('sandbox changed-file detection returns only new or modified regular entries', () => {
  const before = new Map([
    ['same.txt', { path: 'same.txt', size: 1, modifiedAt: 1 }],
    ['changed.txt', { path: 'changed.txt', size: 1, modifiedAt: 1 }]
  ])
  const after = new Map([
    ['same.txt', { path: 'same.txt', size: 1, modifiedAt: 1 }],
    ['changed.txt', { path: 'changed.txt', size: 2, modifiedAt: 2 }],
    ['new.txt', { path: 'new.txt', size: 3, modifiedAt: 3 }]
  ])

  assert.deepEqual(
    sandboxWorkspace.collectChangedFiles(before, after).map((file) => file.path),
    ['changed.txt', 'new.txt']
  )
})
