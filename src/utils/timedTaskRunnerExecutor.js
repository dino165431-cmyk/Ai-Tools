import {
  getAgents,
  getProviders,
  getPrompts,
  getSkills,
  getMcpServers,
  getChatConfig,
  readSkillFile as readSkillRegistryFile
} from '@/utils/configListener'
import {
  buildRequestOverridesFromAgentModelParams,
  normalizeAgentModelParams
} from '@/utils/agentModelParams'
import { buildSkillFileIndexLines, getSkillDescription, isDirectorySkill } from '@/utils/skillUtils'
import {
  buildUtoolsAiMessages,
  canUseUtoolsAi,
  isUtoolsBuiltinProvider,
  refreshUtoolsAiModels,
  registerUtoolsAiToolFunctions
} from '@/utils/utoolsAiProvider'
import { extractAssistantTextFromPayload } from '@/utils/chatAssistantResponse'
import { stringifyToolResultForModel } from '@/utils/toolResultForModel'
import { createDirectory, exists, writeFile } from '@/utils/fileOperations'
import { getOrCreateMCPClient, releaseMCPClient, closePooledMCPClient } from '@/utils/mcpClient'

const SESSION_ROOT = 'session'
const TIMED_TASK_ROOT = `${SESSION_ROOT}/Timed Task`

const agentsRef = getAgents()
const providersRef = getProviders()
const promptsRef = getPrompts()
const skillsRef = getSkills()
const mcpServersRef = getMcpServers()
const chatConfigRef = getChatConfig()

function stableStringify(obj, spaces = 2) {
  try {
    return JSON.stringify(obj, null, spaces)
  } catch {
    return String(obj)
  }
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    return { ok: false, error: e }
  }
}

function newId() {
  return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`
}

function createDisplayMessage(role, content, extra = {}) {
  // TimedTask 会话用于“任务执行记录/日志分析”，默认按 Markdown 渲染更符合预期
  const defaultRender = role === 'thinking' ? 'text' : 'md'
  const base = { id: newId(), role, content: String(content || ''), time: Date.now(), render: defaultRender }
  if (role === 'tool' || role === 'tool_call') {
    base.toolExpanded = false
    base.toolMeta = ''
  }
  return { ...base, ...extra }
}

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''

  const noQuery = raw.split('#')[0].split('?')[0]
  let base = noQuery.replace(/\/+$/, '')

  base = base
    .replace(/\/v1\/chat\/completions$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/completions$/i, '/v1')
    .replace(/\/completions$/i, '')
    .replace(/\/v1\/models$/i, '/v1')
    .replace(/\/models$/i, '')

  return base.replace(/\/+$/, '')
}

function withTimeout(promise, timeoutMs, label) {
  const ms = Number(timeoutMs)
  if (!ms || ms <= 0) return promise

  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label || '操作'}超时（${ms}ms）`)), ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

function toText(val) {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return val.map(toText).join('')
  if (typeof val === 'object') {
    if (typeof val.text === 'string') return val.text
    if (typeof val.content === 'string') return val.content
    return stableStringify(val)
  }
  return String(val)
}

async function postChatCompletions({ baseUrl, apiKey, body, signal }) {
  const base = normalizeBaseUrl(baseUrl)
  const candidates = [`${base}/chat/completions`]
  if (!/\/v1$/.test(base)) candidates.push(`${base}/v1/chat/completions`)

  let resp = null
  let usedUrl = candidates[0]
  let lastNetworkError = null

  for (const url of candidates) {
    usedUrl = url
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal
      })

      if (resp.status === 404 && url !== candidates[candidates.length - 1]) continue
      break
    } catch (err) {
      lastNetworkError = err
      if (url !== candidates[candidates.length - 1]) continue
      throw err
    }
  }

  if (!resp) {
    throw lastNetworkError || new Error('请求失败：未获取到响应')
  }

  if (!resp.ok) {
    let detail = ''
    try {
      const errJson = await resp.json()
      detail = errJson?.error?.message || stableStringify(errJson)
    } catch {
      detail = await resp.text()
    }
    throw new Error(`请求失败（HTTP ${resp.status}）：${detail || resp.statusText}\nURL：${usedUrl}`)
  }

  return await resp.json()
}

