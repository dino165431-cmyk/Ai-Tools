const fs = require('fs')
const path = require('path')

const BUILTIN_SKILL_IDS = Object.freeze({
  notes: 'builtin_skill_notes',
  config: 'builtin_skill_config',
  sessions: 'builtin_skill_sessions',
  agents: 'builtin_skill_agent_orchestration',
  shell: 'builtin_skill_shell'
})

const DEFINITIONS = Object.freeze([
  Object.freeze({
    id: BUILTIN_SKILL_IDS.notes,
    directory: 'manage-notes',
    name: '超级笔记管理与执行（内置）',
    triggers: Object.freeze({
      keywords: Object.freeze(['笔记', '超级笔记', 'Notebook', 'ipynb', '记笔记', '记录', '查阅', '执行笔记', '运行 Cell', 'note'])
    }),
    actionNames: Object.freeze([
      'notes_list_directory',
      'notes_list_recent',
      'notes_search',
      'notes_list_tree',
      'notes_read',
      'notes_create',
      'notes_write',
      'notes_move',
      'notes_delete',
      'notebook_read',
      'notebook_create',
      'notebook_update_cell',
      'notebook_delete_cell',
      'notebook_execute_cell',
      'notebook_execute_all'
    ])
  }),
  Object.freeze({
    id: BUILTIN_SKILL_IDS.config,
    directory: 'manage-ai-tools-config',
    name: 'Ai Tools 配置管理（内置）',
    triggers: Object.freeze({
      keywords: Object.freeze(['配置', '设置', 'MCP', '技能', '提示词', '智能体', '服务商', 'provider', 'agent', 'skill', 'prompt', '定时任务', '模型', 'apikey', 'baseurl'])
    }),
    actionNames: Object.freeze([
      'config_list_mcp_servers',
      'config_add_mcp_server',
      'config_update_mcp_server',
      'config_delete_mcp_server',
      'config_list_skills',
      'config_add_skill',
      'config_import_skill_directory',
      'config_import_skill_file',
      'config_update_skill',
      'config_delete_skill',
      'config_list_prompts',
      'config_add_prompt',
      'config_update_prompt',
      'config_delete_prompt',
      'config_list_agents',
      'config_add_agent',
      'config_update_agent',
      'config_delete_agent',
      'config_list_providers',
      'config_add_provider',
      'config_update_provider',
      'config_delete_provider',
      'config_list_timed_tasks',
      'config_add_timed_task',
      'config_update_timed_task',
      'config_delete_timed_task',
      'config_get_system_time'
    ])
  }),
  Object.freeze({
    id: BUILTIN_SKILL_IDS.sessions,
    directory: 'inspect-session-history',
    name: '会话历史与任务日志（内置）',
    triggers: Object.freeze({
      keywords: Object.freeze(['历史会话', '会话历史', '会话记录', '读取会话', '定时任务日志', '任务执行日志', '最近失败', 'cron'])
    }),
    actionNames: Object.freeze([
      'sessions_list_directory',
      'sessions_list_recent',
      'sessions_search',
      'sessions_list_tree',
      'sessions_read',
      'sessions_read_many'
    ])
  }),
  Object.freeze({
    id: BUILTIN_SKILL_IDS.agents,
    directory: 'orchestrate-agents',
    name: '任务拆解与智能体编排（内置）',
    triggers: Object.freeze({
      keywords: Object.freeze(['复杂任务', '多步骤', '拆解', '编排', '委派', '子智能体', '多阶段', '分工', '并行', '协作']),
      intents: Object.freeze(['implement', 'analyze', 'refactor', 'research'])
    }),
    actionNames: Object.freeze(['agents_list', 'agent_run'])
  }),
  Object.freeze({
    id: BUILTIN_SKILL_IDS.shell,
    directory: 'run-data-shell',
    name: '沙盒命令工作区（内置）',
    triggers: Object.freeze({
      keywords: Object.freeze(['bash', 'shell', '命令行', '终端', '执行命令', '运行脚本', '沙盒', '修改文件'])
    }),
    actionNames: Object.freeze(['sandbox_run', 'bash_run', 'sandbox_import', 'sandbox_list', 'sandbox_reset'])
  })
])

const definitionById = new Map(DEFINITIONS.map((definition) => [definition.id, definition]))
const runtimeById = new Map()

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function cleanYamlScalar(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    try {
      return text.startsWith('"')
        ? JSON.parse(text)
        : text.slice(1, -1).replace(/''/g, "'")
    } catch {
      return text.slice(1, -1)
    }
  }
  return text
}

