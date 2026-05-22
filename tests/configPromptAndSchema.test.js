import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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
const createBuiltinConfigMcpClient = require('../public/preload/builtins/config-mcp-client.js')
const createBuiltinAgentsMcpClient = require('../public/preload/builtins/agents-mcp-client.js')

function getLocalNotebookRuntimeConfigPath() {
  return path.join(globalThis.utools.getPath('userData'), '.ai-tools-local', 'notebook-runtime.json')
}

function getLocalWebSearchConfigPath() {
  return path.join(globalThis.utools.getPath('userData'), '.ai-tools-local', 'web-search.json')
}

function resetConfigStorage() {
  storage.delete('global-config')
  fs.rmSync(path.dirname(getLocalNotebookRuntimeConfigPath()), { recursive: true, force: true })
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
  const tempRoot = fs.mkdtempSync(path.join(process.cwd(), '.tmp-skill-'))
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))

  const skillDir = path.join(tempRoot, folderName)
  fs.mkdirSync(skillDir, { recursive: true })

  const frontmatter = [
    '---',
    `name: ${skillName}`,
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

test('builtin config skill includes strict config payload rules and import guidance', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const skill = cfg.skills.builtin_skill_config

  assert.ok(skill)
  assert.ok(skill.description.includes('payload'))
  assert.ok(skill.description.includes('SKILL.md'))
  assert.ok(skill.content.includes('config_import_skill_directory'))
  assert.ok(skill.content.includes('config_import_skill_file'))
  assert.ok(skill.content.includes('config_add_*'))
  assert.ok(skill.content.includes('config_update_*'))
  assert.ok(skill.content.includes('{ id, patch }'))
  assert.ok(skill.content.includes('builtin_config_mcp'))
  assert.ok(skill.content.includes('sourcePath'))
  assert.ok(skill.content.includes('transportType'))
  assert.ok(skill.content.includes('config_get_system_time'))
  assert.ok(skill.content.includes('***'))
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
})

test('builtin notes and sessions skills prefer lightweight discovery tools first', () => {
  resetConfigStorage()
  const cfg = globalConfig.getConfig()
  const noteSkill = cfg.skills.builtin_skill_notes
  const sessionsSkill = cfg.skills.builtin_skill_sessions

  assert.ok(noteSkill)
  assert.ok(noteSkill.description.includes('轻量'))
  assert.ok(noteSkill.content.includes('notes_list_directory'))
  assert.ok(noteSkill.content.includes('notes_list_recent'))
  assert.ok(noteSkill.content.includes('notes_search'))
  assert.ok(noteSkill.content.includes('才使用 `notes_list_tree`'))
  assert.ok(noteSkill.content.includes('如果用户已经给出了明确路径'))
  assert.ok(noteSkill.content.includes('不要先列目录'))
  assert.ok(noteSkill.content.includes('默认不要从 note 根目录做大深度遍历'))

  assert.ok(sessionsSkill)
  assert.ok(sessionsSkill.description.includes('轻量'))
  assert.ok(sessionsSkill.content.includes('sessions_list_directory'))
  assert.ok(sessionsSkill.content.includes('sessions_list_recent'))
  assert.ok(sessionsSkill.content.includes('sessions_search'))
  assert.ok(sessionsSkill.content.includes('才使用 `sessions_list_tree`'))
  assert.ok(sessionsSkill.content.includes('如果用户已经给出了明确路径'))
  assert.ok(sessionsSkill.content.includes('不要先列目录'))
  assert.ok(sessionsSkill.content.includes('批量分析时'))
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

test('config mcp tool schemas expose strict config-specific descriptions', async () => {
  const client = createBuiltinConfigMcpClient()
  const tools = await client.listTools()
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

  const addAgent = toolMap.get('config_add_agent')
  assert.ok(addAgent)
  assert.ok(addAgent.inputSchema.properties.prompt.description.includes('系统提示词'))
  assert.ok(addAgent.description.includes('prompt'))

  const addTask = toolMap.get('config_add_timed_task')
  assert.ok(addTask)
  assert.ok(addTask.description.includes('trigger'))
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

  const client = createBuiltinConfigMcpClient()
  const added = await client.callTool('config_add_prompt', {
    name: '变量提示词',
    type: 'user',
    content: '你好 {{name}}'
  })

  assert.equal(added.ok, true)

  const listed = await client.callTool('config_list_prompts', {})
  const item = listed.items.find((entry) => entry._id === added.id)
  assert.ok(item)
  assert.equal(item.type, 'user')

  await client.callTool('config_update_prompt', {
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

  const client = createBuiltinConfigMcpClient()
  const userPrompt = await client.callTool('config_add_prompt', {
    name: '用户模板',
    type: 'user',
    content: '你好 {{name}}'
  })
  const systemPrompt = await client.callTool('config_add_prompt', {
    name: '系统模板',
    type: 'system',
    content: '你是一个助手'
  })

  const added = await client.callTool('config_add_agent', {
    name: '测试智能体',
    prompt: userPrompt.id
  })
  assert.equal(added.ok, true)
  assert.equal(globalConfig.getAgent(added.id).prompt, null)

  await client.callTool('config_update_agent', {
    id: added.id,
    patch: { prompt: systemPrompt.id }
  })
  assert.equal(globalConfig.getAgent(added.id).prompt, systemPrompt.id)

  await client.callTool('config_update_agent', {
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

  const client = createBuiltinAgentsMcpClient()
  const listed = await client.callTool('agents_list', {})
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

  const client = createBuiltinConfigMcpClient()
  const imported = await client.callTool('config_import_skill_file', { path: skillFile })

  assert.equal(imported.ok, true)
  assert.equal(imported.item.sourceType, 'directory')
  assert.equal(path.resolve(imported.item.sourcePath), path.resolve(skillDir))
  assert.equal(imported.item.entryFile, 'SKILL.md')
  assert.equal(imported.item.description, '第一行描述\n第二行描述\n第三行描述')

  const listed = await client.callTool('config_list_skills', {})
  const item = listed.items.find((entry) => entry._id === imported.id)

  assert.ok(item)
  assert.equal(item.sourceType, 'directory')
  assert.equal(path.resolve(item.sourcePath), path.resolve(skillDir))
  assert.equal(item.entryFile, 'SKILL.md')
  assert.equal(item.description, '第一行描述\n第二行描述\n第三行描述')
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
      "      scriptPath: process.env.AI_TOOLS_SKILL_SCRIPT_PATH",
      '    }',
      '  }))',
      '})'
    ].join('\n')
  })

  const imported = globalConfig.importSkillDirectory(skillDir)
  const result = await globalConfig.runSkillScript(imported._id, 'scripts/run.js', {
    args: ['--target', 'demo'],
    input: 'hello from stdin',
    timeout_ms: 5000
  })

  assert.equal(result.ok, true)
  assert.equal(result.sourceType, 'directory')
  assert.equal(result.path, 'scripts/run.js')
  assert.equal(result.outputType, 'json')
  assert.deepEqual(result.output.args, ['--target', 'demo'])
  assert.equal(result.output.input, 'hello from stdin')
  assert.equal(path.resolve(result.cwd), path.resolve(skillDir))
  assert.equal(result.output.cwd, path.resolve(skillDir).replace(/\\/g, '/'))
  assert.equal(result.output.env.skillId, imported._id)
  assert.equal(result.output.env.skillRoot, path.resolve(skillDir).replace(/\\/g, '/'))
  assert.equal(result.output.env.scriptPath, 'scripts/run.js')
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



