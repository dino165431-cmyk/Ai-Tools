export const DEFAULT_CHAT_MEMORY_CONFIG = Object.freeze({
  enabled: false,
  scope: 'global',
  autoExtract: true,
  extraction: Object.freeze({
    providerId: '',
    model: ''
  }),
  embedding: Object.freeze({
    providerId: '',
    model: ''
  }),
  topK: 5,
  maxInjectChars: 1600,
  minSimilarity: 0.38,
  minConfidence: 0.6,
  storeMaxItems: 200,
  profileMaxItems: 8,
  relevantMaxItems: 6
})

function normalizeString(value) {
  return String(value || '').trim()
}

function normalizeSelection(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    providerId: normalizeString(src.providerId),
    model: normalizeString(src.model)
  }
}

function normalizeIntegerInRange(value, fallback, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

function normalizeNumberInRange(value, fallback, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

export function normalizeChatMemoryConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const scope = normalizeString(src.scope).toLowerCase() === 'global' ? 'global' : 'global'

  return {
    enabled: src.enabled === true,
    scope,
    autoExtract: src.autoExtract !== false,
    extraction: normalizeSelection(src.extraction),
    embedding: normalizeSelection(src.embedding),
    topK: normalizeIntegerInRange(src.topK, DEFAULT_CHAT_MEMORY_CONFIG.topK, 1, 20),
    maxInjectChars: normalizeIntegerInRange(src.maxInjectChars, DEFAULT_CHAT_MEMORY_CONFIG.maxInjectChars, 400, 8000),
    minSimilarity: normalizeNumberInRange(src.minSimilarity, DEFAULT_CHAT_MEMORY_CONFIG.minSimilarity, 0, 1),
    minConfidence: normalizeNumberInRange(src.minConfidence, DEFAULT_CHAT_MEMORY_CONFIG.minConfidence, 0, 1),
    storeMaxItems: normalizeIntegerInRange(src.storeMaxItems, DEFAULT_CHAT_MEMORY_CONFIG.storeMaxItems, 20, 5000),
    profileMaxItems: normalizeIntegerInRange(src.profileMaxItems, DEFAULT_CHAT_MEMORY_CONFIG.profileMaxItems, 1, 20),
    relevantMaxItems: normalizeIntegerInRange(src.relevantMaxItems, DEFAULT_CHAT_MEMORY_CONFIG.relevantMaxItems, 1, 20)
  }
}

export function isChatMemoryEnabled(raw) {
  return normalizeChatMemoryConfig(raw).enabled === true
}
