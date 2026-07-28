import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AGENT_SKILL_LAZY_LOAD_GUIDANCE_LINES,
  buildBasePromptSelectionState,
  buildMergedChatState,
  buildCustomSystemPromptState,
  COMPACT_MCP_CATALOG_NOTE,
  COMPACT_MCP_TOOL_GUIDANCE_LINES,
  INTERNAL_TOOL_SPECS,
  hasActiveBasePromptSelection,
  isPromptModalSelectionCurrentBasePrompt,
  normalizePromptText,
  resolveSystemPromptModalApplyState,
  shouldClearBasePromptSelectionImmediately,
  shouldClearBasePromptSelectionFromPromptModal
} from '../src/utils/chatPromptTooling.js'
import {
  extractInlineAgentContext,
  extractInlineCommandContext,
  getInlinePickerMatchScore
} from '../src/utils/chatInlinePicker.js'

test('normalizePromptText normalizes line endings and trims whitespace', () => {
  assert.equal(normalizePromptText(' \r\nfoo\r\nbar\r\n '), 'foo\nbar')
})

test('buildBasePromptSelectionState keeps prompt mode when prompt id exists', () => {
  assert.deepEqual(buildBasePromptSelectionState('prompt_1', 'default system prompt'), {
    basePromptMode: 'prompt',
    selectedPromptId: 'prompt_1',
    customSystemPrompt: ''
  })
})

test('buildBasePromptSelectionState falls back to default system prompt when prompt id is missing', () => {
  assert.deepEqual(buildBasePromptSelectionState('', 'default system prompt'), {
    basePromptMode: 'custom',
    selectedPromptId: null,
    customSystemPrompt: 'default system prompt'
  })
})

test('buildCustomSystemPromptState always clears selected prompt id and derives explicit flag', () => {
  assert.deepEqual(buildCustomSystemPromptState('  custom prompt  '), {
    basePromptMode: 'custom',
    selectedPromptId: null,
    customSystemPrompt: '  custom prompt  ',
    customSystemPromptExplicit: true
  })
  assert.deepEqual(buildCustomSystemPromptState('', false), {
    basePromptMode: 'custom',
    selectedPromptId: null,
    customSystemPrompt: '',
    customSystemPromptExplicit: false
  })
  assert.deepEqual(buildCustomSystemPromptState('   ', true), {
    basePromptMode: 'custom',
    selectedPromptId: null,
    customSystemPrompt: '   ',
    customSystemPromptExplicit: false
  })
})

test('buildMergedChatState uses defaults as a fallback for partially persisted state', () => {
  assert.deepEqual(
    buildMergedChatState(
      {
        selectedProviderId: 'provider-default',
        selectedModel: 'model-default',
        basePromptMode: 'custom',
        customSystemPrompt: 'default system prompt',
        webSearchEnabled: false
      },
      {
        selectedModel: 'model-from-session',
        webSearchEnabled: true
      }
    ),
    {
      selectedProviderId: 'provider-default',
      selectedModel: 'model-from-session',
      basePromptMode: 'custom',
      customSystemPrompt: 'default system prompt',
      webSearchEnabled: true
    }
  )
})

test('resolveSystemPromptModalApplyState keeps selected prompt mode when draft matches selected prompt content', () => {
  assert.deepEqual(
    resolveSystemPromptModalApplyState(
      {
        basePromptMode: 'prompt',
        selectedPromptId: 'prompt_1',
        customSystemPrompt: '',
        customSystemPromptExplicit: false
      },
      {
        draftText: ' prompt body ',
        selectedPromptId: 'prompt_1',
        selectedPromptContent: 'prompt body'
      }
    ),
    {
      basePromptMode: 'prompt',
      selectedPromptId: 'prompt_1',
      customSystemPrompt: '',
      customSystemPromptExplicit: false
    }
  )
})

test('resolveSystemPromptModalApplyState switches to custom mode and clears stale selected prompt id for edited drafts', () => {
  assert.deepEqual(
    resolveSystemPromptModalApplyState(
      {
        basePromptMode: 'prompt',
        selectedPromptId: 'prompt_1',
        customSystemPrompt: '',
        customSystemPromptExplicit: false
      },
      {
        draftText: 'custom override',
        selectedPromptId: 'prompt_1',
        selectedPromptContent: 'prompt body'
      }
    ),
    {
      basePromptMode: 'custom',
      selectedPromptId: null,
      customSystemPrompt: 'custom override',
      customSystemPromptExplicit: true
    }
  )
})

