<template>
  <div ref="hostRef" :class="['inline-code-editor', `inline-code-editor--${theme}`]">
    <div
      v-if="signatureHelpState.visible && signatureHelpState.content"
      class="inline-code-editor__signature-popover"
      :class="{ 'is-dark': theme === 'dark' }"
      :style="signatureHelpStyle"
    >
      <pre class="inline-code-editor__signature-label">{{ signatureHelpState.content }}</pre>
    </div>
  </div>
</template>

<script setup>
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, hoverTooltip, keymap, lineNumbers, placeholder as placeholderExtension, tooltips } from '@codemirror/view'
import { autocompletion, completeAnyWord, completionStatus, startCompletion } from '@codemirror/autocomplete'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { applyResolvedCompletionText, createMarkdownCompletionSource, createSnippetCompletion, mergeCompletionOptions, resolveCompletionRange, resolveSymbolRangeAt } from '@/utils/editorCompletion'
import { getNotebookPythonCompletions, getNotebookPythonDefinition, getNotebookPythonHover, getNotebookPythonSignatureHelp } from '@/utils/notebookRuntime'

const props = defineProps({
  modelValue: { type: String, default: '' },
  mode: { type: String, default: 'python' },
  theme: { type: String, default: 'light' },
  placeholder: { type: String, default: '' },
  minHeight: { type: Number, default: 96 },
  pythonModules: { type: Array, default: () => [] },
  completionContext: { type: String, default: '' },
  pythonContextCells: { type: Array, default: () => [] },
  pythonPath: { type: String, default: '' },
  workspacePath: { type: String, default: '' },
  documentId: { type: String, default: '' },
  notebookMagicOptions: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'focus', 'python-completion-error', 'go-to-definition'])

const hostRef = ref(null)
const viewRef = ref(null)
const languageCompartment = new Compartment()
const themeCompartment = new Compartment()
const placeholderCompartment = new Compartment()
const completionCompartment = new Compartment()
const hoverCompartment = new Compartment()
const definitionCompartment = new Compartment()
let lastPythonCompletionErrorMessage = ''
let lastPythonHoverErrorMessage = ''
let lastPythonDefinitionErrorMessage = ''
let lastPythonSignatureErrorMessage = ''
let signatureHelpTimer = null
let magicCompletionTimer = null
const PYTHON_LSP_COMPLETION_CACHE_TTL_MS = 260
let pythonLspCompletionCache = null
let pythonLspCompletionInFlight = null
const signatureHelpState = reactive({
  visible: false,
  content: '',
  top: 0,
  left: 0
})
const signatureHelpStyle = computed(() => ({
  top: `${Math.max(0, signatureHelpState.top)}px`,
  left: `${Math.max(0, signatureHelpState.left)}px`
}))