function makeToolFunctionName(serverId, toolName) {
  const raw = `mcp__${serverId}__${toolName}`
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (safe.length <= 64) return safe
  let hash = 0
  for (let i = 0; i < safe.length; i++) hash = (hash * 31 + safe.charCodeAt(i)) >>> 0
  return `${safe.slice(0, 55)}_${hash.toString(16).slice(0, 8)}`
}

function deepCopyJsonValue(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function isObjectLikeToolInputSchema(schemaRaw) {
  if (!schemaRaw || typeof schemaRaw !== 'object' || Array.isArray(schemaRaw)) return false
  const type = schemaRaw.type
  if (typeof type === 'string') return type === 'object'
  if (Array.isArray(type)) return type.includes('object')
  return !!(schemaRaw.properties && typeof schemaRaw.properties === 'object' && !Array.isArray(schemaRaw.properties))
}

function buildProviderToolDefinition(inputSchemaRaw) {
  const fallback = { type: 'object', properties: {}, additionalProperties: false }
  if (!inputSchemaRaw || typeof inputSchemaRaw !== 'object' || Array.isArray(inputSchemaRaw)) {
    return {
      parameters: fallback,
      wrapped: false,
      unwrapArgs(argsObj) {
        return argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? argsObj : {}
      }
    }
  }

  if (isObjectLikeToolInputSchema(inputSchemaRaw)) {
    return {
      parameters: deepCopyJsonValue(inputSchemaRaw, fallback) || fallback,
      wrapped: false,
      unwrapArgs(argsObj) {
        return argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? argsObj : {}
      }
    }
  }

  return {
    parameters: {
      type: 'object',
      properties: {
        input: deepCopyJsonValue(inputSchemaRaw, null)
      },
      required: ['input'],
      additionalProperties: false
    },
    wrapped: true,
    unwrapArgs(argsObj) {
      if (!argsObj || typeof argsObj !== 'object' || Array.isArray(argsObj)) return undefined
      return argsObj.input
    }
  }
}

function buildProviderToolDescription(server, tool, definition) {
  const base = tool?.description ? `[${server.name || server._id}] ${tool.description}` : `[${server.name || server._id}] ${tool?.name || ''}`
  if (!definition?.wrapped) return base
  return `${base}（原始 inputSchema 顶层不是 object，调用时请传 {"input": ...}）`
}

function normalizeStringList(val) {
  if (!Array.isArray(val)) return []
  const out = []
  const seen = new Set()
  val.forEach((x) => {
    const s = String(x || '').trim()
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  })
  return out
}

function filterAllowedMcpTools(server, list) {
  const allow = Array.isArray(server?.allowTools) ? server.allowTools.map((x) => String(x || '').trim()).filter(Boolean) : []
  if (!allow.length) return Array.isArray(list) ? list : []
  const enabledNames = new Set(allow)
  return (Array.isArray(list) ? list : []).filter((t) => enabledNames.has(String(t?.name || '').trim()))
}

async function listMcpToolsForServer(server, options = {}) {
  const timeoutMs = Number(server?.timeout) || 10000
  let client = null
  let pooled = false

  try {
    ;({ client, pooled } = getOrCreateMCPClient(server))
    if (!client?.listTools) {
      throw new Error('MCP client not available（createMCPClient 未注入）')
    }

    const list = await withTimeout(client.listTools(), timeoutMs, `获取 MCP 工具列表：${server.name || server._id}`)
    releaseMCPClient(server, client)
    client = null

    const tools = Array.isArray(list) ? list : Array.isArray(list?.tools) ? list.tools : []
    return { ok: true, tools }
  } catch (err) {
    try {
      if (pooled && server?._id) closePooledMCPClient(server._id)
      else client?.close?.()
    } catch {
      // ignore
    }
    return { ok: false, tools: [], error: err }
  }
}

async function buildMcpToolsBundle(servers) {
  const tools = []
  const map = new Map()

  for (const server of servers) {
    const r = await listMcpToolsForServer(server, { silent: true })
    if (!r.ok) continue

    const allowed = filterAllowedMcpTools(server, r.tools)
    for (const t of allowed) {
      if (!t?.name) continue
      const fnName = makeToolFunctionName(server._id, t.name)
      const toolDef = buildProviderToolDefinition(t.inputSchema)
      map.set(fnName, {
        serverId: server._id,
        toolName: t.name,
        serverName: server.name || server._id,
        unwrapArgs: toolDef.unwrapArgs
      })

      tools.push({
        type: 'function',
        function: {
          name: fnName,
          description: buildProviderToolDescription(server, t, toolDef),
          parameters: toolDef.parameters
        }
      })
    }
  }

  return { tools, map }
}

function legacyBuildSkillsPromptText(skillObjects) {
  const blocks = []
  ;(Array.isArray(skillObjects) ? skillObjects : []).forEach((s) => {
    if (!s || !s._id) return
    const name = s.name || s._id
    const desc = String(s.description || '').trim()
    const content = String(s.content || '').trim()
    const mcpIds = Array.isArray(s.mcp) ? s.mcp.map((x) => String(x || '').trim()).filter(Boolean) : []

    if (!desc && !content && !mcpIds.length) return
    const parts = [`## 技能：${name}（id：\`${s._id}\`）`]
    if (mcpIds.length) parts.push(`MCP：${mcpIds.map((x) => `\`${x}\``).join('、')}`)
    if (desc) parts.push(`描述：${desc}`)
    if (content) parts.push(content)
    blocks.push(parts.join('\n'))
  })
  return blocks.join('\n\n').trim()
}

async function buildSkillsPromptText(skillObjects) {
  const blocks = []

  for (const skill of Array.isArray(skillObjects) ? skillObjects : []) {
    if (!skill || !skill._id) continue

    const name = skill.name || skill._id
    const desc = getSkillDescription(skill)
    const mcpIds = Array.isArray(skill.mcp) ? skill.mcp.map((x) => String(x || '').trim()).filter(Boolean) : []
    const fileIndexLines = isDirectorySkill(skill) ? buildSkillFileIndexLines(skill) : []
    let content = ''

    if (isDirectorySkill(skill)) {
      const result = await Promise.resolve(readSkillRegistryFile(skill._id, skill.entryFile || 'SKILL.md'))
      content = String(result?.content || '').trim()
    } else {
      content = String(skill.content || '').trim()
    }

    if (!desc && !content && !mcpIds.length && !fileIndexLines.length) continue

    const parts = [`## 技能：${name}（id：\`${skill._id}\`）`]
    if (mcpIds.length) parts.push(`MCP：${mcpIds.map((x) => `\`${x}\``).join('、')}`)
    if (desc) parts.push(`描述：${desc}`)
    if (fileIndexLines.length) parts.push(['文件：', ...fileIndexLines.map((line) => `- ${line}`)].join('\n'))
    if (content) parts.push(content)
    blocks.push(parts.join('\n'))
  }

  return blocks.join('\n\n').trim()
}

async function buildSystemPrompt({ basePromptText, skillObjects }) {
  const blocks = []
  const base = String(basePromptText || '').trim()
  if (base) blocks.push(base)
  const skills = await buildSkillsPromptText(skillObjects)
  if (skills) blocks.push(skills)
  return blocks.join('\n\n').trim()
}

function getAgentById(agentId) {
  const id = String(agentId || '').trim()
  if (!id) return null
  return (agentsRef.value || []).find((a) => a && a._id === id) || null
}

function getProviderById(providerId) {
  const id = String(providerId || '').trim()
  if (!id) return null
  return (providersRef.value || []).find((p) => p && p._id === id) || null
}

function getPromptById(promptId) {
  const id = String(promptId || '').trim()
  if (!id) return null
  return (promptsRef.value || []).find((p) => p && p._id === id) || null
}

function getSkillById(skillId) {
  const id = String(skillId || '').trim()
  if (!id) return null
  return (skillsRef.value || []).find((s) => s && s._id === id) || null
}

function getMcpServerById(serverId) {
  const id = String(serverId || '').trim()
  if (!id) return null
  return (mcpServersRef.value || []).find((s) => s && s._id === id) || null
}

function unionStrings(...lists) {
  const out = []
  const seen = new Set()
  lists.forEach((list) => {
    normalizeStringList(list).forEach((s) => {
      if (seen.has(s)) return
      seen.add(s)
      out.push(s)
    })
  })
  return out
}

async function resolveExecutionProfile(task) {
  const agent = getAgentById(task?.agentId)
  if (!agent) throw new Error('未找到智能体：' + String(task?.agentId || ''))

  const cfg = chatConfigRef.value || {}
  const fallbackProviderId = String(cfg.defaultProviderId || '').trim()
  const fallbackModel = String(cfg.defaultModel || '').trim()
  const fallbackSystemPrompt = String(cfg.defaultSystemPrompt || '').trim()

  const providerId = String(
    agent.provider ||
    fallbackProviderId ||
    (providersRef.value || []).find((p) => isUtoolsBuiltinProvider(p))?._id ||
    (providersRef.value || [])[0]?._id ||
    ''
  ).trim()
  if (!providerId) throw new Error('Agent 未配置 Provider，且未设置默认 Provider')
  let provider = getProviderById(providerId)
  if (!provider) throw new Error('未找到 Provider：' + providerId)

  let providerModels = Array.isArray(provider.selectModels) ? provider.selectModels : []
  if (isUtoolsBuiltinProvider(provider) && !providerModels.length) {
    try {
      await refreshUtoolsAiModels({ force: true })
    } catch {
      // ignore and keep the explicit missing-model error below
    }
    provider = getProviderById(providerId) || provider
    providerModels = Array.isArray(provider.selectModels) ? provider.selectModels : []
  }
  const model = String(agent.model || fallbackModel || providerModels[0] || '').trim()
  if (!model) throw new Error('未配置模型：请在 Agent 或默认模型中设置')

  const prompt = agent.prompt ? getPromptById(agent.prompt) : null
  const basePromptText = prompt ? String(prompt.content || '').trim() : fallbackSystemPrompt

  const skillIds = unionStrings(agent.skills, task?.skillIds)
  const skillObjects = skillIds.map((id) => getSkillById(id)).filter(Boolean)

  const manualMcpIds = unionStrings(agent.mcp, task?.mcpIds)
  const derivedMcpIds = unionStrings(...skillObjects.map((s) => s?.mcp))
  const activeMcpIds = unionStrings(manualMcpIds, derivedMcpIds)
  const activeMcpServers = activeMcpIds
    .map((id) => getMcpServerById(id))
    .filter((s) => s && s._id && !s.disabled)
  const modelParams = normalizeAgentModelParams(agent.modelParams)
  const reasoningEffort = modelParams.reasoningEffort || 'auto'

  const systemPrompt = await buildSystemPrompt({ basePromptText, skillObjects })

  const agentSkillIds = Array.isArray(agent.skills) ? agent.skills : []

  const state = {
    selectedAgentId: agent._id,
    selectedProviderId: provider._id,
    selectedModel: model,
    basePromptMode: prompt ? 'prompt' : 'custom',
    selectedPromptId: prompt ? prompt._id : null,
    customSystemPrompt: prompt ? '' : basePromptText,
    selectedSkillIds: skillIds,
    agentSkillIds,
    activatedAgentSkillIds: agentSkillIds,
    manualMcpIds,
    autoApproveTools: true,
    autoActivateAgentSkills: false,
    toolMode: 'expanded',
    effectiveToolMode: 'expanded',
    thinkingEffort: reasoningEffort
  }

  return { agent, provider, model, modelParams, systemPrompt, state, activeMcpServers }
}

function buildRequestMessages({ systemPrompt, apiMessages, compatToolCallIdAsFc }) {
  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })

  for (const m of apiMessages || []) {
    if (!m || typeof m !== 'object') continue
    const cloned = { ...m }

    if (compatToolCallIdAsFc) {
      if (cloned.role === 'assistant' && Array.isArray(cloned.tool_calls)) {
        cloned.tool_calls = cloned.tool_calls.map((tc) => {
          if (!tc || typeof tc !== 'object') return tc
          const id = typeof tc.id === 'string' ? tc.id : ''
          if (!id.startsWith('call_')) return tc
          const callId = typeof tc.call_id === 'string' && tc.call_id ? tc.call_id : id
          return { ...tc, id: `fc_${id.slice('call_'.length)}`, call_id: callId }
        })
      }

      if (cloned.role === 'tool' && typeof cloned.tool_call_id === 'string' && cloned.tool_call_id.startsWith('call_')) {
        cloned.call_id = cloned.tool_call_id
      }
    }

    msgs.push(cloned)
  }

  return msgs
}

function normalizeToolCalls(msg) {
  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
  if (toolCalls.length) {
    return toolCalls
      .map((tc) => {
        const id = typeof tc.id === 'string' && tc.id ? tc.id : `call_${newId()}`
        return {
          id,
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || ''
          }
        }
      })
      .filter((tc) => tc.function?.name)
  }

  const fc = msg?.function_call
  if (fc && typeof fc === 'object' && fc.name) {
    return [
      {
        id: `call_${newId()}`,
        type: 'function',
        function: {
          name: String(fc.name || ''),
          arguments: typeof fc.arguments === 'string' ? fc.arguments : stableStringify(fc.arguments)
        }
      }
    ]
  }

  return []
}

async function executeMcpToolCall({ toolCall, mapping, argsObj }) {
  const serverId = mapping.serverId
  const server = getMcpServerById(serverId)
  if (!server || server.disabled) {
    return { ok: false, content: `未找到 MCP 服务或已禁用：${mapping.serverName || serverId}` }
  }

  let client = null
  let pooled = false
  try {
    ;({ client, pooled } = getOrCreateMCPClient(server))
    if (!client?.callTool) throw new Error('MCP client not available（createMCPClient 未注入）')

    const callTimeoutMs = Number(server?.timeout) || 60000
    const callArgs = typeof mapping?.unwrapArgs === 'function' ? mapping.unwrapArgs(argsObj) : argsObj
    const result = await withTimeout(
      client.callTool(mapping.toolName, callArgs),
      callTimeoutMs,
      `调用工具：${mapping.serverName} / ${mapping.toolName}`
    )
    releaseMCPClient(server, client)
    client = null

    const resultText = stringifyToolResultForModel(result)
    return { ok: true, content: resultText }
  } catch (err) {
    try {
      if (pooled && server?._id) closePooledMCPClient(server._id)
      else client?.close?.()
    } catch {
      // ignore
    }
    const errorText = err?.message || String(err)
    return { ok: false, content: `错误：${errorText}` }
  }
}

async function invokeTimedTaskUtoolsAiTool({ name, argsObj, map, displayMessages }) {
  const mapping = map.get(name)
  const argsText = stableStringify(argsObj || {})

  displayMessages.push(
    createDisplayMessage(
      'tool_call',
      `### 工具调用\n- 服务：**${mapping?.serverName || '未知'}**\n- 工具：\`${mapping?.toolName || name || ''}\`\n\n\`\`\`json\n${argsText || '{}'}\n\`\`\``,
      { toolMeta: `${mapping?.serverName || '未知'} / ${mapping?.toolName || name || ''}` }
    )
  )

  if (!mapping) {
    const errorText = `未找到工具映射：${name}`
    displayMessages.push(
      createDisplayMessage('tool', `### 工具结果\n- 错误：${errorText}`, { toolMeta: `未知 / ${name || ''}` })
    )
    return errorText
  }

  const exec = await executeMcpToolCall({
    toolCall: {
      id: `utools_call_${newId()}`,
      type: 'function',
      function: {
        name,
        arguments: argsText || '{}'
      }
    },
    mapping,
    argsObj
  })

  const resultText = String(exec?.content || '')
  displayMessages.push(
    createDisplayMessage(
      'tool',
      `### 工具结果\n- 服务：**${mapping.serverName}**\n- 工具：\`${mapping.toolName}\`\n\n\`\`\`json\n${resultText}\n\`\`\``,
      { toolMeta: `${mapping.serverName} / ${mapping.toolName}` }
    )
  )

  const parsed = safeJsonParse(resultText)
  return parsed.ok ? parsed.value : resultText
}

