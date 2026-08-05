import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.resolve('src/views/pages/note/MdEditor.vue'),
  'utf8'
)

test('HTML and PNG export eagerly hydrates local preview images before cloning', () => {
  assert.match(source, /async function hydratePreviewImagesForExport\(preview\)/)
  assert.match(source, /await hydratePreviewImagesForExport\(preview\);\s*await waitForPreviewImages\(preview\);/s)
  assert.match(source, /cloneImg\.dataset\.localSrcPath\s*\|\|\s*sourceImg\?\.dataset\?\.localSrcPath/s)
})
