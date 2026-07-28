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
const createBuiltinSessionsSkillRuntime = require('../public/preload/builtin-skills/inspect-session-history/runtime.js')

function createFixtureFile(rootPath, relativePath, content = '{}') {
  const targetPath = path.join(rootPath, ...String(relativePath || '').split('/'))
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content)
  return targetPath
}

function flattenTreeNames(node, out = []) {
  if (!node) return out
  out.push(node.name)
  ;(node.children || []).forEach((child) => flattenTreeNames(child, out))
  return out
}

test('sessions Skill runtime tree hides per-session asset directories', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-sessions-mcp-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'session/story.json', '{"title":"story"}')
  createFixtureFile(tempRoot, 'session/story.json.assets/msg/video.mp4', 'video')
  createFixtureFile(tempRoot, 'session/folder/record.json', '{"title":"record"}')

  const runtime = createBuiltinSessionsSkillRuntime({ sessionsRoot: 'session' })
  const result = await runtime.runAction('sessions_list_tree', {})
  const names = flattenTreeNames(result.tree)

  assert.ok(names.includes('story'))
  assert.ok(names.includes('folder'))
  assert.ok(names.includes('record'))
  assert.equal(names.includes('story.json.assets'), false)
})

test('sessions Skill runtime directory listing returns direct children only', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-sessions-dir-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'session/jobs/run-1.json', '{"title":"run-1"}')
  createFixtureFile(tempRoot, 'session/jobs/nested/run-2.json', '{"title":"run-2"}')
  createFixtureFile(tempRoot, 'session/jobs/run-1.json.assets/a.txt', 'asset')

  const runtime = createBuiltinSessionsSkillRuntime({ sessionsRoot: 'session' })
  const result = await runtime.runAction('sessions_list_directory', { dirPath: 'jobs' })

  assert.equal(result.dirPath, 'jobs')
  assert.equal(result.items.some((item) => item.path.includes('.json.assets')), false)
  assert.deepEqual(
    result.items.map((item) => item.path),
    ['jobs/nested', 'jobs/run-1.json']
  )
})

test('sessions Skill runtime tree defaults to shallow depth and supports deeper maxDepth', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-sessions-tree-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'session/cron/task-a/log-1.json', '{"title":"log-1"}')

  const runtime = createBuiltinSessionsSkillRuntime({ sessionsRoot: 'session' })
  const shallow = await runtime.runAction('sessions_list_tree', {})
  const cronNode = shallow.tree.children.find((item) => item.path === 'cron')
  const taskNode = cronNode?.children?.find((item) => item.path === 'cron/task-a')

  assert.equal(shallow.maxDepth, 2)
  assert.ok(cronNode)
  assert.ok(taskNode)
  assert.equal(taskNode.hasMore, true)
  assert.deepEqual(taskNode.children, [])

  const deep = await runtime.runAction('sessions_list_tree', { maxDepth: 4 })
  const deepCronNode = deep.tree.children.find((item) => item.path === 'cron')
  const deepTaskNode = deepCronNode?.children?.find((item) => item.path === 'cron/task-a')

  assert.equal(deep.maxDepth, 4)
  assert.ok(deepTaskNode?.children?.some((item) => item.path === 'cron/task-a/log-1.json'))
})

test('sessions Skill runtime recent listing sorts by mtime descending', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-sessions-recent-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const older = createFixtureFile(tempRoot, 'session/older.json', '{"title":"older"}')
  const newer = createFixtureFile(tempRoot, 'session/newer.json', '{"title":"newer"}')
  const now = Date.now()
  fs.utimesSync(older, now / 1000 - 120, now / 1000 - 120)
  fs.utimesSync(newer, now / 1000, now / 1000)

  const runtime = createBuiltinSessionsSkillRuntime({ sessionsRoot: 'session' })
  const result = await runtime.runAction('sessions_list_recent', { limit: 10 })

  assert.deepEqual(
    result.items.map((item) => item.path),
    ['newer.json', 'older.json']
  )
})

test('sessions Skill runtime search finds sessions by name and path fragments', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-sessions-search-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(tempRoot, 'session/cron/nightly-run.json', '{"title":"nightly"}')
  createFixtureFile(tempRoot, 'session/manual/debug-log.json', '{"title":"debug"}')

  const runtime = createBuiltinSessionsSkillRuntime({ sessionsRoot: 'session' })
  const result = await runtime.runAction('sessions_search', { query: 'nightly' })

  assert.equal(result.returned, 1)
  assert.equal(result.items[0].path, 'cron/nightly-run.json')
})

test('sessions Skill runtime search matches title and message preview text', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-sessions-search-title-'))
  const originalGetDataStorageRoot = globalConfig.getDataStorageRoot
  globalConfig.getDataStorageRoot = () => tempRoot
  t.after(() => {
    globalConfig.getDataStorageRoot = originalGetDataStorageRoot
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  createFixtureFile(
    tempRoot,
    'session/projects/review.json',
    JSON.stringify({
      title: 'deployment review',
      messages: [
        { role: 'user', content: 'Please verify the rollback checklist before release' },
        { role: 'assistant', content: 'Rollback checklist verified.' }
      ]
    }, null, 2)
  )

  const runtime = createBuiltinSessionsSkillRuntime({ sessionsRoot: 'session' })
  const result = await runtime.runAction('sessions_search', { query: 'rollback checklist' })

  assert.equal(result.returned, 1)
  assert.equal(result.items[0].path, 'projects/review.json')
  assert.equal(result.items[0].title, 'deployment review')
})
