import {
  formatAgentRunTraceEntry,
  inferStructuredToolResultStatus,
  inferToolDisplayContentStatus,
  isAgentRunToolResult
} from '@/utils/chatToolDisplay'
import { getAgentRunMessageStatus, isAgentRunToolName } from '@/utils/chatAgentRun'

export function useChatToolExecutionMessageFactory({
  createDisplayMessage,
  isToolMessage,
  normalizeToolMessageStatus,
  getToolMessageStatus,
  toolMessageStatusText,
  toolMessageStatusDetailText,
  isLiveToolMessageStatus
}) {
  function extractServerNameFromToolMeta(toolMeta = '') {
    const raw = String(toolMeta || '').trim()
    if (!raw) return ''
    const idx = raw.indexOf(' / ')
    return idx >= 0 ? raw.slice(0, idx).trim() : raw
  }

  function extractToolNameFromToolMeta(toolMeta = '') {
    const raw = String(toolMeta || '').trim()
    if (!raw) return ''
    const idx = raw.indexOf(' / ')
    return idx >= 0 ? raw.slice(idx + 3).trim() : ''
  }

  function extractFirstJsonFenceText(content = '') {
    const match = String(content || '').match(/```(?:json)?\s*([\s\S]*?)```/i)
    return match ? String(match[1] || '').trim() : ''
  }

  function inferToolResultStatus(messageLike) {
    const explicit = normalizeToolMessageStatus(messageLike?.toolStatus)
    if (isAgentRunToolResult(messageLike?.toolResultPayload)) {
      const payloadStatus = normalizeToolMessageStatus(getAgentRunMessageStatus(messageLike))
      if (payloadStatus && payloadStatus !== 'running') return payloadStatus
      if (explicit && explicit !== 'running') return explicit
      if (payloadStatus === 'running') return 'running'
    }
    const structuredStatus = normalizeToolMessageStatus(
      inferStructuredToolResultStatus(messageLike?.toolResultPayload)
    )
    if (structuredStatus) return structuredStatus
    if (explicit) return explicit
    const role = String(messageLike?.role || '').trim()
    if (role === 'tool_call') return 'running'
    const contentStatus = normalizeToolMessageStatus(
      inferToolDisplayContentStatus(messageLike?.content)
    )
    if (contentStatus) return contentStatus
    return 'success'
  }

  function buildToolExecutionMessageContent(options = {}) {
    const serverName = String(options.serverName || '').trim() || '未知'
    const toolName = String(options.toolName || '').trim() || ''
    const argsText = String(options.argsText || '').trim() || '{}'
    const resultContent = String(options.resultContent || '').trim()
    const errorText = String(options.errorText || '').trim()
    const status = options.status || 'running'
    const statusText = toolMessageStatusText(status)
    const statusDetailText = toolMessageStatusDetailText(status)
    const autoApproved = options.autoApproved
    const traceItems = Array.isArray(options.traceItems) ? options.traceItems : []
    const lines = [
      '### 工具调用',
      `- 服务：**${serverName}**`,
      `- 工具：\`${toolName}\``,
      `- 状态：**${statusText}**`
    ]

    if (typeof autoApproved === 'boolean') {
      lines.push(`- 自动批准：**${autoApproved ? '是' : '否'}**`)
    }

    lines.push('', '#### 参数', '', '```json', argsText, '```')

    if (statusDetailText) lines.push('', `> ${statusDetailText}`)
    if (traceItems.length && isLiveToolMessageStatus(status)) {
      lines.push('', '#### 实时轨迹', '')
      traceItems.slice(-40).forEach((item) => {
        lines.push(formatAgentRunTraceEntry(item))
      })
    }
    if (resultContent) lines.push('', resultContent)
    else if (errorText && status !== 'running') lines.push('', '#### 错误', '', errorText)

    return lines.join('\n').trim()
  }

  function createPendingToolExecutionMessage({
    serverName = '',
    toolName = '',
    toolTitle = '',
    toolDescription = '',
    argsText = '{}',
    autoApproved = false,
    traceStreamId = '',
    argsObj = null,
    toolCallId = '',
    toolExecutionId = '',
    toolSessionId = ''
  } = {}) {
    const targetAgentLabel = isAgentRunToolName(toolName)
      ? String(argsObj?.agent_name || argsObj?.agent_id || argsObj?.name || argsObj?.id || '').trim()
      : ''
    const expandByDefault = isAgentRunToolName(toolName)
    const normalizedToolExecutionId = String(toolExecutionId || '').trim()
    const normalizedTraceStreamId = String(traceStreamId || '').trim() || (
      expandByDefault ? normalizedToolExecutionId : ''
    )
    return createDisplayMessage(
      'tool_call',
      buildToolExecutionMessageContent({
        serverName,
        toolName,
        argsText,
        autoApproved,
        status: 'running'
      }),
      {
        toolMeta: `${serverName || '未知'} / ${toolName || ''}`.trim(),
        toolExpanded: expandByDefault,
        toolStatus: 'running',
        toolServerName: String(serverName || '').trim(),
        toolName: String(toolName || '').trim(),
        toolTitle: String(toolTitle || '').trim(),
        toolDescription: String(toolDescription || '').trim(),
        toolArgsText: String(argsText || '').trim() || '{}',
        toolAutoApproved: !!autoApproved,
        toolCallId: String(toolCallId || '').trim(),
        toolExecutionId: normalizedToolExecutionId,
        toolSessionId: String(toolSessionId || '').trim(),
        toolSubMeta: targetAgentLabel ? `智能体：${targetAgentLabel}` : '',
        toolTraceStreamId: normalizedTraceStreamId,
        toolLiveTrace: [],
        toolAbortState: null
      }
    )
  }

  function createToolExecutionResultMessage(
    content = '',
    extra = {},
    toolCallId = '',
    toolExecutionId = ''
  ) {
    const normalizedExtra = extra && typeof extra === 'object' ? { ...extra } : {}
    if (!String(normalizedExtra.toolCallId || '').trim() && toolCallId) {
      normalizedExtra.toolCallId = String(toolCallId || '').trim()
    }
    if (!String(normalizedExtra.toolExecutionId || '').trim() && toolExecutionId) {
      normalizedExtra.toolExecutionId = String(toolExecutionId || '').trim()
    }
    return createDisplayMessage('tool', content, normalizedExtra)
  }

  function buildToolExecutionResultSubMeta(result) {
    const resultKind = String(result?.kind || '').trim()
    if (resultKind.startsWith('sandbox_')) {
      if (result?.workspaceKind === 'multiple') {
        const kinds = new Set(
          (Array.isArray(result?.workspaces) ? result.workspaces : [])
            .map((workspace) => String(workspace?.workspaceKind || '').trim())
            .filter(Boolean)
        )
        if (kinds.has('sandbox') && kinds.has('host')) return '会话沙盒 + 本机工作区'
        if (kinds.has('host')) return '本机工作区（无系统沙盒）'
      }
      const isolationLabel = result?.sandboxEnforced === true
        ? '系统沙盒'
        : result?.isolationLevel === 'host-workspace'
          ? '本机工作区（无系统沙盒）'
          : '隔离工作区（路径守卫）'
      if (result?.workspaceKind === 'host') {
        const workspacePath = String(result?.workspacePath || '').trim()
        const relativeCwd = String(result?.cwd || '.').trim()
        return [
          workspacePath ? `${isolationLabel}：${workspacePath}` : isolationLabel,
          relativeCwd && relativeCwd !== '.' ? `cwd：${relativeCwd}` : ''
        ].filter(Boolean).join(' · ')
      }
      return `${isolationLabel}：${String(result?.workspaceId || 'default').trim() || 'default'}`
    }
    if (!isAgentRunToolResult(result)) return ''
    const agentName = String(result?.agent?.name || result?.agent?.id || '').trim()
    const traceCount = Array.isArray(result?.trace) ? result.trace.length : 0
    const rounds = Number(result?.metrics?.rounds)
    return [
      agentName ? `智能体：${agentName}` : '',
      traceCount > 0 ? `轨迹步骤：${traceCount}` : '',
      Number.isFinite(rounds) && rounds > 0 ? `轮次：${rounds}` : ''
    ].filter(Boolean).join(' · ')
  }

  function canCoalesceToolResultIntoPending(pending, result) {
    if (!pending || !result) return false
    if (!isToolMessage(pending) || String(result.role || '').trim() !== 'tool') return false
    const pendingRole = String(pending.role || '').trim()
    const pendingStatus = getToolMessageStatus(pending)
    if (!isLiveToolMessageStatus(pendingStatus) && pendingRole !== 'tool_call') return false

    const pendingExecutionId = String(pending.toolExecutionId || '').trim()
    const resultExecutionId = String(result.toolExecutionId || '').trim()
    if (pendingExecutionId || resultExecutionId) {
      return !!pendingExecutionId && pendingExecutionId === resultExecutionId
    }

    const pendingTraceStreamId = String(pending.toolTraceStreamId || '').trim()
    const resultTraceStreamId = String(result.toolTraceStreamId || '').trim()
    if (pendingTraceStreamId || resultTraceStreamId) {
      return !!pendingTraceStreamId && pendingTraceStreamId === resultTraceStreamId
    }

    const pendingCallId = String(pending.toolCallId || '').trim()
    const resultCallId = String(result.toolCallId || '').trim()
    if (pendingCallId || resultCallId) {
      return pendingCallId && resultCallId && pendingCallId === resultCallId
    }

    return false
  }

  return {
    extractServerNameFromToolMeta,
    extractToolNameFromToolMeta,
    extractFirstJsonFenceText,
    inferToolResultStatus,
    buildToolExecutionMessageContent,
    createPendingToolExecutionMessage,
    createToolExecutionResultMessage,
    buildToolExecutionResultSubMeta,
    canCoalesceToolResultIntoPending
  }
}
