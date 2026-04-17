function isDataMediaUrl(value) {
  return /^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(String(value || '').trim())
}

function looksLikeBase64BinaryPayload(value) {
  const text = String(value || '').trim()
  if (text.length < 128) return false
  if (/\s/.test(text)) return false
  if (!/^[a-z0-9+/]+=*$/i.test(text)) return false
  if (text.length % 4 !== 0) return false
  return true
}

function shouldSkipTextValue(value) {
  const text = String(value || '').trim()
  if (!text) return true
  if (isDataMediaUrl(text)) return true
  if (looksLikeBase64BinaryPayload(text)) return true
  return false
}

function isLikelyTextFieldKey(key) {
  const normalized = String(key || '').trim().toLowerCase()
  if (!normalized) return true
  return /(^|_)(text|content|message|output|output_text|response|answer|description|caption|summary|result)$/.test(normalized)
}

function extractTextValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value !== 'object') return ''
  if (typeof value.text === 'string') return value.text.trim()
  if (value.text && typeof value.text === 'object' && typeof value.text.value === 'string') {
    return value.text.value.trim()
  }
  if (typeof value.content === 'string') return value.content.trim()
  if (typeof value.value === 'string') return value.value.trim()
  return ''
}

function collectAssistantTextFragments(payload, options = {}) {
  const maxDepth = Math.max(1, Number(options.maxDepth) || 8)
  const texts = []
  const seenTexts = new Set()
  const seenObjects = new WeakSet()

  const push = (value) => {
    const text = extractTextValue(value)
    if (shouldSkipTextValue(text) || seenTexts.has(text)) return
    seenTexts.add(text)
    texts.push(text)
  }

  const visit = (value, keyHint = '', depth = 0) => {
    if (value == null || depth > maxDepth) return

    if (typeof value === 'string') {
      if (isLikelyTextFieldKey(keyHint)) push(value)
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, keyHint, depth + 1))
      return
    }

    if (typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    const type = String(value.type || '').trim().toLowerCase()
    if (type === 'output_text' || type === 'text' || type === 'message:output_text') {
      push(value)
    }

    if (type === 'message' && Array.isArray(value.content)) {
      visit(value.content, 'content', depth + 1)
    }

    ;[
      'output_text',
      'text',
      'content',
      'contents',
      'message',
      'messages',
      'output',
      'outputs',
      'choices',
      'result',
      'results',
      'response',
      'responses',
      'body',
      'payload',
      'data'
    ].forEach((key) => {
      if (key in value) visit(value[key], key, depth + 1)
    })
  }

  visit(payload)
  return texts
}

export function extractAssistantTextFromPayload(payload) {
  return collectAssistantTextFragments(payload).join('\n\n').trim()
}

export function extractAssistantTextFromPayloads(payloads) {
  const list = Array.isArray(payloads) ? payloads : [payloads]
  const deltas = []

  list.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const type = String(item.type || '').trim().toLowerCase()
    if ((/output_text\.delta$/.test(type) || /text\.delta$/.test(type)) && typeof item.delta === 'string') {
      deltas.push(item.delta)
    }
  })

  const deltaText = deltas.join('').trim()
  if (deltaText) return deltaText

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const text = extractAssistantTextFromPayload(list[i])
    if (text) return text
  }

  return extractAssistantTextFromPayload(list)
}
