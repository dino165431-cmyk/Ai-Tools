const path = require('path')
const fs = require('fs').promises

const fileOperations = require('../../utils/file-operations')
const contentIndex = require('../../utils/content-index')
const notebookRuntime = require('../../utils/notebook-runtime')

const DEFAULT_LIST_LIMIT = 200
const MAX_LIST_LIMIT = 1000
const DEFAULT_RECENT_LIMIT = 20
const MAX_RECENT_LIMIT = 200
const DEFAULT_TREE_MAX_DEPTH = 2
const MAX_TREE_MAX_DEPTH = 12
const NOTE_EXTENSIONS = Object.freeze(['.md', '.ipynb'])
const NOTEBOOK_RUNTIME_VALUES = new Set(['python', 'javascript', 'sql'])

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
    throw new Error('dirPath invalid: must stay within note root')
  }
  return normalized
}

function getSupportedNoteExtension(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return NOTE_EXTENSIONS.find((extension) => normalized.endsWith(extension)) || ''
}

function getNoteTypeByPath(value) {
  return String(value || '').trim().toLowerCase().endsWith('.ipynb') ? 'notebook' : 'markdown'
}

function stripSupportedNoteExtension(value) {
  const text = String(value || '')
  const extension = getSupportedNoteExtension(text)
  return extension ? text.slice(0, -extension.length) : text
}

function normalizeNoteName(noteName, type = 'markdown') {
  const raw = String(noteName || '').trim()
  if (!raw) throw new Error('noteName cannot be empty')
  if (raw.includes('\0')) throw new Error('noteName contains invalid characters')
  if (raw.includes('/') || raw.includes('\\')) throw new Error('noteName cannot contain path separators')
  const requestedType = String(type || '').trim().toLowerCase() === 'notebook' ? 'notebook' : 'markdown'
  const existingExtension = getSupportedNoteExtension(raw)
  const extension = existingExtension || (requestedType === 'notebook' ? '.ipynb' : '.md')
  const name = existingExtension ? raw : `${raw}${extension}`
  if (!stripSupportedNoteExtension(name) || stripSupportedNoteExtension(name) === '.') {
    throw new Error('noteName invalid')
  }
  return name
}

function normalizeNotePathInRoot(notePath, options = {}) {
  let s = toPosixPath(notePath).trim()
  if (!s) throw new Error('path cannot be empty')
  s = s.replace(/^\/+/, '')
  s = s.replace(/^note\//i, '')
  const allowDirectory = options.allowDirectory === true
  const existingExtension = getSupportedNoteExtension(s)
  if (!existingExtension && !allowDirectory) {
    const requestedType = String(options.type || '').trim().toLowerCase()
    s += requestedType === 'notebook' ? '.ipynb' : '.md'
  }
  const normalized = path.posix.normalize(s)
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('path invalid')
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('path invalid: must stay within note root')
  }
  if (!allowDirectory && !getSupportedNoteExtension(normalized)) {
    throw new Error('path must end with .md or .ipynb')
  }
  return normalized
}

function buildNoteRelPath({ notesRoot, dirPath, noteName, type }) {
  const dir = normalizeDirPath(dirPath)
  const name = normalizeNoteName(noteName, type)
  const relInRoot = dir ? `${dir}/${name}` : name
  return toPosixPath(path.posix.join(notesRoot, relInRoot))
}

function buildNoteRelPathFromArgs({ notesRoot, notePath, dirPath, noteName, type }) {
  const p = String(notePath || '').trim()
  if (p) {
    const relInRoot = normalizeNotePathInRoot(p, { type })
    return toPosixPath(path.posix.join(notesRoot, relInRoot))
  }
  return buildNoteRelPath({ notesRoot, dirPath, noteName, type })
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
  const noteType = getNoteTypeByPath(fileName)
  return {
    type: noteType,
    noteType,
    name: stripSupportedNoteExtension(fileName),
    filename: fileName,
    path: relPath,
    ...(statInfo ? { size: Number(statInfo.size) || 0, mtimeMs: Number(statInfo.mtimeMs) || 0 } : {})
  }
}

