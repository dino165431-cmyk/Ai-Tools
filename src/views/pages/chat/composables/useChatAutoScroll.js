import { computed, ref } from 'vue'
import { isExpectedChatProgrammaticScroll } from '@/utils/chatPerformance.js'

export const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 12
export const CHAT_SCROLL_AUTO_DISABLE_DISTANCE_PX = 160

export function useChatAutoScroll({
  getScrollContainer,
  defaultProgrammaticDurationMs = 640
} = {}) {
  const autoScrollEnabled = ref(true)
  const autoScrollSuspendedByUser = ref(false)
  const isAtBottom = ref(true)
  const chatScrollEl = ref(null)
  const chatScrollTop = ref(0)
  const chatViewportHeight = ref(0)
  const chatScrollDistanceFromBottom = ref(Number.POSITIVE_INFINITY)
  const isChatScrollable = ref(false)

  let programmaticChatScrollUntil = 0
  let programmaticChatScrollTop = Number.NaN

  const showScrollToBottomButton = computed(() => {
    if (!isChatScrollable.value) return false
    return chatScrollDistanceFromBottom.value > CHAT_SCROLL_AUTO_DISABLE_DISTANCE_PX
  })

  function resolveScrollElement(element) {
    return element || chatScrollEl.value || getScrollContainer?.() || null
  }

  function getDistanceFromBottom(element) {
    const target = resolveScrollElement(element)
    if (!target) return Number.POSITIVE_INFINITY
    return Math.max(0, target.scrollHeight - (target.scrollTop + target.clientHeight))
  }

  function shouldFollowStreamingScroll(options = {}) {
    const allowNearBottom = options.allowNearBottom !== false
    const element = resolveScrollElement()
    if (!element) return false
    if (autoScrollSuspendedByUser.value || !autoScrollEnabled.value) return false
    const distanceFromBottom = getDistanceFromBottom(element)
    const threshold = allowNearBottom
      ? CHAT_SCROLL_AUTO_DISABLE_DISTANCE_PX
      : CHAT_SCROLL_BOTTOM_THRESHOLD_PX
    return distanceFromBottom <= threshold
  }

  function markProgrammaticChatScroll(durationMs = defaultProgrammaticDurationMs, targetScrollTop = Number.NaN) {
    const duration = Math.max(120, Number(durationMs) || 0)
    programmaticChatScrollUntil = Date.now() + duration
    programmaticChatScrollTop = Number.isFinite(Number(targetScrollTop))
      ? Math.max(0, Number(targetScrollTop))
      : Number.NaN
  }

  function isExpectedProgrammaticChatScroll(scrollTop) {
    return isExpectedChatProgrammaticScroll({
      now: Date.now(),
      until: programmaticChatScrollUntil,
      scrollTop,
      targetScrollTop: programmaticChatScrollTop
    })
  }

  function clearProgrammaticChatScrollMark() {
    programmaticChatScrollUntil = 0
    programmaticChatScrollTop = Number.NaN
  }

  function updateAtBottomState(element) {
    const target = resolveScrollElement(element)
    if (!target) {
      chatScrollDistanceFromBottom.value = Number.POSITIVE_INFINITY
      isAtBottom.value = false
      isChatScrollable.value = false
      return { distanceFromBottom: Number.POSITIVE_INFINITY, atBottom: false }
    }

    const distanceFromBottom = getDistanceFromBottom(target)
    chatScrollTop.value = Number(target.scrollTop || 0)
    chatViewportHeight.value = Number(target.clientHeight || 0)
    chatScrollDistanceFromBottom.value = distanceFromBottom
    isChatScrollable.value = target.scrollHeight > target.clientHeight + 2
    isAtBottom.value = distanceFromBottom <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX
    return { distanceFromBottom, atBottom: isAtBottom.value }
  }

  return {
    autoScrollEnabled,
    autoScrollSuspendedByUser,
    isAtBottom,
    chatScrollEl,
    chatScrollTop,
    chatViewportHeight,
    chatScrollDistanceFromBottom,
    isChatScrollable,
    showScrollToBottomButton,
    getDistanceFromBottom,
    shouldFollowStreamingScroll,
    markProgrammaticChatScroll,
    isExpectedProgrammaticChatScroll,
    clearProgrammaticChatScrollMark,
    updateAtBottomState
  }
}
