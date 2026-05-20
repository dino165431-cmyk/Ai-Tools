import test from 'node:test'
import assert from 'node:assert/strict'

import {
  sanitizeSubPathUnderRoot,
  splitMarkdownLinkDestination,
  normalizeNotePathInRoot,
  buildNoteHrefFromPath,
  resolveNoteAbsPathFromHref,
  rewriteNoteAssetsLinksInMarkdown
} from '../src/utils/notePathUtils.js'

test('sanitizeSubPathUnderRoot blocks parent traversal and normalizes slashes', () => {
  assert.equal(sanitizeSubPathUnderRoot('foo\\bar\\baz'), 'foo/bar/baz')
  assert.equal(sanitizeSubPathUnderRoot('/foo/./bar'), 'foo/bar')
  assert.equal(sanitizeSubPathUnderRoot('../foo'), null)
  assert.equal(sanitizeSubPathUnderRoot('foo/../../bar'), null)
  assert.equal(sanitizeSubPathUnderRoot('C:/secret.txt'), null)
})

test('splitMarkdownLinkDestination supports wrapped and titled links', () => {
  assert.deepEqual(splitMarkdownLinkDestination('<foo/bar.md> "title"'), {
    urlRaw: 'foo/bar.md',
    rest: ' "title"',
    wrapped: true
  })

  assert.deepEqual(splitMarkdownLinkDestination('./foo/bar.md#part title'), {
    urlRaw: './foo/bar.md#part',
    rest: ' title',
    wrapped: false
  })
})

test('normalizeNotePathInRoot trims note prefix and appends md suffix by default', () => {
  assert.equal(normalizeNotePathInRoot('note/demo/test'), 'demo/test.md')
  assert.equal(normalizeNotePathInRoot('/demo/test.md'), 'demo/test.md')
  assert.equal(normalizeNotePathInRoot('/demo/test.ipynb'), 'demo/test.ipynb')
  assert.equal(normalizeNotePathInRoot('../escape'), null)
})

test('buildNoteHrefFromPath encodes note-relative markdown paths', () => {
  assert.equal(buildNoteHrefFromPath('note/demo space/hello.md'), 'note:/demo%20space/hello.md')
  assert.equal(buildNoteHrefFromPath('demo/hello.md'), null)
})

test('rewriteNoteAssetsLinksInMarkdown renames per-note assets links and preserves title suffix', () => {
  const markdown = '![img](./old-note.assets/pic one.png "title")\n[doc](./other.assets/file.txt)'
  const rewritten = rewriteNoteAssetsLinksInMarkdown(markdown, 'old-note', 'new-note')

  assert.equal(
    rewritten,
    '![img](./new-note.assets/pic one.png "title")\n[doc](./other.assets/file.txt)'
  )
})

test('resolveNoteAbsPathFromHref resolves note protocol, relative, and absolute note links', async () => {
  const existing = new Set([
    'note/demo/target.md',
    'note/demo/notebook.ipynb',
    'note/shared/guide.md',
    'note/root.md'
  ])
  const existsFn = async (value) => existing.has(value)

  assert.equal(
    await resolveNoteAbsPathFromHref({
      hrefRaw: 'note:/demo/target.md',
      currentFilePath: 'note/demo/current.md',
      currentDir: 'note/demo',
      existsFn
    }),
    'note/demo/target.md'
  )

  assert.equal(
    await resolveNoteAbsPathFromHref({
      hrefRaw: '../shared/guide',
      currentFilePath: 'note/demo/current.md',
      currentDir: 'note/demo',
      existsFn
    }),
    'note/shared/guide.md'
  )

  assert.equal(
    await resolveNoteAbsPathFromHref({
      hrefRaw: '/root.md',
      currentFilePath: 'note/demo/current.md',
      currentDir: 'note/demo',
      existsFn
    }),
    'note/root.md'
  )

  assert.equal(
    await resolveNoteAbsPathFromHref({
      hrefRaw: './notebook.ipynb',
      currentFilePath: 'note/demo/current.md',
      currentDir: 'note/demo',
      existsFn
    }),
    'note/demo/notebook.ipynb'
  )

  assert.equal(
    await resolveNoteAbsPathFromHref({
      hrefRaw: 'https://example.com',
      currentFilePath: 'note/demo/current.md',
      currentDir: 'note/demo',
      existsFn
    }),
    null
  )
})

