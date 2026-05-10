const path = require('path')
const fs = require('fs').promises

const globalConfig = require('./global-config')

const INDEX_VERSION = 2
const SYSTEM_DIR_NAME = '.ai-tools-settings'
const INDEX_DIR_NAME = 'indexes'
const NOTE_CONTENT_SAMPLE_BYTES = 32 * 1024
const SESSION_CONTENT_SAMPLE_BYTES = 64 * 1024
const MAX_INDEX_PREVIEW_LENGTH = 320
const MAX_INDEX_SEARCH_TEXT_LENGTH = 4096

const INDEX_KINDS = Object.freeze({
  note: Object.freeze({
    kind: 'note',
    root: 'note',
    entryType: 'note',
    extension: '.md',
    defaultSearchLimit: 20,
    defaultRecentLimit: 20
  }),
  session: Object.freeze({
    kind: 'session',
    root: 'session',
    entryType: 'session',
    extension: '.json',
    defaultSearchLimit: 20,
    defaultRecentLimit: 20
  })
})

const INDEX_FILE_NAMES = Object.freeze({
  note: `notes-index-v${INDEX_VERSION}.json`,
  session: `sessions-index-v${INDEX_VERSION}.json`
})

const rebuildPromises = new Map()

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/')
}

function normalizeRelativePath(relativePath) {
  return toPosixPath(relativePath).trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function normalizeDirPath(dirPathRaw) {
  const raw = normalizeRelativePath(dirPathRaw)
  if (!raw) return ''
  const normalized = path.posix.normalize(raw)
  if (!normalized || normalized === '.' || normalized === '..') return ''
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('dirPath 不合法（不允许越界或绝对路径）')
  }
  return normalized
}

function normalizeLimit(limitRaw, fallback, max = 200) {
  const value = Number(limitRaw)
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (normalized <= 0) return fallback
  return Math.min(normalized, max)
}

function normalizePreviewText(value, maxLength = MAX_INDEX_PREVIEW_LENGTH) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function normalizeSearchText(value, maxLength = MAX_INDEX_SEARCH_TEXT_LENGTH) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

async function readTextSnippet(absPath, maxBytes) {
  const size = Math.max(1024, Number(maxBytes) || 0)
  let handle
  try {
    handle = await fs.open(absPath, 'r')
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    try {
      await handle?.close()
    } catch {
      // ignore close failures
    }
  }
}

function extractQuotedText(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

function extractFrontmatterBlock(text) {
  const source = String(text || '').replace(/^\uFEFF/, '')
  if (!source.startsWith('---\n') && source !== '---') return null

  const lines = source.split(/\r?\n/)
  if (lines[0] !== '---') return null

  let endLine = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      endLine = i
      break
    }
  }
  if (endLine === -1) return null

  return {
    lines: lines.slice(1, endLine),
    body: lines.slice(endLine + 1).join('\n')
  }
}

function extractYamlTitle(frontmatterLines = []) {
  for (const line of frontmatterLines) {
    const match = String(line || '').match(/^\s*title\s*:\s*(.+)$/i)
    if (match) {
      return extractQuotedText(match[1])
    }
  }
  return ''
}

