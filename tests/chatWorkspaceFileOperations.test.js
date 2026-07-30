import assert from 'node:assert/strict'
import test from 'node:test'

import {
  describeMissingChatWorkspaceFile,
  isMissingChatWorkspaceFileError,
  runChatWorkspaceFileAction
} from '../src/utils/chatWorkspaceFileOperations.js'

function createOperations(overrides = {}) {
  return {
    openFile: async () => true,
    openWorkspaceFile: async () => true,
    saveFileAs: async () => ({ canceled: false }),
    saveWorkspaceFileAs: async () => ({ canceled: false }),
    showItemInFolder: async () => true,
    showWorkspaceItemInFolder: async () => true,
    writeFile: async () => true,
    ...overrides
  }
}

test('host workspace files use the validated host workspace operation', async () => {
  const calls = []
  const operations = createOperations({
    saveWorkspaceFileAs: async (...args) => {
      calls.push(args)
      return { canceled: false, filePath: 'saved.md' }
    }
  })

  const outcome = await runChatWorkspaceFileAction({
    workspaceKind: 'host',
    workspacePath: 'C:\\Users\\Demo\\Downloads',
    path: 'output/report.md',
    name: 'report.md'
  }, 'save', {
    actionOptions: { suggestedName: 'report.md' },
    operations
  })

  assert.equal(outcome.recovered, false)
  assert.deepEqual(calls, [[
    'C:\\Users\\Demo\\Downloads',
    'output/report.md',
    { suggestedName: 'report.md' }
  ]])
})

test('missing structured-write results recover from historical tool arguments', async () => {
  const writes = []
  const saves = []
  const missing = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
  const operations = createOperations({
    saveWorkspaceFileAs: async () => {
      throw missing
    },
    writeFile: async (...args) => {
      writes.push(args)
      return true
    },
    saveFileAs: async (...args) => {
      saves.push(args)
      return { canceled: false, filePath: 'restored.md' }
    }
  })

  const outcome = await runChatWorkspaceFileAction({
    workspaceKind: 'host',
    workspacePath: 'C:\\Users\\Demo\\Downloads',
    path: 'output/report.md',
    name: 'report.md',
    recoveryDataPath: '.ai-tools-sandbox/workspaces/chat-demo/output/report.md',
    recovery: {
      encoding: 'utf8',
      content: '# recovered report'
    }
  }, 'save', {
    actionOptions: { suggestedName: 'report.md' },
    operations
  })

  assert.equal(outcome.recovered, true)
  assert.deepEqual(writes, [[
    '.ai-tools-sandbox/workspaces/chat-demo/output/report.md',
    '# recovered report'
  ]])
  assert.deepEqual(saves, [[
    '.ai-tools-sandbox/workspaces/chat-demo/output/report.md',
    { suggestedName: 'report.md' }
  ]])
})

test('missing files without recoverable content produce an actionable message', async () => {
  const missing = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
  const file = {
    workspaceKind: 'sandbox',
    dataPath: '.ai-tools-sandbox/workspaces/chat-demo/output/archive.zip',
    path: 'output/archive.zip',
    name: 'archive.zip'
  }

  assert.equal(isMissingChatWorkspaceFileError(missing), true)
  assert.match(describeMissingChatWorkspaceFile(file), /重新生成文件/)
  await assert.rejects(
    runChatWorkspaceFileAction(file, 'open', {
      operations: createOperations({
        openFile: async () => {
          throw missing
        }
      })
    }),
    /结果文件“archive\.zip”已不在原工作区中/
  )
})