const COMMON_PYTHON_MODULES = ['os', 'sys', 'json', 're', 'math', 'pathlib', 'datetime', 'itertools', 'collections', 'statistics', 'typing', 'asyncio', 'random', 'numpy', 'pandas', 'matplotlib', 'matplotlib.pyplot', 'seaborn', 'plotly', 'plotly.express', 'plotly.graph_objects', 'sklearn', 'scipy', 'requests', 'bs4']
const PYTHON_LIBRARY_MEMBERS = {
  os: [createSnippetCompletion('os.path.join()', 'os.path.join("", "")', 'method', 'os'), createSnippetCompletion('os.listdir()', 'os.listdir(".")', 'method', 'os'), createSnippetCompletion('os.getenv()', 'os.getenv("")', 'method', 'os')],
  sys: [createSnippetCompletion('sys.path', 'sys.path', 'property', 'sys'), createSnippetCompletion('sys.argv', 'sys.argv', 'property', 'sys'), createSnippetCompletion('sys.exit()', 'sys.exit()', 'method', 'sys')],
  json: [createSnippetCompletion('json.dumps()', 'json.dumps(obj, ensure_ascii=False, indent=2)', 'method', 'json'), createSnippetCompletion('json.loads()', 'json.loads(text)', 'method', 'json')],
  pathlib: [createSnippetCompletion('Path()', 'Path(".")', 'class', 'pathlib'), createSnippetCompletion('Path.read_text()', 'Path("").read_text(encoding="utf-8")', 'method', 'pathlib')],
  numpy: [createSnippetCompletion('np.array()', 'np.array([])', 'function', 'numpy'), createSnippetCompletion('np.arange()', 'np.arange(0, 10)', 'function', 'numpy'), createSnippetCompletion('np.mean()', 'np.mean(values)', 'function', 'numpy')],
  pandas: [createSnippetCompletion('pd.DataFrame()', 'pd.DataFrame({})', 'class', 'pandas'), createSnippetCompletion('pd.read_csv()', 'pd.read_csv("")', 'function', 'pandas'), createSnippetCompletion('df.head()', 'df.head()', 'method', 'pandas')],
  matplotlib: [createSnippetCompletion('plt.figure()', 'plt.figure(figsize=(8, 4))', 'function', 'matplotlib'), createSnippetCompletion('plt.plot()', 'plt.plot(x, y)', 'function', 'matplotlib'), createSnippetCompletion('plt.show()', 'plt.show()', 'function', 'matplotlib')],
  seaborn: [createSnippetCompletion('sns.lineplot()', 'sns.lineplot(data=df, x="", y="")', 'function', 'seaborn'), createSnippetCompletion('sns.heatmap()', 'sns.heatmap(data)', 'function', 'seaborn')],
  plotly: [createSnippetCompletion('px.line()', 'px.line(df, x="", y="")', 'function', 'plotly'), createSnippetCompletion('go.Figure()', 'go.Figure()', 'class', 'plotly')],
  requests: [createSnippetCompletion('requests.get()', 'requests.get("")', 'function', 'requests'), createSnippetCompletion('requests.post()', 'requests.post("", json={})', 'function', 'requests')]
}
const pythonSnippetDefinitions = [
  createSnippetCompletion('print()', 'print()', 'function', 'builtin'),
  createSnippetCompletion('import', 'import ', 'keyword', 'import'),
  createSnippetCompletion('from import', 'from module import name', 'keyword', 'import'),
  createSnippetCompletion('for', 'for item in iterable:\n    ', 'keyword', 'control'),
  createSnippetCompletion('if', 'if condition:\n    ', 'keyword', 'control'),
  createSnippetCompletion('if __name__ == "__main__"', 'if __name__ == "__main__":\n    ', 'keyword', 'entry'),
  createSnippetCompletion('def', 'def function_name():\n    ', 'keyword', 'function'),
  createSnippetCompletion('class', 'class ClassName:\n    def __init__(self):\n        ', 'keyword', 'class'),
  createSnippetCompletion('try except', 'try:\n    \nexcept Exception as err:\n    print(err)', 'keyword', 'exception'),
  createSnippetCompletion('with open()', 'with open("", "r", encoding="utf-8") as f:\n    ', 'keyword', 'io'),
  createSnippetCompletion('import numpy as np', 'import numpy as np', 'variable', 'numpy'),
  createSnippetCompletion('import pandas as pd', 'import pandas as pd', 'variable', 'pandas'),
  createSnippetCompletion('import matplotlib.pyplot as plt', 'import matplotlib.pyplot as plt', 'variable', 'matplotlib')
]

function normalizeWord(text) { return String(text || '').trim() }
function getLanguageExtension(mode) { return mode === 'markdown' ? markdown() : python() }

function parseImportedPythonSymbols(sourceText) {
  const aliases = new Map(), fromImports = new Map()
  String(sourceText || '').split(/\r?\n/).forEach((line) => {
    const importMatch = line.match(/^\s*import\s+([a-zA-Z0-9_.,\s]+)$/)
    if (importMatch) {
      importMatch[1].split(',').forEach((segmentRaw) => {
        const aliasMatch = segmentRaw.trim().match(/^([a-zA-Z0-9_.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?$/)
        if (!aliasMatch) return
        aliases.set(aliasMatch[2] || aliasMatch[1].split('.').pop(), aliasMatch[1])
      })
    }
    const fromMatch = line.match(/^\s*from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_.*,\\s]+)$/)
    if (fromMatch) {
      fromMatch[2].split(',').forEach((segmentRaw) => {
        const aliasMatch = segmentRaw.trim().match(/^([a-zA-Z0-9_]+)(?:\s+as\s+([a-zA-Z0-9_]+))?$/)
        if (!aliasMatch || aliasMatch[1] === '*') return
        aliases.set(aliasMatch[2] || aliasMatch[1], fromMatch[1])
        fromImports.set(aliasMatch[1], fromMatch[1])
      })
    }
  })
  return { aliases, fromImports }
}

function buildPythonModuleOptions(modules) {
  const values = new Set(COMMON_PYTHON_MODULES)
  ;(Array.isArray(modules) ? modules : []).forEach((item) => { const name = normalizeWord(item); if (name) values.add(name) })
  return Array.from(values).sort((a, b) => a.localeCompare(b)).map((name) => ({ label: name, type: 'module', detail: 'Python 模块', apply: name }))
}

function resolveLibraryMembers(moduleName) {
  const name = String(moduleName || '').trim()
  if (!name) return []
  return PYTHON_LIBRARY_MEMBERS[name] || PYTHON_LIBRARY_MEMBERS[name.split('.')[0]] || []
}

function stripLeadingQualifier(text) {
  return String(text || '').replace(/^[a-zA-Z_][a-zA-Z0-9_]*\./, '')
}

function createMemberAccessOption(option) {
  const label = stripLeadingQualifier(option?.label || '')
  const applyText = stripLeadingQualifier(
    typeof option?.apply === 'string'
      ? option.apply
      : option?.applyText || option?.label || ''
  )

  return {
    ...option,
    label,
    applyText,
    apply: (view, completion, from, to) => {
      applyResolvedCompletionText(view, completion, from, to, applyText)
    }
  }
}

