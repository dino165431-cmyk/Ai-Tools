import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

function loadChatAgentRunModule() {
  const filePath = path.resolve('src/utils/chatAgentRun.js')
  const source = `${fs.readFileSync(filePath, 'utf8')
    .replace(/import\s+\{\s*isAgentRunToolResult\s*\}\s+from\s+['"]@\/utils\/chatToolDisplay['"]\s*/m, "const { isAgentRunToolResult } = require('@/utils/chatToolDisplay')\n")
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+\{[\s\S]*?\}\s*$/m, '')}

module.exports = {
  mergeAgentRunTraceEntries,
  isAgentRunToolName,
  isAgentRunToolMessage,
  getAgentRunResultPayload,
  getAgentRunMessageStatus,
  getAgentRunArgsObject,
  getAgentRunAgentName,
  getAgentRunTraceEntries,
  getAgentRunTaskText,
  getAgentRunFinalContent,
  getAgentRunFinalReasoning,
  buildAgentRunTimelineItems,
  getAgentRunOverviewChips,
  agentRunStepStatusLabel,
  shouldRenderAgentRunStructuredView,
  getAgentRunExpandedStepIdSet,
  isAgentRunStepExpanded,
  toggleAgentRunStepExpanded,
  agentRunStepSummary
}
`
  const require = createRequire(import.meta.url)
  const module = { exports: {} }

  const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === '@/utils/chatToolDisplay') {
        return {
          isAgentRunToolResult(result) {
            return !!result && typeof result === 'object' && !Array.isArray(result) && result.kind === 'agent_run_result'
          }
        }
      }
      return require(specifier)
    },
    __filename: filePath,
    __dirname: path.dirname(filePath),
    console,
    Buffer,
    process,
    setTimeout,
    clearTimeout
  })

  const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`
  const script = new vm.Script(wrapped, { filename: filePath })
  const fn = script.runInContext(context)
  fn(module.exports, context.require, module, filePath, path.dirname(filePath))
  return module.exports
}

function loadChatToolDisplayModule() {
  const filePath = path.resolve('src/utils/chatToolDisplay.js')
  const source = `${fs.readFileSync(filePath, 'utf8')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+\{[\s\S]*?\}\s*$/m, '')}

module.exports = {
  isAgentRunToolResult,
  formatAgentRunTraceEntry,
  formatAgentRunToolResultForDisplay,
  formatToolResultDisplayContent
}
`
  const require = createRequire(import.meta.url)
  const module = { exports: {} }

  const context = vm.createContext({
    module,
    exports: module.exports,
    require,
    __filename: filePath,
    __dirname: path.dirname(filePath),
    console,
    Buffer,
    process,
    setTimeout,
    clearTimeout
  })

  const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`
  const script = new vm.Script(wrapped, { filename: filePath })
  const fn = script.runInContext(context)
  fn(module.exports, context.require, module, filePath, path.dirname(filePath))
  return module.exports
}

test('agent run timeline folds MCP readiness under the runtime card', () => {
  const {
    buildAgentRunTimelineItems,
    getAgentRunOverviewChips
  } = loadChatAgentRunModule()

  const msg = {
    role: 'tool',
    toolName: 'agent_run',
    toolResultPayload: {
      kind: 'agent_run_result',
      status: 'completed',
      agent: {
        id: 'agent_tools_helper',
        name: 'Ai Tools Helper'
      },
      runtime: {
        provider_name: 'uTools AI',
        model: 'deepseek-v4-pro'
      },
      metrics: {
        rounds: 1,
        tool_calls: 3,
        duration_ms: 10623
      },
      trace: [
        {
          idx: 1,
          phase: 'run.started',
          at: '2026-05-10T20:55:36.000Z',
          agent_name: 'Ai Tools Helper',
          provider_name: 'uTools AI',
          model: 'deepseek-v4-pro',
          task_text: 'Summarize recent work.'
        },
        {
          idx: 2,
          phase: 'profile.ready',
          at: '2026-05-10T20:55:36.000Z',
          provider_name: 'uTools AI',
          model: 'deepseek-v4-pro',
          skill_count: 4,
          mcp_count: 3
        },
        {
          idx: 3,
          phase: 'mcp.tools_ready',
          at: '2026-05-10T20:55:36.000Z',
          server_name: 'notes',
          tool_count: 5
        },
        {
          idx: 4,
          phase: 'mcp.tools_ready',
          at: '2026-05-10T20:55:36.000Z',
          server_name: 'config',
          tool_count: 2
        },
        {
          idx: 5,
          phase: 'mcp.tools_ready',
          at: '2026-05-10T20:55:36.000Z',
          server_name: 'sessions',
          tool_count: 3
        },
        {
          idx: 6,
          phase: 'model.request',
          at: '2026-05-10T20:55:36.000Z',
          provider_name: 'uTools AI',
          model: 'deepseek-v4-pro',
          round: 1,
          tool_count: 10
        },
        {
          idx: 7,
          phase: 'tool.started',
          at: '2026-05-10T20:55:37.000Z',
          server_name: 'notes',
          tool_name: 'notes_search'
        },
        {
          idx: 8,
          phase: 'tool.finished',
          at: '2026-05-10T20:55:38.000Z',
          server_name: 'notes',
          tool_name: 'notes_search',
          result_text: 'Found 3 notes.'
        },
        {
          idx: 9,
          phase: 'model.response',
          at: '2026-05-10T20:55:46.000Z',
          provider_name: 'uTools AI',
          model: 'deepseek-v4-pro',
          round: 1,
          tool_call_count: 3,
          content_text: 'Here is the summary.',
          reasoning_text: 'Checked recent sessions and notes first.'
        }
      ]
    }
  }

  const items = buildAgentRunTimelineItems(msg)
  const runtimeItem = items.find((item) => Array.isArray(item?.children) && item.children.length === 3)
  const responseItem = items.find((item) => item.kind === 'assistant' && item.completed === true)

  assert.ok(runtimeItem)
  assert.equal(items.some((item) => String(item?.title || '').startsWith('MCP tools ready:')), false)
  assert.equal(
    JSON.stringify(runtimeItem.children.map((child) => child.title)),
    JSON.stringify([
      'MCP tools ready: notes',
      'MCP tools ready: config',
      'MCP tools ready: sessions'
    ])
  )
  assert.ok(responseItem)
  assert.match(responseItem.metaText || '', /3/)

  const chips = getAgentRunOverviewChips(msg)
  assert.ok(chips.some((chip) => chip.includes('Ai Tools Helper')))
  assert.ok(chips.some((chip) => chip.includes('deepseek-v4-pro')))
})

