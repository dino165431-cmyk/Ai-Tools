import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getToolActivityLabel,
  getToolActivityMeta,
  getToolActivitySource,
  getToolActivityToolName
} from '../src/utils/chatToolActivity.js'

test('tool activity describes sandbox work instead of generic tool execution', () => {
  const message = {
    role: 'tool_call',
    toolName: 'sandbox_run',
    toolArgsText: JSON.stringify({ command: 'Compress-Archive -Path * -DestinationPath output/result.zip' })
  }
  assert.equal(getToolActivityLabel(message, 'running'), '正在沙盒中执行命令')
  assert.equal(getToolActivityMeta(message), '')
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

test('MCP activity keeps technical identity available without showing it as default metadata', () => {
  const message = {
    role: 'tool',
    toolName: 'get_my_accounts',
    toolServerName: 'facebook-marketing-api',
    toolDescription: 'Returns the ad accounts available to the current user.'
  }

  assert.equal(getToolActivityLabel(message, 'success'), '已获取我的账户')
  assert.equal(getToolActivityToolName(message), 'get_my_accounts')
  assert.equal(getToolActivitySource(message), 'facebook-marketing-api')
  assert.equal(getToolActivityMeta(message), '')
})

test('generic tool activity keeps unknown action names instead of falling back to the MCP server', () => {
  const message = {
    role: 'tool_call',
    toolName: 'calculate_reach_projection',
    toolServerName: 'facebook-marketing-api'
  }

  assert.equal(getToolActivityLabel(message, 'running'), '正在调用 Calculate Reach Projection')
})
