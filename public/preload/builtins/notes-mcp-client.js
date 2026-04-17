const path = require('path')
const fs = require('fs').promises

const fileOperations = require('../utils/file-operations')

function toPosixPath(p) {
  return String(p || '').replace(/\\/g, '/')
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

  // Dedupe while preserving order
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

  // External / unsupported schemes
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

  // If user already wrote an absolute-relative path under notesRoot
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

async function ensureDir(relPath) {
  try {
    await fileOperations.createDirectory(relPath)
  } catch {
    // ignore
  }
}

async function readNoteTree({ notesRoot }) {
  await ensureDir(notesRoot)
  const rootAbs = fileOperations._resolvePath(notesRoot)

  async function walk(absDir, relInRoot) {
    let entries = []
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch (e) {
      if (e && e.code === 'ENOENT') return []
      throw e
    }

    const dirs = []
    const notes = []

    for (const entry of entries) {
      const name = entry?.name ? String(entry.name) : ''
      if (!name || name.startsWith('.')) continue

      if (entry.isDirectory()) {
        if (name === 'assets' || name.endsWith('.assets')) continue
        dirs.push(name)
        continue
      }

      if (entry.isFile() && name.toLowerCase().endsWith('.md')) {
        notes.push(name)
      }
    }

    dirs.sort((a, b) => a.localeCompare(b))
    notes.sort((a, b) => a.localeCompare(b))

    const children = []
    for (const dirName of dirs) {
      const childRel = relInRoot ? `${relInRoot}/${dirName}` : dirName
      const childAbs = path.join(absDir, dirName)
      children.push({
        type: 'dir',
        name: dirName,
        path: childRel,
        children: await walk(childAbs, childRel)
      })
    }
    for (const fileName of notes) {
      const rel = relInRoot ? `${relInRoot}/${fileName}` : fileName
      children.push({
        type: 'note',
        name: fileName.slice(0, -3),
        filename: fileName,
        path: rel
      })
    }
    return children
  }

  return {
    root: notesRoot,
    tree: {
      type: 'dir',
      name: notesRoot,
      path: '',
      children: await walk(rootAbs, '')
    }
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
      const stat = await fs.stat(abs)
      if (!stat.isFile()) {
        result.images.push({ ref: refRaw, path: imageRel, ok: false, error: 'not a file' })
        continue
      }

      const size = Number(stat.size) || 0
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
    return { ok: true, path: noteRel.replace(new RegExp(`^${notesRoot}/?`, 'i'), ''), mode: exists ? 'overwrite' : 'create' }
  }

  const abs = fileOperations._resolvePath(noteRel)
  await fs.mkdir(path.dirname(abs), { recursive: true })

  const payload = text && !text.startsWith('\n') ? `\n${text}` : text
  await fs.appendFile(abs, payload, 'utf-8')
  return { ok: true, path: noteRel.replace(new RegExp(`^${notesRoot}/?`, 'i'), ''), mode: 'append' }
}

const TOOLS = [
  {
    name: 'notes_list_tree',
    description: '列出所有笔记的树形结构（仅 .md），返回 JSON。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'notes_read',
    description: '读取指定路径的笔记（相对 note 根目录），并尽量一并读取笔记引用的图片（支持本地相对路径 assets）。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 note 根目录的路径，例如 project/todo.md（可省略 .md）' },
        includeImages: { type: 'boolean', description: '是否读取图片（默认 true）' }
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
        dirPath: { type: 'string', description: '相对 note 根目录的目录路径，例如 project（可为空）' },
        noteName: { type: 'string', description: '笔记名，例如 todo 或 todo.md' },
        content: { type: 'string', description: '要写入的内容' }
      },
      required: ['content'],
      // 兼容：部分模型/服务商不接受顶层 anyOf/oneOf/allOf。
      // 约束由服务端兜底校验：需要传 path 或 noteName（二选一；noteName 可配 dirPath）。
      additionalProperties: false
    }
  },
  {
    name: 'notes_write',
    description: '写入笔记内容（默认追加），支持覆盖。支持传 path 或 dirPath+noteName。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 note 根目录的路径，例如 project/todo.md（可省略 .md）。传 path 时会忽略 dirPath/noteName。' },
        dirPath: { type: 'string', description: '相对 note 根目录的目录路径，例如 project（可为空）' },
        noteName: { type: 'string', description: '笔记名，例如 todo 或 todo.md' },
        content: { type: 'string', description: '要写入的内容' },
        mode: { type: 'string', enum: ['append', 'overwrite'], description: '写入模式：append（默认）或 overwrite（覆盖）' }
      },
      required: ['content'],
      // 兼容：部分模型/服务商不接受顶层 anyOf/oneOf/allOf。
      // 约束由服务端兜底校验：需要传 path 或 noteName（二选一；noteName 可配 dirPath）。
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
    const params = (args && typeof args === 'object') ? args : {}
    if (name === 'notes_list_tree') {
      return await readNoteTree({ notesRoot: this.notesRoot })
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
