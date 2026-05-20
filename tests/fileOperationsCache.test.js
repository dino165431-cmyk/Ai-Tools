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

function createFixtureFile(rootPath, relativePath, content = 'fixture') {
  const targetPath = path.join(rootPath, ...String(relativePath || '').split('/'))
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content)
  return targetPath
}

function setupFileOperationsTest(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-file-ops-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const revoked = []
  const createdBlobs = []
  let nextBlobId = 0

  globalConfig.getDataStorageRoot = () => tempRoot
  fileOperations.clearImageBlobCache()
  URL.createObjectURL = (blob) => {
    createdBlobs.push(blob)
    return `blob:test:${++nextBlobId}`
  }
  URL.revokeObjectURL = (url) => revoked.push(url)

  t.after(() => {
    fileOperations.clearImageBlobCache()
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  return { tempRoot, revoked, createdBlobs }
}

test('deleteItem clears cached file blobs for deleted files', async (t) => {
  const { tempRoot, revoked } = setupFileOperationsTest(t)
  createFixtureFile(tempRoot, 'note/demo.md.assets/pic.png')

  const blobUrl = await fileOperations.getFileBlobUrl('note/demo.md.assets/pic.png')
  assert.equal(fileOperations.getCachedFileBlobUrlSync('note/demo.md.assets/pic.png'), blobUrl)

  await fileOperations.deleteItem('note/demo.md.assets/pic.png')

  assert.equal(fileOperations.getCachedFileBlobUrlSync('note/demo.md.assets/pic.png'), null)
  assert.ok(revoked.includes(blobUrl))
})

test('deleteItem clears cached asset blobs for deleted directories', async (t) => {
  const { tempRoot, revoked } = setupFileOperationsTest(t)
  createFixtureFile(tempRoot, 'note/demo.md.assets/cover.png')
  createFixtureFile(tempRoot, 'note/demo.md.assets/nested/inner.png')

  const coverUrl = await fileOperations.getFileBlobUrl('note/demo.md.assets/cover.png')
  const innerUrl = await fileOperations.getFileBlobUrl('note/demo.md.assets/nested/inner.png')

  await fileOperations.deleteItem('note/demo.md.assets')

  assert.equal(fileOperations.getCachedFileBlobUrlSync('note/demo.md.assets/cover.png'), null)
  assert.equal(fileOperations.getCachedFileBlobUrlSync('note/demo.md.assets/nested/inner.png'), null)
  assert.ok(revoked.includes(coverUrl))
  assert.ok(revoked.includes(innerUrl))
})

test('deleteItem retries transient busy directory deletes on Windows-like errors', async (t) => {
  const { tempRoot } = setupFileOperationsTest(t)
  const originalRm = fs.promises.rm
  let attempts = 0

  createFixtureFile(tempRoot, 'note/HuggingFace/demo.md', 'demo')

  fs.promises.rm = async (...args) => {
    attempts += 1
    if (attempts === 1) {
      const err = new Error('resource busy or locked')
      err.code = 'EBUSY'
      throw err
    }
    return originalRm.apply(fs.promises, args)
  }

  t.after(() => {
    fs.promises.rm = originalRm
  })

  await fileOperations.deleteItem('note/HuggingFace')

  assert.ok(attempts >= 2)
  assert.equal(fs.existsSync(path.join(tempRoot, 'note', 'HuggingFace')), false)
})

test('moveItem clears cached source and destination blobs when overwriting', async (t) => {
  const { tempRoot, revoked } = setupFileOperationsTest(t)
  createFixtureFile(tempRoot, 'note/from.md.assets/pic.png', 'from')
  createFixtureFile(tempRoot, 'note/to.md.assets/pic.png', 'to')

  const fromUrl = await fileOperations.getFileBlobUrl('note/from.md.assets/pic.png')
  const toUrl = await fileOperations.getFileBlobUrl('note/to.md.assets/pic.png')

  await fileOperations.moveItem('note/from.md.assets/pic.png', 'note/to.md.assets/pic.png', { overwrite: true })

  assert.equal(fileOperations.getCachedFileBlobUrlSync('note/from.md.assets/pic.png'), null)
  assert.equal(fileOperations.getCachedFileBlobUrlSync('note/to.md.assets/pic.png'), null)
  assert.ok(revoked.includes(fromUrl))
  assert.ok(revoked.includes(toUrl))
  assert.equal(fs.existsSync(path.join(tempRoot, 'note', 'from.md.assets', 'pic.png')), false)
  assert.equal(fs.existsSync(path.join(tempRoot, 'note', 'to.md.assets', 'pic.png')), true)
})

test('getFileBlobUrl assigns video mime types from file extension', async (t) => {
  const { tempRoot, createdBlobs } = setupFileOperationsTest(t)
  createFixtureFile(tempRoot, 'session/history/demo.json.assets/msg/video.mp4', 'video')

  await fileOperations.getFileBlobUrl('session/history/demo.json.assets/msg/video.mp4')

  assert.equal(createdBlobs.at(-1)?.type, 'video/mp4')
})

test('syncToCloud uploads local files even when the remote key already exists', async (t) => {
  const originalGetS3Client = fileOperations._getS3Client
  const originalGetLocalFiles = fileOperations._getLocalFiles
  const originalResolvePath = fileOperations._resolvePath
  const originalGetCloudConfig = globalConfig.getCloudConfig
  const uploaded = []
  const deleted = []
  const progress = []

  globalConfig.getCloudConfig = () => ({
    region: 'test-region',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket'
  })
  fileOperations._getLocalFiles = async () => ['note/existing.md', 'note/local-only.md']
  fileOperations._resolvePath = (relativePath) => `abs:${relativePath}`
  fileOperations._getS3Client = () => ({
    listObjects: async () => ['note/existing.md', 'note/remote-only.md'],
    uploadFile: async (bucket, fullPath, relPath, options) => {
      uploaded.push({ bucket, fullPath, relPath, options })
    },
    deleteFile: async (bucket, key) => {
      deleted.push({ bucket, key })
    }
  })

  t.after(() => {
    fileOperations._getS3Client = originalGetS3Client
    fileOperations._getLocalFiles = originalGetLocalFiles
    fileOperations._resolvePath = originalResolvePath
    globalConfig.getCloudConfig = originalGetCloudConfig
  })

  const result = await fileOperations._syncToCloudInternal((current, total) => {
    progress.push([current, total])
  })

  assert.deepEqual(uploaded, [
    {
      bucket: 'test-bucket',
      fullPath: 'abs:note/existing.md',
      relPath: 'note/existing.md',
      options: { metadata: {} }
    },
    {
      bucket: 'test-bucket',
      fullPath: 'abs:note/local-only.md',
      relPath: 'note/local-only.md',
      options: { metadata: {} }
    }
  ])
  assert.deepEqual(deleted, [
    { bucket: 'test-bucket', key: 'note/remote-only.md' }
  ])
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]])
  assert.deepEqual(result, { uploaded: 2, deleted: 1 })
})

