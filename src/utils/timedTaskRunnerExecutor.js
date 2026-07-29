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
import {
  createToolResultApiMessage,
  normalizeAssistantToolCalls,
  sanitizeRequestToolMessages,
  shouldIncludeReasoningContent,
  shouldRetryWithReasoningContent
} from '@/utils/chatRequestCompat'
import {
  applyResponsesStreamEvent,
  buildResponsesRequestBodyFromChatBody,
  createResponsesStreamAccumulator,
  finalizeResponsesStreamAccumulator,
  shouldFallbackChatCompletionsToResponses,
  shouldFallbackResponsesToChatCompletions,
  shouldPreferResponsesApiForModel
} from '@/utils/openaiResponsesCompat'
import {
  allowsAutomaticApiFallback,
  normalizeProviderApiMode,
  resolveChatApiMode
} from '@/utils/providerModelConfig'
import { buildSkillFileIndexLines, getSkillDescription, isDirectorySkill } from '@/utils/skillUtils'
import {
  buildUtoolsAiMessages,
  canUseUtoolsAi,
  extractUtoolsAiReasoningText,
  isUtoolsBuiltinProvider,
  refreshUtoolsAiModels,
  registerUtoolsAiToolFunctions
} from '@/utils/utoolsAiProvider'
import { extractAssistantTextFromPayload } from '@/utils/chatAssistantResponse'
import { stringifyToolResultForModel } from '@/utils/toolResultForModel'
import { createDirectory, exists, writeFile } from '@/utils/fileOperations'
import { getOrCreateMCPClient, releaseMCPClient, closePooledMCPClient } from '@/utils/mcpClient'
import { isSystemPrompt } from '@/utils/promptConfig'
import {
  buildSkillToolsBundle,
  createBuiltinSkillActionCatalog,
  discoverBuiltinSkillActions,
  resolveBuiltinSkillCall
} from '@/utils/chatSkillTooling'
import {
  evaluateToolApproval,
  normalizeUnattendedToolApprovalMode,
  resolveMcpToolApprovalPolicy,
  TOOL_APPROVAL_MODE_FULL,
  TOOL_APPROVAL_MODE_SAFE
} from '@/utils/toolApprovalPolicy'

const SESSION_ROOT = 'session'
const TIMED_TASK_DIR_NAME = '定时任务'
const TIMED_TASK_ROOT = `${SESSION_ROOT}/${TIMED_TASK_DIR_NAME}`

const agentsRef = getAgents()
const providersRef = getProviders()
const promptsRef = getPrompts()
const skillsRef = getSkills()
const mcpServersRef = getMcpServers()
const chatConfigRef = getChatConfig()

function getBuiltinSkillsApi() {
  return globalThis?.aiToolsApi?.dangerous?.skills || null
}

const builtinSkillActionCatalog = createBuiltinSkillActionCatalog((skillId) => {
  const api = getBuiltinSkillsApi()
  if (typeof api?.listActions !== 'function') {
    throw new Error('preload 未注入内置 Skill 动作 API')
  }
  return api.listActions(skillId)
})

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
  // 定时任务会话用于“任务执行记录/日志分析”，默认按 Markdown 渲染更符合预期
  const defaultRender = role === 'thinking' ? 'text' : 'md'
  const base = { id: newId(), role, content: String(content || ''), time: Date.now(), render: defaultRender }
  if (role === 'tool' || role === 'tool_call') {
    base.toolExpanded = false
    base.toolMeta = ''
  }
  return { ...base, ...extra }
}

