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
    setTimeout,
    clearTimeout
  })

  const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`
  const script = new vm.Script(wrapped, { filename: filePath })
  const fn = script.runInContext(context)
  fn(module.exports, context.require, module, filePath, path.dirname(filePath))
  return module.exports
}

test('content index readIndex recovers from concatenated trailing JSON', async () => {
  const indexPayload = {
    version: 2,
    kind: 'session',
    root: 'session',
    systemDir: '.ai-tools-settings',
    builtAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    dirty: false,
    reason: 'ok',
    entries: [
      {
        type: 'session',
        path: 'foo.json',
        name: 'foo',
        filename: 'foo.json',
        dirPath: '',
        size: 123,
        mtimeMs: 456,
        title: 'Foo',
        preview: 'Bar',
        searchText: 'Foo Bar',
        embedding: []
      }
    ],
    searchConfig: {
      searchMode: 'keyword',
      embedding: { providerId: '', model: '' }
    },
    searchConfigSignature: 'keyword||'
  }

  const corruptedText = `${JSON.stringify(indexPayload, null, 2)}\n{"extra":true}`
  const contentIndex = loadContentIndexModule({
    fsPromises: {
      readFile: async () => corruptedText,
      writeFile: async () => {},
      mkdir: async () => {},
      rename: async () => {},
      unlink: async () => {},
      stat: async () => ({ isFile: () => true, size: corruptedText.length, mtimeMs: Date.now() }),
      readdir: async () => [],
      open: async () => ({
        read: async () => ({ bytesRead: 0 }),
        close: async () => {}
      })
    }
  })

  const index = await contentIndex._internal.readIndex('session')
  assert.ok(index)
  assert.equal(index.kind, 'session')
  assert.equal(index.entries.length, 1)
  assert.equal(index.entries[0].path, 'foo.json')
})