function readSkillDocument(directory) {
  const skillRoot = path.join(__dirname, directory)
  const skillFile = path.join(skillRoot, 'SKILL.md')
  const raw = fs.readFileSync(skillFile, 'utf-8').replace(/^\uFEFF/, '')
  const normalized = raw.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/)
  if (!match) throw new Error(`Invalid built-in SKILL.md: ${skillFile}`)

  const metadata = {}
  match[1].split('\n').forEach((line) => {
    const field = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!field) return
    metadata[field[1]] = cleanYamlScalar(field[2])
  })

  return {
    skillRoot,
    skillFile,
    metadata,
    content: String(match[2] || '').trim()
  }
}

function parseOpenAiYaml(skillRoot) {
  const yamlPath = path.join(skillRoot, 'agents', 'openai.yaml')
  if (!fs.existsSync(yamlPath)) return {}
  const raw = fs.readFileSync(yamlPath, 'utf-8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const result = {}
  let section = ''
  raw.split('\n').forEach((line) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return
    const top = line.match(/^([A-Za-z0-9_-]+)\s*:\s*$/)
    if (top) {
      section = top[1]
      if (!result[section]) result[section] = {}
      return
    }
    const field = line.match(/^\s{2}([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!field || !section) return
    result[section][field[1]] = cleanYamlScalar(field[2])
  })
  return result
}

function collectVisibleSkillFiles(skillRoot) {
  const details = []
  const visit = (absoluteDirectory, relativeDirectory = '') => {
    fs.readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        if (entry.name.startsWith('.')) return
        const relativePath = [relativeDirectory, entry.name].filter(Boolean).join('/').replace(/\\/g, '/')
        const absolutePath = path.join(absoluteDirectory, entry.name)
        if (entry.isDirectory()) {
          if (['agents', 'assets', 'references', 'scripts'].includes(relativePath.split('/')[0])) {
            visit(absolutePath, relativePath)
          }
          return
        }
        if (!entry.isFile() || relativePath === 'runtime.js') return
        if (
          relativePath !== 'SKILL.md' &&
          !/^(agents|assets|references|scripts)\//.test(relativePath)
        ) return
        const stat = fs.statSync(absolutePath)
        details.push({
          path: relativePath,
          category: relativePath === 'SKILL.md' ? 'skill' : relativePath.split('/')[0],
          size: Number(stat.size) || 0,
          mtimeMs: Number(stat.mtimeMs) || 0
        })
      })
  }
  visit(skillRoot)
  return details
}

function buildFileIndex(fileDetails) {
  const groups = {
    skill: 'SKILL.md',
    references: [],
    scripts: [],
    assets: [],
    agents: [],
    extra: []
  }
  ;(Array.isArray(fileDetails) ? fileDetails : []).forEach((file) => {
    if (file.path === 'SKILL.md') return
    if (Array.isArray(groups[file.category])) groups[file.category].push(file.path)
    else groups.extra.push(file.path)
  })
  return groups
}

function buildBuiltinSkillRecord(definition) {
  const document = readSkillDocument(definition.directory)
  const fileDetails = collectVisibleSkillFiles(document.skillRoot)
  const openai = parseOpenAiYaml(document.skillRoot)
  const interfaceConfig = openai.interface && typeof openai.interface === 'object' ? openai.interface : {}
  const policy = openai.policy && typeof openai.policy === 'object' ? openai.policy : {}
  const refreshedAt = new Date(Math.max(...fileDetails.map((file) => file.mtimeMs), 0)).toISOString()

  return {
    _id: definition.id,
    name: String(interfaceConfig.display_name || definition.name).trim(),
    description: String(document.metadata.description || '').trim(),
    content: document.content,
    sourceType: 'builtin-directory',
    sourcePath: document.skillRoot,
    entryFile: 'SKILL.md',
    cache: {
      summary: String(document.metadata.description || '').trim(),
      fileIndex: buildFileIndex(fileDetails),
      fileDetails,
      scriptCatalog: [],
      refreshedAt
    },
    interface: {
      displayName: String(interfaceConfig.display_name || definition.name).trim(),
      shortDescription: String(interfaceConfig.short_description || document.metadata.description || '').trim(),
      defaultPrompt: String(interfaceConfig.default_prompt || '').trim(),
      iconSmall: String(interfaceConfig.icon_small || '').trim(),
      iconLarge: String(interfaceConfig.icon_large || '').trim(),
      brandColor: String(interfaceConfig.brand_color || '').trim()
    },
    policy: {
      allowImplicitInvocation: String(policy.allow_implicit_invocation || 'true').toLowerCase() !== 'false'
    },
    triggers: cloneJson(definition.triggers),
    mcp: [],
    nativeActions: [...definition.actionNames],
    capabilities: {
      nativeActionCount: definition.actionNames.length,
      supportsReferences: fileDetails.some((file) => file.category === 'references'),
      supportsScripts: fileDetails.some((file) => file.category === 'scripts'),
      supportsAssets: fileDetails.some((file) => file.category === 'assets')
    },
    builtin: true
  }
}

