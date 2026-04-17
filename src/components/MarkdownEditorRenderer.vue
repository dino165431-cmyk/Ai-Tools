<template>
  <MdEditor
    ref="editorRef"
    :model-value="modelValue"
    :editor-id="editorId"
    :preview-theme="previewTheme"
    :theme="theme"
    :toolbars="toolbars"
    :toolbars-exclude="toolbarsExclude"
    @update:model-value="emit('update:modelValue', $event)"
    @on-upload-img="handleUploadImg"
    @on-html-changed="handleHtmlChanged"
    @on-get-catalog="handleGetCatalog"
  >
    <template #defToolbars>
      <NoteDiagramToolbar
        v-for="root in toolbarRoots"
        :key="root.id"
        :root-id="root.id"
        :insert-snippet="insertSnippet"
        :get-selected-text="getSelectedText"
      />
    </template>
  </MdEditor>
</template>

<script setup>
import { computed, ref } from 'vue'
import { MdEditor, allToolbar } from 'md-editor-v3'
import NoteDiagramToolbar from './NoteDiagramToolbar.vue'
import { getNoteConfig } from '@/utils/configListener'
import { buildNoteTemplateView } from '@/utils/noteTemplateConfig'

const props = defineProps({
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
const editorRef = ref(null)
const noteConfig = getNoteConfig()
const toolbarRoots = computed(() => buildNoteTemplateView(noteConfig.value).roots)
const toolbarIndices = computed(() => toolbarRoots.value.map((_, index) => index))

const toolbars = computed(() =>
  allToolbar.flatMap((item) => {
    if (item === 'mermaid') return toolbarIndices.value
    if (item === 'katex') return []
    return [item]
  })
)

function handleUploadImg(...args) {
  emit('on-upload-img', ...args)
}

function handleHtmlChanged(...args) {
  emit('on-html-changed', ...args)
}

function handleGetCatalog(...args) {
  emit('on-get-catalog', ...args)
}

function insertSnippet(payload) {
  if (typeof payload === 'function') {
    editorRef.value?.insert?.(payload)
    return
  }

  if (payload && typeof payload === 'object' && typeof payload.targetValue === 'string') {
    editorRef.value?.insert?.(() => ({
      select: false,
      deviationStart: 0,
      deviationEnd: 0,
      ...payload
    }))
    return
  }

  const targetValue = String(payload || '')
  if (!targetValue) return

  editorRef.value?.insert?.(() => ({
    targetValue,
    select: false,
    deviationStart: 0,
    deviationEnd: 0
  }))
}

function getSelectedText() {
  return editorRef.value?.getSelectedText?.() || ''
}

defineExpose({
  insert: (...args) => editorRef.value?.insert?.(...args),
  togglePreviewOnly: (...args) => editorRef.value?.togglePreviewOnly?.(...args),
  rerender: (...args) => editorRef.value?.rerender?.(...args),
  getSelectedText
})
</script>
