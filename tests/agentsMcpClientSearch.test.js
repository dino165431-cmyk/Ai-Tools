import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

function loadAgentsClientFactory(overrides = {}) {
  const filePath = path.resolve('public/preload/builtins/agents-mcp-client.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const require = createRequire(import.meta.url)
  const module = { exports: {} }

  const mockGlobalConfig = overrides.globalConfig || {
    getConfig() {
      return {}
    }
  }

  const mockContentIndex = overrides.contentIndex || {
    ensureIndex: async () => {},
    searchIndex: async () => ({
      query: '',
      searchMode: 'keyword',
      semanticUsed: false,
      returned: 0,
      total: 0,
      hasMore: false,
      items: []
    })
  }

  const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === '../utils/global-config') return mockGlobalConfig
      if (specifier === '../utils/content-index') return mockContentIndex
      if (specifier === '../utils/stream-json-events') {
        return {
          consumeJsonEventStream: async () => {}
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
    clearTimeout,
    fetch: async () => {
      throw new Error('fetch should not be called in this test')
    }
  })

  const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`
  const script = new vm.Script(wrapped, { filename: filePath })
  const fn = script.runInContext(context)
  fn(module.exports, context.require, module, filePath, path.dirname(filePath))
  return module.exports
}

test('agents_list surfaces indexed search mode and semantic flags', async () => {
  let ensuredKind = ''
  const createBuiltinAgentsMcpClient = loadAgentsClientFactory({
    globalConfig: {
      getConfig() {
        return {
          agents: {
            agent_release_guard: {
              _id: 'agent_release_guard',
              name: '发布回滚助手',
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
              name: '发布排查'
            }
          },
          skills: {
            skill_release_review: {
              _id: 'skill_release_review',
              name: '发布巡检',
              mcp: ['mcp_git']
            }
          },
          mcpServers: {
            mcp_git: {
              _id: 'mcp_git',
              name: 'Git 工具'
            }
          }
        }
      }
    },
    contentIndex: {
      async ensureIndex(kind) {
        ensuredKind = kind
      },
      async searchIndex() {
        return {
          query: '发布回滚',
          searchMode: 'hybrid',
          semanticUsed: true,
          returned: 1,
          total: 1,
          hasMore: false,
          items: [
            {
              path: 'agent_release_guard',
              agentId: 'agent_release_guard',
              title: '发布回滚助手',
              preview: 'Provider OpenAI Compatible / Prompt 发布排查 / Skills 发布巡检 / MCP Git 工具',
              providerId: 'provider_openai',
              promptId: 'prompt_release_review',
              skillIds: ['skill_release_review'],
              mcpIds: ['mcp_git']
            }
          ]
        }
      }
    }
  })

  const client = createBuiltinAgentsMcpClient({})
  const result = await client.callTool('agents_list', { query: '发布回滚' })

  assert.equal(ensuredKind, 'agent')
  assert.equal(result.kind, 'agents_list')
  assert.equal(result.searchMode, 'hybrid')
  assert.equal(result.semanticUsed, true)
  assert.equal(result.returned, 1)
  assert.equal(result.items[0]?.id, 'agent_release_guard')
  assert.equal(result.items[0]?.name, '发布回滚助手')
  assert.equal(result.items[0]?.provider, 'OpenAI Compatible')
  assert.equal(result.items[0]?.mcp?.length, 1)
  assert.equal(result.items[0]?.mcp?.[0], 'Git 工具')
  assert.equal(result.items[0]?.preview, 'Provider OpenAI Compatible / Prompt 发布排查 / Skills 发布巡检 / MCP Git 工具')
})
