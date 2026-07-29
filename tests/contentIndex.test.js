import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const storage = new Map()

if (!globalThis.utools) {
  globalThis.utools = {
    getPath: () => path.join(process.cwd(), '.tmp-utools'),
    dbCryptoStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value)
    }
  }
}

const globalConfig = require('../public/preload/utils/global-config.js')
const fileOperations = require('../public/preload/utils/file-operations.js')
const contentIndex = require('../public/preload/utils/content-index.js')
const createBuiltinNotesSkillRuntime = require('../public/preload/builtin-skills/manage-notes/runtime.js')
const createBuiltinSessionsSkillRuntime = require('../public/preload/builtin-skills/inspect-session-history/runtime.js')

import { encryptNoteContent } from '../src/utils/noteEncryption.js'

function createFixtureFile(rootPath, relativePath, content = 'fixture') {
  const targetPath = path.join(rootPath, ...String(relativePath || '').split('/'))
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content)
  return targetPath
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 50 } = {}) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

function resetContentIndexRuntime() {
  contentIndex.dispose()
  contentIndex._internal.clearAllMaintenanceTimers()
}

function setupIndexTest(t) {
  resetContentIndexRuntime()
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-content-index-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    resetContentIndexRuntime()
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })
  return { tempRoot }
}

test('content index is stored under synced hidden settings directory', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  createFixtureFile(tempRoot, 'note/demo.md', '---\ntitle: Demo Note\n---\n\n# demo\n\npreview body')

  const rebuilt = await contentIndex.rebuildIndex('note', { reason: 'test' })
  const indexPath = path.join(tempRoot, '.ai-tools-settings', 'indexes', 'notes-index-v3.json')

  assert.equal(rebuilt.root, 'note')
  assert.equal(fs.existsSync(indexPath), true)
  const payload = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  const entry = payload.entries[0]
  assert.equal(payload.systemDir, '.ai-tools-settings')
  assert.equal(Array.isArray(payload.entries), true)
  assert.equal(entry.path, 'demo.md')
  assert.equal(entry.title, 'Demo Note')
  assert.match(entry.preview, /demo/i)
  assert.match(entry.searchText, /preview body/i)
})

test('file operations keep note index in sync for write delete and move', async (t) => {
  const { tempRoot } = setupIndexTest(t)

  await fileOperations.writeFile('note/alpha.md', '# alpha')
  let noteIndex = await contentIndex.ensureIndex('note')
  assert.deepEqual(noteIndex.entries.map((entry) => entry.path), ['alpha.md'])

  await fileOperations.moveItem('note/alpha.md', 'note/folder/beta.md')
  noteIndex = await contentIndex.ensureIndex('note')
  assert.deepEqual(noteIndex.entries.map((entry) => entry.path), ['folder/beta.md'])

  await fileOperations.deleteItem('note/folder/beta.md')
  noteIndex = await contentIndex.ensureIndex('note')
  assert.deepEqual(noteIndex.entries.map((entry) => entry.path), [])

  assert.equal(fs.existsSync(path.join(tempRoot, '.ai-tools-settings', 'indexes', 'notes-index-v3.json')), true)
})

test('file operations keep session index in sync and cloud restore marks it dirty', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  const originalGetS3Client = fileOperations._getS3Client
  const originalGetCloudConfig = globalConfig.getCloudConfig

  await fileOperations.writeFile('session/demo.json', '{"title":"demo"}')
  let sessionIndex = await contentIndex.ensureIndex('session')
  assert.deepEqual(sessionIndex.entries.map((entry) => entry.path), ['demo.json'])

  globalConfig.getCloudConfig = () => ({
    region: 'test-region',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket'
  })
  fileOperations._getS3Client = () => ({
    listObjects: async () => ['session/cloud/newer.json'],
    downloadFile: async (_bucket, key, fullPath) => {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, key)
    }
  })

  t.after(() => {
    fileOperations._getS3Client = originalGetS3Client
    globalConfig.getCloudConfig = originalGetCloudConfig
  })

  await fileOperations._restoreFromCloudInternal()
  sessionIndex = await contentIndex._internal.readIndex('session')
  assert.equal(sessionIndex.dirty, true)

  const rebuilt = await contentIndex.ensureIndex('session')
  assert.ok(rebuilt.entries.some((entry) => entry.path === 'cloud/newer.json'))
  assert.ok(rebuilt.entries.some((entry) => entry.path === 'demo.json'))
  assert.equal(fs.existsSync(path.join(tempRoot, 'session', 'demo.json')), true)
})

