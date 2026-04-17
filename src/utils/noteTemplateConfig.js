import {
  BUILTIN_NOTE_TEMPLATE_ROOT_IDS,
  NOTE_TEMPLATE_KINDS,
  findBuiltinNoteTemplateCategoryByLabel,
  getBuiltinNoteTemplateItems,
  getBuiltinNoteTemplateRoots,
  getNoteTemplateKindMeta,
  normalizeNoteTemplateKind
} from '@/utils/noteTemplateRegistry'

export const MAX_RECENT_NOTE_TEMPLATES = 12

function createDefaultState() {
  return {
    favorites: [],
    recent: [],
    customRoots: [],
    customCategories: [],
    customTemplates: [],
    builtinRootOverrides: {},
    builtinCategoryOverrides: {},
    builtinTemplateOverrides: {}
  }
}

const DEFAULT_NOTE_TEMPLATE_STATE = Object.freeze(createDefaultState())
const NOTE_TEMPLATE_VIEW_CACHE_LIMIT = 4
const noteTemplateViewCache = new Map()

export const DEFAULT_NOTE_EDITOR_CONFIG = Object.freeze({
  noteTemplates: DEFAULT_NOTE_TEMPLATE_STATE
})

function normalizeIdList(list, max = Number.MAX_SAFE_INTEGER) {
  const out = []
  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const id = String(item || '').trim()
    if (!id || out.includes(id)) return
    out.push(id)
  })
  return out.slice(0, Math.max(0, Number(max) || 0))
}

function normalizeKeywords(list) {
  return normalizeIdList(list)
}

function normalizeSnippetMode(mode) {
  return String(mode || '').trim().toLowerCase() === 'inline' ? 'inline' : 'block'
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key)
}

