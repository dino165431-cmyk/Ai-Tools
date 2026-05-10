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

function normalizeDirPath(dirPath) {
  let s = toPosixPath(dirPath).trim()
  if (!s) return ''
  s = s.replace(/^\/+/, '').replace(/\/+$/, '')
  s = s.replace(/^note\//i, '')
  const normalized = path.posix.normalize(s)
  if (!normalized || normalized === '.') return ''
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('dirPath 不合法（不允许越界或绝对路径）')
  }
  return normalized
}

function normalizeNoteName(noteName) {
  const raw = String(noteName || '').trim()
  if (!raw) throw new Error('noteName 不能为空')
  if (raw.includes('\0')) throw new Error('noteName 包含非法字符')
  if (raw.includes('/') || raw.includes('\\')) throw new Error('noteName 不能包含路径分隔符')
  const name = raw.endsWith('.md') ? raw : `${raw}.md`
  if (name === '.md' || name === '..md') throw new Error('noteName 不合法')
  return name
}

function normalizeNotePathInRoot(notePath) {
  let s = toPosixPath(notePath).trim()
  if (!s) throw new Error('path 不能为空')
  s = s.replace(/^\/+/, '')
  s = s.replace(/^note\//i, '')
  if (!s.toLowerCase().endsWith('.md')) s += '.md'
  const normalized = path.posix.normalize(s)
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('path 不合法')
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('path 不合法（不允许越界或绝对路径）')
  }
  return normalized
}

function buildNoteRelPath({ notesRoot, dirPath, noteName }) {
  const dir = normalizeDirPath(dirPath)
  const name = normalizeNoteName(noteName)
  const relInRoot = dir ? `${dir}/${name}` : name
  return toPosixPath(path.posix.join(notesRoot, relInRoot))
}

function buildNoteRelPathFromArgs({ notesRoot, notePath, dirPath, noteName }) {
  const p = String(notePath || '').trim()
  if (p) {
    const relInRoot = normalizeNotePathInRoot(p)
    return toPosixPath(path.posix.join(notesRoot, relInRoot))
  }
  return buildNoteRelPath({ notesRoot, dirPath, noteName })
}

function safeDecodeURIComponent(val) {
  try {
    return decodeURIComponent(val)
  } catch {
    return String(val || '')
  }
}

function stripUrlHashAndQuery(url) {
  const s = String(url || '')
  return s.split('#')[0].split('?')[0]
}