test('content index watcher filters ignore asset and hidden paths', () => {
  assert.equal(contentIndex._internal.isRelevantWatchedPath('note', 'note/demo.md'), true)
  assert.equal(contentIndex._internal.isRelevantWatchedPath('note', 'note/demo.assets/image.png'), false)
  assert.equal(contentIndex._internal.isRelevantWatchedPath('note', 'note/.hidden/demo.md'), false)

  assert.equal(contentIndex._internal.isRelevantWatchedPath('session', 'session/demo.json'), true)
  assert.equal(contentIndex._internal.isRelevantWatchedPath('session', 'session/demo.json.assets/msg/video.mp4'), false)
  assert.equal(contentIndex._internal.isRelevantWatchedPath('session', 'session/.hidden/demo.json'), false)
})

test('content index search matches note title and session message preview text', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  createFixtureFile(tempRoot, 'note/product/roadmap.md', '---\ntitle: Q3 Product Roadmap\n---\n\nMilestone alpha and beta')
  createFixtureFile(
    tempRoot,
    'session/history/planning.json',
    JSON.stringify({
      title: 'planning session',
      messages: [
        { role: 'user', content: 'Please review the rollback checklist for deployment' },
        { role: 'assistant', content: 'Checklist captured and summarized.' }
      ]
    }, null, 2)
  )

  await contentIndex.rebuildIndex('note', { reason: 'test_search' })
  await contentIndex.rebuildIndex('session', { reason: 'test_search' })

  const noteResult = await contentIndex.searchIndex('note', { query: 'Q3 roadmap' })
  assert.equal(noteResult.returned, 1)
  assert.equal(noteResult.searchMode, 'keyword')
  assert.equal(noteResult.semanticUsed, false)
  assert.equal(noteResult.items[0].path, 'product/roadmap.md')
  assert.equal(noteResult.items[0].title, 'Q3 Product Roadmap')

  const sessionResult = await contentIndex.searchIndex('session', { query: 'rollback checklist' })
  assert.equal(sessionResult.returned, 1)
  assert.equal(sessionResult.items[0].path, 'history/planning.json')
  assert.match(sessionResult.items[0].preview, /rollback checklist/i)
})

test('content index parses and searches super-note metadata and cell content', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  createFixtureFile(
    tempRoot,
    'note/lab/forecast.ipynb',
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        title: 'Quarterly Forecast Lab'
      },
      cells: [
        {
          cell_type: 'markdown',
          id: 'intro',
          metadata: {},
          source: ['Revenue sensitivity analysis']
        },
        {
          cell_type: 'code',
          id: 'calc',
          metadata: { aiTools: { runtime: 'javascript' } },
          source: 'console.log("forecast-scenario-unique")',
          execution_count: null,
          outputs: []
        }
      ]
    }, null, 2)
  )

  const rebuilt = await contentIndex.rebuildIndex('note', { reason: 'notebook_search' })
  const entry = rebuilt.entries.find((item) => item.path === 'lab/forecast.ipynb')
  assert.ok(entry)
  assert.equal(entry.noteType, 'notebook')
  assert.equal(entry.title, 'Quarterly Forecast Lab')
  assert.equal(entry.cellCount, 2)

  const searchResult = await contentIndex.searchIndex('note', { query: 'forecast-scenario-unique' })
  assert.equal(searchResult.returned, 1)
  assert.equal(searchResult.items[0].path, 'lab/forecast.ipynb')
  assert.equal(searchResult.items[0].noteType, 'notebook')
})