test('backupToCloud uploads source mtime metadata for auto decision', async (t) => {
  const { tempRoot } = setupFileOperationsTest(t)
  const originalGetS3Client = fileOperations._getS3Client
  const originalGetCloudConfig = globalConfig.getCloudConfig
  const uploads = []
  const localFile = createFixtureFile(tempRoot, 'note/mtime.md', 'mtime')
  const mtime = new Date('2025-04-05T06:07:08Z')

  fs.utimesSync(localFile, mtime, mtime)
  globalConfig.getCloudConfig = () => ({
    region: 'test-region',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket'
  })
  fileOperations._getS3Client = () => ({
    uploadFile: async (bucket, fullPath, relPath, options) => {
      uploads.push({ bucket, fullPath, relPath, options })
    }
  })

  t.after(() => {
    fileOperations._getS3Client = originalGetS3Client
    globalConfig.getCloudConfig = originalGetCloudConfig
  })

  const result = await fileOperations._backupToCloudInternal()

  assert.deepEqual(result, { uploaded: 1 })
  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].relPath, 'note/mtime.md')
  assert.equal(
    uploads[0].options?.metadata?.['source-mtime-ms'],
    String(mtime.getTime())
  )
})

test('restoreFromCloud dispatches tree refresh events for restored roots', async (t) => {
  const { tempRoot } = setupFileOperationsTest(t)
  const originalGetS3Client = fileOperations._getS3Client
  const originalResolvePath = fileOperations._resolvePath
  const originalGetCloudConfig = globalConfig.getCloudConfig
  const originalWindow = globalThis.window
  const downloads = []
  const dispatched = []

  globalConfig.getCloudConfig = () => ({
    region: 'test-region',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket'
  })
  globalThis.window = {
    CustomEvent,
    dispatchEvent(event) {
      dispatched.push({ type: event?.type, detail: event?.detail })
      return true
    }
  }
  fileOperations._resolvePath = (relativePath) => path.join(tempRoot, ...String(relativePath || '').split('/'))
  fileOperations._getS3Client = () => ({
    listObjects: async () => [
      'note/demo.md',
      'chat-memory/memory-store.json',
      'session/history/demo.json'
    ],
    downloadFile: async (bucket, key, fullPath) => {
      fs.writeFileSync(fullPath, key)
      downloads.push({ bucket, key, fullPath })
      return {
        metadata: {
          'source-mtime-ms': String(new Date('2025-02-02T03:04:05Z').getTime())
        }
      }
    }
  })

  t.after(() => {
    fileOperations._getS3Client = originalGetS3Client
    fileOperations._resolvePath = originalResolvePath
    globalConfig.getCloudConfig = originalGetCloudConfig
    globalThis.window = originalWindow
  })

  const result = await fileOperations._restoreFromCloudInternal()

  assert.deepEqual(result, { downloaded: 3 })
  assert.deepEqual(downloads, [
    { bucket: 'test-bucket', key: 'note/demo.md', fullPath: path.join(tempRoot, 'note', 'demo.md') },
    { bucket: 'test-bucket', key: 'chat-memory/memory-store.json', fullPath: path.join(tempRoot, 'chat-memory', 'memory-store.json') },
    { bucket: 'test-bucket', key: 'session/history/demo.json', fullPath: path.join(tempRoot, 'session', 'history', 'demo.json') }
  ])
  assert.deepEqual(
    dispatched.map((item) => item.type),
    ['storageFilesChanged', 'noteFilesChanged', 'sessionFilesChanged', 'memoryStoreChanged']
  )
  assert.deepEqual(dispatched.find((item) => item.type === 'noteFilesChanged')?.detail, {
    path: 'note',
    paths: ['note']
  })
  assert.deepEqual(dispatched.find((item) => item.type === 'sessionFilesChanged')?.detail, {
    path: 'session',
    paths: ['session']
  })
  assert.deepEqual(dispatched.find((item) => item.type === 'memoryStoreChanged')?.detail, {
    path: 'chat-memory',
    paths: ['chat-memory']
  })
  assert.equal(
    fs.statSync(path.join(tempRoot, 'note', 'demo.md')).mtime.getTime(),
    new Date('2025-02-02T03:04:05Z').getTime()
  )
})