function buildNotebookMagicCompletionItems() {
  return (Array.isArray(props.notebookMagicOptions) ? props.notebookMagicOptions : [])
    .filter((item) => item?.label)
    .map((item) => ({
      label: String(item.label || ''),
      type: item.type || 'keyword',
      detail: item.detail || '超级笔记魔法命令',
      info: item.info || '',
      apply: (view) => {
        const selection = view.state.selection.main
        const line = view.state.doc.lineAt(selection?.head ?? view.state.doc.length)
        const insertText = String(item.applyText || item.label || '')
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: insertText },
          selection: { anchor: line.from + insertText.length }
        })
      }
    }))
}

function createMagicCompletionResult(context) {
  const lineInfo = context.state.doc.lineAt(context.pos)
  const lineText = context.state.sliceDoc(lineInfo.from, context.pos)
  const trimmedLeading = String(lineText || '').trimStart()
  if (!trimmedLeading.startsWith('%') && !trimmedLeading.startsWith('!')) return null
  const options = buildNotebookMagicCompletionItems()
  if (!options.length) return null
  return {
    from: lineInfo.from,
    options,
    validFor: /^[^\n]*$/
  }
}

function isMagicCompletionLine(view) {
  if (props.mode !== 'python') return false
  if (!Array.isArray(props.notebookMagicOptions) || !props.notebookMagicOptions.length) return false
  const selection = view?.state?.selection?.main
  if (!selection?.empty) return false
  const lineInfo = view.state.doc.lineAt(selection.head)
  const lineText = view.state.sliceDoc(lineInfo.from, selection.head).trimStart()
  return lineText.startsWith('%') || lineText.startsWith('!')
}

function scheduleMagicCompletion(view) {
  if (!isMagicCompletionLine(view)) return
  if (magicCompletionTimer) window.clearTimeout(magicCompletionTimer)
  magicCompletionTimer = window.setTimeout(() => {
    magicCompletionTimer = null
    if (!viewRef.value || viewRef.value !== view || !isMagicCompletionLine(view)) return
    if (completionStatus(view.state)) return
    startCompletion(view)
  }, 0)
}

function normalizeContextCell(cell, index) {
  const source = String(cell?.source || '')
  const rawId = String(cell?.id || '').trim()
  return {
    id: rawId || `context-${index}`,
    source
  }
}

function buildPythonDocumentState(currentText = '', cursorOffset = String(currentText || '').length) {
  const currentCellId = String(props.documentId || 'code-cell').trim()
  const previousCells = Array.isArray(props.pythonContextCells) ? props.pythonContextCells.map(normalizeContextCell) : []
  const segments = []
  let text = ''

  previousCells.forEach((cell, index) => {
    if (text) text += '\n\n'
    const start = text.length
    text += cell.source
    segments.push({
      cellId: cell.id || `context-${index}`,
      start,
      end: text.length,
      current: false
    })
  })

  if (text) text += '\n\n'
  const currentStart = text.length
  text += String(currentText || '')
  segments.push({
    cellId: currentCellId,
    start: currentStart,
    end: text.length,
    current: true
  })

  return {
    text,
    cursorOffset: currentStart + Math.max(0, Number(cursorOffset) || 0),
    currentCellId,
    segments
  }
}

function buildPythonContextFingerprint(cells) {
  return (Array.isArray(cells) ? cells : [])
    .map((cell, index) => `${String(cell?.id || index)}:${String(cell?.source || '').length}`)
    .join('|')
}

function getCurrentSegment(documentState) {
  return documentState?.segments?.find((segment) => segment.current) || {
    cellId: String(props.documentId || 'code-cell').trim() || 'code-cell',
    start: 0,
    end: 0,
    current: true
  }
}

function mapCombinedOffsetToCellTarget(documentState, offset) {
  const safeOffset = Math.max(0, Number(offset) || 0)
  const segment = documentState?.segments?.find((item) => safeOffset >= item.start && safeOffset <= item.end) || documentState?.segments?.[documentState.segments.length - 1]
  if (!segment) return null
  return {
    cellId: segment.cellId,
    cursorOffset: Math.max(0, safeOffset - segment.start),
    current: !!segment.current
  }
}

function clampRangeToCurrentSegment(documentState, range, fallbackPos) {
  const currentSegment = getCurrentSegment(documentState)
  const fallbackOffset = currentSegment.start + Math.max(0, Number(fallbackPos) || 0)
  const absoluteFrom = Number.isFinite(Number(range?.from)) ? Number(range.from) : fallbackOffset
  const absoluteTo = Number.isFinite(Number(range?.to)) ? Number(range.to) : fallbackOffset
  const clampedFrom = Math.max(currentSegment.start, Math.min(absoluteFrom, currentSegment.end))
  const clampedTo = Math.max(currentSegment.start, Math.min(absoluteTo, currentSegment.end))
  return {
    from: Math.max(0, clampedFrom - currentSegment.start),
    to: Math.max(0, clampedTo - currentSegment.start)
  }
}

