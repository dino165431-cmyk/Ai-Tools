<template>
  <div ref="rootRef" :class="['notebook-markdown-editor', { 'is-dark': theme === 'dark' }]">
    <LazyMarkdownEditor
      ref="editorRef"
      :model-value="modelValue"
      :editor-id="editorId"
      preview-theme="github"
      :theme="theme"
      :toolbars="[]"
      :toolbars-exclude="allToolbars"
      :footers="[]"
      :preview="false"
      :html-preview="false"
      :scroll-auto="false"
      :input-box-width="'100%'"
      :show-toolbar-name="false"
      :auto-focus="false"
      :completions="markdownCompletions"
      placeholder="输入 Markdown，支持图片粘贴、表格、Mermaid、ECharts、公式等内容"
      @update:model-value="emit('update:modelValue', $event)"
      @on-upload-img="handleEditorUpload"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { allToolbar } from 'md-editor-v3'
import { useMessage } from 'naive-ui'
import LazyMarkdownEditor from '@/components/LazyMarkdownEditor.vue'
import { createMarkdownCompletionSource } from '@/utils/editorCompletion'
import { buildNoteAssetsStorage, buildUploadedImageAlt, resolveImageExtension } from '@/utils/noteImageUpload'
import { createDirectory, exists, getFileBlobUrl, writeFile } from '@/utils/fileOperations'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  filePath: {
    type: String,
    default: ''
  },
  theme: {
    type: String,
    default: 'light'
  }
})

const emit = defineEmits(['update:modelValue', 'focus'])

const message = useMessage()
const rootRef = ref(null)
const editorRef = ref(null)
const editorId = `notebook-markdown-editor-${Math.random().toString(36).slice(2, 10)}`
const allToolbars = computed(() => [...allToolbar])
const markdownCompletions = [createMarkdownCompletionSource()]

async function persistUploadedImage(file) {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const extension = resolveImageExtension({
    fileName: file?.name,
    mimeType: file?.type,
    bytes
  })
  const filename = `${timestamp}-${random}.${extension}`
  const storage = buildNoteAssetsStorage(props.filePath, filename)

  if (!storage) {
    throw new Error('当前笔记路径无效，无法保存图片。')
  }

  if (!(await exists(storage.assetsDirRel))) {
    await createDirectory(storage.assetsDirRel)
  }

  await writeFile(storage.imageRelPath, bytes)
  await getFileBlobUrl(storage.imageRelPath).catch(() => null)

  return {
    url: storage.relativeUrl,
    alt: buildUploadedImageAlt({
      fileName: file?.name,
      extension
    }),
    title: ''
  }
}

async function uploadImages(files) {
  const fileList = Array.isArray(files) ? files.filter(Boolean) : []
  if (!fileList.length) return []

  const uploaded = []
  const errors = []

  for (const file of fileList) {
    try {
      uploaded.push(await persistUploadedImage(file))
    } catch (err) {
      errors.push(err)
      console.warn('upload image failed:', err)
    }
  }

  if (!uploaded.length && errors.length) {
    throw errors[0]
  }

  if (errors.length) {
    message.warning(`有 ${errors.length} 张图片上传失败，已跳过。`)
  }

  return uploaded
}

function toEditorUploadPayload(items) {
  return items.map((item) => ({
    url: item.url,
    alt: `${item.alt}#100`,
    title: item.title || ''
  }))
}

async function handleEditorUpload(files, callback) {
  emit('focus')
  if (!props.filePath) {
    message.warning('请先打开一篇超级笔记，再上传图片。')
    callback?.([])
    return
  }

  try {
    const uploaded = await uploadImages(files)
    callback?.(toEditorUploadPayload(uploaded))
  } catch (err) {
    message.error(`上传图片失败：${err?.message || String(err)}`)
    callback?.([])
  }
}

function focus() {
  emit('focus')
  editorRef.value?.focus?.()
  const target = rootRef.value?.querySelector?.('textarea, [contenteditable="true"], .cm-content')
  target?.focus?.()
}

defineExpose({
  focus
})
</script>

<style scoped>
.notebook-markdown-editor {
  border-radius: 12px;
  overflow: visible;
}

.notebook-markdown-editor :deep(.md-editor) {
  border: none;
  background: transparent;
  height: auto !important;
  min-height: 44px;
  overflow: visible !important;
}

.notebook-markdown-editor :deep(.md-editor-toolbar-wrapper),
.notebook-markdown-editor :deep(.md-editor-footer) {
  display: none;
}

