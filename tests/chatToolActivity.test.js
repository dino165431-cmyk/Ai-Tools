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

test('sandbox command activity distinguishes the host workspace from the sandbox', () => {
  const message = {
    role: 'tool',
    toolName: 'sandbox_run',
    toolArgsText: JSON.stringify({ workspace_scope: 'host', command: 'npm test' }),
    toolResultPayload: { workspaceKind: 'host', ok: false }
  }

  assert.equal(getToolActivityLabel(message, 'error'), '本机工作区执行命令失败')
  assert.equal(getToolActivityLabel({ ...message, role: 'tool_call' }, 'running'), '正在本机工作区执行命令')
  assert.equal(getToolActivityLabel({ ...message, toolResultPayload: { workspaceKind: 'host', ok: true } }, 'success'), '已在本机工作区执行命令')
})

test('sandbox file activity names the file action and target path while running', () => {
  const message = {
    role: 'tool_call',
    toolName: 'sandbox_read_file',
    toolArgsText: JSON.stringify({ path: 'inbox/error-log.txt' })
  }

  assert.equal(getToolActivityLabel(message, 'running'), '正在读取文件')
  assert.equal(getToolActivityMeta(message), 'inbox/error-log.txt')
  assert.equal(getToolActivityLabel({ ...message, role: 'tool' }, 'success'), '已读取文件')
})

test('tool activity recognizes common camel-case and multi-file path arguments', () => {
  assert.equal(
    getToolActivityMeta({
      role: 'tool_call',
      toolName: 'read_file',
      toolArgsText: JSON.stringify({ filePath: 'src/App.vue' })
    }),
    'src/App.vue'
  )
  assert.equal(
    getToolActivityMeta({
      role: 'tool_call',
      toolName: 'sandbox_import',
      toolArgsText: JSON.stringify({ source_paths: ['one.txt', 'two.txt'] })
    }),
    'one.txt 等 2 个文件'
  )
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

test('tool activity identifies final-result export to the host workspace', () => {
  const message = {
    role: 'tool',
    toolName: 'sandbox_export',
    toolResultPayload: {
      changedFiles: [{ path: 'deliverables/report.xlsx' }]
    }
  }
  assert.equal(getToolActivityLabel(message, 'success'), '已把结果保存到本机工作区')
  assert.equal(getToolActivityMeta(message), 'deliverables/report.xlsx')
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