test('prompt modal selection helpers respect only active system prompt state', () => {
  assert.equal(
    hasActiveBasePromptSelection({ basePromptMode: 'prompt', selectedPromptId: 'prompt_1' }),
    true
  )
  assert.equal(
    hasActiveBasePromptSelection({ basePromptMode: 'custom', selectedPromptId: 'prompt_1' }),
    false
  )
  assert.equal(
    isPromptModalSelectionCurrentBasePrompt(
      { type: 'local', promptId: 'prompt_1' },
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' }
    ),
    true
  )
  assert.equal(
    isPromptModalSelectionCurrentBasePrompt(
      { type: 'local', promptId: 'prompt_1' },
      { basePromptMode: 'custom', selectedPromptId: 'prompt_1' }
    ),
    false
  )
  assert.equal(
    isPromptModalSelectionCurrentBasePrompt(
      { type: 'local', promptId: 'prompt_2' },
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' }
    ),
    false
  )
})

test('shouldClearBasePromptSelectionFromPromptModal only clears current local system selection when modal value is emptied', () => {
  assert.equal(
    shouldClearBasePromptSelectionFromPromptModal(
      { type: 'local', promptId: '' },
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' }
    ),
    true
  )
  assert.equal(
    shouldClearBasePromptSelectionFromPromptModal(
      { type: 'local', promptId: 'prompt_2' },
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' }
    ),
    false
  )
  assert.equal(
    shouldClearBasePromptSelectionFromPromptModal(
      { type: 'mcp', promptId: '' },
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' }
    ),
    false
  )
  assert.equal(
    shouldClearBasePromptSelectionFromPromptModal(
      { type: 'local', promptId: '' },
      { basePromptMode: 'custom', selectedPromptId: 'prompt_1' }
    ),
    false
  )
})

test('shouldClearBasePromptSelectionImmediately clears only when the modal is empty or already targeting local system selection', () => {
  assert.equal(
    shouldClearBasePromptSelectionImmediately(
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' },
      { type: 'local', promptId: '' }
    ),
    true
  )
  assert.equal(
    shouldClearBasePromptSelectionImmediately(
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' },
      { type: 'mcp', serverId: 'srv', promptName: 'helper' }
    ),
    false
  )
  assert.equal(
    shouldClearBasePromptSelectionImmediately(
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' },
      { type: 'local', promptId: 'prompt_1' }
    ),
    true
  )
  assert.equal(
    shouldClearBasePromptSelectionImmediately(
      { basePromptMode: 'prompt', selectedPromptId: 'prompt_1' },
      { type: 'local', promptId: 'user_prompt' }
    ),
    false
  )
  assert.equal(
    shouldClearBasePromptSelectionImmediately({ basePromptMode: 'prompt', selectedPromptId: '' }),
    false
  )
  assert.equal(
    shouldClearBasePromptSelectionImmediately({ basePromptMode: 'custom', selectedPromptId: 'prompt_1' }),
    false
  )
})

test('guidance text includes concrete skill and mcp calling rules', () => {
  const skillGuidance = AGENT_SKILL_LAZY_LOAD_GUIDANCE_LINES.join('\n')
  const mcpGuidance = COMPACT_MCP_TOOL_GUIDANCE_LINES.join('\n')

  assert.match(skillGuidance, /use_skill\(\{"id":"\.\.\."\}\)/)
  assert.match(skillGuidance, /use_skills\(\{"ids":\["\.\.\.","\.\.\."\]\}\)/)
  assert.match(skillGuidance, /run_skill_script/)
  assert.match(skillGuidance, /skill_discover/)
  assert.match(skillGuidance, /skill_call/)

  assert.match(mcpGuidance, /mcp_call\(\{"server_id":"\.\.\.","tool":"\.\.\.","args":\{...\}\}\)/)
  assert.match(mcpGuidance, /mcp_discover\(\{"server_id":"\.\.\.","tool":"\.\.\."\}\)/)
  assert.match(mcpGuidance, /tool_names_truncated=true/)
  assert.match(mcpGuidance, /pinned_tool_hints/)
  assert.match(mcpGuidance, /script/)
  assert.match(mcpGuidance, /config_add_\*/)
  assert.match(mcpGuidance, /\{"id":"\.\.\.","patch":\{...\}\}/)
  assert.match(COMPACT_MCP_CATALOG_NOTE, /tool_names_truncated=true/)
  assert.match(COMPACT_MCP_CATALOG_NOTE, /pinned_tool_hints/)
  assert.match(COMPACT_MCP_CATALOG_NOTE, /args/)
  assert.match(COMPACT_MCP_CATALOG_NOTE, /config_update_/)
  assert.match(COMPACT_MCP_CATALOG_NOTE, /mcp_discover\(\{server_id, tool\}\)/)
})