.notebook-markdown-editor :deep(.md-editor-content),
.notebook-markdown-editor :deep(.md-editor-content-wrapper),
.notebook-markdown-editor :deep(.md-editor-custom-scrollbar),
.notebook-markdown-editor :deep(.md-editor-input),
.notebook-markdown-editor :deep(.md-editor-input-wrapper),
.notebook-markdown-editor :deep(.cm-editor),
.notebook-markdown-editor :deep(.cm-scroller) {
  min-height: 44px;
  height: auto !important;
  overflow: visible !important;
}

.notebook-markdown-editor :deep(.md-editor-custom-scrollbar__track),
.notebook-markdown-editor :deep(.md-editor-custom-scrollbar__thumb) {
  z-index: 5;
}

.notebook-markdown-editor :deep(.cm-editor) {
  background: transparent;
}

.notebook-markdown-editor :deep(.cm-scroller) {
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  line-height: 1.5;
  overflow: visible;
}

.notebook-markdown-editor :deep(.cm-content) {
  padding: 4px 0;
}

.notebook-markdown-editor :deep(.cm-line) {
  padding: 0;
}

.notebook-markdown-editor :deep(.cm-gutters) {
  background: transparent;
  border-right: none;
  color: rgba(100, 116, 139, 0.88);
}

.notebook-markdown-editor.is-dark :deep(.cm-gutters) {
  color: rgba(148, 163, 184, 0.78);
}

.notebook-markdown-editor :deep(.cm-lineNumbers .cm-gutterElement) {
  padding: 0 8px 0 0;
}

.notebook-markdown-editor :deep(.cm-activeLine) {
  background: rgba(37, 99, 235, 0.06);
}

.notebook-markdown-editor.is-dark :deep(.cm-activeLine) {
  background: rgba(56, 189, 248, 0.08);
}

.notebook-markdown-editor :deep(.cm-activeLineGutter) {
  background: transparent;
}

.notebook-markdown-editor :deep(.cm-selectionBackground),
.notebook-markdown-editor :deep(.cm-focused .cm-selectionBackground) {
  background: rgba(59, 130, 246, 0.22);
}

.notebook-markdown-editor.is-dark :deep(.cm-selectionBackground),
.notebook-markdown-editor.is-dark :deep(.cm-focused .cm-selectionBackground) {
  background: rgba(56, 189, 248, 0.24);
}

.notebook-markdown-editor :deep(.cm-tooltip-autocomplete) {
  border: 1px solid rgba(37, 99, 235, 0.22);
  background: rgba(255, 255, 255, 0.995);
  border-radius: 14px;
  overflow: hidden;
  margin-top: 10px;
  margin-left: 10px;
  z-index: 80;
  box-shadow: 0 24px 52px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(10px);
}

.notebook-markdown-editor.is-dark :deep(.cm-tooltip-autocomplete) {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(8, 15, 28, 0.995);
  box-shadow: 0 26px 60px rgba(2, 6, 23, 0.62);
}

.notebook-markdown-editor :deep(.cm-tooltip-autocomplete ul) {
  padding: 4px;
}

.notebook-markdown-editor :deep(.cm-tooltip-autocomplete ul li) {
  border-radius: 10px;
  color: #0f172a;
  background: rgba(248, 250, 252, 0.94);
}

.notebook-markdown-editor.is-dark :deep(.cm-tooltip-autocomplete ul li) {
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.08);
}

.notebook-markdown-editor :deep(.cm-tooltip-autocomplete ul li:hover) {
  background: rgba(239, 246, 255, 0.98);
}

.notebook-markdown-editor.is-dark :deep(.cm-tooltip-autocomplete ul li:hover) {
  background: rgba(30, 41, 59, 0.82);
}

.notebook-markdown-editor :deep(.cm-tooltip-autocomplete ul li[aria-selected]) {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #eff6ff;
}

.notebook-markdown-editor.is-dark :deep(.cm-tooltip-autocomplete ul li[aria-selected]) {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(2, 132, 199, 0.92));
  color: #f8fafc;
}

.notebook-markdown-editor :deep(.cm-completionDetail) {
  color: rgba(51, 65, 85, 0.82);
}

.notebook-markdown-editor.is-dark :deep(.cm-completionDetail) {
  color: rgba(191, 219, 254, 0.92);
}

.notebook-markdown-editor :deep(.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail) {
  color: rgba(239, 246, 255, 0.9);
}

.notebook-markdown-editor :deep(.cm-completionMatchedText) {
  color: #1d4ed8;
  font-weight: 700;
}

.notebook-markdown-editor.is-dark :deep(.cm-completionMatchedText) {
  color: #67e8f9;
}

.notebook-markdown-editor :deep(.md-editor-content),
.notebook-markdown-editor :deep(.md-editor-input) {
  background: transparent;
  padding: 0;
  height: auto !important;
  overflow: visible !important;
}

.notebook-markdown-editor :deep(.md-editor-input-wrapper) {
  padding: 0;
  overflow: visible !important;
}
</style>
