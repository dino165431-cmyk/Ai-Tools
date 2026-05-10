const path = require('path')
const fs = require('fs').promises

const fileOperations = require('../utils/file-operations')
const contentIndex = require('../utils/content-index')

const DEFAULT_LIST_LIMIT = 200
const MAX_LIST_LIMIT = 1000
const DEFAULT_RECENT_LIMIT = 20
const MAX_RECENT_LIMIT = 200
const DEFAULT_TREE_MAX_DEPTH = 2
const MAX_TREE_MAX_DEPTH = 12

function toPosixPath(p) {
  return String(p || '').replace(/\\/g, '/')
}

function compareByName(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function normalizeLimit(limitRaw, fallback, max = MAX_LIST_LIMIT) {
  const value = Number(limitRaw)
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (normalized <= 0) return fallback
  return Math.min(normalized, max)
}

function normalizeTreeDepth(depthRaw, fallback = DEFAULT_TREE_MAX_DEPTH) {
  const value = Number(depthRaw)
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (normalized <= 0) return fallback
  return Math.min(normalized, MAX_TREE_MAX_DEPTH)
}

function normalizeRootDir(rootRaw, fallback) {
  const fb = String(fallback || '').trim() || 'session'
  let s = toPosixPath(rootRaw).trim()
  if (!s) s = fb
  s = s.replace(/^\/+/, '').replace(/\/+$/, '')
  const normalized = path.posix.normalize(s)
  if (!normalized || normalized === '.') return fb
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('sessionsRoot 不合法（不允许越界或绝对路径）')
  }
  return normalized
}

function normalizeDirPath(dirPathRaw) {
  let s = toPosixPath(dirPathRaw).trim()
  if (!s) return ''
  if (s.includes('\0')) throw new Error('dirPath 包含非法字符')
  s = s.replace(/^\/+/, '').replace(/\/+$/, '')
  const normalized = path.posix.normalize(s)
  if (!normalized || normalized === '.') return ''
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('dirPath 不合法（不允许越界或绝对路径）')
  }
  return normalized
}

function normalizeSessionPathInRoot(sessionPathRaw) {
  let s = toPosixPath(sessionPathRaw).trim()
  if (!s) throw new Error('path 不能为空')
  if (s.includes('\0')) throw new Error('path 包含非法字符')
  s = s.replace(/^\/+/, '')
  if (!s.toLowerCase().endsWith('.json')) s += '.json'
  const normalized = path.posix.normalize(s)
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('path 不合法')
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('path 不合法（不允许越界或绝对路径）')
  }
  return normalized
}

function isChatSessionAssetDirectoryName(name) {
  return String(name || '').trim().toLowerCase().endsWith('.json.assets')
}

function buildRelativePath(base, name) {
  return base ? `${base}/${name}` : name
}

function buildDirectoryNode(name, relPath, children, options = {}) {
  const hasMore = options.hasMore === true
  return {
    type: 'dir',
    name,
    path: relPath,
    children,
    ...(hasMore ? { hasMore: true } : {})
  }
}

function buildSessionNode(fileName, relPath, options = {}) {
  const statInfo = options.statInfo || null
  return {
    type: 'session',
    name: fileName.slice(0, -5),
    filename: fileName,
    path: relPath,
    ...(statInfo ? { size: Number(statInfo.size) || 0, mtimeMs: Number(statInfo.mtimeMs) || 0 } : {})
  }
}

async function ensureDir(relPath) {
  try {
    await fileOperations.createDirectory(relPath)
  } catch {
    // ignore
  }
}

async function readDirEntriesSafe(absDir) {
  try {
    return await fs.readdir(absDir, { withFileTypes: true })
  } catch (e) {
    if (e && e.code === 'ENOENT') return []
    throw e
  }
}

async function listSessionDirectory({ sessionsRoot, dirPath = '', limit = DEFAULT_LIST_LIMIT }) {
  await ensureDir(sessionsRoot)
  const rootAbs = fileOperations._resolvePath(sessionsRoot)
  const relDir = normalizeDirPath(dirPath)
  const absDir = relDir ? path.join(rootAbs, ...relDir.split('/')) : rootAbs
  const maxItems = normalizeLimit(limit, DEFAULT_LIST_LIMIT)
  const entries = await readDirEntriesSafe(absDir)

  const dirs = []
  const sessions = []

  for (const entry of entries) {
    const name = entry?.name ? String(entry.name) : ''
    if (!name || name.startsWith('.')) continue

    if (entry.isDirectory()) {
      if (isChatSessionAssetDirectoryName(name)) continue
      dirs.push({
        type: 'dir',
        name,
        path: buildRelativePath(relDir, name)
      })
      continue
    }

    if (entry.isFile() && name.toLowerCase().endsWith('.json')) {
      sessions.push({
        type: 'session',
        name: name.slice(0, -5),
        filename: name,
        path: buildRelativePath(relDir, name)
      })
    }
  }

  dirs.sort((a, b) => compareByName(a.name, b.name))
  sessions.sort((a, b) => compareByName(a.name, b.name))
  const items = [...dirs, ...sessions]

  return {
    root: sessionsRoot,
    dirPath: relDir,
    returned: Math.min(items.length, maxItems),
    total: items.length,
    hasMore: items.length > maxItems,
    items: items.slice(0, maxItems)
  }
}