test('content index still parses super-note cells when execution outputs exceed the Markdown sample size', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  createFixtureFile(
    tempRoot,
    'note/lab/output-heavy.ipynb',
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          id: 'large-output',
          metadata: { aiTools: { runtime: 'python' } },
          source: 'print("large-output-cell-query")',
          execution_count: 1,
          outputs: [{
            output_type: 'stream',
            name: 'stdout',
            text: 'x'.repeat(48 * 1024)
          }]
        }
      ]
    })
  )

  const rebuilt = await contentIndex.rebuildIndex('note', { reason: 'large_notebook_search' })
  const entry = rebuilt.entries.find((item) => item.path === 'lab/output-heavy.ipynb')
  assert.equal(entry?.noteType, 'notebook')
  assert.equal(entry?.cellCount, 1)

  const searchResult = await contentIndex.searchIndex('note', { query: 'large-output-cell-query' })
  assert.equal(searchResult.returned, 1)
  assert.equal(searchResult.items[0].path, 'lab/output-heavy.ipynb')
})

test('content index skips encrypted notes during rebuild and search', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  const encrypted = await encryptNoteContent('# Secret Note\n\ntoken-unique-abc123', { notePassword: 'note-pass-123' })

  createFixtureFile(tempRoot, 'note/public.md', '# Public Note\n\nvisible body')
  createFixtureFile(tempRoot, 'note/secret.md', encrypted)

  const rebuilt = await contentIndex.rebuildIndex('note', { reason: 'encrypted_skip' })
  assert.deepEqual(rebuilt.entries.map((entry) => entry.path), ['public.md'])

  const searchResult = await contentIndex.searchIndex('note', { query: 'token-unique-abc123' })
  assert.equal(searchResult.returned, 0)
  assert.equal(searchResult.items.length, 0)
})

test('content index removes a note after it becomes encrypted', async (t) => {
  const { tempRoot } = setupIndexTest(t)

  await fileOperations.writeFile('note/transient.md', '# transient note\n\nvisible body')
  let noteIndex = await contentIndex.ensureIndex('note')
  assert.deepEqual(noteIndex.entries.map((entry) => entry.path), ['transient.md'])

  const encrypted = await encryptNoteContent('# transient note\n\nvisible body', { notePassword: 'note-pass-123' })
  await fileOperations.writeFile('note/transient.md', encrypted)

  noteIndex = await contentIndex.ensureIndex('note')
  assert.deepEqual(noteIndex.entries.map((entry) => entry.path), [])

  const indexPath = path.join(tempRoot, '.ai-tools-settings', 'indexes', 'notes-index-v3.json')
  const payload = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  assert.equal(payload.entries.some((entry) => entry.path === 'transient.md'), false)
})

