function normalizeLowercaseText(value) {
  return String(value || '').trim().toLowerCase()
}

function isDataImageUrl(url) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim())
}

function isDataVideoUrl(url) {
  return /^data:video\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim())
}

function isBlobUrl(url) {
  return /^blob:/i.test(String(url || '').trim())
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

function normalizeMediaMime(value, kind = '') {
  const text = String(value || '').trim().toLowerCase()
  const mime = text.split(';')[0].trim()
  if (!/^[a-z][a-z0-9.+-]*\/[a-z0-9.+-]+$/i.test(mime)) return ''
  if (kind && !mime.startsWith(`${kind}/`)) return ''
  return mime
}

function imageMimeFromOutputFormat(value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return ''
  if (text === 'jpg' || text === 'jpeg') return 'image/jpeg'
  if (text === 'png' || text === 'webp' || text === 'gif' || text === 'bmp' || text === 'avif') return `image/${text}`
  return ''
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

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function positiveNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function positiveInteger(value) {
  const n = positiveNumber(value)
  return n > 0 ? Math.round(n) : 0
}

function pickPositiveNumber(obj, keys = []) {
  if (!obj || typeof obj !== 'object') return 0
  for (const key of keys) {
    const value = positiveNumber(obj[key])
    if (value > 0) return value
  }
  return 0
}

function normalizeResolutionText(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const match = text.match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i)
  if (!match) return ''
  const width = positiveInteger(match[1])
  const height = positiveInteger(match[2])
  return width > 0 && height > 0 ? `${width}x${height}` : ''
}

function dimensionsFromResolutionLike(value) {
  if (!value) return { width: 0, height: 0, resolution: '' }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const width = pickPositiveNumber(value, ['width', 'w', 'image_width', 'video_width'])
    const height = pickPositiveNumber(value, ['height', 'h', 'image_height', 'video_height'])
    if (width > 0 && height > 0) {
      return {
        width: positiveInteger(width),
        height: positiveInteger(height),
        resolution: `${positiveInteger(width)}x${positiveInteger(height)}`
      }
    }
  }

  const resolution = normalizeResolutionText(value)
  if (!resolution) return { width: 0, height: 0, resolution: '' }
  const [w, h] = resolution.split('x').map((part) => positiveInteger(part))
  return { width: w, height: h, resolution }
}

function extractDimensions(obj) {
  if (!obj || typeof obj !== 'object') return { width: 0, height: 0, resolution: '' }

  let width = pickPositiveNumber(obj, [
    'width',
    'w',
    'image_width',
    'imageWidth',
    'video_width',
    'videoWidth',
    'naturalWidth'
  ])
  let height = pickPositiveNumber(obj, [
    'height',
    'h',
    'image_height',
    'imageHeight',
    'video_height',
    'videoHeight',
    'naturalHeight'
  ])

  const nestedCandidates = [
    obj.resolution,
    obj.dimensions,
    obj.dimension,
    obj.metadata,
    obj.meta,
    obj.properties,
    obj.image,
    obj.video
  ]

  let resolution = ''
  for (const candidate of nestedCandidates) {
    const dims = dimensionsFromResolutionLike(candidate)
    if (!width && dims.width) width = dims.width
    if (!height && dims.height) height = dims.height
    if (!resolution && dims.resolution) resolution = dims.resolution
    if (width && height && resolution) break
  }

  const sizeResolution = normalizeResolutionText(obj.size || obj.image_size || obj.imageSize || obj.video_size || obj.videoSize)
  if (!resolution && sizeResolution) resolution = sizeResolution
  if ((!width || !height) && sizeResolution) {
    const [w, h] = sizeResolution.split('x').map((part) => positiveInteger(part))
    if (!width && w) width = w
    if (!height && h) height = h
  }

  width = positiveInteger(width)
  height = positiveInteger(height)
  if (!resolution && width > 0 && height > 0) resolution = `${width}x${height}`
  return { width, height, resolution }
}

function extractSizeBytes(obj) {
  if (!obj || typeof obj !== 'object') return 0
  return pickPositiveNumber(obj, [
    'bytes',
    'byteLength',
    'byte_length',
    'file_size',
    'fileSize',
    'size_bytes',
    'sizeBytes',
    'content_length',
    'contentLength',
    'length',
    ...(typeof obj.size === 'number' ? ['size'] : [])
  ])
}

function extractDurationSeconds(obj) {
  if (!obj || typeof obj !== 'object') return 0
  const seconds = pickPositiveNumber(obj, [
    'duration',
    'duration_seconds',
    'durationSeconds',
    'seconds',
    'video_duration',
    'videoDuration'
  ])
  if (seconds > 0) return seconds

  const ms = pickPositiveNumber(obj, ['duration_ms', 'durationMs', 'milliseconds'])
  return ms > 0 ? ms / 1000 : 0
}

