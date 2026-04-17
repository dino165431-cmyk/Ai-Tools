<template>
  <section
    ref="rootRef"
    :data-cell-id="cell.id"
    :class="[
      'notebook-cell',
      'notebook-cell--code',
      { 'is-dark': theme === 'dark', 'is-selected': selected }
    ]"
    @mousedown="emitFocus"
  >
    <header ref="headerRef" class="notebook-cell__header">
      <div class="notebook-cell__title">
        <n-tag size="small" :bordered="false" type="warning">Code</n-tag>
        <span>Cell {{ index + 1 }}</span>
        <span class="notebook-cell__exec">In [{{ executionCountLabel }}]</span>
      </div>

      <div class="notebook-cell__actions">
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button :type="running ? 'warning' : 'primary'" ghost circle size="tiny" @click="handleRunOrStop">
              <template #icon>
                <n-icon><component :is="running ? StopCircleOutline : PlayOutline" /></n-icon>
              </template>
            </n-button>
          </template>
          {{ running ? '停止运行' : '运行（Shift+Enter）' }}</n-tooltip>

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
            <n-button quaternary circle size="tiny" :disabled="!hasOutputArea" @click="scrollToOutput">
              <template #icon>
                <n-icon><ChevronDownOutline /></n-icon>
              </template>
            </n-button>
          </template>
          跳到输出区
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="scrollToCode">
              <template #icon>
                <n-icon><ChevronUpOutline /></n-icon>
              </template>
            </n-button>
          </template>
          回到代码区
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
            <n-button quaternary circle size="tiny" :disabled="!hasOutputs || running" @click="handleClearOutputs">
              <template #icon>
                <n-icon><LayersClearIcon /></n-icon>
              </template>
            </n-button>
          </template>
          清空输出
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" :disabled="index <= 0 || running" @click="handleMoveUp">
              <template #icon>
                <n-icon><ArrowUpOutline /></n-icon>
              </template>
            </n-button>
          </template>
          上移
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" :disabled="index >= cellCount - 1 || running" @click="handleMoveDown">
              <template #icon>
                <n-icon><ArrowDownOutline /></n-icon>
              </template>
            </n-button>
          </template>
          下移
        </n-tooltip>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="tiny" :disabled="running" @click="handleDelete">
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
        <InlineCodeEditor
          ref="editorRef"
          mode="python"
          :model-value="cell.source || ''"
          :theme="theme"
          :min-height="44"
          :python-modules="pythonModules"
          :python-path="pythonPath"
          :workspace-path="workspacePath"
          :document-id="`cell-${cell.id}`"
          :completion-context="completionContext"
          :python-context-cells="pythonContextCells"
          :notebook-magic-options="notebookMagicOptions"
          placeholder="输入可执行代码，支持 %runtime help、%pip install 和上下文补全"
          @focus="emitFocus"
          @update:model-value="$emit('update-source', $event)"
          @python-completion-error="handlePythonCompletionError"
          @go-to-definition="handleGoToDefinition"
        />
      </div>

      <div v-if="hasOutputArea" ref="outputRef" class="notebook-cell__outputs">
        <NotebookOutput :outputs="cell.outputs || []" :preview-id-base="`notebook-output-${cell.id}`" :theme="theme" />
        <div v-if="showRunningPlaceholder" class="notebook-cell__runtime-status">Cell 正在继续执行...</div>
        <div v-if="hasRuntimeInputRequest" class="notebook-cell__stdin">
          <div class="notebook-cell__stdin-meta">
            <span>{{ runtimeInputRequest.password ? '程序正在请求密码输入' : '程序正在请求输入' }}</span>
            <span class="notebook-cell__stdin-hint">输入后会继续当前 Cell 的执行</span>
          </div>
          <div v-if="runtimeInputPromptText" class="notebook-cell__stdin-prompt">{{ runtimeInputPromptText }}</div>
          <div class="notebook-cell__stdin-controls">
            <n-input
              ref="runtimeInputRef"
              v-model:value="runtimeInputValue"
              :type="runtimeInputRequest.password ? 'password' : 'text'"
              :show-password-on="runtimeInputRequest.password ? 'click' : undefined"
              :disabled="runtimeInputRequest.submitting"
              :placeholder="runtimeInputPlaceholder"
              @keydown.enter="submitRuntimeInput"
            />
            <n-button type="primary" :loading="runtimeInputRequest.submitting" :disabled="runtimeInputRequest.submitting" @click="submitRuntimeInput">
              {{ runtimeInputRequest.password ? '发送密码' : '继续执行' }}
            </n-button>
            <n-button :disabled="runtimeInputRequest.submitting" @click="abortRuntimeInput">停止执行</n-button>
          </div>
        </div>
        <div ref="outputTailRef" class="notebook-cell__output-tail" aria-hidden="true"></div>
      </div>
    </div>

    <div v-else-if="!collapsed" class="notebook-cell__content-placeholder" :style="{ height: `${contentHeight}px` }">
      <span class="notebook-cell__content-placeholder-text">滚动到这里时会自动加载内容</span>
    </div>
  </section>
