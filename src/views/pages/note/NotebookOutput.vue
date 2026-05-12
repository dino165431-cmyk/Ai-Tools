<template>
  <div :class="['notebook-output', { 'is-dark': theme === 'dark' }]">
    <template v-for="(item, index) in displayOutputs" :key="getOutputKey(item, index)">
      <div class="notebook-output__block notebook-output__block--terminal" v-if="item.output_type === 'stream'">
        <div class="notebook-output__terminal-row">
          <span class="notebook-output__terminal-tag">{{ item.name || 'stdout' }}</span>
          <div
            :ref="(element) => setTerminalBodyRef(getOutputKey(item, index), element)"
            class="notebook-output__terminal-body"
            @scroll="handleTerminalBodyScroll(getOutputKey(item, index), $event)"
          >
            <pre
              :ref="(element) => setTerminalContentRef(getOutputKey(item, index), element)"
              class="notebook-output__terminal-pre"
            ><span v-for="(segment, segmentIndex) in renderAnsiTextSegments(item.text)" :key="segmentIndex" :style="segment.style">{{ segment.text }}</span></pre>
          </div>
        </div>
      </div>

      <div class="notebook-output__block notebook-output__block--terminal notebook-output__block--error" v-else-if="item.output_type === 'error'">
        <div class="notebook-output__terminal-summary">
          <span class="notebook-output__terminal-tag is-error">{{ item.ename || 'Error' }}</span>
          <span class="notebook-output__terminal-summary-text">{{ item.evalue || '执行失败' }}</span>
        </div>
        <details v-if="hasTraceback(item)" open class="notebook-output__traceback">
          <summary>Traceback</summary>
          <div
            :ref="(element) => setTerminalBodyRef(getOutputKey(item, index), element)"
            class="notebook-output__terminal-body"
            @scroll="handleTerminalBodyScroll(getOutputKey(item, index), $event)"
          >
            <pre
              :ref="(element) => setTerminalContentRef(getOutputKey(item, index), element)"
              class="notebook-output__terminal-pre"
            ><span v-for="(segment, segmentIndex) in renderAnsiTextSegments(formatTraceback(item))" :key="segmentIndex" :style="segment.style">{{ segment.text }}</span></pre>
          </div>
        </details>
      </div>

      <div v-else-if="item.output_type === 'display_data' || item.output_type === 'execute_result'">
        <div
          v-if="resolveMarkdownOutput(item) || resolveHtmlOutput(item) || resolveImageOutput(item)"
          class="notebook-output__block notebook-output__block--rich"
        >
          <div class="notebook-output__meta">
            {{ item.output_type === 'execute_result' ? '结果' : '展示' }}
            <span v-if="item.execution_count != null"> · In [{{ item.execution_count }}]</span>
          </div>

          <div class="notebook-output__rich-body">
            <div v-if="resolveMarkdownOutput(item)" class="notebook-output__markdown">
              <LazyMarkdownPreview
                :editor-id="`${previewIdBase}-${index}-md`"
                :model-value="resolveMarkdownOutput(item)"
                preview-theme="github"
                :theme="theme"
              />
            </div>

            <div
              v-else-if="resolveHtmlOutput(item)"
              class="notebook-output__html markdown-body"
              v-html="resolveHtmlOutput(item)"
            />

            <img
              v-else-if="resolveImageOutput(item)"
              class="notebook-output__image"
              :src="resolveImageOutput(item)"
              alt="Notebook output"
            />
          </div>
        </div>

        <div v-else class="notebook-output__block notebook-output__block--terminal">
          <div class="notebook-output__terminal-row">
            <span class="notebook-output__terminal-tag">{{ item.output_type === 'execute_result' ? 'result' : 'output' }}</span>
            <div
              :ref="(element) => setTerminalBodyRef(getOutputKey(item, index), element)"
              class="notebook-output__terminal-body"
              @scroll="handleTerminalBodyScroll(getOutputKey(item, index), $event)"
            >
              <pre
                :ref="(element) => setTerminalContentRef(getOutputKey(item, index), element)"
                class="notebook-output__terminal-pre"
              ><span v-for="(segment, segmentIndex) in renderAnsiTextSegments(resolvePlainTextOutput(item) || resolveJsonOutput(item))" :key="segmentIndex" :style="segment.style">{{ segment.text }}</span></pre>
            </div>
          </div>
        </div>
      </div>

      <div class="notebook-output__block notebook-output__block--terminal" v-else>
        <div class="notebook-output__terminal-row">
          <span class="notebook-output__terminal-tag">{{ item.output_type || 'output' }}</span>
          <div
            :ref="(element) => setTerminalBodyRef(getOutputKey(item, index), element)"
            class="notebook-output__terminal-body"
            @scroll="handleTerminalBodyScroll(getOutputKey(item, index), $event)"
          >
            <pre
              :ref="(element) => setTerminalContentRef(getOutputKey(item, index), element)"
              class="notebook-output__terminal-pre"
            ><span v-for="(segment, segmentIndex) in renderAnsiTextSegments(stringifyOutput(item))" :key="segmentIndex" :style="segment.style">{{ segment.text }}</span></pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'