async function listRecentSessions({ sessionsRoot, dirPath = '', limit = DEFAULT_RECENT_LIMIT }) {
  if (String(sessionsRoot || '').trim() !== 'session') {
    throw new Error('sessions_list_recent 当前仅支持默认 session 根目录')
  }
  return contentIndex.listRecent('session', { dirPath, limit })
}

async function searchSessions({ sessionsRoot, dirPath = '', query = '', limit = DEFAULT_RECENT_LIMIT }) {
  if (String(sessionsRoot || '').trim() !== 'session') {
    throw new Error('sessions_search 当前仅支持默认 session 根目录')
  }
  return contentIndex.searchIndex('session', { dirPath, query, limit })
}

async function listSessionTree({ sessionsRoot, dirPath = '', maxDepth = DEFAULT_TREE_MAX_DEPTH }) {
  await ensureDir(sessionsRoot)
  const rootAbs = fileOperations._resolvePath(sessionsRoot)
  const startRel = normalizeDirPath(dirPath)
  const startAbs = startRel ? path.join(rootAbs, ...startRel.split('/')) : rootAbs
  const maxD = normalizeTreeDepth(maxDepth)

  async function walk(absDir, relInRoot, depth) {
    const entries = await readDirEntriesSafe(absDir)
    const dirs = []
    const sessions = []

    for (const entry of entries) {
      const name = entry?.name ? String(entry.name) : ''
      if (!name || name.startsWith('.')) continue

      if (entry.isDirectory()) {
        if (isChatSessionAssetDirectoryName(name)) continue
        dirs.push(name)
        continue
      }

      if (entry.isFile() && name.toLowerCase().endsWith('.json')) {
        sessions.push(name)
      }
    }

    dirs.sort(compareByName)
    sessions.sort(compareByName)

    const children = []
    for (const dirName of dirs) {
      const childRel = buildRelativePath(relInRoot, dirName)
      const childAbs = path.join(absDir, dirName)
      if (depth >= maxD) {
        children.push(buildDirectoryNode(dirName, childRel, [], { hasMore: true }))
        continue
      }
      children.push(buildDirectoryNode(dirName, childRel, await walk(childAbs, childRel, depth + 1)))
    }
    for (const fileName of sessions) {
      const rel = buildRelativePath(relInRoot, fileName)
      children.push(buildSessionNode(fileName, rel))
    }
    return children
  }

  return {
    root: sessionsRoot,
    base: startRel,
    maxDepth: maxD,
    tree: buildDirectoryNode(
      startRel ? path.posix.basename(startRel) : sessionsRoot,
      startRel,
      await walk(startAbs, startRel, 1)
    )
  }
}

async function readOneSession({ sessionsRoot, sessionPath, parse = true }) {
  await ensureDir(sessionsRoot)
  const relInRoot = normalizeSessionPathInRoot(sessionPath)
  const sessionRel = toPosixPath(path.posix.join(sessionsRoot, relInRoot))

  const abs = fileOperations._resolvePath(sessionRel)
  const st = await fs.stat(abs)
  if (!st.isFile()) throw new Error('path 不是文件')

  const maxBytes = 6 * 1024 * 1024
  const size = Number(st.size) || 0
  if (size > maxBytes) {
    return {
      ok: false,
      path: relInRoot,
      size,
      error: `会话文件过大：超过 ${maxBytes} bytes`
    }
  }

  const content = await fileOperations.readFile(sessionRel, 'utf-8')
  const meta = { ok: true, path: relInRoot, size, mtimeMs: Number(st.mtimeMs) || null }
  if (parse === false) return { ...meta, content: String(content || '') }

  try {
    const data = JSON.parse(String(content || ''))
    return { ...meta, data }
  } catch (e) {
    return { ok: false, path: relInRoot, size, mtimeMs: Number(st.mtimeMs) || null, error: e?.message || String(e) }
  }
}

