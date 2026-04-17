<template>
  <DropdownToolbar
    :title="toolbarTitle"
    :visible="visible"
    :disabled="disabled?.value"
    @on-change="visible = $event"
  >
    <template #default>
      <span class="note-template-toolbar__trigger">{{ triggerLabel }}</span>
    </template>

    <template #overlay>
      <div class="note-template-toolbar__panel">
        <div class="note-template-toolbar__search-row">
          <input
            v-model.trim="search"
            type="search"
            class="note-template-toolbar__search-input"
            :placeholder="searchPlaceholder"
          >
          <span class="note-template-toolbar__summary">
            {{ summaryText }}
          </span>
        </div>

        <div v-if="!search && categories.length" class="note-template-toolbar__tabs">
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            class="note-template-toolbar__tab"
            :class="{ 'is-active': category.id === selectedCategoryId }"
            @click="selectedCategoryId = category.id"
          >
            {{ category.label }}
          </button>
        </div>

        <div v-if="search && !searchResults.length" class="note-template-toolbar__empty">
          没有找到匹配的模板，换个关键词再试试。
        </div>

        <template v-else-if="search">
          <section class="note-template-toolbar__group">
            <div class="note-template-toolbar__group-head">
              <div class="note-template-toolbar__group-title">搜索结果</div>
              <span class="note-template-toolbar__group-meta">{{ searchResults.length }} 个</span>
            </div>
            <div class="note-template-toolbar__grid">
              <div
                v-for="item in searchResults"
                :key="item.id"
                class="note-template-toolbar__item-wrap"
              >
                <button
                  type="button"
                  class="note-template-toolbar__item"
                  @click="handleSelect(item)"
                >
                  <span class="note-template-toolbar__item-label">{{ item.label }}</span>
                  <code v-if="item.syntax" class="note-template-toolbar__item-syntax">{{ item.syntax }}</code>
                  <span class="note-template-toolbar__item-group">{{ item.categoryLabel }}</span>
                </button>
                <button
                  v-if="item.persistable !== false"
                  type="button"
                  class="note-template-toolbar__favorite"
                  :class="{ 'is-active': isFavorite(item.id) }"
                  :title="isFavorite(item.id) ? '取消收藏' : '加入收藏'"
                  @click.stop="handleToggleFavorite(item)"
                >
                  {{ isFavorite(item.id) ? '★' : '☆' }}
                </button>
              </div>
            </div>
          </section>
        </template>

        <template v-else>
          <section v-if="favoriteItems.length" class="note-template-toolbar__group">
            <div class="note-template-toolbar__group-title">收藏</div>
            <div class="note-template-toolbar__grid">
              <div
                v-for="item in favoriteItems"
                :key="item.id"
                class="note-template-toolbar__item-wrap"
              >
                <button
                  type="button"
                  class="note-template-toolbar__item"
                  @click="handleSelect(item)"
                >
                  <span class="note-template-toolbar__item-label">{{ item.label }}</span>
                  <code v-if="item.syntax" class="note-template-toolbar__item-syntax">{{ item.syntax }}</code>
                  <span class="note-template-toolbar__item-group">{{ item.categoryLabel }}</span>
                </button>
                <button
                  v-if="item.persistable !== false"
                  type="button"
                  class="note-template-toolbar__favorite is-active"
                  title="取消收藏"
                  @click.stop="handleToggleFavorite(item)"
                >
                  ★
                </button>
              </div>
            </div>
          </section>

          <section v-if="recentItems.length" class="note-template-toolbar__group">
            <div class="note-template-toolbar__group-title">最近使用</div>
            <div class="note-template-toolbar__grid">
              <div
                v-for="item in recentItems"
                :key="item.id"
                class="note-template-toolbar__item-wrap"
              >
                <button
                  type="button"
                  class="note-template-toolbar__item"
                  @click="handleSelect(item)"
                >
                  <span class="note-template-toolbar__item-label">{{ item.label }}</span>
                  <code v-if="item.syntax" class="note-template-toolbar__item-syntax">{{ item.syntax }}</code>
                  <span class="note-template-toolbar__item-group">{{ item.categoryLabel }}</span>
                </button>
                <button
                  v-if="item.persistable !== false"
                  type="button"
                  class="note-template-toolbar__favorite"
                  :class="{ 'is-active': isFavorite(item.id) }"
                  :title="isFavorite(item.id) ? '取消收藏' : '加入收藏'"
                  @click.stop="handleToggleFavorite(item)"
                >
                  {{ isFavorite(item.id) ? '★' : '☆' }}
                </button>
              </div>
            </div>
          </section>

          <section v-if="selectedCategory" class="note-template-toolbar__group">
            <div class="note-template-toolbar__group-head">
              <div class="note-template-toolbar__group-title">{{ selectedCategory.label }}</div>
              <span class="note-template-toolbar__group-meta">{{ categoryItems.length }} 个模板</span>
            </div>

            <div v-if="categoryItems.length" class="note-template-toolbar__grid">
              <div
                v-for="item in categoryItems"
                :key="item.id"
                class="note-template-toolbar__item-wrap"
              >
                <button
                  type="button"
                  class="note-template-toolbar__item"
                  @click="handleSelect(item)"
                >
                  <span class="note-template-toolbar__item-label">{{ item.label }}</span>
                  <code v-if="item.syntax" class="note-template-toolbar__item-syntax">{{ item.syntax }}</code>
                  <span class="note-template-toolbar__item-group">
                    {{ item.type === 'action' ? '快捷动作' : item.categoryLabel }}
                  </span>
                </button>
                <button
                  v-if="item.persistable !== false"
                  type="button"
                  class="note-template-toolbar__favorite"
                  :class="{ 'is-active': isFavorite(item.id) }"
                  :title="isFavorite(item.id) ? '取消收藏' : '加入收藏'"
                  @click.stop="handleToggleFavorite(item)"
                >
                  {{ isFavorite(item.id) ? '★' : '☆' }}
                </button>
              </div>
            </div>

            <div v-else class="note-template-toolbar__empty">
              当前模板分组下还没有模板，可以去“笔记配置”里新增。
            </div>
          </section>
        </template>

        <div class="note-template-toolbar__footer">
          顶部栏目、模板分组和模板都可以在“笔记配置”里统一管理。
        </div>
      </div>
    </template>
  </DropdownToolbar>