import { parseAnsiTextSegments } from '@/utils/ansiText'
import { isScrollPositionNearBottom, mergeNotebookStreamOutputs } from '@/utils/notebookRuntimeDisplay'
import { sanitizeHtml } from '@/utils/sanitizeHtml'

const props = defineProps({
  outputs: {
    type: Array,
    default: () => []
  },
  previewIdBase: {
    type: String,
    default: 'notebook-output'
  },
  theme: {
    type: String,
    default: 'light'
  }
})

const normalizedOutputs = computed(() => (Array.isArray(props.outputs) ? props.outputs : []))
const displayOutputs = computed(() => mergeNotebookStreamOutputs(normalizedOutputs.value))
// Keep each terminal block following the tail unless the user scrolls away manually.
const terminalBodyStateByKey = new Map()
const terminalContentStateByElement = new WeakMap()
let terminalContentResizeObserver = null

function renderAnsiTextSegments(text) {
  return parseAnsiTextSegments(text)
}

function getOutputKey(output, index) {
  const outputType = String(output?.output_type || 'output').trim() || 'output'
  const outputName = String(output?.name || '').trim()
  return outputName ? `${outputType}-${index}-${outputName}` : `${outputType}-${index}`
}

function getTerminalBodyState(key) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return null

  let state = terminalBodyStateByKey.get(normalizedKey)
  if (!state) {
    state = {
      key: normalizedKey,
      bodyElement: null,
      contentElement: null,
      followTail: true
    }
    terminalBodyStateByKey.set(normalizedKey, state)
  }
  return state
}

function cleanupTerminalBodyStateIfEmpty(state) {
  if (!state?.key) return
  if (state.bodyElement || state.contentElement) return
  terminalBodyStateByKey.delete(state.key)
}

function ensureTerminalContentResizeObserver() {
  if (terminalContentResizeObserver || typeof ResizeObserver === 'undefined') return
  terminalContentResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const target = entry?.target
      if (!(target instanceof HTMLElement)) return
      const state = terminalContentStateByElement.get(target)
      if (!state?.followTail) return
      scrollTerminalBodyToBottom(state.bodyElement)
    })
  })
}

function scrollTerminalBodyToBottom(element) {
  if (!(element instanceof HTMLElement)) return
  const nextTop = Math.max(0, element.scrollHeight - element.clientHeight)
  if (Math.abs(element.scrollTop - nextTop) <= 1) return
  element.scrollTo({
    top: nextTop,
    behavior: 'auto'
  })
}

function syncTerminalStateToBottom(state) {
  if (!state) return
  state.followTail = true
  scrollTerminalBodyToBottom(state.bodyElement)
}

