const DEFAULT_CHAT_HEAVY_RENDER_TUNING = Object.freeze({
  viewportBuffer: 6,
  rootMarginPx: 720,
  maxHydrated: 96
})

function isWideTextCodePoint(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

function estimateTextVisualUnits(text) {
  let units = 0
  for (const char of String(text || '')) {
    if (char === '\t') {
      units += 4
      continue
    }
    units += isWideTextCodePoint(char.codePointAt(0)) ? 2 : 1
  }
  return units
}

export function estimateChatMarkdownContentHeight(content, options = {}) {
  const text = String(content || '').replace(/\r\n?/g, '\n')
  if (!text) return 0

  const charsPerLine = Math.max(12, Number(options.charsPerLine) || 44)
  const visualLineCapacity = charsPerLine * 2
  const lineHeight = Math.max(14, Number(options.lineHeight) || 18)
  const autoFoldThreshold = Math.max(1, Math.round(Number(options.autoFoldThreshold) || 30))
  const maxHeight = Math.max(0, Number(options.maxHeight) || 30_000)
  const lines = text.split('\n')
  let estimatedLines = 0
  let blockBonus = 0
  let fenceMarker = ''
  let fenceInfo = ''
  let codeLineCount = 0

  const flushCodeFence = () => {
    const forcedOpen = /::open(?:\s|$)/.test(fenceInfo)
    const forcedClosed = /::close(?:\s|$)/.test(fenceInfo)
    const collapsed = forcedClosed || (!forcedOpen && codeLineCount >= autoFoldThreshold)
    // 折叠代码只保留 summary；展开代码按真实行数估算，长行由横向滚动承载。
    estimatedLines += collapsed ? 2 : Math.max(3, codeLineCount + 2)
    blockBonus += collapsed ? 4 : 12
    fenceMarker = ''
    fenceInfo = ''
    codeLineCount = 0
  }

  lines.forEach((rawLine) => {
    const line = String(rawLine || '')
    const trimmed = line.trim()
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/)

    if (fenceMarker) {
      if (fenceMatch && fenceMatch[1][0] === fenceMarker[0] && fenceMatch[1].length >= fenceMarker.length) {
        flushCodeFence()
      } else {
        codeLineCount += 1
      }
      return
    }

    if (fenceMatch) {
      fenceMarker = fenceMatch[1]
      fenceInfo = String(fenceMatch[2] || '').trim()
      return
    }

    if (!trimmed) {
      estimatedLines += 0.55
      return
    }

    const visualUnits = estimateTextVisualUnits(line)
    estimatedLines += Math.max(1, Math.ceil(visualUnits / visualLineCapacity))
    if (/^!\[[^\]]*]\(/.test(trimmed)) estimatedLines += 12
    if (/^(#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/.test(trimmed)) blockBonus += 5
    if (/^\|/.test(trimmed)) estimatedLines += 0.45
  })

  if (fenceMarker) flushCodeFence()

  const height = Math.ceil(estimatedLines * lineHeight) + Math.min(480, blockBonus)
  return Math.min(maxHeight, Math.max(lineHeight, height))
}

export function shouldEnableChatVirtualization(options = {}) {
  const itemCount = Number.isFinite(Number(options.itemCount))
    ? Math.max(0, Math.floor(Number(options.itemCount)))
    : 0
  const countThreshold = Math.max(1, Math.floor(Number(options.countThreshold) || 24))
  if (itemCount >= countThreshold) return true

  const minItemsForHeight = Math.max(2, Math.floor(Number(options.minItemsForHeight) || 8))
  if (itemCount < minItemsForHeight) return false

  const estimatedHeight = Number.isFinite(Number(options.estimatedHeight))
    ? Math.max(0, Number(options.estimatedHeight))
    : 0
  const viewportHeight = Number.isFinite(Number(options.viewportHeight)) && Number(options.viewportHeight) > 0
    ? Number(options.viewportHeight)
    : 800
  const minEstimatedHeight = Math.max(0, Number(options.minEstimatedHeight) || 5600)
  const viewportMultiplier = Math.max(1, Number(options.viewportMultiplier) || 7)
  const heightThreshold = Math.max(minEstimatedHeight, viewportHeight * viewportMultiplier)
  return estimatedHeight >= heightThreshold
}

export function shouldRetainChatVirtualization(options = {}) {
  if (options.active === true) return true

  return shouldEnableChatVirtualization({
    ...options,
    countThreshold: Math.max(1, Math.floor(Number(options.countThreshold) || 12)),
    minItemsForHeight: Math.max(2, Math.floor(Number(options.minItemsForHeight) || 4)),
    minEstimatedHeight: Math.max(0, Number(options.minEstimatedHeight) || 2400),
    viewportMultiplier: Math.max(1, Number(options.viewportMultiplier) || 3)
  })
}

export function resolveChatAdaptiveVirtualRange(range = {}, options = {}) {
  const count = Number.isFinite(Number(range.count))
    ? Math.max(0, Math.floor(Number(range.count)))
    : 0
  if (!count) return []

  const startIndex = Math.min(
    count - 1,
    Math.max(0, Math.floor(Number(range.startIndex) || 0))
  )
  const endIndex = Math.min(
    count - 1,
    Math.max(startIndex, Math.floor(Number(range.endIndex) || startIndex))
  )
  const viewportHeight = Number.isFinite(Number(options.viewportHeight)) && Number(options.viewportHeight) > 0
    ? Number(options.viewportHeight)
    : 800
  const minBufferPx = Math.max(0, Number(options.minBufferPx) || 320)
  const maxBufferPx = Math.max(minBufferPx, Number(options.maxBufferPx) || 720)
  const bufferMultiplier = Math.max(0, Number(options.bufferMultiplier) || 0.75)
  const targetBufferPx = Math.min(maxBufferPx, Math.max(minBufferPx, viewportHeight * bufferMultiplier))
  const maxExtraItems = Math.max(1, Math.floor(Number(options.maxExtraItems) || 12))
  const minExtraItems = Math.min(
    maxExtraItems,
    Math.max(0, Math.floor(Number(options.minExtraItems) || 1))
  )
  const estimateSize = typeof options.estimateSize === 'function'
    ? options.estimateSize
    : () => 180

  const getEstimatedSize = (index) => {
    const size = Number(estimateSize(index))
    return Number.isFinite(size) && size > 0 ? size : 180
  }

  let first = startIndex
  let beforePx = 0
  let beforeCount = 0
  while (
    first > 0 &&
    beforeCount < maxExtraItems &&
    (beforeCount < minExtraItems || beforePx < targetBufferPx)
  ) {
    first -= 1
    beforePx += getEstimatedSize(first)
    beforeCount += 1
  }

  let last = endIndex
  let afterPx = 0
  let afterCount = 0
  while (
    last < count - 1 &&
    afterCount < maxExtraItems &&
    (afterCount < minExtraItems || afterPx < targetBufferPx)
  ) {
    last += 1
    afterPx += getEstimatedSize(last)
    afterCount += 1
  }

  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset)
}

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

  // The outer virtual list already limits how many messages are mounted.
  // Applying content-visibility inside those items introduces a second,
  // estimate-based layout pass that changes the measured item height as it
  // approaches the viewport and makes the scrollbar jump.
  if (options.virtualized === true) return false

  const id = String(message.id || '').trim()
  if (!id) return true

  const visibleMessageIds = options.visibleMessageIds instanceof Set ? options.visibleMessageIds : null
  if (!visibleMessageIds) return true
  return !visibleMessageIds.has(id)
}

