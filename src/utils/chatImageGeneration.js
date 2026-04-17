function normalizeLowercaseText(value) {
  return String(value || '').trim().toLowerCase()
}

function isDataImageUrl(url) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim())
}

function isDataVideoUrl(url) {
  return /^data:video\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim())
}

function looksLikeBase64ImagePayload(value) {
  const text = String(value || '').trim()
  if (text.length < 128) return false
  if (/\s/.test(text)) return false
  if (!/^[a-z0-9+/]+=*$/i.test(text)) return false
  if (text.length % 4 !== 0) return false
  return true
}

function guessImageMimeFromBase64(b64) {
  const head = String(b64 || '').slice(0, 32)
  if (head.startsWith('iVBOR')) return 'image/png'
  if (head.startsWith('/9j/')) return 'image/jpeg'
  if (head.startsWith('R0lGOD')) return 'image/gif'
  if (head.startsWith('UklGR')) return 'image/webp'
  if (head.startsWith('Qk')) return 'image/bmp'
  return 'image/png'
}

function buildImageDataUrl(base64, mime) {
  const text = String(base64 || '').trim()
  if (!text) return ''
  const finalMime = String(mime || '').trim() || guessImageMimeFromBase64(text)
  return `data:${finalMime};base64,${text}`
}

function normalizeInlineUrl(url) {
  return String(url || '').trim().replace(/[),.;!?]+$/, '')
}

function looksLikeImageUrl(url) {
  return /^https?:\/\/[^\s"'<>]+?\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(?:[?#][^\s"'<>]*)?$/i.test(String(url || '').trim())
}

function looksLikeVideoUrl(url) {
  return /^https?:\/\/[^\s"'<>]+?\.(mp4|webm|mov|m4v|avi|mkv)(?:[?#][^\s"'<>]*)?$/i.test(String(url || '').trim())
}

function extractImageCandidatesFromString(value) {
  const text = String(value || '').trim()
  if (!text) return []

  const candidates = []
  const seen = new Set()
  const push = (candidate) => {
    const normalized = normalizeInlineUrl(candidate)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    candidates.push(normalized)
  }

  const markdownMatches = text.match(/!\[[^\]]*]\(([^)\s]+)\)/g) || []
  markdownMatches.forEach((entry) => {
    const match = entry.match(/!\[[^\]]*]\(([^)\s]+)\)/)
    if (match?.[1]) push(match[1])
  })

  const dataUrlMatches = text.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi) || []
  dataUrlMatches.forEach(push)

  const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/gi) || []
  urlMatches.filter(looksLikeImageUrl).forEach(push)

  if (looksLikeBase64ImagePayload(text)) push(text)

  return candidates
}

function extractTextPart(part) {
  if (!part || typeof part !== 'object') return ''
  if (typeof part.text === 'string') return part.text.trim()
  if (typeof part.content === 'string') return part.content.trim()
  return ''
}

