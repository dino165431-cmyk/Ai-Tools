import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

function loadFileOperationsModule(overrides = {}) {
  const filePath = path.resolve('public/preload/utils/file-operations.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const require = createRequire(import.meta.url)
  const module = { exports: {} }
  const timers = new Set()

  const mockFsSync = overrides.fsSync || {
    watch() {
      return {
        close() {}
      }
    },
    readdirSync() {
      return []
    },
    statSync() {
      return {
        mtimeMs: 0,
        size: 0
      }
    },
    mkdirSync() {}
  }

  const mockFsPromises = overrides.fsPromises || {
    mkdir: async () => {},
    writeFile: async () => {},
    readFile: async () => '',
    stat: async () => ({ isDirectory: () => false, isFile: () => true }),
    readdir: async () => [],
    access: async () => {},
    unlink: async () => {},
    rm: async () => {},
    copyFile: async () => {},
    rename: async () => {},
    open: async () => ({
      read: async () => ({ bytesRead: 0 }),
      close: async () => {}
    })
  }

  const mockContentIndex = overrides.contentIndex || {
    markDirtyByPath: async () => {},
    markDirtyRoots: async () => {},
    upsertPath: async () => {},
    removePath: async () => {},
    movePath: async () => {},
    _internal: {
      isRelevantWatchedPath: () => true
    }
  }

  const mockGlobalConfig = overrides.globalConfig || {
    getDataStorageRoot() {
      return path.resolve('tmp-watch-root')
    },
    getCloudConfig() {
      return {}
    }
  }

  const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === 'fs') {
        return {
          ...mockFsSync,
          promises: mockFsPromises
        }
      }
      if (specifier === './content-index') return mockContentIndex
      if (specifier === './global-config') return mockGlobalConfig
      if (specifier === './s3-operations') {
        return class MockS3ClientWrapper {}
      }
      return require(specifier)
    },
    __filename: filePath,
    __dirname: path.dirname(filePath),
    console,
    Buffer,
    URL,
    Blob,
    process: overrides.process || { platform: 'linux' },
    setTimeout,
    clearTimeout,
    setInterval(fn, ms) {
      const id = setInterval(fn, ms)
      timers.add(id)
      return id
    },
    clearInterval(id) {
      timers.delete(id)
      clearInterval(id)
    }
  })

  const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`
  const script = new vm.Script(wrapped, { filename: filePath })
  const fn = script.runInContext(context)
  fn(module.exports, context.require, module, filePath, path.dirname(filePath))

  return {
    instance: module.exports,
    cleanup() {
      for (const timer of timers) clearInterval(timer)
      timers.clear()
      try {
        module.exports.dispose?.()
      } catch {
        // ignore test cleanup failures
      }
    }
  }
}

test('prefers native recursive watcher when supported', () => {
  const watchCalls = []
  const { instance, cleanup } = loadFileOperationsModule({
    fsSync: {
      watch(targetPath, options) {
        watchCalls.push({ targetPath, options })
        return {
          close() {}
        }
      },
      readdirSync() {
        return []
      },
      statSync() {
        return {
          mtimeMs: 0,
          size: 0
        }
      },
      mkdirSync() {}
    },
    process: { platform: 'win32' }
  })

  try {
    instance._startExternalWatcherForRoot('note', path.resolve('tmp-watch-root/note'))
    const entry = instance._externalWatchers.get('note')
    assert.equal(entry.mode, 'native-recursive')
    assert.equal(watchCalls.length, 1)
    assert.equal(watchCalls[0].options.recursive, true)
    assert.equal(instance._recursiveExternalWatchSupported, true)
  } finally {
    cleanup()
  }
})

test('falls back to directory tree watchers when recursive mode is unavailable', () => {
  const watchCalls = []
  const unsupportedRecursive = Object.assign(new Error('recursive watch unavailable'), {
    code: 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'
  })

  const { instance, cleanup } = loadFileOperationsModule({
    fsSync: {
      watch(targetPath, options) {
        watchCalls.push({ targetPath, options })
        if (options?.recursive) throw unsupportedRecursive
        return {
          close() {}
        }
      },
      readdirSync() {
        return []
      },
      statSync() {
        return {
          mtimeMs: 0,
          size: 0
        }
      },
      mkdirSync() {}
    },
    process: { platform: 'linux' }
  })

  try {
    instance._startExternalWatcherForRoot('note', path.resolve('tmp-watch-root/note'))
    const entry = instance._externalWatchers.get('note')
    assert.equal(entry.mode, 'directory-tree')
    assert.equal(entry.childWatchers.size, 1)
    assert.equal(watchCalls.length, 2)
    assert.equal(watchCalls[0].options.recursive, true)
    assert.equal(typeof watchCalls[1].options, 'function')
    assert.equal(instance._recursiveExternalWatchSupported, false)
  } finally {
    cleanup()
  }
})

test('falls back to polling when fs.watch is entirely unavailable', () => {
  const watchCalls = []
  const watchError = Object.assign(new Error('watch unavailable'), {
    code: 'ENOSYS'
  })

  const { instance, cleanup } = loadFileOperationsModule({
    fsSync: {
      watch(targetPath, options) {
        watchCalls.push({ targetPath, options })
        throw watchError
      },
      readdirSync() {
        return []
      },
      statSync() {
        return {
          mtimeMs: 0,
          size: 0
        }
      },
      mkdirSync() {}
    },
    process: { platform: 'linux' }
  })

  try {
    instance._recursiveExternalWatchSupported = false
    instance._startExternalWatcherForRoot('session', path.resolve('tmp-watch-root/session'))
    const entry = instance._externalWatchers.get('session')
    assert.equal(entry.mode, 'polling')
    assert.equal(typeof entry.pollTimer, 'object')
    assert.equal(watchCalls.length, 1)
  } finally {
    cleanup()
  }
})
