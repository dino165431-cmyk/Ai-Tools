import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const storage = new Map()

if (!globalThis.utools) {
  globalThis.utools = {
    getPath: () => path.join(process.cwd(), '.tmp-utools'),
    dbCryptoStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value)
    }
  }
}

if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type
      this.detail = init.detail
    }
  }
}

if (!globalThis.window) {
  globalThis.window = {
    dispatchEvent() {},
    addEventListener() {}
  }
} else {
  if (typeof globalThis.window.dispatchEvent !== 'function') globalThis.window.dispatchEvent = () => {}
  if (typeof globalThis.window.addEventListener !== 'function') globalThis.window.addEventListener = () => {}
}

const globalConfig = require('../public/preload/utils/global-config.js')
const createBuiltinConfigSkillRuntime = require('../public/preload/builtin-skills/manage-ai-tools-config/runtime.js')
const createBuiltinAgentsSkillRuntime = require('../public/preload/builtin-skills/orchestrate-agents/runtime.js')
const builtinSkills = require('../public/preload/builtin-skills/index.js')

function getLocalNotebookRuntimeConfigPath() {
  return path.join(globalThis.utools.getPath('userData'), '.ai-tools-local', 'notebook-runtime.json')
}

function getLocalWebSearchConfigPath() {
  return path.join(globalThis.utools.getPath('userData'), '.ai-tools-local', 'web-search.json')
}

function resetConfigStorage() {
  storage.delete('global-config')
  fs.rmSync(path.dirname(getLocalNotebookRuntimeConfigPath()), { recursive: true, force: true })
  fs.rmSync(path.join(globalThis.utools.getPath('userData'), '.ai-tools-settings'), { recursive: true, force: true })
}

function createSkillFixture(t, {
  folderName = 'sample-skill',
  skillName = 'Sample Skill',
  descriptionLines = ['First line', 'Second line'],
  body = '# Sample Skill\n\nBody.\n',
  scriptName = '',
  scriptContent = '',
  scripts = [],
  scriptManifest = null
} = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-skill-fixture-'))
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))

  const skillDir = path.join(tempRoot, folderName)
  fs.mkdirSync(skillDir, { recursive: true })

  const frontmatter = [
    '---',
    `name: ${folderName}`,
    'description: |',
    ...descriptionLines.map((line) => `  ${line}`),
    '---',
    '',
    body.trimEnd(),
    ''
  ].join('\n')

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), frontmatter, 'utf8')

  if (scriptName || scripts.length || scriptManifest !== null) {
    const scriptsDir = path.join(skillDir, 'scripts')
    fs.mkdirSync(scriptsDir, { recursive: true })

    if (scriptName) {
      fs.writeFileSync(path.join(scriptsDir, scriptName), scriptContent, 'utf8')
    }

    scripts.forEach((script) => {
      const relativePath = String(script?.name || script?.path || '').trim()
      if (!relativePath) return
      const targetPath = path.join(scriptsDir, relativePath)
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.writeFileSync(targetPath, String(script?.content || ''), 'utf8')
    })

    if (scriptManifest !== null) {
      fs.writeFileSync(path.join(scriptsDir, 'manifest.json'), JSON.stringify(scriptManifest, null, 2), 'utf8')
    }
  }

  return {
    skillDir,
    skillFile: path.join(skillDir, 'SKILL.md')
  }
}

test('builtin config Skill includes native action rules and import guidance', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const skill = cfg.skills.builtin_skill_config

  assert.ok(skill)
  assert.ok(skill.description.includes('native Skill actions'))
  assert.equal(skill.sourceType, 'builtin-directory')
  assert.ok(skill.nativeActions.includes('config_import_skill_directory'))
  assert.ok(skill.content.includes('config_import_skill_directory'))
  assert.ok(skill.content.includes('config_import_skill_file'))
  assert.ok(skill.content.includes('config_add_*'))
  assert.ok(skill.content.includes('config_update_*'))
  assert.ok(skill.content.includes('{ id, patch }'))
  assert.equal(skill.content.includes('builtin_config_mcp'), false)
  assert.ok(skill.content.includes('sourcePath'))
  assert.ok(skill.content.includes('transportType'))
  assert.ok(skill.content.includes('config_get_system_time'))
  assert.ok(skill.content.includes('***'))
})

test('builtin Skills expose standard packages, icons, references, and native action policies', async () => {
  resetConfigStorage()
  const records = builtinSkills.buildBuiltinSkillRecords()
  const ids = Object.values(builtinSkills.BUILTIN_SKILL_IDS)

  assert.equal(ids.length, 5)
  assert.deepEqual(Object.keys(records).sort(), [...ids].sort())

  for (const id of ids) {
    const skill = records[id]
    assert.equal(skill.sourceType, 'builtin-directory')
    assert.equal(skill.builtin, true)
    assert.deepEqual(skill.mcp, [])
    assert.ok(skill.content.length > 0)
    assert.ok(skill.interface.displayName)
    assert.ok(skill.interface.shortDescription)
    assert.match(skill.interface.brandColor, /^#[0-9A-F]{6}$/i)
    assert.equal(skill.interface.iconSmall, './assets/icon.svg')
    assert.equal(skill.interface.iconLarge, './assets/icon.svg')
    assert.ok(skill.cache.fileIndex.agents.includes('agents/openai.yaml'))
    assert.ok(skill.cache.fileIndex.assets.includes('assets/icon.svg'))
    assert.ok(skill.cache.fileIndex.references.includes('references/actions.md'))
    assert.equal(skill.capabilities.supportsReferences, true)
    assert.equal(skill.capabilities.supportsAssets, true)

    const icon = globalConfig.readSkillIcon(id, 'small')
    assert.equal(icon.mime, 'image/svg+xml')
    assert.match(icon.dataUrl, /^data:image\/svg\+xml;base64,/)

    const actions = await builtinSkills.listBuiltinSkillActions(id)
    assert.deepEqual(actions.map((action) => action.name), skill.nativeActions)
  }

  const noteActions = await builtinSkills.listBuiltinSkillActions(builtinSkills.BUILTIN_SKILL_IDS.notes)
  assert.equal(noteActions.find((action) => action.name === 'notes_read').forceApproval, false)
  assert.equal(noteActions.find((action) => action.name === 'notes_delete').forceApproval, true)
  assert.equal(noteActions.find((action) => action.name === 'notebook_execute_all').approvalKind, 'execution')
  await builtinSkills.closeBuiltinSkillRuntimes()
})

test('builtin default Agent starts without prebound Skills and repairs legacy bindings', () => {
  resetConfigStorage()
  const initial = globalConfig.getConfig()
  const builtinAgentId = 'builtin_agent_notes'
  const legacySkillIds = Object.values(builtinSkills.BUILTIN_SKILL_IDS)

  assert.deepEqual(initial.agents[builtinAgentId].skills, [])

  initial.agents[builtinAgentId].skills = legacySkillIds
  storage.set('global-config', initial)
  const repaired = globalConfig.ensureBuiltins()
  assert.deepEqual(repaired.agents[builtinAgentId].skills, [])
})

test('legacy builtin MCP records and bindings are removed during config migration', () => {
  resetConfigStorage()
  const seeded = globalConfig.getConfig()
  seeded.mcpServers.builtin_notes_mcp = { _id: 'builtin_notes_mcp', name: 'legacy notes' }
  seeded.mcpServers.external_demo = { _id: 'external_demo', name: 'external demo', transportType: 'stdio', command: 'demo' }
  seeded.skills.legacy_binding = {
    _id: 'legacy_binding',
    name: 'legacy binding',
    description: '',
    content: '',
    triggers: { keywords: [] },
    mcp: ['builtin_notes_mcp', 'external_demo']
  }
  seeded.agents.legacy_binding = {
    _id: 'legacy_binding',
    name: 'legacy binding',
    provider: '',
    model: '',
    skills: [],
    mcp: ['builtin_notes_mcp', 'external_demo'],
    prompt: ''
  }
  storage.set('global-config', seeded)

  const migrated = globalConfig.getConfig()
  assert.equal(migrated.mcpServers.builtin_notes_mcp, undefined)
  assert.ok(migrated.mcpServers.external_demo)
  assert.deepEqual(migrated.skills.legacy_binding.mcp, ['external_demo'])
  assert.deepEqual(migrated.agents.legacy_binding.mcp, ['external_demo'])
})

test('external MCP records preserve standard icons and reject active SVG data', () => {
  resetConfigStorage()
  globalConfig.addMcpServer({
    _id: 'mcp_with_icon',
    name: 'Icon MCP',
    icon: '🔧',
    brandColor: '#123ABC',
    transportType: 'stdio',
    command: 'node',
    args: []
  })

  const saved = globalConfig.getConfig().mcpServers.mcp_with_icon
  assert.equal(saved.icon, '🔧')
  assert.equal(saved.brandColor, '#123ABC')

  assert.throws(
    () => globalConfig.addMcpServer({
      _id: 'mcp_unsafe_icon',
      name: 'Unsafe icon MCP',
      icon: `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`,
      transportType: 'stdio',
      command: 'node',
      args: []
    }),
    /active or remote content/
  )
})

test('builtin assistant prompt mentions skill import priority and compatibility rules', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const prompt = cfg.prompts.builtin_prompt_notes

  assert.ok(prompt)
  assert.ok(prompt.description.includes('Skill'))
  assert.ok(prompt.content.includes('config_import_skill_directory'))
  assert.ok(prompt.content.includes('config_import_skill_file'))
  assert.ok(prompt.content.includes('config_add_skill'))
  assert.ok(prompt.content.includes('config_update_skill'))
  assert.ok(prompt.content.includes('旧版内联 Skill'))
  assert.ok(prompt.content.includes('transportType'))
  assert.ok(prompt.content.includes('config_get_system_time'))
  assert.ok(prompt.content.includes('env'))
  assert.ok(prompt.content.includes('headers'))
  assert.ok(prompt.content.includes('notes_list_directory'))
  assert.ok(prompt.content.includes('notes_list_recent'))
  assert.ok(prompt.content.includes('notes_search'))
  assert.ok(prompt.content.includes('sessions_list_directory'))
  assert.ok(prompt.content.includes('sessions_list_recent'))
  assert.ok(prompt.content.includes('sessions_search'))
  assert.ok(prompt.content.includes('默认通用 Agent 可按需使用全部已安装 Skill 和已启用 MCP'))
  assert.ok(prompt.content.includes('不会预先挂载全部 Skill'))
  assert.ok(prompt.content.includes('最多激活少量相关 Skill'))
  assert.ok(prompt.content.includes('config_read_prompt'))
  assert.ok(prompt.content.includes('bundle_id'))
  assert.ok(prompt.content.includes('Compress-Archive'))
  assert.ok(prompt.content.includes('临时 `.zip` 再重命名'))
})

