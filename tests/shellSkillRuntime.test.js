import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import createShellSkillRuntime from '../public/preload/builtin-skills/run-data-shell/runtime.js'

const require = createRequire(import.meta.url)
const globalConfig = require('../public/preload/utils/global-config.js')

test('shell Skill runtime clamps timeout to safe bounds', () => {
  assert.equal(createShellSkillRuntime._test.clampTimeout(1), 1000)
  assert.equal(createShellSkillRuntime._test.clampTimeout(5000), 5000)
  assert.equal(createShellSkillRuntime._test.clampTimeout(999999), 120000)
})

test('shell Skill runtime rejects obvious data-directory escapes', () => {
  const validate = createShellSkillRuntime._test.validateCommandBoundary
  assert.equal(validate('find note -type f | head'), 'find note -type f | head')
  assert.throws(() => validate('cat ../secret.txt'), /上级目录/)
  assert.throws(() => validate('cat C:\\Users\\Admin\\secret.txt'), /绝对磁盘路径/)
  assert.throws(() => validate('cat /c/Users/Admin/secret.txt'), /MSYS/)
  assert.throws(() => validate('ls /'), /根目录/)
  assert.throws(() => validate('cat file:///c/Users/Admin/secret.txt'), /文件 URL/)
  assert.throws(() => validate('cat //server/share/secret.txt'), /UNC/)
  assert.throws(() => validate('powershell Get-ChildItem C:\\'), /绝对磁盘路径|系统 Shell/)
  assert.throws(() => validate('cat $HOME/.ssh/config'), /位置变量/)
})

test('shell Skill runtime exposes explicit sandbox lifecycle actions', () => {
  assert.deepEqual(
    createShellSkillRuntime.ACTIONS.map((action) => action.name),
    ['sandbox_run', 'bash_run', 'sandbox_import', 'sandbox_list', 'sandbox_reset']
  )
  const runAction = createShellSkillRuntime.ACTIONS[0]
  assert.ok(runAction.inputSchema.properties.workspace_id)
  assert.deepEqual(runAction.inputSchema.properties.shell.enum, ['auto', 'powershell', 'bash'])
  assert.match(runAction.description, /isolated/i)
})

test('sandbox_run uses PowerShell commands on Windows and reports generated files', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-runtime-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const runtime = createShellSkillRuntime()
  const result = await runtime.runAction('sandbox_run', {
    workspace_id: 'powershell-test',
    command: "New-Item -ItemType Directory -Force output | Out-Null; Set-Content -Path output/result.txt -Value 'ok' -Encoding UTF8"
  })

  assert.equal(result.ok, true)
  assert.equal(result.shell, 'powershell')
  assert.equal(result.changedFiles.length, 1)
  assert.equal(result.changedFiles[0].path, 'output/result.txt')
  assert.equal(
    result.changedFiles[0].downloadHref,
    'sandbox-file://powershell-test/output/result.txt'
  )
})
