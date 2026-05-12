<template>
  <section
    ref="rootRef"
    :data-cell-id="cell.id"
    :class="[
      'notebook-cell',
      'notebook-cell--markdown',
      { 'is-dark': theme === 'dark', 'is-selected': selected }
    ]"
    @mousedown="emitFocus"
  >
    <header ref="headerRef" class="notebook-cell__header">
      <div class="notebook-cell__title">
        <n-tag size="small" :bordered="false" type="success">Markdown</n-tag>
        <span>Cell {{ index + 1 }}</span>
      </div>

      <div class="notebook-cell__actions">
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button type="primary" ghost circle size="tiny" @click="handleRun">
              <template #icon>
                <n-icon><PlayOutline /></n-icon>
              </template>
            </n-button>
          </template>
          运行（Shift+Enter）
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="handleAddAfter('markdown')">
              <template #icon>
                <n-icon><DocumentTextOutline /></n-icon>
              </template>
            </n-button>
          </template>
          在下方插入 Markdown（Ctrl+Alt+M）
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="handleAddAfter('code')">
              <template #icon>
                <n-icon><CodeSlashOutline /></n-icon>
              </template>
            </n-button>
          </template>
          在下方插入代码 Cell（Ctrl+Alt+C）
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="scrollToContent">
              <template #icon>
                <n-icon><ChevronDownOutline /></n-icon>
              </template>
            </n-button>
          </template>
          跳到正文区域
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="togglePreview">
              <template #icon>
                <n-icon><component :is="previewing ? CreateOutline : EyeOutline" /></n-icon>
              </template>
            </n-button>
          </template>
          {{ previewing ? '切换到编辑模式' : '切换到预览模式' }}
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="toggleCollapse">
              <template #icon>
                <n-icon><component :is="collapsed ? ExpandCellIcon : CollapseCellIcon" /></n-icon>
              </template>
            </n-button>
          </template>
          {{ collapsed ? '展开 Cell' : '折叠 Cell' }}
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" :disabled="index <= 0" @click="handleMoveUp">
              <template #icon>
                <n-icon><ArrowUpOutline /></n-icon>
              </template>
            </n-button>
          </template>
          上移
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" :disabled="index >= cellCount - 1" @click="handleMoveDown">
              <template #icon>
                <n-icon><ArrowDownOutline /></n-icon>
              </template>
            </n-button>
          </template>
          下移
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="handleDelete">
              <template #icon>
                <n-icon><TrashOutline /></n-icon>
              </template>
            </n-button>
          </template>
          删除
        </n-tooltip>
      </div>
    </header>

    <div v-if="!collapsed && contentActive" ref="contentRef">
      <div ref="bodyRef" class="notebook-cell__body">
        <NotebookMarkdownEditor
          v-if="!previewing"
          ref="editorRef"
          :model-value="cell.source || ''"
          :file-path="filePath"
          :theme="theme"
          @focus="emitFocus"
          @update:model-value="$emit('update-source', $event)"
        />

        <div
          v-else
          class="notebook-cell__preview markdown-body"
          tabindex="0"
          @focus="emitFocus"
        >
          <LazyMarkdownPreview
            :editor-id="previewId"
            :model-value="cell.source || ''"
            :file-path="filePath"
            preview-theme="github"
            :theme="theme"
          />
        </div>
      </div>
    </div>

    <div v-else-if="!collapsed" class="notebook-cell__content-placeholder" :style="{ height: `${contentHeight}px` }">
      <span class="notebook-cell__content-placeholder-text">滚动到这里时会自动加载内容</span>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { NButton, NIcon, NTag, NTooltip } from 'naive-ui'
import {
  ArrowDownOutline,
  ArrowUpOutline,
  ChevronDownOutline,
  CodeSlashOutline,
  CreateOutline,
  DocumentTextOutline,
  EyeOutline,
  PlayOutline,
  TrashOutline
} from '@vicons/ionicons5'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'
import NotebookMarkdownEditor from './NotebookMarkdownEditor.vue'
import { CollapseCellIcon, ExpandCellIcon } from './notebookCellIcons'

const props = defineProps({
  cell: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    default: 0
  },
  cellCount: {
    type: Number,
    default: 1
  },
  selected: {
    type: Boolean,
    default: false
  },
  previewing: {
    type: Boolean,
    default: false
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  filePath: {
    type: String,
    default: ''
  },
  contentActive: {
    type: Boolean,
    default: true
  },
  theme: {
    type: String,
    default: 'light'
  }
})