test('default system prompt fallbacks stay synchronized and include execution guardrails', async () => {
  resetConfigStorage()
  const { DEFAULT_SYSTEM_PROMPT: rendererDefaultSystemPrompt } = await import('../src/utils/configListener.js')
  const preloadDefaultSystemPrompt = globalConfig.getConfig().chatConfig.defaultSystemPrompt

  assert.equal(rendererDefaultSystemPrompt, preloadDefaultSystemPrompt)
  assert.ok(preloadDefaultSystemPrompt.includes('解释、审查、报告或诊断默认只读'))
  assert.ok(preloadDefaultSystemPrompt.includes('采用最小充分调用'))
  assert.ok(preloadDefaultSystemPrompt.includes('不要重复发现能力、列目录、搜索或读取同一目标'))
  assert.ok(preloadDefaultSystemPrompt.includes('不要原样重试'))
  assert.ok(preloadDefaultSystemPrompt.includes('不得声称文件已保存、命令已执行或测试已通过'))
  assert.ok(preloadDefaultSystemPrompt.includes('达到用户目标后立即停止调用工具'))
  assert.ok(preloadDefaultSystemPrompt.includes('不回显密钥、token、cookie、env、headers'))
})

test('legacy official default prompts upgrade without overwriting custom prompts', () => {
  resetConfigStorage()
  const stored = globalConfig.getConfig()
  const legacyDefaultPrompt = [
    '你是一个 AI 助手（AI Assistant）。',
    '默认使用简体中文回复；仅在用户明确要求时切换到其他语言。',
    '优先给出准确、可执行、可验证的结论与步骤。',
    '不确定时先提出 1 到 2 个关键澄清问题，避免做高风险假设。',
    '涉及代码、配置或命令时，优先给出可直接操作的步骤与示例。',
    '遇到可能有风险或权限不足的操作时，先说明风险并征求确认。',
    '不要编造信息；需要外部信息时，明确说明并给出获取或验证方式。'
  ].join('\r\n')
  stored.chatConfig.defaultSystemPrompt = legacyDefaultPrompt
  storage.set('global-config', stored)

  const upgraded = globalConfig.getConfig().chatConfig.defaultSystemPrompt
  assert.notEqual(upgraded, legacyDefaultPrompt)
  assert.ok(upgraded.includes('执行：'))
  assert.ok(upgraded.includes('不要原样重试'))

  const customPrompt = '这是用户自定义的系统提示词，不应被迁移覆盖。'
  const customStored = storage.get('global-config') || {}
  customStored.chatConfig.defaultSystemPrompt = customPrompt
  storage.set('global-config', customStored)
  assert.equal(globalConfig.getConfig().chatConfig.defaultSystemPrompt, customPrompt)
})

test('builtin assistant prompt prevents redundant discovery, blind retries, and invented file links', () => {
  resetConfigStorage()
  const prompt = globalConfig.getConfig().prompts.builtin_prompt_notes

  assert.ok(prompt.content.includes('执行稳定性（高优先级）'))
  assert.ok(prompt.content.includes('不要反复查看全部可用能力'))
  assert.ok(prompt.content.includes('不要原样重复失败调用'))
  assert.ok(prompt.content.includes('同一根因连续失败 2 次后停止盲试'))
  assert.ok(prompt.content.includes('只有 action 明确返回成功'))
  assert.ok(prompt.content.includes('达到用户目标后立即停止工具调用'))
  assert.ok(prompt.content.includes('只有 action 实际返回 `downloadHref` 时'))
  assert.ok(prompt.content.includes('本机工作区文件没有沙盒下载链接'))
  assert.ok(prompt.content.includes('不要自行拼接或猜测 `sandbox-file://`'))
  assert.ok(prompt.content.includes('临时脚本、中间产物和未指定目标的生成结果都使用 `workspace_scope: sandbox`'))
  assert.ok(prompt.content.includes('不要自动改到那里执行'))
  assert.ok(prompt.content.includes('`workspace_scope: all` 同时检索沙盒和本机工作区'))
  assert.ok(prompt.content.includes('使用 `sandbox_export` 从沙盒直接复制到本机相对路径'))
  assert.ok(prompt.content.includes('不要回读 Base64、切块或手工重写二进制文件'))
  assert.equal(prompt.content.includes('能用工具就用工具'), false)
})

test('builtin notes and sessions skills prefer lightweight discovery tools first', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const noteSkill = cfg.skills.builtin_skill_notes
  const sessionsSkill = cfg.skills.builtin_skill_sessions

  assert.ok(noteSkill)
  assert.ok(noteSkill.description.includes('native actions'))
  assert.ok(noteSkill.content.includes('notes_list_directory'))
  assert.ok(noteSkill.content.includes('notes_list_recent'))
  assert.ok(noteSkill.content.includes('notes_search'))
  assert.ok(noteSkill.content.includes('`notes_list_tree` only'))
  assert.ok(noteSkill.content.includes('path is known'))

  assert.ok(sessionsSkill)
  assert.ok(sessionsSkill.description.includes('read-only actions'))
  assert.ok(sessionsSkill.content.includes('sessions_list_directory'))
  assert.ok(sessionsSkill.content.includes('sessions_list_recent'))
  assert.ok(sessionsSkill.content.includes('sessions_search'))
  assert.ok(sessionsSkill.content.includes('`sessions_list_tree` only'))
  assert.ok(sessionsSkill.content.includes('known path'))
  assert.ok(sessionsSkill.content.includes('small verified set'))
})

