export function extractModelUsage(payload) {
  if (!payload || typeof payload !== 'object') return null
  const direct =
    payload.usage ||
    payload.response?.usage ||
    payload.usageMetadata ||
    payload.usage_metadata ||
    payload.response?.usageMetadata ||
    payload.response?.usage_metadata
  if (direct && typeof direct === 'object') return direct

  const payloads = Array.isArray(payload.payloads)
    ? payload.payloads
    : Array.isArray(payload)
      ? payload
      : []
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    const nested =
      payloads[index]?.usage ||
      payloads[index]?.response?.usage ||
      payloads[index]?.usageMetadata ||
      payloads[index]?.usage_metadata
    if (nested && typeof nested === 'object') return nested
  }
  return null
}

export function readUsageNumber(usage, paths = []) {
  for (const path of paths) {
    let current = usage
    for (const key of path) {
      current = current && typeof current === 'object' ? current[key] : undefined
    }
    const value = Number(current)
    if (Number.isFinite(value) && value >= 0) return Math.floor(value)
  }
  return 0
}

export function extractContextTokenMetrics(usage) {
  if (!usage || typeof usage !== 'object') return { inputTokens: 0, cachedTokens: 0 }

  let inputTokens = readUsageNumber(usage, [
    ['prompt_tokens'],
    ['promptTokens'],
    ['promptTokenCount'],
    ['inputTokenCount'],
    ['input_tokens'],
    ['inputTokens']
  ])
  const cacheReadTokens = readUsageNumber(usage, [
    ['prompt_tokens_details', 'cached_tokens'],
    ['input_tokens_details', 'cached_tokens'],
    ['cached_tokens'],
    ['cachedTokens'],
    ['prompt_cache_hit_tokens'],
    ['cache_read_input_tokens'],
    ['cacheReadInputTokens']
  ])
  const cacheWriteTokens = readUsageNumber(usage, [
    ['prompt_tokens_details', 'cache_write_tokens'],
    ['input_tokens_details', 'cache_write_tokens'],
    ['cache_creation_input_tokens'],
    ['cacheCreationInputTokens']
  ])

  // Anthropic 的 input_tokens 不包含缓存读取/写入部分；OpenAI/DeepSeek 的
  // prompt_tokens 已经是完整输入，因此只在 Anthropic 字段出现时补加。
  const hasAnthropicCacheFields =
    Object.prototype.hasOwnProperty.call(usage, 'cache_read_input_tokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'cache_creation_input_tokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'cacheReadInputTokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'cacheCreationInputTokens')
  const hasPromptTotal =
    Object.prototype.hasOwnProperty.call(usage, 'prompt_tokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'promptTokens') ||
    Object.prototype.hasOwnProperty.call(usage, 'promptTokenCount')
  if (hasAnthropicCacheFields && !hasPromptTotal) {
    inputTokens += cacheReadTokens + cacheWriteTokens
  }

  return {
    inputTokens,
    cachedTokens: cacheReadTokens
  }
}
