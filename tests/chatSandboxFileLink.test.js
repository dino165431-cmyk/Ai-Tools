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
