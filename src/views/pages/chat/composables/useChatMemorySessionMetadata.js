import { buildAutoSessionTitle, normalizeGeneratedSessionTitle } from './useChatSessionTitles.js'

export function useChatMemorySessionMetadata({
  defaultMemorySessionTitle,
  autoChatSessionDirName,
  getSessionTitleFromPath
}) {
function getMemorySessionRunningCount(record) {
  return Math.max(0, Number(record?.runningTaskCount || 0) || 0)
}

function getMemorySessionChatRunCount(record) {
  return Math.max(0, Number(record?.chatRunCount || 0) || 0)
}

function getMemorySessionPendingApprovalCount(record) {
  return Math.max(0, Array.isArray(record?.pendingApprovalRequests) ? record.pendingApprovalRequests.length : 0)
}

function isMemorySessionRunning(record) {
  return getMemorySessionRunningCount(record) > 0 || getMemorySessionChatRunCount(record) > 0
}

function isMemorySessionChatRunning(record) {
  return getMemorySessionChatRunCount(record) > 0
}

function getMemorySessionAutoPersistKey(record) {
  const id = String(record?.id || '').trim()
  if (id) return `id:${id}`
  const filePath = String(record?.activeSessionFilePath || '').trim()
  if (filePath) return `path:${filePath}`
  return ''
}

function hasResolvedMemorySessionTitle(record) {
  const title = String(record?.title || '').trim()
  return !!title && title !== defaultMemorySessionTitle
}

function isFinalizedMemorySessionTitle(record) {
  return hasResolvedMemorySessionTitle(record) && Number(record?.titleReadyAt || 0) > 0
}

function canGenerateMemorySessionTitle(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  const userMessages = record.messages.filter((msg) => msg?.role === 'user')
  if (userMessages.length !== 1) return false
  return String(record?.titleSource || '').trim() !== 'generated'
}

function canRetryMemorySessionTitle(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  const userMessages = record.messages.filter((msg) => msg?.role === 'user')
  if (userMessages.length !== 1) return false
  if (String(record?.titleSource || '').trim() === 'generated') return false
  if (record?.titlePostReplyRetryDone === true) return false
  return hasPersistableMemorySessionResponse(record)
}

function applyFallbackMemorySessionTitle(record, fallbackTitle, titleReadyAt = Date.now()) {
  if (!record) return 0
  const title = normalizeGeneratedSessionTitle(fallbackTitle, buildAutoSessionTitle(record, autoChatSessionDirName))
  if (!title) return 0
  const readyAt = Number(titleReadyAt || 0) || Date.now()
  record.title = title
  record.activeSessionTitle = title
  record.titleSource = 'fallback'
  record.titleReadyAt = readyAt
  return readyAt
}

function shouldStampHistoryCreatedAtOnGeneratedTitle(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  if (!hasResolvedMemorySessionTitle(record)) return false
  if (String(record?.activeSessionFilePath || '').trim()) return false
  if (isMemorySessionRunning(record)) return false
  const userMessages = record.messages.filter((msg) => msg?.role === 'user')
  return userMessages.length === 1
}

function getPersistedMemorySessionTitle(record, filePath = '') {
  const currentTitle = String(record?.activeSessionTitle || record?.title || '').trim()
  if (hasResolvedMemorySessionTitle(record)) return currentTitle
  return ''
}

function isGeneratedSessionTitle(title) {
  const value = String(title || '').trim()
  if (!value) return false
  return value !== defaultMemorySessionTitle && value.length <= 32
}

function hasPersistableMemorySessionResponse(record) {
  if (!record || !Array.isArray(record.messages) || !record.messages.length) return false
  return record.messages.some((msg) => {
    if (!msg || msg.role !== 'assistant') return false
    if (String(msg.content || '').trim()) return true
    if (Array.isArray(msg.images) && msg.images.length) return true
    if (Array.isArray(msg.videos) && msg.videos.length) return true
    return false
  })
}

function canPersistMemorySessionToHistory(record) {
  return hasResolvedMemorySessionTitle(record) &&
    hasPersistableMemorySessionResponse(record) &&
    !isMemorySessionRunning(record)
}

function resolveMemorySessionTitle(record) {
  const currentTitle = String(record?.title || '').trim()
  if (hasResolvedMemorySessionTitle(record)) return currentTitle

  const pathTitle = getSessionTitleFromPath(record?.activeSessionFilePath || '')
  if (pathTitle) return pathTitle

  return defaultMemorySessionTitle
}

function markMemorySessionTitleReady(record, titleReadyAt = Date.now()) {
  if (!record) return 0
  const title = resolveMemorySessionTitle(record)
  if (!hasResolvedMemorySessionTitle({ title })) return 0
  const readyAt = Number(titleReadyAt || 0) || Date.now()
  record.title = title
  record.titleReadyAt = Number(record.titleReadyAt || 0) || readyAt
  return record.titleReadyAt
}

  return {
    getMemorySessionRunningCount,
    getMemorySessionChatRunCount,
    getMemorySessionPendingApprovalCount,
    isMemorySessionRunning,
    isMemorySessionChatRunning,
    getMemorySessionAutoPersistKey,
    hasResolvedMemorySessionTitle,
    isFinalizedMemorySessionTitle,
    canGenerateMemorySessionTitle,
    canRetryMemorySessionTitle,
    applyFallbackMemorySessionTitle,
    shouldStampHistoryCreatedAtOnGeneratedTitle,
    getPersistedMemorySessionTitle,
    isGeneratedSessionTitle,
    hasPersistableMemorySessionResponse,
    canPersistMemorySessionToHistory,
    resolveMemorySessionTitle,
    markMemorySessionTitleReady
  }
}