test('internal tool specs require stable fields for skill and mcp calls', () => {
  assert.deepEqual(INTERNAL_TOOL_SPECS.useSkill.parameters.required, ['id'])
  assert.deepEqual(INTERNAL_TOOL_SPECS.useSkills.parameters.required, ['ids'])
  assert.deepEqual(INTERNAL_TOOL_SPECS.runSkillScript.parameters.required, ['id'])
  assert.match(INTERNAL_TOOL_SPECS.runSkillScript.description, /scripts/)
  assert.equal(INTERNAL_TOOL_SPECS.useSkills.parameters.properties.ids.minItems, 1)
  assert.deepEqual(INTERNAL_TOOL_SPECS.skillCall.parameters.required, ['skill_id', 'action', 'args'])
  assert.equal(INTERNAL_TOOL_SPECS.skillCall.parameters.properties.args.type, undefined)
  assert.match(INTERNAL_TOOL_SPECS.skillDiscover.description, /按需发现/)
  assert.deepEqual(INTERNAL_TOOL_SPECS.mcpCall.parameters.required, ['server_id', 'tool', 'args'])
  assert.equal(INTERNAL_TOOL_SPECS.mcpCall.parameters.properties.server_id.minLength, 1)
  assert.equal(INTERNAL_TOOL_SPECS.mcpCall.parameters.properties.tool.minLength, 1)
  assert.equal(INTERNAL_TOOL_SPECS.mcpCall.parameters.properties.args.type, undefined)
  assert.match(INTERNAL_TOOL_SPECS.mcpCall.parameters.properties.args.description, /字符串、数组/)
  assert.match(INTERNAL_TOOL_SPECS.mcpCall.description, /config_add_/)
  assert.match(INTERNAL_TOOL_SPECS.mcpCall.description, /config_update_/)
  assert.deepEqual(INTERNAL_TOOL_SPECS.webSearch.parameters.required, ['query'])
  assert.deepEqual(INTERNAL_TOOL_SPECS.webRead.parameters.required, ['url'])
  assert.equal(INTERNAL_TOOL_SPECS.webSearch.parameters.properties.query.minLength, 1)
  assert.equal(INTERNAL_TOOL_SPECS.webRead.parameters.properties.url.minLength, 1)
  assert.match(INTERNAL_TOOL_SPECS.webSearch.description, /联网搜索/)
  assert.match(INTERNAL_TOOL_SPECS.webSearch.description, /不要因为模型知识截止时间更早而反复搜索同一问题/)
  assert.match(INTERNAL_TOOL_SPECS.webSearch.description, /用户明确需要联网/)
  assert.match(INTERNAL_TOOL_SPECS.webRead.description, /读取公开网页/)
})

test('extractInlineCommandContext keeps slash-only input responsive and opens command picker', () => {
  assert.deepEqual(extractInlineCommandContext('/', 1), {
    mode: 'kind',
    type: '',
    query: '',
    start: 0,
    end: 1
  })
})

test('extractInlineCommandContext resolves full command names to canonical item pickers', () => {
  assert.deepEqual(extractInlineCommandContext('/prompt writer', 14), {
    mode: 'item',
    type: 'prompt',
    query: 'writer',
    start: 0,
    end: 14
  })
})

test('extractInlineCommandContext keeps short aliases compatible but canonicalizes the type', () => {
  assert.deepEqual(extractInlineCommandContext('/s code', 7), {
    mode: 'item',
    type: 'skill',
    query: 'code',
    start: 0,
    end: 7
  })
  assert.deepEqual(extractInlineCommandContext('/m', 2), {
    mode: 'item',
    type: 'mcp',
    query: '',
    start: 0,
    end: 2
  })
})

test('extractInlineAgentContext returns the active @ query span', () => {
  assert.deepEqual(extractInlineAgentContext('use @planner now', 12), {
    query: 'planner',
    start: 4,
    end: 12
  })
})

test('getInlinePickerMatchScore supports multi-field and multi-term matching', () => {
  const good = getInlinePickerMatchScore(['OpenAI', 'gpt-4o-mini', 'planner'], 'openai mini')
  const exact = getInlinePickerMatchScore(['planner'], 'planner')
  const miss = getInlinePickerMatchScore(['anthropic', 'claude'], 'openai mini')

  assert.equal(exact, 0)
  assert.ok(Number.isFinite(good))
  assert.ok(good > exact)
  assert.equal(miss, Number.POSITIVE_INFINITY)
})
