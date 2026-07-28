import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

function extractSnippetBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  if (start === -1) {
    throw new Error(`Marker not found: ${startMarker}`)
  }
  const end = source.indexOf(endMarker, start)
  if (end === -1) {
    throw new Error(`Marker not found: ${endMarker}`)
  }
  return source.slice(start, end).trim()
}

function loadBuildUtoolsAiMessages() {
  const filePath = path.resolve('public/preload/builtin-skills/orchestrate-agents/runtime.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const snippets = [
    extractSnippetBetween(source, 'function cleanString(', 'function isPlainObject('),
    extractSnippetBetween(source, 'function stableStringify(', 'function toText('),
    extractSnippetBetween(source, 'function coercePlainTextContent(', 'function buildUtoolsAiMessages('),
    extractSnippetBetween(source, 'function buildUtoolsAiMessages(', 'function registerUtoolsAiToolFunctions(')
  ]

  const scriptSource = `${snippets.join('\n\n')}\nmodule.exports = { buildUtoolsAiMessages, extractReasoningText };`
  const module = { exports: {} }
  const context = vm.createContext({ module, exports: module.exports })
  new vm.Script(scriptSource, { filename: filePath }).runInContext(context)
  return module.exports
}

test('agents Skill runtime uTools message builder preserves empty assistant reasoning_content fields', () => {
  const { buildUtoolsAiMessages, extractReasoningText } = loadBuildUtoolsAiMessages()
  const messages = buildUtoolsAiMessages({
    systemContent: 'system',
    apiMessages: [
      {
        role: 'assistant',
        content: 'tool planning',
        reasoning_content: ''
      }
    ]
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[1]?.role, 'assistant')
  assert.equal(messages[1]?.content, 'tool planning')
  assert.ok(Object.prototype.hasOwnProperty.call(messages[1], 'reasoning_content'))
  assert.equal(messages[1]?.reasoning_content, '')
  assert.equal(extractReasoningText({ reasoning: 'think-aloud' }), 'think-aloud')
  assert.equal(extractReasoningText({ thinking: 'model-thought' }), 'model-thought')
})

test('agents Skill runtime uTools message builder keeps tool state messages for continuation', () => {
  const { buildUtoolsAiMessages } = loadBuildUtoolsAiMessages()
  const messages = buildUtoolsAiMessages({
    systemContent: '',
    apiMessages: [
      {
        role: 'assistant',
        content: '先看工具',
        reasoning_content: 'thinking',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'notes_read',
              arguments: '{"path":"a.md"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'notes_read',
        content: 'tool result'
      }
    ]
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[0]?.tool_calls?.length, 1)
  assert.equal(messages[0]?.tool_calls?.[0]?.function?.name, 'notes_read')
  assert.equal(messages[1]?.role, 'tool')
  assert.equal(messages[1]?.tool_call_id, 'call_1')
  assert.equal(messages[1]?.name, 'notes_read')
  assert.equal(messages[1]?.content, 'tool result')
})

test('agents Skill runtime uTools tool registration binds the host object only', async () => {
  const filePath = path.resolve('public/preload/builtin-skills/orchestrate-agents/runtime.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const snippets = [
    extractSnippetBetween(source, 'function cleanString(', 'function isPlainObject('),
    extractSnippetBetween(source, 'function getHostGlobal(', 'function dispatchBuiltinAgentsTraceEvent('),
    extractSnippetBetween(source, 'function registerUtoolsAiToolFunctions(', 'function makeToolFunctionName(')
  ]

  const scriptSource = `${snippets.join('\n\n')}\nmodule.exports = { registerUtoolsAiToolFunctions };`
  const context = vm.createContext({
    module: { exports: {} },
    exports: {},
    window: {}
  })
  new vm.Script(scriptSource, { filename: filePath }).runInContext(context)

  const runSource = `
    (async () => {
      const calls = []
      const restore = module.exports.registerUtoolsAiToolFunctions({
        tools: [
          {
            function: {
              name: 'skill_call'
            }
          }
        ],
        invokeTool: async (name, args) => {
          calls.push({ name, args })
          return { ok: true }
        }
      })

      globalThis.hasWindow = typeof window.skill_call === 'function'
      await window.skill_call({
        skill_id: 'builtin_skill_config',
        action: 'config_get_system_time',
        args: { source: 'window' }
      })
      restore()

      globalThis.calls = calls
      globalThis.afterWindow = typeof window.skill_call
      globalThis.afterGlobal = typeof skill_call
    })()
  `
  await new vm.Script(runSource, { filename: 'register-utools-ai-tool-functions.test.js' }).runInContext(context)

  assert.equal(context.hasWindow, true)
  assert.equal(context.calls.length, 1)
  assert.equal(context.calls[0]?.name, 'skill_call')
  assert.equal(context.afterWindow, 'undefined')
  assert.equal(context.afterGlobal, 'undefined')
})
