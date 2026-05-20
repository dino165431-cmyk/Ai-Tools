import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const createMCPClient = require('../public/preload/utils/mcp-client.js')
const { StdioClient } = createMCPClient._test

function makeSilentLogger() {
  return {
    log() {},
    warn() {},
    error() {}
  }
}

function makeInitializeResponse(requestId, sessionId = '') {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        serverInfo: {
          name: 'mock-server',
          version: '1.0.0'
        }
      }
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {})
      }
    }
  )
}

function makeJsonRpcResponse(requestId, result, init = {}) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      result
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {})
      }
    }
  )
}

function makeEventStreamResponse(chunks, init = {}) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      }
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        ...(init.headers || {})
      }
    }
  )
}

function createFakeEventSourceClass(setupInstance) {
  return class FakeEventSource {
    constructor(url, init = {}) {
      this.url = url
      this.init = init
      this.listeners = new Map()
      this.onmessage = null
      this.closed = false

      if (typeof setupInstance === 'function') {
        setupInstance(this)
      }
    }

    addEventListener(name, handler) {
      const list = this.listeners.get(name) || []
      list.push(handler)
      this.listeners.set(name, list)
    }

    close() {
      this.closed = true
    }

    emit(name, payload = {}) {
      const list = this.listeners.get(name) || []
      for (const handler of list) handler(payload)
      if (name === 'message' && typeof this.onmessage === 'function') {
        this.onmessage(payload)
      }
    }
  }
}

function createMockStdioProcess() {
  const proc = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = () => {
    proc.killed = true
  }
  proc.stdin = {
    write(payload) {
      const lines = String(payload || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      for (const line of lines) {
        const message = JSON.parse(line)
        const id = message?.id

        if (message?.method === 'initialize') {
          proc.stdout.emit('data', `${JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: message?.params?.protocolVersion || '2025-06-18',
              capabilities: {},
              serverInfo: {
                name: 'mock-stdio-server',
                version: '1.0.0'
              }
            }
          })}\n`)
          continue
        }

        if (message?.method === 'tools/list') {
          proc.stdout.emit('data', `${JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              tools: [
                {
                  name: 'echo',
                  description: 'Echo input text',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' }
                    },
                    required: ['text']
                  }
                }
              ]
            }
          })}\n`)
          continue
        }

        if (message?.method === 'tools/call') {
          proc.stdout.emit('data', `${JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              echoed: message?.params?.arguments?.text ?? null
            }
          })}\n`)
        }
      }
    }
  }

  return proc
}

function attachMockStdioProcess(client, proc) {
  client.proc = proc
  client.proc.stdout.on('data', (data) => {
    client.buffer += data.toString()
    client._processBuffer()
  })
  client.proc.stderr.on('data', (data) => {
    client.logger.error('[MCP Stdio]', data.toString())
  })
  client.proc.on('error', (err) => {
    client._rejectAll(err)
    client.proc = null
  })
  client.proc.on('exit', (code) => {
    if (code !== 0 && client.pending.size > 0) {
      client._rejectAll(new Error(`Process exited with code ${code}`))
    }
    client.proc = null
  })
}

test('stdio transport initializes and calls tools', async () => {
  const client = new StdioClient({ timeout: 2000, logger: makeSilentLogger() })
  attachMockStdioProcess(client, createMockStdioProcess())

  try {
    const tools = await client.listTools()
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'echo')

    const result = await client.callTool('echo', { text: 'hello stdio' })
    assert.deepEqual(result, { echoed: 'hello stdio' })
  } finally {
    client.close()
  }
})

test('http transport reuses negotiated session and protocol headers', async (t) => {
  const originalFetch = globalThis.fetch
  const calls = []

  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET'
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const request = init.body ? JSON.parse(init.body) : null
    calls.push({ url, method, headers, request })

    if (request?.method === 'initialize') {
      return makeInitializeResponse(request.id, 'http-session')
    }
    if (request?.method === 'notifications/initialized') {
      return new Response('', { status: 202 })
    }
    if (request?.method === 'tools/list') {
      return makeJsonRpcResponse(request.id, { tools: [] })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }

  const client = createMCPClient({
    transportType: 'http',
    url: 'https://example.com/mcp',
    timeout: 2000,
    logger: makeSilentLogger()
  })

  try {
    const tools = await client.listTools()
    assert.deepEqual(tools, [])
  } finally {
    client.close()
  }

  assert.equal(calls.length, 3)
  assert.equal(calls[0].request.method, 'initialize')
  assert.equal(calls[1].request.method, 'notifications/initialized')
  assert.equal(calls[2].request.method, 'tools/list')
  assert.equal(calls[0].headers['mcp-session-id'], undefined)
  assert.equal(calls[1].headers['mcp-session-id'], 'http-session')
  assert.equal(calls[2].headers['mcp-session-id'], 'http-session')
  assert.equal(calls[1].headers['mcp-protocol-version'], '2025-06-18')
  assert.equal(calls[2].headers['mcp-protocol-version'], '2025-06-18')
})

