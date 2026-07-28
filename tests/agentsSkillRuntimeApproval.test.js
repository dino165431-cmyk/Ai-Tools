import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

function extractSnippetBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `marker not found: ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `marker not found: ${endMarker}`)
  return source.slice(start, end).trim()
}

function loadApprovalHelpers() {
  const filePath = path.resolve('public/preload/builtin-skills/orchestrate-agents/runtime.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const snippets = [
    "const TOOL_APPROVAL_MODES = ['manual', 'safe', 'full', 'deny']",
    extractSnippetBetween(source, 'function cleanString(', 'function isPlainObject('),
    extractSnippetBetween(source, 'function isPlainObject(', 'function stableStringify('),
    extractSnippetBetween(source, 'function normalizeToolApprovalMode(', 'function normalizePromptType('),
    extractSnippetBetween(source, 'function injectToolApprovalModeIntoAgentRunParams(', 'function normalizeAgentModelParams('),
    extractSnippetBetween(source, 'function getMcpToolApprovalPolicy(', 'function getSkillDescription('),
    extractSnippetBetween(source, 'function shouldAllowToolCallByApprovalMode(', 'function findLatestReasoningExcerpt(')
  ]
  const module = { exports: {} }
  const context = vm.createContext({ module, exports: module.exports })
  new vm.Script(
    `${snippets.join('\n\n')}\nmodule.exports = { normalizeToolApprovalMode, injectToolApprovalModeIntoAgentRunParams, getMcpToolApprovalPolicy, shouldAllowToolCallByApprovalMode };`,
    { filename: filePath }
  ).runInContext(context)
  return { ...module.exports, source }
}

test('sub-agent approval modes match the parent chat semantics', () => {
  const { normalizeToolApprovalMode, shouldAllowToolCallByApprovalMode } = loadApprovalHelpers()

  assert.equal(normalizeToolApprovalMode('auto'), 'safe')
  assert.equal(shouldAllowToolCallByApprovalMode({ toolApprovalMode: 'safe' }, { forceApproval: false }).allowed, true)
  assert.equal(shouldAllowToolCallByApprovalMode({ toolApprovalMode: 'safe' }, { forceApproval: true }).requiresPrompt, true)
  assert.equal(shouldAllowToolCallByApprovalMode({ toolApprovalMode: 'full' }, { forceApproval: true }).requiresPrompt, undefined)
  assert.equal(shouldAllowToolCallByApprovalMode({ toolApprovalMode: 'manual' }, { forceApproval: false }).requiresPrompt, true)
  assert.equal(shouldAllowToolCallByApprovalMode({ toolApprovalMode: 'deny' }, { forceApproval: false }).allowed, false)
})

test('nested sub-agents inherit the current approval mode and runtime supports live updates', () => {
  const { injectToolApprovalModeIntoAgentRunParams, source } = loadApprovalHelpers()
  const args = injectToolApprovalModeIntoAgentRunParams({ task: 'work' }, 'full')

  assert.equal(args.__tool_approval_mode, 'full')
  assert.equal(args.tool_approval_mode, 'full')
  assert.match(source, /builtin-agents-tool-approval-mode-change/)
  assert.match(source, /runState\.toolApprovalMode = mode/)
})

test('nested sub-agents prompt for MCP tools unless they are explicitly read-only', () => {
  const { getMcpToolApprovalPolicy } = loadApprovalHelpers()

  assert.equal(getMcpToolApprovalPolicy({}, {}).forceApproval, true)
  assert.equal(
    getMcpToolApprovalPolicy({}, { annotations: { readOnlyHint: false } }).forceApproval,
    true
  )
  assert.equal(
    getMcpToolApprovalPolicy({}, { annotations: { readOnlyHint: true } }).forceApproval,
    false
  )
})