function buildLspCompletionOptions(items = []) {
  return items.filter((item) => item?.label).map((item) => ({
    label: item.label,
    type: item.type || 'text',
    detail: item.detail || 'Jedi LSP',
    info: item.documentation || '',
    apply: (view, completion, from, to) => {
      const start = Number.isFinite(Number(item.replaceFromOffset)) ? Number(item.replaceFromOffset) : from
      const end = Number.isFinite(Number(item.replaceToOffset)) ? Number(item.replaceToOffset) : to
      const insertText = String(item.applyText || item.label || '')
      const replacement = resolveCompletionRange(view.state.doc.toString(), start, end, insertText)
      view.dispatch({ changes: { from: replacement.from, to: replacement.to, insert: insertText }, selection: { anchor: replacement.from + insertText.length } })
    }
  }))
}

async function fetchPythonLspOptions(context) {
  if (!props.pythonPath) return []
  const fingerprint = buildPythonContextFingerprint(props.pythonContextCells)
  const cacheBase = {
    doc: context.state.doc,
    pos: context.pos,
    pythonPath: String(props.pythonPath || '').trim(),
    workspacePath: String(props.workspacePath || '').trim(),
    documentId: String(props.documentId || '').trim(),
    contextFingerprint: fingerprint
  }
  if (
    pythonLspCompletionCache
    && Date.now() - Number(pythonLspCompletionCache.at || 0) <= PYTHON_LSP_COMPLETION_CACHE_TTL_MS
    && pythonLspCompletionCache.doc === cacheBase.doc
    && pythonLspCompletionCache.pos === cacheBase.pos
    && pythonLspCompletionCache.pythonPath === cacheBase.pythonPath
    && pythonLspCompletionCache.workspacePath === cacheBase.workspacePath
    && pythonLspCompletionCache.documentId === cacheBase.documentId
    && pythonLspCompletionCache.contextFingerprint === cacheBase.contextFingerprint
  ) {
    return Array.isArray(pythonLspCompletionCache.items) ? pythonLspCompletionCache.items : []
  }
  if (
    pythonLspCompletionInFlight
    && pythonLspCompletionInFlight.doc === cacheBase.doc
    && pythonLspCompletionInFlight.pos === cacheBase.pos
    && pythonLspCompletionInFlight.pythonPath === cacheBase.pythonPath
    && pythonLspCompletionInFlight.workspacePath === cacheBase.workspacePath
    && pythonLspCompletionInFlight.documentId === cacheBase.documentId
    && pythonLspCompletionInFlight.contextFingerprint === cacheBase.contextFingerprint
  ) {
    return pythonLspCompletionInFlight.promise
  }
  const requestPromise = (async () => {
    try {
      const documentState = buildPythonDocumentState(context.state.doc.toString(), context.pos)
      const currentSegment = getCurrentSegment(documentState)
      const result = await getNotebookPythonCompletions({
        pythonPath: props.pythonPath,
        notebookPath: props.workspacePath,
        workspacePath: props.workspacePath,
        documentId: props.documentId || 'code-cell',
        text: documentState.text,
        cursorOffset: documentState.cursorOffset
      })
      lastPythonCompletionErrorMessage = ''
      const nextItems = buildLspCompletionOptions((result?.items || []).map((item) => {
        const replacement = clampRangeToCurrentSegment(documentState, {
          from: item?.replaceFromOffset,
          to: item?.replaceToOffset
        }, context.pos)
        return {
          ...item,
          replaceFromOffset: replacement.from,
          replaceToOffset: replacement.to
        }
      }), currentSegment)
      pythonLspCompletionCache = {
        ...cacheBase,
        at: Date.now(),
        items: nextItems
      }
      return nextItems
    } catch (err) {
      const message = String(err?.message || err || '').trim()
      if (message && message !== lastPythonCompletionErrorMessage) {
        lastPythonCompletionErrorMessage = message
        emit('python-completion-error', err instanceof Error ? err : new Error(message))
      }
      return []
    }
  })()
  pythonLspCompletionInFlight = {
    ...cacheBase,
    promise: requestPromise
  }
  try {
    return await requestPromise
  } finally {
    if (pythonLspCompletionInFlight?.promise === requestPromise) {
      pythonLspCompletionInFlight = null
    }
  }
}

async function fetchPythonHoverPayload(view, pos) {
  if (!props.pythonPath) return null
  try {
    const documentState = buildPythonDocumentState(view.state.doc.toString(), pos)
    const result = await getNotebookPythonHover({
      pythonPath: props.pythonPath,
      notebookPath: props.workspacePath,
      workspacePath: props.workspacePath,
      documentId: props.documentId || 'code-cell',
      text: documentState.text,
      cursorOffset: documentState.cursorOffset
    })
    lastPythonHoverErrorMessage = ''
    const contents = String(result?.contents || '').trim()
    if (!contents) return null
    const range = clampRangeToCurrentSegment(documentState, result?.range, pos)
    return {
      contents,
      from: Number.isFinite(Number(range?.from)) ? Number(range.from) : pos,
      to: Number.isFinite(Number(range?.to)) ? Number(range.to) : pos
    }
  } catch (err) {
    const message = String(err?.message || err || '').trim()
    if (message && message !== lastPythonHoverErrorMessage) {
      lastPythonHoverErrorMessage = message
      emit('python-completion-error', err instanceof Error ? err : new Error(message))
    }
    return null
  }
}

