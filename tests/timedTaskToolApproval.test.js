import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8')
}

test('timed tasks expose an explicit unattended tool policy instead of hard-coding full access', () => {
  const viewSource = readSource('src/views/pages/setting/timedTask/TimedTask.vue')
  const executorSource = readSource('src/utils/timedTaskRunnerExecutor.js')

  assert.match(viewSource, /toolApprovalMode:\s*'safe'/)
  assert.match(viewSource, /低风险只读（推荐）/)
  assert.match(viewSource, /禁止工具/)
  assert.match(viewSource, /高风险自动（明显危险操作仍阻止）/)
  assert.doesNotMatch(viewSource, /toolApprovalMode:\s*'full'\s*\n\s*}/)

  assert.match(executorSource, /normalizeUnattendedToolApprovalMode/)
  assert.match(executorSource, /evaluateToolApproval\(\{[\s\S]*?interactive:\s*false/)
  assert.match(executorSource, /isDangerousShellApprovalCommand/)
  assert.match(executorSource, /resolveMcpToolApprovalPolicy\(t\)/)
})

test('timed task tool failures are rendered as errors in both provider paths', () => {
  const executorSource = readSource('src/utils/timedTaskRunnerExecutor.js')
  const statusChecks = executorSource.match(/status:\s*exec\?\.ok === false \? 'error' : 'success'/g) || []

  assert.equal(statusChecks.length, 2)
})

test('timed tasks may omit an Agent and then resolve the builtin default', () => {
  const viewSource = readSource('src/views/pages/setting/timedTask/TimedTask.vue')
  const executorSource = readSource('src/utils/timedTaskRunnerExecutor.js')
  const configSkillSource = readSource('public/preload/builtin-skills/manage-ai-tools-config/runtime.js')

  assert.match(viewSource, /未指定时由后台默认通用 Agent 执行/)
  assert.match(viewSource, /\.filter\(\(agent\) => agent\?\.builtin !== true\)/)
  assert.doesNotMatch(viewSource, /agentId:\s*\{\s*required:\s*true/)
  assert.match(executorSource, /find\(\(item\) => item\?\.builtin === true\)/)
  assert.match(executorSource, /默认通用 Agent 不可用/)

  const timedTaskRequired = configSkillSource.match(
    /name:\s*'config_add_timed_task'[\s\S]*?required:\s*\[([^\]]*)\]/
  )?.[1] || ''
  assert.doesNotMatch(timedTaskRequired, /agentId/)
})
