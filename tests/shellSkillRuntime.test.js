import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import createShellSkillRuntime from '../public/preload/builtin-skills/run-data-shell/runtime.js'

const require = createRequire(import.meta.url)
const globalConfig = require('../public/preload/utils/global-config.js')
const builtinSkills = require('../public/preload/builtin-skills/index.js')

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
    [
      'sandbox_status',
      'sandbox_run',
      'bash_run',
      'sandbox_read_file',
      'sandbox_write_file',
      'sandbox_import',
      'sandbox_list',
      'sandbox_reset'
    ]
  )
  const runAction = createShellSkillRuntime.ACTIONS.find((action) => action.name === 'sandbox_run')
  const listAction = createShellSkillRuntime.ACTIONS.find((action) => action.name === 'sandbox_list')
  assert.ok(runAction.inputSchema.properties.workspace_id)
  assert.deepEqual(runAction.inputSchema.properties.shell.enum, ['auto', 'powershell', 'bash'])
  assert.deepEqual(
    runAction.inputSchema.properties.workspace_scope.enum,
    ['sandbox', 'host']
  )
  assert.deepEqual(
    listAction.inputSchema.properties.workspace_scope.enum,
    ['sandbox', 'host', 'all']
  )
  assert.match(runAction.description, /not an OS-level process sandbox/i)
})

test('shell action policy lets approval mode distinguish ordinary from dangerous execution', async () => {
  const actions = await builtinSkills.listBuiltinSkillActions(builtinSkills.BUILTIN_SKILL_IDS.shell)
  const byName = new Map(actions.map((action) => [action.name, action]))
  assert.equal(byName.get('sandbox_status').forceApproval, false)
  assert.equal(byName.get('sandbox_read_file').forceApproval, false)
  assert.equal(byName.get('sandbox_run').forceApproval, true)
  assert.equal(byName.get('sandbox_run').hardApproval, false)
  assert.equal(byName.get('sandbox_run').approvalKind, 'shell')
  assert.equal(byName.get('sandbox_write_file').forceApproval, true)
  assert.equal(byName.get('sandbox_write_file').hardApproval, false)
  assert.equal(byName.get('sandbox_reset').hardApproval, true)
})

test('runtime PATH merges refreshed entries and resolves executable files', (t) => {
  const toolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-path-'))
  const executable = path.join(toolRoot, process.platform === 'win32' ? 'uv.exe' : 'uv')
  fs.writeFileSync(executable, '')
  t.after(() => fs.rmSync(toolRoot, { recursive: true, force: true }))

  const runtimePath = createShellSkillRuntime._test.buildRuntimePath({
    env: { PATH: 'C:\\stale' },
    registryPaths: [],
    knownDirectories: [toolRoot],
    refresh: true
  })
  assert.ok(runtimePath.split(path.delimiter).includes(toolRoot))
  assert.equal(
    createShellSkillRuntime._test.findRuntimeExecutable('uv', runtimePath),
    executable
  )
})

test('shell Skill runtime decodes UTF-8 across chunk boundaries and falls back to GB18030 on Windows', () => {
  const helpers = createShellSkillRuntime._test
  const utf8 = Buffer.from('命令输出：中文', 'utf8')
  const collector = helpers.createOutputCollector()
  helpers.appendOutputChunk(collector, utf8.subarray(0, 2))
  helpers.appendOutputChunk(collector, utf8.subarray(2, 7))
  helpers.appendOutputChunk(collector, utf8.subarray(7))
  assert.equal(helpers.finishOutputCollector(collector).text, '命令输出：中文')

  const gb18030Chinese = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])
  assert.equal(
    helpers.decodeCommandOutput(gb18030Chinese, { platform: 'win32' }),
    '中文'
  )
})