async function fetchPythonDefinitionPayload(view, pos) {
  if (!props.pythonPath) return null
  try {
    const documentState = buildPythonDocumentState(view.state.doc.toString(), pos)
    const result = await getNotebookPythonDefinition({
      pythonPath: props.pythonPath,
      notebookPath: props.workspacePath,
      workspacePath: props.workspacePath,
      documentId: props.documentId || 'code-cell',
      text: documentState.text,
      cursorOffset: documentState.cursorOffset
    })
    lastPythonDefinitionErrorMessage = ''
    return mapCombinedOffsetToCellTarget(documentState, result?.offset)
  } catch (err) {
    const message = String(err?.message || err || '').trim()
    if (message && message !== lastPythonDefinitionErrorMessage) {
      lastPythonDefinitionErrorMessage = message
      emit('python-completion-error', err instanceof Error ? err : new Error(message))
    }
    return null
  }
}

function formatSignatureHelp(result) {
  const signatures = Array.isArray(result?.signatures) ? result.signatures : []
  if (!signatures.length) return ''
  const activeSignatureIndex = Math.max(0, Number(result?.activeSignature) || 0)
  const signature = signatures[Math.min(activeSignatureIndex, signatures.length - 1)]
  if (!signature?.label) return ''
  const lines = [String(signature.label).trim()]
  const activeParameterIndex = Math.max(0, Number(result?.activeParameter) || 0)
  const parameter = Array.isArray(signature.parameters) ? signature.parameters[Math.min(activeParameterIndex, Math.max(0, signature.parameters.length - 1))] : null
  const parameterLabel = String(parameter?.label || '').trim()
  if (parameterLabel) lines.push(`参数: ${parameterLabel}`)
  const documentation = String(signature?.documentation || '').trim()
  if (documentation) lines.push(documentation)
  return lines.filter(Boolean).join('\n')
}