const TOOLS = [
  {
    name: 'sessions_list_directory',
    description: '列出指定目录下的直接子目录和会话文件，不递归，适合大目录场景下快速定位。',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: '相对 sessionsRoot 的目录路径；为空表示根目录。' },
        limit: { type: 'integer', description: `最多返回多少项，默认 ${DEFAULT_LIST_LIMIT}。` }
      },
      additionalProperties: false
    }
  },
  {
    name: 'sessions_list_recent',
    description: '按最近修改时间列出会话文件，适合先定位最近会话，再按 path 读取具体 JSON。',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: '相对 sessionsRoot 的目录路径；为空表示整个根目录。' },
        limit: { type: 'integer', description: `最多返回多少项，默认 ${DEFAULT_RECENT_LIMIT}。` }
      },
      additionalProperties: false
    }
  },
  {
    name: 'sessions_search',
    description: '按会话文件名或相对路径搜索会话，适合在大量历史记录中快速定位目标。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，可输入文件名片段、目录名片段或相对路径片段。' },
        dirPath: { type: 'string', description: '相对 sessionsRoot 的目录路径；为空表示整个根目录。' },
        limit: { type: 'integer', description: `最多返回多少项，默认 ${DEFAULT_RECENT_LIMIT}。` }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'sessions_list_tree',
    description: '列出会话树结构。默认只展开较浅层级；确实需要全局概览时再提高 maxDepth。',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: '只列出指定子目录（相对 sessionsRoot）。' },
        maxDepth: { type: 'integer', description: `递归深度，默认 ${DEFAULT_TREE_MAX_DEPTH}，最大 ${MAX_TREE_MAX_DEPTH}。` }
      },
      additionalProperties: false
    }
  },
  {
    name: 'sessions_read',
    description: '读取单个会话文件（相对 sessionsRoot 的路径）。默认会解析 JSON，传 parse=false 可读原始文本。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 sessionsRoot 的路径，例如 xxx.json 或 定时任务/任务名/记录.json（可省略 .json）。' },
        parse: { type: 'boolean', description: '是否解析为 JSON，默认 true。' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'sessions_read_many',
    description: '批量读取多个会话文件（相对 sessionsRoot 的路径数组）。默认解析 JSON。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: '路径数组；每项可省略 .json。' },
        parse: { type: 'boolean', description: '是否解析为 JSON，默认 true。' }
      },
      required: ['paths'],
      additionalProperties: false
    }
  }
]

class BuiltinSessionsMcpClient {
  constructor(serverConfig) {
    this.config = serverConfig || {}
    this.sessionsRoot = normalizeRootDir(this.config.sessionsRoot, 'session')
  }

  async listTools() {
    return TOOLS
  }

  async callTool(toolName, args) {
    const name = String(toolName || '').trim()
    const params = args && typeof args === 'object' ? args : {}

    if (name === 'sessions_list_directory') {
      return await listSessionDirectory({
        sessionsRoot: this.sessionsRoot,
        dirPath: params.dirPath,
        limit: params.limit
      })
    }

    if (name === 'sessions_list_recent') {
      return await listRecentSessions({
        sessionsRoot: this.sessionsRoot,
        dirPath: params.dirPath,
        limit: params.limit
      })
    }

    if (name === 'sessions_search') {
      return await searchSessions({
        sessionsRoot: this.sessionsRoot,
        dirPath: params.dirPath,
        query: params.query,
        limit: params.limit
      })
    }

    if (name === 'sessions_list_tree') {
      return await listSessionTree({
        sessionsRoot: this.sessionsRoot,
        dirPath: params.dirPath,
        maxDepth: params.maxDepth
      })
    }

    if (name === 'sessions_read') {
      return await readOneSession({
        sessionsRoot: this.sessionsRoot,
        sessionPath: params.path,
        parse: params.parse !== false
      })
    }

    if (name === 'sessions_read_many') {
      const list = Array.isArray(params.paths) ? params.paths : []
      const max = 20
      const trimmed = list.slice(0, max)
      const results = []
      for (const p of trimmed) {
        try {
          results.push(
            await readOneSession({
              sessionsRoot: this.sessionsRoot,
              sessionPath: p,
              parse: params.parse !== false
            })
          )
        } catch (e) {
          results.push({ ok: false, path: String(p || ''), error: e?.message || String(e) })
        }
      }
      return {
        ok: true,
        requested: list.length,
        returned: trimmed.length,
        results
      }
    }

    throw new Error(`Unknown tool: ${name}`)
  }

  async listPrompts() {
    return []
  }

  async listResources() {
    return []
  }

  close() {}
}

module.exports = function createBuiltinSessionsMcpClient(serverConfig) {
  return new BuiltinSessionsMcpClient(serverConfig)
}
