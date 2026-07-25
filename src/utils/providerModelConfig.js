const API_MODE_VALUES = new Set(['auto', 'responses', 'chat-completions'])
const MODEL_TYPE_VALUES = new Set(['auto', 'chat', 'image-generation', 'video-generation', 'embedding'])

export const PROVIDER_API_MODE_OPTIONS = Object.freeze([
  { label: '自动选择（推荐）', value: 'auto' },
  { label: 'Responses API', value: 'responses' },
  { label: 'Chat Completions API', value: 'chat-completions' }
])

export const PROVIDER_MODEL_TYPE_OPTIONS = Object.freeze([
  { label: '自动识别', value: 'auto' },
  { label: '对话模型', value: 'chat' },
  { label: '图片生成', value: 'image-generation' },
  { label: '视频生成', value: 'video-generation' },
  { label: '向量模型', value: 'embedding' }
])

export function normalizeProviderApiMode(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (normalized === 'response' || normalized === 'responses-api') return 'responses'
  if (
    normalized === 'chat' ||
    normalized === 'chat-completion' ||
    normalized === 'chat-completions-api' ||
    normalized === 'chatcompletion' ||
    normalized === 'chatcompletions'
  ) {
    return 'chat-completions'
  }
  return API_MODE_VALUES.has(normalized) ? normalized : 'auto'
}

export function getProviderApiModeLabel(value) {
  const mode = normalizeProviderApiMode(value)
  return PROVIDER_API_MODE_OPTIONS.find((option) => option.value === mode)?.label || PROVIDER_API_MODE_OPTIONS[0].label
}

export function resolveChatApiMode({ configuredMode = 'auto', preferResponses = false } = {}) {
  const mode = normalizeProviderApiMode(configuredMode)
  if (mode !== 'auto') return mode
  return preferResponses ? 'responses' : 'chat-completions'
}

export function allowsAutomaticApiFallback(value) {
  return normalizeProviderApiMode(value) === 'auto'
}

export function normalizeProviderModelType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (normalized === 'text' || normalized === 'conversation') return 'chat'
  if (normalized === 'image' || normalized === 'image-generation-model') return 'image-generation'
  if (normalized === 'video' || normalized === 'video-generation-model') return 'video-generation'
  if (normalized === 'embeddings' || normalized === 'vector') return 'embedding'
  return MODEL_TYPE_VALUES.has(normalized) ? normalized : 'auto'
}

export function normalizeProviderModelTypes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized = {}
  Object.entries(value).forEach(([model, type]) => {
    const modelId = String(model || '').trim()
    const modelType = normalizeProviderModelType(type)
    if (modelId && modelType !== 'auto') normalized[modelId] = modelType
  })
  return normalized
}

export function getProviderModelType(provider, model) {
  const modelId = String(model || '').trim()
  if (!modelId) return 'auto'
  return normalizeProviderModelType(provider?.modelTypes?.[modelId])
}
