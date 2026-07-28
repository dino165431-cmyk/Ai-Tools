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
  assert.match(viewSource, /全部自动（高风险）/)
  assert.doesNotMatch(viewSource, /toolApprovalMode:\s*'full'\s*\n\s*}/)

  assert.match(executorSource, /normalizeUnattendedToolApprovalMode/)
  assert.match(executorSource, /evaluateToolApproval\(\{[\s\S]*?interactive:\s*false/)
  assert.match(executorSource, /resolveMcpToolApprovalPolicy\(t\)/)
})

test('timed task tool failures are rendered as errors in both provider paths', () => {
  const executorSource = readSource('src/utils/timedTaskRunnerExecutor.js')
  const statusChecks = executorSource.match(/status:\s*exec\?\.ok === false \? 'error' : 'success'/g) || []

  assert.equal(statusChecks.length, 2)
})

