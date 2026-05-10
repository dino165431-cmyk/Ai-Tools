const fileOperations = require('./utils/file-operations')
const globalConfig = require('./utils/global-config')
const createMCPClient = require('./utils/mcp-client')
const notebookRuntime = require('./utils/notebook-runtime')
const pythonLsp = require('./utils/python-lsp')
const webOperations = require('./utils/web-operations')
const contentIndex = require('./utils/content-index')

const BRIDGE_NAME = 'aiToolsApi'
const preloadCleanupTasks = new Map()
let nextCleanupTaskId = 1
let preloadStarted = false

function bindMethods(source, methodNames) {
  return Object.freeze(methodNames.reduce((api, methodName) => {
    const fn = source?.[methodName]
    if (typeof fn === 'function') {
      api[methodName] = fn.bind(source)
    }
    return api
  }, Object.create(null)))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value

  for (const key of Object.keys(value)) {
    deepFreeze(value[key])
  }
  return Object.freeze(value)
}

function defineReadOnlyWindowProperty(name, value) {
  Object.defineProperty(window, name, {
    value,
    enumerable: false,
    configurable: false,
    writable: false
  })
}

function registerPreloadCleanup(task, label = '') {
  if (typeof task !== 'function') return () => {}

  const id = nextCleanupTaskId++
  preloadCleanupTasks.set(id, {
    label: String(label || '').trim(),
    task
  })

  return () => {
    preloadCleanupTasks.delete(id)
  }
}

async function runPreloadCleanupTasks(context = {}) {
  const tasks = Array.from(preloadCleanupTasks.entries()).reverse()
  preloadCleanupTasks.clear()

  for (const [, entry] of tasks) {
    try {
      await entry.task(context)
    } catch (err) {
      const suffix = entry.label ? ` (${entry.label})` : ''
      console.warn(`[preload lifecycle] cleanup failed${suffix}:`, err)
    }
  }
}

function startPreloadLifecycle() {
  if (preloadStarted) return true
  preloadStarted = true

  registerPreloadCleanup(() => pythonLsp.shutdownAll?.(), 'python-lsp')
  registerPreloadCleanup(() => notebookRuntime.dispose?.(), 'notebook-runtime')
  registerPreloadCleanup(() => fileOperations.dispose?.(), 'file-operations')
  registerPreloadCleanup(() => contentIndex.dispose?.(), 'content-index')

  try {
    contentIndex.init?.()
  } catch (err) {
    console.warn('初始化 content-index 生命周期失败:', err)
  }

  try {
    fileOperations.initCloudAutomation?.()
  } catch (err) {
    console.warn('初始化云端自动任务失败:', err)
  }

  return true
}

async function disposePreloadLifecycle(context = {}) {
  preloadStarted = false
  await runPreloadCleanupTasks(context)
}

const configApi = bindMethods(globalConfig, [
  'getConfig',
  'addAgent',
  'updateAgent',
  'deleteAgent',
  'addProvider',
  'updateProvider',
  'deleteProvider',
  'addPrompt',
  'updatePrompt',
  'deletePrompt',
  'addSkill',
  'updateSkill',
  'deleteSkill',
  'exportSkillToFile',
  'installSkillPackage',
  'installSkillPackageFromFile',
  'installSkillPackageFromUrl',
  'importSkillDirectory',
  'importSkillFile',
  'refreshSkillFromSource',
  'readSkillFile',
  'listSkillFiles',
  'addMcpServer',
  'updateMcpServer',
  'deleteMcpServer',
  'addTimedTask',
  'updateTimedTask',
  'deleteTimedTask',
  'updateChatConfig',
  'updateContentSearchConfig',
  'updateNoteConfig',
  'updateConfigSecurity',
  'updateConfig',
  'cutTheme',
  'updateDataStorageRoot',
  'resetDataStorageRoot',
  'updateCloudConfig',
  'updateWebSearchConfig',
  'exportToFile',
  'importFromFile'
])

const fileApi = bindMethods(fileOperations, [
  'createDirectory',
  'writeFile',
  'readFile',
  'deleteItem',
  'listDirectory',
  'exists',
  'stat',
  'openInFileManager',
  'resolvePath',
  'moveItem',
  'renameItem',
  'backupToCloud',
  'restoreFromCloud',
  'syncToCloud',
  'getFileBlobUrl',
  'getCachedFileBlobUrlSync',
  'clearImageBlobCache'
])

const notebookApi = bindMethods(notebookRuntime, [
  'detectPython',
  'listPythonModules',
  'checkPythonLsp',
  'invalidateCaches',
  'getPythonCompletions',
  'getPythonHover',
  'getPythonDefinition',
  'getPythonSignatureHelp',
  'listManagedVenvs'
])

const dangerousApi = deepFreeze({
  config: bindMethods(globalConfig, [
    'runSkillScript',
    'installSkillsFromCommand'
  ]),
  mcp: Object.freeze({
    createClient: createMCPClient
  }),
  notebook: bindMethods(notebookRuntime, [
    'createSession',
    'executeCell',
    'provideInputReply',
    'executeMagicSpecs',
    'interruptMagicExecution',
    'interruptSession',
    'restartSession',
    'forceRestartSession',
    'shutdownSession',
    'installDependencies',
    'createManagedVenv'
  ])
})

const aiToolsApi = deepFreeze({
  version: 1,
  config: configApi,
  files: fileApi,
  notebook: notebookApi,
  web: bindMethods(webOperations, [
    'webSearch',
    'webRead'
  ]),
  lifecycle: Object.freeze({
    start: startPreloadLifecycle,
    dispose: disposePreloadLifecycle,
    registerCleanup: registerPreloadCleanup,
    isStarted: () => preloadStarted
  }),
  dangerous: dangerousApi
})

try {
  globalConfig.ensureBuiltins?.()
} catch (e) {
  // ignore
}

defineReadOnlyWindowProperty(BRIDGE_NAME, aiToolsApi)

try {
  startPreloadLifecycle()
} catch (e) {
  console.warn('初始化 preload 生命周期失败:', e)
}

globalThis.__aiToolsPreloadLifecycle__ = Object.freeze({
  start: startPreloadLifecycle,
  dispose: disposePreloadLifecycle,
  registerCleanup: registerPreloadCleanup
})