</template>

<script setup>
import path from 'path-browserify'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NIcon, NInput, NTag, NTooltip } from 'naive-ui'
import {
  ArrowDownOutline,
  ArrowUpOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  CodeSlashOutline,
  DocumentTextOutline,
  PlayOutline,
  StopCircleOutline,
  TrashOutline
} from '@vicons/ionicons5'
import InlineCodeEditor from '@/components/InlineCodeEditor.vue'
import NotebookOutput from '../NotebookOutput.vue'
import { CollapseCellIcon, ExpandCellIcon, LayersClearIcon } from './notebookCellIcons'

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
  running: {
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
  theme: {
    type: String,
    default: 'light'
  },
  pythonModules: {
    type: Array,
    default: () => []
  },
  pythonPath: {
    type: String,
    default: ''
  },
  pythonContextCells: {
    type: Array,
    default: () => []
  },
  notebookMagicOptions: {
    type: Array,
    default: () => []
  },
  completionContext: {
    type: String,
    default: ''
  },
  contentActive: {
    type: Boolean,
    default: true
  },
  runtimeInputRequest: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update-source', 'delete', 'move-up', 'move-down', 'add-after', 'run', 'stop', 'clear-outputs', 'focus', 'runtime-error', 'go-to-definition', 'submit-runtime-input', 'abort-runtime-input', 'toggle-collapse'])

const rootRef = ref(null)
const headerRef = ref(null)
const editorRef = ref(null)
const bodyRef = ref(null)
const outputRef = ref(null)
const outputTailRef = ref(null)
const contentRef = ref(null)
const runtimeInputRef = ref(null)
const contentHeight = ref(148)
const hasOutputs = computed(() => Array.isArray(props.cell?.outputs) && props.cell.outputs.length > 0)
const hasRuntimeInputRequest = computed(() => !!String(props.runtimeInputRequest?.requestId || '').trim())
const hasOutputArea = computed(() => hasOutputs.value || hasRuntimeInputRequest.value || props.running)
const pendingFocusCursorOffset = ref(null)
const runtimeInputValue = ref('')
const autoFollowOutput = ref(false)
const activeViewportRef = ref(null)
const showRunningPlaceholder = computed(() => props.running && !hasOutputs.value && !hasRuntimeInputRequest.value)
const workspacePath = computed(() => {
  const filePath = String(props.filePath || '').trim()
  return filePath ? path.dirname(filePath) : ''
})
const executionCountLabel = computed(() => {
  const count = Number(props.cell?.execution_count)
  return Number.isFinite(count) ? String(count) : ' '
})
const runtimeInputPromptText = computed(() => {
  const prompt = String(props.runtimeInputRequest?.prompt || '').trim()
  if (prompt) return prompt
  return props.runtimeInputRequest?.password
    ? '当前代码正在等待一个隐藏输入，例如密码或令牌。'
    : '当前代码正在等待标准输入。'
})
const runtimeInputPlaceholder = computed(() => props.runtimeInputRequest?.password ? '请输入密码、令牌或密钥' : '请输入内容后按回车继续')
let ignoreViewportScrollUntil = 0
let lastViewportScrollTop = 0

function resolveViewportElement() {
  const element = contentRef.value || bodyRef.value || outputRef.value
  return element instanceof HTMLElement ? element.closest('.notebook-editor__body') : null
}

function setAutoFollowOutput(nextValue) {
  autoFollowOutput.value = !!nextValue
}

function measureContentHeight() {
  const element = contentRef.value
  if (!(element instanceof HTMLElement)) return
  const nextHeight = Math.max(96, Math.ceil(element.offsetHeight || 0))
  if (nextHeight) contentHeight.value = nextHeight
}

watch(() => props.contentActive, (value) => {
  if (!value || props.collapsed) return
  nextTick(() => {
    measureContentHeight()
    activeViewportRef.value = resolveViewportElement()
    lastViewportScrollTop = activeViewportRef.value?.scrollTop || 0
    if (pendingFocusCursorOffset.value !== null) {
      const cursorOffset = pendingFocusCursorOffset.value
      pendingFocusCursorOffset.value = null
      editorRef.value?.focus?.(cursorOffset)
    }
  })
}, { immediate: true })

watch(() => [props.collapsed, props.contentActive, hasOutputArea.value, hasRuntimeInputRequest.value], () => {
  if (!props.contentActive || props.collapsed) return
  nextTick(() => measureContentHeight())
})

watch(() => props.cell?.outputs, () => {
  if (!props.contentActive || props.collapsed || !props.running || !hasOutputArea.value) return
  const shouldFollow = autoFollowOutput.value && isElementNearViewportBottom(outputTailRef.value || outputRef.value)
  nextTick(() => {
    measureContentHeight()
    if (shouldFollow) scrollOutputRegionIntoView({ align: 'end', behavior: 'auto' })
  })
}, { deep: true })

watch(() => String(props.runtimeInputRequest?.requestId || ''), (requestId, previousRequestId) => {
  if (requestId === previousRequestId) return
  runtimeInputValue.value = ''
  if (!requestId) return
  nextTick(() => {
    setAutoFollowOutput(true)
    scrollOutputRegionIntoView({ align: 'end' })
    focusRuntimeInput()
    measureContentHeight()
  })
})

watch(() => props.running, (running, wasRunning) => {
  if (running && running !== wasRunning) setAutoFollowOutput(true)
  if (!running || running === wasRunning || !hasOutputArea.value || props.collapsed) return
  nextTick(() => scrollOutputRegionIntoView({ align: 'end' }))
})

watch(() => props.collapsed, (collapsed) => {
  if (collapsed) {
    setAutoFollowOutput(false)
    return
  }
  if (!props.contentActive) return
  nextTick(() => {
    activeViewportRef.value = resolveViewportElement()
    lastViewportScrollTop = activeViewportRef.value?.scrollTop || 0
    measureContentHeight()
  })
})

function emitFocus() {
  emit('focus')
}

function handleRunOrStop() {
  emitFocus()
  emit(props.running ? 'stop' : 'run')
}

function toggleCollapse() {
  emitFocus()
  emit('toggle-collapse')
}

function handleAddAfter(type) {
  emitFocus()
  emit('add-after', type)
}

function handleClearOutputs() {
  emitFocus()
  emit('clear-outputs')
}

function scrollElementIntoView(target, options = {}) {
  const element = target?.value || target
  if (!(element instanceof HTMLElement)) return
  nextTick(() => {
    const viewport = element.closest('.notebook-editor__body')
    if (!(viewport instanceof HTMLElement)) {
      element.scrollIntoView({
        block: options.block || 'start',
        inline: 'nearest',
        behavior: options.behavior || 'smooth'
      })
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const currentScrollTop = viewport.scrollTop
    const elementTop = elementRect.top - viewportRect.top + currentScrollTop
    const elementBottom = elementRect.bottom - viewportRect.top + currentScrollTop
    const topGap = Math.max(24, Number(options.marginTop) || 0)
    const bottomGap = Math.max(24, Number(options.marginBottom) || 0)
    let nextTop = null

    if ((options.block || 'start') === 'nearest') {
      if (elementRect.top < viewportRect.top + topGap) {
        nextTop = elementTop - topGap
      } else if (elementRect.bottom > viewportRect.bottom - bottomGap) {
        nextTop = elementBottom - viewport.clientHeight + bottomGap
      }
    } else if ((options.block || 'start') === 'end') {
      nextTop = elementBottom - viewport.clientHeight + bottomGap
    } else {
      nextTop = elementTop - topGap
    }

    if (nextTop === null) return
    ignoreViewportScrollUntil = Date.now() + 180
    viewport.scrollTo({
      top: Math.max(0, nextTop),
      behavior: options.behavior || 'smooth'
    })
  })
}

function isElementNearViewportBottom(target, threshold = 120) {
  const element = target?.value || target
  if (!(element instanceof HTMLElement)) return false
  const viewport = element.closest('.notebook-editor__body')
  if (!(viewport instanceof HTMLElement)) return true
  const viewportRect = viewport.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return elementRect.bottom <= viewportRect.bottom + Math.max(24, Number(threshold) || 0)
}

function scrollOutputRegionIntoView(options = {}) {
  if (!hasOutputArea.value) return
  const align = options.align === 'start' ? 'start' : 'end'
  const target = align === 'end' ? (outputTailRef.value || outputRef.value) : outputRef.value
  if (!target) return
  if (options.follow !== false) setAutoFollowOutput(true)
  if (!props.contentActive) {
    nextTick(() => scrollElementIntoView(target, {
      block: align === 'end' ? 'end' : 'start',
      behavior: options.behavior || 'smooth'
    }))
    return
  }
  scrollElementIntoView(target, {
    block: align === 'end' ? 'end' : 'start',
    behavior: options.behavior || 'smooth'
  })
}

function scrollToOutput() {
  emitFocus()
  scrollOutputRegionIntoView({ align: 'end' })
}

function scrollToCode() {
  emitFocus()
  setAutoFollowOutput(false)
  if (!props.contentActive) {
    nextTick(() => scrollElementIntoView(bodyRef))
    return
  }
  scrollElementIntoView(bodyRef)
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

function handlePythonCompletionError(err) {
  emit('runtime-error', err)
}

function handleGoToDefinition(payload) {
  emit('go-to-definition', payload)
}

function focusRuntimeInput() {
  if (!props.contentActive || props.collapsed) return
  runtimeInputRef.value?.focus?.()
}

function submitRuntimeInput(event) {
  if (event?.preventDefault) event.preventDefault()
  if (!hasRuntimeInputRequest.value || props.runtimeInputRequest?.submitting) return
  emitFocus()
  emit('submit-runtime-input', { value: runtimeInputValue.value })
}

function abortRuntimeInput() {
  if (!hasRuntimeInputRequest.value || props.runtimeInputRequest?.submitting) return
  emitFocus()
  emit('abort-runtime-input')
}

function focusEditor(cursorOffset = null) {
  if (!props.contentActive) {
    pendingFocusCursorOffset.value = Number.isFinite(Number(cursorOffset)) ? Number(cursorOffset) : null
    return
  }
  if (props.collapsed) return
  editorRef.value?.focus?.(cursorOffset)
}

function handleViewportScroll() {
  const viewport = activeViewportRef.value || resolveViewportElement()
  if (!(viewport instanceof HTMLElement)) return
  const currentTop = viewport.scrollTop
  const delta = currentTop - lastViewportScrollTop
  lastViewportScrollTop = currentTop
  if (Date.now() < ignoreViewportScrollUntil) return
  if (delta < -6) {
    setAutoFollowOutput(false)
    return
  }
  if (delta > 0 && hasOutputArea.value && isElementNearViewportBottom(outputTailRef.value || outputRef.value, 96)) {
    setAutoFollowOutput(true)
  }
}

function handleViewportWheel(event) {
  if (Date.now() < ignoreViewportScrollUntil) return
  if (Number(event?.deltaY) < -1) {
    setAutoFollowOutput(false)
    return
  }
  if (Number(event?.deltaY) > 1 && hasOutputArea.value && isElementNearViewportBottom(outputTailRef.value || outputRef.value, 96)) {
    setAutoFollowOutput(true)
  }
}

watch(activeViewportRef, (viewport, previousViewport) => {
  if (previousViewport instanceof HTMLElement) {
    previousViewport.removeEventListener('scroll', handleViewportScroll)
    previousViewport.removeEventListener('wheel', handleViewportWheel)
  }
  if (viewport instanceof HTMLElement) {
    lastViewportScrollTop = viewport.scrollTop || 0
    viewport.addEventListener('scroll', handleViewportScroll, { passive: true })
    viewport.addEventListener('wheel', handleViewportWheel, { passive: true })
  }
}, { immediate: true })

onBeforeUnmount(() => {
  const viewport = activeViewportRef.value
  if (!(viewport instanceof HTMLElement)) return
  viewport.removeEventListener('scroll', handleViewportScroll)
  viewport.removeEventListener('wheel', handleViewportWheel)
})

defineExpose({
  focusEditor,
  focusRuntimeInput,
  getHeaderElement: () => headerRef.value,
  getRootElement: () => rootRef.value,
  scrollToOutput,
  scrollToCode
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
  border-color: rgba(245, 158, 11, 0.52);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.18);
}

.notebook-cell.is-dark {
  background: rgba(15, 23, 42, 0.84);
  border-color: rgba(71, 85, 105, 0.5);
}

.notebook-cell.is-dark.is-selected {
  border-color: rgba(251, 191, 36, 0.62);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.18);
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

.notebook-cell__exec {
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
}

.notebook-cell__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.notebook-cell__body {
  padding: 10px 12px 12px;
}

.notebook-cell__outputs {
  padding: 0 12px 12px;
  scroll-margin-top: 24px;
}

.notebook-cell__output-tail {
  height: 1px;
}

.notebook-cell__runtime-status {
  margin-top: 10px;
  border: 1px dashed rgba(245, 158, 11, 0.32);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  color: rgba(146, 64, 14, 0.92);
  background: rgba(255, 247, 237, 0.9);
}

.notebook-cell__stdin {
  margin-top: 10px;
  border: 1px solid rgba(14, 165, 233, 0.22);
  border-radius: 14px;
  background: rgba(239, 246, 255, 0.94);
  overflow: hidden;
}

.notebook-cell__stdin-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(14, 165, 233, 0.14);
  background: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-weight: 600;
  color: rgba(12, 74, 110, 0.92);
}

.notebook-cell__stdin-hint {
  font-weight: 400;
  color: rgba(8, 47, 73, 0.72);
}

.notebook-cell__stdin-prompt {
  padding: 10px 12px 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.92);
}

.notebook-cell__stdin-controls {
  display: flex;
  gap: 10px;
  padding: 12px;
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

.notebook-cell.is-dark .notebook-cell__stdin {
  border-color: rgba(56, 189, 248, 0.24);
  background: rgba(8, 47, 73, 0.42);
}

.notebook-cell.is-dark .notebook-cell__runtime-status {
  border-color: rgba(251, 191, 36, 0.3);
  color: rgba(253, 230, 138, 0.96);
  background: rgba(120, 53, 15, 0.35);
}

.notebook-cell.is-dark .notebook-cell__stdin-meta {
  border-bottom-color: rgba(56, 189, 248, 0.16);
  background: rgba(15, 23, 42, 0.62);
  color: rgba(186, 230, 253, 0.95);
}

.notebook-cell.is-dark .notebook-cell__stdin-hint {
  color: rgba(186, 230, 253, 0.72);
}

.notebook-cell.is-dark .notebook-cell__stdin-prompt {
  color: rgba(226, 232, 240, 0.94);
}

@media (max-width: 760px) {
  .notebook-cell__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .notebook-cell__actions {
    justify-content: flex-start;
  }

  .notebook-cell__stdin-meta,
  .notebook-cell__stdin-controls {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
