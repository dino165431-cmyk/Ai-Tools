import {
  createDirectory,
  deleteItem,
  exists,
  listDirectory,
  moveItem,
  readFile,
  stat,
  writeFile
} from './fileOperations.js'
import {
  buildChatSessionAssetsDirectory,
  collectChatMediaAssetPathsFromPayload
} from './chatMediaAssets.js'

export const CHAT_SESSION_TRASH_ROOT = '.ai-tools-trash/chat-sessions'
export const CHAT_SESSION_TRASH_RETENTION_DAYS = 30
export const CHAT_SESSION_TRASH_RETENTION_MS =
  CHAT_SESSION_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

const WORKSPACE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/
const TRASH_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/

function normalizePath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function normalizeWorkspaceId(value) {
  const workspaceId = String(value || '').trim()
  return WORKSPACE_ID_RE.test(workspaceId) ? workspaceId : ''
}

function normalizeTrashId(value) {
  const trashId = String(value || '').trim()
  if (!TRASH_ID_RE.test(trashId)) throw new Error('无效的会话回收站记录 ID')
  return trashId
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()).filter(Boolean))]
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString()
}

function createTrashId(now = Date.now()) {
  return `session-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getTrashEntryRoot(trashId) {
  return `${CHAT_SESSION_TRASH_ROOT}/${normalizeTrashId(trashId)}`
}

function getTrashManifestPath(trashId) {
  return `${getTrashEntryRoot(trashId)}/manifest.json`
}

function isPathEqualOrInside(targetPath, basePath) {
  const target = normalizePath(targetPath)
  const base = normalizePath(basePath)
  return !!target && !!base && (target === base || target.startsWith(`${base}/`))
}

function collectWorkspaceIdsFromText(text, output) {
  const raw = String(text || '')
  const pattern = /(?:sandbox_workspace_id|sandboxWorkspaceId)\s*[:：=]\s*([a-zA-Z0-9][a-zA-Z0-9._-]{0,79})/g
  let match = null
  while ((match = pattern.exec(raw))) {
    const workspaceId = normalizeWorkspaceId(match[1])
    if (workspaceId) output.add(workspaceId)
  }
}

function collectWorkspaceIdsFromValue(value, output, seen, depth = 0) {
  if (depth > 30 || value == null) return
  if (typeof value === 'string') {
    collectWorkspaceIdsFromText(value, output)
    return
  }
  if (typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    value.forEach((item) => collectWorkspaceIdsFromValue(item, output, seen, depth + 1))
    return
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === 'string' &&
      ['sandboxWorkspaceId', 'sandbox_workspace_id', 'workspaceId', 'workspace_id'].includes(key)
    ) {
      const workspaceId = normalizeWorkspaceId(child)
      if (workspaceId) output.add(workspaceId)
    }
    collectWorkspaceIdsFromValue(child, output, seen, depth + 1)
  }
}

export function collectChatSessionSandboxWorkspaceIds(payloads = []) {
  const output = new Set()
  const source = Array.isArray(payloads) ? payloads : [payloads]
  source.forEach((entry) => {
    const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : entry
    collectWorkspaceIdsFromValue(payload, output, new WeakSet())
  })
  return [...output]
}

export function collectChatSessionOwnedSandboxWorkspaceIds(payloads = []) {
  const output = new Set()
  const source = Array.isArray(payloads) ? payloads : [payloads]
  source.forEach((entry) => {
    const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : entry
    if (!payload || typeof payload !== 'object') return
    const candidates = [
      payload?.session?.sandboxWorkspaceId,
      payload?.source?.sandboxWorkspaceId,
      payload?.sandboxWorkspaceId
    ]
    candidates.forEach((value) => {
      const workspaceId = normalizeWorkspaceId(value)
      if (workspaceId) output.add(workspaceId)
    })
  })
  return [...output]
}

function normalizeDeletedSessionPayloads(payloads = []) {
  return (Array.isArray(payloads) ? payloads : [])
    .map((entry) => ({
      path: normalizePath(entry?.path || entry?.filePath),
      payload: entry?.payload && typeof entry.payload === 'object' ? entry.payload : null
    }))
    .filter((entry) => entry.path && entry.payload)
}

function resolveTrashLabel(originalPath, payloads = []) {
  const firstPayload = payloads.find((entry) => entry?.payload)?.payload || null
  const payloadTitle = String(firstPayload?.title || '').trim()
  if (payloadTitle) return payloadTitle
  const basename = normalizePath(originalPath).split('/').pop() || '会话'
  return basename.replace(/\.json$/i, '') || '会话'
}

function collectMediaAssetPaths(payloads = []) {
  const paths = new Set()
  payloads.forEach((entry) => {
    collectChatMediaAssetPathsFromPayload(entry.payload, {
      sessionFilePath: entry.path
    }).forEach((assetPath) => paths.add(normalizePath(assetPath)))
  })
  return [...paths].filter(Boolean)
}

async function readTrashManifest(trashId) {
  const raw = await readFile(getTrashManifestPath(trashId), 'utf-8')
  const parsed = JSON.parse(String(raw || ''))
  if (!parsed || typeof parsed !== 'object') throw new Error('会话回收站记录损坏')
  return parsed
}

export async function updateChatSessionTrashManifest(trashId, patch = {}) {
  const current = await readTrashManifest(trashId)
  const next = {
    ...current,
    ...(patch && typeof patch === 'object' ? patch : {}),
    updatedAt: nowIso()
  }
  await writeFile(getTrashManifestPath(trashId), JSON.stringify(next, null, 2))
  return next
}

export async function trashChatSessionPath(originalPath, deletedPayloads = [], options = {}) {
  const sourcePath = normalizePath(originalPath)
  if (!sourcePath) throw new Error('会话路径不能为空')
  if (!(await exists(sourcePath))) throw new Error('会话文件或目录不存在')

  const now = Number(options.now || Date.now()) || Date.now()
  const retentionDays = Math.max(
    1,
    Math.round(Number(options.retentionDays || CHAT_SESSION_TRASH_RETENTION_DAYS))
  )
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000
  const trashId = createTrashId(now)
  const entryRoot = getTrashEntryRoot(trashId)
  const sourceStat = await stat(sourcePath)
  const isDirectory = sourceStat?.isDirectory?.() === true
  const contentPath = `${entryRoot}/${isDirectory ? 'content' : 'content.json'}`
  const assetSourcePath = isDirectory ? '' : buildChatSessionAssetsDirectory(sourcePath)
  const assetTrashPath = assetSourcePath ? `${entryRoot}/assets` : ''
  const payloads = normalizeDeletedSessionPayloads(deletedPayloads)
  const workspaceIds = collectChatSessionSandboxWorkspaceIds(payloads)
  const ownedWorkspaceIds = collectChatSessionOwnedSandboxWorkspaceIds(payloads)
  const mediaAssetPaths = collectMediaAssetPaths(payloads)
  const manifest = {
    version: 1,
    trashId,
    status: 'preparing',
    label: resolveTrashLabel(sourcePath, payloads),
    originalPath: sourcePath,
    originalIsDirectory: isDirectory,
    contentPath,
    assetOriginalPath: assetSourcePath,
    assetTrashPath,
    deletedAt: nowIso(now),
    purgeAt: nowIso(now + retentionMs),
    retentionDays,
    sessionCount: payloads.length,
    sessionPaths: payloads.map((entry) => entry.path),
    workspaceIds,
    ownedWorkspaceIds,
    sandboxTrashEntries: [],
    mediaAssetPaths,
    createdAt: nowIso(now),
    updatedAt: nowIso(now)
  }

  await createDirectory(entryRoot)
  await writeFile(getTrashManifestPath(trashId), JSON.stringify(manifest, null, 2))

  let contentMoved = false
  let assetsMoved = false
  try {
    await moveItem(sourcePath, contentPath)
    contentMoved = true
    if (assetSourcePath && await exists(assetSourcePath)) {
      await moveItem(assetSourcePath, assetTrashPath)
      assetsMoved = true
    }
    return await updateChatSessionTrashManifest(trashId, {
      status: 'trashed',
      contentMoved,
      assetsMoved
    })
  } catch (error) {
    try {
      if (assetsMoved && !(await exists(assetSourcePath))) {
        await moveItem(assetTrashPath, assetSourcePath)
      }
      if (contentMoved && !(await exists(sourcePath))) {
        await moveItem(contentPath, sourcePath)
      }
      if (await exists(entryRoot)) await deleteItem(entryRoot)
    } catch {
      // Preserve the original error. A leftover preparing record can be inspected manually.
    }
    throw error
  }
}

export async function listChatSessionTrashItems() {
  if (!(await exists(CHAT_SESSION_TRASH_ROOT))) return []
  const entries = await listDirectory(CHAT_SESSION_TRASH_ROOT).catch(() => [])
  const manifests = []
  for (const entryPath of entries) {
    const trashId = normalizePath(entryPath).split('/').pop() || ''
    if (!TRASH_ID_RE.test(trashId)) continue
    try {
      const manifest = await readTrashManifest(trashId)
      if (manifest?.trashId) manifests.push(manifest)
    } catch {
      // Keep corrupted entries out of the normal recovery UI.
    }
  }
  return manifests.sort((a, b) => Date.parse(b?.deletedAt || 0) - Date.parse(a?.deletedAt || 0))
}

export async function restoreChatSessionTrashItem(trashId) {
  const manifest = await readTrashManifest(trashId)
  const originalPath = normalizePath(manifest.originalPath)
  const contentPath = normalizePath(manifest.contentPath)
  const assetOriginalPath = normalizePath(manifest.assetOriginalPath)
  const assetTrashPath = normalizePath(manifest.assetTrashPath)
  if (!originalPath || !contentPath) throw new Error('会话回收站记录缺少恢复路径')
  if (await exists(originalPath)) throw new Error('原位置已存在同名会话，请先重命名或移动现有内容')
  if (assetOriginalPath && assetTrashPath && await exists(assetOriginalPath)) {
    throw new Error('原位置已存在同名媒体目录，请先处理后再恢复')
  }

  let contentRestored = false
  let assetsRestored = false
  try {
    await moveItem(contentPath, originalPath)
    contentRestored = true
    if (assetOriginalPath && assetTrashPath && await exists(assetTrashPath)) {
      await moveItem(assetTrashPath, assetOriginalPath)
      assetsRestored = true
    }
    const entryRoot = getTrashEntryRoot(trashId)
    if (await exists(entryRoot)) await deleteItem(entryRoot)
    return {
      ok: true,
      trashId: manifest.trashId,
      originalPath,
      workspaceIds: uniqueStrings(manifest.workspaceIds),
      sandboxTrashEntries: Array.isArray(manifest.sandboxTrashEntries) ? manifest.sandboxTrashEntries : []
    }
  } catch (error) {
    try {
      if (assetsRestored && !(await exists(assetTrashPath))) {
        await moveItem(assetOriginalPath, assetTrashPath)
      }
      if (contentRestored && !(await exists(contentPath))) {
        await moveItem(originalPath, contentPath)
      }
    } catch {
      // Preserve the original restore error.
    }
    throw error
  }
}

export async function purgeChatSessionTrashItem(trashId) {
  const manifest = await readTrashManifest(trashId)
  const entryRoot = getTrashEntryRoot(trashId)
  if (await exists(entryRoot)) await deleteItem(entryRoot)
  return {
    ok: true,
    trashId: manifest.trashId,
    sandboxTrashEntries: Array.isArray(manifest.sandboxTrashEntries) ? manifest.sandboxTrashEntries : []
  }
}

export async function purgeExpiredChatSessionTrash(options = {}) {
  const now = Number(options.now || Date.now()) || Date.now()
  const items = await listChatSessionTrashItems()
  const purged = []
  for (const item of items) {
    const purgeAt = Date.parse(String(item?.purgeAt || ''))
    if (options.force !== true && (!Number.isFinite(purgeAt) || purgeAt > now)) continue
    try {
      purged.push(await purgeChatSessionTrashItem(item.trashId))
    } catch {
      // Retry the individual entry during the next maintenance pass.
    }
  }
  return purged
}

export function getChatSessionTrashRemainingDays(item, now = Date.now()) {
  const purgeAt = Date.parse(String(item?.purgeAt || ''))
  if (!Number.isFinite(purgeAt)) return CHAT_SESSION_TRASH_RETENTION_DAYS
  return Math.max(0, Math.ceil((purgeAt - Number(now || Date.now())) / 86400000))
}

export const _test = {
  normalizeWorkspaceId,
  isPathEqualOrInside
}