const emit = defineEmits([
  'update-source',
  'delete',
  'move-up',
  'move-down',
  'add-after',
  'run',
  'toggle-preview',
  'toggle-collapse',
  'focus'
])

const rootRef = ref(null)
const headerRef = ref(null)
const editorRef = ref(null)
const bodyRef = ref(null)
const contentRef = ref(null)
const contentHeight = ref(132)
const pendingFocus = ref(false)
const previewId = computed(() => `notebook-md-${props.cell?.id || props.index}`)

function emitFocus() {
  emit('focus')
}

function handleRun() {
  emitFocus()
  emit('run')
}

function togglePreview() {
  emitFocus()
  emit('toggle-preview')
}

function toggleCollapse() {
  emitFocus()
  emit('toggle-collapse')
}

function scrollToContent() {
  emitFocus()
  if (props.collapsed) return
  nextTick(() => {
    bodyRef.value?.scrollIntoView?.({
      block: 'start',
      inline: 'nearest',
      behavior: 'smooth'
    })
  })
}

function handleAddAfter(type) {
  emitFocus()
  emit('add-after', type)
}

function handleMoveUp() {
  emitFocus()
  emit('move-up')
}

function handleMoveDown() {
  emitFocus()
  emit('move-down')
}

function handleDelete() {
  emitFocus()
  emit('delete')
}

function focusEditor() {
  if (!props.contentActive) {
    pendingFocus.value = true
    return
  }
  if (props.collapsed || props.previewing) return
  editorRef.value?.focus?.()
}

function measureContentHeight() {
  const element = contentRef.value
  if (!(element instanceof HTMLElement)) return
  const nextHeight = Math.max(88, Math.ceil(element.offsetHeight || 0))
  if (nextHeight) contentHeight.value = nextHeight
}

watch(() => props.contentActive, (value) => {
  if (!value || props.collapsed) return
  nextTick(() => {
    measureContentHeight()
    if (pendingFocus.value && !props.previewing) {
      pendingFocus.value = false
      editorRef.value?.focus?.()
    }
  })
}, { immediate: true })

watch(() => [props.previewing, props.collapsed, props.contentActive], () => {
  if (!props.contentActive || props.collapsed) return
  nextTick(() => measureContentHeight())
})

defineExpose({
  focusEditor,
  getHeaderElement: () => headerRef.value,
  getRootElement: () => rootRef.value,
  scrollToContent
})
</script>

<style scoped>
.notebook-cell {
  position: relative;
  overflow: visible;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.notebook-cell.is-selected {
  border-color: rgba(14, 165, 233, 0.55);
  box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.18);
}

.notebook-cell.is-dark {
  background: rgba(15, 23, 42, 0.84);
  border-color: rgba(71, 85, 105, 0.5);
}

.notebook-cell.is-dark.is-selected {
  border-color: rgba(56, 189, 248, 0.66);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.2);
}

.notebook-cell.is-selected,
.notebook-cell:focus-within,
.notebook-cell:hover {
  z-index: 24;
}

.notebook-cell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.96);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
}

.notebook-cell__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: rgba(51, 65, 85, 0.92);
}

.notebook-cell.is-dark .notebook-cell__title {
  color: rgba(226, 232, 240, 0.9);
}

.notebook-cell.is-dark .notebook-cell__header {
  background: rgba(15, 23, 42, 0.97);
}

.notebook-cell__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.notebook-cell__body {
  padding: 10px 12px 12px;
  scroll-margin-top: 24px;
}

.notebook-cell__preview {
  min-height: 72px;
  outline: none;
  overscroll-behavior: contain;
}

.notebook-cell__preview :deep(.markdown-preview-renderer),
.notebook-cell__preview :deep(.md-editor),
.notebook-cell__preview :deep(.md-editor-content),
.notebook-cell__preview :deep(.md-editor-preview-wrapper),
.notebook-cell__preview :deep(.md-editor-preview) {
  overscroll-behavior: contain;
}

.notebook-cell__content-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 10px 12px 12px;
  border: 1px dashed rgba(148, 163, 184, 0.24);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.56);
  color: rgba(100, 116, 139, 0.92);
}

.notebook-cell__content-placeholder-text {
  font-size: 12px;
}

.notebook-cell.is-dark .notebook-cell__content-placeholder {
  border-color: rgba(71, 85, 105, 0.56);
  background: rgba(15, 23, 42, 0.54);
  color: rgba(148, 163, 184, 0.9);
}

@media (max-width: 760px) {
  .notebook-cell__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .notebook-cell__actions {
    justify-content: flex-start;
  }
}
</style>
