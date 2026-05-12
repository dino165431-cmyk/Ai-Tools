const DANGEROUS_NOTEBOOK_METHODS = new Set([
  'createSession',
  'executeCell',
  'executeJavaScriptCell',
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

function getAiToolsApi() {
  return globalThis?.aiToolsApi
}

function getNotebookRuntimeApi(methodName) {
  const bridge = getAiToolsApi()
  return DANGEROUS_NOTEBOOK_METHODS.has(methodName)
    ? bridge?.dangerous?.notebook
    : bridge?.notebook
}

function rejectNotInjected(methodName) {
  const namespace = DANGEROUS_NOTEBOOK_METHODS.has(methodName)
    ? 'aiToolsApi.dangerous.notebook'
    : 'aiToolsApi.notebook'
  return Promise.reject(
    new Error(`${namespace}.${methodName} 未注入（请在 uTools 插件环境中运行）`)
  )
}

function callNotebookRuntime(methodName, ...args) {
  const api = getNotebookRuntimeApi(methodName)
  const fn = api?.[methodName]
  if (typeof fn !== 'function') return rejectNotInjected(methodName)

  try {
    const result = fn.apply(api, args)
    if (result && typeof result.then === 'function') return result
    return Promise.resolve(result)
  } catch (err) {
    return Promise.reject(err)
  }
}

export function createNotebookSession(options) {
  return callNotebookRuntime('createSession', options)
}

export function executeNotebookCell(sessionId, options) {
  return callNotebookRuntime('executeCell', sessionId, options)
}

export function executeNotebookJavaScriptCell(options) {
  return callNotebookRuntime('executeJavaScriptCell', options)
}

export function provideNotebookCellInput(sessionId, options) {
  return callNotebookRuntime('provideInputReply', sessionId, options)
}

export function executeNotebookMagicSpecs(options) {
  return callNotebookRuntime('executeMagicSpecs', options)
}

export function interruptNotebookMagicExecution(executionId) {
  return callNotebookRuntime('interruptMagicExecution', executionId)
}

export function interruptNotebookSession(sessionId) {
  return callNotebookRuntime('interruptSession', sessionId)
}

export function restartNotebookSession(sessionId) {
  return callNotebookRuntime('restartSession', sessionId)
}

export function forceRestartNotebookSession(sessionId, options) {
  return callNotebookRuntime('forceRestartSession', sessionId, options)
}

export function shutdownNotebookSession(sessionId) {
  return callNotebookRuntime('shutdownSession', sessionId)
}

export function detectNotebookPython() {
  return callNotebookRuntime('detectPython')
}

export function installNotebookDependencies(options) {
  return callNotebookRuntime('installDependencies', options)
}

export function listNotebookPythonModules(options) {
  return callNotebookRuntime('listPythonModules', options)
}

export function checkNotebookPythonLsp(options) {
  return callNotebookRuntime('checkPythonLsp', options)
}

export function invalidateNotebookRuntimeCaches(options) {
  return callNotebookRuntime('invalidateCaches', options)
}

export function getNotebookPythonCompletions(options) {
  return callNotebookRuntime('getPythonCompletions', options)
}

export function getNotebookPythonHover(options) {
  return callNotebookRuntime('getPythonHover', options)
}

export function getNotebookPythonDefinition(options) {
  return callNotebookRuntime('getPythonDefinition', options)
}

export function getNotebookPythonSignatureHelp(options) {
  return callNotebookRuntime('getPythonSignatureHelp', options)
}

export function listManagedNotebookVenvs() {
  return callNotebookRuntime('listManagedVenvs')
}

export function createManagedNotebookVenv(options) {
  return callNotebookRuntime('createManagedVenv', options)
}
