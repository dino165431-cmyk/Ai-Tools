import { NOTE_EXTENSIONS } from './noteTypes.js'

function normalizeWrappedLinkInput(insideRaw) {
  return String(insideRaw || '').trim()
}

export function toPosixPath(p) {
  return String(p || '').replace(/\\/g, '/')
}

export function safeDecodeURIComponent(val) {
  try {
    return decodeURIComponent(val)
  } catch {
    return String(val || '')
  }
}

export function stripUrlHashAndQuery(url) {
  const s = String(url || '')
  return s.split('#')[0].split('?')[0]
}

export function sanitizeSubPathUnderRoot(subPathRaw) {
  const raw = String(subPathRaw || '').trim().replace(/\\/g, '/')
  if (!raw) return null
  const noLeading = raw.replace(/^\/+/, '')
  if (!noLeading) return null
  const normalized = toPosixPath(noLeading)
    .split('/')
    .filter((part) => part && part !== '.')
    .reduce((parts, part) => {
      if (part === '..') {
        if (!parts.length) return ['..']
        parts.pop()
        return parts
      }
      parts.push(part)
      return parts
    }, [])
    .join('/')
  if (!normalized || normalized === '.' || normalized === '..') return null
  if (normalized.startsWith('../')) return null
  if (/^[a-zA-Z]:/.test(normalized)) return null
  return normalized
}

export function splitMarkdownLinkDestination(insideRaw) {
  const inside = normalizeWrappedLinkInput(insideRaw)
  if (!inside) return { urlRaw: '', rest: '', wrapped: false }
  if (inside.startsWith('<')) {
    const end = inside.indexOf('>')
    if (end > 1) {
      const urlRaw = inside.slice(1, end).trim()
      const rest = inside.slice(end + 1)
      return { urlRaw, rest, wrapped: true }
    }
  }
  const firstSpace = inside.search(/\s/)
  const urlRaw = firstSpace === -1 ? inside : inside.slice(0, firstSpace)
  const rest = firstSpace === -1 ? '' : inside.slice(firstSpace)
  return { urlRaw, rest, wrapped: false }
}

export function normalizeNotePathInRoot(notePath) {
  let s = String(notePath || '').replace(/\\/g, '/').trim()
  if (!s) return null
  s = s.replace(/^\/+/, '')
  s = s.replace(/^note\//i, '')
  if (!NOTE_EXTENSIONS.some((ext) => s.toLowerCase().endsWith(ext))) s += '.md'
  const normalized = sanitizeSubPathUnderRoot(s)
  if (!normalized) return null
  return normalized
}

export function buildNoteHrefFromPath(noteAbsPath) {
  const p = toPosixPath(noteAbsPath)
  if (!p.startsWith('note/')) return null
  const rel = p.slice(5)
  return `note:/${encodeURI(rel)}`
}

export async function resolveNoteAbsPathFromHref(options = {}) {
  const href = String(options.hrefRaw || '').trim()
  if (!href) return null

  const existsFn = typeof options.existsFn === 'function' ? options.existsFn : null
  if (!existsFn) return null

  const noHash = stripUrlHashAndQuery(href)

  if (/^note:/i.test(noHash)) {
    let rest = noHash.replace(/^note:/i, '')
    rest = rest.replace(/^\/+/, '')
    rest = safeDecodeURIComponent(rest)
    const relInRoot = normalizeNotePathInRoot(rest)
    return relInRoot ? `note/${relInRoot}` : null
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(noHash)) return null
  if (noHash.startsWith('#')) return null

  const decoded = safeDecodeURIComponent(noHash)
  if (!decoded) return null

  const baseDir = options.currentFilePath ? toPosixPath(options.currentDir || options.currentFilePath.replace(/\/[^/]+$/, '')) : 'note'
  let candidate = ''
  if (decoded.startsWith('/')) {
    const safeAbsRel = sanitizeSubPathUnderRoot(decoded)
    if (!safeAbsRel) return null
    candidate = `note/${safeAbsRel}`
  } else {
    const joined = `${baseDir}/${decoded}`
    const rel = sanitizeSubPathUnderRoot(joined.replace(/^note\//, ''))
    if (!rel) return null
    candidate = `note/${rel}`
  }

  if (!candidate.startsWith('note/')) return null

  if (NOTE_EXTENSIONS.some((ext) => candidate.toLowerCase().endsWith(ext))) {
    return (await existsFn(candidate)) ? candidate : null
  }

  for (const ext of NOTE_EXTENSIONS) {
    const fullCandidate = `${candidate}${ext}`
    if (await existsFn(fullCandidate)) return fullCandidate
  }
  return null
}

export function rewriteNoteAssetsLinksInMarkdown(markdown, oldDocName, newDocName) {
  const oldName = String(oldDocName || '').trim()
  const newName = String(newDocName || '').trim()
  if (!markdown || !oldName || !newName || oldName === newName) return markdown

  const oldDir = `${oldName}.assets/`
  const newDir = `${newName}.assets/`
  const regex = /(!?\[[^\]]*?\]\()([^)]+)(\))/g

  return String(markdown).replace(regex, (full, prefix, inside, suffix) => {
    const rawInside = String(inside || '')
    const trimmed = rawInside.trim()
    if (!trimmed) return full

    const { urlRaw, rest, wrapped } = splitMarkdownLinkDestination(trimmed)
    if (!urlRaw) return full

    const urlNoHash = stripUrlHashAndQuery(urlRaw)
    const decoded = safeDecodeURIComponent(urlNoHash)
    const hadDotSlash = decoded.startsWith('./')
    const noDot = hadDotSlash ? decoded.slice(2) : decoded

    if (!noDot.startsWith(oldDir)) return full

    const rewrittenNoDot = newDir + noDot.slice(oldDir.length)
    const rewrittenDecoded = hadDotSlash ? `./${rewrittenNoDot}` : rewrittenNoDot
    const rewrittenEncoded = encodeURI(rewrittenDecoded)
    const rewrittenUrl = wrapped ? `<${rewrittenEncoded}>` : rewrittenEncoded

    return `${prefix}${rewrittenUrl}${rest}${suffix}`
  })
}
