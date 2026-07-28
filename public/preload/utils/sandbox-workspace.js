const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')

const globalConfig = require('./global-config')

const SANDBOX_DATA_DIRECTORY = '.ai-tools-sandbox'
const SANDBOX_WORKSPACES_DIRECTORY = 'workspaces'
const DEFAULT_WORKSPACE_ID = 'default'
const MAX_WORKSPACE_ID_LENGTH = 80
const MAX_IMPORTED_FILE_BYTES = 50 * 1024 * 1024
const MAX_IMPORTED_BATCH_BYTES = 100 * 1024 * 1024
const MAX_LISTED_FILES = 500

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
  return {
    name: path.posix.basename(normalizedPath),
    path: normalizedPath,
    dataPath: getWorkspaceDataPath(workspaceId, normalizedPath),
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
  _test: {
    isPathInside,
    sanitizeImportedFileName
  }
}
