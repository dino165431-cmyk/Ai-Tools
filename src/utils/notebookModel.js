import { normalizeNotebookRuntimeConfig } from './notebookRuntimeConfig.js'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function toSourceText(raw) {
  if (Array.isArray(raw)) return raw.join('')
  return String(raw ?? '')
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

export function createNotebookCell(cellType = 'code') {
  const normalizedType = cellType === 'markdown' || cellType === 'raw' ? cellType : 'code'
  return {
    cell_type: normalizedType,
    id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: {},
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
        metadata: cellSrc.metadata && typeof cellSrc.metadata === 'object' && !Array.isArray(cellSrc.metadata) ? cloneJson(cellSrc.metadata) : {},
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
        metadata: cellSrc.metadata && typeof cellSrc.metadata === 'object' && !Array.isArray(cellSrc.metadata) ? cloneJson(cellSrc.metadata) : {},
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
