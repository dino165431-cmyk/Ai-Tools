const path = require('path')
const fs = require('fs').promises

const fileOperations = require('../utils/file-operations')

function toPosixPath(p) {
  return String(p || '').replace(/\\/g, '/')
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

async function ensureDir(relPath) {
  try {
    await fileOperations.createDirectory(relPath)
  } catch {
    // ignore
  }
}

async function listSessionTree({ sessionsRoot, dirPath = '', maxDepth = 12 }) {
  await ensureDir(sessionsRoot)
  const rootAbs = fileOperations._resolvePath(sessionsRoot)
  const startRel = normalizeDirPath(dirPath)
  const startAbs = startRel ? path.join(rootAbs, ...startRel.split('/')) : rootAbs
  const maxD = Number.isFinite(Number(maxDepth)) ? Math.max(1, Math.min(50, Math.floor(Number(maxDepth)))) : 12

  async function walk(absDir, relInRoot, depth) {
    if (depth > maxD) return []

    let entries = []
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch (e) {
      if (e && e.code === 'ENOENT') return []
      throw e
    }

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

    dirs.sort((a, b) => a.localeCompare(b))
    sessions.sort((a, b) => a.localeCompare(b))

    const children = []
    for (const dirName of dirs) {
      const childRel = relInRoot ? `${relInRoot}/${dirName}` : dirName
      const childAbs = path.join(absDir, dirName)
      children.push({
        type: 'dir',
        name: dirName,
        path: childRel,
        children: await walk(childAbs, childRel, depth + 1)
      })
    }
    for (const fileName of sessions) {
      const rel = relInRoot ? `${relInRoot}/${fileName}` : fileName
      children.push({
        type: 'session',
        name: fileName.slice(0, -5),
        filename: fileName,
        path: rel
      })
    }
    return children
  }

  const children = await walk(startAbs, startRel, 1)

  return {
    root: sessionsRoot,
    base: startRel,
    tree: {
      type: 'dir',
      name: startRel ? path.posix.basename(startRel) : sessionsRoot,
      path: startRel,
      children
    }
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
      error: `会话文件过大（> ${maxBytes} bytes）`
    }
  }

  const content = await fileOperations.readFile(sessionRel, 'utf-8')
  const meta = { ok: true, path: relInRoot, size, mtimeMs: Number(st.mtimeMs) || null }
  const shouldParse = parse !== false
  if (!shouldParse) return { ...meta, content: String(content || '') }

  try {
    const data = JSON.parse(String(content || ''))
    return { ...meta, data }
  } catch (e) {
    return { ok: false, path: relInRoot, size, mtimeMs: Number(st.mtimeMs) || null, error: e?.message || String(e) }
  }
}

const TOOLS = [
  {
    name: 'sessions_list_tree',
    description: '列出历史会话的树形结构（仅 .json）。默认根目录为 sessionsRoot（通常是 session/），定时任务会话在 session/定时任务/ 下。',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: '只列出指定子目录（相对 sessionsRoot），例如 定时任务 或 定时任务/某任务名' },
        maxDepth: { type: 'integer', description: '最大递归深度（默认 12，范围 1~50）' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'sessions_read',
    description: '读取单个历史会话（相对 sessionsRoot 的路径）。默认会解析 JSON 并返回 data；如需原始文本可传 parse=false。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 sessionsRoot 的路径，例如 xxx.json 或 定时任务/任务名/任务名.json（可省略 .json）' },
        parse: { type: 'boolean', description: '是否解析为 JSON（默认 true）' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'sessions_read_many',
    description: '批量读取多个历史会话（相对 sessionsRoot 的路径数组）。默认解析 JSON。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: '路径数组；每项可省略 .json' },
        parse: { type: 'boolean', description: '是否解析为 JSON（默认 true）' }
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
