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
    readFile: async () => {
      const err = new Error('ENOENT')
      err.code = 'ENOENT'
      throw err
    },
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

test('content index can keyword-search agents by prompt and skill metadata', async () => {
  const contentIndex = loadContentIndexModule({
    globalConfig: {
      getDataStorageRoot() {
        return path.resolve('.tmp-utools')
      },
      getConfig() {
        return {
          contentSearchConfig: {
            searchMode: 'keyword',
            embedding: { providerId: '', model: '' }
          },
          agents: {
            agent_api_review: {
              _id: 'agent_api_review',
              name: '接口回归助手',
              provider: 'provider_openai',
              model: 'gpt-4.1',
              skills: ['skill_release_review'],
              mcp: [],
              prompt: 'prompt_release_review'
            }
          },
          providers: {
            provider_openai: {
              _id: 'provider_openai',
              name: 'OpenAI Compatible'
            }
          },
          prompts: {
            prompt_release_review: {
              _id: 'prompt_release_review',
              name: '发布回滚排查',
              description: '定位接口回归',
              type: 'system',
              content: '你负责分析接口回归、发布回滚和失败根因。',
              mcp: ['mcp_git']
            }
          },
          skills: {
            skill_release_review: {
              _id: 'skill_release_review',
              name: '发布巡检',
              description: '检查发布后的接口异常与回归问题',
              content: '关注发布失败、回滚和兼容性问题。',
              mcp: ['mcp_git'],
            }
          },
          mcpServers: {
            mcp_git: {
              _id: 'mcp_git',
              name: 'Git 工具',
              transportType: 'stdio'
            }
          }
        }
      }
    }
  })

  assert.equal(
    contentIndex.getIndexRelPath('agent'),
    '.ai-tools-settings/indexes/agents-index-v3.json'
  )

  const result = await contentIndex.searchIndex('agent', {
    query: '发布回滚 接口回归',
    limit: 10
  })

  assert.equal(result.root, 'agent')
  assert.equal(result.searchMode, 'keyword')
  assert.equal(result.semanticUsed, false)
  assert.equal(result.returned, 1)
  assert.equal(result.items[0]?.agentId, 'agent_api_review')
  assert.equal(result.items[0]?.name, '接口回归助手')
  assert.equal(result.items[0]?.mcpIds?.[0], 'mcp_git')
  assert.equal(result.items[0]?.mcpNames?.[0], 'Git 工具')
  assert.match(result.items[0]?.preview || '', /Prompt|Skills|Provider|MCP/)
})

test('content index searches Skill and MCP metadata without persisting secrets', async () => {
  const contentIndex = loadContentIndexModule({
    globalConfig: {
      getDataStorageRoot() {
        return path.resolve('.tmp-utools')
      },
      getConfig() {
        return {
          contentSearchConfig: {
            searchMode: 'keyword',
            embedding: { providerId: '', model: '' }
          },
          skills: {
            skill_adjust: {
              _id: 'skill_adjust',
              name: '移动端 Adjust 分析',
              description: '使用 mitmproxy 抓包分析 Android APK 的 Adjust 动态请求并生成 Java 和 SQL。',
              content: 'never index this secret: SKILL_SECRET_123',
              sourceType: 'directory',
              entryFile: 'SKILL.md',
              triggers: {
                keywords: ['Adjust', '抓包', 'APK']
              },
              cache: {
                scriptCatalog: [{
                  path: 'scripts/capture.py',
                  name: 'capture',
                  description: 'Capture Adjust requests'
                }]
              }
            }
          },
          mcpServers: {
            mcp_mobile: {
              _id: 'mcp_mobile',
              name: 'Mobile Device Tools',
              description: 'Manage authorized Android devices',
              transportType: 'stdio',
              allowTools: ['device_install', 'device_capture'],
              env: { API_TOKEN: 'MCP_SECRET_456' },
              headers: { Authorization: 'Bearer MCP_SECRET_789' }
            }
          }
        }
      }
    }
  })

  assert.equal(
    contentIndex.getIndexRelPath('capability'),
    '.ai-tools-settings/indexes/capabilities-index-v3.json'
  )

  const result = await contentIndex.searchIndex('capability', {
    query: 'mitmproxy Adjust Android APK 动态抓包分析',
    limit: 10
  })

  assert.equal(result.root, 'capability')
  assert.ok(result.returned >= 1)
  const skillResult = result.items.find((item) => item.capabilityType === 'skill')
  assert.equal(skillResult?.skillId, 'skill_adjust')
  const serialized = JSON.stringify(result.items)
  assert.doesNotMatch(serialized, /SKILL_SECRET_123|MCP_SECRET_456|MCP_SECRET_789/)
})