export function isExpectedChatProgrammaticScroll(options = {}) {
  const now = Number(options.now)
  const until = Number(options.until)
  if (!Number.isFinite(now) || !Number.isFinite(until) || now > until) return false

  const targetScrollTop = Number(options.targetScrollTop)
  if (!Number.isFinite(targetScrollTop)) return true
  const scrollTop = Number(options.scrollTop)
  const tolerance = Math.max(0, Number(options.tolerance) || 2)
  return Number.isFinite(scrollTop) && Math.abs(scrollTop - targetScrollTop) <= tolerance
}

export function resolveChatBottomScrollTarget(options = {}) {
  const scrollHeight = Number(options.scrollHeight)
  const clientHeight = Number(options.clientHeight)
  const scrollTop = Number(options.scrollTop)
  const tolerance = Math.max(0, Number(options.tolerance) || 1)
  const safeScrollHeight = Number.isFinite(scrollHeight) ? Math.max(0, scrollHeight) : 0
  const safeClientHeight = Number.isFinite(clientHeight) ? Math.max(0, clientHeight) : 0
  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0
  const targetScrollTop = Math.max(0, safeScrollHeight - safeClientHeight)
  const distancePx = targetScrollTop - safeScrollTop

  return {
    targetScrollTop,
    distancePx,
    shouldScroll: Math.abs(distancePx) > tolerance
  }
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