function extractMarkdownImageUrls(markdown) {
  const text = String(markdown || '')
  const urls = []
  const re = /!\[[^\]]*?\]\(([^)]+)\)/g
  let m
  while ((m = re.exec(text))) {
    const inside = String(m[1] || '').trim()
    if (!inside) continue
    const firstSpace = inside.search(/\s/)
    const url = firstSpace === -1 ? inside : inside.slice(0, firstSpace)
    if (url) urls.push(url)
  }

  const seen = new Set()
  const out = []
  for (const u of urls) {
    const k = String(u || '')
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

function resolveLocalImageRelPath({ notesRoot, noteRelInRoot, urlRaw }) {
  const url = String(urlRaw || '').trim()
  if (!url) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return null

  const decoded = safeDecodeURIComponent(stripUrlHashAndQuery(url))
  if (!decoded) return null

  const isAbsoluteLocal = decoded.startsWith('/')
  let src = decoded
  if (isAbsoluteLocal) src = src.replace(/^\/+/, '')

  if (isAbsoluteLocal) {
    const normalized = path.posix.normalize(src)
    if (!normalized || normalized === '.' || normalized === '..') return null
    if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null
    const pathInNotesRoot = normalized.startsWith(`${notesRoot}/`)
      ? normalized
      : toPosixPath(path.posix.join(notesRoot, normalized))
    return { ref: urlRaw, path: pathInNotesRoot }
  }

  if (src.startsWith(`${notesRoot}/`)) {
    const normalized = path.posix.normalize(src)
    if (!normalized || normalized === '.' || normalized === '..') return null
    if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null
    if (!normalized.startsWith(`${notesRoot}/`)) return null
    return { ref: urlRaw, path: toPosixPath(normalized) }
  }

  const noteDir = path.posix.dirname(noteRelInRoot)
  const joined = path.posix.normalize(path.posix.join(noteDir === '.' ? '' : noteDir, src))
  if (!joined || joined === '.' || joined === '..') return null
  if (joined.startsWith('../') || path.posix.isAbsolute(joined)) return null

  const fileRel = toPosixPath(path.posix.join(notesRoot, joined))
  return { ref: urlRaw, path: fileRel }
}

function guessMimeByExt(extRaw) {
  const ext = String(extRaw || '').toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.ico') return 'image/x-icon'
  return 'application/octet-stream'
}

function isNoteAssetDirectoryName(name) {
  const value = String(name || '').trim()
  return value === 'assets' || value.endsWith('.assets')
}

function buildRelativePath(base, name) {
  return base ? `${base}/${name}` : name
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

function buildNoteNode(fileName, relPath, options = {}) {
  const statInfo = options.statInfo || null
  return {
    type: 'note',
    name: fileName.slice(0, -3),
    filename: fileName,
    path: relPath,
    ...(statInfo ? { size: Number(statInfo.size) || 0, mtimeMs: Number(statInfo.mtimeMs) || 0 } : {})
  }
}

async function listDirectoryEntries({ notesRoot, dirPath = '', limit = DEFAULT_LIST_LIMIT }) {
  await ensureDir(notesRoot)
  const rootAbs = fileOperations._resolvePath(notesRoot)
  const relDir = normalizeDirPath(dirPath)
  const absDir = relDir ? path.join(rootAbs, ...relDir.split('/')) : rootAbs
  const maxItems = normalizeLimit(limit, DEFAULT_LIST_LIMIT)
  const entries = await readDirEntriesSafe(absDir)

  const dirs = []
  const notes = []

  for (const entry of entries) {
    const name = entry?.name ? String(entry.name) : ''
    if (!name || name.startsWith('.')) continue
    if (entry.isDirectory()) {
      if (isNoteAssetDirectoryName(name)) continue
      dirs.push({
        type: 'dir',
        name,
        path: buildRelativePath(relDir, name)
      })
      continue
    }
    if (entry.isFile() && name.toLowerCase().endsWith('.md')) {
      notes.push({
        type: 'note',
        name: name.slice(0, -3),
        filename: name,
        path: buildRelativePath(relDir, name)
      })
    }
  }

  dirs.sort((a, b) => compareByName(a.name, b.name))
  notes.sort((a, b) => compareByName(a.name, b.name))
  const items = [...dirs, ...notes]

  return {
    root: notesRoot,
    dirPath: relDir,
    returned: Math.min(items.length, maxItems),
    total: items.length,
    hasMore: items.length > maxItems,
    items: items.slice(0, maxItems)
  }
}

async function listRecentNotes({ notesRoot, dirPath = '', limit = DEFAULT_RECENT_LIMIT }) {
  if (String(notesRoot || '').trim() !== 'note') {
    throw new Error('notes_list_recent 当前仅支持默认 note 根目录')
  }
  return contentIndex.listRecent('note', { dirPath, limit })
}

async function searchNotes({ notesRoot, dirPath = '', query = '', limit = DEFAULT_RECENT_LIMIT }) {
  if (String(notesRoot || '').trim() !== 'note') {
    throw new Error('notes_search 当前仅支持默认 note 根目录')
  }
  return contentIndex.searchIndex('note', { dirPath, query, limit })
}

async function readNoteTree({ notesRoot, dirPath = '', maxDepth = DEFAULT_TREE_MAX_DEPTH }) {
  await ensureDir(notesRoot)
  const rootAbs = fileOperations._resolvePath(notesRoot)
  const startRel = normalizeDirPath(dirPath)
  const startAbs = startRel ? path.join(rootAbs, ...startRel.split('/')) : rootAbs
  const maxD = normalizeTreeDepth(maxDepth)

  async function walk(absDir, relInRoot, depth) {
    const entries = await readDirEntriesSafe(absDir)
    const dirs = []
    const notes = []

    for (const entry of entries) {
      const name = entry?.name ? String(entry.name) : ''
      if (!name || name.startsWith('.')) continue

      if (entry.isDirectory()) {
        if (isNoteAssetDirectoryName(name)) continue
        dirs.push(name)
        continue
      }

      if (entry.isFile() && name.toLowerCase().endsWith('.md')) {
        notes.push(name)
      }
    }

    dirs.sort(compareByName)
    notes.sort(compareByName)

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
    for (const fileName of notes) {
      const rel = buildRelativePath(relInRoot, fileName)
      children.push(buildNoteNode(fileName, rel))
    }
    return children
  }

  return {
    root: notesRoot,
    base: startRel,
    maxDepth: maxD,
    tree: buildDirectoryNode(
      startRel ? path.posix.basename(startRel) : notesRoot,
      startRel,
      await walk(startAbs, startRel, 1)
    )
  }
}

async function readNoteWithImages({ notesRoot, notePath, includeImages = true }) {
  const relInRoot = normalizeNotePathInRoot(notePath)
  const noteRel = toPosixPath(path.posix.join(notesRoot, relInRoot))
  const content = await fileOperations.readFile(noteRel, 'utf-8')

  const result = {
    path: relInRoot,
    content: String(content || ''),
    images: []
  }

  if (!includeImages) return result

  const urls = extractMarkdownImageUrls(result.content)
  const resolved = []
  const seenPaths = new Set()
  for (const urlRaw of urls) {
    const r = resolveLocalImageRelPath({ notesRoot, noteRelInRoot: relInRoot, urlRaw })
    if (!r?.path) continue
    if (seenPaths.has(r.path)) continue
    seenPaths.add(r.path)
    resolved.push(r)
  }

  const maxImages = 10
  const maxPerImageBytes = 2 * 1024 * 1024
  const maxTotalBytes = 8 * 1024 * 1024

  let total = 0
  for (const item of resolved.slice(0, maxImages)) {
    const refRaw = item.ref
    const imageRel = item.path
    try {
      const abs = fileOperations._resolvePath(imageRel)
      const statInfo = await fs.stat(abs)
      if (!statInfo.isFile()) {
        result.images.push({ ref: refRaw, path: imageRel, ok: false, error: 'not a file' })
        continue
      }

      const size = Number(statInfo.size) || 0
      if (size > maxPerImageBytes) {
        result.images.push({ ref: refRaw, path: imageRel, ok: false, skipped: true, size, error: 'image too large' })
        continue
      }
      if (total + size > maxTotalBytes) {
        result.images.push({ ref: refRaw, path: imageRel, ok: false, skipped: true, size, error: 'total image bytes limit reached' })
        continue
      }

      const buf = await fileOperations.readFile(imageRel, null)
      const base64 = Buffer.from(buf).toString('base64')
      total += size
      result.images.push({
        ref: refRaw,
        path: imageRel,
        ok: true,
        size,
        mime: guessMimeByExt(path.extname(imageRel)),
        base64
      })
    } catch (e) {
      result.images.push({ ref: refRaw, path: imageRel, ok: false, error: e?.message || String(e) })
    }
  }

  if (resolved.length > maxImages) {
    result.images.push({
      ref: null,
      path: null,
      ok: false,
      skipped: true,
      error: `图片数量过多：已截断为前 ${maxImages} 张`
    })
  }

  return result
}

async function createNote({ notesRoot, notePath, dirPath, noteName, content }) {
  await ensureDir(notesRoot)
  const noteRel = buildNoteRelPathFromArgs({ notesRoot, notePath, dirPath, noteName })
  const exists = await fileOperations.exists(noteRel)
  if (exists) throw new Error(`笔记已存在：${noteRel}`)
  await fileOperations.writeFile(noteRel, String(content ?? ''))
  return { ok: true, path: noteRel.replace(new RegExp(`^${notesRoot}/?`, 'i'), '') }
}

async function writeNote({ notesRoot, notePath, dirPath, noteName, content, mode }) {
  await ensureDir(notesRoot)
  const noteRel = buildNoteRelPathFromArgs({ notesRoot, notePath, dirPath, noteName })
  const m = String(mode || 'append').trim().toLowerCase()
  const finalMode = (m === 'overwrite' || m === '覆盖') ? 'overwrite' : 'append'

  const exists = await fileOperations.exists(noteRel)
  const text = String(content ?? '')

  if (finalMode === 'overwrite' || !exists) {
    await fileOperations.writeFile(noteRel, text)
    return {
      ok: true,
      path: noteRel.replace(new RegExp(`^${notesRoot}/?`, 'i'), ''),
      mode: exists ? 'overwrite' : 'create'
    }
  }

  const abs = fileOperations._resolvePath(noteRel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const payload = text && !text.startsWith('\n') ? `\n${text}` : text
  await fs.appendFile(abs, payload, 'utf-8')
  return { ok: true, path: noteRel.replace(new RegExp(`^${notesRoot}/?`, 'i'), ''), mode: 'append' }
}

const TOOLS = [
  {
    name: 'notes_list_directory',
    description: '列出指定目录下的直接子目录和笔记，不递归，适合大目录场景下快速定位。',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: '相对 note 根目录的目录路径；为空表示根目录。' },
        limit: { type: 'integer', description: `最多返回多少项，默认 ${DEFAULT_LIST_LIMIT}。` }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notes_list_recent',
    description: '按最近修改时间列出笔记，适合先定位最近活跃内容，再按 path 读取具体笔记。',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: '相对 note 根目录的目录路径；为空表示整个 note 根目录。' },
        limit: { type: 'integer', description: `最多返回多少项，默认 ${DEFAULT_RECENT_LIMIT}。` }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notes_search',
    description: '按笔记名或相对路径搜索笔记，适合在大笔记库中快速定位目标。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，可输入文件名片段、目录名片段或相对路径片段。' },
        dirPath: { type: 'string', description: '相对 note 根目录的目录路径；为空表示整个 note 根目录。' },
        limit: { type: 'integer', description: `最多返回多少项，默认 ${DEFAULT_RECENT_LIMIT}。` }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'notes_list_tree',
    description: '列出笔记树结构。默认只展开较浅层级；确实需要全局概览时再提高 maxDepth。',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: '只列出指定子目录（相对 note 根目录）。' },
        maxDepth: { type: 'integer', description: `递归深度，默认 ${DEFAULT_TREE_MAX_DEPTH}，最大 ${MAX_TREE_MAX_DEPTH}。` }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notes_read',
    description: '读取指定路径的笔记（相对 note 根目录），并尽量一并读取它引用的本地图片。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 note 根目录的路径，例如 project/todo.md（可省略 .md）。' },
        includeImages: { type: 'boolean', description: '是否读取图片，默认 true。' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'notes_create',
    description: '新增笔记并写入内容（若已存在则报错）。支持传 path 或 dirPath+noteName。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 note 根目录的路径，例如 project/todo.md（可省略 .md）。传 path 时会忽略 dirPath/noteName。' },
        dirPath: { type: 'string', description: '相对 note 根目录的目录路径，例如 project（可为空）。' },
        noteName: { type: 'string', description: '笔记名，例如 todo 或 todo.md。' },
        content: { type: 'string', description: '要写入的内容。' }
      },
      required: ['content'],
      additionalProperties: false
    }
  },
  {
    name: 'notes_write',
    description: '写入笔记内容，默认追加，也支持覆盖。支持传 path 或 dirPath+noteName。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 note 根目录的路径，例如 project/todo.md（可省略 .md）。传 path 时会忽略 dirPath/noteName。' },
        dirPath: { type: 'string', description: '相对 note 根目录的目录路径，例如 project（可为空）。' },
        noteName: { type: 'string', description: '笔记名，例如 todo 或 todo.md。' },
        content: { type: 'string', description: '要写入的内容。' },
        mode: { type: 'string', enum: ['append', 'overwrite'], description: '写入模式：append（默认）或 overwrite（覆盖）。' }
      },
      required: ['content'],
      additionalProperties: false
    }
  }
]

