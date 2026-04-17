<template>
  <div ref="previewHostRef" :class="['markdown-preview-renderer', { 'is-streaming': streaming }]">
    <MdPreview
      :editor-id="editorId"
      :model-value="renderedModelValue"
      :preview-theme="previewTheme"
      :theme="theme"
      :code-theme="codeTheme"
      :code-foldable="codeFoldable"
      :auto-fold-threshold="autoFoldThreshold"
    />
  </div>
</template>

<script setup>
import path from 'path-browserify'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { MdPreview } from 'md-editor-v3'
import { createMarkdownDiagramDecorator } from '@/utils/markdownDiagramDecorator'
import {
  getCachedFileBlobUrlSync,
  getFileBlobUrl
} from '@/utils/fileOperations'
import {
  safeDecodeURIComponent,
  sanitizeSubPathUnderRoot,
  stripUrlHashAndQuery,
  toPosixPath
} from '@/utils/notePathUtils'

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
  }
})

const message = useMessage()
const previewHostRef = ref(null)
const renderedModelValue = ref(String(props.modelValue || ''))
const diagramDecorator = createMarkdownDiagramDecorator({
  message,
  getTheme: () => props.theme,
  getMarkdownSource: () => renderedModelValue.value
})

let decorateTimer = null
let previewObserver = null
let previewRoot = null
let previewObserverSuspended = false
let previewImageToken = 0
let streamingSyncTimer = null
const DIAGRAM_HOST_SELECTOR = 'div.md-editor-echarts, div.md-editor-mermaid, p.md-editor-mermaid'
const effectiveStreamThrottleMs = computed(() => {
  const value = Number(props.streamThrottleMs)
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
})

function getPreviewRoot() {
  return previewHostRef.value?.querySelector?.('.md-editor-preview') || null
}

function isProbablyExternalSrc(src) {
  const s = String(src || '')
  if (!s) return true
  if (s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('file:')) return true
  if (s.startsWith('http://') || s.startsWith('https://')) return true
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return true
  return false
}

function preparePreviewImages(root) {
  if (!root) return

  const images = Array.from(root.querySelectorAll('img'))
  if (!images.length) return

  let index = 0
  const step = () => {
    const end = Math.min(index + 12, images.length)
    for (; index < end; index += 1) {
      const img = images[index]
      if (img.dataset.aiToolsPreviewImagePrepared === 'true') continue
      img.loading = 'lazy'
      img.decoding = 'async'
      img.setAttribute('fetchpriority', 'low')
      img.dataset.aiToolsPreviewImagePrepared = 'true'
    }

    if (index < images.length) {
      const schedule = window?.requestIdleCallback || ((cb) => window.setTimeout(cb, 0))
      schedule(step)
    }
  }

  step()
}

function clearDecorateTimer() {
  if (!decorateTimer) return
  clearTimeout(decorateTimer)
  decorateTimer = null
}

function clearStreamingSyncTimer() {
  if (!streamingSyncTimer) return
  clearTimeout(streamingSyncTimer)
  streamingSyncTimer = null
}

function cleanupPreviewObserver() {
  if (!previewObserver) {
    previewRoot = null
    previewObserverSuspended = false
    return
  }
  previewObserver.disconnect()
  previewObserver = null
  previewRoot = null
  previewObserverSuspended = false
}

function nodeContainsDiagramHost(node) {
  if (!(node instanceof Element)) return false
  if (node.matches(DIAGRAM_HOST_SELECTOR)) return true
  return !!node.querySelector?.(DIAGRAM_HOST_SELECTOR)
}

function mutationNeedsDecorate(mutations = []) {
  return mutations.some((mutation) => {
    if (mutation.target instanceof Element && mutation.target.closest('.note-preview-diagram-actions')) {
      return false
    }

    if (nodeContainsDiagramHost(mutation.target)) return true
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => nodeContainsDiagramHost(node))
  })
}

function ensurePreviewObserver(root) {
  if (!root) return
  if (previewRoot === root && previewObserver) return

  cleanupPreviewObserver()
  previewRoot = root
  previewObserver = new MutationObserver((mutations) => {
    if (previewObserverSuspended) return
    if (!mutationNeedsDecorate(mutations)) return
    scheduleDecorate()
  })
  previewObserver.observe(root, {
    childList: true,
    subtree: true
  })
}