async function runTimedTaskWithUtoolsAi({ profile, model, systemPrompt, displayMessages, apiMessages, requestTimeoutMs }) {
  if (!canUseUtoolsAi()) {
    throw new Error('当前环境不支持 uTools 官方 AI')
  }

  const { tools, map } = await buildMcpToolsBundle(profile.activeMcpServers)
  const unregisterToolFns = registerUtoolsAiToolFunctions({
    tools,
    invokeTool: (name, argsObj) => invokeTimedTaskUtoolsAiTool({ name, argsObj, map, displayMessages })
  })

  let timedOut = false
  let request = null
  const timeoutTimer = window.setTimeout(() => {
    timedOut = true
    try {
      request?.abort?.()
    } catch {
      // ignore
    }
  }, requestTimeoutMs)

  try {
    request = utools.ai({
      model,
      messages: buildUtoolsAiMessages({
        systemContent: systemPrompt,
        apiMessages
      }),
      ...(tools.length ? { tools } : {})
    })

    const result = await request
    const assistantContent = toText(result?.content)
    const reasoningContent = toText(result?.reasoning_content)

    apiMessages.push({
      role: 'assistant',
      content: String(assistantContent || ''),
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {})
    })

    if (assistantContent && assistantContent.trim()) {
      displayMessages.push(createDisplayMessage('assistant', assistantContent))
    } else {
      displayMessages.push(createDisplayMessage('assistant', '（模型返回为空）'))
    }
  } catch (err) {
    if (timedOut) {
      throw new Error(`请求超时：${requestTimeoutMs}ms`)
    }
    throw err
  } finally {
    window.clearTimeout(timeoutTimer)
    unregisterToolFns()
  }
}

