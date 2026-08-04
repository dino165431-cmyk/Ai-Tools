import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getSandboxToolResultPresentation,
  inferStructuredToolResultStatus,
  inferToolDisplayContentStatus,
  stripToolIdentityFromDisplayContent
} from '../src/utils/chatToolDisplay.js'

test('expanded tool display removes duplicated identity blocks but keeps parameters and results', () => {
  const content = [
    '### 工具调用',
    '- 服务：**facebook-marketing-api**',
    '- 工具：`get_my_accounts`',
    '- 状态：**已完成**',
    '- 自动批准：**是**',
    '',
    '#### 参数',
    '',
    '```json',
    '{}',
    '```',
    '',
    '### 工具结果',
    '- 服务：**facebook-marketing-api**',
    '- 工具：`get_my_accounts`',
    '',
    '```json',
    '{"accounts":[]}',
    '```'
  ].join('\n')

  const display = stripToolIdentityFromDisplayContent(content)
  assert.doesNotMatch(display, /facebook-marketing-api/)
  assert.doesNotMatch(display, /自动批准/)
  assert.match(display, /#### 参数/)
  assert.match(display, /\{"accounts":\[\]\}/)
})

test('expanded tool display preserves unrelated markdown sections', () => {
  const content = '### 执行摘要\n\n没有发现异常。'
  assert.equal(stripToolIdentityFromDisplayContent(content), content)
})

test('structured tool result status treats nested runtime failures as errors', () => {
  assert.equal(inferStructuredToolResultStatus({ ok: false, exitCode: 1 }), 'error')
  assert.equal(inferStructuredToolResultStatus({ ok: true, exitCode: 0 }), 'success')
  assert.equal(inferStructuredToolResultStatus({ timedOut: true }), 'error')
  assert.equal(inferStructuredToolResultStatus({ isError: true }), 'error')
  assert.equal(inferStructuredToolResultStatus({ status: 'rejected' }), 'rejected')
  assert.equal(inferStructuredToolResultStatus({ status: 'paused' }), 'paused')
})

test('sandbox result presentation keeps failure status clear when partial output exists', () => {
  const presentation = getSandboxToolResultPresentation({
    kind: 'sandbox_shell_result',
    ok: false,
    exitCode: '1',
    stdout: 'FILE_OPERATIONS_OK',
    changedFiles: [{ path: 'file-operations.js' }]
  })

  assert.equal(presentation.status, 'error')
  assert.equal(presentation.exitCode, 1)
  assert.equal(presentation.isFailure, true)
  assert.equal(presentation.hasPartialResult, true)
  assert.match(presentation.notice, /退出码 1/)
})

test('sandbox result presentation does not add a failure notice to successful commands', () => {
  const presentation = getSandboxToolResultPresentation({
    kind: 'sandbox_shell_result',
    ok: true,
    exitCode: 0,
    stdout: 'OK'
  })

  assert.equal(presentation.status, 'success')
  assert.equal(presentation.exitCode, 0)
  assert.equal(presentation.isFailure, false)
  assert.equal(presentation.notice, '')
})

test('tool display status ignores failure words inside successful fenced output', () => {
  const content = [
    '### 技能文件读取结果',
    '- 技能：**示例技能**',
    '- 路径：`references/example.md`',
    '',
    '```',
    'If a request is rejected, return an error message.',
    '失败时不要伪造结果。',
    '```'
  ].join('\n')

  assert.equal(inferToolDisplayContentStatus(content), '')
})

test('tool display status recognizes controlled status and error metadata', () => {
  assert.equal(
    inferToolDisplayContentStatus('### 工具结果\n- 状态：**已拒绝**\n\n用户拒绝了调用。'),
    'rejected'
  )
  assert.equal(
    inferToolDisplayContentStatus('### 技能脚本执行结果\n- 错误：脚本不存在'),
    'error'
  )
  assert.equal(
    inferToolDisplayContentStatus('### 工具调用\n- 状态：**已完成**'),
    'success'
  )
})