test('content index uses hybrid embedding search when configured', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  storage.delete('global-config')

  createFixtureFile(tempRoot, 'note/finance/billing.md', '---\ntitle: Billing Follow-up\n---\n\nInvoice and payment schedule details')
  createFixtureFile(
    tempRoot,
    'session/history/reschedule.json',
    JSON.stringify({
      title: 'calendar update',
      messages: [
        { role: 'user', content: 'We reviewed availability and calendar changes for next week.' },
        { role: 'assistant', content: 'The meeting can move to Friday afternoon.' }
      ]
    }, null, 2)
  )

  const originalFetch = globalThis.fetch
  function vectorForText(text) {
    const value = String(text || '').toLowerCase()
    if (/(settlement|invoice|billing|payment)/.test(value)) return [1, 0, 0]
    if (/(reschedule|calendar|availability|meeting)/.test(value)) return [0, 1, 0]
    return [0, 0, 1]
  }

  globalThis.fetch = async (_url, options = {}) => {
    const payload = JSON.parse(String(options.body || '{}'))
    const input = Array.isArray(payload.input) ? payload.input.join(' ') : String(payload.input || '')
    const embedding = vectorForText(input)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding }] }),
      text: async () => JSON.stringify({ data: [{ embedding }] })
    }
  }

  globalConfig.addProvider({
    _id: 'test-embedding-provider',
    name: 'Test Embedding Provider',
    providerType: 'openai',
    baseurl: 'https://example.com/v1',
    apikey: 'test-key',
    selectModels: ['test-embed']
  })
  await globalConfig.updateContentSearchConfig({
    searchMode: 'hybrid',
    embedding: {
      providerId: 'test-embedding-provider',
      model: 'test-embed'
    }
  })

  t.after(() => {
    resetContentIndexRuntime()
    globalThis.fetch = originalFetch
    storage.delete('global-config')
  })

  const rebuiltNote = await contentIndex.rebuildIndex('note', { reason: 'hybrid_test' })
  const rebuiltSession = await contentIndex.rebuildIndex('session', { reason: 'hybrid_test' })
  assert.ok(Array.isArray(rebuiltNote.entries[0].embedding))
  assert.ok(rebuiltNote.entries[0].embedding.length > 0)
  assert.ok(Array.isArray(rebuiltSession.entries[0].embedding))
  assert.ok(rebuiltSession.entries[0].embedding.length > 0)

  const noteResult = await contentIndex.searchIndex('note', { query: 'settlement' })
  assert.equal(noteResult.returned, 1)
  assert.equal(noteResult.searchMode, 'hybrid')
  assert.equal(noteResult.semanticUsed, true)
  assert.equal(noteResult.items[0].path, 'finance/billing.md')
  assert.equal(noteResult.items[0].embedding, undefined)

  const sessionResult = await contentIndex.searchIndex('session', { query: 'reschedule' })
  assert.equal(sessionResult.returned, 1)
  assert.equal(sessionResult.searchMode, 'hybrid')
  assert.equal(sessionResult.semanticUsed, true)
  assert.equal(sessionResult.items[0].path, 'history/reschedule.json')
  assert.equal(sessionResult.items[0].embedding, undefined)
})

test('content index sanitizes repeated embedding failures and logs them once per provider', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  storage.delete('global-config')

  createFixtureFile(tempRoot, 'note/finance/alpha.md', '# Alpha\n\ninvoice follow-up')
  createFixtureFile(tempRoot, 'note/finance/beta.md', '# Beta\n\npayment reminder')

  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  const warnings = []

  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: async () => '<!doctype html><html><body>secret-token-123</body></html>'
  })
  console.warn = (...args) => {
    warnings.push(args.map((item) => String(item)).join(' '))
  }

  globalConfig.addProvider({
    _id: 'test-failing-embedding-provider',
    name: 'Test Failing Embedding Provider',
    providerType: 'openai',
    baseurl: 'https://example.com/v1',
    apikey: 'test-key',
    selectModels: ['test-embed-fail']
  })
  await globalConfig.updateContentSearchConfig({
    searchMode: 'hybrid',
    embedding: {
      providerId: 'test-failing-embedding-provider',
      model: 'test-embed-fail'
    }
  })

  t.after(() => {
    resetContentIndexRuntime()
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    storage.delete('global-config')
  })

  const rebuilt = await contentIndex.rebuildIndex('note', { reason: 'hybrid_failure_test' })
  assert.equal(rebuilt.entries.length, 2)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /HTTP 404/i)
  assert.match(warnings[0], /example\.com\/v1\/embeddings/i)
  assert.doesNotMatch(warnings[0], /<!doctype html>/i)
  assert.doesNotMatch(warnings[0], /secret-token-123/i)
})

