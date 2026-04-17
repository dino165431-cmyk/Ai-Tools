const DIAGRAM_KINDS = new Set(['echarts', 'mermaid'])
const DIMENSION_PATTERN = /^(\d+(?:\.\d+)?)(px|%|vw|vh|vmin|vmax|rem|em|ch|ex|cm|mm|in|pt|pc)?$/i
const ATTR_PATTERN = /([a-zA-Z][\w-]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;{}]+)/g

function stripQuotes(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim()
  }
  return text
}

export function normalizeDiagramDimension(value) {
  const text = stripQuotes(value)
  if (!text) return ''

  const match = text.match(DIMENSION_PATTERN)
  if (!match) return ''

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return ''

  const unit = String(match[2] || 'px').toLowerCase()
  return `${amount}${unit}`
}

export function normalizeDiagramSizeMeta(input = {}) {
  return {
    width: normalizeDiagramDimension(input.width || input.w || ''),
    height: normalizeDiagramDimension(input.height || input.h || '')
  }
}

function parseDiagramMetaAttributes(text) {
  const attrs = {}
  const raw = String(text || '').trim()
  if (!raw) return attrs

  let match = null
  while ((match = ATTR_PATTERN.exec(raw))) {
    const key = String(match[1] || '').trim().toLowerCase()
    const value = stripQuotes(match[2] || '')
    if (!key || !value) continue
    attrs[key] = value
  }

  return attrs
}

export function parseDiagramFenceInfo(info, expectedKind = '') {
  const text = String(info || '').trim()
  if (!text) return null

  const match = text.match(/^([a-zA-Z][\w-]*)([\s\S]*)$/)
  if (!match) return null

  const kind = String(match[1] || '').trim().toLowerCase()
  if (!DIAGRAM_KINDS.has(kind)) return null
  if (expectedKind && kind !== String(expectedKind).trim().toLowerCase()) return null

  let metaText = String(match[2] || '').trim()
  if (metaText.startsWith('{') && metaText.endsWith('}')) {
    metaText = metaText.slice(1, -1).trim()
  }

  const attrs = parseDiagramMetaAttributes(metaText)
  const size = normalizeDiagramSizeMeta(attrs)

  return {
    kind,
    raw: text,
    attrs,
    size,
    hasMeta: !!(size.width || size.height)
  }
}

export function buildDiagramFenceMetaMap(markdown) {
  const map = new Map()
  const lines = String(markdown || '').split(/\r?\n/)

  lines.forEach((line, index) => {
    const match = String(line || '').match(/^\s*(`{3,}|~{3,})\s*(.+?)\s*$/)
    if (!match) return

    const parsed = parseDiagramFenceInfo(match[2])
    if (!parsed?.hasMeta) return

    map.set(`${parsed.kind}:${index}`, {
      kind: parsed.kind,
      line: index,
      width: parsed.size.width,
      height: parsed.size.height
    })
  })

  return map
}

export function getDiagramFenceMetaForLine(map, kind, line) {
  if (!(map instanceof Map)) return null
  const lineNumber = Number(line)
  if (!Number.isFinite(lineNumber)) return null
  return map.get(`${String(kind || '').trim().toLowerCase()}:${lineNumber}`) || null
}

export function buildDiagramContainerStyle(kind, size = {}) {
  const normalizedKind = String(kind || '').trim().toLowerCase()
  const normalizedSize = normalizeDiagramSizeMeta(size)
  const styles = ['margin: 0 auto']

  if (normalizedSize.width) {
    if (/px$/i.test(normalizedSize.width)) {
      styles.push('width: 100%')
      styles.push(`max-width: ${normalizedSize.width}`)
    } else {
      styles.push(`width: ${normalizedSize.width}`)
      styles.push('max-width: 100%')
    }
  } else {
    styles.push('width: 100%')
  }

  if (normalizedSize.height) {
    styles.push(`height: ${normalizedSize.height}`)
    styles.push('aspect-ratio: auto')
  } else if (normalizedKind === 'echarts') {
    styles.push('aspect-ratio: 4 / 3')
  }

  return styles.join('; ')
}