async function updateSignatureHelp(view, force = false) {
  if (props.mode !== 'python' || !props.pythonPath) {
    signatureHelpState.visible = false
    return
  }
  const selection = view.state.selection.main
  if (!selection?.empty && !force) {
    signatureHelpState.visible = false
    return
  }
  const pos = selection?.head ?? 0
  const beforeText = view.state.sliceDoc(Math.max(0, pos - 1), pos)
  const lineBeforeCursor = view.state.sliceDoc(view.state.doc.lineAt(pos).from, pos)
  if (!force && beforeText !== '(' && beforeText !== ',' && !/\([\s\S]*$/.test(lineBeforeCursor)) {
    signatureHelpState.visible = false
    return
  }

  try {
    const documentState = buildPythonDocumentState(view.state.doc.toString(), pos)
    const result = await getNotebookPythonSignatureHelp({
      pythonPath: props.pythonPath,
      notebookPath: props.workspacePath,
      workspacePath: props.workspacePath,
      documentId: props.documentId || 'code-cell',
      text: documentState.text,
      cursorOffset: documentState.cursorOffset
    })
    lastPythonSignatureErrorMessage = ''
    const content = formatSignatureHelp(result)
    if (!content) {
      signatureHelpState.visible = false
      return
    }
    const coords = view.coordsAtPos(pos)
    const hostRect = hostRef.value?.getBoundingClientRect?.()
    if (!coords || !hostRect) {
      signatureHelpState.visible = false
      return
    }
    signatureHelpState.content = content
    signatureHelpState.left = coords.left - hostRect.left
    signatureHelpState.top = coords.bottom - hostRect.top + 10
    signatureHelpState.visible = true
  } catch (err) {
    const message = String(err?.message || err || '').trim()
    if (message && message !== lastPythonSignatureErrorMessage) {
      lastPythonSignatureErrorMessage = message
      emit('python-completion-error', err instanceof Error ? err : new Error(message))
    }
    signatureHelpState.visible = false
  }
}

function scheduleSignatureHelp(view, force = false) {
  if (signatureHelpTimer) window.clearTimeout(signatureHelpTimer)
  signatureHelpTimer = window.setTimeout(() => {
    signatureHelpTimer = null
    void updateSignatureHelp(view, force)
  }, force ? 0 : 80)
}

async function triggerDefinitionNavigation(view, pos) {
  const target = await fetchPythonDefinitionPayload(view, pos)
  if (!target?.cellId) return false
  emit('go-to-definition', target)
  return true
}

function renderHoverContent(contents = '') {
  const root = document.createElement('div')
  root.className = 'inline-code-editor__hover-card'
  root.tabIndex = 0

  const text = String(contents || '').trim()
  const codeFenceMatch = text.match(/^```([\w+-]*)\n([\s\S]*?)\n```(?:\n+([\s\S]*))?$/)

  if (codeFenceMatch) {
    const [, language, code, rest] = codeFenceMatch
    const codeBlock = document.createElement('pre')
    codeBlock.className = 'inline-code-editor__hover-code'
    codeBlock.dataset.language = language || ''
    codeBlock.textContent = code
    root.appendChild(codeBlock)
    if (rest && rest.trim()) {
      const body = document.createElement('div')
      body.className = 'inline-code-editor__hover-doc'
      body.textContent = rest.trim()
      root.appendChild(body)
    }
    return root
  }

  const pre = document.createElement('pre')
  pre.className = 'inline-code-editor__hover-pre'
  pre.textContent = text
  root.appendChild(pre)
  return root
}

function createPythonHoverExtension() {
  if (props.mode !== 'python' || !props.pythonPath) return []
  return hoverTooltip(async (view, pos, side) => {
    if (side < 0 && pos > 0 && /\s/.test(view.state.sliceDoc(pos - 1, pos))) return null
    const payload = await fetchPythonHoverPayload(view, pos)
    if (!payload?.contents) return null

    let from = payload.from
    let to = payload.to
    if (!(from < to)) {
      const fallback = resolveSymbolRangeAt(view.state.doc.toString(), pos)
      from = fallback.from
      to = fallback.to
    }
    if (!(from < to)) return null

    return {
      pos: from,
      end: to,
      above: true,
      create() {
        return { dom: renderHoverContent(payload.contents) }
      }
    }
  }, { hoverTime: 300 })
}

function createPythonCompletionSource() {
  return async (context) => {
    const magicResult = createMagicCompletionResult(context)
    if (magicResult) return magicResult

    const docText = context.state.doc.toString()
    const combinedSource = `${String(props.completionContext || '')}\n${docText}`.trim()
    const { aliases, fromImports } = parseImportedPythonSymbols(combinedSource)
    const moduleOptions = buildPythonModuleOptions(props.pythonModules)
    const anyWordResult = completeAnyWord(context)
    const line = context.state.sliceDoc(context.state.doc.lineAt(context.pos).from, context.pos)
    const importModuleMatch = line.match(/(?:^|\s)import\s+([a-zA-Z0-9_.]*)$/)
    const fromModuleMatch = line.match(/(?:^|\s)from\s+([a-zA-Z0-9_.]*)$/)
    const fromImportMatch = line.match(/(?:^|\s)from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_]*)$/)
    const memberAccessMatch = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z0-9_]*)$/)
    const defaultWord = context.matchBefore(/[a-zA-Z_][a-zA-Z0-9_]*/)
    const shouldQueryLsp = !!context.explicit || !!defaultWord || !!importModuleMatch || !!fromModuleMatch || !!fromImportMatch || !!memberAccessMatch
    const lspOptions = shouldQueryLsp ? await fetchPythonLspOptions(context) : []

    if (importModuleMatch || fromModuleMatch) {
      const word = context.matchBefore(/[a-zA-Z0-9_.]*/)
      return { from: word ? word.from : context.pos, options: mergeCompletionOptions([moduleOptions, lspOptions, anyWordResult?.options || []]), validFor: /^[a-zA-Z0-9_.]*$/ }
    }
    if (fromImportMatch) {
      const word = context.matchBefore(/[a-zA-Z0-9_]*/)
      return { from: word ? word.from : context.pos, options: mergeCompletionOptions([resolveLibraryMembers(fromImportMatch[1]), lspOptions, anyWordResult?.options || []]), validFor: /^[a-zA-Z0-9_]*$/ }
    }
    if (memberAccessMatch) {
      const alias = memberAccessMatch[1]
      const moduleName = aliases.get(alias) || fromImports.get(alias) || alias
      const members = resolveLibraryMembers(moduleName).map((option) => createMemberAccessOption(option))
      const word = context.matchBefore(/[a-zA-Z0-9_]*/)
      return { from: word ? word.from : context.pos, options: mergeCompletionOptions([members, lspOptions, anyWordResult?.options || []]), validFor: /^[a-zA-Z0-9_]*$/ }
    }

    const importedAliasOptions = Array.from(aliases.entries()).map(([alias, moduleName]) => ({ label: alias, type: 'variable', detail: `来自 ${moduleName}`, apply: alias }))
    if (!defaultWord && !context.explicit && !lspOptions.length) return null
    return { from: defaultWord ? defaultWord.from : context.pos, options: mergeCompletionOptions([pythonSnippetDefinitions, importedAliasOptions, moduleOptions, lspOptions, anyWordResult?.options || []]), validFor: /^[a-zA-Z0-9_]*$/ }
  }
}

function createDefinitionKeymap() {
  if (props.mode !== 'python' || !props.pythonPath) return []
  return keymap.of([{
    key: 'F12',
    run(view) {
      void triggerDefinitionNavigation(view, view.state.selection.main.head)
      return true
    }
  }])
}

