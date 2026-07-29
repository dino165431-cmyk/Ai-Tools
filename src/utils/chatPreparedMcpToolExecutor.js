import { getOrCreateMCPClient, releaseMCPClient } from './mcpClient.js'
import {
  formatToolResultDisplayContent,
  inferStructuredToolResultStatus,
  isAgentRunToolResult
} from './chatToolDisplay.js'
import { createAbortError, isAbortError, throwIfAborted, waitForAbortable, withTimeout } from './abortableRequest.js'
import { stableStringify } from './chatProviderStreaming.js'
import { stringifyToolResultForModel as stringifyToolResultForLlm } from './toolResultForModel.js'
import { truncateInlineText } from './chatAttachmentUtils.js'

function tokenizeDiscoveryText(value) {
  const raw = String(value || '').trim().toLowerCase()
  const tokens = new Set(raw.match(/[a-z0-9][a-z0-9_+.-]{1,}/g) || [])
  const cjkGroups = raw.match(/[\u3400-\u9fff]{2,}/g) || []
  cjkGroups.forEach((group) => {
    if (group.length <= 8) tokens.add(group)
    for (let size = 2; size <= Math.min(4, group.length); size += 1) {
      for (let index = 0; index <= group.length - size; index += 1) {
        tokens.add(group.slice(index, index + size))
      }
    }
  })
  return Array.from(tokens)
}

function scoreDiscoveryText(query, haystack) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const normalizedHaystack = String(haystack || '').trim().toLowerCase()
  if (!normalizedQuery) return 1
  if (!normalizedHaystack) return 0
  if (normalizedHaystack.includes(normalizedQuery)) return 100
  const haystackTokens = new Set(tokenizeDiscoveryText(normalizedHaystack))
  return tokenizeDiscoveryText(normalizedQuery)
    .filter((token) => haystackTokens.has(token))
    .reduce(
      (score, token) => score + (/[\u3400-\u9fff]/.test(token) && token.length >= 3 ? 2 : 1),
      0
    )
}

