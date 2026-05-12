import { normalizeNotebookRuntimeConfig } from './notebookRuntimeConfig.js'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export const DEFAULT_NOTEBOOK_CELL_RUNTIME = 'python'
export const NOTEBOOK_CELL_RUNTIME_OPTIONS = Object.freeze([
  {
    value: 'python',
    label: 'Python',
    tagType: 'info',
    placeholder: '输入可执行代码，支持 %runtime help、%pip install 和上下文补全',
    description: '复用现有 Jupyter Kernel'
  },
  {
    value: 'javascript',
    label: 'Node.js',
    tagType: 'success',
    placeholder: '输入 Node.js 代码，当前 Cell 独立执行，不保留跨 Cell 状态',
    description: '独立 Node.js 进程，每个 Cell 单独执行'
  },
  {
    value: 'sql',
    label: 'SQL',
    tagType: 'warning',
    placeholder: '输入 SQL 查询，未写魔法时会自动包装为 %%sql',
    description: '复用 Python Kernel，并基于 ipython-sql 执行'
  }
])
const NOTEBOOK_CELL_RUNTIME_VALUES = new Set(NOTEBOOK_CELL_RUNTIME_OPTIONS.map((item) => item.value))

function toSourceText(raw) {
  if (Array.isArray(raw)) return raw.join('')
  return String(raw ?? '')
}

export function normalizeNotebookCellRuntime(rawRuntime = DEFAULT_NOTEBOOK_CELL_RUNTIME) {
  const runtime = String(rawRuntime || '').trim().toLowerCase()
  return NOTEBOOK_CELL_RUNTIME_VALUES.has(runtime) ? runtime : DEFAULT_NOTEBOOK_CELL_RUNTIME
}

export function getNotebookCellRuntimeDescriptor(rawRuntime = DEFAULT_NOTEBOOK_CELL_RUNTIME) {
  const runtime = normalizeNotebookCellRuntime(rawRuntime)
  return NOTEBOOK_CELL_RUNTIME_OPTIONS.find((item) => item.value === runtime) || NOTEBOOK_CELL_RUNTIME_OPTIONS[0]
}

function cloneNotebookCellMetadata(rawMetadata, cellType = 'code') {
  const metadata = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata) ? cloneJson(rawMetadata) : {}
  if (cellType !== 'code') return metadata

  const aiTools = metadata.aiTools && typeof metadata.aiTools === 'object' && !Array.isArray(metadata.aiTools)
    ? cloneJson(metadata.aiTools)
    : {}
  aiTools.runtime = normalizeNotebookCellRuntime(aiTools.runtime)
  metadata.aiTools = aiTools
  return metadata
}

export function getNotebookCellRuntime(cell) {
  const metadata = cell?.metadata && typeof cell.metadata === 'object' && !Array.isArray(cell.metadata) ? cell.metadata : {}
  return normalizeNotebookCellRuntime(metadata?.aiTools?.runtime)
}

export function setNotebookCellRuntime(cell, runtime = DEFAULT_NOTEBOOK_CELL_RUNTIME) {
  if (!cell || typeof cell !== 'object') return cell
  const cellType = String(cell.cell_type || 'code').trim() || 'code'
  const metadata = cloneNotebookCellMetadata(cell.metadata, cellType)
  if (cellType === 'code') {
    const aiTools = metadata.aiTools && typeof metadata.aiTools === 'object' && !Array.isArray(metadata.aiTools)
      ? metadata.aiTools
      : {}
    aiTools.runtime = normalizeNotebookCellRuntime(runtime)
    metadata.aiTools = aiTools
  }
  cell.metadata = metadata
  return cell
}

function normalizeOutput(output) {
  const src = output && typeof output === 'object' && !Array.isArray(output) ? output : {}
  const outputType = String(src.output_type || src.outputType || 'stream').trim() || 'stream'

  if (outputType === 'stream') {
    return {
      output_type: 'stream',
      name: String(src.name || 'stdout'),
      text: toSourceText(src.text)
    }
  }

  if (outputType === 'error') {
    return {
      output_type: 'error',
      ename: String(src.ename || ''),
      evalue: String(src.evalue || ''),
      traceback: Array.isArray(src.traceback) ? src.traceback.map((item) => String(item || '')) : []
    }
  }

  if (outputType === 'display_data' || outputType === 'execute_result') {
    return {
      output_type: outputType,
      data: src.data && typeof src.data === 'object' && !Array.isArray(src.data) ? cloneJson(src.data) : {},
      metadata: src.metadata && typeof src.metadata === 'object' && !Array.isArray(src.metadata) ? cloneJson(src.metadata) : {},
      execution_count: Number.isFinite(Number(src.execution_count)) ? Number(src.execution_count) : null
    }
  }

  return {
    output_type: outputType,
    data: src.data && typeof src.data === 'object' && !Array.isArray(src.data) ? cloneJson(src.data) : {},
    metadata: src.metadata && typeof src.metadata === 'object' && !Array.isArray(src.metadata) ? cloneJson(src.metadata) : {}
  }
}