function updateTimedTaskToolMessage(message, { status = 'success', serverName = '', toolName = '', resultText = '', errorText = '' } = {}) {
  if (!message || typeof message !== 'object') return message
  const safeServerName = String(serverName || message.toolServerName || '').trim() || '未知'
  const safeToolName = String(toolName || message.toolName || '').trim() || ''
  const normalizedStatus = String(status || '').trim() || 'success'
  message.role = 'tool'
  message.toolStatus = normalizedStatus
  message.toolMeta = `${safeServerName} / ${safeToolName}`.trim()
  message.toolServerName = safeServerName
  message.toolName = safeToolName
  message.content = normalizedStatus === 'error'
    ? `### 工具结果\n- 错误：${String(errorText || '').trim()}`
    : `### 工具结果\n- 服务：**${safeServerName}**\n- 工具：\`${safeToolName}\`\n\n\`\`\`json\n${String(resultText || '').trim() || '{}'}\n\`\`\``
  return message
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
    .replace(/\/v1\/responses$/i, '/v1')
    .replace(/\/responses$/i, '')
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

async function recordTimedTaskUsage({ usage, providerId, model, endpoint }) {
  if (!usage || typeof usage !== 'object') return
  const recorder = window?.aiToolsApi?.usage?.recordUsage
  if (typeof recorder !== 'function') return
  try {
    await recorder({
      usage,
      providerId: String(providerId || ''),
      model: String(model || ''),
      endpoint: String(endpoint || ''),
      purpose: 'timed-task'
    })
  } catch (error) {
    console.warn('记录定时任务模型用量失败：', error)
  }
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

async function postResponses({ baseUrl, apiKey, body, signal }) {
  const base = normalizeBaseUrl(baseUrl)
  const candidates = [`${base}/responses`]
  if (!/\/v1$/.test(base)) candidates.push(`${base}/v1/responses`)

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
        body: JSON.stringify(buildResponsesRequestBodyFromChatBody(body, { stream: false })),
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

  if (!resp) throw lastNetworkError || new Error('Responses 请求失败：未获取到响应')
  if (!resp.ok) {
    const responseText = await resp.text()
    const parsed = safeJsonParse(responseText)
    const detail = parsed.ok
      ? parsed.value?.error?.message || stableStringify(parsed.value)
      : responseText
    throw new Error(`Responses 请求失败（HTTP ${resp.status}）：${detail || resp.statusText}\nURL：${usedUrl}`)
  }
  return await resp.json()
}

async function postProviderChatCompletion({ provider, baseUrl, apiKey, body, signal }) {
  const configuredApiMode = normalizeProviderApiMode(provider?.apiMode)
  const automaticApiFallback = allowsAutomaticApiFallback(configuredApiMode)
  const initialApiMode = resolveChatApiMode({
    configuredMode: configuredApiMode,
    preferResponses: shouldPreferResponsesApiForModel(body?.model)
  })
  const requestByMode = (mode) => mode === 'responses'
    ? postResponses({ baseUrl, apiKey, body, signal })
    : postChatCompletions({ baseUrl, apiKey, body, signal })

  try {
    return { apiMode: initialApiMode, json: await requestByMode(initialApiMode) }
  } catch (err) {
    const errorText = String(err?.message || err || '')
    const fallbackMode =
      initialApiMode === 'responses' && shouldFallbackResponsesToChatCompletions(errorText)
        ? 'chat-completions'
        : initialApiMode === 'chat-completions' && shouldFallbackChatCompletionsToResponses(errorText)
          ? 'responses'
          : ''
    if (!automaticApiFallback || !fallbackMode) throw err
    return { apiMode: fallbackMode, json: await requestByMode(fallbackMode) }
  }
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
        ...resolveMcpToolApprovalPolicy(t),
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

async function buildTimedTaskToolsBundle(profile) {
  const mcpBundle = await buildMcpToolsBundle(profile?.activeMcpServers)
  const skillBundle = buildSkillToolsBundle({
    selectedSkills: profile?.skillObjects,
    agentSkillIds: profile?.agentSkillIds,
    includeLifecycleTools: false,
    includeResourceTools: false
  })
  return {
    tools: [...mcpBundle.tools, ...skillBundle.tools],
    map: new Map([...mcpBundle.map, ...skillBundle.map])
  }
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
  return (promptsRef.value || []).find((p) => p && p._id === id && isSystemPrompt(p)) || null
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
  const modelType = String(provider?.modelTypes?.[model] || 'auto').trim().toLowerCase()
  if (['embedding', 'image-generation', 'video-generation'].includes(modelType)) {
    throw new Error(`模型“${model}”用途为 ${modelType}，不能用于定时对话任务`)
  }

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
  const toolApprovalMode = normalizeUnattendedToolApprovalMode(
    task?.options?.toolApprovalMode,
    TOOL_APPROVAL_MODE_SAFE
  )

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
    toolApprovalMode,
    autoApproveTools: toolApprovalMode === TOOL_APPROVAL_MODE_FULL,
    autoActivateAgentSkills: false,
    toolMode: 'expanded',
    effectiveToolMode: 'expanded',
    thinkingEffort: reasoningEffort
  }

  return {
    agent,
    provider,
    model,
    modelType,
    modelParams,
    systemPrompt,
    state,
    toolApprovalMode,
    skillObjects,
    agentSkillIds,
    activeMcpServers
  }
}

function buildRequestMessages({ systemPrompt, apiMessages, compatToolCallIdAsFc }) {
  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })

  const sourceMessages = Array.isArray(apiMessages) ? apiMessages : []

  for (const m of sourceMessages) {
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
        cloned.tool_call_id = `fc_${cloned.tool_call_id.slice('call_'.length)}`
      }
    }

    if (cloned.role !== 'assistant') {
      delete cloned.reasoning_content
      delete cloned.reasoning
      delete cloned.thinking
      delete cloned.thought
    }

    msgs.push(cloned)
  }

  return sanitizeRequestToolMessages(msgs, { compatToolCallIdAsFc })
}