export function createPreparedMcpToolExecutor(runtime) {
  const {
    activeMcpServers,
    buildMcpToolCatalogEntry,
    buildToolExecutionResultSubMeta,
    closeMcpClientSafely,
    deepCopyJson,
    extractChatImagesFromToolResult,
    filterAllowedMcpTools,
    listActiveMcpServersBrief,
    listMcpToolsForServer,
    maybeScrollToBottomForRun,
    registerAbortableMcpClient,
    resolveActiveMcpServer,
    setMcpToolCatalogEntry,
    upsertPinnedMcpToolHint
  } = runtime

  const pushResult = (targetSession, createMessage, content, extra = {}) => {
    targetSession.messages.push(createMessage(content, { toolStatus: 'success', ...extra }))
  }

  const pushError = async ({
    targetSession,
    createMessage,
    heading,
    errorText,
    toolMeta,
    abortState,
    scroll = true,
    extra = {}
  }) => {
    pushResult(targetSession, createMessage, `${heading}\n- 错误：${errorText}`, {
      toolMeta,
      toolStatus: 'error',
      ...extra
    })
    if (scroll) await maybeScrollToBottomForRun(abortState)
    return { ok: false, content: errorText }
  }

  async function executeMcpToolCall({
    server,
    calledToolName,
    callArgs,
    displayHeading,
    errorHeading,
    serverName,
    toolName,
    pendingToolMessage,
    targetSession,
    createMessage,
    abortState,
    includeImagesInResult = false,
    unavailableMessage = 'MCP 客户端不可用（createMCPClient 未注入）'
  }) {
    let client = null
    let pooled = false
    let unregisterAbort = null
    try {
      ;({ client, pooled } = getOrCreateMCPClient(server))
      if (!client?.callTool) throw new Error(unavailableMessage)

      const callTimeoutMs = Number(server?.timeout) || 60000
      unregisterAbort = registerAbortableMcpClient(abortState, server, client, pooled)
      const result = await waitForAbortable(
        withTimeout(
          client.callTool(calledToolName, callArgs),
          callTimeoutMs,
          `Call tool: ${serverName} / ${toolName}`
        ),
        abortState
      )
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      unregisterAbort = null
      throwIfAborted(abortState)
      releaseMCPClient(server, client)
      client = null

      const images = extractChatImagesFromToolResult(result)
      const resultStatus = inferStructuredToolResultStatus(result) || 'success'
      const resultOk = !['error', 'rejected', 'stopped'].includes(resultStatus)
      const toolResultPayload = isAgentRunToolResult(result) ? deepCopyJson(result, null) : null
      const resultText = stringifyToolResultForLlm(result)
      const imageHint = images.length ? `- 图片：${images.length}（已在上方预览；base64/dataUrl 已省略）\n` : ''
      const displayText = formatToolResultDisplayContent(result, {
        heading: displayHeading,
        serverName,
        toolName,
        imageHint,
        resultText,
        truncateInlineText
      })
      throwIfAborted(abortState)
      pushResult(targetSession, createMessage, displayText, {
        toolMeta: `${serverName} / ${toolName}`,
        images,
        toolExpanded: false,
        toolName,
        toolServerName: serverName,
        toolSubMeta: buildToolExecutionResultSubMeta(result),
        toolResultPayload,
        toolStatus: resultStatus,
        toolTraceStreamId: String(pendingToolMessage?.toolTraceStreamId || '').trim(),
        toolAutoApproved: pendingToolMessage?.toolAutoApproved === true
      })
      await maybeScrollToBottomForRun(abortState)
      return {
        ok: resultOk,
        content: resultText,
        ...(includeImagesInResult ? { images } : {}),
        serverName,
        toolName
      }
    } catch (error) {
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      unregisterAbort = null
      if (isAbortError(error) || abortState?.aborted) throw createAbortError()
      closeMcpClientSafely(server, client, pooled)
      const errorText = error?.message || String(error)
      pushResult(
        targetSession,
        createMessage,
        `${errorHeading}\n- 工具：\`${toolName}\`\n- 错误：${errorText}`,
        {
          toolMeta: `${serverName} / ${toolName}`,
          toolTraceStreamId: String(pendingToolMessage?.toolTraceStreamId || '').trim(),
          toolAutoApproved: pendingToolMessage?.toolAutoApproved === true
        }
      )
      await maybeScrollToBottomForRun(abortState)
      return { ok: false, content: `错误：${errorText}` }
    } finally {
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
    }
  }

  async function discoverMcpTools(prepared, executionContext, abortState) {
    const { serverName, toolName, argsObj } = prepared
    const { targetSession, createCurrentToolResultMessage: createMessage } = executionContext
    const serverIdCandidate = String(argsObj?.server_id ?? argsObj?.serverId ?? argsObj?.id ?? '').trim()
    const serverNameCandidate = String(argsObj?.server_name ?? argsObj?.serverName ?? argsObj?.server ?? '').trim()
    const refresh = argsObj?.refresh === true
    const toolFilter = String(argsObj?.tool || '').trim()
    const searchLower = String(argsObj?.search || '').trim().toLowerCase()
    const withSchema = argsObj?.with_schema === true
    const limitRaw = Number(argsObj?.limit)
    const hasServerSelector = Boolean(serverIdCandidate || serverNameCandidate)
    const defaultLimit = hasServerSelector ? 200 : 30
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), 500)
      : defaultLimit

    const activeServers = (Array.isArray(activeMcpServers.value) ? activeMcpServers.value : [])
      .filter((server) => server?._id && !server.disabled)
    const resolvedServer = hasServerSelector
      ? resolveActiveMcpServer({ idCandidate: serverIdCandidate, nameCandidate: serverNameCandidate })
      : null
    const targetServers = resolvedServer ? [resolvedServer] : activeServers

    if (!targetServers.length) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 发现',
        errorText: `当前没有可用的 MCP 服务。可用：${stableStringify(listActiveMcpServersBrief())}`,
        toolMeta: `${serverName} / ${toolName}`,
        abortState
      })
    }
    if (toolFilter && targetServers.length !== 1) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 发现',
        errorText: '提供 tool 时也必须同时提供 server_id，避免在多个服务之间产生歧义。',
        toolMeta: `${serverName} / ${toolName}`,
        abortState
      })
    }

    const listResults = await Promise.all(
      targetServers.map(async (server) => ({
        server,
        result: await listMcpToolsForServer(server, {
          forceRefresh: refresh,
          silent: true,
          abortState
        })
      }))
    )
    throwIfAborted(abortState)

    if (refresh) {
      listResults.forEach(({ server, result }) => {
        try {
          if (result?.ok) {
            setMcpToolCatalogEntry(String(server?._id || ''), buildMcpToolCatalogEntry(server, result.tools))
          } else {
            const error = result?.error || new Error('listTools failed')
            setMcpToolCatalogEntry(String(server?._id || ''), {
              ok: false,
              server_id: String(server?._id || ''),
              server_name: server?.name || server?._id,
              keepAlive: Boolean(server?.keepAlive),
              error: error?.message || String(error),
              updated_at: Date.now()
            })
          }
        } catch {
          // Cache updates are best effort.
        }
      })
    }

    if (toolFilter) {
      const { server, result } = listResults[0]
      if (!result?.ok) {
        const error = result?.error || new Error('listTools failed')
        return pushError({
          targetSession,
          createMessage,
          heading: `### MCP 发现\n- 服务：**${server.name || server._id}**`,
          errorText: error?.message || String(error),
          toolMeta: `${server.name || server._id} / MCP`,
          abortState
        })
      }

      const allowedTools = filterAllowedMcpTools(server, result.tools)
      const normalizedFilter = toolFilter.toLowerCase()
      const matchedTool =
        allowedTools.find((tool) => String(tool?.name || '') === toolFilter) ||
        allowedTools.find((tool) => String(tool?.name || '').toLowerCase() === normalizedFilter) ||
        allowedTools.find((tool) => String(tool?.name || '').toLowerCase().includes(normalizedFilter)) ||
        null
      if (!matchedTool) {
        return pushError({
          targetSession,
          createMessage,
          heading: '### MCP 发现',
          errorText: `未找到工具：${toolFilter}（服务：${server.name || server._id}）`,
          toolMeta: `${server.name || server._id} / MCP`,
          abortState
        })
      }

      try {
        upsertPinnedMcpToolHint(server._id, matchedTool)
      } catch {
        // Hints are best effort.
      }
      const resultText = stableStringify({
        ok: true,
        server_id: server._id,
        server_name: server.name || server._id,
        tool: {
          name: matchedTool.name,
          description: matchedTool.description || '',
          inputSchema: matchedTool.inputSchema || null
        }
      })
      throwIfAborted(abortState)
      pushResult(
        targetSession,
        createMessage,
        `### MCP 工具详情\n\n\`\`\`json\n${resultText}\n\`\`\``,
        { toolMeta: `${server.name || server._id} / ${matchedTool.name}` }
      )
      await maybeScrollToBottomForRun(abortState)
      return {
        ok: true,
        content: resultText,
        serverName: server.name || server._id,
        toolName: matchedTool.name || toolFilter
      }
    }

    const serversPayload = []
    for (const { server, result } of listResults) {
      throwIfAborted(abortState)
      if (!result?.ok) {
        const error = result?.error || new Error('listTools failed')
        serversPayload.push({
          server_id: server?._id,
          server_name: server?.name || server?._id,
          ok: false,
          error: error?.message || String(error)
        })
        continue
      }
      let allowedTools = filterAllowedMcpTools(server, result.tools)
      if (searchLower) {
        allowedTools = allowedTools
          .map((tool) => ({
            tool,
            score: scoreDiscoveryText(searchLower, [
              server?._id,
              server?.name,
              server?.description,
              tool?.name,
              tool?.description
            ].filter(Boolean).join('\n'))
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((item) => item.tool)
      }
      const tools = allowedTools.slice(0, limit).map((tool) => ({
        name: tool?.name,
        description: tool?.description || '',
        ...(withSchema ? { inputSchema: tool?.inputSchema || null } : {})
      }))
      serversPayload.push({
        server_id: server._id,
        server_name: server.name || server._id,
        ok: true,
        total: allowedTools.length,
        returned: tools.length,
        truncated: allowedTools.length > tools.length,
        tools
      })
    }

    const resultText = stableStringify(
      hasServerSelector ? serversPayload[0] : { ok: true, servers: serversPayload }
    )
    throwIfAborted(abortState)
    pushResult(
      targetSession,
      createMessage,
      `### MCP 发现\n\n\`\`\`json\n${resultText}\n\`\`\``,
      { toolMeta: `${serverName} / ${toolName}` }
    )
    await maybeScrollToBottomForRun(abortState)
    return { ok: true, content: resultText, serverName, toolName }
  }

  async function listMcpTools(prepared, executionContext, abortState) {
    const { serverName, toolName, argsObj } = prepared
    const { targetSession, createCurrentToolResultMessage: createMessage } = executionContext
    const serverIdCandidate = String(argsObj?.server_id ?? argsObj?.serverId ?? argsObj?.id ?? '').trim()
    const serverNameCandidate = String(argsObj?.server_name ?? argsObj?.serverName ?? argsObj?.server ?? '').trim()
    const server = resolveActiveMcpServer({
      idCandidate: serverIdCandidate,
      nameCandidate: serverNameCandidate
    })
    if (!server?._id) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 工具列表',
        errorText: `未找到 MCP 服务器。可用：${stableStringify(listActiveMcpServersBrief())}`,
        toolMeta: `${serverName} / ${toolName}`,
        abortState
      })
    }
    if (server.disabled) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 工具列表',
        errorText: `MCP 服务器已禁用：${server.name || server._id}`,
        toolMeta: `${server.name || server._id} / MCP`,
        abortState
      })
    }

    const refresh = argsObj?.refresh === true
    const toolFilter = String(argsObj?.tool || '').trim()
    const withSchema = argsObj?.with_schema === true
    const limitRaw = Number(argsObj?.limit)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 60
    const listResult = await listMcpToolsForServer(server, {
      forceRefresh: refresh,
      silent: true,
      abortState
    })
    throwIfAborted(abortState)
    if (!listResult.ok) {
      const error = listResult.error || new Error('listTools failed')
      return pushError({
        targetSession,
        createMessage,
        heading: `### MCP 工具列表\n- 服务：**${server.name || server._id}**`,
        errorText: error?.message || String(error),
        toolMeta: `${server.name || server._id} / MCP`,
        abortState
      })
    }

    const allowedTools = filterAllowedMcpTools(server, listResult.tools)
    if (toolFilter) {
      const normalizedFilter = toolFilter.toLowerCase()
      const matchedTool =
        allowedTools.find((tool) => String(tool?.name || '') === toolFilter) ||
        allowedTools.find((tool) => String(tool?.name || '').toLowerCase() === normalizedFilter) ||
        allowedTools.find((tool) => String(tool?.name || '').toLowerCase().includes(normalizedFilter)) ||
        null
      if (!matchedTool) {
        return pushError({
          targetSession,
          createMessage,
          heading: '### MCP 工具列表',
          errorText: `未找到工具：${toolFilter}（服务：${server.name || server._id}）`,
          toolMeta: `${server.name || server._id} / MCP`,
          abortState
        })
      }
      const resultText = stableStringify({
        ok: true,
        server_id: server._id,
        server_name: server.name || server._id,
        tool: {
          name: matchedTool.name,
          description: matchedTool.description || '',
          inputSchema: matchedTool.inputSchema || null
        }
      })
      throwIfAborted(abortState)
      pushResult(
        targetSession,
        createMessage,
        `### MCP 工具详情\n\n\`\`\`json\n${resultText}\n\`\`\``,
        { toolMeta: `${server.name || server._id} / ${matchedTool.name}` }
      )
      await maybeScrollToBottomForRun(abortState)
      return { ok: true, content: resultText }
    }

    const tools = allowedTools.slice(0, limit).map((tool) => ({
      name: tool?.name,
      description: tool?.description || '',
      ...(withSchema ? { inputSchema: tool?.inputSchema || null } : {})
    }))
    const resultText = stableStringify({
      ok: true,
      server_id: server._id,
      server_name: server.name || server._id,
      total: allowedTools.length,
      returned: tools.length,
      tools
    })
    throwIfAborted(abortState)
    pushResult(
      targetSession,
      createMessage,
      `### MCP 工具列表\n\n\`\`\`json\n${resultText}\n\`\`\``,
      { toolMeta: `${server.name || server._id} / MCP` }
    )
    await maybeScrollToBottomForRun(abortState)
    return { ok: true, content: resultText }
  }

  async function callMcpGateway(prepared, executionContext, abortState) {
    const { serverName, toolName, argsObj, pendingToolMessage } = prepared
    const { targetSession, createCurrentToolResultMessage: createMessage } = executionContext
    const serverIdCandidate = String(argsObj?.server_id ?? argsObj?.serverId ?? argsObj?.id ?? '').trim()
    const serverNameCandidate = String(argsObj?.server_name ?? argsObj?.serverName ?? argsObj?.server ?? '').trim()
    const calledToolName = String(argsObj?.tool || '').trim()
    const hasArgs = Object.prototype.hasOwnProperty.call(argsObj, 'args')
    const hasArguments = Object.prototype.hasOwnProperty.call(argsObj, 'arguments')
    const callArgs = hasArgs ? argsObj.args : hasArguments ? argsObj.arguments : {}

    if (!calledToolName) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 工具调用',
        errorText: '缺少 tool 字段。',
        toolMeta: `${serverName} / ${toolName}`,
        abortState
      })
    }
    const server = resolveActiveMcpServer({
      idCandidate: serverIdCandidate,
      nameCandidate: serverNameCandidate
    })
    if (!server?._id) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 工具调用',
        errorText: `未找到 MCP 服务。可用：${stableStringify(listActiveMcpServersBrief())}`,
        toolMeta: `${serverName} / ${toolName}`,
        abortState
      })
    }
    if (server.disabled) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 工具调用',
        errorText: `MCP 服务已禁用：${server.name || server._id}`,
        toolMeta: `${server.name || server._id} / MCP`,
        abortState
      })
    }

    const allowedTools = Array.isArray(server.allowTools)
      ? server.allowTools.map((name) => String(name || '').trim()).filter(Boolean)
      : []
    if (allowedTools.length && !allowedTools.includes(calledToolName)) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### MCP 工具调用',
        errorText: `该工具不在 allowTools 白名单中：${calledToolName}`,
        toolMeta: `${server.name || server._id} / ${calledToolName}`,
        abortState
      })
    }

    return executeMcpToolCall({
      server,
      calledToolName,
      callArgs,
      displayHeading: '### MCP 工具结果',
      errorHeading: '### MCP 工具结果',
      serverName: server.name || server._id,
      toolName: calledToolName,
      pendingToolMessage,
      targetSession,
      createMessage,
      abortState,
      includeImagesInResult: true,
      unavailableMessage: 'MCP 客户端不可用（未注入 createMCPClient）'
    })
  }

  async function callMappedMcpTool(prepared, executionContext, abortState) {
    const { mapping, serverName, toolName, argsObj, pendingToolMessage } = prepared
    const { targetSession, createCurrentToolResultMessage: createMessage } = executionContext
    const server = activeMcpServers.value.find((item) => item._id === mapping.serverId)
    if (!server) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### 工具结果',
        errorText: `未找到 MCP 服务器：${mapping.serverId}`,
        toolMeta: `${serverName} / ${toolName}`,
        abortState,
        scroll: false
      })
    }
    if (server.disabled) {
      return pushError({
        targetSession,
        createMessage,
        heading: '### 工具结果',
        errorText: `MCP 服务器已禁用：${serverName}`,
        toolMeta: `${serverName} / ${toolName}`,
        abortState,
        scroll: false
      })
    }

    return executeMcpToolCall({
      server,
      calledToolName: mapping.toolName,
      callArgs: typeof mapping?.unwrapArgs === 'function' ? mapping.unwrapArgs(argsObj) : argsObj,
      displayHeading: '### 工具结果',
      errorHeading: '### 工具结果',
      serverName,
      toolName,
      pendingToolMessage,
      targetSession,
      createMessage,
      abortState
    })
  }

  return async function executePreparedMcpTool(prepared, executionContext, abortState = null) {
    const internalToolName = prepared?.mapping?.type === 'internal'
      ? prepared.mapping.internal
      : ''

    if (internalToolName === 'mcp_discover') {
      return discoverMcpTools(prepared, executionContext, abortState)
    }
    if (internalToolName === 'mcp_list_servers') {
      const { serverName, toolName } = prepared
      const { targetSession, createCurrentToolResultMessage: createMessage } = executionContext
      const resultText = stableStringify({ ok: true, servers: listActiveMcpServersBrief(100) })
      pushResult(
        targetSession,
        createMessage,
        `### MCP 服务器\n\n\`\`\`json\n${resultText}\n\`\`\``,
        { toolMeta: `${serverName} / ${toolName}` }
      )
      await maybeScrollToBottomForRun(abortState)
      return { ok: true, content: resultText }
    }
    if (internalToolName === 'mcp_list_tools') {
      return listMcpTools(prepared, executionContext, abortState)
    }
    if (internalToolName === 'mcp_call') {
      return callMcpGateway(prepared, executionContext, abortState)
    }
    return callMappedMcpTool(prepared, executionContext, abortState)
  }
}