function extractGenerationTimeMs(obj) {
  if (!obj || typeof obj !== 'object') return 0
  const ms = pickPositiveNumber(obj, [
    'generation_time_ms',
    'generationTimeMs',
    'elapsed_ms',
    'elapsedMs',
    'latency_ms',
    'latencyMs',
    'processing_ms',
    'processingMs'
  ])
  if (ms > 0) return ms

  const seconds = pickPositiveNumber(obj, [
    'generation_time',
    'generationTime',
    'elapsed_seconds',
    'elapsedSeconds',
    'processing_seconds',
    'processingSeconds'
  ])
  return seconds > 0 ? seconds * 1000 : 0
}

function extractCreatedAt(obj) {
  if (!obj || typeof obj !== 'object') return ''
  return firstNonEmpty(
    obj.created_at,
    obj.createdAt,
    obj.created,
    obj.generated_at,
    obj.generatedAt,
    obj.timestamp,
    obj.time
  )
}

function extractRequestSize(obj) {
  if (!obj || typeof obj !== 'object') return ''
  return firstNonEmpty(
    normalizeResolutionText(obj.request_size),
    normalizeResolutionText(obj.requestSize),
    normalizeResolutionText(obj.prompt_size),
    normalizeResolutionText(obj.promptSize),
    normalizeResolutionText(obj.size)
  )
}

function mergeMediaMetadata(inherited = {}, local = {}) {
  const next = { ...(inherited && typeof inherited === 'object' ? inherited : {}) }
  Object.entries(local && typeof local === 'object' ? local : {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) return
    next[key] = value
  })
  return next
}

function extractMediaMetadata(obj, inherited = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return inherited || {}
  const dimensions = extractDimensions(obj)
  return mergeMediaMetadata(inherited, {
    size: extractSizeBytes(obj),
    width: dimensions.width,
    height: dimensions.height,
    resolution: dimensions.resolution,
    requestSize: extractRequestSize(obj),
    durationSeconds: extractDurationSeconds(obj),
    generationTimeMs: extractGenerationTimeMs(obj),
    createdAt: extractCreatedAt(obj)
  })
}

