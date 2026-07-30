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
  const persistedSkillIds = []
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
    markSkillActivationPersistent: (ids) => persistedSkillIds.push(...ids),
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
  assert.deepEqual(persistedSkillIds, ['builtin_skill_shell'])
})

test('prepared skill executor persists an auto-routed skill after reading one of its files', async () => {
  const context = createExecutionContext()
  const persistedSkillIds = []
  const loadedSkillContentById = {}
  const loadedSkillFileCacheBySkillId = {}
  const skill = {
    _id: 'skill_adjust',
    name: '移动端 Adjust 分析',
    entryFile: 'SKILL.md'
  }
  const execute = createPreparedSkillToolExecutor({
    getLoadedSkillFilePathSet: () => new Set(),
    loadedSkillContentById,
    loadedSkillFileCacheBySkillId,
    markSkillActivationPersistent: (ids) => persistedSkillIds.push(...ids),
    maybeScrollToBottomForRun: async () => {},
    readSkillRegistryFile: async () => ({
      path: 'references/android-adjust.md',
      content: '# Android Adjust'
    }),
    resolveSelectedSkillTarget: () => skill
  })

  const execution = await execute(
    {
      mapping: { type: 'internal', internal: 'read_skill_file' },
      serverName: 'Skill',
      toolName: 'read_skill_file',
      argsObj: {
        id: 'skill_adjust',
        path: 'references/android-adjust.md'
      }
    },
    context
  )

  assert.equal(execution.handled, true)
  assert.equal(execution.result.ok, true)
  assert.deepEqual(persistedSkillIds, ['skill_adjust'])
  assert.deepEqual(
    loadedSkillFileCacheBySkillId.skill_adjust,
    ['references/android-adjust.md']
  )
})

test('prepared skill executor keeps an auto-routed skill available when its script fails', async () => {
  const context = createExecutionContext()
  const persistedSkillIds = []
  const skill = {
    _id: 'skill_adjust',
    name: '移动端 Adjust 分析'
  }
  const execute = createPreparedSkillToolExecutor({
    markSkillActivationPersistent: (ids) => persistedSkillIds.push(...ids),
    maybeScrollToBottomForRun: async () => {},
    resolveSelectedSkillTarget: () => skill,
    resolveSkillScriptTarget: () => ({
      ok: true,
      path: 'scripts/run.py'
    }),
    runSkillRegistryScript: async () => {
      throw new Error('设备暂时离线')
    }
  })

  const execution = await execute(
    {
      mapping: { type: 'internal', internal: 'run_skill_script' },
      serverName: 'Skill',
      toolName: 'run_skill_script',
      argsObj: {
        id: 'skill_adjust',
        path: 'scripts/run.py'
      }
    },
    context
  )

  assert.equal(execution.handled, true)
  assert.equal(execution.result.ok, false)
  assert.match(execution.result.content, /设备暂时离线/)
  assert.deepEqual(persistedSkillIds, ['skill_adjust'])
})

test('prepared skill discovery searches the installed catalog, not only selected skills', async () => {
  const context = createExecutionContext()
  const installed = {
    _id: 'skill-release',
    name: '发布验证',
    description: '检查发布结果和回滚风险',
    sourceType: 'directory',
    sourcePath: 'D:/skills/release',
    entryFile: 'SKILL.md',
    nativeActions: [],
    mcp: []
  }
  const execute = createPreparedSkillToolExecutor({
    availableSkillObjects: { value: [installed] },
    selectedSkillObjects: { value: [] },
    maybeScrollToBottomForRun: async () => {}
  })

  const execution = await execute(
    {
      mapping: { type: 'internal', internal: 'skill_discover' },
      serverName: 'Skill',
      toolName: 'skill_discover',
      argsObj: {}
    },
    context
  )

  assert.equal(execution.handled, true)
  assert.equal(execution.result.ok, true)
  assert.match(execution.result.content, /skill-release/)
})

test('use_skill can add an installed unselected Skill to the current session', async () => {
  const context = createExecutionContext()
  const installed = {
    _id: 'skill-release',
    name: '发布验证',
    description: '检查发布结果和回滚风险',
    sourceType: 'directory',
    sourcePath: 'D:/skills/release',
    entryFile: 'SKILL.md',
    nativeActions: [],
    mcp: []
  }
  const selected = []
  let loadCount = 0
  const execute = createPreparedSkillToolExecutor({
    activatedAgentSkillIds: { value: [] },
    agentSkillIdSet: { value: new Set() },
    availableSkillObjects: { value: [installed] },
    hasLoadedSkillMainContent: () => false,
    loadSkillMainContent: async () => {
      loadCount += 1
      return '# Release verification'
    },
    mcpServers: { value: [] },
    maybeScrollToBottomForRun: async () => {},
    resolveAvailableSkillTarget: ({ idCandidate }) => (
      idCandidate === installed._id ? installed : null
    ),
    selectSkillForSession: (id) => {
      selected.push(id)
      return { ok: true, changed: true }
    },
    selectedSkillObjects: { value: [] }
  })

  const execution = await execute(
    {
      mapping: { type: 'internal', internal: 'use_skill' },
      serverName: 'Skill',
      toolName: 'use_skill',
      argsObj: { id: installed._id }
    },
    context
  )

  assert.equal(execution.handled, true)
  assert.equal(execution.result.ok, true)
  assert.equal(loadCount, 1)
  assert.deepEqual(selected, [installed._id])
  assert.match(execution.result.content, /status: loaded/)
})