class BuiltinNotesMcpClient {
  constructor(serverConfig) {
    this.config = serverConfig || {}
    this.notesRoot = String(this.config.notesRoot || 'note').trim() || 'note'
  }

  async listTools() {
    return TOOLS
  }

  async callTool(toolName, args) {
    const name = String(toolName || '').trim()
    const params = args && typeof args === 'object' ? args : {}

    if (name === 'notes_list_directory') {
      return await listDirectoryEntries({
        notesRoot: this.notesRoot,
        dirPath: params.dirPath,
        limit: params.limit
      })
    }

    if (name === 'notes_list_recent') {
      return await listRecentNotes({
        notesRoot: this.notesRoot,
        dirPath: params.dirPath,
        limit: params.limit
      })
    }

    if (name === 'notes_search') {
      return await searchNotes({
        notesRoot: this.notesRoot,
        dirPath: params.dirPath,
        query: params.query,
        limit: params.limit
      })
    }

    if (name === 'notes_list_tree') {
      return await readNoteTree({
        notesRoot: this.notesRoot,
        dirPath: params.dirPath,
        maxDepth: params.maxDepth
      })
    }

    if (name === 'notes_read') {
      return await readNoteWithImages({
        notesRoot: this.notesRoot,
        notePath: params.path,
        includeImages: params.includeImages !== false
      })
    }

    if (name === 'notes_create') {
      if (typeof params.content !== 'string') throw new Error('content 必填')
      const hasPath = typeof params.path === 'string' && params.path.trim()
      const hasName = typeof params.noteName === 'string' && params.noteName.trim()
      if (!hasPath && !hasName) throw new Error('notes_create 需要 path 或 noteName')
      return await createNote({
        notesRoot: this.notesRoot,
        notePath: params.path,
        dirPath: params.dirPath,
        noteName: params.noteName,
        content: params.content
      })
    }

    if (name === 'notes_write') {
      if (typeof params.content !== 'string') throw new Error('content 必填')
      const hasPath = typeof params.path === 'string' && params.path.trim()
      const hasName = typeof params.noteName === 'string' && params.noteName.trim()
      if (!hasPath && !hasName) throw new Error('notes_write 需要 path 或 noteName')
      return await writeNote({
        notesRoot: this.notesRoot,
        notePath: params.path,
        dirPath: params.dirPath,
        noteName: params.noteName,
        content: params.content,
        mode: params.mode
      })
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

module.exports = function createBuiltinNotesMcpClient(serverConfig) {
  return new BuiltinNotesMcpClient(serverConfig)
}
