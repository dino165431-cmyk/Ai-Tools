function isDataImageUrl(url) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim())
}

function looksLikeBase64Payload(value) {
  const text = String(value || '').trim()
  if (text.length < 128) return false
  if (/\s/.test(text)) return false
  if (!/^[a-z0-9+/]+=*$/i.test(text)) return false
  if (text.length % 4 !== 0) return false
  return true
}

function stableStringify(obj, spaces = 2) {
  try {
    return JSON.stringify(obj, null, spaces)
  } catch {
    return String(obj)
  }
}

export function sanitizeToolResultForModel(result) {
  const seen = new WeakSet()
  const KEY_HINT_IMAGE = /^(images|image|artifacts)$/i
  const KEY_HINT_BASE64 = /(base64|b64|b64_json|dataurl|data_url)$/i
  const KEY_HINT_TRACE = /^(trace|events|steps|logs|debug|messages)$/i
  const MAX_DEPTH = 24

  const walk = (val, depth, keyHint) => {
    if (depth > MAX_DEPTH) return '（已截断：层级过深）'
    if (val == null) return val

    if (typeof val === 'string') {
      const key = String(keyHint || '')

      if (KEY_HINT_BASE64.test(key)) {
        if (!val) return val
        if (isDataImageUrl(val) || looksLikeBase64Payload(val) || val.length > 200) {
          return '(omitted: base64/dataUrl too long)'
        }
        return val
      }

      if (KEY_HINT_IMAGE.test(key) && (isDataImageUrl(val) || looksLikeBase64Payload(val))) {
        return '(omitted: image base64/dataUrl)'
      }

      if (val.length > 20000) {
        return `${val.slice(0, 20000)}\n(truncated: string too long, total ${val.length} chars)`
      }
      return val
    }

    if (typeof val === 'number' || typeof val === 'boolean') return val

    if (Array.isArray(val)) {
      const limit = KEY_HINT_TRACE.test(String(keyHint || '')) ? 40 : 50
      if (KEY_HINT_TRACE.test(String(keyHint || '')) && val.length > limit) {
        return [...val.slice(0, limit).map((item) => walk(item, depth + 1, keyHint)), `（已截断：数组过长，共 ${val.length} 项）`]
      }
      return val.map((item) => walk(item, depth + 1, keyHint))
    }

    if (typeof val === 'object') {
      if (seen.has(val)) return '（已省略：循环引用）'
      seen.add(val)
      const out = {}
      for (const [key, value] of Object.entries(val)) {
        out[key] = walk(value, depth + 1, key)
      }
      return out
    }

    return String(val)
  }

  return walk(result, 0, '')
}

export function stringifyToolResultForModel(result) {
  if (typeof result === 'string') return result
  return stableStringify(sanitizeToolResultForModel(result))
}