test('PowerShell launch forces UTF-8 output with an encoded command', {
  skip: process.platform !== 'win32'
}, () => {
  const launch = createShellSkillRuntime._test.resolveShellLaunch('powershell', 'Write-Output "中文"')
  const encodedIndex = launch.args.indexOf('-EncodedCommand')
  assert.ok(encodedIndex >= 0)
  const decoded = Buffer.from(launch.args[encodedIndex + 1], 'base64').toString('utf16le')
  assert.match(decoded, /Console\]::OutputEncoding/)
  assert.match(decoded, /Write-Output "中文"/)
})

test('shell Skill runtime resolves an explicitly selected host workspace and relative cwd', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-data-'))
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-host-workspace-'))
  const nested = path.join(hostRoot, 'nested')
  fs.mkdirSync(nested)
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(hostRoot, { recursive: true, force: true })
  })

  const resolved = await createShellSkillRuntime._test.resolveWorkingDirectory(
    'nested',
    'host-workspace-test',
    hostRoot,
    'host'
  )
  assert.equal(resolved.workspaceKind, 'host')
  assert.equal(resolved.workspacePath, fs.realpathSync(hostRoot))
  assert.equal(resolved.cwd, fs.realpathSync(nested))
  assert.equal(resolved.relative, 'nested')
  await assert.rejects(
    createShellSkillRuntime._test.resolveWorkingDirectory(
      '../outside',
      'host-workspace-test',
      hostRoot,
      'host'
    ),
    /离开当前工作区/
  )
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

test('sandbox_run preserves Chinese text in the PowerShell error stream', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-error-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const runtime = createShellSkillRuntime()
  const result = await runtime.runAction('sandbox_run', {
    workspace_id: 'powershell-error-test',
    command: "Write-Error '中文错误'; exit 1"
  })

  assert.equal(result.ok, false)
  assert.match(result.stderr, /中文错误/)
  assert.doesNotMatch(result.stderr, /\uFFFD/)
})

test('sandbox_run executes in a user-selected host workspace without scanning the whole project', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-data-'))
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-host-workspace-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(hostRoot, { recursive: true, force: true })
  })

  const runtime = createShellSkillRuntime()
  const result = await runtime.runAction('sandbox_run', {
    workspace_id: 'host-run-test',
    workspace_scope: 'host',
    __host_workspace_path: hostRoot,
    command: "Set-Content -Path result.txt -Value 'ok' -Encoding UTF8; Write-Output '完成'"
  })

  assert.equal(result.ok, true)
  assert.equal(result.workspaceKind, 'host')
  assert.equal(result.workspacePath, fs.realpathSync(hostRoot))
  assert.equal(result.sandboxEnforced, false)
  assert.equal(result.isolationLevel, 'host-workspace')
  assert.equal(typeof result.tracksChanges, 'boolean')
  if (result.tracksChanges) {
    assert.ok(result.changedFiles.some((file) => file.path === 'result.txt'))
  }
  assert.match(result.stdout, /完成/)
  assert.equal(fs.existsSync(path.join(hostRoot, 'result.txt')), true)
})

test('structured workspace file actions accept source text without shell boundary false positives', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-data-'))
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-host-structured-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(hostRoot, { recursive: true, force: true })
  })

  const runtime = createShellSkillRuntime()
  const content = [
    '# Example',
    'Install path: C:/Users/Admin/Downloads/demo',
    'Formula: sin(pi / 4)',
    'URL: https://example.com/docs'
  ].join('\n')
  const written = await runtime.runAction('sandbox_write_file', {
    workspace_scope: 'host',
    __host_workspace_path: hostRoot,
    path: 'docs/README.md',
    content
  })
  assert.equal(written.ok, true)
  assert.equal(written.changedFiles[0].path, 'docs/README.md')

  const read = await runtime.runAction('sandbox_read_file', {
    workspace_scope: 'host',
    __host_workspace_path: hostRoot,
    path: 'docs/README.md'
  })
  assert.equal(read.content, content)

  const utf16Text = '中文日志\nsecond line'
  fs.writeFileSync(
    path.join(hostRoot, 'docs', 'utf16.log'),
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(utf16Text, 'utf16le')])
  )
  const utf16Read = await runtime.runAction('sandbox_read_file', {
    workspace_scope: 'host',
    __host_workspace_path: hostRoot,
    path: 'docs/utf16.log'
  })
  assert.equal(utf16Read.content, utf16Text)
  assert.doesNotMatch(utf16Read.content, /\uFFFD|\u0000/)

  const listed = await runtime.runAction('sandbox_list', {
    workspace_scope: 'host',
    __host_workspace_path: hostRoot,
    path: 'docs'
  })
  assert.equal(listed.workspaceKind, 'host')
  assert.deepEqual(listed.files.map((file) => file.path), ['docs/README.md', 'docs/utf16.log'])
})

