export const DEFAULT_USER_MESSAGE_FOLD_CHAR_THRESHOLD = 1600
export const DEFAULT_USER_MESSAGE_FOLD_LINE_THRESHOLD = 18
export const DEFAULT_USER_MESSAGE_PREVIEW_CHARS = 1200
export const DEFAULT_USER_MESSAGE_PREVIEW_LINES = 12
export const DEFAULT_TOOL_ACTIVITY_GROUP_MIN_SIZE = 2

export function shouldShowChatAnchorRail(anchorCount, options = {}) {
  return options.dense !== true && Math.max(0, Number(anchorCount) || 0) > 1
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n?/g, '\n')
}

export function analyzeUserMessageFolding(content, options = {}) {
  const text = normalizeText(content)
  const lineCount = text ? text.split('\n').length : 0
  const charThreshold = Math.max(
    1,
    Number(options.charThreshold) || DEFAULT_USER_MESSAGE_FOLD_CHAR_THRESHOLD
  )
  const lineThreshold = Math.max(
    1,
    Number(options.lineThreshold) || DEFAULT_USER_MESSAGE_FOLD_LINE_THRESHOLD
  )

  return {
    charCount: text.length,
    lineCount,
    foldable: text.length > charThreshold || lineCount > lineThreshold
  }
}

export function buildUserMessagePreview(content, options = {}) {
  const text = normalizeText(content)
  const maxChars = Math.max(1, Number(options.maxChars) || DEFAULT_USER_MESSAGE_PREVIEW_CHARS)
  const maxLines = Math.max(1, Number(options.maxLines) || DEFAULT_USER_MESSAGE_PREVIEW_LINES)
  const lines = text.split('\n')
  let preview = lines.slice(0, maxLines).join('\n')

  if (preview.length > maxChars) preview = preview.slice(0, maxChars)
  return preview.trimEnd()
}

function isToolRole(message) {
  const role = String(message?.role || '').trim()
  return role === 'tool' || role === 'tool_call'
}

function hasVisibleMedia(message) {
  return (
    (Array.isArray(message?.images) && message.images.length > 0) ||
    (Array.isArray(message?.videos) && message.videos.length > 0)
  )
}

function isGroupableToolActivity(message, resolveStatus) {
  if (!isToolRole(message) || hasVisibleMedia(message)) return false
  if (String(message?.toolName || '').trim() === 'agent_run') return false
  if (message?.streaming || message?.editing || message?.attachmentsExpanded || message?.thinkingExpanded) return false
  const status = String(resolveStatus(message) || '').trim()
  return ['success', 'error', 'rejected', 'stopped'].includes(status)
}

function buildToolActivityGroup(messages, resolveStatus, expandedGroupIds) {
  const first = messages[0]
  const groupId = `tool-activity-group-${String(first?.id || 'unknown')}`
  const counts = {
    success: 0,
    error: 0,
    rejected: 0,
    stopped: 0
  }
  messages.forEach((message) => {
    const status = String(resolveStatus(message) || '').trim()
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1
  })

  return {
    id: groupId,
    role: 'tool_group',
    time: Number(first?.time) || Date.now(),
    render: 'text',
    content: '',
    toolGroupMessages: messages,
    toolGroupCounts: counts,
    toolGroupExpanded: expandedGroupIds instanceof Set && expandedGroupIds.has(groupId)
  }
}

export function buildChatDisplayMessages(messages, options = {}) {
  const list = Array.isArray(messages) ? messages : []
  const resolveStatus =
    typeof options.resolveToolStatus === 'function'
      ? options.resolveToolStatus
      : (message) => message?.toolStatus
  const minGroupSize = Math.max(
    2,
    Number(options.minToolGroupSize) || DEFAULT_TOOL_ACTIVITY_GROUP_MIN_SIZE
  )
  const expandedGroupIds = options.expandedToolGroupIds instanceof Set
    ? options.expandedToolGroupIds
    : new Set()
  const out = []
  let pending = []

  const flush = () => {
    if (!pending.length) return
    if (pending.length >= minGroupSize) {
      out.push(buildToolActivityGroup(pending, resolveStatus, expandedGroupIds))
    } else {
      out.push(...pending)
    }
    pending = []
  }

  list.forEach((message) => {
    if (isGroupableToolActivity(message, resolveStatus)) {
      pending.push(message)
      return
    }
    flush()
    out.push(message)
  })
  flush()
  return out
}