test('getPrompt omits arguments when no prompt arguments are provided', async (t) => {
  const originalFetch = globalThis.fetch
  const calls = []

  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (url, init = {}) => {
    const request = init.body ? JSON.parse(init.body) : null
    calls.push({ url, request })

    if (request?.method === 'initialize') {
      return makeInitializeResponse(request.id, 'prompt-session')
    }
    if (request?.method === 'notifications/initialized') {
      return new Response('', { status: 202 })
    }
    if (request?.method === 'prompts/get') {
      return makeJsonRpcResponse(request.id, {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: request.params?.name || '' }
          }
        ]
      })
    }

    throw new Error(`Unexpected request: ${request?.method}`)
  }

  const client = createMCPClient({
    transportType: 'http',
    url: 'https://example.com/mcp',
    timeout: 2000,
    logger: makeSilentLogger()
  })

  try {
    await client.getPrompt('no_args')
    await client.getPrompt('empty_args', {})
    await client.getPrompt('with_args', { text: 'hello' })
  } finally {
    client.close()
  }

  const promptCalls = calls.filter((call) => call.request?.method === 'prompts/get')
  assert.equal(promptCalls.length, 3)
  assert.deepEqual(promptCalls[0].request.params, { name: 'no_args' })
  assert.deepEqual(promptCalls[1].request.params, { name: 'empty_args' })
  assert.deepEqual(promptCalls[2].request.params, {
    name: 'with_args',
    arguments: { text: 'hello' }
  })
})

test('getMcpPrompt retries no-argument rendering failures with empty arguments object', async () => {
  const { getMcpPrompt } = await import('../src/utils/mcpClient.js')
  const calls = []
  const client = {
    async sendRequest(method, params) {
      calls.push({ method, params })
      if (calls.length === 1) throw new Error('Error rendering prompt log_analysis_system_prompt.')
      return { ok: true }
    }
  }

  const result = await getMcpPrompt(client, 'log_analysis_system_prompt')
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [
    { method: 'prompts/get', params: { name: 'log_analysis_system_prompt' } },
    { method: 'prompts/get', params: { name: 'log_analysis_system_prompt', arguments: {} } }
  ])
})