function stripMarkdownTitlePrefix(line) {
  return String(line || '')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/^[*-]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectPreviewLinesFromText(text, maxLines = 3) {
  const lines = String(text || '').split(/\r?\n/)
  const preview = []
  for (const line of lines) {
    const value = stripMarkdownTitlePrefix(line)
    if (!value) continue
    if (/^---+$/.test(value)) continue
    if (/^```/.test(value)) continue
    preview.push(value)
    if (preview.length >= maxLines) break
  }
  return preview.join(' ')
}

function extractNoteMetadata(text, entry) {
  const source = normalizeSearchText(text, MAX_INDEX_SEARCH_TEXT_LENGTH)
  const frontmatter = extractFrontmatterBlock(source)
  const bodyText = frontmatter ? normalizeSearchText(frontmatter.body, MAX_INDEX_SEARCH_TEXT_LENGTH) : source

  const frontmatterTitle = frontmatter ? extractYamlTitle(frontmatter.lines) : ''
  const headingMatch = source.match(/^\s{0,3}#{1,6}\s+(.+)$/m)
  const headingTitle = headingMatch ? stripMarkdownTitlePrefix(headingMatch[1]) : ''
  const title = normalizePreviewText(frontmatterTitle || headingTitle || entry?.name || '')
  const preview = normalizePreviewText(
    collectPreviewLinesFromText(frontmatter ? frontmatter.body : source)
  )
  const searchText = normalizeSearchText([
    title,
    preview,
    bodyText,
    entry?.name || '',
    entry?.path || ''
  ].join('\n'))

  return { title, preview, searchText }
}

function extractJsonStringField(text, key) {
  const source = String(text || '')
  const keyPattern = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`"${keyPattern}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i')
  const match = source.match(pattern)
  if (!match) return ''
  try {
    return JSON.parse(`"${match[1]}"`)
  } catch {
    return match[1]
  }
}

function extractSessionMetadata(text, entry) {
  const source = normalizeSearchText(text, MAX_INDEX_SEARCH_TEXT_LENGTH)
  const title = normalizePreviewText(
    extractJsonStringField(text, 'title') || entry?.name || ''
  )
  const previewSource = title ? source.replace(title, '').trim() : source
  const preview = normalizePreviewText(previewSource)
  const searchText = normalizeSearchText([
    title,
    preview,
    source,
    entry?.name || '',
    entry?.path || ''
  ].join('\n'))

  return { title, preview, searchText }
}

async function buildEntryMetadata(kind, absPath, entry) {
  const sampleBytes = kind === 'session' ? SESSION_CONTENT_SAMPLE_BYTES : NOTE_CONTENT_SAMPLE_BYTES
  let text = ''
  try {
    text = await readTextSnippet(absPath, sampleBytes)
  } catch (err) {
    if (err?.code === 'ENOENT') return { title: '', preview: '', searchText: '' }
    throw err
  }

  if (kind === 'session') {
    return extractSessionMetadata(text, entry)
  }
  return extractNoteMetadata(text, entry)
}

function compareByPath(a, b) {
  return String(a?.path || '').localeCompare(String(b?.path || ''))
}

function compareByRecent(a, b) {
  const diff = Number(b?.mtimeMs || 0) - Number(a?.mtimeMs || 0)
  if (diff !== 0) return diff
  return compareByPath(a, b)
}

function getKindConfig(kind) {
  const config = INDEX_KINDS[kind]
  if (!config) throw new Error(`Unsupported index kind: ${kind}`)
  return config
}

function getKindForRoot(rootName) {
  const normalized = normalizeRelativePath(rootName).split('/').filter(Boolean)[0]
  if (!normalized) return null
  return Object.values(INDEX_KINDS).find((config) => config.root === normalized) || null
}

function getKindForPath(relativePath) {
  return getKindForRoot(relativePath)?.kind || null
}

function getDataStorageRootAbs() {
  const rootRaw = globalConfig.getDataStorageRoot()
  const root = typeof rootRaw === 'string' ? rootRaw.trim() : ''
  if (!root) throw new Error('dataStorageRoot 未配置')
  if (root.includes('\0')) throw new Error('dataStorageRoot 包含非法字符')
  if (!path.isAbsolute(root)) throw new Error('dataStorageRoot 必须为绝对路径')
  return path.resolve(root)
}

function getSystemDirRelPath() {
  return SYSTEM_DIR_NAME
}

function getIndexDirRelPath() {
  return `${SYSTEM_DIR_NAME}/${INDEX_DIR_NAME}`
}

function getIndexRelPath(kind) {
  const config = getKindConfig(kind)
  return `${getIndexDirRelPath()}/${INDEX_FILE_NAMES[config.kind]}`
}

function getIndexAbsPath(kind) {
  return path.join(getDataStorageRootAbs(), ...getIndexRelPath(kind).split('/'))
}

function shouldIgnoreSegment(kindConfig, segment, isLastDirectory = false) {
  const value = String(segment || '').trim()
  if (!value) return true
  if (value.startsWith('.')) return true
  if (kindConfig.kind === 'note') {
    return isLastDirectory && (value === 'assets' || value.endsWith('.assets'))
  }
  if (kindConfig.kind === 'session') {
    return isLastDirectory && value.endsWith('.json.assets')
  }
  return false
}

function shouldIndexFile(kind, relativePath) {
  const kindConfig = getKindConfig(kind)
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) return false
  if (!normalized.startsWith(`${kindConfig.root}/`) && normalized !== kindConfig.root) return false

  const relInRoot = normalized === kindConfig.root
    ? ''
    : normalized.slice(kindConfig.root.length + 1)
  if (!relInRoot) return false

  const segments = relInRoot.split('/').filter(Boolean)
  if (!segments.length) return false
  const fileName = segments.at(-1)
  if (!String(fileName || '').toLowerCase().endsWith(kindConfig.extension)) return false

  for (let i = 0; i < segments.length - 1; i += 1) {
    if (shouldIgnoreSegment(kindConfig, segments[i], true)) return false
  }
  return !String(fileName || '').startsWith('.')
}

function isIndexedDirectoryPath(kind, relativePath) {
  const kindConfig = getKindConfig(kind)
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) return false
  if (normalized === kindConfig.root) return true
  if (!normalized.startsWith(`${kindConfig.root}/`)) return false

  const relInRoot = normalized.slice(kindConfig.root.length + 1)
  const segments = relInRoot.split('/').filter(Boolean)
  if (!segments.length) return false
  return segments.every((segment) => !shouldIgnoreSegment(kindConfig, segment, true))
}

function isRelevantWatchedPath(kind, relativePath) {
  const kindConfig = getKindConfig(kind)
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) return false
  if (normalized === kindConfig.root) return true
  if (!normalized.startsWith(`${kindConfig.root}/`)) return false

  const relInRoot = normalized.slice(kindConfig.root.length + 1)
  const segments = relInRoot.split('/').filter(Boolean)
  if (!segments.length) return false

  for (const segment of segments) {
    if (String(segment || '').startsWith('.')) return false
  }

  for (let i = 0; i < segments.length; i += 1) {
    if (shouldIgnoreSegment(kindConfig, segments[i], true)) return false
  }

  return true
}

