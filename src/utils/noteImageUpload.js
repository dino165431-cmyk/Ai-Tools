import path from 'path-browserify'
import { NOTE_EXTENSIONS } from './noteTypes.js'
import { toPosixPath } from './notePathUtils'

const DEFAULT_IMAGE_EXTENSION = 'png'

const MIME_EXTENSION_MAP = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/svg+xml', 'svg'],
  ['image/bmp', 'bmp'],
  ['image/x-icon', 'ico'],
  ['image/vnd.microsoft.icon', 'ico']
])

function normalizeExtension(extRaw) {
  const ext = String(extRaw || '').trim().toLowerCase().replace(/^\.+/, '')
  return ext || ''
}

function normalizeMimeType(mimeRaw) {
  return String(mimeRaw || '').trim().toLowerCase()
}

function toUint8Array(bytesLike) {
  if (!bytesLike) return new Uint8Array()
  if (bytesLike instanceof Uint8Array) return bytesLike
  if (bytesLike instanceof ArrayBuffer) return new Uint8Array(bytesLike)
  if (ArrayBuffer.isView(bytesLike)) {
    return new Uint8Array(bytesLike.buffer, bytesLike.byteOffset, bytesLike.byteLength)
  }
  return new Uint8Array()
}

function hasBytes(bytes, offset, signature) {
  if (!bytes || bytes.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false
  }
  return true
}

function getExtensionFromFileName(fileNameRaw) {
  const fileName = String(fileNameRaw || '').trim()
  if (!fileName) return ''
  return normalizeExtension(path.extname(fileName))
}

function getExtensionFromMimeType(mimeTypeRaw) {
  return MIME_EXTENSION_MAP.get(normalizeMimeType(mimeTypeRaw)) || ''
}

function getExtensionFromBytes(bytesLike) {
  const bytes = toUint8Array(bytesLike)
  if (!bytes.length) return ''

  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47])) return 'png'
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpg'
  if (hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return 'gif'
  if (hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'gif'
  if (
    hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'webp'
  }
  if (hasBytes(bytes, 0, [0x42, 0x4d])) return 'bmp'
  if (hasBytes(bytes, 0, [0x00, 0x00, 0x01, 0x00])) return 'ico'

  const textHead = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 256)).trimStart()
  if (textHead.startsWith('<svg') || textHead.startsWith('<?xml')) return 'svg'

  return ''
}

export function resolveImageExtension({ fileName, mimeType, bytes, fallback = DEFAULT_IMAGE_EXTENSION } = {}) {
  return (
    getExtensionFromBytes(bytes) ||
    getExtensionFromMimeType(mimeType) ||
    getExtensionFromFileName(fileName) ||
    normalizeExtension(fallback) ||
    DEFAULT_IMAGE_EXTENSION
  )
}

export function buildUploadedImageAlt({ fileName, extension } = {}) {
  const trimmed = String(fileName || '').trim()
  if (trimmed) return trimmed
  const ext = normalizeExtension(extension) || DEFAULT_IMAGE_EXTENSION
  return `image.${ext}`
}

function buildNoteAssetsDirName(notePath, { legacy = false } = {}) {
  const normalized = String(notePath || '').trim()
  if (!normalized) return ''
  return legacy
    ? `${path.basename(normalized, path.extname(normalized))}.assets`
    : `${path.basename(normalized)}.assets`
}

export function buildNoteAssetsDirectory(filePath, { legacy = false } = {}) {
  const notePath = String(filePath || '').trim()
  const supportsAssets = NOTE_EXTENSIONS.some((ext) => notePath.toLowerCase().endsWith(ext))
  if (!notePath.startsWith('note/') || !supportsAssets) {
    return null
  }

  const noteDirRel = toPosixPath(path.dirname(notePath))
  const docName = path.basename(notePath, path.extname(notePath))
  const noteFileName = path.basename(notePath)
  const assetsDirName = buildNoteAssetsDirName(notePath, { legacy })
  const assetsDirRel = toPosixPath(path.join(noteDirRel, assetsDirName))

  return {
    legacy,
    docName,
    noteFileName,
    noteDirRel,
    assetsDirName,
    assetsDirRel
  }
}

export function listNoteAssetsDirectories(filePath, { includeLegacy = true } = {}) {
  const candidates = [
    buildNoteAssetsDirectory(filePath, { legacy: false })
  ]
  if (includeLegacy) {
    candidates.push(buildNoteAssetsDirectory(filePath, { legacy: true }))
  }

  const seen = new Set()
  return candidates.filter((item) => {
    if (!item?.assetsDirRel) return false
    if (seen.has(item.assetsDirRel)) return false
    seen.add(item.assetsDirRel)
    return true
  })
}

export function buildNoteAssetsStorage(filePath, filename, { legacy = false } = {}) {
  const safeFileName = String(filename || '').trim()
  const directory = buildNoteAssetsDirectory(filePath, { legacy })
  if (!directory || !safeFileName) {
    return null
  }

  const imageRelPath = toPosixPath(path.join(directory.assetsDirRel, safeFileName))
  const relativeUrl = `./${encodeURI(`${directory.assetsDirName}/${safeFileName}`)}`

  return {
    ...directory,
    imageRelPath,
    relativeUrl
  }
}

export function isAnimationFriendlyImage({ fileName, mimeType, bytes } = {}) {
  const ext = resolveImageExtension({ fileName, mimeType, bytes })
  return ext === 'gif' || ext === 'webp'
}
