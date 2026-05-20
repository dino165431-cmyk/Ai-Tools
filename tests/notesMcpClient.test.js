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
const createBuiltinNotesMcpClient = require('../public/preload/builtins/notes-mcp-client.js')

import { encryptNoteContent } from '../src/utils/noteEncryption.js'

function createFixtureFile(rootPath, relativePath, content = '') {
  const targetPath = path.join(rootPath, ...String(relativePath || '').split('/'))
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content)
  return targetPath
}

test('notes MCP directory listing skips asset directories and returns direct children only', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-notes-mcp-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'note/Project/todo.md', '# todo')
  createFixtureFile(tempRoot, 'note/Project/sub/plan.md', '# plan')
  createFixtureFile(tempRoot, 'note/Project/todo.assets/image.png', 'binary')
  createFixtureFile(tempRoot, 'note/README.md', '# readme')

  const client = createBuiltinNotesMcpClient({ notesRoot: 'note' })
  const result = await client.callTool('notes_list_directory', { dirPath: 'Project' })

  assert.equal(result.dirPath, 'Project')
  assert.equal(result.items.some((item) => item.path.includes('.assets')), false)
  assert.deepEqual(
    result.items.map((item) => item.path),
    ['Project/sub', 'Project/todo.md']
  )
})

test('notes MCP tree defaults to shallow depth and can expand with maxDepth', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-notes-tree-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'note/Area/Sub/leaf.md', '# leaf')

  const client = createBuiltinNotesMcpClient({ notesRoot: 'note' })
  const shallow = await client.callTool('notes_list_tree', {})
  const areaNode = shallow.tree.children.find((item) => item.path === 'Area')
  const subNode = areaNode?.children?.find((item) => item.path === 'Area/Sub')

  assert.equal(shallow.maxDepth, 2)
  assert.ok(areaNode)
  assert.ok(subNode)
  assert.equal(subNode.hasMore, true)
  assert.deepEqual(subNode.children, [])

  const deep = await client.callTool('notes_list_tree', { maxDepth: 4 })
  const deepAreaNode = deep.tree.children.find((item) => item.path === 'Area')
  const deepSubNode = deepAreaNode?.children?.find((item) => item.path === 'Area/Sub')

  assert.equal(deep.maxDepth, 4)
  assert.ok(deepSubNode?.children?.some((item) => item.path === 'Area/Sub/leaf.md'))
})

test('notes MCP recent listing sorts by mtime descending', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-notes-recent-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const older = createFixtureFile(tempRoot, 'note/older.md', '# older')
  const newer = createFixtureFile(tempRoot, 'note/newer.md', '# newer')
  const now = Date.now()
  fs.utimesSync(older, now / 1000 - 120, now / 1000 - 120)
  fs.utimesSync(newer, now / 1000, now / 1000)

  const client = createBuiltinNotesMcpClient({ notesRoot: 'note' })
  const result = await client.callTool('notes_list_recent', { limit: 10 })

  assert.deepEqual(
    result.items.map((item) => item.path),
    ['newer.md', 'older.md']
  )
})

test('notes MCP search finds notes by name and path fragments', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-notes-search-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'note/projects/api-design.md', '# api')
  createFixtureFile(tempRoot, 'note/projects/ui-plan.md', '# ui')

  const client = createBuiltinNotesMcpClient({ notesRoot: 'note' })
  const result = await client.callTool('notes_search', { query: 'api' })

  assert.equal(result.returned, 1)
  assert.equal(result.items[0].path, 'projects/api-design.md')
})

test('notes MCP search matches note title metadata', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-notes-search-title-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'note/research/weekly.md', '---\ntitle: Weekly Research Digest\n---\n\nStatus update')

  const client = createBuiltinNotesMcpClient({ notesRoot: 'note' })
  const result = await client.callTool('notes_search', { query: 'research digest' })

  assert.equal(result.returned, 1)
  assert.equal(result.items[0].path, 'research/weekly.md')
  assert.equal(result.items[0].title, 'Weekly Research Digest')
})

test('notes MCP refuses to read encrypted notes', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-notes-read-encrypted-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const encrypted = await encryptNoteContent('# hidden\n\nsecret body', { notePassword: 'note-pass-123' })
  createFixtureFile(tempRoot, 'note/secret.md', encrypted)

  const client = createBuiltinNotesMcpClient({ notesRoot: 'note' })
  await assert.rejects(
    () => client.callTool('notes_read', { path: 'secret.md' }),
    /\u5df2\u52a0\u5bc6|\u89e3\u9501|\u89e3\u9396/
  )
})
