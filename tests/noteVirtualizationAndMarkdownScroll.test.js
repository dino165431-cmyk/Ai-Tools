import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const readSource = (relativePath) => fs.readFileSync(path.resolve(relativePath), 'utf8')

const notebookSource = readSource('src/views/pages/note/NotebookEditor.vue')
const noteEditorSource = readSource('src/views/pages/note/MdEditor.vue')
const markdownRuntimeSource = readSource('src/utils/mdEditorRuntime.js')
const markdownStyles = readSource('src/styles/markdownContent.css')
const chatStyles = readSource('src/views/pages/chat/Chat.css')

test('notebook cells use dynamic-height TanStack virtualization', () => {
  assert.match(
    notebookSource,
    /import\s+\{\s*defaultRangeExtractor,\s*useVirtualizer\s*\}\s+from\s+'@tanstack\/vue-virtual'/
  )
  assert.match(notebookSource, /v-for="\{\s*cell,\s*index,\s*virtualItem\s*\}\s+in\s+renderedNotebookCells"/)
  assert.match(notebookSource, /notebookVirtualizer\.value\.measureElement\(element\)/)
  assert.match(notebookSource, /rangeExtractor:\s*extractNotebookVirtualRange/)
  assert.match(notebookSource, /notebookVirtualizer\.value\.scrollToIndex\(index,/)
})

test('regular note preview defers offscreen block layout while CodeMirror virtualizes editing lines', () => {
  assert.match(noteEditorSource, /\.md-editor-preview\s*>\s*\*\)\s*\{\s*content-visibility:\s*auto;/s)
  assert.match(noteEditorSource, /contain-intrinsic-block-size:\s*auto\s+96px;/)
})

test('markdown highlighting is local and no longer relies on the editor CDN fallback', () => {
  assert.match(markdownRuntimeSource, /import\('highlight\.js\/lib\/common'\)/)
  assert.match(markdownRuntimeSource, /highlight:\s*\{\s*instance:\s*highlight\s*\}/s)
  assert.doesNotMatch(noteEditorSource, /highlightElement\(/)
  assert.match(markdownStyles, /\.hljs-keyword/)
})

test('code blocks contain horizontal overscroll but pass vertical wheel scrolling outward', () => {
  for (const styles of [markdownStyles, chatStyles]) {
    assert.match(styles, /overscroll-behavior-x:\s*contain;/)
    assert.match(styles, /overscroll-behavior-y:\s*auto;/)
  }
})
