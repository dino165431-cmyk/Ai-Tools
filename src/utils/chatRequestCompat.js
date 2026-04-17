function normalizeLowercaseText(value) {
  return String(value || '').trim().toLowerCase()
}

function hasStandaloneR1Token(value) {
  return /(?:^|[^a-z0-9])r1(?:[^a-z0-9]|$)/i.test(String(value || ''))
}

export function isDeepSeekReasonerModel(model) {
  const modelId = normalizeLowercaseText(model)
  if (!modelId) return false
  if (modelId.includes('deepseek-reasoner')) return true
  if (!modelId.includes('deepseek')) return false
  return modelId.includes('reasoner') || hasStandaloneR1Token(modelId)
}

export function shouldIncludeReasoningContent({ baseUrl = '', model = '', forceReasoningContent = false } = {}) {
  if (forceReasoningContent) return true

  const base = normalizeLowercaseText(baseUrl)
  const modelId = normalizeLowercaseText(model)
  if (isDeepSeekReasonerModel(modelId)) return true

  return base.includes('deepseek') && (modelId.includes('reasoner') || hasStandaloneR1Token(modelId))
}

function stringifyLength(value) {
  if (value == null) return 0
  if (typeof value === 'string') return value.length
  try {
    return JSON.stringify(value).length
  } catch {
    return String(value).length
  }
}

export function estimateToolDefinitionsChars(tools) {
  if (!Array.isArray(tools) || !tools.length) return 0
  return stringifyLength(tools)
}

export function calculateReservedRequestChars({ systemContent = '', tools = [] } = {}) {
  return String(systemContent || '').length + estimateToolDefinitionsChars(tools)
}

export function calculateHistoryContextCharBudget({ baseChars = 0, reservedChars = 0 } = {}) {
  const base = Number(baseChars)
  if (!Number.isFinite(base) || base <= 0) return 0

  const floorChars = Math.max(4000, Math.floor(base * 0.35))
  const reserved = Math.max(0, Math.floor(Number(reservedChars) || 0))
  return Math.max(floorChars, base - reserved)
}
