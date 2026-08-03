export function useChatMemorySessionLifecycle({
  autoChatSessionRoot,
  timedTaskSessionRoot,
  memorySessions,
  activeMemorySessionId,
  isMemorySessionRunning,
  clearSessionApprovedTools,
  clearChatRunQueue,
  touchChatRunInputQueue,
  clearTimer = (timer) => window.clearTimeout(timer)
}) {
  function isAutoChatSessionPath(filePath) {
    const path = String(filePath || '').trim().replace(/\\/g, '/')
    return path === autoChatSessionRoot || path.startsWith(`${autoChatSessionRoot}/`)
  }

  function isTimedTaskSessionPath(filePath) {
    const path = String(filePath || '').trim().replace(/\\/g, '/')
    return path === timedTaskSessionRoot || path.startsWith(`${timedTaskSessionRoot}/`)
  }

  function isMemorySessionActive(record) {
    return !!record && String(record.id || '') === String(activeMemorySessionId.value || '')
  }

  function isMemorySessionEmptyDraft(record) {
    if (!record) return false
    if (isMemorySessionRunning(record)) return false
    if (String(record.activeSessionFilePath || '').trim()) return false
    return !(record.messages?.length || record.apiMessages?.length)
  }

  function clearMemoryCandidateFlushTimer(record) {
    if (!record?.memoryCandidateFlushTimer) return
    try {
      clearTimer(record.memoryCandidateFlushTimer)
    } catch {
      // ignore
    }
    record.memoryCandidateFlushTimer = null
  }

  function clearPendingMemoryCandidates(record) {
    if (!record) return false
    const hadCandidates = Array.isArray(record.memoryCandidates) && record.memoryCandidates.length > 0
    const hadTimer = !!record.memoryCandidateFlushTimer
    clearMemoryCandidateFlushTimer(record)
    record.memoryCandidates = []
    record.memoryCandidateUpdatedAt = 0
    return hadCandidates || hadTimer
  }

  function removeMemorySessionById(id) {
    const target = String(id || '').trim()
    if (!target) return false
    clearSessionApprovedTools(target)
    clearChatRunQueue(target)
    touchChatRunInputQueue()
    const existing = memorySessions.value.find((record) => String(record?.id || '') === target)
    clearMemoryCandidateFlushTimer(existing)
    const before = memorySessions.value.length
    memorySessions.value = memorySessions.value.filter((record) => String(record?.id || '') !== target)
    return memorySessions.value.length !== before
  }

  function pruneDormantMemorySessions(options = {}) {
    const keepId = String(options.keepId || activeMemorySessionId.value || '').trim()
    const kept = []
    memorySessions.value.forEach((record) => {
      const id = String(record?.id || '').trim()
      if (!id) {
        clearMemoryCandidateFlushTimer(record)
        return
      }
      if (id === keepId || isMemorySessionRunning(record)) {
        kept.push(record)
        return
      }
      if (isMemorySessionEmptyDraft(record) || (record.autoManaged && isAutoChatSessionPath(record.activeSessionFilePath))) {
        clearMemoryCandidateFlushTimer(record)
        return
      }
      kept.push(record)
    })
    memorySessions.value = kept
  }

  return {
    isAutoChatSessionPath,
    isTimedTaskSessionPath,
    isMemorySessionActive,
    isMemorySessionEmptyDraft,
    clearMemoryCandidateFlushTimer,
    clearPendingMemoryCandidates,
    removeMemorySessionById,
    pruneDormantMemorySessions
  }
}
