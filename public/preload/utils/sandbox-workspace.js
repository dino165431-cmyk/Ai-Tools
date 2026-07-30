const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')

const globalConfig = require('./global-config')

const SANDBOX_DATA_DIRECTORY = '.ai-tools-sandbox'
const SANDBOX_WORKSPACES_DIRECTORY = 'workspaces'
const SANDBOX_TRASH_DIRECTORY = 'trash'
const DEFAULT_WORKSPACE_ID = 'default'
const MAX_WORKSPACE_ID_LENGTH = 80
const MAX_IMPORTED_FILE_BYTES = 50 * 1024 * 1024
const MAX_IMPORTED_BATCH_BYTES = 100 * 1024 * 1024
const MAX_LISTED_FILES = 500
const DEFAULT_SANDBOX_TRASH_RETENTION_DAYS = 30
const MAX_SESSION_REFERENCE_SCAN_FILES = 20000
const MAX_SESSION_REFERENCE_FILE_BYTES = 20 * 1024 * 1024
const MAX_SANDBOX_INVENTORY_ENTRIES = 50000
const SESSION_DIRECTORY_SCAN_CONCURRENCY = 8
const SESSION_FILE_SCAN_CONCURRENCY = 8
const SANDBOX_DIRECTORY_SCAN_CONCURRENCY = 8
const SANDBOX_ENTRY_STAT_CONCURRENCY = 32
const SANDBOX_WORKSPACE_SCAN_CONCURRENCY = 4
const SANDBOX_INVENTORY_CACHE_TTL_MS = 2 * 60 * 1000
const sandboxInventoryCache = new Map()

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isPathInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveDataRoot() {
  const configured = cleanString(globalConfig.getDataStorageRoot?.())
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error('用户数据目录未配置，无法创建命令沙盒')
  }
  return path.resolve(configured)
}

function normalizeWorkspaceId(value = DEFAULT_WORKSPACE_ID) {
  const workspaceId = cleanString(value) || DEFAULT_WORKSPACE_ID
  if (
    workspaceId.length > MAX_WORKSPACE_ID_LENGTH ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(workspaceId)
  ) {
    throw new Error('workspace_id 只能包含字母、数字、点、下划线和短横线')
  }
  return workspaceId
}

function normalizeSandboxRelativePath(value, options = {}) {
  const raw = cleanString(value).replace(/\\/g, '/')
  if (!raw) {
    if (options.allowEmpty) return ''
    throw new Error('沙盒相对路径不能为空')
  }
  if (
    raw.includes('\0') ||
    path.posix.isAbsolute(raw) ||
    /^[a-zA-Z]:/.test(raw) ||
    raw.startsWith('//')
  ) {
    throw new Error('沙盒路径必须是相对路径')
  }

  const normalized = path.posix.normalize(raw).replace(/^\.\/+/, '')
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    if (options.allowEmpty && (normalized === '' || normalized === '.')) return ''
    throw new Error('沙盒路径不能离开当前工作区')
  }
  return normalized
}

function getWorkspaceRoot(workspaceId = DEFAULT_WORKSPACE_ID) {
  const safeWorkspaceId = normalizeWorkspaceId(workspaceId)
  return path.join(
    resolveDataRoot(),
    SANDBOX_DATA_DIRECTORY,
    SANDBOX_WORKSPACES_DIRECTORY,
    safeWorkspaceId
  )
}

function getSandboxDataRoot() {
  return path.join(resolveDataRoot(), SANDBOX_DATA_DIRECTORY)
}

function getSandboxTrashRoot() {
  return path.join(getSandboxDataRoot(), SANDBOX_TRASH_DIRECTORY)
}

function normalizeTrashId(value) {
  const trashId = cleanString(value)
  if (!trashId || trashId.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trashId)) {
    throw new Error('无效的沙盒回收站记录 ID')
  }
  return trashId
}

function getSandboxTrashEntryRoot(trashId) {
  return path.join(getSandboxTrashRoot(), normalizeTrashId(trashId))
}