function normalizeImageOutputEntry(candidate, options = {}) {
  const fallbackName = String(options.fallbackName || '').trim() || 'image'

  if (typeof candidate === 'string') {
    const text = candidate.trim()
    if (!text) return null
    if (isDataImageUrl(text)) return { src: text, name: fallbackName, mime: '' }
    if (/^https?:\/\//i.test(text)) return { src: text, name: fallbackName, mime: '' }
    if (looksLikeBase64ImagePayload(text)) {
      const mime = guessImageMimeFromBase64(text)
      return { src: buildImageDataUrl(text, mime), name: fallbackName, mime }
    }
    return null
  }

  const obj = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null
  if (!obj) return null

  const name = String(obj.name || obj.filename || obj.fileName || obj.title || fallbackName).trim() || fallbackName
  const mime = String(obj.mime || obj.contentType || obj.media_type || obj.type || '').trim()

  const imageUrlValue =
    typeof obj.image_url === 'string'
      ? obj.image_url
      : obj.image_url && typeof obj.image_url === 'object'
        ? obj.image_url.url || obj.image_url.href || ''
        : ''

  const directSrc = String(
    obj.src ||
      obj.url ||
      obj.href ||
      obj.uri ||
      obj.imageUrl ||
      imageUrlValue ||
      obj.dataUrl ||
      obj.data_url ||
      ''
  ).trim()
  if (directSrc) {
    if (isDataImageUrl(directSrc)) return { src: directSrc, name, mime }
    if (/^https?:\/\//i.test(directSrc)) return { src: directSrc, name, mime }
  }

  const base64 = String(
    obj.base64 ||
      obj.base64_data ||
      obj.base64Data ||
      obj.b64 ||
      obj.b64_json ||
      obj.image_base64 ||
      obj.imageBase64 ||
      ''
  ).trim()
  if (base64) {
    const finalMime = mime || guessImageMimeFromBase64(base64)
    const src = buildImageDataUrl(base64, finalMime)
    if (src) return { src, name, mime: finalMime }
  }

  return null
}

function normalizeVideoOutputEntry(candidate, options = {}) {
  const fallbackName = String(options.fallbackName || '').trim() || 'video'

  if (typeof candidate === 'string') {
    const text = candidate.trim()
    if (!text) return null
    if (isDataVideoUrl(text)) return { src: text, name: fallbackName, mime: 'video/mp4' }
    if (looksLikeVideoUrl(text)) return { src: text, name: fallbackName, mime: '' }
    return null
  }

  const obj = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null
  if (!obj) return null

  const name = String(obj.name || obj.filename || obj.fileName || obj.title || fallbackName).trim() || fallbackName
  const mime = String(obj.mime || obj.contentType || obj.media_type || obj.type || '').trim()

  const videoUrlValue =
    typeof obj.video_url === 'string'
      ? obj.video_url
      : obj.video_url && typeof obj.video_url === 'object'
        ? obj.video_url.url || obj.video_url.href || ''
        : ''

  const directSrc = String(
    obj.src ||
      obj.url ||
      obj.href ||
      obj.uri ||
      obj.videoUrl ||
      videoUrlValue ||
      obj.file_url ||
      obj.fileUrl ||
      obj.content_url ||
      obj.contentUrl ||
      obj.download_url ||
      obj.downloadUrl ||
      obj.dataUrl ||
      obj.data_url ||
      ''
  ).trim()

  if (directSrc) {
    if (isDataVideoUrl(directSrc)) return { src: directSrc, name, mime: mime || 'video/mp4' }
    if (looksLikeVideoUrl(directSrc)) return { src: directSrc, name, mime }
    if (/^https?:\/\//i.test(directSrc) && /^video\//i.test(mime)) return { src: directSrc, name, mime }
  }

  const base64 = String(
    obj.base64 ||
      obj.base64_data ||
      obj.base64Data ||
      obj.b64 ||
      obj.video_base64 ||
      obj.videoBase64 ||
      ''
  ).trim()
  if (base64 && /^video\//i.test(mime)) {
    return { src: `data:${mime};base64,${base64}`, name, mime }
  }

  return null
}

export function extractImageOutputEntries(payload, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 16)
  const out = []
  const seenSrc = new Set()
  const seenObjects = new WeakSet()

  const push = (candidate, fallbackName) => {
    if (out.length >= limit) return
    const normalized = normalizeImageOutputEntry(candidate, { fallbackName })
    if (!normalized?.src || seenSrc.has(normalized.src)) return
    seenSrc.add(normalized.src)
    out.push(normalized)
  }

  const visit = (value, fallbackName = 'image', depth = 0) => {
    if (out.length >= limit || value == null || depth > 4) return

    if (typeof value === 'string') {
      const stringCandidates = extractImageCandidatesFromString(value)
      if (!stringCandidates.length) {
        push(value, fallbackName)
        return
      }
      stringCandidates.forEach((candidate) => push(candidate, fallbackName))
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${fallbackName}_${index + 1}`, depth + 1))
      return
    }

    if (typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    push(value, fallbackName)

    ;['image', 'image_url', 'imageUrl', 'dataUrl', 'data_url', 'url', 'uri'].forEach((key) => {
      if (key in value) push(value[key], fallbackName)
    })

    ;[
      'images',
      'data',
      'output',
      'outputs',
      'artifacts',
      'results',
      'choices',
      'content',
      'contents',
      'message',
      'messages'
    ].forEach((key) => {
      if (key in value) visit(value[key], fallbackName, depth + 1)
    })

    ;['result', 'response', 'body', 'payload'].forEach((key) => {
      if (key in value) visit(value[key], fallbackName, depth + 1)
    })
  }

  visit(payload)
  return out
}

export function extractVideoOutputEntries(payload, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 4)
  const out = []
  const seenSrc = new Set()
  const seenObjects = new WeakSet()

  const push = (candidate, fallbackName) => {
    if (out.length >= limit) return
    const normalized = normalizeVideoOutputEntry(candidate, { fallbackName })
    if (!normalized?.src || seenSrc.has(normalized.src)) return
    seenSrc.add(normalized.src)
    out.push(normalized)
  }

  const visit = (value, fallbackName = 'video', depth = 0) => {
    if (out.length >= limit || value == null || depth > 5) return

    if (typeof value === 'string') {
      push(value, fallbackName)
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${fallbackName}_${index + 1}`, depth + 1))
      return
    }

    if (typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    push(value, fallbackName)

    ;[
      'video',
      'video_url',
      'videoUrl',
      'file_url',
      'fileUrl',
      'content_url',
      'contentUrl',
      'download_url',
      'downloadUrl',
      'url',
      'uri'
    ].forEach((key) => {
      if (key in value) push(value[key], fallbackName)
    })

    ;[
      'videos',
      'data',
      'output',
      'outputs',
      'artifacts',
      'results',
      'choices',
      'content',
      'contents',
      'message',
      'messages'
    ].forEach((key) => {
      if (key in value) visit(value[key], fallbackName, depth + 1)
    })

    ;['result', 'response', 'body', 'payload'].forEach((key) => {
      if (key in value) visit(value[key], fallbackName, depth + 1)
    })
  }

  visit(payload)
  return out
}

export function isLikelyImageGenerationModel(model) {
  const modelId = normalizeLowercaseText(model)
  if (!modelId) return false

  const keywordMatchers = [
    'gpt-image',
    'dall-e',
    'grok-imagine',
    'qwen-image',
    'wanx',
    'seedream',
    'jimeng',
    'hunyuan-image',
    'cogview',
    'janus',
    'image-generation',
    'image_generation',
    'image-gen',
    'image_gen',
    'text-to-image',
    'text2image',
    'text2img',
    'stable-diffusion',
    'sdxl',
    'sd3',
    'sd-turbo',
    'flux',
    'flux.1',
    'black-forest-labs',
    'playground',
    'recraft',
    'ideogram',
    'imagen',
    'kolors',
    'midjourney'
  ]

  if (keywordMatchers.some((keyword) => modelId.includes(keyword))) return true
  if (/\bimage\b/.test(modelId) && !/\b(vision|embedding|rerank|whisper|tts|audio|transcribe)\b/.test(modelId)) {
    return true
  }
  return false
}

export function isLikelyVideoGenerationModel(model) {
  const modelId = normalizeLowercaseText(model)
  if (!modelId) return false

  const keywordMatchers = [
    'sora',
    'veo',
    'kling',
    'runway',
    'gen-3',
    'gen3',
    'pika',
    'hailuo',
    'luma',
    'dream-machine',
    'minimax-video',
    'video-generation',
    'video_generation',
    'video-gen',
    'video_gen',
    'text-to-video',
    'text2video',
    'img2video',
    'image-to-video',
    'seedance',
    'wan-video'
  ]

  if (keywordMatchers.some((keyword) => modelId.includes(keyword))) return true
  if (/\bvideo\b/.test(modelId) && !/\b(audio|vision|embedding|rerank|whisper|tts|transcribe)\b/.test(modelId)) {
    return true
  }
  return false
}

export function extractImageGenerationPromptFromContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        if (part.type === 'text') return extractTextPart(part)
        return extractTextPart(part)
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  if (typeof content === 'object') {
    return extractTextPart(content)
  }

  return String(content).trim()
}