function normalizeImageOutputEntry(candidate, options = {}) {
  const fallbackName = String(options.fallbackName || '').trim() || 'image'
  const inheritedMeta = extractMediaMetadata(options.inheritedMeta)
  const withMeta = (entry, localMeta = {}) => ({
    ...mergeMediaMetadata(inheritedMeta, localMeta),
    ...entry
  })

  if (typeof candidate === 'string') {
    const text = candidate.trim()
    if (!text) return null
    if (isDataImageUrl(text)) return withMeta({ src: text, name: fallbackName, mime: '' })
    if (/^https?:\/\//i.test(text)) return withMeta({ src: text, name: fallbackName, mime: '' })
    if (looksLikeBase64ImagePayload(text)) {
      const mime = guessImageMimeFromBase64(text)
      return withMeta({ src: buildImageDataUrl(text, mime), name: fallbackName, mime })
    }
    return null
  }

  const obj = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null
  if (!obj) return null
  const localMeta = extractMediaMetadata(obj, inheritedMeta)

  const name = String(obj.name || obj.filename || obj.fileName || obj.title || fallbackName).trim() || fallbackName
  const mime =
    normalizeMediaMime(firstNonEmpty(obj.mime, obj.contentType, obj.media_type), 'image') ||
    imageMimeFromOutputFormat(obj.output_format || obj.outputFormat) ||
    normalizeMediaMime(obj.type, 'image')

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
    if (isDataImageUrl(directSrc)) return withMeta({ src: directSrc, name, mime }, localMeta)
    if (isBlobUrl(directSrc) && /^image\//i.test(mime)) return withMeta({ src: directSrc, name, mime }, localMeta)
    if (/^https?:\/\//i.test(directSrc)) return withMeta({ src: directSrc, name, mime }, localMeta)
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
    if (src) return withMeta({ src, name, mime: finalMime }, localMeta)
  }

  return null
}

function normalizeVideoOutputEntry(candidate, options = {}) {
  const fallbackName = String(options.fallbackName || '').trim() || 'video'
  const inheritedMeta = extractMediaMetadata(options.inheritedMeta)
  const withMeta = (entry, localMeta = {}) => ({
    ...mergeMediaMetadata(inheritedMeta, localMeta),
    ...entry
  })

  if (typeof candidate === 'string') {
    const text = candidate.trim()
    if (!text) return null
    if (isDataVideoUrl(text)) return withMeta({ src: text, name: fallbackName, mime: 'video/mp4' })
    if (looksLikeVideoUrl(text)) return withMeta({ src: text, name: fallbackName, mime: '' })
    return null
  }

  const obj = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null
  if (!obj) return null
  const localMeta = extractMediaMetadata(obj, inheritedMeta)

  const name = String(obj.name || obj.filename || obj.fileName || obj.title || fallbackName).trim() || fallbackName
  const mime =
    normalizeMediaMime(firstNonEmpty(obj.mime, obj.contentType, obj.content_type, obj.media_type, obj.mediaType), 'video') ||
    normalizeMediaMime(obj.type, 'video')
  const videoHint = ['video', 'video_generation', 'video_generation.completed'].includes(normalizeLowercaseText(obj.type)) ||
    normalizeLowercaseText(obj.object) === 'video' ||
    /^video[_-]/i.test(name)

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
    if (isDataVideoUrl(directSrc)) return withMeta({ src: directSrc, name, mime: mime || 'video/mp4' }, localMeta)
    if (isBlobUrl(directSrc) && /^video\//i.test(mime)) return withMeta({ src: directSrc, name, mime }, localMeta)
    if (isBlobUrl(directSrc) && videoHint) return withMeta({ src: directSrc, name, mime: mime || 'video/mp4' }, localMeta)
    if (looksLikeVideoUrl(directSrc)) return withMeta({ src: directSrc, name, mime }, localMeta)
    if (/^https?:\/\//i.test(directSrc) && /^video\//i.test(mime)) return withMeta({ src: directSrc, name, mime }, localMeta)
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
    return withMeta({ src: `data:${mime};base64,${base64}`, name, mime }, localMeta)
  }

  return null
}

export function extractImageOutputEntries(payload, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 16)
  const out = []
  const seenSrc = new Set()
  const seenObjects = new WeakSet()

  const push = (candidate, fallbackName, inheritedMeta = {}) => {
    if (out.length >= limit) return
    const normalized = normalizeImageOutputEntry(candidate, { fallbackName, inheritedMeta })
    if (!normalized?.src || seenSrc.has(normalized.src)) return
    seenSrc.add(normalized.src)
    out.push(normalized)
  }

  const visit = (value, fallbackName = 'image', depth = 0, inheritedMeta = {}) => {
    if (out.length >= limit || value == null || depth > 4) return

    if (typeof value === 'string') {
      const stringCandidates = extractImageCandidatesFromString(value)
      if (!stringCandidates.length) {
        push(value, fallbackName, inheritedMeta)
        return
      }
      stringCandidates.forEach((candidate) => push(candidate, fallbackName, inheritedMeta))
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${fallbackName}_${index + 1}`, depth + 1, inheritedMeta))
      return
    }

    if (typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    const currentMeta = extractMediaMetadata(value, inheritedMeta)
    push(value, fallbackName, currentMeta)

    ;['image', 'image_url', 'imageUrl', 'dataUrl', 'data_url', 'url', 'uri'].forEach((key) => {
      if (key in value) push(value[key], fallbackName, currentMeta)
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
      if (key in value) visit(value[key], fallbackName, depth + 1, currentMeta)
    })

    ;['result', 'response', 'body', 'payload'].forEach((key) => {
      if (key in value) visit(value[key], fallbackName, depth + 1, currentMeta)
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

  const push = (candidate, fallbackName, inheritedMeta = {}) => {
    if (out.length >= limit) return
    const normalized = normalizeVideoOutputEntry(candidate, { fallbackName, inheritedMeta })
    if (!normalized?.src || seenSrc.has(normalized.src)) return
    seenSrc.add(normalized.src)
    out.push(normalized)
  }

  const visit = (value, fallbackName = 'video', depth = 0, inheritedMeta = {}) => {
    if (out.length >= limit || value == null || depth > 5) return

    if (typeof value === 'string') {
      push(value, fallbackName, inheritedMeta)
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${fallbackName}_${index + 1}`, depth + 1, inheritedMeta))
      return
    }

    if (typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    const currentMeta = extractMediaMetadata(value, inheritedMeta)
    push(value, fallbackName, currentMeta)

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
      if (key in value) push(value[key], fallbackName, currentMeta)
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
      if (key in value) visit(value[key], fallbackName, depth + 1, currentMeta)
    })

    ;['result', 'response', 'body', 'payload'].forEach((key) => {
      if (key in value) visit(value[key], fallbackName, depth + 1, currentMeta)
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