test('agent run abort closes open assistant and tool steps as stopped', () => {
  const { buildAgentRunTimelineItems, agentRunStepStatusLabel } = loadChatAgentRunModule()

  const msg = {
    role: 'tool',
    toolName: 'agent_run',
    toolResultPayload: {
      kind: 'agent_run_result',
      status: 'aborted',
      trace: [
        {
          idx: 1,
          phase: 'model.request',
          at: '2026-05-10T20:55:36.000Z',
          provider_name: 'uTools AI',
          model: 'deepseek-v4-pro',
          round: 1,
          tool_count: 1
        },
        {
          idx: 2,
          phase: 'tool.started',
          at: '2026-05-10T20:55:37.000Z',
          server_name: 'notes',
          tool_name: 'notes_search'
        },
        {
          idx: 3,
          phase: 'run.aborted',
          at: '2026-05-10T20:55:38.000Z',
          error: 'Aborted'
        }
      ]
    }
  }

  const items = buildAgentRunTimelineItems(msg)
  const assistantStep = items.find((item) => item.kind === 'assistant')
  const toolStep = items.find((item) => item.kind === 'tool')
  const terminalStep = items.find((item) => item.status === 'stopped' && item.kind === 'system')

  assert.equal(assistantStep?.status, 'stopped')
  assert.equal(toolStep?.status, 'stopped')
  assert.ok(agentRunStepStatusLabel(toolStep))
  assert.ok(terminalStep)
})

test('agent run message status falls back to live trace terminal events', () => {
  const { getAgentRunMessageStatus } = loadChatAgentRunModule()

  const msg = {
    role: 'tool',
    toolName: 'agent_run',
    toolResultPayload: {
      kind: 'agent_run_result',
      status: 'running',
      trace: []
    },
    toolLiveTrace: [
      {
        idx: 1,
        phase: 'model.request',
        at: '2026-05-10T20:55:36.000Z'
      },
      {
        idx: 2,
        phase: 'run.aborted',
        at: '2026-05-10T20:55:38.000Z',
        error: 'Aborted'
      }
    ]
  }

  assert.equal(getAgentRunMessageStatus(msg), 'stopped')
})

test('agent run tool-calling model response shows a placeholder when no text was produced', () => {
  const { buildAgentRunTimelineItems } = loadChatAgentRunModule()

  const msg = {
    role: 'tool',
    toolName: 'agent_run',
    toolResultPayload: {
      kind: 'agent_run_result',
      status: 'running',
      trace: [
        {
          idx: 1,
          phase: 'model.request',
          at: '2026-05-10T20:55:36.000Z',
          provider_name: 'uTools AI',
          model: 'deepseek-v4-pro',
          round: 1,
          tool_count: 2
        },
        {
          idx: 2,
          phase: 'model.response',
          at: '2026-05-10T20:55:37.000Z',
          provider_name: 'uTools AI',
          model: 'deepseek-v4-pro',
          round: 1,
          tool_call_count: 2,
          content_text: '',
          reasoning_text: ''
        }
      ]
    }
  }

  const items = buildAgentRunTimelineItems(msg)
  const responseItem = items.find((item) => item.kind === 'assistant' && item.completed === true)

  assert.ok(responseItem)
  assert.equal(responseItem.contentText, '本轮模型响应没有直接输出文本，而是发起了工具调用。')
  assert.match(responseItem.metaText || '', /2/)
})

test('agent run final output falls back to the latest response text when summary is missing', () => {
  const { getAgentRunFinalContent, getAgentRunFinalReasoning } = loadChatAgentRunModule()
  const { formatAgentRunToolResultForDisplay } = loadChatToolDisplayModule()

  const payload = {
    kind: 'agent_run_result',
    status: 'completed',
    trace: [
      {
        idx: 1,
        phase: 'model.response',
        at: '2026-05-10T20:55:37.000Z',
        provider_name: 'uTools AI',
        model: 'deepseek-v4-pro',
        round: 2,
        tool_call_count: 1,
        content_text: 'Here is the final answer.',
        reasoning_text: 'Checked the last tool result and then answered.'
      }
    ]
  }

  const msg = {
    role: 'tool',
    toolName: 'agent_run',
    toolResultPayload: payload
  }

  assert.equal(getAgentRunFinalContent(msg), 'Here is the final answer.')
  assert.equal(getAgentRunFinalReasoning(msg), 'Checked the last tool result and then answered.')

  const display = formatAgentRunToolResultForDisplay(payload, {
    serverName: 'MCP',
    toolName: 'agent_run'
  })

  assert.match(display, /最终输出/)
  assert.match(display, /Here is the final answer\./)
})
