export function useChatRunSessionTargeting({
  runRecordByAbortState,
  getFallbackSession,
  isRecordActive,
  scrollToBottom,
  maybeScheduleStreamingScroll,
  getActiveMemorySession,
  getMemorySessionById,
  getMemorySessions
}) {
  function getRunRecord(abortState = null) {
    if (!abortState || typeof abortState !== 'object') return null
    return runRecordByAbortState.get(abortState) || null
  }

  function getRunSessionTarget(abortState = null) {
    return getRunRecord(abortState) || getFallbackSession()
  }

  function isRunRecordActive(abortState = null) {
    const record = getRunRecord(abortState)
    if (!record) return true
    return isRecordActive(record)
  }

  async function maybeScrollToBottomForRun(abortState = null, options = {}) {
    if (isRunRecordActive(abortState)) await scrollToBottom(options)
  }

  function maybeScheduleScrollToBottomForRun(abortState = null) {
    if (isRunRecordActive(abortState)) maybeScheduleStreamingScroll()
  }

  function getMemorySessionForMessage(message) {
    if (!message || typeof message !== 'object') return getActiveMemorySession()
    const id = String(message.id || '').trim()
    return (
      (getMemorySessions() || []).find((record) =>
        (record?.messages || []).some(
          (candidate) => candidate === message || (id && String(candidate?.id || '').trim() === id)
        )
      ) || getActiveMemorySession()
    )
  }

  function getMemorySessionForToolMessage(message) {
    if (!message || typeof message !== 'object') return getActiveMemorySession()
    const toolSessionId = String(message.toolSessionId || '').trim()
    if (toolSessionId) {
      const directHit = getMemorySessionById(toolSessionId)
      if (directHit) return directHit
    }
    return getMemorySessionForMessage(message)
  }

  return {
    getRunRecord,
    getRunSessionTarget,
    isRunRecordActive,
    maybeScrollToBottomForRun,
    maybeScheduleScrollToBottomForRun,
    getMemorySessionForMessage,
    getMemorySessionForToolMessage
  }
}
