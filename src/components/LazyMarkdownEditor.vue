<template>
  <MarkdownEditorRenderer
    ref="rendererRef"
    v-bind="attrs"
    :model-value="modelValue"
    :editor-id="editorId"
    :preview-theme="previewTheme"
    :theme="theme"
    :toolbars-exclude="toolbarsExclude"
    @update:model-value="emit('update:modelValue', $event)"
    @on-upload-img="handleUploadImg"
    @on-html-changed="handleHtmlChanged"
    @on-get-catalog="handleGetCatalog"
  />
</template>

<script setup>
import { defineAsyncComponent, ref, useAttrs } from 'vue'
import { ensureMarkdownEditorRuntime } from '@/utils/mdEditorRuntime'
import MarkdownEditorLoading from './MarkdownEditorLoading.vue'

const MarkdownEditorRenderer = defineAsyncComponent({
  loader: async () => {
    await ensureMarkdownEditorRuntime()
    return import('./MarkdownEditorRenderer.vue')
  },
  loadingComponent: MarkdownEditorLoading,
  delay: 0,
  suspensible: false
})

defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  editorId: {
    type: String,
    default: undefined
  },
  previewTheme: {
    type: String,
    default: 'github'
  },
  theme: {
    type: String,
    default: 'light'
  },
  toolbarsExclude: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'on-upload-img', 'on-html-changed', 'on-get-catalog'])
const attrs = useAttrs()
const rendererRef = ref(null)

function handleUploadImg(...args) {
  emit('on-upload-img', ...args)
}

function handleHtmlChanged(...args) {
  emit('on-html-changed', ...args)
}

function handleGetCatalog(...args) {
  emit('on-get-catalog', ...args)
}

defineExpose({
  insert: (...args) => rendererRef.value?.insert?.(...args),
  togglePreviewOnly: (...args) => rendererRef.value?.togglePreviewOnly?.(...args),
  rerender: (...args) => rendererRef.value?.rerender?.(...args),
  getSelectedText: (...args) => rendererRef.value?.getSelectedText?.(...args)
})
</script>
