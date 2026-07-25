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

test('agent run paused state stays paused and does not backfill a final output from trace text', () => {
  const { buildAgentRunTimelineItems, getAgentRunFinalContent, agentRunStepStatusLabel } = loadChatAgentRunModule()
  const { formatAgentRunToolResultForDisplay } = loadChatToolDisplayModule()

  const payload = {
    kind: 'agent_run_result',
    status: 'paused',
    trace: [
      {
        idx: 1,
        phase: 'tool.started',
        at: '2026-05-10T20:55:36.000Z',
        server_name: 'notes',
        tool_name: 'notes_search'
      },
      {
        idx: 2,
        phase: 'tool.paused',
        at: '2026-05-10T20:55:37.000Z',
        server_name: 'notes',
        tool_name: 'notes_search',
        reasoning_text: 'Waiting for user to resume.'
      },
      {
        idx: 3,
        phase: 'run.paused',
        at: '2026-05-10T20:55:38.000Z',
        title: 'Paused by user',
        content_text: 'Partial answer that should stay live, not final.'
      },
      {
        idx: 4,
        phase: 'model.response',
        at: '2026-05-10T20:55:39.000Z',
        provider_name: 'uTools AI',
        model: 'deepseek-v4-pro',
        round: 1,
        tool_call_count: 1,
        content_text: 'Trace fallback should not be treated as final output.',
        reasoning_text: 'Still waiting.'
      }
    ]
  }

  const msg = {
    role: 'tool',
    toolName: 'agent_run',
    toolResultPayload: payload
  }

  const items = buildAgentRunTimelineItems(msg)
  const pausedToolStep = items.find((item) => item.kind === 'tool' && item.status === 'paused')
  const pausedRunStep = items.find((item) => item.kind === 'system' && item.status === 'paused')
  const responseStep = items.find((item) => item.kind === 'assistant' && item.round === 1)

  assert.equal(getAgentRunFinalContent(msg), '')
  assert.ok(pausedToolStep)
  assert.ok(pausedRunStep)
  assert.equal(agentRunStepStatusLabel(pausedToolStep), '已暂停')
  assert.equal(responseStep?.status, 'success')
  assert.equal(responseStep?.completed, true)

  const display = formatAgentRunToolResultForDisplay(payload, {
    serverName: 'MCP',
    toolName: 'agent_run'
  })

  assert.match(display, /已暂停/)
  assert.doesNotMatch(display, /Trace fallback should not be treated as final output\./)
})
