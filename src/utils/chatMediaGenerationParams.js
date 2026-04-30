export const DEFAULT_IMAGE_GENERATION_PARAMS = Object.freeze({
  size: 'auto',
  quality: 'auto'
})

export const DEFAULT_VIDEO_GENERATION_PARAMS = Object.freeze({
  size: 'auto',
  aspect_ratio: 'auto',
  duration: null,
  quality: 'auto'
})

const SUPPORTED_IMAGE_GENERATION_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024'])
const SUPPORTED_VIDEO_GENERATION_SIZES = new Set([
  '720x1280',
  '1280x720',
  '1024x1792',
  '1792x1024',
  '1080x1920',
  '1920x1080'
])
const SUPPORTED_VIDEO_GENERATION_SECONDS = [4, 8, 12]

export const IMAGE_GENERATION_SIZE_OPTIONS = [
  { label: '默认', value: 'auto' },
  { label: '方图 1024 x 1024', value: '1024x1024' },
  { label: '横版 1536 x 1024', value: '1536x1024' },
  { label: '竖版 1024 x 1536', value: '1024x1536' }
]

export const IMAGE_GENERATION_QUALITY_OPTIONS = [
  { label: '默认', value: 'auto' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
]

export const VIDEO_GENERATION_SIZE_OPTIONS = [
  { label: '默认', value: 'auto' },
  { label: '竖屏 720 x 1280', value: '720x1280' },
  { label: '横屏 1280 x 720', value: '1280x720' },
  { label: '竖屏 1024 x 1792', value: '1024x1792' },
  { label: '横屏 1792 x 1024', value: '1792x1024' },
  { label: '竖屏 1080 x 1920', value: '1080x1920' },
  { label: '横屏 1920 x 1080', value: '1920x1080' }
]

export const VIDEO_GENERATION_DURATION_OPTIONS = SUPPORTED_VIDEO_GENERATION_SECONDS.map((seconds) => ({
  label: `${seconds} 秒`,
  value: seconds
}))

export const VIDEO_GENERATION_ASPECT_RATIO_OPTIONS = [
  { label: '默认', value: 'auto' },
  { label: '横屏 16:9', value: '16:9' },
  { label: '竖屏 9:16', value: '9:16' }
]

export const VIDEO_GENERATION_QUALITY_OPTIONS = [
  { label: '默认', value: 'auto' },
  { label: '标准', value: 'standard' },
  { label: '高清 HD', value: 'hd' },
  { label: '高', value: 'high' }
]

const VALID_IMAGE_QUALITIES = new Set(IMAGE_GENERATION_QUALITY_OPTIONS.map((item) => item.value))
const VALID_VIDEO_QUALITIES = new Set(VIDEO_GENERATION_QUALITY_OPTIONS.map((item) => item.value))
const VALID_VIDEO_ASPECT_RATIOS = new Set(VIDEO_GENERATION_ASPECT_RATIO_OPTIONS.map((item) => item.value))

export function createDefaultImageGenerationParams() {
  return { ...DEFAULT_IMAGE_GENERATION_PARAMS }
}

export function createDefaultVideoGenerationParams() {
  return { ...DEFAULT_VIDEO_GENERATION_PARAMS }
}

export function normalizeMediaGenerationParamsEnabled(value) {
  return value === true
}

export function normalizeGenerationSize(value, fallback = 'auto') {
  const text = String(value || '').trim()
  if (!text || text === 'auto') return fallback
  const match = text.match(/^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/i)
  if (!match) return fallback
  const width = Math.round(Number(match[1]) || 0)
  const height = Math.round(Number(match[2]) || 0)
  if (width < 128 || height < 128 || width > 4096 || height > 4096) return fallback
  return `${width}x${height}`
}

function normalizeImageGenerationSize(value, fallback = 'auto') {
  const size = normalizeGenerationSize(value, fallback)
  if (size === 'auto') return fallback
  return SUPPORTED_IMAGE_GENERATION_SIZES.has(size) ? size : fallback
}

function normalizeVideoGenerationSize(value, fallback = 'auto') {
  const size = normalizeGenerationSize(value, fallback)
  if (size === 'auto') return fallback
  return SUPPORTED_VIDEO_GENERATION_SIZES.has(size) ? size : fallback
}

function normalizeVideoGenerationDuration(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  const duration = Number(value)
  if (!Number.isFinite(duration)) return fallback
  return SUPPORTED_VIDEO_GENERATION_SECONDS.reduce((best, candidate) => {
    return Math.abs(candidate - duration) < Math.abs(best - duration) ? candidate : best
  }, SUPPORTED_VIDEO_GENERATION_SECONDS[0])
}

export function normalizeImageGenerationParams(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const size = normalizeImageGenerationSize(source.size, DEFAULT_IMAGE_GENERATION_PARAMS.size)
  const quality = VALID_IMAGE_QUALITIES.has(String(source.quality || '').trim())
    ? String(source.quality || '').trim()
    : DEFAULT_IMAGE_GENERATION_PARAMS.quality

  return { size, quality }
}

export function normalizeVideoGenerationParams(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const size = normalizeVideoGenerationSize(source.size || source.resolution, DEFAULT_VIDEO_GENERATION_PARAMS.size)
  const aspectRatio = VALID_VIDEO_ASPECT_RATIOS.has(String(source.aspect_ratio || source.aspectRatio || '').trim())
    ? String(source.aspect_ratio || source.aspectRatio || '').trim()
    : DEFAULT_VIDEO_GENERATION_PARAMS.aspect_ratio
  const duration = normalizeVideoGenerationDuration(source.duration ?? source.seconds, DEFAULT_VIDEO_GENERATION_PARAMS.duration)
  const quality = VALID_VIDEO_QUALITIES.has(String(source.quality || '').trim())
    ? String(source.quality || '').trim()
    : DEFAULT_VIDEO_GENERATION_PARAMS.quality

  return {
    size,
    aspect_ratio: aspectRatio,
    duration,
    quality
  }
}

export function buildImageGenerationManualRequestOptions(params = {}) {
  const normalized = normalizeImageGenerationParams(params)
  const out = {}
  if (normalized.size && normalized.size !== 'auto') out.size = normalized.size
  if (normalized.quality && normalized.quality !== 'auto') out.quality = normalized.quality
  return out
}

export function buildVideoGenerationManualRequestOptions(params = {}) {
  const normalized = normalizeVideoGenerationParams(params)
  const out = {}
  if (normalized.size && normalized.size !== 'auto') out.size = normalized.size
  if (normalized.duration > 0) out.seconds = normalized.duration
  return out
}

export function buildMediaGenerationManualRequestOptions(kind, enabled, params = {}) {
  if (!normalizeMediaGenerationParamsEnabled(enabled)) return {}
  return kind === 'video'
    ? buildVideoGenerationManualRequestOptions(params)
    : buildImageGenerationManualRequestOptions(params)
}

export function summarizeImageGenerationParams(enabled, params = {}) {
  if (!normalizeMediaGenerationParamsEnabled(enabled)) return '使用模型默认'
  const normalized = normalizeImageGenerationParams(params)
  const parts = []
  parts.push(normalized.size === 'auto' ? '尺寸默认' : normalized.size)
  if (normalized.quality !== 'auto') parts.push(`质量 ${qualityLabel(normalized.quality)}`)
  return parts.join(' · ')
}

export function summarizeVideoGenerationParams(enabled, params = {}) {
  if (!normalizeMediaGenerationParamsEnabled(enabled)) return '使用模型默认'
  const normalized = normalizeVideoGenerationParams(params)
  const parts = []
  parts.push(normalized.size === 'auto' ? '分辨率默认' : normalized.size)
  if (normalized.duration > 0) parts.push(`${normalized.duration}s`)
  return parts.join(' · ')
}

function qualityLabel(value) {
  const text = String(value || '').trim()
  if (text === 'high') return '高'
  if (text === 'medium') return '中'
  if (text === 'low') return '低'
  return text || '默认'
}