function getSandboxTrashManifestPath(trashId) {
  return path.join(getSandboxTrashEntryRoot(trashId), 'manifest.json')
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const source = Array.isArray(items) ? items : []
  if (!source.length) return []
  const results = new Array(source.length)
  const workerCount = Math.min(
    source.length,
    Math.max(1, Math.floor(Number(concurrency) || 1))
  )
  let cursor = 0

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < source.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(source[index], index)
    }
  }))
  return results
}

function createSandboxTrashId(workspaceId, now = Date.now()) {
  const safeWorkspaceId = normalizeWorkspaceId(workspaceId)
  return `${safeWorkspaceId}-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function writeJsonAtomic(targetPath, value) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2))
  try {
    await fs.rm(targetPath, { force: true })
    await fs.rename(temporaryPath, targetPath)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

async function readJsonFile(targetPath) {
  const raw = await fs.readFile(targetPath, 'utf8')
  const parsed = JSON.parse(String(raw || ''))
  if (!parsed || typeof parsed !== 'object') throw new Error('沙盒回收站记录损坏')
  return parsed
}

function collectWorkspaceIdsFromText(text, output) {
  const raw = String(text || '')
  const pattern = /(?:sandbox_workspace_id|sandboxWorkspaceId)\s*[:：=]\s*([a-zA-Z0-9][a-zA-Z0-9._-]{0,79})/g
  let match = null
  while ((match = pattern.exec(raw))) {
    try {
      output.add(normalizeWorkspaceId(match[1]))
    } catch {
      // Ignore malformed workspace ids embedded in historical text.
    }
  }
}

function collectWorkspaceIdsFromValue(value, output = new Set(), seen = new WeakSet(), depth = 0) {
  if (depth > 30 || value == null) return output
  if (typeof value === 'string') {
    collectWorkspaceIdsFromText(value, output)
    return output
  }
  if (typeof value !== 'object') return output
  if (seen.has(value)) return output
  seen.add(value)

  if (Array.isArray(value)) {
    value.forEach((item) => collectWorkspaceIdsFromValue(item, output, seen, depth + 1))
    return output
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === 'string' &&
      ['sandboxWorkspaceId', 'sandbox_workspace_id', 'workspaceId', 'workspace_id'].includes(key)
    ) {
      try {
        output.add(normalizeWorkspaceId(child))
      } catch {
        // Ignore unrelated or malformed workspace ids.
      }
    }
    collectWorkspaceIdsFromValue(child, output, seen, depth + 1)
  }
  return output
}

async function collectReferencedWorkspaceIds(options = {}) {
  const sessionRoot = path.join(resolveDataRoot(), 'session')
  const output = new Set(
    (Array.isArray(options.protectedWorkspaceIds) ? options.protectedWorkspaceIds : [])
      .map((item) => {
        try {
          return normalizeWorkspaceId(item)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
  )
  if (!(await pathExists(sessionRoot))) {
    return { workspaceIds: output, scanComplete: true }
  }

  let scanComplete = true
  const jsonFiles = []
  const pendingDirectories = [sessionRoot]

  while (pendingDirectories.length && jsonFiles.length < MAX_SESSION_REFERENCE_SCAN_FILES) {
    const directoryBatch = pendingDirectories.splice(0, SESSION_DIRECTORY_SCAN_CONCURRENCY)
    const entryGroups = await Promise.all(directoryBatch.map(async (directoryPath) => {
      try {
        return {
          directoryPath,
          entries: await fs.readdir(directoryPath, { withFileTypes: true })
        }
      } catch {
        scanComplete = false
        return { directoryPath, entries: [] }
      }
    }))

    for (const { directoryPath, entries } of entryGroups) {
      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          scanComplete = false
          continue
        }
        const entryPath = path.join(directoryPath, entry.name)
        if (entry.isDirectory()) {
          if (!entry.name.toLowerCase().endsWith('.assets')) {
            pendingDirectories.push(entryPath)
          }
          continue
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
        if (jsonFiles.length >= MAX_SESSION_REFERENCE_SCAN_FILES) {
          scanComplete = false
          break
        }
        jsonFiles.push(entryPath)
      }
    }
  }
  if (pendingDirectories.length) scanComplete = false

  await mapWithConcurrency(
    jsonFiles,
    SESSION_FILE_SCAN_CONCURRENCY,
    async (entryPath) => {
      try {
        const stat = await fs.stat(entryPath)
        if (stat.size > MAX_SESSION_REFERENCE_FILE_BYTES) {
          scanComplete = false
          return
        }
        const payload = JSON.parse(await fs.readFile(entryPath, 'utf8'))
        collectWorkspaceIdsFromValue(payload, output)
      } catch {
        scanComplete = false
      }
    }
  )
  return { workspaceIds: output, scanComplete }
}

async function inspectSandboxDirectory(directoryPath, options = {}) {
  const result = {
    exists: false,
    fileCount: 0,
    totalBytes: 0,
    modifiedAt: 0,
    scanComplete: true
  }
  let rootStat = null
  try {
    rootStat = await fs.lstat(directoryPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return result
    throw error
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return {
      ...result,
      exists: true,
      modifiedAt: Number(rootStat.mtimeMs) || 0,
      scanComplete: false
    }
  }

  const cacheKey = path.resolve(directoryPath)
  const rootModifiedAt = Number(rootStat.mtimeMs) || 0
  const cached = sandboxInventoryCache.get(cacheKey)
  if (
    options.refresh !== true &&
    cached &&
    cached.rootModifiedAt === rootModifiedAt &&
    Date.now() - cached.cachedAt < SANDBOX_INVENTORY_CACHE_TTL_MS
  ) {
    return { ...cached.inventory }
  }

  result.exists = true
  result.modifiedAt = rootModifiedAt
  let scannedEntries = 0
  const pendingDirectories = [directoryPath]

  while (pendingDirectories.length && scannedEntries < MAX_SANDBOX_INVENTORY_ENTRIES) {
    const directoryBatch = pendingDirectories.splice(0, SANDBOX_DIRECTORY_SCAN_CONCURRENCY)
    const entryGroups = await Promise.all(directoryBatch.map(async (currentPath) => {
      try {
        return {
          currentPath,
          entries: await fs.readdir(currentPath, { withFileTypes: true })
        }
      } catch {
        result.scanComplete = false
        return { currentPath, entries: [] }
      }
    }))
    const entriesToInspect = []

    for (const { currentPath, entries } of entryGroups) {
      for (const entry of entries) {
        if (scannedEntries >= MAX_SANDBOX_INVENTORY_ENTRIES) {
          result.scanComplete = false
          break
        }
        scannedEntries += 1
        if (entry.isSymbolicLink()) {
          result.scanComplete = false
          continue
        }
        entriesToInspect.push({
          entry,
          entryPath: path.join(currentPath, entry.name)
        })
      }
    }

    const childDirectories = []
    await mapWithConcurrency(
      entriesToInspect,
      SANDBOX_ENTRY_STAT_CONCURRENCY,
      async ({ entry, entryPath }) => {
        let stat = null
        try {
          stat = await fs.stat(entryPath)
        } catch {
          result.scanComplete = false
          return
        }
        result.modifiedAt = Math.max(result.modifiedAt, Number(stat.mtimeMs) || 0)
        if (entry.isDirectory() && stat.isDirectory()) {
          childDirectories.push(entryPath)
        } else if (entry.isFile() && stat.isFile()) {
          result.fileCount += 1
          result.totalBytes += Math.max(0, Number(stat.size) || 0)
        } else {
          result.scanComplete = false
        }
      }
    )
    pendingDirectories.push(...childDirectories)
  }
  if (pendingDirectories.length) result.scanComplete = false
  sandboxInventoryCache.set(cacheKey, {
    rootModifiedAt,
    cachedAt: Date.now(),
    inventory: { ...result }
  })
  return result
}

async function listSandboxWorkspaces(options = {}) {
  const workspacesRoot = path.join(
    getSandboxDataRoot(),
    SANDBOX_WORKSPACES_DIRECTORY
  )
  if (!(await pathExists(workspacesRoot))) return []

  const referenceScan = await collectReferencedWorkspaceIds(options)
  const entries = await fs.readdir(workspacesRoot, { withFileTypes: true }).catch(() => [])
  const workspaceEntries = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
  const scannedWorkspaces = await mapWithConcurrency(
    workspaceEntries,
    SANDBOX_WORKSPACE_SCAN_CONCURRENCY,
    async (entry) => {
      let workspaceId = ''
      let valid = true
      try {
        workspaceId = normalizeWorkspaceId(entry.name)
      } catch {
        workspaceId = String(entry.name || '')
        valid = false
      }
      if (!workspaceId) return null

      const inventory = await inspectSandboxDirectory(
        path.join(workspacesRoot, entry.name),
        { refresh: options.refreshInventory === true }
      )
      const referenced = valid && referenceScan.workspaceIds.has(workspaceId)
      const referenceStatus = !valid
        ? 'invalid'
        : !referenceScan.scanComplete
          ? 'unknown'
          : referenced
            ? 'referenced'
            : 'orphaned'
      return {
        workspaceId,
        valid,
        kind: workspaceId.startsWith('chat-') ? 'chat' : 'general',
        referenced,
        referenceStatus,
        referenceScanComplete: referenceScan.scanComplete,
        workspacePath: path.join(
          SANDBOX_DATA_DIRECTORY,
          SANDBOX_WORKSPACES_DIRECTORY,
          entry.name
        ).replace(/\\/g, '/'),
        ...inventory
      }
    }
  )
  const workspaces = scannedWorkspaces.filter(Boolean)
  return workspaces.sort((a, b) => {
    if (a.referenceStatus !== b.referenceStatus) {
      const order = { orphaned: 0, unknown: 1, referenced: 2, invalid: 3 }
      return (order[a.referenceStatus] ?? 9) - (order[b.referenceStatus] ?? 9)
    }
    return String(a.workspaceId || '').localeCompare(String(b.workspaceId || ''))
  })
}

async function listSandboxTrashEntries(options = {}) {
  const trashRoot = getSandboxTrashRoot()
  if (!(await pathExists(trashRoot))) return []
  const entries = await fs.readdir(trashRoot, { withFileTypes: true }).catch(() => [])
  const trashDirectories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
  const scannedManifests = await mapWithConcurrency(
    trashDirectories,
    SANDBOX_WORKSPACE_SCAN_CONCURRENCY,
    async (entry) => {
      try {
        const manifest = await readJsonFile(getSandboxTrashManifestPath(entry.name))
        const trashId = normalizeTrashId(manifest?.trashId)
        const workspaceId = normalizeWorkspaceId(manifest?.workspaceId)
        if (trashId === entry.name) {
          const inventory = await inspectSandboxDirectory(
            path.join(getSandboxTrashEntryRoot(trashId), 'workspace'),
            { refresh: options.refreshInventory === true }
          )
          return {
            ...manifest,
            trashId,
            workspaceId,
            ...inventory
          }
        }
      } catch {
        // Corrupted trash entries are left in place for manual inspection.
      }
      return null
    }
  )
  const manifests = scannedManifests.filter(Boolean)
  return manifests.sort((a, b) => Date.parse(b?.deletedAt || 0) - Date.parse(a?.deletedAt || 0))
}

async function trashSandboxWorkspaces(workspaceIds = [], options = {}) {
  const candidates = [...new Set(
    (Array.isArray(workspaceIds) ? workspaceIds : [])
      .map((item) => {
        try {
          return normalizeWorkspaceId(item)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
  )]
  if (!candidates.length) return []

  const referenceScan = await collectReferencedWorkspaceIds(options)
  const referenced = referenceScan.workspaceIds
  const now = Number(options.now || Date.now()) || Date.now()
  const retentionDays = Math.max(
    1,
    Math.round(Number(options.retentionDays || DEFAULT_SANDBOX_TRASH_RETENTION_DAYS))
  )
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000
  const results = []

  for (const workspaceId of candidates) {
    if (!workspaceId.startsWith('chat-') && options.allowNonChatWorkspace !== true) {
      results.push({ workspaceId, status: 'retained', reason: 'not-session-owned' })
      continue
    }
    if (!referenceScan.scanComplete) {
      results.push({ workspaceId, status: 'retained', reason: 'reference-scan-incomplete' })
      continue
    }
    if (referenced.has(workspaceId)) {
      results.push({ workspaceId, status: 'retained', reason: 'referenced' })
      continue
    }

    const workspaceRoot = getWorkspaceRoot(workspaceId)
    if (!(await pathExists(workspaceRoot))) {
      results.push({ workspaceId, status: 'missing' })
      continue
    }

    const trashId = createSandboxTrashId(workspaceId, now)
    const entryRoot = getSandboxTrashEntryRoot(trashId)
    const trashedWorkspaceRoot = path.join(entryRoot, 'workspace')
    const manifest = {
      version: 1,
      trashId,
      workspaceId,
      status: 'preparing',
      deletedAt: new Date(now).toISOString(),
      purgeAt: new Date(now + retentionMs).toISOString(),
      retentionDays,
      workspacePath: path.join(
        SANDBOX_DATA_DIRECTORY,
        SANDBOX_WORKSPACES_DIRECTORY,
        workspaceId
      ).replace(/\\/g, '/')
    }

    await fs.mkdir(entryRoot, { recursive: true })
    await writeJsonAtomic(getSandboxTrashManifestPath(trashId), manifest)
    try {
      await fs.rename(workspaceRoot, trashedWorkspaceRoot)
      const savedManifest = {
        ...manifest,
        status: 'trashed',
        updatedAt: new Date().toISOString()
      }
      await writeJsonAtomic(getSandboxTrashManifestPath(trashId), savedManifest)
      results.push(savedManifest)
    } catch (error) {
      try {
        if (await pathExists(trashedWorkspaceRoot) && !(await pathExists(workspaceRoot))) {
          await fs.mkdir(path.dirname(workspaceRoot), { recursive: true })
          await fs.rename(trashedWorkspaceRoot, workspaceRoot)
        }
        await fs.rm(entryRoot, { recursive: true, force: true })
      } catch {
        // Preserve the original move error.
      }
      results.push({
        workspaceId,
        trashId,
        status: 'error',
        error: error?.message || String(error)
      })
    }
  }
  return results
}

async function restoreSandboxTrashEntries(entries = []) {
  const source = Array.isArray(entries) ? entries : []
  const results = []
  for (const raw of source) {
    if (String(raw?.status || '') !== 'trashed') {
      results.push({
        workspaceId: cleanString(raw?.workspaceId),
        trashId: cleanString(raw?.trashId),
        status: 'not-required'
      })
      continue
    }
    try {
      const trashId = normalizeTrashId(raw.trashId)
      const manifest = await readJsonFile(getSandboxTrashManifestPath(trashId))
      const workspaceId = normalizeWorkspaceId(manifest.workspaceId)
      const workspaceRoot = getWorkspaceRoot(workspaceId)
      const trashedWorkspaceRoot = path.join(getSandboxTrashEntryRoot(trashId), 'workspace')
      if (await pathExists(workspaceRoot)) {
        results.push({ workspaceId, trashId, status: 'active-exists' })
        continue
      }
      if (!(await pathExists(trashedWorkspaceRoot))) {
        results.push({ workspaceId, trashId, status: 'missing' })
        continue
      }
      await fs.mkdir(path.dirname(workspaceRoot), { recursive: true })
      await fs.rename(trashedWorkspaceRoot, workspaceRoot)
      await fs.rm(getSandboxTrashEntryRoot(trashId), { recursive: true, force: true })
      results.push({ workspaceId, trashId, status: 'restored' })
    } catch (error) {
      results.push({
        workspaceId: cleanString(raw?.workspaceId),
        trashId: cleanString(raw?.trashId),
        status: 'error',
        error: error?.message || String(error)
      })
    }
  }
  return results
}

async function purgeSandboxTrashEntries(entries = [], options = {}) {
  const requestedIds = new Set(
    (Array.isArray(entries) ? entries : [])
      .map((item) => cleanString(typeof item === 'string' ? item : item?.trashId))
      .filter(Boolean)
  )
  if (!requestedIds.size && options.all !== true) return []
  const now = Number(options.now || Date.now()) || Date.now()
  const manifests = await listSandboxTrashEntries()
  const purged = []
  for (const manifest of manifests) {
    if (requestedIds.size && !requestedIds.has(manifest.trashId)) continue
    const purgeAt = Date.parse(String(manifest.purgeAt || ''))
    if (options.force !== true && (!Number.isFinite(purgeAt) || purgeAt > now)) continue
    await fs.rm(getSandboxTrashEntryRoot(manifest.trashId), { recursive: true, force: true })
    purged.push({
      trashId: manifest.trashId,
      workspaceId: manifest.workspaceId,
      status: 'purged'
    })
  }
  return purged
}

async function purgeExpiredSandboxTrash(options = {}) {
  return purgeSandboxTrashEntries([], { ...options, all: true })
}

function getWorkspaceDataPath(workspaceId, relativePath = '') {
  const safeWorkspaceId = normalizeWorkspaceId(workspaceId)
  const safeRelativePath = normalizeSandboxRelativePath(relativePath, { allowEmpty: true })
  return [
    SANDBOX_DATA_DIRECTORY,
    SANDBOX_WORKSPACES_DIRECTORY,
    safeWorkspaceId,
    safeRelativePath
  ].filter(Boolean).join('/')
}

function resolveWorkspacePath(workspaceId, relativePath = '', options = {}) {
  const workspaceRoot = getWorkspaceRoot(workspaceId)
  const safeRelativePath = normalizeSandboxRelativePath(relativePath, { allowEmpty: true })
  const resolved = path.resolve(workspaceRoot, safeRelativePath)
  if (!isPathInside(workspaceRoot, resolved)) {
    throw new Error('沙盒路径不能离开当前工作区')
  }

  if (options.mustExist) {
    const stat = fsSync.lstatSync(resolved)
    if (stat.isSymbolicLink()) throw new Error('不允许通过符号链接访问沙盒外部')
    const real = fsSync.realpathSync(resolved)
    const realRoot = fsSync.realpathSync(workspaceRoot)
    if (!isPathInside(realRoot, real)) throw new Error('沙盒路径不能通过符号链接离开当前工作区')
  }

  return resolved
}

async function ensureWorkspace(workspaceId = DEFAULT_WORKSPACE_ID) {
  const safeWorkspaceId = normalizeWorkspaceId(workspaceId)
  const workspaceRoot = getWorkspaceRoot(safeWorkspaceId)
  await fs.mkdir(path.join(workspaceRoot, 'inbox'), { recursive: true })
  await fs.mkdir(path.join(workspaceRoot, 'output'), { recursive: true })
  await fs.mkdir(path.join(workspaceRoot, '.runtime', 'tmp'), { recursive: true })
  return {
    workspaceId: safeWorkspaceId,
    workspaceRoot,
    dataPath: getWorkspaceDataPath(safeWorkspaceId)
  }
}

function sanitizeImportedFileName(value, fallback = 'file') {
  const raw = path.basename(cleanString(value).replace(/\\/g, '/'))
  const sanitized = raw
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .slice(0, 180)
  return sanitized || fallback
}

async function allocateAvailablePath(workspaceId, relativePath) {
  const safeRelativePath = normalizeSandboxRelativePath(relativePath)
  const parsed = path.posix.parse(safeRelativePath)

  for (let index = 0; index < 10000; index += 1) {
    const suffix = index ? `-${index}` : ''
    const candidate = path.posix.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`)
    const absolutePath = resolveWorkspacePath(workspaceId, candidate)
    try {
      await fs.access(absolutePath)
    } catch {
      return { relativePath: candidate, absolutePath }
    }
  }

  throw new Error('无法为导入文件分配可用名称')
}