test('chat sandbox remains the default while all-scope listing searches sandbox and host', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-dual-data-'))
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-dual-host-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(hostRoot, { recursive: true, force: true })
  })

  const runtime = createShellSkillRuntime()
  const workspaceId = 'chat-dual-workspace-test'
  const written = await runtime.runAction('sandbox_write_file', {
    workspace_id: workspaceId,
    __host_workspace_path: hostRoot,
    path: 'inbox/attachment.txt',
    content: 'sandbox attachment'
  })
  assert.equal(written.workspaceKind, 'sandbox')
  assert.equal(
    written.file.downloadHref,
    `sandbox-file://${workspaceId}/inbox/attachment.txt`
  )
  assert.equal(fs.existsSync(path.join(hostRoot, 'inbox', 'attachment.txt')), false)

  const read = await runtime.runAction('sandbox_read_file', {
    workspace_id: workspaceId,
    __host_workspace_path: hostRoot,
    path: 'inbox/attachment.txt'
  })
  assert.equal(read.workspaceKind, 'sandbox')
  assert.equal(read.content, 'sandbox attachment')

  fs.writeFileSync(path.join(hostRoot, 'host-source.txt'), 'host source')
  const listed = await runtime.runAction('sandbox_list', {
    workspace_id: workspaceId,
    workspace_scope: 'all',
    __host_workspace_path: hostRoot
  })
  assert.equal(listed.workspaceKind, 'multiple')
  assert.deepEqual(
    new Set(listed.workspaces.map((workspace) => workspace.workspaceKind)),
    new Set(['sandbox', 'host'])
  )
  assert.ok(listed.files.some((file) =>
    file.path === 'inbox/attachment.txt' &&
    file.workspaceKind === 'sandbox' &&
    file.workspaceId === workspaceId
  ))
  assert.ok(listed.files.some((file) =>
    file.path === 'host-source.txt' &&
    file.workspaceKind === 'host' &&
    file.workspacePath === fs.realpathSync(hostRoot)
  ))
})

test('built-in Skill registry ignores model-supplied host paths and accepts only host context', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-shell-registry-'))
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-host-registry-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(async () => {
    await builtinSkills.closeBuiltinSkillRuntimes()
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(hostRoot, { recursive: true, force: true })
  })

  const forged = await builtinSkills.runBuiltinSkillAction(
    builtinSkills.BUILTIN_SKILL_IDS.shell,
    'sandbox_run',
    {
      workspace_id: 'registry-default-test',
      __host_workspace_path: hostRoot,
      command: "Set-Content -Path forged.txt -Value 'no' -Encoding UTF8"
    }
  )
  assert.equal(forged.workspaceKind, 'sandbox')
  assert.equal(fs.existsSync(path.join(hostRoot, 'forged.txt')), false)

  const authorized = await builtinSkills.runBuiltinSkillActionWithHostContext(
    builtinSkills.BUILTIN_SKILL_IDS.shell,
    'sandbox_run',
    {
      workspace_id: 'registry-host-test',
      workspace_scope: 'host',
      command: "Set-Content -Path authorized.txt -Value 'yes' -Encoding UTF8"
    },
    { hostWorkspacePath: hostRoot }
  )
  assert.equal(authorized.workspaceKind, 'host')
  assert.equal(fs.existsSync(path.join(hostRoot, 'authorized.txt')), true)
})