function getCompletionSource(mode) { return mode === 'markdown' ? createMarkdownCompletionSource() : createPythonCompletionSource() }
function buildEditorTheme(theme) {
  const isDark = theme === 'dark'
  return EditorView.theme({
    '&': { minHeight: `${props.minHeight}px`, fontSize: '13px', backgroundColor: 'transparent', color: isDark ? '#e2e8f0' : '#0f172a' },
    '.cm-scroller': { fontFamily: '\'Fira Code\', \'SFMono-Regular\', Consolas, monospace', lineHeight: '1.55', overflow: 'auto' },
    '.cm-content': { padding: props.minHeight <= 48 ? '4px 0' : '10px 0 12px' },
    '.cm-line': { padding: '0' },
    '.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none', color: isDark ? 'rgba(148, 163, 184, 0.78)' : 'rgba(100, 116, 139, 0.88)' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 0' },
    '.cm-activeLine': { backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(37, 99, 235, 0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: isDark ? 'rgba(56, 189, 248, 0.24)' : 'rgba(59, 130, 246, 0.22)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: isDark ? '#f8fafc' : '#0f172a' },
    '.cm-tooltip-autocomplete': {
      border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(37, 99, 235, 0.22)',
      backgroundColor: isDark ? 'rgba(8, 15, 28, 0.995)' : 'rgba(255, 255, 255, 0.995)',
      color: isDark ? '#e2e8f0' : '#0f172a',
      borderRadius: '14px',
      overflow: 'hidden',
      boxShadow: isDark ? '0 26px 60px rgba(2, 6, 23, 0.62)' : '0 24px 52px rgba(15, 23, 42, 0.18)'
    },
    '.cm-tooltip-autocomplete > ul': { padding: '4px', backgroundColor: 'transparent' },
    '.cm-tooltip-autocomplete ul li': {
      borderRadius: '10px',
      color: isDark ? '#e2e8f0' : '#0f172a',
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.08)' : 'rgba(248, 250, 252, 0.94)'
    },
    '.cm-tooltip-autocomplete ul li:hover': {
      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.82)' : 'rgba(239, 246, 255, 0.98)'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { background: isDark ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(2, 132, 199, 0.92))' : 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#f8fafc' },
    '.cm-completionIcon': {
      opacity: isDark ? '0.92' : '0.86'
    },
    '.cm-completionLabel': {
      fontWeight: '600',
      letterSpacing: '0.01em'
    },
    '.cm-completionDetail': { color: isDark ? 'rgba(191, 219, 254, 0.92)' : 'rgba(51, 65, 85, 0.82)' },
    '.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail': { color: 'rgba(239, 246, 255, 0.9)' },
    '.cm-completionMatchedText': { color: isDark ? '#67e8f9' : '#1d4ed8', fontWeight: '700' },
    '.cm-placeholder': { color: isDark ? 'rgba(148, 163, 184, 0.58)' : 'rgba(100, 116, 139, 0.62)' }
  })
}

function createAutocompletionExtension() { return autocompletion({ activateOnTyping: true, activateOnTypingDelay: 80, maxRenderedOptions: 60, aboveCursor: false, tooltipClass: () => 'inline-code-editor__autocomplete-popover', override: [getCompletionSource(props.mode)] }) }
function createEditor() {
  if (!hostRef.value) return
  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      tooltips({ position: 'absolute' }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      completionCompartment.of(createAutocompletionExtension()),
      hoverCompartment.of(createPythonHoverExtension()),
      definitionCompartment.of(createDefinitionKeymap()),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit('update:modelValue', update.state.doc.toString())
          scheduleMagicCompletion(update.view)
        }
        if (update.docChanged || update.selectionSet) scheduleSignatureHelp(update.view)
      }),
      EditorView.domEventHandlers({
        focus: (_event, view) => {
          emit('focus')
          scheduleSignatureHelp(view, true)
        },
        blur: () => {
          signatureHelpState.visible = false
        },
        mousedown: (event, view) => {
          if (!props.pythonPath || props.mode !== 'python') return false
          if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (!Number.isFinite(pos)) return false
          event.preventDefault()
          void triggerDefinitionNavigation(view, pos)
          return true
        }
      }),
      languageCompartment.of(getLanguageExtension(props.mode)),
      themeCompartment.of(buildEditorTheme(props.theme)),
      placeholderCompartment.of(placeholderExtension(props.placeholder || ''))
    ]
  })
  viewRef.value = new EditorView({ state, parent: hostRef.value })
}

function setEditorValue(nextValue) {
  const view = viewRef.value
  if (!view) return
  const current = view.state.doc.toString(), target = String(nextValue ?? '')
  if (current === target) return
  view.dispatch({ changes: { from: 0, to: current.length, insert: target } })
}

function focus(cursorOffset = null) {
  const view = viewRef.value
  if (!view) return
  const position = Number.isFinite(Number(cursorOffset)) ? Math.max(0, Math.min(Number(cursorOffset), view.state.doc.length)) : null
  if (position !== null) {
    view.dispatch({
      selection: { anchor: position },
      scrollIntoView: true
    })
  }
  view.focus()
  nextTick(() => scheduleSignatureHelp(view, true))
}