function normalizeImportBytes(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value))
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  if (typeof value === 'string') return Buffer.from(value)
  throw new Error('导入文件缺少可写入的数据')
}

function toPublicFileEntry(workspaceId, relativePath, stat) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/')
  const encodedPath = normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return {
    name: path.posix.basename(normalizedPath),
    path: normalizedPath,
    dataPath: getWorkspaceDataPath(workspaceId, normalizedPath),
    downloadHref: `sandbox-file://${normalizeWorkspaceId(workspaceId)}/${encodedPath}`,
    size: Number(stat?.size) || 0,
    modifiedAt: Number(stat?.mtimeMs) || 0
  }
}

async function importWorkspaceFiles(workspaceId, files = []) {
  const workspace = await ensureWorkspace(workspaceId)
  const source = Array.isArray(files) ? files : []
  const prepared = source.map((item, index) => {
    const bytes = normalizeImportBytes(item?.data ?? item?.bytes)
    if (bytes.byteLength > MAX_IMPORTED_FILE_BYTES) {
      throw new Error(`文件 ${item?.name || index + 1} 超过 50MB 的沙盒导入上限`)
    }
    return { item, bytes, index }
  })
  const totalBytes = prepared.reduce((sum, item) => sum + item.bytes.byteLength, 0)
  if (totalBytes > MAX_IMPORTED_BATCH_BYTES) {
    throw new Error('单次导入总大小超过 100MB 的沙盒上限')
  }

  const imported = []
  for (const { item, bytes, index } of prepared) {
    const filename = sanitizeImportedFileName(item?.name, `file-${index + 1}`)
    const requestedPath = item?.targetPath
      ? normalizeSandboxRelativePath(item.targetPath)
      : path.posix.join('inbox', filename)
    const allocated = item?.overwrite
      ? {
          relativePath: requestedPath,
          absolutePath: resolveWorkspacePath(workspace.workspaceId, requestedPath)
        }
      : await allocateAvailablePath(workspace.workspaceId, requestedPath)
    await fs.mkdir(path.dirname(allocated.absolutePath), { recursive: true })
    await fs.writeFile(allocated.absolutePath, bytes)
    const stat = await fs.stat(allocated.absolutePath)
    imported.push(toPublicFileEntry(workspace.workspaceId, allocated.relativePath, stat))
  }

  return {
    kind: 'sandbox_import_result',
    workspaceId: workspace.workspaceId,
    imported
  }
}