function makeEntry(kind, relativePath, statInfo, metadata = {}) {
  const kindConfig = getKindConfig(kind)
  const normalized = normalizeRelativePath(relativePath)
  const relInRoot = normalized.slice(kindConfig.root.length + 1)
  const dirPath = path.posix.dirname(relInRoot)
  const filename = path.posix.basename(relInRoot)
  return {
    type: kindConfig.entryType,
    path: relInRoot,
    name: filename.slice(0, -kindConfig.extension.length),
    filename,
    dirPath: dirPath === '.' ? '' : dirPath,
    size: Number(statInfo?.size) || 0,
    mtimeMs: Number(statInfo?.mtimeMs) || 0,
    title: normalizePreviewText(metadata?.title || ''),
    preview: normalizePreviewText(metadata?.preview || ''),
    searchText: normalizeSearchText(metadata?.searchText || '')
  }
}

function createEmptyIndex(kind, overrides = {}) {
  const kindConfig = getKindConfig(kind)
  return {
    version: INDEX_VERSION,
    kind: kindConfig.kind,
    root: kindConfig.root,
    systemDir: getSystemDirRelPath(),
    builtAt: null,
    updatedAt: null,
    dirty: true,
    reason: 'not_built',
    entries: [],
    ...overrides
  }
}

async function readIndex(kind) {
  const absPath = getIndexAbsPath(kind)
  try {
    const raw = await fs.readFile(absPath, 'utf-8')
    const parsed = JSON.parse(String(raw || ''))
    if (!parsed || parsed.version !== INDEX_VERSION || parsed.kind !== kind) return null
    return {
      ...createEmptyIndex(kind),
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    }
  } catch (err) {
    if (err?.code === 'ENOENT') return null
    throw err
  }
}

async function writeIndex(kind, indexData) {
  const absPath = getIndexAbsPath(kind)
  const dirAbs = path.dirname(absPath)
  await fs.mkdir(dirAbs, { recursive: true })
  const payload = JSON.stringify({
    ...createEmptyIndex(kind),
    ...indexData,
    entries: Array.isArray(indexData?.entries) ? indexData.entries : []
  }, null, 2)
  const tempPath = `${absPath}.tmp`
  await fs.writeFile(tempPath, payload, 'utf-8')
  await fs.rename(tempPath, absPath)
  return absPath
}