export function createNotebookCell(cellType = 'code', runtime = DEFAULT_NOTEBOOK_CELL_RUNTIME) {
  const normalizedType = cellType === 'markdown' || cellType === 'raw' ? cellType : 'code'
  return {
    cell_type: normalizedType,
    id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: normalizedType === 'code'
      ? cloneNotebookCellMetadata({ aiTools: { runtime } }, 'code')
      : {},
    source: '',
    ...(normalizedType === 'code'
      ? {
          execution_count: null,
          outputs: []
        }
      : {})
  }
}

export function createEmptyNotebook() {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3'
      },
      language_info: {
        name: 'python'
      }
    },
    cells: []
  }
}

export function normalizeNotebook(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const metadata = src.metadata && typeof src.metadata === 'object' && !Array.isArray(src.metadata) ? cloneJson(src.metadata) : {}
  const cells = (Array.isArray(src.cells) ? src.cells : [])
    .map((cell) => {
      const cellSrc = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : {}
      const cellType = ['markdown', 'raw', 'code'].includes(String(cellSrc.cell_type || '').trim())
        ? String(cellSrc.cell_type || '').trim()
        : 'code'

      const normalized = {
        cell_type: cellType,
        id: String(cellSrc.id || '').trim() || `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        metadata: cloneNotebookCellMetadata(cellSrc.metadata, cellType),
        source: toSourceText(cellSrc.source)
      }

      if (cellType === 'code') {
        normalized.execution_count = Number.isFinite(Number(cellSrc.execution_count)) ? Number(cellSrc.execution_count) : null
        normalized.outputs = (Array.isArray(cellSrc.outputs) ? cellSrc.outputs : []).map((item) => normalizeOutput(item))
      }

      return normalized
    })

  return {
    nbformat: Number.isFinite(Number(src.nbformat)) ? Number(src.nbformat) : 4,
    nbformat_minor: Number.isFinite(Number(src.nbformat_minor)) ? Number(src.nbformat_minor) : 5,
    metadata,
    cells
  }
}

export function normalizeNotebookForEditor(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const metadata = src.metadata && typeof src.metadata === 'object' && !Array.isArray(src.metadata) ? cloneJson(src.metadata) : {}
  const cells = (Array.isArray(src.cells) ? src.cells : [])
    .map((cell) => {
      const cellSrc = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : {}
      const cellType = ['markdown', 'raw', 'code'].includes(String(cellSrc.cell_type || '').trim())
        ? String(cellSrc.cell_type || '').trim()
        : 'code'

      const normalized = {
        cell_type: cellType,
        id: String(cellSrc.id || '').trim() || `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        metadata: cloneNotebookCellMetadata(cellSrc.metadata, cellType),
        source: toSourceText(cellSrc.source)
      }

      if (cellType === 'code') {
        normalized.execution_count = null
        normalized.outputs = []
      }

      return normalized
    })

  return {
    nbformat: Number.isFinite(Number(src.nbformat)) ? Number(src.nbformat) : 4,
    nbformat_minor: Number.isFinite(Number(src.nbformat_minor)) ? Number(src.nbformat_minor) : 5,
    metadata,
    cells
  }
}

export function parseNotebookText(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return createEmptyNotebook()
  return normalizeNotebook(JSON.parse(text))
}

export function parseNotebookTextForEditor(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return createEmptyNotebook()
  return normalizeNotebookForEditor(JSON.parse(text))
}

export function serializeNotebook(notebook) {
  return `${JSON.stringify(normalizeNotebook(notebook), null, 2)}\n`
}

export function serializeNormalizedNotebook(notebook) {
  return `${JSON.stringify(notebook || createEmptyNotebook(), null, 2)}\n`
}

export function getNotebookRuntimeConfig(noteConfigValue) {
  return normalizeNotebookRuntimeConfig(noteConfigValue?.notebookRuntime)
}