function normalizeToolCalls(msg) {
  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
  if (toolCalls.length) {
    return normalizeAssistantToolCalls(toolCalls, {
      createFallbackId: () => `call_${newId()}`
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

async function executeBuiltinSkillToolCall({ profile, mapping, argsObj }) {
  if (mapping?.internal === 'skill_discover') {
    try {
      const result = await discoverBuiltinSkillActions({
        selectedSkills: profile?.skillObjects,
        catalog: builtinSkillActionCatalog,
        args: argsObj
      })
      return {
        ok: result?.ok !== false,
        content: stableStringify(result),
        serverName: 'Skill',
        toolName: 'skill_discover'
      }
    } catch (err) {
      return { ok: false, content: `错误：${err?.message || String(err)}` }
    }
  }

  if (mapping?.internal === 'skill_call') {
    let resolved = null
    try {
      resolved = await resolveBuiltinSkillCall({
        selectedSkills: profile?.skillObjects,
        catalog: builtinSkillActionCatalog,
        args: argsObj,
        isSkillLoaded: () => true
      })
      if (!resolved?.ok) {
        return { ok: false, content: stableStringify(resolved) }
      }
      const permission = evaluateToolApproval({
        mode: profile?.toolApprovalMode,
        forceApproval: resolved.mapping?.forceApproval === true,
        hardApproval: resolved.mapping?.hardApproval === true,
        interactive: false
      })
      if (permission.action !== 'allow') {
        return {
          ok: false,
          blocked: true,
          content: `定时任务工具权限已阻止：${resolved.mapping?.serverName || resolved.mapping?.serverId || 'Skill'} / ${resolved.mapping?.toolName || 'unknown'}。强制确认类操作不能在无人值守任务中执行；其他写入操作可使用“高风险自动”模式。`,
          serverName: resolved.mapping?.serverName,
          toolName: resolved.mapping?.toolName
        }
      }
      const api = getBuiltinSkillsApi()
      if (typeof api?.runAction !== 'function') {
        throw new Error('preload 未注入内置 Skill 动作 API')
      }
      const isAgentRun =
        String(resolved.mapping.skillId || '').trim() === 'builtin_skill_agent_orchestration' &&
        String(resolved.mapping.toolName || '').trim() === 'agent_run'
      const runtimeArgs = isAgentRun
        ? {
            ...(resolved.args && typeof resolved.args === 'object' ? resolved.args : {}),
            __tool_approval_mode: profile?.toolApprovalMode,
            tool_approval_mode: profile?.toolApprovalMode
          }
        : resolved.args
      const result = await Promise.resolve(
        api.runAction(resolved.mapping.skillId, resolved.mapping.toolName, runtimeArgs)
      )
      return {
        ok: result?.ok !== false,
        content: stringifyToolResultForModel(result),
        serverName: resolved.mapping.serverName,
        toolName: resolved.mapping.toolName
      }
    } catch (err) {
      return { ok: false, content: `错误：${err?.message || String(err)}` }
    }
  }

  return { ok: false, content: `未知 Skill 工具：${mapping?.internal || '(empty)'}` }
}

async function executeTimedTaskToolCall({ profile, toolCall, mapping, argsObj }) {
  const permission = evaluateToolApproval({
    mode: profile?.toolApprovalMode,
    forceApproval: mapping?.forceApproval === true,
    hardApproval: mapping?.hardApproval === true,
    interactive: false
  })
  if (permission.action !== 'allow') {
    return {
      ok: false,
      blocked: true,
      content: `定时任务工具权限已阻止：${mapping?.serverName || mapping?.serverId || '未知'} / ${mapping?.toolName || 'unknown'}。强制确认类操作不能在无人值守任务中执行；其他写入操作可使用“高风险自动”模式。`
    }
  }

  if (mapping?.type === 'internal' && (
    mapping.internal === 'skill_discover' ||
    mapping.internal === 'skill_call'
  )) {
    return executeBuiltinSkillToolCall({ profile, mapping, argsObj })
  }
  return executeMcpToolCall({ toolCall, mapping, argsObj })
}

async function invokeTimedTaskUtoolsAiTool({ profile, name, argsObj, map, displayMessages }) {
  const mapping = map.get(name)
  const argsText = stableStringify(argsObj || {})
  const toolMessage = createDisplayMessage(
    'tool_call',
    `### 工具调用\n- 服务：**${mapping?.serverName || '未知'}**\n- 工具：\`${mapping?.toolName || name || ''}\`\n\n\`\`\`json\n${argsText || '{}'}\n\`\`\``,
    { toolMeta: `${mapping?.serverName || '未知'} / ${mapping?.toolName || name || ''}` }
  )

  displayMessages.push(toolMessage)

  if (!mapping) {
    const errorText = `未找到工具映射：${name}`
    updateTimedTaskToolMessage(toolMessage, { status: 'error', serverName: '未知', toolName: name || '', errorText })
    return errorText
  }

  const exec = await executeTimedTaskToolCall({
    profile,
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
  updateTimedTaskToolMessage(toolMessage, {
    status: exec?.ok === false ? 'error' : 'success',
    serverName: exec?.serverName || mapping.serverName,
    toolName: exec?.toolName || mapping.toolName,
    resultText,
    errorText: exec?.ok === false ? resultText : ''
  })

  const parsed = safeJsonParse(resultText)
  return parsed.ok ? parsed.value : resultText
}

async function runTimedTaskWithUtoolsAi({ profile, model, systemPrompt, displayMessages, apiMessages, requestTimeoutMs }) {
  if (!canUseUtoolsAi()) {
    throw new Error('当前环境不支持 uTools 官方 AI')
  }

  const { tools, map } = await buildTimedTaskToolsBundle(profile)
  const unregisterToolFns = registerUtoolsAiToolFunctions({
    tools,
    invokeTool: (name, argsObj) => invokeTimedTaskUtoolsAiTool({ profile, name, argsObj, map, displayMessages })
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
    const reasoningContent = extractUtoolsAiReasoningText(result)

    apiMessages.push({
      role: 'assistant',
      content: String(assistantContent || ''),
      reasoning_content: String(reasoningContent || '')
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
  if (!raw) return '未命名'
  const replaced = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
  const safe = replaced === '.' || replaced === '..' ? `_${replaced}_` : replaced
  return safe.slice(0, 80) || '未命名'
}

async function ensureUniqueJsonPath(basePathNoExt) {
  let candidate = `${basePathNoExt}.json`
  if (!(await exists(candidate))) return candidate
  for (let i = 2; i <= 99; i++) {
    candidate = `${basePathNoExt}-${i}.json`
    if (!(await exists(candidate))) return candidate
  }
  return `${basePathNoExt}-${Math.random().toString(36).slice(2, 8)}.json`
}

async function ensureTimedTaskRoot() {
  try {
    await createDirectory(SESSION_ROOT)
  } catch {
    // ignore
  }

  await createDirectory(TIMED_TASK_ROOT)
}

async function saveTimedTaskSession({ task, startedAt, payload }) {
  const taskName = sanitizePathSegment(task?.name || task?._id)

  await ensureTimedTaskRoot()
  const taskDir = `${TIMED_TASK_ROOT}/${taskName}`
  await createDirectory(taskDir)

  const base = `${taskDir}/${taskName}`
  const filePath = await ensureUniqueJsonPath(base)
  await writeFile(filePath, JSON.stringify(payload, null, 2))

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
  if (!baseUrl || !apiKey) throw new Error('服务商未配置 baseurl / apikey')

  const userText = String(task?.content || '').trim()
  if (!userText) throw new Error('执行内容为空')

  const displayMessages = []
  const apiMessages = []

  displayMessages.push(createDisplayMessage('user', userText))
  apiMessages.push({ role: 'user', content: userText })

  const REQUEST_TIMEOUT_MS = 1800000
  const finalizePayload = async () => {
    const completedAt = new Date()
    const payload = {
      version: 1,
      type: 'chat_session',
      title: String(task?.name || '定时任务'),
      createdAt: startedAt.toISOString(),
      savedAt: startedAt.toISOString(),
      updatedAt: completedAt.toISOString(),
      source: {
        type: 'timed_task',
        taskId: task?._id || '',
        taskName: String(task?.name || ''),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString()
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

  const { tools, map } = await buildTimedTaskToolsBundle(profile)

  const controller = new AbortController()
  const timeoutTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let compatFcToolCallId = false
  let forceReasoningContent = false

  try {
    const maxRounds = 60
    for (let round = 0; round < maxRounds; round++) {
      let completion = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const reqMessages = buildRequestMessages({ systemPrompt, apiMessages, compatToolCallIdAsFc: compatFcToolCallId })
        const needsReasoningContent = shouldIncludeReasoningContent({
          baseUrl,
          model,
          forceReasoningContent,
          apiMessages
        })
        const normalizedReqMessages = reqMessages.map((message) => {
          if (!message || typeof message !== 'object') return message
          if (message.role !== 'assistant') return message
          const cloned = { ...message }
          if (needsReasoningContent) {
            const rc = cloned.reasoning_content ?? cloned.reasoning ?? cloned.thinking ?? cloned.thought ?? ''
            cloned.reasoning_content = typeof rc === 'string' ? rc : stableStringify(rc)
          } else {
            delete cloned.reasoning_content
            delete cloned.reasoning
            delete cloned.thinking
            delete cloned.thought
          }
          return cloned
        })
        const body = {
          model,
          stream: false,
          messages: normalizedReqMessages,
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
          ...requestOverrides
        }
        try {
          completion = await postProviderChatCompletion({
            provider,
            baseUrl,
            apiKey,
            body,
            signal: controller.signal
          })
          break
        } catch (err) {
          const errText = String(err?.message || err || '')
          if (!compatFcToolCallId && errText.includes("Expected an ID that begins with 'fc'") && errText.includes('.id')) {
            compatFcToolCallId = true
            continue
          }
          if (!forceReasoningContent && shouldRetryWithReasoningContent(errText)) {
            forceReasoningContent = true
            continue
          }
          throw err
        }
      }
      if (!completion?.json) throw new Error('请求失败：已达到重试次数上限')

      const json = completion.json
      await recordTimedTaskUsage({
        usage: json?.usage || json?.response?.usage,
        providerId: provider?._id,
        model,
        endpoint: completion.apiMode
      })
      let choice = json?.choices?.[0] || {}
      let msg = choice.message || {}
      if (completion.apiMode === 'responses') {
        const responsesState = createResponsesStreamAccumulator()
        applyResponsesStreamEvent(responsesState, json)
        const responsesResult = finalizeResponsesStreamAccumulator(responsesState)
        msg = {
          content: responsesResult.content || extractAssistantTextFromPayload(json),
          reasoning_content: responsesResult.reasoning,
          tool_calls: responsesResult.toolCalls
        }
        choice = { message: msg }
      }

      const assistantContent = toText(msg.content ?? choice.text ?? json.content ?? json.text) || extractAssistantTextFromPayload(json)
      const assistantReasoning = toText(msg.reasoning_content ?? msg.reasoning ?? json.reasoning_content ?? json.reasoning)
      const toolCalls = normalizeToolCalls(msg)

      const assistantApiMsg = {
        role: 'assistant',
        content: String(assistantContent || ''),
        ...(assistantReasoning ? { reasoning_content: String(assistantReasoning) } : {}),
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

        const toolMessage = createDisplayMessage(
          'tool_call',
          `### 工具调用\n- 服务：**${mapping?.serverName || '未知'}**\n- 工具：\`${mapping?.toolName || fn || ''}\`\n\n\`\`\`json\n${argsText || '{}'}\n\`\`\``,
          { toolMeta: `${mapping?.serverName || '未知'} / ${mapping?.toolName || fn || ''}` }
        )
        displayMessages.push(toolMessage)

        if (!mapping) {
          const errorText = `未找到工具映射：${fn}`
          updateTimedTaskToolMessage(toolMessage, { status: 'error', serverName: '未知', toolName: fn || '', errorText })
          apiMessages.push(createToolResultApiMessage(tc, errorText))
          continue
        }

        const exec = await executeTimedTaskToolCall({ profile, toolCall: tc, mapping, argsObj })
        apiMessages.push(createToolResultApiMessage(tc, exec?.content))

        updateTimedTaskToolMessage(toolMessage, {
          status: exec?.ok === false ? 'error' : 'success',
          serverName: mapping.serverName,
          toolName: mapping.toolName,
          resultText: String(exec?.content || ''),
          errorText: exec?.ok === false ? String(exec?.content || '') : ''
        })
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
