import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  PACKAGE_SCHEMA_VERSION,
  MAX_SKILL_PACKAGE_DOWNLOAD_BYTES,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_FILE_COUNT,
  normalizeSkillPackage
} = require('../public/preload/utils/skill-package.js')

function createPackage(files, overrides = {}) {
  return {
    kind: 'ai-tools-skill-package',
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    skill: {
      _id: 'skill_download_limits',
      name: 'Download limits',
      content: ''
    },
    files,
    ...overrides
  }
}

test('Skill package limits allow practical script bundles above the former 2MiB cap', () => {
  const script = Buffer.alloc(2 * 1024 * 1024 + 128 * 1024, 0x61)
  const normalized = normalizeSkillPackage(createPackage([
    {
      path: 'SKILL.md',
      encoding: 'utf8',
      content: '---\nname: download-limits\ndescription: Test package.\n---\n'
    },
    {
      path: 'scripts/model-data.bin',
      encoding: 'base64',
      content: script.toString('base64'),
      size: script.length
    }
  ]))

  assert.equal(MAX_SKILL_PACKAGE_DOWNLOAD_BYTES, 48 * 1024 * 1024)
  assert.equal(normalized.schemaVersion, 2)
  assert.equal(normalized.files.length, 2)
  assert.equal(normalized.files[1].size, script.length)
})

test('Skill package file validation rejects oversized, unsafe, duplicate, and excessive entries', () => {
  const oversized = Buffer.alloc(MAX_SKILL_PACKAGE_FILE_BYTES + 1)
  assert.throws(
    () => normalizeSkillPackage(createPackage([
      { path: 'SKILL.md', content: 'ok' },
      { path: 'scripts/large.bin', encoding: 'base64', content: oversized.toString('base64') }
    ])),
    /单文件.*8MiB/
  )

  assert.throws(
    () => normalizeSkillPackage(createPackage([
      { path: 'SKILL.md', content: 'ok' },
      { path: '../outside.js', content: 'bad' }
    ])),
    /不能包含空目录、\. 或 \.\./
  )
  assert.throws(
    () => normalizeSkillPackage(createPackage([
      { path: 'SKILL.md', content: 'ok' },
      { path: 'scripts/.env', content: 'TOKEN=secret' }
    ])),
    /敏感环境文件/
  )
  assert.throws(
    () => normalizeSkillPackage(createPackage([
      { path: 'SKILL.md', content: 'ok' },
      { path: 'skill.md', content: 'duplicate on Windows' }
    ])),
    /重复文件路径/
  )
  assert.throws(
    () => normalizeSkillPackage(createPackage([
      { path: 'skill.md', content: 'wrong case' }
    ])),
    /必须提供 SKILL\.md/
  )

  const tooManyFiles = Array.from({ length: MAX_SKILL_PACKAGE_FILE_COUNT + 1 }, (_, index) => ({
    path: index === 0 ? 'SKILL.md' : `references/${index}.txt`,
    content: ''
  }))
  assert.throws(
    () => normalizeSkillPackage(createPackage(tooManyFiles)),
    new RegExp(`文件数不能超过 ${MAX_SKILL_PACKAGE_FILE_COUNT}`)
  )
})

test('Skill package parser remains compatible with schema v1 inline packages', () => {
  const normalized = normalizeSkillPackage({
    kind: 'ai-tools-skill-package',
    schemaVersion: 1,
    skill: {
      _id: 'skill_legacy',
      name: 'Legacy',
      content: '# Legacy'
    }
  })

  assert.equal(normalized.schemaVersion, 1)
  assert.deepEqual(normalized.files, [])
  assert.throws(
    () => normalizeSkillPackage(createPackage([], { schemaVersion: 99 })),
    /不支持的 Skill 包 schemaVersion/
  )
})
