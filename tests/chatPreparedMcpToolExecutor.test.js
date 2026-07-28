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
  assert.equal(scrollCount, 0)
})
