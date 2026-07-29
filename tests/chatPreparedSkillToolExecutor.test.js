import test from 'node:test'
import assert from 'node:assert/strict'

import { createPreparedSkillToolExecutor } from '../src/utils/chatPreparedSkillToolExecutor.js'

function createExecutionContext() {
  const targetSession = { messages: [] }
  return {
    targetSession,
    createCurrentToolResultMessage(content, extra = {}) {
      return { role: 'assistant', content, ...extra }
    }
  }
}

test('prepared skill executor declines unrelated mappings', async () => {
  const execute = createPreparedSkillToolExecutor({})
  const result = await execute({ mapping: { type: 'mcp' } }, {})
  assert.deepEqual(result, { handled: false, result: null })
})

test('prepared skill executor reports gateway parse errors as handled results', async () => {
  let scrollCount = 0
  const execute = createPreparedSkillToolExecutor({
    maybeScrollToBottomForRun: async () => {
      scrollCount += 1
    }
  })
  const context = createExecutionContext()

  const execution = await execute(
    {
      mapping: {
        type: 'internal',
        internal: 'skill_call',
        gatewayError: '缺少 action',
        gatewayDetails: { action: '' }
      },
      serverName: 'Skills',
      toolName: 'skill_call'
    },
    context
  )

  assert.equal(execution.handled, true)
  assert.equal(execution.result.ok, false)
  assert.match(execution.result.content, /缺少 action/)
  assert.match(context.targetSession.messages[0].content, /Skill 动作结果/)
  assert.equal(scrollCount, 1)
})

test('prepared skill executor propagates a failed built-in runtime result', async () => {
  const context = createExecutionContext()
  const execute = createPreparedSkillToolExecutor({
    buildToolExecutionResultSubMeta: () => '',
    deepCopyJson: (value) => JSON.parse(JSON.stringify(value)),
    extractChatImagesFromToolResult: () => [],
    getBuiltinSkillsApi: () => ({
      runAction: async () => ({
        kind: 'sandbox_shell_result',
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: 'uv is not recognized'
      })
    }),
    maybeScrollToBottomForRun: async () => {},
    prepareBuiltinAgentToolCallArgs: (_skillId, _toolName, args) => ({ ...args })
  })

  const execution = await execute(
    {
      mapping: {
        type: 'skill',
        skillId: 'builtin_skill_shell',
        toolName: 'sandbox_run',
        serverName: '沙盒命令工作区'
      },
      serverName: '沙盒命令工作区',
      toolName: 'sandbox_run',
      argsObj: { command: 'uv sync' },
      pendingToolMessage: {}
    },
    context
  )

  assert.equal(execution.handled, true)
  assert.equal(execution.result.ok, false)
  assert.equal(context.targetSession.messages[0].toolStatus, 'error')
  assert.equal(context.targetSession.messages[0].toolResultPayload.exitCode, 1)
})
