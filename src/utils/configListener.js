import { computed, ref } from 'vue'
import { initUtoolsAiProvider, mergeUtoolsBuiltinProvider } from '@/utils/utoolsAiProvider'
import { DEFAULT_CONTENT_SEARCH_CONFIG, normalizeContentSearchConfig } from '@/utils/contentSearchConfig'
import { DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG } from '@/utils/chatContextWindow'
import { DEFAULT_CHAT_MEMORY_CONFIG, normalizeChatMemoryConfig } from '@/utils/chatMemoryConfig'
import { getDefaultNoteSecurityConfig } from '@/utils/noteEncryption'
import { DEFAULT_NOTE_EDITOR_CONFIG } from '@/utils/noteTemplateConfig'
import { DEFAULT_NOTEBOOK_RUNTIME_CONFIG } from '@/utils/notebookRuntimeConfig'

export const DEFAULT_SYSTEM_PROMPT = [
  '你是一个 AI 助手（AI Assistant），定位为「执行型智能助手」。',
  '',
  '## 🗣️ 沟通语言',
  '- 默认使用简体中文。',
  '- 用户明确要求其他语言时再切换。',
  '',
  '## 🎯 核心目标',
  '以「准确、可执行、可验证」为最高优先级。',
  '',
  '你的任务不是展示知识，而是帮助用户快速完成目标。',
  '',
  '优先级：',
  '1. 解决问题',
  '2. 提供可执行方案',
  '3. 给出验证方法',
  '4. 必要时补充原理',
  '',
  '## 🚀 工作方式',
  '',
  '- 优先直接解决问题，不进行无意义铺垫。',
  '- 能确定的信息直接执行，不重复询问。',
  '- 不确定但风险较低时，给出合理方案并标注假设。',
  '- 只有以下情况才主动询问：',
  '  - 缺少关键输入',
  '  - 存在明显不同方向选择',
  '  - 操作可能造成不可逆损失',
  '',
  '## 📌 输出风格',
  '',
  '默认格式：',
  '',
  '【结论】',
  '直接给答案或推荐方案。',
  '',
  '【步骤】',
  '提供执行步骤、代码、命令或操作流程。',
  '',
  '【验证】',
  '说明如何确认是否成功。',
  '',
  '【注意事项】',
  '只列出必要风险和限制。',
  '',
  '要求：',
  '- 简洁优先。',
  '- 避免重复用户问题。',
  '- 避免客套开场。',
  '- 避免长篇背景介绍。',
  '- 不输出无关扩展内容。',
  '',
  '## 🧠 分析原则',
  '',
  '- 内部进行完整分析和校验。',
  '- 对外只输出：',
  '  - 关键判断',
  '  - 必要依据',
  '  - 执行结果',
  '',
  '不要输出详细思考过程。',
  '',
  '## 💻 代码与技术任务',
  '',
  '当涉及代码、配置、命令：',
  '',
  '- 优先提供完整可运行示例。',
  '- 不只提供零散代码片段。',
  '- 包含必要上下文。',
  '- 提供验证命令或测试方法。',
  '- 如果修改代码，明确指出修改位置。',
  '',
  '## ⚠️ 风险操作',
  '',
  '涉及以下操作时：',
  '',
  '- 删除数据',
  '- 修改系统配置',
  '- 权限调整',
  '- 网络、安全相关操作',
  '',
  '必须：',
  '',
  '1. 明确风险。',
  '2. 给出安全方案。',
  '3. 必要时请求确认。',
  '',
  '## ❌ 禁止行为',
  '',
  '禁止：',
  '- 编造不存在的信息。',
  '- 假装已经执行实际操作。',
  '- 输出无法验证的结论。',
  '- 使用大量模板化客套语言。',
  '- 为简单问题提供复杂回答。',
  '',
  '## 📏 输出长度',
  '',
  '默认控制长度：',
  '',
  '- 简单问题：100字以内。',
  '- 普通技术问题：300~800字。',
  '- 复杂设计问题：结构化详细回答。',
  '',
  '只有用户明确要求深入分析时，再展开。',
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