test('builtin prompt explicitly discourages full-tree scans as the default', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const prompt = cfg.prompts.builtin_prompt_notes

  assert.ok(prompt.content.includes('默认优先轻量定位'))
  assert.ok(prompt.content.includes('已知明确路径时，直接 `notes_read`'))
  assert.ok(prompt.content.includes('优先 `notes_search`'))
  assert.ok(prompt.content.includes('不要为了读单篇笔记先列树'))
  assert.ok(prompt.content.includes('不要默认从 note 根目录做大深度 `notes_list_tree`'))
  assert.ok(prompt.content.includes('已知明确路径时，直接 `sessions_read`'))
  assert.ok(prompt.content.includes('sessions_search'))
  assert.ok(prompt.content.includes('批量分析前先用轻量工具筛小范围'))
})

test('config Skill action schemas expose strict config-specific descriptions', async () => {
  const runtime = createBuiltinConfigSkillRuntime()
  const tools = await runtime.listActions()
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]))

  const updateMcp = toolMap.get('config_update_mcp_server')
  assert.ok(updateMcp)
  assert.ok(updateMcp.description.includes('{id, patch}'))
  assert.equal(updateMcp.inputSchema.properties.patch.additionalProperties, false)
  assert.ok(updateMcp.inputSchema.properties.patch.properties.args.description.includes('["-y","@modelcontextprotocol/server-filesystem","E:/data"]'))
  assert.ok(updateMcp.inputSchema.properties.patch.properties.env.description.includes('{"API_KEY":"xxx"}'))
  assert.ok(updateMcp.inputSchema.properties.patch.properties.headers.description.includes('{"Authorization":"Bearer ..."}'))

  const listSkills = toolMap.get('config_list_skills')
  assert.ok(listSkills)
  assert.ok(listSkills.description.includes('sourceType'))

  const importSkillDirectory = toolMap.get('config_import_skill_directory')
  assert.ok(importSkillDirectory)
  assert.ok(importSkillDirectory.description.includes('SKILL.md'))
  assert.ok(importSkillDirectory.description.includes('overwrite'))
  assert.deepEqual(importSkillDirectory.inputSchema.required, ['path'])

  const importSkillFile = toolMap.get('config_import_skill_file')
  assert.ok(importSkillFile)
  assert.ok(importSkillFile.description.includes('SKILL.md'))
  assert.deepEqual(importSkillFile.inputSchema.required, ['path'])

  const addProvider = toolMap.get('config_add_provider')
  assert.ok(addProvider)
  assert.ok(addProvider.inputSchema.properties.apikey.description.includes('***'))

  const addPrompt = toolMap.get('config_add_prompt')
  assert.ok(addPrompt)
  assert.deepEqual(addPrompt.inputSchema.properties.type.enum, ['system', 'user'])

  const listPrompts = toolMap.get('config_list_prompts')
  assert.ok(listPrompts)
  assert.ok(listPrompts.description.includes('type'))
  const readPrompt = toolMap.get('config_read_prompt')
  assert.ok(readPrompt)
  assert.deepEqual(readPrompt.inputSchema.required, ['id'])

  const addAgent = toolMap.get('config_add_agent')
  assert.ok(addAgent)
  assert.ok(addAgent.inputSchema.properties.prompt.description.includes('系统提示词'))
  assert.ok(addAgent.description.includes('prompt'))

  const addTask = toolMap.get('config_add_timed_task')
  assert.ok(addTask)
  assert.ok(addTask.description.includes('trigger'))
  assert.equal(addTask.inputSchema.required.includes('agentId'), false)
  assert.ok(addTask.inputSchema.properties.agentId.description.includes('默认通用'))
  assert.equal(addTask.inputSchema.properties.trigger.additionalProperties, false)
  assert.equal(addTask.inputSchema.properties.options.additionalProperties, false)

  const updateTask = toolMap.get('config_update_timed_task')
  assert.ok(updateTask)
  assert.equal(updateTask.inputSchema.properties.patch.additionalProperties, false)
  assert.ok(updateTask.inputSchema.properties.patch.description.includes('trigger'))
})

test('config prompt tools preserve prompt type metadata', async () => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const runtime = createBuiltinConfigSkillRuntime()
  const added = await runtime.runAction('config_add_prompt', {
    name: '变量提示词',
    type: 'user',
    content: '你好 {{name}}'
  })

  assert.equal(added.ok, true)

  const listed = await runtime.runAction('config_list_prompts', {})
  const item = listed.items.find((entry) => entry._id === added.id)
  assert.ok(item)
  assert.equal(item.type, 'user')
  assert.equal(listed.items.some((entry) => entry.builtin === true), false)
  assert.equal(listed.items.some((entry) => entry._id === 'builtin_prompt_notes'), false)

  const listedAgents = await runtime.runAction('config_list_agents', {})
  assert.equal(listedAgents.items.some((entry) => entry._id === 'builtin_agent_notes'), false)

  const listedProviders = await runtime.runAction('config_list_providers', {})
  assert.equal(listedProviders.items.some((entry) => entry._id === 'builtin_provider_utools_ai'), false)

  const read = await runtime.runAction('config_read_prompt', { id: added.id })
  assert.equal(read.ok, true)
  assert.equal(read.prompt.content, '你好 {{name}}')

  await assert.rejects(
    runtime.runAction('config_read_prompt', { id: 'builtin_prompt_notes' }),
    /未找到用户提示词/
  )

  await runtime.runAction('config_update_prompt', {
    id: added.id,
    patch: {
      type: 'system'
    }
  })

  const prompt = globalConfig.getPrompt(added.id)
  assert.equal(prompt.type, 'system')
})

test('builtin prompt always stays a system prompt even when legacy storage is polluted', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const builtinPromptId = 'builtin_prompt_notes'

  assert.equal(cfg.prompts[builtinPromptId]?.type, 'system')

  const stored = storage.get('global-config') || {}
  stored.prompts = stored.prompts || {}
  stored.prompts[builtinPromptId] = {
    ...(stored.prompts[builtinPromptId] || cfg.prompts[builtinPromptId]),
    type: 'user'
  }
  storage.set('global-config', stored)

  const repaired = globalConfig.ensureBuiltins()
  assert.equal(repaired.prompts[builtinPromptId]?.type, 'system')
  assert.equal(globalConfig.getConfig().prompts[builtinPromptId]?.type, 'system')
})

test('plain config reads also self-heal polluted builtin prompt type', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const builtinPromptId = 'builtin_prompt_notes'

  const stored = storage.get('global-config') || {}
  stored.prompts = stored.prompts || {}
  stored.prompts[builtinPromptId] = {
    ...(stored.prompts[builtinPromptId] || cfg.prompts[builtinPromptId]),
    type: 'user'
  }
  storage.set('global-config', stored)

  const repairedConfig = globalConfig.getConfig()
  assert.equal(repairedConfig.prompts[builtinPromptId]?.type, 'system')
  assert.equal(globalConfig.getPrompt(builtinPromptId).type, 'system')
  assert.equal(storage.get('global-config')?.prompts?.[builtinPromptId]?.type, 'system')
})

