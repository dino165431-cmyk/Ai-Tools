import { buildImageMetaLine, formatAttachmentSize, getImageKindLabel } from './chatMediaMetadata.js'
import {
  buildImageGenerationManualRequestOptions,
  buildVideoGenerationManualRequestOptions
} from './chatMediaGenerationParams.js'

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
// Keep current-turn text near the largest commonly available long-context models
// (~1M tokens, approximated as 4.2 characters per token).
export const MAX_ATTACHMENT_TEXT_CHARS = 4_200_000
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024

const DIRECT_TEXT_ATTACHMENT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'mdx', 'json', 'jsonc', 'jsonl', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'csv', 'tsv', 'xml', 'html',
  'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts',
  'cts', 'tsx', 'vue', 'py', 'java', 'kt', 'kts', 'groovy', 'gradle', 'c',
  'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx', 'cs', 'go', 'rs', 'rb',
  'php', 'swift', 'm', 'mm', 'scala', 'sh', 'bash', 'zsh', 'fish', 'ps1',
  'bat', 'cmd', 'sql', 'r', 'lua', 'pl', 'pm', 'dart', 'proto', 'properties',
  'gitignore', 'gitattributes', 'editorconfig'
])
const WORKER_PARSED_ATTACHMENT_EXTENSIONS = new Set(['pdf', 'docx', 'xls', 'xlsx', 'pptx'])
const CONVERTIBLE_ATTACHMENT_EXTENSIONS = new Set(['doc', 'ppt'])
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  ...DIRECT_TEXT_ATTACHMENT_EXTENSIONS,
  ...WORKER_PARSED_ATTACHMENT_EXTENSIONS,
  ...CONVERTIBLE_ATTACHMENT_EXTENSIONS
])
const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/geo+json',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/xhtml+xml',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
  'application/x-toml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/sql',
  'application/x-sh',
  'application/x-httpd-php'
])
const MIME_EXTENSION_MAP = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
  'text/typescript': 'ts',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/xml': 'xml',
  'application/json': 'json',
  'application/ld+json': 'jsonld',
  'application/geo+json': 'json',
  'application/javascript': 'js',
  'application/x-javascript': 'js',
  'application/typescript': 'ts',
  'application/xml': 'xml',
  'application/xhtml+xml': 'html',
  'application/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'application/toml': 'toml',
  'application/x-toml': 'toml',
  'application/sql': 'sql',
  'application/x-sh': 'sh',
  'application/x-httpd-php': 'php',
  'application/pdf': 'pdf'
})
const IMAGE_ATTACHMENT_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'])
const SVG_TEXT_PREVIEW_MAX_CHARS = 240

export const ATTACH_ACCEPT = ['image/*', ...Array.from(SUPPORTED_ATTACHMENT_EXTENSIONS).map((ext) => `.${ext}`)].join(',')

export function getFileExt(name) {
  const value = String(name || '')
  const index = value.lastIndexOf('.')
  return index === -1 ? '' : value.slice(index + 1).toLowerCase()
}

export function guessExtensionFromMime(mime) {
  const normalizedMime = String(mime || '').trim().toLowerCase()
  if (!normalizedMime) return ''
  return MIME_EXTENSION_MAP[normalizedMime] || ''
}

export function normalizeAttachmentName(file, options = {}) {
  const preferredName = String(options.name || '').trim()
  if (preferredName) return preferredName

  const fileName = String(file?.name || '').trim()
  if (fileName) return fileName

  const extension = guessExtensionFromMime(file?.type)
  return extension ? `pasted-file.${extension}` : 'pasted-file'
}

export function truncateText(text, maxChars, suffix) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (!maxChars || raw.length <= maxChars) return raw
  return `${raw.slice(0, maxChars)}\n\n${suffix || `(content truncated, total ${raw.length} chars)`}`
}

export function truncateInlineText(text, maxChars = 160) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  if (!maxChars || raw.length <= maxChars) return raw
  return `${raw.slice(0, maxChars)}...`
}