async function listDirectoryEntries({ notesRoot, dirPath = '', limit = DEFAULT_LIST_LIMIT }) {
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
    if (entry.isFile() && getSupportedNoteExtension(name)) {
      const noteType = getNoteTypeByPath(name)
      notes.push({
        type: noteType,
        noteType,
        name: stripSupportedNoteExtension(name),
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
    throw new Error('notes_list_recent only supports the default note root')
  }
  return contentIndex.listRecent('note', { dirPath, limit })
}

async function searchNotes({ notesRoot, dirPath = '', query = '', limit = DEFAULT_RECENT_LIMIT }) {
  if (String(notesRoot || '').trim() !== 'note') {
    throw new Error('notes_search only supports the default note root')
  }
  return contentIndex.searchIndex('note', { dirPath, query, limit })
}

async function readNoteTree({ notesRoot, dirPath = '', maxDepth = DEFAULT_TREE_MAX_DEPTH }) {
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

      if (entry.isFile() && getSupportedNoteExtension(name)) {
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
  if (getNoteTypeByPath(relInRoot) === 'notebook') {
    return readNotebook({ notesRoot, notebookPath: relInRoot })
  }
  const noteRel = toPosixPath(path.posix.join(notesRoot, relInRoot))
  const content = await fileOperations.readFile(noteRel, 'utf-8')
  if (contentIndex._internal?.isEncryptedNoteContent?.(content)) {
    throw new Error('该笔记已加密，无法通过内置 Skill 直接读取。请先在笔记页解锁后再试。')
  }

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
      error: 'Too many images; truncated to ' + maxImages
    })
  }

  return result
}

