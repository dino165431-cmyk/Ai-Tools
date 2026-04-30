export function formatAttachmentSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

export function formatMediaElapsed(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return ''
  const seconds = Math.max(1, Math.round(value / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins ? `${hours}h ${mins}m` : `${hours}h`
}

function normalizeMediaTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric < 10000000000 ? numeric * 1000 : numeric
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatMediaTimestamp(value) {
  const d = normalizeMediaTimestamp(value)
  if (!d) return ''
  try {
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return d.toISOString()
  }
}

export function formatMediaDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 60) {
    const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
    return `${rounded}s`
  }
  const totalSeconds = Math.round(value)
  const minutes = Math.floor(totalSeconds / 60)
  const rest = totalSeconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

export function getImageKindLabel({ mime = '', ext = '' } = {}) {
  if (isSvgAttachmentLike({ mime, ext })) return 'SVG'

  const normalizedMime = String(mime || '').trim().toLowerCase()
  if (normalizedMime.startsWith('image/')) {
    const subtype = normalizedMime.slice('image/'.length).trim()
    if (subtype) return subtype.toUpperCase()
  }

  const normalizedExt = String(ext || '').trim().toLowerCase()
  if (normalizedExt) {
    if (normalizedExt === 'jpg') return 'JPEG'
    return normalizedExt.toUpperCase()
  }

  return '图片'
}

export function getVideoKindLabel({ mime = '' } = {}) {
  const normalizedMime = String(mime || '').trim().toLowerCase()
  if (normalizedMime.startsWith('video/')) {
    const subtype = normalizedMime.slice('video/'.length).trim()
    if (subtype) return subtype.toUpperCase()
  }
  return 'VIDEO'
}

export function normalizeMediaDimension(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function mediaResolutionLabel({ width = 0, height = 0, resolution = '' } = {}) {
  const w = normalizeMediaDimension(width)
  const h = normalizeMediaDimension(height)
  if (w > 0 && h > 0) return `${w} x ${h}`
  const text = String(resolution || '').trim()
  if (!text) return ''
  return text.replace(/\s*[x×*]\s*/i, ' x ')
}

export function buildImageMetaLine({
  mime = '',
  ext = '',
  size = 0,
  width = 0,
  height = 0,
  resolution = '',
  requestSize = '',
  generationTimeMs = 0,
  createdAt = ''
} = {}) {
  const parts = []
  const kindLabel = getImageKindLabel({ mime, ext })
  if (kindLabel) parts.push(kindLabel)

  const sizeText = formatAttachmentSize(size)
  if (sizeText) parts.push(sizeText)

  const resolutionText = mediaResolutionLabel({ width, height, resolution })
  if (resolutionText) parts.push(resolutionText)
  else if (requestSize) parts.push(`请求尺寸：${requestSize}`)

  const elapsed = formatMediaElapsed(generationTimeMs)
  if (elapsed) parts.push(`生成用时：${elapsed}`)

  const generatedAt = formatMediaTimestamp(createdAt)
  if (generatedAt) parts.push(`生成时间：${generatedAt}`)

  return parts.join(' · ')
}

export function buildVideoMetaLine({
  mime = '',
  size = 0,
  width = 0,
  height = 0,
  resolution = '',
  durationSeconds = 0,
  generationTimeMs = 0,
  createdAt = ''
} = {}) {
  const parts = []
  const kindLabel = getVideoKindLabel({ mime })
  if (kindLabel) parts.push(kindLabel)

  const sizeText = formatAttachmentSize(size)
  if (sizeText) parts.push(sizeText)

  const resolutionText = mediaResolutionLabel({ width, height, resolution })
  if (resolutionText) parts.push(`分辨率：${resolutionText}`)

  const duration = formatMediaDuration(durationSeconds)
  if (duration) parts.push(`时长：${duration}`)

  const elapsed = formatMediaElapsed(generationTimeMs)
  if (elapsed) parts.push(`生成用时：${elapsed}`)

  const generatedAt = formatMediaTimestamp(createdAt)
  if (generatedAt) parts.push(`生成时间：${generatedAt}`)

  return parts.join(' · ')
}

export function imageMetaLabel(item) {
  if (!item || typeof item !== 'object') return ''
  if (String(item.metaLine || '').trim()) return String(item.metaLine || '').trim()
  return buildImageMetaLine({
    mime: item?.mime,
    ext: item?.ext,
    size: item?.size,
    width: item?.width,
    height: item?.height,
    resolution: item?.resolution,
    requestSize: item?.requestSize,
    generationTimeMs: item?.generationTimeMs,
    createdAt: item?.createdAt
  })
}

export function videoMetaLabel(video) {
  if (!video || typeof video !== 'object') return ''
  if (String(video.metaLine || '').trim()) return String(video.metaLine || '').trim()
  return buildVideoMetaLine({
    mime: video?.mime,
    size: video?.size,
    width: video?.width,
    height: video?.height,
    resolution: video?.resolution,
    durationSeconds: video?.durationSeconds,
    generationTimeMs: video?.generationTimeMs,
    createdAt: video?.createdAt
  })
}

function isSvgAttachmentLike({ mime = '', ext = '' } = {}) {
  const normalizedMime = String(mime || '').trim().toLowerCase()
  const normalizedExt = String(ext || '').trim().toLowerCase()
  return normalizedMime === 'image/svg+xml' || normalizedExt === 'svg'
}
