const SANDBOX_FILE_SCHEME = 'sandbox-file:'
const SANDBOX_DATA_PREFIX = '.ai-tools-sandbox/workspaces/'

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

function normalizeWorkspaceId(value) {
  const workspaceId = safeDecode(value).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(workspaceId)) return ''
  return workspaceId
}

function normalizeSandboxPath(value) {
  const raw = safeDecode(String(value || '').split(/[?#]/, 1)[0])
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\/+/, '')
  if (!raw || raw.includes('\0')) return ''
  const segments = raw.split('/').filter(Boolean)
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) return ''
  return segments.join('/')
}

export function buildSandboxFileHref(workspaceIdRaw, pathRaw) {
  const workspaceId = normalizeWorkspaceId(workspaceIdRaw)
  const filePath = normalizeSandboxPath(pathRaw)
  if (!workspaceId || !filePath) return ''
  const encodedPath = filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  return `${SANDBOX_FILE_SCHEME}//${workspaceId}/${encodedPath}`
}

export function parseSandboxFileHref(hrefRaw) {
  const href = String(hrefRaw || '').trim()
  const match = href.match(/^sandbox-file:\/\/([^/]+)\/(.+)$/i)
  if (!match) return null
  const workspaceId = normalizeWorkspaceId(match[1])
  const filePath = normalizeSandboxPath(match[2])
  if (!workspaceId || !filePath) return null
  return {
    workspaceId,
    name: filePath.split('/').pop() || filePath,
    path: filePath,
    dataPath: `${SANDBOX_DATA_PREFIX}${workspaceId}/${filePath}`,
    href: buildSandboxFileHref(workspaceId, filePath)
  }
}

function normalizeCatalogEntry(file) {
  if (!file || typeof file !== 'object') return null
  const workspaceId = normalizeWorkspaceId(file.workspaceId)
  const filePath = normalizeSandboxPath(file.path)
  let dataPath = normalizeSandboxPath(file.dataPath)

  if ((!workspaceId || !filePath) && dataPath.startsWith(SANDBOX_DATA_PREFIX)) {
    const rest = dataPath.slice(SANDBOX_DATA_PREFIX.length)
    const separator = rest.indexOf('/')
    if (separator > 0) {
      const parsedWorkspaceId = normalizeWorkspaceId(rest.slice(0, separator))
      const parsedPath = normalizeSandboxPath(rest.slice(separator + 1))
      if (parsedWorkspaceId && parsedPath) {
        return {
          ...file,
          workspaceId: parsedWorkspaceId,
          name: String(file.name || '').trim() || parsedPath.split('/').pop() || parsedPath,
          path: parsedPath,
          dataPath,
          href: buildSandboxFileHref(parsedWorkspaceId, parsedPath)
        }
      }
    }
  }

  if (!workspaceId || !filePath) return null
  dataPath = dataPath || `${SANDBOX_DATA_PREFIX}${workspaceId}/${filePath}`
  return {
    ...file,
    workspaceId,
    name: String(file.name || '').trim() || filePath.split('/').pop() || filePath,
    path: filePath,
    dataPath,
    href: buildSandboxFileHref(workspaceId, filePath)
  }
}

export function collectSandboxFileCatalog(messages = []) {
  const byDataPath = new Map()
  for (const message of Array.isArray(messages) ? messages : []) {
    const payload = message?.toolResultPayload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
    const kind = String(payload.kind || '').trim()
    if (!kind.startsWith('sandbox_')) continue
    const files = payload.changedFiles || payload.imported || payload.files
    for (const rawFile of Array.isArray(files) ? files : []) {
      const entry = normalizeCatalogEntry({
        ...rawFile,
        workspaceId: rawFile?.workspaceId || payload.workspaceId
      })
      if (entry) byDataPath.set(entry.dataPath.toLowerCase(), entry)
    }
  }
  return [...byDataPath.values()]
}

export function resolveSandboxFileLink(hrefRaw, catalog = []) {
  const explicit = parseSandboxFileHref(hrefRaw)
  const files = (Array.isArray(catalog) ? catalog : []).map(normalizeCatalogEntry).filter(Boolean)
  if (explicit) {
    return files.find((file) =>
      file.workspaceId.toLowerCase() === explicit.workspaceId.toLowerCase() &&
      file.path.toLowerCase() === explicit.path.toLowerCase()
    ) || explicit
  }

  const normalizedHref = normalizeSandboxPath(hrefRaw)
  if (!normalizedHref) return null
  const normalizedLower = normalizedHref.toLowerCase()
  const dataPathMatch = files.find((file) => file.dataPath.toLowerCase() === normalizedLower)
  if (dataPathMatch) return dataPathMatch

  const exactPathMatches = files.filter((file) => file.path.toLowerCase() === normalizedLower)
  if (exactPathMatches.length === 1) return exactPathMatches[0]

  const basename = normalizedLower.split('/').pop()
  const basenameMatches = files.filter((file) =>
    file.name.toLowerCase() === basename ||
    file.path.toLowerCase().split('/').pop() === basename
  )
  return basenameMatches.length === 1 ? basenameMatches[0] : null
}

export { SANDBOX_FILE_SCHEME }
