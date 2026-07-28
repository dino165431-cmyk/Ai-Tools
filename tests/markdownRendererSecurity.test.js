import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8')
}

test('Markdown preview and editor wire DOMPurify sanitization into md-editor-v3', () => {
  const previewSource = readSource('src/components/MarkdownPreviewRenderer.vue')
  const editorSource = readSource('src/components/MarkdownEditorRenderer.vue')

  for (const source of [previewSource, editorSource]) {
    assert.match(source, /import\s+\{\s*sanitizeHtml\s*\}\s+from\s+['"]@\/utils\/sanitizeHtml['"]/)
    assert.match(source, /:sanitize="sanitizeHtml"/)
    assert.match(source, /import\s+\{\s*sanitizeSvgMarkup\s*\}\s+from\s+['"]@\/utils\/sanitizeSvg['"]/)
    assert.match(source, /:sanitize-mermaid="sanitizeSvgMarkup"/)
    assert.match(source, /:no-echarts="true"/)
  }
})

test('ECharts preview and export paths do not use dynamic JavaScript evaluation', () => {
  const decoratorSource = readSource('src/utils/markdownDiagramDecorator.js')
  const fileTreeSource = readSource('src/views/pages/note/FileTree.vue')

  assert.doesNotMatch(decoratorSource, /\bnew\s+Function\b|\beval\s*\(/)
  assert.doesNotMatch(fileTreeSource, /\bnew\s+Function\b|\beval\s*\(/)
  assert.match(decoratorSource, /parseEchartsOptionSource/)
  assert.match(fileTreeSource, /parseEchartsOptionSource/)
  assert.match(decoratorSource, /renderer:\s*'canvas'/)
  assert.match(decoratorSource, /renderMode:\s*'richText'/)
})

test('standalone notebook HTML table renderer sanitizes its own v-html input', () => {
  const source = readSource('src/views/pages/note/notebook/NotebookHtmlTableOutput.vue')

  assert.match(source, /import\s+\{\s*sanitizeHtml\s*\}\s+from\s+['"]@\/utils\/sanitizeHtml['"]/)
  assert.match(source, /const\s+sanitizedHtml\s*=\s*computed\(\(\)\s*=>\s*sanitizeHtml\(props\.html\)\)/)
  assert.match(source, /v-html="sanitizedHtml"/)
  assert.doesNotMatch(source, /v-html="html"/)
})

test('Mermaid rendering uses strict mode and disables HTML labels', () => {
  const runtimeSource = readSource('src/utils/mdEditorRuntime.js')
  const exportSource = readSource('src/views/pages/note/FileTree.vue')

  for (const source of [runtimeSource, exportSource]) {
    assert.match(source, /securityLevel:\s*'strict'/)
    assert.match(source, /htmlLabels:\s*false/)
  }
})