async function copyExternalFilesToWorkspace(workspaceId, sourcePaths = []) {
  const workspace = await ensureWorkspace(workspaceId)
  const sources = Array.isArray(sourcePaths) ? sourcePaths : []
  const copied = []
  let totalBytes = 0

  for (const sourcePathRaw of sources) {
    const sourcePath = cleanString(sourcePathRaw)
    if (!sourcePath || !path.isAbsolute(sourcePath)) {
      throw new Error('source_paths 中的每一项都必须是绝对文件路径')
    }
    const sourceStat = await fs.lstat(sourcePath)
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
      throw new Error(`仅支持导入普通文件：${sourcePath}`)
    }
    if (sourceStat.size > MAX_IMPORTED_FILE_BYTES) {
      throw new Error(`文件超过 50MB 的沙盒导入上限：${sourcePath}`)
    }
    totalBytes += sourceStat.size
    if (totalBytes > MAX_IMPORTED_BATCH_BYTES) {
      throw new Error('单次导入总大小超过 100MB 的沙盒上限')
    }

    const filename = sanitizeImportedFileName(path.basename(sourcePath))
    const allocated = await allocateAvailablePath(
      workspace.workspaceId,
      path.posix.join('inbox', filename)
    )
    await fs.mkdir(path.dirname(allocated.absolutePath), { recursive: true })
    await fs.copyFile(sourcePath, allocated.absolutePath)
    const stat = await fs.stat(allocated.absolutePath)
    copied.push(toPublicFileEntry(workspace.workspaceId, allocated.relativePath, stat))
  }

  return {
    kind: 'sandbox_import_result',
    workspaceId: workspace.workspaceId,
    imported: copied
  }
}