</template>

<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { DropdownToolbar } from 'md-editor-v3'
import { getNoteConfig, updateNoteConfig } from '@/utils/configListener'
import {
  buildNextNoteEditorConfig,
  buildNoteTemplateView,
  pushRecentTemplate,
  toggleFavoriteTemplate
} from '@/utils/noteTemplateConfig'
import { buildSnippetForNoteTemplateItem } from '@/utils/noteTemplateRegistry'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  rootId: {
    type: String,
    required: true
  },
  insertSnippet: {
    type: Function,
    required: true
  },
  getSelectedText: {
    type: Function,
    default: null
  }
})

const message = useMessage()
const visible = ref(false)
const search = ref('')
const selectedCategoryId = ref('')
const disabled = inject('disabled', ref(false))
const noteConfig = getNoteConfig()

const templateView = computed(() => buildNoteTemplateView(noteConfig.value))
const root = computed(() => templateView.value.rootMap.get(props.rootId) || null)
const categories = computed(() => templateView.value.categoriesByRoot.get(props.rootId) || [])
const allRootItems = computed(() => templateView.value.itemsByRoot.get(props.rootId) || [])
const favoriteItems = computed(() =>
  templateView.value.favoriteItems.filter((item) => item.rootId === props.rootId)
)
const recentItems = computed(() =>
  templateView.value.recentItems.filter((item) => item.rootId === props.rootId)
)

watch(
  categories,
  (nextCategories) => {
    const hasSelected = nextCategories.some((item) => item.id === selectedCategoryId.value)
    if (hasSelected) return
    selectedCategoryId.value = nextCategories[0]?.id || ''
  },
  { immediate: true }
)

const selectedCategory = computed(() =>
  categories.value.find((item) => item.id === selectedCategoryId.value) || null
)
const categoryItems = computed(() =>
  templateView.value.itemsByCategory.get(selectedCategoryId.value) || []
)

const triggerLabel = computed(() => root.value?.label || '模板')
const toolbarTitle = computed(() => root.value?.toolbarTitle || root.value?.label || '笔记模板')
const searchPlaceholder = computed(() => `搜索 ${triggerLabel.value} 模板、关键词或内置语法`)

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase()
}

function matchesItem(item, query) {
  if (!query) return true
  const haystack = [
    item.label,
    item.syntax,
    item.categoryLabel,
    item.description,
    ...(Array.isArray(item.keywords) ? item.keywords : [])
  ]
    .map((part) => normalizeQuery(part))
    .join(' ')
  return haystack.includes(query)
}

function dedupeItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

const searchResults = computed(() => {
  const query = normalizeQuery(search.value)
  if (!query) return []
  return dedupeItems(allRootItems.value).filter((item) => matchesItem(item, query))
})