function createGeneratedId(prefix) {
  return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveNowIso(value) {
  return String(value || new Date().toISOString())
}

function normalizeCustomRoot(item) {
  const src = item && typeof item === 'object' ? item : {}
  const label = String(src.label || '').trim()
  if (!label) return null

  const createdAt = resolveNowIso(src.createdAt)
  const updatedAt = resolveNowIso(src.updatedAt || createdAt)
  const rawId = String(src.id || '').trim()

  return {
    id: rawId || createGeneratedId('custom-root'),
    label,
    description: String(src.description || '').trim(),
    createdAt,
    updatedAt
  }
}

function normalizeCustomCategory(item, fallbackRootId = '') {
  const src = item && typeof item === 'object' ? item : {}
  const label = String(src.label || '').trim()
  const rootId = String(src.rootId || fallbackRootId || '').trim()
  if (!label || !rootId) return null

  const createdAt = resolveNowIso(src.createdAt)
  const updatedAt = resolveNowIso(src.updatedAt || createdAt)
  const rawId = String(src.id || '').trim()

  return {
    id: rawId || createGeneratedId('custom-category'),
    rootId,
    label,
    description: String(src.description || '').trim(),
    createdAt,
    updatedAt
  }
}

function normalizeCustomTemplate(item, fallback = {}) {
  const src = item && typeof item === 'object' ? item : {}
  const label = String(src.label || '').trim()
  const template = String(src.template || '')
  if (!label || !template.trim()) return null

  const createdAt = resolveNowIso(src.createdAt)
  const updatedAt = resolveNowIso(src.updatedAt || createdAt)
  const rawId = String(src.id || '').trim()
  const kind = normalizeNoteTemplateKind(src.kind || fallback.kind)

  return {
    id: rawId || createGeneratedId('custom-template'),
    rootId: String(src.rootId || fallback.rootId || '').trim(),
    categoryId: String(src.categoryId || fallback.categoryId || '').trim(),
    kind,
    type: 'template',
    persistable: true,
    label,
    syntax: String(src.syntax || '').trim(),
    keywords: normalizeKeywords(src.keywords),
    template,
    snippetMode: kind === 'formula' ? normalizeSnippetMode(src.snippetMode) : undefined,
    createdAt,
    updatedAt
  }
}

function normalizeBuiltinRootOverride(item) {
  const src = item && typeof item === 'object' ? item : {}
  const label = String(src.label || '').trim()
  if (!label) return null

  return {
    label,
    description: String(src.description || '').trim()
  }
}

function normalizeBuiltinCategoryOverride(item) {
  const src = item && typeof item === 'object' ? item : {}
  const label = String(src.label || '').trim()
  if (!label) return null

  return {
    label,
    description: String(src.description || '').trim()
  }
}

function normalizeBuiltinTemplateOverride(item) {
  const src = item && typeof item === 'object' ? item : {}
  const out = {}

  if (hasOwn(src, 'label')) {
    const label = String(src.label || '').trim()
    if (!label) return null
    out.label = label
  }
  if (hasOwn(src, 'syntax')) {
    out.syntax = String(src.syntax || '').trim()
  }
  if (hasOwn(src, 'keywords')) {
    out.keywords = normalizeKeywords(src.keywords)
  }
  if (hasOwn(src, 'categoryId')) {
    out.categoryId = String(src.categoryId || '').trim()
  }
  if (hasOwn(src, 'description')) {
    out.description = String(src.description || '').trim()
  }
  if (hasOwn(src, 'template')) {
    const template = String(src.template || '')
    if (!template.trim()) return null
    out.template = template
  }
  if (hasOwn(src, 'snippetMode')) {
    out.snippetMode = normalizeSnippetMode(src.snippetMode)
  }

  return Object.keys(out).length ? out : null
}

function normalizeOverrideMap(rawMap, normalizer) {
  const src = rawMap && typeof rawMap === 'object' ? rawMap : {}
  const out = {}
  Object.entries(src).forEach(([key, value]) => {
    const id = String(key || '').trim()
    if (!id) return
    const normalized = normalizer(value)
    if (!normalized) return
    out[id] = normalized
  })
  return out
}

function pushUniqueRecord(target, item) {
  if (!item || target.some((entry) => entry.id === item.id)) return
  target.push(item)
}

function mergeOverrideMap(target, source, normalizer) {
  const normalized = normalizeOverrideMap(source, normalizer)
  Object.entries(normalized).forEach(([id, value]) => {
    target[id] = value
  })
}

function ensureMigratedCustomCategory(state, rootId, label, createdAt, updatedAt) {
  const normalizedLabel = String(label || '').trim()
  if (!normalizedLabel) return ''

  const existing = state.customCategories.find(
    (item) => item.rootId === rootId && item.label === normalizedLabel
  )
  if (existing) return existing.id

  const category = normalizeCustomCategory(
    {
      id: createGeneratedId('legacy-category'),
      rootId,
      label: normalizedLabel,
      createdAt,
      updatedAt
    },
    rootId
  )
  if (!category) return ''

  state.customCategories.push(category)
  return category.id
}

function migrateLegacyLikeTemplates(state, rawList, kind, rootId) {
  ;(Array.isArray(rawList) ? rawList : []).forEach((item) => {
    const src = item && typeof item === 'object' ? item : {}
    const groupLabel = String(src.group || '').trim()
    let categoryId = String(src.categoryId || '').trim()

    if (!categoryId && groupLabel) {
      const builtinCategory = findBuiltinNoteTemplateCategoryByLabel(rootId, groupLabel)
      categoryId = builtinCategory?.id || ensureMigratedCustomCategory(
        state,
        rootId,
        groupLabel,
        src.createdAt,
        src.updatedAt
      )
    }

    const normalized = normalizeCustomTemplate(
      {
        ...src,
        rootId,
        categoryId,
        kind: src.kind || kind
      },
      { rootId, kind }
    )
    pushUniqueRecord(state.customTemplates, normalized)
  })
}

function migrateKindBucketIntoState(state, rawStore, kind) {
  const rootId = BUILTIN_NOTE_TEMPLATE_ROOT_IDS[normalizeNoteTemplateKind(kind)]
  const src = rawStore && typeof rawStore === 'object' ? rawStore : {}

  state.favorites.push(...normalizeIdList(src.favorites))
  state.recent.push(...normalizeIdList(src.recent, MAX_RECENT_NOTE_TEMPLATES))

  ;(Array.isArray(src.customCategories) ? src.customCategories : []).forEach((item) => {
    pushUniqueRecord(
      state.customCategories,
      normalizeCustomCategory(
        {
          ...item,
          rootId
        },
        rootId
      )
    )
  })

  ;(Array.isArray(src.customTemplates) ? src.customTemplates : []).forEach((item) => {
    const normalized = normalizeCustomTemplate(
      {
        ...item,
        rootId,
        kind: item?.kind || kind,
        categoryId: item?.categoryId || ''
      },
      { rootId, kind }
    )
    pushUniqueRecord(state.customTemplates, normalized)
  })

  migrateLegacyLikeTemplates(state, src.custom, kind, rootId)
  mergeOverrideMap(state.builtinCategoryOverrides, src.builtinCategoryOverrides, normalizeBuiltinCategoryOverride)
  mergeOverrideMap(state.builtinTemplateOverrides, src.builtinTemplateOverrides, normalizeBuiltinTemplateOverride)
}

function normalizeGlobalState(rawState) {
  const src = rawState && typeof rawState === 'object' ? rawState : {}
  const customRoots = []
  const customCategories = []
  const customTemplates = []

  ;(Array.isArray(src.customRoots) ? src.customRoots : []).forEach((item) => {
    pushUniqueRecord(customRoots, normalizeCustomRoot(item))
  })

  ;(Array.isArray(src.customCategories) ? src.customCategories : []).forEach((item) => {
    pushUniqueRecord(customCategories, normalizeCustomCategory(item))
  })

  ;(Array.isArray(src.customTemplates) ? src.customTemplates : []).forEach((item) => {
    pushUniqueRecord(customTemplates, normalizeCustomTemplate(item))
  })

  return {
    favorites: normalizeIdList(src.favorites),
    recent: normalizeIdList(src.recent, MAX_RECENT_NOTE_TEMPLATES),
    customRoots,
    customCategories,
    customTemplates,
    builtinRootOverrides: normalizeOverrideMap(src.builtinRootOverrides, normalizeBuiltinRootOverride),
    builtinCategoryOverrides: normalizeOverrideMap(src.builtinCategoryOverrides, normalizeBuiltinCategoryOverride),
    builtinTemplateOverrides: normalizeOverrideMap(src.builtinTemplateOverrides, normalizeBuiltinTemplateOverride)
  }
}

function isGlobalStateShape(raw) {
  if (!raw || typeof raw !== 'object') return false
  return (
    Array.isArray(raw.customRoots)
    || Array.isArray(raw.customCategories)
    || Array.isArray(raw.customTemplates)
    || hasOwn(raw, 'builtinRootOverrides')
  )
}

function isLegacyKindBucketShape(raw) {
  if (!raw || typeof raw !== 'object') return false
  return NOTE_TEMPLATE_KINDS.some((kind) => raw[kind] && typeof raw[kind] === 'object')
}

function migrateLegacyKindBucketState(raw) {
  const state = createDefaultState()
  NOTE_TEMPLATE_KINDS.forEach((kind) => {
    migrateKindBucketIntoState(state, raw?.[kind], kind)
  })
  return normalizeGlobalState({
    ...state,
    favorites: state.favorites,
    recent: state.recent
  })
}

export function normalizeNoteEditorConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const noteTemplates = src.noteTemplates && typeof src.noteTemplates === 'object' ? src.noteTemplates : null
  const diagramTemplates = src.diagramTemplates && typeof src.diagramTemplates === 'object' ? src.diagramTemplates : null

  if (noteTemplates) {
    if (isGlobalStateShape(noteTemplates)) {
      return {
        noteTemplates: normalizeGlobalState(noteTemplates)
      }
    }
    if (isLegacyKindBucketShape(noteTemplates)) {
      return {
        noteTemplates: migrateLegacyKindBucketState(noteTemplates)
      }
    }
  }

  if (diagramTemplates) {
    return {
      noteTemplates: migrateLegacyKindBucketState(diagramTemplates)
    }
  }

  return {
    noteTemplates: normalizeGlobalState(null)
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

export function getNoteTemplateStateFromNoteConfig(noteConfigValue) {
  const noteConfig = resolveNoteConfigValue(noteConfigValue)
  const noteEditor = normalizeNoteEditorConfig(noteConfig?.noteEditor)
  return normalizeGlobalState(noteEditor.noteTemplates)
}

export function buildNextNoteEditorConfig(noteConfigValue, updater) {
  const noteConfig = resolveNoteConfigValue(noteConfigValue)
  const rawNoteEditor = noteConfig?.noteEditor && typeof noteConfig.noteEditor === 'object'
    ? noteConfig.noteEditor
    : {}
  const { diagramTemplates: _diagramTemplates, ...restRawNoteEditor } = rawNoteEditor
  const current = normalizeNoteEditorConfig(rawNoteEditor)
  const nextState = normalizeGlobalState(updater(current.noteTemplates))

  return {
    ...restRawNoteEditor,
    ...current,
    noteTemplates: nextState
  }
}

function filterTemplateRefs(state, validTemplateIds) {
  const valid = new Set(normalizeIdList(Array.from(validTemplateIds || [])))
  return {
    ...state,
    favorites: state.favorites.filter((id) => valid.has(id)),
    recent: state.recent.filter((id) => valid.has(id))
  }
}

export function pushRecentTemplate(state, templateId) {
  const id = String(templateId || '').trim()
  if (!id) return state
  return {
    ...state,
    recent: [id, ...state.recent.filter((item) => item !== id)].slice(0, MAX_RECENT_NOTE_TEMPLATES)
  }
}

export function toggleFavoriteTemplate(state, templateId) {
  const id = String(templateId || '').trim()
  if (!id) return state

  const exists = state.favorites.includes(id)
  return {
    ...state,
    favorites: exists
      ? state.favorites.filter((item) => item !== id)
      : [...state.favorites, id]
  }
}

function compareRootItems(left, right) {
  if (!!left?.builtin !== !!right?.builtin) return left?.builtin ? -1 : 1

  const leftOrder = Number(left?.order)
  const rightOrder = Number(right?.order)
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }

  const leftTime = Date.parse(String(left?.createdAt || '')) || 0
  const rightTime = Date.parse(String(right?.createdAt || '')) || 0
  if (leftTime !== rightTime) return leftTime - rightTime

  return String(left?.label || '').localeCompare(String(right?.label || ''), 'zh-Hans-CN')
}

function compareCategoryItems(left, right) {
  if (!!left?.builtin !== !!right?.builtin) return left?.builtin ? -1 : 1

  const leftOrder = Number(left?.order)
  const rightOrder = Number(right?.order)
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }

  const leftTime = Date.parse(String(left?.createdAt || '')) || 0
  const rightTime = Date.parse(String(right?.createdAt || '')) || 0
  if (leftTime !== rightTime) return leftTime - rightTime

  return String(left?.label || '').localeCompare(String(right?.label || ''), 'zh-Hans-CN')
}

