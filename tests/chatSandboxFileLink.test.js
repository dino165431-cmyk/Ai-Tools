import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSandboxFileHref,
  collectSandboxFileCatalog,
  parseSandboxFileHref,
  resolveSandboxFileLink
} from '../src/utils/chatSandboxFileLink.js'

test('sandbox file href round-trips workspace and encoded path', () => {
  const href = buildSandboxFileHref('chat-demo', 'output/测试 file.zip')
  assert.equal(href, 'sandbox-file://chat-demo/output/%E6%B5%8B%E8%AF%95%20file.zip')
  assert.deepEqual(parseSandboxFileHref(href), {
    workspaceId: 'chat-demo',
    name: '测试 file.zip',
    path: 'output/测试 file.zip',
    dataPath: '.ai-tools-sandbox/workspaces/chat-demo/output/测试 file.zip',
    href
  })
})

test('sandbox file links reject traversal and resolve unique markdown basenames', () => {
  assert.equal(parseSandboxFileHref('sandbox-file://chat-demo/../secret.txt'), null)
  const catalog = collectSandboxFileCatalog([{
    toolResultPayload: {
      kind: 'sandbox_shell_result',
      workspaceId: 'chat-demo',
      changedFiles: [{
        name: 'result.zip',
        path: 'output/result.zip',
        dataPath: '.ai-tools-sandbox/workspaces/chat-demo/output/result.zip'
      }]
    }
  }])
  assert.equal(resolveSandboxFileLink('result.zip', catalog)?.dataPath, catalog[0].dataPath)
  assert.equal(resolveSandboxFileLink('./output/result.zip', catalog)?.dataPath, catalog[0].dataPath)
})

test('host workspace results keep their real source and recoverable structured-write content', () => {
  const href = 'sandbox-file://chat-demo/output/report.md'
  const catalog = collectSandboxFileCatalog([
    {
      toolName: 'sandbox_write_file',
      toolArgsText: JSON.stringify({
        workspace_id: 'chat-demo',
        path: 'output/report.md',
        encoding: 'utf8',
        mode: 'overwrite',
        content: '# recovered report'
      }),
      toolResultPayload: {
        kind: 'sandbox_write_file_result',
        workspaceId: 'chat-demo',
        workspaceKind: 'host',
        workspacePath: 'C:\\Users\\Demo\\Downloads',
        changedFiles: [{
          name: 'report.md',
          path: 'output/report.md',
          size: 18
        }]
      }
    },
    {
      toolName: 'sandbox_list',
      toolResultPayload: {
        kind: 'sandbox_list_result',
        workspaceId: 'chat-demo',
        workspaceKind: 'host',
        workspacePath: 'C:\\Users\\Demo\\Downloads',
        files: [{
          name: 'report.md',
          path: 'output/report.md',
          size: 18
        }]
      }
    }
  ])

  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].workspaceKind, 'host')
  assert.equal(catalog[0].workspacePath, 'C:\\Users\\Demo\\Downloads')
  assert.equal(catalog[0].dataPath, '')
  assert.equal(
    catalog[0].recoveryDataPath,
    '.ai-tools-sandbox/workspaces/chat-demo/output/report.md'
  )
  assert.deepEqual(catalog[0].recovery, {
    encoding: 'utf8',
    content: '# recovered report'
  })
  assert.equal(resolveSandboxFileLink(href, catalog)?.workspaceKind, 'host')
  assert.equal(resolveSandboxFileLink(href, catalog)?.recovery?.content, '# recovered report')
})