function isLikelyTextFieldKey(key) {
  const normalized = String(key || '').trim().toLowerCase()
  if (!normalized) return true
  return /(^|_)(text|content|message|output_text|revised_prompt|caption|description|answer|response)$/.test(normalized)
}

function shouldSkipTextValue(value) {
  const text = String(value || '').trim()
  if (!text) return true
  if (isDataImageUrl(text)) return true
  if (looksLikeBase64ImagePayload(text)) return true
  return false
}

export function extractImageGenerationTextResult(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') return shouldSkipTextValue(payload) ? '' : payload.trim()

  const texts = []
  const seenTexts = new Set()
  const seenObjects = new WeakSet()
  const push = (value) => {
    const text = String(value || '').trim()
    if (shouldSkipTextValue(text) || seenTexts.has(text)) return
    seenTexts.add(text)
    texts.push(text)
  }

  const visit = (value, keyHint = '', depth = 0) => {
    if (value == null || depth > 6) return

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

    if (value.type === 'output_text' && typeof value.text === 'string') {
      push(value.text)
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
      'payload'
    ].forEach((key) => {
      if (key in value) visit(value[key], key, depth + 1)
    })
  }

  visit(payload)
  return texts.join('\n\n').trim()
}

export function collectImageGenerationRevisedPrompts(payload) {
  const prompts = []
  const seenObjects = new WeakSet()
  const push = (value) => {
    const text = String(value || '').trim()
    if (!text || prompts.includes(text)) return
    prompts.push(text)
  }

  if (!payload || typeof payload !== 'object') return prompts

  const visit = (value, depth = 0) => {
    if (value == null || depth > 4) return

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1))
      return
    }

    if (!value || typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    push(value.revised_prompt)
    push(value.revisedPrompt)

    ;['data', 'images', 'output', 'outputs', 'artifacts', 'results'].forEach((key) => {
      if (key in value) visit(value[key], depth + 1)
    })

    ;['result', 'response', 'body', 'payload'].forEach((key) => {
      if (key in value) visit(value[key], depth + 1)
    })
  }

  visit(payload)

  return prompts
}