function buildBuiltinSkillRecords() {
  return Object.fromEntries(DEFINITIONS.map((definition) => [
    definition.id,
    buildBuiltinSkillRecord(definition)
  ]))
}

function loadRuntime(skillId) {
  const id = String(skillId || '').trim()
  const definition = definitionById.get(id)
  if (!definition) throw new Error(`Unknown built-in skill: ${id || '(empty)'}`)
  if (runtimeById.has(id)) return runtimeById.get(id)

  const createRuntime = require(path.join(__dirname, definition.directory, 'runtime.js'))
  if (typeof createRuntime !== 'function') {
    throw new Error(`Built-in skill runtime is invalid: ${id}`)
  }
  const runtime = createRuntime({ _id: id })
  runtimeById.set(id, runtime)
  return runtime
}

function normalizeActionSpec(skillId, action) {
  const source = action && typeof action === 'object' ? action : {}
  const name = String(source.name || '').trim()
  const readOnly =
    skillId === BUILTIN_SKILL_IDS.sessions ||
    name === 'agents_list' ||
    name === 'config_get_system_time' ||
    name.startsWith('config_list_') ||
    /^(notes_(list|read|search)|notebook_read)/.test(name)
  const isSandboxAction = skillId === BUILTIN_SKILL_IDS.shell
  const isShell = isSandboxAction && (name === 'sandbox_run' || name === 'bash_run')
  const isExecution =
    isShell ||
    name === 'agent_run' ||
    name === 'notebook_execute_cell' ||
    name === 'notebook_execute_all'

  return {
    ...source,
    annotations: {
      ...(source.annotations && typeof source.annotations === 'object' ? source.annotations : {}),
      readOnlyHint: readOnly,
      destructiveHint:
        source.annotations?.destructiveHint === true ||
        name.endsWith('_delete') ||
        name === 'sandbox_reset' ||
        name === 'notes_delete' ||
        name === 'notebook_delete_cell'
    },
    forceApproval: isSandboxAction || isExecution || !readOnly,
    approvalKind: isShell ? 'shell' : isExecution ? 'execution' : 'tool'
  }
}

async function listBuiltinSkillActions(skillId) {
  const id = String(skillId || '').trim()
  const runtime = loadRuntime(id)
  if (typeof runtime?.listActions !== 'function') {
    throw new Error(`Built-in skill does not expose actions: ${id}`)
  }
  const actions = await runtime.listActions()
  return (Array.isArray(actions) ? actions : [])
    .map((action) => normalizeActionSpec(id, action))
    .filter((action) => action.name)
}

async function runBuiltinSkillAction(skillId, actionName, args = {}) {
  const id = String(skillId || '').trim()
  const name = String(actionName || '').trim()
  if (!name) throw new Error('Built-in skill action name cannot be empty')

  const definition = definitionById.get(id)
  if (!definition?.actionNames.includes(name)) {
    throw new Error(`Action is not registered for built-in skill ${id}: ${name}`)
  }

  const runtime = loadRuntime(id)
  if (typeof runtime?.runAction !== 'function') {
    throw new Error(`Built-in skill runtime cannot execute actions: ${id}`)
  }
  return await runtime.runAction(name, args)
}

async function closeBuiltinSkillRuntimes() {
  const runtimes = Array.from(runtimeById.values())
  runtimeById.clear()
  await Promise.allSettled(runtimes.map((runtime) => Promise.resolve(runtime?.close?.())))
}

module.exports = {
  BUILTIN_SKILL_IDS,
  buildBuiltinSkillRecords,
  listBuiltinSkillActions,
  runBuiltinSkillAction,
  closeBuiltinSkillRuntimes,
  isBuiltinSkillId(id) {
    return definitionById.has(String(id || '').trim())
  }
}