async function walkWorkspaceFiles(workspaceId, options = {}) {
  const workspace = await ensureWorkspace(workspaceId)
  const startRelativePath = normalizeSandboxRelativePath(options.path, { allowEmpty: true })
  const startPath = resolveWorkspacePath(workspace.workspaceId, startRelativePath)
  const entries = []
  const limit = Math.max(1, Math.min(MAX_LISTED_FILES, Number(options.limit) || MAX_LISTED_FILES))

  async function walk(absoluteDirectory, relativeDirectory) {
    if (entries.length >= limit) return
    const directoryEntries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
    directoryEntries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of directoryEntries) {
      if (entries.length >= limit) return
      if (entry.isSymbolicLink()) continue
      const relativePath = path.posix.join(relativeDirectory, entry.name)
      if (relativePath === '.runtime' || relativePath.startsWith('.runtime/')) continue
      const absolutePath = path.join(absoluteDirectory, entry.name)
      if (entry.isDirectory()) {
        if (options.recursive !== false) await walk(absolutePath, relativePath)
        continue
      }
      if (!entry.isFile()) continue
      const stat = await fs.stat(absolutePath)
      entries.push(toPublicFileEntry(workspace.workspaceId, relativePath, stat))
    }
  }

  let startStat = null
  try {
    startStat = await fs.lstat(startPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  if (startStat.isSymbolicLink()) throw new Error('不允许列出符号链接')
  if (startStat.isFile()) {
    const stat = await fs.stat(startPath)
    return [toPublicFileEntry(workspace.workspaceId, startRelativePath, stat)]
  }
  if (startStat.isDirectory()) await walk(startPath, startRelativePath)
  return entries
}

async function snapshotWorkspace(workspaceId) {
  const files = await walkWorkspaceFiles(workspaceId, { recursive: true, limit: MAX_LISTED_FILES })
  return new Map(files.map((file) => [file.path, file]))
}

function collectChangedFiles(before, after) {
  const changed = []
  for (const [relativePath, file] of after.entries()) {
    const previous = before.get(relativePath)
    if (
      !previous ||
      Number(previous.size) !== Number(file.size) ||
      Number(previous.modifiedAt) !== Number(file.modifiedAt)
    ) {
      changed.push(file)
    }
  }
  return changed
}

async function resetWorkspace(workspaceId) {
  const safeWorkspaceId = normalizeWorkspaceId(workspaceId)
  const workspaceRoot = getWorkspaceRoot(safeWorkspaceId)
  await fs.rm(workspaceRoot, { recursive: true, force: true })
  const workspace = await ensureWorkspace(safeWorkspaceId)
  return {
    kind: 'sandbox_reset_result',
    workspaceId: workspace.workspaceId,
    ok: true
  }
}

module.exports = {
  DEFAULT_WORKSPACE_ID,
  SANDBOX_DATA_DIRECTORY,
  SANDBOX_WORKSPACES_DIRECTORY,
  SANDBOX_TRASH_DIRECTORY,
  DEFAULT_SANDBOX_TRASH_RETENTION_DAYS,
  normalizeWorkspaceId,
  normalizeSandboxRelativePath,
  getWorkspaceRoot,
  getWorkspaceDataPath,
  resolveWorkspacePath,
  ensureWorkspace,
  importWorkspaceFiles,
  copyExternalFilesToWorkspace,
  walkWorkspaceFiles,
  snapshotWorkspace,
  collectChangedFiles,
  resetWorkspace,
  listSandboxWorkspaces,
  trashSandboxWorkspaces,
  restoreSandboxTrashEntries,
  listSandboxTrashEntries,
  purgeSandboxTrashEntries,
  purgeExpiredSandboxTrash,
  _test: {
    isPathInside,
    sanitizeImportedFileName,
    collectWorkspaceIdsFromValue,
    inspectSandboxDirectory,
    mapWithConcurrency
  }
}