function sanitizePathSegment(name) {
  const raw = String(name || '').trim()
  if (!raw) return 'Untitled'
  const replaced = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
  const safe = replaced === '.' || replaced === '..' ? `_${replaced}_` : replaced
  return safe.slice(0, 80) || 'Untitled'
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatTimestampForFile(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}-${pad2(dt.getHours())}${pad2(dt.getMinutes())}${pad2(dt.getSeconds())}`
}

async function ensureUniqueJsonPath(basePathNoExt) {
  let candidate = `${basePathNoExt}.json`
  if (!(await exists(candidate))) return candidate
  for (let i = 2; i <= 99; i++) {
    candidate = `${basePathNoExt}-${i}.json`
    if (!(await exists(candidate))) return candidate
  }
  return `${basePathNoExt}-${Date.now()}.json`
}

async function saveTimedTaskSession({ task, startedAt, payload }) {
  const taskName = sanitizePathSegment(task?.name || task?._id)
  const runName = formatTimestampForFile(startedAt)

  await createDirectory(TIMED_TASK_ROOT)
  const taskDir = `${TIMED_TASK_ROOT}/${taskName}`
  await createDirectory(taskDir)

  const base = `${taskDir}/${runName}`
  const filePath = await ensureUniqueJsonPath(base)
  await writeFile(filePath, JSON.stringify(payload, null, 2))

  try {
    window.dispatchEvent(new CustomEvent('sessionFilesChanged', { detail: { path: filePath } }))
  } catch {
    // ignore
  }

  return filePath
}

export async function runTimedTaskOnce(task, options = {}) {
  const startedAt = options.startedAt instanceof Date ? options.startedAt : new Date()

  const profile = await resolveExecutionProfile(task)
  const provider = profile.provider
  const model = profile.model
  const requestOverrides = buildRequestOverridesFromAgentModelParams(profile.modelParams, { includeReasoningEffort: true })
  const systemPrompt = profile.systemPrompt

  const isBuiltinUtoolsProvider = isUtoolsBuiltinProvider(provider)
  const baseUrl = isBuiltinUtoolsProvider ? '__utools_builtin__' : String(provider.baseurl || '').trim()
  const apiKey = isBuiltinUtoolsProvider ? '__utools_builtin__' : String(provider.apikey || '').trim()
  if (!baseUrl || !apiKey) throw new Error('Provider 未配置 baseurl / apikey')

  const userText = String(task?.content || '').trim()
  if (!userText) throw new Error('执行内容为空')

  const displayMessages = []
  const apiMessages = []

  displayMessages.push(createDisplayMessage('user', userText))
  apiMessages.push({ role: 'user', content: userText })

  const REQUEST_TIMEOUT_MS = 1800000
  const finalizePayload = async () => {
    const payload = {
      version: 1,
      type: 'chat_session',
      title: String(task?.name || 'Timed Task'),
      savedAt: startedAt.toISOString(),
      updatedAt: new Date().toISOString(),
      source: {
        type: 'timed_task',
        taskId: task?._id || ''
      },
      state: profile.state,
      session: {
        messages: displayMessages,
        apiMessages
      }
    }

    const autoSave = task?.options?.autoSaveSession !== false
    if (autoSave) {
      await saveTimedTaskSession({ task, startedAt, payload })
    }

    return payload
  }

  if (isBuiltinUtoolsProvider) {
    try {
      await runTimedTaskWithUtoolsAi({
        profile,
        model,
        systemPrompt,
        displayMessages,
        apiMessages,
        requestTimeoutMs: REQUEST_TIMEOUT_MS
      })
    } catch (err) {
      const errorText = err?.message || String(err)
      displayMessages.push(createDisplayMessage('assistant', `错误：${errorText}`))
    }

    return finalizePayload()
  }

  const { tools, map } = await buildMcpToolsBundle(profile.activeMcpServers)

  const controller = new AbortController()
  const timeoutTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let compatFcToolCallId = false

  try {
    const maxRounds = 60
    for (let round = 0; round < maxRounds; round++) {
      const reqMessages = buildRequestMessages({ systemPrompt, apiMessages, compatToolCallIdAsFc: compatFcToolCallId })
      const body = {
        model,
        stream: false,
        messages: reqMessages,
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
        ...requestOverrides
      }

      let json = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          json = await postChatCompletions({ baseUrl, apiKey, body, signal: controller.signal })
          break
        } catch (err) {
          const errText = String(err?.message || err || '')
          if (!compatFcToolCallId && errText.includes("Expected an ID that begins with 'fc'") && errText.includes('.id')) {
            compatFcToolCallId = true
            continue
          }
          throw err
        }
      }
      if (!json) throw new Error('请求失败：已达到重试次数上限')

      const choice = json?.choices?.[0] || {}
      const msg = choice.message || {}

      const assistantContent = toText(msg.content ?? choice.text ?? json.content ?? json.text) || extractAssistantTextFromPayload(json)
      const toolCalls = normalizeToolCalls(msg)

      const assistantApiMsg = {
        role: 'assistant',
        content: String(assistantContent || ''),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {})
      }
      apiMessages.push(assistantApiMsg)

      if (assistantContent && assistantContent.trim()) {
        displayMessages.push(createDisplayMessage('assistant', assistantContent))
      }

      if (!toolCalls.length) break
      if (round === maxRounds - 1) {
        displayMessages.push(createDisplayMessage('assistant', '已达到工具调用轮次上限。'))
        break
      }

      for (const tc of toolCalls) {
        const fn = tc.function?.name
        const mapping = map.get(fn)

        const argsRaw = tc.function?.arguments || ''
        const parsedArgs = safeJsonParse(argsRaw)
        const argsObj = parsedArgs.ok && parsedArgs.value && typeof parsedArgs.value === 'object' ? parsedArgs.value : {}
        const argsText = parsedArgs.ok ? stableStringify(parsedArgs.value) : argsRaw

        displayMessages.push(
          createDisplayMessage(
            'tool_call',
            `### 工具调用\n- 服务：**${mapping?.serverName || '未知'}**\n- 工具：\`${mapping?.toolName || fn || ''}\`\n\n\`\`\`json\n${argsText || '{}'}\n\`\`\``,
            { toolMeta: `${mapping?.serverName || '未知'} / ${mapping?.toolName || fn || ''}` }
          )
        )

        if (!mapping) {
          const errorText = `未找到工具映射：${fn}`
          displayMessages.push(
            createDisplayMessage('tool', `### 工具结果\n- 错误：${errorText}`, { toolMeta: `未知 / ${fn || ''}` })
          )
          apiMessages.push({ role: 'tool', tool_call_id: tc.id, content: errorText })
          continue
        }

        const exec = await executeMcpToolCall({ toolCall: tc, mapping, argsObj })
        apiMessages.push({ role: 'tool', tool_call_id: tc.id, content: String(exec?.content || '') })

        displayMessages.push(
          createDisplayMessage(
            'tool',
            `### 工具结果\n- 服务：**${mapping.serverName}**\n- 工具：\`${mapping.toolName}\`\n\n\`\`\`json\n${String(exec?.content || '')}\n\`\`\``,
            { toolMeta: `${mapping.serverName} / ${mapping.toolName}` }
          )
        )
      }
    }
  } catch (err) {
    const errorText = err?.name === 'AbortError' ? `请求超时：${REQUEST_TIMEOUT_MS}ms` : err?.message || String(err)
    displayMessages.push(createDisplayMessage('assistant', `错误：${errorText}`))
  } finally {
    window.clearTimeout(timeoutTimer)
  }

  return finalizePayload()
}
