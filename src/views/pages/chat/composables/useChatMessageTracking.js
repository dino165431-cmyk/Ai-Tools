import { computed } from 'vue'

export function buildChatMessageIdSet(messages = []) {
  const ids = new Set()
  ;(Array.isArray(messages) ? messages : []).forEach((message) => {
    const id = String(message?.id || '').trim()
    if (id) ids.add(id)
  })
  return ids
}

export function useChatMessageTracking({ session, memorySessions }) {
  const activeSessionMessageIdSet = computed(() => buildChatMessageIdSet(session?.messages))
  const trackedMessageIdSet = computed(() => {
    const ids = new Set(activeSessionMessageIdSet.value)
    ;(Array.isArray(memorySessions?.value) ? memorySessions.value : []).forEach((record) => {
      ;(Array.isArray(record?.messages) ? record.messages : []).forEach((message) => {
        const id = String(message?.id || '').trim()
        if (id) ids.add(id)
      })
    })
    return ids
  })

  function isDisplayMessageInActiveSession(message) {
    if (!message || typeof message !== 'object') return false
    const id = String(message.id || '').trim()
    return !!id && activeSessionMessageIdSet.value.has(id)
  }

  function isDisplayMessageTracked(message) {
    if (!message || typeof message !== 'object') return false
    const id = String(message.id || '').trim()
    return !!id && trackedMessageIdSet.value.has(id)
  }

  return {
    activeSessionMessageIdSet,
    trackedMessageIdSet,
    isDisplayMessageInActiveSession,
    isDisplayMessageTracked
  }
}