test('content index auto-maintains note and session indexes after content search config changes', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  storage.delete('global-config')

  createFixtureFile(
    tempRoot,
    'note/finance/billing.md',
    '---\ntitle: Billing Follow-up\n---\n\nInvoice and payment schedule details'
  )
  createFixtureFile(
    tempRoot,
    'session/history/reschedule.json',
    JSON.stringify({
      title: 'calendar update',
      messages: [
        { role: 'user', content: 'We reviewed availability and calendar changes for next week.' },
        { role: 'assistant', content: 'The meeting can move to Friday afternoon.' }
      ]
    }, null, 2)
  )

  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const listeners = new Map()
  function vectorForText(text) {
    const value = String(text || '').toLowerCase()
    if (/(settlement|invoice|billing|payment)/.test(value)) return [1, 0, 0]
    if (/(reschedule|calendar|availability|meeting)/.test(value)) return [0, 1, 0]
    return [0, 0, 1]
  }

  globalThis.window = {
    addEventListener(type, handler) {
      const key = String(type || '')
      const bucket = listeners.get(key) || new Set()
      bucket.add(handler)
      listeners.set(key, bucket)
    },
    removeEventListener(type, handler) {
      const key = String(type || '')
      const bucket = listeners.get(key)
      if (!bucket) return
      bucket.delete(handler)
      if (!bucket.size) listeners.delete(key)
    },
    dispatchEvent(event) {
      const bucket = listeners.get(String(event?.type || ''))
      if (!bucket) return true
      for (const handler of [...bucket]) {
        handler.call(this, event)
      }
      return true
    }
  }
  contentIndex.dispose()
  contentIndex.init()

  globalThis.fetch = async (_url, options = {}) => {
    const payload = JSON.parse(String(options.body || '{}'))
    const input = Array.isArray(payload.input) ? payload.input.join(' ') : String(payload.input || '')
    const embedding = vectorForText(input)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding }] }),
      text: async () => JSON.stringify({ data: [{ embedding }] })
    }
  }

  globalConfig.addProvider({
    _id: 'test-auto-maintain-provider',
    name: 'Test Auto Maintain Provider',
    providerType: 'openai',
    baseurl: 'https://example.com/v1',
    apikey: 'test-key',
    selectModels: ['test-embed']
  })

  t.after(() => {
    contentIndex.dispose()
    globalThis.window = originalWindow
    resetContentIndexRuntime()
    globalThis.fetch = originalFetch
    storage.delete('global-config')
  })

  await globalConfig.updateContentSearchConfig({
    searchMode: 'hybrid',
    embedding: {
      providerId: 'test-auto-maintain-provider',
      model: 'test-embed'
    }
  })

  const rebuilt = await waitFor(async () => {
    const noteIndex = await contentIndex._internal.readIndex('note')
    const sessionIndex = await contentIndex._internal.readIndex('session')
    return !!(
      noteIndex?.entries?.some((entry) => Array.isArray(entry.embedding) && entry.embedding.length > 0)
      && sessionIndex?.entries?.some((entry) => Array.isArray(entry.embedding) && entry.embedding.length > 0)
    )
  })

  assert.equal(rebuilt, true)
})

test('hybrid content index rebuilds after moving a directory', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  storage.delete('global-config')

  createFixtureFile(
    tempRoot,
    'note/finance/billing.md',
    '---\ntitle: Billing Follow-up\n---\n\nInvoice and payment schedule details'
  )

  const originalFetch = globalThis.fetch
  function vectorForText(text) {
    const value = String(text || '').toLowerCase()
    if (value.includes('finance')) return [1, 0, 0]
    if (value.includes('records')) return [0, 1, 0]
    return [0, 0, 1]
  }

  globalThis.fetch = async (_url, options = {}) => {
    const payload = JSON.parse(String(options.body || '{}'))
    const input = Array.isArray(payload.input) ? payload.input.join(' ') : String(payload.input || '')
    const embedding = vectorForText(input)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding }] }),
      text: async () => JSON.stringify({ data: [{ embedding }] })
    }
  }

  globalConfig.addProvider({
    _id: 'test-directory-embedding-provider',
    name: 'Test Directory Embedding Provider',
    providerType: 'openai',
    baseurl: 'https://example.com/v1',
    apikey: 'test-key',
    selectModels: ['test-embed']
  })
  await globalConfig.updateContentSearchConfig({
    searchMode: 'hybrid',
    embedding: {
      providerId: 'test-directory-embedding-provider',
      model: 'test-embed'
    }
  })

  t.after(() => {
    resetContentIndexRuntime()
    globalThis.fetch = originalFetch
    storage.delete('global-config')
  })

  const rebuiltBeforeMove = await contentIndex.rebuildIndex('note', { reason: 'hybrid_move_test' })
  const beforeEmbedding = rebuiltBeforeMove.entries.find((entry) => entry.path === 'finance/billing.md')?.embedding
  assert.ok(Array.isArray(beforeEmbedding))
  assert.ok(beforeEmbedding.length > 0)

  await fileOperations.moveItem('note/finance', 'note/records')

  const dirtyIndex = await contentIndex._internal.readIndex('note')
  assert.equal(dirtyIndex.dirty, true)

  const rebuiltAfterMove = await contentIndex.ensureIndex('note')
  const movedEntry = rebuiltAfterMove.entries.find((entry) => entry.path === 'records/billing.md')
  assert.ok(movedEntry)
  assert.notDeepEqual(movedEntry.embedding, beforeEmbedding)
})