export function truncateAttachmentContextForRequest(leadText, attachmentBlock, maxChars) {
  const lead = String(leadText || '').trim()
  const attachment = String(attachmentBlock || '').trim()
  const combined = [lead, attachment].filter(Boolean).join('\n\n')
  const limit = Number(maxChars)

  if (!attachment || !Number.isFinite(limit) || limit <= 0 || combined.length <= limit) return combined

  const suffix = `(attachment content truncated for current request budget, total ${combined.length} chars)`
  if (!lead) return truncateText(attachment, limit, suffix)

  const reserved = lead.length + suffix.length + 4
  if (reserved >= limit) return truncateText(combined, limit, suffix)

  const remaining = Math.max(0, limit - reserved)
  return [lead, attachment.slice(0, remaining).trimEnd(), suffix].filter(Boolean).join('\n\n')
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export function getMediaReferenceImageUrl(item) {
  if (typeof item === 'string') return item.trim()
  return String(item?.dataUrl || item?.src || item?.url || item?.image_url?.url || '').trim()
}

export function normalizeMediaReferenceImagesForRequest(items = []) {
  const seen = new Set()
  const normalized = []
  ;(Array.isArray(items) ? items : [items]).forEach((item, index) => {
    const dataUrl = getMediaReferenceImageUrl(item)
    if (!dataUrl || seen.has(dataUrl)) return
    seen.add(dataUrl)
    normalized.push({
      dataUrl,
      name: String(item?.name || item?.filename || `reference_${index + 1}.png`).trim() || `reference_${index + 1}.png`,
      mime: String(item?.mime || item?.type || '').trim(),
      size: Number(item?.size || 0),
      width: Number(item?.width || 0),
      height: Number(item?.height || 0),
      metaLine: String(item?.metaLine || '').trim()
    })
  })
  return normalized
}

export function getReferenceImagesFromRequestOptions(options = {}) {
  if (!options || typeof options !== 'object') return []
  const candidates = [
    options.referenceImages,
    options.reference_images,
    options.inputImages,
    options.input_images,
    options.input_reference,
    options.inputReference
  ]
  for (const candidate of candidates) {
    const references = normalizeMediaReferenceImagesForRequest(candidate)
    if (references.length) return references
  }
  return []
}

export function mergeReferenceImagesIntoRequestOptions(options = {}, referenceImages = [], kind = 'image') {
  const references = normalizeMediaReferenceImagesForRequest(referenceImages)
  const merged = options && typeof options === 'object' ? { ...options } : {}
  if (!references.length) return merged

  merged.referenceImages = references
  if (kind === 'video' && !merged.input_reference && !merged.inputReference) {
    merged.input_reference = references.length === 1 ? references[0] : references
  }
  return merged
}

export function buildImageGenerationRequestOptionsWithReferences(requestOptionsOverride = null) {
  const source = requestOptionsOverride && typeof requestOptionsOverride === 'object' ? requestOptionsOverride : {}
  return mergeReferenceImagesIntoRequestOptions(
    buildImageGenerationManualRequestOptions(source),
    getReferenceImagesFromRequestOptions(source),
    'image'
  )
}

export function buildVideoGenerationRequestOptionsWithReferences(requestOptionsOverride = null) {
  const source = requestOptionsOverride && typeof requestOptionsOverride === 'object' ? requestOptionsOverride : {}
  return mergeReferenceImagesIntoRequestOptions(
    buildVideoGenerationManualRequestOptions(source),
    getReferenceImagesFromRequestOptions(source),
    'video'
  )
}

export function buildDisplayImagesFromReferenceAttachments(referenceImages = [], createId = () => '') {
  return normalizeMediaReferenceImagesForRequest(referenceImages).map((image) => ({
    id: createId(),
    src: image.dataUrl,
    name: image.name || 'image',
    mime: image.mime || '',
    size: Number(image.size || 0),
    width: Number(image.width || 0),
    height: Number(image.height || 0),
    metaLine: image.metaLine || ''
  }))
}

export function clearAttachmentFileReferences(attachments = []) {
  try {
    ;(Array.isArray(attachments) ? attachments : []).forEach((attachment) => {
      if (attachment && typeof attachment === 'object') attachment.file = null
    })
  } catch {
    // Best effort only: File references are non-serializable cleanup hints.
  }
}

export function isSvgAttachmentLike({ mime = '', ext = '' } = {}) {
  const normalizedMime = String(mime || '').trim().toLowerCase()
  const normalizedExtension = String(ext || '').trim().toLowerCase()
  return normalizedMime === 'image/svg+xml' || normalizedExtension === 'svg'
}

export function isImageAttachmentLike({ mime = '', ext = '', kind = '' } = {}) {
  if (String(kind || '').trim().toLowerCase() === 'image') return true
  const normalizedMime = String(mime || '').trim().toLowerCase()
  const normalizedExtension = String(ext || '').trim().toLowerCase()
  return normalizedMime.startsWith('image/') || IMAGE_ATTACHMENT_EXTENSIONS.has(normalizedExtension)
}

export function isDirectTextAttachmentExtension(ext) {
  return DIRECT_TEXT_ATTACHMENT_EXTENSIONS.has(String(ext || '').trim().toLowerCase())
}

export function isWorkerParsedAttachmentExtension(ext) {
  return WORKER_PARSED_ATTACHMENT_EXTENSIONS.has(String(ext || '').trim().toLowerCase())
}

export function isConvertibleAttachmentExtension(ext) {
  return CONVERTIBLE_ATTACHMENT_EXTENSIONS.has(String(ext || '').trim().toLowerCase())
}

export function isTextAttachmentMime(mime) {
  const normalizedMime = String(mime || '').trim().toLowerCase()
  if (!normalizedMime || normalizedMime === 'application/octet-stream') return false
  return normalizedMime.startsWith('text/') || TEXT_ATTACHMENT_MIME_TYPES.has(normalizedMime)
}

export function isSupportedAttachmentFile(file) {
  if (!file) return false
  const mime = String(file?.type || '').trim().toLowerCase()
  const extension = getFileExt(file?.name) || guessExtensionFromMime(mime)
  if (isImageAttachmentLike({ mime, ext: extension })) return true
  if (SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension)) return true
  return !extension && isTextAttachmentMime(mime)
}

