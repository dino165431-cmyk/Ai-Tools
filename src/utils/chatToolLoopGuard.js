function normalizeForSignature(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeForSignature(item))
  if (!value || typeof value !== 'object') return value
  return Object.keys(value)
    .sort()
    .reduce((out, key) => {
      out[key] = normalizeForSignature(value[key])
      return out
    }, {})
}

function normalizeToolArguments(value) {
  const raw = typeof value === 'string' ? value.trim() : value
  if (!raw) return {}
  if (typeof raw !== 'string') return normalizeForSignature(raw)
  try {
    return normalizeForSignature(JSON.parse(raw))
  } catch {
    return raw.replace(/\s+/g, ' ')
  }
}

export function buildToolCallBatchSignature(toolCalls = []) {
  const normalized = (Array.isArray(toolCalls) ? toolCalls : []).map((toolCall) => ({
    name: String(toolCall?.function?.name || '').trim(),
    arguments: normalizeToolArguments(toolCall?.function?.arguments)
  }))
  return normalized.length ? JSON.stringify(normalized) : ''
}

export function createRepeatedToolCallGuard(options = {}) {
  const maxConsecutive = Math.max(2, Math.floor(Number(options.maxConsecutive) || 3))
  let previousSignature = ''
  let consecutiveCount = 0

  return {
    observe(toolCalls = []) {
      const signature = buildToolCallBatchSignature(toolCalls)
      if (!signature) {
        previousSignature = ''
        consecutiveCount = 0
        return { blocked: false, consecutiveCount: 0, signature: '' }
      }

      if (signature === previousSignature) consecutiveCount += 1
      else {
        previousSignature = signature
        consecutiveCount = 1
      }

      return {
        blocked: consecutiveCount >= maxConsecutive,
        consecutiveCount,
        signature
      }
    },
    reset() {
      previousSignature = ''
      consecutiveCount = 0
    }
  }
}