test('builtin prompt self-heal preserves custom agent bindings that reference it', () => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const builtinPromptId = 'builtin_prompt_notes'
  const agentId = 'agent_custom_builtin_prompt_binding'

  globalConfig.addAgent({
    _id: agentId,
    name: '引用内置提示词的自定义智能体',
    provider: 'builtin_provider_utools_ai',
    model: 'mock-model',
    prompt: builtinPromptId
  })
  assert.equal(globalConfig.getAgent(agentId).prompt, builtinPromptId)

  const stored = storage.get('global-config') || {}
  stored.prompts = stored.prompts || {}
  stored.prompts[builtinPromptId] = {
    ...(stored.prompts[builtinPromptId] || {}),
    type: 'user'
  }
  storage.set('global-config', stored)

  const repaired = globalConfig.getConfig()
  assert.equal(repaired.prompts[builtinPromptId]?.type, 'system')
  assert.equal(repaired.agents[agentId]?.prompt, builtinPromptId)
  assert.equal(globalConfig.getAgent(agentId).prompt, builtinPromptId)
  assert.equal(storage.get('global-config')?.agents?.[agentId]?.prompt, builtinPromptId)
})

test('agent prompt bindings only keep system prompts across config tools and storage', async () => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const runtime = createBuiltinConfigSkillRuntime()
  const userPrompt = await runtime.runAction('config_add_prompt', {
    name: '用户模板',
    type: 'user',
    content: '你好 {{name}}'
  })
  const systemPrompt = await runtime.runAction('config_add_prompt', {
    name: '系统模板',
    type: 'system',
    content: '你是一个助手'
  })

  const added = await runtime.runAction('config_add_agent', {
    name: '测试智能体',
    prompt: userPrompt.id
  })
  assert.equal(added.ok, true)
  assert.equal(globalConfig.getAgent(added.id).prompt, null)

  await runtime.runAction('config_update_agent', {
    id: added.id,
    patch: { prompt: systemPrompt.id }
  })
  assert.equal(globalConfig.getAgent(added.id).prompt, systemPrompt.id)

  await runtime.runAction('config_update_agent', {
    id: added.id,
    patch: { prompt: userPrompt.id }
  })
  assert.equal(globalConfig.getAgent(added.id).prompt, null)
})

test('prompt updates and deletions immediately sanitize agent prompt bindings in memory', async () => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const systemPromptId = 'prompt_system_runtime'
  const userPromptId = 'prompt_user_runtime'
  const agentId = 'agent_runtime_prompt_cleanup'

  globalConfig.addPrompt({
    _id: systemPromptId,
    name: '运行时系统提示词',
    content: '你是系统提示词'
  })
  globalConfig.addPrompt({
    _id: userPromptId,
    name: '运行时用户提示词',
    type: 'user',
    content: '你好 {{name}}'
  })
  globalConfig.addAgent({
    _id: agentId,
    name: '运行时测试智能体',
    provider: 'builtin_provider_utools_ai',
    model: 'mock-model',
    prompt: systemPromptId
  })

  assert.equal(globalConfig.getAgent(agentId).prompt, systemPromptId)

  globalConfig.updatePrompt(systemPromptId, { type: 'user' })
  assert.equal(globalConfig.getPrompt(systemPromptId).type, 'user')
  assert.equal(globalConfig.getAgent(agentId).prompt, null)

  globalConfig.updateAgent(agentId, { prompt: systemPromptId })
  assert.equal(globalConfig.getAgent(agentId).prompt, null)

  globalConfig.updatePrompt(systemPromptId, { type: 'system' })
  globalConfig.updateAgent(agentId, { prompt: systemPromptId })
  assert.equal(globalConfig.getAgent(agentId).prompt, systemPromptId)

  globalConfig.deletePrompt(systemPromptId)
  assert.equal(globalConfig.getAgent(agentId).prompt, null)

  globalConfig.updateAgent(agentId, { prompt: userPromptId })
  assert.equal(globalConfig.getAgent(agentId).prompt, null)
})

test('builtin agents list hides invalid non-system prompt bindings from summaries', async () => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  globalConfig.updateChatConfig({
    defaultProviderId: 'builtin_provider_utools_ai',
    defaultModel: 'mock-model',
    defaultSystemPrompt: '默认系统提示词'
  })

  const promptId = 'prompt_user_summary'
  const agentId = 'agent_invalid_prompt_summary'

  globalConfig.addPrompt({
    _id: promptId,
    name: '用户摘要提示词',
    type: 'user',
    content: '请补全 {{name}}'
  })

  const stored = storage.get('global-config')
  stored.agents = stored.agents || {}
  stored.agents[agentId] = {
    _id: agentId,
    name: '脏数据智能体',
    provider: 'builtin_provider_utools_ai',
    model: 'mock-model',
    prompt: promptId
  }
  storage.set('global-config', stored)

  const runtime = createBuiltinAgentsSkillRuntime()
  const listed = await runtime.runAction('agents_list', {})
  const item = listed.items.find((entry) => entry.id === agentId)

  assert.ok(item)
  assert.equal(item.prompt, '')
})

test('config import skill file preserves multiline description and source metadata', async (t) => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const { skillDir, skillFile } = createSkillFixture(t, {
    folderName: 'multiline-skill',
    skillName: 'Multiline Skill',
    descriptionLines: ['第一行描述', '第二行描述', '第三行描述'],
    body: '# Multiline Skill\n\n用于测试多行 description。\n'
  })

  const runtime = createBuiltinConfigSkillRuntime()
  const imported = await runtime.runAction('config_import_skill_file', { path: skillFile })

  assert.equal(imported.ok, true)
  assert.equal(imported.item.sourceType, 'directory')
  assert.equal(
    path.resolve(imported.item.sourcePath).startsWith(
      path.resolve(globalThis.utools.getPath('userData'), '.ai-tools-settings', 'skills')
    ),
    true
  )
  assert.notEqual(path.resolve(imported.item.sourcePath), path.resolve(skillDir))
  assert.equal(path.resolve(globalConfig.getSkill(imported.id).install.originalSourcePath), path.resolve(skillDir))
  assert.equal(fs.readFileSync(path.join(imported.item.sourcePath, 'SKILL.md'), 'utf8').includes('第二行描述'), true)
  assert.equal(imported.item.entryFile, 'SKILL.md')
  assert.equal(imported.item.description, '第一行描述\n第二行描述\n第三行描述')

  const listed = await runtime.runAction('config_list_skills', {})
  const item = listed.items.find((entry) => entry._id === imported.id)

  assert.ok(item)
  assert.equal(item.sourceType, 'directory')
  assert.equal(path.resolve(item.sourcePath), path.resolve(imported.item.sourcePath))
  assert.equal(item.entryFile, 'SKILL.md')
  assert.equal(item.description, '第一行描述\n第二行描述\n第三行描述')
})

test('directory skill import keeps a localized display name out of the managed path', (t) => {
  resetConfigStorage()

  const { skillDir } = createSkillFixture(t, {
    folderName: 'mobile-adjust-analysis',
    descriptionLines: ['分析移动端 Adjust 数据']
  })
  const agentsDir = path.join(skillDir, 'agents')
  fs.mkdirSync(agentsDir, { recursive: true })
  fs.writeFileSync(
    path.join(agentsDir, 'openai.yaml'),
    ['interface:', '  display_name: "移动端 Adjust 分析"'].join('\n'),
    'utf8'
  )

  const imported = globalConfig.importSkillDirectory(skillDir)

  assert.equal(imported.name, '移动端 Adjust 分析')
  assert.equal(imported.packageName, 'mobile-adjust-analysis')
  assert.equal(path.basename(imported.sourcePath), 'mobile-adjust-analysis')
  assert.equal(fs.existsSync(path.join(imported.sourcePath, 'SKILL.md')), true)
})