function syncAllTerminalBodiesToBottom() {
  terminalBodyStateByKey.forEach((state) => {
    if (state.followTail) {
      scrollTerminalBodyToBottom(state.bodyElement)
    }
  })
}

function setTerminalBodyRef(key, element) {
  const state = getTerminalBodyState(key)
  if (!state) return
  state.bodyElement = element instanceof HTMLElement ? element : null
  if (!state.bodyElement) {
    cleanupTerminalBodyStateIfEmpty(state)
    return
  }

  if (state.followTail) {
    scrollTerminalBodyToBottom(state.bodyElement)
  }
}

function setTerminalContentRef(key, element) {
  const state = getTerminalBodyState(key)
  if (!state) return

  const previousElement = state.contentElement
  if (previousElement && previousElement !== element && terminalContentResizeObserver) {
    try {
      terminalContentResizeObserver.unobserve(previousElement)
    } catch {
      // ignore
    }
  }
  if (previousElement && previousElement !== element) {
    terminalContentStateByElement.delete(previousElement)
  }

  state.contentElement = element instanceof HTMLElement ? element : null
  if (!state.contentElement) {
    cleanupTerminalBodyStateIfEmpty(state)
    return
  }

  ensureTerminalContentResizeObserver()
  terminalContentStateByElement.set(state.contentElement, state)
  terminalContentResizeObserver?.observe(state.contentElement)

  if (state.followTail) {
    scrollTerminalBodyToBottom(state.bodyElement)
  }
}

function forceScrollAllTerminalBodiesToBottom() {
  void nextTick(() => {
    terminalBodyStateByKey.forEach((state) => {
      syncTerminalStateToBottom(state)
    })
  })
}

function handleTerminalBodyScroll(key, event) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return
  const state = terminalBodyStateByKey.get(normalizedKey)
  const element = event?.currentTarget instanceof HTMLElement ? event.currentTarget : state?.bodyElement
  if (!(element instanceof HTMLElement) || !state) return
  state.followTail = isScrollPositionNearBottom({
    scrollTop: element.scrollTop,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }, 24)
}

watch(displayOutputs, () => {
  syncAllTerminalBodiesToBottom()
}, { deep: true, immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  if (terminalContentResizeObserver) {
    try {
      terminalContentResizeObserver.disconnect()
    } catch {
      // ignore
    }
  }
  terminalContentResizeObserver = null
  terminalBodyStateByKey.clear()
})

defineExpose({
  forceScrollAllTerminalBodiesToBottom
})

function hasTraceback(output) {
  return Array.isArray(output?.traceback) && output.traceback.some((line) => String(line || '').trim())
}

function resolvePlainTextOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['text/plain'] === 'string') return data['text/plain']
  if (Array.isArray(data['text/plain'])) return data['text/plain'].join('')
  return ''
}

function resolveMarkdownOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['text/markdown'] === 'string') return data['text/markdown']
  if (Array.isArray(data['text/markdown'])) return data['text/markdown'].join('')
  return ''
}

function resolveHtmlOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['text/html'] === 'string') return sanitizeHtml(data['text/html'])
  if (Array.isArray(data['text/html'])) return sanitizeHtml(data['text/html'].join(''))
  return ''
}

function resolveImageOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['image/png'] === 'string') return `data:image/png;base64,${data['image/png']}`
  if (typeof data['image/jpeg'] === 'string') return `data:image/jpeg;base64,${data['image/jpeg']}`
  if (typeof data['image/gif'] === 'string') return `data:image/gif;base64,${data['image/gif']}`
  if (typeof data['image/svg+xml'] === 'string') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data['image/svg+xml'])}`
  }
  return ''
}

function resolveJsonOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  const value = data['application/json']
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function stringifyOutput(output) {
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output ?? '')
  }
}

function formatTraceback(output) {
  if (Array.isArray(output?.traceback) && output.traceback.length) {
    return output.traceback.join('\n')
  }
  return [output?.ename, output?.evalue].filter(Boolean).join(': ')
}
</script>

<style scoped>
.notebook-output {
  display: flex;
  flex-direction: column;
  gap: 6px;
  --notebook-ansi-black: #111827;
  --notebook-ansi-red: #b42318;
  --notebook-ansi-green: #067647;
  --notebook-ansi-yellow: #a16207;
  --notebook-ansi-blue: #1d4ed8;
  --notebook-ansi-magenta: #9333ea;
  --notebook-ansi-cyan: #0e7490;
  --notebook-ansi-white: #475569;
  --notebook-ansi-bright-black: #6b7280;
  --notebook-ansi-bright-red: #dc2626;
  --notebook-ansi-bright-green: #16a34a;
  --notebook-ansi-bright-yellow: #d97706;
  --notebook-ansi-bright-blue: #2563eb;
  --notebook-ansi-bright-magenta: #a855f7;
  --notebook-ansi-bright-cyan: #0891b2;
  --notebook-ansi-bright-white: #0f172a;
}

.notebook-output__block {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.9);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.notebook-output__block--terminal {
  padding: 8px 10px;
  background: rgba(241, 245, 249, 0.84);
}

.notebook-output__block--error {
  border-color: rgba(248, 113, 113, 0.34);
  background: rgba(255, 247, 247, 0.92);
}

.notebook-output__meta {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  font-size: 12px;
  font-weight: 600;
  color: rgba(51, 65, 85, 0.92);
  background: rgba(255, 255, 255, 0.44);
}

.notebook-output__terminal-row,
.notebook-output__terminal-summary {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.notebook-output__terminal-tag {
  flex: 0 0 72px;
  box-sizing: border-box;
  padding: 2px 8px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: rgba(29, 78, 216, 0.96);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  text-transform: lowercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notebook-output__terminal-tag.is-error {
  border-color: rgba(220, 38, 38, 0.22);
  background: rgba(220, 38, 38, 0.08);
  color: rgba(185, 28, 28, 0.95);
}

.notebook-output__terminal-summary-text {
  min-width: 0;
  padding-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(15, 23, 42, 0.92);
  word-break: break-word;
}

.notebook-output__terminal-body {
  flex: 1;
  min-width: 0;
  max-height: clamp(120px, 18vh, 180px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.notebook-output__terminal-pre {
  margin: 0;
  padding: 0;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(15, 23, 42, 0.92);
}

.notebook-output__traceback {
  margin-top: 8px;
}

.notebook-output__traceback > summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  list-style: none;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(71, 85, 105, 0.88);
  user-select: none;
}

.notebook-output__traceback > summary::-webkit-details-marker {
  display: none;
}

.notebook-output__scroll,
.notebook-output__markdown,
.notebook-output__html {
  max-height: clamp(180px, 28vh, 280px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.notebook-output__rich-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notebook-output pre {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  color: rgba(15, 23, 42, 0.92);
}

.notebook-output__html,
.notebook-output__markdown {
  padding: 12px;
}

.notebook-output__html {
  color: rgba(15, 23, 42, 0.92);
  overflow-x: auto;
}

.notebook-output__html :deep(table) {
  width: 100%;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.notebook-output__html :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgba(248, 250, 252, 0.98);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  font-weight: 700;
}

.notebook-output__html :deep(th),
.notebook-output__html :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: left;
  vertical-align: top;
}

.notebook-output__html :deep(tbody tr:nth-child(even)) {
  background: rgba(248, 250, 252, 0.72);
}

.notebook-output__html :deep(tbody tr:hover) {
  background: rgba(224, 231, 255, 0.72);
}

.notebook-output__image {
  display: block;
  max-width: 100%;
  max-height: clamp(240px, 42vh, 420px);
  height: auto;
  padding: 12px;
  box-sizing: border-box;
  object-fit: contain;
}

.notebook-output.is-dark .notebook-output__block {
  border-color: rgba(71, 85, 105, 0.58);
  background: rgba(15, 23, 42, 0.92);
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.06);
}

.notebook-output.is-dark .notebook-output__block--terminal {
  background: rgba(15, 23, 42, 0.84);
}

.notebook-output.is-dark {
  --notebook-ansi-black: #94a3b8;
  --notebook-ansi-red: #f87171;
  --notebook-ansi-green: #4ade80;
  --notebook-ansi-yellow: #facc15;
  --notebook-ansi-blue: #60a5fa;
  --notebook-ansi-magenta: #c084fc;
  --notebook-ansi-cyan: #22d3ee;
  --notebook-ansi-white: #e2e8f0;
  --notebook-ansi-bright-black: #cbd5e1;
  --notebook-ansi-bright-red: #fb7185;
  --notebook-ansi-bright-green: #86efac;
  --notebook-ansi-bright-yellow: #fde047;
  --notebook-ansi-bright-blue: #93c5fd;
  --notebook-ansi-bright-magenta: #e9d5ff;
  --notebook-ansi-bright-cyan: #67e8f9;
  --notebook-ansi-bright-white: #f8fafc;
}

.notebook-output.is-dark .notebook-output__block--error {
  border-color: rgba(248, 113, 113, 0.34);
  background: rgba(69, 10, 10, 0.3);
}

.notebook-output.is-dark .notebook-output__meta {
  color: rgba(226, 232, 240, 0.92);
  border-bottom-color: rgba(71, 85, 105, 0.54);
  background: rgba(30, 41, 59, 0.72);
}

.notebook-output.is-dark .notebook-output__terminal-tag {
  border-color: rgba(56, 189, 248, 0.22);
  background: rgba(56, 189, 248, 0.08);
  color: rgba(186, 230, 253, 0.96);
}

.notebook-output.is-dark .notebook-output__terminal-tag.is-error {
  border-color: rgba(248, 113, 113, 0.22);
  background: rgba(248, 113, 113, 0.1);
  color: rgba(254, 202, 202, 0.98);
}

.notebook-output.is-dark .notebook-output__terminal-summary-text {
  color: rgba(226, 232, 240, 0.94);
}

.notebook-output.is-dark .notebook-output__traceback > summary {
  color: rgba(186, 230, 253, 0.82);
}

.notebook-output.is-dark .notebook-output__terminal-pre {
  color: rgba(226, 232, 240, 0.94);
}

.notebook-output.is-dark pre,
.notebook-output.is-dark .notebook-output__html {
  color: rgba(226, 232, 240, 0.94);
}

.notebook-output.is-dark .notebook-output__scroll,
.notebook-output.is-dark .notebook-output__markdown,
.notebook-output.is-dark .notebook-output__html {
  scrollbar-color: rgba(148, 163, 184, 0.56) rgba(15, 23, 42, 0.72);
}

.notebook-output.is-dark .notebook-output__html :deep(table) {
  border-color: rgba(71, 85, 105, 0.72);
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.34);
}

.notebook-output.is-dark .notebook-output__html :deep(thead th) {
  background: rgba(30, 41, 59, 0.96);
  border-bottom-color: rgba(71, 85, 105, 0.56);
}

.notebook-output.is-dark .notebook-output__html :deep(th),
.notebook-output.is-dark .notebook-output__html :deep(td) {
  border-bottom-color: rgba(71, 85, 105, 0.34);
}

.notebook-output.is-dark .notebook-output__html :deep(tbody tr:nth-child(even)) {
  background: rgba(30, 41, 59, 0.58);
}

.notebook-output.is-dark .notebook-output__html :deep(tbody tr:hover) {
  background: rgba(15, 118, 110, 0.24);
}
</style>
