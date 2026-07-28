import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasContentSearchApi,
  searchNotes
} from '../src/utils/contentSearch.js'

test('content search wrapper forwards note queries to the read-only preload API', async (t) => {
  const originalApi = globalThis.aiToolsApi
  const calls = []
  globalThis.aiToolsApi = {
    contentSearch: {
      searchNotes(options) {
        calls.push(options)
        return {
          query: options.query,
          total: 1,
          items: [{ path: 'lab/demo.ipynb' }]
        }
      }
    }
  }
  t.after(() => {
    if (originalApi === undefined) delete globalThis.aiToolsApi
    else globalThis.aiToolsApi = originalApi
  })

  assert.equal(hasContentSearchApi(), true)
  const result = await searchNotes({ query: 'forecast', limit: 200 })
  assert.deepEqual(calls, [{ query: 'forecast', limit: 200 }])
  assert.equal(result.items[0].path, 'lab/demo.ipynb')
})

test('content search wrapper rejects cleanly when preload is unavailable', async (t) => {
  const originalApi = globalThis.aiToolsApi
  delete globalThis.aiToolsApi
  t.after(() => {
    if (originalApi !== undefined) globalThis.aiToolsApi = originalApi
  })

  assert.equal(hasContentSearchApi(), false)
  await assert.rejects(
    () => searchNotes({ query: 'forecast' }),
    /contentSearch\.searchNotes/
  )
})