async function resolvePreviewImages(root) {
  if (!root || !props.filePath) return
  const currentToken = ++previewImageToken
  const images = Array.from(root.querySelectorAll('img'))

  for (const img of images) {
    const src = String(img.getAttribute('src') || '').trim()
    if (!src) continue

    if (isProbablyExternalSrc(src)) continue

    const decodedSrc = safeDecodeURIComponent(stripUrlHashAndQuery(src))
    const baseDir = toPosixPath(path.dirname(props.filePath))
    let resolvedRel = ''
    if (decodedSrc.startsWith('/')) {
      const rel = sanitizeSubPathUnderRoot(decodedSrc)
      if (!rel) continue
      resolvedRel = `note/${rel}`
    } else {
      const joined = toPosixPath(path.join(baseDir, decodedSrc))
      if (!joined.startsWith('note/')) continue
      resolvedRel = joined
    }

    const cached = getCachedFileBlobUrlSync(resolvedRel)
    if (cached) {
      img.src = cached
      continue
    }

    try {
      const blobUrl = await getFileBlobUrl(resolvedRel)
      if (currentToken !== previewImageToken) return
      if (blobUrl) img.src = blobUrl
    } catch {
      // ignore preview image resolution failure
    }
  }
}

function decorateNow() {
  const root = getPreviewRoot()
  if (!root) {
    cleanupPreviewObserver()
    return
  }

  ensurePreviewObserver(root)
  preparePreviewImages(root)
  void resolvePreviewImages(root)
  previewObserverSuspended = true
  previewObserver?.disconnect()
  try {
    diagramDecorator.decorate(root)
  } finally {
    previewObserverSuspended = false
    if (previewObserver && previewRoot === root) {
      previewObserver.observe(root, {
        childList: true,
        subtree: true
      })
    }
  }
}

function scheduleDecorate() {
  if (decorateTimer) return
  decorateTimer = window.setTimeout(() => {
    decorateTimer = null
    nextTick(() => {
      const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16))
      raf(() => {
        decorateNow()
      })
    })
  }, 48)
}

function syncRenderedModelValueImmediately() {
  clearStreamingSyncTimer()
  renderedModelValue.value = String(props.modelValue || '')
}

function scheduleRenderedModelValueSync() {
  if (!props.streaming || effectiveStreamThrottleMs.value <= 0) {
    syncRenderedModelValueImmediately()
    return
  }
  if (streamingSyncTimer) return
  streamingSyncTimer = window.setTimeout(() => {
    streamingSyncTimer = null
    renderedModelValue.value = String(props.modelValue || '')
  }, effectiveStreamThrottleMs.value)
}

watch(
  () => props.modelValue,
  () => {
    scheduleRenderedModelValueSync()
  },
  { immediate: true }
)

watch(
  () => props.streaming,
  (streaming) => {
    if (!streaming) syncRenderedModelValueImmediately()
  }
)

watch(
  () => [renderedModelValue.value, props.theme, props.codeTheme, props.filePath],
  () => {
    scheduleDecorate()
  },
  { immediate: true }
)

onMounted(() => {
  scheduleDecorate()
})

onBeforeUnmount(() => {
  clearDecorateTimer()
  clearStreamingSyncTimer()
  cleanupPreviewObserver()
  diagramDecorator.dispose()
})
</script>

<style scoped>
.markdown-preview-renderer :deep(.md-editor-preview img) {
  display: block;
  max-width: 100%;
  height: auto;
  contain: paint;
}

.markdown-preview-renderer :deep(.md-editor-preview pre),
.markdown-preview-renderer :deep(.md-editor-preview table),
.markdown-preview-renderer :deep(.md-editor-preview blockquote),
.markdown-preview-renderer :deep(.md-editor-preview .note-preview-diagram),
.markdown-preview-renderer :deep(.md-editor-preview img) {
  content-visibility: auto;
  contain-intrinsic-size: auto 280px;
}

.markdown-preview-renderer.is-streaming :deep(.md-editor-preview pre) {
  content-visibility: visible;
  contain: none;
  contain-intrinsic-size: none;
}
</style>