test('cloud auto decision prefers the newer side by file timestamps', async (t) => {
  const { tempRoot } = setupFileOperationsTest(t)
  const originalGetS3Client = fileOperations._getS3Client
  const originalGetCloudConfig = globalConfig.getCloudConfig
  const localFile = createFixtureFile(tempRoot, 'note/local.md', 'local')

  fs.utimesSync(localFile, new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'))
  globalConfig.getCloudConfig = () => ({
    region: 'test-region',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket'
  })
  fileOperations._getS3Client = () => ({
    listObjects: async () => ['note/cloud.md'],
    headObject: async (_bucket, key) => ({
      lastModified: key === 'note/cloud.md'
        ? new Date('2025-02-01T00:00:00Z')
        : new Date('2025-01-01T00:00:00Z')
    })
  })

  t.after(() => {
    fileOperations._getS3Client = originalGetS3Client
    globalConfig.getCloudConfig = originalGetCloudConfig
  })

  assert.equal(await fileOperations._resolveCloudAutoDecision(), 'restore')

  fs.utimesSync(localFile, new Date('2025-03-01T00:00:00Z'), new Date('2025-03-01T00:00:00Z'))
  assert.equal(await fileOperations._resolveCloudAutoDecision(), 'backup')
})

test('manual cloud operations clear queued auto timers before running', async (t) => {
  setupFileOperationsTest(t)
  const originalClearDecision = fileOperations._clearCloudAutoDecisionTimer
  const originalClearBackup = fileOperations._clearCloudAutoBackupTimer
  const originalClearRestore = fileOperations._clearCloudAutoRestoreTimer
  const originalRunExclusive = fileOperations._runExclusiveCloudOperation
  const calls = []

  fileOperations._clearCloudAutoDecisionTimer = () => { calls.push('clearDecision') }
  fileOperations._clearCloudAutoBackupTimer = () => { calls.push('clearBackup') }
  fileOperations._clearCloudAutoRestoreTimer = () => { calls.push('clearRestore') }
  fileOperations._runExclusiveCloudOperation = async (operation) => {
    calls.push('run')
    return await operation()
  }

  t.after(() => {
    fileOperations._clearCloudAutoDecisionTimer = originalClearDecision
    fileOperations._clearCloudAutoBackupTimer = originalClearBackup
    fileOperations._clearCloudAutoRestoreTimer = originalClearRestore
    fileOperations._runExclusiveCloudOperation = originalRunExclusive
  })

  const result = await fileOperations._runManualCloudOperation(async () => 'ok')

  assert.equal(result, 'ok')
  assert.deepEqual(calls.slice(0, 4), ['clearDecision', 'clearBackup', 'clearRestore', 'run'])
})

test('external tree refresh marks indexes dirty and dispatches root events', async (t) => {
  const { tempRoot } = setupFileOperationsTest(t)
  const originalWindow = globalThis.window
  const dispatched = []

  createFixtureFile(tempRoot, 'note/demo.md', '# demo')
  await require('../public/preload/utils/content-index.js').ensureIndex('note')

  globalThis.window = {
    CustomEvent,
    dispatchEvent(event) {
      dispatched.push({ type: event?.type, detail: event?.detail })
      return true
    }
  }

  t.after(() => {
    globalThis.window = originalWindow
  })

  fileOperations._internalMutationSuppressUntil.clear()
  fileOperations._queueExternalTreeRefresh('note', 'note/outside.md')
  await new Promise((resolve) => setTimeout(resolve, 700))

  const contentIndex = require('../public/preload/utils/content-index.js')
  const noteIndex = await contentIndex._internal.readIndex('note')

  assert.equal(noteIndex.dirty, true)
  assert.deepEqual(
    dispatched.map((item) => item.type),
    ['storageFilesChanged', 'noteFilesChanged']
  )
  assert.deepEqual(dispatched.find((item) => item.type === 'noteFilesChanged')?.detail, {
    path: 'note/outside.md',
    rootPath: 'note',
    paths: ['note/outside.md']
  })
})
