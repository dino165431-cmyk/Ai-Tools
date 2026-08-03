import { computed, ref, watch } from 'vue'

const COMPACT_CHAT_BREAKPOINT = 980
const DENSE_CHAT_BREAKPOINT = 720

export function useChatResponsiveLayout(sessionSiderCollapsed) {
  const isCompactChatLayout = ref(false)
  const isDenseChatLayout = ref(false)

  function syncChatResponsiveState() {
    if (typeof window === 'undefined') return
    const width = Number(window.innerWidth || 0)
    isCompactChatLayout.value = width > 0 && width <= COMPACT_CHAT_BREAKPOINT
    isDenseChatLayout.value = width > 0 && width <= DENSE_CHAT_BREAKPOINT
  }

  const layoutContentStyle = computed(() => {
    const padding = isCompactChatLayout.value
      ? '8px'
      : isDenseChatLayout.value
        ? '8px 20px 8px 8px'
        : '8px 32px 8px 8px'
    return `padding: ${padding}; height: calc(var(--app-viewport-height) - (var(--app-shell-padding) * 2)); box-sizing: border-box; overflow: hidden;`
  })

  const sessionSiderWidth = computed(() => (isCompactChatLayout.value ? 280 : 320))
  const sessionSiderCollapsedWidth = computed(() => (isCompactChatLayout.value ? 0 : 15))
  const sessionSiderContentStyle = computed(() => (
    isCompactChatLayout.value
      ? 'padding: 16px 12px; height: 100%; box-sizing: border-box; overflow: hidden;'
      : 'padding: 24px; height: 100%; box-sizing: border-box; overflow: hidden;'
  ))

  watch(isCompactChatLayout, (next, previous) => {
    if (next && !previous) sessionSiderCollapsed.value = true
  })

  return {
    isCompactChatLayout,
    isDenseChatLayout,
    layoutContentStyle,
    sessionSiderWidth,
    sessionSiderCollapsedWidth,
    sessionSiderContentStyle,
    syncChatResponsiveState
  }
}