async function scanEntries(kind) {
  const kindConfig = getKindConfig(kind)
  const rootAbs = path.join(getDataStorageRootAbs(), ...kindConfig.root.split('/'))
  await fs.mkdir(rootAbs, { recursive: true })
  const entries = []

  async function walk(absDir, relDirInRoot) {
    let dirEntries = []
    try {
      dirEntries = await fs.readdir(absDir, { withFileTypes: true })
    } catch (err) {
      if (err?.code === 'ENOENT') return
      throw err
    }

    for (const entry of dirEntries) {
      const name = entry?.name ? String(entry.name) : ''
      if (!name || name.startsWith('.')) continue
      const nextRelInRoot = relDirInRoot ? `${relDirInRoot}/${name}` : name
      const nextRelPath = `${kindConfig.root}/${nextRelInRoot}`
      const nextAbsPath = path.join(absDir, name)

      if (entry.isDirectory()) {
        if (!isIndexedDirectoryPath(kindConfig.kind, nextRelPath)) continue
        await walk(nextAbsPath, nextRelInRoot)
        continue
      }

      if (!entry.isFile() || !shouldIndexFile(kindConfig.kind, nextRelPath)) continue

      try {
        const statInfo = await fs.stat(nextAbsPath)
        const metadata = await buildEntryMetadata(kindConfig.kind, nextAbsPath, {
          path: nextRelPath.slice(kindConfig.root.length + 1),
          name: path.posix.basename(nextRelPath).slice(0, -kindConfig.extension.length)
        })
        entries.push(makeEntry(kindConfig.kind, nextRelPath, statInfo, metadata))
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
    }
  }

  await walk(rootAbs, '')
  entries.sort(compareByPath)
  return entries
}

async function rebuildIndex(kind, options = {}) {
  const cacheKey = String(kind)
  if (rebuildPromises.has(cacheKey)) return rebuildPromises.get(cacheKey)

  const promise = (async () => {
    const entries = await scanEntries(kind)
    const now = new Date().toISOString()
    const nextIndex = createEmptyIndex(kind, {
      builtAt: now,
      updatedAt: now,
      dirty: false,
      reason: options.reason || 'rebuilt',
      entries
    })
    await writeIndex(kind, nextIndex)
    return nextIndex
  })()

  rebuildPromises.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    rebuildPromises.delete(cacheKey)
  }
}

async function ensureIndex(kind) {
  const index = await readIndex(kind)
  if (!index) return rebuildIndex(kind, { reason: 'missing' })
  if (index.dirty) return rebuildIndex(kind, { reason: index.reason || 'dirty' })
  return index
}

function filterEntriesByDir(entries, dirPath) {
  const dir = normalizeDirPath(dirPath)
  if (!dir) return [...entries]
  return entries.filter((entry) => {
    const base = String(entry?.dirPath || '')
    const fullPath = String(entry?.path || '')
    return base === dir || fullPath.startsWith(`${dir}/`)
  })
}

