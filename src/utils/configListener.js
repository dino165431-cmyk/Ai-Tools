import { computed, ref } from 'vue'
import { initUtoolsAiProvider, mergeUtoolsBuiltinProvider } from '@/utils/utoolsAiProvider'
import { DEFAULT_CONTENT_SEARCH_CONFIG, normalizeContentSearchConfig } from '@/utils/contentSearchConfig'
import { DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG } from '@/utils/chatContextWindow'
import { DEFAULT_CHAT_MEMORY_CONFIG, normalizeChatMemoryConfig } from '@/utils/chatMemoryConfig'
import { getDefaultNoteSecurityConfig } from '@/utils/noteEncryption'
import { DEFAULT_NOTE_EDITOR_CONFIG } from '@/utils/noteTemplateConfig'
import { DEFAULT_NOTEBOOK_RUNTIME_CONFIG } from '@/utils/notebookRuntimeConfig'

export const DEFAULT_SYSTEM_PROMPT = [
  '你是一个可靠、审慎的 AI 助手（AI Assistant）。',
  '默认使用简体中文回复；仅在用户明确要求时切换到其他语言。',
  '',
  '回答原则：',
  '- 先给结论，再给必要依据、步骤和验证方式；内容保持准确、可执行、可验证。',
  '- 区分请求类型：解释、审查、报告或诊断默认只读；只有用户明确要求创建、修改或执行时才改变状态。',
  '- 可在不改变目标和风险的前提下做合理假设并继续；只有关键缺失会显著改变结果或带来风险时，才提出一个简短澄清问题。',
  '',
  '工具与执行：',
  '- 仅在需要读取真实状态、操作数据或验证结果时调用工具；纯解释或已有上下文足够时直接回答。',
  '- 采用最小充分调用：先用最小范围定位，再读取或操作必要对象。复用本轮已有结果；除非需要继续分页、外部状态已变化或结果确实不足，否则不要重复发现能力、列目录、搜索或读取同一目标。',
  '- 工具失败时先阅读错误并调整参数、路径、权限或方案，不要原样重试；同一根因连续失败后停止盲试，说明阻碍并保留已有结果。',
  '- 只依据实际工具结果陈述完成状态；未得到成功结果时，不得声称文件已保存、命令已执行或测试已通过，也不得编造 id、路径、链接或数据。',
  '- 长任务先给出简短计划，分阶段执行并在关键修改后验证；达到用户目标后立即停止调用工具。',
  '',
  '安全与边界：',
  '- 遵循当前权限与审批模式；遇到高风险、不可逆或明显超出用户授权范围的操作，先说明影响并征求确认。',
  '- 不回显密钥、token、cookie、env、headers 或其他敏感信息。',
  '- 不要编造外部事实；需要最新或外部信息时，明确说明并使用可用来源验证。'
].join('\n')

function getDefaultConfigSecurity() {
  return {
    passwordVerifier: null,
    recoveryQuestion: '',
    recoveryAnswerVerifier: null,
    passwordRecoveryEnvelope: ''
  }
}

function getDefaultNoteConfig() {
  return {
    noteEditor: { ...DEFAULT_NOTE_EDITOR_CONFIG },
    noteSecurity: getDefaultNoteSecurityConfig(),
    notebookRuntime: { ...DEFAULT_NOTEBOOK_RUNTIME_CONFIG }
  }
}

function getDefaultChatConfig() {
  return {
    defaultProviderId: '',
    defaultModel: '',
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    toolApprovalMode: 'safe',
    imageGenerationMode: 'auto',
    videoGenerationMode: 'auto',
    contextWindow: { ...DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG },
    memory: normalizeChatMemoryConfig(DEFAULT_CHAT_MEMORY_CONFIG)
  }
}

function getDefaultContentSearchConfig() {
  return normalizeContentSearchConfig(DEFAULT_CONTENT_SEARCH_CONFIG)
}

function getDefaultWebSearchConfig() {
  return {
    proxyUrl: '',
    allowInsecureTlsFallback: false,
    searchApiProvider: 'none',
    searchApiKey: '',
    searchApiEndpoint: '',
    searchApiMarket: 'zh-CN'
  }
}

const globalConfig = ref({
  theme: 'light',
  chatConfig: getDefaultChatConfig(),
  contentSearchConfig: getDefaultContentSearchConfig(),
  noteConfig: getDefaultNoteConfig(),
  configSecurity: getDefaultConfigSecurity(),
  agents: {},
  providers: {},
  prompts: {},
  mcpServers: {},
  skills: {},
  timedTask: {},
  dataStorageRoot: '',
  cloudConfig: {
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucket: '',
    endpoint: '',
    forcePathStyle: null,
    autoSyncEnabled: false
  },
  webSearchConfig: getDefaultWebSearchConfig()
})