function createNotebookCell(cell = {}, index = 0) {
  const source = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : {}
  const cellType = ['markdown', 'raw', 'code'].includes(String(source.cell_type || source.type || '').trim())
    ? String(source.cell_type || source.type).trim()
    : 'code'
  const runtimeRaw = String(source.runtime || source?.metadata?.aiTools?.runtime || 'python').trim().toLowerCase()
  const runtime = NOTEBOOK_RUNTIME_VALUES.has(runtimeRaw) ? runtimeRaw : 'python'
  return {
    cell_type: cellType,
    id: String(source.id || '').trim() || `cell-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: cellType === 'code'
      ? {
          ...(source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata : {}),
          aiTools: {
            ...(source?.metadata?.aiTools && typeof source.metadata.aiTools === 'object' ? source.metadata.aiTools : {}),
            runtime
          }
        }
      : (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata : {}),
    source: Array.isArray(source.source) ? source.source.join('') : String(source.source || ''),
    ...(cellType === 'code'
      ? {
          execution_count: Number.isFinite(Number(source.execution_count)) ? Number(source.execution_count) : null,
          outputs: Array.isArray(source.outputs) ? source.outputs : []
        }
      : {})
  }
}

function normalizeNotebook(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    nbformat: Number.isFinite(Number(source.nbformat)) ? Number(source.nbformat) : 4,
    nbformat_minor: Number.isFinite(Number(source.nbformat_minor)) ? Number(source.nbformat_minor) : 5,
    metadata: source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? source.metadata
      : {
          kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
          language_info: { name: 'python' }
        },
    cells: (Array.isArray(source.cells) ? source.cells : []).map((cell, index) => createNotebookCell(cell, index))
  }
}

function serializeNotebook(notebook) {
  return `${JSON.stringify(normalizeNotebook(notebook), null, 2)}\n`
}

function normalizeNotebookPathInRoot(notebookPath) {
  const normalized = normalizeNotePathInRoot(notebookPath, { type: 'notebook' })
  if (!normalized.toLowerCase().endsWith('.ipynb')) {
    throw new Error('notebook path must end with .ipynb')
  }
  return normalized
}

async function readNotebookDocument({ notesRoot, notebookPath }) {
  const relInRoot = normalizeNotebookPathInRoot(notebookPath)
  const noteRel = toPosixPath(path.posix.join(notesRoot, relInRoot))
  const content = await fileOperations.readFile(noteRel, 'utf-8')
  let parsed = null
  try {
    parsed = JSON.parse(String(content || ''))
  } catch (error) {
    throw new Error(`超级笔记 JSON 无效：${relInRoot}（${error?.message || String(error)}）`)
  }
  return {
    relInRoot,
    noteRel,
    notebook: normalizeNotebook(parsed)
  }
}

async function readNotebook({ notesRoot, notebookPath }) {
  const document = await readNotebookDocument({ notesRoot, notebookPath })
  return {
    path: document.relInRoot,
    type: 'notebook',
    notebook: document.notebook,
    cellCount: document.notebook.cells.length,
    codeCellCount: document.notebook.cells.filter((cell) => cell.cell_type === 'code').length
  }
}

function resolveNotebookCellIndex(notebook, params = {}, options = {}) {
  const cells = Array.isArray(notebook?.cells) ? notebook.cells : []
  const cellId = String(params.cell_id ?? params.cellId ?? '').trim()
  if (cellId) {
    const index = cells.findIndex((cell) => String(cell?.id || '').trim() === cellId)
    if (index < 0) throw new Error(`未找到 Cell：${cellId}`)
    return index
  }

  const rawIndex = params.cell_index ?? params.cellIndex
  if (rawIndex !== undefined && rawIndex !== null && rawIndex !== '') {
    const index = Number(rawIndex)
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) {
      throw new Error(`cell_index 越界：${rawIndex}`)
    }
    return index
  }

  if (options.allowAppend === true) return cells.length
  throw new Error('必须提供 cell_id 或 cell_index')
}

async function persistNotebookDocument(document) {
  await fileOperations.writeFile(document.noteRel, serializeNotebook(document.notebook))
}

async function createNote({ notesRoot, notePath, dirPath, noteName, content, type, cells }) {
  await ensureDir(notesRoot)
  const requestedType = String(type || '').trim().toLowerCase() === 'notebook' || String(notePath || noteName || '').toLowerCase().endsWith('.ipynb')
    ? 'notebook'
    : 'markdown'
  const noteRel = buildNoteRelPathFromArgs({ notesRoot, notePath, dirPath, noteName, type: requestedType })
  const exists = await fileOperations.exists(noteRel)
  if (exists) throw new Error('Note already exists: ' + noteRel)
  const payload = requestedType === 'notebook'
    ? serializeNotebook({
        cells: Array.isArray(cells) ? cells : [],
        metadata: content && typeof content === 'object' ? content.metadata : undefined
      })
    : String(content ?? '')
  await fileOperations.writeFile(noteRel, payload)
  const createdPath = noteRel.startsWith(notesRoot + '/') ? noteRel.slice(notesRoot.length + 1) : noteRel
  return {
    ok: true,
    path: createdPath,
    type: requestedType
  }
}

async function writeNote({ notesRoot, notePath, dirPath, noteName, content, mode }) {
  await ensureDir(notesRoot)
  const noteRel = buildNoteRelPathFromArgs({ notesRoot, notePath, dirPath, noteName })
  if (getNoteTypeByPath(noteRel) === 'notebook') {
    throw new Error('notes_write 不支持直接改写超级笔记；请使用 notebook_update_cell')
  }
  const m = String(mode || 'append').trim().toLowerCase()
  const finalMode = (m === 'overwrite' || m === '瑕嗙洊') ? 'overwrite' : 'append'

  const exists = await fileOperations.exists(noteRel)
  const text = String(content ?? '')

  if (finalMode === 'overwrite' || !exists) {
    await fileOperations.writeFile(noteRel, text)
    const createdPath = noteRel.startsWith(notesRoot + '/') ? noteRel.slice(notesRoot.length + 1) : noteRel
    return {
      ok: true,
      path: createdPath,
      mode: exists ? 'overwrite' : 'create'
    }
  }

  const abs = fileOperations._resolvePath(noteRel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const payload = text && !text.startsWith('\n') ? '\n' + text : text
  await fs.appendFile(abs, payload, 'utf-8')
  const appendedPath = noteRel.startsWith(notesRoot + '/') ? noteRel.slice(notesRoot.length + 1) : noteRel
  return {
    ok: true,
    path: appendedPath,
    mode: 'append'
  }
}

function normalizeNoteItemPathInRoot(itemPath) {
  let value = toPosixPath(itemPath).trim().replace(/^\/+/, '').replace(/^note\//i, '')
  if (!value) throw new Error('path cannot be empty')
  const normalized = path.posix.normalize(value)
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('path invalid: must stay within note root')
  }
  return normalized
}

function getAssetDirectoryRelPath(notesRoot, relInRoot) {
  const directory = path.posix.dirname(relInRoot)
  const basename = stripSupportedNoteExtension(path.posix.basename(relInRoot))
  return toPosixPath(path.posix.join(notesRoot, directory === '.' ? '' : directory, `${basename}.assets`))
}

async function moveNoteItem({ notesRoot, fromPath, toPath, overwrite = false }) {
  const fromInRoot = normalizeNoteItemPathInRoot(fromPath)
  const toInRoot = normalizeNoteItemPathInRoot(toPath)
  const fromRel = toPosixPath(path.posix.join(notesRoot, fromInRoot))
  const toRel = toPosixPath(path.posix.join(notesRoot, toInRoot))
  if (!(await fileOperations.exists(fromRel))) throw new Error(`源路径不存在：${fromInRoot}`)
  if (!overwrite && await fileOperations.exists(toRel)) throw new Error(`目标路径已存在：${toInRoot}`)

  const statInfo = await fileOperations.stat(fromRel)
  await fileOperations.moveItem(fromRel, toRel, { overwrite: overwrite === true })

  let assetsMoved = false
  if (statInfo?.isFile?.() && getSupportedNoteExtension(fromInRoot) && getSupportedNoteExtension(toInRoot)) {
    const oldAssets = getAssetDirectoryRelPath(notesRoot, fromInRoot)
    const newAssets = getAssetDirectoryRelPath(notesRoot, toInRoot)
    if (await fileOperations.exists(oldAssets)) {
      await fileOperations.moveItem(oldAssets, newAssets, { overwrite: overwrite === true })
      assetsMoved = true
    }
  }

  return { ok: true, fromPath: fromInRoot, path: toInRoot, assetsMoved }
}

async function deleteNoteItem({ notesRoot, itemPath, deleteAssets = true }) {
  const relInRoot = normalizeNoteItemPathInRoot(itemPath)
  const itemRel = toPosixPath(path.posix.join(notesRoot, relInRoot))
  if (!(await fileOperations.exists(itemRel))) throw new Error(`路径不存在：${relInRoot}`)
  const statInfo = await fileOperations.stat(itemRel)
  await fileOperations.deleteItem(itemRel)

  let assetsDeleted = false
  if (deleteAssets !== false && statInfo?.isFile?.() && getSupportedNoteExtension(relInRoot)) {
    const assetsRel = getAssetDirectoryRelPath(notesRoot, relInRoot)
    if (await fileOperations.exists(assetsRel)) {
      await fileOperations.deleteItem(assetsRel)
      assetsDeleted = true
    }
  }

  return { ok: true, path: relInRoot, type: statInfo?.isDirectory?.() ? 'directory' : getNoteTypeByPath(relInRoot), assetsDeleted }
}

async function updateNotebookCell({ notesRoot, notebookPath, params }) {
  const document = await readNotebookDocument({ notesRoot, notebookPath })
  const cells = document.notebook.cells
  const operation = String(params.operation || '').trim().toLowerCase()
  const shouldAppend = operation === 'append' || (!params.cell_id && params.cell_index === undefined)
  const index = shouldAppend
    ? cells.length
    : resolveNotebookCellIndex(document.notebook, params)
  const existing = index < cells.length ? cells[index] : null
  const nextCell = createNotebookCell({
    ...(existing || {}),
    ...(params.cell && typeof params.cell === 'object' ? params.cell : {}),
    ...(params.cell_type ? { cell_type: params.cell_type } : {}),
    ...(params.runtime ? { runtime: params.runtime } : {}),
    ...(Object.prototype.hasOwnProperty.call(params, 'source') ? { source: params.source } : {})
  }, index)

  if (existing) cells.splice(index, 1, nextCell)
  else cells.push(nextCell)
  await persistNotebookDocument(document)
  return {
    ok: true,
    path: document.relInRoot,
    operation: existing ? 'replace' : 'append',
    cell_index: index,
    cell: nextCell
  }
}

async function deleteNotebookCell({ notesRoot, notebookPath, params }) {
  const document = await readNotebookDocument({ notesRoot, notebookPath })
  const index = resolveNotebookCellIndex(document.notebook, params)
  const [removed] = document.notebook.cells.splice(index, 1)
  await persistNotebookDocument(document)
  return { ok: true, path: document.relInRoot, cell_index: index, removed }
}

function getNotebookCellRuntime(cell) {
  const runtime = String(cell?.metadata?.aiTools?.runtime || 'python').trim().toLowerCase()
  return NOTEBOOK_RUNTIME_VALUES.has(runtime) ? runtime : 'python'
}

function hasNotebookExecutionError(outputs = []) {
  return (Array.isArray(outputs) ? outputs : []).some((output) => {
    return String(output?.output_type || output?.outputType || '').trim() === 'error'
  })
}

async function executeNotebookCodeCell(document, index, options = {}, sharedSession = null) {
  const cell = document.notebook.cells[index]
  if (!cell || cell.cell_type !== 'code') throw new Error(`Cell ${index} 不是代码 Cell`)
  const runtime = getNotebookCellRuntime(cell)
  const timeoutMs = Math.max(1000, Math.min(10 * 60 * 1000, Math.floor(Number(options.timeout_ms ?? options.timeoutMs) || 120000)))
  let sessionId = sharedSession?.sessionId || ''
  let ownsSession = false
  let result = null

  try {
    if (runtime === 'javascript') {
      result = await notebookRuntime.executeJavaScriptCell({
        code: String(cell.source || ''),
        timeoutMs,
        notebookPath: document.noteRel
      })
    } else {
      if (!sessionId) {
        const created = await notebookRuntime.createSession({ notebookPath: document.noteRel })
        sessionId = String(created?.sessionId || '').trim()
        ownsSession = true
      }
      const code = runtime === 'sql' && !/^\s*%%sql\b/i.test(String(cell.source || ''))
        ? `%%sql\n${String(cell.source || '')}`
        : String(cell.source || '')
      result = await notebookRuntime.executeCell(sessionId, { code, timeoutMs })
    }
  } finally {
    if (ownsSession && sessionId) {
      await notebookRuntime.shutdownSession(sessionId).catch(() => {})
    }
  }

  const outputs = Array.isArray(result?.outputs) ? result.outputs : []
  const executionCount = Number.isFinite(Number(result?.execution_count)) ? Number(result.execution_count) : null
  if (options.save !== false) {
    cell.outputs = outputs
    cell.execution_count = executionCount
  }
  return {
    ok: result?.ok !== false && !hasNotebookExecutionError(outputs),
    path: document.relInRoot,
    cell_index: index,
    cell_id: cell.id,
    runtime,
    execution_count: executionCount,
    outputs
  }
}

async function executeOneNotebookCell({ notesRoot, notebookPath, params }) {
  const document = await readNotebookDocument({ notesRoot, notebookPath })
  const index = resolveNotebookCellIndex(document.notebook, params)
  const result = await executeNotebookCodeCell(document, index, params)
  if (params.save !== false) await persistNotebookDocument(document)
  return { ...result, saved: params.save !== false }
}

async function executeAllNotebookCells({ notesRoot, notebookPath, params }) {
  const document = await readNotebookDocument({ notesRoot, notebookPath })
  const codeIndexes = document.notebook.cells
    .map((cell, index) => cell?.cell_type === 'code' ? index : -1)
    .filter((index) => index >= 0)
  const results = []
  let pythonSession = null

  try {
    const needsSharedSession = codeIndexes.some((index) => getNotebookCellRuntime(document.notebook.cells[index]) !== 'javascript')
    if (needsSharedSession) {
      pythonSession = await notebookRuntime.createSession({ notebookPath: document.noteRel })
    }
    for (const index of codeIndexes) {
      const result = await executeNotebookCodeCell(document, index, params, pythonSession)
      results.push(result)
      if (!result.ok && params.continue_on_error !== true) break
    }
  } finally {
    const sessionId = String(pythonSession?.sessionId || '').trim()
    if (sessionId) await notebookRuntime.shutdownSession(sessionId).catch(() => {})
  }

  if (params.save !== false) await persistNotebookDocument(document)
  return {
    ok: results.every((result) => result.ok) && results.length === codeIndexes.length,
    path: document.relInRoot,
    total: codeIndexes.length,
    executed: results.length,
    stoppedEarly: results.length < codeIndexes.length,
    saved: params.save !== false,
    results
  }
}

const ACTIONS = [
  {
    name: 'notes_list_directory',
    description: 'List direct child directories and notes under a directory without recursion.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Directory path relative to the note root.' },
        limit: { type: 'integer', description: 'Maximum items to return, default ' + DEFAULT_LIST_LIMIT }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notes_list_recent',
    description: 'List recently modified notes from the content index. Encrypted notes are excluded.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Directory path relative to the note root.' },
        limit: { type: 'integer', description: 'Maximum items to return, default ' + DEFAULT_RECENT_LIMIT }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notes_search',
    description: 'Search notes by name, title, preview, or path. Keyword mode is default; hybrid mode uses embeddings when configured. The result includes searchMode and semanticUsed so callers can tell whether the run was keyword-only or hybrid. Encrypted notes are excluded from the index.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or path fragments.' },
        dirPath: { type: 'string', description: 'Directory path relative to the note root.' },
        limit: { type: 'integer', description: 'Maximum items to return, default ' + DEFAULT_RECENT_LIMIT }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'notes_list_tree',
    description: 'List the note tree structure with shallow default depth.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Subdirectory relative to the note root.' },
        maxDepth: { type: 'integer', description: 'Recursive depth, default ' + DEFAULT_TREE_MAX_DEPTH + ', max ' + MAX_TREE_MAX_DEPTH }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notes_read',
    description: 'Read a note by path and, when possible, include referenced local images. Encrypted notes are rejected.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the note root, e.g. project/todo.md.' },
        includeImages: { type: 'boolean', description: 'Whether to read images, default true.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'notes_create',
    description: 'Create a Markdown note or .ipynb super note. Supports path or dirPath + noteName.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the note root, e.g. project/todo.md or lab/demo.ipynb.' },
        dirPath: { type: 'string', description: 'Directory path relative to the note root.' },
        noteName: { type: 'string', description: 'Note name, with or without a supported extension.' },
        type: { type: 'string', enum: ['markdown', 'notebook'], description: 'Note type when the path has no extension.' },
        content: { type: 'string', description: 'Markdown content. Optional for a notebook.' },
        cells: { type: 'array', items: { type: 'object' }, description: 'Initial notebook cells.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notes_write',
    description: 'Write note content. Append by default; overwrite is also supported.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the note root, e.g. project/todo.md.' },
        dirPath: { type: 'string', description: 'Directory path relative to the note root.' },
        noteName: { type: 'string', description: 'Note name, e.g. todo or todo.md.' },
        content: { type: 'string', description: 'Content to write.' },
        mode: { type: 'string', enum: ['append', 'overwrite'], description: 'Write mode: append (default) or overwrite.' }
      },
      required: ['content'],
      additionalProperties: false
    }
  },
  {
    name: 'notes_move',
    description: 'Move or rename a note, super note, or directory within the note root. Matching asset directories move with note files.',
    inputSchema: {
      type: 'object',
      properties: {
        fromPath: { type: 'string', description: 'Existing path relative to the note root.' },
        toPath: { type: 'string', description: 'Destination path relative to the note root.' },
        overwrite: { type: 'boolean', description: 'Replace an existing destination. Default false.' }
      },
      required: ['fromPath', 'toPath'],
      additionalProperties: false
    }
  },
  {
    name: 'notes_delete',
    description: 'Delete a note, super note, or directory. Matching note asset directories are deleted by default.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Exact path relative to the note root.' },
        deleteAssets: { type: 'boolean', description: 'Delete the matching asset directory. Default true.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'notebook_read',
    description: 'Read and parse an .ipynb super note, including cells, runtimes, and stored outputs.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the note root, ending in .ipynb.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'notebook_create',
    description: 'Create an .ipynb super note with optional initial cells.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the note root.' },
        dirPath: { type: 'string', description: 'Directory relative to the note root.' },
        noteName: { type: 'string', description: 'Notebook name, with or without .ipynb.' },
        cells: { type: 'array', items: { type: 'object' }, description: 'Initial cells with cell_type, source, and optional runtime.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'notebook_update_cell',
    description: 'Append or replace one cell in an .ipynb super note while preserving other cells and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook path relative to the note root.' },
        cell_id: { type: 'string', description: 'Existing cell id to replace.' },
        cell_index: { type: 'integer', description: 'Zero-based existing cell index to replace.' },
        operation: { type: 'string', enum: ['replace', 'append'], description: 'Append when no target is supplied.' },
        cell_type: { type: 'string', enum: ['code', 'markdown', 'raw'] },
        runtime: { type: 'string', enum: ['python', 'javascript', 'sql'] },
        source: { type: 'string', description: 'New cell source.' },
        cell: { type: 'object', description: 'Optional complete cell object.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'notebook_delete_cell',
    description: 'Delete one verified cell from an .ipynb super note.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook path relative to the note root.' },
        cell_id: { type: 'string', description: 'Cell id.' },
        cell_index: { type: 'integer', description: 'Zero-based cell index.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'notebook_execute_cell',
    description: 'Execute one code cell from an .ipynb super note using its python, javascript, or sql runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook path relative to the note root.' },
        cell_id: { type: 'string', description: 'Cell id.' },
        cell_index: { type: 'integer', description: 'Zero-based cell index.' },
        save: { type: 'boolean', description: 'Persist outputs to the notebook. Default true.' },
        timeout_ms: { type: 'integer', description: 'Execution timeout in milliseconds.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'notebook_execute_all',
    description: 'Execute all code cells in an .ipynb super note from top to bottom.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Notebook path relative to the note root.' },
        save: { type: 'boolean', description: 'Persist outputs to the notebook. Default true.' },
        continue_on_error: { type: 'boolean', description: 'Continue after a failed cell. Default false.' },
        timeout_ms: { type: 'integer', description: 'Per-cell execution timeout in milliseconds.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  }
]

class BuiltinNotesSkillRuntime {
  constructor(skillConfig) {
    this.config = skillConfig || {}
    this.notesRoot = String(this.config.notesRoot || 'note').trim() || 'note'
  }

  async listActions() {
    return ACTIONS
  }

  async runAction(toolName, args) {
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
      const hasPath = typeof params.path === 'string' && params.path.trim()
      const hasName = typeof params.noteName === 'string' && params.noteName.trim()
      if (!hasPath && !hasName) throw new Error('notes_create 需要 path 或 noteName')
      if (String(params.type || '').trim().toLowerCase() !== 'notebook' && !String(params.path || params.noteName || '').toLowerCase().endsWith('.ipynb') && typeof params.content !== 'string') {
        throw new Error('创建 Markdown 笔记时 content 必填')
      }
      return await createNote({
        notesRoot: this.notesRoot,
        notePath: params.path,
        dirPath: params.dirPath,
        noteName: params.noteName,
        content: params.content,
        type: params.type,
        cells: params.cells
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

    if (name === 'notes_move') {
      return await moveNoteItem({
        notesRoot: this.notesRoot,
        fromPath: params.fromPath,
        toPath: params.toPath,
        overwrite: params.overwrite === true
      })
    }

    if (name === 'notes_delete') {
      return await deleteNoteItem({
        notesRoot: this.notesRoot,
        itemPath: params.path,
        deleteAssets: params.deleteAssets !== false
      })
    }

    if (name === 'notebook_read') {
      return await readNotebook({
        notesRoot: this.notesRoot,
        notebookPath: params.path
      })
    }

    if (name === 'notebook_create') {
      const hasPath = typeof params.path === 'string' && params.path.trim()
      const hasName = typeof params.noteName === 'string' && params.noteName.trim()
      if (!hasPath && !hasName) throw new Error('notebook_create 需要 path 或 noteName')
      return await createNote({
        notesRoot: this.notesRoot,
        notePath: params.path,
        dirPath: params.dirPath,
        noteName: params.noteName,
        type: 'notebook',
        cells: params.cells
      })
    }

    if (name === 'notebook_update_cell') {
      return await updateNotebookCell({
        notesRoot: this.notesRoot,
        notebookPath: params.path,
        params
      })
    }

    if (name === 'notebook_delete_cell') {
      return await deleteNotebookCell({
        notesRoot: this.notesRoot,
        notebookPath: params.path,
        params
      })
    }

    if (name === 'notebook_execute_cell') {
      return await executeOneNotebookCell({
        notesRoot: this.notesRoot,
        notebookPath: params.path,
        params
      })
    }

    if (name === 'notebook_execute_all') {
      return await executeAllNotebookCells({
        notesRoot: this.notesRoot,
        notebookPath: params.path,
        params
      })
    }

    throw new Error('Unknown action: ' + name)
  }

  async listPrompts() {
    return []
  }

  async listResources() {
    return []
  }

  close() {}
}

module.exports = function createBuiltinNotesSkillRuntime(skillConfig) {
  return new BuiltinNotesSkillRuntime(skillConfig)
}

module.exports.ACTIONS = ACTIONS

