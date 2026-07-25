import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

function loadContentIndexModule(overrides = {}) {
  const filePath = path.resolve('public/preload/utils/content-index.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const require = createRequire(import.meta.url)
  const module = { exports: {} }

  const mockFsPromises = overrides.fsPromises || {
    readFile: async () => '',
    writeFile: async () => {},
    mkdir: async () => {},
    rename: async () => {},
    unlink: async () => {},
    stat: async () => ({ isFile: () => true, size: 0, mtimeMs: 0 }),
    readdir: async () => [],
    open: async () => ({
      read: async () => ({ bytesRead: 0 }),
      close: async () => {}
    })
  }

  const mockGlobalConfig = overrides.globalConfig || {
    getDataStorageRoot() {
      return path.resolve('.tmp-utools')
    },
    getConfig() {
      return {}
    }
  }

  const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === 'fs') return { promises: mockFsPromises }
      if (specifier === './global-config') return mockGlobalConfig
      if (specifier === './contentSearchConfig') {
        return {
          DEFAULT_CONTENT_SEARCH_CONFIG: {
            searchMode: 'keyword',
            embedding: { providerId: '', model: '' }
          },
          normalizeContentSearchConfig(value = {}) {
            return {
              searchMode: value.searchMode === 'hybrid' ? 'hybrid' : 'keyword',
              embedding: {
                providerId: String(value?.embedding?.providerId || ''),
                model: String(value?.embedding?.model || '')
              }
            }
          }
        }
      }
      return require(specifier)
    },
    __filename: filePath,
    __dirname: path.dirname(filePath),
    console,
    Buffer,
    process,
    setTimeout: overrides.setTimeout || setTimeout,
    clearTimeout: overrides.clearTimeout || clearTimeout
  })

  const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`
  const script = new vm.Script(wrapped, { filename: filePath })
  const fn = script.runInContext(context)
  fn(module.exports, context.require, module, filePath, path.dirname(filePath))
  return module.exports
}

function createIndexPayload({ dirty = true, entries = [] } = {}) {
  return JSON.stringify({
    version: 2,
    kind: 'session',
    root: 'session',
    systemDir: '.ai-tools-settings',
    builtAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    dirty,
    reason: dirty ? 'mutation' : 'ok',
    entries,
    searchConfig: {
      searchMode: 'keyword',
      embedding: { providerId: '', model: '' }
    },
    searchConfigSignature: 'keyword||'
  })
}

test('content index listRecent returns stale items without immediate rebuild when index is dirty', async () => {
  let readdirCalls = 0
  const scheduled = []
  const payload = createIndexPayload({
    dirty: true,
    entries: [
      {
        type: 'session',
        path: 'foo.json',
        name: 'foo',
        filename: 'foo.json',
        dirPath: '',
        size: 1,
        mtimeMs: 200,
        title: 'Foo',
        preview: 'Bar',
        searchText: 'foo bar',
        embedding: []
      }
    ]
  })

  const contentIndex = loadContentIndexModule({
    fsPromises: {
      readFile: async () => payload,
      writeFile: async () => {},
      mkdir: async () => {},
      rename: async () => {},
      unlink: async () => {},
      stat: async () => ({ isFile: () => true, size: payload.length, mtimeMs: Date.now() }),
      readdir: async () => {
        readdirCalls += 1
        return []
      },
      open: async () => ({
        read: async () => ({ bytesRead: 0 }),
        close: async () => {}
      })
    },
    setTimeout(fn, delay) {
      scheduled.push({ fn, delay })
      return scheduled.length
    },
    clearTimeout() {}
  })

  const result = await contentIndex.listRecent('session', { limit: 10 })
  assert.equal(result.returned, 1)
  assert.equal(result.items[0].path, 'foo.json')
  assert.equal(readdirCalls, 0)
  assert.equal(scheduled.length, 1)
})

test('content index searchIndex returns stale keyword matches without immediate rebuild when index is dirty', async () => {
  let readdirCalls = 0
  const scheduled = []
  const payload = createIndexPayload({
    dirty: true,
    entries: [
      {
        type: 'session',
        path: 'foo.json',
        name: 'foo',
        filename: 'foo.json',
        dirPath: '',
        size: 1,
        mtimeMs: 200,
        title: 'Deploy failure',
        preview: 'Tool call timeout',
        searchText: 'deploy failure tool call timeout',
        embedding: []
      }
    ]
  })

  const contentIndex = loadContentIndexModule({
    fsPromises: {
      readFile: async () => payload,
      writeFile: async () => {},
      mkdir: async () => {},
      rename: async () => {},
      unlink: async () => {},
      stat: async () => ({ isFile: () => true, size: payload.length, mtimeMs: Date.now() }),
      readdir: async () => {
        readdirCalls += 1
        return []
      },
      open: async () => ({
        read: async () => ({ bytesRead: 0 }),
        close: async () => {}
      })
    },
    setTimeout(fn, delay) {
      scheduled.push({ fn, delay })
      return scheduled.length
    },
    clearTimeout() {}
  })

  const result = await contentIndex.searchIndex('session', { query: 'deploy failure', limit: 10 })
  assert.equal(result.returned, 1)
  assert.equal(result.items[0].path, 'foo.json')
  assert.equal(result.searchMode, 'keyword')
  assert.equal(result.semanticUsed, false)
  assert.equal(readdirCalls, 0)
  assert.equal(scheduled.length, 1)
})