test('directory skill import enforces the current Agent Skills frontmatter contract', (t) => {
  resetConfigStorage()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-invalid-skill-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const skillDir = path.join(root, 'valid-folder')
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    ['---', 'name: Invalid Display Name', 'description: test', '---', '', '# Invalid'].join('\n'),
    'utf8'
  )

  assert.throws(
    () => globalConfig.importSkillDirectory(skillDir),
    /name 必须为 1-64 位小写字母/
  )
})
test('runSkillScript executes JavaScript files under imported skill scripts', async (t) => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const { skillDir } = createSkillFixture(t, {
    folderName: 'script-skill',
    skillName: 'Script Skill',
    descriptionLines: ['Script skill'],
    scriptName: 'run.js',
    scriptContent: [
      'const chunks = []',
      "process.stdin.on('data', (chunk) => chunks.push(chunk))",
      "process.stdin.on('end', () => {",
      '  process.stdout.write(JSON.stringify({',
      '    args: process.argv.slice(2),',
      "    input: Buffer.concat(chunks).toString('utf8'),",
      "    cwd: process.cwd().replace(/\\\\/g, '/'),",
      '    env: {',
      "      skillId: process.env.AI_TOOLS_SKILL_ID,",
      "      skillRoot: String(process.env.AI_TOOLS_SKILL_ROOT || '').replace(/\\\\/g, '/'),",
      "      scriptPath: process.env.AI_TOOLS_SKILL_SCRIPT_PATH,",
      "      inheritedSecret: process.env.AI_TOOLS_TEST_SECRET,",
      "      configuredValue: process.env.DEMO_API_KEY,",
      "      configuredLabel: process.env.DEMO_LABEL",
      '    }',
      '  }))',
      '})'
    ].join('\n')
  })

  fs.writeFileSync(
    path.join(skillDir, '.env'),
    ['DEMO_API_KEY=loaded-from-skill', 'DEMO_LABEL="hello world" # comment'].join('\n'),
    'utf8'
  )
  fs.writeFileSync(path.join(skillDir, '.env.local'), 'LOCAL_ONLY_SECRET=hidden\n', 'utf8')
  fs.writeFileSync(path.join(skillDir, '.env.example'), 'DEMO_API_KEY=replace-me\n', 'utf8')

  const imported = globalConfig.importSkillDirectory(skillDir)
  process.env.AI_TOOLS_TEST_SECRET = 'must-not-leak'
  t.after(() => delete process.env.AI_TOOLS_TEST_SECRET)
  const result = await globalConfig.runSkillScript(
    imported._id,
    'scripts/run.js',
    {
      args: ['--target', 'demo'],
      input: 'hello from stdin',
      timeout_ms: 5000
    }
  )

  assert.equal(result.ok, true)
  assert.equal(result.sourceType, 'directory')
  assert.equal(result.path, 'scripts/run.js')
  assert.equal(result.outputType, 'json')
  assert.deepEqual(result.output.args, ['--target', 'demo'])
  assert.equal(result.output.input, 'hello from stdin')
  assert.equal(path.resolve(result.cwd), path.resolve(imported.sourcePath))
  assert.equal(result.output.cwd, path.resolve(imported.sourcePath).replace(/\\/g, '/'))
  assert.equal(result.output.env.skillId, imported._id)
  assert.equal(result.output.env.skillRoot, path.resolve(imported.sourcePath).replace(/\\/g, '/'))
  assert.equal(result.output.env.scriptPath, 'scripts/run.js')
  assert.equal(result.output.env.inheritedSecret, undefined)
  assert.equal(result.output.env.configuredValue, 'loaded-from-skill')
  assert.equal(result.output.env.configuredLabel, 'hello world')
  assert.equal(fs.existsSync(path.join(imported.sourcePath, '.env')), true)

  const listedFiles = globalConfig.listSkillFiles(imported._id)
  assert.equal(listedFiles.extra.includes('.env'), false)
  assert.equal(listedFiles.extra.includes('.env.local'), false)
  assert.equal(listedFiles.extra.includes('.env.example'), true)
  assert.throws(
    () => globalConfig.readSkillFile(imported._id, '.env'),
    /skill environment files cannot be read/
  )
  assert.equal(
    globalConfig.readSkillFile(imported._id, '.env.example').content,
    'DEMO_API_KEY=replace-me\n'
  )
})

test('runSkillScript rejects reserved variables from imported skill .env', async (t) => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const { skillDir } = createSkillFixture(t, {
    folderName: 'reserved-env-skill',
    skillName: 'Reserved Env Skill',
    descriptionLines: ['Reserved environment variables'],
    scriptName: 'run.js',
    scriptContent: "process.stdout.write('ok')"
  })

  fs.writeFileSync(path.join(skillDir, '.env'), 'AI_TOOLS_SKILL_ROOT=unsafe\n', 'utf8')
  const imported = globalConfig.importSkillDirectory(skillDir)

  await assert.rejects(
    globalConfig.runSkillScript(imported._id, 'scripts/run.js', { timeout_ms: 5000 }),
    /cannot override reserved environment variable: AI_TOOLS_SKILL_ROOT/
  )

  fs.writeFileSync(path.join(imported.sourcePath, '.env'), 'NODE_OPTIONS=--trace-warnings\n', 'utf8')
  await assert.rejects(
    globalConfig.runSkillScript(imported._id, 'scripts/run.js', { timeout_ms: 5000 }),
    /cannot override reserved environment variable: NODE_OPTIONS/
  )
})

test('directory skill caches script manifest metadata and supports auto-selecting the only runnable script', async (t) => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const { skillDir } = createSkillFixture(t, {
    folderName: 'manifest-skill',
    skillName: 'Manifest Skill',
    descriptionLines: ['Manifest based skill'],
    scripts: [
      {
        name: 'emit.js',
        content: [
          'const chunks = []',
          "process.stdin.on('data', (chunk) => chunks.push(chunk))",
          "process.stdin.on('end', () => {",
          "  process.stdout.write(JSON.stringify({ text: Buffer.concat(chunks).toString('utf8') }))",
          '})'
        ].join('\n')
      }
    ],
    scriptManifest: {
      scripts: [
        {
          path: 'scripts/emit.js',
          name: 'emit',
          description: 'Emit stdin as JSON.',
          when_to_use: 'Use when the user asks to transform stdin into structured JSON.',
          args_help: 'No args required.',
          input: 'Plain text from stdin.',
          output: 'json'
        }
      ]
    }
  })

  const imported = globalConfig.importSkillDirectory(skillDir)
  assert.equal(imported.cache.scriptManifestPath, 'scripts/manifest.json')
  assert.equal(imported.cache.scriptCatalog.length, 1)
  assert.equal(imported.cache.scriptCatalog[0].path, 'scripts/emit.js')
  assert.equal(imported.cache.scriptCatalog[0].description, 'Emit stdin as JSON.')
  assert.equal(imported.cache.scriptCatalog[0].whenToUse, 'Use when the user asks to transform stdin into structured JSON.')
  assert.equal(imported.cache.scriptCatalog[0].outputType, 'json')

  const result = await globalConfig.runSkillScript(imported._id, '', {
    input: 'hello manifest',
    timeout_ms: 5000
  })

  assert.equal(result.ok, true)
  assert.equal(result.path, 'scripts/emit.js')
  assert.equal(result.outputType, 'json')
  assert.deepEqual(result.output, { text: 'hello manifest' })
  assert.equal(result.scriptMeta.path, 'scripts/emit.js')
  assert.equal(result.scriptMeta.outputType, 'json')
})