const summaryText = computed(() => {
  if (search.value.trim()) {
    return `${searchResults.value.length} 个结果`
  }
  return `${categories.value.length} 个模板分组 / ${allRootItems.value.length} 个模板`
})

function isFavorite(templateId) {
  return templateView.value.state.favorites.includes(templateId)
}

async function persistState(updater) {
  const nextNoteEditor = buildNextNoteEditorConfig(noteConfig.value, updater)
  await updateNoteConfig({
    noteEditor: nextNoteEditor
  })
}

async function handleToggleFavorite(item) {
  if (!item || item.persistable === false) return
  try {
    await persistState((state) => toggleFavoriteTemplate(state, item.id))
  } catch (err) {
    message.error(err?.message || String(err))
  }
}

async function handleSelect(item) {
  if (disabled?.value) return

  const selectedText = props.getSelectedText?.() || ''
  if (item.type === 'action' && !String(selectedText || '').trim()) {
    message.warning('请先选中 Markdown 表格或 JSON 数据')
    return
  }

  const snippet = buildSnippetForNoteTemplateItem(item, { selectedText })
  if (!snippet) {
    message.warning('当前内容不能直接生成模板，请先选中表格或 JSON 数据')
    return
  }

  visible.value = false
  props.insertSnippet?.(snippet)

  if (item.persistable === false) return
  try {
    await persistState((state) => pushRecentTemplate(state, item.id))
  } catch (err) {
    message.error(err?.message || String(err))
  }
}
</script>

<style scoped>
.note-template-toolbar__trigger {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.note-template-toolbar__panel {
  width: min(860px, calc(100vw - 48px));
  max-height: 520px;
  overflow: auto;
  padding: 12px;
  box-sizing: border-box;
  background: var(--md-theme-bg-color, #fff);
}

.note-template-toolbar__search-row {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  background: var(--md-theme-bg-color, #fff);
}

.note-template-toolbar__search-input {
  flex: 1;
  min-width: 180px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--md-theme-border-color, #dbe1ea);
  border-radius: 10px;
  outline: none;
  background: var(--md-theme-bg-color, #fff);
  color: inherit;
}

.note-template-toolbar__search-input:focus {
  border-color: var(--md-theme-link-color, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.note-template-toolbar__summary {
  font-size: 12px;
  color: var(--md-theme-color, #64748b);
  white-space: nowrap;
}

.note-template-toolbar__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.note-template-toolbar__tab {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--md-theme-border-color, #dbe1ea);
  border-radius: 999px;
  background: var(--md-theme-bg-color, #fff);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.note-template-toolbar__tab:hover,
.note-template-toolbar__tab.is-active {
  border-color: var(--md-theme-link-color, #3b82f6);
  background: rgba(59, 130, 246, 0.08);
  color: var(--md-theme-link-color, #2563eb);
}

.note-template-toolbar__group + .note-template-toolbar__group {
  margin-top: 14px;
}

.note-template-toolbar__group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.note-template-toolbar__group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--md-theme-color, #334155);
}

.note-template-toolbar__group-meta {
  font-size: 11px;
  color: var(--md-theme-color, #64748b);
}

.note-template-toolbar__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(184px, 1fr));
  gap: 8px;
}

.note-template-toolbar__item-wrap {
  position: relative;
}

.note-template-toolbar__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  min-height: 88px;
  padding: 10px 40px 10px 12px;
  border: 1px solid var(--md-theme-border-color, #dbe1ea);
  border-radius: 10px;
  background: var(--md-theme-bg-color, #fff);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.note-template-toolbar__item:hover {
  background: var(--md-theme-bg-color-inset, #f8fafc);
  border-color: var(--md-theme-link-color, #3b82f6);
  transform: translateY(-1px);
}

.note-template-toolbar__item-label {
  font-size: 13px;
  font-weight: 600;
}

.note-template-toolbar__item-syntax {
  font-size: 11px;
  opacity: 0.72;
}

.note-template-toolbar__item-group {
  margin-top: auto;
  font-size: 11px;
  opacity: 0.64;
}

.note-template-toolbar__favorite {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(148, 163, 184, 0.95);
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.note-template-toolbar__favorite:hover {
  background: rgba(148, 163, 184, 0.14);
}

.note-template-toolbar__favorite.is-active {
  color: #f59e0b;
}

.note-template-toolbar__empty {
  padding: 20px 0 10px;
  text-align: center;
  font-size: 13px;
  color: var(--md-theme-color, #64748b);
}

.note-template-toolbar__footer {
  margin-top: 12px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--md-theme-color, #64748b);
}
</style>