watch(() => props.modelValue, (value) => setEditorValue(value))
watch(() => props.mode, (mode) => viewRef.value?.dispatch({ effects: [languageCompartment.reconfigure(getLanguageExtension(mode)), completionCompartment.reconfigure(createAutocompletionExtension()), hoverCompartment.reconfigure(createPythonHoverExtension()), definitionCompartment.reconfigure(createDefinitionKeymap())] }))
watch(() => props.theme, (theme) => viewRef.value?.dispatch({ effects: themeCompartment.reconfigure(buildEditorTheme(theme)) }))
watch(() => props.placeholder, (text) => viewRef.value?.dispatch({ effects: placeholderCompartment.reconfigure(placeholderExtension(text || '')) }))
watch(() => [props.pythonModules, props.completionContext, props.pythonContextCells, props.mode, props.pythonPath, props.workspacePath, props.documentId, props.notebookMagicOptions], () => {
  viewRef.value?.dispatch({ effects: [completionCompartment.reconfigure(createAutocompletionExtension()), hoverCompartment.reconfigure(createPythonHoverExtension()), definitionCompartment.reconfigure(createDefinitionKeymap())] })
  if (viewRef.value) scheduleSignatureHelp(viewRef.value, true)
}, { deep: true })

onMounted(createEditor)
onBeforeUnmount(() => {
  if (signatureHelpTimer) window.clearTimeout(signatureHelpTimer)
  if (magicCompletionTimer) window.clearTimeout(magicCompletionTimer)
  viewRef.value?.destroy()
  viewRef.value = null
})
defineExpose({ focus })
</script>

<style scoped>
.inline-code-editor { position: relative; width: 100%; }
.inline-code-editor :deep(.cm-editor) { background: transparent; }
.inline-code-editor :deep(.inline-code-editor__autocomplete-popover) {
  min-width: 240px;
  margin-top: 10px !important;
  margin-left: 10px !important;
  z-index: 40;
  backdrop-filter: blur(10px);
}
.inline-code-editor :deep(.cm-tooltip-hover) {
  border: 1px solid rgba(37, 99, 235, 0.22);
  background: rgba(255, 255, 255, 0.98);
  color: #0f172a;
  border-radius: 14px;
  box-shadow: 0 24px 52px rgba(15, 23, 42, 0.18);
  max-width: min(560px, calc(100vw - 32px));
  max-height: min(420px, calc(100vh - 48px));
  overflow: hidden;
  pointer-events: auto;
  user-select: text;
}
.inline-code-editor :deep(.inline-code-editor__hover-card) {
  display: flex;
  flex-direction: column;
  max-height: min(420px, calc(100vh - 48px));
  overflow: auto;
  overscroll-behavior: contain;
  outline: none;
}
.inline-code-editor :deep(.inline-code-editor__hover-code),
.inline-code-editor :deep(.inline-code-editor__hover-pre) {
  margin: 0;
  padding: 12px 14px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}
.inline-code-editor :deep(.inline-code-editor__hover-code) {
  background: rgba(239, 246, 255, 0.92);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}
.inline-code-editor :deep(.inline-code-editor__hover-doc) {
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.inline-code-editor :deep(.inline-code-editor__hover-card::-webkit-scrollbar) {
  width: 10px;
}
.inline-code-editor :deep(.inline-code-editor__hover-card::-webkit-scrollbar-track) {
  background: transparent;
}
.inline-code-editor :deep(.inline-code-editor__hover-card::-webkit-scrollbar-thumb) {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.48);
  background-clip: padding-box;
}
.inline-code-editor :deep(.inline-code-editor__hover-card::-webkit-scrollbar-thumb:hover) {
  background: rgba(100, 116, 139, 0.68);
  background-clip: padding-box;
}
.inline-code-editor__signature-popover {
  position: absolute;
  z-index: 45;
  min-width: 220px;
  max-width: min(520px, calc(100vw - 48px));
  padding: 10px 12px;
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(8px);
}
.inline-code-editor__signature-popover.is-dark {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(8, 15, 28, 0.98);
  box-shadow: 0 24px 52px rgba(2, 6, 23, 0.6);
}
.inline-code-editor__signature-label {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: inherit;
}
.inline-code-editor--dark :deep(.cm-tooltip-hover) {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(8, 15, 28, 0.995);
  color: #e2e8f0;
  box-shadow: 0 26px 60px rgba(2, 6, 23, 0.62);
}
.inline-code-editor--dark :deep(.inline-code-editor__hover-code) {
  background: rgba(15, 23, 42, 0.9);
  border-bottom-color: rgba(71, 85, 105, 0.5);
}
.inline-code-editor--dark :deep(.inline-code-editor__hover-card::-webkit-scrollbar-thumb) {
  background: rgba(71, 85, 105, 0.82);
  background-clip: padding-box;
}
.inline-code-editor--dark :deep(.inline-code-editor__hover-card::-webkit-scrollbar-thumb:hover) {
  background: rgba(148, 163, 184, 0.9);
  background-clip: padding-box;
}
</style>
