const NOTE_TYPE_DEFS = Object.freeze({
  markdown: Object.freeze({
    type: 'markdown',
    label: '笔记',
    extension: '.md'
  }),
  notebook: Object.freeze({
    type: 'notebook',
    label: '超级笔记',
    extension: '.ipynb'
  })
})

const NOTE_TYPES = Object.freeze(Object.keys(NOTE_TYPE_DEFS))
const NOTE_EXTENSIONS = Object.freeze(
  NOTE_TYPES.map((type) => NOTE_TYPE_DEFS[type].extension)
)

export function getNoteTypeDefinition(type) {
  return NOTE_TYPE_DEFS[type] || NOTE_TYPE_DEFS.markdown
}

export function getNoteTypeLabel(type) {
  return getNoteTypeDefinition(type).label
}

export function getNoteExtensionByType(type) {
  return getNoteTypeDefinition(type).extension
}

export function getNoteTypeByExtension(extRaw) {
  const ext = String(extRaw || '').trim().toLowerCase()
  return NOTE_TYPES.find((type) => NOTE_TYPE_DEFS[type].extension === ext) || 'markdown'
}

export function getNoteTypeByPath(filePath) {
  const normalized = String(filePath || '').trim().toLowerCase()
  const matched = NOTE_EXTENSIONS.find((ext) => normalized.endsWith(ext))
  return matched ? getNoteTypeByExtension(matched) : 'markdown'
}

export function isSupportedNoteExtension(extRaw) {
  const ext = String(extRaw || '').trim().toLowerCase()
  return NOTE_EXTENSIONS.includes(ext)
}

export function isSupportedNotePath(filePath) {
  const normalized = String(filePath || '').trim().toLowerCase()
  return NOTE_EXTENSIONS.some((ext) => normalized.endsWith(ext))
}

export function stripNoteExtension(fileName) {
  const text = String(fileName || '')
  const matched = NOTE_EXTENSIONS.find((ext) => text.toLowerCase().endsWith(ext))
  return matched ? text.slice(0, -matched.length) : text
}

export { NOTE_TYPE_DEFS, NOTE_TYPES, NOTE_EXTENSIONS }
