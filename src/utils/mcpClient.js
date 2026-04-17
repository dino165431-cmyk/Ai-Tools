/**
 * 前端 MCP 客户端桥接，实际调用 `window.createMCPClient`（由 preload 注入）。
 *
 * 默认行为：每次创建一个新的 MCP client，由调用方负责 close。
 * keepAlive：当 `serverConfig.keepAlive === true` 且存在 `_id` 时，会复用同一个 client，
 * 用于需要“保持会话/长连接”的 MCP 服务器（例如 playwright-mcp-server）。
 */

const pooledClientsByServerId = new Map()

function stableSerialize(value) {
  try {
    const normalize = (input) => {
      if (Array.isArray(input)) return input.map(normalize)
      if (!input || typeof input !== 'object') return input
      return Object.keys(input)
        .sort()
        .reduce((acc, key) => {
          acc[key] = normalize(input[key])
          return acc
        }, {})
    }
    return JSON.stringify(normalize(value))
  } catch {
    return String(value)
  }
}

function getServerConfigFingerprint(serverConfig) {
  return stableSerialize({
    transportType: serverConfig?.transportType,
    command: serverConfig?.command,
    args: Array.isArray(serverConfig?.args) ? serverConfig.args : [],
    env: serverConfig?.env && typeof serverConfig.env === 'object' ? serverConfig.env : {},
    cwd: serverConfig?.cwd,
    url: serverConfig?.url,
    headers: serverConfig?.headers && typeof serverConfig.headers === 'object' ? serverConfig.headers : {},
    method: serverConfig?.method,
    stream: serverConfig?.stream,
    pingOnConnect: serverConfig?.pingOnConnect,
    maxTotalTimeout: serverConfig?.maxTotalTimeout,
    timeout: serverConfig?.timeout
  })
}

export function createMCPClient(serverConfig) {
  return window?.createMCPClient?.(serverConfig)
}

export function normalizeMcpPromptArgs(args) {
  if (args === undefined || args === null) return undefined
  if (args && typeof args === 'object' && !Array.isArray(args) && !Object.keys(args).length) return undefined
  return args
}

export async function getMcpPrompt(client, promptName, args) {
  const name = String(promptName || '').trim()
  if (!name) throw new Error('MCP prompt name is required')

  const normalizedArgs = normalizeMcpPromptArgs(args)
  const params = { name }
  if (normalizedArgs !== undefined) params.arguments = normalizedArgs

  // Prefer the raw request path so renderer fixes work even before Electron reloads preload code.
  if (typeof client?.sendRequest === 'function') {
    try {
      return await client.sendRequest('prompts/get', params)
    } catch (err) {
      const message = String(err?.message || err || '')
      if (normalizedArgs === undefined && /error rendering prompt/i.test(message)) {
        return client.sendRequest('prompts/get', { name, arguments: {} })
      }
      throw err
    }
  }
  if (typeof client?.getPrompt === 'function') {
    return client.getPrompt(name, normalizedArgs)
  }
  throw new Error('MCP 客户端不支持 prompts/get')
}

export function getOrCreateMCPClient(serverConfig) {
  const keepAlive = !!serverConfig?.keepAlive
  const serverId = serverConfig?._id
  const fingerprint = getServerConfigFingerprint(serverConfig)

  if (keepAlive && serverId) {
    const existing = pooledClientsByServerId.get(serverId)
    if (existing?.client && existing.fingerprint === fingerprint) return { client: existing.client, pooled: true }
    if (existing?.client) {
      try {
        existing.client.close?.()
      } catch {
        // ignore
      }
      pooledClientsByServerId.delete(serverId)
    }

    const client = createMCPClient(serverConfig)
    if (client) pooledClientsByServerId.set(serverId, { client, fingerprint })
    return { client, pooled: !!client }
  }

  return { client: createMCPClient(serverConfig), pooled: false }
}

export function releaseMCPClient(serverConfig, client) {
  if (!client) return
  const keepAlive = !!serverConfig?.keepAlive
  const serverId = serverConfig?._id

  if (keepAlive && serverId) return

  try {
    client.close?.()
  } catch {
    // ignore
  }
}

export function closePooledMCPClient(serverId) {
  const id = String(serverId || '')
  if (!id) return

  const entry = pooledClientsByServerId.get(id)
  const client = entry?.client
  if (!client) return

  try {
    client.close?.()
  } catch {
    // ignore
  } finally {
    pooledClientsByServerId.delete(id)
  }
}

export function closeAllPooledMCPClients() {
  for (const [serverId, entry] of pooledClientsByServerId.entries()) {
    try {
      entry?.client?.close?.()
    } catch {
      // ignore
    } finally {
      pooledClientsByServerId.delete(serverId)
    }
  }
}

export function hasPooledMCPClient(serverId) {
  const id = String(serverId || '')
  if (!id) return false
  return pooledClientsByServerId.has(id)
}