function compareTemplateItems(left, right) {
  if (left?.type === 'action' && right?.type !== 'action') return -1
  if (right?.type === 'action' && left?.type !== 'action') return 1
  if (!!left?.builtin !== !!right?.builtin) return left?.builtin ? -1 : 1

  const leftOrder = Number(left?.order)
  const rightOrder = Number(right?.order)
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }

  const leftTime = Date.parse(String(left?.updatedAt || left?.createdAt || '')) || 0
  const rightTime = Date.parse(String(right?.updatedAt || right?.createdAt || '')) || 0
  if (leftTime !== rightTime) return rightTime - leftTime

  return String(left?.label || '').localeCompare(String(right?.label || ''), 'zh-Hans-CN')
}

function dedupeItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function buildNoteTemplateViewFromState(state) {
  const normalizedState = normalizeGlobalState(state)
  const builtinRoots = getBuiltinNoteTemplateRoots()

  const rootsBase = [
    ...builtinRoots.map((root) => {
      const override = normalizedState.builtinRootOverrides?.[root.id]
      return {
        ...root,
        ...(override || {}),
        builtin: true,
        isModified: !!override,
        toolbarTitle: root.toolbarTitle || getNoteTemplateKindMeta(root.kind).toolbarTitle
      }
    }),
    ...normalizedState.customRoots.map((root) => ({
      ...root,
      builtin: false,
      isModified: false,
      toolbarTitle: root.label
    }))
  ].sort(compareRootItems)

  const fallbackRootId = rootsBase[0]?.id || ''
  const rootMapBase = new Map(rootsBase.map((root) => [root.id, root]))
  const rootOrder = new Map(rootsBase.map((root, index) => [root.id, index]))

  const categoriesBase = [
    ...builtinRoots.flatMap((root) => root.categories).map((category) => {
      const override = normalizedState.builtinCategoryOverrides?.[category.id]
      return {
        ...category,
        ...(override || {}),
        builtin: true,
        isModified: !!override
      }
    }),
    ...normalizedState.customCategories
      .map((category) => {
        const rootId = rootMapBase.has(category.rootId) ? category.rootId : fallbackRootId
        if (!rootId) return null
        return {
          ...category,
          rootId,
          builtin: false,
          isModified: false
        }
      })
      .filter(Boolean)
  ].sort((left, right) => {
    if (left.rootId !== right.rootId) {
      const leftIndex = rootOrder.get(left.rootId) ?? Number.MAX_SAFE_INTEGER
      const rightIndex = rootOrder.get(right.rootId) ?? Number.MAX_SAFE_INTEGER
      return leftIndex - rightIndex
    }
    return compareCategoryItems(left, right)
  })

  const categoriesByRootBase = new Map(rootsBase.map((root) => [root.id, []]))
  categoriesBase.forEach((category) => {
    if (!categoriesByRootBase.has(category.rootId)) {
      categoriesByRootBase.set(category.rootId, [])
    }
    categoriesByRootBase.get(category.rootId).push(category)
  })

  const firstCategoryByRoot = new Map(
    Array.from(categoriesByRootBase.entries()).map(([rootId, list]) => [rootId, list[0]?.id || ''])
  )
  const fallbackCategoryId = categoriesBase[0]?.id || ''
  const categoryMapBase = new Map(categoriesBase.map((category) => [category.id, category]))

  const itemsBase = [
    ...getBuiltinNoteTemplateItems().map((item) => {
      const override = normalizedState.builtinTemplateOverrides?.[item.id]
      let categoryId = String(override?.categoryId || item.categoryId || '').trim()
      if (!categoryMapBase.has(categoryId)) categoryId = item.categoryId
      if (!categoryMapBase.has(categoryId)) {
        categoryId = firstCategoryByRoot.get(item.rootId) || fallbackCategoryId
      }
      const category = categoryMapBase.get(categoryId)
      const rootId = category?.rootId || item.rootId || fallbackRootId
      const root = rootMapBase.get(rootId)

      return {
        ...item,
        ...(override || {}),
        rootId,
        rootLabel: root?.label || '',
        categoryId,
        categoryLabel: category?.label || item.categoryLabel || '',
        kind: item.kind,
        builtin: true,
        isModified: !!override
      }
    }),
    ...normalizedState.customTemplates.map((item) => {
      let rootId = String(item.rootId || '').trim()
      if (!rootMapBase.has(rootId)) {
        rootId = categoryMapBase.get(item.categoryId)?.rootId || fallbackRootId
      }
      const root = rootMapBase.get(rootId)
      let categoryId = String(item.categoryId || '').trim()
      if (!categoryMapBase.has(categoryId) || categoryMapBase.get(categoryId)?.rootId !== rootId) {
        categoryId = firstCategoryByRoot.get(rootId) || fallbackCategoryId
      }
      const category = categoryMapBase.get(categoryId)

      return {
        ...item,
        rootId,
        rootLabel: root?.label || '',
        categoryId,
        categoryLabel: category?.label || '',
        kind: normalizeNoteTemplateKind(item.kind),
        builtin: false,
        isModified: false
      }
    })
  ].sort(compareTemplateItems)

  const rootTemplateCount = new Map()
  const categoryTemplateCount = new Map()
  itemsBase.forEach((item) => {
    rootTemplateCount.set(item.rootId, (rootTemplateCount.get(item.rootId) || 0) + 1)
    categoryTemplateCount.set(item.categoryId, (categoryTemplateCount.get(item.categoryId) || 0) + 1)
  })

  const roots = rootsBase.map((root) => {
    const categoryCount = categoriesByRootBase.get(root.id)?.length || 0
    const templateCount = rootTemplateCount.get(root.id) || 0
    return {
      ...root,
      categoryCount,
      templateCount,
      canDelete: !root.builtin && categoryCount === 0 && templateCount === 0
    }
  })
  const rootMap = new Map(roots.map((root) => [root.id, root]))

  const categories = categoriesBase.map((category) => ({
    ...category,
    rootLabel: rootMap.get(category.rootId)?.label || '',
    templateCount: categoryTemplateCount.get(category.id) || 0,
    canDelete: !category.builtin && (categoryTemplateCount.get(category.id) || 0) === 0
  }))
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const categoriesByRoot = new Map(roots.map((root) => [root.id, []]))
  categories.forEach((category) => {
    if (!categoriesByRoot.has(category.rootId)) {
      categoriesByRoot.set(category.rootId, [])
    }
    categoriesByRoot.get(category.rootId).push(category)
  })

  const items = itemsBase.map((item) => ({
    ...item,
    rootLabel: rootMap.get(item.rootId)?.label || item.rootLabel || '',
    categoryLabel: categoryMap.get(item.categoryId)?.label || item.categoryLabel || ''
  }))

  const validPersistableIds = items.filter((item) => item.persistable !== false).map((item) => item.id)
  const filteredState = filterTemplateRefs(normalizedState, validPersistableIds)
  const favoriteSet = new Set(filteredState.favorites)
  const recentSet = new Set(filteredState.recent)
  const decoratedItems = items.map((item) => ({
    ...item,
    isFavorite: favoriteSet.has(item.id),
    isRecent: recentSet.has(item.id)
  }))
  const itemMap = new Map(decoratedItems.map((item) => [item.id, item]))
  const itemsByRoot = new Map(roots.map((root) => [root.id, []]))
  const itemsByCategory = new Map(categories.map((category) => [category.id, []]))

  decoratedItems.forEach((item) => {
    if (!itemsByRoot.has(item.rootId)) {
      itemsByRoot.set(item.rootId, [])
    }
    itemsByRoot.get(item.rootId).push(item)

    if (!itemsByCategory.has(item.categoryId)) {
      itemsByCategory.set(item.categoryId, [])
    }
    itemsByCategory.get(item.categoryId).push(item)
  })

  const favoriteItems = dedupeItems(
    filteredState.favorites
      .map((id) => itemMap.get(id))
      .filter(Boolean)
  )
  const recentItems = dedupeItems(
    filteredState.recent
      .filter((id) => !favoriteSet.has(id))
      .map((id) => itemMap.get(id))
      .filter(Boolean)
  )

  return {
    state: filteredState,
    roots,
    categories,
    items: decoratedItems,
    rootMap,
    categoryMap,
    itemMap,
    categoriesByRoot,
    itemsByRoot,
    itemsByCategory,
    favoriteItems,
    recentItems,
    fallbackRootId,
    fallbackCategoryId,
    firstCategoryByRoot
  }
}

