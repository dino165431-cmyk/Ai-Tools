const DEFAULT_CHAT_HEAVY_RENDER_TUNING = Object.freeze({
  viewportBuffer: 6,
  rootMarginPx: 720,
  maxHydrated: 96
})

export function resolveChatHeavyRenderTuning(messageCount) {
  const count = Number.isFinite(Number(messageCount)) ? Math.max(0, Math.floor(Number(messageCount))) : 0

  if (count >= 480) {
    return {
      viewportBuffer: 3,
      rootMarginPx: 320,
      maxHydrated: 40
    }
  }

  if (count >= 240) {
    return {
      viewportBuffer: 4,
      rootMarginPx: 420,
      maxHydrated: 56
    }
  }

  if (count >= 120) {
    return {
      viewportBuffer: 5,
      rootMarginPx: 560,
      maxHydrated: 72
    }
  }

  return {
    ...DEFAULT_CHAT_HEAVY_RENDER_TUNING
  }
}

export function shouldDeferChatHeavyBlockLayout(message, options = {}) {
  if (!message || typeof message !== 'object') return true
  if (message.streaming || message.editing || message.thinkingExpanded || message.toolExpanded || message.attachmentsExpanded) {
    return false
  }

  const id = String(message.id || '').trim()
  if (!id) return true

  const visibleMessageIds = options.visibleMessageIds instanceof Set ? options.visibleMessageIds : null
  if (!visibleMessageIds) return true
  return !visibleMessageIds.has(id)
}
