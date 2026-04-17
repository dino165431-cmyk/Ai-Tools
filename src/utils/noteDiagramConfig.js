export const DIAGRAM_KINDS = Object.freeze(['mermaid', 'echarts'])
export const MAX_RECENT_DIAGRAM_TEMPLATES = 5

const DEFAULT_BUCKET = Object.freeze({
  favorites: [],
  recent: [],
  custom: []
})

export const DEFAULT_NOTE_EDITOR_CONFIG = Object.freeze({
  diagramTemplates: Object.freeze({
    mermaid: DEFAULT_BUCKET,
    echarts: DEFAULT_BUCKET
  })
})

function normalizeKind(kind) {
  const key = String(kind || '').trim().toLowerCase()
  return DIAGRAM_KINDS.includes(key) ? key : 'mermaid'
}

function normalizeIdList(list, max = Number.MAX_SAFE_INTEGER) {
  const out = []
  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const id = String(item || '').trim()
    if (!id || out.includes(id)) return
    out.push(id)
  })
  return out.slice(0, Math.max(0, Number(max) || 0))
}

function normalizeCustomTemplate(item, fallbackKind) {
  const src = item && typeof item === 'object' ? item : {}
  const label = String(src.label || '').trim()
  const template = String(src.template || '').trim()
  if (!label || !template) return null

  const kind = normalizeKind(src.kind || fallbackKind)
  const nowIso = new Date().toISOString()
  const createdAt = String(src.createdAt || nowIso)
  const updatedAt = String(src.updatedAt || createdAt || nowIso)
  const rawId = String(src.id || '').trim()
  const id = rawId || `custom:${kind}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    id,
    kind,
    label,
    syntax: String(src.syntax || '').trim(),
    group: String(src.group || '').trim() || 'Custom',
    keywords: normalizeIdList(src.keywords),
    template,
    createdAt,
    updatedAt
  }
}

function normalizeBucket(rawBucket, kind) {
  const src = rawBucket && typeof rawBucket === 'object' ? rawBucket : {}
  const custom = []

  ;(Array.isArray(src.custom) ? src.custom : []).forEach((item) => {
    const normalized = normalizeCustomTemplate(item, kind)
    if (!normalized) return
    if (custom.some((entry) => entry.id === normalized.id)) return
    custom.push(normalized)
  })

  return {
    favorites: normalizeIdList(src.favorites),
    recent: normalizeIdList(src.recent, MAX_RECENT_DIAGRAM_TEMPLATES),
    custom
  }
}

export function normalizeNoteEditorConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const templates = src.diagramTemplates && typeof src.diagramTemplates === 'object' ? src.diagramTemplates : {}

  return {
    diagramTemplates: {
      mermaid: normalizeBucket(templates.mermaid, 'mermaid'),
      echarts: normalizeBucket(templates.echarts, 'echarts')
    }
  }
}

function resolveNoteConfigValue(input) {
  if (input && typeof input === 'object') {
    if (input.noteEditor) return input
    if (input.noteConfig && typeof input.noteConfig === 'object') return input.noteConfig
    if (input.chatConfig && typeof input.chatConfig === 'object') {
      return {
        noteEditor: input.chatConfig.noteEditor
      }
    }
  }
  return {}
}

export function getDiagramTemplateBucketFromNoteConfig(noteConfigValue, kind) {
  const normalizedKind = normalizeKind(kind)
  const noteConfig = resolveNoteConfigValue(noteConfigValue)
  const noteEditor = normalizeNoteEditorConfig(noteConfig?.noteEditor)
  return normalizeBucket(noteEditor.diagramTemplates[normalizedKind], normalizedKind)
}

export function buildNextNoteEditorConfig(noteConfigValue, kind, updater) {
  const normalizedKind = normalizeKind(kind)
  const noteConfig = resolveNoteConfigValue(noteConfigValue)
  const current = normalizeNoteEditorConfig(noteConfig?.noteEditor)
  const currentBucket = normalizeBucket(current.diagramTemplates[normalizedKind], normalizedKind)
  const nextBucket = normalizeBucket(updater(currentBucket), normalizedKind)

  return {
    ...current,
    diagramTemplates: {
      ...current.diagramTemplates,
      [normalizedKind]: nextBucket
    }
  }
}

export const getDiagramTemplateBucketFromChatConfig = getDiagramTemplateBucketFromNoteConfig

export function mergeWithBuiltinTemplateIds(bucket, validTemplateIds) {
  return filterTemplateRefs(bucket, validTemplateIds)
}

export function filterTemplateRefs(bucket, validTemplateIds) {
  const valid = new Set(normalizeIdList(Array.from(validTemplateIds || [])))
  return {
    ...bucket,
    favorites: bucket.favorites.filter((id) => valid.has(id)),
    recent: bucket.recent.filter((id) => valid.has(id))
  }
}

export function pushRecentTemplate(bucket, templateId) {
  const id = String(templateId || '').trim()
  if (!id) return bucket
  return {
    ...bucket,
    recent: [id, ...bucket.recent.filter((item) => item !== id)].slice(0, MAX_RECENT_DIAGRAM_TEMPLATES)
  }
}

export function toggleFavoriteTemplate(bucket, templateId) {
  const id = String(templateId || '').trim()
  if (!id) return bucket

  const exists = bucket.favorites.includes(id)
  return {
    ...bucket,
    favorites: exists
      ? bucket.favorites.filter((item) => item !== id)
      : [...bucket.favorites, id]
  }
}

export function addCustomTemplate(bucket, kind, payload) {
  const normalized = normalizeCustomTemplate(
    {
      ...payload,
      kind,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    kind
  )
  if (!normalized) throw new Error('Template label and template content are required')

  return {
    ...bucket,
    custom: [normalized, ...bucket.custom.filter((item) => item.id !== normalized.id)]
  }
}

export function updateCustomTemplate(bucket, kind, templateId, patch) {
  const id = String(templateId || '').trim()
  if (!id) throw new Error('Template id is required')

  let found = false
  const nextCustom = bucket.custom.map((item) => {
    if (item.id !== id) return item
    found = true
    const normalized = normalizeCustomTemplate(
      {
        ...item,
        ...patch,
        id,
        kind,
        createdAt: item.createdAt,
        updatedAt: new Date().toISOString()
      },
      kind
    )
    if (!normalized) throw new Error('Template label and template content are required')
    return normalized
  })

  if (!found) throw new Error('Template not found')
  return {
    ...bucket,
    custom: nextCustom
  }
}

export function removeCustomTemplate(bucket, templateId) {
  const id = String(templateId || '').trim()
  if (!id) return bucket

  return {
    ...bucket,
    favorites: bucket.favorites.filter((item) => item !== id),
    recent: bucket.recent.filter((item) => item !== id),
    custom: bucket.custom.filter((item) => item.id !== id)
  }
}