export function buildNoteTemplateView(noteConfigValue) {
  const state = getNoteTemplateStateFromNoteConfig(noteConfigValue)
  const cacheKey = JSON.stringify(state)
  if (noteTemplateViewCache.has(cacheKey)) {
    const cached = noteTemplateViewCache.get(cacheKey)
    noteTemplateViewCache.delete(cacheKey)
    noteTemplateViewCache.set(cacheKey, cached)
    return cached
  }

  const view = buildNoteTemplateViewFromState(state)
  noteTemplateViewCache.set(cacheKey, view)
  while (noteTemplateViewCache.size > NOTE_TEMPLATE_VIEW_CACHE_LIMIT) {
    const oldestKey = noteTemplateViewCache.keys().next().value
    noteTemplateViewCache.delete(oldestKey)
  }
  return view
}

export function addCustomRoot(state, payload) {
  const normalized = normalizeCustomRoot({
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  if (!normalized) throw new Error('顶部栏目名称不能为空')

  return {
    ...state,
    customRoots: [...state.customRoots, normalized]
  }
}

export function updateCustomRoot(state, rootId, patch) {
  const id = String(rootId || '').trim()
  if (!id) throw new Error('顶部栏目 ID 不能为空')

  let found = false
  const nextCustomRoots = state.customRoots.map((item) => {
    if (item.id !== id) return item
    found = true
    const normalized = normalizeCustomRoot({
      ...item,
      ...patch,
      id,
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString()
    })
    if (!normalized) throw new Error('顶部栏目名称不能为空')
    return normalized
  })

  if (!found) throw new Error('未找到要更新的顶部栏目')
  return {
    ...state,
    customRoots: nextCustomRoots
  }
}

export function removeCustomRoot(state, rootId) {
  const id = String(rootId || '').trim()
  if (!id) return state

  const view = buildNoteTemplateViewFromState(state)
  const root = view.rootMap.get(id)
  if (!root) return state
  if (root.builtin) throw new Error('内置顶部栏目不能删除')
  if (!root.canDelete) throw new Error('只有空的顶部栏目才可以删除')

  return {
    ...state,
    customRoots: state.customRoots.filter((item) => item.id !== id)
  }
}

export function updateBuiltinRootOverride(state, rootId, patch) {
  const id = String(rootId || '').trim()
  if (!id) throw new Error('顶部栏目 ID 不能为空')

  const normalized = normalizeBuiltinRootOverride(patch)
  if (!normalized) throw new Error('顶部栏目名称不能为空')

  return {
    ...state,
    builtinRootOverrides: {
      ...state.builtinRootOverrides,
      [id]: normalized
    }
  }
}

export function restoreBuiltinRoot(state, rootId) {
  const id = String(rootId || '').trim()
  if (!id) return state

  const nextOverrides = { ...state.builtinRootOverrides }
  delete nextOverrides[id]

  return {
    ...state,
    builtinRootOverrides: nextOverrides
  }
}

export function addCustomCategory(state, payload) {
  const normalized = normalizeCustomCategory({
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  if (!normalized) throw new Error('模板分组名称不能为空')

  return {
    ...state,
    customCategories: [...state.customCategories, normalized]
  }
}

export function updateCustomCategory(state, categoryId, patch) {
  const id = String(categoryId || '').trim()
  if (!id) throw new Error('模板分组 ID 不能为空')

  let found = false
  const nextCustomCategories = state.customCategories.map((item) => {
    if (item.id !== id) return item
    found = true
    const normalized = normalizeCustomCategory({
      ...item,
      ...patch,
      id,
      rootId: item.rootId,
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString()
    }, item.rootId)
    if (!normalized) throw new Error('模板分组名称不能为空')
    return normalized
  })

  if (!found) throw new Error('未找到要更新的模板分组')
  return {
    ...state,
    customCategories: nextCustomCategories
  }
}

export function removeCustomCategory(state, categoryId) {
  const id = String(categoryId || '').trim()
  if (!id) return state

  const view = buildNoteTemplateViewFromState(state)
  const category = view.categoryMap.get(id)
  if (!category) return state
  if (category.builtin) throw new Error('内置模板分组不能删除')
  if (!category.canDelete) throw new Error('只有没有模板的模板分组才可以删除')

  return {
    ...state,
    customCategories: state.customCategories.filter((item) => item.id !== id)
  }
}

export function updateBuiltinCategoryOverride(state, categoryId, patch) {
  const id = String(categoryId || '').trim()
  if (!id) throw new Error('模板分组 ID 不能为空')

  const normalized = normalizeBuiltinCategoryOverride(patch)
  if (!normalized) throw new Error('模板分组名称不能为空')

  return {
    ...state,
    builtinCategoryOverrides: {
      ...state.builtinCategoryOverrides,
      [id]: normalized
    }
  }
}

export function restoreBuiltinCategory(state, categoryId) {
  const id = String(categoryId || '').trim()
  if (!id) return state

  const nextOverrides = { ...state.builtinCategoryOverrides }
  delete nextOverrides[id]

  return {
    ...state,
    builtinCategoryOverrides: nextOverrides
  }
}

export function addCustomTemplate(state, payload) {
  const normalized = normalizeCustomTemplate({
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, payload)
  if (!normalized) throw new Error('模板名称和模板内容不能为空')
  if (!normalized.rootId) throw new Error('模板必须归属一个顶部栏目')
  if (!normalized.categoryId) throw new Error('模板必须归属一个模板分组')

  return {
    ...state,
    customTemplates: [normalized, ...state.customTemplates.filter((item) => item.id !== normalized.id)]
  }
}

export function updateCustomTemplate(state, templateId, patch) {
  const id = String(templateId || '').trim()
  if (!id) throw new Error('模板 ID 不能为空')

  let found = false
  const nextCustomTemplates = state.customTemplates.map((item) => {
    if (item.id !== id) return item
    found = true
    const normalized = normalizeCustomTemplate({
      ...item,
      ...patch,
      id,
      rootId: item.rootId,
      kind: item.kind,
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString()
    }, item)
    if (!normalized) throw new Error('模板名称和模板内容不能为空')
    return normalized
  })

  if (!found) throw new Error('未找到要更新的模板')
  return {
    ...state,
    customTemplates: nextCustomTemplates
  }
}

export function removeCustomTemplate(state, templateId) {
  const id = String(templateId || '').trim()
  if (!id) return state

  return {
    ...state,
    favorites: state.favorites.filter((item) => item !== id),
    recent: state.recent.filter((item) => item !== id),
    customTemplates: state.customTemplates.filter((item) => item.id !== id)
  }
}

export function updateBuiltinTemplateOverride(state, templateId, patch) {
  const id = String(templateId || '').trim()
  if (!id) throw new Error('模板 ID 不能为空')

  const overridePayload = { ...patch }
  const targetKind = normalizeNoteTemplateKind(patch?.kind)
  if (targetKind !== 'formula' && hasOwn(overridePayload, 'snippetMode')) {
    delete overridePayload.snippetMode
  }

  const normalized = normalizeBuiltinTemplateOverride(overridePayload)
  if (!normalized) throw new Error('模板名称不能为空')

  return {
    ...state,
    builtinTemplateOverrides: {
      ...state.builtinTemplateOverrides,
      [id]: normalized
    }
  }
}

export function restoreBuiltinTemplate(state, templateId) {
  const id = String(templateId || '').trim()
  if (!id) return state

  const nextOverrides = { ...state.builtinTemplateOverrides }
  delete nextOverrides[id]

  return {
    ...state,
    builtinTemplateOverrides: nextOverrides
  }
}


