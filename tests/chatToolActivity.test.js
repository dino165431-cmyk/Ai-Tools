import test from 'node:test'
import assert from 'node:assert/strict'

import { getToolActivityLabel, getToolActivityMeta } from '../src/utils/chatToolActivity.js'

test('tool activity describes sandbox work instead of generic tool execution', () => {
  const message = {
    role: 'tool_call',
    toolName: 'sandbox_run',
    toolArgsText: JSON.stringify({ command: 'Compress-Archive -Path * -DestinationPath output/result.zip' })
  }
  assert.equal(getToolActivityLabel(message, 'running'), '正在沙盒中执行命令')
  assert.match(getToolActivityMeta(message), /Compress-Archive/)
})

test('tool activity summarizes returned files', () => {
  const message = {
    role: 'tool',
    toolName: 'sandbox_run',
    toolResultPayload: {
      changedFiles: [{ name: 'result.zip' }, { name: 'report.txt' }]
    }
  }
  assert.equal(getToolActivityLabel(message, 'success'), '已在沙盒中执行命令')
  assert.equal(getToolActivityMeta(message), 'result.zip 等 2 个文件')
})