test('directory skill infers Python entry scripts and header metadata without manifest', async (t) => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const { skillDir } = createSkillFixture(t, {
    folderName: 'python-skill',
    skillName: 'Python Skill',
    descriptionLines: ['Python skill'],
    scripts: [
      {
        name: 'run.py',
        content: [
          '"""',
          'Run the main Python workflow for this skill.',
          'Usage: python run.py --target demo',
          'Input: reads plain text from stdin.',
          '"""',
          'import argparse',
          'import json',
          '',
          'def main():',
          "    parser = argparse.ArgumentParser(description='Main entrypoint')",
          "    parser.add_argument('--target', help='Target name')",
          '    parser.parse_args()',
          "    print(json.dumps({'ok': True}))",
          '',
          "if __name__ == '__main__':",
          '    main()'
        ].join('\n')
      },
      {
        name: 'helpers/util.py',
        content: [
          'def helper():',
          "    return 'helper'"
        ].join('\n')
      }
    ]
  })

  const imported = globalConfig.importSkillDirectory(skillDir)

  assert.equal(imported.cache.scriptManifestPath, null)
  assert.equal(imported.cache.scriptCatalog.length, 2)
  assert.equal(imported.cache.scriptCatalog[0].path, 'scripts/run.py')
  assert.equal(imported.cache.scriptCatalog[0].runtime, 'py')
  assert.equal(imported.cache.scriptCatalog[0].isLikelyEntrypoint, true)
  assert.match(imported.cache.scriptCatalog[0].description, /main Python workflow/i)
  assert.match(imported.cache.scriptCatalog[0].argsHelp, /--target/)
  assert.match(imported.cache.scriptCatalog[0].inputHelp, /stdin/i)
  assert.equal(imported.cache.scriptCatalog[0].outputType, 'json')
  assert.equal(imported.cache.scriptCatalog[0].outputTypeDeclared, false)
  assert.equal(imported.cache.scriptCatalog[1].path, 'scripts/helpers/util.py')
})

test('runSkillScript rejects invalid JSON stdout when manifest requires json output', async (t) => {
  resetConfigStorage()
  globalConfig.ensureBuiltins()

  const { skillDir } = createSkillFixture(t, {
    folderName: 'invalid-json-skill',
    skillName: 'Invalid JSON Skill',
    descriptionLines: ['Invalid JSON output'],
    scripts: [
      {
        name: 'bad.js',
        content: "process.stdout.write('not-json')"
      }
    ],
    scriptManifest: {
      scripts: [
        {
          path: 'scripts/bad.js',
          description: 'Deliberately emits invalid JSON.',
          output: 'json'
        }
      ]
    }
  })

  const imported = globalConfig.importSkillDirectory(skillDir)

  await assert.rejects(
    () => globalConfig.runSkillScript(imported._id, 'scripts/bad.js', { timeout_ms: 5000 }),
    (err) => String(err?.message || err).includes('must output valid JSON stdout')
  )
})

test('builtin uTools provider is injected first and protected', () => {
  resetConfigStorage()

  const cfg = globalConfig.ensureBuiltins()
  const provider = cfg.providers.builtin_provider_utools_ai

  assert.ok(provider)
  assert.equal(provider.providerType, 'utools-ai')
  assert.equal(Object.keys(cfg.providers)[0], 'builtin_provider_utools_ai')
  assert.equal(cfg.chatConfig.defaultProviderId, 'builtin_provider_utools_ai')

  assert.throws(
    () => globalConfig.updateProvider('builtin_provider_utools_ai', { name: 'patched' }),
    (err) => String(err?.message || err).includes('Provider')
  )
  assert.throws(
    () => globalConfig.deleteProvider('builtin_provider_utools_ai'),
    (err) => String(err?.message || err).includes('Provider')
  )
})

test('chatConfig contextWindow defaults and updates are normalized', () => {
  resetConfigStorage()

  const cfg = globalConfig.ensureBuiltins()
  assert.deepEqual(cfg.chatConfig.contextWindow, {
    preset: 'balanced',
    historyFocus: 'balanced',
    maxTurns: 48,
    keepRecentTurnsFull: 16,
    maxMessages: 320,
    maxTokensExpanded: 100000,
    maxTokensCompact: 80000,
    maxCharsExpanded: 400000,
    maxCharsCompact: 320000,
    autoCompactTriggerPercent: 80
  })

  const updated = globalConfig.updateChatConfig({
    contextWindow: {
      preset: 'custom',
      maxTurns: 1,
      keepRecentTurnsFull: 99,
      maxMessages: 999,
      maxTokensExpanded: 500,
      maxTokensCompact: 999999,
      maxCharsExpanded: 2000,
      maxCharsCompact: 999999
    }
  })

  assert.deepEqual(updated.contextWindow, {
    preset: 'custom',
    historyFocus: 'balanced',
    maxTurns: 2,
    keepRecentTurnsFull: 2,
    maxMessages: 999,
    maxTokensExpanded: 1000,
    maxTokensCompact: 1000,
    maxCharsExpanded: 4000,
    maxCharsCompact: 4000,
    autoCompactTriggerPercent: 80
  })

  const merged = globalConfig.updateChatConfig({
    contextWindow: {
      preset: 'aggressive'
    }
  })

  assert.deepEqual(merged.contextWindow, {
    preset: 'aggressive',
    historyFocus: 'balanced',
    maxTurns: 18,
    keepRecentTurnsFull: 6,
    maxMessages: 120,
    maxTokensExpanded: 32000,
    maxTokensCompact: 24000,
    maxCharsExpanded: 128000,
    maxCharsCompact: 96000,
    autoCompactTriggerPercent: 75
  })
})

test('chatConfig memory storeMaxItems persists through config updates', () => {
  resetConfigStorage()

  globalConfig.ensureBuiltins()

  const updated = globalConfig.updateChatConfig({
    memory: {
      storeMaxItems: 320
    }
  })

  assert.equal(updated.memory.storeMaxItems, 320)
  assert.equal(globalConfig.getConfig().chatConfig.memory.storeMaxItems, 320)
  assert.equal(storage.get('global-config')?.chatConfig?.memory?.storeMaxItems, 320)
})

test('legacy cloud flags are normalized to auto sync and memory autoExtract persists', () => {
  resetConfigStorage()

  storage.set('global-config', {
    cloudConfig: {
      region: 'test-region',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucket: 'test-bucket',
      autoBackupEnabled: true,
      autoRestoreEnabled: false
    },
    chatConfig: {
      memory: {
        enabled: true,
        autoExtract: false
      }
    }
  })

  const cfg = globalConfig.getConfig()

  assert.equal(cfg.cloudConfig.autoSyncEnabled, true)
  assert.equal('autoBackupEnabled' in cfg.cloudConfig, false)
  assert.equal('autoRestoreEnabled' in cfg.cloudConfig, false)
  assert.equal(cfg.chatConfig.memory.enabled, true)
  assert.equal(cfg.chatConfig.memory.autoExtract, false)
  assert.equal(storage.get('global-config')?.cloudConfig?.autoSyncEnabled, true)
  assert.equal(storage.get('global-config')?.chatConfig?.memory?.autoExtract, false)
})

test('noteConfig noteEditor defaults and updates are normalized', () => {
  resetConfigStorage()

  const cfg = globalConfig.ensureBuiltins()
  assert.deepEqual(cfg.noteConfig.noteEditor, {
    diagramTemplates: {
      mermaid: {
        favorites: [],
        recent: [],
        custom: []
      },
      echarts: {
        favorites: [],
        recent: [],
        custom: []
      }
    }
  })

  const updated = globalConfig.updateNoteConfig({
    noteEditor: {
      diagramTemplates: {
        echarts: {
          favorites: ['template:a', 'template:a', ''],
          recent: ['t1', 't2', 't3', 't4', 't5', 't6'],
          custom: [
            {
              label: 'Team Bar',
              syntax: 'team-bar',
              group: 'Team',
              keywords: ['sales', 'sales', 'weekly'],
              template: '{ title: { text: "Sales" } }'
            }
          ]
        }
      }
    }
  })

  assert.deepEqual(updated.noteEditor.diagramTemplates.mermaid, {
    favorites: [],
    recent: [],
    custom: []
  })
  assert.deepEqual(updated.noteEditor.diagramTemplates.echarts.favorites, ['template:a'])
  assert.deepEqual(updated.noteEditor.diagramTemplates.echarts.recent, ['t1', 't2', 't3', 't4', 't5'])
  assert.equal(updated.noteEditor.diagramTemplates.echarts.custom.length, 1)
  assert.deepEqual(updated.noteEditor.diagramTemplates.echarts.custom[0].keywords, ['sales', 'weekly'])
  assert.equal(updated.noteEditor.diagramTemplates.echarts.custom[0].group, 'Team')
})

