export const DEFAULT_NOTEBOOK_RUNTIME_CONFIG = Object.freeze({
  pythonPath: 'python',
  venvRoot: '',
  noteEnvBindings: {},
  kernelName: '',
  startupTimeoutMs: 0,
  executeTimeoutMs: 0
})

export function normalizeNotebookRuntimeBindingKey(filePath = '') {
  const text = String(filePath || '').trim().replace(/\\/g, '/')
  if (!text) return ''
  if (/^[A-Za-z]:\//.test(text)) {
    return `${text.slice(0, 1).toLowerCase()}${text.slice(1)}`
  }
  return text
}

export function normalizeNotebookRuntimeNoteEnvBindings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return Object.fromEntries(
    Object.entries(src)
      .map(([filePath, envName]) => [
        normalizeNotebookRuntimeBindingKey(filePath),
        String(envName || '').trim()
      ])
      .filter(([filePath, envName]) => filePath && envName)
  )
}

function normalizePositiveInteger(value, fallback, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.floor(num)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function normalizeExecuteTimeoutMs(value, fallback = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.floor(num)
  if (rounded <= 0) return 0
  if (rounded > 600000) return 600000
  return rounded
}

function normalizeStartupTimeoutMs(value, fallback = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.floor(num)
  if (rounded <= 0) return 0
  if (rounded < 3000) return 3000
  if (rounded > 120000) return 120000
  return rounded
}

export function normalizeNotebookRuntimeConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    pythonPath: String(src.pythonPath || DEFAULT_NOTEBOOK_RUNTIME_CONFIG.pythonPath).trim() || DEFAULT_NOTEBOOK_RUNTIME_CONFIG.pythonPath,
    venvRoot: String(src.venvRoot || '').trim(),
    noteEnvBindings: normalizeNotebookRuntimeNoteEnvBindings(src.noteEnvBindings),
    kernelName: String(src.kernelName || '').trim(),
    startupTimeoutMs: normalizeStartupTimeoutMs(
      src.startupTimeoutMs,
      DEFAULT_NOTEBOOK_RUNTIME_CONFIG.startupTimeoutMs
    ),
    executeTimeoutMs: normalizeExecuteTimeoutMs(
      src.executeTimeoutMs,
      DEFAULT_NOTEBOOK_RUNTIME_CONFIG.executeTimeoutMs
    )
  }
}

export function getNotebookRuntimeBoundEnvName(runtimeConfig, filePath = '') {
  const normalized = normalizeNotebookRuntimeConfig(runtimeConfig)
  const bindingKey = normalizeNotebookRuntimeBindingKey(filePath)
  return bindingKey ? String(normalized.noteEnvBindings?.[bindingKey] || '').trim() : ''
}

export function setNotebookRuntimeBoundEnvName(runtimeConfig, filePath = '', envName = '') {
  const normalized = normalizeNotebookRuntimeConfig(runtimeConfig)
  const bindingKey = normalizeNotebookRuntimeBindingKey(filePath)
  if (!bindingKey) return normalized

  const nextBindings = {
    ...normalized.noteEnvBindings
  }
  const nextEnvName = String(envName || '').trim()
  if (nextEnvName) nextBindings[bindingKey] = nextEnvName
  else delete nextBindings[bindingKey]

  return normalizeNotebookRuntimeConfig({
    ...normalized,
    noteEnvBindings: nextBindings
  })
}

export function rewriteNotebookRuntimeBoundEnvName(runtimeConfig, fromFilePath = '', toFilePath = '') {
  const normalized = normalizeNotebookRuntimeConfig(runtimeConfig)
  const fromKey = normalizeNotebookRuntimeBindingKey(fromFilePath)
  const toKey = normalizeNotebookRuntimeBindingKey(toFilePath)
  if (!fromKey || !toKey || fromKey === toKey) return normalized

  const nextBindings = {
    ...normalized.noteEnvBindings
  }
  const fromEnvName = String(nextBindings[fromKey] || '').trim()
  const toEnvName = String(nextBindings[toKey] || '').trim()
  if (fromEnvName && !toEnvName) nextBindings[toKey] = fromEnvName
  delete nextBindings[fromKey]

  return normalizeNotebookRuntimeConfig({
    ...normalized,
    noteEnvBindings: nextBindings
  })
}

export function removeNotebookRuntimeBoundEnvNamesByPredicate(runtimeConfig, predicate) {
  const normalized = normalizeNotebookRuntimeConfig(runtimeConfig)
  if (typeof predicate !== 'function') return normalized

  const nextBindings = Object.fromEntries(
    Object.entries(normalized.noteEnvBindings).filter(([filePath, envName]) => !predicate(filePath, envName))
  )

  return normalizeNotebookRuntimeConfig({
    ...normalized,
    noteEnvBindings: nextBindings
  })
}
