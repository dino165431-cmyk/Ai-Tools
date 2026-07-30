import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import sandboxWorkspace from '../public/preload/utils/sandbox-workspace.js'
import globalConfig from '../public/preload/utils/global-config.js'

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

test('sandbox reference scanner recognizes persisted session and descriptor workspace ids', () => {
  const found = sandboxWorkspace._test.collectWorkspaceIdsFromValue({
    session: {
      sandboxWorkspaceId: 'chat-session-primary'
    },
    messages: [
      {
        content: 'sandbox_workspace_id: chat-session-legacy\nsandbox_path: output/result.txt'
      }
    ]
  })

  assert.deepEqual(
    [...found].sort(),
    ['chat-session-legacy', 'chat-session-primary']
  )
})

test('sandbox trash purge treats an empty selection as a no-op', async () => {
  assert.deepEqual(
    await sandboxWorkspace.purgeSandboxTrashEntries([], { force: true }),
    []
  )
})

test('sandbox inventory reports usage and protects session-referenced workspaces', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tools-sandbox-inventory-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot

  try {
    const workspacesRoot = path.join(tempRoot, '.ai-tools-sandbox', 'workspaces')
    await fs.mkdir(path.join(workspacesRoot, 'chat-used', 'output'), { recursive: true })
    await fs.mkdir(path.join(workspacesRoot, 'chat-unused', 'inbox'), { recursive: true })
    await fs.writeFile(path.join(workspacesRoot, 'chat-used', 'output', 'answer.txt'), 'used')
    await fs.writeFile(path.join(workspacesRoot, 'chat-unused', 'inbox', 'draft.txt'), 'unused')
    await fs.mkdir(path.join(tempRoot, 'session'), { recursive: true })
    await fs.writeFile(
      path.join(tempRoot, 'session', 'used.json'),
      JSON.stringify({ session: { sandboxWorkspaceId: 'chat-used' } })
    )

    const inventory = await sandboxWorkspace.listSandboxWorkspaces()
    const used = inventory.find((item) => item.workspaceId === 'chat-used')
    const unused = inventory.find((item) => item.workspaceId === 'chat-unused')

    assert.equal(used.referenceStatus, 'referenced')
    assert.equal(used.fileCount, 1)
    assert.equal(used.totalBytes, 4)
    assert.equal(unused.referenceStatus, 'orphaned')
    assert.equal(unused.fileCount, 1)
    assert.equal(unused.totalBytes, 6)
    assert.equal(unused.workspacePath, '.ai-tools-sandbox/workspaces/chat-unused')
  } finally {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('sandbox trash inventory includes recoverable entry usage', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tools-sandbox-trash-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot

  try {
    const trashId = 'chat-old-entry'
    const entryRoot = path.join(tempRoot, '.ai-tools-sandbox', 'trash', trashId)
    await fs.mkdir(path.join(entryRoot, 'workspace', 'output'), { recursive: true })
    await fs.writeFile(path.join(entryRoot, 'workspace', 'output', 'result.txt'), 'result')
    await fs.writeFile(
      path.join(entryRoot, 'manifest.json'),
      JSON.stringify({
        version: 1,
        trashId,
        workspaceId: 'chat-old',
        status: 'trashed',
        deletedAt: '2026-07-01T00:00:00.000Z',
        purgeAt: '2026-07-31T00:00:00.000Z'
      })
    )

    const entries = await sandboxWorkspace.listSandboxTrashEntries()
    assert.equal(entries.length, 1)
    assert.equal(entries[0].workspaceId, 'chat-old')
    assert.equal(entries[0].fileCount, 1)
    assert.equal(entries[0].totalBytes, 6)
    assert.equal(entries[0].exists, true)
  } finally {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})
