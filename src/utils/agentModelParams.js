export const AGENT_REASONING_EFFORT_OPTIONS = ['auto', 'low', 'medium', 'high']

function normalizeOptionalNumber(value, options = {}) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null

  const { min = -Infinity, max = Infinity, integer = false } = options
  if (num < min || num > max) return null
  if (integer && !Number.isInteger(num)) return null
  return num
}

function normalizeReasoningEffort(value) {
  if (value === '' || value === null || value === undefined) return null
  const normalized = String(value).trim().toLowerCase()
  return AGENT_REASONING_EFFORT_OPTIONS.includes(normalized) ? normalized : null
}

export function createEmptyAgentModelParams() {
  return {
    temperature: null,
    topP: null,
    maxTokens: null,
    presencePenalty: null,
    frequencyPenalty: null,
    seed: null,
    reasoningEffort: null
  }
}

export function normalizeAgentModelParams(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    temperature: normalizeOptionalNumber(src.temperature, { min: 0, max: 2 }),
    topP: normalizeOptionalNumber(src.topP ?? src.top_p, { min: 0, max: 1 }),
    maxTokens: normalizeOptionalNumber(src.maxTokens ?? src.max_tokens, { min: 1, integer: true }),
    presencePenalty: normalizeOptionalNumber(src.presencePenalty ?? src.presence_penalty, { min: -2, max: 2 }),
    frequencyPenalty: normalizeOptionalNumber(src.frequencyPenalty ?? src.frequency_penalty, { min: -2, max: 2 }),
    seed: normalizeOptionalNumber(src.seed, { integer: true }),
    reasoningEffort: normalizeReasoningEffort(src.reasoningEffort ?? src.reasoning_effort)
  }
}

export function compactAgentModelParams(raw) {
  const normalized = normalizeAgentModelParams(raw)
  const compacted = {}

  if (normalized.temperature !== null) compacted.temperature = normalized.temperature
  if (normalized.topP !== null) compacted.topP = normalized.topP
  if (normalized.maxTokens !== null) compacted.maxTokens = normalized.maxTokens
  if (normalized.presencePenalty !== null) compacted.presencePenalty = normalized.presencePenalty
  if (normalized.frequencyPenalty !== null) compacted.frequencyPenalty = normalized.frequencyPenalty
  if (normalized.seed !== null) compacted.seed = normalized.seed
  if (normalized.reasoningEffort) compacted.reasoningEffort = normalized.reasoningEffort

  return Object.keys(compacted).length ? compacted : null
}

export function countConfiguredAgentModelParams(raw) {
  return Object.keys(compactAgentModelParams(raw) || {}).length
}

export function buildRequestOverridesFromAgentModelParams(raw, options = {}) {
  const { includeReasoningEffort = false } = options
  const normalized = normalizeAgentModelParams(raw)
  const overrides = {}

  if (normalized.temperature !== null) overrides.temperature = normalized.temperature
  if (normalized.topP !== null) overrides.top_p = normalized.topP
  if (normalized.maxTokens !== null) overrides.max_tokens = normalized.maxTokens
  if (normalized.presencePenalty !== null) overrides.presence_penalty = normalized.presencePenalty
  if (normalized.frequencyPenalty !== null) overrides.frequency_penalty = normalized.frequencyPenalty
  if (normalized.seed !== null) overrides.seed = normalized.seed
  if (includeReasoningEffort && normalized.reasoningEffort) overrides.reasoning_effort = normalized.reasoningEffort

  return overrides
}

export function getAgentReasoningEffortOverride(raw) {
  return normalizeAgentModelParams(raw).reasoningEffort
}