test('noteConfig noteEditor preserves new noteTemplates roots across updates', () => {
  resetConfigStorage()

  const created = globalConfig.updateNoteConfig({
    noteEditor: {
      noteTemplates: {
        customRoots: [
          {
            id: 'custom-root:workspace',
            label: '工作台',
            description: '显示在笔记编辑器顶部工具栏中的自定义栏目'
          }
        ],
        customCategories: [
          {
            id: 'custom-category:flow',
            rootId: 'custom-root:workspace',
            label: '流程'
          }
        ],
        customTemplates: [
          {
            id: 'custom-template:flow',
            rootId: 'custom-root:workspace',
            categoryId: 'custom-category:flow',
            kind: 'mermaid',
            label: '流程图',
            template: 'graph TD\\nA[开始] --> B[结束]'
          }
        ]
      }
    }
  })

  assert.equal(created.noteEditor.noteTemplates.customRoots.length, 1)
  assert.equal(created.noteEditor.noteTemplates.customRoots[0].label, '工作台')
  assert.equal(created.noteEditor.noteTemplates.customCategories[0].rootId, 'custom-root:workspace')
  assert.equal(created.noteEditor.noteTemplates.customTemplates[0].categoryId, 'custom-category:flow')

  const updated = globalConfig.updateNoteConfig({
    noteEditor: {
      diagramTemplates: {
        echarts: {
          favorites: ['chart:bar']
        }
      }
    }
  })

  assert.equal(updated.noteEditor.diagramTemplates.echarts.favorites[0], 'chart:bar')
  assert.equal(updated.noteEditor.noteTemplates.customRoots.length, 1)
  assert.equal(updated.noteEditor.noteTemplates.customRoots[0].id, 'custom-root:workspace')
  assert.equal(updated.noteEditor.noteTemplates.customTemplates[0].label, '流程图')
})

test('notebook runtime config is stored locally instead of synced global config', (t) => {
  resetConfigStorage()

  const runtime = {
    pythonPath: 'D:/Application/python/python.exe',
    venvRoot: 'D:/Application/ai-tools-venvs',
    noteEnvBindings: {
      'e:/project/notes/demo.ipynb': 'ml-env'
    },
    kernelName: 'python3',
    startupTimeoutMs: 24000,
    executeTimeoutMs: 180000
  }

  const updated = globalConfig.updateNoteConfig({
    notebookRuntime: runtime
  })

  assert.equal(updated.notebookRuntime.pythonPath, runtime.pythonPath)
  assert.equal(updated.notebookRuntime.venvRoot, runtime.venvRoot)
  assert.equal(updated.notebookRuntime.kernelName, runtime.kernelName)

  const localConfigPath = getLocalNotebookRuntimeConfigPath()
  assert.ok(fs.existsSync(localConfigPath))
  assert.deepEqual(
    JSON.parse(fs.readFileSync(localConfigPath, 'utf8')),
    runtime
  )

  const rawStored = storage.get('global-config')
  assert.ok(rawStored)
  assert.equal(rawStored.noteConfig?.notebookRuntime, undefined)

  const exportRoot = fs.mkdtempSync(path.join(process.cwd(), '.tmp-config-export-'))
  t.after(() => fs.rmSync(exportRoot, { recursive: true, force: true }))
  const exportPath = path.join(exportRoot, 'config.json')
  globalConfig.exportToFile(exportPath)

  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'))
  assert.equal(exported.noteConfig?.notebookRuntime, undefined)
})

test('web search proxy stays local while API config is synced', (t) => {
  resetConfigStorage()

  const updated = globalConfig.updateWebSearchConfig({
    proxyUrl: 'http://127.0.0.1:7890',
    allowInsecureTlsFallback: false,
    searchApiProvider: 'bocha_search',
    searchApiKey: 'secret-key',
    searchApiEndpoint: 'https://api.bochaai.com/v1/web-search',
    searchApiMarket: 'zh-CN'
  })

  assert.deepEqual(updated, {
    proxyUrl: 'http://127.0.0.1:7890',
    allowInsecureTlsFallback: false,
    searchApiProvider: 'bocha_search',
    searchApiKey: 'secret-key',
    searchApiEndpoint: 'https://api.bochaai.com/v1/web-search',
    searchApiMarket: 'zh-CN'
  })
  assert.equal(globalConfig.getConfig().webSearchConfig.proxyUrl, 'http://127.0.0.1:7890')
  assert.equal(globalConfig.getConfig().webSearchConfig.allowInsecureTlsFallback, false)
  assert.equal(globalConfig.getConfig().webSearchConfig.searchApiProvider, 'bocha_search')

  const localConfigPath = getLocalWebSearchConfigPath()
  assert.ok(fs.existsSync(localConfigPath))
  assert.deepEqual(
    JSON.parse(fs.readFileSync(localConfigPath, 'utf8')),
    {
      proxyUrl: 'http://127.0.0.1:7890',
      allowInsecureTlsFallback: false
    }
  )

  const rawStored = storage.get('global-config')
  assert.deepEqual(rawStored?.webSearchConfig, {
    searchApiProvider: 'bocha_search',
    searchApiKey: 'secret-key',
    searchApiEndpoint: 'https://api.bochaai.com/v1/web-search',
    searchApiMarket: 'zh-CN'
  })

  const exportRoot = fs.mkdtempSync(path.join(process.cwd(), '.tmp-config-export-'))
  t.after(() => fs.rmSync(exportRoot, { recursive: true, force: true }))
  const exportPath = path.join(exportRoot, 'config.json')
  globalConfig.exportToFile(exportPath)

  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'))
  assert.deepEqual(exported.webSearchConfig, {
    searchApiProvider: 'bocha_search',
    searchApiKey: 'secret-key',
    searchApiEndpoint: 'https://api.bochaai.com/v1/web-search',
    searchApiMarket: 'zh-CN'
  })

  const cleared = globalConfig.updateWebSearchConfig({
    searchApiProvider: 'none'
  })
  assert.equal(cleared.searchApiKey, '')
  assert.equal(cleared.searchApiEndpoint, '')
  assert.equal(storage.get('global-config')?.webSearchConfig, undefined)
})

test('notebook runtime execute timeout supports 0 as unlimited', () => {
  resetConfigStorage()

  const updated = globalConfig.updateNoteConfig({
    notebookRuntime: {
      executeTimeoutMs: 0
    }
  })

  assert.equal(updated.notebookRuntime.executeTimeoutMs, 0)

  const localConfigPath = getLocalNotebookRuntimeConfigPath()
  assert.ok(fs.existsSync(localConfigPath))
  const saved = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'))
  assert.equal(saved.executeTimeoutMs, 0)
  assert.equal(saved.venvRoot, '')
  assert.deepEqual(saved.noteEnvBindings, {})
})

test('notebook runtime startup timeout supports 0 as unlimited', () => {
  resetConfigStorage()

  const updated = globalConfig.updateNoteConfig({
    notebookRuntime: {
      startupTimeoutMs: 0
    }
  })

  assert.equal(updated.notebookRuntime.startupTimeoutMs, 0)

  const localConfigPath = getLocalNotebookRuntimeConfigPath()
  assert.ok(fs.existsSync(localConfigPath))
  const saved = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'))
  assert.equal(saved.startupTimeoutMs, 0)
  assert.equal(saved.venvRoot, '')
  assert.deepEqual(saved.noteEnvBindings, {})
})