let globalConfigChangedListener = null
let hasInit = false

function getAiToolsApi() {
  return globalThis?.aiToolsApi
}

function getGlobalConfigApi() {
  return getAiToolsApi()?.config
}

function getDangerousConfigApi() {
  return getAiToolsApi()?.dangerous?.config
}

function requireGlobalConfigApi() {
  const api = getGlobalConfigApi()
  if (!api) {
    throw new Error('aiToolsApi.config 未注入（请在 uTools 插件环境中运行）')
  }
  return api
}

function requireDangerousConfigApi(featureName) {
  const api = getDangerousConfigApi()
  if (!api) {
    throw new Error(`aiToolsApi.dangerous.config.${featureName} 未注入（高危能力未开放）`)
  }
  return api
}

function init() {
  if (hasInit) {
    return dispose
  }
  hasInit = true

  try {
    const api = getGlobalConfigApi()
    if (api?.getConfig) {
      const cfg = api.getConfig()
      if (cfg && typeof cfg === 'object') {
        globalConfig.value = cfg
      }
    }
  } catch (err) {
    console.warn('初始化全局配置失败:', err)
  }

  try {
    globalConfigChangedListener = (e) => {
      const detail = e?.detail
      if (detail && typeof detail === 'object') {
        globalConfig.value = detail
      }
    }
    window.addEventListener('globalConfigChanged', globalConfigChangedListener)
  } catch (err) {
    console.warn('监听 globalConfigChanged 失败:', err)
  }

  initUtoolsAiProvider().catch((err) => {
    console.warn('初始化 uTools 官方 AI 模型失败:', err)
  })

  return dispose
}

function dispose() {
  try {
    if (globalConfigChangedListener) {
      window.removeEventListener('globalConfigChanged', globalConfigChangedListener)
      globalConfigChangedListener = null
    }
  } catch (err) {
    console.warn('停止监听 globalConfigChanged 失败:', err)
  } finally {
    hasInit = false
  }
}

function toArray(obj) {
  return Object.values(obj || {})
}

export function getAgents() {
  return computed(() => toArray(globalConfig.value.agents))
}

export function getAgentById(id) {
  return computed(() => globalConfig.value.agents[id])
}

export function addAgent(item) {
  return requireGlobalConfigApi().addAgent(item)
}

export function updateAgent(id, item) {
  return requireGlobalConfigApi().updateAgent(id, item)
}

export function deleteAgent(id) {
  return requireGlobalConfigApi().deleteAgent(id)
}

export function getProviders() {
  return computed(() => toArray(globalConfig.value.providers).map((item) => mergeUtoolsBuiltinProvider(item)))
}

export function getProviderById(id) {
  return computed(() => mergeUtoolsBuiltinProvider(globalConfig.value.providers[id]))
}

export function addProvider(item) {
  return requireGlobalConfigApi().addProvider(item)
}

export function updateProvider(id, item) {
  return requireGlobalConfigApi().updateProvider(id, item)
}

export function deleteProvider(id) {
  return requireGlobalConfigApi().deleteProvider(id)
}

export function getPrompts() {
  return computed(() => toArray(globalConfig.value.prompts))
}

export function getPromptById(id) {
  return computed(() => globalConfig.value.prompts[id])
}

export function addPrompt(item) {
  return requireGlobalConfigApi().addPrompt(item)
}

export function updatePrompt(id, item) {
  return requireGlobalConfigApi().updatePrompt(id, item)
}

export function deletePrompt(id) {
  return requireGlobalConfigApi().deletePrompt(id)
}

export function getSkills() {
  return computed(() => toArray(globalConfig.value.skills))
}

export function getSkillById(id) {
  return computed(() => globalConfig.value.skills[id])
}

export function addSkill(item) {
  return requireGlobalConfigApi().addSkill(item)
}

export function updateSkill(id, item) {
  return requireGlobalConfigApi().updateSkill(id, item)
}

export function deleteSkill(id) {
  return requireGlobalConfigApi().deleteSkill(id)
}

export function exportSkillToFile(id, filePath, options) {
  return requireGlobalConfigApi().exportSkillToFile(id, filePath, options)
}

export function installSkillPackage(rawPackage, options) {
  return requireGlobalConfigApi().installSkillPackage(rawPackage, options)
}

export function installSkillPackageFromFile(filePath, options) {
  return requireGlobalConfigApi().installSkillPackageFromFile(filePath, options)
}

