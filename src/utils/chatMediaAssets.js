import { createDirectory, deleteItem, getFileBlobUrl, listDirectory, writeFile } from './fileOperations.js'

export const CHAT_SESSION_ASSET_DIR_SUFFIX = '.assets'

const MIME_EXTENSION_MAP = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/svg+xml', 'svg'],
  ['image/bmp', 'bmp'],
  ['image/avif', 'avif'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
  ['video/x-m4v', 'm4v'],
  ['video/ogg', 'ogv']
])

function normalizeSlash(value) {
  return String(value || '').trim().replace(/\\/g, '/')
}

function normalizeMime(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeKind(value) {
  return String(value || '').trim().toLowerCase() === 'video' ? 'video' : 'image'
}

function safeSegment(value, fallback = 'media') {
  const text = String(value || '')
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (text || fallback).slice(0, 80)
}

function extensionFromName(name) {
  const match = String(name || '').trim().match(/\.([a-z0-9]{2,8})$/i)
  return match ? match[1].toLowerCase() : ''
}

export function inferChatMediaAssetExtension(media = {}, kind = 'image') {
  const normalizedKind = normalizeKind(kind)
  const mime = normalizeMime(media?.mime || media?.contentType || media?.type)
  return (
    MIME_EXTENSION_MAP.get(mime) ||
    extensionFromName(media?.name || media?.filename || media?.fileName) ||
    (normalizedKind === 'video' ? 'mp4' : 'png')
  )
}

export function getChatMediaAssetPath(media = {}) {
  return normalizeSlash(media?.assetPath || media?.localPath || media?.fileRelPath || '')
}

export function getChatMediaAssetRef(media = {}) {
  return normalizeSlash(media?.assetRef || media?.assetRelativePath || media?.relativePath || '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
}

function pathDirname(p) {
  const normalized = normalizeSlash(p)
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function pathBasename(p) {
  const normalized = normalizeSlash(p)
  const parts = normalized.split('/').filter(Boolean)
  return parts.pop() || ''
}

export function buildChatSessionAssetsDirectory(sessionFilePath) {
  const filePath = normalizeSlash(sessionFilePath)
  if (!filePath || !filePath.toLowerCase().endsWith('.json')) return ''
  const dir = pathDirname(filePath)
  const fileName = pathBasename(filePath)
  const assetsDirName = `${fileName}${CHAT_SESSION_ASSET_DIR_SUFFIX}`
  return dir ? `${dir}/${assetsDirName}` : assetsDirName
}

export function resolveChatSessionAssetPath(sessionFilePath, assetRef) {
  const assetsDir = buildChatSessionAssetsDirectory(sessionFilePath)
  const ref = getChatMediaAssetRef({ assetRef })
  if (!assetsDir || !ref) return ''
  return `${assetsDir}/${ref}`
}

function deriveChatSessionAssetRef(sessionFilePath, assetPath) {
  const assetsDir = buildChatSessionAssetsDirectory(sessionFilePath)
  const path = normalizeSlash(assetPath)
  if (!assetsDir || !path.startsWith(`${assetsDir}/`)) return ''
  return path.slice(assetsDir.length + 1)
}

export function resolveChatMediaAssetPath(media = {}, options = {}) {
  const assetRef = getChatMediaAssetRef(media)
  const sessionFilePath = normalizeSlash(options.sessionFilePath || '')
  if (assetRef && sessionFilePath) {
    return resolveChatSessionAssetPath(sessionFilePath, assetRef)
  }
  const assetPath = getChatMediaAssetPath(media)
  if (assetPath && sessionFilePath && deriveChatSessionAssetRef(sessionFilePath, assetPath)) {
    return assetPath
  }
  return ''
}

export function isTransientChatMediaSrc(src) {
  const text = String(src || '').trim()
  return /^data:(image|video)\//i.test(text) || /^blob:/i.test(text)
}

export function serializeChatMediaForSave(media = {}, kind = 'image') {
  if (!media || typeof media !== 'object') return null
  const out = { ...media }
  const assetRef = getChatMediaAssetRef(out)
  if (assetRef) {
    out.assetRef = assetRef
    delete out.assetPath
    delete out.localPath
    delete out.fileRelPath
    delete out.src
    out.kind = normalizeKind(out.kind || kind)
    return out
  }

  delete out.assetPath
  delete out.localPath
  delete out.fileRelPath

  if (/^blob:/i.test(String(out.src || '').trim())) {
    delete out.src
  }
  out.kind = normalizeKind(out.kind || kind)
  return out
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl || '').trim().match(/^data:([^;,]+);base64,(.+)$/i)
  if (!match) return null
  const mime = normalizeMime(match[1])
  const base64 = String(match[2] || '').replace(/\s+/g, '')
  if (!base64) return null
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : typeof Buffer !== 'undefined'
        ? Buffer.from(base64, 'base64').toString('binary')
        : ''
  if (!binary) return null
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { bytes, mime }
}

async function fetchUrlAsBytes(src) {
  if (typeof fetch !== 'function') return null
  const resp = await fetch(src)
  if (!resp?.ok && !String(src || '').startsWith('blob:')) return null
  const blob = await resp.blob()
  if (!blob || !blob.size) return null
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { bytes, mime: normalizeMime(blob.type), size: blob.size }
}

async function readMediaBytes(media = {}) {
  const src = String(media?.src || '').trim()
  if (!src) return null
  if (/^data:(image|video)\//i.test(src)) return dataUrlToBytes(src)
  if (/^(blob:|https?:\/\/)/i.test(src)) return fetchUrlAsBytes(src)
  return null
}

function buildAssetStorageLocation(media = {}, options = {}) {
  const kind = normalizeKind(options.kind || media.kind)
  const assetsDir = buildChatSessionAssetsDirectory(options.sessionFilePath)
  if (!assetsDir) return null

  const messageId = safeSegment(options.messageId || media.messageId || media.id || 'message', 'message')
  const nameBase = safeSegment(media.name || `${kind}_${options.index || 1}`, kind)
  const ext = inferChatMediaAssetExtension(media, kind)
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const assetRef = `${messageId}/${nameBase}-${suffix}.${ext}`
  return {
    assetRef,
    assetPath: `${assetsDir}/${assetRef}`
  }
}

export async function persistChatMediaListAssets(mediaList = [], options = {}) {
  const list = Array.isArray(mediaList) ? mediaList : []
  const kind = normalizeKind(options.kind)
  const sessionFilePath = normalizeSlash(options.sessionFilePath || '')
  const out = []

  for (let index = 0; index < list.length; index += 1) {
    const media = list[index]
    if (!media || typeof media !== 'object') continue

    const existingPath = resolveChatMediaAssetPath(media, { sessionFilePath })
    const existingRef = getChatMediaAssetRef(media) || deriveChatSessionAssetRef(sessionFilePath, existingPath)
    const src = String(media.src || '').trim()

    if (existingPath && existingRef) {
      const hydratedSrc = src || await getFileBlobUrl(existingPath).catch(() => '')
      out.push({
        ...media,
        kind,
        assetRef: existingRef,
        assetPath: existingPath,
        localPath: existingPath,
        src: hydratedSrc || media.src || ''
      })
      continue
    }

    const storage = buildAssetStorageLocation({ ...media, kind }, { ...options, kind, index: index + 1, sessionFilePath })
    if (!storage) {
      if (existingPath) {
        const hydratedSrc = src || await getFileBlobUrl(existingPath).catch(() => '')
        out.push({
          ...media,
          kind,
          assetPath: existingPath,
          localPath: existingPath,
          src: hydratedSrc || media.src || ''
        })
        continue
      }
      out.push(media)
      continue
    }

    try {
      const sourceSrc = src || (existingPath ? await getFileBlobUrl(existingPath).catch(() => '') : '')
      const binary = await readMediaBytes({ ...media, src: sourceSrc })
      if (!binary?.bytes?.length) {
        if (existingPath) {
          const hydratedSrc = sourceSrc || await getFileBlobUrl(existingPath).catch(() => '')
          out.push({
            ...media,
            kind,
            assetPath: existingPath,
            localPath: existingPath,
            src: hydratedSrc || media.src || ''
          })
        } else {
          out.push(media)
        }
        continue
      }

      const mime = normalizeMime(media.mime || binary.mime) || (kind === 'video' ? 'video/mp4' : 'image/png')
      const assetPath = storage.assetPath
      const assetDir = assetPath.split('/').slice(0, -1).join('/')
      await createDirectory(assetDir)
      await writeFile(assetPath, binary.bytes)
      const displaySrc = await getFileBlobUrl(assetPath).catch(() => sourceSrc || src)

      out.push({
        ...media,
        kind,
        src: displaySrc,
        mime,
        size: Number(media.size || binary.size || binary.bytes.byteLength || 0) || undefined,
        assetRef: storage.assetRef,
        assetPath,
        localPath: assetPath,
        persistedAt: new Date().toISOString()
      })
    } catch {
      out.push(media)
    }
  }

  return out
}

export async function persistChatSessionMediaAssets(sessionLike = {}, options = {}) {
  const messages = Array.isArray(sessionLike?.messages) ? sessionLike.messages : []
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue
    if (Array.isArray(msg.images) && msg.images.length) {
      msg.images = await persistChatMediaListAssets(msg.images, { ...options, kind: 'image', messageId: msg.id })
    }
    if (Array.isArray(msg.videos) && msg.videos.length) {
      msg.videos = await persistChatMediaListAssets(msg.videos, { ...options, kind: 'video', messageId: msg.id })
    }
  }
  return sessionLike
}

export async function hydrateChatSessionMediaAssets(sessionLike = {}, options = {}) {
  const messages = Array.isArray(sessionLike?.messages) ? sessionLike.messages : []
  const sessionFilePath = normalizeSlash(options.sessionFilePath || '')
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue
    for (const key of ['images', 'videos']) {
      const list = Array.isArray(msg[key]) ? msg[key] : []
      for (const media of list) {
        const assetPath = resolveChatMediaAssetPath(media, { sessionFilePath })
        if (!assetPath) continue
        const assetRef = getChatMediaAssetRef(media) || deriveChatSessionAssetRef(sessionFilePath, assetPath)
        if (assetRef) media.assetRef = assetRef
        media.assetPath = assetPath
        media.localPath = assetPath
        if (!String(media.src || '').trim() || isTransientChatMediaSrc(media.src)) {
          media.src = await getFileBlobUrl(assetPath).catch(() => '')
        }
      }
    }
  }
  return sessionLike
}

export function collectChatMediaAssetPathsFromPayload(payload = {}, options = {}) {
  const messages = Array.isArray(payload?.session?.messages)
    ? payload.session.messages
    : Array.isArray(payload?.messages)
      ? payload.messages
      : []
  const sessionFilePath = normalizeSlash(options.sessionFilePath || payload?.filePath || payload?.sessionFilePath || '')
  const paths = new Set()
  messages.forEach((msg) => {
    ;['images', 'videos'].forEach((key) => {
      ;(Array.isArray(msg?.[key]) ? msg[key] : []).forEach((media) => {
        const assetPath = resolveChatMediaAssetPath(media, { sessionFilePath })
        if (assetPath) paths.add(assetPath)
      })
    })
  })
  return Array.from(paths)
}

export function isChatSessionAssetsDirectoryPath(dirPath) {
  return normalizeSlash(dirPath)
    .split('/')
    .some((segment) => segment.toLowerCase().endsWith(`.json${CHAT_SESSION_ASSET_DIR_SUFFIX}`))
}

function isChatSessionAssetsRootPath(dirPath) {
  const segment = pathBasename(dirPath).toLowerCase()
  return segment.endsWith(`.json${CHAT_SESSION_ASSET_DIR_SUFFIX}`)
}

function isChatSessionSidecarAssetPath(assetPath) {
  const path = normalizeSlash(assetPath)
  return path.startsWith('session/') && isChatSessionAssetsDirectoryPath(path)
}

function isSafeChatMediaAssetPath(assetPath) {
  return isChatSessionSidecarAssetPath(assetPath)
}

function isSafeChatMediaAssetDir(dirPath) {
  return isChatSessionSidecarAssetPath(dirPath)
}

function listParentAssetDirs(assetPath) {
  const parts = normalizeSlash(assetPath).split('/').filter(Boolean)
  const dirs = []
  while (parts.length > 1) {
    parts.pop()
    const dirPath = parts.join('/')
    if (!dirPath) break
    if (!isSafeChatMediaAssetDir(dirPath)) break
    dirs.push(dirPath)
    if (isChatSessionAssetsRootPath(dirPath)) break
  }
  return dirs
}

async function deleteEmptyChatMediaDir(dirPath) {
  const safeDir = normalizeSlash(dirPath)
  if (!safeDir || !isSafeChatMediaAssetDir(safeDir)) return
  const entries = await listDirectory(safeDir).catch(() => null)
  if (Array.isArray(entries) && entries.length === 0) {
    await deleteItem(safeDir).catch(() => {})
  }
}

export async function deleteChatMediaAssetPaths(paths = []) {
  const unique = Array.from(new Set((Array.isArray(paths) ? paths : []).map(normalizeSlash).filter(Boolean)))
  for (const assetPath of unique) {
    if (!isSafeChatMediaAssetPath(assetPath)) continue
    await deleteItem(assetPath).catch(() => {})
    for (const dirPath of listParentAssetDirs(assetPath)) {
      await deleteEmptyChatMediaDir(dirPath)
    }
  }
}

export async function deleteChatSessionAssetDirectory(sessionFilePath) {
  const assetsDir = buildChatSessionAssetsDirectory(sessionFilePath)
  if (!assetsDir || !isChatSessionSidecarAssetPath(`${assetsDir}/placeholder`)) return
  await deleteItem(assetsDir).catch(() => {})
}
