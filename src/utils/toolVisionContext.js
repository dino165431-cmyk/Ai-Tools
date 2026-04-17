function normalizeText(value) {
  return String(value || '').trim()
}

function estimateImagePayloadBytes(src) {
  const text = normalizeText(src)
  if (!text) return 0

  const dataUrlMatch = text.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i)
  if (!dataUrlMatch?.[1]) return text.length

  const payload = dataUrlMatch[1].replace(/\s+/g, '')
  if (!payload) return 0

  let padding = 0
  if (payload.endsWith('==')) padding = 2
  else if (payload.endsWith('=')) padding = 1

  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding)
}

function truncateText(value, maxChars = 240) {
  const text = normalizeText(value)
  if (!text || text.length <= maxChars) return text
  return `${text.slice(0, Math.max(32, maxChars - 1)).trimEnd()}…`
}

function extractTextParts(content) {
  if (content == null) return []
  if (typeof content === 'string') return normalizeText(content) ? [normalizeText(content)] : []
  if (!Array.isArray(content)) return []
  return content
    .filter((part) => part && typeof part === 'object' && (part.type === 'text' || typeof part.text === 'string' || typeof part.content === 'string'))
    .map((part) => normalizeText(part.text ?? part.content ?? ''))
    .filter(Boolean)
}

export function messageContentHasImageUrl(content) {
  return Array.isArray(content) && content.some((part) => part?.type === 'image_url' && normalizeText(part?.image_url?.url))
}

export function buildVisionFallbackTextFromContent(content, options = {}) {
  const parts = extractTextParts(content)
  const imageCount = Array.isArray(content) ? content.filter((part) => part?.type === 'image_url').length : 0
  const reason = normalizeText(options.reason || '')
  const extra = imageCount ? `（图片已省略${reason ? `：${reason}` : ''}，共 ${imageCount} 张）` : ''
  return [parts.join('\n\n'), extra].filter(Boolean).join('\n\n').trim()
}

export function shouldAutoAttachToolImagesForVision(text) {
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized) return false
  if (/(生成图片|生成一张图|生成一幅图|画图|画一张图|画一幅图|出图|产图|做个海报|image generation|generate image|draw\b|render\b|illustrate\b)/i.test(normalized)) {
    return false
  }
  return /(图片|图里|图中|看图|这张图|这幅图|配图|截图|照片|图像|识图|读图|ocr|分析图|分析图片|描述图片|描述图像|image|images|picture|photo|screenshot|diagram|chart|figure|visual)/i.test(normalized)
}

export function shouldFallbackVisionInputToText(errorText) {
  const normalized = normalizeText(errorText).toLowerCase()
  if (!normalized) return false
  if (
    normalized.includes('image_url') ||
    normalized.includes('input_image') ||
    normalized.includes('image input') ||
    normalized.includes('image inputs') ||
    normalized.includes('vision input') ||
    normalized.includes('multimodal input') ||
    normalized.includes('images are not supported') ||
    normalized.includes('does not support image') ||
    normalized.includes('only text is supported') ||
    normalized.includes('text only model') ||
    normalized.includes('unsupported media type') ||
    normalized.includes('unsupported content type')
  ) {
    return true
  }
  return (
    /(image|vision|multimodal|modalit|media|图片|图像)/i.test(normalized) &&
    /(not support|unsupported|invalid|only text|text only|不支持|仅支持文本|只支持文本|不接受|无法处理)/i.test(normalized)
  )
}

export function buildToolVisionUserMessage(options = {}) {
  const rawImages = Array.isArray(options.images) ? options.images : []
  const serverName = normalizeText(options.serverName || 'MCP')
  const toolName = normalizeText(options.toolName || 'tool')
  const userPrompt = truncateText(options.userPrompt || '', 240)
  const maxImages = Math.max(1, Math.min(10, Number(options.maxImages) || 3))
  const legacyMaxCharsPerImage = Number(options.maxCharsPerImage) || 0
  const legacyMaxTotalChars = Number(options.maxTotalChars) || 0
  const fallbackMaxBytesPerImage = legacyMaxCharsPerImage > 0
    ? Math.floor(legacyMaxCharsPerImage * 3 / 4)
    : 2 * 1024 * 1024
  const maxBytesPerImage = Math.max(256 * 1024, Number(options.maxBytesPerImage) || fallbackMaxBytesPerImage)
  const maxTotalBytes = Math.max(
    maxBytesPerImage,
    Number(options.maxTotalBytes) || (legacyMaxTotalChars > 0 ? Math.floor(legacyMaxTotalChars * 3 / 4) : 8 * 1024 * 1024)
  )

  let totalBytes = 0
  const images = []
  for (const item of rawImages) {
    const src = normalizeText(item?.src)
    if (!src) continue
    const payloadBytes = estimateImagePayloadBytes(src)
    if (payloadBytes > maxBytesPerImage) continue
    if (totalBytes + payloadBytes > maxTotalBytes) continue
    totalBytes += payloadBytes
    images.push({
      src,
      name: normalizeText(item?.name || ''),
      mime: normalizeText(item?.mime || '')
    })
    if (images.length >= maxImages) break
  }

  if (!images.length) return null

  const omitted = Math.max(0, rawImages.filter((item) => normalizeText(item?.src)).length - images.length)
  const imageNames = images.map((item) => item.name).filter(Boolean)
  const leadLines = [
    `系统补充：以下图片来自刚才的工具结果（${serverName} / ${toolName}）。这不是新的用户请求，请仅把它们当作上一条请求的参考材料，并继续完成当前回答。`
  ]
  if (userPrompt) leadLines.push(`用户当前关注点：${userPrompt}`)
  if (omitted > 0) leadLines.push(`为控制请求体，仅附上 ${images.length} 张图片，另有 ${omitted} 张未附上。`)
  const leadText = leadLines.join('\n')

  const fallbackLines = [leadText, `图片已省略，仅保留元数据：共 ${images.length} 张。`]
  if (imageNames.length) fallbackLines.push(`图片名称：${imageNames.join('、')}`)

  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: leadText
      },
      ...images.map((item) => ({
        type: 'image_url',
        image_url: { url: item.src }
      }))
    ],
    vision_fallback_text: fallbackLines.join('\n\n').trim(),
    synthetic_tool_vision: true
  }
}