export function installSkillPackageFromUrl(url, options) {
  return requireGlobalConfigApi().installSkillPackageFromUrl(url, options)
}

export function importSkillDirectory(sourcePath, options) {
  return requireGlobalConfigApi().importSkillDirectory(sourcePath, options)
}

export function importSkillFile(filePath, options) {
  return requireGlobalConfigApi().importSkillFile(filePath, options)
}

export function refreshSkillFromSource(id) {
  return requireGlobalConfigApi().refreshSkillFromSource(id)
}

export function readSkillFile(id, filePath) {
  return requireGlobalConfigApi().readSkillFile(id, filePath)
}

export function readSkillIcon(id, variant = 'small') {
  return requireGlobalConfigApi().readSkillIcon(id, variant)
}

export function listSkillFiles(id) {
  return requireGlobalConfigApi().listSkillFiles(id)
}

export function runSkillScript(id, scriptPath, options) {
  return requireDangerousConfigApi('runSkillScript').runSkillScript(id, scriptPath, options)
}

export function installSkillsFromCommand(options) {
  return requireDangerousConfigApi('installSkillsFromCommand').installSkillsFromCommand(options)
}

export function getMcpServers() {
  return computed(() => toArray(globalConfig.value.mcpServers))
}

export function getMcpServerById(id) {
  return computed(() => globalConfig.value.mcpServers[id])
}

export function addMcpServer(item) {
  return requireGlobalConfigApi().addMcpServer(item)
}

export function updateMcpServer(id, item) {
  return requireGlobalConfigApi().updateMcpServer(id, item)
}

export function deleteMcpServer(id) {
  return requireGlobalConfigApi().deleteMcpServer(id)
}

export function getTimedTasks() {
  return computed(() => toArray(globalConfig.value.timedTask))
}

export function getTimedTaskById(id) {
  return computed(() => globalConfig.value.timedTask?.[id])
}

export function addTimedTask(item) {
  return requireGlobalConfigApi().addTimedTask(item)
}

export function updateTimedTask(id, item) {
  return requireGlobalConfigApi().updateTimedTask(id, item)
}

export function deleteTimedTask(id) {
  return requireGlobalConfigApi().deleteTimedTask(id)
}

export function getTheme() {
  return computed(() => globalConfig.value.theme)
}

export function getChatConfig() {
  return computed(() => globalConfig.value.chatConfig || getDefaultChatConfig())
}

export function updateChatConfig(partial) {
  return requireGlobalConfigApi().updateChatConfig(partial)
}

export function getContentSearchConfig() {
  return computed(() => globalConfig.value.contentSearchConfig || getDefaultContentSearchConfig())
}

export function updateContentSearchConfig(partial) {
  return requireGlobalConfigApi().updateContentSearchConfig(partial)
}

export function getNoteConfig() {
  return computed(() => globalConfig.value.noteConfig || getDefaultNoteConfig())
}

export function updateNoteConfig(partial) {
  return requireGlobalConfigApi().updateNoteConfig(partial)
}

export function getConfigSecurity() {
  return computed(() => globalConfig.value.configSecurity || getDefaultConfigSecurity())
}

export function updateConfigSecurity(partial) {
  return requireGlobalConfigApi().updateConfigSecurity(partial)
}

export function updateGlobalConfig(partial) {
  return requireGlobalConfigApi().updateConfig(partial)
}

export function cutTheme() {
  return requireGlobalConfigApi().cutTheme()
}

export function getDataStorageRoot() {
  return computed(() => globalConfig.value.dataStorageRoot)
}

export function setDataStorageRoot(path) {
  return requireGlobalConfigApi().updateDataStorageRoot(path)
}

export function resetDataStorageRoot() {
  return requireGlobalConfigApi().resetDataStorageRoot()
}

export function getCloudConfig() {
  return computed(() => globalConfig.value.cloudConfig)
}

export function updateCloudConfig(partial) {
  return requireGlobalConfigApi().updateCloudConfig(partial)
}

export function getWebSearchConfig() {
  return computed(() => globalConfig.value.webSearchConfig || getDefaultWebSearchConfig())
}

export function updateWebSearchConfig(partial) {
  return requireGlobalConfigApi().updateWebSearchConfig(partial)
}

export function exportGlobalConfigToFile(filePath) {
  return requireGlobalConfigApi().exportToFile(filePath)
}

export function importGlobalConfigFromFile(filePath) {
  return requireGlobalConfigApi().importFromFile(filePath)
}

export default {
  init,
  dispose
}
