<template>
  <pre
    v-if="!runtimeReady"
    class="lazy-markdown-preview__fallback"
    aria-busy="true"
  >{{ props.modelValue }}</pre>
  <component :is="MarkdownPreviewRenderer" v-else v-bind="props" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { ensureMarkdownPreviewRuntime } from '@/utils/mdEditorRuntime'

const runtimeReady = ref(false)
const MarkdownPreviewRenderer = shallowRef(null)
let disposed = false

const props = defineProps({
  editorId: {
    type: String,
    default: ''
  },
  modelValue: {
    type: String,
    default: ''
  },
  filePath: {
    type: String,
    default: ''
  },
  previewTheme: {
    type: String,
    default: 'github'
  },
  theme: {
    type: String,
    default: 'light'
  },
  codeTheme: {
    type: String,
    default: ''
  },
  codeFoldable: {
    type: Boolean,
    default: true
  },
  autoFoldThreshold: {
    type: Number,
    default: 30
  },
  streaming: {
    type: Boolean,
    default: false
  },
  streamThrottleMs: {
    type: Number,
    default: 0
  },
  deferBlockLayout: {
    type: Boolean,
    default: true
  }
})

onMounted(() => {
  void Promise.all([
    ensureMarkdownPreviewRuntime(),
    import('./MarkdownPreviewRenderer.vue')
  ])
    .then(([, rendererModule]) => {
      if (disposed) return
      MarkdownPreviewRenderer.value = rendererModule.default
      runtimeReady.value = true
    })
    .catch((err) => {
      console.warn('[markdown preview] runtime load failed:', err)
    })
})

onBeforeUnmount(() => {
  disposed = true
})
</script>

<style scoped>
.lazy-markdown-preview__fallback {
  min-height: 1.5em;
  margin: 0;
  overflow: hidden;
  color: inherit;
  font: inherit;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  contain: layout paint;
}
</style>
