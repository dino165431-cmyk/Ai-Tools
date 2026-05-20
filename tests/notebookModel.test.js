import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createNotebookCell,
  getNotebookCellRuntime,
  getNotebookCellRuntimeDescriptor,
  normalizeNotebook,
  normalizeNotebookCellRuntime,
  parseNotebookTextForEditor,
  serializeNotebook,
  setNotebookCellRuntime
} from '../src/utils/notebookModel.js'

test('code cells default to python runtime and preserve explicit runtime metadata', () => {
  const pythonCell = createNotebookCell('code')
  const sqlCell = createNotebookCell('code', 'sql')
  const javascriptCell = createNotebookCell('code', 'javascript')

  assert.equal(getNotebookCellRuntime(pythonCell), 'python')
  assert.equal(getNotebookCellRuntime(sqlCell), 'sql')
  assert.equal(getNotebookCellRuntimeDescriptor(javascriptCell.metadata.aiTools.runtime).label, 'Node.js')
  assert.equal(sqlCell.metadata.aiTools.runtime, 'sql')
})

test('normalizeNotebook downgrades unsupported bash runtime to python while preserving supported values', () => {
  const notebook = normalizeNotebook({
    cells: [
      {
        cell_type: 'code',
        id: 'cell-a',
        metadata: { aiTools: { runtime: 'bash' } },
        source: 'echo hello'
      },
      {
        cell_type: 'code',
        id: 'cell-b',
        metadata: { aiTools: { runtime: 'SQL' } },
        source: 'SELECT 1'
      },
      {
        cell_type: 'code',
        id: 'cell-c',
        metadata: { aiTools: { runtime: 'invalid-runtime' } },
        source: 'print("fallback")'
      }
    ]
  })

  assert.equal(getNotebookCellRuntime(notebook.cells[0]), 'python')
  assert.equal(getNotebookCellRuntime(notebook.cells[1]), 'sql')
  assert.equal(getNotebookCellRuntime(notebook.cells[2]), 'python')
  assert.equal(normalizeNotebookCellRuntime('bash'), 'python')
})

test('serializeNotebook round-trips runtime metadata while editor normalization clears execution state', () => {
  const serialized = serializeNotebook({
    cells: [
      {
        cell_type: 'code',
        id: 'cell-sql',
        metadata: { aiTools: { runtime: 'sql' } },
        source: 'SELECT 1',
        execution_count: 7,
        outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }]
      },
      {
        cell_type: 'code',
        id: 'cell-js',
        metadata: { aiTools: { runtime: 'javascript' } },
        source: 'console.log(1)',
        execution_count: 3,
        outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }]
      }
    ]
  })

  const editorNotebook = parseNotebookTextForEditor(serialized)

  assert.equal(editorNotebook.cells[0].metadata.aiTools.runtime, 'sql')
  assert.equal(editorNotebook.cells[1].metadata.aiTools.runtime, 'javascript')
  assert.equal(editorNotebook.cells[0].execution_count, null)
  assert.deepEqual(editorNotebook.cells[0].outputs, [])
  assert.equal(editorNotebook.cells[1].execution_count, null)
  assert.deepEqual(editorNotebook.cells[1].outputs, [])
})

test('setNotebookCellRuntime normalizes runtime values in place', () => {
  const cell = {
    cell_type: 'code',
    metadata: {}
  }

  setNotebookCellRuntime(cell, 'BASH')
  assert.equal(getNotebookCellRuntime(cell), 'python')
  assert.equal(cell.metadata.aiTools.runtime, 'python')
  assert.equal(normalizeNotebookCellRuntime('javascript'), 'javascript')
  assert.equal(normalizeNotebookCellRuntime('unknown'), 'python')
})
