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

export function resolveChatViewportCompensation(options = {}) {
  const scrollTop = Number(options.scrollTop)
  const deltaPx = Number(options.deltaPx)
  const lastProcessedScrollTop = Number(options.lastProcessedScrollTop)
  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0
  const safeDelta = Number.isFinite(deltaPx) ? deltaPx : 0
  const nextScrollTop = Math.max(0, safeScrollTop + safeDelta)
  const appliedDelta = nextScrollTop - safeScrollTop

  return {
    nextScrollTop,
    appliedDelta,
    nextLastProcessedScrollTop: options.didProcessScroll && Number.isFinite(lastProcessedScrollTop)
      ? Math.max(0, lastProcessedScrollTop + appliedDelta)
      : lastProcessedScrollTop
  }
}

export function resolveChatVirtualItemHeight(options = {}) {
  const minimumHeight = Number(options.minimumHeight)
  const measuredHeight = Number(options.measuredHeight)
  const estimatedHeight = Number(options.estimatedHeight)
  const fallbackHeight = Number(options.fallbackHeight)
  const safeMinimumHeight = Number.isFinite(minimumHeight) ? Math.max(0, minimumHeight) : 0
  const preferredHeight = Number.isFinite(measuredHeight) && measuredHeight > 0
    ? measuredHeight
    : Number.isFinite(estimatedHeight) && estimatedHeight > 0
      ? estimatedHeight
      : Number.isFinite(fallbackHeight) && fallbackHeight > 0
        ? fallbackHeight
        : safeMinimumHeight

  return Math.max(safeMinimumHeight, Math.ceil(preferredHeight))
}

export function resolveChatVirtualItemGap(options = {}) {
  if (!options.hasPrevious) return 0
  const defaultGap = Number(options.defaultGap)
  const consecutiveActivityGap = Number(options.consecutiveActivityGap)
  const safeDefaultGap = Number.isFinite(defaultGap) ? Math.max(0, defaultGap) : 0
  const safeActivityGap = Number.isFinite(consecutiveActivityGap)
    ? Math.max(0, consecutiveActivityGap)
    : safeDefaultGap

  return options.previousIsActivity && options.currentIsActivity
    ? safeActivityGap
    : safeDefaultGap
}