function buildSearchTokens(queryRaw) {
  return String(queryRaw || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function computeSearchScore(entry, queryLower, tokens) {
  const name = String(entry?.name || '').toLowerCase()
  const pathValue = String(entry?.path || '').toLowerCase()
  const title = String(entry?.title || '').toLowerCase()
  const preview = String(entry?.preview || '').toLowerCase()
  const searchText = String(entry?.searchText || '').toLowerCase()
  let score = 0

  if (pathValue === queryLower) score += 180
  if (name === queryLower) score += 160
  if (title === queryLower) score += 150
  if (searchText === queryLower) score += 120
  if (name.startsWith(queryLower)) score += 80
  if (title.startsWith(queryLower)) score += 90
  if (pathValue.startsWith(queryLower)) score += 60
  if (searchText.startsWith(queryLower)) score += 70
  if (name.includes(queryLower)) score += 40
  if (title.includes(queryLower)) score += 50
  if (preview.includes(queryLower)) score += 35
  if (pathValue.includes(queryLower)) score += 30
  if (searchText.includes(queryLower)) score += 45

  for (const token of tokens) {
    if (name.includes(token)) score += 12
    if (title.includes(token)) score += 18
    if (preview.includes(token)) score += 10
    if (pathValue.includes(token)) score += 8
    if (searchText.includes(token)) score += 14
  }

  return score
}

async function searchIndex(kind, options = {}) {
  const kindConfig = getKindConfig(kind)
  const query = String(options?.query || '').trim()
  if (!query) {
    return {
      root: kindConfig.root,
      dirPath: normalizeDirPath(options?.dirPath),
      query: '',
      returned: 0,
      total: 0,
      items: []
    }
  }

  const limit = normalizeLimit(options?.limit, kindConfig.defaultSearchLimit, 200)
  const queryLower = query.toLowerCase()
  const tokens = buildSearchTokens(query)
  const index = await ensureIndex(kindConfig.kind)
  const filtered = filterEntriesByDir(index.entries, options?.dirPath)
    .map((entry) => ({ ...entry, score: computeSearchScore(entry, queryLower, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0)
      if (scoreDiff !== 0) return scoreDiff
      const recentDiff = Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0)
      if (recentDiff !== 0) return recentDiff
      return compareByPath(a, b)
    })

  return {
    root: kindConfig.root,
    dirPath: normalizeDirPath(options?.dirPath),
    query,
    returned: Math.min(filtered.length, limit),
    total: filtered.length,
    hasMore: filtered.length > limit,
    items: filtered.slice(0, limit)
  }
}

async function listRecent(kind, options = {}) {
  const kindConfig = getKindConfig(kind)
  const limit = normalizeLimit(options?.limit, kindConfig.defaultRecentLimit, 200)
  const index = await ensureIndex(kindConfig.kind)
  const filtered = filterEntriesByDir(index.entries, options?.dirPath).sort(compareByRecent)
  return {
    root: kindConfig.root,
    dirPath: normalizeDirPath(options?.dirPath),
    returned: Math.min(filtered.length, limit),
    total: filtered.length,
    hasMore: filtered.length > limit,
    items: filtered.slice(0, limit)
  }
}

async function markDirty(kind, reason = 'mutation') {
  const nextIndex = {
    ...(await readIndex(kind) || createEmptyIndex(kind)),
    dirty: true,
    reason,
    updatedAt: new Date().toISOString()
  }
  await writeIndex(kind, nextIndex)
  return nextIndex
}

async function markDirtyByPath(relativePath, reason = 'mutation') {
  const kind = getKindForPath(relativePath)
  if (!kind) return null
  return markDirty(kind, reason)
}

async function markDirtyRoots(paths = [], reason = 'mutation') {
  const uniqueKinds = new Set()
  for (const item of Array.isArray(paths) ? paths : [paths]) {
    const kind = getKindForPath(item)
    if (kind) uniqueKinds.add(kind)
  }
  const results = []
  for (const kind of uniqueKinds) {
    results.push(await markDirty(kind, reason))
  }
  return results
}

async function upsertPath(relativePath) {
  const kind = getKindForPath(relativePath)
  if (!kind || !shouldIndexFile(kind, relativePath)) return null

  const index = await readIndex(kind)
  if (!index || index.dirty) {
    await markDirty(kind, 'upsert_pending_rebuild')
    return null
  }

  const absPath = path.join(getDataStorageRootAbs(), ...normalizeRelativePath(relativePath).split('/'))
  const statInfo = await fs.stat(absPath)
  if (!statInfo.isFile()) {
    await removePath(relativePath, { isDirectory: false })
    return null
  }

  const metadata = await buildEntryMetadata(kind, absPath, {
    path: normalizeRelativePath(relativePath).slice(getKindConfig(kind).root.length + 1),
    name: path.posix.basename(normalizeRelativePath(relativePath)).slice(0, -getKindConfig(kind).extension.length)
  })
  const nextEntry = makeEntry(kind, relativePath, statInfo, metadata)
  const nextEntries = index.entries.filter((entry) => entry.path !== nextEntry.path)
  nextEntries.push(nextEntry)
  nextEntries.sort(compareByPath)
  await writeIndex(kind, {
    ...index,
    entries: nextEntries,
    updatedAt: new Date().toISOString(),
    reason: 'incremental_upsert'
  })
  return nextEntry
}

async function removePath(relativePath, options = {}) {
  const kind = getKindForPath(relativePath)
  if (!kind) return null

  const index = await readIndex(kind)
  if (!index || index.dirty) {
    await markDirty(kind, 'remove_pending_rebuild')
    return null
  }

  const kindConfig = getKindConfig(kind)
  const normalized = normalizeRelativePath(relativePath)
  const relInRoot = normalized === kindConfig.root
    ? ''
    : normalized.slice(kindConfig.root.length + 1)
  const isDirectory = options?.isDirectory === true || (normalized === kindConfig.root)

  const nextEntries = index.entries.filter((entry) => {
    const entryPath = String(entry?.path || '')
    if (!relInRoot) return false
    return isDirectory
      ? !(entryPath === relInRoot || entryPath.startsWith(`${relInRoot}/`))
      : entryPath !== relInRoot
  })

  await writeIndex(kind, {
    ...index,
    entries: nextEntries,
    updatedAt: new Date().toISOString(),
    reason: 'incremental_remove'
  })
  return true
}

function replaceEntryPath(entry, fromRelInRoot, toRelInRoot) {
  const entryPath = String(entry?.path || '')
  if (entryPath !== fromRelInRoot && !entryPath.startsWith(`${fromRelInRoot}/`)) return entry
  const nextPath = entryPath === fromRelInRoot
    ? toRelInRoot
    : `${toRelInRoot}${entryPath.slice(fromRelInRoot.length)}`
  const dirPath = path.posix.dirname(nextPath)
  const filename = path.posix.basename(nextPath)
  return {
    ...entry,
    path: nextPath,
    dirPath: dirPath === '.' ? '' : dirPath,
    filename,
    name: filename.slice(0, -(entry?.type === 'session' ? '.json'.length : '.md'.length)),
    searchText: normalizeSearchText(
      String(entry?.searchText || '')
        .replace(new RegExp(String(fromRelInRoot || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), toRelInRoot)
    )
  }
}

async function movePath(fromRelativePath, toRelativePath, options = {}) {
  const fromKind = getKindForPath(fromRelativePath)
  const toKind = getKindForPath(toRelativePath)
  const affectedKinds = [...new Set([fromKind, toKind].filter(Boolean))]
  if (!affectedKinds.length) return null

  if (fromKind !== toKind) {
    await markDirtyRoots([fromRelativePath, toRelativePath], 'cross_root_move')
    return null
  }

  const kind = fromKind
  const index = await readIndex(kind)
  if (!index || index.dirty) {
    await markDirty(kind, 'move_pending_rebuild')
    return null
  }

  const kindConfig = getKindConfig(kind)
  const fromNormalized = normalizeRelativePath(fromRelativePath)
  const toNormalized = normalizeRelativePath(toRelativePath)
  const fromRelInRoot = fromNormalized === kindConfig.root ? '' : fromNormalized.slice(kindConfig.root.length + 1)
  const toRelInRoot = toNormalized === kindConfig.root ? '' : toNormalized.slice(kindConfig.root.length + 1)
  const isDirectory = options?.isDirectory === true || isIndexedDirectoryPath(kind, fromNormalized)

  let nextEntries = index.entries

  if (isDirectory) {
    nextEntries = index.entries.map((entry) => replaceEntryPath(entry, fromRelInRoot, toRelInRoot)).sort(compareByPath)
  } else {
    const fromShouldIndex = shouldIndexFile(kind, fromRelativePath)
    const toShouldIndex = shouldIndexFile(kind, toRelativePath)
    nextEntries = index.entries.filter((entry) => entry.path !== fromRelInRoot)
    if (fromShouldIndex && toShouldIndex) {
      try {
        const absPath = path.join(getDataStorageRootAbs(), ...toNormalized.split('/'))
        const statInfo = await fs.stat(absPath)
        if (statInfo.isFile()) {
          const metadata = await buildEntryMetadata(kind, absPath, {
            path: toRelInRoot,
            name: path.posix.basename(toRelInRoot).slice(0, -getKindConfig(kind).extension.length)
          })
          nextEntries.push(makeEntry(kind, toRelativePath, statInfo, metadata))
        }
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
    } else if (!fromShouldIndex && toShouldIndex) {
      try {
        const absPath = path.join(getDataStorageRootAbs(), ...toNormalized.split('/'))
        const statInfo = await fs.stat(absPath)
        if (statInfo.isFile()) {
          const metadata = await buildEntryMetadata(kind, absPath, {
            path: toRelInRoot,
            name: path.posix.basename(toRelInRoot).slice(0, -getKindConfig(kind).extension.length)
          })
          nextEntries.push(makeEntry(kind, toRelativePath, statInfo, metadata))
        }
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
    }
    nextEntries.sort(compareByPath)
  }

  await writeIndex(kind, {
    ...index,
    entries: nextEntries,
    updatedAt: new Date().toISOString(),
    reason: 'incremental_move'
  })
  return true
}

module.exports = {
  getSystemDirRelPath,
  getIndexDirRelPath,
  getIndexRelPath,
  ensureIndex,
  rebuildIndex,
  listRecent,
  searchIndex,
  markDirty,
  markDirtyByPath,
  markDirtyRoots,
  upsertPath,
  removePath,
  movePath,
  _internal: {
    INDEX_VERSION,
    INDEX_KINDS,
    shouldIndexFile,
    isIndexedDirectoryPath,
    isRelevantWatchedPath,
    createEmptyIndex,
    readIndex
  }
}
