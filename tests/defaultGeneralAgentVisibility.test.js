import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8')
}

test('builtin Agent and Prompt presets stay hidden while the default Agent remains active at runtime', () => {
  const chatSource = readSource('src/views/pages/chat/Chat.vue')
  const agentViewSource = readSource('src/views/pages/setting/agent/Agent.vue')
  const promptViewSource = readSource('src/views/pages/setting/prompt/Prompt.vue')
  const providerViewSource = readSource('src/views/pages/setting/provider/Provider.vue')

  assert.match(agentViewSource, /visibleAgents[\s\S]*?agent\?\.builtin !== true/)
  assert.match(agentViewSource, /providerOptions[\s\S]*?provider\?\.builtin !== true/)
  assert.match(promptViewSource, /visiblePrompts[\s\S]*?prompt\?\.builtin !== true/)
  assert.match(providerViewSource, /const providers = computed[\s\S]*?provider\?\.builtin !== true/)
  assert.match(chatSource, /visibleSelectedAgent/)
  assert.match(chatSource, /applyDefaultGeneralAgent/)
  assert.match(chatSource, /const runtimeSkillObjects = computed\(\(\) => selectedSkillObjects\.value\)/)
  assert.match(chatSource, /const runtimeAgentSkillIds = computed\(\(\) => normalizeStringList\(agentSkillIds\.value\)\)/)
  assert.doesNotMatch(chatSource, /runtimeSkillObjects[\s\S]{0,180}\(skills\.value \|\| \[\]\)\.filter/)
  assert.match(chatSource, /runtimeMcpServers/)
  assert.match(chatSource, /isDefaultGeneralAgent\.value && servers\.length/)
})

test('chat and child-agent timelines own their remaining-height scroll viewports', () => {
  const chatCss = readSource('src/views/pages/chat/Chat.css')
  const agentFlowSource = readSource('src/views/pages/chat/ChatAgentRunFlow.vue')

  assert.match(chatCss, /\.chat-messages-shell[\s\S]*?flex:\s*1 1 0/)
  assert.match(chatCss, /\.chat-main-scrollbar[\s\S]*?height:\s*100%/)
  assert.match(agentFlowSource, /\.agent-run-flow__timeline[\s\S]*?overflow-y:\s*auto/)
  assert.match(agentFlowSource, /max-height:\s*min\(440px,\s*54vh\)/)
})