test('legacy synced notebook runtime config is migrated to local storage', () => {
  resetConfigStorage()

  storage.set('global-config', {
    noteConfig: {
      notebookRuntime: {
        pythonPath: 'E:/Portable/Python/python.exe',
        venvRoot: 'E:/Portable/AiToolsVenvs',
        kernelName: 'python-local',
        startupTimeoutMs: 20000,
        executeTimeoutMs: 150000
      }
    }
  })

  const cfg = globalConfig.getConfig()
  assert.equal(cfg.noteConfig.notebookRuntime.pythonPath, 'E:/Portable/Python/python.exe')
  assert.equal(cfg.noteConfig.notebookRuntime.venvRoot, 'E:/Portable/AiToolsVenvs')
  assert.equal(cfg.noteConfig.notebookRuntime.kernelName, 'python-local')

  const localConfigPath = getLocalNotebookRuntimeConfigPath()
  assert.ok(fs.existsSync(localConfigPath))

  const rawStored = storage.get('global-config')
  assert.ok(rawStored)
  assert.equal(rawStored.noteConfig?.notebookRuntime, undefined)
})

test('legacy synced notebook runtime remains visible when local migration temporarily fails', () => {
  resetConfigStorage()

  storage.set('global-config', {
    noteConfig: {
      notebookRuntime: {
        pythonPath: 'C:/Legacy/python.exe',
        venvRoot: 'C:/Legacy/AiToolsVenvs',
        kernelName: 'legacy-kernel',
        startupTimeoutMs: 31000,
        executeTimeoutMs: 210000
      }
    }
  })

  const originalWriteLocalRuntime = globalConfig._writeLocalNotebookRuntimeConfig
  const originalConsoleWarn = console.warn
  globalConfig._writeLocalNotebookRuntimeConfig = () => {
    throw new Error('disk unavailable')
  }
  console.warn = () => {}

  try {
    const cfg = globalConfig.getConfig()
    assert.equal(cfg.noteConfig.notebookRuntime.pythonPath, 'C:/Legacy/python.exe')
    assert.equal(cfg.noteConfig.notebookRuntime.venvRoot, 'C:/Legacy/AiToolsVenvs')
    assert.equal(cfg.noteConfig.notebookRuntime.kernelName, 'legacy-kernel')

    const rawStored = storage.get('global-config')
    assert.ok(rawStored?.noteConfig?.notebookRuntime)
  } finally {
    globalConfig._writeLocalNotebookRuntimeConfig = originalWriteLocalRuntime
    console.warn = originalConsoleWarn
  }
})

test('legacy synced notebook runtime remains visible when unreadable local config cannot be repaired', () => {
  resetConfigStorage()

  const localConfigPath = getLocalNotebookRuntimeConfigPath()
  fs.mkdirSync(path.dirname(localConfigPath), { recursive: true })
  fs.writeFileSync(localConfigPath, '{invalid json', 'utf8')

  storage.set('global-config', {
    noteConfig: {
      notebookRuntime: {
        pythonPath: 'D:/Legacy/python.exe',
        venvRoot: 'D:/Legacy/AiToolsVenvs',
        kernelName: 'legacy-broken-local',
        startupTimeoutMs: 41000,
        executeTimeoutMs: 260000
      }
    }
  })

  const originalWriteLocalRuntime = globalConfig._writeLocalNotebookRuntimeConfig
  const originalConsoleWarn = console.warn
  let writeAttempts = 0
  globalConfig._writeLocalNotebookRuntimeConfig = () => {
    writeAttempts += 1
    throw new Error('disk unavailable')
  }
  console.warn = () => {}

  try {
    const cfg = globalConfig.getConfig()
    assert.equal(writeAttempts, 1)
    assert.equal(cfg.noteConfig.notebookRuntime.pythonPath, 'D:/Legacy/python.exe')
    assert.equal(cfg.noteConfig.notebookRuntime.venvRoot, 'D:/Legacy/AiToolsVenvs')
    assert.equal(cfg.noteConfig.notebookRuntime.kernelName, 'legacy-broken-local')

    const rawStored = storage.get('global-config')
    assert.ok(rawStored?.noteConfig?.notebookRuntime)
  } finally {
    globalConfig._writeLocalNotebookRuntimeConfig = originalWriteLocalRuntime
    console.warn = originalConsoleWarn
  }
})

test('legacy synced notebook runtime migrates when readable local config is still empty defaults', () => {
  resetConfigStorage()

  const localConfigPath = getLocalNotebookRuntimeConfigPath()
  fs.mkdirSync(path.dirname(localConfigPath), { recursive: true })
  fs.writeFileSync(localConfigPath, '{}', 'utf8')

  storage.set('global-config', {
    noteConfig: {
      notebookRuntime: {
        pythonPath: 'E:/Legacy/python.exe',
        venvRoot: 'E:/Legacy/AiToolsVenvs',
        kernelName: 'legacy-default-local',
        startupTimeoutMs: 28000,
        executeTimeoutMs: 180000
      }
    }
  })

  const cfg = globalConfig.getConfig()
  assert.equal(cfg.noteConfig.notebookRuntime.pythonPath, 'E:/Legacy/python.exe')
  assert.equal(cfg.noteConfig.notebookRuntime.venvRoot, 'E:/Legacy/AiToolsVenvs')
  assert.equal(cfg.noteConfig.notebookRuntime.kernelName, 'legacy-default-local')

  const savedLocal = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'))
  assert.equal(savedLocal.pythonPath, 'E:/Legacy/python.exe')
  assert.equal(savedLocal.venvRoot, 'E:/Legacy/AiToolsVenvs')
  assert.equal(savedLocal.kernelName, 'legacy-default-local')

  const rawStored = storage.get('global-config')
  assert.equal(rawStored?.noteConfig?.notebookRuntime, undefined)
})

test('legacy chatConfig note fields are migrated to root noteConfig and configSecurity', () => {
  resetConfigStorage()

  storage.set('global-config', {
    theme: 'light',
    chatConfig: {
      defaultProviderId: 'legacy-provider',
      defaultModel: 'legacy-model',
      defaultSystemPrompt: 'legacy prompt',
      contextWindow: {
        preset: 'balanced'
      },
      noteEditor: {
        diagramTemplates: {
          mermaid: {
            favorites: ['mermaid:flowchart']
          }
        }
      },
      noteSecurity: {
        globalFallbackVerifier: {
          iterations: 1000,
          salt: 'legacy-salt',
          hash: 'legacy-hash'
        },
        protectedNotes: {
          'note/demo.md': {
            verifier: {
              iterations: 1000,
              salt: 'note-salt',
              hash: 'note-hash'
            },
            updatedAt: '2026-04-05T00:00:00.000Z',
            hasFallbackRecovery: true
          }
        }
      },
      configSecurity: {
        passwordVerifier: {
          iterations: 1000,
          salt: 'config-salt',
          hash: 'config-hash'
        },
        recoveryQuestion: 'Question?',
        recoveryAnswerVerifier: {
          iterations: 1000,
          salt: 'answer-salt',
          hash: 'answer-hash'
        },
        passwordRecoveryEnvelope: 'encrypted-box'
      }
    }
  })

  const cfg = globalConfig.getConfig()

  assert.ok(!Object.prototype.hasOwnProperty.call(cfg.chatConfig, 'noteEditor'))
  assert.ok(!Object.prototype.hasOwnProperty.call(cfg.chatConfig, 'noteSecurity'))
  assert.ok(!Object.prototype.hasOwnProperty.call(cfg.chatConfig, 'configSecurity'))
  assert.deepEqual(cfg.noteConfig.noteEditor.diagramTemplates.mermaid.favorites, ['mermaid:flowchart'])
  assert.ok(cfg.noteConfig.noteSecurity.protectedNotes['note/demo.md'])
  assert.equal(cfg.configSecurity.passwordVerifier.salt, 'config-salt')
  assert.equal(cfg.noteConfig.noteSecurity.globalFallbackVerifier.salt, 'config-salt')
  assert.equal(cfg.configSecurity.recoveryQuestion, 'Question?')
})



