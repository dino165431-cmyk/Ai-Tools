import test from 'node:test'
import assert from 'node:assert/strict'

import { createPreparedMcpToolExecutor } from '../src/utils/chatPreparedMcpToolExecutor.js'

function createExecutionContext() {
  const targetSession = { messages: [] }
  return {
    targetSession,
    createCurrentToolResultMessage(content, extra = {}) {
      return { role: 'assistant', content, ...extra }
    }
  }
}

test('prepared MCP executor lists active servers through the internal gateway', async () => {
  let scrollCount = 0
  const execute = createPreparedMcpToolExecutor({
    listActiveMcpServersBrief: () => [{ id: 'server-1', name: 'Files' }],
    maybeScrollToBottomForRun: async () => {
      scrollCount += 1
    }
  })
  const context = createExecutionContext()

  const result = await execute(
    {
      mapping: { type: 'internal', internal: 'mcp_list_servers' },
      serverName: 'MCP',
      toolName: 'mcp_list_servers'
    },
    context
  )

  assert.equal(result.ok, true)
  assert.match(result.content, /server-1/)
  assert.match(context.targetSession.messages[0].content, /MCP 服务器/)
  assert.equal(context.targetSession.messages[0].toolStatus, 'success')
  assert.equal(scrollCount, 1)
})

test('prepared MCP executor keeps mapped missing-server failures local and non-scrolling', async () => {
  let scrollCount = 0
  const execute = createPreparedMcpToolExecutor({
    activeMcpServers: { value: [] },
    maybeScrollToBottomForRun: async () => {
      scrollCount += 1
    }
  })
  const context = createExecutionContext()

  const result = await execute(
    {
      mapping: { type: 'mcp', serverId: 'missing', toolName: 'read' },
      serverName: 'Missing',
      toolName: 'read',
      argsObj: {}
    },
    context
  )

  assert.equal(result.ok, false)
  assert.match(result.content, /missing/)
  assert.match(context.targetSession.messages[0].content, /未找到 MCP 服务器/)
  assert.equal(context.targetSession.messages[0].toolStatus, 'error')
  assert.equal(scrollCount, 0)
})

test('prepared MCP discovery ranks tools for multi-term searches instead of whole-string matching', async () => {
  const server = {
    _id: 'github',
    name: 'GitHub',
    description: 'Repository collaboration service',
    disabled: false
  }
  const execute = createPreparedMcpToolExecutor({
    activeMcpServers: { value: [server] },
    filterAllowedMcpTools: (_server, tools) => tools,
    listActiveMcpServersBrief: () => [{ id: server._id, name: server.name }],
    listMcpToolsForServer: async () => ({
      ok: true,
      tools: [
        { name: 'create_issue', description: 'Create an issue in a repository' },
        { name: 'list_calendars', description: 'List calendar resources' }
      ]
    }),
    maybeScrollToBottomForRun: async () => {},
    resolveActiveMcpServer: () => null
  })
  const context = createExecutionContext()

  const result = await execute(
    {
      mapping: { type: 'internal', internal: 'mcp_discover' },
      serverName: 'MCP',
      toolName: 'mcp_discover',
      argsObj: { search: 'GitHub repository create issue' }
    },
    context
  )

  assert.equal(result.ok, true)
  const payload = JSON.parse(result.content)
  assert.equal(payload.servers[0].tools[0].name, 'create_issue')
})