function parseSvgDimensionValue(raw) {
  const match = String(raw || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)/)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function readImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const src = String(dataUrl || '').trim()
    if (!src) {
      resolve({ width: 0, height: 0 })
      return
    }

    const image = new Image()
    image.onload = () => {
      resolve({
        width: Number(image.naturalWidth || image.width || 0),
        height: Number(image.naturalHeight || image.height || 0)
      })
    }
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = src
  })
}

async function readSvgAttachmentContext(file) {
  try {
    const text = String((await file?.text?.()) || '')
    if (!text.trim()) return null

    const document = new DOMParser().parseFromString(text, 'image/svg+xml')
    if (document.querySelector('parsererror')) return null
    const root =
      document.documentElement?.tagName?.toLowerCase() === 'svg'
        ? document.documentElement
        : document.querySelector?.('svg')
    if (!root) return null

    const textNodes = []
    root.querySelectorAll?.('text, tspan')?.forEach((node) => {
      const value = truncateInlineText(node?.textContent || '', 80)
      if (value) textNodes.push(value)
    })

    return {
      title: truncateInlineText(root.querySelector?.('title')?.textContent || '', 120),
      desc: truncateInlineText(root.querySelector?.('desc')?.textContent || '', 180),
      visibleText: truncateInlineText(Array.from(new Set(textNodes)).join(' | '), SVG_TEXT_PREVIEW_MAX_CHARS),
      width: parseSvgDimensionValue(root.getAttribute?.('width')),
      height: parseSvgDimensionValue(root.getAttribute?.('height')),
      viewBox: String(root.getAttribute?.('viewBox') || '').trim()
    }
  } catch {
    return null
  }
}

export async function buildImageAttachmentSummary({ file, name, ext, mime, dataUrl }) {
  const summary = []
  const svg = isSvgAttachmentLike({ mime, ext })
  const svgContext = svg ? await readSvgAttachmentContext(file) : null
  summary.push(`Attachment: ${name || 'image'}`)
  summary.push(`Type: ${mime || getImageKindLabel({ mime, ext })}`)

  const sizeText = formatAttachmentSize(file?.size)
  if (sizeText) summary.push(`Size: ${sizeText}`)

  const dimensions = await readImageDimensions(dataUrl)
  const width = Number(dimensions.width || svgContext?.width || 0)
  const height = Number(dimensions.height || svgContext?.height || 0)
  if (width > 0 && height > 0) summary.push(`Dimensions: ${width} x ${height}`)
  else if (svgContext?.viewBox) summary.push(`ViewBox: ${svgContext.viewBox}`)

  if (svgContext?.title) summary.push(`Title: ${svgContext.title}`)
  if (svgContext?.desc) summary.push(`Description: ${svgContext.desc}`)
  if (svgContext?.visibleText) summary.push(`Visible text: ${svgContext.visibleText}`)

  return {
    text: `${svg ? 'SVG image' : 'image'} metadata\n${summary.join('\n')}`.trim(),
    width,
    height,
    metaLine: buildImageMetaLine({ mime, ext, size: file?.size, width, height }),
    svgTextPreview: truncateInlineText(
      [svgContext?.title, svgContext?.visibleText, svgContext?.desc].filter(Boolean).join(' | '),
      SVG_TEXT_PREVIEW_MAX_CHARS
    )
  }
}