test('readonly notes and sessions Skill actions do not create directories', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  createFixtureFile(tempRoot, 'note/demo/demo.md', '# demo note')
  createFixtureFile(
    tempRoot,
    'session/demo/demo.json',
    JSON.stringify({ title: 'demo session', messages: [{ role: 'user', content: 'hello' }] }, null, 2)
  )

  const originalCreateDirectory = fileOperations.createDirectory
  let createDirectoryCalls = 0
  fileOperations.createDirectory = async (...args) => {
    createDirectoryCalls += 1
    return originalCreateDirectory.apply(fileOperations, args)
  }

  t.after(() => {
    fileOperations.createDirectory = originalCreateDirectory
  })

  const notesRuntime = createBuiltinNotesSkillRuntime({ notesRoot: 'note' })
  const sessionsRuntime = createBuiltinSessionsSkillRuntime({ sessionsRoot: 'session' })

  await notesRuntime.runAction('notes_search', { query: 'demo' })
  await notesRuntime.runAction('notes_list_directory', { dirPath: '' })
  await notesRuntime.runAction('notes_list_tree', { dirPath: '', maxDepth: 2 })

  await sessionsRuntime.runAction('sessions_search', { query: 'demo' })
  await sessionsRuntime.runAction('sessions_list_directory', { dirPath: '' })
  await sessionsRuntime.runAction('sessions_list_tree', { dirPath: '', maxDepth: 2 })

  assert.equal(createDirectoryCalls, 0)
})

test('content index cleanup removes obsolete, conflict, and hybrid caches without embeddings', async (t) => {
  const { tempRoot } = setupIndexTest(t)
  const indexDir = path.join(tempRoot, '.ai-tools-settings', 'indexes')
  fs.mkdirSync(indexDir, { recursive: true })

  const writeIndexFixture = (filename, kind, embeddings) => {
    fs.writeFileSync(path.join(indexDir, filename), JSON.stringify({
      version: 3,
      kind,
      root: kind,
      dirty: false,
      entries: [{ path: 'demo', embedding: embeddings }]
    }))
  }

  fs.writeFileSync(path.join(indexDir, 'notes-index-v2.json'), '{}')
  fs.writeFileSync(path.join(indexDir, 'sessions-index-v3 (SFConflict Dino 2026-07-29).json'), '{}')
  writeIndexFixture('notes-index-v3.json', 'note', [])
  writeIndexFixture('sessions-index-v3.json', 'session', [0.1, 0.2])
  fs.writeFileSync(path.join(indexDir, 'keep-me.json'), '{}')

  const result = await contentIndex._internal.cleanupIndexCacheFiles({
    searchConfig: {
      searchMode: 'hybrid',
      embedding: { providerId: 'provider', model: 'embedding-model' }
    }
  })

  assert.deepEqual(
    result.removed.map((item) => item.filename).sort(),
    [
      'notes-index-v2.json',
      'notes-index-v3.json',
      'sessions-index-v3 (SFConflict Dino 2026-07-29).json'
    ]
  )
  assert.deepEqual(result.rebuildKinds, ['note'])
  assert.equal(fs.existsSync(path.join(indexDir, 'sessions-index-v3.json')), true)
  assert.equal(fs.existsSync(path.join(indexDir, 'keep-me.json')), true)
})