test('streamableHttp transport reads event-stream responses and closes sessions', async (t) => {
  const originalFetch = globalThis.fetch
  const calls = []

  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET'
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const request = init.body ? JSON.parse(init.body) : null
    calls.push({ url, method, headers, request })

    if (method === 'DELETE') {
      return new Response('', { status: 204 })
    }
    if (request?.method === 'initialize') {
      return makeInitializeResponse(request.id, 'stream-session')
    }
    if (request?.method === 'notifications/initialized') {
      return new Response('', { status: 202 })
    }
    if (request?.method === 'tools/list') {
      return makeEventStreamResponse([
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [{ name: 'stream-tool' }]
          }
        })}\n\n`
      ], {
        headers: { 'mcp-session-id': 'stream-session' }
      })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }

  const client = createMCPClient({
    transportType: 'streamableHttp',
    url: 'https://example.com/stream',
    timeout: 2000,
    logger: makeSilentLogger()
  })

  try {
    const tools = await client.listTools()
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'stream-tool')
  } finally {
    client.close()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const deleteCall = calls.find((call) => call.method === 'DELETE')
  assert.ok(deleteCall)
  assert.equal(deleteCall.headers['mcp-session-id'], 'stream-session')
  assert.equal(deleteCall.headers['mcp-protocol-version'], '2025-06-18')
})

test('sse transport handles endpoint discovery and immediate JSON responses', async (t) => {
  const originalFetch = globalThis.fetch
  const originalEventSource = globalThis.EventSource
  const getCalls = []
  const postCalls = []

  t.after(() => {
    globalThis.fetch = originalFetch
    globalThis.EventSource = originalEventSource
  })

  globalThis.EventSource = createFakeEventSourceClass((instance) => {
    if (typeof instance.init.fetch === 'function') {
      void instance.init.fetch(instance.url, { method: 'GET' })
    }
    queueMicrotask(() => {
      instance.emit('endpoint', { data: '/messages' })
      instance.emit('open', {})
    })
  })

  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET'
    const headers = Object.fromEntries(new Headers(init.headers).entries())

    if (method === 'GET') {
      getCalls.push({ url, headers })
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    const request = JSON.parse(init.body)
    postCalls.push({ url, headers, request })

    if (request.method === 'initialize') {
      return makeInitializeResponse(request.id, 'sse-session')
    }
    if (request.method === 'notifications/initialized') {
      return new Response('', { status: 202 })
    }
    if (request.method === 'tools/list') {
      return makeJsonRpcResponse(request.id, {
        tools: [{ name: 'sse-tool' }]
      })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }

  const client = createMCPClient({
    transportType: 'sse',
    url: 'https://example.com/sse',
    timeout: 2000,
    logger: makeSilentLogger()
  })

  try {
    const tools = await client.listTools()
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'sse-tool')
  } finally {
    client.close()
  }

  assert.equal(getCalls.length, 1)
  assert.equal(getCalls[0].headers.accept, 'text/event-stream')
  assert.equal(postCalls.length, 3)
  assert.equal(postCalls[0].url, 'https://example.com/messages')
  assert.equal(postCalls[0].request.method, 'initialize')
  assert.equal(postCalls[1].request.method, 'notifications/initialized')
  assert.equal(postCalls[2].request.method, 'tools/list')
  assert.equal(postCalls[1].headers['mcp-session-id'], 'sse-session')
  assert.equal(postCalls[2].headers['mcp-session-id'], 'sse-session')
  assert.equal(postCalls[2].headers['mcp-protocol-version'], '2025-06-18')
})

test('sse transport surfaces post errors instead of timing out', async (t) => {
  const originalFetch = globalThis.fetch
  const originalEventSource = globalThis.EventSource

  t.after(() => {
    globalThis.fetch = originalFetch
    globalThis.EventSource = originalEventSource
  })

  globalThis.EventSource = createFakeEventSourceClass((instance) => {
    queueMicrotask(() => {
      instance.emit('endpoint', { data: '/messages' })
      instance.emit('open', {})
    })
  })

  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET'
    if (method === 'GET') {
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    return new Response('broken', {
      status: 500,
      headers: { 'content-type': 'text/plain' }
    })
  }

  const client = createMCPClient({
    transportType: 'sse',
    url: 'https://example.com/sse',
    timeout: 200,
    logger: makeSilentLogger()
  })

  try {
    await assert.rejects(() => client.listTools(), /HTTP error 500: broken/)
  } finally {
    client.close()
  }
})

test('sse transport can fall back to the same URL when pingOnConnect is enabled', async (t) => {
  const originalFetch = globalThis.fetch
  const originalEventSource = globalThis.EventSource
  const postCalls = []

  t.after(() => {
    globalThis.fetch = originalFetch
    globalThis.EventSource = originalEventSource
  })

  globalThis.EventSource = createFakeEventSourceClass((instance) => {
    queueMicrotask(() => {
      instance.emit('open', {})
    })
  })

  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET'
    if (method === 'GET') {
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const request = JSON.parse(init.body)
    postCalls.push({ url, headers, request })

    if (request.method === 'initialize') {
      return makeInitializeResponse(request.id, 'same-url-session')
    }
    if (request.method === 'notifications/initialized') {
      return new Response('', { status: 202 })
    }
    if (request.method === 'tools/list') {
      return makeJsonRpcResponse(request.id, {
        tools: [{ name: 'same-url-tool' }]
      })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }

  const client = createMCPClient({
    transportType: 'sse',
    url: 'https://example.com/sse',
    pingOnConnect: true,
    timeout: 2000,
    logger: makeSilentLogger()
  })

  try {
    const tools = await client.listTools()
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'same-url-tool')
  } finally {
    client.close()
  }

  assert.equal(postCalls.length, 3)
  assert.equal(postCalls[0].url, 'https://example.com/sse')
  assert.equal(postCalls[0].request.method, 'initialize')
  assert.equal(postCalls[1].request.method, 'notifications/initialized')
  assert.equal(postCalls[2].headers['mcp-session-id'], 'same-url-session')
})
