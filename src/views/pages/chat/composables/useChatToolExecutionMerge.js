import { isAgentRunToolResult } from '@/utils/chatToolDisplay'
import { mergeAgentRunTraceEntries } from '@/utils/chatAgentRun'

export function useChatToolExecutionMerge({
  getSessionMessages,
  isToolMessage,
  inferToolResultStatus,
  extractServerNameFromToolMeta,
  buildToolExecutionMessageContent,
  isLiveToolMessageStatus,
  canCoalesceToolResultIntoPending,
  deleteActiveAgentRunToolMessage,
  scheduleRefreshUserAnchorMeta
}) {
  function mergeToolExecutionDisplayMessage(toolDisplay, resultMessage, options = {}) {
    if (!toolDisplay || !isToolMessage(toolDisplay) || !resultMessage) return resultMessage
    const status = options.status || inferToolResultStatus(resultMessage)
    const serverName = String(
      options.toolServerName ||
      resultMessage.toolServerName ||
      toolDisplay.toolServerName ||
      extractServerNameFromToolMeta(resultMessage.toolMeta) ||
      ''
    ).trim() || '未知'
    const toolName = String(
      options.toolName || resultMessage.toolName || toolDisplay.toolName || ''
    ).trim()
    const autoApproved = typeof toolDisplay.toolAutoApproved === 'boolean'
      ? toolDisplay.toolAutoApproved
      : undefined
    const resultContent = String(resultMessage.content || '').trim()
    const nextPayload =
      options.toolResultPayload ??
      resultMessage.toolResultPayload ??
      toolDisplay.toolResultPayload ??
      null

    toolDisplay.role = 'tool'
    toolDisplay.toolStatus = status
    toolDisplay.toolMeta = String(resultMessage.toolMeta || toolDisplay.toolMeta || '').trim()
    toolDisplay.toolServerName = serverName
    if (toolName) toolDisplay.toolName = toolName
    toolDisplay.toolSubMeta = String(
      options.toolSubMeta ?? resultMessage.toolSubMeta ?? toolDisplay.toolSubMeta ?? ''
    ).trim()
    if (Array.isArray(resultMessage.images)) toolDisplay.images = resultMessage.images
    if (typeof options.toolExpanded === 'boolean') toolDisplay.toolExpanded = options.toolExpanded
    if (isAgentRunToolResult(nextPayload)) {
      const mergedTrace = mergeAgentRunTraceEntries(toolDisplay.toolLiveTrace, nextPayload.trace)
      toolDisplay.toolLiveTrace = mergedTrace
      toolDisplay.toolResultPayload = { ...nextPayload, trace: mergedTrace }
      const payloadAgentName = String(
        nextPayload?.agent?.name || nextPayload?.agent?.id || ''
      ).trim()
      if (payloadAgentName) toolDisplay.toolAgentName = payloadAgentName
      const payloadFinalContent = String(
        nextPayload?.final?.content || nextPayload?.summary || ''
      ).trim()
      const payloadFinalReasoning = String(nextPayload?.final?.reasoning || '').trim()
      if (payloadFinalContent) toolDisplay.toolLiveFinalContent = payloadFinalContent
      else toolDisplay.toolLiveFinalContent = String(toolDisplay.toolLiveFinalContent || '').trim()
      if (payloadFinalReasoning) toolDisplay.toolLiveFinalReasoning = payloadFinalReasoning
      else toolDisplay.toolLiveFinalReasoning = String(toolDisplay.toolLiveFinalReasoning || '').trim()
      toolDisplay.toolLiveRound = Number(nextPayload?.metrics?.rounds) || toolDisplay.toolLiveRound || 0
    } else {
      toolDisplay.toolResultPayload = nextPayload && typeof nextPayload === 'object' ? nextPayload : null
    }
    toolDisplay.content = buildToolExecutionMessageContent({
      serverName,
      toolName: toolDisplay.toolName,
      argsText: toolDisplay.toolArgsText || '{}',
      autoApproved,
      status,
      resultContent,
      traceItems: Array.isArray(toolDisplay.toolLiveTrace) ? toolDisplay.toolLiveTrace : [],
      errorText: options.errorText || ''
    })
    if (!isLiveToolMessageStatus(status) && toolDisplay.toolTraceStreamId) {
      deleteActiveAgentRunToolMessage(toolDisplay.toolTraceStreamId)
    }
    scheduleRefreshUserAnchorMeta()
    return toolDisplay
  }

  function maybeCoalesceLatestToolMessages() {
    const list = getSessionMessages()
    if (!Array.isArray(list) || list.length < 2) return
    const latest = list[list.length - 1]
    if (!latest || String(latest.role || '').trim() !== 'tool') return

    for (let i = list.length - 2; i >= 0; i -= 1) {
      const candidate = list[i]
      if (!isToolMessage(candidate)) break
      if (!canCoalesceToolResultIntoPending(candidate, latest)) continue

      mergeToolExecutionDisplayMessage(candidate, latest)
      list.splice(list.length - 1, 1)
      return
    }
  }

  function coalesceToolExecutionDisplayMessages(messages = []) {
    const out = []
    for (const msg of Array.isArray(messages) ? messages : []) {
      if (String(msg?.role || '').trim() === 'tool') {
        let merged = false
        for (let i = out.length - 1; i >= 0; i -= 1) {
          const candidate = out[i]
          if (!isToolMessage(candidate)) break
          if (!canCoalesceToolResultIntoPending(candidate, msg)) continue

          mergeToolExecutionDisplayMessage(candidate, msg)
          merged = true
          break
        }
        if (merged) continue
      }
      out.push(msg)
    }
    return out
  }

  return {
    mergeToolExecutionDisplayMessage,
    maybeCoalesceLatestToolMessages,
    coalesceToolExecutionDisplayMessages
  }
}
