import {
  ChatbubbleEllipsesOutline,
  CheckmarkOutline,
  CloseOutline,
  HardwareChipOutline,
  PauseCircleOutline,
  PersonCircleOutline,
  RefreshOutline,
  ShieldOutline,
  SparklesOutline
} from '@vicons/ionicons5'
import { getAgentRunMessageStatus } from '@/utils/chatAgentRun'
import {
  inferStructuredToolResultStatus,
  inferToolDisplayContentStatus,
  isAgentRunToolResult
} from '@/utils/chatToolDisplay'
import {
  getToolActivityLabel,
  getToolActivityMeta,
  getToolActivitySource,
  getToolActivityToolName
} from '@/utils/chatToolActivity'

const TOOL_MESSAGE_STATUS_LABELS = {
  running: '运行中',
  paused: '已暂停',
  stopped: '已停止',
  success: '已完成',
  error: '失败',
  rejected: '已拒绝'
}

export function useChatToolPresentation() {
  function isToolMessage(msgOrRole) {
    const role = typeof msgOrRole === 'string'
      ? msgOrRole
      : String(msgOrRole?.role || '').trim()
    return role === 'tool' || role === 'tool_call'
  }

  function normalizeToolMessageStatus(raw) {
    const status = String(raw || '').trim()
    return Object.prototype.hasOwnProperty.call(TOOL_MESSAGE_STATUS_LABELS, status) ? status : ''
  }

  function isLiveToolMessageStatus(status) {
    return status === 'running' || status === 'paused'
  }

  function toolMessageStatusText(status) {
    const normalized = normalizeToolMessageStatus(status)
    return TOOL_MESSAGE_STATUS_LABELS[normalized] || '已完成'
  }

  function toolMessageStatusDetailText(status) {
    const normalized = normalizeToolMessageStatus(status)
    if (normalized === 'running') return '等待工具结果...'
    if (normalized === 'paused') return '执行已暂停，等待恢复...'
    if (normalized === 'stopped') return '执行已停止，不会继续运行。'
    return ''
  }

  function getToolMessageStatus(msg) {
    if (!isToolMessage(msg)) return ''
    const explicit = normalizeToolMessageStatus(msg?.toolStatus)
    if (isAgentRunToolResult(msg?.toolResultPayload)) {
      const payloadStatus = normalizeToolMessageStatus(getAgentRunMessageStatus(msg))
      if (payloadStatus && payloadStatus !== 'running') return payloadStatus
      if (explicit && explicit !== 'running') return explicit
      if (payloadStatus === 'running') return 'running'
    }
    const structuredStatus = normalizeToolMessageStatus(
      inferStructuredToolResultStatus(msg?.toolResultPayload)
    )
    if (structuredStatus) return structuredStatus
    if (explicit) return explicit
    const contentStatus = normalizeToolMessageStatus(
      inferToolDisplayContentStatus(msg?.content)
    )
    if (contentStatus) return contentStatus
    return String(msg?.role || '').trim() === 'tool_call' ? 'running' : 'success'
  }

  function toolMessageStatusLabel(msg) {
    return toolMessageStatusText(getToolMessageStatus(msg))
  }

  function toolMessageLabel(msg) {
    return getToolActivityLabel(msg, getToolMessageStatus(msg))
  }

  function toolActivityMeta(msg) {
    return getToolActivityMeta(msg)
  }

  function toolActivityToolName(msg) {
    return getToolActivityToolName(msg)
  }

  function toolActivitySource(msg) {
    return getToolActivitySource(msg)
  }

  function shouldShowToolActivityStatus(msg) {
    return ['paused', 'stopped', 'error', 'rejected'].includes(getToolMessageStatus(msg))
  }

  function toolActivityIcon(msg) {
    const status = getToolMessageStatus(msg)
    if (status === 'running') return RefreshOutline
    if (status === 'paused') return PauseCircleOutline
    if (status === 'error' || status === 'rejected' || status === 'stopped') return CloseOutline
    return CheckmarkOutline
  }

  function isToolActivityGroup(msg) {
    return String(msg?.role || '').trim() === 'tool_group' && Array.isArray(msg?.toolGroupMessages)
  }

  function isAssistantActivityMessage(msg) {
    if (String(msg?.role || '').trim() !== 'assistant' || !String(msg?.thinking || '').trim()) return false
    if (String(msg?.content || '').trim()) return false
    return !(
      (Array.isArray(msg?.images) && msg.images.length) ||
      (Array.isArray(msg?.videos) && msg.videos.length)
    )
  }

  function isChatActivityMessage(msg) {
    return isToolMessage(msg) || isToolActivityGroup(msg) || isAssistantActivityMessage(msg)
  }

  function chatItemStateClasses(msg) {
    const status = getToolMessageStatus(msg)
    return {
      'is-streaming': msg?.role === 'assistant' && !!msg?.streaming,
      'is-tool-running': status === 'running',
      'is-tool-paused': status === 'paused',
      'is-tool-stopped': status === 'stopped',
      'is-tool-success': status === 'success',
      'is-tool-error': status === 'error',
      'is-tool-rejected': status === 'rejected',
      'is-agent-run': isToolMessage(msg) && String(msg?.toolName || '').trim() === 'agent_run',
      'is-tool-group': isToolActivityGroup(msg),
      'is-activity': isChatActivityMessage(msg),
      'is-thinking-activity': isAssistantActivityMessage(msg)
    }
  }

  function chatAvatarStateClasses(msg) {
    const status = getToolMessageStatus(msg)
    return {
      'is-streaming': msg?.role === 'assistant' && !!msg?.streaming,
      'is-running': status === 'running',
      'is-paused': status === 'paused',
      'is-stopped': status === 'stopped',
      'is-success': status === 'success',
      'is-error': status === 'error',
      'is-rejected': status === 'rejected'
    }
  }

  function chatAvatarIconClasses(msg) {
    const status = getToolMessageStatus(msg)
    return {
      'is-streaming': msg?.role === 'assistant' && !!msg?.streaming,
      'is-spinning': status === 'running'
    }
  }

  function roleIcon(messageOrRole) {
    const msg = messageOrRole && typeof messageOrRole === 'object' ? messageOrRole : null
    const role = String(msg?.role || messageOrRole || '').trim()
    if (role === 'user') return PersonCircleOutline
    if (role === 'assistant') return SparklesOutline
    if (role === 'thinking') return ChatbubbleEllipsesOutline
    if (role === 'tool_call' || role === 'tool') {
      const status = getToolMessageStatus(msg || { role })
      if (status === 'running') return RefreshOutline
      if (status === 'paused') return PauseCircleOutline
      if (status === 'error') return CloseOutline
      if (status === 'rejected') return ShieldOutline
      return HardwareChipOutline
    }
    return ChatbubbleEllipsesOutline
  }

  function formatTime(ts) {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleString()
    } catch {
      return ''
    }
  }

  function shouldRenderCompactToolMessage(msg) {
    if (!isToolMessage(msg)) return false
    if (msg.toolExpanded || msg.streaming || msg.editing || msg.attachmentsExpanded || msg.thinkingExpanded) return false
    return true
  }

  return {
    isToolMessage,
    normalizeToolMessageStatus,
    isLiveToolMessageStatus,
    toolMessageStatusText,
    toolMessageStatusDetailText,
    getToolMessageStatus,
    toolMessageStatusLabel,
    toolMessageLabel,
    toolActivityMeta,
    toolActivityToolName,
    toolActivitySource,
    shouldShowToolActivityStatus,
    toolActivityIcon,
    isToolActivityGroup,
    isAssistantActivityMessage,
    isChatActivityMessage,
    chatItemStateClasses,
    chatAvatarStateClasses,
    chatAvatarIconClasses,
    roleIcon,
    formatTime,
    shouldRenderCompactToolMessage
  }
}
