import assert from 'node:assert/strict'
import test from 'node:test'

import createShellSkillRuntime from '../public/preload/builtin-skills/run-data-shell/runtime.js'

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
